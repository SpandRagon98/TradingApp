// REST API. Thin handlers over the engine modules. Input is validated minimally;
// every state-changing action is audited. Live execution is intentionally NOT
// wired to a real placeOrder here — /live/prepare returns a confirmation payload
// only, and the triple-gate in config/groww must pass before any real order.

import { Router } from 'express';
import { config, publicConfig, liveTradingEnabled } from '../config.js';
import { getBroker, resetBroker, isLiveBroker } from '../broker/broker.js';
import { requireRole } from '../auth/middleware.js';
import * as growwAuth from '../broker/groww_auth.js';
import { prepareOrder, executeOrder, listIntents } from '../live/orders.js';
import { generateCandles, toMarketData, SUPPORTED_INTERVALS, SAMPLE_SYMBOLS } from '../marketdata/candles.js';
import { listStrategies, setEnabled, getStrategy } from '../strategies/registry.js';
import { scoreSignal } from '../scoring.js';
import { validateTrade, riskStatus, setKillSwitch, recordTradeOpen, recordTradeClose } from '../risk/risk.js';
import { runOnce } from '../paper/engine.js';
import { runBacktest } from '../backtest/engine.js';
import { buildStraddle } from '../options/straddle.js';
import { generateOptionChain, INDEX_META, RISK_FREE } from '../options/option_chain.js';
import { bs, timeToExpiryYears } from '../options/greeks.js';
import { runStraddlePaper, runScanner } from '../options/straddle_engine.js';
import { runStraddleBacktest } from '../options/straddle_backtest.js';
import { list, insert, update, audit, storageKind, getSettings, setSettings } from '../store.js';
import { alert, listAlerts, AlertType } from '../alerts/alerts.js';
import { telegramConfigured } from '../alerts/telegram.js';
import { emailConfigured } from '../alerts/email.js';
import { clientCount } from '../realtime/hub.js';

export const router = Router();

const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, code, message) => res.status(code).json({ ok: false, error: message });

// ── System ──
router.get('/health', (_req, res) => ok(res, { status: 'up', time: new Date().toISOString() }));
router.get('/config', (_req, res) =>
  ok(res, {
    config: {
      ...publicConfig(),
      storage: storageKind(),
      telegram: telegramConfigured(),
      email: emailConfigured(),
      wsClients: clientCount(),
    },
  }),
);

// ── Alerts ──
router.get('/alerts', (_req, res) => ok(res, { alerts: listAlerts(100) }));
router.post('/alerts/test', (req, res) => {
  const a = alert(AlertType.API_STATUS, req.body?.message || 'Test alert from dashboard', { source: 'manual' }, req.body?.level || 'info');
  ok(res, { alert: a });
});

const DISCLAIMER =
  'This tool is for educational and analytical purposes. Intraday and options trading are risky. ' +
  'It does not guarantee profits. Use paper trading first. Trade at your own risk and follow SEBI, ' +
  'exchange, and broker rules.';
router.get('/disclaimer', (_req, res) => ok(res, { disclaimer: DISCLAIMER }));

// ── Broker ──
router.get('/broker/status', async (_req, res) => {
  try {
    ok(res, { status: await getBroker().status() });
  } catch (e) {
    fail(res, 500, e.message);
  }
});
router.post('/broker/connect', async (_req, res) => {
  const result = await getBroker().connect();
  audit('broker_connect', { connected: result.connected });
  ok(res, { result });
});

// ── Groww authentication & token lifecycle ──
router.get('/broker/groww/status', (_req, res) => ok(res, { token: growwAuth.tokenStatus(), live: isLiveBroker() }));

// Connect: generate a daily access token. Body: { apiKey?, apiSecret?, totp?, totpSecret? }.
// apiKey/secret/TOTP are used once to mint the token and are NOT persisted unless
// already provided via env. Requires admin/trader.
router.post('/broker/groww/connect', requireRole('admin', 'trader'), async (req, res) => {
  try {
    const { apiKey, apiSecret, totp, totpSecret } = req.body || {};
    const token = await growwAuth.generateAccessToken({ apiKey, apiSecret, totp, totpSecret });
    resetBroker();
    audit('groww_connect', { ok: true, by: req.user?.id, fingerprint: token.fingerprint });
    ok(res, { token });
  } catch (e) {
    audit('groww_connect', { ok: false, by: req.user?.id, error: e.message });
    fail(res, 400, e.message);
  }
});

router.post('/broker/groww/refresh', requireRole('admin', 'trader'), async (_req, res) => {
  try {
    const result = await growwAuth.refreshIfNeeded();
    resetBroker();
    ok(res, { token: result });
  } catch (e) {
    fail(res, 400, e.message);
  }
});

router.post('/broker/groww/disconnect', requireRole('admin', 'trader'), (req, res) => {
  growwAuth.clearToken();
  resetBroker();
  audit('groww_disconnect', { by: req.user?.id });
  ok(res, { token: growwAuth.tokenStatus() });
});

// ── Live broker reads (work against Groww; gracefully degrade on mock) ──
router.get('/broker/margin', async (_req, res) => {
  try {
    ok(res, { live: isLiveBroker(), margin: await getBroker().getMargin() });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.get('/broker/positions', async (req, res) => {
  try {
    const broker = getBroker();
    const positions = typeof broker.getPositions === 'function' ? await broker.getPositions({ segment: req.query.segment }) : [];
    ok(res, { live: isLiveBroker(), positions });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.get('/broker/holdings', async (_req, res) => {
  try {
    const broker = getBroker();
    const holdings = typeof broker.getHoldings === 'function' ? await broker.getHoldings() : [];
    ok(res, { live: isLiveBroker(), holdings });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.get('/broker/orders', async (req, res) => {
  try {
    const broker = getBroker();
    const orders = typeof broker.getOrders === 'function' ? await broker.getOrders({ segment: req.query.segment }) : [];
    ok(res, { live: isLiveBroker(), orders });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

// Batch live LTP for a set of symbols (defaults to the saved watchlist).
router.get('/live/ltp', async (req, res) => {
  try {
    const broker = getBroker();
    const symbols = (req.query.symbols ? String(req.query.symbols).split(',') : getSettings().watchlist || SAMPLE_SYMBOLS.slice(0, 5))
      .map((s) => s.trim())
      .filter(Boolean);
    if (isLiveBroker() && typeof broker.getLtp === 'function') {
      ok(res, { live: true, ltp: await broker.getLtp(symbols, { segment: req.query.segment, exchange: req.query.exchange }) });
    } else {
      // Synthetic fallback: last close from generated candles.
      const ltp = {};
      for (const s of symbols) {
        const c = generateCandles(s, '5m', 75, daySeed());
        ltp[s] = c[c.length - 1].close;
      }
      ok(res, { live: false, ltp });
    }
  } catch (e) {
    fail(res, 502, e.message);
  }
});

// ── Market data ──
router.get('/market/symbols', (_req, res) => ok(res, { symbols: SAMPLE_SYMBOLS, intervals: SUPPORTED_INTERVALS }));
router.get('/market/candles', async (req, res) => {
  const symbol = (req.query.symbol || 'NIFTY').toString();
  const interval = (req.query.interval || '5m').toString();
  const count = Math.min(Number(req.query.count) || 75, 500);
  const { candles, source } = await liveOrSyntheticCandles(symbol, interval, count, {
    exchange: req.query.exchange,
    segment: req.query.segment,
  });
  const md = toMarketData(symbol, interval, candles);
  ok(res, { symbol, interval, candles, vwap: md.vwap, lastPrice: md.lastPrice, source });
});

// Live quote (full depth/OHLC when on the real broker; synthetic last price otherwise).
router.get('/market/quote', async (req, res) => {
  const symbol = (req.query.symbol || 'NIFTY').toString();
  try {
    if (isLiveBroker() && typeof getBroker().getQuote === 'function') {
      const quote = await getBroker().getQuote(symbol, { exchange: req.query.exchange, segment: req.query.segment });
      return ok(res, { live: true, quote });
    }
  } catch {
    // fall through to synthetic
  }
  const candles = generateCandles(symbol, '5m', 75, daySeed());
  const md = toMarketData(symbol, '5m', candles);
  ok(res, { live: false, quote: { symbol, ltp: md.lastPrice, time: new Date().toISOString() } });
});

// ── Strategies ──
router.get('/strategies', (_req, res) => ok(res, { strategies: listStrategies() }));
router.post('/strategies/enable', (req, res) => {
  if (!setEnabled(req.body?.name, true)) return fail(res, 404, 'Unknown strategy');
  audit('strategy_enable', { name: req.body.name });
  ok(res, { strategies: listStrategies() });
});
router.post('/strategies/disable', (req, res) => {
  if (!setEnabled(req.body?.name, false)) return fail(res, 404, 'Unknown strategy');
  audit('strategy_disable', { name: req.body.name });
  ok(res, { strategies: listStrategies() });
});

// Analyse one symbol with one strategy (no trade recorded).
router.post('/strategies/run', async (req, res) => {
  const { symbol = 'NIFTY', strategy = 'Momentum', interval = '5m' } = req.body || {};
  const strat = getStrategy(strategy);
  if (!strat) return fail(res, 404, 'Unknown strategy');
  const { candles, source } = await liveOrSyntheticCandles(symbol, interval, 75, {
    exchange: req.body?.exchange,
    segment: req.body?.segment,
  });
  const md = toMarketData(symbol, interval, candles);
  const signal = strat.generateSignal(md, {});
  signal.dataSource = source;
  const score = scoreSignal(signal, md);
  const validation = signal.type !== 'NO_TRADE' ? validateTrade(signal) : null;
  ok(res, { signal, score, validation });
});

// ── Paper trading (default, safe) ──
router.post('/paper/run', (req, res) => {
  const { symbol = 'NIFTY', strategy = 'Momentum', interval = '5m' } = req.body || {};
  const result = runOnce({ symbol, strategyName: strategy, interval });
  if (result.error) return fail(res, 400, result.error);
  if (result.traded) {
    const t = result.trade;
    alert(
      t.exitReason === 'stop_loss' ? AlertType.STOP_HIT : t.exitReason === 'target' ? AlertType.TARGET_HIT : AlertType.TRADE_CLOSED,
      `Paper ${t.side} ${t.symbol} (${t.strategy}) closed ${t.pnl >= 0 ? '+' : ''}${t.pnl} via ${t.exitReason}`,
      { tradeId: t.id, pnl: t.pnl },
      t.pnl < 0 ? 'warn' : 'info',
    );
  } else if (result.signal && result.signal.type !== 'NO_TRADE') {
    alert(AlertType.SIGNAL, `Signal ${result.signal.type} ${symbol} (${strategy}) blocked: ${result.reason}`, { score: result.score?.score });
  }
  ok(res, { result });
});
router.get('/paper/trades', (_req, res) => ok(res, { trades: list('trades', { mode: 'paper' }).reverse() }));

// ── Backtest ──
router.post('/backtest/run', (req, res) => {
  const { symbol = 'NIFTY', strategy = 'Momentum', interval = '5m', days = 30 } = req.body || {};
  const result = runBacktest({ symbol, strategyName: strategy, interval, days: Math.min(Number(days) || 30, 250) });
  if (result.error) return fail(res, 400, result.error);
  audit('backtest_run', { symbol, strategy, days });
  ok(res, { result });
});

// ── Risk ──
router.get('/risk/status', (_req, res) => ok(res, { risk: riskStatus() }));

// Update risk overrides (merged with env defaults by the risk engine).
router.post('/risk/settings', (req, res) => {
  const r = req.body?.risk || {};
  const allowed = ['capital', 'riskPerTradePct', 'maxDailyLossPct', 'minRiskReward', 'maxTradesPerDay', 'maxOpenTrades', 'maxConsecutiveLosses'];
  const patch = {};
  for (const k of allowed) if (Number.isFinite(Number(r[k]))) patch[k] = Number(r[k]);
  setSettings({ risk: { ...(getSettings().risk || {}), ...patch } });
  audit('risk_settings_update', { patch });
  ok(res, { risk: riskStatus() });
});

// Simple watchlist (kv-backed; defaults to the sample symbols).
router.get('/watchlist', (_req, res) => {
  const wl = getSettings().watchlist || SAMPLE_SYMBOLS.slice(0, 5);
  ok(res, { watchlist: wl });
});
router.post('/watchlist', (req, res) => {
  const wl = Array.isArray(req.body?.watchlist) ? req.body.watchlist.filter((s) => typeof s === 'string').slice(0, 50) : null;
  if (!wl) return fail(res, 400, 'watchlist must be an array of symbols');
  setSettings({ watchlist: wl });
  ok(res, { watchlist: wl });
});
router.post('/live/kill-switch', (req, res) => {
  const on = req.body?.on !== false; // default to ON for safety
  setKillSwitch(on);
  audit('kill_switch', { on });
  alert(AlertType.KILL_SWITCH, on ? 'KILL SWITCH ACTIVATED — all trading halted.' : 'Kill switch released.', { on }, on ? 'critical' : 'info');
  ok(res, { killSwitch: on, risk: riskStatus() });
});

// ── Live trading — PREPARE ONLY (never auto-executes) ──
router.post('/live/prepare', (req, res) => {
  const { symbol = 'NIFTY', strategy = 'Momentum', interval = '5m' } = req.body || {};
  const strat = getStrategy(strategy);
  if (!strat) return fail(res, 404, 'Unknown strategy');
  const candles = generateCandles(symbol, interval, 75, daySeed());
  const md = toMarketData(symbol, interval, candles);
  const signal = strat.generateSignal(md, {});
  if (signal.type === 'NO_TRADE') return ok(res, { prepared: false, signal, reason: 'No actionable signal.' });
  const score = scoreSignal(signal, md);
  const validation = validateTrade(signal);

  const confirmation = {
    requiresConfirmation: true,
    liveExecutionEnabled: liveTradingEnabled(),
    note: liveTradingEnabled()
      ? 'Live execution is ENABLED. Submitting confirm will place a REAL order.'
      : 'Live execution is DISABLED (paper-safe). This is a preview only; no order will be placed.',
    strategy, symbol,
    side: signal.type,
    entry: signal.entry, stop: signal.stop, target: signal.target,
    quantity: validation?.quantity ?? 0,
    riskAmount: validation?.riskAmount,
    riskReward: signal.riskReward,
    score: score.score,
    approved: validation?.approved && score.approved,
    blockers: [...(score.approved ? [] : ['score below threshold']), ...(validation?.reasons || [])],
  };
  audit('live_prepare', { symbol, strategy, approved: confirmation.approved });
  ok(res, { prepared: true, confirmation });
});

// ── Manual live order flow: prepare → confirm → execute (risk + margin + SL gated) ──
router.post('/live/order/prepare', requireRole('admin', 'trader'), async (req, res) => {
  try {
    const result = await prepareOrder(req.body || {}, req.user);
    if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
    ok(res, { intent: result.intent });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.post('/live/order/execute', requireRole('admin', 'trader'), async (req, res) => {
  try {
    const result = await executeOrder(req.body?.intentId, { confirm: req.body?.confirm }, req.user);
    // 409 when blocked by paper mode (not an error, just gated off); 400 for bad input.
    if (!result.ok) return res.status(result.paper ? 409 : 400).json(result);
    ok(res, result);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.get('/live/intents', (_req, res) => ok(res, { intents: listIntents() }));

// ── Order management on the live broker (modify / cancel / detail / trades) ──
router.post('/broker/orders/:id/modify', requireRole('admin', 'trader'), async (req, res) => {
  try {
    const r = await getBroker().modifyOrder({
      orderId: req.params.id,
      segment: req.body?.segment,
      orderType: req.body?.orderType,
      quantity: req.body?.quantity,
      price: req.body?.price,
      triggerPrice: req.body?.triggerPrice,
    });
    audit('order_modify', { orderId: req.params.id, by: req.user?.id });
    ok(res, { result: r });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.post('/broker/orders/:id/cancel', requireRole('admin', 'trader'), async (req, res) => {
  try {
    const r = await getBroker().cancelOrder({ orderId: req.params.id, segment: req.body?.segment });
    audit('order_cancel', { orderId: req.params.id, by: req.user?.id });
    ok(res, { result: r });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.get('/broker/orders/:id', async (req, res) => {
  try {
    const broker = getBroker();
    if (typeof broker.getOrderDetail !== 'function') return ok(res, { live: false, detail: null });
    ok(res, { live: isLiveBroker(), detail: await broker.getOrderDetail(req.params.id, { segment: req.query.segment }) });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

router.get('/broker/orders/:id/trades', async (req, res) => {
  try {
    const broker = getBroker();
    if (typeof broker.getTrades !== 'function') return ok(res, { live: false, trades: [] });
    ok(res, { live: isLiveBroker(), trades: await broker.getTrades(req.params.id, { segment: req.query.segment }) });
  } catch (e) {
    fail(res, 502, e.message);
  }
});

// ── Options / Straddle (paper-first; nothing here places a real order) ──

// Option chain (synthetic, Black-Scholes priced; real chain drops into same shape).
router.get('/options/chain', (req, res) => {
  const result = generateOptionChain({
    index: req.query.index || 'NIFTY',
    spot: req.query.spot ? Number(req.query.spot) : undefined,
    daysToExpiry: req.query.daysToExpiry ? Number(req.query.daysToExpiry) : undefined,
    expiry: req.query.expiry || undefined,
    strikesEach: req.query.strikesEach ? Number(req.query.strikesEach) : 10,
  });
  if (result.error) return fail(res, 400, result.error);
  ok(res, { chain: result, indices: Object.keys(INDEX_META) });
});

// Single-option Greeks / price.
router.get('/options/greeks', (req, res) => {
  const type = (req.query.type || 'ce').toString();
  const spot = Number(req.query.spot);
  const strike = Number(req.query.strike);
  const iv = Number(req.query.iv) > 0 ? Number(req.query.iv) : 0.12;
  if (!Number.isFinite(spot) || !Number.isFinite(strike)) return fail(res, 400, 'spot and strike are required');
  const T = timeToExpiryYears({ expiry: req.query.expiry, daysToExpiry: req.query.daysToExpiry });
  const g = bs(type, spot, strike, T, RISK_FREE, iv);
  ok(res, { greeks: { ...g, type, spot, strike, iv, daysToExpiry: Math.round(T * 365 * 100) / 100 } });
});

// Build (analysis only): premiums, net Greeks, breakevens, max loss/profit, warnings.
router.post('/options/straddle/build', (req, res) => {
  const result = buildStraddle(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  ok(res, { straddle: result });
});

// Paper trade: simulate a straddle over a session (repriced via Black-Scholes).
router.post('/options/straddle/paper', (req, res) => {
  const st = riskStatus();
  if (st.killSwitch) return fail(res, 403, 'Kill switch active — trading halted.');
  const result = runStraddlePaper(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  // Unify risk accounting: a straddle loss counts toward daily-loss / breakers too.
  recordTradeOpen();
  recordTradeClose(result.pnl);
  const trade = insert('trades', {
    mode: 'paper-straddle',
    symbol: result.index,
    strategy: result.type === 'short' ? 'ShortStraddle' : 'LongStraddle',
    side: result.type,
    strike: result.strike,
    quantity: result.quantity,
    ceEntry: result.ceEntry, peEntry: result.peEntry, combinedEntry: result.combinedEntry,
    ceExit: result.ceExit, peExit: result.peExit, combinedExit: result.combinedExit,
    breakevenUp: result.breakevenUp, breakevenDown: result.breakevenDown,
    exitReason: result.exitReason,
    costs: result.costs,
    pnl: result.pnl,
  });
  audit('straddle_paper', { index: result.index, type: result.type, pnl: result.pnl });
  alert(
    result.exitReason === 'combined_sl' || result.exitReason === 'leg_sl' ? AlertType.STRADDLE_SL : result.exitReason === 'target' ? AlertType.STRADDLE_TARGET : AlertType.TRADE_CLOSED,
    `${result.type} straddle ${result.index} ${result.strike} closed ${result.pnl >= 0 ? '+' : ''}${result.pnl} via ${result.exitReason}`,
    { tradeId: trade.id, pnl: result.pnl },
    result.pnl < 0 ? 'warn' : 'info',
  );
  ok(res, { result, tradeId: trade.id, risk: riskStatus() });
});

// Straddle backtest over many synthetic sessions.
router.post('/options/straddle/backtest', (req, res) => {
  const result = runStraddleBacktest(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  audit('straddle_backtest', { index: result.index, type: result.type, sessions: result.sessions });
  ok(res, { result });
});

// 9:20 / 9:30 time-based short-straddle scanner (paper).
router.post('/options/straddle/scanner', (req, res) => {
  const st = riskStatus();
  if (st.killSwitch) return fail(res, 403, 'Kill switch active — trading halted.');
  const result = runScanner(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  ok(res, { result });
});

// ── Trade journal ──
router.get('/journal', (_req, res) => ok(res, { journal: list('journal').reverse(), trades: list('trades').reverse() }));
router.post('/journal/note', (req, res) => {
  const { tradeId, note, mistake, emotion } = req.body || {};
  const entry = insert('journal', { tradeId: tradeId || null, note: note || '', mistake: mistake || '', emotion: emotion || '' });
  if (tradeId) update('trades', tradeId, { hasNote: true });
  ok(res, { entry });
});

function daySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Real broker candles when connected live, else deterministic synthetic candles.
// Any live-fetch error degrades gracefully to synthetic so the UI never breaks.
async function liveOrSyntheticCandles(symbol, interval, count, { exchange, segment } = {}) {
  if (isLiveBroker()) {
    try {
      const broker = getBroker();
      if (typeof broker.getHistorical === 'function') {
        const candles = await broker.getHistorical(symbol, { interval, count, exchange, segment });
        if (candles && candles.length) return { candles, source: 'live' };
      }
    } catch {
      // fall through to synthetic
    }
  }
  return { candles: generateCandles(symbol, interval, count, daySeed()), source: 'synthetic' };
}
