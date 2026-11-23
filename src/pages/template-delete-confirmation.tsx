import { useEffect, useRef, useState } from 'react';
import './template-delete-confirmation.css';

export default function TemplateDeleteConfirmation({ name, busy, onCancel, onConfirm }: {
  name: string; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  return <dialog ref={dialog} className="template-delete-confirmation" aria-labelledby="template-delete-title" aria-describedby="template-delete-description"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="template-delete-title">Delete template?</h2>
    <p id="template-delete-description">Delete <strong>{name}</strong>? It will no longer appear in saved templates. Existing changes will remain unchanged.</p>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <div className="template-delete-confirmation-actions">
      <button ref={cancel} type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="template-delete-confirm" disabled={busy} onClick={() => { setError(''); void onConfirm().catch(error => setError(error instanceof Error ? error.message : 'Unable to delete the template. Please retry.')); }}>{busy ? 'Deleting…' : 'Delete template'}</button>
    </div>
  </dialog>;
}
