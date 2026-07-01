import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bs, bsPrice, impliedVol, timeToExpiryYears, normCdf } from '../src/options/greeks.js';

const close = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('normCdf basic values', () => {
  assert.ok(close(normCdf(0), 0.5));
  assert.ok(normCdf(3) > 0.998 && normCdf(-3) < 0.002);
});

test('Black-Scholes matches the textbook case (S=K=100,T=1,r=5%,iv=20%)', () => {
  const c = bs('ce', 100, 100, 1, 0.05, 0.2);
  const p = bs('pe', 100, 100, 1, 0.05, 0.2);
  assert.ok(close(c.price, 10.4506, 1e-3), `call ${c.price}`);
  assert.ok(close(p.price, 5.5735, 1e-3), `put ${p.price}`);
  assert.ok(close(c.delta, 0.6368, 1e-3));
  assert.ok(close(p.delta, -0.3632, 1e-3));
});

test('put-call parity: C - P = S - K e^{-rT}', () => {
  const S = 22000, K = 22000, T = 30 / 365, r = 0.065, iv = 0.18;
  const c = bsPrice('ce', S, K, T, r, iv);
  const p = bsPrice('pe', S, K, T, r, iv);
  assert.ok(close(c - p, S - K * Math.exp(-r * T), 1e-2));
});

test('implied vol round-trips a known price', () => {
  const price = bsPrice('ce', 100, 100, 1, 0.05, 0.2);
  assert.ok(close(impliedVol('ce', price, 100, 100, 1, 0.05), 0.2, 1e-3));
});

test('ATM call theta is negative (time decay)', () => {
  const c = bs('ce', 100, 100, 30 / 365, 0.05, 0.2);
  assert.ok(c.theta < 0);
  assert.ok(c.vega > 0 && c.gamma > 0);
});

test('degenerate inputs collapse to intrinsic value', () => {
  assert.equal(bs('ce', 110, 100, 0, 0.05, 0.2).price, 10); // expired ITM call
  assert.equal(bs('pe', 90, 100, 0, 0.05, 0.2).price, 10); // expired ITM put
  assert.equal(bs('ce', 90, 100, 0, 0.05, 0.2).price, 0); // expired OTM
});

test('timeToExpiryYears: days and floor', () => {
  assert.ok(close(timeToExpiryYears({ daysToExpiry: 365 }), 1, 1e-6));
  assert.ok(timeToExpiryYears({ daysToExpiry: 0 }) > 0); // floored at ~1 min
});
