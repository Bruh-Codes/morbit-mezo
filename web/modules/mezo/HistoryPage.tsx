'use client';

import { Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getAbiItem } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';

import { borrowerOperationsAbi, earnVaultAbi } from './abis';
import { Address } from './Address';
import { mezo, MEZO_TESTNET_ID } from './config';
import { fmtAmount, timeAgo } from './format';
import { chunked } from './logs';
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

// Recent trove history only; older trove actions sent from Morbit are also kept locally.
const TROVE_LOOKBACK = 60_000n;

const TROVE_OPS = ['Opened loan', 'Closed loan', 'Updated loan', 'Refinanced loan'];

// Vault and trove history load separately so the fast one shows first.
function useChainEvents(kind: 'vault' | 'trove', account?: `0x${string}`) {
  const client = usePublicClient({ chainId: MEZO_TESTNET_ID });
  return useQuery({
    queryKey: ['account-events', kind, account],
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
            title: 'Deposited',
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
            title: TROVE_OPS[log.args._operation ?? 2] ?? 'Updated loan',
            detail:
              log.args._operation === 1
                ? 'Debt repaid, BTC returned'
                : `${fmtAmount(log.args._coll, 4)} BTC · ${fmtAmount(debt, 2)} MUSD debt`,
            block: log.blockNumber,
          };
        });
      };

      return kind === 'vault' ? vaultEvents() : troveEvents();
    },
  });
}

export function HistoryPage() {
  const { address } = useAccount();
  const local = useTxHistory(address);
  const vaultEvents = useChainEvents('vault', address);
  const troveEvents = useChainEvents('trove', address);
  const events = {
    isLoading: vaultEvents.isLoading && troveEvents.isLoading,
    isError: vaultEvents.isError || troveEvents.isError,
    data: [...(vaultEvents.data ?? []), ...(troveEvents.data ?? [])].sort((a, b) =>
      Number(b.block - a.block)
    ),
  };
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
