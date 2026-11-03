// Print the loan and loop health of a wallet without Telegram:  node check.js 0x...
import { describe, positions, systemState } from './chain.js';
import { pct, usd } from './risk.js';

const address = process.argv[2];
if (!address) {
  console.error('Usage: node check.js <wallet address>');
  process.exit(1);
}
const { price, tcr, recoveryMode } = await systemState();
console.log(`BTC ${usd(price)} · system ratio ${pct(tcr)}${recoveryMode ? ' (recovery mode)' : ''}`);
const list = await positions(address);
if (!list.length) console.log('No open loan or loop.');
for (const p of list) console.log(describe(p, price).replace(/<\/?b>/g, ''));
