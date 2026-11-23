import type { FormEvent } from 'react';
import { localPlanTime } from './change-plan-model';

type Row = Record<string, unknown>;
export type ChangeLifecycle = { reviewStatus: string; nextStatuses: string[]; requestedBy: string; approvedBy?: string | null; approver?: string|null; siteNames?:string[];departmentNames?:string[];reviewComment?: string | null; canAmend: boolean };
export const changeLifecycleActionLabels: Record<string,string> = { IN_PROGRESS: 'Start work', COMPLETED: 'Mark completed', FAILED: 'Report failed', ROLLED_BACK: 'Report rolled back', CLOSED: 'Close change' };

export default function ChangeLifecycleControls({ workflow, change, updates = [], busy, submit }: {
  workflow: ChangeLifecycle; change: Row; updates?: Row[]; busy: boolean; submit: (path: string, body: Row, method?: string) => Promise<Row | undefined>;
}) {
  const id=String(change.id),state=String(change.status);
  const close=workflow.nextStatuses.includes('CLOSED');
  const results=workflow.nextStatuses.includes('COMPLETED');
  const awaitingClosure=['COMPLETED','FAILED','ROLLED_BACK'].includes(state);
  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button=(event.nativeEvent as SubmitEvent).submitter;
    if(!(button instanceof HTMLButtonElement))return;
    const data=new FormData(event.currentTarget);
    await submit(`/changes/${id}/status`,{status:button.value,note:data.get('note'),followUp:data.get('followUp')||undefined},'PATCH');
  }
  return <section className="panel v38-stack" aria-label="Change workflow">
    <h2>Change workflow</h2>
    <div className="form-grid">
      <label>Requested by<input readOnly value={workflow.requestedBy} /></label>
      <label>Approver<input readOnly value={workflow.approver || workflow.approvedBy || 'Not selected'} /></label>
    </div>
    {workflow.siteNames?.length?<p><strong>Sites:</strong> {workflow.siteNames.join(', ')}</p>:null}
    {workflow.departmentNames?.length?<p><strong>Departments:</strong> {workflow.departmentNames.join(', ')}</p>:null}
    {workflow.reviewStatus==='REJECTED' ? <p className="notice">Changes requested: {workflow.reviewComment || 'Review the feedback, revise the plan and resubmit.'}</p> : null}
    {workflow.reviewStatus==='APPROVED' && !awaitingClosure && state!=='CLOSED' ? <p>Approved. The assigned technician can carry out the change and record the results.</p> : null}
    {awaitingClosure ? <p className="notice">Work finished. An independent team lead, manager or administrator must review the results and close the change.</p> : null}
    {awaitingClosure ? <section aria-label="Technician results"><h3>Technician results</h3>{updates.filter(update=>update.update_type==='VALIDATION').slice(0,3).map(update=><p key={String(update.id)} style={{whiteSpace:'pre-wrap'}}>{String(update.body)}</p>)}</section> : null}
    {state==='CLOSED' ? <p className="notice success">This change is closed.</p> : null}
    {workflow.nextStatuses.length ? <form className="v38-stack" onSubmit={event => { void transition(event); }}>
      <label>{close?'Closure review':results?'Implementation and test results':'Work note'}<textarea name="note" rows={3} required={close||results} minLength={close||results?10:0} maxLength={10000} placeholder={close?'Describe what you checked and why this change can be closed.':results?'Describe the work performed, tests and outcome.':'Optional note before starting work.'} /></label>
      {close ? <label>Follow-up<textarea name="followUp" rows={2} maxLength={10000} placeholder="Optional follow-up work" /></label> : null}
      <div className="form-actions">{workflow.nextStatuses.map(status=><button key={status} type="submit" name="status" value={status} className={['IN_PROGRESS','COMPLETED','CLOSED'].includes(status)?'primary':'secondary'} disabled={busy}>{busy?'Saving…':changeLifecycleActionLabels[status]}</button>)}</div>
    </form> : null}
    {workflow.canAmend ? <details><summary>Revise plan and resubmit for approval</summary><form className="v38-stack" onSubmit={event => {
      event.preventDefault();const data=new FormData(event.currentTarget);
      const iso=(key:string)=>data.get(key)?new Date(String(data.get(key))).toISOString():null;
      void submit(`/change-governance/${id}`,{revision:Number(change.revision),reason:data.get('reason'),implementationPlan:data.get('implementationPlan'),testPlan:data.get('testPlan'),rollbackPlan:data.get('rollbackPlan'),plannedStart:iso('plannedStart'),plannedEnd:iso('plannedEnd')},'PATCH');
    }}>
      <p>Changing the plan requires a fresh review before work can start.</p>
      <label>Reason for revision<textarea name="reason" required minLength={10} maxLength={2000} /></label>
      <label>Implementation plan<textarea name="implementationPlan" required minLength={2} maxLength={10000} defaultValue={String(change.implementation_plan??'')} /></label>
      <label>Testing plan<textarea name="testPlan" required minLength={2} maxLength={10000} defaultValue={String(change.test_plan??'')} /></label>
      <label>Rollback plan<textarea name="rollbackPlan" required minLength={2} maxLength={10000} defaultValue={String(change.rollback_plan??'')} /></label>
      <div className="form-grid"><label>Planned start<input type="datetime-local" name="plannedStart" defaultValue={localPlanTime(change.planned_start as string | null)} /></label><label>Planned end<input type="datetime-local" name="plannedEnd" defaultValue={localPlanTime(change.planned_end as string | null)} /></label></div>
      <button type="submit" className="primary" disabled={busy}>Resubmit for review</button>
    </form></details> : null}
  </section>;
}
