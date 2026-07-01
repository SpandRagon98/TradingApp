import { fmtK } from './ui.jsx';

export default function OptionChainTable({ chain }) {
  if (!chain) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>CE OI</th><th>CE IV</th><th>CE LTP</th>
          <th style={{ textAlign: 'center' }}>Strike</th>
          <th style={{ textAlign: 'left' }}>PE LTP</th><th>PE IV</th><th>PE OI</th>
        </tr>
      </thead>
      <tbody>
        {chain.rows.map((r) => (
          <tr key={r.strike} className={r.strike === chain.atmStrike ? 'atm' : ''}>
            <td>{fmtK(r.ce.oi)}</td>
            <td>{r.ce.iv}</td>
            <td className="pos">{r.ce.ltp}</td>
            <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.strike}</td>
            <td className="neg">{r.pe.ltp}</td>
            <td>{r.pe.iv}</td>
            <td>{fmtK(r.pe.oi)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
