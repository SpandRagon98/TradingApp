import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useApp } from '../store/AppContext.jsx';
import { Card, Field, Select, Btn } from '../components/ui.jsx';

export default function Users() {
  const { isAdmin, user } = useApp();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(['admin', 'trader', 'viewer']);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'trader' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    const r = await api('/auth/users');
    if (r.ok) {
      setUsers(r.users);
      setRoles(r.roles || roles);
    } else setErr(r.error);
  };
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Card title="Users">
        <div className="warn">Only admins can manage users.</div>
      </Card>
    );
  }

  const create = async () => {
    setErr('');
    setMsg('');
    const r = await api('/auth/users', { method: 'POST', body: form });
    if (r.ok) {
      setMsg(`Created ${r.user.email}`);
      setForm({ email: '', password: '', name: '', role: 'trader' });
      load();
    } else setErr(r.error);
  };
  const changeRole = async (id, role) => {
    await api(`/auth/users/${id}`, { method: 'PATCH', body: { role } });
    load();
  };
  const toggleActive = async (u) => {
    await api(`/auth/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
    load();
  };
  const resetPw = async (u) => {
    const np = prompt(`New password for ${u.email} (min 8 characters):`);
    if (!np) return;
    const r = await api(`/auth/users/${u.id}/reset-password`, { method: 'POST', body: { newPassword: np } });
    setMsg(r.ok ? `Password reset for ${u.email}` : r.error);
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="Add user">
        <div className="controls">
          <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Password"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role"><Select value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={roles} /></Field>
          <Btn onClick={create} primary>Create</Btn>
        </div>
        {err && <div className="warn">{err}</div>}
        {msg && <div className="notice">{msg}</div>}
      </Card>

      <Card title="Users" right={<span className="muted">{users.length}</span>}>
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Active</th><th>Last login</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.email}
                  {u.id === user?.id && <span className="tag" style={{ marginLeft: 6 }}>you</span>}
                </td>
                <td><Select value={u.role} onChange={(v) => changeRole(u.id, v)} options={roles} /></td>
                <td className={u.active ? 'pos' : 'neg'}>{u.active ? 'yes' : 'no'}</td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                <td>
                  <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" onClick={() => toggleActive(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                    <button className="btn btn-sm" onClick={() => resetPw(u)}>Reset PW</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
