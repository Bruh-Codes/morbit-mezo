import '../public/fonts/inter/inter.css';
import '../styles/variables.css';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import NextTopLoader from 'nextjs-toploader';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Morbit | Borrow and earn with MUSD on Mezo',
  description:
    'Borrow MUSD against BTC and earn with it through the Morbit Simple Earn vault, live on Mezo testnet.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0A0A0A" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <AppRouterCacheProvider options={{ key: 'css', prepend: true }}>
          <Providers>
            <NextTopLoader
              showSpinner={false}
              color="#B8E600"
              initialPosition={0.04}
              crawlSpeed={300}
              height={2}
              crawl={true}
              easing="ease"
              speed={350}
              shadow="0 0 10px #B8E600,0 0 5px #B8E600"
              zIndex={9999}
            />
            {children}
          </Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
