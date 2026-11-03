import { defineConfig, configVariable } from "hardhat/config";
import hardhatIgnition from "@nomicfoundation/hardhat-ignition";
import hardhatIgnitionEthers from "@nomicfoundation/hardhat-ignition-ethers";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatKeystore, hardhatEthers, hardhatIgnition, hardhatIgnitionEthers, hardhatVerify],
  solidity: {
    version: "0.8.28",
    // Optional local solc binary for machines that cannot download compilers.
    ...(process.env.SOLC_PATH ? { path: process.env.SOLC_PATH } : {}),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
    npmFilesToBuild: [
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ],
  },
  // Source verification on the Mezo testnet explorer (Blockscout; no API key needed):
  //   npx hardhat verify --network mezoTestnet --build-profile production <address> <constructor args...>
  // scripts/deploy-earn-v3.js verifies everything it deploys.
  chainDescriptors: {
    31611: {
      name: "Mezo Testnet",
      blockExplorers: {
        blockscout: {
          name: "Mezo Explorer",
          url: "https://explorer.test.mezo.org",
          apiUrl: "https://api.explorer.test.mezo.org/api",
        },
      },
    },
  },
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
    sourcify: { enabled: false },
  },
  networks: {
    development: {
      type: "edr-simulated",
      chainType: "l1",
    },
    mezoTestnet: {
      type: "http",
      url: process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org",
      chainId: 31611,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    robinhoodTestnet: {
      type: "http",
      url: configVariable("ROBINHOOD_RPC_URL"),
      chainId: Number(process.env.ROBINHOOD_CHAIN_ID || 46630),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    arbitrumSepolia: {
      type: "http",
      url: configVariable("ARBITRUM_RPC_URL"),
      chainId: Number(process.env.ARBITRUM_CHAIN_ID || 421614),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
