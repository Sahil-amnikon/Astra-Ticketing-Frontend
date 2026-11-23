import { useEffect, useRef } from 'react';
import './custom-roles.css';

export default function DeleteRoleDialog({ name, busy, dirty, error, onCancel, onConfirm }: {
  name: string; busy: boolean; dirty: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="custom-role-dialog" aria-labelledby="delete-role-title"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 id="delete-role-title">Delete role</h2>
      <p>Delete the custom role <strong>{name}</strong>?</p>
      {dirty ? <p className="hint">Unsaved permission changes for this role will be discarded.</p> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="custom-role-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete role'}</button>
      </div>
    </div>
  </dialog>;
}
