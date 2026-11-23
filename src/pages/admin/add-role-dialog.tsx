import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Request } from './record-form';
import './custom-roles.css';

export type RoleOption = { code: string; name?: string; baseRole?: string; permissions: string[]; custom?: boolean };
const labels: Record<string, string> = { USER: 'User', INTERN: 'Intern', TECHNICIAN: 'Technician', TEAM_LEAD: 'Team Lead', MANAGER: 'Manager', ADMIN: 'Administrator' };
export default function AddRoleDialog({ roles, request, onClose, onCreated }: {
  roles: RoleOption[]; request: Request; onClose: () => void; onCreated: (code: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [base, setBase] = useState('TECHNICIAN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const source = roles.find(role => role.code === base && !role.custom);
    if (!source) { setError('Refresh the role list and try again.'); return; }
    setBusy(true); setError('');
    try {
      const result = await request('/admin/access-policies/roles', { method: 'POST', body: JSON.stringify({ name: name.trim(), baseRole: base, permissions: source.permissions }) }) as { code: string };
      onCreated(result.code);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="custom-role-dialog" aria-labelledby="add-role-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={event => void create(event)}>
      <h2 id="add-role-title">Add role</h2>
      <p>Create a role, then choose its permissions.</p>
      <label>Role name<input autoFocus required minLength={2} maxLength={80} value={name} disabled={busy} placeholder="For example, Support Engineer" onChange={event => setName(event.target.value)} /></label>
      <label>Based on<select value={base} disabled={busy} onChange={event => setBase(event.target.value)}>
        {roles.filter(role => !role.custom).map(role => <option key={role.code} value={role.code}>{labels[role.code] ?? role.code}</option>)}
      </select></label>
      <p className="hint">The base profile controls workspaces and ticket actions. MSP and client access is assigned separately for each employee.</p>
      {['USER', 'INTERN', 'MANAGER', 'ADMIN'].includes(base) ? <p className="notice">This base profile has fixed permissions.{['MANAGER', 'ADMIN'].includes(base) ? ' It gives full application access.' : ''}</p> : <p className="hint">You can adjust this role's supported permissions after creating it.</p>}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="custom-role-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || name.trim().length < 2}>{busy ? 'Creating…' : 'Create role'}</button></div>
    </form>
  </dialog>;
}
