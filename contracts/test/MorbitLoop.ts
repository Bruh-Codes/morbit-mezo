import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

const { ethers } = await network.create();

const toWei = (value: string) => ethers.parseUnits(value, 18);
const BTC_PRICE = toWei("100000");
const NO_HINTS = Array(4).fill(ethers.ZeroAddress);
const Z = ethers.ZeroAddress;

// NotOwner() is 0x30cd7471; Hardhat sometimes reports it undecoded during gas estimation.
const NOT_OWNER = /NotOwner|0x30cd7471/;

describe("MorbitLoop", () => {
  let alice: any;
  let bob: any;
  let musd: any;
  let feed: any;
  let bo: any;
  let swapper: any;
  let factory: any;
  let vault: any;
  let pool: any;

  beforeEach(async () => {
    [, alice, bob] = await ethers.getSigners();
    musd = await ethers.deployContract("MockERC20", ["Mezo USD", "MUSD", 18, 0n]);
    feed = await ethers.deployContract("MockMusdPriceFeed", [BTC_PRICE]);
    bo = await ethers.deployContract("MockBorrowerOperations", [await musd.getAddress(), await feed.getAddress()]);
    swapper = await ethers.deployContract("MockBtcSwapper", [await musd.getAddress(), BTC_PRICE]);
    await alice.sendTransaction({ to: await swapper.getAddress(), value: toWei("10") }); // BTC liquidity
    pool = await ethers.deployContract("MockMusdStabilityPool", [await musd.getAddress()]);
    vault = await ethers.deployContract("MorbitEarnVaultV2", [
      await musd.getAddress(),
      await musd.getAddress(), // reward token is irrelevant here
      await pool.getAddress(),
      await feed.getAddress(),
      await swapper.getAddress(),
      alice.address,
    ]);
    factory = await ethers.deployContract("MorbitLoopFactory", [
      {
        borrowerOperations: await bo.getAddress(),
        troveManager: await bo.getAddress(),
        priceFeed: await feed.getAddress(),
        swapper: await swapper.getAddress(),
        musd: await musd.getAddress(),
        vault: await vault.getAddress(),
      },
    ]);
  });

  async function accountFor(user: any) {
    return ethers.getContractAt("MorbitLoopAccount", await factory.accountOf(user.address));
  }

  it("opens a leveraged loop in one transaction for a first-time user", async () => {
    // 0.05 BTC ($5,000) + borrow 2,000 MUSD → buy 0.02 BTC → 0.07 BTC collateral, 2,200 debt.
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    const account = await accountFor(alice);

    assert.equal(await account.owner(), alice.address);
    assert.equal(await account.collateral(), toWei("0.07"));
    assert.equal(await account.debt(), toWei("2200"));
    assert.equal(await musd.balanceOf(await account.getAddress()), 0n, "all borrowed MUSD was swapped");
    assert.equal(await ethers.provider.getBalance(await account.getAddress()), 0n, "all BTC is collateral");
  });

  it("refuses a swap worse than the oracle by more than 5%", async () => {
    await swapper.setOutBps(9_400);
    await assert.rejects(
      factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") }),
      /InsufficientOutput/
    );
    await swapper.setOutBps(9_600);
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
  });

  it("honors the caller's minimum BTC out", async () => {
    await assert.rejects(
      factory.connect(alice).openLoop(toWei("2000"), toWei("0.021"), NO_HINTS, { value: toWei("0.05") }),
      /InsufficientOutput/
    );
  });

  it("closes the loop in one transaction and returns the remaining BTC", async () => {
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    const account = await accountFor(alice);

    // Sell 0.021 BTC → 2,100 MUSD, repay 2,000 (debt − 200 gas compensation), 100 MUSD left over.
    const btcBefore = await ethers.provider.getBalance(alice.address);
    const tx = await account.connect(alice).closeLoop(toWei("0.021"), 0n, Z, Z);
    const r = await tx.wait();
    const gas = r.gasUsed * r.gasPrice;

    assert.equal(await bo.getTroveStatus(await account.getAddress()), 2n);
    assert.equal((await ethers.provider.getBalance(alice.address)) - btcBefore + gas, toWei("0.049"));
    assert.equal(await musd.balanceOf(alice.address), toWei("100"));
    assert.equal(await ethers.provider.getBalance(await account.getAddress()), 0n);
  });

  it("pulls a MUSD shortfall from the owner only with an allowance", async () => {
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    const account = await accountFor(alice);
    await assert.rejects(account.connect(alice).closeLoop(0n, 0n, Z, Z), /NotEnoughMusdToClose/);

    await musd.mint(alice.address, toWei("2000"));
    await musd.connect(alice).approve(await account.getAddress(), toWei("2000"));
    await account.connect(alice).closeLoop(0n, 0n, Z, Z);
    assert.equal(await musd.balanceOf(alice.address), 0n);
  });

  it("only lets the owner move funds", async () => {
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    const account = await accountFor(alice);
    await assert.rejects(account.connect(bob).closeLoop(toWei("0.021"), 0n, Z, Z), NOT_OWNER);
    await assert.rejects(account.connect(bob).sweep(), NOT_OWNER);
    await assert.rejects(
      account.connect(bob).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") }),
      NOT_OWNER
    );
    // Bob's factory call opens his own account, never Alice's.
    await factory.connect(bob).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    assert.notEqual(await factory.accountOf(bob.address), await account.getAddress());
    assert.equal(await account.collateral(), toWei("0.07"));
  });

  it("adds collateral to an open loop", async () => {
    await factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.05") });
    const account = await accountFor(alice);
    await account.connect(alice).addCollateral(Z, Z, { value: toWei("0.01") });
    assert.equal(await account.collateral(), toWei("0.08"));
  });

  describe("Borrow & Earn", () => {
    it("borrows and deposits into Auto Earn in one transaction, shares to the owner", async () => {
      // 0.05 BTC ($5,000) backs 2,000 MUSD borrowed (2,200 debt): 227%.
      await factory.connect(alice).openEarn(toWei("2000"), Z, Z, { value: toWei("0.05") });
      const account = await accountFor(alice);
      assert.equal(await account.collateral(), toWei("0.05"));
      assert.equal(await account.debt(), toWei("2200"));
      assert.equal(await vault.balanceOf(alice.address), toWei("2000"));
      assert.equal(await vault.totalMusd(), toWei("2000"));
      assert.equal(await musd.balanceOf(await account.getAddress()), 0n);
    });

    it("closes in one transaction: redeems the shares, repays and returns the BTC", async () => {
      await factory.connect(alice).openEarn(toWei("2000"), Z, Z, { value: toWei("0.05") });
      const account = await accountFor(alice);
      await vault.connect(alice).approve(await account.getAddress(), toWei("2000"));

      const btcBefore = await ethers.provider.getBalance(alice.address);
      const r = await (await account.connect(alice).closeEarn(toWei("2000"))).wait();
      const gas = r.gasUsed * r.gasPrice;

      assert.equal(await bo.getTroveStatus(await account.getAddress()), 2n);
      assert.equal(await vault.balanceOf(alice.address), 0n);
      assert.equal((await ethers.provider.getBalance(alice.address)) - btcBefore + gas, toWei("0.05"));
      assert.equal(await musd.balanceOf(alice.address), 0n);
    });

    it("pays out the BTC earned in Auto Earn when closing", async () => {
      await factory.connect(alice).openEarn(toWei("2000"), Z, Z, { value: toWei("0.05") });
      const account = await accountFor(alice);
      // A liquidation uses 100 MUSD of the deposit and pays 0.0011 BTC ($110).
      await pool.simulateLiquidation(toWei("100"), { value: toWei("0.0011") });
      await musd.mint(alice.address, toWei("100"));
      await musd.connect(alice).approve(await account.getAddress(), toWei("100"));
      await vault.connect(alice).approve(await account.getAddress(), toWei("2000"));

      const btcBefore = await ethers.provider.getBalance(alice.address);
      const r = await (await account.connect(alice).closeEarn(toWei("2000"))).wait();
      const gas = r.gasUsed * r.gasPrice;
      // 0.05 collateral back + 0.0011 BTC earned; the 100 MUSD shortfall came from Alice.
      assert.equal((await ethers.provider.getBalance(alice.address)) - btcBefore + gas, toWei("0.0511"));
      assert.equal(await musd.balanceOf(alice.address), 0n);
    });

    it("only lets the owner close", async () => {
      await factory.connect(alice).openEarn(toWei("2000"), Z, Z, { value: toWei("0.05") });
      const account = await accountFor(alice);
      await assert.rejects(account.connect(bob).closeEarn(0n), NOT_OWNER);
    });
  });

  it("is rejected by the trove rules when leverage is too high", async () => {
    // 0.002 BTC ($200) cannot back 2,200 MUSD: the trove would open under 110%, so it reverts.
    await assert.rejects(
      factory.connect(alice).openLoop(toWei("2000"), 0n, NO_HINTS, { value: toWei("0.002") }),
      /ICR < MCR/
    );
  });
});
