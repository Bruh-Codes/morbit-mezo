// Finishes a Wave 2 deployment that is already recorded in web/ui-config/mezoDeployment.json:
// seeds 1 MUSD of dead shares into Auto Earn if the vault is still empty, and optionally starts
// a MEZO reward stream. Safe to run more than once.
//
//   REWARD_MEZO=100 npx hardhat run scripts/finish-wave2.js --network mezoTestnet
//
// Optional env: REWARD_MEZO (MEZO to stream) and REWARD_DAYS (default 14).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { mezoTestnet } from "../config/mezo-testnet.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../web/ui-config/mezoDeployment.json"), "utf8"),
);

async function main() {
  if (!deployment.autoEarnVault) throw new Error("No autoEarnVault in mezoDeployment.json. Run deploy:wave2 first.");
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const link = (hash) => `${mezoTestnet.explorerUrl}/tx/${hash}`;
  const erc20 = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const vault = await ethers.getContractAt("MorbitEarnVaultV2", deployment.autoEarnVault, deployer);

  if ((await vault.totalSupply()) === 0n) {
    const musd = new ethers.Contract(mezoTestnet.musd, erc20, deployer);
    const seed = ethers.parseEther("1");
    if ((await musd.balanceOf(deployer.address)) < seed) throw new Error("Need 1 MUSD in the deployer wallet to seed the vault.");
    await (await musd.approve(deployment.autoEarnVault, seed)).wait();
    const tx = await vault.deposit(seed, "0x000000000000000000000000000000000000dEaD");
    await tx.wait();
    console.log(`Seeded 1 MUSD of dead shares  ${link(tx.hash)}`);
  } else {
    console.log("Vault already has deposits: no seeding needed.");
  }

  const rewardMezo = process.env.REWARD_MEZO;
  if (rewardMezo) {
    const amount = ethers.parseEther(rewardMezo);
    const days = Number(process.env.REWARD_DAYS || 14);
    const mezo = new ethers.Contract(mezoTestnet.mezo, erc20, deployer);
    const balance = await mezo.balanceOf(deployer.address);
    if (balance < amount) throw new Error(`Deployer holds ${ethers.formatEther(balance)} MEZO, needs ${rewardMezo}`);
    await (await mezo.approve(deployment.autoEarnVault, amount)).wait();
    const tx = await vault.notifyRewardAmount(amount, days * 24 * 60 * 60);
    await tx.wait();
    console.log(`Streaming ${rewardMezo} MEZO over ${days} days  ${link(tx.hash)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
