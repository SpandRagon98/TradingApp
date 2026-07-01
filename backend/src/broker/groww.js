// Groww broker adapter — OFFICIAL API ONLY.
//
// Verified against the Groww Trading API docs (groww.in/trade-api/docs):
//   base:    https://api.groww.in/v1
//   headers: Authorization: Bearer <ACCESS_TOKEN>, X-API-VERSION: 1.0
//
// Endpoints used (all documented):
//   POST /order/create | /order/modify | /order/cancel
//   GET  /order/list | /order/detail/{id} | /order/status/{id} | /order/trades/{id}
//   GET  /positions/user | /positions/trading-symbol | /holdings/user
//   GET  /margins/detail/user        POST /margins/detail/orders
//   GET  /live-data/quote | /live-data/ltp | /live-data/ohlc
//   GET  /historical/candle/range
//   GET  /option-chain/exchange/{ex}/underlying/{u}
//   GET  /live-data/greeks/...
//
// SAFETY: placeOrder/modifyOrder/cancelOrder are hard-gated by liveTradingEnabled().
// The token is read fresh per request from groww_auth (so refreshes are picked up)
// and is NEVER logged. Network/entitlement failures throw typed errors the route
// layer reports cleanly instead of crashing.

import { config, liveTradingEnabled } from '../config.js';
import { getAccessToken } from './groww_auth.js';

class GrowwApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GrowwApiError';
    this.code = code || 'GROWW_API_ERROR';
  }
}

// Map our candle intervals to Groww's supported interval_in_minutes.
const SUPPORTED_MIN = [1, 5, 10, 60, 240, 1440, 10080];
function intervalToMinutes(interval) {
  const m = String(interval).match(/^(\d+)\s*(m|min|h|hour|d|day|w|week)?/i);
  if (!m) return 5;
  let mins = Number(m[1]);
  const unit = (m[2] || 'm').toLowerCase();
  if (unit.startsWith('h')) mins *= 60;
  else if (unit.startsWith('d')) mins *= 1440;
  else if (unit.startsWith('w')) mins *= 10080;
  // snap to nearest supported value
  return SUPPORTED_MIN.reduce((best, v) => (Math.abs(v - mins) < Math.abs(best - mins) ? v : best), 5);
}

const fmtTime = (d) => {
  // "yyyy-MM-dd HH:mm:ss"
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export class GrowwBroker {
  constructor(cfg) {
    this.name = 'groww';
    this.config = cfg;
    this.base = cfg.groww.base.replace(/\/$/, '');
    this.defExchange = cfg.groww.defaultExchange || 'NSE';
    this.defSegment = cfg.groww.defaultSegment || 'CASH';
    this.defProduct = cfg.groww.defaultProduct || 'MIS';
  }

  async #request(path, { method = 'GET', query, body } = {}) {
    const token = getAccessToken();
    if (!token) throw new GrowwApiError('Groww access token not available. Connect the broker first.', 'NOT_CONFIGURED');
    const url = new URL(this.base + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-API-VERSION': this.config.groww.apiVersion,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
      });
    } catch (err) {
      throw new GrowwApiError(`Network error contacting Groww: ${err.code || err.name}`, 'NETWORK');
    }
    if (res.status === 401 || res.status === 403) {
      throw new GrowwApiError('Groww auth rejected (token invalid/expired/not entitled).', 'AUTH');
    }
    if (res.status === 429) throw new GrowwApiError('Groww rate limit hit.', 'RATE_LIMIT');
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === 'FAILURE') {
      throw new GrowwApiError(json.error?.message || json.message || `Groww API ${res.status}`, 'HTTP_' + res.status);
    }
    // Most endpoints wrap useful data under `payload`.
    return json.payload !== undefined ? json.payload : json;
  }

  #seg(s) {
    return (s || this.defSegment).toUpperCase();
  }
  #ex(e) {
    return (e || this.defExchange).toUpperCase();
  }

  // ── Connectivity ──────────────────────────────────────────────────────────
  async status() {
    try {
      await this.#request('/margins/detail/user'); // documented; doubles as a token check
      return { connected: true, broker: 'groww', mode: this.config.mode, detail: 'Connected to Groww API.' };
    } catch (err) {
      return { connected: false, broker: 'groww', mode: this.config.mode, detail: err.message, code: err.code };
    }
  }
  async connect() {
    const s = await this.status();
    return { connected: s.connected, detail: s.detail };
  }

  // ── Market data ─────────────────────────────────────────────────────────────
  async getQuote(symbol, { exchange, segment } = {}) {
    const data = await this.#request('/live-data/quote', {
      query: { exchange: this.#ex(exchange), segment: this.#seg(segment), trading_symbol: symbol },
    });
    return {
      symbol,
      ltp: data.last_price ?? null,
      bid: data.bid_price ?? null,
      ask: data.offer_price ?? null,
      volume: data.volume ?? null,
      dayChange: data.day_change ?? null,
      dayChangePerc: data.day_change_perc ?? null,
      ohlc: data.ohlc ?? null,
      depth: data.depth ?? null,
      time: new Date().toISOString(),
    };
  }

  /** Batch last-traded-price. symbols: string[]; returns { SYMBOL: ltp }. */
  async getLtp(symbols, { exchange, segment } = {}) {
    const ex = this.#ex(exchange);
    const list = (Array.isArray(symbols) ? symbols : [symbols]).slice(0, 50);
    const exchange_symbols = list.map((s) => `${ex}_${s}`).join(',');
    const data = await this.#request('/live-data/ltp', { query: { segment: this.#seg(segment), exchange_symbols } });
    const out = {};
    for (const s of list) out[s] = data[`${ex}_${s}`] ?? null;
    return out;
  }

  async getOhlc(symbols, { exchange, segment } = {}) {
    const ex = this.#ex(exchange);
    const list = (Array.isArray(symbols) ? symbols : [symbols]).slice(0, 50);
    const exchange_symbols = list.map((s) => `${ex}_${s}`).join(',');
    const data = await this.#request('/live-data/ohlc', { query: { segment: this.#seg(segment), exchange_symbols } });
    const out = {};
    for (const s of list) out[s] = data[`${ex}_${s}`] ?? null;
    return out;
  }

  async getHistorical(symbol, { interval = '5m', count = 75, start, end, exchange, segment } = {}) {
    const minutes = intervalToMinutes(interval);
    const to = end ? new Date(end) : new Date();
    let from;
    if (start) from = new Date(start);
    else {
      // Cover `count` candles allowing for non-market hours (~375 trading min/day).
      const days = Math.ceil((count * minutes) / 375) + 2;
      from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    }
    const data = await this.#request('/historical/candle/range', {
      query: {
        exchange: this.#ex(exchange),
        segment: this.#seg(segment),
        trading_symbol: symbol,
        start_time: fmtTime(from),
        end_time: fmtTime(to),
        interval_in_minutes: minutes,
      },
    });
    const rows = data.candles || [];
    const candles = rows.map((r) => ({
      time: new Date((r[0] > 1e12 ? r[0] : r[0] * 1000)).toISOString(),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5] ?? 0),
    }));
    return count ? candles.slice(-count) : candles;
  }

  // ── Options ──────────────────────────────────────────────────────────────────
  async getOptionChain(underlying, { exchange = 'NSE', expiry } = {}) {
    const q = expiry ? { query: { expiry_date: expiry } } : {};
    return this.#request(`/option-chain/exchange/${exchange}/underlying/${encodeURIComponent(underlying)}`, q);
  }

  async getGreeks(underlying, tradingSymbol, expiry, { exchange = 'NSE' } = {}) {
    return this.#request(
      `/live-data/greeks/exchange/${exchange}/underlying/${encodeURIComponent(underlying)}/trading_symbol/${encodeURIComponent(tradingSymbol)}/expiry/${expiry}`,
    );
  }

  // ── Margin ───────────────────────────────────────────────────────────────────
  async getMargin() {
    const data = await this.#request('/margins/detail/user');
    return {
      available: data.clear_cash ?? 0,
      used: data.net_margin_used ?? 0,
      collateralAvailable: data.collateral_available ?? 0,
      collateralUsed: data.collateral_used ?? 0,
      adhoc: data.adhoc_margin ?? 0,
      brokerageAndCharges: data.brokerage_and_charges ?? 0,
      raw: data,
    };
  }

  /** Required margin for one or more proposed orders. orders: order[]. */
  async getMarginForOrders(orders, { segment } = {}) {
    const arr = (Array.isArray(orders) ? orders : [orders]).map((o) => ({
      trading_symbol: o.symbol,
      transaction_type: o.side,
      quantity: o.quantity,
      price: o.price ?? 0,
      order_type: o.orderType || 'LIMIT',
      product: o.product || this.defProduct,
      exchange: this.#ex(o.exchange),
    }));
    return this.#request('/margins/detail/orders', { method: 'POST', query: { segment: this.#seg(segment) }, body: arr });
  }

  // ── Orders ───────────────────────────────────────────────────────────────────
  async placeOrder(order) {
    if (!liveTradingEnabled()) {
      throw new GrowwApiError('Live trading is disabled. Refusing to place a real order.', 'LIVE_DISABLED');
    }
    const data = await this.#request('/order/create', {
      method: 'POST',
      body: {
        trading_symbol: order.symbol,
        quantity: order.quantity,
        ...(order.price != null ? { price: order.price } : {}),
        ...(order.triggerPrice != null ? { trigger_price: order.triggerPrice } : {}),
        validity: order.validity || 'DAY',
        exchange: this.#ex(order.exchange),
        segment: this.#seg(order.segment),
        product: order.product || this.defProduct,
        order_type: order.orderType || 'LIMIT',
        transaction_type: order.side, // BUY | SELL
        ...(order.referenceId ? { order_reference_id: order.referenceId } : {}),
      },
    });
    return {
      orderId: data.groww_order_id,
      status: data.order_status || 'SUBMITTED',
      referenceId: data.order_reference_id,
      remark: data.remark,
      quantity: order.quantity,
      symbol: order.symbol,
      side: order.side,
      simulated: false,
    };
  }

  async modifyOrder({ orderId, segment, orderType, quantity, price, triggerPrice }) {
    if (!liveTradingEnabled()) throw new GrowwApiError('Live trading is disabled.', 'LIVE_DISABLED');
    const data = await this.#request('/order/modify', {
      method: 'POST',
      body: {
        groww_order_id: orderId,
        segment: this.#seg(segment),
        ...(orderType ? { order_type: orderType } : {}),
        ...(quantity != null ? { quantity } : {}),
        ...(price != null ? { price } : {}),
        ...(triggerPrice != null ? { trigger_price: triggerPrice } : {}),
      },
    });
    return { orderId: data.groww_order_id, status: data.order_status };
  }

  async cancelOrder({ orderId, segment }) {
    if (!liveTradingEnabled()) throw new GrowwApiError('Live trading is disabled.', 'LIVE_DISABLED');
    const data = await this.#request('/order/cancel', {
      method: 'POST',
      body: { groww_order_id: orderId, segment: this.#seg(segment) },
    });
    return { orderId: data.groww_order_id, status: data.order_status };
  }

  async getOrders({ segment, page = 0, pageSize = 100 } = {}) {
    const data = await this.#request('/order/list', { query: { segment: this.#seg(segment), page, page_size: pageSize } });
    return data.order_list || [];
  }

  async getOrderDetail(orderId, { segment } = {}) {
    return this.#request(`/order/detail/${orderId}`, { query: { segment: this.#seg(segment) } });
  }

  async getOrderStatus(orderId, { segment } = {}) {
    return this.#request(`/order/status/${orderId}`, { query: { segment: this.#seg(segment) } });
  }

  async getTrades(orderId, { segment, page = 0, pageSize = 50 } = {}) {
    const data = await this.#request(`/order/trades/${orderId}`, {
      query: { segment: this.#seg(segment), page, page_size: pageSize },
    });
    return data.trade_list || [];
  }

  // ── Portfolio ─────────────────────────────────────────────────────────────────
  async getPositions({ segment } = {}) {
    const data = await this.#request('/positions/user', { query: { segment: this.#seg(segment) } });
    return data.positions || data.position_list || (Array.isArray(data) ? data : []);
  }

  async getPositionForSymbol(symbol, { segment } = {}) {
    return this.#request('/positions/trading-symbol', { query: { trading_symbol: symbol, segment: this.#seg(segment) } });
  }

  async getHoldings() {
    const data = await this.#request('/holdings/user');
    return data.holdings || data.holding_list || (Array.isArray(data) ? data : []);
  }
}
