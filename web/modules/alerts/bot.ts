// Morbit liquidation alerts on Telegram, run as Vercel route handlers:
//   POST /api/telegram/        Telegram webhook (commands)
//   GET  /api/alerts/check/    called every few minutes; sends alerts and runs the keeper
//   GET  /api/telegram/setup/  points the bot's webhook at this deployment
import { createHash } from 'node:crypto';

import { type Address, getAddress, isAddress } from 'viem';

import { describe, explorerUrl, positions, runKeeper, systemState } from './chain';
import { DEFAULT_WARN, level, pct, ratio, shouldNotify, usd, WAD } from './risk';
import { chatIds, getChat, saveChat } from './store';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || 'https://morbit-mezo.vercel.app';
const WARN = DEFAULT_WARN.toString();

/** Secret Telegram echoes on every webhook call, derived from the token so there is one less env var. */
export function webhookSecret() {
  return TOKEN
    ? createHash('sha256').update(`morbit-webhook:${TOKEN}`).digest('hex').slice(0, 48)
    : undefined;
}

/** Checks `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`. */
export function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return (
    request.headers.get('authorization') === `Bearer ${secret}` ||
    url.searchParams.get('key') === secret
  );
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

const send = (chatId: number | string, text: string) =>
  tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }).catch((e) => console.error(e));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// --- Commands ---

export async function handleUpdate(update: { message?: { chat: { id: number }; text?: string } }) {
  const message = update.message;
  if (!message?.text) return;
  const id = message.chat.id;
  const [cmd, arg] = message.text.trim().split(/\s+/);
  const command = cmd.split('@')[0];

  if (command === '/start' || command === '/help') {
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
      ].join('\n')
    );
  }
  if (command === '/watch') {
    if (!arg || !isAddress(arg)) return send(id, 'Send /watch followed by a wallet address.');
    return watch(id, arg);
  }
  if (command === '/unwatch') {
    const chat = await getChat(id, WARN);
    chat.addresses = chat.addresses.filter((a) => a.toLowerCase() !== (arg || '').toLowerCase());
    await saveChat(id, chat);
    return send(
      id,
      chat.addresses.length
        ? `Still watching ${chat.addresses.map(short).join(', ')}.`
        : 'Not watching any wallet.'
    );
  }
  if (command === '/threshold') {
    const n = Number(arg);
    if (!(n >= 120 && n <= 400))
      return send(id, 'Pick a number between 120 and 400, e.g. /threshold 170.');
    const chat = await getChat(id, WARN);
    chat.warnAt = ((BigInt(Math.round(n * 10)) * WAD) / 1000n).toString();
    await saveChat(id, chat);
    return send(id, `You will be warned below ${n}%.`);
  }
  if (command === '/status') return status(id);
  return send(id, 'Try /watch, /status or /help.');
}

async function watch(id: number, address: string) {
  const chat = await getChat(id, WARN);
  const a = getAddress(address);
  if (!chat.addresses.includes(a)) chat.addresses.push(a);
  await saveChat(id, chat);
  await send(
    id,
    `Watching ${short(a)}. I will message you when a position drops below ${pct(
      BigInt(chat.warnAt)
    )}.`
  );
  return status(id);
}

async function status(id: number) {
  const chat = await getChat(id, WARN);
  if (!chat.addresses.length)
    return send(id, 'Not watching any wallet yet. Send /watch <address>.');
  const { price, tcr, recoveryMode } = await systemState();
  const lines = [
    `BTC ${usd(price)} · system ratio ${pct(tcr)}${recoveryMode ? ' (recovery mode)' : ''}`,
  ];
  for (const a of chat.addresses) {
    const list = await positions(a as Address);
    lines.push('', `<b>${short(a)}</b>`);
    if (!list.length) lines.push('No open loan or loop.');
    for (const p of list) lines.push(describe(p, price));
  }
  lines.push('', `<a href="${APP_URL}/dashboard/">Open Morbit</a>`);
  return send(id, lines.join('\n'));
}

// --- Periodic check ---

export async function checkAll() {
  const ids = await chatIds();
  let sent = 0;
  if (ids.length) {
    const { price, recoveryMode } = await systemState();
    for (const id of ids) {
      const chat = await getChat(id, WARN);
      let changed = false;
      for (const a of chat.addresses) {
        const list = await positions(a as Address).catch(() => []);
        for (const p of list) {
          const next = level(ratio(p.coll, p.debt, price), BigInt(chat.warnAt), recoveryMode);
          if (shouldNotify(chat.last[p.key], next)) {
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
              }${advice}\n<a href="${APP_URL}/${
                p.label === 'BTC loop'
                  ? 'loop/'
                  : p.label === 'Borrow & Earn'
                  ? 'earn/?tab=borrow'
                  : 'borrow/'
              }">Open Morbit</a>`
            );
            sent++;
          }
          if (chat.last[p.key] !== next) {
            chat.last[p.key] = next;
            changed = true;
          }
        }
      }
      if (changed) await saveChat(id, chat);
    }
  }
  const keeper = await runKeeper().catch((e: Error) => [`keeper error: ${e.message}`]);
  return {
    chats: ids.length,
    alertsSent: sent,
    keeper: keeper.map((l) => l.replace(/(0x[0-9a-f]{64})/, `${explorerUrl}/tx/$1`)),
  };
}
