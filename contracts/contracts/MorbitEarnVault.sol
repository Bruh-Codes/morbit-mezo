// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Subset of the MUSD StabilityPool used by the vault (mezo-org/musd).
interface IMusdStabilityPool {
    function provideToSP(uint256 amount) external;
    function withdrawFromSP(uint256 amount) external;
    function getCompoundedMUSDDeposit(address depositor) external view returns (uint256);
    function getDepositorCollateralGain(address depositor) external view returns (uint256);
    function getTotalMUSDDeposits() external view returns (uint256);
}

/// @notice MUSD PriceFeed: BTC/USD with 18 decimals.
interface IMusdPriceFeed {
    function fetchPrice() external view returns (uint256);
}

/**
 * @title MorbitEarnVault ("Simple Earn")
 * @notice Pools MUSD deposits into the MUSD Stability Pool on Mezo. The Stability Pool
 *         absorbs liquidated trove debt and pays depositors the liquidated BTC collateral,
 *         so the vault holds MUSD plus BTC gains. Shares (mvMUSD) are a pro-rata claim on both.
 *         Withdrawals return MUSD and the matching share of BTC; nothing is swapped.
 */
contract MorbitEarnVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;
    IMusdStabilityPool public immutable stabilityPool;
    IMusdPriceFeed public immutable priceFeed;

    /// @notice Maximum MUSD value the vault accepts. 0 means no cap.
    uint256 public depositCap;
    /// @notice Pausing blocks deposits only; withdrawals always stay open.
    bool public depositsPaused;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 shares,
        uint256 musdOut,
        uint256 btcOut
    );
    event DepositCapUpdated(uint256 cap);
    event DepositsPaused(bool paused);

    error ZeroAmount();
    error DepositsArePaused();
    error CapExceeded();
    error BtcTransferFailed();
    error UnexpectedSender();

    constructor(address musd_, address stabilityPool_, address priceFeed_, address owner_)
        ERC20("Morbit Simple Earn MUSD", "mvMUSD")
        Ownable(owner_)
    {
        musd = IERC20(musd_);
        stabilityPool = IMusdStabilityPool(stabilityPool_);
        priceFeed = IMusdPriceFeed(priceFeed_);
        IERC20(musd_).forceApprove(stabilityPool_, type(uint256).max);
    }

    /// @dev The Stability Pool pays BTC gains as native value.
    receive() external payable {
        if (msg.sender != address(stabilityPool)) revert UnexpectedSender();
    }

    // --- Views ---

    /// @notice MUSD held by the vault, idle plus deposited in the Stability Pool.
    function totalMusd() public view returns (uint256) {
        return musd.balanceOf(address(this)) + stabilityPool.getCompoundedMUSDDeposit(address(this));
    }

    /// @notice BTC held by the vault, received plus still pending in the Stability Pool.
    function totalBtc() public view returns (uint256) {
        return address(this).balance + stabilityPool.getDepositorCollateralGain(address(this));
    }

    /// @notice Total vault value in MUSD, valuing BTC at the MUSD PriceFeed price.
    function totalAssets() public view returns (uint256) {
        return totalMusd() + (totalBtc() * priceFeed.fetchPrice()) / 1e18;
    }

    /// @notice MUSD value of one full share (1e18), 18 decimals.
    function sharePrice() external view returns (uint256) {
        return convertToAssets(1e18);
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        // Virtual share and asset of 1 make the first-depositor inflation attack unprofitable.
        return (assets * (totalSupply() + 1)) / (totalAssets() + 1);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + 1)) / (totalSupply() + 1);
    }

    /// @notice What redeeming `shares` pays out right now.
    function previewRedeem(uint256 shares) public view returns (uint256 musdOut, uint256 btcOut) {
        uint256 supply = totalSupply();
        if (supply == 0 || shares == 0) return (0, 0);
        musdOut = (totalMusd() * shares) / supply;
        btcOut = (totalBtc() * shares) / supply;
    }

    function maxDeposit() public view returns (uint256) {
        if (depositsPaused) return 0;
        if (depositCap == 0) return type(uint256).max;
        uint256 current = totalAssets();
        return current >= depositCap ? 0 : depositCap - current;
    }

    // --- Actions ---

    /// @notice Deposit MUSD and receive mvMUSD shares. The MUSD goes straight into the Stability Pool.
    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (depositsPaused) revert DepositsArePaused();
        if (assets > maxDeposit()) revert CapExceeded();

        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();

        musd.safeTransferFrom(msg.sender, address(this), assets);
        // Also pulls any pending BTC gain into the vault; accounting already counted it.
        stabilityPool.provideToSP(musd.balanceOf(address(this)));
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Burn `shares` from `owner_` and send the pro-rata MUSD and BTC to `receiver`.
    function redeem(uint256 shares, address receiver, address owner_)
        external
        nonReentrant
        returns (uint256 musdOut, uint256 btcOut)
    {
        if (shares == 0) revert ZeroAmount();
        if (msg.sender != owner_) _spendAllowance(owner_, msg.sender, shares);

        (musdOut, btcOut) = previewRedeem(shares);
        _burn(owner_, shares);

        uint256 idle = musd.balanceOf(address(this));
        if (stabilityPool.getCompoundedMUSDDeposit(address(this)) > 0) {
            // Withdrawing also collects every pending BTC gain into the vault.
            stabilityPool.withdrawFromSP(musdOut > idle ? musdOut - idle : 0);
        }

        uint256 musdBalance = musd.balanceOf(address(this));
        if (musdOut > musdBalance) musdOut = musdBalance;
        if (btcOut > address(this).balance) btcOut = address(this).balance;

        if (musdOut > 0) musd.safeTransfer(receiver, musdOut);
        if (btcOut > 0) {
            (bool ok, ) = receiver.call{value: btcOut}("");
            if (!ok) revert BtcTransferFailed();
        }

        emit Withdraw(msg.sender, receiver, owner_, shares, musdOut, btcOut);
    }

    // --- Owner ---

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapUpdated(cap);
    }

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }
}
