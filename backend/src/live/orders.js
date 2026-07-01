// Live order flow — prepare → human confirm → execute.
//
// Two-step BY DESIGN: a real order is never placed in a single call. `prepare`
// validates everything and returns an intent; `execute` places the order only
// with an explicit confirm:true, only while the triple-gate is satisfied, and
// only before the intent expires.
//
// Safety enforced here:
//   • mandatory stop-loss (rejected without one, and it must be on the right side)
//   • risk engine validation + position sizing
//   • live margin availability check (Groww /margins/detail/orders)
//   • kill switch
//   • a protective stop-loss order is placed alongside the entry
//
// NOTE: in paper mode (the default) `execute` refuses and places nothing, so this
// whole module is inert until the operator deliberately flips the triple-gate.

import { config, liveTradingEnabled } from '../config.js';
import { getBroker, isLiveBroker } from '../broker/broker.js';
import { validateTrade, riskStatus, recordTradeOpen } from '../risk/risk.js';
import { insert, update, list, audit } from '../store.js';
import { alert, AlertType } from '../alerts/alerts.js';
import { logger } from '../logger.js';

const INTENT_TTL_MS = 2 * 60 * 1000; // a prepared intent is valid for 2 minutes
const SIDES = new Set(['BUY', 'SELL']);

// Groww stop-loss-market order type. Confirm the exact enum against your account's
// entitlements before the first live trade (some segments use 'SL_M', others 'SLM').
const STOP_ORDER_TYPE = config.groww.stopOrderType || 'SL_M';

function findIntent(intentId) {
  return list('orders').find((o) => o.id === intentId && o.kind === 'live-intent') || null;
}

/** Validate, size, margin-check, and persist an order intent (no order placed). */
export async function prepareOrder(input = {}, actor = null) {
  const sideU = String(input.side || '').toUpperCase();
  const orderType = String(input.orderType || 'LIMIT').toUpperCase();
  const exchange = input.exchange || config.groww.defaultExchange;
  const segment = input.segment || config.groww.defaultSegment;
  const product = input.product || config.groww.defaultProduct;
  const entryPx = Number(input.entry ?? input.price);
  const stopPx = Number(input.stop);
  const targetPx = input.target != null ? Number(input.target) : null;

  const errors = [];
  if (!input.symbol) errors.push('symbol is required');
  if (!SIDES.has(sideU)) errors.push('side must be BUY or SELL');
  if (!Number.isFinite(entryPx) || entryPx <= 0) errors.push('a valid entry price is required');
  if (!Number.isFinite(stopPx) || stopPx <= 0) errors.push('a stop-loss is mandatory'); // hard rule
  if (Number.isFinite(stopPx) && Number.isFinite(entryPx)) {
    if (sideU === 'BUY' && stopPx >= entryPx) errors.push('for a BUY, the stop must be BELOW entry');
    if (sideU === 'SELL' && stopPx <= entryPx) errors.push('for a SELL, the stop must be ABOVE entry');
  }
  if (errors.length) return { ok: false, errors };

  // Risk sizing + rule validation.
  const riskReward = targetPx ? round2(Math.abs(targetPx - entryPx) / Math.abs(entryPx - stopPx)) : null;
  const sig = { type: sideU, entry: entryPx, stop: stopPx, target: targetPx ?? undefined, riskReward: riskReward ?? undefined, lotSize: Number(input.lotSize) || 1 };
  const validation = validateTrade(sig);
  const quantity = Number(input.quantity) > 0 ? Math.floor(Number(input.quantity)) : validation.quantity;

  const blockers = validation.approved ? [] : [...validation.reasons];
  if (quantity <= 0) blockers.push('Computed quantity is zero — stop too wide for the risk budget, or set a quantity.');

  // Live margin availability check (only meaningful against the real broker).
  let margin = null;
  if (isLiveBroker()) {
    try {
      const broker = getBroker();
      const m = await broker.getMarginForOrders(
        [{ symbol: input.symbol, side: sideU, quantity, price: entryPx, orderType, product, exchange }],
        { segment },
      );
      const req = Array.isArray(m) ? m[0] : m?.payload || m;
      const required = req?.total_requirement ?? req?.total_required ?? req?.cash_mis_margin_required ?? null;
      const avail = await broker.getMargin();
      margin = { required, available: avail.available };
      if (required != null && avail.available != null && Number(required) > Number(avail.available)) {
        blockers.push(`Insufficient margin: need ₹${required}, have ₹${avail.available}.`);
      }
    } catch (e) {
      blockers.push(`Margin check failed: ${e.message}`);
    }
  }

  // (Kill switch is already reflected in validation.reasons via the risk engine.)

  const intent = insert('orders', {
    kind: 'live-intent',
    status: 'prepared',
    symbol: input.symbol,
    side: sideU,
    orderType,
    entry: entryPx,
    stop: stopPx,
    target: targetPx,
    exchange,
    segment,
    product,
    quantity,
    riskAmount: validation.riskAmount,
    riskReward,
    margin,
    blockers,
    approved: blockers.length === 0,
    liveExecutionEnabled: liveTradingEnabled(),
    expiresAt: Date.now() + INTENT_TTL_MS,
    actor: actor?.id || null,
  });
  audit('live_order_prepare', { intentId: intent.id, symbol: input.symbol, side: sideU, quantity, approved: intent.approved, by: actor?.id });
  return { ok: true, intent };
}

/** Place the order for a prepared intent — only with explicit confirmation. */
export async function executeOrder(intentId, { confirm } = {}, actor = null) {
  const intent = findIntent(intentId);
  if (!intent) return { ok: false, error: 'Unknown order intent (it may have expired).' };
  if (intent.status !== 'prepared') return { ok: false, error: `Intent already ${intent.status}.` };
  if (Date.now() > intent.expiresAt) {
    update('orders', intentId, { status: 'expired' });
    return { ok: false, error: 'Order intent expired — please prepare it again.' };
  }
  if (confirm !== true) return { ok: false, error: 'Explicit confirm:true is required to place a live order.' };

  // Re-check guards at execution time (state may have changed since prepare).
  if (riskStatus().killSwitch) return { ok: false, error: 'Kill switch is ACTIVE — refusing to place order.' };
  if (intent.blockers?.length) return { ok: false, error: 'Intent has unresolved blockers: ' + intent.blockers.join('; ') };

  // The triple-gate. In paper mode this is the wall that keeps the app inert.
  if (!liveTradingEnabled()) {
    update('orders', intentId, { status: 'blocked_paper' });
    audit('live_order_execute_blocked', { intentId, by: actor?.id });
    return {
      ok: false,
      paper: true,
      error:
        'Live trading is disabled (paper mode) — no order was placed. To enable: set TRADING_MODE=live and ENABLE_LIVE_TRADING=true in .env, restart, then prepare again.',
    };
  }

  const broker = getBroker();

  // 1) Entry order.
  let entryRes;
  try {
    entryRes = await broker.placeOrder({
      symbol: intent.symbol,
      side: intent.side,
      quantity: intent.quantity,
      orderType: intent.orderType,
      price: intent.orderType === 'MARKET' ? undefined : intent.entry,
      exchange: intent.exchange,
      segment: intent.segment,
      product: intent.product,
      referenceId: 'INT' + intentId.slice(0, 12).replace(/[^a-zA-Z0-9]/g, ''),
    });
  } catch (e) {
    update('orders', intentId, { status: 'failed', error: e.message });
    audit('live_order_execute', { intentId, ok: false, error: e.message, by: actor?.id });
    alert(AlertType.API_STATUS, `Live order FAILED for ${intent.symbol}: ${e.message}`, { intentId }, 'critical');
    return { ok: false, error: e.message };
  }

  // 2) Protective stop-loss (opposite side, stop-market at the trigger).
  const slSide = intent.side === 'BUY' ? 'SELL' : 'BUY';
  let slRes = null;
  let slError = null;
  try {
    slRes = await broker.placeOrder({
      symbol: intent.symbol,
      side: slSide,
      quantity: intent.quantity,
      orderType: STOP_ORDER_TYPE,
      triggerPrice: intent.stop,
      exchange: intent.exchange,
      segment: intent.segment,
      product: intent.product,
      referenceId: 'SL' + intentId.slice(0, 12).replace(/[^a-zA-Z0-9]/g, ''),
    });
  } catch (e) {
    slError = e.message;
  }

  const trade = insert('trades', {
    mode: 'live',
    symbol: intent.symbol,
    side: intent.side,
    strategy: 'Manual',
    entry: intent.entry,
    stop: intent.stop,
    target: intent.target,
    quantity: intent.quantity,
    entryOrderId: entryRes.orderId,
    stopOrderId: slRes?.orderId || null,
    stopError: slError,
    status: 'open',
  });
  recordTradeOpen();
  update('orders', intentId, { status: 'executed', entryOrderId: entryRes.orderId, stopOrderId: slRes?.orderId || null, tradeId: trade.id });
  audit('live_order_execute', { intentId, ok: true, entryOrderId: entryRes.orderId, stopOrderId: slRes?.orderId, by: actor?.id });
  logger.info('live order executed', { intentId, symbol: intent.symbol, side: intent.side, qty: intent.quantity });

  if (slError) {
    alert(
      AlertType.API_STATUS,
      `⚠️ ${intent.symbol} entry placed (${entryRes.orderId}) but the STOP-LOSS order FAILED: ${slError}. Your position is UNPROTECTED — add a stop manually now.`,
      { intentId, tradeId: trade.id },
      'critical',
    );
  } else {
    alert(
      AlertType.TRADE_ENTERED,
      `LIVE ${intent.side} ${intent.symbol} ×${intent.quantity} @ ${intent.entry} (stop ${intent.stop})`,
      { tradeId: trade.id, entryOrderId: entryRes.orderId, stopOrderId: slRes?.orderId },
      'warn',
    );
  }

  return { ok: true, entry: entryRes, stopLoss: slRes, stopError: slError, tradeId: trade.id, risk: riskStatus() };
}

export function listIntents(limit = 50) {
  return list('orders')
    .filter((o) => o.kind === 'live-intent')
    .slice(-limit)
    .reverse();
}

const round2 = (n) => Math.round(n * 100) / 100;
