import { useEffect, useRef, useState } from 'react';
import './article-ticket-picker.css';

type Ticket = { id: string; ticket_number: string; subject: string };
type Results = { items: Ticket[]; total: number };
export default function ArticleTicketPicker({ request, clientId, disabled }: {
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  clientId?: string; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket>();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Results>({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), page: String(page), pageSize: '20' });
      if (clientId) params.set('clientId', clientId);
      void request('/tickets?' + params, { signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) setResult(value as Results); })
        .catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, page, clientId, request]);
  return <>
    <input type="hidden" name="ticket" value={selected?.id ?? ''} />
    <div className="kb-ticket-selection">
    <button ref={trigger} type="button" className="kb-ticket-picker-trigger" disabled={disabled} aria-haspopup="dialog" aria-label={selected ? `Selected ticket ${selected.ticket_number}` : 'Select ticket'} onClick={() => { setOpen(true); setQuery(''); setPage(1); }}>
      {selected ? `${selected.ticket_number} — ${selected.subject}` : 'Select ticket'}
    </button>
    {selected ? <button type="button" className="secondary kb-ticket-clear" disabled={disabled} aria-label={`Remove selected ticket ${selected.ticket_number}`} onClick={() => { setSelected(undefined); trigger.current?.focus(); }}>× Remove selection</button> : null}
    </div>
    {open ? <dialog ref={dialog} className="kb-ticket-picker-dialog" aria-labelledby="kb-ticket-picker-title" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="kb-ticket-picker-heading"><h2 id="kb-ticket-picker-title">Select ticket</h2><button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button></div>
      <label>Search tickets<input autoFocus type="search" value={query} maxLength={200} placeholder="Ticket number or subject" onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      {loading ? <p role="status">Searching tickets…</p> : <>
        <p className="hint">{result.total} permitted tickets</p>
        <div className="kb-ticket-picker-results">{result.items.map(ticket => <button key={ticket.id} type="button" className="kb-ticket-picker-option" onClick={() => { setSelected(ticket); setOpen(false); }}><strong>{ticket.ticket_number}</strong><span>{ticket.subject}</span></button>)}</div>
        {!result.items.length ? <p>No permitted tickets match your search.</p> : null}
      </>}
      <div className="kb-ticket-picker-pagination"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(result.total / 20))}</span><button type="button" className="secondary" disabled={page * 20 >= result.total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </dialog> : null}
  </>;
}
