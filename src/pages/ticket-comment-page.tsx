import { useState, type FormEvent } from 'react';
import Link from '../navigation/link';
import './ticket-comment-page.css';

type Props = {
  ticketId: string; ticketNumber: string; subject: string;
  type: 'INTERNAL' | 'PUBLIC'; backHref: string;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
};

export default function TicketCommentPage({ticketId,ticketNumber,subject,type,backHref,request}:Props) {
  const [body,setBody]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[saved,setSaved]=useState(false);
  const internal=type==='INTERNAL';
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(busy||!body.trim())return;
    setBusy(true);setError('');setSaved(false);
    try {
      await request(`/tickets/${ticketId}/comments`,{
        method:'POST',body:JSON.stringify({type,body:body.trim()}),
      });
      setBody('');setSaved(true);
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'Unable to save. Your text has been kept; please retry.');
    } finally {setBusy(false);}
  }
  return <div className="ticket-comment-page">
    <section className="panel ticket-comment-heading">
      <div><p className="eyebrow">{ticketNumber}</p><h1>{internal?'Internal note':'Public reply'}</h1><p>{subject}</p></div>
      <Link className="secondary" href={backHref}>Back to ticket</Link>
    </section>
    <form className="panel ticket-comment-form" onSubmit={submit}>
      <p className="notice">{internal?'Visible only to service-desk staff. This note is saved in the ticket history.':'Visible to the requester and saved in the ticket history. Email delivery depends on the configured mail routing.'}</p>
      {error?<p className="notice error" role="alert">{error}</p>:null}
      {saved?<p className="notice success" role="status">{internal?'Internal note':'Public reply'} saved successfully. <Link href={backHref}>View ticket history</Link></p>:null}
      <label htmlFor="ticket-comment-body">{internal?'Internal note':'Reply to requester'}</label>
      <textarea id="ticket-comment-body" name="body" autoFocus required maxLength={20000} rows={10} value={body} disabled={busy} onChange={event=>{setBody(event.target.value);setSaved(false);}} placeholder={internal?'Add troubleshooting details, a handover or other staff-only information…':'Write your update for the requester…'}/>
      <div className="ticket-comment-footer"><small>{body.length.toLocaleString()} / 20,000 characters</small><button type="submit" className="primary" disabled={busy||!body.trim()}>{busy?'Saving…':internal?'Save internal note':'Save public reply'}</button></div>
    </form>
  </div>;
}
