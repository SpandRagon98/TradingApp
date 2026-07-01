// Gap-and-Go — trade an opening gap that continues in the gap direction.
//
// Needs a meaningful gap vs the previous close, the price holding beyond the
// opening range (first ~15 min), and volume confirmation. Rejects tiny gaps
// (noise) and very large gaps (news-trap / exhaustion risk). Stop = opposite side
// of the opening range.

import { relativeVolume, percentChange } from '../indicators.js';
import { SignalType, signal, noTrade } from './base.js';

const strategy = {
  name: 'GapAndGo',
  timeframe: '5m',
  indicators: ['Gap%', 'OpeningRange', 'Volume'],

  generateSignal(md, context = {}) {
    const { candles, prevClose, lastPrice, symbol } = md;
    const orBars = context.openingRangeCandles ?? 3; // ~15 min on 5m
    if (candles.length < orBars + 5 || prevClose == null) return noTrade(this, symbol, 'Opening range / prev close not ready.');

    const gap = percentChange(prevClose, candles[0].open);
    const relVol = relativeVolume(candles, 20);
    if (relVol == null) return noTrade(this, symbol, 'Volume not ready.');

    const minGap = 0.4, maxGap = 3.0;
    if (Math.abs(gap) < minGap) return noTrade(this, symbol, `Gap too small (${gap.toFixed(2)}%).`);
    if (Math.abs(gap) > maxGap) return noTrade(this, symbol, `Gap too large (${gap.toFixed(2)}%) — news-trap risk, skip.`);
    if (relVol < 1.2) return noTrade(this, symbol, `Weak volume (relVol ${relVol.toFixed(1)}x).`);

    const orC = candles.slice(0, orBars);
    const orh = Math.max(...orC.map((c) => c.high));
    const orl = Math.min(...orC.map((c) => c.low));

    // Gap up + holding above opening range → long continuation
    if (gap > 0 && lastPrice > orh) {
      const stop = orl;
      const target = lastPrice + 2 * (lastPrice - stop);
      return signal(this, symbol, {
        type: SignalType.BUY,
        entry: lastPrice,
        stop,
        target,
        confidence: 58 + Math.min(relVol - 1.2, 1) * 20,
        reason: `Gap up ${gap.toFixed(2)}%, holding above ORH ${orh.toFixed(2)}, relVol ${relVol.toFixed(1)}x.`,
        extra: { gapPct: round2(gap), orh: round2(orh), orl: round2(orl) },
      });
    }

    // Gap down + below opening range → short continuation
    if (gap < 0 && lastPrice < orl) {
      const stop = orh;
      const target = lastPrice - 2 * (stop - lastPrice);
      return signal(this, symbol, {
        type: SignalType.SHORT,
        entry: lastPrice,
        stop,
        target,
        confidence: 58 + Math.min(relVol - 1.2, 1) * 20,
        reason: `Gap down ${gap.toFixed(2)}%, below ORL ${orl.toFixed(2)}, relVol ${relVol.toFixed(1)}x.`,
        extra: { gapPct: round2(gap), orh: round2(orh), orl: round2(orl) },
      });
    }

    return noTrade(this, symbol, `Gap ${gap.toFixed(2)}% but price not continuing past opening range.`);
  },
};

const round2 = (n) => Math.round(n * 100) / 100;
export default strategy;
