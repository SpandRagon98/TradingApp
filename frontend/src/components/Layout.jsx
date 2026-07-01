import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../store/AppContext.jsx';
import KillSwitchButton from './KillSwitchButton.jsx';

// Third tuple element is an optional capability gate: 'trade' (admin/trader) or 'admin'.
const NAV = [
  {
    label: 'Trade',
    items: [
      ['/', 'Dashboard'],
      ['/watchlist', 'Watchlist'],
      ['/order', 'New Order', 'trade'],
      ['/orders', 'Order Book'],
      ['/portfolio', 'Portfolio'],
      ['/strategies', 'Strategies'],
      ['/paper', 'Paper Trading'],
      ['/backtest', 'Backtesting'],
      ['/live', 'Live Trading', 'trade'],
    ],
  },
  {
    label: 'Options',
    items: [
      ['/options', 'Options Dashboard'],
      ['/options/chain', 'Option Chain'],
      ['/straddle', 'Straddle Builder'],
      ['/straddle/backtest', 'Straddle Backtest'],
      ['/straddle/monitor', 'Live Straddle Monitor'],
    ],
  },
  {
    label: 'Manage',
    items: [
      ['/journal', 'Trade Journal'],
      ['/reports', 'Reports'],
      ['/risk', 'Risk Settings'],
      ['/broker', 'Broker Settings'],
      ['/users', 'Users', 'admin'],
    ],
  },
];

const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((it) => [it[0], it[1]])));

export default function Layout() {
  const { config, live, user, authEnabled, canTrade, isAdmin, logout } = useApp();
  const { pathname } = useLocation();
  const title = TITLES[pathname] || 'Trading Assistant';

  const allowed = (cap) => (!cap ? true : cap === 'trade' ? canTrade : cap === 'admin' ? isAdmin : true);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">▮▮</span>
          <div>
            <h1>Trading Assistant</h1>
            <p>Groww · Risk-managed</p>
          </div>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter((it) => allowed(it[2]));
          if (!items.length) return null;
          return (
            <div className="nav-group" key={g.label}>
              <div className="label">{g.label}</div>
              <nav className="nav">
                {items.map(([to, label]) => (
                  <NavLink key={to} to={to} end={to === '/'}>
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <h2>{title}</h2>
          <div className="topbar-right">
            <span className={'badge ' + (live === 'live' ? 'badge-online' : 'badge-muted')}>● {live === 'live' ? 'live' : 'offline'}</span>
            <span className={'badge ' + (config?.liveTradingEnabled ? 'badge-live' : 'badge-paper')}>{(config?.mode || 'paper').toUpperCase()}</span>
            <span className="badge badge-muted">broker: {config?.broker || '…'}</span>
            {user && (
              <span className="user-chip" title={user.email}>
                <span className="who">{user.email}</span>
                <span className={'role role-' + user.role}>{user.role}</span>
              </span>
            )}
            {authEnabled && user && (
              <button className="btn btn-sm" onClick={logout}>
                Logout
              </button>
            )}
            <KillSwitchButton />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
