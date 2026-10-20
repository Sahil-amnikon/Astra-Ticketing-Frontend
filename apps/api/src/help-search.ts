import type { AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { KnowledgeQuery, KnowledgeService } from './knowledge';
import { TicketListQuery, TicketService } from './tickets';
import { WebGuidanceService } from './web-guidance';
import { visibleHelpTopics } from './help-topics';
import { HELP_PRODUCTS, HELP_SYMPTOMS, HELP_SYNONYMS, HELP_TYPO_TERMS } from './help-dictionary';

const STAFF = ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];
const WIDE = ['ADMIN', 'MANAGER', 'TEAM_LEAD'];
const STOP = new Set('how do i can you please find show me the a an my for about is are where what with to in of on help search look up issue issues problem problems technical related similar guide steps troubleshoot troubleshooting ticket tickets user users client clients'.split(' '));

type SearchHit = {
  sourceType: 'guide' | 'knowledge' | 'ticket' | 'web';
  id: string;
  title: string;
  summary: string;
  score: number;
  matchReasons: string[];
  resolution?: string;
  procedure?: string[];
  href: string;
};

function tokens(input: string): string[] {
  return [...new Set((input.toLowerCase().normalize('NFKC').match(/[a-z0-9]+/g) ?? []).filter(x => x.length > 1 && !STOP.has(x)))];
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i=1;i<=a.length;i++) {
    const cur=[i];
    for (let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]!+1, prev[j]!+1, prev[j-1]!+(a[i-1]===b[j-1]?0:1));
    for (let j=0;j<=b.length;j++) prev[j]=cur[j]!;
  }
  return prev[b.length]!;
}

function canonicalTokens(input: string): string[] {
  const base=tokens(input);
  const expanded=new Set(base);
  for (const word of base) {
    for (const [key, values] of Object.entries(HELP_SYNONYMS)) {
      if (key===word || values.some(v => v.split(/\s+/).includes(word))) {
        expanded.add(key);
        values.forEach(v => v.split(/\s+/).forEach(x => expanded.add(x)));
      }
    }
  }
  for (const word of base) {
    if (word.length < 5) continue;
    const candidate=HELP_TYPO_TERMS.find(t => distance(word,t)<=2);
    if (candidate) expanded.add(candidate);
  }
  return [...expanded];
}

function detect(input: string, dictionary: Record<string,string[]>): string[] {
  const q=input.toLowerCase();
  return Object.entries(dictionary).filter(([, terms]) => terms.some(term => q.includes(term))).map(([key])=>key);
}

function relevance(text: string, queryTokens: string[], products: string[], symptoms: string[], title=''): {score:number; reasons:string[]} {
  const hay=text.toLowerCase(); const ttl=title.toLowerCase(); let score=0; const reasons:string[]=[];
  for (const t of queryTokens) {
    if (ttl.includes(t)) { score+=5; if (!reasons.includes('title match')) reasons.push('title match'); }
    else if (hay.includes(t)) { score+=2; if (!reasons.includes('keyword match')) reasons.push('keyword match'); }
    else if (t.length>=5 && hay.split(/\s+/).some(w=>distance(w.replace(/[^a-z0-9]/g,''),t)<=1)) { score+=1; if (!reasons.includes('fuzzy match')) reasons.push('fuzzy match'); }
  }
  for (const p of products) if (hay.includes(p)) { score+=4; if (!reasons.includes(`product: ${p}`)) reasons.push(`product: ${p}`); }
  for (const s of symptoms) if (hay.includes(s.replace(/_/g,' '))) { score+=3; if (!reasons.includes(`symptom: ${s.replace(/_/g,' ')}`)) reasons.push(`symptom: ${s.replace(/_/g,' ')}`); }
  return {score,reasons};
}

function sanitizeQuery(input: string): string {
  return input.replace(/https?:\/\/\S+/gi,' ')
    .replace(/\b[A-Z]{2,8}-\d{3,10}\b/gi,' ')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g,' ')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,' ')
    .replace(/\s+/g,' ').trim().slice(0,500);
}

function ticketScope(user: AuthenticatedUser): 'all'|'team'|'my' {
  if (user.roles.some(r=>WIDE.includes(r))) return 'all';
  if (user.permissions?.includes('TICKETS_TEAM_VIEW')) return 'team';
  return 'my';
}

function extractResolution(comments: Array<Record<string,unknown>>): string | undefined {
  const useful=comments.filter(c=>typeof c.body==='string').map(c=>String(c.body).replace(/\s+/g,' ').trim()).filter(Boolean);
  const preferred=useful.find(c=>/resolved|resolution|fixed|fix(ed)?|working|restored|reinstalled|cleared|reset|reconfigured|recreated|issue was/i.test(c));
  return (preferred ?? useful.at(-1))?.slice(0,500);
}

import { Injectable } from '@nestjs/common';

@Injectable()
export class HelpSearchService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly tickets: TicketService,
    private readonly knowledge: KnowledgeService,
    private readonly web: WebGuidanceService,
  ) {}

  private async audit(user: AuthenticatedUser, action: string, details: Record<string,unknown>) {
    try {
      await this.dependencies.db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'HELP',NULL,$3::jsonb)",
        [user.id, action, JSON.stringify(details)],
      );
    } catch { /* feedback/analytics must never break Help */ }
  }

  async search(user: AuthenticatedUser, input: string) {
    const query=input.trim();
    const safe=sanitizeQuery(query);
    if (!query) {
      await this.audit(user,'HELP.SEARCH',{query:'',normalized:'',products:[],symptoms:[],resultCount:0,topResult:null});
      return {query,normalizedQuery:'',detectedProducts:[],detectedSymptoms:[],results:[],suggestions:['Use a symptom or product name without ticket numbers, IPs, URLs, credentials, or personal data.'],webResults:[],webProcedures:[],webNote:''};
    }
    const qTokens=canonicalTokens(query);
    const products=detect(query,HELP_PRODUCTS);
    const symptoms=detect(query,HELP_SYMPTOMS);
    const hits: SearchHit[]=[];
    const topics=visibleHelpTopics(user);
    for (const topic of topics) {
      const text=[topic.title,topic.summary,...topic.steps, ...(topic.keywords??[]), topic.section??'', topic.notes??''].join(' ');
      const r=relevance(text,qTokens,products,symptoms,topic.title);
      if (r.score>0) hits.push({sourceType:'guide',id:topic.id,title:topic.title,summary:topic.summary,score:r.score+2,matchReasons:r.reasons,procedure:topic.steps,href:topic.href});
    }

    const knowledge=await this.knowledge.list(user,Object.assign(new KnowledgeQuery(),{q:query,page:1}));
    for (const row of (knowledge.items??[]) as Record<string,unknown>[]) {
      const title=String(row.title??''); const body=String(row.body??'');
      const r=relevance(`${title} ${body}`,qTokens,products,symptoms,title);
      if (r.score>0) hits.push({sourceType:'knowledge',id:String(row.id),title,summary:body.slice(0,280),score:r.score+3,matchReasons:r.reasons,href:`/knowledge?article=${String(row.id)}`});
    }

    const staff=user.roles.some(r=>STAFF.includes(r));
    let ticketRows:any={items:[]};
    if (staff) {
      ticketRows=await this.tickets.list(user,Object.assign(new TicketListQuery(),{q:query,status:'RESOLVED',scope:ticketScope(user),page:1,pageSize:10}));
    }
    const rows=(ticketRows.items??[]) as Record<string,unknown>[];
    const details=await Promise.allSettled(rows.slice(0,5).map(r=>this.tickets.detail(String(r.id),user)));
    details.forEach((outcome,i)=>{
      const row=rows[i];
      if (outcome.status!=='fulfilled' || !row) return;
      const detail=outcome.value as any;
      const comments=(detail.comments??[]) as Record<string,unknown>[];
      const resolution=extractResolution(comments);
      const title=`${String(row.ticket_number??'Ticket')} · ${String(row.subject??'')}`;
      const body=[row.subject,row.description,...comments.map(c=>c.body),resolution].filter(Boolean).join(' ');
      const r=relevance(body,qTokens,products,symptoms,title);
      if (r.score>0) hits.push({sourceType:'ticket',id:String(row.id),title,summary:String(row.description??'').slice(0,240),score:r.score+4,matchReasons:[...r.reasons,'resolved ticket'],resolution,href:(user.roles.includes('ADMIN')?'/admin/ticket':user.roles.some(x=>['TEAM_LEAD','MANAGER'].includes(x))?'/management/tickets':'/operations/tickets')+'/'+String(row.id)});
    });

    hits.sort((a,b)=>b.score-a.score);
    const contextualHits = products.length || symptoms.length
      ? hits.filter((hit) =>
          hit.matchReasons.some(
            (reason) =>
              reason.startsWith('product: ') ||
              reason.startsWith('symptom: '),
          ),
        )
      : hits;
    const local=contextualHits.filter((hit)=>hit.score>=8).slice(0,8);
    let webResults:any[]=[];
    let webProcedures:any[]=[];
    let webNote='';
    if (local.length===0 || (local[0]?.score??0)<8) {
      try {
        const webQuery=sanitizeQuery(query);
        if (webQuery.length < 3) throw new Error('web-query-empty');
        const web=await this.web.search(user,{query:webQuery} as any);
        webResults=web.results??[]; webProcedures=web.procedures??[]; webNote=web.note??'';
        for (const result of webResults.slice(0,5)) {
          const r=relevance(`${result.title} ${(result.excerpts??[]).join(' ')}`,qTokens,products,symptoms,result.title);
          if (r.score>0) local.push({sourceType:'web',id:result.href,title:result.title,summary:(result.excerpts??[]).join(' ').slice(0,280),score:r.score,matchReasons:[...r.reasons,'approved web source'],href:result.href,procedure:webProcedures.find((p:any)=>p.href===result.href)?.steps});
        }
      } catch { webNote='Local results are shown. Approved web guidance was unavailable or not configured.'; }
    }
    local.sort((a,b)=>b.score-a.score);
    const results=local.slice(0,8);
    const suggestions=results.length?[]:['Try a shorter symptom, product name, or error message.',...(products.length?[]:['Include the affected product or service, such as Outlook, VPN, printer, or DNS.'])].slice(0,2);
    await this.audit(user,'HELP.SEARCH',{query:safe,normalized:qTokens.join(' '),products,symptoms,resultCount:results.length,topResult:results[0]?.title??null});
    return {query,normalizedQuery:qTokens.join(' '),detectedProducts:products,detectedSymptoms:symptoms,results,suggestions,webResults,webProcedures,webNote};
  }

  async feedback(user: AuthenticatedUser, body:{query?:string;resultId?:string;helpful:boolean}) {
    await this.audit(user,'HELP.SEARCH_FEEDBACK',{query:sanitizeQuery(String(body.query??'')),resultId:String(body.resultId??'').slice(0,200),helpful:Boolean(body.helpful)});
    return {ok:true};
  }

  async resolutionFeedback(user: AuthenticatedUser, body:{query?:string;resultId?:string;resolved:boolean}) {
    await this.audit(user,'HELP.RESOLUTION_FEEDBACK',{query:sanitizeQuery(String(body.query??'')),resultId:String(body.resultId??'').slice(0,200),resolved:Boolean(body.resolved)});
    return {ok:true};
  }
}
