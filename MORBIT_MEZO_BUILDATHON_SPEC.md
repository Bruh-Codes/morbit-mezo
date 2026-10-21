# Morbit · Mezo Buildathon Spec

## Buildathon

Mezo is looking for new ways to make MUSD and/or MEZO useful across DeFi or access and distribution. Projects must integrate MUSD and/or MEZO and have a working deployment. Deployments may use Mezo, Ethereum, Base, or BSC; Mezo testnet submissions are welcome. The event runs Oct 16–Nov 15, 2026, with $7,000 in MEZO prizes across two waves:

- **Wave 1:** Oct 16–26; $2,000 in prizes. Qualifying submissions advance.
- **Wave 2:** Nov 2–15; $5,000 in prizes. Final submissions close Nov 15.

Morbit targets the **DeFi track**: yield and liquidity integrations that make MUSD easier to put to work.

## Product

**Morbit is a managed liquidity interface for MUSD.** Users compare supported pools, provide liquidity, and track positions. **Simple Earn** lets a user deposit one asset into one managed position while Morbit allocates that deposit across promising eligible pools.

## V1 experience

1. **Explore pools:** search and switch among network markets; compare pool assets, protocol, TVL, estimated APR, and incentives.
2. **Pool detail:** inspect one specific pool, its network and protocol, incentives, and the user’s position.
3. **Add and withdraw liquidity:** manage a position on its pool page. Repeat deposits in the same pool accumulate in that pool position; other pools remain separate.
4. **Simple Earn:** choose an asset and amount, review how managed allocation works and its risks, confirm, then track or withdraw the position.
5. **Dashboard:** review Simple Earn and individual pool positions, deposited value, estimated earnings, current value, and available pools.
6. **Transactions:** use the existing transaction history and show simulated liquidity activity separately and clearly.

## V1 requirements

- Integrate MUSD and deploy a working product. A visual prototype alone does not meet the submission requirement.
- Distinguish live on-chain values from estimates, sample metrics, and simulated actions.
- Show the network and protocol for each pool. The same token pair may exist in distinct pools.
- Make approvals, amounts, fees, confirmation state, and withdrawal behavior understandable before and after transactions.
- Explain Simple Earn’s allocation and withdrawal behavior. Do not promise the best yield, auto-rebalancing, compounding, or guaranteed returns unless the contracts actually deliver them.

## Current state and boundary

The restored interface is a **demo**. Pool metrics and deposit/withdraw actions use sample data and local browser state; they are not yet connected to live pool contracts. Contracts must be written and integrated before the app can claim a live deployment.

V1 centers on pool discovery, add/withdraw flows, Simple Earn allocation and withdrawal, position tracking, and transaction visibility. Cross-chain optimization, automatic rebalancing, and auto-compounding remain later scope until implemented and verifiable.

## Submission bar

A reviewer can connect a wallet, discover MUSD pools, understand where a deposit goes, complete a real deposit and withdrawal on a deployed network, and verify the resulting position and transaction. Every live value and demo estimate is clearly identified.
