'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  WorkspaceFrame,
  useWorkspace,
  field,
  optionalField,
  SelectOptions,
  type Option,
} from '../workspace-tools';
type Entry = {
  id: string;
  title?: string;
  name?: string;
  body?: string;
  description?: string;
  instructions?: string;
  category_id?: string;
  client_id?: string;
  category_name?: string;
  status?: string;
  visibility?: string;
  active?: boolean;
  revision?: number;
  updated_at: string;
};
type Result = {
  items: Entry[];
  total?: number;
  canManage: boolean;
  isAdmin: boolean;
};
export default function KnowledgeWorkspace({
  catalogue = false,
}: {
  catalogue?: boolean;
}) {
  const w = useWorkspace();
  const { session, request, revision, setError } = w;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result>();
  const [options, setOptions] = useState<{
    clients: Option[];
    categories: Option[];
  }>({ clients: [], categories: [] });
  const [editor, setEditor] = useState<Entry | null>();
  const [selected, setSelected] = useState<Entry>();
  const [tickets, setTickets] = useState<
    { id: string; ticket_number: string; subject: string }[]
  >([]);
  const staff = session?.user.roles.some((r) =>
    ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
  );
  const endpoint = catalogue ? '/knowledge/catalogue' : '/knowledge';
  useEffect(() => {
    if (!session) return;
    let live = true;
    const controller = new AbortController();
    void Promise.all([
      request<Result>(
        catalogue
          ? endpoint
          : `${endpoint}?page=${page}&q=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      ),
      request<typeof options>('/knowledge/options'),
    ])
      .then(([r, o]) => {
        if (live) {
          setData(r);
          setOptions(o);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [request, session, revision, page, search, catalogue, endpoint, setError]);
  async function open(entry: Entry) {
    setSelected(entry);
    if (staff && !catalogue)
      try {
        const t = await request<{ items: typeof tickets }>(
          '/tickets?pageSize=100',
        );
        setTickets(t.items);
      } catch (e) {
        setError((e as Error).message);
      }
  }
  const shown = catalogue
    ? data?.items.filter((x) =>
        `${x.name} ${x.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : data?.items;
  useEffect(() => {
    if (!session || catalogue) return;
    const id = new URLSearchParams(window.location.search).get('article');
    if (!id) return;
    let live = true;
    void request<Entry>(`/knowledge/${encodeURIComponent(id)}`)
      .then((a) => {
        if (live) setSelected(a);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session, request, catalogue, setError]);
  return (
    <WorkspaceFrame
      title={catalogue ? 'Service catalogue' : 'Knowledge base'}
      description={
        catalogue
          ? 'Reusable request forms for the services your team provides.'
          : 'Find published guidance and link useful articles to your tickets.'
      }
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
    >
      <section className="panel knowledge-toolbar">
        <form
          className="knowledge-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
        >
          <label>
            Search
            <input
              value={q}
              maxLength={200}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button className="primary">Search</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setQ('');
              setSearch('');
              setPage(1);
            }}
          >
            Clear
          </button>
        </form>
        {data?.canManage ? (
          <button
            className="primary"
            type="button"
            onClick={() => setEditor(null)}
          >
            Add {catalogue ? 'service' : 'article'}
          </button>
        ) : null}
      </section>
      {editor !== undefined ? (
        <form
          className="panel v38-stack"
          key={editor?.id ?? 'new'}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const payload = catalogue
              ? {
                  name: field(f, 'title'),
                  description: field(f, 'description'),
                  instructions: field(f, 'body'),
                  categoryId: field(f, 'category'),
                  clientId: optionalField(f, 'client'),
                  active: f.has('active'),
                }
              : {
                  title: field(f, 'title'),
                  body: field(f, 'body'),
                  categoryId: optionalField(f, 'category'),
                  clientId: optionalField(f, 'client'),
                  visibility: field(f, 'visibility'),
                  status: field(f, 'status'),
                  revision: editor?.revision,
                };
            void w
              .save(
                `${endpoint}${editor ? `/${editor.id}` : ''}`,
                payload,
                editor ? 'PATCH' : 'POST',
              )
              .then(() => {
                setEditor(undefined);
                setSelected(undefined);
              })
              .catch(() => {});
          }}
        >
          <div className="v38-row">
            <h2>
              {editor ? 'Edit' : 'New'}{' '}
              {catalogue ? 'service template' : 'article'}
            </h2>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditor(undefined)}
            >
              Cancel
            </button>
          </div>
          <label>
            {catalogue ? 'Service name' : 'Title'}
            <input
              name="title"
              required
              minLength={3}
              maxLength={200}
              defaultValue={editor?.title ?? editor?.name}
            />
          </label>
          <div className="v38-form-grid">
            <label>
              Organization
              <select
                name="client"
                required={!data?.isAdmin}
                defaultValue={editor?.client_id ?? ''}
              >
                <option value="">
                  {data?.isAdmin
                    ? 'Global — all permitted readers'
                    : 'Choose assigned organization'}
                </option>
                <SelectOptions items={options.clients} />
              </select>
            </label>
            <label>
              Category
              <select
                name="category"
                required={catalogue}
                defaultValue={editor?.category_id ?? ''}
              >
                <option value="">Select category</option>
                <SelectOptions items={options.categories} />
              </select>
            </label>
          </div>
          {catalogue ? (
            <label>
              Service description
              <textarea
                name="description"
                required
                minLength={3}
                maxLength={5000}
                defaultValue={editor?.description}
              />
            </label>
          ) : (
            <div className="v38-form-grid">
              <label>
                Audience
                <select
                  name="visibility"
                  defaultValue={editor?.visibility ?? 'STAFF'}
                >
                  <option value="STAFF">Staff only</option>
                  <option value="CLIENT">Clients and staff</option>
                </select>
              </label>
              <label>
                Publication status
                <select name="status" defaultValue={editor?.status ?? 'DRAFT'}>
                  <option>DRAFT</option>
                  <option>PUBLISHED</option>
                  <option>ARCHIVED</option>
                </select>
              </label>
            </div>
          )}
          <label>
            {catalogue
              ? 'Request instructions / information to collect'
              : 'Article content'}
            <textarea
              name="body"
              rows={10}
              required
              minLength={catalogue ? 3 : 10}
              maxLength={catalogue ? 20000 : 50000}
              defaultValue={editor?.body ?? editor?.instructions}
            />
          </label>
          {catalogue ? (
            <label className="v38-check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editor?.active ?? true}
              />
              Active service
            </label>
          ) : null}
          <button className="primary" disabled={w.busy}>
            Save {catalogue ? 'service' : 'article'}
          </button>
        </form>
      ) : null}
      {selected ? (
        <section className="panel v38-stack">
          <div className="v38-row">
            <h2>{selected.title ?? selected.name}</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(undefined)}
            >
              Close
            </button>
          </div>
          <p className="v38-prewrap">{selected.body ?? selected.description}</p>
          {catalogue ? (
            <>
              <p className="v38-prewrap">{selected.instructions}</p>
              {selected.active ? (
                <Link
                  className="primary"
                  href={`${staff ? '/operations/new' : '/client'}?template=${selected.id}`}
                >
                  Request this service
                </Link>
              ) : null}
            </>
          ) : staff ? (
            <form
              className="v38-row"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void w
                  .save(`/knowledge/${selected.id}/tickets`, {
                    ticketId: field(f, 'ticket'),
                  })
                  .catch(() => {});
              }}
            >
              <label>
                Link to a ticket
                <select name="ticket" required>
                  <option value="">Select ticket</option>
                  {tickets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.ticket_number} — {t.subject}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" disabled={w.busy}>
                Link article
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      <div className="v38-card-grid">
        {shown?.map((x) => (
          <article className="panel v38-stack" key={x.id}>
            <div className="v38-row">
              <span className="v38-chip">{x.category_name ?? 'General'}</span>
              {data?.canManage ? (
                <small>
                  {catalogue
                    ? x.active
                      ? 'Active'
                      : 'Inactive'
                    : `${x.status} · ${x.visibility}`}
                </small>
              ) : null}
            </div>
            <h2>
              <button
                className="link-button"
                type="button"
                onClick={() => void open(x)}
              >
                {x.title ?? x.name}
              </button>
            </h2>
            <p>
              {(x.description ?? x.body ?? '').slice(0, 240)}
              {(x.body?.length ?? 0) > 240 ? '…' : ''}
            </p>
            {data?.canManage && (data.isAdmin || x.client_id) ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(x)}
              >
                Edit
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {data && !shown?.length ? (
        <section className="panel knowledge-empty-state">
          <strong>No matching {catalogue ? 'services' : 'articles'}.</strong>
          <p>
            {search
              ? 'Try a different search term or clear the filter.'
              : catalogue
                ? 'Service templates will appear here once they are published.'
                : 'Published articles will appear here once they are created.'}
          </p>
        </section>
      ) : null}
      {!catalogue ? (
        <div className="knowledge-pagination">
          <button
            type="button"
            className="secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} · {data?.total ?? 0} articles
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page * 20 >= (data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </WorkspaceFrame>
  );
}
