import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';

export default function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.ok) setErr(r.error || 'Login failed');
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo">▮▮</span>
          <div>
            <h1>Trading Assistant</h1>
            <p>Sign in to continue</p>
          </div>
        </div>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@example.com" />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>
        {err && <div className="warn">{err}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || !email || !password} style={{ width: '100%', marginTop: 6 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
          First run? The one-time admin credential was printed in the backend console. Change it after signing in.
        </p>
      </form>
    </div>
  );
}
