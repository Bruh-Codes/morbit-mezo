// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMusdPriceFeed} from "./MorbitEarnVault.sol";
import {IBtcToMusdSwapper} from "./MorbitEarnVaultV2.sol";
import {IMusdToBtcSwapper} from "./MezoPoolsSwapper.sol";

/// @notice Subset of MUSD BorrowerOperations (mezo-org/musd). Trove calls act for msg.sender.
interface IMusdBorrowerOperations {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;

    function adjustTrove(
        uint256 collWithdrawal,
        uint256 debtChange,
        bool isDebtIncrease,
        address upperHint,
        address lowerHint
    ) external payable;

    function closeTrove() external;
}

interface IMusdTroveManager {
    function getTroveColl(address borrower) external view returns (uint256);
    function getTroveDebt(address borrower) external view returns (uint256);
    function getTroveStatus(address borrower) external view returns (uint256);
}

interface IMorbitSwapper is IBtcToMusdSwapper, IMusdToBtcSwapper {}

/**
 * @title MorbitLoopAccount
 * @notice A personal smart account that owns one MUSD trove, so a leveraged BTC position can be
 *         opened and closed in a single transaction:
 *           open:  deposit BTC → borrow MUSD → swap MUSD to BTC on Mezo Pools → add that BTC as collateral
 *           close: withdraw some BTC → swap it to MUSD → repay and close the trove → return BTC and MUSD
 *         Only the owner (or the factory, acting for the owner) can move funds. Every swap must also
 *         beat the MUSD oracle price minus `ORACLE_SLIPPAGE_BPS`, whatever minimum the caller passes.
 */
contract MorbitLoopAccount is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    /// @notice Largest gap to the oracle price a swap may have. Testnet pools drift a few percent.
    uint256 public constant ORACLE_SLIPPAGE_BPS = 500;

    address public immutable owner;
    address public immutable factory;
    IMusdBorrowerOperations public immutable borrowerOperations;
    IMusdTroveManager public immutable troveManager;
    IMusdPriceFeed public immutable priceFeed;
    IMorbitSwapper public immutable swapper;
    IERC20 public immutable musd;

    event LoopOpened(uint256 collateralIn, uint256 debt, uint256 btcBought);
    event LoopClosed(uint256 btcSold, uint256 musdBought, uint256 btcOut, uint256 musdOut);
    event CollateralAdded(uint256 amount);

    error NotOwner();
    error InsufficientOutput(uint256 received, uint256 required);
    error NotEnoughMusdToClose(uint256 have, uint256 need);
    error TransferFailed();

    struct Config {
        address borrowerOperations;
        address troveManager;
        address priceFeed;
        address swapper;
        address musd;
    }

    constructor(address owner_, Config memory config) {
        owner = owner_;
        factory = msg.sender;
        borrowerOperations = IMusdBorrowerOperations(config.borrowerOperations);
        troveManager = IMusdTroveManager(config.troveManager);
        priceFeed = IMusdPriceFeed(config.priceFeed);
        swapper = IMorbitSwapper(config.swapper);
        musd = IERC20(config.musd);
    }

    modifier onlyOwner() {
        if (msg.sender != owner && msg.sender != factory) revert NotOwner();
        _;
    }

    /// @dev BTC arrives from trove withdrawals, closing, and MUSD→BTC swaps.
    receive() external payable {}

    // --- Views ---

    function collateral() external view returns (uint256) {
        return troveManager.getTroveColl(address(this));
    }

    function debt() external view returns (uint256) {
        return troveManager.getTroveDebt(address(this));
    }

    /// @notice Smallest acceptable BTC for `musdIn`, from the oracle.
    function oracleBtcFloor(uint256 musdIn) public view returns (uint256) {
        return (musdIn * WAD * (BPS - ORACLE_SLIPPAGE_BPS)) / priceFeed.fetchPrice() / BPS;
    }

    /// @notice Smallest acceptable MUSD for `btcIn`, from the oracle.
    function oracleMusdFloor(uint256 btcIn) public view returns (uint256) {
        return (btcIn * priceFeed.fetchPrice() * (BPS - ORACLE_SLIPPAGE_BPS)) / WAD / BPS;
    }

    // --- Actions ---

    /**
     * @notice Open a leveraged trove in one transaction. `msg.value` is the starting collateral and
     *         `debtAmount` the MUSD to borrow and swap into more BTC.
     * @param hints [open upper, open lower, add-collateral upper, add-collateral lower] for SortedTroves.
     */
    function openLoop(uint256 debtAmount, uint256 minBtcOut, address[4] calldata hints)
        external
        payable
        onlyOwner
        nonReentrant
    {
        borrowerOperations.openTrove{value: msg.value}(debtAmount, hints[0], hints[1]);
        uint256 bought = _buyBtc(debtAmount, minBtcOut);
        borrowerOperations.adjustTrove{value: bought}(0, 0, false, hints[2], hints[3]);
        emit LoopOpened(msg.value, debtAmount, bought);
    }

    /// @notice Add BTC to the trove to lower liquidation risk.
    function addCollateral(address upperHint, address lowerHint) external payable onlyOwner nonReentrant {
        borrowerOperations.adjustTrove{value: msg.value}(0, 0, false, upperHint, lowerHint);
        emit CollateralAdded(msg.value);
    }

    /**
     * @notice Unwind in one transaction: withdraw `btcToSell`, swap it to MUSD, close the trove and
     *         send every remaining BTC and MUSD to the owner. If the swap does not cover the debt,
     *         the shortfall is pulled from the owner's MUSD (needs an allowance to this account).
     */
    function closeLoop(uint256 btcToSell, uint256 minMusdOut, address upperHint, address lowerHint)
        external
        onlyOwner
        nonReentrant
    {
        uint256 musdBought;
        if (btcToSell > 0) {
            borrowerOperations.adjustTrove(btcToSell, 0, false, upperHint, lowerHint);
            uint256 floor = oracleMusdFloor(btcToSell);
            uint256 required = minMusdOut > floor ? minMusdOut : floor;
            uint256 before = musd.balanceOf(address(this));
            swapper.swapBtcToMusd{value: btcToSell}(required, address(this));
            musdBought = musd.balanceOf(address(this)) - before;
            if (musdBought < required) revert InsufficientOutput(musdBought, required);
        }

        // closeTrove burns the debt minus the refundable gas compensation, which comes back to us.
        uint256 debtNow = troveManager.getTroveDebt(address(this));
        uint256 need = debtNow > 200e18 ? debtNow - 200e18 : 0;
        uint256 have = musd.balanceOf(address(this));
        if (have < need) {
            uint256 shortfall = need - have;
            if (musd.allowance(owner, address(this)) < shortfall || musd.balanceOf(owner) < shortfall) {
                revert NotEnoughMusdToClose(have, need);
            }
            musd.safeTransferFrom(owner, address(this), shortfall);
        }
        borrowerOperations.closeTrove();

        (uint256 btcOut, uint256 musdOut) = _sweep();
        emit LoopClosed(btcToSell, musdBought, btcOut, musdOut);
    }

    /// @notice Send any BTC or MUSD this account holds to the owner.
    function sweep() external onlyOwner nonReentrant returns (uint256 btcOut, uint256 musdOut) {
        return _sweep();
    }

    // --- Internal ---

    function _buyBtc(uint256 musdIn, uint256 minBtcOut) internal returns (uint256 bought) {
        uint256 floor = oracleBtcFloor(musdIn);
        uint256 required = minBtcOut > floor ? minBtcOut : floor;
        musd.forceApprove(address(swapper), musdIn);
        uint256 before = address(this).balance;
        swapper.swapMusdToBtc(musdIn, required, address(this));
        bought = address(this).balance - before;
        if (bought < required) revert InsufficientOutput(bought, required);
    }

    function _sweep() internal returns (uint256 btcOut, uint256 musdOut) {
        musdOut = musd.balanceOf(address(this));
        if (musdOut > 0) musd.safeTransfer(owner, musdOut);
        btcOut = address(this).balance;
        if (btcOut > 0) {
            (bool ok, ) = owner.call{value: btcOut}("");
            if (!ok) revert TransferFailed();
        }
    }
}

/**
 * @title MorbitLoopFactory
 * @notice Creates one MorbitLoopAccount per wallet. `openLoop` creates the account when needed and
 *         opens the loop in the same transaction, so a first-time user signs once.
 */
contract MorbitLoopFactory {
    MorbitLoopAccount.Config public config;
    mapping(address => MorbitLoopAccount) public accountOf;

    event AccountCreated(address indexed owner, address account);

    constructor(MorbitLoopAccount.Config memory config_) {
        config = config_;
    }

    function createAccount() public returns (MorbitLoopAccount account) {
        account = accountOf[msg.sender];
        if (address(account) == address(0)) {
            account = new MorbitLoopAccount(msg.sender, config);
            accountOf[msg.sender] = account;
            emit AccountCreated(msg.sender, address(account));
        }
    }

    function openLoop(uint256 debtAmount, uint256 minBtcOut, address[4] calldata hints)
        external
        payable
        returns (MorbitLoopAccount account)
    {
        account = createAccount();
        account.openLoop{value: msg.value}(debtAmount, minBtcOut, hints);
    }
}
