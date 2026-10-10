# Intraday Trading Assistant — Phase 1 (Runnable Core)

A **paper-first, risk-managed** intraday trading assistant for Indian markets. This
is Phase 1: a working end-to-end slice you can run today. It generates scored
trade signals, simulates paper trades, backtests strategies, sizes positions by
risk, and ships an option-straddle builder — all behind a clean dashboard.

> **Disclaimer.** This tool is for educational and analytical purposes. Intraday
> and options trading are risky. It does **not** guarantee profits. Use paper
> trading first. Trade at your own risk and follow SEBI, exchange, and broker rules.

---

## Why Node (not Go)

The spec asked for a Go backend, but Go isn't installed in this environment and
couldn't be compiled/verified here. To deliver a **runnable** core, the backend is
**Node + Express** (the only stack that runs here and matches your existing React
apps). The module layout deliberately mirrors the spec's Go folders, so a future
port is mechanical. Say the word and I'll port module-by-module once Go is set up.

## What works right now

| Area | Status |
|---|---|
| Broker abstraction + **mock** adapter | ✅ runnable |
| **Groww** adapter (official API, token-gated, graceful fallback) | ✅ structured, needs creds |
| Market-data engine (synthetic candles + indicators) | ✅ runnable |
| **All 10 equity strategies**: Momentum, Opening-Range-Breakout, VWAP, Breakout, MA-Crossover, Mean-Reversion, Gap-and-Go, Open-High/Open-Low, Pullback, Pivot-Point | ✅ runnable |
| Indicators: EMA, RSI, VWAP, ATR, Bollinger, ADX, pivots, rel-volume | ✅ runnable |
| Signal **scoring** (0–100, factors for/against, 70 gate) | ✅ runnable |
| **Risk engine**: position sizing, daily-loss, max-trades, consecutive-loss breaker, kill switch | ✅ runnable |
| **Paper trading** (simulated fills, brokerage + slippage) | ✅ runnable |
| **Backtesting** (win rate, profit factor, drawdown, equity curve, MAE/MFE) | ✅ runnable |
| **Black-Scholes Greeks + IV solver** (validated vs textbook + put-call parity) | ✅ runnable |
| **Option chain** (BS-priced, IV smile, OI, PCR, max pain, OI support/resistance) | ✅ runnable |
| **Straddle builder** (real premiums, net Δ/Θ/ν Greeks, breakevens, unlimited-risk warning) | ✅ runnable |
| **Straddle paper engine** (both legs repriced via BS as spot moves + time decays; combined/leg SL, target, trailing) | ✅ runnable |
| **Straddle backtest** + **9:20 short-straddle scanner** | ✅ runnable |
| **SQLite storage** (Node built-in `node:sqlite`, JSON fallback) | ✅ runnable |
| **WebSocket live feed** (`/ws`) — alerts & state pushed to the dashboard | ✅ runnable |
| **Alerts** (in-app feed + WebSocket + optional Telegram + optional email/SMTP) | ✅ runnable |
| Trade journal + audit log | ✅ runnable |
| **Multi-page React frontend** (Vite + React Router, 15 pages) in `frontend/` | ✅ runnable |
| **Candle charts** (lightweight-charts) on the Watchlist | ✅ runnable |
| **Unit tests** — 38 tests (indicators, Black-Scholes, risk engine, strategies, straddles, backtest) | ✅ `npm test` green |
| **Docker** — backend + frontend Dockerfiles + `docker-compose.yml` | ✅ written (build on a Docker host) |
| Single-file served dashboard (backend `/`) | ✅ runnable (kept as a zero-build fallback) |
| Live order execution | ⛔ deliberately gated OFF (prepare-only) |

### Not yet built
**Postgres adapter** — deliberately deferred: the store interface is **synchronous**
(and `node:sqlite` is sync), while `pg` is async, so Postgres needs an async store
refactor across the app rather than a config swap. SQLite/JSON cover local + Docker.
Also pending: a real options live-chain feed and broker-verified margins for live use.

> **Options modelling note.** Index options are European, so Black-Scholes applies.
> The synthetic option IV is set to match the data engine's realized vol (~22%), and
> the straddle engine uses a mean-reverting intraday path so short straddles win on
> range days and lose on trend days — a realistic profile (win often & small, lose
> seldom & large). With **real** data, use the broker's live chain + IV instead.

> **Options modelling note.** Index options are European, so Black-Scholes applies.
> The synthetic option IV is set to match the data engine's realized vol (~22%), and
> the straddle engine uses a mean-reverting intraday path so short straddles win on
> range days and lose on trend days — a realistic profile (win often & small, lose
> seldom & large). With **real** data, use the broker's live chain + IV instead.

---

## Setup & run

**1. Backend** (API + WebSocket + served fallback dashboard):

```bash
cd trading-app/backend
npm install
cp .env.example .env      # safe defaults; no secrets needed for paper/mock
npm run dev               # or: npm start   (http://localhost:8080)
```

The served single-file dashboard is at **http://localhost:8080**.

**2. React frontend** (the full multi-page app — needs the backend running):

```bash
cd trading-app/frontend
npm install
npm run dev               # http://localhost:5180 (proxies /api & /ws to :8080)
```

Open **http://localhost:5180** for the 15-page app (Dashboard, Watchlist,
Strategies, Paper/Live Trading, Backtesting, Options Dashboard, Option Chain,
Straddle Builder/Backtest/Monitor, Trade Journal, Reports, Risk/Broker Settings).
Both load in PAPER / mock mode — no credentials, no real orders.

> Launch-panel configs (in `.claude/launch.json`): **`trading-app`** (backend, 8080)
> and **`trading-frontend`** (React, 5180). Start both; the frontend proxies to the backend.
> The frontend uses `.jsx` (the spec named `.tsx`; trivially convertible).

---

## Using it

- **Analyze** — runs a strategy on one symbol and shows the scored signal with the
  exact factors for and against, plus the risk gate's verdict.
- **Run Paper Trade** — generates a signal, scores it, runs the risk gate, and (if
  approved) simulates the trade to a stop/target/EOD exit with costs applied. Result
  is persisted and updates your daily P&L / counters.
- **Backtest (30d)** — runs the strategy over 30 synthetic sessions and reports win
  rate, profit factor, drawdown, consecutive losses, and an equity curve.
- **Straddle Builder** — pick index/type/lots → breakevens, max loss/profit, margin
  estimate. Short straddles surface the **unlimited-risk** warning.
- **Kill Switch** — flips a hard flag that blocks every new trade at the risk gate.

Most setups intentionally return **NO TRADE** with a reason — that's the discipline
working (no over-trading), not a bug.

---

## API (Phase 1 subset)

```
GET  /api/health                     GET  /api/config           GET  /api/disclaimer
GET  /api/broker/status              POST /api/broker/connect
GET  /api/market/symbols             GET  /api/market/candles
GET  /api/strategies                 POST /api/strategies/{enable,disable,run}
POST /api/paper/run                  GET  /api/paper/trades
POST /api/backtest/run
GET  /api/risk/status                POST /api/live/kill-switch
POST /api/live/prepare               (preview only — never auto-executes)
GET  /api/options/chain              GET  /api/options/greeks
POST /api/options/straddle/build     POST /api/options/straddle/paper
POST /api/options/straddle/backtest  POST /api/options/straddle/scanner
GET  /api/alerts                     POST /api/alerts/test
GET  /api/journal                    POST /api/journal/note
WS   /ws                             (live feed: alerts, trade/risk updates)
```

---

## Connecting Groww (official API only)

This app uses **only** the official Groww Trading API over HTTPS with a bearer
access token. It does **not** scrape Groww, automate the app/web UI, or bypass login.

1. Generate an **access token** from the Groww developer console.
2. In `.env`, set `BROKER=groww` and `GROWW_ACCESS_TOKEN=<your token>`. Never commit `.env`.
3. Restart. `GET /api/broker/status` will report connectivity. If the token is
   missing/invalid, the app **falls back to mock mode** rather than failing.
4. Confirm/adjust the endpoint paths in `src/broker/groww.js` (`ENDPOINTS`) against
   current Groww docs — method bodies and error handling stay the same.

Secrets are never sent to the frontend and never logged (the logger redacts them).

## Tests

```bash
cd trading-app/backend
npm test        # node --test → 38 tests
```

Covers the indicators, Black-Scholes/Greeks (textbook + put-call parity + IV
round-trip), the risk engine (position sizing, daily-loss, kill switch,
consecutive-loss breaker), strategy shape + reachability, and the straddle/backtest
engines. Risk tests run against the JSON store so they never touch the app's SQLite DB.

## Docker

```bash
cd trading-app
docker compose up --build      # backend :8080, frontend :5180 (nginx proxies /api + /ws)
```

`backend/Dockerfile`, `frontend/Dockerfile` (multi-stage → nginx), `nginx.conf`, and
`docker-compose.yml` are provided. The SQLite DB persists in the `trading-data`
volume. (The compose stack was authored but not built in the dev environment — run
`docker compose build` on a machine with Docker to verify.)

## Production deployment (Render)

The root `Dockerfile` packages the React frontend, Node API, WebSocket endpoint,
and SQLite storage as one deployable service. `render.yaml` provisions HTTPS,
requires login, mounts persistent storage, and keeps the application in paper
mode by default.

1. Create a Render Blueprint from this repository and enter strong values for
   `ADMIN_EMAIL` and `ADMIN_PASSWORD` when prompted.
2. In the new Render service, copy **Settings → Deploy Hook**.
3. In GitHub, create the Actions secret `RENDER_DEPLOY_HOOK_URL` with that value.
4. Create the GitHub Actions variable `RENDER_DEPLOY_ENABLED=true` and set
   `APP_URL` to the service's `https://…onrender.com` URL.
5. Run **CI/CD** manually once, or push to `main`. The production environment on
   the Actions run will then contain the live link.

The Blueprint uses a paid Starter service because SQLite needs a persistent disk.
Broker credentials remain server-side Render secrets and are intentionally not
declared in source control. Do not enable real-money execution until the broker
connection, authentication, stop-loss flow, and kill switch have been verified
in paper mode.

## Alerts channels

In-app + WebSocket always work. Optional, free, env-gated (silent no-op when unset):
**Telegram** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`) and **email/SMTP**
(`SMTP_HOST` + `SMTP_USER` + `ALERT_EMAIL_TO`). warn/critical alerts fan out to both.

## Running paper trading

It's the default. Just run the server and click **Run Paper Trade**. Nothing else to enable.

## Running backtests

Click **Backtest**, or `POST /api/backtest/run` with `{ symbol, strategy, days }`.
Swap synthetic data for real history by replacing `generateCandles` with
`broker.getHistorical` in the backtest loop — metrics are unchanged.

## Safely enabling live trading (later, deliberately hard)

Live execution is OFF behind a **triple-gate** (`src/config.js`):
`ENABLE_LIVE_TRADING=true` **and** `TRADING_MODE=live` **and** valid Groww creds.
Even then, `/api/live/prepare` only returns a confirmation payload — wiring the
actual `placeOrder` to a confirm step (with mandatory stop-loss, margin check, and
per-trade confirmation) is an explicit Phase-2 task we'll do together. **Options /
short-straddle live trading stays disabled** until hedging + margin checks are real.

---

## Project layout

```
trading-app/backend/
  src/
    config.js            logger.js          store.js (SQLite via node:sqlite; JSON fallback)
    scoring.js
    indicators.js
    marketdata/candles.js
    broker/   broker.js  mock.js  groww.js
    strategies/  base.js  momentum.js  orb.js  vwap.js  breakout.js
                 ma_crossover.js  mean_reversion.js  gap_and_go.js
                 ohl.js  pullback.js  pivot.js  registry.js
    risk/     risk.js
    paper/    engine.js
    backtest/ engine.js
    options/  greeks.js  option_chain.js  straddle.js
              straddle_engine.js  straddle_backtest.js
    realtime/ hub.js                 # WebSocket broadcast hub
    alerts/   alerts.js  telegram.js  email.js   # in-app + Telegram + SMTP
    api/      routes.js
    server.js
  public/   index.html  styles.css  app.js     # zero-build served dashboard
  test/     indicators / greeks / risk / strategies / straddle / backtest .test.js
  Dockerfile

trading-app/frontend/                          # Vite + React, 15 pages
  src/  pages/ (15)  components/ (Chart, SignalCard, …)  services/  store/  hooks/
  Dockerfile  nginx.conf

trading-app/docker-compose.yml
```

## Safety rules baked in
No guaranteed-profit claims · paper-first default · live OFF by default · mandatory
stop-loss for sizing · daily-loss + consecutive-loss circuit breakers · kill switch ·
naked short-straddle unlimited-risk warning + hedge/margin/confirmation requirements ·
secret redaction in logs · no Groww scraping or UI automation.

