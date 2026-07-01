# 09 - Risk, Security, and Bugs

## Critical findings

### 1. No authentication or authorization

All endpoints are public to anyone who can reach the server. A caller can:

- Read trades, journal, alerts, and configuration.
- Change risk settings and watchlist.
- Activate or release the kill switch.
- Trigger alert delivery.
- Run resource-intensive backtests.

This blocks any safe shared/network deployment.

### 2. Straddle paper trades bypass the main risk gate

`POST /options/straddle/paper` checks only the kill switch, then simulates and
records the result. It does not enforce:

- Daily loss.
- Maximum trades/day.
- Consecutive losses.
- Maximum open trades.
- Risk-per-trade sizing.
- Available margin.
- Maximum lots/notional.

It updates counters only after the completed simulation.

### 3. Live UI makes a false execution claim

When the gate is true, UI text says confirmation will place a real order. There
is no confirm API and no button handler. This can mislead the owner about actual
system state and should be treated as a serious trading-safety defect.

## High-severity findings

### 4. Open CORS and unauthenticated WebSocket

`app.use(cors())` allows all origins. WebSocket has no authentication or origin
validation. Combined with public state-changing endpoints, a network-accessible
deployment is exposed to cross-origin control and data access.

### 5. Equity sizing does not enforce available capital/margin

`validateTrade()` defaults available margin to infinity, and callers do not
provide broker/configured capital as margin. A very small stop can generate a
quantity whose notional is much larger than capital.

### 6. Groww adapter contract is not verified or integrated

Endpoint paths are marked placeholders. Strategy/live preparation uses synthetic
data, not Groww. A future developer could mistake the adapter for production ready.

### 7. Risk settings accept dangerous values

Any finite numeric value is stored. Negative capital, negative loss limits,
zero/negative trade limits, huge percentages, and extreme values can produce
incorrect sizing or permanently block/disable controls.

### 8. Dependency audit findings as of 2026-06-14

Backend `npm audit --omit=dev` reported one direct high-severity package finding
group for installed Nodemailer 6.10.1, with advisories including:

- https://github.com/advisories/GHSA-rcmh-qjqh-p98v
- https://github.com/advisories/GHSA-mm7p-fcc7-pg87
- https://github.com/advisories/GHSA-c7w3-x93f-qmm8
- https://github.com/advisories/GHSA-vvjj-xcjg-gr5g

Frontend audit reported Vite/esbuild advisory exposure:

- https://github.com/advisories/GHSA-67mh-4wv8-2f99
- https://github.com/advisories/GHSA-gv7w-rqvm-qjhr
- https://github.com/advisories/GHSA-4w7w-66w2-5vf9

The audit suggested major-version upgrades. Application-specific exploitability
is not fully confirmed, but dependencies should be reviewed and upgraded.

## Confirmed functional bugs

### 9. Straddle monitor and options dashboard always miss stored straddles

The endpoint returns only equity paper records, then screens filter for straddles.

### 10. Strategy disable does not disable execution

Enabled state is cosmetic/in-memory. Execution routes ignore it.

### 11. Dashboard capital can disagree with saved risk capital

Headline uses public environment config; risk panel uses database overrides.

### 12. Invalid Groww token does not fall back as documented

It stays on a disconnected Groww adapter.

### 13. Static dashboard win-rate KPI is never populated

`kpi-winrate` exists in HTML but no JavaScript assignment was found.

### 14. Scanner is called "scanner" but is not scheduled or persisted

It runs one simulation only when manually invoked. It does not record a trade,
alert, audit event, or risk counters.

## Medium-severity design and trading risks

### 15. Synthetic data is used even in "live prepare"

The route can produce a live-looking order preview unrelated to current market
price.

### 16. Risk day rollover uses UTC

`new Date().toISOString().slice(0,10)` changes day at 05:30 IST, not midnight IST
and not a trading-session boundary.

### 17. Maximum open trades is not meaningful in simulations

Trades open and close back-to-back in one request, so open count returns to zero.

### 18. No real stop order protection

Stops/targets are numbers used by simulation. They are not submitted or monitored
at a broker.

### 19. Straddle input limits are missing

Lots and lot size are only forced above one; no upper bound. Stop/target percentages
can be negative or extreme through direct API calls. Unknown type becomes long.

### 20. Resource abuse is possible

Unauthenticated callers can repeatedly run backtests, request large option chains,
generate alerts, and write journal/settings data. No rate limiting exists.

### 21. Notification abuse

`/alerts/test` accepts caller-controlled level/message. Warn/critical levels fan
out to configured Telegram/email. This can spam channels and write arbitrary
message content to logs.

### 22. WebSocket is not a market feed

UI "live" status means socket connected, not broker connected or market data live.
This can confuse users.

### 23. Two stores can create conflicting truth

SQLite and JSON contain different histories/settings. Switching `STORAGE` changes
what the app reports with no migration or warning.

### 24. JSON persistence lacks robust crash/concurrency handling

It rewrites the entire file synchronously. Current code does not use the existing
`.tmp` snapshot for atomic replacement or recovery.

### 25. No database/user encryption or retention policy

Journal emotions/mistakes and trade data are globally readable and stored in
plain local files.

### 26. Backtest realism is limited

No real data, taxes, liquidity, partial fills, gaps, exchange calendar, IV changes,
or margin. Win rates can be artifacts of generator assumptions.

### 27. Intrabar ordering is arbitrary

Equity simulation checks stop before target. If both are touched in one candle,
the result is always a stop.

### 28. Option margin estimate is a placeholder

Short straddle builder uses a rough percentage and warns it must be replaced.

### 29. Hardcoded lot sizes can become stale

Exchange lot sizes change. The repository has no instrument master/versioning.

### 30. Alerts constants exceed actual behavior

Trade-entered, daily-loss, and high-volatility alert types are defined but not
emitted by current flows.

## Lower-severity gaps

- No healthcheck in Docker Compose.
- `depends_on` does not wait for backend readiness.
- Absolute path in `.claude/launch.json`.
- No CI/CD or automated security scanning.
- No lint/format scripts.
- No frontend tests.
- No route integration tests.
- No Groww mock-contract tests.
- No schema migration tests.
- No data export/backup UI.
- No audit viewer.
- No alert read state endpoint.
- No input length limits per field.
- No pagination on journal/trade API.
- No 404 page in React.
- No API versioning.
- No idempotency or request IDs.
- No metrics/tracing/production monitoring.
- No TLS or secure-cookie design.

## Security positives

- Paper mode by default.
- No live order route.
- Request bodies are not logged.
- Secret-looking object keys are redacted.
- `.env` and data are excluded from Docker contexts.
- Backend central error handler avoids returning stack traces.
- Groww requests use HTTPS base by default and bearer auth.
- Black-Scholes/risk/strategy tests pass.
- Short straddle unlimited-risk warning is explicit.

## Missing tests by risk area

1. Authorization and multi-user isolation.
2. Live-gate permutations.
3. Confirm/order workflow.
4. Straddle risk enforcement.
5. Invalid negative/extreme settings.
6. Endpoint rate/resource limits.
7. Strategy enabled-state behavior.
8. Straddle history API.
9. Database switch/migration.
10. Real broker payload/endpoint compatibility.
11. Alert abuse and WebSocket origin checks.
12. Full India charges and margin models.

## Risk verdict

The repository is reasonably safe only when bound locally, left in paper/mock
mode, and treated as a simulation. It is not safe for public deployment or
real-money trading. The absence of a live route currently prevents accidental
broker orders, but that is not a substitute for production-grade security and
risk controls.

