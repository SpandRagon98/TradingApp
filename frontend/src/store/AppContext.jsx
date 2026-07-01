// App-wide shared state: session/user, config, risk status, alerts, and the
// WebSocket live status. Alerts arrive live over the socket and prepend to the
// list; risk refreshes on each alert and on a 15s timer.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken } from '../services/api.js';
import { connectWS, onMessage, onStatus } from '../services/ws.js';

const Ctx = createContext(null);
export function useApp() {
  return useContext(Ctx);
}

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [risk, setRisk] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [live, setLive] = useState('offline');
  const [user, setUser] = useState(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const refreshConfig = useCallback(async () => {
    const r = await api('/config');
    if (r.ok) setConfig(r.config);
  }, []);
  const refreshRisk = useCallback(async () => {
    const r = await api('/risk/status');
    if (r.ok) setRisk(r.risk);
  }, []);
  const refreshAlerts = useCallback(async () => {
    const r = await api('/alerts');
    if (r.ok) setAlerts(r.alerts);
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await api('/auth/me');
    setAuthEnabled(Boolean(r.authEnabled));
    setUser(r.ok ? r.user : null);
    setAuthReady(true);
    return r;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (r.ok && r.token) {
        setToken(r.token);
        setUser(r.user);
        await Promise.all([refreshConfig(), refreshRisk(), refreshAlerts()]);
      }
      return r;
    },
    [refreshConfig, refreshRisk, refreshAlerts],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      await refreshMe();
      refreshConfig();
      refreshRisk();
      refreshAlerts();
    })();
    connectWS(); // idempotent
    const offStatus = onStatus(setLive);
    const offMsg = onMessage((e) => {
      if (e.type === 'alert') {
        setAlerts((a) => [e.alert, ...a].slice(0, 200));
        refreshRisk();
      }
    });
    const onUnauth = () => setUser(null);
    window.addEventListener('auth:unauthorized', onUnauth);
    const timer = setInterval(refreshRisk, 15000);
    return () => {
      offStatus();
      offMsg();
      clearInterval(timer);
      window.removeEventListener('auth:unauthorized', onUnauth);
    };
  }, [refreshMe, refreshConfig, refreshRisk, refreshAlerts]);

  const killSwitch = useCallback(
    async (on) => {
      await api('/live/kill-switch', { method: 'POST', body: { on } });
      refreshRisk();
    },
    [refreshRisk],
  );

  const role = user?.role || null;
  const isRole = (...roles) => roles.includes(role);
  const canTrade = isRole('admin', 'trader');
  const isAdmin = role === 'admin';

  return (
    <Ctx.Provider
      value={{
        config,
        risk,
        alerts,
        live,
        user,
        role,
        authEnabled,
        authReady,
        isRole,
        canTrade,
        isAdmin,
        login,
        logout,
        refreshConfig,
        refreshRisk,
        refreshAlerts,
        killSwitch,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
