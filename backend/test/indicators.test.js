import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, emaSeries, rsi, vwap, atr, stdev, bollinger, relativeVolume, percentChange, adx, pivots } from '../src/indicators.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const candle = (o, h, l, c, v = 1000) => ({ open: o, high: h, low: l, close: c, volume: v });

test('sma averages the last N values', () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([2, 4, 6], 3), 4);
  assert.equal(sma([1], 2), null); // not enough data
});

test('emaSeries matches input length and ema returns last', () => {
  const s = emaSeries([1, 2, 3, 4, 5], 3);
  assert.equal(s.length, 5);
  assert.equal(ema([1, 2, 3, 4, 5], 3), s[s.length - 1]);
});

test('rsi: a strictly rising series is overbought (=100)', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14), 100);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.ok(rsi(down, 14) < 5);
  assert.equal(rsi([1, 2], 14), null); // insufficient
});

test('vwap of constant price equals that price', () => {
  const cs = [candle(100, 100, 100, 100), candle(100, 100, 100, 100)];
  assert.ok(close(vwap(cs), 100));
});

test('atr is positive for a moving series, null when insufficient', () => {
  const cs = Array.from({ length: 30 }, (_, i) => candle(100 + i, 101 + i, 99 + i, 100 + i));
  assert.ok(atr(cs, 14) > 0);
  assert.equal(atr([candle(1, 1, 1, 1)], 14), null);
});

test('bollinger mid equals sma and bands straddle it', () => {
  const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i));
  const bb = bollinger(closes, 20, 2);
  assert.ok(close(bb.mid, sma(closes, 20), 1e-9));
  assert.ok(bb.upper > bb.mid && bb.mid > bb.lower);
});

test('stdev of constant is 0', () => {
  assert.ok(close(stdev([5, 5, 5, 5], 4), 0));
});

test('relativeVolume compares last bar to prior average', () => {
  const cs = Array.from({ length: 25 }, () => candle(1, 1, 1, 1, 100));
  cs[cs.length - 1].volume = 200; // last bar double
  assert.ok(close(relativeVolume(cs, 20), 2));
});

test('percentChange', () => {
  assert.ok(close(percentChange(100, 110), 10));
  assert.equal(percentChange(0, 10), 0);
});

test('adx: strong uptrend gives high ADX with +DI > -DI', () => {
  const cs = Array.from({ length: 40 }, (_, i) => candle(100 + i, 100.5 + i, 99.8 + i, 100.4 + i));
  const d = adx(cs, 14);
  assert.ok(d.adx > 25, `expected strong ADX, got ${d.adx}`);
  assert.ok(d.plusDI > d.minusDI);
  assert.equal(adx([candle(1, 1, 1, 1)], 14), null);
});

test('pivots compute classic levels', () => {
  const p = pivots(110, 90, 100); // P = 100
  assert.ok(close(p.p, 100));
  assert.ok(close(p.r1, 2 * 100 - 90)); // 110
  assert.ok(close(p.s1, 2 * 100 - 110)); // 90
  assert.ok(p.r2 > p.r1 && p.s2 < p.s1);
});
