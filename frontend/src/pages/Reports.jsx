import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Card, Kpi, Bars, money, sign, cls } from '../components/ui.jsx';

// Aggregates the persisted paper trades into a performance report.
export default function Reports() {
  const [trades, setTrades] = useState([]);
  useEffect(() => { api('/paper/trades').then((r) => r.ok && setTrades(r.trades)); }, []);

  if (!trades.length) return <Card title="Reports"><div className="muted">No trades to report yet — run some paper trades first.</div></Card>;

  const sorted = [...trades].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const net = sorted.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = sorted.filter((t) => t.pnl > 0);
  let eq = 0; const curve = sorted.map((t) => (eq += t.pnl || 0));

  const byStrategy = {};
  for (const t of sorted) {
    (byStrategy[t.strategy] ||= { trades: 0, pnl: 0, wins: 0 });
    byStrategy[t.strategy].trades++;
    byStrategy[t.strategy].pnl += t.pnl || 0;
    if (t.pnl > 0) byStrategy[t.strategy].wins++;
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid cols-4 span-all">
        <Kpi label="Total trades" value={sorted.length} />
        <Kpi label="Net P&L" value={sign(net)} valueClass={cls(net)} />
        <Kpi label="Win rate" value={Math.round((wins.length / sorted.length) * 100) + '%'} />
        <Kpi label="Avg P&L / trade" value={money(net / sorted.length)} valueClass={cls(net)} />
      </div>

      <Card title="Equity Curve">
        <Bars values={curve.length ? [0, ...curve] : []} />
      </Card>

      <Card title="By Strategy">
        <table>
          <thead><tr><th>Strategy</th><th>Trades</th><th>Win rate</th><th>Net P&amp;L</th></tr></thead>
          <tbody>
            {Object.entries(byStrategy).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v.trades}</td>
                <td>{Math.round((v.wins / v.trades) * 100)}%</td>
                <td className={cls(v.pnl)}>{sign(v.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
