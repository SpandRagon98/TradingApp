// Central configuration. Reads from environment (loaded via `node --env-file=.env`).
// Secrets stay server-side; see publicConfig() for what the frontend may see.

function num(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return /^(1|true|yes|on)$/i.test(v);
}

function str(name, def) {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}

const broker = str('BROKER', 'mock').toLowerCase();
const mode = str('TRADING_MODE', 'paper').toLowerCase();

// Normalize the Groww API base so it always includes the version segment.
// Accepts "https://api.groww.in", ".../", or ".../v1" and yields ".../v1".
function growwBase(raw) {
  let b = (raw || 'https://api.groww.in/v1').trim().replace(/\/+$/, '');
  if (!/\/v\d+$/.test(b)) b += '/v1';
  return b;
}

export const config = {
  port: num('PORT', 8080),

  // "paper" | "live". Defaults to paper. Live is additionally gated below.
  mode,

  // "mock" | "groww"
  broker,

  // Risk defaults — the single source of truth for the risk engine.
  risk: {
    capital: num('CAPITAL', 50000),
    riskPerTradePct: num('RISK_PER_TRADE_PCT', 1),
    maxDailyLossPct: num('MAX_DAILY_LOSS_PCT', 2),
    minRiskReward: num('MIN_RISK_REWARD', 2),
    maxTradesPerDay: num('MAX_TRADES_PER_DAY', 5),
    maxOpenTrades: num('MAX_OPEN_TRADES', 3),
    maxConsecutiveLosses: num('MAX_CONSECUTIVE_LOSSES', 3),
  },

  costs: {
    brokeragePerOrder: num('BROKERAGE_PER_ORDER', 20),
    slippageBps: num('SLIPPAGE_BPS', 5), // basis points applied to fills
  },

  groww: {
    base: growwBase(str('GROWW_API_BASE', 'https://api.groww.in/v1')),
    apiVersion: str('GROWW_API_VERSION', '1.0'),
    // Optional static daily token (manual). The token lifecycle manager normally
    // generates and stores one; runtimeToken mirrors the active token.
    accessToken: str('GROWW_ACCESS_TOKEN', ''),
    runtimeToken: '',
    apiKey: str('GROWW_API_KEY', ''),
    apiSecret: str('GROWW_API_SECRET', ''),
    totpSecret: str('GROWW_TOTP_SECRET', ''),
    autoRefresh: bool('GROWW_AUTO_REFRESH', true),
    defaultExchange: str('GROWW_DEFAULT_EXCHANGE', 'NSE'),
    defaultSegment: str('GROWW_DEFAULT_SEGMENT', 'CASH'),
    defaultProduct: str('GROWW_DEFAULT_PRODUCT', 'MIS'),
    // Stop-loss-market order type enum (confirm against Groww before first live use).
    stopOrderType: str('GROWW_STOP_ORDER_TYPE', 'SL_M'),
  },

  security: {
    // Used for JWT signing + token-at-rest encryption key derivation. If empty, a
    // strong random secret is generated once and persisted (see security/crypto).
    appSecret: str('APP_SECRET', ''),
    jwtTtlHours: num('JWT_TTL_HOURS', 12),
  },

  auth: {
    // When false (default), the app runs single-user with an implicit local admin
    // so nothing breaks. Set AUTH_ENABLED=true to require login for every request.
    enabled: bool('AUTH_ENABLED', false),
    bootstrapAdminEmail: str('ADMIN_EMAIL', ''),
    bootstrapAdminPassword: str('ADMIN_PASSWORD', ''),
  },

  // Triple-gate: live trading requires the flag AND live mode AND (for groww) a token.
  liveTradingFlag: bool('ENABLE_LIVE_TRADING', false),
};

/** The active Groww access token (runtime-generated takes precedence over env). */
export function growwToken() {
  return config.groww.runtimeToken || config.groww.accessToken || '';
}

/** Whether live order execution is permitted right now. Deliberately strict. */
export function liveTradingEnabled() {
  if (!config.liveTradingFlag) return false;
  if (config.mode !== 'live') return false;
  if (config.broker === 'groww' && !growwToken()) return false;
  return true;
}

/** Config safe to expose to the frontend — never includes secrets. */
export function publicConfig() {
  return {
    mode: config.mode,
    broker: config.broker,
    liveTradingEnabled: liveTradingEnabled(),
    authEnabled: config.auth.enabled,
    risk: config.risk,
    costs: config.costs,
    groww: {
      configured: Boolean(growwToken()),
      apiKeyConfigured: Boolean(config.groww.apiKey),
      defaultExchange: config.groww.defaultExchange,
      defaultSegment: config.groww.defaultSegment,
      defaultProduct: config.groww.defaultProduct,
    },
    // Back-compat for the existing dashboard.
    grm: { configured: Boolean(growwToken()) },
  };
}
