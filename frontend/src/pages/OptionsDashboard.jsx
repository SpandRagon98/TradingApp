import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Card, Field, Select, Btn, Kpi, money, sign, cls } from '../components/ui.jsx';
import OptionChainTable from '../components/OptionChainTable.jsx';
import TradeTable from '../components/TradeTable.jsx';
import AlertsFeed from '../components/AlertsFeed.jsx';

const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

export default function OptionsDashboard() {
  const [index, setIndex] = useState('NIFTY');
  const [chain, setChain] = useState(null);
  const [straddles, setStraddles] = useState([]);

  const load = async () => {
    const r = await api(`/options/chain?index=${index}&daysToExpiry=2&strikesEach=6`);
    if (r.ok) setChain(r.chain);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api('/paper/trades').then((r) => {
      if (r.ok) setStraddles(r.trades.filter((t) => t.mode === 'paper-straddle'));
    });
  }, []);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="Options Overview" right={<><Field label=""><Select value={index} onChange={setIndex} options={INDICES} /></Field></>}>
        <div className="controls" style={{ marginBottom: 8 }}><Btn onClick={load} primary>Refresh chain</Btn></div>
        {chain && (
          <div className="grid cols-4">
            <Kpi label="Spot" value={chain.spot} />
            <Kpi label="ATM" value={chain.atmStrike} />
            <Kpi label="PCR" value={chain.pcr} />
            <Kpi label="Max pain" value={chain.maxPain} />
          </div>
        )}
      </Card>

      <div className="grid cols-2 span-all">
        <Card title={`Chain (ATM ±6) — ${index}`}>
          {chain ? <OptionChainTable chain={chain} /> : <div className="muted">Loading…</div>}
        </Card>
        <Card title="Active / Recent Straddles">
          <TradeTable trades={straddles} limit={12} />
        </Card>
      </div>

      <Card title="Options Alerts" tag="websocket" className="span-all">
        <AlertsFeed limit={10} filter={(a) => String(a.type).includes('straddle') || String(a.message).toLowerCase().includes('straddle')} />
      </Card>
    </div>
  );
}
