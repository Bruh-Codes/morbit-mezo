import { type Address, defineChain, zeroAddress } from 'viem';
import deployment from 'ui-config/mezoDeployment.json';

const asAddress = (value: string | null | undefined): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;

export const MEZO_TESTNET_ID = 31611;

// Fields added by later deploy scripts are optional in the JSON.
const dep = deployment as typeof deployment & {
  autoEarnVault?: string;
  autoEarnVaultDeployBlock?: number;
  mezoRouter?: string;
  poolFactory?: string;
};
const simpleEarnVault = asAddress(dep.earnVault);
const autoEarnVault = asAddress(dep.autoEarnVault);

export const mezoTestnet = defineChain({
  id: MEZO_TESTNET_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_MEZO_RPC_URL || deployment.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Mezo Explorer', url: deployment.explorerUrl },
  },
  testnet: true,
});

export const mezo = {
  chain: mezoTestnet,
  explorerUrl: deployment.explorerUrl,
  faucetUrl: 'https://faucet.test.mezo.org',
  musd: deployment.musd as Address,
  btc: deployment.btc as Address,
  mezoToken: deployment.mezo as Address,
  troveManager: deployment.troveManager as Address,
  borrowerOperations: deployment.borrowerOperations as Address,
  priceFeed: deployment.priceFeed as Address,
  // Read from TroveManager at runtime when the deploy script has not recorded them.
  stabilityPool: asAddress(deployment.stabilityPool),
  sortedTroves: asAddress(deployment.sortedTroves),
  // The Earn page uses Auto Earn once it is deployed; Simple Earn then stays open for withdrawals.
  earnVault: autoEarnVault ?? simpleEarnVault,
  earnVaultDeployBlock: BigInt(
    (autoEarnVault ? dep.autoEarnVaultDeployBlock : dep.earnVaultDeployBlock) || 0
  ),
  autoEarn: !!autoEarnVault,
  legacyVault: autoEarnVault ? simpleEarnVault : undefined,
  mezoRouter: asAddress(dep.mezoRouter),
  poolFactory: asAddress(dep.poolFactory),
};

/** Product and share names for the active Earn vault. */
export const EARN = mezo.autoEarn
  ? { name: 'Auto Earn', share: 'maMUSD' }
  : { name: 'Simple Earn', share: 'mvMUSD' };

export const ZERO = zeroAddress;

export const explorerTx = (hash: string) => `${mezo.explorerUrl}/tx/${hash}`;
export const explorerAddress = (address: string) => `${mezo.explorerUrl}/address/${address}`;

// MUSD protocol constants (mezo-org/musd LiquityBase).
export const MCR = 1_100_000_000_000_000_000n; // 110%
export const CCR = 1_500_000_000_000_000_000n; // 150%
export const MUSD_GAS_COMPENSATION = 200_000_000_000_000_000_000n; // 200 MUSD

// Below this ratio a small BTC drop, or recovery mode at 150%, can liquidate a loan.
export const AT_RISK = 1_600_000_000_000_000_000n; // 160%

/** Theme color for a collateral ratio: red under 110%, amber under 160%, green above. */
export function ratioColor(ratio?: bigint) {
  if (ratio === undefined) return 'text.primary';
  if (ratio < MCR) return 'error.main';
  if (ratio < AT_RISK) return 'warning.main';
  return 'success.main';
}
