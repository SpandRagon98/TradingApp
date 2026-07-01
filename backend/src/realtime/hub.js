// WebSocket hub — pushes live events (alerts, trades, risk updates) to the
// dashboard at ws://<host>/ws. Pure-JS `ws`, no native deps. Broadcast is
// fire-and-forget; a slow/closed client never blocks the engines.

import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';

const clients = new Set();
let wss = null;

export function attachWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.debug('ws client connected', { clients: clients.size });
    safeSend(ws, { type: 'hello', ts: new Date().toISOString() });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  return wss;
}

/** Broadcast an event object to every connected dashboard. */
export function broadcast(event) {
  if (!clients.size) return;
  const msg = JSON.stringify({ ts: new Date().toISOString(), ...event });
  for (const ws of clients) safeSend(ws, msg);
}

export function clientCount() {
  return clients.size;
}

function safeSend(ws, payload) {
  try {
    if (ws.readyState === 1) ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  } catch {
    clients.delete(ws);
  }
}
