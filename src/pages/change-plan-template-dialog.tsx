import { useEffect, useRef, useState } from 'react';
import { canSaveChangePlanDirectly, changePlanFromForm, planTextFields } from './change-plan-model';
import './change-plan-template-dialog.css';

type Props = {
  roles: string[];
  requestedBy?: string;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onClose: () => void;
  onSaved: (result: { status: string }) => void;
};
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export default function ChangePlanTemplateDialog({ roles, requestedBy, request, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const direct = canSaveChangePlanDirectly(roles);
  useEffect(() => { if (ref.current && !ref.current.open) { ref.current.showModal(); ref.current.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); } }, []);
  return <dialog ref={ref} className="change-plan-template-dialog" aria-labelledby="change-plan-template-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget || busy) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}>
    <div className="change-plan-template-heading"><div><h2 id="change-plan-template-title">New change template</h2><p>{direct ? 'Save a reusable plan. It will be available immediately.' : 'Submit a reusable plan for approval by your team lead, a manager or an administrator.'}</p></div><button type="button" className="secondary" disabled={busy} onClick={onClose}>Close</button></div>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <form onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
      let plan;
      try { plan = changePlanFromForm(form); } catch { setError('Choose valid planned dates.'); setBusy(false); return; }
      void request('/changes/templates', { method: 'POST', body: JSON.stringify({ ...plan, name: String(form.get('name') ?? '').trim() }) })
        .then(result => onSaved(result as { status: string })).catch(e => setError(e.message)).finally(() => setBusy(false));
    }}>
      <fieldset disabled={busy} className="change-plan-template-fields">
        <label className="wide">Technician<input readOnly value={requestedBy || 'Signed-in user'} /></label>
        <label className="wide">Template name<input name="name" required minLength={2} maxLength={200} placeholder="For example, Application configuration update" /></label>
        <label className="wide">Change title<input name="title" required minLength={3} maxLength={200} /></label>
        <label className="wide">Description<textarea name="description" required minLength={3} maxLength={10000} rows={3} /></label>
        <label>Category<select name="category">{['SERVER','CLOUD','MICROSOFT_365','NETWORK','SECURITY','APPLICATION','OTHER'].map(value => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        <label>Change type<select name="changeType">{['STANDARD','NORMAL'].map(value => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        <label>Risk<select name="risk">{['LOW','MEDIUM','HIGH','CRITICAL'].map(value => <option value={value} key={value}>{label(value)}</option>)}</select></label>
        <label>Expected downtime (minutes)<input type="number" name="downtimeMinutes" min={0} max={525600} step={1} defaultValue={0} required /></label>
        <label>Outage expected<select name="outageExpected"><option value="false">No</option><option value="true">Yes</option></select></label>
        <label>Notify client<select name="clientNotificationEnabled"><option value="false">No</option><option value="true">Yes, where approved</option></select></label>
        <label>Planned start<input type="datetime-local" name="plannedStart" /></label><label>Planned end<input type="datetime-local" name="plannedEnd" /></label>
        {planTextFields.map(([name, title]) => <label className="wide" key={name}>{title}<textarea name={name} rows={3} required={name !== 'communicationPlan'} minLength={name === 'communicationPlan' ? 0 : 2} maxLength={['impact','reason','businessJustification'].includes(name) ? 5000 : 10000} /></label>)}
        <p className="wide hint">Organisation, client, owner, requester, stakeholder contacts and attachments are entered separately for each change.</p>
        <div className="wide change-plan-template-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary">{busy ? 'Saving…' : direct ? 'Save template' : 'Submit for approval'}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
