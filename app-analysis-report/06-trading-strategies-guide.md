# 06 - Trading Strategies Guide

## Shared strategy framework

All ten registered equity strategies:

- Use a declared 5-minute timeframe.
- Operate on generated OHLCV candles.
- Can return BUY, SHORT, or NO_TRADE.
- Supply entry, stop, target, confidence, reason, and calculated R:R.
- Are intended for intraday use.
- Work with the sample Indian indices and stocks because the engine is
  symbol-agnostic and has Indian sample base prices.
- Do not place orders.

After a strategy signals:

1. Score starts at 40.
2. R:R, confidence, VWAP distance, relative volume, and short-term trend adjust it.
3. A score of at least 70 is required for paper eligibility.
4. Equity risk validation applies configured limits and computes quantity.

The score is a hand-built heuristic, not a machine-learning probability.

## 1. Momentum

- File: `backend/src/strategies/momentum.js`.
- Instrument: synthetic stocks or indices.
- Timeframe: 5 minutes.
- Indicators: EMA 9/21, RSI 14, relative volume, VWAP, ATR 14.
- Long entry: EMA9 above EMA21, price above VWAP, RSI 55-72, relative volume at
  least 1.3, positive recent change, and no more than 1.5% from VWAP.
- Short entry: inverse trend, RSI 28-45, price below VWAP, volume confirmation.
- Stop: 1.2 ATR from entry.
- Target: 2.4 ATR from entry.
- Intended R:R: 2:1.
- Trailing stop: none.
- Position sizing: later equity risk engine.
- Style: intraday trend/momentum.

Beginner explanation: it waits for price, trend, momentum, and volume to agree,
then trades in that direction without chasing a very stretched price.

## 2. Opening Range Breakout (ORB)

- File: `backend/src/strategies/orb.js`.
- Timeframe: 5 minutes.
- Opening range: first 6 candles, approximately 30 minutes.
- Long entry: latest candle closes above opening-range high with relative volume
  at least 1.2.
- Short entry: latest close below opening-range low with volume.
- Range filter: rejects below 0.2% or above 2.5%.
- Stop: opposite side of opening range.
- Target: 2 times entry risk.
- Intended R:R: 2:1.
- Trailing stop: none.

Beginner explanation: it marks the early high and low, then trades only when price
breaks out with stronger volume.

## 3. VWAP bounce/rejection

- File: `backend/src/strategies/vwap.js`.
- Indicators: VWAP, EMA20, ATR14.
- Long entry: previous candle dips near/below VWAP, latest closes above VWAP, and
  price is above EMA20.
- Short entry: previous candle reaches VWAP from below, latest closes below it,
  and price is below EMA20.
- Stretch filter: skips if more than 1.2% from VWAP.
- Long stop: below prior low/VWAP by 0.3 ATR.
- Short stop: above prior high/VWAP by 0.3 ATR.
- Target: 2R.
- Trailing stop: none.

Beginner explanation: VWAP is treated as intraday fair value. The strategy trades
a bounce above it or rejection below it rather than chasing far away.

## 4. Swing Breakout

- File: `backend/src/strategies/breakout.js`.
- Indicators: 20-bar swing high/low, relative volume, ATR.
- Base range excludes the two newest test bars.
- Long entry: latest close above resistance with relative volume at least 1.3.
- Short entry: latest close below support with volume.
- Stop: 0.3 ATR inside the broken level.
- Target: 2R.
- Trailing stop: none.

Beginner explanation: it finds recent support/resistance and trades a confirmed,
high-volume close outside the range.

## 5. Moving Average Crossover

- File: `backend/src/strategies/ma_crossover.js`.
- Indicators: fast/slow EMA, ADX14, VWAP, ATR14.
- Defaults: EMA9 and EMA21.
- Long entry: a fresh upward crossover on the last bar, ADX at least 18, and price
  above VWAP.
- Short entry: fresh downward crossover, ADX at least 18, price below VWAP.
- Stop: 1.5 ATR.
- Target: 3 ATR.
- Intended R:R: 2:1.
- Trailing stop: none.

Beginner explanation: it tries to catch the exact bar where a faster average
crosses a slower one, but avoids weak sideways conditions.

## 6. Mean Reversion

- File: `backend/src/strategies/mean_reversion.js`.
- Indicators: RSI14, Bollinger Bands 20/2, ADX14, ATR14.
- Long entry: RSI below 33, price near/below lower band, bullish reversal candle,
  ADX below 28.
- Short entry: RSI above 67, price near/above upper band, bearish reversal candle,
  ADX below 28.
- Stop: 0.5 ATR beyond latest low/high.
- Target: Bollinger middle band.
- R:R: variable; global risk gate can reject it if below configured minimum.
- Trailing stop: none.

Beginner explanation: it buys an oversold bounce or shorts an overbought rejection,
but only when the market is not strongly trending.

## 7. Gap and Go

- File: `backend/src/strategies/gap_and_go.js`.
- Indicators: previous-close gap, first 3 candles, relative volume.
- Gap filter: absolute gap between 0.4% and 3%.
- Long entry: gap up, price above opening-range high, volume at least 1.2.
- Short entry: gap down, price below opening-range low, volume at least 1.2.
- Stop: opposite side of the 15-minute opening range.
- Target: 2R.
- Trailing stop: none.

Beginner explanation: it looks for a meaningful opening gap that keeps moving in
the same direction instead of immediately reversing.

Important: previous close is synthetically inferred, not loaded from an exchange.

## 8. Open=High / Open=Low

- File: `backend/src/strategies/ohl.js`.
- Opening candle: first 3 five-minute candles combined.
- Tolerance: approximately 0.08% around open.
- Long entry: opening open is near opening low, later price breaks opening high,
  and price is above VWAP.
- Short entry: opening open is near opening high, price breaks opening low, and
  price is below VWAP.
- Stop: opening low/high.
- Target: 2R.
- Trailing stop: none.

Beginner explanation: if the market never trades much below its opening price, it
suggests bullish control; the inverse suggests bearish control.

## 9. Pullback

- File: `backend/src/strategies/pullback.js`.
- Indicators: EMA9, EMA21, EMA50, ATR14.
- Long trend: EMA9 > EMA21 > EMA50.
- Long entry: recent price touches near EMA21, then latest bullish candle closes
  above the prior high.
- Short trend: inverse EMA stack.
- Short entry: pullback near EMA21, then bearish continuation below prior low.
- Stop: recent swing plus/minus 0.3 ATR.
- Target: 2R.
- Trailing stop: none.

Beginner explanation: it does not chase a trend. It waits for a small retracement
and then joins when the trend appears to resume.

## 10. Pivot Point

- File: `backend/src/strategies/pivot.js`.
- Indicators: classic floor pivots and relative volume.
- Reference: first 60% of available candles, not a true previous daily session.
- Long entry: fresh cross above R1 with relative volume at least 1.2.
- Stop: central pivot P.
- Target: R2.
- Short entry: fresh cross below S1 with volume.
- Stop: P.
- Target: S2.
- R:R: depends on entry and levels; risk gate may reject below minimum.
- Trailing stop: none.

Beginner explanation: it uses calculated support/resistance levels and trades a
fresh, volume-backed break of the first level.

## Long ATM straddle

Implemented in:

- Builder: `backend/src/options/straddle.js`.
- Paper engine: `backend/src/options/straddle_engine.js`.
- Backtest: `backend/src/options/straddle_backtest.js`.

Structure: buy one ATM call and one ATM put at the same strike/expiry.

- Profit idea: a large move in either direction raises one option enough to cover
  the premium paid.
- Loss: limited to debit plus modeled costs.
- Builder default suggested stop: 30% combined-premium loss.
- Builder default suggested target: 40%.
- Paper engine default target: 25%, stop: 30%.
- Exit: target, combined stop, optional trailing stop, or time exit.
- Theta: negative; time decay hurts.
- Vega: positive; higher IV helps.
- Position sizing: lots x lot size, not capital-risk-sized.

## Short ATM straddle

Structure: sell one ATM call and one ATM put.

- Profit idea: price stays near strike and premiums decay.
- Max profit: premium received.
- Max loss: theoretically unlimited when unhedged.
- Paper default combined target: 25% premium reduction.
- Paper default combined stop: 30% premium increase.
- Per-leg catastrophe stop: 80% by default.
- Optional trailing stop.
- Theta: positive.
- Vega and gamma: negative.
- Margin estimate: rough 12% of spot x quantity, not broker verified.
- Live use: not implemented.

The generated path deliberately includes range, mild-trend, and strong-trend
regimes. This design directly influences the simulated win rate.

## 9:20 short-straddle scanner

- Manual endpoint, not a scheduled scanner.
- Default entry: 09:20.
- Default exit: 15:00.
- Combined stop: 30%.
- Target: 25%.
- Per-leg stop: 50%.
- Trailing stop: 10%.
- Paper only.
- Does not persist or update risk counters.

## Disconnected expiry-day long-straddle prototype

Root `StraddleTrading.jsx` describes:

- NIFTY ATM long straddle.
- Thursdays in mock 2024 data.
- Spot near VWAP.
- Flat DEMA slope.
- Neutral RSI.
- Small MACD histogram.
- Configurable target, stop, no-move, time stop, costs, and lot size.

It does not consume actual candles or call the backend. Its trade history is
generated from hardcoded seed objects, so it is not an implemented production
strategy and not valid performance evidence.

## Strategies not found

- Strangle: absent.
- Iron fly/iron condor: only mentioned as a hedge suggestion, not implemented.
- Options breakout: absent.
- Dedicated scalping strategy: absent.
- Crypto strategy: absent.
- Futures-specific strategy: absent.
- Pairs/statistical arbitrage: absent.
- Machine-learning/AI strategy: absent.
- Positional/swing holding across days: absent.

## Strategy safety summary

All equity strategy exits are simulated, not broker stop orders. No equity
trailing stop exists. Straddles have richer simulated exits but bypass the main
risk sizing gate. Strategy rules are understandable and testable, but their
effectiveness on real Indian market data is Not confirmed from repository.

