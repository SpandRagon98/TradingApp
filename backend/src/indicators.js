// Technical indicators. Pure functions over arrays of numbers / candles.
// A candle is { time, open, high, low, close, volume }.

export function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Full EMA series (same length as input; leading values use SMA seed). */
export function emaSeries(values, period) {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values, period) {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

/** Wilder's RSI over closing prices. Returns 0..100 or null if insufficient data. */
export function rsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Intraday VWAP from a list of candles (cumulative typical-price * volume). */
export function vwap(candles) {
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
  }
  return vol === 0 ? null : pv / vol;
}

/** Average True Range over candles. */
export function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

export function stdev(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/** Bollinger Bands on closes. */
export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const sd = stdev(closes, period);
  if (mid == null || sd == null) return null;
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd, width: (2 * mult * sd) / mid };
}

/** Relative volume: last candle volume vs average of the previous `lookback`. */
export function relativeVolume(candles, lookback = 20) {
  if (candles.length < lookback + 1) return null;
  const recent = candles[candles.length - 1].volume;
  const prior = candles.slice(candles.length - 1 - lookback, candles.length - 1);
  const avg = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
  return avg === 0 ? null : recent / avg;
}

export function percentChange(from, to) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

/**
 * ADX (trend strength) via Wilder's directional movement. Returns the final ADX
 * value plus +DI / -DI so callers can read both strength and direction.
 * ADX < 20 ≈ ranging/choppy; > 25 ≈ trending.
 */
export function adx(candles, period = 14) {
  if (candles.length <= period * 2) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const smooth = (arr) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const out = [s];
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      out.push(s);
    }
    return out;
  };
  const trS = smooth(tr), pS = smooth(plusDM), mS = smooth(minusDM);
  const dx = [];
  let lastPdi = 0, lastMdi = 0;
  for (let i = 0; i < trS.length; i++) {
    const pdi = trS[i] === 0 ? 0 : (100 * pS[i]) / trS[i];
    const mdi = trS[i] === 0 ? 0 : (100 * mS[i]) / trS[i];
    lastPdi = pdi; lastMdi = mdi;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (dx.length < period) return null;
  let adxv = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adxv = (adxv * (period - 1) + dx[i]) / period;
  return { adx: adxv, plusDI: lastPdi, minusDI: lastMdi };
}

/** Classic floor-trader pivot levels from a reference high/low/close. */
export function pivots(high, low, close) {
  const p = (high + low + close) / 3;
  const range = high - low;
  return {
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + range,
    s2: p - range,
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p),
  };
}
