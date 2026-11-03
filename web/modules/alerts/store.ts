// Alert subscriptions in Upstash Redis, over its REST API (no client library needed).
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN; plain Upstash sets
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Either works.
import type { Level } from './risk';

export type Chat = { addresses: string[]; warnAt: string; last: Record<string, Level> };

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CHATS = 'morbit:alerts:chats';
const key = (id: number | string) => `morbit:alerts:chat:${id}`;

export const storeConfigured = Boolean(URL && TOKEN);

async function redis<T>(...command: (string | number)[]): Promise<T> {
  if (!URL || !TOKEN) throw new Error('Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN).');
  const res = await fetch(URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  const json = (await res.json()) as { result?: T; error?: string };
  if (json.error) throw new Error(`redis: ${json.error}`);
  return json.result as T;
}

export async function getChat(id: number | string, warnAt: string): Promise<Chat> {
  const raw = await redis<string | null>('GET', key(id));
  return raw ? (JSON.parse(raw) as Chat) : { addresses: [], warnAt, last: {} };
}

export async function saveChat(id: number | string, chat: Chat) {
  await redis('SET', key(id), JSON.stringify(chat));
  if (chat.addresses.length) await redis('SADD', CHATS, String(id));
  else await redis('SREM', CHATS, String(id));
}

export async function chatIds(): Promise<string[]> {
  return redis<string[]>('SMEMBERS', CHATS);
}
