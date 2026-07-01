import React, { useState, useMemo, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Activity, Settings, Play, BarChart2,
  ChevronDown, ChevronUp, Target, Shield, Clock, AlertCircle,
  RefreshCw, Filter, ArrowUpDown, Info, Zap, CheckCircle, XCircle,
} from "lucide-react";

// ─── MOCK DATA GENERATOR ────────────────────────────────────────────────────
function generateMockTrades(cfg) {
  const seed = [
    { spot: 21500, r: 0.61 }, { spot: 21750, r: 0.22 }, { spot: 22000, r: 0.81 },
    { spot: 21800, r: 0.55 }, { spot: 22200, r: 0.30 }, { spot: 22500, r: 0.71 },
    { spot: 22300, r: 0.18 }, { spot: 22800, r: 0.91 }, { spot: 23000, r: 0.42 },
    { spot: 22700, r: 0.65 }, { spot: 23200, r: 0.28 }, { spot: 23500, r: 0.85 },
    { spot: 23300, r: 0.50 }, { spot: 23800, r: 0.12 }, { spot: 24000, r: 0.77 },
    { spot: 23600, r: 0.35 }, { spot: 24200, r: 0.68 }, { spot: 24500, r: 0.23 },
    { spot: 24300, r: 0.90 }, { spot: 24800, r: 0.44 }, { spot: 25000, r: 0.58 },
    { spot: 24600, r: 0.19 }, { spot: 24100, r: 0.82 }, { spot: 23800, r: 0.37 },
    { spot: 23500, r: 0.70 }, { spot: 23200, r: 0.26 }, { spot: 22900, r: 0.88 },
    { spot: 22600, r: 0.52 }, { spot: 22800, r: 0.15 }, { spot: 23100, r: 0.75 },
    { spot: 23400, r: 0.41 }, { spot: 23700, r: 0.63 }, { spot: 24000, r: 0.32 },
    { spot: 24300, r: 0.86 }, { spot: 24100, r: 0.47 }, { spot: 23900, r: 0.20 },
    { spot: 23600, r: 0.73 }, { spot: 23300, r: 0.56 }, { spot: 23100, r: 0.93 },
    { spot: 22900, r: 0.38 }, { spot: 22600, r: 0.67 }, { spot: 22400, r: 0.24 },
    { spot: 22700, r: 0.84 }, { spot: 23000, r: 0.49 }, { spot: 23300, r: 0.60 },
    { spot: 23500, r: 0.17 }, { spot: 23800, r: 0.78 }, { spot: 24000, r: 0.43 },
  ];

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const thursdays2024 = [];
  let d = new Date(2024, 0, 4);
  while (d.getFullYear() === 2024) {
    thursdays2024.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }

  const pt = cfg.profit_target_pct / 100;
  const sl = cfg.stop_loss_pct / 100;

  return seed.map((s, i) => {
    if (s.r > 0.88) return null;
    const date = thursdays2024[i] || new Date(2024, 11, 26);
    const spot = s.spot + (s.r - 0.5) * 150;
    const strike = Math.round(spot / 50) * 50;

    const atmPct = 0.009 + s.r * 0.006;
    const halfP = spot * atmPct * 0.5;
    const ceEntry = +(halfP * (0.92 + s.r * 0.12)).toFixed(2);
    const peEntry = +(halfP * (0.88 + (1 - s.r) * 0.14)).toFixed(2);
    const entryPrem = ceEntry + peEntry;

    let exitReason, mult;
    if (s.r < 0.28)      { exitReason = "profit_target"; mult =  pt + 0.01; }
    else if (s.r < 0.62) { exitReason = "stop_loss";     mult = -sl - 0.01; }
    else if (s.r < 0.82) { exitReason = "no_move";       mult = -(0.06 + s.r * 0.12); }
    else if (s.r < 0.94) { exitReason = "time_stop";     mult =  (s.r - 0.88) * 1.2; }
    else                 { exitReason = "eod";            mult =  0.05; }

    const exitPrem = Math.max(0, entryPrem * (1 + mult));
    const lot = cfg.lot_size;
    const gross = (exitPrem - entryPrem) * lot;
    const slip = (entryPrem + exitPrem) * (cfg.slippage_pct / 100) * lot;
    const pnl = Math.round(gross - slip - 4 * cfg.brokerage_per_order);

    const entryMins = 45 + Math.floor(s.r * 160);
    const eH = 9 + Math.floor(entryMins / 60);
    const eM = entryMins % 60;
    const dur = exitReason === "profit_target" ? 18 + Math.floor(s.r * 55)
              : exitReason === "stop_loss"     ? 22 + Math.floor(s.r * 70)
              : exitReason === "no_move"       ? 48 + Math.floor(s.r * 28)
              : 70 + Math.floor(s.r * 100);

    const exitMins = entryMins + dur;
    const xH = 9 + Math.floor(exitMins / 60);
    const xM = exitMins % 60;
    const mo = months[date.getMonth()];
    const dy = String(date.getDate()).padStart(2, "0");

    return {
      id: i + 1,
      entry_time: `${dy} ${mo} ${eH}:${String(eM).padStart(2,"0")}`,
      exit_time:  `${dy} ${mo} ${xH}:${String(xM).padStart(2,"0")}`,
      strike,
      entry_prem: +entryPrem.toFixed(2),
      exit_prem:  +exitPrem.toFixed(2),
      entry_spot: Math.round(spot),
      exit_spot:  Math.round(spot * (1 + mult * 0.08)),
      exit_reason: exitReason,
      pnl,
      duration_min: dur,
    };
  }).filter(Boolean);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const EXIT_COLORS = {
  profit_target: "#22c55e",
  stop_loss:     "#ef4444",
  no_move:       "#f59e0b",
  time_stop:     "#3b82f6",
  eod:           "#8b5cf6",
};
const EXIT_LABELS = {
  profit_target: "Profit Target",
  stop_loss:     "Stop Loss",
  no_move:       "No Move",
  time_stop:     "Time Stop",
  eod:           "End of Day",
};

// ─── SVG EQUITY CURVE ───────────────────────────────────────────────────────
function EquityCurve({ trades }) {
  const W = 760, H = 220, PAD = { t: 18, r: 20, b: 36, l: 72 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const cumPnl = useMemo(() => {
    let acc = 0;
    return [0, ...trades.map(t => { acc += t.pnl; return acc; })];
  }, [trades]);

  const minV = Math.min(...cumPnl);
  const maxV = Math.max(...cumPnl);
  const range = maxV - minV || 1;

  const toX = i => PAD.l + (i / (cumPnl.length - 1)) * iW;
  const toY = v => PAD.t + iH - ((v - minV) / range) * iH;

  const polyline = cumPnl.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const area = `M${toX(0)},${toY(cumPnl[0])} ` + cumPnl.map((v, i) => `L${toX(i)},${toY(v)}`).join(" ") +
               ` L${toX(cumPnl.length - 1)},${toY(minV)} L${toX(0)},${toY(minV)} Z`;

  const zeroY = toY(0);
  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => minV + (range / (ticks - 1)) * i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cumPnl[cumPnl.length - 1] >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cumPnl[cumPnl.length - 1] >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {/* grid lines */}
      {yTicks.map((v, i) => (
        <line key={i} x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)}
              stroke="#ffffff10" strokeWidth="1" />
      ))}
      {/* zero line */}
      {zeroY >= PAD.t && zeroY <= H - PAD.b && (
        <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY}
              stroke="#ffffff30" strokeWidth="1" strokeDasharray="4 3" />
      )}
      {/* area fill */}
      <path d={area} fill="url(#areaGrad)" />
      {/* line */}
      <polyline points={polyline} fill="none"
                stroke={cumPnl[cumPnl.length - 1] >= 0 ? "#22c55e" : "#ef4444"}
                strokeWidth="2" strokeLinejoin="round" />
      {/* y-axis labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={PAD.l - 6} y={toY(v) + 4} textAnchor="end"
              fontSize="10" fill="#94a3b8">
          {v >= 0 ? fmt(v) : `-${fmt(-v)}`}
        </text>
      ))}
      {/* x-axis labels (quarterly) */}
      {[0, 12, 24, 36, 47].map(idx => {
        const t = trades[idx];
        if (!t) return null;
        const label = t.entry_time.slice(3, 9);
        return (
          <text key={idx} x={toX(idx + 1)} y={H - PAD.b + 14} textAnchor="middle"
                fontSize="10" fill="#64748b">{label}</text>
        );
      })}
      {/* end dot */}
      <circle cx={toX(cumPnl.length - 1)} cy={toY(cumPnl[cumPnl.length - 1])} r="4"
              fill={cumPnl[cumPnl.length - 1] >= 0 ? "#22c55e" : "#ef4444"} />
    </svg>
  );
}

// ─── EXIT REASON BAR CHART ───────────────────────────────────────────────────
function ExitReasonChart({ trades }) {
  const counts = useMemo(() => {
    const c = {};
    trades.forEach(t => { c[t.exit_reason] = (c[t.exit_reason] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [trades]);

  const max = Math.max(...counts.map(c => c[1]), 1);

  return (
    <div className="space-y-2">
      {counts.map(([reason, count]) => (
        <div key={reason} className="flex items-center gap-3">
          <span className="text-xs text-slate-400 w-24 shrink-0">{EXIT_LABELS[reason]}</span>
          <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
                 style={{ width: `${(count / max) * 100}%`, backgroundColor: EXIT_COLORS[reason] }} />
          </div>
          <span className="text-xs font-mono text-slate-300 w-5 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── METRIC CARD ─────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color, positive }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium uppercase tracking-wider">
        <Icon size={13} />
        {label}
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ─── INDICATOR BADGE ─────────────────────────────────────────────────────────
function IndicatorBadge({ label, value, ok, desc }) {
  return (
    <div className={`rounded-lg p-3 border ${ok ? "border-green-700/40 bg-green-950/30" : "border-red-700/40 bg-red-950/30"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 font-medium">{label}</span>
        {ok ? <CheckCircle size={12} className="text-green-400" /> : <XCircle size={12} className="text-red-400" />}
      </div>
      <div className={`text-base font-mono font-semibold ${ok ? "text-green-300" : "text-red-300"}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{desc}</div>
    </div>
  );
}

// ─── CONFIG PANEL ────────────────────────────────────────────────────────────
function ConfigPanel({ cfg, onChange }) {
  const Field = ({ k, label, step, min, max }) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type="number" step={step || 1} min={min || 0} max={max}
        value={cfg[k]}
        onChange={e => onChange({ ...cfg, [k]: parseFloat(e.target.value) })}
        className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm font-mono
                   rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 w-full"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-semibold">Time Windows</p>
        <div className="grid grid-cols-2 gap-3">
          <Field k="entry_start_h" label="Entry Start (H)" min={9} max={12} />
          <Field k="entry_end_h"   label="Entry End (H)"   min={10} max={14} />
          <Field k="time_stop_h"   label="Time Stop (H)"   min={12} max={15} />
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-semibold">Entry Filters</p>
        <div className="grid grid-cols-2 gap-3">
          <Field k="vwap_proximity_pct"    label="VWAP Prox (%)"     step={0.01} />
          <Field k="dema_slope_threshold"  label="DEMA Slope Thr"    step={0.01} />
          <Field k="rsi_lower"             label="RSI Lower"          step={1} />
          <Field k="rsi_upper"             label="RSI Upper"          step={1} />
          <Field k="macd_hist_threshold"   label="MACD Hist Thr"     step={0.1} />
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-semibold">Exit Rules</p>
        <div className="grid grid-cols-2 gap-3">
          <Field k="profit_target_pct"     label="Profit Target (%)" step={1} />
          <Field k="stop_loss_pct"         label="Stop Loss (%)"     step={1} />
          <Field k="no_move_minutes"       label="No Move (mins)"    step={5} />
          <Field k="no_move_threshold_pct" label="No Move Thr (%)"   step={0.05} />
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-semibold">Position Sizing</p>
        <div className="grid grid-cols-2 gap-3">
          <Field k="lot_size"           label="Lot Size"        min={25} />
          <Field k="capital"            label="Capital (₹)"     step={10000} />
          <Field k="brokerage_per_order" label="Brokerage (₹)"  step={5} />
          <Field k="slippage_pct"       label="Slippage (%)"    step={0.001} />
        </div>
      </div>
    </div>
  );
}

// ─── TRADE LOG TABLE ─────────────────────────────────────────────────────────
function TradeLog({ trades, page, setPage }) {
  const PER_PAGE = 12;
  const totalPages = Math.ceil(trades.length / PER_PAGE);
  const visible = trades.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-700/60">
            {["#","Entry Time","Exit Time","Strike","Entry ₹","Exit ₹","PnL","Exit Reason","Dur (m)"].map(h => (
              <th key={h} className="py-2 px-2 text-slate-500 uppercase tracking-wider font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((t, idx) => (
            <tr key={t.id}
                className={`border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors
                            ${idx % 2 === 0 ? "" : "bg-slate-800/20"}`}>
              <td className="py-2 px-2 text-slate-500">{t.id}</td>
              <td className="py-2 px-2 text-slate-300 font-mono whitespace-nowrap">{t.entry_time}</td>
              <td className="py-2 px-2 text-slate-300 font-mono whitespace-nowrap">{t.exit_time}</td>
              <td className="py-2 px-2 text-slate-200 font-mono font-semibold">{t.strike}</td>
              <td className="py-2 px-2 text-slate-300 font-mono">{t.entry_prem.toFixed(1)}</td>
              <td className="py-2 px-2 text-slate-300 font-mono">{t.exit_prem.toFixed(1)}</td>
              <td className={`py-2 px-2 font-mono font-semibold ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {t.pnl >= 0 ? "+" : ""}₹{fmt(t.pnl)}
              </td>
              <td className="py-2 px-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: EXIT_COLORS[t.exit_reason] + "33",
                               color: EXIT_COLORS[t.exit_reason] }}>
                  {EXIT_LABELS[t.exit_reason]}
                </span>
              </td>
              <td className="py-2 px-2 text-slate-400 font-mono">{t.duration_min}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-700/40">
          <span className="text-xs text-slate-500">{trades.length} trades total</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-2 py-1 text-xs rounded-md bg-slate-700 text-slate-300
                               hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Prev
            </button>
            <span className="px-2 text-xs text-slate-400">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-2 py-1 text-xs rounded-md bg-slate-700 text-slate-300
                               hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
const DEFAULT_CFG = {
  entry_start_h: 9, entry_end_h: 12, time_stop_h: 14,
  dema_period: 20, rsi_period: 14, macd_fast: 12, macd_slow: 26, macd_signal: 9,
  vwap_proximity_pct: 0.15, dema_slope_threshold: 0.05, dema_slope_lookback: 6,
  rsi_lower: 45, rsi_upper: 55, macd_hist_threshold: 2.0,
  profit_target_pct: 27, stop_loss_pct: 33,
  no_move_minutes: 45, no_move_threshold_pct: 0.30,
  brokerage_per_order: 20, slippage_pct: 0.5, lot_size: 50, capital: 200000,
};

export default function StraddleTrading() {
  const [cfg, setCfg]           = useState(DEFAULT_CFG);
  const [pendingCfg, setPendingCfg] = useState(DEFAULT_CFG);
  const [showConfig, setShowConfig] = useState(false);
  const [isRunning, setIsRunning]   = useState(false);
  const [ran, setRan]               = useState(true);
  const [page, setPage]             = useState(1);
  const [filterReason, setFilterReason] = useState("all");

  const trades = useMemo(() => generateMockTrades(cfg), [cfg]);

  const filtered = useMemo(() =>
    filterReason === "all" ? trades : trades.filter(t => t.exit_reason === filterReason),
    [trades, filterReason]
  );

  const metrics = useMemo(() => {
    if (!trades.length) return null;
    const wins   = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalPnl  = trades.reduce((s, t) => s + t.pnl, 0);
    const winRate   = (wins.length / trades.length) * 100;
    const avgWin    = wins.length   ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length   : 0;
    const avgLoss   = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    const sumLoss   = losses.reduce((s, t) => s + t.pnl, 0);
    const pf        = sumLoss !== 0 ? wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(sumLoss) : Infinity;

    let peak = 0, acc = 0, maxDd = 0;
    trades.forEach(t => {
      acc += t.pnl;
      if (acc > peak) peak = acc;
      const dd = acc - peak;
      if (dd < maxDd) maxDd = dd;
    });
    const retOnCap = (totalPnl / cfg.capital) * 100;
    const avgDur   = trades.reduce((s, t) => s + t.duration_min, 0) / trades.length;

    return { totalPnl, winRate, avgWin, avgLoss, pf, maxDd, retOnCap, avgDur, nTrades: trades.length, nWins: wins.length };
  }, [trades, cfg.capital]);

  const runBacktest = useCallback(() => {
    setIsRunning(true);
    setPage(1);
    setTimeout(() => {
      setCfg({ ...pendingCfg });
      setIsRunning(false);
      setRan(true);
    }, 1200);
  }, [pendingCfg]);

  // Simulated current indicator readings
  const indicators = [
    { label: "VWAP Dist", value: "0.11%", ok: 0.11 <= cfg.vwap_proximity_pct, desc: `< ${cfg.vwap_proximity_pct}%` },
    { label: "DEMA Slope", value: "0.03", ok: 0.03 <= cfg.dema_slope_threshold, desc: `< ${cfg.dema_slope_threshold}` },
    { label: "RSI", value: "49.8", ok: 49.8 >= cfg.rsi_lower && 49.8 <= cfg.rsi_upper, desc: `${cfg.rsi_lower} – ${cfg.rsi_upper}` },
    { label: "MACD Hist", value: "1.42", ok: Math.abs(1.42) <= cfg.macd_hist_threshold, desc: `|x| ≤ ${cfg.macd_hist_threshold}` },
  ];

  const exitCounts = useMemo(() => {
    const c = {};
    trades.forEach(t => { c[t.exit_reason] = (c[t.exit_reason] || 0) + 1; });
    return c;
  }, [trades]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* ── TOP NAV ── */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800/70">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center shadow-lg">
              <Activity size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">NIFTY ATM Straddle</h1>
              <p className="text-[10px] text-slate-500 leading-tight">Expiry-Day Long Straddle · AI Backtester</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/40">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Weekly Expiry · Thursdays · 2024
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all
                ${showConfig
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-slate-800 border-slate-700/50 text-slate-300 hover:border-slate-600"}`}>
              <Settings size={13} />
              Config
              {showConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <button
              onClick={runBacktest}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
                         bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500
                         text-white shadow-lg shadow-green-900/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {isRunning
                ? <><RefreshCw size={13} className="animate-spin" /> Running…</>
                : <><Play size={13} className="fill-current" /> Run Backtest</>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-5 space-y-5">

        {/* ── CONFIG PANEL (collapsible) ── */}
        {showConfig && (
          <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 animate-fade-in">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Settings size={14} className="text-blue-400" />
              Strategy Configuration
              <span className="text-[10px] text-slate-500 font-normal ml-1">— edit then click Run Backtest</span>
            </h2>
            <ConfigPanel cfg={pendingCfg} onChange={setPendingCfg} />
          </div>
        )}

        {/* ── METRICS ROW ── */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={TrendingUp} label="Total P&L"
              value={`${metrics.totalPnl >= 0 ? "+" : ""}₹${fmt(metrics.totalPnl)}`}
              sub={`${metrics.retOnCap.toFixed(1)}% return on ₹${fmt(cfg.capital)}`}
              color={metrics.totalPnl >= 0 ? "text-green-400" : "text-red-400"} />
            <MetricCard
              icon={Target} label="Win Rate"
              value={`${metrics.winRate.toFixed(1)}%`}
              sub={`${metrics.nWins}W / ${metrics.nTrades - metrics.nWins}L of ${metrics.nTrades} trades`}
              color={metrics.winRate >= 50 ? "text-green-400" : "text-amber-400"} />
            <MetricCard
              icon={BarChart2} label="Profit Factor"
              value={isFinite(metrics.pf) ? metrics.pf.toFixed(2) : "∞"}
              sub={`Avg win ₹${fmt(metrics.avgWin)} · Avg loss ₹${fmt(metrics.avgLoss)}`}
              color={metrics.pf >= 1.2 ? "text-green-400" : "text-red-400"} />
            <MetricCard
              icon={Shield} label="Max Drawdown"
              value={`-₹${fmt(Math.abs(metrics.maxDd))}`}
              sub={`Avg trade dur ${metrics.avgDur.toFixed(0)} mins`}
              color="text-red-400" />
          </div>
        )}

        {/* ── EQUITY CURVE + ENTRY CONDITIONS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Equity Curve */}
          <div className="lg:col-span-2 bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <TrendingUp size={14} className="text-green-400" />
                Cumulative P&L — Equity Curve
              </h2>
              <span className="text-[10px] text-slate-500">2024 · {trades.length} expiry days</span>
            </div>
            <EquityCurve trades={trades} />
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Live indicators */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
                <Zap size={14} className="text-yellow-400" />
                Entry Conditions
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {indicators.map(ind => <IndicatorBadge key={ind.label} {...ind} />)}
              </div>
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2
                ${indicators.every(i => i.ok)
                  ? "bg-green-900/30 text-green-300 border border-green-700/40"
                  : "bg-amber-900/30 text-amber-300 border border-amber-700/40"}`}>
                {indicators.every(i => i.ok)
                  ? <><CheckCircle size={12} /> All conditions met — Entry VALID</>
                  : <><AlertCircle size={12} /> {indicators.filter(i => !i.ok).length} condition(s) failing</>}
              </div>
            </div>

            {/* Exit reasons */}
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
                <BarChart2 size={14} className="text-blue-400" />
                Exit Breakdown
              </h2>
              <ExitReasonChart trades={trades} />
            </div>
          </div>
        </div>

        {/* ── TRADE LOG ── */}
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Filter size={14} className="text-slate-400" />
              Trade Log
              <span className="text-[10px] font-normal text-slate-500 ml-1">{filtered.length} records</span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "profit_target", "stop_loss", "no_move", "time_stop", "eod"].map(r => (
                <button key={r}
                  onClick={() => { setFilterReason(r); setPage(1); }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all
                    ${filterReason === r
                      ? r === "all"
                        ? "bg-slate-600 border-slate-500 text-white"
                        : ""
                      : "bg-slate-800/60 border-slate-700/40 text-slate-400 hover:border-slate-600"}`}
                  style={filterReason === r && r !== "all"
                    ? { backgroundColor: EXIT_COLORS[r] + "33", borderColor: EXIT_COLORS[r] + "88", color: EXIT_COLORS[r] }
                    : {}}>
                  {r === "all" ? "All" : EXIT_LABELS[r]}
                  {r !== "all" && exitCounts[r] ? ` (${exitCounts[r]})` : ""}
                </button>
              ))}
            </div>
          </div>
          <TradeLog trades={filtered} page={page} setPage={setPage} />
        </div>

        {/* ── STRATEGY LOGIC SUMMARY ── */}
        <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
            <Info size={14} className="text-slate-400" />
            Strategy Logic Summary
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-2">
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Entry</p>
              {[
                ["Instrument", "NIFTY ATM Straddle (CE + PE)"],
                ["Session", `${cfg.entry_start_h}:45 – ${cfg.entry_end_h}:30 IST`],
                ["VWAP", `Spot within ${cfg.vwap_proximity_pct}% of VWAP`],
                ["DEMA", `Slope < ${cfg.dema_slope_threshold}% (flat trend)`],
                ["RSI", `Between ${cfg.rsi_lower} – ${cfg.rsi_upper} (neutral)`],
                ["MACD", `|Histogram| ≤ ${cfg.macd_hist_threshold}`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-500 w-20 shrink-0">{k}</span>
                  <span className="text-slate-300">{v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Exit</p>
              {[
                ["Profit Target", `+${cfg.profit_target_pct}% of premium`],
                ["Stop Loss",     `-${cfg.stop_loss_pct}% of premium`],
                ["Time Stop",     `After ${cfg.time_stop_h}:00 IST`],
                ["No-Move",       `${cfg.no_move_minutes}m with <${cfg.no_move_threshold_pct}% move`],
                ["EOD",           "Expiry close if none triggered"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-500 w-24 shrink-0">{k}</span>
                  <span className="text-slate-300">{v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Costs & Sizing</p>
              {[
                ["Capital",    `₹${fmt(cfg.capital)}`],
                ["Lot Size",   `${cfg.lot_size} units`],
                ["Brokerage",  `₹${cfg.brokerage_per_order} × 4 legs`],
                ["Slippage",   `${cfg.slippage_pct}% both sides`],
                ["Indicator",  `DEMA(${cfg.dema_period}), RSI(${cfg.rsi_period}), MACD(${cfg.macd_fast},${cfg.macd_slow},${cfg.macd_signal})`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-500 w-20 shrink-0">{k}</span>
                  <span className="text-slate-300">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="text-center text-[10px] text-slate-600 py-3 border-t border-slate-800/50">
          Educational backtesting framework — not financial advice. Past performance does not guarantee future results.
        </footer>

      </main>
    </div>
  );
}
