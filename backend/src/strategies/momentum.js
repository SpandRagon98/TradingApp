// Momentum strategy — capture strong directional moves confirmed by volume.
//
// Entry (long): bullish EMA trend + RSI in a healthy momentum band + relative
// volume expansion + price above VWAP but not over-extended from it.
// Symmetric logic for shorts. ATR sets the stop distance; target = 2R.

import { ema, rsi, atr, relativeVolume, percentChange } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'Momentum',
  timeframe: '5m',
  indicators: ['EMA(9)', 'EMA(21)', 'RSI(14)', 'RelVolume', 'VWAP', 'ATR(14)'],

  generateSignal(md) {
    const { closes, candles, lastPrice, vwap, symbol } = md;
    if (closes.length < 30) return noTrade(this, symbol, 'Not enough candles for momentum read.');

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const r = rsi(closes, 14);
    const a = atr(candles, 14);
    const relVol = relativeVolume(candles, 20);
    const change = percentChange(closes[closes.length - 6] ?? closes[0], lastPrice);

    if (a == null || r == null || relVol == null) return noTrade(this, symbol, 'Indicators not ready.');

    const distFromVwapPct = vwap ? ((lastPrice - vwap) / vwap) * 100 : 0;
    const volOk = relVol >= 1.3;
    const overExtended = Math.abs(distFromVwapPct) > 1.5; // too far from fair value

    // Long momentum
    if (ema9 > ema21 && lastPrice > vwap && r >= 55 && r <= 72 && volOk && !overExtended && change > 0) {
      const stop = lastPrice - 1.2 * a;
      const target = lastPrice + 2.4 * a;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: scoreConf(r, relVol, distFromVwapPct, 'long'),
        reason: `Bullish EMA9>EMA21, RSI ${r.toFixed(0)}, relVol ${relVol.toFixed(1)}x, above VWAP by ${distFromVwapPct.toFixed(2)}%.`,
        extra: { rsi: round1(r), relVolume: round1(relVol), distFromVwapPct: round1(distFromVwapPct) },
      });
    }

    // Short momentum
    if (ema9 < ema21 && lastPrice < vwap && r <= 45 && r >= 28 && volOk && !overExtended && change < 0) {
      const stop = lastPrice + 1.2 * a;
      const target = lastPrice - 2.4 * a;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: scoreConf(r, relVol, distFromVwapPct, 'short'),
        reason: `Bearish EMA9<EMA21, RSI ${r.toFixed(0)}, relVol ${relVol.toFixed(1)}x, below VWAP by ${distFromVwapPct.toFixed(2)}%.`,
        extra: { rsi: round1(r), relVolume: round1(relVol), distFromVwapPct: round1(distFromVwapPct) },
      });
    }

    const why = overExtended
      ? `Price over-extended from VWAP (${distFromVwapPct.toFixed(2)}%).`
      : !volOk
        ? `Volume not confirming (relVol ${relVol.toFixed(1)}x < 1.3x).`
        : 'No clean trend + momentum alignment.';
    return noTrade(this, symbol, why);
  },
};

function scoreConf(r, relVol, dist, side) {
  let c = 50;
  c += Math.min(relVol - 1.3, 1) * 20;
  c += side === 'long' ? Math.max(0, r - 55) * 0.6 : Math.max(0, 45 - r) * 0.6;
  c -= Math.abs(dist) * 4;
  return Math.max(0, Math.min(95, Math.round(c)));
}

const round1 = (n) => Math.round(n * 10) / 10;

export default strategy;
