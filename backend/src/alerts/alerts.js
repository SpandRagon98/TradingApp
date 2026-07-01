// Alerts — a single choke point for notable events. Every alert is persisted,
// broadcast over WebSocket to connected dashboards, and (for warn/critical) sent
// to Telegram if configured. The rest of the app calls `alert(...)`.

import { insert, list } from '../store.js';
import { broadcast } from '../realtime/hub.js';
import { sendTelegram } from './telegram.js';
import { sendEmail } from './email.js';
import { logger } from '../logger.js';

// Known alert types from the spec (free-form is allowed too).
export const AlertType = Object.freeze({
  SIGNAL: 'signal_generated',
  TRADE_ENTERED: 'trade_entered',
  TRADE_CLOSED: 'trade_closed',
  STOP_HIT: 'stop_loss_hit',
  TARGET_HIT: 'target_hit',
  DAILY_LOSS: 'daily_loss_limit',
  KILL_SWITCH: 'kill_switch',
  STRADDLE_SL: 'straddle_combined_sl',
  STRADDLE_TARGET: 'straddle_target',
  HIGH_VOLATILITY: 'high_volatility',
  API_STATUS: 'api_status',
});

/**
 * Emit an alert.
 * @param level 'info' | 'warn' | 'critical' — warn/critical also go to Telegram.
 */
export function alert(type, message, meta = {}, level = 'info') {
  const row = insert('alerts', { type, message, meta, level, read: false });
  broadcast({ type: 'alert', alert: row });
  logger.info('alert', { type, level, message });
  if (level === 'warn' || level === 'critical') {
    // Fire and forget; never block the caller on a network call.
    sendTelegram(`[${level.toUpperCase()}] ${message}`).catch(() => {});
    sendEmail(`Trading alert [${level}]: ${type}`, message).catch(() => {});
  }
  return row;
}

export function listAlerts(limit = 100) {
  return list('alerts').slice(-limit).reverse();
}
