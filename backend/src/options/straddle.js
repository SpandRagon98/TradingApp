// Straddle builder — now priced with Black-Scholes (real premiums + Greeks).
// PAPER-FIRST, ANALYSIS ONLY: this is not an order and not a live quote. Swap in
// the broker option-chain + margin APIs before any live use.
//
// Safety: a naked SHORT straddle has theoretically UNLIMITED loss. This builder
// surfaces explicit warnings and a `requiresHedge` flag; live execution of a short
// straddle is gated off by default.

import { bs, timeToExpiryYears } from './greeks.js';
import { INDEX_META, RISK_FREE, resolveSpot } from './option_chain.js';

export function buildStraddle(opts = {}) {
  const index = String(opts.index || 'NIFTY').toUpperCase();
  const meta = INDEX_META[index];
  if (!meta) return { error: `Unsupported index: ${index}. Try ${Object.keys(INDEX_META).join(', ')}.` };

  const type = String(opts.type || 'long').toLowerCase();
  if (type !== 'long' && type !== 'short') return { error: "type must be 'long' or 'short'" };

  const lots = Math.max(1, Math.floor(Number(opts.lots) || 1));
  const lotSize = Math.max(1, Math.floor(Number(opts.lotSize) || meta.lotSize));
  const quantity = lots * lotSize;

  let spot = Number(opts.spot);
  if (!Number.isFinite(spot)) spot = resolveSpot(index);

  const strike = Number.isFinite(Number(opts.strike)) ? Number(opts.strike) : Math.round(spot / meta.step) * meta.step;
  const iv = Number(opts.iv) > 0 ? Number(opts.iv) : meta.baseIV;
  const T = timeToExpiryYears({ expiry: opts.expiry, daysToExpiry: opts.daysToExpiry });

  const ce = bs('ce', spot, strike, T, RISK_FREE, iv);
  const pe = bs('pe', spot, strike, T, RISK_FREE, iv);
  const combinedPremium = round2(ce.price + pe.price);
  const debitOrCredit = round2(combinedPremium * quantity);

  // Net Greeks. For a SHORT straddle the position is the negative of long legs.
  const sign = type === 'long' ? 1 : -1;
  const netGreeks = {
    delta: round4(sign * (ce.delta + pe.delta)), // ~0 at ATM
    gamma: round4(sign * (ce.gamma + pe.gamma)),
    theta: round2(sign * (ce.theta + pe.theta)), // per day; short straddle → positive (earns decay)
    vega: round2(sign * (ce.vega + pe.vega)), // short straddle → negative (hurt by IV rise)
  };

  const result = {
    estimate: true,
    paperOnly: true,
    index, type, strike,
    spot: round2(spot),
    iv: round2(iv * 100),
    daysToExpiry: round2(T * 365),
    lots, lotSize, quantity,
    cePremium: round2(ce.price),
    pePremium: round2(pe.price),
    combinedPremium,
    breakevenUp: round2(strike + combinedPremium),
    breakevenDown: round2(strike - combinedPremium),
    breakevenWidthPct: round2(((combinedPremium / strike) * 100) * 2),
    greeks: netGreeks,
    legGreeks: { ce: pick(ce), pe: pick(pe) },
    thetaPerDayValue: round2(netGreeks.theta * quantity), // rupee theta/day for the whole position
    notes: [
      'Premiums are Black-Scholes ESTIMATES (smile-free ATM IV), not live option-chain quotes.',
      'Margin for shorts is a rough placeholder — verify via the broker margin API before live use.',
    ],
    warnings: [],
  };

  if (type === 'long') {
    result.maxLoss = debitOrCredit; // debit paid
    result.maxProfit = 'unlimited (large move either direction)';
    result.marginEstimate = debitOrCredit;
    result.suggestedStopLossPct = 30;
    result.suggestedTargetPct = 40;
  } else {
    result.maxProfit = debitOrCredit; // credit received
    result.maxLoss = 'UNLIMITED if unhedged';
    result.requiresHedge = true;
    result.requiresMaxLossSetting = true;
    result.requiresMarginCheck = true;
    result.marginEstimate = round2(spot * quantity * 0.12); // rough — replace with broker SPAN
    result.suggestedStopLossPct = 30;
    result.suggestedTargetPct = 25;
    result.warnings.push(
      'NAKED SHORT STRADDLE HAS UNLIMITED RISK. Add far-OTM hedges (iron fly), set a combined-premium stop-loss and per-leg stop-loss, verify margin via the broker API, and require manual confirmation before any live order.'
    );
  }

  return result;
}

function pick(g) {
  return { price: round2(g.price), delta: round4(g.delta), gamma: round4(g.gamma), theta: round2(g.theta), vega: round2(g.vega) };
}
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
