import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Btn, Metrics } from '../components/ui.jsx';

export default function BrokerSettings() {
  const { config, canTrade, refreshConfig } = useApp();
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ apiKey: '', apiSecret: '', totp: '' });

  const load = async () => {
    const [s, t] = await Promise.all([api('/broker/status'), api('/broker/groww/status')]);
    if (s.ok) setStatus(s.status);
    if (t.ok) setToken(t.token);
  };
  useEffect(() => {
    load();
  }, []);

  const reconnect = async () => {
    setBusy('reconnect');
    await api('/broker/connect', { method: 'POST' });
    await load();
    await refreshConfig();
    setBusy('');
  };

  const connectGroww = async () => {
    setBusy('groww');
    setMsg('');
    const body = {};
    if (form.apiKey) body.apiKey = form.apiKey;
    if (form.apiSecret) body.apiSecret = form.apiSecret;
    if (form.totp) body.totp = form.totp;
    const r = await api('/broker/groww/connect', { method: 'POST', body });
    setBusy('');
    setMsg(r.ok ? 'Groww token generated ✓' : 'Failed: ' + r.error);
    setForm({ apiKey: '', apiSecret: '', totp: '' });
    await load();
    await refreshConfig();
  };

  const disconnect = async () => {
    setBusy('disc');
    await api('/broker/groww/disconnect', { method: 'POST' });
    await load();
    await refreshConfig();
    setBusy('');
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="Broker Status" right={<Btn onClick={reconnect} disabled={busy === 'reconnect'}>{busy === 'reconnect' ? '…' : 'Re-check'}</Btn>}>
        {status ? (
          <Metrics
            items={[
              { label: 'Broker', value: status.broker },
              { label: 'Connected', value: status.connected ? 'yes' : 'no', valueClass: status.connected ? 'pos' : 'neg' },
              { label: 'Mode', value: status.mode },
              { label: 'Live trading', value: config?.liveTradingEnabled ? 'ENABLED' : 'paper', valueClass: config?.liveTradingEnabled ? 'neg' : 'pos' },
            ]}
          />
        ) : (
          <div className="muted">Loading…</div>
        )}
        {status && <div className="muted" style={{ marginTop: 8 }}>{status.detail}</div>}
      </Card>

      <Card title="Groww Token">
        {token ? (
          <Metrics
            items={[
              { label: 'Token', value: token.present ? 'present' : 'none', valueClass: token.present ? 'pos' : 'neg' },
              { label: 'Source', value: token.source },
              { label: 'Expires', value: token.expiresAt ? new Date(token.expiresAt).toLocaleString() : '—' },
              { label: 'Auto-refresh', value: token.canAutoRefresh ? 'yes' : 'no', valueClass: token.canAutoRefresh ? 'pos' : '' },
            ]}
          />
        ) : (
          <div className="muted">Loading…</div>
        )}
        {token?.fingerprint && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Fingerprint: <code>{token.fingerprint}</code> — a safe identifier, not the token itself.
          </div>
        )}
        {canTrade && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <Btn onClick={connectGroww} primary disabled={busy === 'groww'}>
              {busy === 'groww' ? 'Connecting…' : 'Generate / refresh token'}
            </Btn>
            {token?.present && (
              <Btn onClick={disconnect} disabled={busy === 'disc'}>
                Disconnect
              </Btn>
            )}
          </div>
        )}
        {msg && <div className={msg.startsWith('Failed') ? 'warn' : 'notice'} style={{ marginTop: 8 }}>{msg}</div>}
      </Card>

      {canTrade && (
        <Card title="Connect with API key (optional — .env is preferred)">
          <div className="notice" style={{ marginBottom: 10 }}>
            Recommended: put credentials in the backend <code>.env</code> for an auto-refreshing daily token. Use this form only for a one-off
            runtime connect. Values go to your local backend and are never stored in the browser. Leave blank to use the <code>.env</code> credentials.
          </div>
          <div className="controls">
            <label className="field">
              API key
              <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="uses .env if blank" />
            </label>
            <label className="field">
              API secret
              <input type="password" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} />
            </label>
            <label className="field">
              or TOTP code
              <input value={form.totp} onChange={(e) => setForm({ ...form, totp: e.target.value })} placeholder="6-digit" />
            </label>
          </div>
          <div className="notice">Official Groww Trading API over HTTPS only — no scraping, no app automation, no login bypass.</div>
        </Card>
      )}
    </div>
  );
}
