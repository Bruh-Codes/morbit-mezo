'use client';

import { Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getAbiItem } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';

import { borrowerOperationsAbi, earnVaultAbi } from './abis';
import { Address } from './Address';
import { mezo, MEZO_TESTNET_ID } from './config';
import { fmtAmount, timeAgo } from './format';
import { useNow } from './hooks';
import { useTxHistory } from './txHistory';
import { ConnectPrompt, PageContainer, PageTop, Panel } from './ui';

type ChainEvent = {
  hash: string;
  product: 'Borrow' | 'Earn';
  title: string;
  detail: string;
  block: bigint;
};

// Mezo's RPC rejects log queries wider than 10,000 blocks, so history is read in chunks.
const CHUNK = 10_000n;
const TROVE_LOOKBACK = 300_000n;

/** Split [from, to] into RPC-sized ranges, newest first. */
function ranges(from: bigint, to: bigint) {
  const out: [bigint, bigint][] = [];
  for (let end = to; end >= from; end -= CHUNK) {
    const start = end - CHUNK + 1n > from ? end - CHUNK + 1n : from;
    out.push([start, end]);
    if (start === from) break;
  }
  return out;
}

/** Run chunked queries a few at a time and flatten the results. */
async function chunked<T>(
  from: bigint,
  to: bigint,
  query: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>
): Promise<T[]> {
  const parts = ranges(from, to);
  const results: T[] = [];
  for (let i = 0; i < parts.length; i += 6) {
    const batch = await Promise.all(parts.slice(i, i + 6).map(([a, b]) => query(a, b)));
    batch.forEach((r) => results.push(...r));
  }
  return results;
}
const TROVE_OPS = ['Opened trove', 'Closed trove', 'Adjusted trove', 'Refinanced trove'];

function useChainEvents(account?: `0x${string}`) {
  const client = usePublicClient({ chainId: MEZO_TESTNET_ID });
  return useQuery({
    queryKey: ['account-events', account],
    enabled: !!client && !!account,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ChainEvent[]> => {
      const latest = await client!.getBlockNumber();

      const vaultEvents = async (): Promise<ChainEvent[]> => {
        if (!mezo.earnVault) return [];
        const from = mezo.earnVaultDeployBlock;
        const [deposits, withdrawals] = await Promise.all([
          chunked(from, latest, (fromBlock, toBlock) =>
            client!.getLogs({
              address: mezo.earnVault,
              event: getAbiItem({ abi: earnVaultAbi, name: 'Deposit' }),
              args: { receiver: account },
              fromBlock,
              toBlock,
            })
          ),
          chunked(from, latest, (fromBlock, toBlock) =>
            client!.getLogs({
              address: mezo.earnVault,
              event: getAbiItem({ abi: earnVaultAbi, name: 'Withdraw' }),
              args: { owner: account },
              fromBlock,
              toBlock,
            })
          ),
        ]);
        return [
          ...deposits.map((log) => ({
            hash: log.transactionHash,
            product: 'Earn' as const,
            title: 'Deposited MUSD',
            detail: `${fmtAmount(log.args.assets, 2)} MUSD → ${fmtAmount(
              log.args.shares,
              4
            )} mvMUSD`,
            block: log.blockNumber,
          })),
          ...withdrawals.map((log) => ({
            hash: log.transactionHash,
            product: 'Earn' as const,
            title: 'Withdrew',
            detail: `${fmtAmount(log.args.musdOut, 2)} MUSD + ${fmtAmount(log.args.btcOut, 6)} BTC`,
            block: log.blockNumber,
          })),
        ];
      };

      const troveEvents = async (): Promise<ChainEvent[]> => {
        const from = latest > TROVE_LOOKBACK ? latest - TROVE_LOOKBACK : 0n;
        const logs = await chunked(from, latest, (fromBlock, toBlock) =>
          client!.getLogs({
            address: mezo.borrowerOperations,
            event: getAbiItem({ abi: borrowerOperationsAbi, name: 'TroveUpdated' }),
            args: { _borrower: account },
            fromBlock,
            toBlock,
          })
        );
        return logs.map((log) => {
          const debt = (log.args._principal ?? 0n) + (log.args._interest ?? 0n);
          return {
            hash: log.transactionHash,
            product: 'Borrow' as const,
            title: TROVE_OPS[log.args._operation ?? 2] ?? 'Updated trove',
            detail:
              log.args._operation === 1
                ? 'Debt repaid, BTC returned'
                : `${fmtAmount(log.args._coll, 4)} BTC · ${fmtAmount(debt, 2)} MUSD debt`,
            block: log.blockNumber,
          };
        });
      };

      // Trove history is best effort; vault history still shows if it fails.
      const [vault, trove] = await Promise.all([vaultEvents(), troveEvents().catch(() => [])]);
      return [...vault, ...trove].sort((a, b) => Number(b.block - a.block));
    },
  });
}

export function HistoryPage() {
  const { address } = useAccount();
  const local = useTxHistory(address);
  const events = useChainEvents(address);
  const now = useNow();

  // Transactions sent from this browser that are not indexed yet (pending or just confirmed).
  const onChain = new Set(events.data?.map((e) => e.hash.toLowerCase()));
  const recent = local.filter((tx) => !onChain.has(tx.hash.toLowerCase()));

  return (
    <>
      <PageTop title="Activity" />
      <PageContainer>
        {!address ? (
          <ConnectPrompt message="Connect a wallet to see your activity." />
        ) : (
          <Panel>
            {events.isLoading ? (
              <Stack spacing={1.5}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={48} />
                ))}
              </Stack>
            ) : !recent.length && !events.data?.length ? (
              <Typography color="text.secondary">No activity yet.</Typography>
            ) : (
              <>
                {recent.map((tx) => (
                  <Entry
                    key={tx.hash}
                    hash={tx.hash}
                    title={tx.action}
                    detail={tx.detail}
                    meta={timeAgo(tx.timestamp, now)}
                    status={tx.status}
                  />
                ))}
                {events.data?.map((e) => (
                  <Entry
                    key={`${e.hash}-${e.title}`}
                    hash={e.hash}
                    product={e.product}
                    title={e.title}
                    detail={e.detail}
                    meta={`Block ${e.block}`}
                  />
                ))}
              </>
            )}
            {events.isError && (
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                Couldn&apos;t load on-chain history. Try again shortly.
              </Typography>
            )}
          </Panel>
        )}
      </PageContainer>
    </>
  );
}

function Entry({
  hash,
  product,
  title,
  detail,
  meta,
  status,
}: {
  hash: string;
  product?: 'Borrow' | 'Earn';
  title: string;
  detail?: string;
  meta: string;
  status?: 'pending' | 'confirmed' | 'failed';
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      gap={1}
      sx={{
        py: 1.75,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {product && <Chip size="small" label={product} variant="outlined" />}
          <Typography fontWeight={700}>{title}</Typography>
          {status && status !== 'confirmed' && (
            <Chip size="small" label={status} color={status === 'failed' ? 'error' : 'default'} />
          )}
        </Stack>
        {detail && <Typography color="text.secondary">{detail}</Typography>}
      </Box>
      <Stack alignItems={{ sm: 'flex-end' }} sx={{ flexShrink: 0 }}>
        <Address value={hash} kind="tx" />
        <Typography variant="description" color="text.secondary">
          {meta}
        </Typography>
      </Stack>
    </Stack>
  );
}
