// Backtesting engine — run a strategy over a longer synthetic history and report
// the metrics the spec asks for. Deterministic per (symbol, seed) so results are
// reproducible. Real historical data drops in by replacing generateCandles with
// broker.getHistorical — the loop and metrics are unchanged.

import { config } from '../config.js';
import { generateCandles, toMarketData } from '../marketdata/candles.js';
import { getStrategy } from '../strategies/registry.js';
import { scoreSignal } from '../scoring.js';
import { positionSize, riskConfig } from '../risk/risk.js';

export function runBacktest({ symbol, strategyName, interval = '5m', days = 30 }) {
  const strat = getStrategy(strategyName);
  if (!strat) return { error: `Unknown strategy: ${strategyName}` };

  const rc = riskConfig();
  const window = 75; // candles needed to form a signal
  const trades = [];
  let equity = rc.capital;
  let peak = equity;
  let maxDrawdown = 0;
  const equityCurve = [{ t: 0, equity }];

  // Each "day" is an independent synthetic session (seeded by day index).
  for (let day = 0; day < days; day++) {
    const session = generateCandles(symbol, interval, window + 40, day + 1);
    const known = session.slice(0, window);
    const future = session.slice(window);
    const md = toMarketData(symbol, interval, known);

    const sig = strat.generateSignal(md, {});
    const score = scoreSignal(sig, md);
    if (sig.type === 'NO_TRADE' || !score.approved) continue;

    const sizing = positionSize({ entry: sig.entry, stop: sig.stop, capital: equity, riskPct: rc.riskPerTradePct });
    if (sizing.quantity <= 0) continue;

    const t = simulate(sig, future, sizing.quantity);
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    equityCurve.push({ t: day + 1, equity: round2(equity) });
    trades.push({ day: day + 1, ...t, score: score.score, side: sig.type, rr: sig.riskReward });
  }

  return { ...metrics(trades, rc.capital, equity, maxDrawdown), equityCurve, trades, symbol, strategy: strategyName };
}

function simulate(sig, future, quantity) {
  const isLong = sig.type === 'BUY';
  const slipFrac = config.costs.slippageBps / 10000;
  const entryFill = isLong ? sig.entry * (1 + slipFrac) : sig.entry * (1 - slipFrac);
  let exit = null, exitReason = null, mae = 0, mfe = 0;

  for (const c of future) {
    // track max adverse / favourable excursion
    const adverse = isLong ? entryFill - c.low : c.high - entryFill;
    const favour = isLong ? c.high - entryFill : entryFill - c.low;
    mae = Math.max(mae, adverse);
    mfe = Math.max(mfe, favour);
    if (isLong) {
      if (c.low <= sig.stop) { exit = sig.stop; exitReason = 'stop_loss'; break; }
      if (c.high >= sig.target) { exit = sig.target; exitReason = 'target'; break; }
    } else {
      if (c.high >= sig.stop) { exit = sig.stop; exitReason = 'stop_loss'; break; }
      if (c.low <= sig.target) { exit = sig.target; exitReason = 'target'; break; }
    }
  }
  if (exit == null) { exit = future[future.length - 1].close; exitReason = 'session_close'; }
  const exitFill = isLong ? exit * (1 - slipFrac) : exit * (1 + slipFrac);
  const gross = (isLong ? exitFill - entryFill : entryFill - exitFill) * quantity;
  const costs = config.costs.brokeragePerOrder * 2;
  return {
    pnl: round2(gross - costs),
    gross: round2(gross),
    costs,
    exitReason,
    mae: round2(mae * quantity),
    mfe: round2(mfe * quantity),
  };
}

function metrics(trades, startCapital, endEquity, maxDrawdown) {
  const n = trades.length;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // longest losing streak
  let streak = 0, maxStreak = 0;
  for (const t of trades) {
    if (t.pnl <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  return {
    totalTrades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? round2((wins.length / n) * 100) : 0,
    netPnl: round2(endEquity - startCapital),
    avgWin: wins.length ? round2(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round2(grossLoss / losses.length) : 0,
    profitFactor: grossLoss ? round2(grossWin / grossLoss) : (grossWin > 0 ? Infinity : 0),
    maxDrawdown: round2(maxDrawdown),
    maxConsecutiveLosses: maxStreak,
    totalCosts: round2(trades.reduce((s, t) => s + t.costs, 0)),
    startCapital,
    endEquity: round2(endEquity),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
