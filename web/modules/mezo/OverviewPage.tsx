'use client';

import { ArrowForward } from '@mui/icons-material';
import { Box, Button, Grid, Link as MuiLink, Stack, Typography } from '@mui/material';
import Link from 'next/link';

import { CCR, explorerAddress, mezo } from './config';
import { btcValue, fmtAmount, fmtToken, fmtRatio, fmtUsd } from './format';
import { useMusdSystem } from './hooks';
import { AssetIcon, LiveChip, Metric, MetricRow, PageContainer, PageTop, Panel, Row } from './ui';

export function OverviewPage() {
  const system = useMusdSystem();
  const vault = system.vault;

  return (
    <>
      <PageTop
        eyebrow="MORBIT ON MEZO"
        title="Borrow MUSD against BTC, then put it to work"
        description="Every number on this page is read live from the MUSD contracts on Mezo testnet."
        actions={<LiveChip online={system.btcPrice !== undefined} />}
      >
        <MetricRow>
          <Metric label="BTC price" value={fmtUsd(system.btcPrice)} hint="MUSD PriceFeed" />
          <Metric
            label="MUSD borrowed"
            value={`${fmtAmount(system.systemDebt, 0)}`}
            hint="All troves"
          />
          <Metric
            label="BTC collateral"
            value={fmtToken('BTC', system.systemColl, 2)}
            hint={fmtUsd(btcValue(system.systemColl, system.btcPrice), true)}
          />
          <Metric
            label="System collateral ratio"
            value={fmtRatio(system.tcr)}
            hint={
              system.tcr === undefined
                ? undefined
                : system.tcr < CCR
                ? 'Recovery mode'
                : 'Normal mode'
            }
          />
        </MetricRow>
      </PageTop>
      <PageContainer>
        {system.isError && system.btcPrice === undefined && (
          <Panel>
            <Typography color="error.main">
              Could not reach Mezo testnet. Check your connection and refresh.
            </Typography>
          </Panel>
        )}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <ProductCard
              icon="MUSD"
              title="Borrow MUSD"
              body="Lock BTC in a Mezo trove and mint MUSD at a fixed rate. Morbit shows your collateral ratio and liquidation price before you sign."
              href="/borrow/"
              cta="Open or manage a trove"
            >
              <Row label="Minimum debt" value={fmtToken('MUSD', system.minNetDebt, 0)} />
              <Row label="Borrowing fee" value={fmtRatio(system.borrowingRate, 2)} />
              <Row label="Liquidation threshold" value="110%" />
            </ProductCard>
          </Grid>
          <Grid item xs={12} md={6}>
            <ProductCard
              icon="mvMUSD"
              title="Simple Earn"
              body="Deposit MUSD into one Morbit vault position. The vault supplies it to the MUSD Stability Pool and passes liquidation gains back to you."
              href="/earn/"
              cta="Deposit MUSD"
            >
              <Row label="Vault value" value={vault ? fmtUsd(vault.totalAssets) : 'Not deployed'} />
              <Row
                label="mvMUSD price"
                value={
                  vault?.sharePrice !== undefined ? fmtToken('MUSD', vault.sharePrice, 4) : '—'
                }
              />
              <Row
                label="Stability Pool deposits"
                value={fmtToken('MUSD', system.stabilityPoolDeposits, 0)}
                hint={`${fmtAmount(system.stabilityPoolBtc, 6)} BTC gains held`}
              />
            </ProductCard>
          </Grid>
          <Grid item xs={12}>
            <Panel title="Contracts">
              <Grid container columnSpacing={4}>
                {[
                  ['MUSD token', mezo.musd],
                  ['BorrowerOperations', mezo.borrowerOperations],
                  ['TroveManager', mezo.troveManager],
                  ['PriceFeed', mezo.priceFeed],
                  ['Morbit Simple Earn vault', mezo.earnVault],
                ].map(([label, address]) => (
                  <Grid item xs={12} md={6} key={label}>
                    <Row
                      label={label}
                      value={
                        address ? (
                          <MuiLink
                            href={explorerAddress(address)}
                            target="_blank"
                            rel="noopener"
                            sx={{ fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}
                          >
                            {address}
                          </MuiLink>
                        ) : (
                          'Not deployed'
                        )
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            </Panel>
          </Grid>
        </Grid>
      </PageContainer>
    </>
  );
}

function ProductCard({
  icon,
  title,
  body,
  href,
  cta,
  children,
}: {
  icon: 'MUSD' | 'mvMUSD';
  title: string;
  body: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <AssetIcon symbol={icon} size={36} />
          <Typography variant="h3">{title}</Typography>
        </Stack>
        <Typography color="text.secondary">{body}</Typography>
        <Box>{children}</Box>
        <Button
          component={Link}
          href={href}
          variant="contained"
          endIcon={<ArrowForward />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {cta}
        </Button>
      </Stack>
    </Panel>
  );
}
