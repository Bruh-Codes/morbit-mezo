// Pure helpers, kept apart from the bot so they can be unit tested without the network.
export const WAD = 10n ** 18n;
export const MCR = 11n * 10n ** 17n; // 110%
export const CCR = 15n * 10n ** 17n; // 150%

/** Collateral ratio (1e18 = 100%) of a trove, or undefined without debt. */
export function ratio(coll, debt, price) {
  return debt > 0n ? (coll * price) / debt : undefined;
}

/** BTC price at which the trove reaches 110%. */
export function liquidationPrice(coll, debt) {
  return coll > 0n ? (debt * MCR) / coll : undefined;
}

export function pct(value) {
  return `${(Number((value * 1000n) / WAD) / 10).toFixed(1)}%`;
}

export function usd(value) {
  return `$${(Number(value / 10n ** 16n) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Alert level for a ratio. `warnAt` is the user's threshold (default 160%). Normally 120% is
 * critical; in recovery mode (system ratio under 150%) troves under 150% can be liquidated, so
 * 150% becomes the critical line.
 */
export function level(icr, warnAt, recoveryMode) {
  if (icr === undefined) return 'none';
  const critical = recoveryMode ? CCR : 12n * 10n ** 17n;
  if (icr < critical) return 'critical';
  if (icr < warnAt) return 'warn';
  return 'ok';
}

/** Notify only when the level gets worse, or recovers to ok, so users are not spammed. */
export function shouldNotify(previous, next) {
  const rank = { none: 0, ok: 0, warn: 1, critical: 2 };
  if (rank[next] > rank[previous ?? 'ok']) return true;
  return next === 'ok' && (previous === 'warn' || previous === 'critical');
}
