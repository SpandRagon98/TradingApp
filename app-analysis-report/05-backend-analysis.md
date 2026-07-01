# 05 - Backend Analysis

## Architecture

The backend is a synchronous Node/Express application:

```text
HTTP/JSON routes
  -> strategy/options/paper/backtest engines
  -> risk and score gates
  -> SQLite or JSON store
  -> alerts
  -> WebSocket + optional Telegram/SMTP
```

Most calculations are in-process and synchronous. There is no worker queue,
scheduler, cron process, or external database server.

## API endpoints

### System and configuration

| Method/path | Behavior |
|---|---|
| `GET /api/health` | Status and server timestamp |
| `GET /api/config` | Public mode/broker/risk/cost/storage/channel status |
| `GET /api/disclaimer` | Educational risk disclaimer |

### Alerts

| Method/path | Behavior |
|---|---|
| `GET /api/alerts` | Last 100 persisted alerts |
| `POST /api/alerts/test` | Creates arbitrary test alert from body message/level |

### Broker

| Method/path | Behavior |
|---|---|
| `GET /api/broker/status` | Calls active broker `status()` |
| `POST /api/broker/connect` | Calls active broker `connect()` and audits result |

There are no routes for quotes, historical data, margin, positions, orders,
cancel/modify, holdings, or order book through the broker abstraction.

### Market data

| Method/path | Behavior |
|---|---|
| `GET /api/market/symbols` | Hardcoded sample symbols and intervals |
| `GET /api/market/candles` | Generates synthetic OHLCV and VWAP |

This route does not call the active broker.

### Strategies

| Method/path | Behavior |
|---|---|
| `GET /api/strategies` | Catalogue and in-memory enabled flags |
| `POST /api/strategies/enable` | Sets in-memory flag and audits |
| `POST /api/strategies/disable` | Clears in-memory flag and audits |
| `POST /api/strategies/run` | Generates synthetic candles, signal, score, risk preview |

Enabled state is not enforced by `/strategies/run`, paper trading, or backtests.

### Paper and backtest

| Method/path | Behavior |
|---|---|
| `POST /api/paper/run` | Runs and persists one complete equity paper simulation |
| `GET /api/paper/trades` | Returns only `mode: "paper"` equity records |
| `POST /api/backtest/run` | Runs 1-250 requested synthetic sessions in practice, with weak lower-bound validation |

### Risk, watchlist, live preview

| Method/path | Behavior |
|---|---|
| `GET /api/risk/status` | Merged limits and daily state |
| `POST /api/risk/settings` | Persists numeric overrides without safe ranges |
| `GET /api/watchlist` | Saved list or five defaults |
| `POST /api/watchlist` | Saves up to 50 strings |
| `POST /api/live/kill-switch` | Toggles global kill switch and emits alert |
| `POST /api/live/prepare` | Synthetic signal plus live-looking confirmation payload |

There is no live confirm/submit endpoint.

### Options

| Method/path | Behavior |
|---|---|
| `GET /api/options/chain` | Generates synthetic Black-Scholes option chain |
| `GET /api/options/greeks` | Calculates one option's theoretical price/Greeks |
| `POST /api/options/straddle/build` | Analysis-only long/short ATM straddle |
| `POST /api/options/straddle/paper` | Simulates, persists, and risk-accounts a straddle |
| `POST /api/options/straddle/backtest` | Synthetic multi-session straddle test |
| `POST /api/options/straddle/scanner` | Manual time-window short-straddle simulation |

### Journal

| Method/path | Behavior |
|---|---|
| `GET /api/journal` | Returns all journal and all trade modes |
| `POST /api/journal/note` | Saves note/mistake/emotion and optionally marks trade |

## Authentication and sessions

Authentication is absent:

- No login/signup.
- No password hashing.
- No JWT/cookie/session.
- No authorization middleware.
- No role or admin distinction.
- No user IDs on records.

Every API is globally accessible to anyone who can reach the server. This includes
risk changes, watchlist changes, alert tests, kill-switch release, broker status,
paper simulations, and journal content.

## Strategy execution flow

Analysis flow:

```text
request
-> hardcoded/synthetic candles
-> strategy.generateSignal()
-> scoreSignal()
-> validateTrade() for actionable signal
-> JSON response
```

Paper flow:

```text
request
-> generate 115 synthetic candles
-> first 75 form the signal
-> score threshold 70
-> risk gate
-> simulate next 40 candles
-> record open then close immediately
-> persist signal/trade/audit
-> emit close/blocked alert
```

No broker method is involved.

## Live flow

Current live flow:

```text
POST /live/prepare
-> synthetic candles
-> strategy signal
-> score and risk preview
-> confirmation JSON
-> stop
```

`GrowwBroker.placeOrder()` is never called. The route comment explicitly says
prepare-only. Real order status, fills, stop orders, and reconciliation do not
exist.

## Risk engine

Equity validation checks:

- Kill switch.
- NO_TRADE.
- Minimum R:R.
- Trades per day.
- Open trades.
- Consecutive losses.
- Daily loss.
- Quantity from capital, risk percentage, and stop distance.

Important limitations:

- Default `availableMargin` is `Infinity`.
- Normal equity calls do not request broker margin.
- Straddle route skips `validateTrade()` entirely.
- Saved values can be negative, zero, or extreme.
- Daily date is UTC.
- The daily-loss alert constant is not emitted when the limit is reached.

## Data models and persistence

The store is schemaless. Typical record shapes:

### Equity trade

```text
id, createdAt, mode, symbol, strategy, side, quantity,
entry, stop, target, exit, exitReason, riskReward, score,
grossPnl, costs, pnl, reasonEntry, rulesFollowed,
openedAt, closedAt, hasNote?
```

### Straddle trade

```text
id, createdAt, mode, symbol, strategy, side, strike, quantity,
ceEntry, peEntry, combinedEntry,
ceExit, peExit, combinedExit,
breakevenUp, breakevenDown, exitReason, costs, pnl
```

### Other collections

- Signal: symbol, strategy, type, score.
- Journal: tradeId, note, mistake, emotion.
- Alert: type, message, metadata, level, read flag.
- Audit: action and metadata.
- Settings KV: risk overrides and watchlist.
- Risk-state KV: day, daily P&L, counts, kill switch.

No database migrations, schema versions, foreign keys, indexes beyond primary
keys, retention rules, encryption, backups, or multi-user ownership exist.

## Broker flow

Broker selection happens once in a process:

- Groww only if configured broker is `groww` and an access token is non-empty.
- Otherwise mock.
- `resetBroker()` exists but is not used by any route.

The Groww adapter implements status, connect, quote, historical, margin,
placeOrder, and positions. Its endpoint map is explicitly marked placeholder.

Normal strategy, watchlist, chart, option, paper, and backtest routes bypass the
active broker and directly generate synthetic data.

## Error handling and validation

Positive:

- Central Express 500 handler hides internal details.
- Unknown API routes return JSON 404.
- Request body limit is 1 MB.
- Groww wrapper distinguishes auth/rate/network/HTTP failures.
- Logger redacts object fields with secret-like key names.

Weaknesses:

- No request schema library.
- Symbols/intervals are not restricted to advertised values.
- Risk values have no sensible ranges.
- Option `strikesEach` has no cap.
- Straddle lots/lot size have no maximum.
- Paper straddle treats any type other than `"short"` as long.
- Journal fields have no length limits beyond global body size.
- Alert level/message are caller-controlled.
- Some async broker route paths do not have local try/catch.
- Static frontend API wrapper assumes JSON and has no network try/catch.

## Logging and audit

- Structured JSON logger to stdout/stderr.
- Request method/path only; body is not logged.
- Secret-like object keys are redacted recursively.
- Alert messages are logged as plain message values.
- State-changing actions are partly audited.

Audit gaps:

- No audit log viewer.
- Watchlist and journal changes are not audited.
- Paper signal insertion is not itself audited.
- No authenticated actor/IP/user context.

## Realtime and background work

WebSocket:

- Path `/ws`.
- Sends hello on connection.
- Broadcasts alerts.
- No auth/origin check.
- No market ticks, candle updates, position updates, or heartbeats.

Background jobs:

- None.
- Scanner is manual, despite time-based naming.
- No scheduled market open/close process.
- No token refresh.
- No broker reconciliation.

## Tests and verification

The isolated backend suite passed 38/38 tests. Coverage includes:

- Indicators.
- Black-Scholes and IV.
- Basic risk rules.
- Strategy return shape and one crafted ORB signal.
- Straddle build/paper/backtest shape.
- Backtest determinism.

Missing test areas:

- Express route integration.
- Authentication, because none exists.
- Groww HTTP contract.
- Live execution.
- Frontend behavior.
- Persistence switching/migration.
- Broken straddle history endpoint behavior.
- Strategy enabled-state enforcement.
- Invalid/hostile inputs.
- Alert delivery and WebSocket authorization.

## Backend verdict

The backend is a coherent local simulation service with useful modular engines.
It is not a broker-connected trading backend. The largest technical gaps are the
absence of authentication, synthetic-only application data, incomplete Groww
contract, no live submission route, straddle risk bypass, and globally mutable
unvalidated settings.

