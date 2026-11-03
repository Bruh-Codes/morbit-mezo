// Reads MUSD loans and Morbit BTC loops from Mezo testnet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, defineChain, http, parseAbi } from 'viem';

import { liquidationPrice, pct, ratio, usd } from './risk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const dep = JSON.parse(
  fs.readFileSync(path.resolve(here, '../web/ui-config/mezoDeployment.json'), 'utf8'),
);

export const chain = defineChain({
  id: dep.chainId,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MEZO_RPC_URL || dep.rpcUrl] } },
});
export const client = createPublicClient({ chain, transport: http() });

export const abi = {
  troveManager: parseAbi([
    'function getTroveStatus(address) view returns (uint8)',
    'function getTroveColl(address) view returns (uint256)',
    'function getTroveDebt(address) view returns (uint256)',
    'function getEntireSystemColl() view returns (uint256)',
    'function getEntireSystemDebt() view returns (uint256)',
  ]),
  priceFeed: parseAbi(['function fetchPrice() view returns (uint256)']),
  loopFactory: parseAbi(['function accountOf(address) view returns (address)']),
  autoEarn: parseAbi([
    'function totalBtc() view returns (uint256)',
    'function minHarvestBtc() view returns (uint256)',
    'function harvest(uint256) returns (uint256)',
  ]),
};

// --- Chain reads ---

export async function systemState() {
  const [price, coll, debt] = await Promise.all([
    client.readContract({ address: dep.priceFeed, abi: abi.priceFeed, functionName: 'fetchPrice' }),
    client.readContract({ address: dep.troveManager, abi: abi.troveManager, functionName: 'getEntireSystemColl' }),
    client.readContract({ address: dep.troveManager, abi: abi.troveManager, functionName: 'getEntireSystemDebt' }),
  ]);
  const tcr = ratio(coll, debt, price);
  return { price, tcr, recoveryMode: tcr !== undefined && tcr < 15n * 10n ** 17n };
}

async function trove(borrower) {
  const [status, coll, debt] = await Promise.all(
    ['getTroveStatus', 'getTroveColl', 'getTroveDebt'].map((functionName) =>
      client.readContract({ address: dep.troveManager, abi: abi.troveManager, functionName, args: [borrower] }),
    ),
  );
  return Number(status) === 1 ? { coll, debt } : undefined;
}

/** The wallet's own loan, and its Morbit BTC loop if it has one. */
export async function positions(owner) {
  const out = [];
  const own = await trove(owner);
  if (own) out.push({ key: `${owner}:loan`, label: 'MUSD loan', ...own });
  if (dep.loopFactory) {
    const account = await client.readContract({
      address: dep.loopFactory,
      abi: abi.loopFactory,
      functionName: 'accountOf',
      args: [owner],
    });
    if (account !== '0x0000000000000000000000000000000000000000') {
      const loop = await trove(account);
      if (loop) out.push({ key: `${owner}:loop`, label: 'BTC loop', ...loop });
    }
  }
  return out;
}

export function describe(p, price) {
  const icr = ratio(p.coll, p.debt, price);
  return `${p.label}: <b>${pct(icr)}</b>, liquidation at ${usd(liquidationPrice(p.coll, p.debt))}`;
}

