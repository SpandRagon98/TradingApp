// Broker abstraction layer.
//
// Every broker (mock, Groww, and future Zerodha/Angel/Upstox/Dhan/Fyers) implements
// the same interface so the rest of the app is broker-agnostic.
//
//   interface Broker {
//     name: string
//     async status()                       -> { connected, broker, mode, detail }
//     async connect()                      -> { connected, detail }
//     async getQuote(symbol)               -> { symbol, ltp, time }
//     async getHistorical(symbol, opts)    -> Candle[]
//     async getMargin()                    -> { available, used }
//     async placeOrder(order)              -> { orderId, status, avgPrice, ... }
//     async getPositions()                 -> Position[]
//   }
//
// Live order placement must NEVER happen in the mock and must be explicitly gated
// in real adapters (see liveTradingEnabled()).

import { config, growwToken } from '../config.js';
import { MockBroker } from './mock.js';
import { GrowwBroker } from './groww.js';

let instance = null;

export function getBroker() {
  if (instance) return instance;
  if (config.broker === 'groww' && growwToken()) {
    // The adapter reads the token fresh per request, so this instance stays valid
    // across token refreshes; resetBroker() is only needed on connect/disconnect.
    instance = new GrowwBroker(config);
  } else {
    // No live token or explicitly mock → safe synthetic broker.
    instance = new MockBroker(config);
  }
  return instance;
}

/** True when the live Groww adapter is active (token present and broker=groww). */
export function isLiveBroker() {
  return config.broker === 'groww' && Boolean(growwToken());
}

/** Force re-creation (e.g. after settings change). */
export function resetBroker() {
  instance = null;
}
