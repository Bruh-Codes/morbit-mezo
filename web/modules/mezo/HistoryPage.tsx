'use client';

import { OpenInNew } from '@mui/icons-material';
import { Box, Chip, Link as MuiLink, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getAbiItem } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';

import { earnVaultAbi } from './abis';
import { explorerTx, mezo, MEZO_TESTNET_ID } from './config';
import { fmtAmount, timeAgo } from './format';
import { useNow } from './hooks';
import { useTxHistory } from './txHistory';
import { ConnectPrompt, PageContainer, PageTop, Panel } from './ui';

type VaultEvent = { hash: string; kind: 'Deposit' | 'Withdraw'; text: string; block: bigint };

function useVaultEvents(account?: `0x${string}`) {
  const client = usePublicClient({ chainId: MEZO_TESTNET_ID });
  return useQuery({
    queryKey: ['vault-events', account],
    enabled: !!client && !!account && !!mezo.earnVault,
    refetchInterval: 30_000,
    queryFn: async (): Promise<VaultEvent[]> => {
      const fromBlock = mezo.earnVaultDeployBlock;
      const [deposits, withdrawals] = await Promise.all([
        client!.getLogs({
          address: mezo.earnVault,
          event: getAbiItem({ abi: earnVaultAbi, name: 'Deposit' }),
          args: { receiver: account },
          fromBlock,
        }),
        client!.getLogs({
          address: mezo.earnVault,
          event: getAbiItem({ abi: earnVaultAbi, name: 'Withdraw' }),
          args: { owner: account },
          fromBlock,
        }),
      ]);
      const events: VaultEvent[] = [
        ...deposits.map((log) => ({
          hash: log.transactionHash,
          kind: 'Deposit' as const,
          text: `${fmtAmount(log.args.assets, 2)} MUSD in, ${fmtAmount(
            log.args.shares,
            4
          )} mvMUSD minted`,
          block: log.blockNumber,
        })),
        ...withdrawals.map((log) => ({
          hash: log.transactionHash,
          kind: 'Withdraw' as const,
          text: `${fmtAmount(log.args.shares, 4)} mvMUSD burned, ${fmtAmount(
            log.args.musdOut,
            2
          )} MUSD + ${fmtAmount(log.args.btcOut, 8)} BTC out`,
          block: log.blockNumber,
        })),
      ];
      return events.sort((a, b) => Number(b.block - a.block));
    },
  });
}

export function HistoryPage() {
  const { address } = useAccount();
  const local = useTxHistory(address);
  const events = useVaultEvents(address);
  const now = useNow();

  return (
    <>
      <PageTop
        eyebrow="TRANSACTIONS"
        title="Activity"
        description="Every entry is a real Mezo testnet transaction with a link to the block explorer."
      />
      <PageContainer>
        {!address ? (
          <ConnectPrompt message="Connect a wallet to see your Mezo activity." />
        ) : (
          <Stack spacing={3}>
            <Panel title="Simple Earn activity (from chain)">
              {!mezo.earnVault ? (
                <Typography color="text.secondary">
                  The Simple Earn vault is not deployed yet.
                </Typography>
              ) : events.isLoading ? (
                <Typography color="text.secondary">Reading vault events…</Typography>
              ) : events.isError ? (
                <Typography color="text.secondary">
                  The Mezo RPC did not return vault events. Try again shortly.
                </Typography>
              ) : !events.data?.length ? (
                <Typography color="text.secondary">
                  No vault deposits or withdrawals yet.
                </Typography>
              ) : (
                events.data.map((e) => (
                  <Entry
                    key={`${e.hash}-${e.kind}`}
                    hash={e.hash}
                    title={e.kind === 'Deposit' ? 'Deposit' : 'Withdrawal'}
                    detail={e.text}
                    meta={`Block ${e.block}`}
                  />
                ))
              )}
            </Panel>
            <Panel title="Sent from this browser">
              {!local.length ? (
                <Typography color="text.secondary">
                  Transactions you send from Morbit show up here, including trove actions.
                </Typography>
              ) : (
                local.map((tx) => (
                  <Entry
                    key={tx.hash}
                    hash={tx.hash}
                    title={tx.action}
                    detail={tx.detail}
                    meta={timeAgo(tx.timestamp, now)}
                    status={tx.status}
                  />
                ))
              )}
            </Panel>
          </Stack>
        )}
      </PageContainer>
    </>
  );
}

function Entry({
  hash,
  title,
  detail,
  meta,
  status,
}: {
  hash: string;
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
          <Typography fontWeight={700}>{title}</Typography>
          {status && status !== 'confirmed' && (
            <Chip size="small" label={status} color={status === 'failed' ? 'error' : 'default'} />
          )}
        </Stack>
        {detail && <Typography color="text.secondary">{detail}</Typography>}
      </Box>
      <Stack alignItems={{ sm: 'flex-end' }} sx={{ flexShrink: 0 }}>
        <MuiLink
          href={explorerTx(hash)}
          target="_blank"
          rel="noopener"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            fontFamily: 'monospace',
            fontSize: 13,
          }}
        >
          {hash.slice(0, 10)}…{hash.slice(-6)} <OpenInNew sx={{ fontSize: 14 }} />
        </MuiLink>
        <Typography variant="description" color="text.secondary">
          {meta}
        </Typography>
      </Stack>
    </Stack>
  );
}
