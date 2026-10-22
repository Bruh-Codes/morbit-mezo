'use client';

import {
  Box,
  Button,
  Grid,
  Link as MuiLink,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import { CCR, MCR, mezo } from './config';
import { btcValue, fmtAmount, fmtToken, fmtRatio, fmtUsd, liquidationPrice } from './format';
import { TroveStatus, useMusdSystem, useUserPosition } from './hooks';
import { INFO } from './info';
import { NextStep } from './NextStep';
import {
  AssetIcon,
  ConnectPrompt,
  InfoTip,
  Metric,
  MetricRow,
  PageContainer,
  PageTop,
  Panel,
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
      <PageTop title="Dashboard">
        {address && (
          <MetricRow>
            <Metric
              loading={position.isLoading}
              label="Net value"
              info={INFO['Net value']}
              value={fmtUsd(netWorth)}
            />
            <Metric
              loading={position.isLoading}
              label="Collateral ratio"
              info={INFO['Collateral ratio']}
              value={active ? fmtRatio(trove.icr) : '—'}
            />
            <Metric
              loading={position.isLoading}
              label="Simple Earn"
              info={INFO['Simple Earn']}
              value={fmtUsd(vault.value)}
            />
          </MetricRow>
        )}
      </PageTop>
      <PageContainer>
        {!address ? (
          <ConnectPrompt message="Connect a wallet to see your positions." />
        ) : (
          <Stack spacing={3}>
            <NextStep position={position} />
            <Panel title="Your positions">
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 720, '& td, & th': { px: 1.5, py: 1.5 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Position</TableCell>
                      <TableCell align="right">Supplied</TableCell>
                      <TableCell align="right">Debt</TableCell>
                      <TableCell align="right">Value</TableCell>
                      <TableCell align="right">
                        Health
                        <InfoTip text={INFO['Collateral ratio']} />
                      </TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {position.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Skeleton height={40} />
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {active && (
                          <TableRow>
                            <TableCell>
                              <Name icon="MUSD" title="MUSD loan" sub="Mezo trove" />
                            </TableCell>
                            <TableCell align="right">
                              <Cell
                                main={fmtToken('BTC', troveColl, 4)}
                                sub={fmtUsd(btcValue(troveColl, system.btcPrice))}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Cell main={fmtToken('MUSD', troveDebt, 2)} />
                            </TableCell>
                            <TableCell align="right">
                              <Cell
                                main={fmtUsd(
                                  system.btcPrice !== undefined
                                    ? (btcValue(troveColl, system.btcPrice) ?? 0n) - troveDebt
                                    : undefined
                                )}
                                sub="Equity"
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Cell
                                main={
                                  <Box component="span" sx={{ color: ratioColor(trove.icr) }}>
                                    {fmtRatio(trove.icr)}
                                  </Box>
                                }
                                sub={`Liq. ${fmtUsd(liquidationPrice(troveColl, troveDebt))}`}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Actions
                                items={[
                                  ['Repay', '/borrow/?action=repay'],
                                  ['Add BTC', '/borrow/?action=addColl'],
                                  ['Borrow more', '/borrow/?action=borrow'],
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                        {!!vault.shares && (
                          <TableRow>
                            <TableCell>
                              <Name icon="mvMUSD" title="Simple Earn" sub="MUSD Stability Pool" />
                            </TableCell>
                            <TableCell align="right">
                              <Cell main={fmtToken('mvMUSD', vault.shares, 2)} />
                            </TableCell>
                            <TableCell align="right">
                              <Cell main="—" />
                            </TableCell>
                            <TableCell align="right">
                              <Cell
                                main={fmtUsd(vault.value)}
                                sub={
                                  vault.btcOut
                                    ? `${fmtAmount(vault.musdOut, 2)} MUSD + ${fmtAmount(
                                        vault.btcOut,
                                        6
                                      )} BTC`
                                    : `${fmtAmount(vault.musdOut, 2)} MUSD`
                                }
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Cell main="—" />
                            </TableCell>
                            <TableCell align="right">
                              <Actions
                                items={[
                                  ['Withdraw', '/earn/?tab=withdraw'],
                                  ['Deposit', '/earn/?tab=deposit'],
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                        {!active && !vault.shares && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                              <Typography color="text.secondary" sx={{ mb: 1.5 }}>
                                {trove.status === TroveStatus.closedByLiquidation
                                  ? 'Your trove was liquidated. No open positions.'
                                  : 'No open positions yet.'}
                              </Typography>
                              <Actions
                                center
                                items={[
                                  ['Borrow MUSD', '/borrow/'],
                                  ['Deposit MUSD', '/earn/'],
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Panel>
            <Panel title="Wallet">
              <Grid container spacing={2}>
                {(
                  [
                    ['BTC', position.btcBalance, 6, btcValue(position.btcBalance, system.btcPrice)],
                    ['MUSD', position.musdBalance, 2, position.musdBalance],
                    ['MEZO', position.mezoBalance, 2, undefined],
                  ] as const
                ).map(([symbol, amount, digits, usd]) => (
                  <Grid item xs={12} sm={4} key={symbol}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <AssetIcon symbol={symbol} size={32} />
                      <Box>
                        <Typography fontWeight={700}>
                          {fmtAmount(amount, digits)} {symbol}
                        </Typography>
                        {usd !== undefined && (
                          <Typography variant="description" color="text.secondary">
                            {fmtUsd(usd)}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Grid>
                ))}
              </Grid>
              {position.btcBalance === 0n && (
                <MuiLink
                  href={mezo.faucetUrl}
                  target="_blank"
                  rel="noopener"
                  sx={{ display: 'inline-block', mt: 2 }}
                >
                  Get testnet BTC
                </MuiLink>
              )}
            </Panel>
          </Stack>
        )}
      </PageContainer>
    </>
  );
}

function ratioColor(ratio?: bigint) {
  if (ratio === undefined) return 'text.primary';
  if (ratio < MCR) return 'error.main';
  if (ratio < CCR) return 'warning.main';
  return 'success.main';
}

function Name({ icon, title, sub }: { icon: 'MUSD' | 'mvMUSD'; title: string; sub: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <AssetIcon symbol={icon} size={32} />
      <Box>
        <Typography fontWeight={700}>{title}</Typography>
        <Typography variant="description" color="text.secondary">
          {sub}
        </Typography>
      </Box>
    </Stack>
  );
}

function Cell({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box>
      <Typography fontWeight={700} component="div">
        {main}
      </Typography>
      {sub && (
        <Typography variant="description" color="text.secondary" component="div">
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function Actions({ items, center }: { items: [string, string][]; center?: boolean }) {
  return (
    <Stack direction="row" spacing={1} justifyContent={center ? 'center' : 'flex-end'}>
      {items.map(([label, href], i) => (
        <Button
          key={label}
          component={Link}
          href={href}
          size="small"
          variant={i === 0 ? 'contained' : 'surface'}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {label}
        </Button>
      ))}
    </Stack>
  );
}
