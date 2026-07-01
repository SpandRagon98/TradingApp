import { Metrics, money } from './ui.jsx';

// Confirmation modal for a prepared live trade. Confirm is only enabled when the
// backend reports live execution is actually enabled (the triple-gate). In paper
// mode this is a preview and Confirm stays disabled with an explanation.
export default function ConfirmTradeModal({ confirmation, onClose }) {
  if (!confirmation) return null;
  const c = confirmation;
  const canConfirm = c.liveExecutionEnabled && c.approved;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Confirm live trade — {c.side} {c.symbol}</h3>
        <div className={c.liveExecutionEnabled ? 'warn' : 'notice'}>{c.note}</div>
        <Metrics items={[
          { label: 'Strategy', value: c.strategy },
          { label: 'Side', value: c.side },
          { label: 'Entry', value: c.entry },
          { label: 'Stop', value: c.stop, valueClass: 'neg' },
          { label: 'Target', value: c.target, valueClass: 'pos' },
          { label: 'Quantity', value: c.quantity },
          { label: 'Risk amount', value: money(c.riskAmount) },
          { label: 'R:R', value: c.riskReward + ':1' },
          { label: 'Score', value: c.score },
          { label: 'Approved', value: c.approved ? 'yes' : 'no', valueClass: c.approved ? 'pos' : 'neg' },
        ]} />
        {!!c.blockers?.length && <div className="warn">Blockers: {c.blockers.join(' · ')}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Reject</button>
          <button className="btn btn-primary" disabled={!canConfirm} title={canConfirm ? '' : 'Live execution disabled (paper-safe)'}>
            {canConfirm ? 'Confirm & place order' : 'Confirm (disabled)'}
          </button>
        </div>
      </div>
    </div>
  );
}
