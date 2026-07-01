import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn, money, sign, cls } from '../components/ui.jsx';
import SignalCard from '../components/SignalCard.jsx';
import TradeTable from '../components/TradeTable.jsx';

export default function PaperTrading() {
  const meta = useMeta();
  const { refreshRisk } = useApp();
  const [symbol, setSymbol] = useState('NIFTY');
  const [strategy, setStrategy] = useState('OpeningRangeBreakout');
  const [res, setRes] = useState(null);
  const [trades, setTrades] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadTrades = () => api('/paper/trades').then((r) => r.ok && setTrades(r.trades));
  useEffect(() => { loadTrades(); }, []);

  const run = async () => {
    setBusy(true);
    const r = await api('/paper/run', { method: 'POST', body: { symbol, strategy } });
    setRes(r.ok ? r.result : { error: r.error });
    setBusy(false);
    loadTrades();
    refreshRisk();
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="Run Paper Trade" tag="default · safe">
        <div className="controls">
          <Field label="Symbol"><Select value={symbol} onChange={setSymbol} options={meta.symbols} /></Field>
          <Field label="Strategy"><Select value={strategy} onChange={setStrategy} options={meta.strategies} /></Field>
          <Btn onClick={run} primary disabled={busy}>{busy ? 'Running…' : 'Run Paper Trade'}</Btn>
        </div>
        {res?.error && <div className="neg">{res.error}</div>}
        {res?.signal && <SignalCard signal={res.signal} score={res.score} validation={res.validation} />}
        {res?.traded && (
          <div className="notice" style={{ marginTop: 8 }}>
            Paper trade closed: <strong className={cls(res.trade.pnl)}>{sign(res.trade.pnl)}</strong> via <em>{res.trade.exitReason}</em>
            {' '}(exit {res.trade.exit}, qty {res.trade.quantity}, costs {money(res.trade.costs)}).
          </div>
        )}
        {res && !res.traded && !res.error && <div className="muted" style={{ marginTop: 8 }}>No trade taken: {res.reason}</div>}
      </Card>

      <Card title="Paper Trades">
        <TradeTable trades={trades} limit={20} />
      </Card>
    </div>
  );
}
