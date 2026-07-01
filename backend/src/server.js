// HTTP server. Serves the REST API under /api, the static dashboard at /, and a
// WebSocket live feed at /ws.
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, publicConfig } from './config.js';
import { logger } from './logger.js';
import { router } from './api/routes.js';
import { authRouter } from './api/auth_routes.js';
import { authenticate, requireAuth } from './auth/middleware.js';
import { bootstrapAdmin } from './auth/users.js';
import { initGrowwAuth } from './broker/groww_auth.js';
import { startTokenWorker } from './broker/token_worker.js';
import { attachWebSocket } from './realtime/hub.js';
import { storageKind } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging (no bodies — avoids logging anything sensitive).
app.use((req, _res, next) => {
  logger.debug('request', { method: req.method, path: req.path });
  next();
});

// Populate req.user from a Bearer token if present (never rejects here).
app.use(authenticate);

// Public health check (no auth, for load balancers / probes).
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'up', time: new Date().toISOString() }));

// Auth endpoints (login is public; the rest self-gate).
app.use('/api/auth', authRouter);

// Everything else under /api requires a session (a synthetic local admin when
// AUTH_ENABLED=false, so single-user mode keeps working without login).
app.use('/api', requireAuth, router);

// Static dashboard.
app.use(express.static(join(__dirname, '..', 'public')));

// 404 for unknown API routes.
app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));

// Central error handler.
app.use((err, _req, res, _next) => {
  logger.error('unhandled', { message: err.message });
  res.status(500).json({ ok: false, error: 'Internal error' });
});

const server = createServer(app);
attachWebSocket(server);

// One-time startup: ensure an admin exists and load any persisted Groww token.
bootstrapAdmin();
const grow = initGrowwAuth();

// If Groww credentials are configured, mint/refresh the access token in the
// background (no-op otherwise). Fire-and-forget; never blocks startup.
startTokenWorker().catch((e) => logger.warn('token worker error', { error: e.message }));

server.listen(config.port, () => {
  logger.info('server started', {
    port: config.port,
    mode: config.mode,
    broker: config.broker,
    storage: storageKind(),
    authEnabled: config.auth.enabled,
    liveTrading: publicConfig().liveTradingEnabled,
    // Key intentionally not named "*token*" so the redactor doesn't mask the status.
    growwAuth: grow.present ? `present (${grow.source})` : 'none',
    url: `http://localhost:${config.port}`,
    ws: `ws://localhost:${config.port}/ws`,
  });
});
