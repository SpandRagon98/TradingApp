// Moving-average crossover — identify trend changes via EMA crossovers.
//
// Detects a fast/slow EMA crossover ON THE LAST BAR (default 9/21; override via
// context.fast / context.slow). Filters chop with ADX and confirms direction with
// VWAP. ATR sets the stop; target is 2R.

import { emaSeries, atr, adx } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'MACrossover',
  timeframe: '5m',
  indicators: ['EMA(fast)', 'EMA(slow)', 'ADX(14)', 'VWAP', 'ATR(14)'],

  generateSignal(md, context = {}) {
    const { closes, candles, lastPrice, vwap, symbol } = md;
    const fast = context.fast ?? 9;
    const slow = context.slow ?? 21;
    if (closes.length < slow + 5) return noTrade(this, symbol, 'Not enough candles for EMA crossover.');

    const ef = emaSeries(closes, fast);
    const es = emaSeries(closes, slow);
    const a = atr(candles, 14);
    const dmi = adx(candles, 14);
    if (a == null || dmi == null) return noTrade(this, symbol, 'Indicators not ready.');

    const n = closes.length - 1;
    const crossedUp = ef[n - 1] <= es[n - 1] && ef[n] > es[n];
    const crossedDown = ef[n - 1] >= es[n - 1] && ef[n] < es[n];

    if (dmi.adx < 18) return noTrade(this, symbol, `Sideways market (ADX ${dmi.adx.toFixed(0)} < 18) — skip crossover.`);

    if (crossedUp && lastPrice > vwap) {
      const stop = lastPrice - 1.5 * a;
      const target = lastPrice + 3 * a;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 55 + Math.min(dmi.adx - 18, 20),
        reason: `Bullish EMA${fast}/${slow} crossover, ADX ${dmi.adx.toFixed(0)}, price above VWAP.`,
        extra: { adx: round1(dmi.adx) },
      });
    }

    if (crossedDown && lastPrice < vwap) {
      const stop = lastPrice + 1.5 * a;
      const target = lastPrice - 3 * a;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 55 + Math.min(dmi.adx - 18, 20),
        reason: `Bearish EMA${fast}/${slow} crossover, ADX ${dmi.adx.toFixed(0)}, price below VWAP.`,
        extra: { adx: round1(dmi.adx) },
      });
    }

    return noTrade(this, symbol, 'No fresh EMA crossover aligned with VWAP this bar.');
  },
};

const round1 = (n) => Math.round(n * 10) / 10;
export default strategy;
