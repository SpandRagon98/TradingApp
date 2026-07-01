import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from '../src/backtest/engine.js';

test('equity backtest returns coherent metrics', () => {
  const m = runBacktest({ symbol: 'NIFTY', strategyName: 'OpeningRangeBreakout', days: 25 });
  assert.ok(m.totalTrades >= 0);
  assert.ok(m.winRate >= 0 && m.winRate <= 100);
  assert.ok(Array.isArray(m.equityCurve) && m.equityCurve.length >= 1);
  assert.equal(m.startCapital, m.equityCurve[0].equity);
  assert.ok(m.maxDrawdown >= 0);
});

test('unknown strategy returns an error', () => {
  assert.ok(runBacktest({ symbol: 'NIFTY', strategyName: 'Nope', days: 5 }).error);
});

test('backtest is deterministic for a given (symbol, strategy, days)', () => {
  const a = runBacktest({ symbol: 'RELIANCE', strategyName: 'Momentum', days: 20 });
  const b = runBacktest({ symbol: 'RELIANCE', strategyName: 'Momentum', days: 20 });
  assert.equal(a.netPnl, b.netPnl);
  assert.equal(a.totalTrades, b.totalTrades);
});
