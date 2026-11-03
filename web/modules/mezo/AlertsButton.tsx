'use client';

import { NotificationsActiveOutlined } from '@mui/icons-material';
import { Button } from '@mui/material';
import { useAccount } from 'wagmi';

// Username of the Morbit alerts Telegram bot (see /alerts). Override with NEXT_PUBLIC_TELEGRAM_BOT.
export const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'Morbit_testnet_bot';

/** Subscribes the connected wallet to liquidation alerts in one tap. */
export function AlertsButton({ fullWidth = true }: { fullWidth?: boolean }) {
  const { address } = useAccount();
  if (!BOT || !address) return null;
  return (
    <Button
      variant="outlined"
      fullWidth={fullWidth}
      startIcon={<NotificationsActiveOutlined />}
      href={`https://t.me/${BOT}?start=${address}`}
      target="_blank"
      rel="noopener"
      sx={{ mt: fullWidth ? 2 : 0, alignSelf: 'flex-start' }}
    >
      Get liquidation alerts on Telegram
    </Button>
  );
}
