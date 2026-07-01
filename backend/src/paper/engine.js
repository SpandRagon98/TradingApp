// Paper trading engine — DEFAULT, SAFE mode. Never places real orders.
//
// runOnce(): generate a signal, score it, run the risk gate, and (if approved)
// simulate the trade forward over synthetic candles to a realistic exit
// (stop / target / end-of-session), applying brokerage + slippage. The completed
// paper trade is persisted and the risk counters update — so daily-loss and
// consecutive-loss breakers behave exactly as they would live.

import { config } from '../config.js';
import { generateCandles, toMarketData } from '../marketdata/candles.js';
import { getStrategy } from '../strategies/registry.js';
import { scoreSignal } from '../scoring.js';
import { validateTrade, recordTradeOpen, recordTradeClose } from '../risk/risk.js';
import { insert, audit } from '../store.js';

const LOOKBACK = 75; // candles used to form the signal
const FORWARD = 40; // candles used to simulate the outcome

export function runOnce({ symbol, strategyName, interval = '5m', seed = Date.now() % 100000 }) {
  const strat = getStrategy(strategyName);
  if (!strat) return { error: `Unknown strategy: ${strategyName}` };

  // One continuous series; split into "known" and "future" segments.
  const series = generateCandles(symbol, interval, LOOKBACK + FORWARD, seed);
  const known = series.slice(0, LOOKBACK);
  const future = series.slice(LOOKBACK);
  const md = toMarketData(symbol, interval, known);

  const sig = strat.generateSignal(md, {});
  const score = scoreSignal(sig, md);
  insert('signals', { symbol, strategy: strategyName, type: sig.type, score: score.score });

  if (sig.type === 'NO_TRADE' || !score.approved) {
    return { traded: false, signal: sig, score, reason: sig.rejectionReason || 'Score below threshold', validation: null };
  }

  const validation = validateTrade(sig);
  if (!validation.approved) {
    return { traded: false, signal: sig, score, validation, reason: validation.reasons.join(' ') };
  }

  // ── Simulate the trade forward ──
  const sim = simulate(sig, future, validation.quantity);
  recordTradeOpen();
  recordTradeClose(sim.pnl);

  const trade = insert('trades', {
    mode: 'paper',
    symbol,
    strategy: strategyName,
    side: sig.type,
    quantity: validation.quantity,
    entry: sig.entry,
    stop: sig.stop,
    target: sig.target,
    exit: sim.exit,
    exitReason: sim.exitReason,
    riskReward: sig.riskReward,
    score: score.score,
    grossPnl: sim.grossPnl,
    costs: sim.costs,
    pnl: sim.pnl,
    reasonEntry: sig.reason,
    rulesFollowed: true,
    openedAt: sig.entryTime || known[known.length - 1].time,
    closedAt: sim.exitTime,
  });
  audit('paper_trade_closed', { tradeId: trade.id, symbol, pnl: sim.pnl });

  return { traded: true, signal: sig, score, validation, trade };
}

/** Walk future candles; exit on stop/target touch, else end-of-session at last close. */
function simulate(sig, future, quantity) {
  const isLong = sig.type === 'BUY';
  const slipFrac = config.costs.slippageBps / 10000;
  // Entry fill slips against you.
  const entryFill = isLong ? sig.entry * (1 + slipFrac) : sig.entry * (1 - slipFrac);

  let exit = null;
  let exitReason = null;
  let exitTime = null;

  for (const c of future) {
    if (isLong) {
      if (c.low <= sig.stop) { exit = sig.stop; exitReason = 'stop_loss'; exitTime = c.time; break; }
      if (c.high >= sig.target) { exit = sig.target; exitReason = 'target'; exitTime = c.time; break; }
    } else {
      if (c.high >= sig.stop) { exit = sig.stop; exitReason = 'stop_loss'; exitTime = c.time; break; }
      if (c.low <= sig.target) { exit = sig.target; exitReason = 'target'; exitTime = c.time; break; }
    }
  }
  if (exit == null) {
    const last = future[future.length - 1];
    exit = last.close;
    exitReason = 'session_close';
    exitTime = last.time;
  }

  const exitFill = isLong ? exit * (1 - slipFrac) : exit * (1 + slipFrac);
  const grossPnl = (isLong ? exitFill - entryFill : entryFill - exitFill) * quantity;
  const costs = config.costs.brokeragePerOrder * 2; // entry + exit
  const pnl = grossPnl - costs;

  return {
    exit: round2(exit),
    exitReason,
    exitTime,
    grossPnl: round2(grossPnl),
    costs: round2(costs),
    pnl: round2(pnl),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
