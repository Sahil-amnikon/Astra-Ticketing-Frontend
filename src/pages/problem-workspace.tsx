'use client';
import ExpandablePanel from './expandable-panel';
import Link from '../navigation/link';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, type FormEvent } from 'react';
import { useWorkspace, WorkspaceFrame, type Option } from './workspace-tools';
import './problem-workspace.css';
import KnowledgeReview from './knowledge/knowledge-review';
import ProblemTicketPicker, { type ProblemTicketChoice } from './problem-ticket-picker';
import ProblemSolutionChart from './problem-solution-chart';
import { AddProblemTicketsDialog, type LinkedProblem, type ProblemSearchTicket } from './problem-team-tickets';
type Problem = {
  id: string;
  problem_number: string;
  client_id: string;
  site_id?: string;
  client_name: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  owner_user_id: string;
  owner_name: string;
  can_edit?: boolean|number;
  can_link?: boolean|number;
  root_cause: string;
  workaround: string;
  resolution: string;
  revision: number;
  updated_at: string;
};
type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
};
type Detail = {
  problem: Problem;
  tickets: Ticket[];
  history: {
    id: string;
    action: string;
    actor_name: string;
    created_at: string;
    details: { body?: string; status?: string; previousStatus?: string };
  }[];
  owners: { id: string; display_name: string }[];
  canEdit: boolean;
  canManage: boolean;
  canLink: boolean;
};
type Edit = {
  revision: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  rootCause: string;
  workaround: string;
  resolution: string;
  ownerUserId: string;
};
const statuses = ['OPEN', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED'];
const priorities = ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'];
const label = (s: string) =>
  s
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) => new Date(s).toLocaleString();
export default function ProblemWorkspace({
  initialCreate = false,
  initialProblem = '',
  initialTicket = '',
  initialClient = '',
}: {
  initialCreate?: boolean;
  initialProblem?: string;
  initialTicket?: string;
  initialClient?: string;
}) {
  const navigate = useNavigate();
  const w = useWorkspace();
  const { session, request, revision, setError } = w;
  const [options, setOptions] = useState<{
    clients: Option[];
    sites: Option[];
  }>({ clients: [], sites: [] });
  const [rows, setRows] = useState<{ items: Problem[]; total: number }>({
    items: [],
    total: 0,
  });
  const [filter, setFilter] = useState({
    q: '',
    status: '',
    clientId: '',
    page: 1,
  });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(initialProblem);
  const [detail, setDetail] = useState<Detail>();
  const [edit, setEdit] = useState<Edit>();
  const [creating, setCreating] = useState(initialCreate);
  const [selectedTickets,setSelectedTickets]=useState<ProblemTicketChoice[]>([]);
  const [attachDialog,setAttachDialog]=useState<{ticket?:ProblemSearchTicket;problem?:LinkedProblem}>();
  const [problemFocus,setProblemFocus]=useState<'solution'|'editor'>('solution');
  const [reviewing,setReviewing]=useState(()=>new URLSearchParams(window.location.search).get('reviewPM')==='1');
  const reviewer=session?.user.roles.some(r=>['TEAM_LEAD','MANAGER','ADMIN'].includes(r));
  const [draft, setDraft] = useState({
    clientId: initialClient,
    siteId: '',
    title: '',
    description: '',
    priority: 'P3_MEDIUM',
    recurrence: '',
    businessImpact: '',
    rootCause: '',
    workaround: '',
  });
  const [note, setNote] = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<Ticket[]>([]);
  const [pendingTicket, setPendingTicket] = useState(initialTicket);
  const allowed = session?.user.roles.some((r) =>
    ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
  );
  const workspace = session?.user.workspace ?? 'operations';
  const canEdit = Boolean(detail?.canEdit);
  const ticketBase =
    workspace === 'admin' ? '/admin/ticket' : `/${workspace}/tickets`;
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void request<typeof options>('/problems/options')
      .then((d) => {
        if (live) setOptions(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [allowed, request, setError]);
  useEffect(() => {
    if (!allowed || selected) return;
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const q = new URLSearchParams({
        q: filter.q,
        page: String(filter.page),
        pageSize: '20',
      });
      if (filter.clientId) q.set('clientId', filter.clientId);
      if (filter.status) q.set('status', filter.status);
      void request<typeof rows>(`/problems?${q}`)
        .then((d) => {
          if (live) setRows(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [allowed, selected, filter, revision, request, setError]);
  useEffect(() => {
    if (!allowed || !selected) {
      return;
    }
    let live = true;
    void request<Detail>(`/problems/${selected}`)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        const p = d.problem;
        setEdit({
          revision: p.revision,
          title: p.title,
          description: p.description,
          priority: p.priority,
          status: p.status,
          rootCause: p.root_cause,
          workaround: p.workaround,
          resolution: p.resolution,
          ownerUserId: p.owner_user_id,
        });
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [allowed, selected, revision, request, setError]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const data = (await w.save('/problems', {
        ...draft,
        siteId: draft.siteId || undefined,
        ticketIds: selectedTickets.map(ticket=>ticket.id),
      })) as Problem;
      setCreating(false);
      setSelectedTickets([]);
      choose(data.id);
      setDraft((d) => ({ ...d, title: '', description: '', recurrence:'',businessImpact:'',rootCause:'',workaround:'' }));
    } catch {
      /* The workspace displays the request error. */
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await w.save(`/problems/${selected}`, edit, 'PATCH');
    } catch {
      /* The workspace displays the request error. */
    }
  }
  async function link(ticketId: string, remove = false) {
    try {
      await w.save(
        `/problems/${selected}/tickets${remove ? `/${ticketId}` : ''}`,
        remove ? undefined : { ticketId },
        remove ? 'DELETE' : 'POST',
      );
      setPendingTicket('');
      setTicketResults([]);
      setTicketQuery('');
    } catch {
      /* The workspace displays the request error. */
    }
  }
  async function searchTickets(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setError('');
    try {
      const q = new URLSearchParams({
        q: ticketQuery,
        clientId: detail.problem.client_id,
        scope: 'team',
        pageSize: '20',
      });
      if(detail.problem.site_id)q.set('siteId',detail.problem.site_id);
      const data = await request<{ items: Ticket[] }>(`/tickets?${q}`);
      setTicketResults(
        data.items.filter(
          (t) => !detail.tickets.some((linked) => linked.id === t.id),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function choose(id: string, editor=false) {
    setCreating(false);
    setProblemFocus(editor?'editor':'solution');
    setSelected(id);
    navigate('/problems?'+new URLSearchParams({problem:id,workspace}));
  }
  function selectCreationTickets(tickets:ProblemTicketChoice[]){
    const first=tickets[0];
    if(first&&!draft.clientId){setDraft(d=>({...d,clientId:first.client_id,siteId:first.site_id??''}));setSelectedTickets(tickets.filter(item=>item.client_id===first.client_id&&item.site_id===first.site_id));}
    else setSelectedTickets(tickets);
  }
  useEffect(()=>{if(selected&&detail?.problem.id===selected)document.getElementById(problemFocus==='editor'?'problem-editor':'problem-solution')?.scrollIntoView({behavior:'smooth',block:'start'});},[selected,detail,problemFocus]);
  return (
    <WorkspaceFrame
      title="Problem Management"
      description="Investigate recurring incidents, document root causes and maintain known errors."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
      pageHeading={<header className="page-heading problem-page-heading"><div><p className="eyebrow">ASTRA / TICKETING SYSTEM</p><h1>{selected?detail?.problem.problem_number??'Problem details':creating?'Create problem':'Problem Management'}</h1><p>{selected?'View the investigation, linked tickets and findings, or update the problem.':creating?'Document the recurring issue and link related tickets for investigation.':'Investigate recurring tickets, share approved workarounds and prevent the same issue from returning.'}</p></div><div className="problem-heading-actions">{selected||creating?<Link className="secondary" href={'/problems?'+new URLSearchParams({workspace})}>Back to problems</Link>:null}{reviewer&&!selected&&!creating?<button type="button" className="secondary" onClick={()=>{setReviewing(!reviewing);setCreating(false);}}>{reviewing?'Back to problems':'Review PM'}</button>:null}{allowed&&!selected&&!creating?<Link className="primary" href={'/problems?'+new URLSearchParams({workspace,new:'1'})}>+ New problem</Link>:null}</div></header>}
    >
      {!session ? (
        <p role="status">Loading your workspace…</p>
      ) : !allowed ? (
        <section className="panel">
          <h2>Support workspace required</h2>
          <p>
            Choose an authorized Technician, Management or Administration
            workspace to use Problem Management.
          </p>
          <Link href="/">Choose workspace</Link>
        </section>
      ) : (
        <div className="problem-module">
          {reviewing&&reviewer&&session?<KnowledgeReview kind="PROBLEM" csrfToken={session.csrfToken} revision={revision} organizations={options.clients} onReviewed={w.refresh}/>:<>
          {!selected && !creating && <section className="panel problem-heading">
            <div>
              <span className="problem-eyebrow">SERVICE DELIVERY</span>
              <h2>Find the cause. Prevent the repeat.</h2>
              <p>
                Problem records stay separate from incidents. Linking an
                incident does not change its status or SLA.
              </p>
            </div>
          </section>}
          {creating && allowed && !selected && (
            <form id="problem-create" className="panel problem-form" onSubmit={create}>
              <div className="problem-detail-heading"><h2>Create problem</h2><Link className="secondary" href={'/problems?'+new URLSearchParams({workspace})}>Cancel</Link></div>
              <p className="hint">{session?.user.roles.includes('TECHNICIAN')&&!reviewer?'Submit this investigation for team lead, manager or administrator approval. After approval, permitted technicians can use the findings and workaround. ':'Document the recurring issue and link related tickets in the investigation. '}Linking tickets does not change their status or SLA.</p>
              <div className="problem-fields">
                <label>
                  Client
                  <select
                    required
                    value={draft.clientId}
                    onChange={(e) => {
                      setSelectedTickets([]);
                      setDraft({
                        ...draft,
                        clientId: e.target.value,
                        siteId: '',
                      });
                    }}
                  >
                    <option value="">Select client</option>
                    {options.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Site
                  <select
                    value={draft.siteId}
                    onChange={(e) => {setSelectedTickets([]);setDraft({ ...draft, siteId: e.target.value });}}
                  >
                    <option value="">Client-wide investigation</option>
                    {options.sites
                      .filter((s) => s.client_id === draft.clientId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft({ ...draft, priority: e.target.value })
                    }
                  >
                    {priorities.map((s) => (
                      <option key={s} value={s}>{label(s)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Title
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  required
                  minLength={3}
                  maxLength={10000}
                  rows={4}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <p>
                Owner: <strong>{session?.user.displayName}</strong>. Your signed-in account owns this investigation initially.
              </p>
              <label>Observed recurrence<textarea maxLength={2000} rows={3} value={draft.recurrence} onChange={e=>setDraft({...draft,recurrence:e.target.value})} placeholder="How often does it happen? Since when? What do the repeated tickets have in common?" /></label>
              <label>Business impact<textarea maxLength={2000} rows={3} value={draft.businessImpact} onChange={e=>setDraft({...draft,businessImpact:e.target.value})} placeholder="Affected users, services and operational impact" /></label>
              <details><summary>Initial findings (optional)</summary><div className="problem-form"><label>Suspected / confirmed root cause<textarea maxLength={5000} rows={3} value={draft.rootCause} onChange={e=>setDraft({...draft,rootCause:e.target.value})} placeholder="Leave blank if the cause is still under investigation" /></label><label>Temporary workaround<textarea maxLength={5000} rows={3} value={draft.workaround} onChange={e=>setDraft({...draft,workaround:e.target.value})} placeholder="Safe steps other technicians can follow while a permanent fix is investigated" /></label></div></details>
              <ProblemTicketPicker clientId={draft.clientId} siteId={draft.siteId} selected={selectedTickets} onChange={selectCreationTickets} request={request}/>
              <p className="hint">Selected tickets are saved with this problem. A problem can also be raised proactively without linking tickets yet.</p>
              <button disabled={w.busy}>{session?.user.roles.includes('TECHNICIAN')&&!reviewer?'Submit for review':'Create investigation'}</button>
            </form>
          )}
          {!selected && !creating && <section className="panel problem-register problem-search">
            <div><h2>Search problems</h2><p>Find a problem by its number, title or details, or by a linked ticket’s number or subject. Open a result to view the full investigation and solution.</p></div>
            <div className="problem-filters">
              <label>
                Problem or linked ticket
                <input
                  placeholder="Problem / ticket number, title, subject or details…"
                  maxLength={200}
                  value={filter.q}
                  onChange={(e) =>
                    setFilter({ ...filter, q: e.target.value, page: 1 })
                  }
                />
              </label>
              <label>
                Client
                <select
                  value={filter.clientId}
                  onChange={(e) =>
                    setFilter({ ...filter, clientId: e.target.value, page: 1 })
                  }
                >
                  <option value="">All accessible clients</option>
                  {options.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={filter.status}
                  onChange={(e) =>
                    setFilter({ ...filter, status: e.target.value, page: 1 })
                  }
                >
                  <option value="">All statuses</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p aria-live="polite">
              {loading
                ? 'Loading investigations…'
                : `${rows.total} problem${rows.total === 1 ? '' : 's'} found`}
            </p>
            <div className="problem-table">
              <table>
                <thead>
                  <tr>
                    <th>Problem</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Updated</th>
                    <th className="problem-actions-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.items.map((p) => (
                    <tr
                      key={p.id}
                      className={selected === p.id ? 'selected' : ''}
                    >
                      <td>
                        <Link
                          className="problem-record"
                          href={'/problems?'+new URLSearchParams({problem:p.id,workspace})}
                        >
                          <strong>{p.problem_number}</strong>
                          <span>{p.title}</span>
                        </Link>
                      </td>
                      <td>{p.client_name}</td>
                      <td>
                        <span
                          className={`problem-status status-${p.status.toLowerCase()}`}
                        >
                          {label(p.status)}
                        </span>
                      </td>
                      <td>{label(p.priority)}</td>
                      <td>{p.owner_name}</td>
                      <td>{date(p.updated_at)}</td>
                      <td><div className="problem-list-ticket-action"><button type="button" className="secondary" disabled={!p.can_link} onClick={()=>setAttachDialog({problem:p})}>Add tickets</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !rows.items.length && (
              <p>
                No problems match your search. Try a problem number or title, or the number or subject of a linked ticket.
              </p>
            )}
            <div className="problem-paging">
              <button
                className="secondary"
                disabled={filter.page === 1 || loading}
                onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
              >
                Previous
              </button>
              <span>Page {filter.page}</span>
              <button
                className="secondary"
                disabled={filter.page * 20 >= rows.total || loading}
                onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
              >
                Next
              </button>
            </div>
          </section>}
          {selected && detail?.problem.id !== selected && !w.error && (
            <p role="status">Loading problem…</p>
          )}
          {detail && detail.problem.id === selected && edit && (
            <div className="problem-detail">
              <ProblemSolutionChart problem={detail.problem} ticketCount={detail.tickets.length} actions={<div className="problem-ticket-row-actions"><button type="button" className="secondary" disabled={!detail.canLink} onClick={()=>setAttachDialog({problem:{...detail.problem,can_link:detail.canLink}})}>Add tickets</button><button type="button" className="primary" disabled={!canEdit || (!detail.canManage && detail.problem.status==='CLOSED')} onClick={()=>{setProblemFocus('editor');document.getElementById('problem-editor')?.scrollIntoView({behavior:'smooth',block:'start'});}}>Update problem</button></div>}/>
              <form id="problem-editor" className="panel problem-form" onSubmit={save}>
                <div className="problem-detail-heading">
                  <div>
                    <span className="problem-eyebrow">
                      {detail.problem.problem_number}
                    </span>
                    <h2>Investigation</h2>
                    <p>
                      {detail.problem.client_name} · Owner:{' '}
                      {detail.problem.owner_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      navigate('/problems?'+new URLSearchParams({workspace}));
                    }}
                  >
                    Close view
                  </button>
                </div>
                <fieldset disabled={!canEdit || w.busy}>
                  <label>
                    Title
                    <input
                      required
                      minLength={3}
                      maxLength={200}
                      value={edit.title}
                      onChange={(e) =>
                        setEdit({ ...edit, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      required
                      minLength={3}
                      maxLength={10000}
                      rows={4}
                      value={edit.description}
                      onChange={(e) =>
                        setEdit({ ...edit, description: e.target.value })
                      }
                    />
                  </label>
                  <div className="problem-fields">
                    <label>
                      Status
                      <select
                        value={edit.status}
                        onChange={(e) =>
                          setEdit({ ...edit, status: e.target.value })
                        }
                      >
                        {statuses
                          .filter(
                            (s) =>
                              s !== 'CLOSED' ||
                              detail.canManage ||
                              edit.status === 'CLOSED',
                          )
                          .map((s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Priority
                      <select
                        value={edit.priority}
                        onChange={(e) =>
                          setEdit({ ...edit, priority: e.target.value })
                        }
                      >
                        {priorities.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Owner
                      <select
                        disabled={!detail.canManage}
                        value={edit.ownerUserId}
                        onChange={(e) =>
                          setEdit({ ...edit, ownerUserId: e.target.value })
                        }
                      >
                        <option value={detail.problem.owner_user_id}>
                          {detail.problem.owner_name}
                        </option>
                        {detail.owners
                          .filter((o) => o.id !== detail.problem.owner_user_id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.display_name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Root cause
                    <textarea
                      maxLength={10000}
                      rows={4}
                      placeholder="What caused the recurring incidents?"
                      value={edit.rootCause}
                      onChange={(e) =>
                        setEdit({ ...edit, rootCause: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Workaround
                    <textarea
                      maxLength={10000}
                      rows={4}
                      placeholder="Temporary steps to restore service safely"
                      value={edit.workaround}
                      onChange={(e) =>
                        setEdit({ ...edit, workaround: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Resolution
                    <textarea
                      maxLength={10000}
                      rows={4}
                      placeholder="Permanent fix and validation evidence"
                      value={edit.resolution}
                      onChange={(e) =>
                        setEdit({ ...edit, resolution: e.target.value })
                      }
                    />
                  </label>
                </fieldset>
                <p>
                  Known errors require a root cause and workaround. Resolution
                  requires a root cause and permanent fix. Management reviews
                  and closes resolved problems.
                </p>
                {canEdit && (
                  <button
                    disabled={
                      w.busy ||
                      (!detail.canManage && detail.problem.status === 'CLOSED')
                    }
                  >
                    Save investigation
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={w.busy}
                  onClick={() => w.refresh()}
                >
                  Reload latest
                </button>
              </form>
              <aside className="problem-support">
                <ExpandablePanel title="Affected tickets" className="">
                  {detail.tickets.length ? (
                    detail.tickets.map((t) => (
                      <div className="problem-linked-ticket" key={t.id}>
                        <Link href={`${ticketBase}/${t.id}`}>
                          <span className="problem-ticket-number">{t.ticket_number}</span> · {t.subject}
                        </Link>
                        <small>{label(t.status)}</small>
                        {canEdit && detail.problem.status !== 'CLOSED' && (
                          <button
                            className="primary"
                            disabled={w.busy}
                            onClick={() => void link(t.id, true)}
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p>No visible linked tickets.</p>
                  )}
                  {canEdit && detail.problem.status !== 'CLOSED' && (
                    <>
                      <form onSubmit={searchTickets}>
                        <label>
                          Find an affected ticket
                          <input
                            value={ticketQuery}
                            placeholder="Ticket number or subject"
                            onChange={(e) => setTicketQuery(e.target.value)}
                          />
                        </label>
                        <button className="primary" disabled={w.busy}>
                          Search tickets
                        </button>
                      </form>
                      <p>
                        Only tickets you can access in this client can be
                        linked.
                      </p>
                      {pendingTicket && (
                        <button
                          disabled={w.busy}
                          onClick={() => void link(pendingTicket)}
                        >
                          Link the ticket you came from
                        </button>
                      )}
                      {ticketResults.map((t) => (
                        <div className="problem-linked-ticket" key={t.id}>
                          <span>
                            <span className="problem-ticket-number">{t.ticket_number}</span> · {t.subject}
                          </span>
                          <button
                            disabled={w.busy}
                            onClick={() => void link(t.id)}
                          >
                            Link ticket
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </ExpandablePanel>
                <ExpandablePanel title="Investigation timeline" className="">
                  {allowed && detail.problem.status !== 'CLOSED' && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await w.save(`/problems/${selected}/notes`, {
                            body: note,
                          });
                          setNote('');
                        } catch {
                          /* The workspace displays the request error. */
                        }
                      }}
                    >
                      <label>
                        Add investigation note
                        <textarea
                          required
                          minLength={2}
                          maxLength={5000}
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                      <button disabled={w.busy}>Add note</button>
                    </form>
                  )}
                  <ol className="problem-timeline">
                    {detail.history.map((h) => (
                      <li key={h.id}>
                        <strong>
                          {label(h.action.replace('PROBLEM.', ''))}
                        </strong>
                        <small>
                          {h.actor_name} · {date(h.created_at)}
                        </small>
                        {h.details.body && <p>{h.details.body}</p>}
                        {h.details.status && (
                          <p>
                            {label(h.details.previousStatus ?? '')} →{' '}
                            {label(h.details.status)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  <p>
                    Showing the latest 200 events. All events remain in the
                    audit trail.
                  </p>
                </ExpandablePanel>
              </aside>
            </div>
          )}
        </>}
          {attachDialog?<AddProblemTicketsDialog ticket={attachDialog.ticket} problem={attachDialog.problem} request={request} save={(path,payload)=>w.save(path,payload)} onClose={()=>setAttachDialog(undefined)} onSaved={id=>{setAttachDialog(undefined);choose(id);}}/>:null}
        </div>
      )}
    </WorkspaceFrame>
  );
}
