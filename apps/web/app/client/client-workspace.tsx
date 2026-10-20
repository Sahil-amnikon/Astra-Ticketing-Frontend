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
type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  client_name: string;
  site_name?: string;
  category_name?: string;
  updated_at: string;
  can_reply?: boolean;
};
type Detail = {
  ticket: Ticket;
  comments: {
    id: string;
    body: string;
    author_name: string;
    created_at: string;
  }[];
  attachments: { id: string; file_name: string }[];
  sla?: { response_due_at: string; resolution_due_at: string };
};
type Contact = Option & {
  client_id: string;
  client_name: string;
  routing_site_id?: string | null;
};
export async function readPortalFiles(files: File[]) {
  if (files.length > 5 || files.some((f) => f.size > 5 * 1024 * 1024))
    throw new Error('Choose up to five files, each no larger than 5 MB.');
  return Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      contentType: file.type || 'text/plain',
      contentBase64: await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = () => reject(new Error('Could not read attachment.'));
        r.readAsDataURL(file);
      }),
    })),
  );
}
export default function ClientWorkspace() {
  const w = useWorkspace();
  const { session, request, revision, setError } = w;
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ items: Ticket[]; total: number }>();
  const [id, setId] = useState('');
  const [detail, setDetail] = useState<Detail>();
  const [creating, setCreating] = useState(false);
  const [contactId, setContactId] = useState('');
  const [options, setOptions] = useState<{
    contacts: Contact[];
    sites: Option[];
    categories: Option[];
  }>({ contacts: [], sites: [], categories: [] });
  const [template, setTemplate] = useState<{
    name: string;
    instructions: string;
    category_id: string;
    client_id?: string;
  }>();
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => {
    if (!session?.user.roles.includes('USER')) return;
    let live = true;
    const linkedTicket = new URLSearchParams(window.location.search).get(
      'ticket',
    );
    if (linkedTicket && /^[a-f0-9-]{36}$/i.test(linkedTicket))
      queueMicrotask(() => {
        if (live) setId(linkedTicket);
      });
    void request<typeof options>('/portal/options')
      .then((o) => {
        if (live) setOptions(o);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('template');
    if (templateId)
      void request<{
        items: ({ id: string } & NonNullable<typeof template>)[];
      }>('/knowledge/catalogue')
        .then((c) => {
          const t = c.items.find((x) => x.id === templateId);
          if (live && t) {
            setTemplate(t);
            setCreating(true);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [session, request, setError]);
  useEffect(() => {
    if (!session?.user.roles.includes('USER')) return;
    let live = true;
    const controller = new AbortController();
    void request<typeof list>(
      `/portal/tickets?page=${page}&q=${encodeURIComponent(search)}`,
      { signal: controller.signal },
    )
      .then((l) => {
        if (live) setList(l);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [request, session, revision, page, search, setError]);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void request<Detail>(`/portal/tickets/${id}`)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [request, id, revision, setError]);
  const contact = options.contacts.find((c) => c.id === contactId);
  const allowedContacts = options.contacts.filter(
    (c) => !template?.client_id || c.client_id === template.client_id,
  );
  return (
    <WorkspaceFrame
      title="My support"
      description="Raise a request and follow your conversations with the service desk."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
    >
      {!session?.user.roles.includes('USER') ? (
        <p>
          Ask your administrator to grant the User role and link your contact
          before using this portal.
        </p>
      ) : (
        <>
          <div className="v38-row">
            <button
              className="primary"
              type="button"
              onClick={() => {
                setCreating(true);
                setId('');
                setDetail(undefined);
                setFiles([]);
              }}
            >
              New request
            </button>
            <Link className="secondary" href="/catalogue">
              Browse services
            </Link>
            <Link className="secondary" href="/knowledge">
              Find an answer
            </Link>
            <button className="secondary" type="button" onClick={w.refresh}>
              Refresh
            </button>
          </div>
          {options.contacts.length === 0 ? (
            <div className="notice">
              Your account needs an active contact linked to an assigned client.
              Ask your administrator to set this up in Contacts.
            </div>
          ) : null}
          {creating ? (
            <form
              className="panel v38-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void readPortalFiles(files)
                  .then((attachments) =>
                    w.save('/portal/tickets', {
                      contactId,
                      siteId: optionalField(f, 'site'),
                      categoryId: field(f, 'category'),
                      subject: field(f, 'subject'),
                      description: field(f, 'description'),
                      attachments,
                    }),
                  )
                  .then((r) => {
                    setCreating(false);
                    setTemplate(undefined);
                    setFiles([]);
                    setId((r as { id: string }).id);
                  })
                  .catch((e) => setError(e.message));
              }}
            >
              <div className="v38-row">
                <h2>
                  {template
                    ? `Request: ${template.name}`
                    : 'New support request'}
                </h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setCreating(false);
                    setTemplate(undefined);
                  }}
                >
                  Cancel
                </button>
              </div>
              <div className="v38-form-grid">
                <label>
                  Organization / contact
                  <select
                    required
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                  >
                    <option value="">Select your organization</option>
                    {allowedContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.client_name} · {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Site
                  <select
                    key={contactId}
                    name="site"
                    aria-label="Site"
                    defaultValue={
                      contact?.routing_site_id ?? contact?.site_id ?? ''
                    }
                    disabled={Boolean(
                      contact?.routing_site_id || contact?.site_id,
                    )}
                  >
                    <option value="">Select site, if applicable</option>
                    <SelectOptions
                      items={options.sites.filter(
                        (s) =>
                          s.client_id === contact?.client_id &&
                          (!(contact?.routing_site_id ?? contact?.site_id) ||
                            s.id ===
                              (contact?.routing_site_id ?? contact?.site_id)),
                      )}
                    />
                  </select>
                  {contact?.routing_site_id ? (
                    <small className="hint">
                      This site is assigned by your customer email domain.
                    </small>
                  ) : null}
                </label>
                <label>
                  Category
                  <select
                    name="category"
                    required
                    defaultValue={template?.category_id ?? ''}
                  >
                    <option value="">Select category</option>
                    <SelectOptions items={options.categories} />
                  </select>
                </label>
              </div>
              <label>
                Subject
                <input
                  name="subject"
                  required
                  minLength={3}
                  maxLength={300}
                  defaultValue={template?.name}
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  required
                  minLength={3}
                  maxLength={20000}
                  rows={8}
                  defaultValue={template?.instructions}
                  onPaste={(e) => {
                    const images = Array.from(e.clipboardData.files);
                    if (images.length) {
                      e.preventDefault();
                      setFiles((f) => [...f, ...images].slice(0, 5));
                    }
                  }}
                />
              </label>
              <label>
                Attachments
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.docx,.xlsx"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <p>
                You can paste an image into the description. Up to five files, 5
                MB each.
              </p>
              {files.map((f, i) => (
                <div className="v38-row" key={`${f.name}-${i}`}>
                  <span>{f.name}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button className="primary" disabled={w.busy || !contactId}>
                Submit request
              </button>
            </form>
          ) : null}
          {id && detail?.ticket.id === id ? (
            <>
              <section className="panel v38-stack">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setId('');
                    setDetail(undefined);
                  }}
                >
                  Back to my tickets
                </button>
                <h2>
                  {detail.ticket.ticket_number} · {detail.ticket.subject}
                </h2>
                <div className="v38-row">
                  <span className="v38-chip">
                    {detail.ticket.status.replaceAll('_', ' ')}
                  </span>
                  <span>
                    {detail.ticket.client_name} ·{' '}
                    {detail.ticket.site_name ?? 'Organization-wide'}
                  </span>
                </div>
                <p className="v38-prewrap">{detail.ticket.description}</p>
                {detail.attachments.map((a) => (
                  <a
                    className="secondary"
                    href={`/api/portal/tickets/${id}/attachments/${a.id}`}
                    key={a.id}
                  >
                    {a.file_name}
                  </a>
                ))}
              </section>
              <section className="panel v38-stack">
                <h2>Conversation</h2>
                {detail.comments.map((c) => (
                  <article key={c.id} className="v38-message">
                    <strong>{c.author_name}</strong>
                    <small> · {new Date(c.created_at).toLocaleString()}</small>
                    <p className="v38-prewrap">{c.body}</p>
                  </article>
                ))}
                {detail.ticket.can_reply !== false ? (
                  <form
                    className="v38-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      const selected = f
                        .getAll('files')
                        .filter(
                          (x): x is File => x instanceof File && x.size > 0,
                        );
                      void readPortalFiles(selected)
                        .then((attachments) =>
                          w.save(`/portal/tickets/${id}/replies`, {
                            body: field(f, 'body'),
                            attachments,
                          }),
                        )
                        .then(() => form.reset())
                        .catch((e) => setError(e.message));
                    }}
                  >
                    <label>
                      Your reply
                      <textarea name="body" required maxLength={20000} />
                    </label>
                    <label>
                      Attach files
                      <input
                        type="file"
                        multiple
                        name="files"
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.docx,.xlsx"
                      />
                    </label>
                    <button disabled={w.busy} className="primary">
                      Post reply
                    </button>
                  </form>
                ) : (
                  <p className="hint">
                    You have view access to this organization ticket. Reply
                    permission is required to join the conversation.
                  </p>
                )}
              </section>
            </>
          ) : !creating ? (
            <section className="panel v38-stack">
              <form
                className="v38-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(q);
                  setPage(1);
                }}
              >
                <label>
                  Search my tickets
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <button className="secondary">Search</button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setQ('');
                    setSearch('');
                    setPage(1);
                  }}
                >
                  Clear
                </button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Organization</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list?.items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setId(t.id);
                              setDetail(undefined);
                            }}
                          >
                            {t.ticket_number} — {t.subject}
                          </button>
                        </td>
                        <td>{t.client_name}</td>
                        <td>{t.status.replaceAll('_', ' ')}</td>
                        <td>{new Date(t.updated_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list && !list.items.length ? <p>No matching tickets.</p> : null}
              <div className="v38-row">
                <button
                  className="secondary"
                  disabled={page === 1}
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} · {list?.total ?? 0} tickets
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= (list?.total ?? 0)}
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}
    </WorkspaceFrame>
  );
}
