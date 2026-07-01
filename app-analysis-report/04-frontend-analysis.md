# 04 - Frontend Analysis

## Frontend architecture

The primary UI is a React single-page application:

- Entry: `frontend/src/main.jsx`.
- Router: `frontend/src/App.jsx`.
- Shared shell: `frontend/src/components/Layout.jsx`.
- Shared state: `frontend/src/store/AppContext.jsx`.
- REST wrapper: `frontend/src/services/api.js`.
- WebSocket singleton: `frontend/src/services/ws.js`.
- Styling: one global CSS file.

There is also a separate vanilla JavaScript dashboard under `backend/public`.
The root `StraddleTrading.jsx` is a third UI artifact, but it is disconnected.

## React pages and routes

| Route | Screen | Purpose |
|---|---|---|
| `/` | Dashboard | Risk status, alerts, recent equity paper trades |
| `/watchlist` | Watchlist | Synthetic quote table and candle chart |
| `/strategies` | Strategies | Catalogue, enable toggles, signal analysis |
| `/paper` | Paper Trading | Run equity paper simulation and view equity trades |
| `/backtest` | Backtesting | Run synthetic equity strategy backtest |
| `/live` | Live Trading | Prepare a live-looking confirmation preview |
| `/options` | Options Dashboard | Synthetic chain summary, straddle area, alerts |
| `/options/chain` | Option Chain | Full synthetic option chain |
| `/straddle` | Straddle Builder | Build or paper-simulate long/short straddle; scanner |
| `/straddle/backtest` | Straddle Backtest | Synthetic straddle performance |
| `/straddle/monitor` | Live Straddle Monitor | Intended straddle history and alerts |
| `/journal` | Trade Journal | Notes and all persisted trades |
| `/reports` | Reports | Basic equity paper performance |
| `/risk` | Risk Settings | Edit global risk overrides |
| `/broker` | Broker Settings | Adapter status and Groww setup instructions |
| `*` | Dashboard | Unknown paths silently render Dashboard |

No login screen or protected route exists.

## Typical user journey

1. Open React app on port 5180.
2. AppProvider loads `/config`, `/risk/status`, and `/alerts`.
3. WebSocket connects to `/ws`.
4. User reviews dashboard and kill-switch state.
5. User selects a symbol/strategy on Strategies.
6. `POST /strategies/run` returns a synthetic signal, score, and risk preview.
7. User can run a paper trade or backtest.
8. Paper trades are persisted and appear in equity tables/reports.
9. Options user can inspect a generated chain, build a straddle, simulate it, or
   run a synthetic straddle backtest.
10. Journal notes can be added manually.

## Shared components

| Component | Function |
|---|---|
| `Layout` | Sidebar, top bar, mode/broker/storage badges, kill switch |
| `Chart` | Lightweight Charts candlestick rendering |
| `SignalCard` | Signal, score, factors, entry/SL/target, risk verdict |
| `TradeTable` | Equity or straddle row renderer |
| `OptionChainTable` | CE/PE OI, IV, LTP around strikes |
| `StraddleCard` | Builder Greeks or paper-trade result |
| `AlertsFeed` | Shared real-time alert list |
| `KillSwitchButton` | Confirmed activation, unconfirmed release |
| `ConfirmTradeModal` | Live-preparation preview |
| `ui.jsx` | Cards, fields, buttons, metrics, formatters, bar chart |

## State management

Global Context stores:

- Public config.
- Risk state.
- Alert list.
- WebSocket connection status.

Local page state stores forms and results. There is no Redux/Zustand/query cache.
REST data is often loaded once per page, with no cancellation or stale-response
protection.

The WebSocket only handles `type: "alert"` messages. Risk status is refreshed
after alerts and every 15 seconds. It is not a live market feed.

## Frontend API calls

| Screen/module | API calls |
|---|---|
| AppContext | `GET /config`, `/risk/status`, `/alerts`; `POST /live/kill-switch` |
| Dashboard | `GET /paper/trades`, `/disclaimer` |
| useMeta | `GET /market/symbols`, `/strategies` |
| Watchlist | `GET/POST /watchlist`, `GET /market/candles` |
| Strategies | `GET /strategies`, `POST /strategies/enable`, `/disable`, `/run` |
| Paper Trading | `POST /paper/run`, `GET /paper/trades` |
| Backtesting | `POST /backtest/run` |
| Live Trading | `POST /live/prepare` |
| Options Dashboard | `GET /options/chain`, `/paper/trades` |
| Option Chain | `GET /options/chain` |
| Straddle Builder | `POST /options/straddle/build`, `/paper`, `/scanner` |
| Straddle Backtest | `POST /options/straddle/backtest` |
| Straddle Monitor | `GET /paper/trades` |
| Journal | `GET /journal`, `POST /journal/note` |
| Reports | `GET /paper/trades` |
| Risk Settings | `GET /risk/status`, `POST /risk/settings` |
| Broker Settings | `GET /broker/status`, `POST /broker/connect` |

The single-option Greeks API and alerts test API have no React page controls.

## Confirmed frontend/backend mismatches

### 1. Straddle history screens cannot load straddles

Backend `/paper/trades` filters `mode: "paper"` at
`backend/src/api/routes.js:127`. Options Dashboard and Live Straddle Monitor then
try to filter that already-filtered response for `mode: "paper-straddle"`:

- `frontend/src/pages/OptionsDashboard.jsx:21-22`
- `frontend/src/pages/LiveStraddleMonitor.jsx:12`

Result: those screens remain empty even when SQLite contains straddle trades.

### 2. Live confirmation cannot place an order

`ConfirmTradeModal.jsx` renders "Confirm & place order", but the button has no
`onClick`. The backend has no `/live/confirm` or order submission route.

The UI text stating that confirmation "will place a REAL order" is false for the
current code.

### 3. Strategy Off toggle is not enforced

The UI changes in-memory registry state. All execution endpoints select strategies
with `getStrategy()` without checking `isEnabled()`. An Off strategy can still be
analyzed, paper-traded, and backtested.

### 4. Capital KPI can become stale

Dashboard uses `config.risk.capital` at `Dashboard.jsx:19`, which reflects
environment defaults. Risk Settings saves overrides in database settings, exposed
through `risk.limits`, not `publicConfig().risk`. After saving a new capital value,
the detailed risk state changes while the headline capital can remain old.

### 5. Groww fallback instructions are inaccurate

Broker Settings says missing/invalid credentials automatically fall back to mock.
Missing token does select mock during broker creation. An invalid non-empty token
creates a Groww adapter that reports disconnected; it does not switch to mock.

## Other UI issues and missing states

- Many calls ignore non-OK results, including watchlist persistence, broker
  connection, kill switch, and journal save.
- `LiveTrading` uses browser `alert()` instead of an app error component.
- No loading skeleton or retry strategy at the app level.
- No route-level error boundary.
- No 404 page; unknown URLs silently show Dashboard.
- No authentication or user-specific data isolation.
- No confirmation when releasing the kill switch.
- Risk number fields have no useful min/max bounds.
- Strategy list and metadata load errors can leave empty selectors.
- Options Dashboard index changes require a separate Refresh click.
- Tables have no horizontal overflow wrapper in the primary React UI.
- Mobile CSS collapses main grids but the top bar/sidebar/tables can still overflow.
- Bar charts normalize each series to its own min/max and do not show axes,
  timestamps, or zero line; they can visually overstate small changes.
- Reports use rounded integer display, hiding paise/decimals.
- Alerts have no read/dismiss/clear action.
- Journal trade ID is free text instead of a trade selector.
- No accessibility labels beyond visible field text; no focus management in modal.
- Modal backdrop closes on click but Escape-key handling is absent.

## Static fallback dashboard

`backend/public` provides:

- Strategy analysis.
- Equity paper trade.
- 30-session equity backtest.
- Risk panel and kill switch.
- Equity paper trades.
- Synthetic option chain.
- Straddle builder/paper/backtest/scanner.
- Alerts and WebSocket status.

It does not provide the full 15-page management experience. It uses string-built
`innerHTML` extensively. Most strings come from trusted engine output, but the
pattern is less robust than React escaping and would require care if free-form user
or broker content is introduced.

It also shows a "Win rate" KPI in HTML, but `app.js` never populates
`kpi-winrate`, so that KPI remains the placeholder.

## Root standalone prototype

`StraddleTrading.jsx`:

- Generates a fixed array of mock 2024 Thursday trades.
- Presents an "AI Backtester" label but contains no AI/model integration.
- Changes mock outcomes using configuration formulas.
- Includes configurable DEMA, RSI, MACD, VWAP, target, stop, no-move, and time rules.
- Is not imported by `frontend/src/App.jsx`.
- Imports `lucide-react`, which is not in the frontend package.
- Depends on Tailwind utility classes, but Tailwind is not configured here.

It should be treated as a design/prototype artifact, not a functioning app page
or evidence of real 2024 results.

## Frontend verdict

The primary React app builds successfully and its paper/synthetic pages are
generally coherent. The biggest user-facing problems are the broken straddle
history screens, misleading live-order copy, nonfunctional confirm action,
unenforced strategy toggles, and lack of authentication/error hardening.

