// Black-Scholes pricing, Greeks, and implied-volatility solver.
//
// Indian index options (NIFTY/BANKNIFTY/FINNIFTY/SENSEX) are European-style, so
// Black-Scholes is the right model. Conventions used here:
//   - T is time to expiry in YEARS.
//   - sigma (IV) is annualised, as a decimal (0.12 = 12%).
//   - r is the annual risk-free rate (decimal).
//   - theta is returned PER DAY (annual theta / 365).
//   - vega is returned per 1% change in IV (annual vega / 100).
//   - rho is returned per 1% change in rate.
// These are estimates for analysis/paper trading, not a substitute for live quotes.

const SQRT2PI = Math.sqrt(2 * Math.PI);

function erf(x) {
  // Abramowitz & Stegun 7.1.26 — max error ~1.5e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function normPdf(x) {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

function isCallType(type) {
  const t = String(type).toLowerCase();
  return t === 'ce' || t === 'call' || t === 'c';
}

/**
 * Full Black-Scholes valuation. Returns price + Greeks.
 * Degenerate inputs (T<=0 or sigma<=0) collapse to intrinsic value with zero Greeks.
 */
export function bs(type, S, K, T, r = 0.065, sigma = 0.12, q = 0) {
  const call = isCallType(type);
  if (T <= 0 || sigma <= 0 || S <= 0) {
    const intrinsic = call ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: call ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0, d1: 0, d2: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPdf(d1);
  const disc = Math.exp(-r * T);
  const discQ = Math.exp(-q * T);

  let price, delta, thetaAnnual, rho;
  if (call) {
    const Nd1 = normCdf(d1), Nd2 = normCdf(d2);
    price = S * discQ * Nd1 - K * disc * Nd2;
    delta = discQ * Nd1;
    thetaAnnual = -(S * discQ * nd1 * sigma) / (2 * sqrtT) - r * K * disc * Nd2 + q * S * discQ * Nd1;
    rho = (K * T * disc * Nd2) / 100;
  } else {
    const Nnd1 = normCdf(-d1), Nnd2 = normCdf(-d2);
    price = K * disc * Nnd2 - S * discQ * Nnd1;
    delta = -discQ * Nnd1;
    thetaAnnual = -(S * discQ * nd1 * sigma) / (2 * sqrtT) + r * K * disc * Nnd2 - q * S * discQ * Nnd1;
    rho = (-K * T * disc * Nnd2) / 100;
  }
  const gamma = (discQ * nd1) / (S * sigma * sqrtT);
  const vega = (S * discQ * nd1 * sqrtT) / 100; // per 1% IV

  return {
    price: Math.max(price, 0),
    delta,
    gamma,
    theta: thetaAnnual / 365, // per day
    vega,
    rho,
    d1,
    d2,
  };
}

/** Convenience: just the fair price. */
export function bsPrice(type, S, K, T, r, sigma, q = 0) {
  return bs(type, S, K, T, r, sigma, q).price;
}

/**
 * Implied volatility from a market price (Newton-Raphson seeded at 25%, with a
 * bisection fallback). Returns annualised decimal, or null if not solvable.
 */
export function impliedVol(type, marketPrice, S, K, T, r = 0.065, q = 0) {
  if (marketPrice <= 0 || T <= 0 || S <= 0) return null;
  const intrinsic = isCallType(type) ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (marketPrice < intrinsic - 1e-6) return null; // arbitrage-violating price

  let sigma = 0.25;
  for (let i = 0; i < 60; i++) {
    const g = bs(type, S, K, T, r, sigma, q);
    const diff = g.price - marketPrice;
    if (Math.abs(diff) < 1e-4) return sigma;
    const vegaRaw = g.vega * 100; // back to per 1.0 vol
    if (vegaRaw < 1e-8) break;
    sigma -= diff / vegaRaw;
    if (!Number.isFinite(sigma) || sigma <= 1e-3) sigma = 1e-3;
    if (sigma > 5) sigma = 5;
  }
  // Bisection fallback.
  let lo = 1e-3, hi = 5;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const p = bsPrice(type, S, K, T, r, mid, q);
    if (Math.abs(p - marketPrice) < 1e-4) return mid;
    if (p > marketPrice) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Years to expiry from an ISO date or a days-to-expiry number. Floors at ~1 min. */
export function timeToExpiryYears({ expiry, daysToExpiry } = {}) {
  let days;
  if (expiry) {
    const ms = new Date(expiry).getTime() - Date.now();
    days = ms / 86_400_000;
  } else if (Number.isFinite(Number(daysToExpiry))) {
    days = Number(daysToExpiry);
  } else {
    days = 3; // sensible default (near weekly expiry)
  }
  return Math.max(days, 1 / (24 * 60)) / 365;
}
