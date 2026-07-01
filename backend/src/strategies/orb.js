// Opening Range Breakout — trade the first directional move after the open.
//
// Builds the opening range from the first N candles (default ~ first 30 min on
// 5m = 6 candles). Long on a candle CLOSE above ORH with volume; short on close
// below ORL. Rejects ranges that are too wide or too narrow, and requires volume
// expansion to filter false breakouts.

import { atr, relativeVolume } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'OpeningRangeBreakout',
  timeframe: '5m',
  indicators: ['OpeningRange', 'Volume', 'ATR(14)'],

  generateSignal(md, context = {}) {
    const { candles, lastPrice, symbol } = md;
    const rangeCandles = context.openingRangeCandles ?? 6; // ~30 min on 5m
    if (candles.length < rangeCandles + 5) return noTrade(this, symbol, 'Opening range not formed yet.');

    const orCandles = candles.slice(0, rangeCandles);
    const orh = Math.max(...orCandles.map((c) => c.high));
    const orl = Math.min(...orCandles.map((c) => c.low));
    const a = atr(candles, 14);
    const relVol = relativeVolume(candles, 20);
    if (a == null || relVol == null) return noTrade(this, symbol, 'Indicators not ready.');

    const rangePct = ((orh - orl) / orl) * 100;
    if (rangePct < 0.2) return noTrade(this, symbol, `Opening range too narrow (${rangePct.toFixed(2)}%).`);
    if (rangePct > 2.5) return noTrade(this, symbol, `Opening range too wide (${rangePct.toFixed(2)}%) — skip.`);

    const last = candles[candles.length - 1];
    const volOk = relVol >= 1.2;

    // Long breakout: close above ORH
    if (last.close > orh && volOk) {
      const stop = orl; // opposite side of the range
      const risk = lastPrice - stop;
      const target = lastPrice + 2 * risk;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 60 + Math.min(relVol - 1.2, 1) * 25,
        reason: `Close ${last.close} above ORH ${orh.toFixed(2)} with relVol ${relVol.toFixed(1)}x. Range ${rangePct.toFixed(2)}%.`,
        extra: { orh: round2(orh), orl: round2(orl), rangePct: round2(rangePct) },
      });
    }

    // Short breakdown: close below ORL
    if (last.close < orl && volOk) {
      const stop = orh;
      const risk = stop - lastPrice;
      const target = lastPrice - 2 * risk;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 60 + Math.min(relVol - 1.2, 1) * 25,
        reason: `Close ${last.close} below ORL ${orl.toFixed(2)} with relVol ${relVol.toFixed(1)}x. Range ${rangePct.toFixed(2)}%.`,
        extra: { orh: round2(orh), orl: round2(orl), rangePct: round2(rangePct) },
      });
    }

    return noTrade(this, symbol, `Inside opening range (${orl.toFixed(2)}–${orh.toFixed(2)}). No breakout.`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
