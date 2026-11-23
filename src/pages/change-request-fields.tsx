import { useEffect, useRef, useState } from 'react';
import './change-request-fields.css';
type Row=Record<string,unknown>;
export type ChangePerson={id:string;name:string;email?:string;site_ids?:string[]|string;can_own?:boolean|number;user_id?:string|null};
export const changePersonSites=(value:unknown):string[]=>Array.isArray(value)?value.map(String):typeof value==='string'?JSON.parse(value):[];
export function defaultChangeOrganization(clients:Row[]):string {
  const active=clients.filter(row=>!row.status||row.status==='ACTIVE');const external=active.filter(row=>row.id!=='00000000-0000-4000-8000-000000000132');
  return external.length===1?String(external[0].id):active.length===1?String(active[0].id):'';
}
export function eligibleChangeApprovers(users:ChangePerson[],sites:string[],type:string,creator:string,owner:string,requester:string,contacts:ChangePerson[]):ChangePerson[]{
  const [kind,id]=requester.split(':');const requesterUser=kind==='USER'?id:contacts.find(contact=>contact.id===id)?.user_id;
  return users.filter(person=>{
    const allowed=changePersonSites(person.site_ids);const covers=!allowed.length||sites.length>0&&sites.every(id=>allowed.includes(id));
    return covers&&(type==='STANDARD'||![creator,owner,requesterUser].includes(person.id));
  });
}
export function ChangeChoice({label,name,items,values,onChange,multiple=false,all=false,allLabel='All departments',disabled=false}: {
  label:string;name:string;items:{id:string;name:string;email?:string}[];values:string[];onChange:(ids:string[])=>void;multiple?:boolean;all?:boolean;allLabel?:string;disabled?:boolean;
}){
  const root=useRef<HTMLDivElement>(null);const [open,setOpen]=useState(false);const [search,setSearch]=useState('');
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
  const matches=items.filter(item=>`${item.name} ${item.email??''}`.toLowerCase().includes(search.toLowerCase()));
  const names=values.map(id=>items.find(item=>item.id===id)?.name).filter(Boolean);
  const shown=names.length>2?`${names.slice(0,2).join(', ')} +${names.length-2}`:names.join(', ');
  return <div className="change-choice" ref={root} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);root.current?.querySelector<HTMLButtonElement>('.change-choice-trigger')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
    <span className="change-choice-label">{label}</span>
    {values.map(value=><input key={value} type="hidden" name={name} value={value}/>)}
    <button type="button" className="change-choice-trigger" disabled={disabled} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(current=>!current)}><span>{shown||`Select ${label.toLowerCase()}…`}</span><span aria-hidden="true">⌄</span></button>
    {open?<div className="change-choice-menu" role="dialog" aria-label={`${label} choices`}>
      <input type="search" autoFocus aria-label={`Search ${label.toLowerCase()}`} placeholder={items.some(item=>item.email)?'Search name or email…':`Search ${label.toLowerCase()}…`} value={search} onChange={event=>setSearch(event.target.value)}/>
      {multiple&&all?<button type="button" className="change-choice-all" onClick={()=>onChange(values.length===items.length?[]:items.map(item=>item.id))}>{values.length===items.length&&items.length?'Clear all':allLabel}</button>:null}
      {multiple?<button type="button" className="change-choice-all" onClick={()=>onChange([])}>Clear selection</button>:null}
      {!matches.length?<p>No matching options.</p>:null}
      <div className="change-choice-options" role="listbox" aria-label={label} aria-multiselectable={multiple} onKeyDown={event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;const options=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];const index=options.indexOf(document.activeElement as HTMLButtonElement);if(!options.length)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(index+1)%options.length:(index-1+options.length)%options.length;options[next]?.focus();}}>
        {matches.slice(0,150).map(item=><button type="button" role="option" aria-selected={values.includes(item.id)} className={`change-choice-option${values.includes(item.id)?' is-selected':''}`} key={item.id} onClick={()=>{onChange(multiple?(values.includes(item.id)?values.filter(id=>id!==item.id):[...values,item.id]):[item.id]);if(!multiple){setOpen(false);root.current?.querySelector<HTMLButtonElement>('.change-choice-trigger')?.focus();}}}><span className="change-choice-option-text"><strong>{item.name}</strong>{item.email?<small>{item.email}</small>:null}</span><span className="change-choice-check" aria-hidden="true">{values.includes(item.id)?'✓':''}</span></button>)}
      </div>
      {matches.length>150?<small>Search to find more options.</small>:null}
    </div>:null}
  </div>;
}

export default function ChangeRequestFields({user,clients,sites,departments,clientId,siteIds,onOrganization,onSites,changeType,request}: {
  user:{id:string;displayName:string};clients:Row[];sites:Row[];departments:Row[];clientId:string;siteIds:string[];onOrganization:(id:string)=>void;onSites:(ids:string[])=>void;changeType:string;
  request:(path:string,init?:RequestInit)=>Promise<unknown>;
}){
  const [people,setPeople]=useState<{users:ChangePerson[];contacts:ChangePerson[]}>({users:[],contacts:[]});
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [requester,setRequester]=useState('USER:'+user.id);const [approver,setApprover]=useState(changeType==='STANDARD'?user.id:'');const [owner,setOwner]=useState(user.id);const [departmentIds,setDepartmentIds]=useState<string[]>([]);
  useEffect(()=>{let live=true;setError('');setPeople({users:[],contacts:[]});setRequester('USER:'+user.id);setApprover(changeType==='STANDARD'?user.id:'');setOwner(user.id);if(!clientId){setLoading(false);return;}setLoading(true);
    void request(`/changes/people?clientId=${encodeURIComponent(clientId)}`).then(data=>{if(live)setPeople(data as typeof people);}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
  },[clientId,request,user.id]);
  const approvers=eligibleChangeApprovers(people.users,siteIds,changeType,user.id,owner,requester,people.contacts);
  useEffect(()=>{if(loading)return;if(approver&&!approvers.some(person=>person.id===approver))setApprover('');else if(!approver&&changeType==='STANDARD'&&approvers.some(person=>person.id===user.id))setApprover(user.id);},[loading,approver,changeType,user.id,approvers.map(person=>person.id).join('|')]);
  const siteChoices=sites.filter(site=>String(site.client_id)===clientId).map(site=>({id:String(site.id),name:String(site.name)}));
  const requesters=[...people.users.map(person=>({...person,id:'USER:'+person.id})),...people.contacts.map(person=>({...person,id:'CONTACT:'+person.id}))];
  return <>
    <label>Organization<select required name="clientId" value={clientId} onChange={event=>{onOrganization(event.target.value);const available=sites.filter(site=>String(site.client_id)===event.target.value);onSites(available.length===1?[String(available[0].id)]:[]);}}><option value="">Select…</option>{clients.filter(row=>!row.status||row.status==='ACTIVE').map(client=><option key={String(client.id)} value={String(client.id)}>{String(client.name)}</option>)}</select></label>
    <ChangeChoice label="Site" name="siteIds" items={siteChoices} values={siteIds} onChange={onSites} multiple disabled={!clientId}/>
    <ChangeChoice label="Department" name="departmentIds" items={departments.filter(row=>row.active!==false&&row.active!==0).map(row=>({id:String(row.id),name:String(row.name)}))} values={departmentIds} onChange={setDepartmentIds} multiple all/>
    <label>Owner<select name="ownerUserId" value={owner} onChange={event=>setOwner(event.target.value)}><option value={user.id}>{user.displayName}</option>{people.users.filter(person=>person.id!==user.id&&!!person.can_own).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <ChangeChoice label="Requested by" name="requesterRef" items={requesters} values={requester?[requester]:[]} onChange={ids=>setRequester(ids[0]??'')} disabled={!clientId||loading}/>
    <ChangeChoice label="Approver" name="approverUserId" items={approvers} values={approver?[approver]:[]} onChange={ids=>setApprover(ids[0]??'')} disabled={!clientId||loading}/>
    <p className="wide hint">{loading?'Loading people linked to this organization…':changeType==='STANDARD'?'Standard changes may be self-approved. Choose yourself as approver to self-approve when submitting.':'Normal changes require the selected approver only. The approver must be different from the creator, owner and requester.'} Approvers need an active ASTRA account and access to all selected sites.</p>
    {error?<p className="wide notice error" role="alert">{error}</p>:null}
  </>;
}
