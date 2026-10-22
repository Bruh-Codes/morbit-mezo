import { erc20Abi, parseAbi } from 'viem';

export { erc20Abi };

export const borrowerOperationsAbi = parseAbi([
  'function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable',
  'function adjustTrove(uint256 _collWithdrawal, uint256 _debtChange, bool _isDebtIncrease, address _upperHint, address _lowerHint) payable',
  'function closeTrove()',
  'function minNetDebt() view returns (uint256)',
  'function borrowingRate() view returns (uint256)',
  'function getBorrowingFee(uint256 _debt) view returns (uint256)',
  'event TroveUpdated(address indexed _borrower, uint256 _principal, uint256 _interest, uint256 _coll, uint256 _stake, uint16 _interestRate, uint256 _lastInterestUpdateTime, uint8 _operation)',
]);

export const troveManagerAbi = parseAbi([
  'function stabilityPool() view returns (address)',
  'function sortedTroves() view returns (address)',
  'function getTroveStatus(address _borrower) view returns (uint8)',
  'function getTroveColl(address _borrower) view returns (uint256)',
  'function getTroveDebt(address _borrower) view returns (uint256)',
  'function getTroveInterestRate(address _borrower) view returns (uint16)',
  'function getCurrentICR(address _borrower, uint256 _price) view returns (uint256)',
  'function getTCR(uint256 _price) view returns (uint256)',
  'function checkRecoveryMode(uint256 _price) view returns (bool)',
  'function getEntireSystemColl() view returns (uint256)',
  'function getEntireSystemDebt() view returns (uint256)',
]);

export const priceFeedAbi = parseAbi(['function fetchPrice() view returns (uint256)']);

export const sortedTrovesAbi = parseAbi([
  'function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)',
  'function getSize() view returns (uint256)',
]);

export const stabilityPoolAbi = parseAbi([
  'function getTotalMUSDDeposits() view returns (uint256)',
  'function getCollateralBalance() view returns (uint256)',
]);

export const earnVaultAbi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 musdOut, uint256 btcOut)',
  'function totalAssets() view returns (uint256)',
  'function totalMusd() view returns (uint256)',
  'function totalBtc() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function sharePrice() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256 musdOut, uint256 btcOut)',
  'function maxDeposit() view returns (uint256)',
  'function depositCap() view returns (uint256)',
  'function depositsPaused() view returns (bool)',
  'event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 musdOut, uint256 btcOut)',
]);
