// End-to-end check on Mezo testnet with the deployer wallet:
// opens a trove (BTC -> MUSD) if the wallet has none, deposits MUSD into the Simple Earn
// vault, then redeems half of the shares. Every step prints its explorer link.
//
//   npx hardhat run scripts/smoke-mezo.js --network mezoTestnet
//
// Optional env: SMOKE_COLL_BTC (default 0.04), SMOKE_DEPOSIT_MUSD (default 100).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../web/ui-config/mezoDeployment.json"), "utf8"),
);

const abi = {
  borrowerOperations: [
    "function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) payable",
    "function minNetDebt() view returns (uint256)",
    "function borrowingRate() view returns (uint256)",
  ],
  troveManager: [
    "function getTroveStatus(address) view returns (uint8)",
    "function getTroveColl(address) view returns (uint256)",
    "function getTroveDebt(address) view returns (uint256)",
  ],
  sortedTroves: ["function findInsertPosition(uint256,address,address) view returns (address,address)"],
  priceFeed: ["function fetchPrice() view returns (uint256)"],
  erc20: [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ],
  vault: [
    "function deposit(uint256,address) returns (uint256)",
    "function redeem(uint256,address,address) returns (uint256,uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function totalAssets() view returns (uint256)",
    "function sharePrice() view returns (uint256)",
  ],
};

async function main() {
  if (!deployment.earnVault) throw new Error("Deploy the vault first: npm run deploy:mezo");
  const { ethers } = await hre.network.connect();
  const [me] = await ethers.getSigners();
  const link = (hash) => `${deployment.explorerUrl}/tx/${hash}`;
  const fmt = (v) => ethers.formatEther(v);

  const bo = new ethers.Contract(deployment.borrowerOperations, abi.borrowerOperations, me);
  const tm = new ethers.Contract(deployment.troveManager, abi.troveManager, me);
  const st = new ethers.Contract(deployment.sortedTroves, abi.sortedTroves, me);
  const pf = new ethers.Contract(deployment.priceFeed, abi.priceFeed, me);
  const musd = new ethers.Contract(deployment.musd, abi.erc20, me);
  const vault = new ethers.Contract(deployment.earnVault, abi.vault, me);

  const price = await pf.fetchPrice();
  console.log(`Wallet ${me.address}: ${fmt(await ethers.provider.getBalance(me.address))} BTC, BTC price ${fmt(price)}`);

  if (Number(await tm.getTroveStatus(me.address)) !== 1) {
    const coll = ethers.parseEther(process.env.SMOKE_COLL_BTC || "0.04");
    const debt = await bo.minNetDebt();
    const fee = (debt * (await bo.borrowingRate())) / 10n ** 18n;
    const principal = debt + fee + ethers.parseEther("200");
    const [upper, lower] = await st.findInsertPosition((coll * 10n ** 20n) / principal, ethers.ZeroAddress, ethers.ZeroAddress);
    const tx = await bo.openTrove(debt, upper, lower, { value: coll });
    await tx.wait();
    console.log(`Opened trove: ${fmt(coll)} BTC, ${fmt(debt)} MUSD borrowed  ${link(tx.hash)}`);
  }
  console.log(`Trove: ${fmt(await tm.getTroveColl(me.address))} BTC, ${fmt(await tm.getTroveDebt(me.address))} MUSD debt`);

  const amount = ethers.parseEther(process.env.SMOKE_DEPOSIT_MUSD || "100");
  if ((await musd.allowance(me.address, deployment.earnVault)) < amount) {
    const tx = await musd.approve(deployment.earnVault, ethers.MaxUint256);
    await tx.wait();
    console.log(`Approved MUSD  ${link(tx.hash)}`);
  }
  const dep = await vault.deposit(amount, me.address);
  await dep.wait();
  const shares = await vault.balanceOf(me.address);
  console.log(`Deposited ${fmt(amount)} MUSD, now ${fmt(shares)} mvMUSD  ${link(dep.hash)}`);

  const half = shares / 2n;
  const musdBefore = await musd.balanceOf(me.address);
  const red = await vault.redeem(half, me.address, me.address);
  await red.wait();
  console.log(`Redeemed ${fmt(half)} mvMUSD for ${fmt((await musd.balanceOf(me.address)) - musdBefore)} MUSD  ${link(red.hash)}`);
  console.log(`Vault value ${fmt(await vault.totalAssets())} MUSD, share price ${fmt(await vault.sharePrice())}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
