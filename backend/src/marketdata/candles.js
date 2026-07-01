// Market data engine (Phase 1: synthetic generator).
//
// This stands in for Groww live/historical candles so strategies, paper trading,
// and backtests are fully exercisable offline. The real adapter (broker/groww.js)
// exposes the same shape (getHistorical / getQuote), so swapping is a 1-line change
// in the route layer once credentials are available.

import { vwap as vwapOf } from '../indicators.js';

// Deterministic PRNG so a given (symbol, seed) reproduces the same series —
// important for trustworthy backtests.
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
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const INTERVAL_MS = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
};

const BASE_PRICE = {
  NIFTY: 22000,
  BANKNIFTY: 47000,
  FINNIFTY: 21000,
  SENSEX: 73000,
  RELIANCE: 2900,
  TCS: 3900,
  INFY: 1500,
  HDFCBANK: 1650,
};

/**
 * Generate synthetic intraday candles for a symbol.
 * Produces a gently trending random walk with intraday volatility and a
 * realistic volume profile (U-shape: heavy at open/close).
 */
export function generateCandles(symbol, interval = '5m', count = 75, seed = 1) {
  const stepMs = INTERVAL_MS[interval] || INTERVAL_MS['5m'];
  const rnd = mulberry32(hashStr(symbol) ^ (seed * 2654435761));
  const base = BASE_PRICE[symbol?.toUpperCase()] || 1000;

  // Daily drift bias and volatility scale derived from the seed.
  const drift = (rnd() - 0.5) * 0.0008; // per-candle mean return
  const vol = 0.0016 + rnd() * 0.0022; // per-candle stdev

  const candles = [];
  let price = base * (0.99 + rnd() * 0.02);
  // Anchor to a 09:15 IST session start for the most recent trading day.
  const start = sessionStart(stepMs, count);

  for (let i = 0; i < count; i++) {
    const ret = drift + (rnd() - 0.5) * 2 * vol;
    const open = price;
    const close = open * (1 + ret);
    const hi = Math.max(open, close) * (1 + rnd() * vol);
    const lo = Math.min(open, close) * (1 - rnd() * vol);
    // U-shaped volume: higher near open and close.
    const frac = i / Math.max(count - 1, 1);
    const ushape = 1 + 1.5 * (Math.abs(frac - 0.5) * 2) ** 1.5;
    const volume = Math.round((50000 + rnd() * 80000) * ushape);
    candles.push({
      time: new Date(start + i * stepMs).toISOString(),
      open: round2(open),
      high: round2(hi),
      low: round2(lo),
      close: round2(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function sessionStart(stepMs, count) {
  // Place the series so the last candle is "now-ish", aligned to step.
  const now = Date.now();
  return now - count * stepMs;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic previous-session close implying a gap vs the first open.
 * gap = (firstOpen - prevClose) / prevClose  ∈ roughly [-1.5%, +1.5%].
 * Lets gap-and-go / OHL strategies reason about a real opening gap offline.
 */
function syntheticPrevClose(symbol, candles) {
  if (!candles.length) return null;
  const firstOpen = candles[0].open;
  // Key the gap on the (deterministic) open price, NOT the wall-clock timestamp,
  // so prevClose — and therefore gap-based strategies and backtests — are
  // reproducible per (symbol, seed) instead of changing every call.
  const h = hashStr(symbol + firstOpen.toFixed(2));
  const gapPct = ((h % 1000) / 1000 - 0.5) * 0.03; // ±1.5%
  return round2(firstOpen / (1 + gapPct));
}

/** Lightweight view object passed to strategies. */
export function toMarketData(symbol, interval, candles) {
  return {
    symbol,
    interval,
    candles,
    closes: candles.map((c) => c.close),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
    volumes: candles.map((c) => c.volume),
    lastPrice: candles.length ? candles[candles.length - 1].close : null,
    prevClose: syntheticPrevClose(symbol, candles),
    vwap: vwapOf(candles),
  };
}

export const SUPPORTED_INTERVALS = Object.keys(INTERVAL_MS);
export const SAMPLE_SYMBOLS = Object.keys(BASE_PRICE);
