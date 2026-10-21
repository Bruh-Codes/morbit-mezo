import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

const { ethers } = await network.create();

const toWei = (value: string) => ethers.parseUnits(value, 18);
const BTC_PRICE = toWei("100000");

describe("MorbitEarnVault", () => {
  let owner: any;
  let alice: any;
  let bob: any;
  let musd: any;
  let pool: any;
  let feed: any;
  let vault: any;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    musd = await ethers.deployContract("MockERC20", ["Mezo USD", "MUSD", 18, 0n]);
    pool = await ethers.deployContract("MockMusdStabilityPool", [await musd.getAddress()]);
    feed = await ethers.deployContract("MockMusdPriceFeed", [BTC_PRICE]);
    vault = await ethers.deployContract("MorbitEarnVault", [
      await musd.getAddress(),
      await pool.getAddress(),
      await feed.getAddress(),
      owner.address,
    ]);

    for (const user of [alice, bob]) {
      await musd.mint(user.address, toWei("10000"));
      await musd.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);
    }
  });

  it("deposits MUSD into the Stability Pool and mints shares 1:1 at first", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);

    assert.equal(await vault.balanceOf(alice.address), toWei("1000"));
    assert.equal(await pool.getCompoundedMUSDDeposit(await vault.getAddress()), toWei("1000"));
    assert.equal(await musd.balanceOf(await vault.getAddress()), 0n);
    assert.equal(await vault.totalAssets(), toWei("1000"));
  });

  it("redeems the full position back to MUSD", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    const shares = await vault.balanceOf(alice.address);

    await vault.connect(alice).redeem(shares, alice.address, alice.address);

    assert.equal(await vault.balanceOf(alice.address), 0n);
    assert.equal(await musd.balanceOf(alice.address), toWei("10000"));
    assert.equal(await vault.totalSupply(), 0n);
  });

  it("pays BTC liquidation gains pro-rata on redeem", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    await vault.connect(bob).deposit(toWei("3000"), bob.address);

    // 400 MUSD of debt is offset for 0.0044 BTC (worth 440 MUSD at 100k).
    await pool.simulateLiquidation(toWei("400"), { value: toWei("0.0044") });

    assert.equal(await vault.totalMusd(), toWei("3600"));
    assert.equal(await vault.totalBtc(), toWei("0.0044"));
    assert.equal(await vault.totalAssets(), toWei("4040"));

    const [musdOut, btcOut] = await vault.previewRedeem(await vault.balanceOf(alice.address));
    assert.equal(musdOut, toWei("900"));
    assert.equal(btcOut, toWei("0.0011"));

    const before = await ethers.provider.getBalance(bob.address);
    const tx = await vault.connect(bob).redeem(await vault.balanceOf(bob.address), bob.address, bob.address);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;

    assert.equal(await musd.balanceOf(bob.address), toWei("7000") + toWei("2700"));
    assert.equal((await ethers.provider.getBalance(bob.address)) - before + gas, toWei("0.0033"));
  });

  it("prices new deposits at the current share value", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    await pool.simulateLiquidation(toWei("100"), { value: toWei("0.0012") }); // value 1020

    await vault.connect(bob).deposit(toWei("1020"), bob.address);

    const aliceValue = await vault.convertToAssets(await vault.balanceOf(alice.address));
    const bobValue = await vault.convertToAssets(await vault.balanceOf(bob.address));
    assert.ok(aliceValue >= toWei("1019.99") && aliceValue <= toWei("1020"));
    assert.ok(bobValue >= toWei("1019.99") && bobValue <= toWei("1020"));
  });

  it("enforces the deposit cap and pause but never blocks withdrawals", async () => {
    await vault.setDepositCap(toWei("1500"));
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    await assert.rejects(vault.connect(bob).deposit(toWei("600"), bob.address), /CapExceeded/);

    await vault.setDepositsPaused(true);
    await assert.rejects(vault.connect(bob).deposit(toWei("1"), bob.address), /DepositsArePaused/);
    await vault.connect(alice).redeem(await vault.balanceOf(alice.address), alice.address, alice.address);
    assert.equal(await vault.balanceOf(alice.address), 0n);
  });

  it("only lets the owner change settings", async () => {
    await assert.rejects(vault.connect(alice).setDepositCap(1n), /OwnableUnauthorizedAccount/);
    await assert.rejects(vault.connect(alice).setDepositsPaused(true), /OwnableUnauthorizedAccount/);
  });

  it("requires allowance to redeem someone else's shares", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    await assert.rejects(
      vault.connect(bob).redeem(toWei("1"), bob.address, alice.address),
      /ERC20InsufficientAllowance/,
    );
    await vault.connect(alice).approve(bob.address, toWei("1"));
    await vault.connect(bob).redeem(toWei("1"), bob.address, alice.address);
    assert.equal(await vault.balanceOf(alice.address), toWei("999"));
  });

  it("rejects BTC from anyone but the Stability Pool", async () => {
    await assert.rejects(
      owner.sendTransaction({ to: await vault.getAddress(), value: 1n }),
      /UnexpectedSender/,
    );
  });

  it("surfaces the Stability Pool's undercollateralized-trove guard", async () => {
    await vault.connect(alice).deposit(toWei("1000"), alice.address);
    await pool.setUndercollateralized(true);
    await assert.rejects(
      vault.connect(alice).redeem(toWei("10"), alice.address, alice.address),
    );
    assert.equal(await vault.balanceOf(alice.address), toWei("1000"));
  });
});
