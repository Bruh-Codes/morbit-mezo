// Reads MUSD loans and Morbit BTC loops from Mezo, and runs the optional keeper.
import deployment from 'ui-config/mezoDeployment.json';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  zeroAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { liquidationPrice, MCR, pct, ratio, usd } from './risk';

const dep = deployment as typeof deployment & { loopFactory?: Address; autoEarnVault?: Address };
export const explorerUrl = dep.explorerUrl;

const chain = defineChain({
  id: dep.chainId,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MEZO_RPC_URL || dep.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http() });

const troveManagerAbi = parseAbi([
  'function getTroveStatus(address) view returns (uint256)',
  'function getTroveColl(address) view returns (uint256)',
  'function getTroveDebt(address) view returns (uint256)',
  'function getEntireSystemColl() view returns (uint256)',
  'function getEntireSystemDebt() view returns (uint256)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
  'function batchLiquidateTroves(address[])',
]);
const priceFeedAbi = parseAbi(['function fetchPrice() view returns (uint256)']);
const sortedTrovesAbi = parseAbi([
  'function getLast() view returns (address)',
  'function getPrev(address) view returns (address)',
]);
const loopFactoryAbi = parseAbi(['function accountOf(address) view returns (address)']);
const loopAccountAbi = parseAbi(['function mode() view returns (uint8)']);
const autoEarnAbi = parseAbi([
  'function totalBtc() view returns (uint256)',
  'function minHarvestBtc() view returns (uint256)',
  'function harvest(uint256) returns (uint256)',
]);

const tm = dep.troveManager as Address;

export type Position = {
  key: string;
  label: 'MUSD loan' | 'BTC loop' | 'Borrow & Earn';
  coll: bigint;
  debt: bigint;
};

export function price() {
  return client.readContract({
    address: dep.priceFeed as Address,
    abi: priceFeedAbi,
    functionName: 'fetchPrice',
  });
}

export async function systemState() {
  const [p, coll, debt] = await Promise.all([
    price(),
    client.readContract({ address: tm, abi: troveManagerAbi, functionName: 'getEntireSystemColl' }),
    client.readContract({ address: tm, abi: troveManagerAbi, functionName: 'getEntireSystemDebt' }),
  ]);
  const tcr = ratio(coll, debt, p);
  return { price: p, tcr, recoveryMode: tcr !== undefined && tcr < 15n * 10n ** 17n };
}

async function trove(borrower: Address) {
  const [status, coll, debt] = await Promise.all([
    client.readContract({
      address: tm,
      abi: troveManagerAbi,
      functionName: 'getTroveStatus',
      args: [borrower],
    }),
    client.readContract({
      address: tm,
      abi: troveManagerAbi,
      functionName: 'getTroveColl',
      args: [borrower],
    }),
    client.readContract({
      address: tm,
      abi: troveManagerAbi,
      functionName: 'getTroveDebt',
      args: [borrower],
    }),
  ]);
  return status === 1n ? { coll, debt } : undefined;
}

/** The wallet's own loan, and its Morbit BTC loop if it has one. */
export async function positions(owner: Address): Promise<Position[]> {
  const out: Position[] = [];
  const own = await trove(owner);
  if (own) out.push({ key: `${owner}:loan`, label: 'MUSD loan', ...own });
  if (dep.loopFactory) {
    const account = await client.readContract({
      address: dep.loopFactory,
      abi: loopFactoryAbi,
      functionName: 'accountOf',
      args: [owner],
    });
    if (account !== zeroAddress) {
      const loop = await trove(account);
      // Accounts from the first factory have no mode(); they only ran loops.
      const mode = await client
        .readContract({ address: account, abi: loopAccountAbi, functionName: 'mode' })
        .catch(() => 1);
      if (loop)
        out.push({
          key: `${owner}:loop`,
          label: mode === 2 ? 'Borrow & Earn' : 'BTC loop',
          ...loop,
        });
    }
  }
  return out;
}

export function describe(p: Position, btcPrice: bigint) {
  return `${p.label.replace('&', '&amp;')}: <b>${pct(
    ratio(p.coll, p.debt, btcPrice)
  )}</b>, liquidation at ${usd(liquidationPrice(p.coll, p.debt))}`;
}

/**
 * Optional keeper (KEEPER_PRIVATE_KEY): liquidates troves under 110%, which MUSD requires before
 * anyone can withdraw from the Stability Pool and which pays depositors BTC, then compounds
 * Auto Earn once its BTC gains reach the minimum. Both calls are permissionless.
 */
export async function runKeeper(): Promise<string[]> {
  const key = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) return [];
  const wallet = createWalletClient({
    chain,
    transport: http(),
    account: privateKeyToAccount(key),
  });
  const log: string[] = [];

  const p = await price();
  const targets: Address[] = [];
  let t = await client.readContract({
    address: dep.sortedTroves as Address,
    abi: sortedTrovesAbi,
    functionName: 'getLast',
  });
  while (t !== zeroAddress && targets.length < 20) {
    const icr = await client.readContract({
      address: tm,
      abi: troveManagerAbi,
      functionName: 'getCurrentICR',
      args: [t, p],
    });
    if (icr >= MCR) break;
    targets.push(t);
    t = await client.readContract({
      address: dep.sortedTroves as Address,
      abi: sortedTrovesAbi,
      functionName: 'getPrev',
      args: [t],
    });
  }
  if (targets.length) {
    const hash = await wallet.writeContract({
      address: tm,
      abi: troveManagerAbi,
      functionName: 'batchLiquidateTroves',
      args: [targets],
    });
    await client.waitForTransactionReceipt({ hash });
    log.push(`liquidated ${targets.length}: ${hash}`);
  }

  if (dep.autoEarnVault) {
    const [btc, min] = await Promise.all([
      client.readContract({
        address: dep.autoEarnVault,
        abi: autoEarnAbi,
        functionName: 'totalBtc',
      }),
      client.readContract({
        address: dep.autoEarnVault,
        abi: autoEarnAbi,
        functionName: 'minHarvestBtc',
      }),
    ]);
    if (btc > 0n && btc >= min) {
      const hash = await wallet.writeContract({
        address: dep.autoEarnVault,
        abi: autoEarnAbi,
        functionName: 'harvest',
        args: [0n],
      });
      await client.waitForTransactionReceipt({ hash });
      log.push(`harvested: ${hash}`);
    }
  }
  return log;
}
