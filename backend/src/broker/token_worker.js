// Background token worker.
//
// When BROKER=groww and API credentials are configured, this mints the Groww
// access token at startup (so live data/orders work without a manual connect
// call) and refreshes it before the daily 06:00 IST expiry. It is a complete
// no-op when the broker isn't Groww or no credentials are present, so the app
// stays safe and runnable out of the box.

import { config } from '../config.js';
import { generateAccessToken, refreshIfNeeded, tokenStatus } from './groww_auth.js';
import { resetBroker } from './broker.js';
import { logger } from '../logger.js';

let timer = null;

function hasCreds() {
  return Boolean(config.groww.apiKey && (config.groww.apiSecret || config.groww.totpSecret));
}

/**
 * Start the worker. Returns a status object. Safe to call once at startup.
 * @param {object} [opts] { intervalMs } refresh check cadence (default 10 min).
 */
export async function startTokenWorker({ intervalMs = 10 * 60 * 1000 } = {}) {
  if (config.broker !== 'groww') return { started: false, reason: 'broker is not groww', ...tokenStatus() };

  // A static GROWW_ACCESS_TOKEN (manual daily token) needs no minting/refresh.
  if (!hasCreds()) {
    return { started: false, reason: 'no api key/secret or totp configured', ...tokenStatus() };
  }

  // Mint once at startup if we don't already hold a usable token (or its expiry
  // is unknown, so the daily auto-refresh has a real deadline to work against).
  const st = tokenStatus();
  if (!st.present || st.expired || !Number.isFinite(st.expiresAt)) {
    try {
      await generateAccessToken();
      resetBroker();
      logger.info('groww token minted at startup', { fp: tokenStatus().fingerprint });
    } catch (e) {
      // Non-fatal: app keeps running on the mock broker until a token is obtained.
      logger.warn('groww startup token mint failed', { error: e.message });
    }
  }

  if (config.groww.autoRefresh && !timer) {
    timer = setInterval(async () => {
      try {
        const r = await refreshIfNeeded();
        if (r.refreshed) {
          resetBroker();
          logger.info('groww token refreshed', { fp: r.fingerprint });
        }
      } catch (e) {
        logger.warn('groww token refresh failed', { error: e.message });
      }
    }, intervalMs);
    timer.unref?.(); // don't keep the process alive just for this timer
  }

  return { started: true, ...tokenStatus() };
}

export function stopTokenWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
