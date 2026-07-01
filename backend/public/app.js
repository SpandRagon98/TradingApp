// Dashboard client. Vanilla JS, talks to the /api backend.
const API = '/api';
const $ = (id) => document.getElementById(id);
const money = (n) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const sign = (n) => (n > 0 ? '+' : '') + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

// ── Init ──
async function init() {
  const [cfg, disc, syms, strats] = await Promise.all([
    api('/config'), api('/disclaimer'), api('/market/symbols'), api('/strategies'),
  ]);

  $('disclaimer').textContent = disc.disclaimer;
  const c = cfg.config;
  $('broker-badge').textContent = 'broker: ' + c.broker;
  const mb = $('mode-badge');
  mb.textContent = c.mode.toUpperCase();
  mb.className = 'badge ' + (c.liveTradingEnabled ? 'badge-live' : 'badge-paper');
  $('kpi-capital').textContent = money(c.risk.capital);

  fillSelect($('symbol'), syms.symbols);
  fillSelect($('interval'), syms.intervals, '5m');
  fillSelect($('strategy'), strats.strategies.map((s) => s.name));

  await refreshStatus();
  await refreshTrades();
  await loadAlerts();
  connectWS();
  setInterval(refreshStatus, 15000);
}

// ── Alerts + WebSocket live feed ──
let alertItems = [];

function alertRow(a, flash) {
  const t = new Date(a.createdAt || a.ts || Date.now()).toLocaleTimeString('en-IN', { hour12: false });
  return `<div class="alert-row${flash ? ' flash' : ''}">
    <span class="lvl ${a.level || 'info'}">${a.level || 'info'}</span>
    <span>${escapeHtml(a.message)}</span>
    <span class="at">${t}</span>
  </div>`;
}

function renderAlerts() {
  const out = $('alerts-out');
  if (!alertItems.length) { out.innerHTML = '<span class="muted">No alerts yet.</span>'; return; }
  out.className = 'alert-list';
  out.innerHTML = alertItems.slice(0, 50).map((a, i) => alertRow(a, i === 0 && a._new)).join('');
}

async function loadAlerts() {
  const r = await api('/alerts');
  alertItems = r.alerts || [];
  renderAlerts();
}

function pushAlert(a) {
  a._new = true;
  alertItems.unshift(a);
  renderAlerts();
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws;
  try { ws = new WebSocket(`${proto}://${location.host}/ws`); }
  catch { return setLive(false); }

  ws.onopen = () => setLive(true);
  ws.onclose = () => { setLive(false); setTimeout(connectWS, 3000); }; // auto-reconnect
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let e; try { e = JSON.parse(ev.data); } catch { return; }
    if (e.type === 'alert') {
      pushAlert(e.alert);
      refreshStatus(); // KPIs may have changed (P&L, kill switch)
    }
  };
}

function setLive(on) {
  const b = $('live-badge');
  b.textContent = on ? '● live' : '● offline';
  b.className = 'badge ' + (on ? 'badge-online' : 'badge-muted');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fillSelect(el, items, selected) {
  el.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it; o.textContent = it;
    if (it === selected) o.selected = true;
    el.appendChild(o);
  }
}

// ── Status / KPIs ──
async function refreshStatus() {
  const [risk, broker] = await Promise.all([api('/risk/status'), api('/broker/status')]);
  const r = risk.risk;
  $('kpi-pnl').textContent = sign(r.dailyPnl);
  $('kpi-pnl').className = 'kpi-val ' + cls(r.dailyPnl);
  $('kpi-trades').textContent = r.tradesToday + ' / ' + r.limits.maxTradesPerDay;
  $('kpi-dll').textContent = r.dailyLossUsedPct.toFixed(0) + '%';
  $('kpi-dll').className = 'kpi-val ' + (r.dailyLossUsedPct >= 100 ? 'neg' : '');

  $('api-badge').textContent = 'API: ' + (broker.status?.connected ? 'connected' : 'down');

  const kill = $('kill-switch');
  kill.classList.toggle('active', !!r.killSwitch);
  kill.textContent = r.killSwitch ? '■ KILL ACTIVE' : '■ KILL SWITCH';

  $('risk-out').innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Daily P&amp;L</span><span class="v ${cls(r.dailyPnl)}">${sign(r.dailyPnl)}</span></div>
      <div class="metric"><span class="l">Max daily loss</span><span class="v">${money(r.maxDailyLoss)}</span></div>
      <div class="metric"><span class="l">Open trades</span><span class="v">${r.openTrades} / ${r.limits.maxOpenTrades}</span></div>
      <div class="metric"><span class="l">Consec. losses</span><span class="v">${r.consecutiveLosses} / ${r.limits.maxConsecutiveLosses}</span></div>
      <div class="metric"><span class="l">Risk / trade</span><span class="v">${r.limits.riskPerTradePct}%</span></div>
      <div class="metric"><span class="l">Min R:R</span><span class="v">${r.limits.minRiskReward}:1</span></div>
      <div class="metric"><span class="l">Kill switch</span><span class="v ${r.killSwitch ? 'neg' : 'pos'}">${r.killSwitch ? 'ON' : 'off'}</span></div>
      <div class="metric"><span class="l">Score gate</span><span class="v">70 / 100</span></div>
    </div>`;
}

// ── Signal rendering ──
function renderSignal(out, { signal, score, validation }) {
  if (signal.type === 'NO_TRADE') {
    out.innerHTML = `<div class="sig"><div class="sig-head"><span class="pill NO_TRADE">NO TRADE</span>
      <span class="muted">${signal.strategy} · ${signal.symbol}</span></div>
      <div class="muted">${signal.rejectionReason}</div></div>`;
    return;
  }
  const factors = `
    <div class="factors">
      <div class="for"><strong class="muted">Supports</strong><ul>${score.supporting.map((s) => `<li>${s}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>
      <div class="against"><strong class="muted">Warnings</strong><ul>${score.warning.map((s) => `<li>${s}</li>`).join('') || '<li class="muted">—</li>'}</ul></div>
    </div>`;
  const block = validation && !validation.approved
    ? `<div class="warn">Risk gate blocked: ${validation.reasons.join(' ')}</div>` : '';
  out.innerHTML = `
    <div class="sig">
      <div class="sig-head">
        <span class="pill ${signal.type}">${signal.type}</span>
        <span class="muted">${signal.strategy} · ${signal.symbol} · ${signal.timeframe}</span>
        <span class="score">score <span class="num ${score.approved ? 'pos' : 'neg'}">${score.score}</span>/100</span>
      </div>
      <div class="metrics">
        <div class="metric"><span class="l">Entry</span><span class="v">${signal.entry}</span></div>
        <div class="metric"><span class="l">Stop</span><span class="v neg">${signal.stop}</span></div>
        <div class="metric"><span class="l">Target</span><span class="v pos">${signal.target}</span></div>
        <div class="metric"><span class="l">R:R</span><span class="v">${signal.riskReward}:1</span></div>
        <div class="metric"><span class="l">Qty (risk-sized)</span><span class="v">${validation?.quantity ?? '—'}</span></div>
        <div class="metric"><span class="l">Risk amount</span><span class="v">${money(validation?.riskAmount)}</span></div>
        <div class="metric"><span class="l">Confidence</span><span class="v">${signal.confidence}</span></div>
        <div class="metric"><span class="l">Eligible</span><span class="v ${score.approved ? 'pos' : 'neg'}">${score.approved ? 'yes' : 'no'}</span></div>
      </div>
      <div class="muted">${signal.reason}</div>
      ${factors}${block}
    </div>`;
}

// ── Actions ──
async function analyze() {
  const out = $('signal-out');
  out.innerHTML = '<span class="muted">Analyzing…</span>';
  const r = await api('/strategies/run', { method: 'POST', body: body() });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  renderSignal(out, r);
}

async function paperTrade() {
  const out = $('signal-out');
  out.innerHTML = '<span class="muted">Running paper trade…</span>';
  const r = await api('/paper/run', { method: 'POST', body: body() });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const res = r.result;
  renderSignal(out, res);
  if (res.traded) {
    const t = res.trade;
    out.insertAdjacentHTML('beforeend',
      `<div class="warn" style="background:var(--panel-2);border-color:var(--border);color:var(--text)">
        Paper trade closed: <strong class="${cls(t.pnl)}">${sign(t.pnl)}</strong> via <em>${t.exitReason}</em>
        (exit ${t.exit}, qty ${t.quantity}, costs ${money(t.costs)}).</div>`);
  } else {
    out.insertAdjacentHTML('beforeend', `<div class="muted" style="margin-top:8px">No trade taken: ${res.reason}</div>`);
  }
  await refreshStatus();
  await refreshTrades();
}

async function backtest() {
  const out = $('backtest-out');
  out.innerHTML = '<span class="muted">Backtesting 30 sessions…</span>';
  const r = await api('/backtest/run', { method: 'POST', body: { ...body(), days: 30 } });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const m = r.result;
  const eq = m.equityCurve.map((p) => p.equity);
  const min = Math.min(...eq), max = Math.max(...eq);
  const bars = eq.map((v) => {
    const h = max === min ? 50 : ((v - min) / (max - min)) * 100;
    return `<div class="b" style="height:${Math.max(2, h)}%"></div>`;
  }).join('');
  out.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Trades</span><span class="v">${m.totalTrades}</span></div>
      <div class="metric"><span class="l">Win rate</span><span class="v">${m.winRate}%</span></div>
      <div class="metric"><span class="l">Net P&amp;L</span><span class="v ${cls(m.netPnl)}">${sign(m.netPnl)}</span></div>
      <div class="metric"><span class="l">Profit factor</span><span class="v">${m.profitFactor}</span></div>
      <div class="metric"><span class="l">Avg win</span><span class="v pos">${money(m.avgWin)}</span></div>
      <div class="metric"><span class="l">Avg loss</span><span class="v neg">${money(m.avgLoss)}</span></div>
      <div class="metric"><span class="l">Max drawdown</span><span class="v neg">${money(m.maxDrawdown)}</span></div>
      <div class="metric"><span class="l">Max consec. losses</span><span class="v">${m.maxConsecutiveLosses}</span></div>
    </div>
    <div class="muted" style="margin-top:6px">Equity curve (${m.symbol} · ${m.strategy})</div>
    <div class="bars">${bars}</div>`;
}

async function refreshTrades() {
  const r = await api('/paper/trades');
  const out = $('trades-out');
  if (!r.trades.length) return (out.innerHTML = '<span class="muted">No paper trades yet.</span>');
  const rows = r.trades.slice(0, 20).map((t) => `
    <tr>
      <td>${t.symbol}</td><td>${t.strategy}</td><td>${t.side}</td>
      <td>${t.entry}</td><td>${t.exit}</td><td>${t.quantity}</td>
      <td>${t.exitReason}</td><td class="${cls(t.pnl)}">${sign(t.pnl)}</td>
    </tr>`).join('');
  out.innerHTML = `<table><thead><tr>
      <th>Symbol</th><th>Strategy</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Exit reason</th><th>P&amp;L</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Option chain ──
async function loadChain() {
  const out = $('chain-out');
  out.innerHTML = '<span class="muted">Loading chain…</span>';
  const r = await api(`/options/chain?index=${$('oc-index').value}&daysToExpiry=${Number($('oc-dte').value)}&strikesEach=8`);
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const ch = r.chain;
  $('chain-analytics').innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Spot</span><span class="v">${ch.spot}</span></div>
      <div class="metric"><span class="l">ATM</span><span class="v">${ch.atmStrike}</span></div>
      <div class="metric"><span class="l">PCR</span><span class="v">${ch.pcr}</span></div>
      <div class="metric"><span class="l">Max pain</span><span class="v">${ch.maxPain}</span></div>
      <div class="metric"><span class="l">Support (OI)</span><span class="v pos">${ch.support}</span></div>
      <div class="metric"><span class="l">Resistance (OI)</span><span class="v neg">${ch.resistance}</span></div>
    </div>`;
  const rows = ch.rows.map((row) => {
    const atm = row.strike === ch.atmStrike ? ' style="background:var(--panel-2);font-weight:700"' : '';
    return `<tr${atm}>
      <td>${fmtK(row.ce.oi)}</td><td>${row.ce.iv}</td><td class="pos">${row.ce.ltp}</td>
      <td style="text-align:center;font-weight:700">${row.strike}</td>
      <td class="neg">${row.pe.ltp}</td><td>${row.pe.iv}</td><td>${fmtK(row.pe.oi)}</td>
    </tr>`;
  }).join('');
  out.innerHTML = `<table><thead><tr>
      <th>CE OI</th><th>CE IV</th><th>CE LTP</th><th style="text-align:center">Strike</th><th style="text-align:left">PE LTP</th><th>PE IV</th><th>PE OI</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function strBody() {
  return { index: $('str-index').value, type: $('str-type').value, lots: Number($('str-lots').value), daysToExpiry: Number($('str-dte').value) };
}

// ── Straddle build (Greeks) ──
async function buildStraddle() {
  const out = $('straddle-out');
  out.innerHTML = '<span class="muted">Building…</span>';
  const r = await api('/options/straddle/build', { method: 'POST', body: strBody() });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const s = r.straddle;
  const warn = (s.warnings || []).map((w) => `<div class="warn">${w}</div>`).join('');
  const g = s.greeks;
  out.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Spot</span><span class="v">${s.spot}</span></div>
      <div class="metric"><span class="l">ATM strike</span><span class="v">${s.strike}</span></div>
      <div class="metric"><span class="l">IV / DTE</span><span class="v">${s.iv}% / ${s.daysToExpiry}d</span></div>
      <div class="metric"><span class="l">CE / PE</span><span class="v">${s.cePremium} / ${s.pePremium}</span></div>
      <div class="metric"><span class="l">Combined premium</span><span class="v">${s.combinedPremium}</span></div>
      <div class="metric"><span class="l">Qty (${s.lots}×${s.lotSize})</span><span class="v">${s.quantity}</span></div>
      <div class="metric"><span class="l">Breakeven ↑↓</span><span class="v">${s.breakevenDown}–${s.breakevenUp}</span></div>
      <div class="metric"><span class="l">Max profit</span><span class="v pos">${typeof s.maxProfit === 'number' ? money(s.maxProfit) : s.maxProfit}</span></div>
      <div class="metric"><span class="l">Max loss</span><span class="v neg">${typeof s.maxLoss === 'number' ? money(s.maxLoss) : s.maxLoss}</span></div>
      <div class="metric"><span class="l">Net Δ delta</span><span class="v">${g.delta}</span></div>
      <div class="metric"><span class="l">Net Θ theta/day</span><span class="v ${g.theta >= 0 ? 'pos' : 'neg'}">${g.theta} (${money(s.thetaPerDayValue)})</span></div>
      <div class="metric"><span class="l">Net ν vega</span><span class="v">${g.vega}</span></div>
    </div>${warn}`;
}

// ── Straddle paper trade ──
async function straddlePaper() {
  const out = $('straddle-out');
  out.innerHTML = '<span class="muted">Running straddle paper trade…</span>';
  const r = await api('/options/straddle/paper', { method: 'POST', body: strBody() });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const t = r.result;
  const warn = (t.warnings || []).map((w) => `<div class="warn">${w}</div>`).join('');
  out.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Strike</span><span class="v">${t.strike}</span></div>
      <div class="metric"><span class="l">Spot in→out</span><span class="v">${t.spot0}→${t.spotExit}</span></div>
      <div class="metric"><span class="l">CE in→out</span><span class="v">${t.ceEntry}→${t.ceExit}</span></div>
      <div class="metric"><span class="l">PE in→out</span><span class="v">${t.peEntry}→${t.peExit}</span></div>
      <div class="metric"><span class="l">Combined in→out</span><span class="v">${t.combinedEntry}→${t.combinedExit}</span></div>
      <div class="metric"><span class="l">Exit reason</span><span class="v">${t.exitReason}</span></div>
      <div class="metric"><span class="l">Costs</span><span class="v">${money(t.costs)}</span></div>
      <div class="metric"><span class="l">P&amp;L</span><span class="v ${cls(t.pnl)}">${sign(t.pnl)}</span></div>
    </div>${warn}`;
  await refreshStatus();
  await refreshTrades();
}

// ── Straddle backtest ──
async function straddleBacktest() {
  const out = $('straddle-out');
  out.innerHTML = '<span class="muted">Backtesting 60 sessions…</span>';
  const r = await api('/options/straddle/backtest', { method: 'POST', body: { ...strBody(), sessions: 60 } });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const m = r.result;
  const eq = m.equityCurve.map((p) => p.equity);
  const min = Math.min(...eq), max = Math.max(...eq);
  const bars = eq.map((v) => `<div class="b" style="height:${Math.max(2, max === min ? 50 : ((v - min) / (max - min)) * 100)}%"></div>`).join('');
  const wd = Object.entries(m.byWeekday).map(([k, v]) => `${k}: ${sign(v.pnl)}`).join(' · ');
  out.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Trades</span><span class="v">${m.totalTrades}</span></div>
      <div class="metric"><span class="l">Win rate</span><span class="v">${m.winRate}%</span></div>
      <div class="metric"><span class="l">Net P&amp;L</span><span class="v ${cls(m.netPnl)}">${sign(m.netPnl)}</span></div>
      <div class="metric"><span class="l">Profit factor</span><span class="v">${m.profitFactor}</span></div>
      <div class="metric"><span class="l">Avg win</span><span class="v pos">${money(m.avgWin)}</span></div>
      <div class="metric"><span class="l">Avg loss</span><span class="v neg">${money(m.avgLoss)}</span></div>
      <div class="metric"><span class="l">Max drawdown</span><span class="v neg">${money(m.maxDrawdown)}</span></div>
      <div class="metric"><span class="l">Avg MAE / MFE</span><span class="v">${money(m.avgMAE)} / ${money(m.avgMFE)}</span></div>
    </div>
    <div class="muted" style="margin-top:6px">${m.type} straddle · ${m.index} · by weekday: ${wd}</div>
    <div class="bars">${bars}</div>`;
}

// ── 9:20 scanner ──
async function runScanner() {
  const out = $('straddle-out');
  out.innerHTML = '<span class="muted">Running 9:20 short-straddle scanner…</span>';
  const r = await api('/options/straddle/scanner', { method: 'POST', body: { index: $('str-index').value, lots: Number($('str-lots').value), daysToExpiry: Number($('str-dte').value) } });
  if (!r.ok) return (out.innerHTML = `<span class="neg">${r.error}</span>`);
  const t = r.result;
  out.innerHTML = `
    <div class="metrics">
      <div class="metric"><span class="l">Setup</span><span class="v">${t.scanner}</span></div>
      <div class="metric"><span class="l">Window</span><span class="v">${t.entryTime}→${t.exitTime}</span></div>
      <div class="metric"><span class="l">Strike</span><span class="v">${t.strike}</span></div>
      <div class="metric"><span class="l">SL / Target / Trail</span><span class="v">${t.combinedSLPct}% / ${t.combinedTargetPct}% / ${t.trailingSLPct}%</span></div>
      <div class="metric"><span class="l">Combined in→out</span><span class="v">${t.combinedEntry}→${t.combinedExit}</span></div>
      <div class="metric"><span class="l">Exit reason</span><span class="v">${t.exitReason}</span></div>
      <div class="metric"><span class="l">Costs</span><span class="v">${money(t.costs)}</span></div>
      <div class="metric"><span class="l">P&amp;L</span><span class="v ${cls(t.pnl)}">${sign(t.pnl)}</span></div>
    </div>
    <div class="warn">Short straddle, paper only. Unhedged short straddles carry unlimited risk — see Straddle Builder for the full warning.</div>`;
}

function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(0) + 'k' : String(n); }

async function killSwitch() {
  const risk = await api('/risk/status');
  const on = !risk.risk.killSwitch;
  if (on && !confirm('Activate KILL SWITCH? This halts all (paper) trading.')) return;
  await api('/live/kill-switch', { method: 'POST', body: { on } });
  await refreshStatus();
}

function body() {
  return { symbol: $('symbol').value, strategy: $('strategy').value, interval: $('interval').value };
}

// ── Wire up ──
$('btn-analyze').onclick = analyze;
$('btn-paper').onclick = paperTrade;
$('btn-backtest').onclick = backtest;
$('btn-chain').onclick = loadChain;
$('btn-straddle').onclick = buildStraddle;
$('btn-straddle-paper').onclick = straddlePaper;
$('btn-straddle-bt').onclick = straddleBacktest;
$('btn-scanner').onclick = runScanner;
$('btn-alert-test').onclick = () => api('/alerts/test', { method: 'POST', body: { message: 'Manual test alert', level: 'info' } });
$('kill-switch').onclick = killSwitch;

init().catch((e) => { $('disclaimer').textContent = 'Failed to reach backend: ' + e.message; });
