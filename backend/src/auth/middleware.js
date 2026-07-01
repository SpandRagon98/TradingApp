// Express auth middleware.
//
//  authenticate      — always runs; if a valid Bearer JWT is present, attaches
//                      req.user. Never rejects on its own.
//  requireAuth       — rejects unauthenticated requests when AUTH_ENABLED=true.
//                      When AUTH_ENABLED=false, injects a synthetic local admin so
//                      the app is fully usable single-user without logging in.
//  requireRole(...)  — gate by role.
//  requirePermission — gate by fine-grained permission.

import { verifyJwt } from './jwt.js';
import { findById, roleCan } from './users.js';
import { config } from '../config.js';

const SYNTHETIC_ADMIN = { id: 'single-user', email: 'local', name: 'Local Operator', role: 'admin', synthetic: true };

export function authenticate(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : req.headers['x-auth-token'] || '';
  const claims = token ? verifyJwt(token) : null;
  if (claims) {
    const u = findById(claims.sub);
    if (u && u.active && (u.tokenVersion || 1) === claims.tv) {
      req.user = { id: u.id, email: u.email, name: u.name, role: u.role };
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!config.auth.enabled) {
    if (!req.user) req.user = SYNTHETIC_ADMIN;
    return next();
  }
  if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!config.auth.enabled) {
      if (!req.user) req.user = SYNTHETIC_ADMIN;
      return next();
    }
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

export function requirePermission(perm) {
  return (req, res, next) => {
    if (!config.auth.enabled) {
      if (!req.user) req.user = SYNTHETIC_ADMIN;
      return next();
    }
    if (!req.user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    if (!roleCan(req.user.role, perm)) {
      return res.status(403).json({ ok: false, error: `Missing permission: ${perm}` });
    }
    next();
  };
}
