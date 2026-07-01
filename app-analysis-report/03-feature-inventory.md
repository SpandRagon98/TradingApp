# 03 - Feature Inventory

Status meanings:

- **Working**: wired through UI/API/engine for synthetic or paper use.
- **Partial**: code exists but has a material limitation or broken connection.
- **UI only**: visible control without a complete backend action.
- **Absent**: no implementation found.

## Core features

| Feature | Status | What it actually does |
|---|---|---|
| Dashboard | Working | Shows disclaimer, configured capital, risk counters, alerts, equity paper trades |
| Login/signup | Absent | No auth pages, routes, middleware, user table, or sessions |
| Broker status | Partial | Checks mock or Groww adapter status |
| Broker connection | Partial | Re-checks adapter; credentials must be changed in `.env` and backend restarted |
| Groww integration | Partial | REST adapter exists, endpoints are placeholders, normal data/order flows do not use it |
| Zerodha | Absent | Mentioned only as a possible future adapter in comments |
| Angel One | Absent | Mentioned only as a possible future adapter in comments |
| Upstox | Absent | Mentioned only as a possible future adapter in comments |
| Watchlist | Working | Saves up to 50 symbol strings in settings |
| Watchlist prices | Working, synthetic | Requests generated candle data and displays last close/VWAP |
| Live price feed | Absent | WebSocket transports alerts, not streaming ticks/candles |
| Candlestick chart | Working, synthetic | Lightweight Charts renders generated candles |
| Indicators | Working | Custom EMA, SMA, RSI, VWAP, ATR, Bollinger, ADX, pivots, relative volume |
| Strategy signals | Working, synthetic | Ten strategies return BUY, SHORT, or NO_TRADE |
| Signal score | Working | 0-100 heuristic, threshold 70 |
| Buy/sell buttons | Absent | There is no direct manual order ticket |
| Paper trade button | Working | Runs a complete simulated equity trade immediately |
| Auto-trading controls | UI/architecture only | Enable toggles and live confirmation text exist; no automated execution loop |
| Kill switch | Partial | Blocks equity validation and straddle endpoints, but any unauthenticated user can toggle/release it |
| Stop loss | Working in simulation | Equity strategy stop and straddle combined/per-leg stops |
| Target | Working in simulation | Equity target and straddle premium target |
| Trailing stop | Partial | Implemented only in straddle engine and enabled by scanner defaults |
| Position sizing | Partial | Equity sizing uses risk/stop distance; margin is effectively unlimited in normal calls |
| Capital allocation | Partial | One global capital number; no portfolio/strategy allocation |
| Paper trading | Working | Equity and straddle simulated trades |
| Backtesting | Working, synthetic | Equity and straddle simulation engines |
| Trade history | Partial | Persisted, but equity endpoint excludes straddles |
| P&L tracking | Working for persisted simulations | Risk state and report aggregation |
| Reports | Basic | Total trades, net P&L, win rate, average P&L, per-strategy summary |
| Notifications | Working/optional | In-app and WebSocket; optional Telegram/email for warn/critical |
| Error handling | Partial | API JSON errors and central handler; many UI actions ignore failures |
| Settings | Working/unsafe validation | Risk overrides and watchlist persist globally |
| Admin controls | Absent | No roles or admin area |

## Dashboard features

- Educational risk disclaimer.
- Capital KPI.
- Daily paper P&L.
- Trades-today counter.
- Daily-loss utilization.
- Open-trade and consecutive-loss counters.
- Risk-per-trade and minimum R:R display.
- Kill-switch state.
- Persistence backend label.
- Recent WebSocket alerts.
- Recent equity paper trades.

Gap: dashboard capital reads `/api/config` defaults, not saved risk overrides,
while the detailed risk panel reads merged settings. The two can disagree.

## Watchlist and chart

- Default sample list uses Indian indices/equities.
- Add/remove symbol controls.
- Manual quote refresh.
- Persistent watchlist in global settings.
- Candlestick chart selection.
- Synthetic LTP, VWAP, and percentage difference.

Missing:

- Search/autocomplete beyond sample symbols.
- Real quote timestamps.
- Streaming updates.
- Exchange/instrument tokens.
- Chart indicators/drawings.
- Corporate actions and market-hours handling.

## Strategies screen

- Lists ten strategy names, fixed 5-minute timeframe, and indicators.
- In-memory On/Off toggle.
- Signal analysis by symbol and strategy.
- Entry, stop, target, R:R, confidence, score, and risk-size preview.
- Supporting and warning factors.

Confirmed bug: execution routes use `getStrategy()` and never check
`isEnabled()`. Turning a strategy Off does not stop analysis, paper trading, or
backtesting. The toggle also resets after backend restart.

## Paper trading

- Select symbol and strategy.
- Generate 115 synthetic candles.
- Use first 75 candles for the signal.
- Use next 40 for simulated stop/target/session-close outcome.
- Apply configured slippage and two brokerage charges.
- Persist signal/trade/audit/alert records.
- Update daily risk counters.

Limitations:

- It closes the trade synchronously in one API request; there is no real open position.
- If stop and target both occur within one future candle, stop is checked first.
- Available margin is not supplied, so notional size is not capital-capped.
- No taxes, exchange fees, spread model, partial fills, rejected orders, or gaps.

## Backtesting

- Equity: up to 250 synthetic sessions, one possible trade per session.
- Straddle: 1-250 synthetic sessions.
- Metrics: total, wins, losses, win rate, net P&L, average win/loss, profit
  factor, max drawdown, consecutive losses, costs.
- Equity additionally records MAE/MFE per trade internally.
- Straddle reports average MAE/MFE, weekday, exit-reason, and equity curve.

Missing:

- Real historical imports.
- Walk-forward/out-of-sample testing.
- Parameter optimization safeguards.
- Benchmark comparison.
- Statistical confidence.
- Export to CSV/PDF.
- Saved backtest runs.

## Options features

- Synthetic option chain for NIFTY, BANKNIFTY, FINNIFTY, SENSEX.
- ATM strike, IV smile, OI, change in OI, volume, bid/ask.
- PCR, max pain, OI support/resistance.
- Single-option Greeks API.
- ATM long/short straddle builder.
- Breakevens, max profit/loss, margin estimate, net/leg Greeks.
- Paper straddle engine.
- Straddle backtest.
- Manual 9:20 short-straddle scanner.

Important qualification: option premiums, IV, OI, PCR, max pain, and support/
resistance are generated values, not exchange observations.

## Risk controls

- Global capital.
- Risk per equity trade.
- Maximum daily loss.
- Minimum risk/reward.
- Maximum trades per day.
- Maximum open trades.
- Consecutive-loss breaker.
- Kill switch.
- Score threshold of 70.

Gaps:

- Straddle paper route checks only the kill switch before simulation.
- No straddle risk sizing or margin enforcement.
- No maximum quantity/notional.
- No input bounds on saved risk settings.
- Daily rollover uses UTC date rather than India market date.
- `maxOpenTrades` has little practical effect because simulations open and close
  immediately in one synchronous request.

## Alerts

Alert types include signal, trade close, stop hit, target hit, daily loss,
kill switch, straddle stop/target, high volatility, and API status.

Actually emitted by current routes:

- Blocked actionable signal.
- Equity trade closed/stop/target.
- Kill switch toggled.
- Straddle closed/stop/target.
- Manual test alert.

Not currently emitted despite constants:

- Trade entered.
- Daily loss reached.
- High volatility.

## Journal and reports

Journal:

- Optional trade ID.
- Note, mistake, and emotion fields.
- Marks a matching trade `hasNote: true` if the ID exists.
- Does not validate that a trade ID exists before creating a journal entry.

Reports:

- Reads only `/api/paper/trades`, which contains equity `mode: paper` records.
- Excludes straddles.
- No date filters, costs breakdown, drawdown, profit factor, expectancy, or export.

## Hidden, orphaned, or incomplete features

1. Root `StraddleTrading.jsx`
   - Rich mock backtest UI with fixed 2024-style generated trades.
   - Uses DEMA/RSI/MACD/VWAP concepts not implemented as a connected backend strategy.
   - Not part of the built application.

2. Groww `placeOrder()`
   - Real-order method exists inside the adapter.
   - No API route calls it.

3. Confirm live button
   - Can become visually enabled.
   - Has no `onClick`; it cannot submit anything.

4. Strategy enabled state
   - Exposed and mutable.
   - Not enforced and not persisted.

5. Straddle monitor
   - Expects `paper-straddle` records from an endpoint that filters them out.

6. `store.json.tmp`
   - Contains an older-looking JSON snapshot.
   - Not referenced by current storage code.

7. Audit log
   - Written for state-changing actions.
   - No API or UI is provided to inspect it.

8. Broker positions/margin/history/quote methods
   - Defined in the abstraction/adapters.
   - Not exposed through normal frontend workflows.

