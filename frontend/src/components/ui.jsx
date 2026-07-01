// Small shared UI primitives + formatters used across pages.

export const money = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const sign = (n) => (n > 0 ? '+' : '') + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const pct = (n) => Number(n ?? 0).toFixed(1) + '%';
export const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(0) + 'k' : String(n ?? '—'));

export function Card({ title, tag, right, children, className = '' }) {
  return (
    <section className={'card ' + className}>
      {(title || right) && (
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {title} {tag && <span className="tag">{tag}</span>}
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, valueClass = '' }) {
  return (
    <div className="kpi">
      <span className="l">{label}</span>
      <span className={'v ' + valueClass}>{value}</span>
    </div>
  );
}

export function Metric({ label, value, valueClass = '' }) {
  return (
    <div className="metric">
      <span className="l">{label}</span>
      <span className={'v ' + valueClass}>{value}</span>
    </div>
  );
}

export function Metrics({ items }) {
  return (
    <div className="metrics">
      {items.map((m, i) => (
        <Metric key={i} label={m.label} value={m.value} valueClass={m.valueClass} />
      ))}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const lab = typeof o === 'object' ? o.label : o;
        return <option key={val} value={val}>{lab}</option>;
      })}
    </select>
  );
}

export function Btn({ children, onClick, primary, disabled }) {
  return (
    <button className={'btn' + (primary ? ' btn-primary' : '')} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// Equity-curve style bar chart from an array of numbers.
export function Bars({ values }) {
  if (!values || !values.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  return (
    <div className="bars">
      {values.map((v, i) => (
        <div key={i} className="b" style={{ height: `${Math.max(2, max === min ? 50 : ((v - min) / (max - min)) * 100)}%` }} />
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="muted">{children}</div>;
}

export function ErrorText({ children }) {
  return <div className="neg">{children}</div>;
}
