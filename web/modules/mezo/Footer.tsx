'use client';

import { ExpandMore } from '@mui/icons-material';
import { Box, Collapse, Grid, Link, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { Address } from './Address';
import { BOT } from './AlertsButton';
import { mezo } from './config';

const CONTRACTS: [string, string | undefined][] = [
  ['MUSD', mezo.musd],
  ['BorrowerOperations', mezo.borrowerOperations],
  ['TroveManager', mezo.troveManager],
  ['PriceFeed', mezo.priceFeed],
  [mezo.autoEarn ? 'Auto Earn vault' : 'Simple Earn vault', mezo.earnVault],
  ...mezo.legacyVaults.map((v) => [`${v.name} vault`, v.address] as [string, string]),
  ...(mezo.loopFactory ? ([['Loop factory', mezo.loopFactory]] as [string, string][]) : []),
  ...(mezo.maMusdPool ? ([['maMUSD/MUSD pool', mezo.maMusdPool]] as [string, string][]) : []),
  ...(mezo.autoEarn
    ? ([['Mezo Pools router', mezo.mezoRouter]] as [string, string | undefined][])
    : []),
];

export function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <Box
      component="footer"
      sx={{ mt: 'auto', borderTop: 1, borderColor: 'divider', px: { xs: 2, md: 5, xl: 8 }, py: 2 }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Stack direction="row" alignItems="center" gap={2}>
          <Typography variant="description" color="text.secondary">
            Morbit · Mezo testnet
          </Typography>
          <Link
            href={`https://t.me/${BOT}`}
            target="_blank"
            rel="noopener"
            variant="description"
            color="text.secondary"
          >
            Telegram alerts
          </Link>
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          component="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          sx={{
            border: 0,
            bgcolor: 'transparent',
            color: 'text.secondary',
            cursor: 'pointer',
            font: 'inherit',
            p: 0,
          }}
        >
          <Typography variant="description">Contracts</Typography>
          <ExpandMore
            sx={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
          />
        </Stack>
      </Stack>
      <Collapse in={open}>
        <Grid container columnSpacing={6} sx={{ pt: 1 }}>
          {CONTRACTS.map(([label, address]) => (
            <Grid item xs={12} sm="auto" key={label}>
              <Stack direction="row" alignItems="center" gap={2}>
                <Typography variant="description" color="text.secondary" sx={{ width: 140 }}>
                  {label}
                </Typography>
                {address ? (
                  <Address value={address} />
                ) : (
                  <Typography variant="description">—</Typography>
                )}
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Collapse>
    </Box>
  );
}
