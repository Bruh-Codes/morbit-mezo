# Security review (Wave 2)

This is an internal review of Morbit's contracts. They have not been audited and run on Mezo testnet only.

## Scope

| Contract | Role |
| --- | --- |
| `MorbitEarnVault` | Simple Earn. Pools MUSD into the MUSD Stability Pool; shares pay out MUSD and BTC pro rata. Live since Wave 1. |
| `MorbitEarnVaultV2` | Auto Earn. Same accounting, plus `harvest()` (BTC gains → MUSD on Mezo Pools → redeposit) and a MEZO reward stream. |
| `MezoPoolsSwapper` | Stateless BTC ⇄ MUSD swaps on the Mezo Pools BTC/MUSD pool. Spends native BTC through the BTC ERC20 precompile. |
| `MorbitLoopAccount`, `MorbitLoopFactory` | Per-user account that owns a MUSD trove, so a leveraged BTC loop opens or closes in one transaction. |

## How it was checked

- **Tests:** 34 Hardhat tests against mocks of the Stability Pool, BorrowerOperations/TroveManager, price feed and swapper (`cd contracts && npm test`). They cover deposits, redemptions, pausing, caps, BTC gains, harvest slippage limits, the undercollateralized-trove guard, reward accrual across deposits/transfers/withdrawals, reward rollover, owner-only settings, a donation inflation attack, loop open/close, shortfall pulls and access control.
- **Live simulations:** `eth_call` runs against Mezo testnet state. A 0.001 BTC → 78.59 MUSD swap through `MezoPoolsSwapper` left no dust. A full loop opened (0.05 BTC + 2,000 MUSD → 0.0754 BTC collateral, 2,202 MUSD debt) and closed (0.0454 BTC returned).
- **Manual review:** findings below.

## Threats and mitigations

**Swap price manipulation (harvest, loop).** Every swap has two floors: the caller's `min` and the MUSD oracle price (`PriceFeed.fetchPrice`, not the pool) minus a fixed tolerance. The tolerance is 3% for harvest (owner-settable, hard cap 10%) and 5% for loops. A sandwiched or drained pool makes the transaction revert; it does not lose value. A harvest at the oracle price leaves the share price unchanged (tested), so harvest timing cannot be used to extract value from other depositors.

**Malicious or broken swapper.** The vault sends only the BTC being harvested to the swapper, and then checks its own MUSD balance increased by at least the floor. The worst a bad swapper can do is revert harvests. Changing it is `onlyOwner` and emits `SwapperUpdated`.

**Reentrancy.** All state-changing vault and loop functions are `nonReentrant`. BTC is sent last, after state updates. The vaults accept BTC only from the Stability Pool.

**Withdrawals always available.** Pausing blocks deposits only. `redeem` does not read the oracle, so a stalled price feed cannot trap funds. The one exception is inherited from MUSD: the Stability Pool blocks withdrawals while an undercollateralized trove is waiting to be liquidated. The app explains this in plain language. `harvest` uses a zero-amount withdrawal, which still works in that state (tested).

**Share inflation (first depositor).** The share math uses a virtual share and asset. On top of that, the deploy script seeds 1 MUSD of shares to `0x…dEaD`, so the vault is never empty. The test shows a donation attack on an unseeded vault costs the attacker more than the victim.

**Rewards.** These use StakingRewards accounting, with rewards settled in `_update` before every mint, burn and transfer, so moving shares cannot double-claim (tested). Only the owner can fund a stream, and funding pulls the MEZO first. *Limitation:* the "never promise more than the balance" check counts rewards that are earned but unclaimed as available. Mitigation: fund streams from fresh MEZO and do not withdraw it. There is no owner path to remove reward tokens.

**Loop accounts.** Only the owner, or the factory acting for `msg.sender`'s own account, can call `openLoop`, `closeLoop`, `addCollateral` or `sweep` (tested: another wallet's factory call opens its own account). `closeLoop` pulls a MUSD shortfall from the owner only up to an allowance the owner granted. Hints are untrusted inputs; a bad hint costs gas but cannot move funds. Leverage is bounded by MUSD's own 110% / recovery-mode rules, which revert unsafe positions.

**Owner powers.** On the vaults: deposit cap, pausing deposits, swapper, harvest slippage (≤10%), and funding rewards. The owner cannot move user MUSD, BTC or shares. The loop has no owner.

## Known limitations

- The contracts are unaudited and run on testnet only. The Stability Pool, BorrowerOperations and the oracle are trusted MUSD contracts.
- Loop positions are ordinary MUSD troves and can be liquidated like any other. The app and the Telegram bot warn below 160%.
- The 200 MUSD gas compensation is hard-coded in `MorbitLoopAccount.closeLoop` to match MUSD's `MUSD_GAS_COMPENSATION`.
- Static analysis (Slither) was not run in this environment, so it is the next step before any mainnet deployment.
