// Minimal, self-contained JWT (HS256) using Node crypto — no external dependency.
// Tokens carry { sub (user id), tv (token version), role, email, iat, exp }.
// The signing key is the app secret; rotating it invalidates all sessions.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAppSecret } from '../security/crypto.js';

const b64urlJson = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function sign(data) {
  return createHmac('sha256', getAppSecret()).update(data).digest('base64url');
}

export function signJwt(payload, ttlSeconds = 12 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({ iat: now, exp: now + ttlSeconds, ...payload });
  return `${head}.${body}.${sign(`${head}.${body}`)}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = sign(`${head}.${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (claims.exp && Math.floor(Date.now() / 1000) > claims.exp) return null;
  return claims;
}
