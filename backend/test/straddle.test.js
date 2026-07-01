import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStraddle } from '../src/options/straddle.js';
import { runStraddlePaper } from '../src/options/straddle_engine.js';
import { runStraddleBacktest } from '../src/options/straddle_backtest.js';

test('short straddle build: unlimited risk, positive theta, negative vega', () => {
  const s = buildStraddle({ index: 'NIFTY', type: 'short', lots: 1, daysToExpiry: 2 });
  assert.equal(s.type, 'short');
  assert.equal(typeof s.maxLoss, 'string');
  assert.match(s.maxLoss, /UNLIMITED/);
  assert.ok(s.warnings.length > 0);
  assert.ok(s.greeks.theta > 0, `short straddle should earn theta, got ${s.greeks.theta}`);
  assert.ok(s.greeks.vega < 0, `short straddle should be short vega, got ${s.greeks.vega}`);
  assert.ok(s.breakevenUp > s.strike && s.strike > s.breakevenDown);
});

test('long straddle build: capped loss, unlimited profit, negative theta', () => {
  const s = buildStraddle({ index: 'NIFTY', type: 'long', lots: 1, daysToExpiry: 2 });
  assert.equal(typeof s.maxProfit, 'string'); // "unlimited ..."
  assert.equal(typeof s.maxLoss, 'number'); // debit paid
  assert.ok(s.greeks.theta < 0);
});

test('unsupported index returns an error', () => {
  assert.ok(buildStraddle({ index: 'FOO' }).error);
});

test('straddle paper trade returns a complete, sane record', () => {
  const r = runStraddlePaper({ index: 'NIFTY', type: 'short', lots: 1, daysToExpiry: 1, seed: 3 });
  assert.equal(typeof r.pnl, 'number');
  assert.ok(r.combinedEntry > 0 && r.combinedExit >= 0);
  assert.ok(typeof r.exitReason === 'string');
  assert.equal(r.quantity, r.lots * r.lotSize);
  assert.ok(r.breakevenUp > r.strike && r.strike > r.breakevenDown);
});

test('straddle backtest aggregates many sessions', () => {
  const m = runStraddleBacktest({ index: 'NIFTY', type: 'short', sessions: 25, daysToExpiry: 1 });
  assert.equal(m.totalTrades, 25);
  assert.ok(m.winRate >= 0 && m.winRate <= 100);
  assert.equal(m.equityCurve.length, 26); // seed point + 25
  assert.ok('byWeekday' in m && 'byExitReason' in m);
});
