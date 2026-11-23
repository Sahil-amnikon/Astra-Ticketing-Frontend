'use client';
import { uiLabel } from '../ui-label';
import Link from '../../navigation/link';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import KnowledgeReview from './knowledge-review';
import ArticleTicketPicker from './article-ticket-picker';
import { KnowledgeContent, KnowledgeEditor, parseKnowledge, type KnowledgeUpload } from './knowledge-content';
import { KnowledgeScopeFields, KnowledgeSpecifications, knowledgeDetailsFromForm } from './knowledge-details';
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
  can_edit_own_article?: boolean;
  author_name?: string;
  updated_at: string;
};
type Result = {
  items: Entry[];
  total?: number;
  canManage: boolean;
  canDraft?: boolean;
  isAdmin: boolean;
};
export default function KnowledgeWorkspace({
  catalogue = false,
  creationPage = false,
  articleId = '',
}: {
  catalogue?: boolean;
  creationPage?: boolean;
  articleId?: string;
}) {
  const navigate = useNavigate();
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
  const [editor, setEditor] = useState<Entry | null | undefined>(creationPage ? null : undefined);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entry>();
  const [reviewing, setReviewing] = useState(() => new URLSearchParams(window.location.search).get(catalogue ? 'reviewService' : 'reviewKB') === '1');
  const [uploads, setUploads] = useState<KnowledgeUpload[]>([]);
  const [retainedAttachments, setRetainedAttachments] = useState<string[]>([]);
  const reviewer = session?.user.roles.some(r => ['TEAM_LEAD','MANAGER','ADMIN'].includes(r));
  function editArticle(entry: Entry | null) { setUploads([]); setRetainedAttachments(parseKnowledge(entry?.body).files.map(f => f.id)); setEditor(entry); setSelected(undefined); setReviewing(false); }
  const [tickets, setTickets] = useState<
    { id: string; ticket_number: string; subject: string }[]
  >([]);
  const staff = session?.user.roles.some((r) =>
    ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
  );
  const limitedAuthor = !data?.canManage && data?.canDraft;
  const endpoint = catalogue ? '/knowledge/catalogue' : '/knowledge';
  const listUrl=(catalogue?'/catalogue':'/knowledge')+'?'+new URLSearchParams({workspace:session?.user.workspace??new URLSearchParams(window.location.search).get('workspace')??'operations'});
  const editorPage=editor!==undefined;
  const detailPage=!catalogue && Boolean(articleId);
  function cancelEditor(){if(creationPage||detailPage)navigate(listUrl);else setEditor(undefined);}
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(q.trim());setPage(1);},300);return()=>clearTimeout(timer);},[q]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const controller = new AbortController();
    setLoading(true);
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
      }).finally(()=>{if(live)setLoading(false);});
    return () => {
      live = false;
      controller.abort();
    };
  }, [request, session, revision, page, search, catalogue, endpoint, setError]);
  async function open(entry: Entry) {
    setSelected(entry);
    if (staff && !catalogue && (data?.canManage || entry.status === 'PUBLISHED'))
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
        `${x.name??''} ${x.description??''} ${x.instructions??''} ${x.category_name??''}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : data?.items;
  useEffect(() => {
    if (!session || catalogue || creationPage) return;
    const id = articleId;
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
  }, [session, request, catalogue, creationPage, articleId, setError]);
  useEffect(() => {
    if (!detailPage || !selected || !staff || !(data?.canManage || selected.status === 'PUBLISHED')) return;
    const controller = new AbortController();
    void request<{items: typeof tickets}>('/tickets?pageSize=100', {signal: controller.signal})
      .then(result => { if (!controller.signal.aborted) setTickets(result.items); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [detailPage, selected, staff, data?.canManage, request, setError]);
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
      pageHeading={<section className="page-heading panel kb-heading"><div><p className="eyebrow">ASTRA / TICKETING SYSTEM</p><h1>{editorPage?editor?catalogue?'Edit service':'Edit article':catalogue?'New service':'New article':detailPage?'Knowledge article':catalogue?'Service catalogue':'Knowledge base'}</h1><p>{catalogue?'Define approved services and collect the information needed to fulfil requests.':'Find published guidance and share solutions with the right audience.'}</p></div><div className="kb-heading-actions">{editorPage||detailPage?<button type="button" className="secondary" onClick={()=>detailPage?navigate(listUrl):cancelEditor()}>{catalogue?'Back to services':'Back to articles'}</button>:null}{reviewer&&!editorPage&&!detailPage ? <button type="button" className="secondary" onClick={() => {setReviewing(!reviewing);setEditor(undefined);setSelected(undefined);}}>{reviewing ? catalogue?'Back to services':'Back to articles' : catalogue?'Review services':'Review KB'}</button> : null}{!editorPage&&!detailPage&&(data?.canManage || (limitedAuthor && options.clients.length > 0)) ? <button type="button" className="primary" onClick={() => navigate(listUrl+'&new=1')}>{catalogue?'+ Add service':'+ Add article'}</button> : null}</div></section>}
    >
      {reviewing && reviewer && session ? <KnowledgeReview kind={catalogue?'SERVICE':'KNOWLEDGE'} csrfToken={session.csrfToken} revision={revision} organizations={options.clients} onReviewed={w.refresh} /> : null}
      {!reviewing || !reviewer ? <>
      {!editorPage && !detailPage && <section className="panel knowledge-toolbar">
        <div className="knowledge-search-heading"><h2>{catalogue?'Search services':'Search articles'}</h2><p>{catalogue?'Search by service name, description, request instructions or category.':'Search by title, content, keywords, specifications, category or author.'}</p></div>
        <form
          className="knowledge-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
            setPage(1);
          }}
        >
          <label>
            {catalogue?'Service name or details':'Article title or details'}
            <input
              type="search"
              placeholder={catalogue?'Search services…':'Search articles…'}
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

        <p className="hint" aria-live="polite">{loading?'Searching…':`${catalogue?shown?.length??0:data?.total??0} ${catalogue?'services':'articles'} found`}</p>
      </section>}
      {editorPage && !data ? <p role="status">Loading the editor…</p>:null}
      {editorPage && data && !data.canManage && !data.canDraft ? <section className="panel"><p>You do not have permission to create or edit this content.</p><Link href={listUrl}>Back to list</Link></section>:null}
      {editor !== undefined && data && (data.canManage || data.canDraft) ? (
        <form
          className="panel v38-stack"
          key={editor?.id ?? 'new'}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get('attachmentsReading') === 'yes') { setError('Please wait for attachments to finish loading.'); return; }
            if (!catalogue && field(f, 'body').trim().length < 10 && !uploads.length && !retainedAttachments.length) { setError('Enter at least 10 characters or attach an image or file.'); return; }
            if (!catalogue && field(f,'articleScope') === 'CLIENT_SPECIFIC' && !optionalField(f,'client')) { setError('Choose a client for client-specific guidance.'); return; }
            const payload = catalogue
              ? {
                  name: field(f, 'title'),
                  description: field(f, 'description'),
                  instructions: field(f, 'body'),
                  categoryId: field(f, 'category'),
                  clientId: optionalField(f, 'client'),
                  active: !limitedAuthor && f.has('active'),
                }
              : {
                  title: field(f, 'title'),
                  body: field(f, 'body'),
                  categoryId: optionalField(f, 'category'),
                  clientId: optionalField(f, 'client'),
                  visibility: field(f, 'visibility'),
                  status: field(f, 'status'),
                  revision: editor?.revision,
                  attachments: uploads,
                  retainedAttachments,
                  details: knowledgeDetailsFromForm(f),
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
                if(creationPage||detailPage)navigate(listUrl);
              })
              .catch(() => {});
          }}
        >
          <div className="v38-row kb-editor-heading">
            <h2>
              {editor ? 'Edit' : 'New'}{' '}
              {catalogue ? 'service template' : 'article'}
            </h2>
            <button
              type="button"
              className="secondary"
              onClick={cancelEditor}
            >
              Cancel
            </button>
          </div>
          {!catalogue ? <p className="kb-scope-help">{limitedAuthor ? 'Your article goes to your team lead, manager or administrator for review. It is published only after approval. ' : 'Choose the intended readers and publication status. '}Client and intended readers control access. General guidance remains restricted to its permitted readers.</p> : null}
          {catalogue ? <p className="kb-scope-help">{limitedAuthor?'This service goes to your team lead, manager or administrator for approval before it becomes available. ':''}Define one requestable service, who it is for, required information and fulfilment steps. Choose an assigned client to restrict availability. Creating a service does not create a ticket; using Request this service starts a ticket request.</p> : null}
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
          {!catalogue ? <KnowledgeScopeFields details={parseKnowledge(editor?.body).details} /> : null}
          <div className="v38-form-grid">
            <label>
              {catalogue ? 'Organization' : 'Client'}
              <select
                name="client"
                required={!data?.isAdmin}
                defaultValue={
                  editor?.client_id ??
                  (limitedAuthor && options.clients.length === 1 ? options.clients[0]!.id : '')
                }
              >
                <option value="">
                  {data?.isAdmin
                    ? catalogue ? 'Global — all permitted readers' : 'General — all permitted clients'
                    : catalogue ? 'Choose assigned organization' : 'Choose assigned client'}
                </option>
                <SelectOptions items={options.clients} />
              </select>
              {!catalogue ? <small className="hint">{data?.isAdmin ? 'Choose General for shared guidance, or a specific client to restrict it.' : 'Select a client you support. General guidance still stays within the assigned client.'}</small> : null}
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
              placeholder="Describe the service, who should request it, and what is included."
              />
            </label>
          ) : limitedAuthor ? (
            <div className="v38-form-grid"><label>Who is this for?<select name="visibility" defaultValue={editor?.visibility ?? 'STAFF'}><option value="STAFF">Staff only — internal guidance</option><option value="CLIENT">Clients and staff — customer guidance</option></select></label><label>
              Review required
              <select name="status" defaultValue="DRAFT">
                <option value="DRAFT">Submit for review</option>
              </select>
            </label></div>
          ) : (
            <div className="v38-form-grid">
              <label>
                Who is this for?
                <select
                  name="visibility"
                  defaultValue={editor?.visibility ?? 'STAFF'}
                >
                  <option value="STAFF">Staff only — internal guidance</option>
                  <option value="CLIENT">Clients and staff — customer guidance</option>
                </select>
              </label>
              <label>
                Publication status
                <select name="status" defaultValue={editor?.status ?? 'DRAFT'}>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
          )}
          {!catalogue ? <KnowledgeSpecifications details={parseKnowledge(editor?.body).details} /> : null}
          {catalogue ? <label>
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
              placeholder="List required requester information, prerequisites, approvals needed, fulfilment steps and expected completion time where applicable."
            />
          </label> : <KnowledgeEditor key={editor?.id ?? 'new'} articleId={editor?.id} body={editor?.body ?? ''} onFiles={(files, retained) => { setUploads(files); setRetainedAttachments(retained); }} />}
          {catalogue && limitedAuthor ? (
            <p className="hint">This service template is saved as inactive for team lead review.</p>
          ) : catalogue ? (
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
            {limitedAuthor ? 'Submit for review' : `Save ${catalogue ? 'service' : 'article'}`}
          </button>
        </form>
      ) : null}
      {detailPage && !selected && !w.error ? <p role="status">Loading article…</p> : null}
      {!editorPage && selected ? (
        <section className="panel v38-stack">
          <div className="v38-row">
            <h2>{selected.title ?? selected.name}</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => detailPage ? navigate(listUrl) : setSelected(undefined)}
            >
              Close
            </button>
          </div>
          {!catalogue ? <p className="kb-article-author"><strong>Created by:</strong> {selected.author_name || 'Not available'}</p> : null}
          {catalogue ? <p className="v38-prewrap">{selected.description}</p> : <KnowledgeContent body={selected.body ?? ''} id={selected.id} />}
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
          ) : staff && (data?.canManage || selected.status === 'PUBLISHED') ? (
            <form
              className="v38-row kb-ticket-link-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (!String(f.get('ticket') ?? '').trim()) { setError('Choose a ticket before linking the article.'); return; }
                void w
                  .save(`/knowledge/${selected.id}/tickets`, {
                    ticketId: field(f, 'ticket'),
                  })
                  .catch(() => {});
              }}
            >
              <div className="kb-ticket-link-field">
                <span>Link to a ticket</span>
                <ArticleTicketPicker key={selected.id} request={request} clientId={selected.client_id} disabled={w.busy} />
              </div>
              <button className="secondary" disabled={w.busy}>
                Link article
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      {!editorPage && !detailPage && <div className="v38-card-grid">
        {shown?.map((x) => (
          <article className="panel v38-stack" key={x.id}>
            <div className="v38-row">
              <span className="v38-chip">{x.category_name ?? 'General'}</span>
              {data?.canManage || x.can_edit_own_article ? (
                <small>
                  {catalogue
                    ? x.active
                      ? 'Active'
                      : 'Inactive'
                    : `${uiLabel(x.status)} · ${x.visibility === 'STAFF' ? 'Staff only' : 'Clients and staff'}`}
                </small>
              ) : null}
            </div>
            <h2>
              {catalogue ? <button className="link-button" type="button" onClick={() => void open(x)}>{x.title ?? x.name}</button> :
                <Link className="link-button" href={listUrl+'&article='+encodeURIComponent(x.id)}>{x.title}</Link>}
            </h2>
            {!catalogue ? <p className="kb-article-author"><strong>Created by:</strong> {x.author_name || 'Not available'}</p> : null}
            <p>
              {(x.description ?? parseKnowledge(x.body).text).slice(0, 240)}
              {(parseKnowledge(x.body).text.length) > 240 ? '…' : ''}
            </p>
            {(data?.canManage && (data.isAdmin || x.client_id)) || x.can_edit_own_article ? (
              <button
                type="button"
                className="secondary knowledge-edit-button"
                onClick={() => editArticle(x)}
              >
                Edit
              </button>
            ) : null}
          </article>
        ))}
      </div>}
      {!editorPage && !detailPage && !loading && data && !shown?.length ? (
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
      {!editorPage && !detailPage && !catalogue ? (
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
            Page {page} · {data?.total ?? 0} {(data?.total ?? 0) === 1 ? 'article' : 'articles'}
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
      </> : null}
    </WorkspaceFrame>
  );
}
