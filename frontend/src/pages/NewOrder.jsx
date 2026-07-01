import { useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import ConfirmOrderModal from '../components/ConfirmOrderModal.jsx';

export default function NewOrder() {
  const { config, canTrade } = useApp();
  const [f, setF] = useState({
    symbol: 'RELIANCE',
    side: 'BUY',
    orderType: 'LIMIT',
    entry: '',
    stop: '',
    target: '',
    quantity: '',
    exchange: config?.groww?.defaultExchange || 'NSE',
    segment: config?.groww?.defaultSegment || 'CASH',
    product: config?.groww?.defaultProduct || 'MIS',
  });
  const [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ltp, setLtp] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const fetchPrice = async () => {
    setErr('');
    const r = await api(`/market/quote?symbol=${encodeURIComponent(f.symbol)}&exchange=${f.exchange}&segment=${f.segment}`);
    if (r.ok && r.quote?.ltp != null) {
      setLtp(r.quote.ltp);
      set('entry', String(r.quote.ltp));
    } else {
      setErr('Could not fetch a live price for ' + f.symbol);
    }
  };

  const prepare = async () => {
    setErr('');
    setBusy(true);
    const body = {
      symbol: f.symbol,
      side: f.side,
      orderType: f.orderType,
      entry: Number(f.entry),
      stop: Number(f.stop),
      target: f.target ? Number(f.target) : undefined,
      quantity: f.quantity ? Number(f.quantity) : undefined,
      exchange: f.exchange,
      segment: f.segment,
      product: f.product,
    };
    const r = await api('/live/order/prepare', { method: 'POST', body });
    setBusy(false);
    if (!r.ok) return setErr((r.errors || [r.error]).join(' · '));
    setIntent(r.intent);
  };

  if (!canTrade) {
    return (
      <Card title="New Order">
        <div className="warn">Your account is read-only. Placing orders requires a trader or admin role.</div>
      </Card>
    );
  }

  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      <Card title="Order Ticket" tag={config?.liveTradingEnabled ? 'LIVE' : 'paper-safe'}>
        <div className="side-toggle">
          <button className={'side-btn buy' + (f.side === 'BUY' ? ' on' : '')} onClick={() => set('side', 'BUY')} type="button">
            BUY
          </button>
          <button className={'side-btn sell' + (f.side === 'SELL' ? ' on' : '')} onClick={() => set('side', 'SELL')} type="button">
            SELL
          </button>
        </div>

        <div className="controls" style={{ marginTop: 12 }}>
          <Field label="Symbol">
            <input value={f.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Type">
            <Select value={f.orderType} onChange={(v) => set('orderType', v)} options={['LIMIT', 'MARKET', 'SL']} />
          </Field>
          <Field label="Segment">
            <Select value={f.segment} onChange={(v) => set('segment', v)} options={['CASH', 'FNO', 'COMMODITY']} />
          </Field>
          <Field label="Product">
            <Select value={f.product} onChange={(v) => set('product', v)} options={['MIS', 'CNC', 'NRML']} />
          </Field>
        </div>

        <div className="controls">
          <Field label="Entry ₹">
            <input type="number" step="0.05" value={f.entry} onChange={(e) => set('entry', e.target.value)} />
          </Field>
          <Field label="Stop ₹ (required)">
            <input type="number" step="0.05" value={f.stop} onChange={(e) => set('stop', e.target.value)} />
          </Field>
          <Field label="Target ₹">
            <input type="number" step="0.05" value={f.target} onChange={(e) => set('target', e.target.value)} />
          </Field>
          <Field label="Qty (auto if blank)">
            <input type="number" value={f.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
        </div>

        {ltp != null && <div className="muted" style={{ fontSize: 12 }}>Live LTP: ₹{ltp}</div>}
        {err && <div className="warn">{err}</div>}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <Btn onClick={fetchPrice}>Use live price</Btn>
          <Btn onClick={prepare} primary disabled={busy}>
            {busy ? 'Checking…' : 'Review order'}
          </Btn>
        </div>
      </Card>

      <Card title="How every order is protected">
        <ul className="muted" style={{ fontSize: 12.5, lineHeight: 2 }}>
          <li>🛑 Stop-loss is <strong>mandatory</strong> — orders without one are rejected.</li>
          <li>📏 Quantity is auto-sized from your risk-per-trade % unless you set it.</li>
          <li>💰 Required margin is checked against your live account before you can confirm.</li>
          <li>🛡️ A protective stop order is placed automatically alongside the entry.</li>
          <li>⚡ The kill switch and all daily/consecutive-loss limits apply.</li>
          <li>🔒 In paper mode, Confirm is disabled — nothing is ever sent.</li>
        </ul>
      </Card>

      <ConfirmOrderModal intent={intent} onClose={() => setIntent(null)} onExecuted={() => {}} />
    </div>
  );
}
