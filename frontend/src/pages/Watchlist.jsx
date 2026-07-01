import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useMeta } from '../hooks/useMeta.js';
import { Card, Field, Select, Btn } from '../components/ui.jsx';
import Chart from '../components/Chart.jsx';

export default function Watchlist() {
  const meta = useMeta();
  const [symbols, setSymbols] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [add, setAdd] = useState('NIFTY');
  const [chartSymbol, setChartSymbol] = useState('NIFTY');
  const [candles, setCandles] = useState([]);

  useEffect(() => {
    api(`/market/candles?symbol=${chartSymbol}&count=80`).then((r) => r.ok && setCandles(r.candles));
  }, [chartSymbol]);

  const loadQuotes = (syms) => {
    syms.forEach(async (s) => {
      const r = await api(`/market/candles?symbol=${s}&count=2`);
      if (r.ok) setQuotes((q) => ({ ...q, [s]: { ltp: r.lastPrice, vwap: r.vwap } }));
    });
  };

  useEffect(() => {
    api('/watchlist').then((r) => { if (r.ok) { setSymbols(r.watchlist); loadQuotes(r.watchlist); } });
  }, []);

  const persist = async (next) => {
    setSymbols(next);
    await api('/watchlist', { method: 'POST', body: { watchlist: next } });
    loadQuotes(next);
  };
  const addSymbol = () => { if (add && !symbols.includes(add)) persist([...symbols, add]); };
  const remove = (s) => persist(symbols.filter((x) => x !== s));

  return (
    <div className="grid" style={{ gap: 14 }}>
    <Card title={`Chart — ${chartSymbol}`} tag="candles" right={<Select value={chartSymbol} onChange={setChartSymbol} options={meta.symbols.length ? meta.symbols : [chartSymbol]} />}>
      <Chart candles={candles} height={300} />
    </Card>
    <Card title="Watchlist" tag="synthetic quotes">
      <div className="controls">
        <Field label="Add symbol"><Select value={add} onChange={setAdd} options={meta.symbols} /></Field>
        <Btn onClick={addSymbol} primary>Add</Btn>
        <Btn onClick={() => loadQuotes(symbols)}>Refresh</Btn>
      </div>
      <table>
        <thead><tr><th>Symbol</th><th>LTP</th><th>VWAP</th><th>vs VWAP</th><th></th></tr></thead>
        <tbody>
          {symbols.map((s) => {
            const q = quotes[s];
            const diff = q && q.vwap ? ((q.ltp - q.vwap) / q.vwap) * 100 : null;
            return (
              <tr key={s}>
                <td>{s}</td>
                <td>{q ? q.ltp : '…'}</td>
                <td>{q?.vwap?.toFixed ? q.vwap.toFixed(2) : '…'}</td>
                <td className={diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}>{diff == null ? '…' : diff.toFixed(2) + '%'}</td>
                <td><button className="btn" onClick={() => remove(s)}>Remove</button></td>
              </tr>
            );
          })}
          {!symbols.length && <tr><td colSpan={5} className="muted">Watchlist empty — add a symbol.</td></tr>}
        </tbody>
      </table>
    </Card>
    </div>
  );
}
