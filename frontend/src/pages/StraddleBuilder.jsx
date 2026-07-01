import { useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import StraddleCard from '../components/StraddleCard.jsx';

const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

export default function StraddleBuilder() {
  const { refreshRisk } = useApp();
  const [index, setIndex] = useState('NIFTY');
  const [type, setType] = useState('short');
  const [lots, setLots] = useState(1);
  const [dte, setDte] = useState(1);
  const [data, setData] = useState(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const body = () => ({ index, type, lots: Number(lots), daysToExpiry: Number(dte) });
  const call = async (path, lbl, body2) => {
    setBusy(true); setLabel(lbl);
    const r = await api(path, { method: 'POST', body: body2 || body() });
    setData(r.ok ? (r.straddle || r.result) : { error: r.error });
    setBusy(false);
    refreshRisk();
  };

  return (
    <Card title="Straddle Builder & Paper Engine" tag="paper-only">
      <div className="controls">
        <Field label="Index"><Select value={index} onChange={setIndex} options={INDICES} /></Field>
        <Field label="Type"><Select value={type} onChange={setType} options={[{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }]} /></Field>
        <Field label="Lots"><input type="number" value={lots} min={1} onChange={(e) => setLots(e.target.value)} /></Field>
        <Field label="Days to expiry"><input type="number" value={dte} min={0} onChange={(e) => setDte(e.target.value)} /></Field>
      </div>
      <div className="btn-row">
        <Btn onClick={() => call('/options/straddle/build', 'build')} disabled={busy}>Build (Greeks)</Btn>
        <Btn onClick={() => call('/options/straddle/paper', 'paper')} primary disabled={busy}>Run Paper Trade</Btn>
        <Btn onClick={() => call('/options/straddle/scanner', 'scanner', { index, lots: Number(lots), daysToExpiry: Number(dte) })} disabled={busy}>9:20 Scanner</Btn>
      </div>
      {busy && <div className="muted" style={{ marginTop: 10 }}>Running {label}…</div>}
      {data?.error && <div className="neg">{data.error}</div>}
      {data && !data.error && <div style={{ marginTop: 10 }}><StraddleCard data={data} /></div>}
    </Card>
  );
}
