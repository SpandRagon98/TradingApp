import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useApp } from './store/AppContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Watchlist from './pages/Watchlist.jsx';
import Strategies from './pages/Strategies.jsx';
import PaperTrading from './pages/PaperTrading.jsx';
import Backtesting from './pages/Backtesting.jsx';
import LiveTrading from './pages/LiveTrading.jsx';
import NewOrder from './pages/NewOrder.jsx';
import OrderBook from './pages/OrderBook.jsx';
import Portfolio from './pages/Portfolio.jsx';
import OptionsDashboard from './pages/OptionsDashboard.jsx';
import OptionChain from './pages/OptionChain.jsx';
import StraddleBuilder from './pages/StraddleBuilder.jsx';
import StraddleBacktest from './pages/StraddleBacktest.jsx';
import LiveStraddleMonitor from './pages/LiveStraddleMonitor.jsx';
import TradeJournal from './pages/TradeJournal.jsx';
import Reports from './pages/Reports.jsx';
import RiskSettings from './pages/RiskSettings.jsx';
import BrokerSettings from './pages/BrokerSettings.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  const { authReady, authEnabled, user } = useApp();

  if (!authReady) return <div className="app-loading">Loading…</div>;
  if (authEnabled && !user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/order" element={<NewOrder />} />
        <Route path="/orders" element={<OrderBook />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/strategies" element={<Strategies />} />
        <Route path="/paper" element={<PaperTrading />} />
        <Route path="/backtest" element={<Backtesting />} />
        <Route path="/live" element={<LiveTrading />} />
        <Route path="/options" element={<OptionsDashboard />} />
        <Route path="/options/chain" element={<OptionChain />} />
        <Route path="/straddle" element={<StraddleBuilder />} />
        <Route path="/straddle/backtest" element={<StraddleBacktest />} />
        <Route path="/straddle/monitor" element={<LiveStraddleMonitor />} />
        <Route path="/journal" element={<TradeJournal />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/risk" element={<RiskSettings />} />
        <Route path="/broker" element={<BrokerSettings />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
