// Structured logger with secret redaction. Plain JSON lines to stdout.
// NEVER log tokens, API keys, secrets, or TOTP. The redactor is a safety net.

const SECRET_KEYS = /(token|secret|apikey|api_key|password|totp|authorization)/i;

function redact(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

function emit(level, msg, meta) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

export const logger = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.DEBUG) emit('debug', msg, meta);
  },
};
