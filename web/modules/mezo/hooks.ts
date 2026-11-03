'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { type Abi, type Address, getAbiItem, type Hash } from 'viem';
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';

import {
  autoEarnVaultAbi,
  borrowerOperationsAbi,
  earnVaultAbi,
  erc20Abi,
  mezoRouterAbi,
  priceFeedAbi,
  sortedTrovesAbi,
  stabilityPoolAbi,
  troveManagerAbi,
} from './abis';
import { type LegacyVault, mezo, MEZO_TESTNET_ID, ZERO } from './config';
import { cachedChunked } from './logs';
import { recordTx, updateTx } from './txHistory';

const chainId = MEZO_TESTNET_ID;
const WAD = 10n ** 18n;
const YEAR = 365n * 24n * 60n * 60n;
const REFRESH_MS = 15_000;

function ok<T>(
  result: { status: 'success' | 'failure'; result?: unknown } | undefined
): T | undefined {
  return result?.status === 'success' ? (result.result as T) : undefined;
}

/** StabilityPool and SortedTroves, from the deploy record or TroveManager. */
export function useMusdAddresses() {
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: mezo.troveManager, abi: troveManagerAbi, functionName: 'stabilityPool', chainId },
      { address: mezo.troveManager, abi: troveManagerAbi, functionName: 'sortedTroves', chainId },
    ],
    query: { enabled: !mezo.stabilityPool || !mezo.sortedTroves, staleTime: Infinity },
  });
  return {
    stabilityPool: mezo.stabilityPool ?? ok<Address>(data?.[0]),
    sortedTroves: mezo.sortedTroves ?? ok<Address>(data?.[1]),
  };
}

export type AutoEarnStats = {
  rewardRate?: bigint;
  periodFinish?: bigint;
  minHarvestBtc?: bigint;
  totalCompoundedMusd?: bigint;
  lastHarvestAt?: bigint;
  /** MUSD for 1 MEZO on Mezo Pools. */
  mezoPrice?: bigint;
  /** Yearly MEZO rewards ÷ vault value, 1e18 = 100%. Undefined when no stream is running. */
  rewardApr?: bigint;
  /** Share of compounded BTC gains kept as Morbit's fee, in basis points. Undefined on vaults without one. */
  performanceFeeBps?: bigint;
};

export type MusdSystem = {
  btcPrice?: bigint;
  tcr?: bigint;
  systemColl?: bigint;
  systemDebt?: bigint;
  minNetDebt?: bigint;
  borrowingRate?: bigint;
  stabilityPoolDeposits?: bigint;
  stabilityPoolBtc?: bigint;
  vault?: {
    totalAssets?: bigint;
    totalMusd?: bigint;
    totalBtc?: bigint;
    totalSupply?: bigint;
    sharePrice?: bigint;
    maxDeposit?: bigint;
    depositsPaused?: boolean;
  };
  /** Auto Earn only. */
  autoEarn?: AutoEarnStats;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/** Live MUSD protocol state on Mezo testnet. */
export function useMusdSystem(): MusdSystem {
  const { stabilityPool } = useMusdAddresses();
  const vault = mezo.earnVault;
  const { data, isLoading, isError, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: mezo.priceFeed, abi: priceFeedAbi, functionName: 'fetchPrice', chainId },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getEntireSystemColl',
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getEntireSystemDebt',
        chainId,
      },
      {
        address: mezo.borrowerOperations,
        abi: borrowerOperationsAbi,
        functionName: 'minNetDebt',
        chainId,
      },
      {
        address: mezo.borrowerOperations,
        abi: borrowerOperationsAbi,
        functionName: 'borrowingRate',
        chainId,
      },
      {
        address: stabilityPool ?? ZERO,
        abi: stabilityPoolAbi,
        functionName: 'getTotalMUSDDeposits',
        chainId,
      },
      {
        address: stabilityPool ?? ZERO,
        abi: stabilityPoolAbi,
        functionName: 'getCollateralBalance',
        chainId,
      },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'totalAssets', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'totalMusd', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'totalBtc', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'totalSupply', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'sharePrice', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'maxDeposit', chainId },
      { address: vault ?? ZERO, abi: earnVaultAbi, functionName: 'depositsPaused', chainId },
    ],
    query: {
      enabled: !!stabilityPool,
      refetchInterval: REFRESH_MS,
      placeholderData: keepPreviousData,
    },
  });

  const auto = useReadContracts({
    allowFailure: true,
    contracts: [
      ...(
        [
          'rewardRate',
          'periodFinish',
          'minHarvestBtc',
          'totalCompoundedMusd',
          'lastHarvestAt',
          'performanceFeeBps',
        ] as const
      ).map((functionName) => ({
        address: vault ?? ZERO,
        abi: autoEarnVaultAbi,
        functionName,
        chainId,
      })),
      {
        address: mezo.mezoRouter ?? ZERO,
        abi: mezoRouterAbi,
        functionName: 'getAmountsOut',
        args: [
          WAD,
          [
            {
              from: mezo.mezoToken,
              to: mezo.musd,
              stable: false,
              factory: mezo.poolFactory ?? ZERO,
            },
          ],
        ],
        chainId,
      },
    ],
    query: {
      enabled: mezo.autoEarn,
      refetchInterval: REFRESH_MS,
      placeholderData: keepPreviousData,
    },
  });

  const btcPrice = ok<bigint>(data?.[0]);
  const systemColl = ok<bigint>(data?.[1]);
  const systemDebt = ok<bigint>(data?.[2]);
  return {
    btcPrice,
    // Same formula as TroveManager.getTCR, computed here so all reads go out in one batch.
    tcr:
      btcPrice !== undefined && systemColl !== undefined && systemDebt
        ? (systemColl * btcPrice) / systemDebt
        : undefined,
    systemColl,
    systemDebt,
    minNetDebt: ok(data?.[3]),
    borrowingRate: ok(data?.[4]),
    stabilityPoolDeposits: ok(data?.[5]),
    stabilityPoolBtc: ok(data?.[6]),
    vault: vault
      ? {
          totalAssets: ok(data?.[7]),
          totalMusd: ok(data?.[8]),
          totalBtc: ok(data?.[9]),
          totalSupply: ok(data?.[10]),
          sharePrice: ok(data?.[11]),
          maxDeposit: ok(data?.[12]),
          depositsPaused: ok(data?.[13]),
        }
      : undefined,
    autoEarn: mezo.autoEarn ? autoEarnStats(auto.data, ok<bigint>(data?.[7])) : undefined,
    isLoading,
    isError,
    refetch: () => {
      refetch();
      if (mezo.autoEarn) auto.refetch();
    },
  };
}

type Results = readonly { status: 'success' | 'failure'; result?: unknown }[] | undefined;

function autoEarnStats(data: Results, totalAssets?: bigint): AutoEarnStats {
  const rewardRate = ok<bigint>(data?.[0]);
  const periodFinish = ok<bigint>(data?.[1]);
  const mezoPrice = ok<readonly bigint[]>(data?.[6])?.[1];
  const live = periodFinish !== undefined && periodFinish > BigInt(Math.floor(Date.now() / 1000));
  return {
    rewardRate,
    periodFinish,
    minHarvestBtc: ok(data?.[2]),
    totalCompoundedMusd: ok(data?.[3]),
    lastHarvestAt: ok(data?.[4]),
    performanceFeeBps: ok(data?.[5]),
    mezoPrice,
    rewardApr:
      live && rewardRate && mezoPrice !== undefined && totalAssets
        ? (rewardRate * YEAR * mezoPrice) / totalAssets
        : undefined,
  };
}

export enum TroveStatus {
  nonExistent = 0,
  active = 1,
  closedByOwner = 2,
  closedByLiquidation = 3,
  closedByRedemption = 4,
}

export type UserPosition = {
  btcBalance?: bigint;
  musdBalance?: bigint;
  mezoBalance?: bigint;
  musdAllowanceVault?: bigint;
  trove: {
    status?: TroveStatus;
    coll?: bigint;
    debt?: bigint;
    icr?: bigint;
    interestRate?: number;
  };
  vault: {
    shares?: bigint;
    value?: bigint;
    musdOut?: bigint;
    btcOut?: bigint;
    /** Auto Earn: MEZO ready to claim. */
    mezoEarned?: bigint;
  };
  /** Positions still in earlier Earn vaults (Simple Earn, the previous Auto Earn). */
  legacy: (LegacyVault & { shares: bigint; value?: bigint; mezoEarned?: bigint })[];
  isLoading: boolean;
  refetch: () => void;
};

/** The connected wallet's balances, trove and Simple Earn position. */
export function useUserPosition(btcPrice?: bigint): UserPosition {
  const { address } = useAccount();
  const user = address ?? ZERO;
  const vault = mezo.earnVault ?? ZERO;
  const btc = useBalance({
    address,
    chainId,
    query: { enabled: !!address, refetchInterval: REFRESH_MS },
  });

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: mezo.musd, abi: erc20Abi, functionName: 'balanceOf', args: [user], chainId },
      { address: mezo.mezoToken, abi: erc20Abi, functionName: 'balanceOf', args: [user], chainId },
      {
        address: mezo.musd,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [user, vault],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveStatus',
        args: [user],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveColl',
        args: [user],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveDebt',
        args: [user],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveInterestRate',
        args: [user],
        chainId,
      },
      { address: vault, abi: earnVaultAbi, functionName: 'balanceOf', args: [user], chainId },
      // Fails harmlessly on Simple Earn, which has no rewards.
      { address: vault, abi: autoEarnVaultAbi, functionName: 'earned', args: [user], chainId },
    ],
    query: { enabled: !!address, refetchInterval: REFRESH_MS, placeholderData: keepPreviousData },
  });
  const legacyQuery = {
    enabled: !!address && mezo.legacyVaults.length > 0,
    refetchInterval: REFRESH_MS,
  };
  const legacyBalances = useReadContracts({
    allowFailure: true,
    contracts: mezo.legacyVaults.map((v) => ({
      address: v.address,
      abi: earnVaultAbi,
      functionName: 'balanceOf' as const,
      args: [user] as const,
      chainId,
    })),
    query: legacyQuery,
  });
  const legacyRewards = useReadContracts({
    allowFailure: true,
    contracts: mezo.legacyVaults.map((v) => ({
      address: v.address,
      abi: autoEarnVaultAbi,
      functionName: 'earned' as const,
      args: [user] as const,
      chainId,
    })),
    query: legacyQuery,
  });
  const legacyShares = mezo.legacyVaults.map((_, i) => ok<bigint>(legacyBalances.data?.[i]) ?? 0n);
  const legacyEarned = mezo.legacyVaults.map((v, i) =>
    v.auto ? ok<bigint>(legacyRewards.data?.[i]) : undefined
  );
  const legacyValues = useReadContracts({
    allowFailure: true,
    contracts: mezo.legacyVaults.map((v, i) => ({
      address: v.address,
      abi: earnVaultAbi,
      functionName: 'convertToAssets' as const,
      args: [legacyShares[i]] as const,
      chainId,
    })),
    query: { enabled: legacyShares.some((x) => x > 0n), refetchInterval: REFRESH_MS },
  });

  const shares = mezo.earnVault ? ok<bigint>(data?.[7]) : undefined;
  const preview = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: vault,
        abi: earnVaultAbi,
        functionName: 'convertToAssets',
        args: [shares ?? 0n],
        chainId,
      },
      {
        address: vault,
        abi: earnVaultAbi,
        functionName: 'previewRedeem',
        args: [shares ?? 0n],
        chainId,
      },
    ],
    query: {
      enabled: !!address && !!mezo.earnVault && !!shares,
      refetchInterval: REFRESH_MS,
      placeholderData: keepPreviousData,
    },
  });
  const redeem = ok<readonly [bigint, bigint]>(preview.data?.[1]);

  const coll = ok<bigint>(data?.[4]);
  const debt = ok<bigint>(data?.[5]);
  return {
    btcBalance: btc.data?.value,
    musdBalance: ok(data?.[0]),
    mezoBalance: ok(data?.[1]),
    musdAllowanceVault: ok(data?.[2]),
    trove: {
      status: ok<number>(data?.[3]) as TroveStatus | undefined,
      coll,
      debt,
      icr:
        btcPrice !== undefined && coll !== undefined && debt ? (coll * btcPrice) / debt : undefined,
      interestRate: ok<number>(data?.[6]),
    },
    vault: {
      shares,
      value: shares === 0n ? 0n : ok(preview.data?.[0]),
      musdOut: shares === 0n ? 0n : redeem?.[0],
      btcOut: shares === 0n ? 0n : redeem?.[1],
      mezoEarned: mezo.autoEarn ? ok<bigint>(data?.[8]) : undefined,
    },
    legacy: mezo.legacyVaults
      .map((v, i) => ({
        ...v,
        shares: legacyShares[i],
        value: legacyShares[i] === 0n ? 0n : ok<bigint>(legacyValues.data?.[i]),
        mezoEarned: legacyEarned[i],
      }))
      .filter((v) => v.shares > 0n || (v.mezoEarned ?? 0n) > 0n),
    isLoading: isLoading || btc.isLoading,
    refetch: () => {
      btc.refetch();
      refetch();
      preview.refetch();
      legacyBalances.refetch();
      legacyRewards.refetch();
      legacyValues.refetch();
    },
  };
}

/** Hints for SortedTroves so trove operations do not walk the whole list on chain. */
export function useTroveHints() {
  const client = usePublicClient({ chainId });
  const { sortedTroves } = useMusdAddresses();
  return useCallback(
    async (coll: bigint, principal: bigint): Promise<[Address, Address]> => {
      if (!client || !sortedTroves || principal === 0n) return [ZERO, ZERO];
      const nicr = (coll * 10n ** 20n) / principal;
      try {
        const [upper, lower] = await client.readContract({
          address: sortedTroves,
          abi: sortedTrovesAbi,
          functionName: 'findInsertPosition',
          args: [nicr, ZERO, ZERO],
        });
        return [upper, lower];
      } catch {
        return [ZERO, ZERO];
      }
    },
    [client, sortedTroves]
  );
}

export type TxState = {
  status: 'idle' | 'wallet' | 'pending' | 'success' | 'error';
  hash?: Hash;
  error?: string;
};

export type WriteArgs = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
type WagmiWriteArgs = Parameters<ReturnType<typeof useWriteContract>['writeContractAsync']>[0];

/** Sends one transaction on Mezo testnet, switching networks first, and tracks it to a receipt. */
export function useMezoTx(onDone?: () => void) {
  const { chainId: walletChain, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId });
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: 'idle' });

  const send = useCallback(
    async (label: string, request: WriteArgs, detail?: string) => {
      setState({ status: 'wallet' });
      try {
        if (walletChain !== chainId) await switchChainAsync({ chainId });
        const hash = await writeContractAsync({ ...request, chainId } as unknown as WagmiWriteArgs);
        if (address)
          recordTx({
            hash,
            account: address,
            action: label,
            detail,
            status: 'pending',
            timestamp: Date.now(),
          });
        setState({ status: 'pending', hash });
        const receipt = await client!.waitForTransactionReceipt({ hash });
        const success = receipt.status === 'success';
        updateTx(hash, success ? 'confirmed' : 'failed');
        setState(
          success
            ? { status: 'success', hash }
            : { status: 'error', hash, error: 'Transaction reverted on chain.' }
        );
        // Every balance, loan, vault, stat and history query can change after a write.
        // Refresh all of them now, and once more in case the RPC node lags a block behind.
        queryClient.invalidateQueries();
        setTimeout(() => queryClient.invalidateQueries(), 4_000);
        onDone?.();
        return success;
      } catch (error) {
        setState({ status: 'error', error: readableError(error) });
        return false;
      }
    },
    [walletChain, switchChainAsync, writeContractAsync, client, queryClient, address, onDone]
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  return { state, send, reset, busy: state.status === 'wallet' || state.status === 'pending' };
}

// Plain-language versions of common MUSD protocol reverts.
const KNOWN_ERRORS: [RegExp, string][] = [
  [
    /troves with ICR < MCR/i,
    'A loan is waiting to be liquidated, which pauses Stability Pool withdrawals. Try again in a few minutes.',
  ],
  [
    /ICR < MCR|ICR < CCR|TCR < CCR/i,
    'This would leave your loan under the minimum collateral ratio.',
  ],
  [/net debt must be greater than minimum/i, 'Your loan would fall below the minimum debt.'],
  [/insufficient (MUSD )?balance|exceeds balance/i, 'Not enough MUSD in your wallet.'],
  [/insufficient funds/i, 'Not enough BTC for this amount plus gas.'],
];

export function readableError(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; cause?: { reason?: string } };
  const text = e?.cause?.reason || e?.shortMessage || e?.message || 'Something went wrong.';
  if (/user rejected|denied/i.test(text)) return 'You rejected the request in your wallet.';
  for (const [pattern, message] of KNOWN_ERRORS) if (pattern.test(text)) return message;
  return text.split('\n')[0];
}

/** Re-render on an interval, for relative timestamps. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * MUSD the wallet has put into Simple Earn for the shares it still holds, from vault
 * Deposit/Withdraw events. Withdrawals reduce it pro rata. Value minus this is earnings.
 */
export function useVaultDeposited(account?: Address) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ['vault-deposited', account],
    enabled: !!client && !!account && !!mezo.earnVault,
    refetchInterval: 60_000,
    queryFn: async () => {
      const latest = await client!.getBlockNumber();
      type Ev = { block: bigint; logIndex: number; shares: bigint; assets: bigint };
      const [deposits, withdrawals] = await Promise.all([
        cachedChunked<Ev>(
          `vault-deposits.${mezo.earnVault}.${account}`,
          mezo.earnVaultDeployBlock,
          latest,
          async (fromBlock, toBlock) =>
            (
              await client!.getLogs({
                address: mezo.earnVault,
                event: getAbiItem({ abi: earnVaultAbi, name: 'Deposit' }),
                args: { receiver: account },
                fromBlock,
                toBlock,
              })
            ).map((l) => ({
              block: l.blockNumber,
              logIndex: l.logIndex,
              shares: l.args.shares ?? 0n,
              assets: l.args.assets ?? 0n,
            }))
        ),
        cachedChunked<Ev>(
          `vault-withdrawals.${mezo.earnVault}.${account}`,
          mezo.earnVaultDeployBlock,
          latest,
          async (fromBlock, toBlock) =>
            (
              await client!.getLogs({
                address: mezo.earnVault,
                event: getAbiItem({ abi: earnVaultAbi, name: 'Withdraw' }),
                args: { owner: account },
                fromBlock,
                toBlock,
              })
            ).map((l) => ({
              block: l.blockNumber,
              logIndex: l.logIndex,
              shares: -(l.args.shares ?? 0n),
              assets: 0n,
            }))
        ),
      ]);
      const events = [...deposits, ...withdrawals].sort((a, b) =>
        a.block === b.block ? a.logIndex - b.logIndex : Number(a.block - b.block)
      );
      let shares = 0n;
      let cost = 0n;
      for (const e of events) {
        if (e.shares >= 0n) {
          shares += e.shares;
          cost += e.assets;
        } else {
          const burned = -e.shares;
          cost = shares > 0n ? cost - (cost * burned) / shares : 0n;
          shares = shares > burned ? shares - burned : 0n;
        }
      }
      return cost;
    },
  });
}
