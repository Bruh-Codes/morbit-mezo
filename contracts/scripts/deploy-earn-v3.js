// Wave 2 judge feedback release, in one command:
//   1. a new Auto Earn vault (redeem collects BTC gains after a pool-emptying liquidation,
//      10% performance fee on harvested BTC), seeded with dead shares
//   2. a new Loop factory whose accounts can also Borrow & Earn in one transaction
//   3. optional MEZO reward stream for the new vault (REWARD_MEZO, REWARD_DAYS)
//   4. a maMUSD/MUSD stable pool on Mezo Pools, seeded with POOL_MUSD of each side (default 10)
//   5. source verification of every new contract on the Mezo explorer
// and records everything in web/ui-config/mezoDeployment.json. The previous Auto Earn vault and
// Loop factory stay listed as legacy so the app can show and withdraw existing positions.
//
//   npm run deploy:earn-v3
//
// Needs about 0.01 BTC for gas and 1 + 2 × POOL_MUSD MUSD (21 by default) in the deployer wallet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { loopFactoryConfig, vaultConstructorArgs, verifyDeployment } from "./lib/verify-deployment.js";
import { mezoTestnet } from "../config/mezo-testnet.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../../web/ui-config/mezoDeployment.json");
const DEAD = "0x000000000000000000000000000000000000dEaD";

const erc20Abi = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const factoryAbi = [
  "function getPool(address,address,bool) view returns (address)",
  "function createPool(address,address,bool) returns (address)",
];
const routerAbi = [
  "function addLiquidity(address,address,bool,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
];

async function main() {
  const { ethers } = await hre.network.connect();
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== mezoTestnet.chainId) throw new Error(`Expected chain ${mezoTestnet.chainId}, got ${chainId}`);
  const deployment = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const link = (hash) => `${mezoTestnet.explorerUrl}/tx/${hash}`;
  const musd = new ethers.Contract(mezoTestnet.musd, erc20Abi, deployer);
  const poolMusd = ethers.parseEther(process.env.POOL_MUSD ?? "10");
  const seed = ethers.parseEther("1");

  // Check balances before deploying anything, so a short balance doesn't leave a half deploy.
  const btcBalance = await ethers.provider.getBalance(deployer.address);
  const musdBalance = await musd.balanceOf(deployer.address);
  console.log(`Deployer ${deployer.address}: ${ethers.formatEther(btcBalance)} BTC, ${ethers.formatEther(musdBalance)} MUSD`);
  const musdNeeded = seed + 2n * poolMusd;
  if (musdBalance < musdNeeded)
    throw new Error(`Needs ${ethers.formatEther(musdNeeded)} MUSD (1 seed + 2 × POOL_MUSD). Set POOL_MUSD=0 to skip the pool.`);
  if (process.env.REWARD_MEZO) {
    const mezo = new ethers.Contract(mezoTestnet.mezo, erc20Abi, deployer);
    const balance = await mezo.balanceOf(deployer.address);
    if (balance < ethers.parseEther(process.env.REWARD_MEZO))
      throw new Error(`Deployer holds ${ethers.formatEther(balance)} MEZO, needs ${process.env.REWARD_MEZO}`);
  }

  const swapper = deployment.btcSwapper;
  if (!swapper) throw new Error("No btcSwapper in mezoDeployment.json; run deploy:wave2 first.");

  // 1. Auto Earn vault
  const vaultArgs = vaultConstructorArgs(deployment, deployer.address);
  const vault = await ethers.deployContract("MorbitEarnVaultV2", vaultArgs);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const vaultReceipt = await vault.deploymentTransaction().wait();
  console.log(`Auto Earn vault ${vaultAddress}  ${link(vaultReceipt.hash)}`);

  // Dead shares make a first-depositor share-price inflation attack uneconomic.
  await (await musd.approve(vaultAddress, seed + poolMusd)).wait();
  const seedTx = await vault.deposit(seed, DEAD);
  await seedTx.wait();
  console.log(`Seeded 1 MUSD of dead shares  ${link(seedTx.hash)}`);

  // 2. Loop factory with Borrow & Earn
  const loopConfig = loopFactoryConfig(deployment, vaultAddress);
  const loopFactory = await ethers.deployContract("MorbitLoopFactory", [loopConfig]);
  await loopFactory.waitForDeployment();
  const loopFactoryAddress = await loopFactory.getAddress();
  const loopReceipt = await loopFactory.deploymentTransaction().wait();
  console.log(`Loop factory ${loopFactoryAddress}  ${link(loopReceipt.hash)}`);

  // 3. MEZO rewards
  if (process.env.REWARD_MEZO) {
    const amount = ethers.parseEther(process.env.REWARD_MEZO);
    const days = Number(process.env.REWARD_DAYS || 14);
    const mezo = new ethers.Contract(mezoTestnet.mezo, erc20Abi, deployer);
    await (await mezo.approve(vaultAddress, amount)).wait();
    const tx = await vault.notifyRewardAmount(amount, days * 24 * 60 * 60);
    await tx.wait();
    console.log(`Streaming ${process.env.REWARD_MEZO} MEZO over ${days} days  ${link(tx.hash)}`);
  }

  // 4. maMUSD/MUSD stable pool on Mezo Pools: Auto Earn shares become a tradable, LP-able token.
  let maMusdPool;
  if (poolMusd > 0n) {
    const depositTx = await vault.deposit(poolMusd, deployer.address);
    await depositTx.wait();
    const shares = await vault.balanceOf(deployer.address);
    const factory = new ethers.Contract(mezoTestnet.poolFactory, factoryAbi, deployer);
    maMusdPool = await factory.getPool(vaultAddress, mezoTestnet.musd, true);
    if (maMusdPool === ethers.ZeroAddress) {
      const tx = await factory.createPool(vaultAddress, mezoTestnet.musd, true);
      await tx.wait();
      maMusdPool = await factory.getPool(vaultAddress, mezoTestnet.musd, true);
      console.log(`maMUSD/MUSD pool ${maMusdPool}  ${link(tx.hash)}`);
    }
    const router = new ethers.Contract(mezoTestnet.mezoRouter, routerAbi, deployer);
    await (await vault.approve(mezoTestnet.mezoRouter, shares)).wait();
    await (await musd.approve(mezoTestnet.mezoRouter, poolMusd)).wait();
    const deadline = Math.floor(Date.now() / 1000) + 1800;
    const tx = await router.addLiquidity(
      vaultAddress, mezoTestnet.musd, true, shares, poolMusd, (shares * 99n) / 100n, (poolMusd * 99n) / 100n,
      deployer.address, deadline,
    );
    await tx.wait();
    console.log(`Added ${ethers.formatEther(shares)} maMUSD + ${ethers.formatEther(poolMusd)} MUSD of liquidity  ${link(tx.hash)}`);
  }

  // Record before verifying, so a verification hiccup never loses the addresses.
  const out = {
    ...deployment,
    deployer: deployer.address,
    legacyAutoEarnVault: deployment.legacyAutoEarnVault ?? deployment.autoEarnVault,
    legacyAutoEarnVaultDeployBlock: deployment.legacyAutoEarnVaultDeployBlock ?? deployment.autoEarnVaultDeployBlock,
    legacyLoopFactory: deployment.legacyLoopFactory ?? deployment.loopFactory,
    autoEarnVault: vaultAddress,
    autoEarnVaultDeployBlock: vaultReceipt.blockNumber,
    loopFactory: loopFactoryAddress,
    loopFactoryDeployBlock: loopReceipt.blockNumber,
    ...(maMusdPool ? { maMusdPool } : {}),
    autoEarnDeployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${outFile}`);

  // 5. Verify sources. Blockscout needs a few seconds to index new contracts.
  if (process.env.SKIP_VERIFY) return;
  await new Promise((r) => setTimeout(r, 15_000));
  await verifyDeployment(hre, out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
