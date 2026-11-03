# Morbit alerts

A Telegram bot that watches MUSD loans and Morbit BTC loops on Mezo and messages you before they get close to liquidation. It can also act as the Auto Earn keeper.

- Warns once when a position drops under your threshold (default 160%), again if it becomes critical (under 120%, or under 150% while Mezo is in recovery mode), and once more when it is back to safe. It never repeats the same alert.
- Watches both the wallet's own loan and its Morbit BTC loop account.
- `/watch`, `/unwatch`, `/status`, `/threshold 170`. A link like `https://t.me/<bot>?start=<address>` subscribes a wallet in one tap (the app's "Get alerts" button uses it).
- With `KEEPER_PRIVATE_KEY` set, it compounds Auto Earn every 30 minutes once the vault's BTC gains reach the minimum. Anyone can call `harvest`, so this is a convenience, not a dependency.

## Run

```
cd alerts
npm install
TELEGRAM_BOT_TOKEN=<token from @BotFather> npm start
```

Check a wallet without Telegram:

```
node check.js 0xd5Ff4A4458BC8d2684A452C0C57531731410F3f4
# BTC $76,670 · system ratio 275.3%
# MUSD loan: 153.3%, liquidation at $55,010
```

Optional env: `MEZO_RPC_URL`, `CHECK_EVERY_SECONDS` (60), `DATA_FILE` (`./data/subscriptions.json`), `KEEPER_PRIVATE_KEY`, `APP_URL`.

Addresses come from `web/ui-config/mezoDeployment.json`, so the bot follows whatever the app is deployed against.
