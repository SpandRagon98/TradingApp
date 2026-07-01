// Singleton WebSocket connection with auto-reconnect and pub/sub.
let ws = null;
let status = 'offline';
const msgListeners = new Set();
const statusListeners = new Set();

export function connectWS() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
  } catch {
    setStatus('offline');
    return;
  }
  ws.onopen = () => setStatus('live');
  ws.onclose = () => { setStatus('offline'); setTimeout(connectWS, 3000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onmessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }
    msgListeners.forEach((fn) => fn(data));
  };
}

export function onMessage(fn) { msgListeners.add(fn); return () => msgListeners.delete(fn); }
export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export function wsStatus() { return status; }

function setStatus(s) { status = s; statusListeners.forEach((fn) => fn(s)); }
