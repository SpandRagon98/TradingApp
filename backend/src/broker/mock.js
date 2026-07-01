// Mock broker — synthetic data, always "connected", never touches real money.
// Used for paper trading, backtesting, and any time Groww creds are absent.

import { generateCandles, toMarketData } from '../marketdata/candles.js';

export class MockBroker {
  constructor(config) {
    this.name = 'mock';
    this.config = config;
  }

  async status() {
    return { connected: true, broker: 'mock', mode: this.config.mode, detail: 'Synthetic data broker (no real orders).' };
  }

  async connect() {
    return { connected: true, detail: 'Mock broker is always available.' };
  }

  async getQuote(symbol) {
    const candles = generateCandles(symbol, '1m', 30, daySeed());
    const md = toMarketData(symbol, '1m', candles);
    return { symbol, ltp: md.lastPrice, time: new Date().toISOString() };
  }

  async getHistorical(symbol, { interval = '5m', count = 75, seed = daySeed() } = {}) {
    return generateCandles(symbol, interval, count, seed);
  }

  async getMargin() {
    return { available: this.config.risk.capital, used: 0 };
  }

  async placeOrder(order) {
    // Simulate an immediate fill at the requested price (paper semantics).
    return {
      orderId: 'MOCK-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      status: 'FILLED',
      avgPrice: order.price,
      quantity: order.quantity,
      symbol: order.symbol,
      side: order.side,
      simulated: true,
    };
  }

  async getPositions() {
    return [];
  }
}

// A seed that changes per calendar day so "today's" synthetic series is stable
// within a session but differs day to day.
function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
