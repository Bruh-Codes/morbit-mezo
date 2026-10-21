<img width="400" alt="Morbit" src="https://github.com/user-attachments/assets/85b0d927-08fc-44fe-a48f-8097a326785f" />

# Morbit: borrow MUSD against BTC, then put it to work

Morbit is a MUSD app on Mezo. In one place you can:

- **Borrow:** open a trove with BTC as collateral and mint MUSD, then add or withdraw collateral, borrow more, repay, or close. Morbit calls Mezo's own MUSD contracts (`BorrowerOperations`, `TroveManager`, `SortedTroves`, `PriceFeed`), so the trove lives in the MUSD protocol.
- **Simple Earn:** deposit MUSD into the Morbit vault (`MorbitEarnVault`, share token `mvMUSD`). The vault supplies everything to the MUSD Stability Pool, which pays the debt of liquidated troves and gives depositors their BTC collateral. Withdrawals pay out your share of the vault's MUSD and BTC.
- **Dashboard and Activity:** see wallet balances (BTC, MUSD, MEZO), trove health, liquidation price and Simple Earn value, plus every transaction with an explorer link.

Everything in the UI is read from Mezo testnet (chain 31611). There is no sample data.

Built for the [Mezo Buildathon](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10), DeFi track.

---

## How it fits together

```
           Morbit web app (Next.js, wagmi, viem)
              │                         │
     Borrow   │                         │  Simple Earn
              ▼                         ▼
   MUSD BorrowerOperations      MorbitEarnVault (mvMUSD)
   TroveManager, SortedTroves           │ provideToSP / withdrawFromSP
   PriceFeed                            ▼
              │                  MUSD StabilityPool
              └──── BTC collateral ◄────┘ liquidation gains (BTC)
```

### MUSD integration

| What Morbit does | MUSD contract | Function |
|---|---|---|
| Open a trove, BTC in, MUSD out | BorrowerOperations | `openTrove` (payable) |
| Add or withdraw BTC, borrow more, repay | BorrowerOperations | `adjustTrove` |
| Close a trove | BorrowerOperations | `closeTrove` |
| Hints so trove inserts stay cheap | SortedTroves | `findInsertPosition` |
| Trove state, collateral ratio, system ratio | TroveManager | `getTroveStatus`, `getTroveColl`, `getTroveDebt`, `getCurrentICR`, `getTCR` |
| Minimum debt and borrowing fee | BorrowerOperations | `minNetDebt`, `borrowingRate` |
| BTC price | PriceFeed | `fetchPrice` |
| Simple Earn deposits and withdrawals | StabilityPool | `provideToSP`, `withdrawFromSP` |
| Vault value | StabilityPool | `getCompoundedMUSDDeposit`, `getDepositorCollateralGain` |

### MorbitEarnVault

`contracts/contracts/MorbitEarnVault.sol`

- `deposit(assets, receiver)` takes MUSD, mints mvMUSD at the current share price and supplies the MUSD to the Stability Pool in the same transaction.
- `redeem(shares, receiver, owner)` burns shares and pays the pro-rata MUSD and BTC. Nothing is swapped.
- `totalAssets()` values the vault in MUSD: idle MUSD, plus the compounded Stability Pool deposit, plus held and pending BTC at the MUSD PriceFeed price.
- A virtual share and asset of 1 protect against first-depositor inflation. Only the Stability Pool can send BTC to the vault.
- The owner can set a deposit cap or pause deposits. Withdrawals can never be paused.
- The Stability Pool refuses MUSD withdrawals while a trove sits below 110% and has not been liquidated yet. The vault passes that revert through, and the UI explains it.

Earnings come only from liquidations, so they can be zero for long periods. The vault is not audited.

---

## Addresses (Mezo testnet, chain 31611)

| Contract | Address |
|---|---|
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| BorrowerOperations | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| BTC (ERC-20 precompile) | `0x7b7C000000000000000000000000000000000000` |
| MEZO (ERC-20 precompile) | `0x7B7c000000000000000000000000000000000001` |
| StabilityPool, SortedTroves | Read from `TroveManager` at deploy time |
| MorbitEarnVault | Written to `web/ui-config/mezoDeployment.json` by the deploy script |

Sources: [Mezo contracts reference](https://mezo.org/docs/users/resources/contracts-reference/) and [mezo-org/musd](https://github.com/mezo-org/musd).

---

## Run it

### Contracts

```bash
cd contracts
yarn install
yarn test                 # vault tests against a mock Stability Pool and PriceFeed
```

Deploy the vault and run a live end-to-end check on Mezo testnet:

```bash
cp .env.example .env      # set DEPLOYER_PRIVATE_KEY, funded with testnet BTC
export DEPLOYER_PRIVATE_KEY=0x...
yarn deploy:mezo          # deploys MorbitEarnVault, writes web/ui-config/mezoDeployment.json
yarn smoke:mezo           # opens a trove, deposits MUSD into the vault, redeems half
```

Get testnet BTC from the [Mezo faucet](https://faucet.test.mezo.org). The smoke test locks 0.04 BTC by default (`SMOKE_COLL_BTC`), because the minimum trove debt is 1,800 MUSD plus a 200 MUSD reserve.

If Hardhat cannot download the compiler, point `SOLC_PATH` at a local solc 0.8.28 binary.

### Web app

```bash
cd web
yarn install
cp .env.example .env.local   # optional: WalletConnect project id, custom RPC
yarn dev
```

Connect a wallet such as MetaMask. The app asks to add and switch to Mezo testnet.

### Deploy the web app

`web/` is a standard Next.js app. On Vercel, import the repo and set the root directory to `web`.

---

## Repository

```
contracts/
  contracts/MorbitEarnVault.sol     Simple Earn vault
  contracts/mocks/                  Test doubles for the Stability Pool, PriceFeed and MUSD
  test/MorbitEarnVault.ts           Vault tests
  scripts/deploy-mezo.js            Deploys the vault and writes the web config
  scripts/smoke-mezo.js             Live end-to-end check on Mezo testnet
  config/mezo-testnet.js            MUSD system addresses
web/
  modules/mezo/                     All app logic: config, ABIs, hooks, pages
  app/(main)/                       Routes: /, /borrow, /earn, /dashboard, /history
  ui-config/mezoDeployment.json     Addresses the app reads
```

## Limits

- Testnet only. The vault is not audited.
- Simple Earn uses one strategy, the MUSD Stability Pool. Morbit does not rebalance, compound or swap BTC gains.
- The Activity page reads vault events from chain. Trove actions are listed from this browser's own record, each with its real transaction hash.
