// Mezo's RPC rejects log queries wider than 10,000 blocks, so history is read in chunks.
const CHUNK = 10_000n;
const PARALLEL = 10;

/** Split [from, to] into RPC-sized ranges, newest first. */
function ranges(from: bigint, to: bigint) {
  const out: [bigint, bigint][] = [];
  for (let end = to; end >= from; end -= CHUNK) {
    const start = end - CHUNK + 1n > from ? end - CHUNK + 1n : from;
    out.push([start, end]);
    if (start === from) break;
  }
  return out;
}

/** Run chunked queries a few at a time and flatten the results. */
export async function chunked<T>(
  from: bigint,
  to: bigint,
  query: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>
): Promise<T[]> {
  const parts = ranges(from, to);
  const results: T[] = [];
  for (let i = 0; i < parts.length; i += PARALLEL) {
    const batch = await Promise.all(parts.slice(i, i + PARALLEL).map(([a, b]) => query(a, b)));
    batch.forEach((r) => results.push(...r));
  }
  return results;
}

type Cache<T> = { from: string; to: string; items: T[] };
const RESCAN = 100n; // Re-read the newest blocks in case the node had not indexed them yet.
const tag = (_: string, v: unknown) => (typeof v === 'bigint' ? `n:${v}` : v);
const untag = (_: string, v: unknown) =>
  typeof v === 'string' && /^n:-?\d+$/.test(v) ? BigInt(v.slice(2)) : v;

/**
 * Like `chunked`, but remembers what it already read in this browser and only scans new
 * blocks on later loads. Without it, history gets slower every day the chain grows.
 */
export async function cachedChunked<T extends { block: bigint }>(
  key: string,
  from: bigint,
  to: bigint,
  query: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>
): Promise<T[]> {
  const storageKey = `morbit.logs.${key}`;
  let cached: Cache<T> | undefined;
  try {
    const raw = localStorage.getItem(storageKey);
    cached = raw ? (JSON.parse(raw, untag) as Cache<T>) : undefined;
  } catch {
    cached = undefined;
  }
  const usable = cached && BigInt(cached.from) === from && BigInt(cached.to) <= to;
  const start = usable ? BigInt(cached!.to) - RESCAN : from;
  const scanFrom = start > from ? start : from;
  const kept = usable ? cached!.items.filter((item) => item.block < scanFrom) : [];
  const fresh = await chunked(scanFrom, to, query);
  const items = [...kept, ...fresh];
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ from: from.toString(), to: to.toString(), items }, tag)
    );
  } catch {
    // Storage full or blocked: history still works, just without the cache.
  }
  return items;
}
