# 02 - Application Overview

## Simple description

This is a paper-first intraday trading assistant for Indian equities/indices and
index-option straddles. It can generate synthetic candles, calculate indicators,
produce rule-based trade signals, size equity paper trades, simulate outcomes,
run synthetic backtests, build option chains, estimate Greeks, simulate long or
short straddles, and record paper results.

It is primarily an educational analysis and simulation application. It is not a
verified live trading platform.

## What kind of trading app is it?

| Use case | Current status |
|---|---|
| Manual analysis | Implemented with strategy analysis and explanatory factors |
| Manual trading | No real broker order workflow; paper simulation only |
| Semi-automated trading | Partially represented by signal preparation and a confirmation UI |
| Automated trading | Not implemented end to end |
| Strategy analysis | Implemented against synthetic data |
| Equity backtesting | Implemented against synthetic data |
| Options/straddle backtesting | Implemented against a custom synthetic model |
| Paper trading | Implemented for equity strategies and straddles |
| Live trading | Adapter method exists, but no public execution route or working confirm action |
| Portfolio tracking | Not implemented |
| Signals | Implemented for ten equity strategies |
| Alerts | Implemented in-app/WebSocket, optional Telegram/SMTP |
| Watchlist | Implemented with persistent symbols and synthetic quotes |
| Trade journal | Implemented as free-text notes linked optionally to trade IDs |

## Data reality

The main application does not currently use live exchange data for charts,
signals, backtests, option chains, or straddles.

- Equity candles come from `backend/src/marketdata/candles.js`.
- Option prices/OI/IV are generated in `backend/src/options/option_chain.js`.
- Straddle paths are generated in `backend/src/options/straddle_engine.js`.
- The Groww adapter is not connected to these application flows.

Therefore, labels such as "LTP", "live", "option chain", "support", "resistance",
"PCR", "max pain", and "win rate" describe simulated outputs unless the code is
later rewired to broker/exchange data.

## Current operating modes

The code defines `paper` and `live` configuration modes. Paper is the safe default.
The live flag uses a triple-gate:

1. `ENABLE_LIVE_TRADING` must be true.
2. `TRADING_MODE` must be `live`.
3. A Groww access token is required only when the selected broker is `groww`.

Even when this function returns true, the current API only supports
`POST /api/live/prepare`. It creates a confirmation payload but never calls
`GrowwBroker.placeOrder()`. The React confirm button has no click handler.

Conclusion: real-money auto trading is not implemented.

## What works now

- Startable Express backend.
- Startable/buildable React frontend.
- Static fallback dashboard at backend root.
- Ten 5-minute equity/indices strategy modules.
- Score gate with human-readable supporting and warning factors.
- Equity position sizing by configured risk percentage and stop distance.
- Equity paper simulation with stop, target, end-of-session, brokerage, and slippage.
- Synthetic equity backtests with standard summary metrics.
- Synthetic option chain and Black-Scholes Greeks.
- Long/short ATM straddle builder.
- Straddle paper simulation with combined stop, target, per-leg stop, optional
  trailing stop, and time exit.
- Manual 9:20 short-straddle scanner simulation.
- SQLite or JSON persistence.
- Risk counters and kill switch.
- Watchlist, journal, reports, settings, alerts, and WebSocket status.
- Optional Telegram and email alert delivery.

## What does not work or is absent

- No login, signup, users, roles, permissions, or sessions.
- No verified live market-data stream.
- No real broker-backed chart, watchlist quote, strategy signal, or backtest.
- No live order confirm endpoint.
- No working live-order button.
- No order-status reconciliation, fills, cancel/modify, positions, holdings, or
  broker ledger screens.
- No live option-chain adapter.
- No hedged short-straddle execution.
- No broker margin enforcement.
- No portfolio-level risk or capital allocation by strategy.
- No scheduled scanner or background trading job.
- No proven win rate.
- No admin controls.
- No Zerodha, Angel One, Upstox, Dhan, Fyers, or crypto integration.

## User-level purpose

The safest intended use is:

1. Inspect synthetic charts and strategy rules.
2. Analyze why a signal is accepted or rejected.
3. Run paper simulations.
4. Compare synthetic strategy behavior.
5. Practice risk settings and journaling.
6. Treat all performance as model output, not expected real returns.

## Honest classification

The application is a functional simulation prototype with a broad UI and several
well-separated engines. It is more complete than a static mockup, but less complete
than the README's feature checklist suggests because the live broker, live data,
and live execution paths are not wired into normal application use.

Production readiness: Not confirmed from repository.

