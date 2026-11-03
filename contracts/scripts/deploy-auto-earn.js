// Deploys the Wave 2 contracts on Mezo testnet: the Mezo Pools swapper, Auto Earn
// (MorbitEarnVaultV2) and the BTC Loop factory, and records them in
// web/ui-config/mezoDeployment.json next to the Simple Earn vault.
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

  // Check the MEZO balance before deploying anything, so a short balance doesn't leave a half deploy.
  if (process.env.REWARD_MEZO) {
    const mezo = new ethers.Contract(mezoTestnet.mezo, ["function balanceOf(address) view returns (uint256)"], deployer);
    const balance = await mezo.balanceOf(deployer.address);
    if (balance < ethers.parseEther(process.env.REWARD_MEZO))
      throw new Error(`Deployer holds ${ethers.formatEther(balance)} MEZO, needs ${process.env.REWARD_MEZO}`);
  }

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

  // Seed 1 MUSD of shares to a dead address so the share price can never be inflated from an
  // empty vault (first-depositor attack). Needs 1 MUSD in the deployer wallet.
  const musd = new ethers.Contract(
    mezoTestnet.musd,
    ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
    deployer,
  );
  const seed = ethers.parseEther("1");
  if ((await musd.balanceOf(deployer.address)) >= seed) {
    await (await musd.approve(vaultAddress, seed)).wait();
    const tx = await vault.deposit(seed, "0x000000000000000000000000000000000000dEaD");
    await tx.wait();
    console.log(`Seeded 1 MUSD of dead shares  ${link(tx.hash)}`);
  } else {
    console.warn("Deployer has no MUSD: skipped seeding dead shares. Deposit 1 MUSD to 0x…dEaD before launch.");
  }

  const loopFactory = await ethers.deployContract("MorbitLoopFactory", [
    {
      borrowerOperations: deployment.borrowerOperations,
      troveManager: mezoTestnet.troveManager,
      priceFeed: mezoTestnet.priceFeed,
      swapper: await swapper.getAddress(),
      musd: mezoTestnet.musd,
    },
  ]);
  await loopFactory.waitForDeployment();
  const loopReceipt = await loopFactory.deploymentTransaction()?.wait();
  console.log(`MorbitLoopFactory ${await loopFactory.getAddress()}  ${link(loopReceipt.hash)}`);

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
    loopFactory: await loopFactory.getAddress(),
    loopFactoryDeployBlock: loopReceipt.blockNumber,
    autoEarnDeployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
