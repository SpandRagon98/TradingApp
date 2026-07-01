import { useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import ConfirmTradeModal from '../components/ConfirmTradeModal.jsx';

export default function LiveTrading() {
  const meta = useMeta();
  const { config } = useApp();
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('Momentum');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    const r = await api('/live/prepare', { method: 'POST', body: { symbol, strategy } });
    setBusy(false);
    if (!r.ok) return alert(r.error);
    if (!r.prepared) return alert('No actionable signal: ' + (r.reason || ''));
    setConfirmation(r.confirmation);
  };

  return (
    <Card title="Live Trading" tag={config?.liveTradingEnabled ? 'LIVE ENABLED' : 'paper-safe'}>
      <div className={config?.liveTradingEnabled ? 'warn' : 'notice'}>
        {config?.liveTradingEnabled
          ? 'Live execution is ENABLED. Preparing a trade and confirming will place a REAL order via Groww.'
          : 'Live execution is DISABLED (triple-gated off). You can preview a prepared order, but Confirm is disabled — nothing is sent.'}
      </div>
      <div className="controls" style={{ marginTop: 12 }}>
        <Field label="Symbol"><Select value={symbol} onChange={setSymbol} options={meta.symbols} /></Field>
        <Field label="Strategy"><Select value={strategy} onChange={setStrategy} options={meta.strategies} /></Field>
        <Btn onClick={prepare} primary disabled={busy}>{busy ? 'Preparing…' : 'Prepare Trade'}</Btn>
      </div>
      <ul className="muted" style={{ fontSize: 12.5 }}>
        <li>Every live order requires explicit confirmation and a mandatory stop-loss.</li>
        <li>Daily-loss limit, consecutive-loss breaker, and the kill switch all apply.</li>
      </ul>
      <ConfirmTradeModal confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </Card>
  );
}
