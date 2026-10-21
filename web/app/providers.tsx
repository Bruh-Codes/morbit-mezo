'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';
import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';

import { AppGlobalStyles } from '../layouts/AppGlobalStyles';
import { wagmiConfig } from '../ui-config/wagmiConfig';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider options={{ initialChainId: 31611 }}>
          <AppGlobalStyles>{children}</AppGlobalStyles>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
