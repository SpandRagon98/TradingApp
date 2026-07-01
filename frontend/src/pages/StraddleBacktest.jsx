import { useState } from 'react';
import { api } from '../services/api.js';
import { Card, Field, Select, Btn, Bars, Metrics, money, sign, cls } from '../components/ui.jsx';

const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

export default function StraddleBacktest() {
  const [index, setIndex] = useState('NIFTY');
  const [type, setType] = useState('short');
  const [sessions, setSessions] = useState(60);
  const [dte, setDte] = useState(1);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await api('/options/straddle/backtest', { method: 'POST', body: { index, type, sessions: Number(sessions), daysToExpiry: Number(dte) } });
    setM(r.ok ? r.result : { error: r.error });
    setBusy(false);
  };

  return (
    <Card title="Straddle Backtest">
      <div className="controls">
        <Field label="Index"><Select value={index} onChange={setIndex} options={INDICES} /></Field>
        <Field label="Type"><Select value={type} onChange={setType} options={[{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }]} /></Field>
        <Field label="Sessions"><input type="number" value={sessions} min={5} max={250} onChange={(e) => setSessions(e.target.value)} /></Field>
        <Field label="Days to expiry"><input type="number" value={dte} min={0} onChange={(e) => setDte(e.target.value)} /></Field>
        <Btn onClick={run} primary disabled={busy}>{busy ? 'Running…' : 'Run Backtest'}</Btn>
      </div>
      {m?.error && <div className="neg">{m.error}</div>}
      {m && !m.error && (
        <>
          <Metrics items={[
            { label: 'Trades', value: m.totalTrades },
            { label: 'Win rate', value: m.winRate + '%' },
            { label: 'Net P&L', value: sign(m.netPnl), valueClass: cls(m.netPnl) },
            { label: 'Profit factor', value: m.profitFactor },
            { label: 'Avg win', value: money(m.avgWin), valueClass: 'pos' },
            { label: 'Avg loss', value: money(m.avgLoss), valueClass: 'neg' },
            { label: 'Max drawdown', value: money(m.maxDrawdown), valueClass: 'neg' },
            { label: 'Avg MAE / MFE', value: `${money(m.avgMAE)} / ${money(m.avgMFE)}` },
          ]} />
          <div className="muted" style={{ marginTop: 8 }}>
            {m.type} straddle · {m.index} · by weekday: {Object.entries(m.byWeekday).map(([k, v]) => `${k}: ${sign(v.pnl)}`).join(' · ')}
          </div>
          <Bars values={m.equityCurve.map((p) => p.equity)} />
        </>
      )}
    </Card>
  );
}
