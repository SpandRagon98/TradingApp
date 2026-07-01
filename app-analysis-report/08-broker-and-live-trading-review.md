# 08 - Broker and Live Trading Review

## Broker inventory

| Broker | Status |
|---|---|
| Mock | Implemented and used by default |
| Groww | Partial adapter, not integrated into normal market/trade flows |
| Zerodha | Not present in code |
| Angel One | Not present in code |
| Upstox | Not present in code |
| Dhan | Not present in code |
| Fyers | Not present in code |
| Other/crypto | Not present in code |

## Broker abstraction

`backend/src/broker/broker.js` defines the intended interface:

- `status()`
- `connect()`
- `getQuote()`
- `getHistorical()`
- `getMargin()`
- `placeOrder()`
- `getPositions()`

This is a useful design boundary. Only status/connect are exposed by API routes.

## Mock broker

File: `backend/src/broker/mock.js`.

- Always reports connected.
- Generates synthetic quotes/candles.
- Returns configured capital as available margin.
- Simulates immediate fills.
- Returns no positions.
- Never touches a broker account.

The main app's paper engine does not call `MockBroker.placeOrder()`; it uses its
own simulation.

## Groww integration

Files:

- `backend/src/broker/groww.js`
- `backend/src/broker/broker.js`
- `backend/src/config.js`
- Broker status UI in `frontend/src/pages/BrokerSettings.jsx`

### Authentication flow

1. User creates an access token outside the app.
2. User sets `BROKER` and `GROWW_ACCESS_TOKEN` in backend environment.
3. Backend restart creates `GrowwBroker` if both selection and token are present.
4. `status()` calls a profile endpoint using bearer authorization.
5. UI calls `/api/broker/status` or `/api/broker/connect`.

No OAuth redirect, TOTP, token-generation, refresh-token, or token-expiry workflow
exists in the app.

### Endpoint map

The adapter declares profile, margin, historical, quote, order, and positions
paths. Its own source says these are placeholders aligned to a typical REST shape
and must be checked against current Groww documentation.

Therefore:

- Correct Groww URLs: Not confirmed from repository.
- Correct request fields: Not confirmed from repository.
- Correct response normalization: Not confirmed from repository.
- Current entitlement behavior: Not confirmed from repository.

### Market data flow

Although `getQuote()` and `getHistorical()` exist, the following routes do not use
them:

- Watchlist/chart.
- Strategy analysis.
- Paper trading.
- Equity backtesting.
- Live preparation.
- Option chain.
- Straddle builder/backtest/scanner.

They call synthetic generators directly.

### Order flow

`GrowwBroker.placeOrder()`:

- Requires `liveTradingEnabled()`.
- Submits symbol, side, quantity, order type, price, and MIS product.
- Returns normalized order ID/status/fill fields.

However:

- No Express route calls it.
- No React handler calls a submit route.
- No order status poll/reconciliation exists.
- No stop-loss child order is submitted.
- No target order is submitted.
- No cancel/modify flow.
- No position close/recovery flow.
- No margin check before order.
- No exchange/instrument token mapping.

The method is dormant code, not a working live feature.

### Fallback behavior

- If Groww is selected but token is blank, broker factory chooses mock.
- If token is non-empty but invalid, Groww status returns disconnected.
- It does not automatically recreate a mock broker after an invalid token.

README/UI claims of invalid-token fallback are inaccurate.

## Live trading gate

The gate requires:

- Enable flag.
- Live mode.
- Token if broker name is exactly `groww`.

Weakness: if broker is `mock` or an unknown value, mode=live plus enable=true can
make `liveTradingEnabled()` true without real credentials. Current confirm still
cannot execute, but the public status can misleadingly display LIVE ENABLED.

## Live prepare route

`POST /api/live/prepare`:

- Uses synthetic candles.
- Generates a strategy signal.
- Applies score and equity risk validation.
- Returns a confirmation object.
- Audits the preparation.
- Does not call broker quote/margin/order APIs.

The note can say a confirmation will place a real order, but there is no confirm
route. This should be corrected even before live execution is added.

## Paper trading safety

Positive:

- Default mode is paper.
- Mock broker is safe.
- Equity paper engine never calls real broker.
- Straddle features explicitly say paper only.
- Live preparation is non-executing.

Limitations:

- Paper routes change persistent risk counters and history.
- Equity quantity can exceed affordable notional because available margin is infinite.
- Straddle lots are not risk-sized or capped.
- Paper results can look like live metrics in dashboard language.

## Order safety review

| Control | Status |
|---|---|
| Real order placement wired | No |
| Manual confirmation UI | Visual only; no action |
| Mandatory strategy stop | Present in signal data, not a broker stop order |
| Daily loss limit | Equity validation only; straddles bypass it before trade |
| Maximum trades/day | Equity validation only |
| Maximum open trades | Equity validation, but simulations close immediately |
| Consecutive loss breaker | Equity validation only |
| Kill switch | Exists, global, unauthenticated |
| Broker margin check | Not used |
| Capital/notional cap | Not enforced in normal equity/straddle paths |
| Idempotency key | Absent |
| Duplicate-order protection | Absent |
| Order reconciliation | Absent |
| Partial-fill handling | Absent |
| Market-hours validation | Absent |
| Price-band/freeze-quantity validation | Absent |
| Option hedge requirement | Warning only |

## Secret handling

Positive:

- Secrets are read server-side.
- Public config exposes only a configured boolean.
- Request logger excludes bodies.
- Logger redacts secret-like object keys.
- `.env` is ignored by backend Git/Docker rules.
- No hardcoded secret assignments were found outside excluded `.env`.

Risks:

- No external secret manager.
- Local `.env` exists in repository directory.
- Alert messages are logged and can be caller supplied.
- No access controls prevent callers from probing broker status.
- Deployment has no TLS/auth design.

Local secret values and whether they are populated are intentionally not reported.

## Live trading verdict

Real-money auto trading is not implemented.

The repository contains a potentially real Groww POST method, but it is not
reachable through the application. The app is not ready for live trading because
broker endpoints are unverified placeholders, market data remains synthetic,
confirmation is nonfunctional, and essential order/risk/reconciliation controls
are absent.

