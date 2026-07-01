import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Kpi, money, sign, cls } from '../components/ui.jsx';
import TradeTable from '../components/TradeTable.jsx';
import AlertsFeed from '../components/AlertsFeed.jsx';

export default function LiveStraddleMonitor() {
  const { alerts } = useApp();
  const [straddles, setStraddles] = useState([]);

  const load = () => api('/paper/trades').then((r) => r.ok && setStraddles(r.trades.filter((t) => t.mode === 'paper-straddle')));
  useEffect(() => { load(); }, []);
  // Reload when a new straddle alert arrives.
  useEffect(() => { if (alerts.some((a) => String(a.type).includes('straddle'))) load(); }, [alerts]);

  const totalPnl = straddles.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = straddles.filter((t) => t.pnl > 0).length;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="notice span-all">
        Short straddles are simulated <strong>unhedged</strong> — theoretically unlimited risk. Paper only. The kill switch (top-right) halts all trading.
      </div>
      <div className="grid cols-4 span-all">
        <Kpi label="Straddle trades" value={straddles.length} />
        <Kpi label="Total P&L" value={sign(totalPnl)} valueClass={cls(totalPnl)} />
        <Kpi label="Wins" value={`${wins} / ${straddles.length}`} />
        <Kpi label="Win rate" value={straddles.length ? Math.round((wins / straddles.length) * 100) + '%' : '—'} />
      </div>
      <div className="grid cols-2 span-all">
        <Card title="Straddle Positions (paper)"><TradeTable trades={[...straddles].reverse()} limit={20} /></Card>
        <Card title="Straddle Alerts" tag="live"><AlertsFeed limit={12} filter={(a) => String(a.type).includes('straddle')} /></Card>
      </div>
    </div>
  );
}
