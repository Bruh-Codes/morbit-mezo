import assert from 'node:assert/strict';
import { test } from 'node:test';

import { level, liquidationPrice, ratio, shouldNotify, usd, WAD } from './risk.js';

const w = (n) => BigInt(Math.round(n * 1000)) * 10n ** 15n;

test('ratio and liquidation price', () => {
  // 0.04 BTC at $76,000 against 2,000 MUSD → 152%; liquidation at $55,000.
  assert.equal(ratio(w(0.04), w(2000), w(76000)), w(1.52));
  assert.equal(liquidationPrice(w(0.04), w(2000)), w(55000));
  assert.equal(ratio(w(1), 0n, w(1)), undefined);
  assert.equal(usd(w(55000)), '$55,000');
});

test('levels', () => {
  const warnAt = w(1.6);
  assert.equal(level(w(1.7), warnAt, false), 'ok');
  assert.equal(level(w(1.52), warnAt, false), 'warn');
  assert.equal(level(w(1.15), warnAt, false), 'critical');
  assert.equal(level(w(1.45), warnAt, true), 'critical', 'recovery mode raises the line to 150%');
  assert.equal(level(undefined, warnAt, false), 'none');
  assert.equal(w(1), WAD);
});

test('notifications only on worsening or recovery', () => {
  assert.equal(shouldNotify(undefined, 'warn'), true);
  assert.equal(shouldNotify('warn', 'warn'), false);
  assert.equal(shouldNotify('warn', 'critical'), true);
  assert.equal(shouldNotify('critical', 'warn'), false);
  assert.equal(shouldNotify('critical', 'ok'), true);
  assert.equal(shouldNotify('ok', 'ok'), false);
});
