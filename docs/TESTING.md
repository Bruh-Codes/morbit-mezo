# Try Morbit on Mezo testnet

This takes about 10 minutes. Everything is testnet: the BTC and MUSD have no value.

App: https://morbit-mezo.vercel.app

## 1. Set up

1. Install a browser wallet such as MetaMask or Rabby.
2. Open the app and press **Connect**. The app asks your wallet to add Mezo testnet (chain 31611) and switch to it.
3. Get testnet BTC from the [Mezo faucet](https://faucet.test.mezo.org). BTC is also Mezo's gas token, so keep a little for fees.

MUSD loans start at 1,800 MUSD (plus a 200 MUSD refundable reserve). At a safe 200% ratio that needs about 0.055 BTC. If the faucet gives you less, open a [GitHub issue](https://github.com/Bruh-Codes/morbit-mezo/issues/new) with your address and we will send you some MUSD so you can test Earn (step 3).

## 2. Borrow MUSD

1. Go to **Borrow**. Enter the BTC to lock, then press **Safe max** to fill a borrow amount that keeps you at 200%.
2. Check the collateral ratio and liquidation price, then press **Open loan** and sign.
3. Press **Get liquidation alerts on Telegram**. It opens [@Morbit_testnet_bot](https://t.me/Morbit_testnet_bot) with your wallet filled in. Press Start. The bot sends your loan's ratio right away.

## 3. Earn with Auto Earn

1. Go to **Earn**, enter some MUSD and press **Approve MUSD**, then **Deposit MUSD**. You receive maMUSD shares.
2. The vault keeps your MUSD in the MUSD Stability Pool. When loans are liquidated, the pool pays the vault BTC. A keeper swaps that BTC back to MUSD on Mezo Pools every few minutes, so your share price rises.
3. MEZO rewards stream to every depositor. Press **Claim MEZO** in the Rewards panel any time.
4. Withdraw with **Withdraw** and pick 25%, 50%, 75% or All. If the vault holds BTC that has not been compounded yet, part of your withdrawal comes as BTC. That is the BTC-gain payout.

## 4. Borrow & Earn in one transaction

1. On **Earn**, open the **Borrow & Earn** tab. Enter BTC, press **Safe max**, then **Borrow & Earn**.
2. One signature opens a MUSD loan in your personal Morbit account and deposits everything borrowed into Auto Earn. The maMUSD shares go to your wallet.
3. To close, use **Repay and close** in the "Your Borrow & Earn" panel. You approve maMUSD once, then one transaction redeems the shares, repays the loan and returns your BTC, plus any BTC the vault earned.

## 5. BTC Loop (optional)

1. Go to **Loop**, enter BTC and pick 1.5x, 2x or 2.5x.
2. One transaction borrows MUSD, buys BTC with it on Mezo Pools and adds that BTC as collateral.
3. Close it from the same page. Some BTC is sold to repay and the rest comes back to your wallet.

A Morbit account holds one position at a time, so close a loop before using Borrow & Earn, and the other way round.

## 6. Trade maMUSD

Auto Earn shares have a stable pool against MUSD on Mezo Pools. You can swap maMUSD for MUSD without withdrawing from the vault, or add liquidity to earn swap fees. The pool address is in the Rewards panel on Earn and in the app footer.

## 7. Tell us what happened

Open **Activity** to see every transaction with explorer links. Then send us:

- your wallet address,
- which steps worked,
- anything confusing or broken, with a screenshot if you can.

Post it as a [GitHub issue](https://github.com/Bruh-Codes/morbit-mezo/issues/new).

## If something fails

- **"A loan is waiting to be liquidated, which pauses Stability Pool withdrawals."** This is a MUSD rule: nobody can withdraw from the Stability Pool while any loan on Mezo is under 110%. Morbit's keeper liquidates those loans every 5 minutes, which also pays Auto Earn BTC. Try again a few minutes later.
- **"Your loan would fall below the minimum debt."** Borrow at least 1,800 MUSD.
- **Wrong network.** Press any action button and approve the network switch in your wallet.
