import { FormEvent, useEffect, useRef, useState } from 'react';
import { uiLabel } from './ui-label';
import './ticket-qa-check.css';
type Row = Record<string, unknown>;
const criteria = [
  ['solutionAccuracy', 'Solution accuracy'], ['troubleshootingQuality', 'Troubleshooting quality'],
  ['communication', 'Communication'], ['processCompliance', 'Process compliance'],
] as const;
type Ratings = Record<typeof criteria[number][0], string>;
function reviewValue(value: unknown): Row {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Row : {};
  } catch { return {}; }
}
export default function TicketQaCheck({ ticket, history, request, onSaved }: {
  ticket: Row; history: Row[];
  request: (path: string, init?: RequestInit) => Promise<unknown>; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Ratings>({ solutionAccuracy: '', troubleshootingQuality: '', communication: '', processCompliance: '' });
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const latest = [...history].reverse().find(event => event.action === 'TICKET.QA_REVIEWED');
  const lastReview = reviewValue(latest?.new_value);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal(); return () => element.close();
  }, [open]);
  const text = (value: unknown, fallback = 'Not recorded') => value == null || value === '' ? fallback : String(value);
  const rated = criteria.map(([key]) => Number(ratings[key])).filter(score => score >= 1 && score <= 4);
  const average = rated.length ? rated.reduce((total, score) => total + score, 0) / rated.length : null;
  function showReview() {
    setRatings(Object.fromEntries(criteria.map(([key]) => [key, lastReview[key] == null ? '' : String(Number(lastReview.criteriaVersion) === 3 ? Math.min(4, Number(lastReview[key])) : Math.max(1, Math.round(Number(lastReview[key]) * 4 / 5)))])) as Ratings);
    setComment(text(lastReview.comment, '')); setError('');  setOpen(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      await request(`/tickets/${ticket.id}/qa-reviews`, { method: 'POST',
        body: JSON.stringify({ ...Object.fromEntries(criteria.map(([key]) => [key, ratings[key] ? Number(ratings[key]) : null])), comment: comment.trim(), criteriaVersion: 3 }),
      });
      dialog.current?.close(); setOpen(false); onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'QA review could not be saved.'); }
    finally { setSaving(false); }
  }
  return <>
    <button type="button" className="primary ticket-qa-button" onClick={showReview}>QA Check</button>
    {open && <dialog ref={dialog} className="ticket-qa-dialog" aria-labelledby="ticket-qa-title"
      onClose={() => setOpen(false)} onCancel={event => { if (saving) event.preventDefault(); }}
      onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPress.current = event.target === event.currentTarget &&
          (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
      }}
      onPointerCancel={() => { backdropPress.current = false; }}
      onPointerUp={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const outside = event.target === event.currentTarget &&
          (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
        if (backdropPress.current && outside && !saving) event.currentTarget.close();
        backdropPress.current = false;
      }}>
      <header className="ticket-qa-heading">
        <div><h2 id="ticket-qa-title">QA Check · {text(ticket.ticket_number)}</h2><p>{text(ticket.subject)}</p></div>
        <button autoFocus type="button" className="secondary" disabled={saving} onClick={() => dialog.current?.close()}>Close</button>
      </header>
      <dl className="ticket-qa-facts">
        {[['Assignee', text(ticket.assigned_name, 'Unassigned')], ['Status', uiLabel(ticket.status)],
          ['MSP', text(ticket.client_name)], ['Client', text(ticket.site_name)]].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <form className="ticket-qa-form" onSubmit={event => void submit(event)}>
        <fieldset disabled={saving} className="ticket-qa-ratings">
          <legend>Quality rating <small>Optional — rate each point out of 4 stars</small></legend>
          {latest && Number(lastReview.criteriaVersion) !== 3 && <small>Previous 5-star ratings are shown on the 4-star scale. Saving records a new review.</small>}
          {criteria.map(([key, label]) => <div key={key} className="ticket-qa-rating-row">
            <span id={`qa-label-${key}`}>{label}</span>
            <div className="ticket-qa-stars" role="radiogroup" aria-labelledby={`qa-label-${key}`}>
              {[1, 2, 3, 4].map(score => <label key={score} className={`ticket-qa-star${Number(ratings[key]) >= score ? ' is-filled' : ''}`}>
                <input type="radio" name={`qa-${key}`} value={score} checked={Number(ratings[key]) === score}
                  aria-label={`${score} ${score === 1 ? 'star' : 'stars'}`}
                  onChange={() => { setRatings(current => ({ ...current, [key]: String(score) }));  }} />
                <span aria-hidden="true">★</span>
              </label>)}
            </div>
          </div>)}
        </fieldset>
        <button type="button" className="secondary" disabled={saving || !rated.length}
          onClick={() => { setRatings({ solutionAccuracy: '', troubleshootingQuality: '', communication: '', processCompliance: '' });  }}>Clear ratings</button>
        <label className="ticket-qa-comment">Comment (optional)
          <textarea rows={3} maxLength={2000} disabled={saving} value={comment}
            placeholder="Explain the QA result and any improvement needed…"
            onChange={event => { setComment(event.target.value);  }} />
        </label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <footer className="ticket-qa-actions">
          <span role="status" aria-live="polite">{average == null ? 'Not rated' : `${rated.length === 4 ? 'Overall' : 'Rated points'}: ${Math.round(average * 25)}%`}</span>
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save QA review'}</button>
        </footer>
      </form>
    </dialog>}
  </>;
}
