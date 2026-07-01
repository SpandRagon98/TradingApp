// VWAP strategy — use VWAP as intraday fair value / dynamic S&R.
//
// Long when price reclaims and sustains above VWAP with a bullish close after a
// dip toward it (bounce). Short on rejection from below. Avoids entries when
// price is stretched far from VWAP (mean-reversion risk).

import { ema, atr } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'VWAP',
  timeframe: '5m',
  indicators: ['VWAP', 'EMA(20)', 'ATR(14)'],

  generateSignal(md) {
    const { candles, closes, lastPrice, vwap, symbol } = md;
    if (closes.length < 25 || vwap == null) return noTrade(this, symbol, 'VWAP/candles not ready.');

    const a = atr(candles, 14);
    const e20 = ema(closes, 20);
    if (a == null) return noTrade(this, symbol, 'ATR not ready.');

    const distPct = ((lastPrice - vwap) / vwap) * 100;
    if (Math.abs(distPct) > 1.2) return noTrade(this, symbol, `Price stretched ${distPct.toFixed(2)}% from VWAP — skip.`);

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Bullish VWAP bounce: prior dipped to/below VWAP, last closes back above with EMA support.
    const dippedNearVwap = prev.low <= vwap * 1.001;
    if (dippedNearVwap && last.close > vwap && lastPrice > e20) {
      const stop = Math.min(prev.low, vwap) - 0.3 * a;
      const risk = lastPrice - stop;
      const target = lastPrice + 2 * risk;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 58,
        reason: `VWAP bounce: reclaimed VWAP ${vwap.toFixed(2)}, close above EMA20. Dist ${distPct.toFixed(2)}%.`,
        extra: { vwap: round2(vwap), distFromVwapPct: round2(distPct) },
      });
    }

    // Bearish VWAP rejection
    const poppedNearVwap = prev.high >= vwap * 0.999;
    if (poppedNearVwap && last.close < vwap && lastPrice < e20) {
      const stop = Math.max(prev.high, vwap) + 0.3 * a;
      const risk = stop - lastPrice;
      const target = lastPrice - 2 * risk;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 58,
        reason: `VWAP rejection: failed at VWAP ${vwap.toFixed(2)}, close below EMA20. Dist ${distPct.toFixed(2)}%.`,
        extra: { vwap: round2(vwap), distFromVwapPct: round2(distPct) },
      });
    }

    return noTrade(this, symbol, `No clean VWAP bounce/rejection (dist ${distPct.toFixed(2)}%).`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
