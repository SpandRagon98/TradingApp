// Risk management engine — mandatory gate before any trade (paper or live).
//
// Responsibilities:
//  - Position sizing from capital, risk-per-trade %, and stop distance.
//  - Hard limits: max risk/trade, max daily loss, max trades/day, max open
//    trades, consecutive-loss circuit breaker, min risk-reward, kill switch.
//  - Daily roll-over of counters.
// State is persisted in the store so limits survive restarts within a day.

import { config } from '../config.js';
import { getRiskState, setRiskState, getSettings } from '../store.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Merge env defaults with any user overrides saved in settings. */
export function riskConfig() {
  return { ...config.risk, ...(getSettings().risk || {}) };
}

/** Ensure the daily counters belong to today; reset at day rollover. */
export function rollDay() {
  const st = getRiskState();
  if (st.day !== today()) {
    return setRiskState({ day: today(), dailyPnl: 0, tradesToday: 0, consecutiveLosses: 0 });
  }
  return st;
}

/**
 * Position size = riskAmount / perUnitRisk, capped by available margin.
 * For options, lotSize rounds quantity to whole lots.
 */
export function positionSize({ entry, stop, capital, riskPct, lotSize = 1, availableMargin = Infinity }) {
  const perUnitRisk = Math.abs(entry - stop);
  if (perUnitRisk <= 0) return { quantity: 0, reason: 'Invalid stop (zero risk distance).' };
  const riskAmount = (capital * riskPct) / 100;
  let qty = Math.floor(riskAmount / perUnitRisk);
  if (lotSize > 1) qty = Math.floor(qty / lotSize) * lotSize;
  // Margin cap (rough: entry * qty must fit available margin)
  const maxByMargin = Math.floor(availableMargin / entry);
  if (qty > maxByMargin) qty = lotSize > 1 ? Math.floor(maxByMargin / lotSize) * lotSize : maxByMargin;
  return { quantity: Math.max(0, qty), riskAmount: round2(riskAmount), perUnitRisk: round2(perUnitRisk) };
}

/**
 * Validate a scored signal against all risk rules.
 * Returns { approved, reasons[], quantity, riskAmount, ... }.
 */
export function validateTrade(sig, { availableMargin = Infinity } = {}) {
  const rc = riskConfig();
  const st = rollDay();
  const reasons = [];

  if (st.killSwitch) reasons.push('Kill switch is ACTIVE — all trading halted.');

  if (sig.type === 'NO_TRADE') reasons.push('Signal is NO_TRADE.');

  if (sig.riskReward != null && sig.riskReward < rc.minRiskReward) {
    reasons.push(`Risk-reward ${sig.riskReward} below minimum ${rc.minRiskReward}.`);
  }

  if (st.tradesToday >= rc.maxTradesPerDay) reasons.push(`Max trades/day reached (${rc.maxTradesPerDay}).`);
  if (st.openTrades >= rc.maxOpenTrades) reasons.push(`Max open trades reached (${rc.maxOpenTrades}).`);
  if (st.consecutiveLosses >= rc.maxConsecutiveLosses) {
    reasons.push(`Consecutive-loss breaker tripped (${rc.maxConsecutiveLosses}).`);
  }

  const maxDailyLoss = (rc.capital * rc.maxDailyLossPct) / 100;
  if (st.dailyPnl <= -maxDailyLoss) reasons.push(`Daily loss limit hit (₹${maxDailyLoss.toFixed(0)}).`);

  const sizing = positionSize({
    entry: sig.entry,
    stop: sig.stop,
    capital: rc.capital,
    riskPct: rc.riskPerTradePct,
    lotSize: sig.lotSize || 1,
    availableMargin,
  });
  if (sizing.quantity <= 0) reasons.push(sizing.reason || 'Computed quantity is zero (stop too wide for risk budget).');

  return {
    approved: reasons.length === 0,
    reasons,
    quantity: sizing.quantity,
    riskAmount: sizing.riskAmount,
    perUnitRisk: sizing.perUnitRisk,
    maxDailyLoss: round2(maxDailyLoss),
    limits: rc,
    state: { ...st },
  };
}

// ─── Counters & kill switch ──────────────────────────────────────────────────

export function recordTradeOpen() {
  const st = rollDay();
  return setRiskState({ tradesToday: st.tradesToday + 1, openTrades: st.openTrades + 1 });
}

export function recordTradeClose(pnl) {
  const st = rollDay();
  const consecutiveLosses = pnl < 0 ? st.consecutiveLosses + 1 : 0;
  return setRiskState({
    dailyPnl: round2(st.dailyPnl + pnl),
    openTrades: Math.max(0, st.openTrades - 1),
    consecutiveLosses,
  });
}

export function setKillSwitch(on) {
  return setRiskState({ killSwitch: Boolean(on) });
}

export function riskStatus() {
  const rc = riskConfig();
  const st = rollDay();
  const maxDailyLoss = (rc.capital * rc.maxDailyLossPct) / 100;
  return {
    ...st,
    limits: rc,
    maxDailyLoss: round2(maxDailyLoss),
    dailyLossUsedPct: round2(maxDailyLoss ? Math.max(0, -st.dailyPnl) / maxDailyLoss * 100 : 0),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
