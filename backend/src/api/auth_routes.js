// Authentication & user-administration routes, mounted at /api/auth.
// Login is public; everything else requires a session. User CRUD requires admin.

import { Router } from 'express';
import { config } from '../config.js';
import {
  verifyCredentials,
  createUser,
  listUsers,
  setRole,
  setActive,
  changePassword,
  bumpTokenVersion,
  findById,
  ROLES,
} from '../auth/users.js';
import { signJwt } from '../auth/jwt.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { audit } from '../store.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = verifyCredentials(email, password);
  if (!u) {
    audit('login_failed', { email: String(email || '').slice(0, 80) });
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }
  const token = signJwt(
    { sub: u.id, tv: u.tokenVersion || 1, role: u.role, email: u.email },
    config.security.jwtTtlHours * 3600,
  );
  audit('login', { userId: u.id, email: u.email, role: u.role });
  res.json({ ok: true, token, user: { id: u.id, email: u.email, name: u.name, role: u.role } });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  audit('logout', { userId: req.user.id });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user, authEnabled: config.auth.enabled });
});

authRouter.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (config.auth.enabled) {
    const u = findById(req.user.id);
    if (!u) return res.status(404).json({ ok: false, error: 'User not found' });
    if (!verifyCredentials(u.email, currentPassword)) {
      return res.status(403).json({ ok: false, error: 'Current password is incorrect' });
    }
  }
  try {
    if (!changePassword(req.user.id, newPassword)) return res.status(404).json({ ok: false, error: 'User not found' });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  audit('password_changed', { userId: req.user.id });
  res.json({ ok: true });
});

// ── Admin: user management ──
authRouter.get('/users', requireRole('admin'), (_req, res) => {
  res.json({ ok: true, users: listUsers(), roles: ROLES });
});

authRouter.post('/users', requireRole('admin'), (req, res) => {
  try {
    const u = createUser(req.body || {});
    audit('user_created', { by: req.user.id, email: u.email, role: u.role });
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

authRouter.patch('/users/:id', requireRole('admin'), (req, res) => {
  const { role, active } = req.body || {};
  try {
    if (role != null) setRole(req.params.id, role);
    if (active != null) setActive(req.params.id, active);
    audit('user_updated', { by: req.user.id, id: req.params.id, role, active });
    res.json({ ok: true, user: listUsers().find((u) => u.id === req.params.id) || null });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

authRouter.post('/users/:id/reset-password', requireRole('admin'), (req, res) => {
  try {
    if (!changePassword(req.params.id, req.body?.newPassword)) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    bumpTokenVersion(req.params.id);
    audit('password_reset', { by: req.user.id, id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});
