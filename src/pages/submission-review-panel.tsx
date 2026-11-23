import { useEffect, useState } from 'react';
import { reviewedFetch } from './reviewed-fetch';
import './submission-review-panel.css';

type Review = {
  entity_id: string; status: string; revision: number; title: string; content: string;
  author_name: string; client_name?: string; comment?: string; can_review: boolean | number;
  impact?: string; implementation_plan?: string; test_plan?: string; rollback_plan?: string;
  root_cause?: string; workaround?: string; resolution?: string; description?: string;
  visibility?: string; risk?: string; change_type?: string; priority?: string;
};
type Props = { kind: 'CHANGE' | 'PROBLEM' | 'KNOWLEDGE' | 'SERVICE'; csrfToken: string; revision: number; onReviewed: () => void };
const extraFields = ['description', 'visibility', 'risk', 'change_type', 'priority', 'impact', 'implementation_plan', 'test_plan', 'rollback_plan', 'root_cause', 'workaround', 'resolution'] as const;
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export default function SubmissionReviewPanel({ kind, csrfToken, revision, onReviewed }: Props) {
  const [items, setItems] = useState<Review[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void reviewedFetch(`/api/submission-reviews/${kind}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error?.message ?? 'Unable to load submissions.'); return data; })
      .then(data => { setItems(data.items); setError(''); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [kind, revision, refresh]);
  async function decide(item: Review, decision: 'APPROVED' | 'REJECTED') {
    if (busy) return;
    if (decision === 'REJECTED' && comment.trim().length < 3) { setError('Add a short reason so the author knows what to change.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await reviewedFetch(`/api/submission-reviews/${kind}/${item.entity_id}/decision`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ decision, comment: comment.trim(), revision: item.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error?.message ?? 'Unable to save the review.');
      setNotice(decision === 'APPROVED' ? 'Approved. The submission is now available within its permitted audience.' : 'Returned to the author for changes.');
      setSelected(undefined); setComment(''); setRefresh(x => x + 1); onReviewed();
    } catch (e) { setError((e as Error).message); setRefresh(x => x + 1); }
    finally { setBusy(false); }
  }
  return <details className="panel expandable-panel submission-review-panel">
    <summary><span className="expandable-title">Review submissions · {items.filter(item => item.status === 'PENDING').length} awaiting review{error ? ' · Refresh needed' : ''}</span><span className="expandable-chevron" aria-hidden="true" /></summary>
    <div className="expandable-body">
    <div className="submission-review-heading"><div><h2>Review submissions</h2><p>Technician submissions need approval from their team lead, a manager or an administrator before release.</p></div>
      <button type="button" className="secondary" disabled={busy} onClick={() => setRefresh(x => x + 1)}>Refresh</button></div>
    {error ? <p role="alert" className="notice error">{error}</p> : null}
    {notice ? <p role="status" className="notice success">{notice}</p> : null}
    {!items.length && !error ? <p className="hint">No submissions to review. Your own submissions will also appear here.</p> : null}
    {items.map(item => <div className="submission-review-item" key={item.entity_id}>
      <div className="submission-review-heading"><div><strong>{item.title}</strong><p>{item.author_name}{item.client_name ? ` · ${item.client_name}` : ''} · {item.status === 'PENDING' ? 'Awaiting review' : item.status === 'REJECTED' ? 'Changes requested' : 'Approved'}</p></div>
        <button type="button" className="secondary" disabled={busy} aria-expanded={selected === item.entity_id} onClick={() => { setSelected(selected === item.entity_id ? undefined : item.entity_id); setComment(''); setError(''); }}>{selected === item.entity_id ? 'Close' : 'View submission'}</button></div>
      {selected === item.entity_id ? <div className="submission-review-content">
        <p>{item.content}</p>
        {extraFields.map(field => item[field] ? <div key={field}><strong>{label(field)}</strong><p>{item[field]}</p></div> : null)}
        {item.comment ? <p><strong>Review comment:</strong> {item.comment}</p> : null}
        {Boolean(item.can_review) && item.status === 'PENDING' ? <div className="submission-review-decision">
          <label>Review comment <textarea value={comment} maxLength={2000} onChange={e => setComment(e.target.value)} placeholder="Optional for approval; required when requesting changes." /></label>
          <div className="submission-review-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void decide(item, 'REJECTED')}>Request changes</button><button type="button" className="primary" disabled={busy} onClick={() => void decide(item, 'APPROVED')}>{busy ? 'Saving…' : 'Approve and release'}</button></div>
        </div> : null}
      </div> : null}
    </div>)}
    </div>
  </details>;
}
