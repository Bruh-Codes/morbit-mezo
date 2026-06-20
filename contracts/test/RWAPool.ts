import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

const { ethers } = await network.create();

const BPS = 10_000n;
const HEALTH_FACTOR_DECIMALS = 1_000_000_000_000_000_000n;
const PRICE_ONE_USD = 100_000_000n;
const COLLATERAL_PRICE_AFTER_DROP = 50_000_000n;
const COLLATERAL_PRICE_PARTIAL_LIQUIDATION = 90_000_000n;
const COLLATERAL_LTV_BPS = 7_500n;
const COLLATERAL_LIQ_THRESHOLD_BPS = 8_000n;
const LIQUIDATION_BONUS_BPS = 500n;
const INTEREST_BORROW_RATE_BPS = 1_000n;

const toWei = (value: string) => ethers.parseUnits(value, 18);

function usdValue(amount: bigint, priceUsd: bigint, decimals = 18n) {
  return (amount * priceUsd) / 10n ** decimals;
}

function expectedHealthFactor(
  collateralAmount: bigint,
  collateralPriceUsd: bigint,
  collateralDecimals: bigint,
  liquidationThresholdBps: bigint,
  debtAmount: bigint,
  debtPriceUsd: bigint,
  debtDecimals: bigint,
) {
  const totalCollateralBase = usdValue(collateralAmount, collateralPriceUsd, collateralDecimals);
  const totalDebtBase = usdValue(debtAmount, debtPriceUsd, debtDecimals);

  return (
    totalCollateralBase *
    liquidationThresholdBps *
    HEALTH_FACTOR_DECIMALS
  ) / (totalDebtBase * BPS);
}

function expectedCollateralSeizure(
  debtToCover: bigint,
  debtPriceUsd: bigint,
  debtDecimals: bigint,
  collateralPriceUsd: bigint,
  collateralDecimals: bigint,
  liquidationBonusBps: bigint,
) {
  const debtValueBase = usdValue(debtToCover, debtPriceUsd, debtDecimals);
  return (
    debtValueBase *
    (BPS + liquidationBonusBps) *
    10n ** collateralDecimals
  ) / (collateralPriceUsd * BPS);
}

async function expectRevert(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(reason);
  });
}

describe("RWAPool", async function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    const collateral = await ethers.deployContract("MockERC20", [
      "Collateral Token",
      "COL",
      18,
      toWei("1000000"),
    ]);
    const debt = await ethers.deployContract("MockERC20", [
      "Debt Token",
      "DEBT",
      18,
      toWei("1000000"),
    ]);

    const poolImpl = await ethers.deployContract("RWAPool");
    const initializeData = poolImpl.interface.encodeFunctionData("initialize", []);
    const proxy = await ethers.deployContract("TransparentUpgradeableProxy", [
      poolImpl.target,
      owner.address,
      initializeData,
    ]);
    const pool = await ethers.getContractAt("RWAPool", proxy.target);

    await pool.initReserve(
      collateral.target,
      false,
      true,
      Number(COLLATERAL_LTV_BPS),
      Number(COLLATERAL_LIQ_THRESHOLD_BPS),
      Number(LIQUIDATION_BONUS_BPS),
      0,
      0,
      PRICE_ONE_USD,
    );

    await pool.initReserve(
      debt.target,
      true,
      false,
      0,
      0,
      0,
      0,
      0,
      PRICE_ONE_USD,
    );

    const seedLiquidity = toWei("10000");
    await debt.approve(pool.target, seedLiquidity);
    await pool.supply(debt.target, seedLiquidity, owner.address, 0);

    await collateral.transfer(alice.address, toWei("1000"));
    await debt.transfer(alice.address, toWei("1000"));
    await debt.transfer(bob.address, toWei("1000"));

    return {
      owner,
      alice,
      bob,
      collateral,
      debt,
      pool,
    };
  }

  async function deployInterestFixture() {
    const [owner, alice] = await ethers.getSigners();

    const collateral = await ethers.deployContract("MockERC20", [
      "Collateral Token",
      "COL",
      18,
      toWei("1000000"),
    ]);
    const debt = await ethers.deployContract("MockERC20", [
      "Debt Token",
      "DEBT",
      18,
      toWei("1000000"),
    ]);

    const poolImpl = await ethers.deployContract("RWAPool");
    const initializeData = poolImpl.interface.encodeFunctionData("initialize", []);
    const proxy = await ethers.deployContract("TransparentUpgradeableProxy", [
      poolImpl.target,
      owner.address,
      initializeData,
    ]);
    const pool = await ethers.getContractAt("RWAPool", proxy.target);

    await pool.initReserve(
      collateral.target,
      false,
      true,
      Number(COLLATERAL_LTV_BPS),
      Number(COLLATERAL_LIQ_THRESHOLD_BPS),
      Number(LIQUIDATION_BONUS_BPS),
      0,
      0,
      PRICE_ONE_USD,
    );

    await pool.initReserve(
      debt.target,
      true,
      false,
      0,
      0,
      0,
      0,
      Number(INTEREST_BORROW_RATE_BPS),
      PRICE_ONE_USD,
    );

    const seedLiquidity = toWei("10000");
    await debt.approve(pool.target, seedLiquidity);
    await pool.supply(debt.target, seedLiquidity, owner.address, 0);

    await collateral.transfer(alice.address, toWei("1000"));
    await debt.transfer(alice.address, toWei("1000"));

    return { owner, alice, collateral, debt, pool };
  }

  let fixture: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async function () {
    fixture = await deployFixture();
  });

  it("keeps reserve setup owner-only and exposes reserve metadata", async function () {
    const { alice, collateral, debt, pool } = fixture;

    await expectRevert(
      pool.connect(alice).initReserve(
        collateral.target,
        false,
        true,
        Number(COLLATERAL_LTV_BPS),
        Number(COLLATERAL_LIQ_THRESHOLD_BPS),
        Number(LIQUIDATION_BONUS_BPS),
        0,
        0,
        PRICE_ONE_USD,
      ),
      "OwnableUnauthorizedAccount",
    );

    const reserves = await pool.getReservesList();
    assert.deepStrictEqual(Array.from(reserves), [collateral.target, debt.target]);

    const reserveData = await pool.getAllReservesData();
    assert.equal(reserveData.length, 2);
    assert.equal(reserveData[0].symbol, "COL");
    assert.equal(reserveData[0].borrowingEnabled, false);
    assert.equal(reserveData[0].collateralEnabled, true);
    assert.equal(reserveData[0].priceUsd, PRICE_ONE_USD);
    assert.equal(reserveData[1].symbol, "DEBT");
    assert.equal(reserveData[1].borrowingEnabled, true);
  });

  it("rejects duplicate reserve initialization", async function () {
    const { pool, collateral } = fixture;

    await expectRevert(
      pool.initReserve(
        collateral.target,
        false,
        true,
        Number(COLLATERAL_LTV_BPS),
        Number(COLLATERAL_LIQ_THRESHOLD_BPS),
        Number(LIQUIDATION_BONUS_BPS),
        0,
        0,
        PRICE_ONE_USD,
      ),
      "already initialized",
    );
  });

  it("reverts borrowing and repaying unknown assets", async function () {
    const { alice, pool } = fixture;
    const unknownAsset = ethers.ZeroAddress;

    await expectRevert(
      pool.connect(alice).borrow(unknownAsset, toWei("1"), 2, 0, alice.address),
      "unknown asset",
    );

    await expectRevert(
      pool.connect(alice).repay(unknownAsset, toWei("1"), 0, alice.address),
      "unknown asset",
    );
  });

  it("supports supply, borrow, repay, and safe withdrawals", async function () {
    const { alice, collateral, debt, pool } = fixture;

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("75");
    const repayAmount = toWei("25");
    const safeWithdrawAmount = toWei("20");
    const unsafeWithdrawAmount = toWei("31");

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);

    let reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].supplied, collateralAmount);
    assert.equal(reserveData[0].usageAsCollateralEnabled, true);
    assert.equal(reserveData[1].currentDebt, 0n);

    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    let accountData = await pool.getUserAccountData(alice.address);
    assert.equal(accountData.totalCollateralBase, usdValue(collateralAmount, PRICE_ONE_USD));
    assert.equal(accountData.totalDebtBase, usdValue(borrowAmount, PRICE_ONE_USD));
    assert.equal(
      accountData.healthFactor,
      expectedHealthFactor(
        collateralAmount,
        PRICE_ONE_USD,
        18n,
        COLLATERAL_LIQ_THRESHOLD_BPS,
        borrowAmount,
        PRICE_ONE_USD,
        18n,
      ),
    );

    await expectRevert(
      pool.connect(alice).borrow(debt.target, toWei("1"), 2, 0, alice.address),
      "exceeds LTV",
    );

    await debt.connect(alice).approve(pool.target, repayAmount);
    await pool.connect(alice).repay(debt.target, repayAmount, 0, alice.address);

    reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].supplied, collateralAmount);
    assert.equal(reserveData[1].currentDebt, borrowAmount - repayAmount);

    await pool.connect(alice).withdraw(collateral.target, safeWithdrawAmount, alice.address);

    reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].supplied, collateralAmount - safeWithdrawAmount);
    assert.equal(reserveData[1].currentDebt, borrowAmount - repayAmount);

    accountData = await pool.getUserAccountData(alice.address);
    assert.equal(
      accountData.healthFactor,
      expectedHealthFactor(
        collateralAmount - safeWithdrawAmount,
        PRICE_ONE_USD,
        18n,
        COLLATERAL_LIQ_THRESHOLD_BPS,
        borrowAmount - repayAmount,
        PRICE_ONE_USD,
        18n,
      ),
    );

    await expectRevert(
      pool.connect(alice).withdraw(collateral.target, unsafeWithdrawAmount, alice.address),
      "HF too low after withdraw",
    );
  });

  it("blocks disabling collateral while debt is open", async function () {
    const { alice, collateral, debt, pool } = fixture;

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("75");

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);
    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    await expectRevert(
      pool.connect(alice).setUserUseReserveAsCollateral(collateral.target, false),
      "HF too low",
    );

    const reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].usageAsCollateralEnabled, true);
  });

  it("allows disabling and re-enabling collateral after the debt is repaid", async function () {
    const { alice, collateral, debt, pool } = fixture;

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("50");

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);
    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    await expectRevert(
      pool.connect(alice).setUserUseReserveAsCollateral(collateral.target, false),
      "HF too low",
    );

    await debt.connect(alice).approve(pool.target, borrowAmount);
    await pool.connect(alice).repay(debt.target, borrowAmount, 0, alice.address);

    await pool.connect(alice).setUserUseReserveAsCollateral(collateral.target, false);
    let reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].usageAsCollateralEnabled, false);

    await pool.connect(alice).setUserUseReserveAsCollateral(collateral.target, true);
    reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].usageAsCollateralEnabled, true);
  });

  it("accrues interest over time for outstanding debt", async function () {
    const { alice, collateral, debt, pool } = await deployInterestFixture();

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("75");

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);
    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    const accountDataBefore = await pool.getUserAccountData(alice.address);

    await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const accountData = await pool.getUserAccountData(alice.address);
    assert.ok(accountData.totalDebtBase > accountDataBefore.totalDebtBase);
    assert.ok(accountData.healthFactor < accountDataBefore.healthFactor);
  });

  it("restricts rescue to the owner", async function () {
    const { alice, collateral, owner, pool } = fixture;

    const rescueAmount = toWei("1");
    await collateral.connect(owner).transfer(pool.target, rescueAmount);

    await expectRevert(
      pool.connect(alice).rescue(collateral.target, rescueAmount, alice.address),
      "OwnableUnauthorizedAccount",
    );

    const ownerBalanceBefore = await collateral.balanceOf(owner.address);
    await pool.connect(owner).rescue(collateral.target, rescueAmount, owner.address);
    assert.equal(await collateral.balanceOf(owner.address), ownerBalanceBefore + rescueAmount);
  });

  it("liquidates an undercollateralized position after a price drop", async function () {
    const { alice, bob, collateral, debt, pool } = fixture;

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("75");
    const debtToCover = toWei("10");

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);
    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    await pool.setAssetPrice(collateral.target, COLLATERAL_PRICE_AFTER_DROP);

    const accountData = await pool.getUserAccountData(alice.address);
    assert.ok(accountData.healthFactor < HEALTH_FACTOR_DECIMALS);

    await debt.connect(bob).approve(pool.target, debtToCover);

    const bobCollateralBefore = await collateral.balanceOf(bob.address);
    const bobDebtBefore = await debt.balanceOf(bob.address);

    await pool.connect(bob).liquidationCall(
      collateral.target,
      debt.target,
      alice.address,
      debtToCover,
      false,
    );

    const expectedSeized = expectedCollateralSeizure(
      debtToCover,
      PRICE_ONE_USD,
      18n,
      COLLATERAL_PRICE_AFTER_DROP,
      18n,
      LIQUIDATION_BONUS_BPS,
    );

    const reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].supplied, collateralAmount - expectedSeized);
    assert.equal(reserveData[1].currentDebt, borrowAmount - debtToCover);

    assert.equal(await collateral.balanceOf(bob.address), bobCollateralBefore + expectedSeized);
    assert.equal(await debt.balanceOf(bob.address), bobDebtBefore - debtToCover);
  });

  it("caps liquidation to the close factor when the health factor stays above the full-liquidation threshold", async function () {
    const { alice, bob, collateral, debt, pool } = fixture;

    const collateralAmount = toWei("100");
    const borrowAmount = toWei("75");
    const oversizedDebtToCover = toWei("100");
    const closeFactorCappedDebt = borrowAmount / 2n;

    await collateral.connect(alice).approve(pool.target, collateralAmount);
    await pool.connect(alice).supply(collateral.target, collateralAmount, alice.address, 0);
    await pool.connect(alice).borrow(debt.target, borrowAmount, 2, 0, alice.address);

    await pool.setAssetPrice(collateral.target, COLLATERAL_PRICE_PARTIAL_LIQUIDATION);

    const accountData = await pool.getUserAccountData(alice.address);
    assert.ok(accountData.healthFactor < HEALTH_FACTOR_DECIMALS);
    assert.ok(accountData.healthFactor > 950_000_000_000_000_000n);

    await debt.connect(bob).approve(pool.target, oversizedDebtToCover);

    const bobCollateralBefore = await collateral.balanceOf(bob.address);
    const bobDebtBefore = await debt.balanceOf(bob.address);

    await pool.connect(bob).liquidationCall(
      collateral.target,
      debt.target,
      alice.address,
      oversizedDebtToCover,
      false,
    );

    const expectedSeized = expectedCollateralSeizure(
      closeFactorCappedDebt,
      PRICE_ONE_USD,
      18n,
      COLLATERAL_PRICE_PARTIAL_LIQUIDATION,
      18n,
      LIQUIDATION_BONUS_BPS,
    );

    const reserveData = await pool.getUserReservesData(alice.address);
    assert.equal(reserveData[0].supplied, collateralAmount - expectedSeized);
    assert.equal(reserveData[1].currentDebt, borrowAmount - closeFactorCappedDebt);

    assert.equal(await collateral.balanceOf(bob.address), bobCollateralBefore + expectedSeized);
    assert.equal(await debt.balanceOf(bob.address), bobDebtBefore - closeFactorCappedDebt);
  });
});
