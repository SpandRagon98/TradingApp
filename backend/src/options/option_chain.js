// Option chain — synthetic, but structured exactly like a real broker chain so the
// Groww adapter can populate the same shape later. Premiums come from Black-Scholes
// with a volatility smile; OI/volume are deterministic per (index, expiry, strike).
//
// Derived analytics: ATM strike, PCR, max pain, and OI-based support/resistance.

import { bs, timeToExpiryYears } from './greeks.js';
import { generateCandles, toMarketData } from '../marketdata/candles.js';

// Index metadata. Lot sizes change via exchange circulars — override per request.
// baseIV is the at-the-money implied vol used to seed the chain. It is set to match
// the synthetic market-data engine's REALIZED volatility (~22% annualised), so the
// options are fairly priced relative to the underlying's actual movement and a
// short straddle is a roughly fair game (theta vs gamma) rather than a guaranteed
// loss. With REAL data, use the broker's live IV instead.
export const INDEX_META = {
  NIFTY: { step: 50, lotSize: 75, baseIV: 0.22 },
  BANKNIFTY: { step: 100, lotSize: 30, baseIV: 0.24 },
  FINNIFTY: { step: 50, lotSize: 65, baseIV: 0.23 },
  SENSEX: { step: 100, lotSize: 20, baseIV: 0.22 },
};

export const RISK_FREE = 0.065;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Resolve a synthetic spot for an index from the market-data engine. */
export function resolveSpot(index) {
  const md = toMarketData(index, '5m', generateCandles(index, '5m', 30, daySeed()));
  return md.lastPrice;
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Build an option chain around ATM.
 * @returns { index, spot, atmStrike, daysToExpiry, rows:[{strike, ce, pe}], pcr, maxPain, support, resistance }
 */
export function generateOptionChain({ index = 'NIFTY', spot, expiry, daysToExpiry, strikesEach = 10 } = {}) {
  index = String(index).toUpperCase();
  const meta = INDEX_META[index];
  if (!meta) return { error: `Unsupported index ${index}. Try ${Object.keys(INDEX_META).join(', ')}.` };

  if (!Number.isFinite(Number(spot))) spot = resolveSpot(index);
  spot = Number(spot);
  const T = timeToExpiryYears({ expiry, daysToExpiry });
  const atm = Math.round(spot / meta.step) * meta.step;
  const expKey = expiry || `d${daysToExpiry ?? 3}`;

  const rows = [];
  for (let i = -strikesEach; i <= strikesEach; i++) {
    const K = atm + i * meta.step;
    if (K <= 0) continue;
    // Volatility smile: IV rises away from ATM.
    const moneyness = Math.abs(K - spot) / spot;
    const iv = meta.baseIV * (1 + 2.2 * moneyness);
    const ce = bs('ce', spot, K, T, RISK_FREE, iv);
    const pe = bs('pe', spot, K, T, RISK_FREE, iv);
    const seed = hash(index + expKey + K);
    rows.push({
      strike: K,
      moneyness: K === atm ? 'ATM' : K < spot ? `ITM${i < 0 ? '' : ''}` : 'OTM',
      ce: leg(ce, iv, seed, 'ce', i),
      pe: leg(pe, iv, seed, 'pe', i),
    });
  }

  const totCeOI = rows.reduce((s, r) => s + r.ce.oi, 0);
  const totPeOI = rows.reduce((s, r) => s + r.pe.oi, 0);
  const pcr = totCeOI ? round2(totPeOI / totCeOI) : null;

  return {
    index,
    spot: round2(spot),
    atmStrike: atm,
    daysToExpiry: round2(T * 365),
    expiry: expiry || null,
    riskFreeRate: RISK_FREE,
    rows,
    pcr,
    maxPain: computeMaxPain(rows),
    support: highestOI(rows, 'pe'), // put writers defend → support
    resistance: highestOI(rows, 'ce'), // call writers cap → resistance
  };
}

function leg(g, iv, seed, side, i) {
  const ltp = round2(g.price);
  const spread = Math.max(0.05, ltp * 0.01);
  // OI peaks near ATM (bell shape), with a deterministic per-strike jitter.
  const frac = ((seed >>> (side === 'ce' ? 3 : 11)) % 1000) / 1000;
  const bell = Math.exp(-(i * i) / 18);
  const oi = Math.round((200000 * bell + 15000) * (0.6 + 0.8 * frac));
  const changeOI = Math.round(oi * ((frac - 0.5) * 0.4)); // ±20%
  const volume = Math.round(oi * (0.2 + 0.6 * frac));
  return {
    ltp,
    iv: round2(iv * 100), // percent
    oi,
    changeOI,
    volume,
    bid: round2(Math.max(0, ltp - spread / 2)),
    ask: round2(ltp + spread / 2),
    delta: round4(g.delta),
    gamma: round4(g.gamma),
    theta: round2(g.theta),
    vega: round2(g.vega),
  };
}

/** Max pain = expiry price minimizing total option-holder intrinsic value. */
function computeMaxPain(rows) {
  let best = null, bestPain = Infinity;
  for (const candidate of rows.map((r) => r.strike)) {
    let pain = 0;
    for (const r of rows) {
      pain += r.ce.oi * Math.max(candidate - r.strike, 0);
      pain += r.pe.oi * Math.max(r.strike - candidate, 0);
    }
    if (pain < bestPain) { bestPain = pain; best = candidate; }
  }
  return best;
}

function highestOI(rows, side) {
  let best = null, max = -1;
  for (const r of rows) {
    if (r[side].oi > max) { max = r[side].oi; best = r.strike; }
  }
  return best;
}

function round4(n) { return Math.round(n * 10000) / 10000; }
