import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatApiDate } from '../api-time';
import '../change-review-workspace.css';
import './knowledge-review-table.css';
import { reviewedFetch } from '../reviewed-fetch';
import { KnowledgeContent } from './knowledge-content';
type Review = {entity_id:string;title:string;content:string;status:string;revision:number;author_name:string;client_name?:string;visibility:string;submitted_at:string;reviewed_at?:string;comment?:string;can_review:boolean|number;description?:string;root_cause?:string;workaround?:string;resolution?:string;priority?:string;linked_ticket_count?:number};
function KBReviewDialog({children,busy,onClose}:{children:ReactNode;busy:boolean;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{node?.close();};},[]);
  return <dialog ref={dialog} className="change-review-dialog kb-review-dialog" aria-labelledby="kb-review-title" aria-busy={busy}
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}
    onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>{children}</dialog>;
}
const reviewStatus=(value:string)=>value==='PENDING'?'Waiting for review':value==='REJECTED'?'Changes requested':'Approved';
export default function KnowledgeReview({csrfToken,revision,organizations,onReviewed,kind="KNOWLEDGE"}:{csrfToken:string;revision:number;organizations:{id:string;name:string}[];onReviewed:()=>void;kind?:"KNOWLEDGE"|"PROBLEM"|"SERVICE"}) {
  const title=kind==='PROBLEM'?'Review PM':kind==='SERVICE'?'Review services':'Review KB';
  const noun=kind==='PROBLEM'?'problems':kind==='SERVICE'?'services':'articles';
  const [status,setStatus]=useState('PENDING'),[q,setQ]=useState(''),[search,setSearch]=useState(''),[client,setClient]=useState(''),[page,setPage]=useState(1);
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [items,setItems]=useState<Review[]>([]),[total,setTotal]=useState(0),[selected,setSelected]=useState<string>(),[comment,setComment]=useState('');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
  useEffect(()=>{const controller=new AbortController();setLoading(true);void reviewedFetch((kind==='KNOWLEDGE'?'/api/knowledge-reviews?':`/api/delivery-reviews/${kind}?`)+new URLSearchParams({status,q:search,client,page:String(page),from,to}),{signal:controller.signal,cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error?.message??'Unable to load KB reviews.');return data;}).then(data=>{setItems(data.items);setTotal(data.total);setError('');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[kind,status,search,client,page,from,to,revision,refresh]);
  async function decide(item:Review,decision:'APPROVED'|'REJECTED') {
    if(busy)return;if(decision==='REJECTED'&&comment.trim().length<3){setError('Please explain what the author needs to change.');return;}setBusy(true);setError('');setNotice('');
    try{const r=await reviewedFetch(`/api/submission-reviews/${kind}/${item.entity_id}/decision`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({decision,comment:comment.trim(),revision:item.revision})});const data=await r.json();if(!r.ok)throw Error(data.error?.message??'Unable to save review.');setNotice(decision==='APPROVED'?'Approved. The submission is available within its permitted scope.':'Returned to the author for changes.');setSelected(undefined);setComment('');onReviewed();setRefresh(n=>n+1);}catch(e){setError((e as Error).message);setRefresh(n=>n+1);}finally{setBusy(false);}
  }
  if(kind==='KNOWLEDGE') {
    const active=items.find(item=>item.entity_id===selected);
    const close=()=>{if(!busy){setSelected(undefined);setComment('');setError('');}};
    return <section className="change-review-workspace" aria-label="Knowledge article reviews">
      <form className="panel change-review-filters" onSubmit={event=>{event.preventDefault();setSearch(q.trim());setPage(1);}}>
        <label>Request type<select value="KNOWLEDGE" disabled><option value="KNOWLEDGE">Knowledge articles</option></select></label>
        <label>Search articles<input type="search" value={q} maxLength={200} placeholder="Article title or author" onChange={event=>setQ(event.target.value)}/></label>
        <label>Review status<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="PENDING">Waiting for review</option><option value="APPROVED">Approved</option><option value="REJECTED">Changes requested</option><option value="ALL">All reviews</option></select></label>
        <label>MSP / Organization<select value={client} onChange={event=>{setClient(event.target.value);setPage(1);}}><option value="">All permitted organizations</option>{organizations.map(org=><option value={org.id} key={org.id}>{org.name}</option>)}</select></label>
        <label>Submitted from<input type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}}/></label>
        <label>Submitted to<input type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}}/></label>
        <div className="change-review-actions"><button className="primary" disabled={busy}>Search</button><button type="button" className="secondary" disabled={busy} onClick={()=>{setQ('');setSearch('');setStatus('PENDING');setClient('');setFrom('');setTo('');setPage(1);}}>Clear filters</button></div>
      </form>
      {error&&!active?<p className="notice error" role="alert">{error}</p>:null}
      {notice?<p className="notice success" role="status">{notice}</p>:null}
      <section className="panel">
        <div className="change-review-heading"><div><h2>{status==='PENDING'?'Waiting knowledge articles':'Knowledge review history'}</h2><p className="hint">Team leads review their team's submissions. Managers and administrators can review across teams.</p></div><button type="button" className="secondary" disabled={loading||busy} onClick={()=>setRefresh(value=>value+1)}>Refresh</button></div>
        {loading?<p role="status">Loading articles…</p>:<>
          <p className="hint">{total} matching {total===1?'request':'requests'}</p>
          <div className="change-review-table"><table><thead><tr><th>Article</th><th>Requested by</th><th>MSP / Organization</th><th>Submitted</th><th>Review status</th><th>Action</th></tr></thead><tbody>
            {items.map(item=><tr key={item.entity_id}><td><strong>{item.title}</strong><span>{item.visibility==='STAFF'?'Staff only':'Clients and staff'}</span></td><td>{item.author_name}</td><td>{item.client_name??'General'}</td><td>{formatApiDate(item.submitted_at)}</td><td><span className={'change-review-status status-'+item.status.toLowerCase()}>{reviewStatus(item.status)}</span></td><td><button type="button" className="secondary" disabled={busy} onClick={()=>{setSelected(item.entity_id);setComment('');setError('');}}>{item.status==='PENDING'&&Boolean(item.can_review)?'Review':'View'}</button></td></tr>)}
            {!items.length?<tr><td colSpan={6}>No articles match these filters.</td></tr>:null}
          </tbody></table></div>
          <div className="change-review-heading change-review-pagination"><span>Page {page} of {Math.max(1,Math.ceil(total/20))}</span><div className="change-review-actions"><button type="button" className="secondary" disabled={page===1||busy} onClick={()=>{setPage(value=>value-1);setSelected(undefined);}}>Previous</button><button type="button" className="secondary" disabled={page*20>=total||busy} onClick={()=>{setPage(value=>value+1);setSelected(undefined);}}>Next</button></div></div>
        </>}
      </section>
      {active?<KBReviewDialog busy={busy} onClose={close}>
        <div className="change-review-heading"><h2 id="kb-review-title">{active.title}</h2><button type="button" className="secondary" disabled={busy} onClick={close}>Close</button></div>
        {error?<p className="notice error" role="alert">{error}</p>:null}
        <dl className="change-review-facts"><div><dt>Created by</dt><dd>{active.author_name}</dd></div><div><dt>MSP / Organization</dt><dd>{active.client_name??'General'}</dd></div><div><dt>Audience</dt><dd>{active.visibility==='STAFF'?'Staff only':'Clients and staff'}</dd></div><div><dt>Review status</dt><dd>{reviewStatus(active.status)}</dd></div><div><dt>Submitted</dt><dd>{formatApiDate(active.submitted_at)}</dd></div><div><dt>Reviewed at</dt><dd>{formatApiDate(active.reviewed_at)}</dd></div></dl>
        <KnowledgeContent id={active.entity_id} body={active.content}/>
        {active.comment?<p><strong>Previous review:</strong> {active.comment}</p>:null}
        {Boolean(active.can_review)&&active.status==='PENDING'?<div className="change-review-decision"><label>Review comment<textarea value={comment} rows={3} maxLength={2000} placeholder="Optional for approval; required when requesting changes." onChange={event=>setComment(event.target.value)}/></label><div className="change-review-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void decide(active,'REJECTED')}>Request changes</button><button type="button" className="primary" disabled={busy} onClick={()=>void decide(active,'APPROVED')}>{busy?'Saving…':'Approve and publish'}</button></div></div>:active.status==='PENDING'?<p className="hint">Another authorized reviewer must approve your own submission.</p>:null}
      </KBReviewDialog>:null}
    </section>;
  }
  return <section className="panel v38-stack"><div className="v38-row"><div><h2>{title}</h2><p>Review {noun} submitted by your team. Technician submissions require independent approval before release.</p></div><button className="secondary" type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
    <form className="kb-review-filters" onSubmit={e=>{e.preventDefault();setSearch(q);setPage(1);}}><label>Title or author<input value={q} maxLength={200} onChange={e=>setQ(e.target.value)} /></label><label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="PENDING">Awaiting review</option><option value="APPROVED">Approved</option><option value="REJECTED">Changes requested</option><option value="ALL">All history</option></select></label><label>{'Client'}<select value={client} onChange={e=>{setClient(e.target.value);setPage(1);}}><option value="">All permitted organizations</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Submitted from<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}} /></label><label>Submitted through<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1);}} /></label><div className="v38-row"><button className="primary">Search</button><button type="button" className="secondary" onClick={()=>{setQ('');setSearch('');setStatus('PENDING');setClient('');setFrom('');setTo('');setPage(1);}}>Clear</button></div></form>
    {error?<p className="notice error" role="alert">{error}</p>:null}{notice?<p className="notice success" role="status">{notice}</p>:null}
    {loading?<p role="status">Loading reviews…</p>:!items.length?<p>No submissions match these filters.</p>:null}
    <div className="kb-review-list">{items.map(item=><article className="kb-review-item v38-stack" key={item.entity_id}><div className="v38-row"><div><h3>{item.title}</h3><p>{item.author_name} · {item.client_name??'Global'} · {item.status==='PENDING'?'Awaiting review':item.status==='REJECTED'?'Changes requested':'Approved'}</p><p className="hint">{kind==='PROBLEM'?`${item.priority?.replaceAll('_',' ')} · ${item.linked_ticket_count ?? 0} linked tickets`:'Service template'} · Submitted {new Date(item.submitted_at).toLocaleString()}</p></div><button className="secondary" type="button" onClick={()=>{setSelected(selected===item.entity_id?undefined:item.entity_id);setComment('');}}>{selected===item.entity_id?'Close':'View submission'}</button></div>
      {selected===item.entity_id?<>{<><p className="v38-prewrap">{item.content}</p>{(['description','root_cause','workaround','resolution'] as const).map(field=>item[field]?<div key={field}><strong>{field.replaceAll('_',' ')}</strong><p className="v38-prewrap">{item[field]}</p></div>:null)}</>}{item.comment?<p><strong>Previous review:</strong> {item.comment}</p>:null}{Boolean(item.can_review)&&item.status==='PENDING'?<><label>Review comment<textarea value={comment} maxLength={2000} onChange={e=>setComment(e.target.value)} /></label><div className="v38-row"><button className="secondary" type="button" disabled={busy} onClick={()=>void decide(item,'REJECTED')}>Request changes</button><button className="primary" type="button" disabled={busy} onClick={()=>void decide(item,'APPROVED')}>{kind==='SERVICE'?'Approve and activate':'Approve and release'}</button></div></>:item.status==='PENDING'?<p className="hint">Another authorized reviewer must approve your own submission.</p>:null}</>:null}
    </article>)}</div><div className="knowledge-pagination"><button type="button" className="secondary" disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} · {total} {noun}</span><button type="button" className="secondary" disabled={page*20>=total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </section>;
}
