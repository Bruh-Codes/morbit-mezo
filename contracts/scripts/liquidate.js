// Liquidates every MUSD trove under the 110% minimum, then compounds Auto Earn's BTC gains.
//
// MUSD's Stability Pool blocks all withdrawals while such a trove exists, and liquidations are
// what pay the pool (and so Auto Earn depositors) their BTC gains. Liquidating is permissionless
// and the caller is paid MUSD's gas compensation.
//
//   npx hardhat run scripts/liquidate.js --network mezoTestnet
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { mezoTestnet } from "../config/mezo-testnet.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../web/ui-config/mezoDeployment.json"), "utf8"),
);
const MCR = 110n * 10n ** 16n;
const MAX_PER_TX = 20;

async function main() {
  const { ethers } = await hre.network.connect();
  const [me] = await ethers.getSigners();
  const link = (hash) => `${mezoTestnet.explorerUrl}/tx/${hash}`;
  const fmt = (v) => ethers.formatEther(v);

  const priceFeed = new ethers.Contract(mezoTestnet.priceFeed, ["function fetchPrice() view returns (uint256)"], me);
  const sorted = new ethers.Contract(
    deployment.sortedTroves,
    ["function getLast() view returns (address)", "function getPrev(address) view returns (address)"],
    me,
  );
  const troveManager = new ethers.Contract(
    mezoTestnet.troveManager,
    [
      "function getCurrentICR(address,uint256) view returns (uint256)",
      "function batchLiquidateTroves(address[])",
    ],
    me,
  );

  // Troves are sorted by ratio, so walk up from the riskiest until one is safe.
  const price = await priceFeed.fetchPrice();
  const targets = [];
  let trove = await sorted.getLast();
  while (trove !== ethers.ZeroAddress && targets.length < MAX_PER_TX) {
    const icr = await troveManager.getCurrentICR(trove, price);
    if (icr >= MCR) break;
    console.log(`${trove}  ${(Number(icr) / 1e16).toFixed(1)}%`);
    targets.push(trove);
    trove = await sorted.getPrev(trove);
  }

  if (!targets.length) {
    console.log(`No trove is under 110% at BTC $${Number(fmt(price)).toFixed(0)}. Nothing to liquidate.`);
  } else {
    const tx = await troveManager.batchLiquidateTroves(targets);
    await tx.wait();
    console.log(`Liquidated ${targets.length} trove(s)  ${link(tx.hash)}`);
  }

  if (deployment.autoEarnVault) {
    const vault = await ethers.getContractAt("MorbitEarnVaultV2", deployment.autoEarnVault, me);
    const btc = await vault.totalBtc();
    if (btc > 0n && btc >= (await vault.minHarvestBtc())) {
      const tx = await vault.harvest(0n);
      await tx.wait();
      console.log(`Auto Earn compounded ${fmt(btc)} BTC into MUSD  ${link(tx.hash)}`);
    } else {
      console.log(`Auto Earn BTC gains: ${fmt(btc)} BTC (below the harvest minimum).`);
    }
    console.log(`Auto Earn value ${fmt(await vault.totalAssets())} MUSD, share price ${fmt(await vault.sharePrice())}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
