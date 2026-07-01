import { useState } from 'react';
import { api } from '../services/api.js';
import { Metrics, money } from './ui.jsx';
import { useApp } from '../store/AppContext.jsx';

// Confirmation modal for a prepared MANUAL order intent. Confirm places the real
// order via /live/order/execute (confirm:true). In paper mode the backend returns
// 409 and nothing is sent — surfaced here as an inline notice, not an error.
export default function ConfirmOrderModal({ intent, onClose, onExecuted }) {
  const { config } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  if (!intent) return null;

  const liveOn = config?.liveTradingEnabled;
  const canConfirm = intent.approved && liveOn && !result?.ok;

  const execute = async () => {
    setBusy(true);
    const r = await api('/live/order/execute', { method: 'POST', body: { intentId: intent.id, confirm: true } });
    setBusy(false);
    setResult(r);
    if (r.ok) onExecuted?.(r);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          Confirm order — <span className={'pill ' + (intent.side === 'BUY' ? 'BUY' : 'SHORT')}>{intent.side}</span> {intent.symbol}
        </h3>
        <div className={liveOn ? 'warn' : 'notice'}>
          {liveOn
            ? '⚠️ LIVE execution is ON. Confirming places a REAL order on your Groww account.'
            : 'Paper mode — Confirm is disabled and nothing is sent. To go live: set TRADING_MODE=live and ENABLE_LIVE_TRADING=true, then restart.'}
        </div>
        <Metrics
          items={[
            { label: 'Order type', value: intent.orderType },
            { label: 'Entry', value: intent.entry },
            { label: 'Stop', value: intent.stop, valueClass: 'neg' },
            { label: 'Target', value: intent.target ?? '—', valueClass: 'pos' },
            { label: 'Quantity', value: intent.quantity },
            { label: 'Risk', value: money(intent.riskAmount) },
            { label: 'R:R', value: intent.riskReward ? intent.riskReward + ':1' : '—' },
            { label: 'Segment', value: intent.segment },
          ]}
        />
        {intent.margin && (intent.margin.required != null || intent.margin.available != null) && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
            Margin required: <strong>{money(intent.margin.required)}</strong> · available: <strong>{money(intent.margin.available)}</strong>
          </div>
        )}
        {!!intent.blockers?.length && <div className="warn">Blockers: {intent.blockers.join(' · ')}</div>}
        {result && (
          <div className={result.ok ? 'notice' : 'warn'} style={{ marginTop: 8 }}>
            {result.ok
              ? `Order placed ✓ entry ${result.entry?.orderId}` +
                (result.stopError ? ` — ⚠️ STOP FAILED: ${result.stopError}` : `, stop ${result.stopLoss?.orderId || '—'}`)
              : result.paper
                ? result.error
                : 'Failed: ' + result.error}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button
              className="btn btn-primary"
              disabled={!canConfirm || busy}
              onClick={execute}
              title={canConfirm ? '' : 'Live execution disabled or order not approved'}
            >
              {busy ? 'Placing…' : canConfirm ? 'Confirm & place order' : 'Confirm (disabled)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
