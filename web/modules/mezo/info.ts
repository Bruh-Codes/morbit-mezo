/** One-line explanations shown in "i" tooltips. */
export const INFO: Record<string, string> = {
  'BTC price': 'BTC price from the MUSD oracle. Used for all collateral ratios.',
  'Total borrowed': 'Total MUSD debt across every trove on Mezo.',
  'Total BTC locked': 'Total BTC locked in troves backing MUSD.',
  'System ratio':
    'Total collateral value ÷ total debt. Below 150%, Mezo enters recovery mode and tightens rules.',
  'Minimum debt': 'Smallest MUSD loan a trove can have.',
  'Borrowing fee': 'One-time fee on what you borrow, added to your debt.',
  'Liquidation at': 'Troves below this collateral ratio can be liquidated.',
  'Vault value': 'Everything the Earn vault holds, in USD.',
  'Share price': 'MUSD value of one vault share. It rises as the vault earns BTC.',
  'Stability Pool': 'MUSD from all depositors that repays liquidated troves.',
  'Your position': 'Current value of your vault shares.',
  'Net value': 'Wallet + loan collateral − debt + Earn position.',
  'Simple Earn': 'Current value of your vault shares.',
  'Collateral ratio': 'Your BTC value ÷ your debt. Liquidation below 110%.',
  'Liquidation price': 'BTC price at which this trove hits 110% and can be liquidated.',
  'Interest rate': 'Fixed yearly rate on your debt, set when the trove opens.',
  'Total debt': 'What you owe: amount + fee + 200 MUSD refundable reserve.',
  'MEZO rewards':
    'Yearly MEZO streamed to depositors ÷ vault value, at the Mezo Pools MEZO price. Changes as deposits change.',
  'BTC gains to compound':
    'BTC the vault received from liquidations. Compounding swaps it to MUSD on Mezo Pools at no worse than 3% under the oracle price. Anyone can trigger it.',
  'Mezo Pools price': 'What 1 BTC costs in MUSD on the Mezo Pools BTC/MUSD pool right now.',
  'BTC exposure': 'All BTC in the loop: your deposit plus the BTC bought with borrowed MUSD.',
  'Loop net value': 'BTC exposure at the oracle price minus debt. This is what you own.',
  Withdrawable: 'What you get if you withdraw all shares now.',
  'Performance fee':
    'Share of each compounding that goes to Morbit. Taken only from BTC gains, never from deposits.',
  'maMUSD pool':
    'Stable pool on Mezo Pools. Trade Auto Earn shares for MUSD without withdrawing, or add liquidity to earn swap fees.',
};
