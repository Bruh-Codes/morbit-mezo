# Morbit · Mezo Buildathon Spec

## Buildathon

Mezo is looking for new ways to make MUSD and MEZO useful across DeFi or access and distribution. Projects must integrate MUSD and/or MEZO and have a working deployment (Mezo testnet is fine). Wave 1 runs Oct 16–26, 2026 and Wave 2 runs Nov 2–15, 2026, with $7,000 in MEZO prizes. Scoring: integration depth 30%, viability 30%, technical 20%, UX 10%, materials 10%. Submissions need a live link, a public repo, a deck and a 2-minute video.

Morbit targets the **DeFi track**.

## Product

**Morbit lets a BTC holder borrow MUSD and put it to work in one app.**

1. **Borrow:** open and manage a MUSD trove (BTC collateral) through Mezo's BorrowerOperations, with collateral ratio, liquidation price, fees and the 200 MUSD reserve shown before signing.
2. **Simple Earn:** deposit MUSD into `MorbitEarnVault`, which supplies it to the MUSD Stability Pool and passes BTC liquidation gains back pro-rata.
3. **Dashboard:** wallet balances (BTC, MUSD, MEZO), trove health, Simple Earn value.
4. **Activity:** vault events from chain plus every transaction sent from Morbit, all with explorer links.

## Rules for the UI

- Every value is live from Mezo testnet. When a read fails the UI shows a dash, never a made-up number.
- Explain where deposits go and how withdrawals behave, including the Stability Pool's block on withdrawals while a trove is below 110%.
- Do not promise yield, auto-rebalancing or compounding.

## Submission bar

A reviewer can connect a wallet on Mezo testnet, open a trove, deposit MUSD into Simple Earn, withdraw it, and check every step on the explorer.

## Wave 2 ideas

- Second Simple Earn strategy (MUSD liquidity pools on Mezo) with an allocation the user can see.
- One-click "borrow and earn": open a trove and deposit the MUSD in one flow.
- Use MEZO, for example as a fee discount or a reward for vault depositors.
- Mainnet deployment after review.
