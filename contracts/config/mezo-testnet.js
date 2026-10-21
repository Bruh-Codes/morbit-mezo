// MUSD system on Mezo testnet (chain 31611).
// Sources: https://mezo.org/docs/users/resources/contracts-reference/ and mezo-org/musd deployments.
// StabilityPool, SortedTroves and the oracle are read from TroveManager at deploy time.
export const mezoTestnet = {
  chainId: 31611,
  rpcUrl: "https://rpc.test.mezo.org",
  explorerUrl: "https://explorer.test.mezo.org",
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  btc: "0x7b7C000000000000000000000000000000000000",
  mezo: "0x7B7c000000000000000000000000000000000001",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
};
