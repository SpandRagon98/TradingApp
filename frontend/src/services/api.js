// Thin fetch wrapper. All calls go through the Vite proxy to the backend /api.
// Auth-aware: attaches the stored Bearer token, and on a 401 clears it and
// notifies the app to drop back to the login screen.
const BASE = '/api';

let token = null;
try {
  token = localStorage.getItem('authToken') || null;
} catch {
  /* localStorage unavailable */
}

export function setToken(t) {
  token = t || null;
  try {
    if (t) localStorage.setItem('authToken', t);
    else localStorage.removeItem('authToken');
  } catch {
    /* ignore */
  }
}
export function getToken() {
  return token;
}

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(opts.headers || {}),
      },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  const data = await res.json().catch(() => ({ ok: false, error: 'Bad JSON' }));
  if (!res.ok && data.ok === undefined) return { ok: false, error: data.error || 'HTTP ' + res.status, status: res.status };
  return { status: res.status, ...data };
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
