'use client';

import { DarkModeOutlined, LightModeOutlined } from '@mui/icons-material';
import { Box, Button, IconButton, Stack, Tooltip, useTheme } from '@mui/material';
import { ConnectKitButton } from 'connectkit';
import { ColorModeContext } from 'layouts/AppGlobalStyles';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useContext } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';

import { MEZO_TESTNET_ID } from './config';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/dashboard/', label: 'Dashboard' },
  { href: '/borrow/', label: 'Borrow' },
  { href: '/earn/', label: 'Earn' },
  { href: '/history/', label: 'Activity' },
];

export function Header() {
  const pathname = usePathname() || '/';
  const theme = useTheme();
  const colorMode = useContext(ColorModeContext);
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  // Only flag once the wallet has reported a chain, so a reconnecting wallet doesn't flash it.
  const wrongNetwork = isConnected && chainId !== undefined && chainId !== MEZO_TESTNET_ID;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, ''));

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
        bgcolor: 'background.header',
        boxShadow: `inset 0px -1px 0px ${theme.palette.divider}`,
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, md: 3 }, py: 1, gap: 2 }}>
        <Box
          component={Link}
          href="/"
          aria-label="Morbit home"
          sx={{ lineHeight: 0, '&:hover': { opacity: 0.7 } }}
        >
          <img src="/icon.svg" alt="Morbit" width={72} height={40} />
        </Box>
        <Stack
          component="nav"
          direction="row"
          sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, ml: 2 }}
        >
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        {wrongNetwork && (
          <Tooltip title="Your wallet is on another network">
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={switching}
              onClick={() => switchChain({ chainId: MEZO_TESTNET_ID })}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {switching ? 'Check your wallet…' : 'Switch network'}
            </Button>
          </Tooltip>
        )}
        <Tooltip title={theme.palette.mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton
            onClick={colorMode.toggleColorMode}
            aria-label="Toggle color mode"
            size="small"
          >
            {theme.palette.mode === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />}
          </IconButton>
        </Tooltip>
        <ConnectKitButton />
      </Stack>
      <Stack
        component="nav"
        direction="row"
        sx={{
          display: { xs: 'flex', md: 'none' },
          overflowX: 'auto',
          px: 1,
          pb: 1,
          gap: 0.5,
          scrollbarWidth: 'none',
        }}
      >
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={isActive(item.href)}
          />
        ))}
      </Stack>
    </Box>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Button
      component={Link}
      href={href}
      aria-current={active ? 'page' : undefined}
      sx={{
        color: 'text.primary',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        px: 1.5,
        fontWeight: active ? 700 : 500,
        bgcolor: active ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {label}
    </Button>
  );
}
