// Live check of Auto Earn on Mezo testnet with the deployer wallet: deposit MUSD, harvest
// any BTC gains through Mezo Pools, claim MEZO, then redeem half. Prints explorer links.
//
//   npx hardhat run scripts/smoke-auto-earn.js --network mezoTestnet
//
// Optional env: SMOKE_DEPOSIT_MUSD (default 100). The wallet needs MUSD (run smoke:mezo first).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../web/ui-config/mezoDeployment.json"), "utf8"),
);

async function main() {
  if (!deployment.autoEarnVault) throw new Error("Deploy Auto Earn first: npm run deploy:auto-earn");
  const { ethers } = await hre.network.connect();
  const [me] = await ethers.getSigners();
  const link = (hash) => `${deployment.explorerUrl}/tx/${hash}`;
  const fmt = (v) => ethers.formatEther(v);
  const musd = new ethers.Contract(
    deployment.musd,
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ],
    me,
  );
  const vault = await ethers.getContractAt("MorbitEarnVaultV2", deployment.autoEarnVault, me);

  const amount = ethers.parseEther(process.env.SMOKE_DEPOSIT_MUSD || "100");
  if ((await musd.allowance(me.address, deployment.autoEarnVault)) < amount) {
    const tx = await musd.approve(deployment.autoEarnVault, ethers.MaxUint256);
    await tx.wait();
    console.log(`Approved MUSD  ${link(tx.hash)}`);
  }
  const dep = await vault.deposit(amount, me.address);
  await dep.wait();
  console.log(`Deposited ${fmt(amount)} MUSD, now ${fmt(await vault.balanceOf(me.address))} maMUSD  ${link(dep.hash)}`);

  const btc = await vault.totalBtc();
  if (btc >= (await vault.minHarvestBtc())) {
    const tx = await vault.harvest(0n);
    await tx.wait();
    console.log(`Harvested ${fmt(btc)} BTC into MUSD  ${link(tx.hash)}`);
  } else {
    console.log(`No BTC gains to harvest yet (${fmt(btc)} BTC). Harvest runs once liquidations pay the pool.`);
  }

  const earned = await vault.earned(me.address);
  if (earned > 0n) {
    const tx = await vault.claimRewards();
    await tx.wait();
    console.log(`Claimed ${fmt(earned)} MEZO  ${link(tx.hash)}`);
  }

  const half = (await vault.balanceOf(me.address)) / 2n;
  const before = await musd.balanceOf(me.address);
  try {
    const red = await vault.redeem(half, me.address, me.address);
    await red.wait();
    console.log(`Redeemed ${fmt(half)} maMUSD for ${fmt((await musd.balanceOf(me.address)) - before)} MUSD  ${link(red.hash)}`);
  } catch (error) {
    if (!String(error?.message).includes("ICR < MCR")) throw error;
    console.log("Withdrawals are paused by MUSD while a loan under 110% waits to be liquidated. Run `npm run liquidate`, then try again.");
  }
  console.log(`Vault value ${fmt(await vault.totalAssets())} MUSD, share price ${fmt(await vault.sharePrice())}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
