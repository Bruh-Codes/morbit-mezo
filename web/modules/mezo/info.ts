/** One-line explanations shown in "i" tooltips. */
export const INFO: Record<string, string> = {
  'BTC price': 'BTC price from the MUSD oracle. Used for all collateral ratios.',
  'MUSD borrowed': 'Total MUSD debt across every trove on Mezo.',
  'BTC collateral': 'Total BTC locked in troves backing MUSD.',
  'System ratio':
    'Total collateral value ÷ total debt. Below 150%, Mezo enters recovery mode and tightens rules.',
  'Minimum debt': 'Smallest MUSD loan a trove can have.',
  'Borrowing fee': 'One-time fee on what you borrow, added to your debt.',
  'Liquidation at': 'Troves below this collateral ratio can be liquidated.',
  'Vault value': 'Everything the Simple Earn vault holds, in USD.',
  'mvMUSD price': 'MUSD value of one vault share. It rises as the vault earns BTC.',
  'Stability Pool': 'MUSD from all depositors that repays liquidated troves.',
  'Your position': 'Current value of your vault shares.',
  'Net value': 'Wallet + trove collateral − debt + Simple Earn.',
  'Simple Earn': 'Current value of your vault shares.',
  'Collateral ratio': 'Your BTC value ÷ your debt. Liquidation below 110%.',
  'Liquidation price': 'BTC price at which this trove hits 110% and can be liquidated.',
  'Interest rate': 'Fixed yearly rate on your debt, set when the trove opens.',
  'Total debt': 'What you owe: amount + fee + 200 MUSD refundable reserve.',
  Withdrawable: 'What you get if you withdraw all shares now.',
};
