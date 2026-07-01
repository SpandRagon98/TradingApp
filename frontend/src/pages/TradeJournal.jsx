import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Card, Field, Btn, sign, cls } from '../components/ui.jsx';

export default function TradeJournal() {
  const [trades, setTrades] = useState([]);
  const [journal, setJournal] = useState([]);
  const [form, setForm] = useState({ tradeId: '', note: '', mistake: '', emotion: '' });

  const load = () => api('/journal').then((r) => { if (r.ok) { setTrades(r.trades); setJournal(r.journal); } });
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.note && !form.mistake && !form.emotion) return;
    await api('/journal/note', { method: 'POST', body: form });
    setForm({ tradeId: '', note: '', mistake: '', emotion: '' });
    load();
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="Add Journal Note">
        <div className="controls">
          <Field label="Trade ID (optional)"><input value={form.tradeId} onChange={(e) => setForm({ ...form, tradeId: e.target.value })} placeholder="trade id" /></Field>
          <Field label="Note"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="what happened" style={{ minWidth: 200 }} /></Field>
          <Field label="Mistake"><input value={form.mistake} onChange={(e) => setForm({ ...form, mistake: e.target.value })} placeholder="mistake notes" /></Field>
          <Field label="Emotion"><input value={form.emotion} onChange={(e) => setForm({ ...form, emotion: e.target.value })} placeholder="emotional notes" /></Field>
          <Btn onClick={save} primary>Save Note</Btn>
        </div>
        {journal.length > 0 && (
          <ul className="muted" style={{ fontSize: 12.5 }}>
            {journal.slice(0, 8).map((j) => (
              <li key={j.id}>{new Date(j.createdAt).toLocaleString('en-IN')} — {j.note} {j.mistake && `· mistake: ${j.mistake}`} {j.emotion && `· felt: ${j.emotion}`}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="All Trades">
        {trades.length === 0 ? <div className="muted">No trades yet.</div> : (
          <table>
            <thead><tr><th>ID</th><th>Symbol</th><th>Strategy</th><th>Side</th><th>Qty</th><th>Exit</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {trades.slice(0, 40).map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.id}</td>
                  <td>{t.symbol}{t.strike ? ` ${t.strike}` : ''}</td>
                  <td>{t.strategy}</td>
                  <td>{t.side}</td>
                  <td>{t.quantity}</td>
                  <td>{t.exitReason}</td>
                  <td className={cls(t.pnl)}>{sign(t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
