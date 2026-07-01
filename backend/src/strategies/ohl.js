// Open = High / Open = Low — trade strong opening directional bias.
//
// Aggregates the first ~15 min (3×5m) into an opening candle. If its OPEN equals
// its LOW (no selling below the open) the bias is bullish; if OPEN equals HIGH the
// bias is bearish. We require price to confirm by trading beyond the opening
// candle and on the right side of VWAP. Stop = the opening candle's low/high.

import { atr } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'OpenHighOpenLow',
  timeframe: '5m',
  indicators: ['OpeningCandle', 'VWAP', 'ATR(14)'],

  generateSignal(md, context = {}) {
    const { candles, lastPrice, vwap, symbol } = md;
    const openBars = context.openingCandleBars ?? 3; // ~15 min
    if (candles.length < openBars + 5) return noTrade(this, symbol, 'Opening candle not formed.');

    const oc = candles.slice(0, openBars);
    const open = oc[0].open;
    const high = Math.max(...oc.map((c) => c.high));
    const low = Math.min(...oc.map((c) => c.low));
    const a = atr(candles, 14);
    if (a == null || vwap == null) return noTrade(this, symbol, 'Indicators not ready.');

    const tol = open * 0.0008; // ~0.08% tolerance for "equals"

    // Open == Low → bullish bias
    if (Math.abs(open - low) <= tol && lastPrice > high && lastPrice > vwap) {
      const stop = low;
      const target = lastPrice + 2 * (lastPrice - stop);
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 60,
        reason: `Open≈Low (${open.toFixed(2)}≈${low.toFixed(2)}): bullish bias, price above opening high & VWAP.`,
        extra: { openHigh: round2(high), openLow: round2(low) },
      });
    }

    // Open == High → bearish bias
    if (Math.abs(open - high) <= tol && lastPrice < low && lastPrice < vwap) {
      const stop = high;
      const target = lastPrice - 2 * (stop - lastPrice);
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 60,
        reason: `Open≈High (${open.toFixed(2)}≈${high.toFixed(2)}): bearish bias, price below opening low & VWAP.`,
        extra: { openHigh: round2(high), openLow: round2(low) },
      });
    }

    return noTrade(this, symbol, 'No clean Open=High / Open=Low bias with confirmation.');
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
