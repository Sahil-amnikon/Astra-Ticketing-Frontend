import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { reviewedFetch } from './reviewed-fetch';
import { formatApiDate } from './api-time';
import { changeReviewQuery, defaultChangeReviewFilter, type ChangeReviewFilter } from './change-review-query';
import './change-review-workspace.css';

type Review = {
  entity_id: string; change_number: string; title: string; author_name: string; reviewer_name?: string;
  owner_name?: string; selected_approver_name?: string; site_names?: string; department_names?: string; client_name: string; site_name?: string; status: string; revision: number;
  submitted_at: string; reviewed_at?: string; comment?: string; can_review: boolean | number;
  risk: string; change_type: string; change_status: string;
  change_title?: string; downtime_minutes?: number; outage_expected?: boolean; client_notification_enabled?: boolean; planned_start?: string; planned_end?: string;
  content?: string; impact?: string; reason?: string; business_justification?: string;
  implementation_plan?: string; test_plan?: string; rollback_plan?: string; communication_plan?: string;
};
type Result = { items: Review[]; total: number; page: number; pageSize: number; clients: { id: string; name: string }[] };
const fields = [['change_title', 'Change title'], ['content', 'Description'], ['impact', 'Impact assessment'], ['reason', 'Reason for change'], ['business_justification', 'Business justification'], ['implementation_plan', 'Implementation plan'], ['test_plan', 'Testing and validation'], ['rollback_plan', 'Rollback plan'], ['communication_plan', 'Communication plan']] as const;
const status = (value: string) => value === 'PENDING' ? 'Waiting for review' : value === 'APPROVED' ? 'Approved' : 'Changes requested';
const label = (value?: string) => value?.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) ?? '—';

function ChangeReviewDialog({children,busy,onClose}:{children:ReactNode;busy:boolean;onClose:()=>void}){
  const dialog=useRef<HTMLElement>(null),close=useRef(onClose),saving=useRef(busy);close.current=onClose;saving.current=busy;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;
    const background=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&!node.contains(dialog.current)).map(node=>({node,inert:node.inert}));
    background.forEach(({node})=>{node.inert=true;});document.body.style.overflow='hidden';
    (dialog.current?.querySelector<HTMLElement>('button:not([disabled])')??dialog.current)?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();if(!saving.current)close.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')??[])].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(!first){event.preventDefault();dialog.current?.focus();return;}
      if(!dialog.current?.contains(document.activeElement)||(!event.shiftKey&&document.activeElement===last)||(event.shiftKey&&document.activeElement===first)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
    };
    document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('keydown',keyboard);background.forEach(({node,inert})=>{node.inert=inert;});document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return createPortal(<div className="change-review-modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={dialog} tabIndex={-1} className="panel change-review-detail change-review-dialog" role="dialog" aria-modal="true" aria-labelledby="change-review-dialog-title" aria-busy={busy}>{children}</section></div>,document.body);
}

export default function ChangeReviewWorkspace({ csrfToken,canReviewTemplates=true }: { csrfToken: string; workspace: string; canReviewTemplates?:boolean }) {
  const [requestType, setRequestType] = useState<'CHANGE' | 'TEMPLATE'>('CHANGE');
  const [filter, setFilter] = useState<ChangeReviewFilter>({ ...defaultChangeReviewFilter });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Result>({ items: [], total: 0, page: 1, pageSize: 20, clients: [] });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Review>();
  const [selected, setSelected] = useState<string>();
  const detailRequest=useRef(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await reviewedFetch(`/api${path}`, { ...init, cache: 'no-store', headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), 'x-csrf-token': csrfToken } });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw Error(result?.error?.message ?? `Unable to load change reviews (HTTP ${response.status}).`);
    return result as T;
  }, [csrfToken]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    let query: string;
    try { query = changeReviewQuery({ ...filter, clientId: requestType === 'TEMPLATE' ? '' : filter.clientId }, page); }
    catch (e) { setError((e as Error).message); setLoading(false); return; }
    void request<Result>(`${requestType === 'TEMPLATE' ? '/changes/template-reviews' : '/changes/reviews'}?${query}`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) {
        setData(result);
        const last = Math.max(1, Math.ceil(result.total / result.pageSize));
        if (page > last) setPage(last);
      }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, page, refresh, request, requestType]);
  function update(values: Partial<ChangeReviewFilter>) { setFilter(current => ({ ...current, ...values })); setPage(1); setSelected(undefined); }
  function resetReview(){detailRequest.current++;setSelected(undefined);setDetail(undefined);setDetailLoading(false);setComment('');setError('');}
  function closeReview(){if(!busy)resetReview();}
  async function open(id: string) {
    const sequence=++detailRequest.current;
    setSelected(id); setDetail(undefined); setComment(''); setDetailLoading(true); setError('');
    try { const result=await request<Review>(`${requestType === 'TEMPLATE' ? '/changes/template-reviews' : '/changes/reviews'}/${id}`);if(sequence===detailRequest.current)setDetail(result); }
    catch (e) { if(sequence===detailRequest.current)setError((e as Error).message); }
    finally { if(sequence===detailRequest.current)setDetailLoading(false); }
  }
  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (!detail || busy) return;
    if (decision === 'REJECTED' && comment.trim().length < 3) { setError('Add a short comment explaining the changes needed.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await request(requestType === 'TEMPLATE' ? `/changes/templates/${detail.entity_id}/review` : `/submission-reviews/CHANGE/${detail.entity_id}/decision`, { method: 'POST', body: JSON.stringify({ decision, comment: comment.trim(), revision: detail.revision }) });
      setNotice(decision === 'APPROVED' ? requestType === 'TEMPLATE' ? 'Template approved. It is now available in saved plans. Each new change still needs its own approval.' : 'Change approved. The assigned technician can start work, record results and send it for closure review.' : 'The request was returned to the technician with your comment.');
      resetReview(); setRefresh(value => value + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="change-review-workspace" aria-label="Change request reviews">
    <form className="panel change-review-filters" onSubmit={event => { event.preventDefault(); update({ q: search }); }}>
      <label>Request type<select value={requestType} onChange={event => { setRequestType(event.target.value as 'CHANGE' | 'TEMPLATE'); update({ clientId: '' }); setNotice(''); }}><option value="CHANGE">Changes</option>{canReviewTemplates?<option value="TEMPLATE">Templates</option>:null}</select></label>
      <label>{requestType === 'TEMPLATE' ? 'Search templates' : 'Search changes'}<input type="search" value={search} maxLength={200} placeholder={requestType === 'TEMPLATE' ? 'Template name, change title or requester' : 'Change number, title or requester'} onChange={event => setSearch(event.target.value)} /></label>
      <label>Review status<select value={filter.status} onChange={event => update({ status: event.target.value })}>
        <option value="PENDING">Waiting for review</option><option value="APPROVED">Approved</option><option value="REJECTED">Changes requested</option><option value="ALL">All reviews</option>
      </select></label>
      <label>MSP<select value={filter.clientId} disabled={requestType === 'TEMPLATE'} onChange={event => update({ clientId: event.target.value })}><option value="">{requestType === 'TEMPLATE' ? 'Not applicable to reusable templates' : 'All permitted MSPs'}</option>{data.clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>
      <label>Submitted from<input type="date" value={filter.from} onChange={event => update({ from: event.target.value })} /></label>
      <label>Submitted to<input type="date" value={filter.to} onChange={event => update({ to: event.target.value })} /></label>
      <div className="change-review-actions"><button className="primary" disabled={busy}>Search</button><button type="button" className="secondary" disabled={busy} onClick={() => { setSearch(''); setFilter({ ...defaultChangeReviewFilter }); setPage(1); setSelected(undefined); }}>Clear filters</button></div>
    </form>
    {error && !selected ? <p className="notice error" role="alert">{error}</p> : null}
    {notice ? <p className="notice success" role="status">{notice}</p> : null}
    <section className="panel">
      <div className="change-review-heading"><div><h2>{filter.status === 'PENDING' ? requestType === 'TEMPLATE' ? 'Waiting templates' : 'Waiting change requests' : requestType === 'TEMPLATE' ? 'Template review history' : 'Change review history'}</h2><p className="hint">Team leads see their team’s submissions. Managers and administrators can review across teams.</p></div><button type="button" className="secondary" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
      {loading ? <p role="status">Loading change requests…</p> : <>
        <p className="hint">{data.total} matching {data.total === 1 ? 'request' : 'requests'}</p>
        <div className="change-review-table"><table><thead><tr><th>{requestType === 'TEMPLATE' ? 'Template' : 'Change'}</th><th>Requested by</th><th>{requestType === 'TEMPLATE' ? 'Type / Risk' : 'MSP / Client'}</th><th>Submitted</th><th>Review status</th><th>Action</th></tr></thead><tbody>
          {data.items.map(item => <tr key={item.entity_id}><td><strong>{item.change_number}</strong><span>{item.title}</span></td><td>{item.author_name}</td><td>{requestType === 'TEMPLATE' ? <>{label(item.change_type)}<span>{label(item.risk)}</span></> : <>{item.client_name}<span>{item.site_name ?? '—'}</span></>}</td><td>{formatApiDate(item.submitted_at)}</td><td><span className={`change-review-status status-${item.status.toLowerCase()}`}>{status(item.status)}</span></td><td><button type="button" className="secondary" disabled={busy || detailLoading} onClick={() => void open(item.entity_id)}>{item.status === 'PENDING' && Boolean(item.can_review) ? 'Review' : 'View'}</button></td></tr>)}
          {!data.items.length ? <tr><td colSpan={6}>No change requests match these filters.</td></tr> : null}
        </tbody></table></div>
        <div className="change-review-heading change-review-pagination"><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="change-review-actions"><button type="button" className="secondary" disabled={page <= 1 || busy} onClick={() => { setPage(value => value - 1); setSelected(undefined); }}>Previous</button><button type="button" className="secondary" disabled={page * data.pageSize >= data.total || busy} onClick={() => { setPage(value => value + 1); setSelected(undefined); }}>Next</button></div></div>
      </>}
    </section>
    {selected ? <ChangeReviewDialog busy={busy} onClose={closeReview}>
      <div className="change-review-heading"><h2 id="change-review-dialog-title">{detail ? `${detail.change_number} · ${detail.title}` : 'Change request'}</h2><button type="button" className="secondary" disabled={busy} onClick={closeReview}>Close</button></div>
      {error?<p className="notice error" role="alert">{error}</p>:null}
      {detailLoading ? <p role="status">Loading submission…</p> : detail ? <>
        <dl className="change-review-facts"><div><dt>Requested by</dt><dd>{detail.author_name}</dd></div>{requestType === 'CHANGE' ? <><div><dt>Owner</dt><dd>{detail.owner_name ?? '—'}</dd></div><div><dt>MSP</dt><dd>{detail.client_name}</dd></div><div><dt>Sites</dt><dd>{detail.site_names || detail.site_name || '—'}</dd></div><div><dt>Departments</dt><dd>{detail.department_names || '—'}</dd></div><div><dt>Approver</dt><dd>{detail.selected_approver_name || detail.reviewer_name || 'Not selected'}</dd></div></> : <><div><dt>Downtime</dt><dd>{detail.downtime_minutes ?? 0} minutes</dd></div><div><dt>Outage expected</dt><dd>{detail.outage_expected ? 'Yes' : 'No'}</dd></div><div><dt>Notify client</dt><dd>{detail.client_notification_enabled ? 'Yes, where approved' : 'No'}</dd></div><div><dt>Planned start</dt><dd>{formatApiDate(detail.planned_start)}</dd></div><div><dt>Planned end</dt><dd>{formatApiDate(detail.planned_end)}</dd></div></>}<div><dt>Type / Risk</dt><dd>{label(detail.change_type)} / {label(detail.risk)}</dd></div><div><dt>Review status</dt><dd>{status(detail.status)}</dd></div><div><dt>Reviewed by</dt><dd>{detail.reviewer_name ?? 'Awaiting review'}</dd></div><div><dt>Reviewed at</dt><dd>{formatApiDate(detail.reviewed_at)}</dd></div></dl>
        {fields.map(([field, name]) => detail[field] ? <div key={field}><h3>{name}</h3><p className="change-review-text">{detail[field]}</p></div> : null)}
        {detail.comment ? <div><h3>Previous review comment</h3><p className="change-review-text">{detail.comment}</p></div> : null}
        {Boolean(detail.can_review) && detail.status === 'PENDING' ? <div className="change-review-decision"><label>Review comment<textarea value={comment} maxLength={2000} rows={3} placeholder="Optional for approval; required when requesting changes." onChange={event => setComment(event.target.value)} /></label><div className="change-review-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void decide('REJECTED')}>Request changes</button><button type="button" className="primary" disabled={busy} onClick={() => void decide('APPROVED')}>{busy ? 'Saving…' : requestType === 'TEMPLATE' ? 'Approve template' : 'Approve CM'}</button></div></div> : detail.status === 'PENDING' ? <p className="hint">{requestType === 'TEMPLATE' ? 'You cannot approve your own template.' : 'This request is read-only for your account. Only its selected approver can decide it; Normal changes cannot be self-approved.'}</p> : null}
      </> : null}
    </ChangeReviewDialog> : null}
  </section>;
}
