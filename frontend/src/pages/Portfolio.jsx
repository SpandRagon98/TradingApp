import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Card, money, cls } from '../components/ui.jsx';

const num = (v) => (v == null || v === '' ? null : Number(v));

export default function Portfolio() {
  const [positions, setPositions] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [margin, setMargin] = useState(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const [p, h, m] = await Promise.all([api('/broker/positions'), api('/broker/holdings'), api('/broker/margin')]);
    if (p.ok) {
      setPositions(p.positions || []);
      setLive(p.live);
    } else setErr(p.error);
    if (h.ok) setHoldings(h.holdings || []);
    if (m.ok) setMargin(m.margin);
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const posPnl = positions.reduce((s, p) => s + (num(p.realised_pnl) || 0), 0);

  return (
    <div className="grid" style={{ gap: 14 }}>
      {!live && (
        <div className="notice">Showing mock/paper portfolio. Connect Groww in Broker Settings for live positions, holdings and margin.</div>
      )}
      {err && <div className="warn">{err}</div>}

      {margin && (
        <div className="grid cols-4">
          <div className="kpi"><span className="l">Available margin</span><span className="v">{money(margin.available)}</span></div>
          <div className="kpi"><span className="l">Used</span><span className="v">{money(margin.used)}</span></div>
          <div className="kpi"><span className="l">Collateral</span><span className="v">{money(margin.collateralAvailable)}</span></div>
          <div className="kpi"><span className="l">Realised P&L</span><span className={'v ' + cls(posPnl)}>{money(posPnl)}</span></div>
        </div>
      )}

      <Card title="Positions" right={<span className="muted">{positions.length}</span>}>
        {positions.length ? (
          <table>
            <thead>
              <tr><th>Symbol</th><th>Product</th><th>Qty</th><th>Net price</th><th>Realised P&L</th></tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const pnl = num(p.realised_pnl);
                return (
                  <tr key={i}>
                    <td>{p.trading_symbol || p.symbol || '—'}</td>
                    <td>{p.product || '—'}</td>
                    <td>{p.quantity ?? p.net_carry_forward_quantity ?? '—'}</td>
                    <td>{p.net_price != null ? '₹' + p.net_price : '—'}</td>
                    <td className={cls(pnl)}>{pnl != null ? money(pnl) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="muted">No open positions.</div>
        )}
      </Card>

      <Card title="Holdings" right={<span className="muted">{holdings.length}</span>}>
        {holdings.length ? (
          <table>
            <thead>
              <tr><th>Symbol</th><th>Qty</th><th>Avg price</th></tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i}>
                  <td>{h.trading_symbol || h.symbol || '—'}</td>
                  <td>{h.quantity ?? '—'}</td>
                  <td>{h.average_price != null ? '₹' + h.average_price : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No holdings.</div>
        )}
      </Card>
    </div>
  );
}
