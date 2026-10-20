'use client';
import ExpandablePanel from './expandable-panel';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useWorkspace, WorkspaceFrame, type Option } from './workspace-tools';
import './problem-workspace.css';
import AdministrationOversight from './administration-oversight';
type Problem = {
  id: string;
  problem_number: string;
  client_id: string;
  client_name: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  owner_user_id: string;
  owner_name: string;
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
  initialProblem = '',
  initialTicket = '',
  initialClient = '',
}: {
  initialProblem?: string;
  initialTicket?: string;
  initialClient?: string;
}) {
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
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    clientId: initialClient,
    siteId: '',
    title: '',
    description: '',
    priority: 'P3_MEDIUM',
  });
  const [note, setNote] = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketResults, setTicketResults] = useState<Ticket[]>([]);
  const [pendingTicket, setPendingTicket] = useState(initialTicket);
  const allowed = session?.user.roles.some((r) =>
    ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
  );
  const workspace = session?.user.workspace ?? 'operations';
  const readOnly = workspace === 'admin';
  const canEdit = !readOnly && Boolean(detail?.canEdit);
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
    if (!allowed) return;
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
  }, [allowed, filter, revision, request, setError]);
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
      })) as Problem;
      setCreating(false);
      setSelected(data.id);
      setDraft((d) => ({ ...d, title: '', description: '' }));
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
  function choose(id: string) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('problem', id);
    window.history.replaceState(null, '', url);
  }
  return (
    <WorkspaceFrame
      title="Problem Management"
      description="Investigate recurring incidents, document root causes and maintain known errors."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
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
          {readOnly ? <AdministrationOversight /> : null}
          <section className="panel problem-heading">
            <div>
              <span className="problem-eyebrow">SERVICE DELIVERY</span>
              <h2>Find the cause. Prevent the repeat.</h2>
              <p>
                Problem records stay separate from incidents. Linking an
                incident does not change its status or SLA.
              </p>
            </div>
            {!readOnly && (
              <button type="button" onClick={() => setCreating(!creating)}>
                {creating ? 'Cancel' : 'New problem'}
              </button>
            )}
          </section>
          {creating && !readOnly && (
            <form className="panel problem-form" onSubmit={create}>
              <h2>Create problem</h2>
              <div className="problem-fields">
                <label>
                  Client
                  <select
                    required
                    value={draft.clientId}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        clientId: e.target.value,
                        siteId: '',
                      })
                    }
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
                    onChange={(e) =>
                      setDraft({ ...draft, siteId: e.target.value })
                    }
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
                      <option key={s}>{s}</option>
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
                You will own this investigation initially. Management can
                reassign it.
              </p>
              <button disabled={w.busy}>Create investigation</button>
            </form>
          )}
          <section className="panel">
            <div className="problem-filters">
              <label>
                Search problems
                <input
                  placeholder="Number or title"
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
                  </tr>
                </thead>
                <tbody>
                  {rows.items.map((p) => (
                    <tr
                      key={p.id}
                      className={selected === p.id ? 'selected' : ''}
                    >
                      <td>
                        <button
                          className="problem-record"
                          onClick={() => choose(p.id)}
                        >
                          <strong>{p.problem_number}</strong>
                          <span>{p.title}</span>
                        </button>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && !rows.items.length && (
              <p>
                No problems match this view. Create an investigation for
                recurring incidents.
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
          </section>
          {selected && detail?.problem.id !== selected && !w.error && (
            <p role="status">Loading problem…</p>
          )}
          {detail && detail.problem.id === selected && edit && (
            <div className="problem-detail">
              <form className="panel problem-form" onSubmit={save}>
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
                      setSelected('');
                      const url = new URL(window.location.href);
                      url.searchParams.delete('problem');
                      window.history.replaceState(null, '', url);
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
                          {t.ticket_number} · {t.subject}
                        </Link>
                        <small>{label(t.status)}</small>
                        {canEdit && detail.problem.status !== 'CLOSED' && (
                          <button
                            className="secondary"
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
                        <button className="secondary" disabled={w.busy}>
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
                            {t.ticket_number} · {t.subject}
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
                  {!readOnly && detail.problem.status !== 'CLOSED' && (
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
        </div>
      )}
    </WorkspaceFrame>
  );
}
