// Cryptographic primitives — all from Node's built-in `crypto`, no external deps.
//
//  - Password hashing:      scrypt with a per-password random salt.
//  - Secret-at-rest crypto: AES-256-GCM (used to encrypt the Groww access token
//                           before it is written to the store).
//  - Helpers:               sha256 hex (Groww checksum), random ids/tokens.
//
// The encryption / JWT signing key is derived from APP_SECRET. If APP_SECRET is
// not provided, a strong random secret is generated ONCE and persisted in the
// store so that encrypted data and issued sessions survive a restart on the same
// machine. NEVER log the secret, the derived key, or any plaintext token.

import {
  scryptSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { getKv, setKv } from '../store.js';
import { config } from '../config.js';

// ─── App secret / key derivation ─────────────────────────────────────────────

let _key = null;
let _secret = null;

/** The raw application secret (used for JWT signing and key derivation). */
export function getAppSecret() {
  if (_secret) return _secret;
  if (config.security.appSecret) {
    _secret = config.security.appSecret;
    return _secret;
  }
  // No APP_SECRET configured → generate once and persist so sessions/tokens
  // remain valid across restarts. This is per-install, never shipped.
  let s = getKv('appSecret', null);
  if (!s) {
    s = randomBytes(32).toString('hex');
    setKv('appSecret', s);
  }
  _secret = s;
  return _secret;
}

function encryptionKey() {
  if (_key) return _key;
  _key = scryptSync(getAppSecret(), 'trading-app-kdf-v1', 32);
  return _key;
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(String(password), salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ─── Secret-at-rest encryption (AES-256-GCM) ─────────────────────────────────

/** Encrypt a short secret (e.g. an access token) for storage. */
export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

/** Decrypt a value produced by encryptSecret(). Returns '' on any failure. */
export function decryptSecret(blob) {
  try {
    if (!blob) return '';
    const [v, ivB, tagB, dataB] = String(blob).split('.');
    if (v !== 'v1') return '';
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

// ─── Misc helpers ────────────────────────────────────────────────────────────

/** SHA-256 hex digest — used to build the Groww token approval checksum. */
export const sha256Hex = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/** Short non-secret fingerprint of a token, safe to display/log. */
export const fingerprint = (s) => (s ? sha256Hex(s).slice(0, 12) : null);

export const randomId = () => randomUUID();

/** A human-typeable random password for bootstrap accounts. */
export const randomPassword = (n = 18) => randomBytes(n).toString('base64url').slice(0, n);
