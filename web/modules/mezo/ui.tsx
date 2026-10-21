'use client';

import { OpenInNew } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ConnectKitButton } from 'connectkit';
import { ReactNode } from 'react';

import { explorerTx } from './config';
import { fmtAmount } from './format';
import type { TxState } from './hooks';

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <Container maxWidth={false} sx={{ px: { xs: 2, xsm: 3, md: 5, xl: 8 }, pb: 8 }}>
      {children}
    </Container>
  );
}

export function PageTop({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        py: { xs: 5, md: 7 },
        mb: 4,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? theme.palette.background.surface2 : '#E9ECDD',
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.14,
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: '15px 15px',
        }}
      />
      <Container
        maxWidth={false}
        sx={{ position: 'relative', px: { xs: 2, xsm: 3, md: 5, xl: 8 } }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'flex-start' }}
          gap={3}
        >
          <Box sx={{ minWidth: 0 }}>
            {eyebrow && (
              <Typography
                variant="description"
                sx={{
                  display: 'block',
                  color: 'text.secondary',
                  letterSpacing: 2,
                  fontWeight: 700,
                  mb: 1,
                }}
              >
                {eyebrow}
              </Typography>
            )}
            <Typography variant="h1" sx={{ fontSize: { xs: 32, md: 42 }, mb: 1 }}>
              {title}
            </Typography>
            {description && (
              <Typography color="text.secondary" sx={{ fontSize: 16, maxWidth: 720 }}>
                {description}
              </Typography>
            )}
            {children}
          </Box>
          {actions && (
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              {actions}
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="description" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h2" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="description" color="text.secondary" component="div">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" sx={{ mt: 3, flexWrap: 'wrap', columnGap: { xs: 3, md: 7 }, rowGap: 2 }}>
      {children}
    </Stack>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, height: '100%' }}>
      {(title || action) && (
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 2.5 }}
          gap={2}
        >
          {typeof title === 'string' ? <Typography variant="h3">{title}</Typography> : title}
          {action}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

export function Row({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="baseline"
      gap={2}
      sx={{ py: 1 }}
    >
      <Typography color="text.secondary">{label}</Typography>
      <Box sx={{ textAlign: 'right' }}>
        <Typography fontWeight={700} component="div">
          {value}
        </Typography>
        {hint && (
          <Typography variant="description" color="text.secondary" component="div">
            {hint}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

export function AssetIcon({
  symbol,
  size = 28,
}: {
  symbol: 'BTC' | 'MUSD' | 'MEZO' | 'mvMUSD';
  size?: number;
}) {
  const src =
    symbol === 'BTC'
      ? '/icons/tokens/btc.svg'
      : symbol === 'MEZO'
      ? '/icons/networks/mezo.svg'
      : symbol === 'mvMUSD'
      ? '/icons/simple-earn.svg'
      : '/icons/tokens/musd.svg';
  return (
    <Box
      component="img"
      src={src}
      alt=""
      sx={{ width: size, height: size, borderRadius: '50%', flex: '0 0 auto' }}
    />
  );
}

export function LiveChip({ online }: { online: boolean }) {
  return (
    <Chip
      size="small"
      label={online ? 'Live · Mezo testnet' : 'Connecting to Mezo testnet…'}
      sx={{
        bgcolor: online ? 'secondary.main' : 'action.selected',
        color: online ? '#111' : 'text.primary',
        fontWeight: 700,
        '& .MuiChip-label': { px: 1.25 },
      }}
    />
  );
}

export function AmountField({
  label,
  symbol,
  value,
  onChange,
  balance,
  balanceLabel = 'Wallet',
  onMax,
  error,
  disabled,
}: {
  label: string;
  symbol: 'BTC' | 'MUSD' | 'mvMUSD';
  value: string;
  onChange: (value: string) => void;
  balance?: bigint;
  balanceLabel?: string;
  onMax?: () => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="description" color="text.secondary">
          {label}
        </Typography>
        {balance !== undefined && (
          <Typography variant="description" color="text.secondary">
            {balanceLabel}: {fmtAmount(balance)} {symbol}
          </Typography>
        )}
      </Stack>
      <TextField
        fullWidth
        value={value}
        disabled={disabled}
        placeholder="0.00"
        error={!!error}
        helperText={error}
        onChange={(event) => {
          const next = event.target.value.replace(',', '.');
          if (/^\d*\.?\d*$/.test(next)) onChange(next);
        }}
        inputProps={{ inputMode: 'decimal', 'aria-label': label }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <AssetIcon symbol={symbol} size={22} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography color="text.secondary" fontWeight={700}>
                  {symbol}
                </Typography>
                {onMax && (
                  <Button size="small" onClick={onMax} disabled={disabled} sx={{ minWidth: 0 }}>
                    Max
                  </Button>
                )}
              </Stack>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
}

export function TxNotice({ state }: { state: TxState }) {
  if (state.status === 'idle') return null;
  const link = state.hash ? (
    <MuiLink
      href={explorerTx(state.hash)}
      target="_blank"
      rel="noopener"
      sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
    >
      View on explorer <OpenInNew sx={{ fontSize: 14 }} />
    </MuiLink>
  ) : null;
  if (state.status === 'wallet')
    return (
      <Alert severity="info" icon={<CircularProgress size={18} />}>
        Confirm the transaction in your wallet.
      </Alert>
    );
  if (state.status === 'pending')
    return (
      <Alert severity="info" icon={<CircularProgress size={18} />}>
        Waiting for Mezo testnet to confirm.{link}
      </Alert>
    );
  if (state.status === 'success')
    return <Alert severity="success">Confirmed on Mezo testnet.{link}</Alert>;
  return (
    <Alert severity="error">
      {state.error}
      {link}
    </Alert>
  );
}

export function ConnectPrompt({ message }: { message: string }) {
  return (
    <Paper sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
      <Typography variant="h3" sx={{ mb: 1 }}>
        Connect a wallet
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {message}
      </Typography>
      <ConnectKitButton.Custom>
        {({ show }) => (
          <Button variant="contained" size="large" onClick={show}>
            Connect wallet
          </Button>
        )}
      </ConnectKitButton.Custom>
    </Paper>
  );
}

export function SubmitButton({
  children,
  busy,
  disabled,
  onClick,
}: {
  children: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      fullWidth
      size="large"
      variant="contained"
      disabled={disabled || busy}
      onClick={onClick}
      sx={{ py: 1.5 }}
    >
      {busy ? <CircularProgress size={20} color="inherit" /> : children}
    </Button>
  );
}
