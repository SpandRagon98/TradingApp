// Mean reversion — fade overextended moves back toward the mean (Bollinger mid).
//
// Long only when RSI is oversold AND price is at/below the lower band AND the last
// candle is a bullish reversal — and the market is NOT strongly trending (ADX low),
// to avoid catching a falling knife. Symmetric for shorts. Target = band mid.

import { rsi, bollinger, atr, adx } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'MeanReversion',
  timeframe: '5m',
  indicators: ['RSI(14)', 'Bollinger(20,2)', 'ADX(14)', 'ATR(14)'],

  generateSignal(md) {
    const { closes, candles, lastPrice, symbol } = md;
    if (closes.length < 25) return noTrade(this, symbol, 'Not enough candles for mean reversion.');

    const r = rsi(closes, 14);
    const bb = bollinger(closes, 20, 2);
    const a = atr(candles, 14);
    const dmi = adx(candles, 14);
    if (r == null || bb == null || a == null || dmi == null) return noTrade(this, symbol, 'Indicators not ready.');

    // ADX < 28 keeps us out of strongly-trending markets (a real trend is 30+),
    // while still allowing the sharp range-flush that mean reversion targets.
    if (dmi.adx >= 28) return noTrade(this, symbol, `Strong trend (ADX ${dmi.adx.toFixed(0)}) — no mean reversion.`);

    const last = candles[candles.length - 1];
    const bullishReversal = last.close > last.open;
    const bearishReversal = last.close < last.open;

    // Oversold bounce
    if (r < 33 && lastPrice <= bb.lower * 1.003 && bullishReversal) {
      const stop = last.low - 0.5 * a;
      const target = bb.mid;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 55 + (33 - r),
        reason: `Oversold RSI ${r.toFixed(0)} at lower band ${bb.lower.toFixed(2)}, bullish reversal candle, ADX ${dmi.adx.toFixed(0)}.`,
        extra: { rsi: round1(r), bbMid: round2(bb.mid) },
      });
    }

    // Overbought rejection
    if (r > 67 && lastPrice >= bb.upper * 0.997 && bearishReversal) {
      const stop = last.high + 0.5 * a;
      const target = bb.mid;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 55 + (r - 67),
        reason: `Overbought RSI ${r.toFixed(0)} at upper band ${bb.upper.toFixed(2)}, bearish reversal candle, ADX ${dmi.adx.toFixed(0)}.`,
        extra: { rsi: round1(r), bbMid: round2(bb.mid) },
      });
    }

    return noTrade(this, symbol, `No oversold/overbought reversal at the bands (RSI ${r.toFixed(0)}).`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;
export default strategy;
