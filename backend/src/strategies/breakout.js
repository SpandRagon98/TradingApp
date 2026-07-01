// Breakout strategy — capture moves after a resistance/support break.
//
// Resistance/support are the swing high/low over a lookback (excluding the most
// recent candles, which form the breakout test). A breakout needs a candle CLOSE
// beyond the level AND volume expansion — weak, low-volume breaks are rejected.
// Stop sits just inside the broken level; target is 2R.

import { atr, relativeVolume } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'Breakout',
  timeframe: '5m',
  indicators: ['SwingHigh/Low', 'Volume', 'ATR(14)'],

  generateSignal(md, context = {}) {
    const { candles, lastPrice, symbol } = md;
    const lookback = context.breakoutLookback ?? 20;
    const testBars = 2; // most recent bars are the breakout test
    if (candles.length < lookback + testBars + 5) return noTrade(this, symbol, 'Not enough candles for breakout levels.');

    const base = candles.slice(candles.length - lookback - testBars, candles.length - testBars);
    const resistance = Math.max(...base.map((c) => c.high));
    const support = Math.min(...base.map((c) => c.low));
    const a = atr(candles, 14);
    const relVol = relativeVolume(candles, 20);
    if (a == null || relVol == null) return noTrade(this, symbol, 'Indicators not ready.');

    const last = candles[candles.length - 1];
    if (relVol < 1.3) return noTrade(this, symbol, `No volume expansion (relVol ${relVol.toFixed(1)}x < 1.3x).`);

    // Long breakout above resistance
    if (last.close > resistance) {
      const stop = resistance - 0.3 * a;
      const target = lastPrice + 2 * (lastPrice - stop);
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 60 + Math.min(relVol - 1.3, 1) * 25,
        reason: `Close ${last.close} broke resistance ${resistance.toFixed(2)} on relVol ${relVol.toFixed(1)}x.`,
        extra: { level: round2(resistance), relVolume: round1(relVol) },
      });
    }

    // Short breakdown below support
    if (last.close < support) {
      const stop = support + 0.3 * a;
      const target = lastPrice - 2 * (stop - lastPrice);
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 60 + Math.min(relVol - 1.3, 1) * 25,
        reason: `Close ${last.close} broke support ${support.toFixed(2)} on relVol ${relVol.toFixed(1)}x.`,
        extra: { level: round2(support), relVolume: round1(relVol) },
      });
    }

    return noTrade(this, symbol, `Inside range ${support.toFixed(2)}–${resistance.toFixed(2)}. No breakout.`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;
export default strategy;
