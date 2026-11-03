// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMusdStabilityPool, IMusdPriceFeed} from "./MorbitEarnVault.sol";

/// @notice Turns native BTC into MUSD. The vault sends BTC as value and checks what comes back.
interface IBtcToMusdSwapper {
    function swapBtcToMusd(uint256 minMusdOut, address recipient) external payable returns (uint256 musdOut);
}

/**
 * @title MorbitEarnVaultV2 ("Auto Earn")
 * @notice Simple Earn with two additions:
 *         1. Auto-compounding. Anyone can call `harvest`, which collects the BTC the Stability Pool
 *            paid for liquidations, swaps it to MUSD on Mezo Pools and deposits it back. The swap
 *            must return at least the oracle value minus `maxSlippageBps`, so a caller cannot
 *            harvest at a bad price.
 *         2. MEZO rewards. The owner funds MEZO that streams to share holders pro rata over a
 *            set period (Synthetix StakingRewards accounting). Shares stay transferable; rewards
 *            are settled on every balance change.
 *
 *         3. A performance fee (default 10%, at most 20%) on harvested yield only.
 *
 *         Withdrawals always stay open, also while deposits are paused.
 */
contract MorbitEarnVaultV2 is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 public constant MAX_SLIPPAGE_BPS = 1_000; // 10%
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20%

    IERC20 public immutable musd;
    IERC20 public immutable rewardToken; // MEZO
    IMusdStabilityPool public immutable stabilityPool;
    IMusdPriceFeed public immutable priceFeed;

    IBtcToMusdSwapper public swapper;
    uint256 public maxSlippageBps = 300;
    /// @notice BTC gains below this are not worth the gas of a swap.
    uint256 public minHarvestBtc = 1e12;

    uint256 public depositCap;
    bool public depositsPaused;

    /// @notice Share of harvested yield (MUSD from compounding) sent to `feeRecipient`. Deposits and
    ///         withdrawals are free; the fee only applies to gains.
    uint256 public performanceFeeBps = 1_000; // 10%
    address public feeRecipient;

    // --- MEZO reward stream ---
    uint256 public rewardRate; // MEZO per second, 18 decimals
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerShareStored;
    mapping(address => uint256) public userRewardPerSharePaid;
    mapping(address => uint256) public rewards;

    // --- Stats for the app ---
    uint256 public totalHarvestedBtc;
    uint256 public totalCompoundedMusd;
    uint256 public lastHarvestAt;
    uint256 public totalFeesMusd;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 shares,
        uint256 musdOut,
        uint256 btcOut
    );
    event Harvest(address indexed caller, uint256 btcIn, uint256 musdOut);
    event PerformanceFeePaid(address indexed recipient, uint256 musd);
    event PerformanceFeeUpdated(uint256 feeBps, address recipient);
    event RewardAdded(uint256 amount, uint256 duration);
    event RewardPaid(address indexed account, uint256 amount);
    event SwapperUpdated(address swapper);
    event HarvestSettingsUpdated(uint256 maxSlippageBps, uint256 minHarvestBtc);
    event DepositCapUpdated(uint256 cap);
    event DepositsPaused(bool paused);

    error ZeroAmount();
    error DepositsArePaused();
    error CapExceeded();
    error BtcTransferFailed();
    error UnexpectedSender();
    error NothingToHarvest();
    error NoSwapper();
    error SlippageTooHigh();
    error InsufficientOutput(uint256 received, uint256 required);
    error RewardTooHigh();
    error InvalidDuration();
    error FeeTooHigh();

    constructor(
        address musd_,
        address rewardToken_,
        address stabilityPool_,
        address priceFeed_,
        address swapper_,
        address owner_
    ) ERC20("Morbit Auto Earn MUSD", "maMUSD") Ownable(owner_) {
        musd = IERC20(musd_);
        rewardToken = IERC20(rewardToken_);
        stabilityPool = IMusdStabilityPool(stabilityPool_);
        priceFeed = IMusdPriceFeed(priceFeed_);
        swapper = IBtcToMusdSwapper(swapper_);
        feeRecipient = owner_;
        IERC20(musd_).forceApprove(stabilityPool_, type(uint256).max);
    }

    /// @dev BTC arrives as native value from the Stability Pool only.
    receive() external payable {
        if (msg.sender != address(stabilityPool)) revert UnexpectedSender();
    }

    // --- Views ---

    function totalMusd() public view returns (uint256) {
        return musd.balanceOf(address(this)) + stabilityPool.getCompoundedMUSDDeposit(address(this));
    }

    function totalBtc() public view returns (uint256) {
        return address(this).balance + stabilityPool.getDepositorCollateralGain(address(this));
    }

    function totalAssets() public view returns (uint256) {
        return totalMusd() + (totalBtc() * priceFeed.fetchPrice()) / WAD;
    }

    function sharePrice() external view returns (uint256) {
        return convertToAssets(WAD);
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply() + 1)) / (totalAssets() + 1);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + 1)) / (totalSupply() + 1);
    }

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

    /// @notice MUSD a harvest must return at least, given the BTC it would swap.
    function minHarvestOut(uint256 btcIn) public view returns (uint256) {
        return (btcIn * priceFeed.fetchPrice() * (BPS - maxSlippageBps)) / WAD / BPS;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerShare() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return rewardPerShareStored;
        return rewardPerShareStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * WAD) / supply;
    }

    function earned(address account) public view returns (uint256) {
        return
            (balanceOf(account) * (rewardPerShare() - userRewardPerSharePaid[account])) /
            WAD +
            rewards[account];
    }

    // --- User actions ---

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (depositsPaused) revert DepositsArePaused();
        if (assets > maxDeposit()) revert CapExceeded();

        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();

        musd.safeTransferFrom(msg.sender, address(this), assets);
        stabilityPool.provideToSP(musd.balanceOf(address(this)));
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

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
        _withdrawFromPool(musdOut > idle ? musdOut - idle : 0);

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

    /// @notice Send the caller's accrued MEZO.
    function claimRewards() external nonReentrant returns (uint256 reward) {
        _updateReward(msg.sender);
        reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /**
     * @notice Swap the vault's BTC gains to MUSD and deposit them back into the Stability Pool.
     *         Anyone can call it. `minMusdOut` lets the caller ask for more than the oracle floor.
     */
    function harvest(uint256 minMusdOut) external nonReentrant returns (uint256 musdOut) {
        if (address(swapper) == address(0)) revert NoSwapper();

        // A zero withdrawal pays out pending BTC gains without touching the MUSD deposit,
        // and works even while undercollateralized troves block real withdrawals.
        _withdrawFromPool(0);

        uint256 btcIn = address(this).balance;
        if (btcIn < minHarvestBtc || btcIn == 0) revert NothingToHarvest();

        uint256 floor = minHarvestOut(btcIn);
        uint256 required = minMusdOut > floor ? minMusdOut : floor;

        uint256 before = musd.balanceOf(address(this));
        swapper.swapBtcToMusd{value: btcIn}(required, address(this));
        uint256 swapped = musd.balanceOf(address(this)) - before;
        if (swapped < required) revert InsufficientOutput(swapped, required);

        uint256 fee = feeRecipient == address(0) ? 0 : (swapped * performanceFeeBps) / BPS;
        if (fee > 0) {
            musd.safeTransfer(feeRecipient, fee);
            totalFeesMusd += fee;
            emit PerformanceFeePaid(feeRecipient, fee);
        }
        musdOut = swapped - fee;

        uint256 toDeposit = musd.balanceOf(address(this));
        if (toDeposit > 0) stabilityPool.provideToSP(toDeposit);

        totalHarvestedBtc += btcIn;
        totalCompoundedMusd += musdOut;
        lastHarvestAt = block.timestamp;
        emit Harvest(msg.sender, btcIn, musdOut);
    }

    // --- Owner ---

    /**
     * @notice Stream `amount` MEZO to share holders over `duration` seconds. Pulls the MEZO from
     *         the caller. Any undistributed MEZO from the current period is rolled in.
     */
    function notifyRewardAmount(uint256 amount, uint256 duration) external onlyOwner {
        if (duration == 0) revert InvalidDuration();
        _updateReward(address(0));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        if (block.timestamp >= periodFinish) {
            rewardRate = amount / duration;
        } else {
            uint256 leftover = (periodFinish - block.timestamp) * rewardRate;
            rewardRate = (amount + leftover) / duration;
        }
        // The contract must hold enough to pay the full stream (rewards already owed are inside).
        if (rewardRate * duration > rewardToken.balanceOf(address(this))) revert RewardTooHigh();

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(amount, duration);
    }

    function setSwapper(address swapper_) external onlyOwner {
        swapper = IBtcToMusdSwapper(swapper_);
        emit SwapperUpdated(swapper_);
    }

    function setHarvestSettings(uint256 maxSlippageBps_, uint256 minHarvestBtc_) external onlyOwner {
        if (maxSlippageBps_ > MAX_SLIPPAGE_BPS) revert SlippageTooHigh();
        maxSlippageBps = maxSlippageBps_;
        minHarvestBtc = minHarvestBtc_;
        emit HarvestSettingsUpdated(maxSlippageBps_, minHarvestBtc_);
    }

    /// @notice Set the performance fee on harvested yield (at most 20%) and who receives it.
    function setPerformanceFee(uint256 feeBps, address recipient) external onlyOwner {
        if (feeBps > MAX_PERFORMANCE_FEE_BPS) revert FeeTooHigh();
        performanceFeeBps = feeBps;
        feeRecipient = recipient;
        emit PerformanceFeeUpdated(feeBps, recipient);
    }

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapUpdated(cap);
    }

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    // --- Internal ---

    /**
     * @dev Withdraw `amount` MUSD from the Stability Pool and collect the BTC gain. When a
     *      liquidation has used up the whole deposit, the compounded deposit is zero but the BTC
     *      gain is still owed, so a zero withdrawal is still made to collect it.
     */
    function _withdrawFromPool(uint256 amount) internal {
        if (stabilityPool.getCompoundedMUSDDeposit(address(this)) > 0) {
            stabilityPool.withdrawFromSP(amount);
        } else if (stabilityPool.getDepositorCollateralGain(address(this)) > 0) {
            stabilityPool.withdrawFromSP(0);
        }
    }

    function _updateReward(address account) internal {
        rewardPerShareStored = rewardPerShare();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerSharePaid[account] = rewardPerShareStored;
        }
    }

    /// @dev Settle rewards for both sides before any mint, burn or transfer changes balances.
    function _update(address from, address to, uint256 value) internal override {
        _updateReward(from);
        if (to != from) _updateReward(to);
        super._update(from, to, value);
    }
}
