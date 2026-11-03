// Morbit alerts: a Telegram bot that watches MUSD loans and Morbit BTC loops on Mezo testnet
// and messages you before they get close to liquidation. Optionally also runs the Auto Earn
// keeper (compounds the vault's BTC gains when there are enough).
//
//   TELEGRAM_BOT_TOKEN=... npm start
//
// Optional env:
//   MEZO_RPC_URL         default from web/ui-config/mezoDeployment.json
//   CHECK_EVERY_SECONDS  default 60
//   DATA_FILE            default ./data/subscriptions.json
//   KEEPER_PRIVATE_KEY   if set, calls AutoEarn.harvest() when BTC gains reach the minimum
//   APP_URL              link in messages, default https://morbit-mezo.vercel.app
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWalletClient, getAddress, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { abi, chain, client, dep, describe, positions, systemState } from './chain.js';
import { level, pct, ratio, shouldNotify, usd, WAD } from './risk.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Set TELEGRAM_BOT_TOKEN (create a bot with @BotFather).');
  process.exit(1);
}
const API = `https://api.telegram.org/bot${TOKEN}`;
const CHECK_MS = Number(process.env.CHECK_EVERY_SECONDS || 60) * 1000;
const KEEPER_MS = 30 * 60 * 1000;
const DATA_FILE = process.env.DATA_FILE || path.resolve(here, 'data/subscriptions.json');
const APP_URL = process.env.APP_URL || 'https://morbit-mezo.vercel.app';
const DEFAULT_WARN = 16n * 10n ** 17n; // 160%

// --- Subscriptions: { [chatId]: { addresses: string[], warnAt: string, last: { [key]: level } } } ---

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function save(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
const db = load();
const chat = (id) => (db[id] ??= { addresses: [], warnAt: DEFAULT_WARN.toString(), last: {} });
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// --- Telegram ---

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}
const send = (chatId, text) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch(
    (e) => console.error(e.message),
  );

// --- Commands ---

async function handle(message) {
  const id = message.chat.id;
  const [cmd, arg] = (message.text || '').trim().split(/\s+/);
  const c = chat(id);

  if (cmd === '/start' || cmd === '/help') {
    if (arg && isAddress(arg)) return watch(id, arg);
    return send(
      id,
      [
        '<b>Morbit alerts</b> watch your MUSD loan and BTC loop on Mezo and warn you before liquidation.',
        '',
        '/watch <i>address</i>: start watching a wallet',
        '/unwatch <i>address</i>: stop',
        '/status: current ratios',
        '/threshold <i>percent</i>: warn below this ratio (default 160)',
      ].join('\n'),
    );
  }
  if (cmd === '/watch') {
    if (!arg || !isAddress(arg)) return send(id, 'Send /watch followed by a wallet address.');
    return watch(id, arg);
  }
  if (cmd === '/unwatch') {
    c.addresses = c.addresses.filter((a) => a.toLowerCase() !== (arg || '').toLowerCase());
    save(db);
    return send(id, c.addresses.length ? `Still watching ${c.addresses.map(short).join(', ')}.` : 'Not watching any wallet.');
  }
  if (cmd === '/threshold') {
    const n = Number(arg);
    if (!(n >= 120 && n <= 400)) return send(id, 'Pick a number between 120 and 400, e.g. /threshold 170.');
    c.warnAt = ((BigInt(Math.round(n * 10)) * WAD) / 1000n).toString();
    save(db);
    return send(id, `You will be warned below ${n}%.`);
  }
  if (cmd === '/status') return status(id);
  return send(id, 'Try /watch, /status or /help.');
}

async function watch(id, address) {
  const c = chat(id);
  const a = getAddress(address);
  if (!c.addresses.includes(a)) c.addresses.push(a);
  save(db);
  await send(id, `Watching ${short(a)}. I will message you when a position drops below ${pct(BigInt(c.warnAt))}.`);
  return status(id);
}

async function status(id) {
  const c = chat(id);
  if (!c.addresses.length) return send(id, 'Not watching any wallet yet. Send /watch <address>.');
  const { price, tcr, recoveryMode } = await systemState();
  const lines = [`BTC ${usd(price)} · system ratio ${pct(tcr)}${recoveryMode ? ' (recovery mode)' : ''}`];
  for (const a of c.addresses) {
    const list = await positions(a);
    lines.push('', `<b>${short(a)}</b>`);
    if (!list.length) lines.push('No open loan or loop.');
    for (const p of list) lines.push(describe(p, price));
  }
  lines.push('', `<a href="${APP_URL}/dashboard/">Open Morbit</a>`);
  return send(id, lines.join('\n'));
}

// --- Loops ---

async function checkAll() {
  const chats = Object.keys(db).filter((id) => db[id].addresses.length);
  if (!chats.length) return;
  const { price, recoveryMode } = await systemState();
  for (const id of chats) {
    const c = db[id];
    for (const a of c.addresses) {
      const list = await positions(a).catch(() => []);
      for (const p of list) {
        const icr = ratio(p.coll, p.debt, price);
        const next = level(icr, BigInt(c.warnAt), recoveryMode);
        if (shouldNotify(c.last[p.key], next)) {
          const head =
            next === 'critical'
              ? '🚨 <b>Liquidation risk</b>'
              : next === 'warn'
                ? '⚠️ <b>Getting close</b>'
                : '✅ <b>Back to safe</b>';
          const advice = next === 'ok' ? '' : '\nAdd BTC or repay to raise the ratio.';
          await send(
            id,
            `${head}\n${short(a)} ${describe(p, price)}\nBTC is ${usd(price)}.${
              recoveryMode ? ' Mezo is in recovery mode: loans under 150% can be liquidated.' : ''
            }${advice}\n<a href="${APP_URL}/${p.label === 'BTC loop' ? 'loop' : 'borrow'}/">Open Morbit</a>`,
          );
        }
        c.last[p.key] = next;
      }
    }
  }
  save(db);
}

async function keeper() {
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key || !dep.autoEarnVault) return;
  const [btc, min] = await Promise.all([
    client.readContract({ address: dep.autoEarnVault, abi: abi.autoEarn, functionName: 'totalBtc' }),
    client.readContract({ address: dep.autoEarnVault, abi: abi.autoEarn, functionName: 'minHarvestBtc' }),
  ]);
  if (btc < min || btc === 0n) return;
  const wallet = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(key) });
  const hash = await wallet.writeContract({
    address: dep.autoEarnVault,
    abi: abi.autoEarn,
    functionName: 'harvest',
    args: [0n],
  });
  console.log(`Compounded ${Number(btc) / 1e18} BTC: ${dep.explorerUrl}/tx/${hash}`);
}

async function pollTelegram() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50 });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message?.text) await handle(u.message).catch((e) => console.error(e.message));
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const every = (ms, fn) => {
  const run = () => fn().catch((e) => console.error(e.message));
  run();
  setInterval(run, ms);
};

const me = await tg('getMe', {});
console.log(`@${me.username} is running. Share https://t.me/${me.username}?start=<address> to subscribe a wallet.`);
every(CHECK_MS, checkAll);
every(KEEPER_MS, keeper);
pollTelegram();
