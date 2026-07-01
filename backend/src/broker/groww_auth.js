// Groww authentication & access-token lifecycle.
//
// Groww issues a daily access token that expires at 06:00 IST. It can be obtained
// two ways from POST {base}/token/api/access with header Authorization: Bearer
// <API_KEY> and X-API-VERSION:
//
//   approval flow — body { key_type:'approval', checksum, timestamp }
//                   checksum = SHA256(apiSecret + epochSeconds)
//   totp flow     — body { key_type:'totp', totp:'<6-digit code>' }
//
// The resulting token is encrypted at rest (AES-256-GCM) and cached in memory.
// `config.groww.runtimeToken` mirrors the live token so liveTradingEnabled() and
// the broker adapter pick it up without a static env token. We NEVER log the
// token or the secret — only a short non-secret fingerprint.

import { config } from '../config.js';
import { getKv, setKv } from '../store.js';
import { encryptSecret, decryptSecret, sha256Hex, fingerprint } from '../security/crypto.js';
import { generateTotp } from '../security/totp.js';
import { logger } from '../logger.js';

const KV = 'growwAuth';
let cache = null; // { token, expiresAt, generatedAt }

function base() {
  return config.groww.base.replace(/\/$/, '');
}

/** Next 06:00 IST (in epoch ms) at or after `fromMs`. */
function nextExpiryMs(fromMs = Date.now()) {
  const IST = 5.5 * 3600 * 1000;
  const ist = new Date(fromMs + IST);
  let six = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0, 0) - IST;
  if (six <= fromMs) six += 24 * 3600 * 1000;
  return six;
}

function load() {
  if (cache) return cache;
  const raw = getKv(KV, null);
  if (raw && raw.tokenEnc) {
    const token = decryptSecret(raw.tokenEnc);
    if (token) {
      cache = { token, expiresAt: raw.expiresAt || null, generatedAt: raw.generatedAt || null };
      config.groww.runtimeToken = isExpired(cache) ? '' : token;
    }
  }
  return cache;
}

function isExpired(c) {
  return Number.isFinite(c?.expiresAt) && Date.now() >= c.expiresAt;
}

/** Coerce Groww's expiry (epoch seconds/ms or an ISO date string) to epoch-ms. */
function parseExpiry(raw) {
  if (raw == null || raw === '') return nextExpiryMs();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n; // seconds vs ms
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : nextExpiryMs();
}

function persist(token, expiresAt) {
  cache = { token, expiresAt, generatedAt: Date.now() };
  setKv(KV, {
    tokenEnc: encryptSecret(token),
    expiresAt,
    generatedAt: cache.generatedAt,
    fingerprint: fingerprint(token),
  });
  config.groww.runtimeToken = token;
}

/** Load any persisted token at startup. Safe to call once from the server. */
export function initGrowwAuth() {
  const c = load();
  if (c) {
    logger.info('groww token loaded', { expiresAt: c.expiresAt, expired: isExpired(c), fp: fingerprint(c.token) });
  }
  return tokenStatus();
}

/** The current usable access token, or '' if none/expired. */
export function getAccessToken() {
  const c = load();
  if (c && c.token && !isExpired(c)) return c.token;
  return config.groww.accessToken || ''; // static env fallback (manual daily token)
}

/** Non-secret status for the UI/API. */
export function tokenStatus() {
  const c = load();
  const usable = Boolean(getAccessToken());
  const raw = getKv(KV, {}) || {};
  return {
    present: usable,
    source: c?.token ? 'generated' : config.groww.accessToken ? 'env' : 'none',
    expiresAt: c?.expiresAt || null,
    expired: c ? isExpired(c) : false,
    generatedAt: c?.generatedAt || null,
    fingerprint: raw.fingerprint || (config.groww.accessToken ? fingerprint(config.groww.accessToken) : null),
    apiKeyConfigured: Boolean(config.groww.apiKey),
    canAutoRefresh: Boolean(config.groww.apiKey && (config.groww.apiSecret || config.groww.totpSecret)),
  };
}

/**
 * Generate (or refresh) the access token.
 * @param {object} args { apiKey?, apiSecret?, totp?, totpSecret? }
 *   - If apiSecret given → approval flow.
 *   - Else if totp/totpSecret given → totp flow.
 * Falls back to configured env credentials when args are omitted (used by the
 * auto-refresh worker).
 */
export async function generateAccessToken(args = {}) {
  const apiKey = args.apiKey || config.groww.apiKey;
  if (!apiKey) throw new Error('Groww API key is required (set GROWW_API_KEY or provide apiKey).');

  const apiSecret = args.apiSecret || config.groww.apiSecret;
  const totpSecret = args.totpSecret || config.groww.totpSecret;
  const totp = args.totp || (totpSecret ? generateTotp(totpSecret) : null);

  let body;
  if (apiSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    body = { key_type: 'approval', checksum: sha256Hex(apiSecret + timestamp), timestamp };
  } else if (totp) {
    body = { key_type: 'totp', totp };
  } else {
    throw new Error('Provide an API secret (approval flow) or a TOTP code/secret (totp flow).');
  }

  let res;
  try {
    res = await fetch(base() + '/token/api/access', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-API-VERSION': config.groww.apiVersion,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`Could not reach Groww token endpoint: ${err.code || err.name}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('Groww rejected the credentials (check API key / secret / TOTP).');
  }
  if (!res.ok) throw new Error(`Groww token request failed (HTTP ${res.status}).`);

  const data = await res.json().catch(() => ({}));
  const token =
    data.token || data.access_token || data.accessToken || data?.payload?.token || data?.data?.token || '';
  if (!token) throw new Error('Groww token response did not contain a token.');

  const expiresAt = parseExpiry(data.expiry ?? data.expiry_time ?? data.expiresAt);
  persist(token, expiresAt);
  logger.info('groww token generated', { flow: body.key_type, expiresAt, fp: fingerprint(token) });
  return tokenStatus();
}

/** Forget the token (disconnect). */
export function clearToken() {
  cache = null;
  setKv(KV, null);
  config.groww.runtimeToken = '';
  logger.info('groww token cleared');
  return tokenStatus();
}

/** Used by the refresh worker: regenerate if expired/expiring and we have creds. */
export async function refreshIfNeeded() {
  const c = load();
  const soon = !c || !Number.isFinite(c.expiresAt) || isExpired(c) || c.expiresAt - Date.now() < 10 * 60 * 1000;
  if (!soon) return { refreshed: false, ...tokenStatus() };
  if (!config.groww.apiKey || !(config.groww.apiSecret || config.groww.totpSecret)) {
    return { refreshed: false, reason: 'no stored credentials for auto-refresh', ...tokenStatus() };
  }
  await generateAccessToken();
  return { refreshed: true, ...tokenStatus() };
}
