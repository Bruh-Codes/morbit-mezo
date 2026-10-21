import { formatUnits, parseUnits } from 'viem';

const WAD = 10n ** 18n;

export function toNumber(value?: bigint, decimals = 18) {
  return value === undefined ? undefined : Number(formatUnits(value, decimals));
}

export function fmtAmount(value?: bigint, maxDigits = 4) {
  const n = toNumber(value);
  if (n === undefined) return '—';
  if (n !== 0 && Math.abs(n) < 10 ** -maxDigits) return `<${(10 ** -maxDigits).toFixed(maxDigits)}`;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
}

export function fmtUsd(value?: bigint, compact = false) {
  const n = toNumber(value);
  if (n === undefined) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 2 : 2,
  });
}

/** A ratio in 1e18 precision (1e18 = 100%) as a percentage. */
export function fmtRatio(value?: bigint, digits = 1) {
  if (value === undefined) return '—';
  if (value > 10n ** 30n) return '∞';
  return `${Number(formatUnits(value, 16)).toLocaleString('en-US', {
    maximumFractionDigits: digits,
  })}%`;
}

/** BTC amount (18 decimals) valued at the 18-decimal price, in MUSD/USD wei. */
export function btcValue(amount?: bigint, price?: bigint) {
  if (amount === undefined || price === undefined) return undefined;
  return (amount * price) / WAD;
}

export function parseAmount(text: string): bigint | undefined {
  const clean = text.trim();
  if (!clean || !/^\d*\.?\d*$/.test(clean) || clean === '.') return undefined;
  try {
    return parseUnits(clean, 18);
  } catch {
    return undefined;
  }
}

/** Collateral ratio of `coll` BTC against `debt` MUSD at `price`. */
export function collateralRatio(coll: bigint, debt: bigint, price?: bigint) {
  if (!price || debt === 0n) return undefined;
  return (coll * price) / debt;
}

/** BTC price at which a trove with this collateral and debt reaches the 110% MCR. */
export function liquidationPrice(coll?: bigint, debt?: bigint, mcr = 1_100_000_000_000_000_000n) {
  if (!coll || !debt) return undefined;
  return (debt * mcr) / coll;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function timeAgo(timestamp: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Plain decimal string for an input field (up to 8 decimals, rounded down). */
export function fmtPlain(value: bigint) {
  const whole = value / WAD;
  const frac = (value % WAD).toString().padStart(18, '0').slice(0, 8).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Amount with its token symbol, or a bare dash when unknown. */
export function fmtToken(symbol: string, value?: bigint, maxDigits = 4) {
  return value === undefined ? '—' : `${fmtAmount(value, maxDigits)} ${symbol}`;
}
