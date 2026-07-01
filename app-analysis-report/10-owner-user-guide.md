# 10 - Owner and User Guide

## What you own today

You have a local trading simulation and strategy-analysis application for Indian
stocks/indices and index straddles. It is useful for learning workflows, reviewing
rule-based signals, practicing paper trades, and understanding risk metrics.

It is not ready to place or manage real-money trades.

## Safest way to run it

### Requirements

- Node.js 20 or newer.
- npm.
- Two terminal windows for the full React app.
- Docker is optional and was not available in the audited environment.

### Backend setup

PowerShell:

```powershell
cd "C:\Users\SPANDAN\Downloads\Trading app\backend"
npm ci
Copy-Item .env.example .env
npm run dev
```

Backend and fallback dashboard:

```text
http://localhost:8080
```

Keep the copied environment file in safe paper defaults. Do not add broker
credentials until the integration has been corrected and independently tested.

### React frontend

Second PowerShell window:

```powershell
cd "C:\Users\SPANDAN\Downloads\Trading app\frontend"
npm ci
npm run dev
```

Open:

```text
http://localhost:5180
```

The Vite proxy sends `/api` and `/ws` to the backend.

### Production build

```powershell
cd "C:\Users\SPANDAN\Downloads\Trading app\frontend"
npm run build
```

The audit verified this build successfully in an isolated copy.

### Tests

```powershell
cd "C:\Users\SPANDAN\Downloads\Trading app\backend"
npm test
```

The audit verified 38 passing tests in an isolated copy. Be aware that the risk
tests select JSON storage, so running the unmodified suite from the repository can
write test settings/risk state into `backend/data/store.json`. Back up data or
isolate the test run.

### Docker

```powershell
cd "C:\Users\SPANDAN\Downloads\Trading app"
docker compose up --build
```

Expected frontend: `http://localhost:5180`.

Docker execution is Not confirmed from repository/audit environment because the
Docker command was unavailable.

## Environment variable names

Server/mode:

```text
PORT
TRADING_MODE
BROKER
STORAGE
ENABLE_LIVE_TRADING
```

Risk/cost:

```text
CAPITAL
RISK_PER_TRADE_PCT
MAX_DAILY_LOSS_PCT
MIN_RISK_REWARD
MAX_TRADES_PER_DAY
MAX_OPEN_TRADES
MAX_CONSECUTIVE_LOSSES
BROKERAGE_PER_ORDER
SLIPPAGE_BPS
```

Groww:

```text
GROWW_API_BASE
GROWW_ACCESS_TOKEN
GROWW_API_KEY
GROWW_API_SECRET
```

Alerts:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
ALERT_EMAIL_TO
```

Never publish the local `.env`, screenshots of it, or logs containing credentials.

## Page-by-page guide

### Dashboard

Use it to check:

- Current paper risk state.
- Kill switch.
- Daily simulated P&L.
- Trades today.
- Recent equity paper trades.
- Alerts.

Remember: "live" in the top bar means WebSocket connected, not live market data.

### Watchlist

- Add/remove supported sample symbols.
- Select a chart symbol.
- Refresh generated quotes.
- Compare generated LTP with generated VWAP.

Do not interpret these as current NSE/BSE prices.

### Strategies

- Review ten available strategies.
- Choose a symbol and strategy.
- Click Analyze.
- Read entry, stop, target, R:R, score, confidence, and risk quantity.
- Read Supports and Warnings.

The On/Off switch is currently cosmetic for execution. Do not rely on it to
prevent a strategy from running.

### Paper Trading

- Choose symbol/strategy.
- Click Run Paper Trade.
- The engine creates an entire synthetic history and outcome immediately.
- A trade is saved only if signal, score, and equity risk gate approve it.

This is not a live-forward paper account. The future segment is generated and
resolved within the same request.

### Backtesting

- Choose symbol, strategy, and number of sessions.
- Run backtest.
- Review number of trades before looking at win rate.
- Treat zero/very small trade counts as no evidence.

All data is generated.

### Live Trading

- You can prepare a preview.
- It still uses synthetic market data.
- The confirm button does not execute.

Do not enable live mode based on this screen.

### Options Dashboard

- Shows generated spot, ATM, PCR, max pain, and chain.
- Current "Recent Straddles" table is broken because of an API filter mismatch.
- Alerts may still show straddle events.

### Option Chain

- Choose index and days to expiry.
- Load generated CE/PE rows.
- Review theoretical premium, IV, OI, PCR, max pain, support, resistance.

These are model values, not exchange data.

### Straddle Builder

Build:

- Estimates ATM premiums, Greeks, breakevens, margin, max profit/loss.

Paper:

- Simulates a complete long/short straddle.

Scanner:

- Simulates a short straddle from 09:20 to 15:00.
- It is not a continuously running scanner.

Never use the short-straddle margin estimate for a real order. It is unhedged and
the code itself states the loss is unlimited.

### Straddle Backtest

- Compares generated long/short straddle sessions.
- Shows win rate, P&L, profit factor, drawdown, MAE/MFE, weekday P&L.

The path generator was designed with a specific range/trend regime mix, so this
performance is not independent evidence.

### Live Straddle Monitor

Despite its name, this is intended to show completed paper straddles. It is not a
live position monitor, and the current history load is broken.

### Trade Journal

- Add notes, mistakes, and emotions.
- Optionally enter a trade ID.
- Review all persisted equity and straddle trades.

The app does not validate the trade ID before saving a note.

### Reports

- Shows equity paper totals and per-strategy results.
- Excludes straddles.
- Does not include full expectancy/profit-factor/drawdown analysis.

### Risk Settings

Editable:

- Capital.
- Risk per trade.
- Daily loss.
- Minimum R:R.
- Trade/open-trade/loss-streak limits.

Use positive, realistic values. The backend currently accepts unsafe negative or
extreme numbers.

### Broker Settings

- Shows selected adapter status.
- Re-checks connection.
- Explains environment-based Groww setup.

It does not let you enter credentials in the UI. Invalid-token fallback text is
not accurate, and broker data is not used elsewhere.

## How to read a signal

Example fields:

- **Entry**: simulated price where the strategy wants to enter.
- **Stop**: price used to cap simulated loss.
- **Target**: expected exit price.
- **R:R**: reward distance divided by risk distance.
- **Confidence**: strategy's custom heuristic.
- **Score**: second heuristic combining R:R, confidence, VWAP distance, volume,
  and trend.
- **Eligible**: score at least 70.
- **Risk gate**: account-level rules and quantity.

Neither confidence nor score is a probability of success.

## How to understand win rate

Win rate:

```text
wins / total closed trades x 100
```

Do not use it alone. Also inspect:

- Number of trades.
- Average win.
- Average loss.
- Profit factor.
- Drawdown.
- Consecutive losses.
- Total costs.

The stored SQLite sample proves the point: 66.67% wins but negative net P&L.

## What is reasonably safe now

- Running locally in mock/paper mode.
- Reading strategy logic.
- Exploring indicators.
- Running synthetic analysis/backtests.
- Practicing journaling.
- Testing UI changes against disposable data.

## What should not be trusted yet

- Any displayed market price as current.
- Option OI, PCR, max pain, or support/resistance.
- Any win rate as expected performance.
- Groww endpoint compatibility.
- Live mode badge.
- Confirm button.
- Short-straddle margin.
- Strategy Off toggle.
- Straddle monitor history.
- Reports as complete account analytics.

## Before real-money trading

1. Add authentication, authorization, and per-user data.
2. Replace open CORS/WebSocket access with strict origin/auth controls.
3. Verify official Groww endpoints and payloads against current documentation.
4. Wire broker quote/history data into charts, signals, and preparation.
5. Build a real order state machine with idempotency and reconciliation.
6. Add mandatory broker-side stop/target protection.
7. Enforce margin, notional, freeze quantity, market hours, and price limits.
8. Apply one transactional risk gate to equities and options.
9. Require hedged option structures and broker margin preview.
10. Backtest on clean real historical data with all Indian charges.
11. Run long forward paper testing and compare with broker fills.
12. Add monitoring, audit users, backups, CI, and security updates.

## Final owner advice

Treat the application as a codebase for learning and further development. Keep it
local and paper-only. Its modular strategy, risk, options, and UI structure is a
good starting point, but the current code must not be used as authority to risk
real capital.

