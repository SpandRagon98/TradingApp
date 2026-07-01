// Straddle backtest — run the straddle paper engine over many synthetic sessions
// and aggregate the metrics the spec asks for: win rate, avg win/loss, profit
// factor, max drawdown, MAE/MFE, brokerage/slippage impact, and a by-weekday
// breakdown. Deterministic per session seed.

import { runStraddlePaper } from './straddle_engine.js';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const round2 = (n) => Math.round(n * 100) / 100;

export function runStraddleBacktest({ index = 'NIFTY', type = 'short', sessions = 40, ...params } = {}) {
  const n = Math.min(Math.max(Number(sessions) || 40, 1), 250);
  const trades = [];
  let equity = 0, peak = 0, maxDrawdown = 0;
  const equityCurve = [{ t: 0, equity: 0 }];
  const byWeekday = {};
  const byExitReason = {};

  for (let s = 0; s < n; s++) {
    const t = runStraddlePaper({ index, type, seed: s + 1, ...params });
    if (t.error) return t;

    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    equityCurve.push({ t: s + 1, equity: round2(equity) });

    // Synthetic trading date stepping back from today (skip weekends).
    const date = tradingDaysAgo(n - s);
    const wd = WD[date.getDay()];
    bucket(byWeekday, wd, t.pnl);
    bucket(byExitReason, t.exitReason, t.pnl);

    trades.push({
      session: s + 1, weekday: wd, exitReason: t.exitReason,
      combinedEntry: t.combinedEntry, combinedExit: t.combinedExit,
      pnl: t.pnl, costs: t.costs, mae: t.mae, mfe: t.mfe,
    });
  }

  return { ...metrics(trades, equity, maxDrawdown), index, type, sessions: n, equityCurve, byWeekday: finalize(byWeekday), byExitReason: finalize(byExitReason), trades };
}

function metrics(trades, endEquity, maxDrawdown) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  let streak = 0, maxStreak = 0;
  for (const t of trades) {
    if (t.pnl <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0;
  }
  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round2((wins.length / trades.length) * 100) : 0,
    netPnl: round2(endEquity),
    avgWin: wins.length ? round2(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    profitFactor: grossLoss ? round2(grossWin / grossLoss) : (grossWin > 0 ? Infinity : 0),
    maxDrawdown: round2(maxDrawdown),
    maxConsecutiveLosses: maxStreak,
    totalCosts: round2(trades.reduce((s, t) => s + t.costs, 0)),
    avgMAE: trades.length ? round2(trades.reduce((s, t) => s + t.mae, 0) / trades.length) : 0,
    avgMFE: trades.length ? round2(trades.reduce((s, t) => s + t.mfe, 0) / trades.length) : 0,
  };
}

function bucket(obj, key, pnl) {
  (obj[key] ||= { trades: 0, pnl: 0 });
  obj[key].trades++;
  obj[key].pnl += pnl;
}

function finalize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = { trades: v.trades, pnl: round2(v.pnl) };
  return out;
}

function tradingDaysAgo(n) {
  const d = new Date();
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--; // skip Sat/Sun
  }
  return d;
}
