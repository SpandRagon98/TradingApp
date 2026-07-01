import { sign, cls } from './ui.jsx';

// Generic trade table. Handles both equity paper trades and straddle trades
// (which carry combinedEntry/combinedExit instead of entry/exit).
export default function TradeTable({ trades, limit = 25 }) {
  if (!trades || !trades.length) return <div className="muted">No trades yet.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th><th>Strategy</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Exit reason</th><th>P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {trades.slice(0, limit).map((t) => (
          <tr key={t.id}>
            <td>{t.symbol}{t.strike ? ` ${t.strike}` : ''}</td>
            <td>{t.strategy}</td>
            <td>{t.side}</td>
            <td>{t.entry ?? t.combinedEntry ?? '—'}</td>
            <td>{t.exit ?? t.combinedExit ?? '—'}</td>
            <td>{t.quantity}</td>
            <td>{t.exitReason}</td>
            <td className={cls(t.pnl)}>{sign(t.pnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
