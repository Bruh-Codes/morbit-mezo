'use client';

import { ExpandMore } from '@mui/icons-material';
import { Box, Collapse, Grid, Link as MuiLink, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { explorerAddress, mezo } from './config';

const CONTRACTS: [string, string | undefined][] = [
  ['MUSD', mezo.musd],
  ['BorrowerOperations', mezo.borrowerOperations],
  ['TroveManager', mezo.troveManager],
  ['PriceFeed', mezo.priceFeed],
  ['Simple Earn vault', mezo.earnVault],
];

export function Footer() {
  const [open, setOpen] = useState(false);
  return (
    <Box
      component="footer"
      sx={{ mt: 'auto', borderTop: 1, borderColor: 'divider', px: { xs: 2, md: 5, xl: 8 }, py: 2 }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="description" color="text.secondary">
          Morbit · Mezo testnet
        </Typography>
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
        <Grid container columnSpacing={4} rowSpacing={0.5} sx={{ pt: 1.5 }}>
          {CONTRACTS.map(([label, address]) => (
            <Grid item xs={12} md={6} key={label}>
              <Stack direction="row" justifyContent="space-between" gap={2}>
                <Typography variant="description" color="text.secondary">
                  {label}
                </Typography>
                {address ? (
                  <MuiLink
                    href={explorerAddress(address)}
                    target="_blank"
                    rel="noopener"
                    sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}
                  >
                    {address}
                  </MuiLink>
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
