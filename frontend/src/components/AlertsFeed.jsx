import { useApp } from '../store/AppContext.jsx';

export default function AlertsFeed({ limit = 50, filter }) {
  const { alerts } = useApp();
  let items = alerts;
  if (filter) items = items.filter(filter);
  if (!items.length) return <div className="muted">No alerts yet.</div>;
  return (
    <div className="alert-list">
      {items.slice(0, limit).map((a) => (
        <div className="alert-row" key={a.id}>
          <span className={'lvl ' + (a.level || 'info')}>{a.level || 'info'}</span>
          <span>{a.message}</span>
          <span className="at">{new Date(a.createdAt || a.ts || Date.now()).toLocaleTimeString('en-IN', { hour12: false })}</span>
        </div>
      ))}
    </div>
  );
}
