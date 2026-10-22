'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  borrowerOperationsAbi,
  earnVaultAbi,
  erc20Abi,
  priceFeedAbi,
  sortedTrovesAbi,
  stabilityPoolAbi,
  troveManagerAbi,
} from './abis';
import { mezo, MEZO_TESTNET_ID, ZERO } from './config';
import { chunked } from './logs';
import { recordTx, updateTx } from './txHistory';

const chainId = MEZO_TESTNET_ID;
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
    isLoading,
    isError,
    refetch,
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
  vault: { shares?: bigint; value?: bigint; musdOut?: bigint; btcOut?: bigint };
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
    ],
    query: { enabled: !!address, refetchInterval: REFRESH_MS, placeholderData: keepPreviousData },
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
    },
    isLoading: isLoading || btc.isLoading,
    refetch: () => {
      btc.refetch();
      refetch();
      preview.refetch();
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
        onDone?.();
        return success;
      } catch (error) {
        setState({ status: 'error', error: readableError(error) });
        return false;
      }
    },
    [walletChain, switchChainAsync, writeContractAsync, client, address, onDone]
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  return { state, send, reset, busy: state.status === 'wallet' || state.status === 'pending' };
}

export function readableError(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; cause?: { reason?: string } };
  const text = e?.cause?.reason || e?.shortMessage || e?.message || 'Something went wrong.';
  if (/user rejected|denied/i.test(text)) return 'You rejected the request in your wallet.';
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
      const [deposits, withdrawals] = await Promise.all([
        chunked(mezo.earnVaultDeployBlock, latest, (fromBlock, toBlock) =>
          client!.getLogs({
            address: mezo.earnVault,
            event: getAbiItem({ abi: earnVaultAbi, name: 'Deposit' }),
            args: { receiver: account },
            fromBlock,
            toBlock,
          })
        ),
        chunked(mezo.earnVaultDeployBlock, latest, (fromBlock, toBlock) =>
          client!.getLogs({
            address: mezo.earnVault,
            event: getAbiItem({ abi: earnVaultAbi, name: 'Withdraw' }),
            args: { owner: account },
            fromBlock,
            toBlock,
          })
        ),
      ]);
      const events = [
        ...deposits.map((l) => ({
          order: [l.blockNumber, l.logIndex] as const,
          shares: l.args.shares ?? 0n,
          assets: l.args.assets ?? 0n,
        })),
        ...withdrawals.map((l) => ({
          order: [l.blockNumber, l.logIndex] as const,
          shares: -(l.args.shares ?? 0n),
          assets: 0n,
        })),
      ].sort((a, b) =>
        a.order[0] === b.order[0] ? a.order[1] - b.order[1] : Number(a.order[0] - b.order[0])
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
