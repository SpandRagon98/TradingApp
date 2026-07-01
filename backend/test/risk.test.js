// Use the JSON store backend for tests so we never touch the app's SQLite DB.
process.env.STORAGE = 'json';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionSize, validateTrade, setKillSwitch } from '../src/risk/risk.js';
import { setRiskState, setSettings } from '../src/store.js';

const today = () => new Date().toISOString().slice(0, 10);

function resetState() {
  setSettings({
    risk: {
      capital: 50000, riskPerTradePct: 1, maxDailyLossPct: 2, minRiskReward: 2,
      maxTradesPerDay: 5, maxOpenTrades: 3, maxConsecutiveLosses: 3,
    },
  });
  setRiskState({ day: today(), dailyPnl: 0, tradesToday: 0, consecutiveLosses: 0, openTrades: 0, killSwitch: false });
}

test('positionSize: Position Size = RiskAmount / per-unit risk', () => {
  // Capital 50000, risk 1% = ₹500; entry 100, stop 98 → ₹2/share → 250 shares.
  const s = positionSize({ entry: 100, stop: 98, capital: 50000, riskPct: 1 });
  assert.equal(s.quantity, 250);
  assert.equal(s.riskAmount, 500);
  assert.equal(s.perUnitRisk, 2);
});

test('positionSize: rounds down to whole lots for options', () => {
  const s = positionSize({ entry: 100, stop: 90, capital: 50000, riskPct: 1, lotSize: 75 });
  // risk 500 / 10 = 50 → floor to 0 lots of 75
  assert.equal(s.quantity % 75, 0);
});

test('positionSize: zero stop distance yields no quantity', () => {
  const s = positionSize({ entry: 100, stop: 100, capital: 50000, riskPct: 1 });
  assert.equal(s.quantity, 0);
  assert.ok(s.reason);
});

test('validateTrade approves a clean 1:2 signal', () => {
  resetState();
  const v = validateTrade({ type: 'BUY', entry: 100, stop: 98, target: 104, riskReward: 2 });
  assert.equal(v.approved, true, v.reasons.join(' '));
  assert.ok(v.quantity > 0);
});

test('validateTrade rejects sub-minimum risk-reward', () => {
  resetState();
  const v = validateTrade({ type: 'BUY', entry: 100, stop: 98, target: 101, riskReward: 1 });
  assert.equal(v.approved, false);
  assert.ok(v.reasons.some((r) => /risk-reward/i.test(r)));
});

test('kill switch blocks every trade', () => {
  resetState();
  setKillSwitch(true);
  const v = validateTrade({ type: 'BUY', entry: 100, stop: 98, target: 104, riskReward: 2 });
  assert.equal(v.approved, false);
  assert.ok(v.reasons.some((r) => /kill switch/i.test(r)));
  setKillSwitch(false);
});

test('daily-loss limit halts trading', () => {
  resetState();
  setRiskState({ dailyPnl: -1100 }); // max daily loss = 2% of 50000 = ₹1000
  const v = validateTrade({ type: 'BUY', entry: 100, stop: 98, target: 104, riskReward: 2 });
  assert.equal(v.approved, false);
  assert.ok(v.reasons.some((r) => /daily loss/i.test(r)));
});

test('consecutive-loss breaker trips', () => {
  resetState();
  setRiskState({ consecutiveLosses: 3 });
  const v = validateTrade({ type: 'BUY', entry: 100, stop: 98, target: 104, riskReward: 2 });
  assert.equal(v.approved, false);
  assert.ok(v.reasons.some((r) => /consecutive/i.test(r)));
});
