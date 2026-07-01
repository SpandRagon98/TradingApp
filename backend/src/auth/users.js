// User accounts, roles, and permissions.
//
// Roles:
//   admin  — full control: user management, settings, broker connect, live trading.
//   trader — can run/execute trades, modify risk, connect broker. No user admin.
//   viewer — read-only: dashboards, reports, journal. Cannot execute or change.
//
// Passwords are stored as scrypt hashes (never plaintext). Sessions are stateless
// JWTs; a per-user `tokenVersion` lets us revoke all of a user's sessions (e.g. on
// password change/reset) by bumping the version.

import { list, insert, update } from '../store.js';
import { hashPassword, verifyPassword, randomPassword } from '../security/crypto.js';
import { config } from '../config.js';

export const ROLES = ['admin', 'trader', 'viewer'];

const PERMISSIONS = {
  admin: ['*'],
  trader: [
    'read',
    'trade.execute',
    'trade.modify',
    'order.cancel',
    'strategy.toggle',
    'risk.update',
    'broker.connect',
    'watchlist.edit',
    'paper.run',
    'backtest.run',
    'scanner.run',
  ],
  viewer: ['read'],
};

export function roleCan(role, perm) {
  const list_ = PERMISSIONS[role] || [];
  return list_.includes('*') || list_.includes(perm);
}

const norm = (email) => String(email || '').toLowerCase().trim();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function strip(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

export function findByEmail(email) {
  const e = norm(email);
  return list('users').find((u) => u.email === e) || null;
}
export function findById(id) {
  return list('users').find((u) => u.id === id) || null;
}
export function listUsers() {
  return list('users').map(strip);
}

export function createUser({ email, password, name = '', role = 'trader' }) {
  const e = norm(email);
  if (!EMAIL_RE.test(e)) throw new Error('A valid email is required');
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters');
  if (!ROLES.includes(role)) throw new Error(`Invalid role (use one of: ${ROLES.join(', ')})`);
  if (findByEmail(e)) throw new Error('A user with that email already exists');
  const row = insert('users', {
    email: e,
    name: String(name || ''),
    role,
    passwordHash: hashPassword(password),
    active: true,
    tokenVersion: 1,
    lastLoginAt: null,
  });
  return strip(row);
}

/** Returns the full user record (incl. role/tokenVersion) on success, else null. */
export function verifyCredentials(email, password) {
  const u = findByEmail(email);
  if (!u || !u.active) return null;
  if (!verifyPassword(password, u.passwordHash)) return null;
  update('users', u.id, { lastLoginAt: new Date().toISOString() });
  return u;
}

export function setRole(id, role) {
  if (!ROLES.includes(role)) throw new Error('Invalid role');
  update('users', id, { role });
  return strip(findById(id));
}

export function setActive(id, active) {
  update('users', id, { active: Boolean(active) });
  // Disabling an account also revokes its sessions.
  if (!active) bumpTokenVersion(id);
  return strip(findById(id));
}

export function changePassword(id, newPassword) {
  if (!newPassword || String(newPassword).length < 8) throw new Error('Password must be at least 8 characters');
  const u = findById(id);
  if (!u) return false;
  update('users', id, { passwordHash: hashPassword(newPassword), tokenVersion: (u.tokenVersion || 1) + 1 });
  return true;
}

export function bumpTokenVersion(id) {
  const u = findById(id);
  if (!u) return;
  update('users', id, { tokenVersion: (u.tokenVersion || 1) + 1 });
}

/**
 * Ensure at least one admin exists. Called at startup. If none, create one from
 * ADMIN_EMAIL/ADMIN_PASSWORD, or generate a random password and print it ONCE so
 * the operator can log in. (Bootstrap credential shown only at first run.)
 */
export function bootstrapAdmin() {
  const admins = list('users').filter((u) => u.role === 'admin');
  if (admins.length) return null;
  const email = config.auth.bootstrapAdminEmail || 'admin@trading.local';
  let password = config.auth.bootstrapAdminPassword;
  const generated = !password;
  if (generated) password = randomPassword();
  createUser({ email, password, name: 'Administrator', role: 'admin' });
  // Print directly (NOT via the structured logger, which would redact it) so the
  // operator sees the one-time bootstrap credential.
  process.stdout.write(
    `\n──────────────────────────────────────────────────────────────\n` +
      ` Bootstrap admin account created\n` +
      `   email:    ${email}\n` +
      `   password: ${generated ? password : '[from ADMIN_PASSWORD env]'}\n` +
      `   Log in and change this password immediately.\n` +
      `──────────────────────────────────────────────────────────────\n\n`,
  );
  return { email, generated };
}
