import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Card, Field, Select, Btn, Metrics } from '../components/ui.jsx';
import OptionChainTable from '../components/OptionChainTable.jsx';

const INDICES = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'];

export default function OptionChain() {
  const [index, setIndex] = useState('NIFTY');
  const [dte, setDte] = useState(3);
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const r = await api(`/options/chain?index=${index}&daysToExpiry=${Number(dte)}&strikesEach=10`);
    setChain(r.ok ? r.chain : null);
    setBusy(false);
  };
  useEffect(() => { load(); }, []); // initial NIFTY chain

  return (
    <Card title="Option Chain" tag="Black-Scholes · synthetic">
      <div className="controls">
        <Field label="Index"><Select value={index} onChange={setIndex} options={INDICES} /></Field>
        <Field label="Days to expiry"><input type="number" value={dte} min={0} onChange={(e) => setDte(e.target.value)} /></Field>
        <Btn onClick={load} primary disabled={busy}>{busy ? 'Loading…' : 'Load Chain'}</Btn>
      </div>
      {chain && (
        <>
          <Metrics items={[
            { label: 'Spot', value: chain.spot },
            { label: 'ATM', value: chain.atmStrike },
            { label: 'PCR', value: chain.pcr },
            { label: 'Max pain', value: chain.maxPain },
            { label: 'Support (OI)', value: chain.support, valueClass: 'pos' },
            { label: 'Resistance (OI)', value: chain.resistance, valueClass: 'neg' },
          ]} />
          <div style={{ marginTop: 12 }}><OptionChainTable chain={chain} /></div>
        </>
      )}
    </Card>
  );
}
