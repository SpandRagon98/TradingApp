// Pivot points — use floor-trader pivots as intraday support/resistance.
//
// Pivots are computed from a reference period (the developing session's first
// ~60% of candles) → P, R1–R3, S1–S3. We trade a confirmed breakout above R1 or
// breakdown below S1 (with volume), avoiding the dead zone around the central
// pivot. Stop = the pivot (P); target = the next level.

import { pivots, relativeVolume } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'PivotPoint',
  timeframe: '5m',
  indicators: ['Pivots(P,R1-3,S1-3)', 'Volume'],

  generateSignal(md, context = {}) {
    const { candles, lastPrice, symbol } = md;
    if (candles.length < 30) return noTrade(this, symbol, 'Not enough candles for pivots.');

    const refFrac = context.pivotRefFraction ?? 0.6;
    const cut = Math.max(10, Math.floor(candles.length * refFrac));
    const ref = candles.slice(0, cut);
    const refHigh = Math.max(...ref.map((c) => c.high));
    const refLow = Math.min(...ref.map((c) => c.low));
    const refClose = ref[ref.length - 1].close;
    const pv = pivots(refHigh, refLow, refClose);

    const relVol = relativeVolume(candles, 20);
    if (relVol == null) return noTrade(this, symbol, 'Volume not ready.');
    const prevClose = candles[candles.length - 2].close;

    // Breakout above R1 (fresh cross) with volume
    if (lastPrice > pv.r1 && prevClose <= pv.r1 && relVol >= 1.2) {
      const stop = pv.p;
      const target = pv.r2;
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 58,
        reason: `Breakout above R1 ${pv.r1.toFixed(2)} (pivot ${pv.p.toFixed(2)}), relVol ${relVol.toFixed(1)}x. Target R2.`,
        extra: { p: round2(pv.p), r1: round2(pv.r1), r2: round2(pv.r2) },
      });
    }

    // Breakdown below S1 (fresh cross) with volume
    if (lastPrice < pv.s1 && prevClose >= pv.s1 && relVol >= 1.2) {
      const stop = pv.p;
      const target = pv.s2;
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 58,
        reason: `Breakdown below S1 ${pv.s1.toFixed(2)} (pivot ${pv.p.toFixed(2)}), relVol ${relVol.toFixed(1)}x. Target S2.`,
        extra: { p: round2(pv.p), s1: round2(pv.s1), s2: round2(pv.s2) },
      });
    }

    return noTrade(this, symbol, `Price ${lastPrice} between pivot levels (P ${pv.p.toFixed(2)}, R1 ${pv.r1.toFixed(2)}, S1 ${pv.s1.toFixed(2)}). No clean break.`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
