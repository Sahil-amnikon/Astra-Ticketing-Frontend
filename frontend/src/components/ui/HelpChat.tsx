'use client';

import { useState, type FormEvent } from 'react';
import type { WorkspaceUser } from '../layout/DashboardLayout/WorkspaceFrame';

export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  href: string;
  notes?: string[];
};

type HelpResult = {
  sourceType: 'guide'|'knowledge'|'ticket'|'web';
  id: string;
  title: string;
  summary: string;
  score: number;
  matchReasons: string[];
  resolution?: string;
  procedure?: string[];
  href: string;
};

type SearchResponse = {
  answer: string;
  normalizedQuery: string;
  detectedProducts: string[];
  detectedSymptoms: string[];
  results: HelpResult[];
  suggestions: string[];
  webNote?: string;
};

export default function HelpChat({ user, csrfToken }: { user: WorkspaceUser; csrfToken?: string }) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [result,setResult]=useState<SearchResponse>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState<Record<string,string>>({});
  const staff=user.roles.some(r=>['TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN'].includes(r));
  if (!staff) return null;

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!csrfToken || busy || query.trim().length<2) return;
    setBusy(true); setError(''); setResult(undefined);
    try {
      const response=await fetch('/api/help/ask',{method:'POST',cache:'no-store',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({question:query.trim()})});
      if(!response.ok) throw new Error('Help search is unavailable. Please try again.');
      setResult(await response.json() as SearchResponse);
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function sendFeedback(item: HelpResult, helpful: boolean) {
    if(!csrfToken) return;
    setFeedback(v=>({...v,[item.id]:helpful?'Helpful':'Not helpful'}));
    await fetch('/api/help/feedback',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({query,resultId:item.id,helpful})}).catch(()=>undefined);
  }

  async function sendResolution(item: HelpResult, resolved: boolean) {
    if(!csrfToken) return;
    setFeedback(v=>({...v,[`${item.id}-resolution`]:resolved?'Resolved':'Not resolved'}));
    await fetch('/api/help/resolution-feedback',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({query,resultId:item.id,resolved})}).catch(()=>undefined);
  }

  return <div className="help-widget">
    {open ? <section className="help-panel" role="dialog" aria-label="Advanced troubleshooting help">
      <header className="help-panel-head"><div><strong>Help</strong><small>Search guides, knowledge, resolved tickets, and approved web guidance</small></div><button type="button" aria-label="Close help" onClick={()=>setOpen(false)}>×</button></header>
      <div className="help-conversation" aria-live="polite">
        <form onSubmit={(e)=>void search(e)}>
          <label htmlFor="help-query">What problem are you troubleshooting?</label>
          <input id="help-query" value={query} onChange={e=>setQuery(e.target.value)} minLength={2} maxLength={500} placeholder="Example: Outlook keeps asking for password" />
          <button type="submit" disabled={busy||query.trim().length<2}>{busy?'Searching…':'Search Help'}</button>
        </form>
        {error?<p role="alert">{error}</p>:null}
        {result?<>
          <p>{result.answer}</p>
          {result.detectedProducts.length?<p><strong>Product:</strong> {result.detectedProducts.join(', ')}</p>:null}
          {result.detectedSymptoms.length?<p><strong>Symptoms:</strong> {result.detectedSymptoms.join(', ')}</p>:null}
          {result.results.map(item=><article key={`${item.sourceType}-${item.id}`} className="help-web-result">
            <strong>{item.title}</strong><small>{item.sourceType}</small>
            {item.summary?<p>{item.summary}</p>:null}
            {item.matchReasons.length?<small>Why this matched: {item.matchReasons.join(' · ')}</small>:null}
            {item.resolution?<><p><strong>Known resolution:</strong> {item.resolution}</p><p><strong>Did this resolve the issue?</strong> <button type="button" onClick={()=>void sendResolution(item,true)}>Yes</button> <button type="button" onClick={()=>void sendResolution(item,false)}>No</button> {feedback[`${item.id}-resolution`]}</p></>:null}
            {item.procedure?.length?<ol>{item.procedure.map((step,i)=><li key={`${item.id}-${i}`}>{step}</li>)}</ol>:null}
            <p><a href={item.href} target={item.sourceType==='web'?'_blank':undefined} rel={item.sourceType==='web'?'noopener noreferrer':undefined}>Open result ↗</a></p>
            <p><button type="button" onClick={()=>void sendFeedback(item,true)}>Helpful</button> <button type="button" onClick={()=>void sendFeedback(item,false)}>Not helpful</button> {feedback[item.id]}</p>
          </article>)}
          {!result.results.length?<><p>No strong match was found.</p>{result.suggestions.map(s=><p key={s}>Suggestion: {s}</p>)}</>:null}
          {result.webNote?<p>{result.webNote}</p>:null}
        </>:<p>Try a symptom and product, for example “VPN disconnects after 10 minutes” or “printer is offline”.</p>}
      </div>
    </section>:null}
    <button type="button" className="help-bubble" aria-label="Open troubleshooting help" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span aria-hidden="true">?</span><span>Help</span></button>
  </div>;
}
