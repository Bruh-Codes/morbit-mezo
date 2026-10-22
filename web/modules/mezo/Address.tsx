'use client';

import { Check, ContentCopy, OpenInNew } from '@mui/icons-material';
import { IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';

import { explorerAddress, explorerTx } from './config';

export const shorten = (value: string, start = 6, end = 4) =>
  value.length > start + end + 1 ? `${value.slice(0, start)}…${value.slice(-end)}` : value;

/** Short address or tx hash with copy and explorer buttons. */
export function Address({ value, kind = 'address' }: { value: string; kind?: 'address' | 'tx' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the explorer link still works.
    }
  };
  return (
    <Stack direction="row" alignItems="center" spacing={0.25} component="span">
      <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 13 }} title={value}>
        {shorten(value)}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" onClick={copy} aria-label="Copy">
          {copied ? <Check sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
        </IconButton>
      </Tooltip>
      <Tooltip title="View on explorer">
        <IconButton
          size="small"
          component="a"
          href={kind === 'tx' ? explorerTx(value) : explorerAddress(value)}
          target="_blank"
          rel="noopener"
          aria-label="View on explorer"
        >
          <OpenInNew sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
