import { useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import ConfirmTradeModal from '../components/ConfirmTradeModal.jsx';
import SignalCard from '../components/SignalCard.jsx';

export default function LiveTrading() {
  const meta = useMeta();
  const { config } = useApp();
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('Momentum');
  const [confirmation, setConfirmation] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    setResult(null);
    setConfirmation(null);
    try {
      const r = await api('/live/prepare', { method: 'POST', body: { symbol, strategy } });
      if (!r.ok) {
        setResult({ type: 'error', message: r.error || 'Unable to check this trade setup.' });
        return;
      }
      if (!r.prepared) {
        setResult({
          type: 'no-trade',
          message: r.reason || r.signal?.rejectionReason || 'The strategy conditions are not met right now.',
          signal: r.signal,
        });
        return;
      }
      setConfirmation(r.confirmation);
    } finally {
      setBusy(false);
    }
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
        <Btn onClick={prepare} primary disabled={busy}>
          {busy ? 'Checking setup…' : config?.liveTradingEnabled ? 'Prepare Trade' : 'Preview Trade'}
        </Btn>
      </div>
      {result?.type === 'error' && (
        <div className="warn" role="alert">{result.message}</div>
      )}
      {result?.type === 'no-trade' && (
        <div style={{ marginTop: 12 }} role="status">
          <div className="notice">
            <strong>No trade prepared.</strong> This is a normal strategy result, not an application error. {result.message}
          </div>
          <div style={{ marginTop: 8 }}>
            <SignalCard signal={result.signal} />
          </div>
        </div>
      )}
      <ul className="muted" style={{ fontSize: 12.5 }}>
        <li>Every live order requires explicit confirmation and a mandatory stop-loss.</li>
        <li>Daily-loss limit, consecutive-loss breaker, and the kill switch all apply.</li>
      </ul>
      <ConfirmTradeModal confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </Card>
  );
}

