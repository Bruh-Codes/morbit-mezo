import { getDefaultConfig } from 'connectkit';
import { mezoTestnet } from 'modules/mezo/config';
import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://morbit.app';

export const wagmiConfig = createConfig(
  getDefaultConfig({
    chains: [mezoTestnet],
    transports: { [mezoTestnet.id]: http(mezoTestnet.rpcUrls.default.http[0]) },
    // Explicit list: browser wallets (EIP-6963 discovery) plus WalletConnect when configured.
    connectors: [
      injected(),
      ...(walletConnectProjectId
        ? [
            walletConnect({
              projectId: walletConnectProjectId,
              showQrModal: false,
              metadata: { name: 'Morbit', description: 'MUSD on Mezo', url: appUrl, icons: [] },
            }),
          ]
        : []),
    ],
    walletConnectProjectId,
    appName: 'Morbit',
    appDescription: 'Borrow MUSD against BTC and earn with it on Mezo',
    appUrl,
    ssr: true,
  })
);
