'use client';

import { Alert, Button, Grid, Link as MuiLink, Stack } from '@mui/material';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import { MUSD_GAS_COMPENSATION, mezo } from './config';
import { btcValue, fmtAmount, fmtToken, fmtRatio, fmtUsd, liquidationPrice } from './format';
import { TroveStatus, useMusdSystem, useUserPosition } from './hooks';
import {
  AssetIcon,
  ConnectPrompt,
  LiveChip,
  Metric,
  MetricRow,
  PageContainer,
  PageTop,
  Panel,
  Row,
} from './ui';

export function DashboardPage() {
  const { address } = useAccount();
  const system = useMusdSystem();
  const position = useUserPosition(system.btcPrice);
  const { trove, vault } = position;
  const active = trove.status === TroveStatus.active;

  const troveColl = active ? trove.coll ?? 0n : 0n;
  const troveDebt = active ? trove.debt ?? 0n : 0n;
  const walletValue =
    position.btcBalance !== undefined &&
    position.musdBalance !== undefined &&
    system.btcPrice !== undefined
      ? (btcValue(position.btcBalance, system.btcPrice) ?? 0n) + position.musdBalance
      : undefined;
  const netWorth =
    walletValue !== undefined && system.btcPrice !== undefined
      ? walletValue + (btcValue(troveColl, system.btcPrice) ?? 0n) - troveDebt + (vault.value ?? 0n)
      : undefined;

  return (
    <>
      <PageTop
        eyebrow="DASHBOARD"
        title="Your Mezo positions"
        description="Balances, your trove and your Simple Earn position, read live from Mezo testnet."
        actions={<LiveChip online={system.btcPrice !== undefined} />}
      >
        {address && (
          <MetricRow>
            <Metric
              label="Net value"
              value={fmtUsd(netWorth)}
              hint="Wallet + trove equity + Simple Earn"
            />
            <Metric label="Trove collateral ratio" value={active ? fmtRatio(trove.icr) : '—'} />
            <Metric label="Simple Earn" value={fmtUsd(vault.value)} />
          </MetricRow>
        )}
      </PageTop>
      <PageContainer>
        {!address ? (
          <ConnectPrompt message="Connect a wallet to see your balances, trove and Simple Earn position." />
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Panel title="Wallet">
                <Row
                  label={<Label symbol="BTC" />}
                  value={fmtAmount(position.btcBalance, 6)}
                  hint={fmtUsd(btcValue(position.btcBalance, system.btcPrice))}
                />
                <Row label={<Label symbol="MUSD" />} value={fmtAmount(position.musdBalance, 2)} />
                <Row label={<Label symbol="MEZO" />} value={fmtAmount(position.mezoBalance, 2)} />
                {position.btcBalance === 0n && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Get testnet BTC from the{' '}
                    <MuiLink href={mezo.faucetUrl} target="_blank" rel="noopener">
                      Mezo faucet
                    </MuiLink>
                    .
                  </Alert>
                )}
              </Panel>
            </Grid>
            <Grid item xs={12} md={4}>
              <Panel
                title="Trove"
                action={
                  <Button component={Link} href="/borrow/" variant="surface" size="small">
                    {active ? 'Manage' : 'Open'}
                  </Button>
                }
              >
                {active ? (
                  <>
                    <Row
                      label="Collateral"
                      value={fmtToken('BTC', troveColl, 6)}
                      hint={fmtUsd(btcValue(troveColl, system.btcPrice))}
                    />
                    <Row
                      label="Debt"
                      value={fmtToken('MUSD', troveDebt, 2)}
                      hint={`${fmtAmount(
                        troveDebt > MUSD_GAS_COMPENSATION ? troveDebt - MUSD_GAS_COMPENSATION : 0n,
                        2
                      )} to repay on close`}
                    />
                    <Row label="Collateral ratio" value={fmtRatio(trove.icr)} />
                    <Row
                      label="Liquidation price"
                      value={fmtUsd(liquidationPrice(troveColl, troveDebt))}
                    />
                  </>
                ) : (
                  <Row
                    label="Status"
                    value={
                      trove.status === TroveStatus.closedByLiquidation
                        ? 'Liquidated'
                        : 'No open trove'
                    }
                  />
                )}
              </Panel>
            </Grid>
            <Grid item xs={12} md={4}>
              <Panel
                title="Simple Earn"
                action={
                  <Button component={Link} href="/earn/" variant="surface" size="small">
                    {vault.shares ? 'Manage' : 'Deposit'}
                  </Button>
                }
              >
                <Row label="Shares" value={fmtToken('mvMUSD', vault.shares, 4)} />
                <Row label="Value" value={fmtUsd(vault.value)} />
                <Row
                  label="Withdrawable now"
                  value={fmtToken('MUSD', vault.musdOut, 2)}
                  hint={`+ ${fmtAmount(vault.btcOut, 8)} BTC`}
                />
                {!mezo.earnVault && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    The Simple Earn vault is not deployed yet.
                  </Alert>
                )}
              </Panel>
            </Grid>
          </Grid>
        )}
      </PageContainer>
    </>
  );
}

function Label({ symbol }: { symbol: 'BTC' | 'MUSD' | 'MEZO' }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" component="span">
      <AssetIcon symbol={symbol} size={20} />
      <span>{symbol}</span>
    </Stack>
  );
}
