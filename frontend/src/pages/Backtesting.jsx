import { useState } from 'react';
import { api } from '../services/api.js';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn, Bars, Metrics, money, sign, cls } from '../components/ui.jsx';

export default function Backtesting() {
  const meta = useMeta();
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('OpeningRangeBreakout');
  const [days, setDays] = useState(30);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await api('/backtest/run', { method: 'POST', body: { symbol, strategy, days: Number(days) } });
    setM(r.ok ? r.result : { error: r.error });
    setBusy(false);
  };

  return (
    <Card title="Backtest" tag="synthetic data">
      <div className="controls">
        <Field label="Symbol"><Select value={symbol} onChange={setSymbol} options={meta.symbols} /></Field>
        <Field label="Strategy"><Select value={strategy} onChange={setStrategy} options={meta.strategies} /></Field>
        <Field label="Sessions"><input type="number" value={days} min={5} max={250} onChange={(e) => setDays(e.target.value)} /></Field>
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
            { label: 'Max consec. losses', value: m.maxConsecutiveLosses },
          ]} />
          <div className="muted" style={{ marginTop: 8 }}>Equity curve ({m.symbol} · {m.strategy})</div>
          <Bars values={m.equityCurve.map((p) => p.equity)} />
        </>
      )}
    </Card>
  );
}
