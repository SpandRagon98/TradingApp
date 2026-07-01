import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Kpi, Metrics, money, sign, cls } from '../components/ui.jsx';
import TradeTable from '../components/TradeTable.jsx';
import AlertsFeed from '../components/AlertsFeed.jsx';

export default function Dashboard() {
  const { config, risk } = useApp();
  const [trades, setTrades] = useState([]);
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    api('/paper/trades').then((r) => r.ok && setTrades(r.trades));
    api('/disclaimer').then((r) => r.ok && setDisclaimer(r.disclaimer));
  }, []);

  const r = risk;
  const cap = config?.risk?.capital ?? 0;
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="notice span-all">{disclaimer}</div>

      <div className="grid cols-4 span-all">
        <Kpi label="Capital" value={money(cap)} />
        <Kpi label="Day P&L" value={sign(r?.dailyPnl)} valueClass={cls(r?.dailyPnl)} />
        <Kpi label="Trades today" value={`${r?.tradesToday ?? 0} / ${r?.limits?.maxTradesPerDay ?? '—'}`} />
        <Kpi label="Daily loss used" value={`${(r?.dailyLossUsedPct ?? 0).toFixed(0)}%`} valueClass={(r?.dailyLossUsedPct ?? 0) >= 100 ? 'neg' : ''} />
      </div>

      <div className="grid cols-2 span-all">
        <Card title="Risk Status">
          {r ? (
            <Metrics items={[
              { label: 'Daily P&L', value: sign(r.dailyPnl), valueClass: cls(r.dailyPnl) },
              { label: 'Max daily loss', value: money(r.maxDailyLoss) },
              { label: 'Open trades', value: `${r.openTrades} / ${r.limits.maxOpenTrades}` },
              { label: 'Consec. losses', value: `${r.consecutiveLosses} / ${r.limits.maxConsecutiveLosses}` },
              { label: 'Risk / trade', value: r.limits.riskPerTradePct + '%' },
              { label: 'Min R:R', value: r.limits.minRiskReward + ':1' },
              { label: 'Kill switch', value: r.killSwitch ? 'ON' : 'off', valueClass: r.killSwitch ? 'neg' : 'pos' },
              { label: 'Storage', value: config?.storage || '—' },
            ]} />
          ) : <div className="muted">Loading…</div>}
        </Card>
        <Card title="Live Alerts" tag="websocket">
          <AlertsFeed limit={8} />
        </Card>
      </div>

      <Card title="Recent Paper Trades" className="span-all">
        <TradeTable trades={trades} limit={12} />
      </Card>
    </div>
  );
}
