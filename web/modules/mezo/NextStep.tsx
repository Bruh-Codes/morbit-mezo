'use client';

import { ArrowForward } from '@mui/icons-material';
import { Button, Paper, Stack, Typography } from '@mui/material';
import { ConnectKitButton } from 'connectkit';
import Link from 'next/link';
import { useAccount, useSwitchChain } from 'wagmi';

import { mezo, MEZO_TESTNET_ID } from './config';
import { TroveStatus, useUserPosition } from './hooks';

type Step = { title: string; cta: string; href?: string; external?: boolean };

function pickStep(position: ReturnType<typeof useUserPosition>): Step | undefined {
  const { btcBalance, musdBalance, trove, vault } = position;
  if (btcBalance === undefined || trove.status === undefined) return undefined;
  const hasTrove = trove.status === TroveStatus.active;
  if (!hasTrove && btcBalance === 0n)
    return {
      title: 'Get testnet BTC to start',
      cta: 'Open faucet',
      href: mezo.faucetUrl,
      external: true,
    };
  if (!hasTrove) return { title: 'Borrow MUSD with your BTC', cta: 'Borrow', href: '/borrow/' };
  if (mezo.earnVault && (musdBalance ?? 0n) > 0n)
    return { title: 'Put your MUSD to work', cta: 'Deposit', href: '/earn/' };
  if ((vault.shares ?? 0n) > 0n)
    return { title: 'Track your positions', cta: 'Dashboard', href: '/dashboard/' };
  return { title: 'Manage your loan', cta: 'Manage', href: '/borrow/' };
}

/** One clear next action for the connected wallet. */
export function NextStep({ position }: { position: ReturnType<typeof useUserPosition> }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  let content: { title: string; button: React.ReactNode } | undefined;
  if (!isConnected) {
    content = {
      title: 'Connect a wallet to get started',
      button: (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <Button variant="contained" onClick={show}>
              Connect wallet
            </Button>
          )}
        </ConnectKitButton.Custom>
      ),
    };
  } else if (chainId !== MEZO_TESTNET_ID) {
    content = {
      title: 'Switch your wallet to Mezo testnet',
      button: (
        <Button
          variant="contained"
          disabled={isPending}
          onClick={() => switchChain({ chainId: MEZO_TESTNET_ID })}
        >
          {isPending ? 'Check your wallet…' : 'Switch network'}
        </Button>
      ),
    };
  } else {
    const step = pickStep(position);
    if (step)
      content = {
        title: step.title,
        button: step.external ? (
          <Button
            variant="contained"
            href={step.href!}
            target="_blank"
            rel="noopener"
            endIcon={<ArrowForward />}
          >
            {step.cta}
          </Button>
        ) : (
          <Button variant="contained" component={Link} href={step.href!} endIcon={<ArrowForward />}>
            {step.cta}
          </Button>
        ),
      };
  }
  if (!content) return null;

  return (
    <Paper
      sx={{
        p: { xs: 2, md: 2.5 },
        mb: 3,
        border: 1,
        borderColor: 'secondary.main',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        gap={2}
      >
        <Stack>
          <Typography variant="description" color="text.secondary" sx={{ fontWeight: 700 }}>
            NEXT STEP
          </Typography>
          <Typography variant="h3">{content.title}</Typography>
        </Stack>
        {content.button}
      </Stack>
    </Paper>
  );
}
