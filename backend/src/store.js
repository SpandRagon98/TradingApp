// Persistence layer. Same interface regardless of backend.
//
// Primary backend: SQLite via Node's built-in `node:sqlite` (no native deps).
// Fallback backend: JSON file (used if node:sqlite is unavailable or STORAGE=json).
//
// Records are stored schemaless (an `id`, `created_at`, and a JSON `data` blob per
// row) so the rest of the app keeps using flexible record shapes. Singletons
// (settings, riskState) live in a key/value table. The exported functions —
// insert/update/list/audit/getRiskState/setRiskState/getSettings/setSettings — are
// identical to the previous JSON-only store, so nothing downstream changes.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const COLLECTIONS = ['trades', 'journal', 'signals', 'auditLog', 'alerts', 'users', 'orders'];
const TABLE = {
  trades: 'trades',
  journal: 'journal',
  signals: 'signals',
  auditLog: 'audit_log',
  alerts: 'alerts',
  users: 'users',
  orders: 'orders',
};

const DEFAULT_RISK = { day: null, dailyPnl: 0, tradesToday: 0, consecutiveLosses: 0, openTrades: 0, killSwitch: false };

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}
function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── Backend selection ───────────────────────────────────────────────────────

let impl = null;

function backend() {
  if (impl) return impl;
  const want = (process.env.STORAGE || 'sqlite').toLowerCase();
  if (want !== 'json') {
    try {
      impl = makeSqlite();
      impl.kind = 'sqlite';
      return impl;
    } catch (err) {
      // Fall through to JSON if node:sqlite isn't available on this runtime.
      process.stderr.write(JSON.stringify({ level: 'warn', msg: 'sqlite unavailable, using json store', detail: err.message }) + '\n');
    }
  }
  impl = makeJson();
  impl.kind = 'json';
  return impl;
}

export function storageKind() {
  return backend().kind;
}

// ─── SQLite backend ──────────────────────────────────────────────────────────

function makeSqlite() {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require('node:sqlite'); // throws on older Node → caught above
  ensureDir();
  const db = new DatabaseSync(join(DATA_DIR, 'trading.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  for (const t of Object.values(TABLE)) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, created_at TEXT, data TEXT)`);
  }
  db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');

  const getKv = (key, def) => {
    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : def;
  };
  const setKv = (key, value) => {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
    return value;
  };
  // Seed riskState if absent.
  if (getKv('riskState', null) == null) setKv('riskState', DEFAULT_RISK);

  return {
    insert(collection, record) {
      const t = TABLE[collection];
      if (!t) throw new Error(`Unknown collection ${collection}`);
      const row = { id: id(), createdAt: new Date().toISOString(), ...record };
      db.prepare(`INSERT INTO ${t} (id, created_at, data) VALUES (?, ?, ?)`).run(row.id, row.createdAt, JSON.stringify(row));
      return row;
    },
    update(collection, recordId, patch) {
      const t = TABLE[collection];
      const found = db.prepare(`SELECT data FROM ${t} WHERE id = ?`).get(recordId);
      if (!found) return null;
      const row = { ...JSON.parse(found.data), ...patch };
      db.prepare(`UPDATE ${t} SET data = ? WHERE id = ?`).run(JSON.stringify(row), recordId);
      return row;
    },
    list(collection, filter) {
      const t = TABLE[collection];
      const rows = db.prepare(`SELECT data FROM ${t} ORDER BY created_at ASC`).all().map((r) => JSON.parse(r.data));
      if (!filter) return rows;
      return rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
    },
    getKv,
    setKv,
  };
}

// ─── JSON backend (fallback) ─────────────────────────────────────────────────

function makeJson() {
  const FILE = join(DATA_DIR, 'store.json');
  let db;
  ensureDir();
  if (existsSync(FILE)) {
    try { db = JSON.parse(readFileSync(FILE, 'utf8')); } catch { db = null; }
  }
  if (!db) db = { trades: [], journal: [], signals: [], auditLog: [], alerts: [], kv: { riskState: { ...DEFAULT_RISK } } };
  for (const c of COLLECTIONS) if (!db[c]) db[c] = [];
  if (!db.kv) db.kv = {};
  if (!db.kv.riskState) db.kv.riskState = { ...DEFAULT_RISK };
  const persist = () => writeFileSync(FILE, JSON.stringify(db, null, 2));
  persist();

  return {
    insert(collection, record) {
      const row = { id: id(), createdAt: new Date().toISOString(), ...record };
      db[collection].push(row);
      persist();
      return row;
    },
    update(collection, recordId, patch) {
      const row = db[collection].find((r) => r.id === recordId);
      if (!row) return null;
      Object.assign(row, patch);
      persist();
      return row;
    },
    list(collection, filter) {
      const rows = (db[collection] || []).slice();
      if (!filter) return rows;
      return rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
    },
    getKv(key, def) { return key in db.kv ? db.kv[key] : def; },
    setKv(key, value) { db.kv[key] = value; persist(); return value; },
  };
}

// ─── Public interface (unchanged) ────────────────────────────────────────────

export function insert(collection, record) {
  return backend().insert(collection, record);
}
export function update(collection, recordId, patch) {
  return backend().update(collection, recordId, patch);
}
export function list(collection, filter) {
  return backend().list(collection, filter);
}
export function audit(action, meta) {
  return insert('auditLog', { action, meta: meta ?? null });
}
export function getRiskState() {
  return backend().getKv('riskState', { ...DEFAULT_RISK });
}
export function setRiskState(patch) {
  const next = { ...getRiskState(), ...patch };
  return backend().setKv('riskState', next);
}
export function getSettings() {
  return backend().getKv('settings', {});
}
export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  return backend().setKv('settings', next);
}

/** Generic key/value access (used for app secret, Groww token, schedules, etc.). */
export function getKv(key, def) {
  return backend().getKv(key, def);
}
export function setKv(key, value) {
  return backend().setKv(key, value);
}
