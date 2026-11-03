# Morbit alerts

Live on testnet as [@Morbit_testnet_bot](https://t.me/Morbit_testnet_bot). The app's "Get alerts" button links here.

A Telegram bot that watches MUSD loans and Morbit BTC loops on Mezo and messages you before they get close to liquidation. It can also act as the Auto Earn keeper.

- Warns once when a position drops under your threshold (default 160%), again if it becomes critical (under 120%, or under 150% while Mezo is in recovery mode), and once more when it is back to safe. It never repeats the same alert.
- Watches both the wallet's own loan and its Morbit BTC loop account.
- `/watch`, `/unwatch`, `/status`, `/threshold 170`. A link like `https://t.me/Morbit_testnet_bot?start=<address>` subscribes a wallet in one tap (the app's "Get alerts" button uses it).
- With `KEEPER_PRIVATE_KEY` set, it liquidates loans under 110% (which unblocks Stability Pool withdrawals and pays depositors BTC) and compounds Auto Earn once its BTC gains reach the minimum, every 5 minutes. Anyone can call `harvest`, so this is a convenience, not a dependency.

## Run on Vercel (recommended)

The web app also runs the bot, so it is always on and costs nothing extra. Code: `web/modules/alerts/` and `web/app/api/`.

1. In the Vercel project, open **Storage**, add **Upstash for Redis** (free) and connect it. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. In **Settings → Environment Variables** add `TELEGRAM_BOT_TOKEN` (from @BotFather) and `CRON_SECRET` (any long random string). Optional: `KEEPER_PRIVATE_KEY` (a spare testnet wallet with a little BTC) and `APP_URL`. Redeploy.
3. Open `https://<your-site>/api/telegram/setup/?key=<CRON_SECRET>` once. The bot now answers through the webhook.
4. For the 5-minute checks, add the GitHub repository secrets `APP_URL` and `CRON_SECRET`. The `Alerts` workflow (`.github/workflows/alerts.yml`) calls `/api/alerts/check/` every 5 minutes.

Telegram allows either the webhook or the local bot below, not both, so stop `npm start` once the webhook is set.

## Run locally

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
