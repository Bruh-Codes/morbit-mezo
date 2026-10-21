// Deploys MorbitEarnVault against the live MUSD system on Mezo testnet and writes the
// addresses the web app reads (web/ui-config/mezoDeployment.json).
//
//   npx hardhat run scripts/deploy-mezo.js --network mezoTestnet
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { mezoTestnet } from "../config/mezo-testnet.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../../web/ui-config/mezoDeployment.json");

const troveManagerAbi = [
  "function stabilityPool() view returns (address)",
  "function sortedTroves() view returns (address)",
  "function borrowerOperations() view returns (address)",
];

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== mezoTestnet.chainId) throw new Error(`Expected chain ${mezoTestnet.chainId}, got ${chainId}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer ${deployer.address} has ${ethers.formatEther(balance)} BTC`);

  const troveManager = new ethers.Contract(mezoTestnet.troveManager, troveManagerAbi, ethers.provider);
  const stabilityPool = await troveManager.stabilityPool();
  const sortedTroves = await troveManager.sortedTroves();
  const borrowerOperations = await troveManager.borrowerOperations();
  if (borrowerOperations.toLowerCase() !== mezoTestnet.borrowerOperations.toLowerCase()) {
    console.warn(`TroveManager reports BorrowerOperations ${borrowerOperations}; using it.`);
  }
  console.log(`StabilityPool ${stabilityPool}, SortedTroves ${sortedTroves}`);

  const vault = await ethers.deployContract("MorbitEarnVault", [
    mezoTestnet.musd,
    stabilityPool,
    mezoTestnet.priceFeed,
    deployer.address,
  ]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const deployTx = vault.deploymentTransaction();
  console.log(`MorbitEarnVault ${vaultAddress} (tx ${deployTx?.hash})`);

  const out = {
    ...mezoTestnet,
    borrowerOperations,
    stabilityPool,
    sortedTroves,
    earnVault: vaultAddress,
    earnVaultDeployBlock: (await deployTx?.wait())?.blockNumber ?? 0,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
