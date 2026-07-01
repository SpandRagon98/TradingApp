import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Field, Btn } from '../components/ui.jsx';

const FIELDS = [
  ['capital', 'Capital (₹)'],
  ['riskPerTradePct', 'Risk / trade (%)'],
  ['maxDailyLossPct', 'Max daily loss (%)'],
  ['minRiskReward', 'Min risk-reward'],
  ['maxTradesPerDay', 'Max trades / day'],
  ['maxOpenTrades', 'Max open trades'],
  ['maxConsecutiveLosses', 'Max consecutive losses'],
];

export default function RiskSettings() {
  const { refreshRisk, refreshConfig } = useApp();
  const [vals, setVals] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api('/risk/status').then((r) => r.ok && setVals({ ...r.risk.limits })); }, []);

  const save = async () => {
    const r = await api('/risk/settings', { method: 'POST', body: { risk: vals } });
    if (r.ok) { setVals({ ...r.risk.limits }); setSaved(true); setTimeout(() => setSaved(false), 2000); refreshRisk(); refreshConfig(); }
  };

  if (!vals) return <Card title="Risk Settings"><div className="muted">Loading…</div></Card>;

  return (
    <Card title="Risk Settings" tag="applies to paper & live">
      <div className="controls">
        {FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="number" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="btn-row">
        <Btn onClick={save} primary>Save Settings</Btn>
        {saved && <span className="pos" style={{ alignSelf: 'center' }}>Saved ✓</span>}
      </div>
      <div className="notice" style={{ marginTop: 12 }}>
        These overrides merge with the <code>.env</code> defaults in the risk engine. Position sizing, the daily-loss limit,
        the consecutive-loss breaker, and the minimum risk-reward filter all use these values immediately.
      </div>
    </Card>
  );
}
