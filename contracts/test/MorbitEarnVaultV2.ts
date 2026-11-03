import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

const { ethers } = await network.create();

const toWei = (value: string) => ethers.parseUnits(value, 18);
const BTC_PRICE = toWei("100000");
const DAY = 24 * 60 * 60;

async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

/** |a - b| <= tolerance */
function near(a: bigint, b: bigint, tolerance: bigint, message?: string) {
  const diff = a > b ? a - b : b - a;
  assert.ok(diff <= tolerance, message ?? `${a} not within ${tolerance} of ${b}`);
}

describe("MorbitEarnVaultV2", () => {
  let owner: any;
  let alice: any;
  let bob: any;
  let keeper: any;
  let musd: any;
  let mezoToken: any;
  let pool: any;
  let feed: any;
  let swapper: any;
  let vault: any;

  beforeEach(async () => {
    [owner, alice, bob, keeper] = await ethers.getSigners();
    musd = await ethers.deployContract("MockERC20", ["Mezo USD", "MUSD", 18, 0n]);
    mezoToken = await ethers.deployContract("MockERC20", ["Mezo", "MEZO", 18, 0n]);
    pool = await ethers.deployContract("MockMusdStabilityPool", [await musd.getAddress()]);
    feed = await ethers.deployContract("MockMusdPriceFeed", [BTC_PRICE]);
    swapper = await ethers.deployContract("MockBtcSwapper", [await musd.getAddress(), BTC_PRICE]);
    vault = await ethers.deployContract("MorbitEarnVaultV2", [
      await musd.getAddress(),
      await mezoToken.getAddress(),
      await pool.getAddress(),
      await feed.getAddress(),
      await swapper.getAddress(),
      owner.address,
    ]);

    for (const user of [alice, bob]) {
      await musd.mint(user.address, toWei("10000"));
      await musd.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
    }
    await mezoToken.mint(owner.address, toWei("1000000"));
    await mezoToken.approve(await vault.getAddress(), ethers.MaxUint256);
  });

  describe("deposits and withdrawals", () => {
    it("deposits into the Stability Pool and redeems back in full", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      assert.equal(await vault.balanceOf(alice.address), toWei("1000"));
      assert.equal(await pool.getCompoundedMUSDDeposit(await vault.getAddress()), toWei("1000"));

      await vault.connect(alice).redeem(toWei("1000"), alice.address, alice.address);
      assert.equal(await musd.balanceOf(alice.address), toWei("10000"));
      assert.equal(await vault.totalSupply(), 0n);
    });

    it("keeps withdrawals open while deposits are paused", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.setDepositsPaused(true);
      await assert.rejects(vault.connect(bob).deposit(toWei("1"), bob.address), /DepositsArePaused/);
      await vault.connect(alice).redeem(toWei("500"), alice.address, alice.address);
      assert.equal(await vault.balanceOf(alice.address), toWei("500"));
    });

    it("rejects BTC from anyone but the Stability Pool", async () => {
      await assert.rejects(
        alice.sendTransaction({ to: await vault.getAddress(), value: 1n }),
        /UnexpectedSender/
      );
    });

    it("makes a donation-based share inflation attack unprofitable", async () => {
      // Attacker deposits 1 wei, then donates MUSD straight into the vault to inflate the share price.
      await vault.connect(bob).deposit(1n, bob.address);
      await musd.connect(bob).transfer(await vault.getAddress(), toWei("1000"));
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      const aliceValue = await vault.convertToAssets(await vault.balanceOf(alice.address));
      // The virtual share means the victim keeps (about) half; the attacker loses the other half.
      assert.ok(aliceValue >= toWei("499"), `victim kept ${ethers.formatEther(aliceValue)}`);
      const bobValue = await vault.convertToAssets(await vault.balanceOf(bob.address));
      assert.ok(bobValue < toWei("1000"), "attacker must lose money");
    });
  });

  describe("harvest (auto-compounding)", () => {
    beforeEach(async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.connect(bob).deposit(toWei("3000"), bob.address);
      // 400 MUSD of debt offset for 0.0044 BTC (440 MUSD at 100k): +40 MUSD of value.
      await pool.simulateLiquidation(toWei("400"), { value: toWei("0.0044") });
    });

    it("swaps BTC gains to MUSD and redeposits them, raising the share price", async () => {
      const priceBefore = await vault.sharePrice();
      await vault.connect(keeper).harvest(0n);

      assert.equal(await vault.totalBtc(), 0n);
      assert.equal(await vault.totalMusd(), toWei("4040"));
      assert.equal(await pool.getCompoundedMUSDDeposit(await vault.getAddress()), toWei("4040"));
      assert.equal(await vault.totalHarvestedBtc(), toWei("0.0044"));
      assert.equal(await vault.totalCompoundedMusd(), toWei("440"));
      assert.equal(priceBefore, await vault.sharePrice(), "harvest at oracle price is value-neutral");
      near(await vault.sharePrice(), toWei("1.01"), 10n);

      // Redeeming now pays only MUSD.
      const [musdOut, btcOut] = await vault.previewRedeem(await vault.balanceOf(alice.address));
      assert.equal(musdOut, toWei("1010"));
      assert.equal(btcOut, 0n);
    });

    it("rejects a swap that returns less than the oracle value minus slippage", async () => {
      await swapper.setOutBps(9_600); // 4% worse than oracle, limit is 3%
      await assert.rejects(vault.harvest(0n), /InsufficientOutput/);
      await swapper.setOutBps(9_800); // 2% worse: allowed
      await vault.harvest(0n);
      assert.equal(await vault.totalCompoundedMusd(), toWei("431.2"));
    });

    it("honors a caller minimum above the oracle floor", async () => {
      await assert.rejects(vault.harvest(toWei("441")), /InsufficientOutput/);
    });

    it("reverts when there is nothing to harvest", async () => {
      await vault.harvest(0n);
      await assert.rejects(vault.harvest(0n), /NothingToHarvest/);
    });

    it("still harvests while the pool blocks withdrawals for undercollateralized troves", async () => {
      await pool.setUndercollateralized(true);
      await vault.harvest(0n);
      assert.equal(await vault.totalBtc(), 0n);
    });

    it("cannot be pointed at a swapper with unsafe slippage", async () => {
      await assert.rejects(vault.setHarvestSettings(1_001, 0n), /SlippageTooHigh/);
      await assert.rejects(vault.connect(alice).setSwapper(alice.address), /OwnableUnauthorizedAccount/);
    });

    it("cannot harvest without a swapper", async () => {
      await vault.setSwapper(ethers.ZeroAddress);
      await assert.rejects(vault.harvest(0n), /NoSwapper/);
    });
  });

  describe("MEZO rewards", () => {
    it("streams MEZO pro rata to share holders", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.connect(bob).deposit(toWei("3000"), bob.address);
      await vault.notifyRewardAmount(toWei("7000"), 7 * DAY);

      await increaseTime(7 * DAY + 10);
      near(await vault.earned(alice.address), toWei("1750"), toWei("0.01"));
      near(await vault.earned(bob.address), toWei("5250"), toWei("0.01"));

      await vault.connect(alice).claimRewards();
      near(await mezoToken.balanceOf(alice.address), toWei("1750"), toWei("0.01"));
      assert.equal(await vault.earned(alice.address), 0n);
    });

    it("only rewards the time a holder actually held shares", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.notifyRewardAmount(toWei("1000"), 10 * DAY);
      await increaseTime(5 * DAY);
      await vault.connect(bob).deposit(toWei("1000"), bob.address);
      await increaseTime(5 * DAY + 10);

      // First half all to Alice (500), second half split 50/50 (250 each).
      near(await vault.earned(alice.address), toWei("750"), toWei("0.1"));
      near(await vault.earned(bob.address), toWei("250"), toWei("0.1"));
    });

    it("settles rewards on share transfers", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.notifyRewardAmount(toWei("1000"), 10 * DAY);
      await increaseTime(5 * DAY);
      await vault.connect(alice).transfer(bob.address, toWei("1000"));
      await increaseTime(5 * DAY + 10);

      near(await vault.earned(alice.address), toWei("500"), toWei("0.1"));
      near(await vault.earned(bob.address), toWei("500"), toWei("0.1"));
    });

    it("keeps accrued rewards claimable after a full withdrawal", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.notifyRewardAmount(toWei("1000"), 10 * DAY);
      await increaseTime(10 * DAY + 10);
      await vault.connect(alice).redeem(toWei("1000"), alice.address, alice.address);
      near(await vault.earned(alice.address), toWei("1000"), toWei("0.1"));
      await vault.connect(alice).claimRewards();
      near(await mezoToken.balanceOf(alice.address), toWei("1000"), toWei("0.1"));
    });

    it("rolls leftover rewards into a new period", async () => {
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.notifyRewardAmount(toWei("1000"), 10 * DAY);
      await increaseTime(5 * DAY);
      await vault.notifyRewardAmount(toWei("500"), 10 * DAY); // 500 left + 500 new over 10 days
      await increaseTime(10 * DAY + 10);
      near(await vault.earned(alice.address), toWei("1500"), toWei("0.1"));
    });

    it("never promises more MEZO than it holds, and only the owner can fund", async () => {
      await assert.rejects(vault.notifyRewardAmount(toWei("1"), 0), /InvalidDuration/);
      await assert.rejects(
        vault.connect(alice).notifyRewardAmount(toWei("1"), DAY),
        /OwnableUnauthorizedAccount/
      );
      await vault.connect(alice).deposit(toWei("1000"), alice.address);
      await vault.notifyRewardAmount(toWei("1000"), 10 * DAY);
      await increaseTime(10 * DAY + 10);
      await vault.connect(alice).claimRewards();
      // Vault holds at most rounding dust now; it must never owe more than its balance.
      const owed = await vault.earned(alice.address);
      assert.ok(owed <= (await mezoToken.balanceOf(await vault.getAddress())));
    });
  });
});
