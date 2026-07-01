# 01 - Repository Map

## Audit scope

Audit date: 2026-06-14.

This report covers the first-party source, configuration, stored data structure,
tests, generated frontend bundle, and deployment files under the repository root.
`node_modules` is summarized rather than listing every installed package file.
The local `backend/.env` was treated as sensitive: only variable names were
identified, and no values are reproduced here.

## Full first-party tree

```text
Trading app/
|-- .claude/
|   `-- launch.json
|-- backend/
|   |-- .dockerignore
|   |-- .env                         # local values redacted
|   |-- .env.example
|   |-- .gitignore
|   |-- Dockerfile
|   |-- package.json
|   |-- package-lock.json
|   |-- node_modules/                # generated dependencies, not enumerated
|   |-- data/
|   |   |-- trading.db               # SQLite store
|   |   |-- store.json               # JSON fallback/alternate store
|   |   `-- store.json.tmp           # stale snapshot; not referenced by current code
|   |-- public/
|   |   |-- index.html
|   |   |-- app.js
|   |   `-- styles.css
|   |-- src/
|   |   |-- config.js
|   |   |-- indicators.js
|   |   |-- logger.js
|   |   |-- scoring.js
|   |   |-- server.js
|   |   |-- store.js
|   |   |-- alerts/
|   |   |   |-- alerts.js
|   |   |   |-- email.js
|   |   |   `-- telegram.js
|   |   |-- api/
|   |   |   `-- routes.js
|   |   |-- backtest/
|   |   |   `-- engine.js
|   |   |-- broker/
|   |   |   |-- broker.js
|   |   |   |-- groww.js
|   |   |   `-- mock.js
|   |   |-- marketdata/
|   |   |   `-- candles.js
|   |   |-- options/
|   |   |   |-- greeks.js
|   |   |   |-- option_chain.js
|   |   |   |-- straddle.js
|   |   |   |-- straddle_backtest.js
|   |   |   `-- straddle_engine.js
|   |   |-- paper/
|   |   |   `-- engine.js
|   |   |-- realtime/
|   |   |   `-- hub.js
|   |   |-- risk/
|   |   |   `-- risk.js
|   |   `-- strategies/
|   |       |-- base.js
|   |       |-- registry.js
|   |       |-- momentum.js
|   |       |-- orb.js
|   |       |-- vwap.js
|   |       |-- breakout.js
|   |       |-- ma_crossover.js
|   |       |-- mean_reversion.js
|   |       |-- gap_and_go.js
|   |       |-- ohl.js
|   |       |-- pullback.js
|   |       `-- pivot.js
|   `-- test/
|       |-- indicators.test.js
|       |-- strategies.test.js
|       |-- risk.test.js
|       |-- greeks.test.js
|       |-- straddle.test.js
|       `-- backtest.test.js
|-- frontend/
|   |-- .dockerignore
|   |-- Dockerfile
|   |-- index.html
|   |-- nginx.conf
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.js
|   |-- node_modules/                # generated dependencies, not enumerated
|   |-- dist/                        # generated production bundle
|   |   |-- index.html
|   |   `-- assets/
|   |       |-- index-BtEFz6-u.js
|   |       `-- index-D3ez6K_U.css
|   `-- src/
|       |-- App.jsx
|       |-- index.css
|       |-- main.jsx
|       |-- components/
|       |   |-- AlertsFeed.jsx
|       |   |-- Chart.jsx
|       |   |-- ConfirmTradeModal.jsx
|       |   |-- KillSwitchButton.jsx
|       |   |-- Layout.jsx
|       |   |-- OptionChainTable.jsx
|       |   |-- SignalCard.jsx
|       |   |-- StraddleCard.jsx
|       |   |-- TradeTable.jsx
|       |   `-- ui.jsx
|       |-- hooks/
|       |   `-- useMeta.js
|       |-- pages/
|       |   |-- Backtesting.jsx
|       |   |-- BrokerSettings.jsx
|       |   |-- Dashboard.jsx
|       |   |-- LiveStraddleMonitor.jsx
|       |   |-- LiveTrading.jsx
|       |   |-- OptionChain.jsx
|       |   |-- OptionsDashboard.jsx
|       |   |-- PaperTrading.jsx
|       |   |-- Reports.jsx
|       |   |-- RiskSettings.jsx
|       |   |-- StraddleBacktest.jsx
|       |   |-- StraddleBuilder.jsx
|       |   |-- Strategies.jsx
|       |   |-- TradeJournal.jsx
|       |   `-- Watchlist.jsx
|       |-- services/
|       |   |-- api.js
|       |   `-- ws.js
|       `-- store/
|           `-- AppContext.jsx
|-- README.md
|-- StraddleTrading.jsx              # disconnected standalone mock prototype
`-- docker-compose.yml
```

## Technology stack

| Area | Confirmed technology | Evidence |
|---|---|---|
| Main frontend | React 18, React Router 6, Vite 5 | `frontend/package.json`, `frontend/src/main.jsx` |
| Charting | TradingView Lightweight Charts 4.2 | `frontend/src/components/Chart.jsx` |
| Frontend state | React Context plus local component state | `frontend/src/store/AppContext.jsx` |
| Backend | Node.js ES modules, Express 4 | `backend/package.json`, `backend/src/server.js` |
| Realtime | `ws` WebSocket server/client | `backend/src/realtime/hub.js`, `frontend/src/services/ws.js` |
| Persistence | Built-in `node:sqlite`, JSON fallback | `backend/src/store.js` |
| Broker | Mock broker and partial Groww REST adapter | `backend/src/broker/` |
| Market data | Deterministic synthetic OHLCV generator | `backend/src/marketdata/candles.js` |
| Indicators | Custom JavaScript implementations | `backend/src/indicators.js` |
| Backtesting | Custom equity and straddle engines | `backend/src/backtest/`, `backend/src/options/straddle_backtest.js` |
| Options model | Black-Scholes, Greeks, implied volatility | `backend/src/options/greeks.js` |
| Notifications | In-app/WebSocket, optional Telegram and SMTP | `backend/src/alerts/` |
| Authentication | None | No user/auth/session modules or routes found |
| Deployment | Dockerfiles, Docker Compose, nginx | root and frontend/backend deployment files |
| Tests | Node built-in test runner | `backend/test/`, `npm test` |

Installed versions observed during the audit:

- Node.js `v24.14.1`; repository requires Node `>=20`.
- Backend: Express `4.22.2`, CORS `2.8.6`, Nodemailer `6.10.1`,
  WebSocket `8.21.0`.
- Frontend: React `18.3.1`, React Router `6.30.4`,
  Lightweight Charts `4.2.3`, Vite `5.4.21`.
- Docker was not installed in the audited environment.

## Main entry points

1. Backend: `backend/src/server.js`
   - Starts Express on the configured port.
   - Mounts REST routes under `/api`.
   - Serves `backend/public` at `/`.
   - Attaches WebSocket `/ws`.

2. React frontend: `frontend/src/main.jsx`
   - Mounts React.
   - Installs `BrowserRouter` and `AppProvider`.
   - Routes are declared in `frontend/src/App.jsx`.

3. Static fallback dashboard: `backend/public/index.html` + `app.js`
   - Served directly by the backend at port 8080.
   - Provides a smaller single-page UI without a build step.

4. Disconnected prototype: root `StraddleTrading.jsx`
   - A mock 2024 NIFTY expiry-day long-straddle backtester.
   - Not imported by the React app.
   - Requires `lucide-react` and Tailwind-style classes that are not configured
     by the current frontend package.

## Database map

SQLite creates these tables:

```text
trades(id, created_at, data)
journal(id, created_at, data)
signals(id, created_at, data)
audit_log(id, created_at, data)
alerts(id, created_at, data)
kv(key, value)
```

All business records are JSON blobs rather than normalized relational columns.
The `kv` table stores `riskState` and `settings`. The JSON fallback mirrors the
same collections in `backend/data/store.json`.

No user, account, broker-token, strategy-definition, backtest-result, portfolio,
or order table exists.

## Configuration names

The repository recognizes these variables. Values are intentionally omitted:

```text
PORT
TRADING_MODE
BROKER
CAPITAL
RISK_PER_TRADE_PCT
MAX_DAILY_LOSS_PCT
MIN_RISK_REWARD
MAX_TRADES_PER_DAY
MAX_OPEN_TRADES
MAX_CONSECUTIVE_LOSSES
BROKERAGE_PER_ORDER
SLIPPAGE_BPS
GROWW_API_BASE
GROWW_ACCESS_TOKEN
GROWW_API_KEY
GROWW_API_SECRET
ENABLE_LIVE_TRADING
STORAGE
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

The local `.env` exists and is ignored by backend Git/Docker ignore rules. No
hardcoded assignments for the listed secret variables were found outside that
excluded local file and the blank example file.

## Deployment map

- `docker-compose.yml` defines backend, frontend, and a persistent data volume.
- Backend image uses Node 22 Alpine and `node:sqlite`.
- Frontend uses a Node build stage and nginx runtime stage.
- nginx proxies `/api/` and `/ws` to the backend.
- No cloud provider, CI/CD pipeline, Kubernetes, TLS termination, domain setup,
  secret manager, or production monitoring is present.
- Docker build execution: Not confirmed from repository. It was not possible to
  execute because Docker is absent in the audited environment.

## Generated and unusual artifacts

- `frontend/dist` is a checked-in/generated production bundle.
- `backend/data/trading.db` and `store.json` contain different paper histories
  because they are alternative stores.
- `backend/data/store.json.tmp` is valid JSON but current `store.js` never reads
  or writes it. Its purpose is Not confirmed from repository.
- `.claude/launch.json` contains absolute local Windows paths, making it
  non-portable to another checkout.
- `README.md` repeats the options-modeling note and contains several claims that
  are more optimistic than the wired code; discrepancies are documented later.

