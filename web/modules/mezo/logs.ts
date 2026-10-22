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
