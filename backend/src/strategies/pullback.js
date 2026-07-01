// Pullback — join an established trend after a controlled retracement.
//
// Trend is confirmed by an EMA stack (9>21>50 for up). We then require a recent
// pullback toward EMA21 and a continuation candle in the trend direction before
// entering — never a counter-trend reversal. Stop = recent swing extreme.

import { emaSeries, atr } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'Pullback',
  timeframe: '5m',
  indicators: ['EMA(9)', 'EMA(21)', 'EMA(50)', 'ATR(14)'],

  generateSignal(md) {
    const { closes, candles, lastPrice, symbol } = md;
    if (closes.length < 55) return noTrade(this, symbol, 'Not enough candles for EMA(50) trend.');

    const e9 = emaSeries(closes, 9);
    const e21 = emaSeries(closes, 21);
    const e50 = emaSeries(closes, 50);
    const a = atr(candles, 14);
    if (a == null) return noTrade(this, symbol, 'ATR not ready.');

    const n = closes.length - 1;
    const last = candles[n];
    const prev = candles[n - 1];
    const recent = candles.slice(n - 3, n + 1);
    const ema21Now = e21[n];

    const upTrend = e9[n] > e21[n] && e21[n] > e50[n];
    const downTrend = e9[n] < e21[n] && e21[n] < e50[n];

    if (upTrend) {
      const pulledBack = recent.some((c) => c.low <= ema21Now * 1.002);
      const continuation = last.close > last.open && last.close > prev.high;
      if (pulledBack && continuation) {
        const swingLow = Math.min(...recent.map((c) => c.low));
        const stop = swingLow - 0.3 * a;
        const target = lastPrice + 2 * (lastPrice - stop);
        return signal(this, symbol, {
          type: SignalType.BUY,
          entry: lastPrice,
          stop,
          target,
          confidence: 60,
          reason: `Uptrend (EMA9>21>50), pullback to EMA21 ${ema21Now.toFixed(2)}, continuation candle.`,
          extra: { ema21: round2(ema21Now) },
        });
      }
      return noTrade(this, symbol, 'Uptrend but no pullback+continuation yet.');
    }

    if (downTrend) {
      const pulledBack = recent.some((c) => c.high >= ema21Now * 0.998);
      const continuation = last.close < last.open && last.close < prev.low;
      if (pulledBack && continuation) {
        const swingHigh = Math.max(...recent.map((c) => c.high));
        const stop = swingHigh + 0.3 * a;
        const target = lastPrice - 2 * (stop - lastPrice);
        return signal(this, symbol, {
          type: SignalType.SHORT,
          entry: lastPrice,
          stop,
          target,
          confidence: 60,
          reason: `Downtrend (EMA9<21<50), pullback to EMA21 ${ema21Now.toFixed(2)}, continuation candle.`,
          extra: { ema21: round2(ema21Now) },
        });
      }
      return noTrade(this, symbol, 'Downtrend but no pullback+continuation yet.');
    }

    return noTrade(this, symbol, 'No clean EMA-stack trend to pull back into.');
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
