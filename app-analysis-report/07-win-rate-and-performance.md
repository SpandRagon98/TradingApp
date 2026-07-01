# 07 - Win Rate and Performance

## Required conclusion

**Win rate cannot be confirmed from the current repository because no verified trade history/backtest result was found.**

The repository contains small stored paper samples and deterministic synthetic
backtest engines. Those allow descriptive calculations, but they do not prove a
real-world win rate.

## Evidence categories

| Evidence | Exists? | Trust level |
|---|---|---|
| Broker-verified live fills | No | Not available |
| Real historical market backtest | No | Not available |
| Exported broker trade book | No | Not available |
| SQLite paper trades | Yes, 3 | Tiny synthetic sample |
| JSON paper trades | Yes, 4 | Tiny alternate synthetic sample |
| Equity synthetic backtest engine | Yes | Model behavior only |
| Straddle synthetic backtest engine | Yes | Model behavior only |
| Root mock 2024 trade list | Yes | Hardcoded/generated UI fixture |

## Stored SQLite sample

Read-only aggregate of `backend/data/trading.db`:

| Metric | Value |
|---|---:|
| Trade mode | `paper-straddle` only |
| Total trades | 3 |
| Profitable trades | 2 |
| Losing trades | 1 |
| Descriptive win rate | 66.67% |
| Loss rate | 33.33% |
| Net P&L | -209.01 |
| Average profit | 1,768.68 |
| Average loss | 3,746.37 |
| Profit factor | 0.94 |
| Maximum drawdown | 3,746.37 |

Interpretation: two wins out of three sounds strong, but one larger loss erased
the wins. This illustrates why win rate alone is inadequate.

The records were created by the application's paper-straddle route, which always
uses a generated underlying path and Black-Scholes repricing. They are not live.

## Stored JSON sample

Aggregate of alternative/fallback `backend/data/store.json`:

### Equity paper

| Metric | Value |
|---|---:|
| Total | 1 |
| Wins | 1 |
| Losses | 0 |
| Descriptive win rate | 100% |
| Net P&L | 544.39 |

One trade has no statistical meaning.

### Paper straddles

| Metric | Value |
|---|---:|
| Total | 3 |
| Wins | 1 |
| Losses | 2 |
| Descriptive win rate | 33.33% |
| Net P&L | 2,442.71 |
| Average win | 3,233.04 |
| Average loss | 395.17 |
| Profit factor | 4.09 |
| Maximum drawdown | 790.33 |

### Combined JSON records

| Metric | Value |
|---|---:|
| Total | 4 |
| Wins | 2 |
| Losses | 2 |
| Descriptive win rate | 50% |
| Net P&L | 2,987.10 |
| Average win | 1,888.71 |
| Average loss | 395.17 |
| Profit factor | 4.78 |
| Maximum drawdown | 790.33 |

SQLite and JSON are separate stores. They must not be combined as one account
history because switching `STORAGE` selects one implementation.

## Deterministic audit simulation

The audit ran the existing engines in an isolated copy with default configuration.
These numbers show current code behavior only.

### Equity: NIFTY, 5-minute, 30 synthetic sessions

| Strategy | Trades | Win rate | Net P&L | Profit factor | Max drawdown |
|---|---:|---:|---:|---:|---:|
| Momentum | 3 | 33.33% | -508.13 | 0.60 | 1,260.66 |
| OpeningRangeBreakout | 2 | 100% | 1,078.39 | Infinite/no losses | 0 |
| VWAP | 3 | 66.67% | 1,124.28 | 3.13 | 528.65 |
| Breakout | 1 | 0% | -651.24 | 0 | 651.24 |
| MACrossover | 0 | 0% | 0 | 0 | 0 |
| MeanReversion | 0 | 0% | 0 | 0 | 0 |
| GapAndGo | 0 | 0% | 0 | 0 | 0 |
| OpenHighOpenLow | 0 | 0% | 0 | 0 | 0 |
| Pullback | 5 | 100% | 3,002.60 | Infinite/no losses | 0 |
| PivotPoint | 0 | 0% | 0 | 0 | 0 |

These samples are too sparse. A 100% rate from two or five generated trades is
not evidence of an edge. Five strategies produced no eligible trade at all for
this specific deterministic 30-session sample.

### Straddles: NIFTY, one day to expiry, 40 synthetic sessions

| Type | Trades | Win rate | Net P&L | Profit factor | Max drawdown |
|---|---:|---:|---:|---:|---:|
| Short ATM straddle | 40 | 67.5% | 12,737.52 | 1.35 | 13,713.83 |
| Long ATM straddle | 40 | 32.5% | 3,231.65 | 1.06 | 15,744.93 |

These results are heavily determined by the engine's explicit regime mix:
approximately 55% range-bound, 25% mild trend, and 20% strong trend. The model
was intentionally designed so short straddles often win small and sometimes lose
large. The result therefore validates the model's internal behavior, not a market
edge.

## Metrics implemented by code

Equity and straddle backtests calculate:

- Total trades.
- Wins and losses.
- Win rate.
- Net P&L.
- Average win.
- Average loss.
- Profit factor.
- Maximum drawdown.
- Maximum consecutive losses.
- Total modeled costs.
- Equity curve.

Straddle backtest also calculates:

- Average MAE.
- Average MFE.
- P&L by weekday.
- P&L by exit reason.

Equity trade objects include strategy R:R. Straddle R:R is not represented as a
fixed ratio because premium exits are percentage based and short risk is unlimited.

## Signal accuracy

Signal accuracy cannot be calculated:

- Stored signals are not linked to a later outcome ID.
- SQLite currently contains no signal rows.
- JSON signals do not include realized outcome.
- NO_TRADE opportunity cost is not measured.
- There is no confusion matrix or benchmark.

## Important backtest limitations

1. All price history is generated.
2. Symbol base prices and volatility are hardcoded.
3. No actual exchange calendar/holidays.
4. No corporate actions.
5. No survivorship or selection-bias controls.
6. No real spreads, depth, impact, rejected fills, partial fills, or latency.
7. Costs omit STT, exchange fees, GST, stamp duty, and other India-specific charges.
8. Equity sizing ignores available margin.
9. Backtests do not enforce daily-loss, trades/day, open-trade, or consecutive-loss rules.
10. One maximum trade is considered per synthetic session.
11. Stop is checked before target when both could be touched in one candle,
    introducing a conservative but arbitrary intrabar assumption.
12. Straddle IV is fixed through the session; no IV crush/expansion dynamics.
13. Straddles are unhedged.
14. Option-chain OI/PCR/max-pain values are generated.
15. No walk-forward, out-of-sample, Monte Carlo, or parameter sensitivity study.
16. No statistical confidence intervals.

## How to interpret win rate correctly

A credible strategy review should consider:

- At least hundreds of independent real-data trades across regimes.
- Net results after all costs.
- Average win versus average loss.
- Profit factor.
- Maximum and percentage drawdown.
- Longest losing streak.
- Exposure and capital requirements.
- Slippage sensitivity.
- Out-of-sample results.
- Forward paper trading.
- Broker reconciliation.

For example, the SQLite sample has a 66.67% win rate but negative P&L because the
average loss exceeds the average win. That is a more useful lesson than the raw
percentage.

## Performance verdict

No strategy has a proven win rate. The repository demonstrates how to compute
performance metrics, but all current evidence is simulated, mocked, tiny, or
generated by assumptions encoded in the same program being evaluated.

