'use client';

import { ArrowForward } from '@mui/icons-material';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';
import Link from 'next/link';

import { CCR } from './config';
import { btcValue, fmtAmount, fmtRatio, fmtToken, fmtUsd } from './format';
import { useMusdSystem, useUserPosition } from './hooks';
import { INFO } from './info';
import { NextStep } from './NextStep';
import { AssetIcon, Metric, MetricRow, PageContainer, PageTop, Panel, Row } from './ui';

export function OverviewPage() {
  const system = useMusdSystem();
  const position = useUserPosition(system.btcPrice);
  const vault = system.vault;

  return (
    <>
      <PageTop title="Borrow MUSD against BTC. Earn with it.">
        <MetricRow>
          <Metric
            loading={system.isLoading}
            label="BTC price"
            info={INFO['BTC price']}
            value={fmtUsd(system.btcPrice)}
          />
          <Metric
            loading={system.isLoading}
            label="MUSD borrowed"
            info={INFO['MUSD borrowed']}
            value={fmtAmount(system.systemDebt, 0)}
          />
          <Metric
            loading={system.isLoading}
            label="BTC collateral"
            info={INFO['BTC collateral']}
            value={fmtToken('BTC', system.systemColl, 2)}
            hint={fmtUsd(btcValue(system.systemColl, system.btcPrice), true)}
          />
          <Metric
            loading={system.isLoading}
            label="System ratio"
            info={INFO['System ratio']}
            value={fmtRatio(system.tcr)}
            hint={
              system.tcr === undefined ? undefined : system.tcr < CCR ? 'Recovery mode' : undefined
            }
          />
        </MetricRow>
      </PageTop>
      <PageContainer>
        {system.isError && system.btcPrice === undefined && (
          <Typography color="error.main" sx={{ mb: 3 }}>
            Can&apos;t reach Mezo testnet. Refresh to retry.
          </Typography>
        )}
        <NextStep position={position} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <ProductCard
              icon="MUSD"
              title="Borrow"
              body="Lock BTC, mint MUSD."
              href="/borrow/"
              cta="Borrow MUSD"
            >
              <Row
                label="Minimum debt"
                info={INFO['Minimum debt']}
                value={fmtToken('MUSD', system.minNetDebt, 0)}
              />
              <Row
                label="Borrowing fee"
                info={INFO['Borrowing fee']}
                value={fmtRatio(system.borrowingRate, 2)}
              />
              <Row label="Liquidation at" info={INFO['Liquidation at']} value="110%" />
            </ProductCard>
          </Grid>
          <Grid item xs={12} md={6}>
            <ProductCard
              icon="mvMUSD"
              title="Simple Earn"
              body="Earn BTC from liquidations with your MUSD."
              href="/earn/"
              cta="Deposit MUSD"
            >
              <Row
                label="Vault value"
                info={INFO['Vault value']}
                value={vault ? fmtUsd(vault.totalAssets) : '—'}
              />
              <Row
                label="mvMUSD price"
                info={INFO['mvMUSD price']}
                value={
                  vault?.sharePrice !== undefined ? fmtToken('MUSD', vault.sharePrice, 4) : '—'
                }
              />
              <Row
                label="Stability Pool"
                info={INFO['Stability Pool']}
                value={fmtToken('MUSD', system.stabilityPoolDeposits, 0)}
              />
            </ProductCard>
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
          <Box>
            <Typography variant="h3">{title}</Typography>
            <Typography color="text.secondary">{body}</Typography>
          </Box>
        </Stack>
        <Box sx={{ flexGrow: 1 }}>{children}</Box>
        <Button
          component={Link}
          href={href}
          variant="surface"
          endIcon={<ArrowForward />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {cta}
        </Button>
      </Stack>
    </Panel>
  );
}
