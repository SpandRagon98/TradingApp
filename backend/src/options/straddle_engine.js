// Straddle paper engine — simulate a long/short ATM straddle over an intraday
// session. Both legs are repriced with Black-Scholes at every candle as the
// underlying moves AND time decays, so the P&L reflects real option behaviour
// (theta helps a short straddle when the index sits still; a big move hurts it).
//
// IV is held constant within the session (honest: we don't model an IV crush),
// so P&L is driven by spot path + time decay. Exits: combined-premium target / SL,
// per-leg SL, optional trailing SL, and a hard time exit (session/scanner close).
//
// PAPER ONLY. Live short-straddle execution is gated off by default.

import { bs } from './greeks.js';
import { INDEX_META, RISK_FREE } from './option_chain.js';
import { config } from '../config.js';

const INTERVAL_MIN = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '1h': 60, '1d': 1440 };

const BASE_SPOT = { NIFTY: 22000, BANKNIFTY: 47000, FINNIFTY: 21000, SENSEX: 73000 };

function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Intraday underlying path for OPTION simulation — an Ornstein-Uhlenbeck-style
 * mean-reverting walk, unlike the equity engine's trending random walk.
 *
 * Each session is assigned a regime (deterministic per seed): ~55% range-bound
 * (mean reverts to the open → short straddles win on theta), ~25% mild trend, and
 * ~20% strong trend (→ short straddles stop out, long straddles win on the move).
 * This produces a realistic short-straddle profile: win often & small, lose seldom
 * & large. Realized vol is tuned to sit near the chain's implied vol (~22%).
 */
function generateUnderlyingPath(index, seed, count, stepMin) {
  const rnd = mulberry32(hashStr(index) ^ (seed * 2654435761));
  const base = BASE_SPOT[index] || 22000;
  const spot0 = base * (0.99 + rnd() * 0.02);
  const anchor = spot0;

  const regime = rnd();
  let mr, sigma, drift;
  if (regime < 0.55) {            // range day → favours short straddle
    mr = 0.06; sigma = spot0 * 0.0009; drift = 0;
  } else if (regime < 0.8) {      // mild trend
    mr = 0.02; sigma = spot0 * 0.0011; drift = (rnd() < 0.5 ? -1 : 1) * spot0 * 0.0004;
  } else {                        // strong trend → favours long straddle
    mr = 0.005; sigma = spot0 * 0.0013; drift = (rnd() < 0.5 ? -1 : 1) * spot0 * 0.0009;
  }

  const candles = [];
  let price = spot0;
  const t0 = Date.now() - count * stepMin * 60000;
  for (let i = 0; i < count; i++) {
    const o = price;
    price = price - mr * (price - anchor) + drift + (rnd() * 2 - 1) * sigma;
    const cl = price;
    const wick = sigma * 0.8;
    candles.push({
      time: new Date(t0 + i * stepMin * 60000).toISOString(),
      open: r2(o),
      high: r2(Math.max(o, cl) + rnd() * wick),
      low: r2(Math.min(o, cl) - rnd() * wick),
      close: r2(cl),
      volume: 60000,
    });
  }
  return candles;
}
const r2 = (n) => Math.round(n * 100) / 100;
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * @param opts {
 *   index, type('short'|'long'), lots, lotSize, daysToExpiry, iv,
 *   combinedSLPct, combinedTargetPct, legSLPct, trailingSLPct,
 *   interval, seed, entryIndex, exitIndex
 * }
 */
export function runStraddlePaper(opts = {}) {
  const index = String(opts.index || 'NIFTY').toUpperCase();
  const meta = INDEX_META[index];
  if (!meta) return { error: `Unsupported index ${index}.` };

  const isShort = String(opts.type || 'short').toLowerCase() === 'short';
  const lots = Math.max(1, Math.floor(Number(opts.lots) || 1));
  const lotSize = Math.max(1, Math.floor(Number(opts.lotSize) || meta.lotSize));
  const qty = lots * lotSize;
  const iv = Number(opts.iv) > 0 ? Number(opts.iv) : meta.baseIV;
  const dte0 = Number(opts.daysToExpiry) > 0 ? Number(opts.daysToExpiry) : 1;
  const interval = INTERVAL_MIN[opts.interval] ? opts.interval : '5m';
  const stepMin = INTERVAL_MIN[interval];

  const combinedSLPct = num(opts.combinedSLPct, 30);
  const combinedTargetPct = num(opts.combinedTargetPct, 25);
  // Per-leg SL is a catastrophe guard, not the primary control — near expiry a
  // single ATM leg can swing >50% on normal noise, so the combined-premium SL
  // leads and the leg SL defaults wide.
  const legSLPct = num(opts.legSLPct, 80);
  const trailingSLPct = Number(opts.trailingSLPct) > 0 ? Number(opts.trailingSLPct) : null;

  const candles = generateUnderlyingPath(index, opts.seed ?? daySeed(), 75, stepMin);
  const entryIndex = clamp(opts.entryIndex ?? 0, 0, candles.length - 2);
  const exitLimit = clamp(opts.exitIndex ?? candles.length - 1, entryIndex + 1, candles.length - 1);

  const spot0 = candles[entryIndex].close;
  const strike = Math.round(spot0 / meta.step) * meta.step;

  // Price both legs at a given candle index (T decays from entry).
  const priceAt = (idx) => {
    const minsElapsed = (idx - entryIndex) * stepMin;
    const Tdays = Math.max(dte0 - minsElapsed / (60 * 24), 1 / (24 * 60));
    const T = Tdays / 365;
    const spot = candles[idx].close;
    const ce = bs('ce', spot, strike, T, RISK_FREE, iv).price;
    const pe = bs('pe', spot, strike, T, RISK_FREE, iv).price;
    return { spot, ce, pe, combined: ce + pe };
  };

  const e = priceAt(entryIndex);
  const ce0 = e.ce, pe0 = e.pe, comb0 = e.combined;

  let exitIdx = null, exitReason = null, mae = 0, mfe = 0, bestProfitPct = 0;
  const track = []; // combined-premium path for charting

  for (let idx = entryIndex + 1; idx <= exitLimit; idx++) {
    const p = priceAt(idx);
    const perUnit = isShort ? comb0 - p.combined : p.combined - comb0; // profit in premium points
    const profitPct = (perUnit / comb0) * 100;
    mfe = Math.max(mfe, perUnit);
    mae = Math.min(mae, perUnit);
    track.push({ idx, combined: round2(p.combined), spot: round2(p.spot) });

    if (isShort) {
      if (p.combined <= comb0 * (1 - combinedTargetPct / 100)) { exitIdx = idx; exitReason = 'target'; break; }
      if (p.combined >= comb0 * (1 + combinedSLPct / 100)) { exitIdx = idx; exitReason = 'combined_sl'; break; }
      if (p.ce >= ce0 * (1 + legSLPct / 100) || p.pe >= pe0 * (1 + legSLPct / 100)) { exitIdx = idx; exitReason = 'leg_sl'; break; }
    } else {
      if (p.combined >= comb0 * (1 + combinedTargetPct / 100)) { exitIdx = idx; exitReason = 'target'; break; }
      if (p.combined <= comb0 * (1 - combinedSLPct / 100)) { exitIdx = idx; exitReason = 'combined_sl'; break; }
    }

    // Trailing SL: once we've earned at least half the target, lock in gains.
    if (trailingSLPct) {
      bestProfitPct = Math.max(bestProfitPct, profitPct);
      if (bestProfitPct >= combinedTargetPct * 0.5 && profitPct <= bestProfitPct - trailingSLPct) {
        exitIdx = idx; exitReason = 'trailing_sl'; break;
      }
    }
  }

  if (exitIdx == null) { exitIdx = exitLimit; exitReason = 'time_exit'; }

  const x = priceAt(exitIdx);
  const perUnit = isShort ? comb0 - x.combined : x.combined - comb0;
  const grossPnl = perUnit * qty;
  const slip = config.costs.slippageBps / 10000;
  const slipCost = (comb0 + x.combined) * slip * qty;
  const costs = config.costs.brokeragePerOrder * 4 + slipCost; // 4 legs traded (2 in, 2 out)
  const pnl = grossPnl - costs;

  return {
    paper: true,
    index, type: isShort ? 'short' : 'long', strike,
    spot0: round2(spot0), spotExit: round2(x.spot),
    lots, lotSize, quantity: qty, daysToExpiry: dte0, iv: round4(iv),
    ceEntry: round2(ce0), peEntry: round2(pe0), combinedEntry: round2(comb0),
    ceExit: round2(x.ce), peExit: round2(x.pe), combinedExit: round2(x.combined),
    breakevenUp: round2(strike + comb0), breakevenDown: round2(strike - comb0),
    entryIndex, exitIndex: exitIdx, exitReason,
    combinedSLPct, combinedTargetPct, legSLPct, trailingSLPct,
    perUnit: round2(perUnit), grossPnl: round2(grossPnl), costs: round2(costs), pnl: round2(pnl),
    mae: round2(mae * qty), mfe: round2(mfe * qty),
    maxProfit: isShort ? round2(comb0 * qty - config.costs.brokeragePerOrder * 4) : 'unlimited',
    maxLoss: isShort ? 'unlimited (unhedged)' : round2(comb0 * qty + config.costs.brokeragePerOrder * 4),
    track,
    warnings: isShort ? ['Short straddle simulated UNHEDGED — unlimited theoretical risk. Paper only.'] : [],
  };
}

/**
 * Time-based short-straddle scanner (the classic 9:20 / 9:30 setup).
 * Anchors a 75-candle session to 09:15–15:30 IST and maps entry/exit clock times
 * to candle indices, then runs the short straddle with sensible default rails.
 */
export function runScanner(opts = {}) {
  const interval = INTERVAL_MIN[opts.interval] ? opts.interval : '5m';
  const entryTime = opts.entryTime || '09:20';
  const exitTime = opts.exitTime || '15:00';
  const entryIndex = timeToIndex(entryTime, interval);
  const exitIndex = timeToIndex(exitTime, interval);
  const result = runStraddlePaper({
    type: 'short',
    combinedSLPct: 30,
    combinedTargetPct: 25,
    legSLPct: 50,
    trailingSLPct: 10,
    ...opts,
    interval,
    entryIndex,
    exitIndex,
  });
  return { scanner: '9:20 short straddle', entryTime, exitTime, ...result };
}

function timeToIndex(t, interval) {
  const [h, m] = String(t).split(':').map(Number);
  const mins = h * 60 + m - (9 * 60 + 15); // minutes after 09:15
  const step = INTERVAL_MIN[interval] || 5;
  return clamp(Math.round(mins / step), 0, 74);
}

function num(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
