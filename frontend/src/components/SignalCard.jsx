import { Metrics, money } from './ui.jsx';

// Renders a scored strategy signal with the risk-gate verdict and the factors
// for/against. Works for the /strategies/run and /paper/run responses.
export default function SignalCard({ signal, score, validation }) {
  if (!signal) return null;
  if (signal.type === 'NO_TRADE') {
    return (
      <div className="card" style={{ background: 'var(--panel-2)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="pill NO_TRADE">NO TRADE</span>
          <span className="muted">{signal.strategy} · {signal.symbol}</span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{signal.rejectionReason}</div>
      </div>
    );
  }
  return (
    <div className="card" style={{ background: 'var(--panel-2)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span className={'pill ' + signal.type}>{signal.type}</span>
        <span className="muted">{signal.strategy} · {signal.symbol} · {signal.timeframe}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
          score <span className={score?.approved ? 'pos' : 'neg'} style={{ fontSize: 20 }}>{score?.score}</span>/100
        </span>
      </div>
      <Metrics items={[
        { label: 'Entry', value: signal.entry },
        { label: 'Stop', value: signal.stop, valueClass: 'neg' },
        { label: 'Target', value: signal.target, valueClass: 'pos' },
        { label: 'R:R', value: signal.riskReward + ':1' },
        { label: 'Qty (risk-sized)', value: validation?.quantity ?? '—' },
        { label: 'Risk amount', value: money(validation?.riskAmount) },
        { label: 'Confidence', value: signal.confidence },
        { label: 'Eligible', value: score?.approved ? 'yes' : 'no', valueClass: score?.approved ? 'pos' : 'neg' },
      ]} />
      <div className="muted" style={{ marginTop: 8 }}>{signal.reason}</div>
      <div className="factors">
        <div className="for"><strong className="muted">Supports</strong>
          <ul>{(score?.supporting || []).map((s, i) => <li key={i}>{s}</li>)}{!score?.supporting?.length && <li className="muted">—</li>}</ul>
        </div>
        <div className="against"><strong className="muted">Warnings</strong>
          <ul>{(score?.warning || []).map((s, i) => <li key={i}>{s}</li>)}{!score?.warning?.length && <li className="muted">—</li>}</ul>
        </div>
      </div>
      {validation && !validation.approved && (
        <div className="warn">Risk gate blocked: {validation.reasons.join(' ')}</div>
      )}
    </div>
  );
}
