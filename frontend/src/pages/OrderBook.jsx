import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Btn } from '../components/ui.jsx';

const statusClass = (s) => {
  const t = String(s || '').toUpperCase();
  if (/COMPLET|EXECUT|FILL/.test(t)) return 'pos';
  if (/REJECT|CANCEL|FAIL/.test(t)) return 'neg';
  return '';
};
const isOpen = (s) => !/COMPLET|REJECT|CANCEL|FILL/i.test(String(s || ''));

export default function OrderBook() {
  const { canTrade } = useApp();
  const [orders, setOrders] = useState([]);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const r = await api('/broker/orders');
    if (r.ok) {
      setOrders(r.orders || []);
      setLive(r.live);
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const cancel = async (o) => {
    const id = o.groww_order_id || o.orderId;
    setBusy(id);
    setMsg('');
    const r = await api(`/broker/orders/${id}/cancel`, { method: 'POST', body: { segment: o.segment } });
    setBusy('');
    setMsg(r.ok ? `Cancel sent for ${id}` : `Cancel failed: ${r.error}`);
    load();
  };

  return (
    <Card title="Order Book" tag={live ? 'LIVE' : 'paper/mock'} right={<Btn onClick={load}>Refresh</Btn>}>
      {!live && (
        <div className="notice" style={{ marginBottom: 10 }}>
          No live orders (paper/mock). Live orders appear here once you're connected and trading.
        </div>
      )}
      {msg && <div className="notice" style={{ marginBottom: 10 }}>{msg}</div>}
      {orders.length ? (
        <table>
          <thead>
            <tr><th>Order ID</th><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Filled</th><th>Avg</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const id = o.groww_order_id || o.orderId || i;
              const st = o.order_status || o.status;
              return (
                <tr key={id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.groww_order_id || '—'}</td>
                  <td>{o.trading_symbol || '—'}</td>
                  <td>{o.transaction_type || '—'}</td>
                  <td>{o.order_type || '—'}</td>
                  <td>{o.quantity ?? '—'}</td>
                  <td>{o.filled_quantity ?? '—'}</td>
                  <td>{o.average_fill_price ?? '—'}</td>
                  <td className={statusClass(st)}>{st || '—'}</td>
                  <td>
                    {canTrade && isOpen(st) && (
                      <button className="btn btn-sm btn-danger" disabled={busy === id} onClick={() => cancel(o)}>
                        {busy === id ? '…' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="muted">No orders.</div>
      )}
    </Card>
  );
}
