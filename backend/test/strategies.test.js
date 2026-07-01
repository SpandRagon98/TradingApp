import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listStrategies, getStrategy } from '../src/strategies/registry.js';
import { generateCandles, toMarketData } from '../src/marketdata/candles.js';
import { scoreSignal, SCORE_THRESHOLD } from '../src/scoring.js';

const VALID = new Set(['BUY', 'SELL', 'SHORT', 'EXIT', 'NO_TRADE']);

test('all 10 strategies are registered', () => {
  assert.equal(listStrategies().length, 10);
});

test('every strategy returns a valid signal shape across many seeds (no throws)', () => {
  for (const { name } of listStrategies()) {
    const strat = getStrategy(name);
    for (const sym of ['NIFTY', 'RELIANCE', 'TCS']) {
      for (let seed = 1; seed <= 12; seed++) {
        const md = toMarketData(sym, '5m', generateCandles(sym, '5m', 75, seed));
        const sig = strat.generateSignal(md, {});
        assert.ok(VALID.has(sig.type), `${name} produced ${sig.type}`);
        if (sig.type !== 'NO_TRADE') {
          assert.equal(typeof sig.entry, 'number');
          assert.equal(typeof sig.stop, 'number');
          assert.equal(typeof sig.target, 'number');
          assert.ok(sig.riskReward >= 0);
        }
      }
    }
  }
});

test('scoreSignal gates a NO_TRADE to 0 and not approved', () => {
  const s = scoreSignal({ type: 'NO_TRADE', rejectionReason: 'x' }, null);
  assert.equal(s.score, 0);
  assert.equal(s.approved, false);
  assert.equal(s.threshold, SCORE_THRESHOLD);
});

test('Opening-Range-Breakout fires BUY on a crafted breakout', () => {
  const t0 = Date.now() - 30 * 300000;
  const c = [];
  for (let i = 0; i < 6; i++) c.push(bar(t0, i, 100.5, 101, 100, 100.5, 1000)); // opening range 100–101
  for (let i = 6; i < 29; i++) c.push(bar(t0, i, 100.5, 100.8, 100.2, 100.5, 1000));
  c.push(bar(t0, 29, 101, 102.5, 100.9, 102, 4000)); // breakout close above ORH on heavy volume
  const md = toMarketData('TEST', '5m', c);
  const sig = getStrategy('OpeningRangeBreakout').generateSignal(md, {});
  assert.equal(sig.type, 'BUY', sig.rejectionReason || '');
  assert.ok(sig.stop < sig.entry && sig.target > sig.entry);
});

function bar(t0, i, o, h, l, cl, v) {
  return { time: new Date(t0 + i * 300000).toISOString(), open: o, high: h, low: l, close: cl, volume: v };
}
