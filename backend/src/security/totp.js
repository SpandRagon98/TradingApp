// RFC 6238 TOTP generator — used for the Groww "totp" token-generation flow when
// the operator supplies a TOTP *secret* (so the daily token can be refreshed
// unattended). If they instead paste a live 6-digit code, this is not needed.
//
// Pure Node crypto, no external dependency.

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generate a TOTP code.
 * @param {string} secret  Base32-encoded shared secret.
 * @param {object} [opts]  { step=30s, digits=6, t=Date.now(), algorithm='sha1' }
 */
export function generateTotp(secret, { step = 30, digits = 6, t = Date.now(), algorithm = 'sha1' } = {}) {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algorithm, base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
