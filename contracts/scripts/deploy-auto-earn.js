// Deploys Auto Earn (MorbitEarnVaultV2) and its Mezo Pools swapper on Mezo testnet, and
// records them in web/ui-config/mezoDeployment.json next to the Simple Earn vault.
//
//   npx hardhat run scripts/deploy-auto-earn.js --network mezoTestnet
//
// Optional env: REWARD_MEZO (MEZO to stream to depositors, e.g. 500) and REWARD_DAYS (default 14).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { mezoTestnet } from "../config/mezo-testnet.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../../web/ui-config/mezoDeployment.json");

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== mezoTestnet.chainId) throw new Error(`Expected chain ${mezoTestnet.chainId}, got ${chainId}`);
  const deployment = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const link = (hash) => `${mezoTestnet.explorerUrl}/tx/${hash}`;
  console.log(`Deployer ${deployer.address}: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BTC`);

  const swapper = await ethers.deployContract("MezoPoolsSwapper", [
    mezoTestnet.mezoRouter,
    mezoTestnet.btc,
    mezoTestnet.musd,
    mezoTestnet.poolFactory,
  ]);
  await swapper.waitForDeployment();
  console.log(`MezoPoolsSwapper ${await swapper.getAddress()}`);

  const vault = await ethers.deployContract("MorbitEarnVaultV2", [
    mezoTestnet.musd,
    mezoTestnet.mezo,
    deployment.stabilityPool,
    mezoTestnet.priceFeed,
    await swapper.getAddress(),
    deployer.address,
  ]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const receipt = await vault.deploymentTransaction()?.wait();
  console.log(`MorbitEarnVaultV2 ${vaultAddress}  ${link(receipt.hash)}`);

  const rewardMezo = process.env.REWARD_MEZO;
  if (rewardMezo) {
    const amount = ethers.parseEther(rewardMezo);
    const days = Number(process.env.REWARD_DAYS || 14);
    const mezo = new ethers.Contract(
      mezoTestnet.mezo,
      ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
      deployer,
    );
    const balance = await mezo.balanceOf(deployer.address);
    if (balance < amount) throw new Error(`Deployer holds ${ethers.formatEther(balance)} MEZO, needs ${rewardMezo}`);
    await (await mezo.approve(vaultAddress, amount)).wait();
    const tx = await vault.notifyRewardAmount(amount, days * 24 * 60 * 60);
    await tx.wait();
    console.log(`Streaming ${rewardMezo} MEZO over ${days} days  ${link(tx.hash)}`);
  }

  const out = {
    ...deployment,
    mezoRouter: mezoTestnet.mezoRouter,
    poolFactory: mezoTestnet.poolFactory,
    btcSwapper: await swapper.getAddress(),
    autoEarnVault: vaultAddress,
    autoEarnVaultDeployBlock: receipt.blockNumber,
    autoEarnDeployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
