import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import SignalCard from '../components/SignalCard.jsx';

export default function Strategies() {
  const meta = useMeta();
  const [list, setList] = useState([]);
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('Momentum');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api('/strategies').then((r) => r.ok && setList(r.strategies));
  useEffect(() => { load(); }, []);

  const toggle = async (s) => {
    await api(`/strategies/${s.enabled ? 'disable' : 'enable'}`, { method: 'POST', body: { name: s.name } });
    load();
  };
  const run = async () => {
    setBusy(true);
    const r = await api('/strategies/run', { method: 'POST', body: { symbol, strategy } });
    setResult(r.ok ? r : { error: r.error });
    setBusy(false);
  };

  return (
    <div className="grid cols-2" style={{ gap: 14 }}>
      <Card title="Strategy Catalogue" className="span-2">
        <table>
          <thead><tr><th>Strategy</th><th>Timeframe</th><th>Indicators</th><th>Enabled</th></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.timeframe}</td>
                <td style={{ textAlign: 'left' }} className="muted">{s.indicators.join(', ')}</td>
                <td><button className={'btn' + (s.enabled ? ' btn-primary' : '')} onClick={() => toggle(s)}>{s.enabled ? 'On' : 'Off'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Analyze a Signal" className="span-2">
        <div className="controls">
          <Field label="Symbol"><Select value={symbol} onChange={setSymbol} options={meta.symbols} /></Field>
          <Field label="Strategy"><Select value={strategy} onChange={setStrategy} options={meta.strategies} /></Field>
          <Btn onClick={run} primary disabled={busy}>{busy ? 'Analyzing…' : 'Analyze'}</Btn>
        </div>
        {result?.error && <div className="neg">{result.error}</div>}
        {result?.signal && <SignalCard signal={result.signal} score={result.score} validation={result.validation} />}
      </Card>
    </div>
  );
}
