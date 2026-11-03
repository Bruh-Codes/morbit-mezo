// Source verification of the Morbit contracts on the Mezo testnet explorer (Blockscout).
// Constructor arguments are rebuilt from mezoDeployment.json, so they must match the deploy.
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { mezoTestnet } from "../../config/mezo-testnet.js";

export const vaultConstructorArgs = (deployment, owner) => [
  mezoTestnet.musd,
  mezoTestnet.mezo,
  deployment.stabilityPool,
  mezoTestnet.priceFeed,
  deployment.btcSwapper,
  owner,
];

export const loopFactoryConfig = (deployment, vault) => ({
  borrowerOperations: deployment.borrowerOperations,
  troveManager: mezoTestnet.troveManager,
  priceFeed: mezoTestnet.priceFeed,
  swapper: deployment.btcSwapper,
  musd: mezoTestnet.musd,
  vault,
});

export async function verifyDeployment(hre, deployment) {
  const targets = [
    {
      name: "Auto Earn vault",
      address: deployment.autoEarnVault,
      constructorArgs: vaultConstructorArgs(deployment, deployment.deployer),
      contract: "contracts/MorbitEarnVaultV2.sol:MorbitEarnVaultV2",
    },
    {
      name: "Loop factory",
      address: deployment.loopFactory,
      constructorArgs: [loopFactoryConfig(deployment, deployment.autoEarnVault)],
      contract: "contracts/MorbitLoop.sol:MorbitLoopFactory",
    },
    {
      name: "Swapper",
      address: deployment.btcSwapper,
      constructorArgs: [mezoTestnet.mezoRouter, mezoTestnet.btc, mezoTestnet.musd, mezoTestnet.poolFactory],
      contract: "contracts/MezoPoolsSwapper.sol:MezoPoolsSwapper",
    },
  ];
  for (const t of targets) {
    try {
      await verifyContract({ address: t.address, constructorArgs: t.constructorArgs, contract: t.contract, provider: "blockscout" }, hre);
      console.log(`Verified ${t.name}: ${mezoTestnet.explorerUrl}/address/${t.address}?tab=contract`);
    } catch (e) {
      console.warn(`Could not verify ${t.name} (${String(e.message).split("\n")[0]}). Retry with: npm run verify:mezo`);
    }
  }
}
