import { Metrics, money, sign, cls } from './ui.jsx';

// Renders either a straddle BUILD (greeks/breakevens) or a straddle PAPER/scanner
// result (entry→exit + P&L), auto-detected from the shape.
export default function StraddleCard({ data }) {
  if (!data) return null;
  const warn = (data.warnings || []).map((w, i) => <div className="warn" key={i}>{w}</div>);

  // Paper / scanner result has combinedExit + pnl.
  if (data.combinedExit !== undefined) {
    return (
      <div>
        <Metrics items={[
          { label: 'Strike', value: data.strike },
          { label: 'Spot in→out', value: `${data.spot0}→${data.spotExit}` },
          { label: 'CE in→out', value: `${data.ceEntry}→${data.ceExit}` },
          { label: 'PE in→out', value: `${data.peEntry}→${data.peExit}` },
          { label: 'Combined in→out', value: `${data.combinedEntry}→${data.combinedExit}` },
          { label: 'Exit reason', value: data.exitReason },
          { label: 'Costs', value: money(data.costs) },
          { label: 'P&L', value: sign(data.pnl), valueClass: cls(data.pnl) },
        ]} />
        {warn}
      </div>
    );
  }

  // Build result has greeks + breakevens.
  const g = data.greeks || {};
  return (
    <div>
      <Metrics items={[
        { label: 'Spot', value: data.spot },
        { label: 'ATM strike', value: data.strike },
        { label: 'IV / DTE', value: `${data.iv}% / ${data.daysToExpiry}d` },
        { label: 'CE / PE', value: `${data.cePremium} / ${data.pePremium}` },
        { label: 'Combined premium', value: data.combinedPremium },
        { label: 'Qty', value: data.quantity },
        { label: 'Breakeven ↓↑', value: `${data.breakevenDown}–${data.breakevenUp}` },
        { label: 'Max profit', value: typeof data.maxProfit === 'number' ? money(data.maxProfit) : data.maxProfit, valueClass: 'pos' },
        { label: 'Max loss', value: typeof data.maxLoss === 'number' ? money(data.maxLoss) : data.maxLoss, valueClass: 'neg' },
        { label: 'Net Δ', value: g.delta },
        { label: 'Net Θ/day', value: `${g.theta} (${money(data.thetaPerDayValue)})`, valueClass: g.theta >= 0 ? 'pos' : 'neg' },
        { label: 'Net ν', value: g.vega },
      ]} />
      {warn}
    </div>
  );
}
