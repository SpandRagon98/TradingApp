// Strategy contract + shared helpers.
//
// Each strategy is a module exporting a default object:
//   {
//     name: string,
//     timeframe: string,
//     indicators: string[],
//     generateSignal(marketData, context) -> TradeSignal
//   }
//
// TradeSignal shape (see signal() below). Position sizing and final approval are
// added later by the risk engine + scorer — strategies only express intent.

export const SignalType = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL', // exit/short-cover or plain sell
  SHORT: 'SHORT',
  EXIT: 'EXIT',
  NO_TRADE: 'NO_TRADE',
});

/** Build a NO_TRADE signal with a reason. */
export function noTrade(strategy, symbol, reason) {
  return {
    type: SignalType.NO_TRADE,
    strategy: strategy.name,
    symbol,
    reason,
    rejectionReason: reason,
    timeframe: strategy.timeframe,
    indicators: strategy.indicators,
  };
}

/** Build an actionable signal. SL/target are required for any non-NO_TRADE. */
export function signal(strategy, symbol, { type, entry, stop, target, reason, confidence = 50, extra = {} }) {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const rr = risk > 0 ? reward / risk : 0;
  return {
    type,
    strategy: strategy.name,
    symbol,
    entry: round2(entry),
    stop: round2(stop),
    target: round2(target),
    riskPerUnit: round2(risk),
    rewardPerUnit: round2(reward),
    riskReward: round2(rr),
    confidence: Math.round(confidence),
    reason,
    rejectionReason: null,
    timeframe: strategy.timeframe,
    indicators: strategy.indicators,
    ...extra,
  };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}
