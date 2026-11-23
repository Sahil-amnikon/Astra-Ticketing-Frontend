import { hasFullAccess } from './role-access';
import ProfileIdentity from './profile-identity';
import { uiLabel } from './ui-label';
'use client';
import './change-detail-layout.css';
import { reviewedFetch } from './reviewed-fetch';
import ExpandablePanel from './expandable-panel';
import AdministrationOversight from './administration-oversight';
import WorkspaceNavigation from './workspace-navigation';
import { extensionLinks } from './workspace-navigation-data';
import MailTimeline from './mail-timeline';
import ChangeGovernancePanel from './change-governance-panel';
import ChangeReviewWorkspace from './change-review-workspace';
import ChangePlanTemplateDialog from './change-plan-template-dialog';
import ChangeTemplatePicker from './change-template-picker';
import TemplateDeleteConfirmation from './template-delete-confirmation';
import ChangeLifecycleControls, { type ChangeLifecycle } from './change-lifecycle-controls';
import ChangeRequestFields, { defaultChangeOrganization } from './change-request-fields';
import { canCreateChangePlan, canSaveChangePlanDirectly, applyChangePlanToForm, templateApprovalNames, type TemplateApproval, type ChangePlanData, type SavedChangePlan } from './change-plan-model';
import { canReviewChangeRequests } from './change-review-access';
import type {
  ChangeTemplate,
  GovernanceConfig,
} from './admin/change-governance/governance-administration';
import Link from '../navigation/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from '../navigation/hooks';
import BrandMark from './brand-mark';
import NotificationCenter from './notification-center';
import UiIcon, { type IconName } from './ui-icon';

type Row = Record<string, unknown>;
interface Session {
  csrfToken: string;
  user: {
    id: string;
    displayName: string;
    roles: string[];
    permissions?: string[];
    workScope?: string;
    workspace?: string;
    changeAccess?: string;
  };
}
interface Options {
  clients: Row[];
  sites: Row[];
  contacts: Row[];
  departments: Row[];
  users: Row[];
  tickets: Row[];
  categories: string[];
  types: string[];
  risks: string[];
  statuses: string[];
  emailEnabled: boolean;
  changeMailbox: string;
}
const label = uiLabel;
const date = (v: unknown) => (v ? new Date(String(v)).toLocaleString() : '—');
async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Unable to read attachment.'));
    reader.readAsDataURL(file);
  });
}
function parseExternalStakeholder(value: string) {
  const match = value.match(/^(.+?)\s*<([^<>]+)>$/);
  return match
    ? { name: match[1].trim(), email: match[2].trim(), role: 'STAKEHOLDER' }
    : { email: value, role: 'STAKEHOLDER' };
}

export default function ChangeWorkspace({
  view = 'dashboard',
  changeId,
}: {
  view?: 'dashboard' | 'new' | 'detail';
  changeId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session>();
  const [reviewAccess,setReviewAccess] = useState({canReviewChanges:false,canReviewTemplates:false});
  const reviewingChanges = view === 'dashboard' && searchParams.get('reviewCM') === '1';
  const canReviewCM = canReviewChangeRequests(session?.user.roles ?? []) || reviewAccess.canReviewChanges;
  const [menu, setMenu] = useState(false);
  const [options, setOptions] = useState<Options>();
  const [data, setData] = useState<Row>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateRevision, setTemplateRevision] = useState(0);
  function templateSaved(result: { status: string }) {
    setCreatingTemplate(false); setTemplateRevision(value => value + 1);
    setNotice(result.status === 'APPROVED' ? 'Template saved and available in saved plans.' : 'Template submitted for approval. Your team lead, manager or administrator can review it in Review CM > Templates.');
  }
  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const r = await reviewedFetch(`/api${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(session ? { 'x-csrf-token': session.csrfToken } : {}),
          ...init?.headers,
        },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error?.message ?? 'Request failed.');
      return body;
    },
    [session],
  );
  useEffect(() => {
    let live = true;
    void fetch(reviewingChanges?'/api/changes/review-session':'/api/auth/me', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status===403?'This account has no assigned change approvals or review access.':'Sign in to open Change Management.');
        const s = (await r.json()) as Session;
        const accessResponse = await fetch('/api/changes/review-access',{cache:'no-store'});
        if(!accessResponse.ok)throw new Error('Unable to check change approval access. Please retry.');
        const access=await accessResponse.json() as typeof reviewAccess;
        if(live)setReviewAccess(access);
        if (s.user.changeAccess === 'NONE' && !hasFullAccess(s.user.roles) && !(reviewingChanges && access.canReviewChanges))
          throw new Error(
            'Change Management has not been enabled for your account.',
          );
        if (live) setSession(s);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [reviewingChanges]);
  useEffect(() => {
    if (!session) return;
    if (reviewingChanges) { setError(''); setNotice(''); return; }
    let live = true;
    void Promise.all([
      request('/changes/options'),
      view === 'dashboard'
        ? Promise.all([
            request('/changes/dashboard'),
            request('/changes?pageSize=50'),
            request('/changes/calendar'),
          ]).then(([dashboard, list, calendar]) => ({
            dashboard,
            list,
            calendar,
          }))
        : view === 'detail' && changeId
          ? request(`/changes/${changeId}`)
          : Promise.resolve({}),
    ])
      .then(([o, d]) => {
        if (live) {
          setOptions(o as Options);
          setData(d as Row);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [session, request, view, changeId, revision, reviewingChanges]);
  async function submit(path: string, payload: Row, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      const result = (await request(path, {
        method,
        body: JSON.stringify(payload),
      })) as Row;
      setNotice('Saved successfully.');
      setRevision((x) => x + 1);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if(!f.get('requesterRef')||!f.get('approverUserId')){setError('Select a requester and an approver linked to the organization.');return;}
    const attachmentFiles = f
      .getAll('attachments')
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );
    if (
      attachmentFiles.length > 10 ||
      attachmentFiles.some((file) => file.size > 5 * 1024 * 1024)
    ) {
      setError('Add up to 10 attachments, with a maximum of 5 MB per file.');
      return;
    }
    const attachments = await Promise.all(
      attachmentFiles.map(async (file) => ({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: await fileToBase64(file),
      })),
    );
    const externalStakeholders = String(f.get('externalStakeholders') ?? '')
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(parseExternalStakeholder);
    const result = await submit('/changes', {
      clientId: f.get('clientId'),
      siteId: f.getAll('siteIds')[0] || undefined,
      siteIds: f.getAll('siteIds').map(String),
      departmentId: f.getAll('departmentIds')[0] || undefined,
      departmentIds: f.getAll('departmentIds').map(String),
      requesterRef: f.get('requesterRef'),
      approverUserId: f.get('approverUserId'),
      title: f.get('title'),
      description: f.get('description'),
      category: f.get('category'),
      changeType: f.get('changeType'),
      risk: f.get('risk'),
      impact: f.get('impact'),
      outageExpected: f.get('outageExpected') === 'true',
      downtimeMinutes: Number(f.get('downtimeMinutes') || 0),
      reason: f.get('reason'),
      businessJustification: f.get('businessJustification'),
      implementationPlan: f.get('implementationPlan'),
      testPlan: f.get('testPlan'),
      rollbackPlan: f.get('rollbackPlan'),
      communicationPlan: f.get('communicationPlan'),
      clientNotificationEnabled: f.get('clientNotificationEnabled') === 'true',
      ownerUserId: f.get('ownerUserId') || undefined,
      plannedStart: f.get('plannedStart')
        ? new Date(String(f.get('plannedStart'))).toISOString()
        : undefined,
      plannedEnd: f.get('plannedEnd')
        ? new Date(String(f.get('plannedEnd'))).toISOString()
        : undefined,
      stakeholderContactIds: f.getAll('stakeholderContactIds').map(String),
      externalStakeholders,
      attachments,
    });
    if (result?.id) router.push(`/changes/${String(result.id)}?workspace=${encodeURIComponent(selectedWorkspace)}`);
  }
  async function logout() {
    await request('/auth/logout', { method: 'POST' });
    router.push('/');
  }
  const detail = data as
    | {
        change?: Row;
        submissionReview?: { status: string };
        workflow?: ChangeLifecycle | null;
        teams?: Row[];
        tasks?: Row[];
        approvals?: Row[];
        updates?: Row[];
        links?: Row[];
        history?: Row[];
        communications?: Row[];
      }
    | undefined;
  const isAdmin = hasFullAccess(session?.user.roles) ?? false;
  const readOnly = session?.user.workspace === 'admin';
  const isManagement =
    session?.user.roles.includes('MANAGER') ||
    session?.user.roles.includes('TEAM_LEAD');
  const allowed = (permission: string) =>
    isAdmin || session?.user.permissions?.includes(permission);
  const requestedWorkspace = searchParams.get('workspace');
  const selectedWorkspace = requestedWorkspace && ['operations', 'management', 'admin'].includes(requestedWorkspace)
    ? requestedWorkspace
    : session?.user.workspace ?? (isAdmin ? 'admin' : isManagement ? 'management' : 'operations');
  const inAdminWorkspace = selectedWorkspace === 'admin';
  const inManagementWorkspace = selectedWorkspace === 'management';
  const portalNav: [string, IconName, string][] = inAdminWorkspace
    ? [
        ['/admin', 'dashboard', 'Overview'],
        ['/admin/tickets', 'tickets', 'Tickets'],
        ['/admin/sla', 'sla', 'SLA Management'],
        ['/admin/reports', 'reports', 'Reports & Analytics'],
        ['/admin/users', 'users', 'People & Permissions'],
        ['/admin/clients', 'clients', 'Clients'],
        ['/admin/contacts', 'contacts', 'Contacts'],
        ['/admin/sites', 'sites', 'Sites'],
        ['/admin/categories', 'categories', 'Categories'],
        ['/admin/tags', 'tags', 'Tags'],
        ['/admin/audit-logs', 'audit', 'Audit History'],
        ['/changes', 'change', 'Change Management'],
      ]
    : inManagementWorkspace
      ? [
          ['/management', 'dashboard', 'Dashboard'],
          ['/management/tickets', 'tickets', 'Tickets'],
          ...(allowed('CATEGORY_MANAGE') ? [['/admin/categories', 'categories', 'Categories'] as [string, IconName, string]] : []),
          ...(allowed('TAGS_MANAGE') ? [['/admin/tags', 'tags', 'Tags'] as [string, IconName, string]] : []),
          ...(allowed('AUDIT_VIEW') ? [['/admin/audit-logs', 'audit', 'Audit History'] as [string, IconName, string]] : []),
          ...(allowed('SLA_MANAGE') || session?.user.roles.includes('TEAM_LEAD')
            ? ([['/management/sla', 'sla', 'SLA Management']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('REPORTS_VIEW')
            ? ([['/management/reports', 'reports', 'Reports & Analytics']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ['/changes', 'change', 'Change Management'],
        ]
      : [
          ['/operations', 'dashboard', 'Dashboard'],
          ['/operations/tickets', 'tickets', 'My Tickets'],
          ...(allowed('TICKETS_TEAM_VIEW')
            ? ([['/operations/team-tickets', 'team', 'Team Tickets']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(['INTERNAL', 'BOTH', 'ALL'].includes(
            session?.user.workScope ?? '',
          )
            ? ([
                ['/operations/internal-tickets', 'tickets', 'Internal Tickets'],
              ] as [string, IconName, string][])
            : []),
          ['/changes', 'change', 'Change Management'],
        ];
  return (
    <div className="admin-shell ticket-shell change-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link className="brand" href="/">
          <BrandMark />
          <span>
            ASTRA<small>Ticketing System</small>
          </span>
        </Link>
        <p className="nav-label">
          {inAdminWorkspace
            ? 'ADMINISTRATION'
            : inManagementWorkspace
              ? 'MANAGEMENT'
              : 'TECHNICIAN PORTAL'}
        </p>
        <nav aria-label="Portal navigation">
          <WorkspaceNavigation
            links={[...portalNav, ...extensionLinks(session?.user)]}
            activeHref="/changes"
            workspace={selectedWorkspace}
            onNavigate={() => setMenu(false)}
          />
        </nav>
        <div className="sidebar-bottom">
          <Link href="/">
            <UiIcon name="switch" /> Switch workspace
          </Link>
          <small>
            <i /> Service desk online
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="menu-button secondary"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span className="breadcrumb">
            <Link href="/" className="workspace-home-link">
              {inAdminWorkspace
                ? 'Administration'
                : inManagementWorkspace
                  ? 'Management'
                  : 'Technician Portal'}
            </Link>{' '}
            <span>/</span> Change Management
          </span>
          {session ? (
            <div className="account">
              <ProfileIdentity name={session.user.displayName} workspace={inAdminWorkspace ? 'admin' : inManagementWorkspace ? 'management' : 'operations'} />
              <NotificationCenter
                csrfToken={session.csrfToken}
                ticketBase={
                  inAdminWorkspace
                    ? '/admin/ticket'
                    : inManagementWorkspace
                      ? '/management/tickets'
                      : '/operations/tickets'
                }
              />
              <button className="secondary" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          ) : null}
        </header>
        <main id="main" className="content change-workspace-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CONTROLLED SERVICE CHANGE</p>
              <h1>
                {reviewingChanges ? 'Review CM' : readOnly && view === 'new'
                  ? 'Change administration'
                  : view === 'new'
                    ? 'Raise a change'
                    : view === 'detail'
                      ? `${String(detail?.change?.change_number ?? 'Change record')}`
                      : 'Change Management'}
              </h1>
              <p>
                {reviewingChanges
                  ? 'Review waiting change requests and find previous review decisions.'
                  : readOnly
                  ? 'Review change records, approvals and history. Configure policy in Service administration.'
                  : view === 'dashboard'
                    ? 'Plan, approve, coordinate and verify infrastructure and service changes.'
                    : view === 'new'
                      ? 'Document impact, implementation, testing and rollback before approval.'
                      : 'One controlled record for plan, approvals, teams and evidence.'}
              </p>
            </div>
            <div className="v38-row">
              {view === 'new' ? <Link className="secondary" href={`/changes?workspace=${encodeURIComponent(selectedWorkspace)}`}>Back to CM</Link> : null}
              {session && canReviewCM && view !== 'new' && !reviewingChanges ? <Link className="secondary" href={`/changes?workspace=${encodeURIComponent(selectedWorkspace)}&reviewCM=1`}>Review CM</Link> : null}
              {session && view === 'dashboard' && !reviewingChanges && canCreateChangePlan(session.user.roles) ? <button type="button" className="secondary" onClick={() => setCreatingTemplate(true)}>New template</button> : null}
              {reviewingChanges ? <Link className="secondary" href={`/changes?workspace=${encodeURIComponent(selectedWorkspace)}`}>Back to changes</Link> : null}
              {session && !readOnly && view !== 'new' && (canCreateChangePlan(session.user.roles) || Boolean(session.user.changeAccess && session.user.changeAccess!=='NONE')) ? (
                <Link className="primary" href={`/changes/new?workspace=${encodeURIComponent(selectedWorkspace)}`}>
                  + Raise change
                </Link>
              ) : null}
            </div>
          </div>
          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? <div className="notice success">{notice}</div> : null}
          {view === 'detail' && detail?.submissionReview?.status === 'PENDING' ? <div className="notice" role="status">Awaiting review by your team lead, a manager or an administrator. The change cannot proceed until it is approved.</div> : null}
          {session && reviewingChanges ? canReviewCM ? <ChangeReviewWorkspace csrfToken={session.csrfToken} workspace={selectedWorkspace} canReviewTemplates={reviewAccess.canReviewTemplates} /> : <p className="notice error" role="alert">This account has no assigned change approvals or review access.</p> : null}
          {readOnly && !reviewingChanges ? <AdministrationOversight /> : null}
          {view === 'dashboard' && !reviewingChanges ? (
            <ChangeDashboard data={data} workspace={selectedWorkspace} />
          ) : null}
          {session && creatingTemplate ? <ChangePlanTemplateDialog roles={session.user.roles} requestedBy={session.user.displayName} request={request} onClose={() => setCreatingTemplate(false)} onSaved={templateSaved} /> : null}
          {view === 'new' && session && !readOnly && options ? (
            <ChangeForm
              user={session.user}
              templateRevision={templateRevision}
              workspace={selectedWorkspace}
              options={options}
              submit={create}
              busy={busy}
              request={request}
              onError={setError}
            />
          ) : null}
          {view === 'detail' && detail?.change && options ? (
            <ChangeDetail
              readOnly={readOnly}
              detail={detail}
              options={options}
              busy={busy}
              submit={submit}
            />
          ) : null}
          {view === 'detail' && detail?.change && session && !detail.workflow ? (
            <>
              <ChangeGovernancePanel
                change={detail.change}
                user={session.user}
                revision={revision}
                request={request}
                submit={submit}
              />
              <MailTimeline
                kind="changes"
                id={String(detail.change.id)}
                revision={revision}
              />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function ChangeDashboard({
  data,
  workspace,
}: {
  data?: Row;
  workspace?: string;
}) {
  const d = data?.dashboard as Row | undefined;
  const list = (data?.list as { items?: Row[] } | undefined)?.items ?? [];
  const calendar = (data?.calendar as Row[] | undefined) ?? [];
  return (
    <>
      <section className="metric-grid">
        <Metric name="Total changes" value={d?.total} />
        <Metric name="Awaiting approval" value={d?.awaiting_approval} />
        <Metric name="Scheduled" value={d?.scheduled} />
        <Metric name="In progress" value={d?.in_progress} />
        <Metric name="High risk open" value={d?.high_risk} />
      </section>
      <section className="change-grid">
        <div className="panel">
          <div className="section-heading">
            <h2>Change register</h2>
            <span>{list.length} visible</span>
          </div>
          <div className="table-wrap">
            <table className="change-register-table">
              <thead>
                <tr>
                  <th>Change</th>
                  <th>Type</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={String(c.id)}>
                    <td>
                      <Link
                        href={`/changes/${String(c.id)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''}`}
                      >
                        <strong>{String(c.change_number)}</strong>
                        <small>{String(c.title)}</small>
                      </Link>
                    </td>
                    <td><span className="pill change-type">{label(c.change_type)}</span></td>
                    <td>
                      <span
                        className={`pill priority-${String(c.risk).toLowerCase()}`}
                      >
                        {label(c.risk)}
                      </span>
                    </td>
                    <td>
                      <span className={`pill change-status-${String(c.status).toLowerCase()}`}>{label(c.status)}</span>
                    </td>
                    <td>{String(c.owner_name)}</td>
                    <td><span className="change-window">{c.planned_start ? date(c.planned_start) : 'Not scheduled'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>Change calendar</h2>
          {calendar.length ? (
            calendar.map((c) => (
              <Link
                className="calendar-change"
                key={String(c.id)}
                href={`/changes/${String(c.id)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''}`}
              >
                <strong>
                  {String(c.change_number)} · {String(c.title)}
                </strong>
                <span>
                  {date(c.planned_start)} → {date(c.planned_end)}
                </span>
              </Link>
            ))
          ) : (
            <p className="empty">No planned change windows yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
function Metric({ name, value }: { name: string; value: unknown }) {
  return (
    <div className="metric-card">
      <span>{name}</span>
      <strong>{String(value ?? 0)}</strong>
    </div>
  );
}
function Opts({ items }: { items: Row[] }) {
  return (
    <>
      {items.map((x) => (
        <option key={String(x.id)} value={String(x.id)}>
          {String(x.name)}
        </option>
      ))}
    </>
  );
}
export function ChangeForm({
  user,
  templateRevision,
  workspace,
  options,
  submit,
  busy,
  request,
  onError,
}: {
  options: Options;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onError: (message: string) => void;
  workspace: string;
  user: Session['user'];
  templateRevision: number;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [templateNotice, setTemplateNotice] = useState('');
  const [clientId, setClientId] = useState(()=>defaultChangeOrganization(options.clients));
  const [templates, setTemplates] = useState<(ChangeTemplate & TemplateApproval & { plan?: ChangePlanData })[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all([request('/change-governance'), request('/changes/templates')])
      .then(([c, saved]) => {
        if (!live) return;
        const plans = (saved as { items: SavedChangePlan[] }).items.map(item => {
          const plan: ChangePlanData = typeof item.plan === 'string' ? JSON.parse(item.plan) : item.plan;
          return { id: `plan:${item.id}`, name: item.name, category: plan.category, description: plan.description, implementation_plan: plan.implementationPlan, test_plan: plan.testPlan, rollback_plan: plan.rollbackPlan, active: true, plan, requested_by_name: item.requested_by_name, approved_by_name: item.approved_by_name, approval_required: item.approval_required };
        });
        setTemplates([...(c as GovernanceConfig).templates.filter(t => t.active), ...plans]);
      })
      .catch((e) => onError(e.message));
    return () => {
      live = false;
    };
  }, [request, onError, templateRevision]);
  const [siteIds,setSiteIds] = useState<string[]>(()=>{const matching=options.sites.filter(site=>String(site.client_id)===defaultChangeOrganization(options.clients));return matching.length===1?[String(matching[0].id)]:[];});
  const siteId=siteIds[0]??'';
  const [changeType,setChangeType] = useState('STANDARD');
  const [contacts, setContacts] = useState(options.contacts);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contactToAdd, setContactToAdd] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const availableContacts = contacts.filter(
    (contact) =>
      String(contact.client_id) === clientId &&
      (!contact.site_id || siteIds.includes(String(contact.site_id))),
  );
  async function addContact() {
    if (!clientId || contactName.trim().length < 2 || !contactEmail.trim()) {
      onError('Select an organization and enter the contact name and email.');
      return;
    }
    setAddingContact(true);
    onError('');
    try {
      const contact = (await request('/changes/contacts', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          siteId: siteId || undefined,
          name: contactName.trim(),
          email: contactEmail.trim(),
          phone: contactPhone.trim() || undefined,
        }),
      })) as Row;
      setContacts((current) => [...current, contact]);
      setSelectedContacts((current) => [
        ...new Set([...current, String(contact.id)]),
      ]);
      setContactToAdd('');
      setShowContactForm(false);
      setContactName('');
      setContactEmail('');
      setContactPhone('');
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setAddingContact(false);
    }
  }
  return (
    <form className="panel change-form" onSubmit={submit}>
      <ChangeTemplatePicker templates={templates} value={selectedTemplate} canDelete={canSaveChangePlanDirectly(user.roles)} disabled={busy || templateDeleting}
        onChange={(id, form) => {
          setSelectedTemplate(id); setTemplateNotice('');
          const template = templates.find(item => item.id === id);
          if (!template || !form) return;
          applyChangePlanToForm(form, template.plan ?? { description: template.description, category: template.category, implementationPlan: template.implementation_plan, testPlan: template.test_plan, rollbackPlan: template.rollback_plan });
        }}
        onDelete={async id => { const template = templates.find(item => item.id === id); if (template) setTemplateToDelete(template); }} />
      {templateToDelete ? <TemplateDeleteConfirmation name={templateToDelete.name} busy={templateDeleting} onCancel={() => { if (!templateDeleting) setTemplateToDelete(null); }} onConfirm={async () => {
          const id = templateToDelete.id;
          const template = templates.find(item => item.id === id);
          if (!template || templateDeleting) return;
          setTemplateDeleting(true); setTemplateNotice(''); onError('');
          try {
            const isPlan = template.id.startsWith('plan:');
            const templateId = isPlan ? template.id.slice(5) : template.id;
            await request(`/changes/templates/${encodeURIComponent(templateId)}?source=${isPlan ? 'plan' : 'legacy'}`, { method: 'DELETE' });
            setTemplates(current => current.filter(item => item.id !== template.id));
            setSelectedTemplate(current => current === template.id ? '' : current);
            setTemplateNotice('Template deleted. Existing changes are unchanged.');
            setTemplateToDelete(null);
          }
          finally { setTemplateDeleting(false); }
        }} /> : null}
      <small className="hint">Templates fill the change details and plans. Choose the organisation, client and owner for this request, and review the planned dates.</small>
      {selectedTemplate ? <section aria-label="Template approval details" className="form-grid">
        <label>Requested by<input readOnly value={templateApprovalNames(templates.find(item => item.id === selectedTemplate)).requestedBy} /></label>
        <label>Approved by<input readOnly value={templateApprovalNames(templates.find(item => item.id === selectedTemplate)).approvedBy} /></label>
        <small className="hint">These are the template's approval details. Each new change follows its own approval workflow.</small>
      </section> : null}
      {templateNotice ? <p className="notice" role="status">{templateNotice}</p> : null}
      <fieldset disabled={busy} className="form-grid">
        <ChangeRequestFields user={user} clients={options.clients} sites={options.sites} departments={options.departments} clientId={clientId} siteIds={siteIds} changeType={changeType} request={request}
          onOrganization={id=>{setClientId(id);setSelectedContacts([]);setContactToAdd('');}}
          onSites={ids=>{setSiteIds(ids);setSelectedContacts([]);setContactToAdd('');}} />
        <label className="wide">
          Title
          <input required minLength={3} maxLength={200} name="title" />
        </label>
        <label className="wide">
          Description
          <textarea required rows={4} name="description" />
        </label>
        <label>
          Category
          <select required name="category">
            {options.categories.map((x) => (
              <option key={x} value={x}>{label(x)}</option>
            ))}
          </select>
        </label>
        <label>
          Change type
          <select required name="changeType" value={changeType} onChange={event=>setChangeType(event.target.value)}>
            {options.types.map((x) => (
              <option key={x} value={x}>{label(x)}</option>
            ))}
          </select>
        </label>
        <label>
          Risk
          <select required name="risk">
            {options.risks.map((x) => (
              <option key={x} value={x}>{label(x)}</option>
            ))}
          </select>
        </label>
        <label>
          Expected downtime (minutes)
          <input
            type="number"
            min="0"
            name="downtimeMinutes"
            defaultValue="0"
          />
        </label>
        <label>
          Outage expected
          <select name="outageExpected">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <label>
          Notify client
          <select name="clientNotificationEnabled">
            <option value="false">No</option>
            <option value="true">Yes, where approved</option>
          </select>
        </label>
        <label>
          Planned start
          <input type="datetime-local" name="plannedStart" />
        </label>
        <label>
          Planned end
          <input type="datetime-local" name="plannedEnd" />
        </label>
        {[
          ['impact', 'Impact assessment'],
          ['reason', 'Reason for change'],
          ['businessJustification', 'Business justification'],
          ['implementationPlan', 'Implementation plan'],
          ['testPlan', 'Testing and validation plan'],
          ['rollbackPlan', 'Rollback plan'],
          ['communicationPlan', 'Communication plan'],
        ].map(([n, l]) => (
          <label className="wide" key={n}>
            {l}
            <textarea required={n !== 'communicationPlan'} rows={3} name={n} />
          </label>
        ))}
        <section className="wide change-stakeholder-editor">
          <h2>Stakeholders</h2>
          <p className="hint">
            Select client-side contacts from the chosen organization. Vendors or
            other external participants can be entered as an email or as Name
            &lt;email@example.com&gt;, separated by commas or new lines. These
            contacts are recorded on the change; CAB sends no email.
          </p>
          {selectedContacts.map((contactId) => (
            <input
              key={contactId}
              type="hidden"
              name="stakeholderContactIds"
              value={contactId}
            />
          ))}
          <div className="stakeholder-picker">
            <label>
              Existing client contact
              <select
                value={contactToAdd}
                disabled={!clientId}
                onChange={(event) => setContactToAdd(event.target.value)}
              >
                <option value="">
                  {clientId
                    ? 'Select a contact…'
                    : 'Select an organization first'}
                </option>
                {availableContacts
                  .filter(
                    (contact) => !selectedContacts.includes(String(contact.id)),
                  )
                  .map((contact) => (
                    <option key={String(contact.id)} value={String(contact.id)}>
                      {String(contact.name)} · {String(contact.email)}
                      {contact.site_id ? ' · Selected site' : ''}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={!contactToAdd}
              onClick={() => {
                setSelectedContacts((current) => [
                  ...new Set([...current, contactToAdd]),
                ]);
                setContactToAdd('');
              }}
            >
              Add stakeholder
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!clientId}
              onClick={() => setShowContactForm((current) => !current)}
            >
              {showContactForm ? 'Cancel new contact' : '+ Add new contact'}
            </button>
          </div>
          {selectedContacts.length ? (
            <div className="selected-stakeholders">
              <h3>Selected stakeholders</h3>
              {selectedContacts.map((contactId) => {
                const contact = contacts.find(
                  (item) => String(item.id) === contactId,
                );
                return (
                  <div key={contactId}>
                    <span>
                      <strong>{String(contact?.name ?? 'Contact')}</strong>
                      <small>{String(contact?.email ?? '')}</small>
                    </span>
                    <button
                      type="button"
                      className="stakeholder-remove"
                      onClick={() =>
                        setSelectedContacts((current) =>
                          current.filter((id) => id !== contactId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">No stakeholder selected yet.</p>
          )}
          {clientId && showContactForm ? (
            <div className="inline-contact-editor">
              <h3>Add a new client contact</h3>
              <p className="hint">
                The contact is saved for this organization and the selected
                site. Leave Site as None to create an organization-wide contact.
              </p>
              <div className="form-grid">
                <label>
                  Contact name
                  <input
                    value={contactName}
                    maxLength={200}
                    onChange={(event) => setContactName(event.target.value)}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contactEmail}
                    maxLength={320}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                </label>
                <label>
                  Phone (optional)
                  <input
                    value={contactPhone}
                    maxLength={50}
                    onChange={(event) => setContactPhone(event.target.value)}
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={addingContact}
                    onClick={() => void addContact()}
                  >
                    {addingContact ? 'Adding…' : '+ Add and select contact'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <label>
            External stakeholders
            <textarea
              name="externalStakeholders"
              rows={3}
              placeholder={
                'Client Contact <contact@example.com>\nvendor@example.com'
              }
            />
          </label>
        </section>
        <label className="wide">
          Supporting attachments
          <input
            type="file"
            name="attachments"
            multiple
            accept=".pdf,.zip,.docx,.xlsx,.gif,.jpg,.jpeg,.png,.csv,.txt"
          />
          <small>Up to 10 files, maximum 5 MB each.</small>
        </label>
        <div className="wide form-actions">
          <Link className="secondary" href={`/changes?workspace=${encodeURIComponent(workspace)}`}>
            Cancel
          </Link>
          <button className="primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
function ChangeDetail({
  readOnly,
  detail,
  options,
  busy,
  submit,
}: {
  detail: {
    change?: Row;
    workflow?: ChangeLifecycle | null;
    teams?: Row[];
    tasks?: Row[];
    approvals?: Row[];
    updates?: Row[];
    links?: Row[];
    history?: Row[];
    communications?: Row[];
    stakeholders?: Row[];
    attachments?: Row[];
  };
  options: Options;
  busy: boolean;
  readOnly: boolean;
  submit: (p: string, b: Row, m?: string) => Promise<Row | undefined>;
}) {
  const c = detail.change!;
  const id = String(c.id);
  const [tab, setTab] = useState('overview');
  const form =
    (handler: (f: FormData) => Promise<Row | undefined>) =>
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const element = e.currentTarget;
      const saved = await handler(new FormData(element));
      if (saved) element.reset();
    };
  return (
    <>
      <section className="change-hero panel">
        <div>
          <span className={`pill priority-${String(c.risk).toLowerCase()}`}>
            {label(c.risk)} risk
          </span>
          <span className="pill">{label(c.change_type)}</span>
          <span className={`pill change-status-${String(c.status).toLowerCase()}`}>{label(c.status)}</span>
          <h2>{String(c.title)}</h2>
          <p>{String(c.description)}</p>
        </div>
        <div>
          <strong>Planned window</strong>
          <span>
            {date(c.planned_start)}
            <br />
            to {date(c.planned_end)}
          </span>
        </div>
      </section>
      {detail.workflow && !readOnly ? <ChangeLifecycleControls workflow={detail.workflow} change={c} updates={detail.updates} busy={busy} submit={submit} /> : null}
      <nav className="record-tabs">
        {[
          'overview',
          'approvals',
          'tasks & teams',
          'stakeholders & files',
          'updates',
          'communications',
          'history',
        ].filter(x => !detail.workflow || x !== 'approvals').map((x) => (
          <button
            key={x}
            className={tab === x ? 'active' : ''}
            onClick={() => setTab(x)}
          >
            {label(x)}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <div className="change-grid">
          <section className="panel detail-list">
            <h2>Assessment and control plan</h2>
            {[
              ['Category', c.category],
              ['Impact', c.impact],
              ['Reason', c.reason],
              ['Business justification', c.business_justification],
              ['Implementation', c.implementation_plan],
              ['Testing', c.test_plan],
              ['Rollback', c.rollback_plan],
              ['Communication', c.communication_plan],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <strong>{String(k)}</strong>
                <p>{String(v || 'Not provided')}</p>
              </div>
            ))}
          </section>
          <div className="change-controls-stack">
            {!readOnly && !detail.workflow && (
              <ExpandablePanel title="Move workflow" className="">
                <form
                  onSubmit={form((f) =>
                    submit(
                      `/changes/${id}/status`,
                      {
                        status: f.get('status'),
                        note: f.get('note'),
                        overrideReason: f.get('overrideReason') || undefined,
                      },
                      'PATCH',
                    ),
                  )}
                >
                  <label>
                    Next status
                    <select name="status">
                      {options.statuses.map((s) => (
                        <option key={s} value={s}>{label(s)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Control note
                    <textarea name="note" rows={3} />
                  </label>
                  <label>
                    Conflict override reason (administrator / Change Manager
                    only)
                    <textarea
                      name="overrideReason"
                      rows={2}
                      minLength={10}
                      maxLength={2000}
                      placeholder="Leave empty unless overriding a scheduling conflict or blackout."
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Update status
                  </button>
                </form>
              </ExpandablePanel>
            )}
            <ExpandablePanel title="Linked incidents">
              {detail.links?.map((x) => (
                <p key={String(x.ticket_id)}>
                  {String(x.ticket_number)} · {String(x.subject)}
                </p>
              ))}
              {!readOnly && (
                <form
                  onSubmit={form((f) =>
                    submit(`/changes/${id}/tickets`, {
                      ticketId: f.get('ticketId'),
                    }),
                  )}
                >
                  <label>
                    Link ticket
                    <select required name="ticketId">
                      <option value="">Select…</option>
                      {options.tickets.map((x) => (
                        <option key={String(x.id)} value={String(x.id)}>
                          {String(x.ticket_number)} · {String(x.subject)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary">Link ticket</button>
                </form>
              )}
            </ExpandablePanel>
            <ExpandablePanel title="Activity timeline" defaultOpen>
              <p className="hint">Latest activity first</p>
              {detail.history?.length ? (
                <div className="change-activity-timeline" role="list" aria-label="Change activity">
                  {detail.history.map((activity) => (
                    <article className="timeline-item" role="listitem" key={String(activity.id)}>
                      <strong>{label(activity.event)}</strong>
                      <p>{String(activity.actor_name ?? 'System')}</p>
                      <p>{date(activity.created_at)}</p>
                    </article>
                  ))}
                </div>
              ) : <p className="hint">No activity has been recorded for this change yet.</p>}
            </ExpandablePanel>
          </div>
        </div>
      ) : null}
      {tab === 'approvals' ? (
        <section className="panel">
          <h2>Approval path</h2>
          {detail.approvals?.map((a) => (
            <article className="work-item" key={String(a.id)}>
              <div>
                <strong>{String(a.approver_name ?? a.department_name)}</strong>
                <span>
                  {label(a.status)} · Sequence {String(a.sequence)} · Revision{' '}
                  {String(a.revision)} {a.cab_group_id ? '· CAB' : ''}
                </span>
              </div>
              {a.status === 'PENDING' &&
              a.revision === c.revision &&
              c.status === 'AWAITING_APPROVAL' ? (
                !readOnly && (
                  <form
                    onSubmit={form((f) =>
                      submit(
                        `/changes/${id}/approvals/${String(a.id)}`,
                        { status: f.get('status'), note: f.get('note') },
                        'PATCH',
                      ),
                    )}
                  >
                    <select name="status">
                      <option value="APPROVED">{label('APPROVED')}</option>
                      <option value="REJECTED">{label('REJECTED')}</option>
                      <option value="CHANGES_REQUESTED">{label('CHANGES_REQUESTED')}</option>
                    </select>
                    <input required name="note" placeholder="Decision note" />
                    <button className="secondary">Record decision</button>
                  </form>
                )
              ) : (
                <p>{String(a.decision_note ?? '')}</p>
              )}
            </article>
          ))}
          {!readOnly && (
            <form
              className="inline-form"
              onSubmit={form((f) =>
                submit(`/changes/${id}/approvals`, {
                  approverUserId: f.get('approverUserId') || undefined,
                  departmentId: f.get('departmentId') || undefined,
                  sequence: Number(f.get('sequence') || 1),
                  required: true,
                }),
              )}
            >
              <select name="approverUserId">
                <option value="">Individual approver</option>
                <Opts items={options.users} />
              </select>
              <select name="departmentId">
                <option value="">Department approver</option>
                <Opts items={options.departments} />
              </select>
              <input type="number" min="1" defaultValue="1" name="sequence" />
              <button className="primary">Add approval</button>
            </form>
          )}
        </section>
      ) : null}
      {tab === 'tasks & teams' ? (
        <section className="panel">
          <h2>Implementation teams and tasks</h2>
          {detail.teams?.map((t) => (
            <span className="pill" key={String(t.department_id)}>
              {String(t.department_name)} · {label(t.role)}
            </span>
          ))}
          {!readOnly && (
            <form
              className="inline-form"
              onSubmit={form((f) =>
                submit(`/changes/${id}/teams`, {
                  departmentId: f.get('departmentId'),
                  role: f.get('role'),
                }),
              )}
            >
              <select required name="departmentId">
                <option value="">Department…</option>
                <Opts items={options.departments} />
              </select>
              <select name="role">
                <option value="IMPLEMENTER">{label('IMPLEMENTER')}</option>
                <option value="LEAD">{label('LEAD')}</option>
                <option value="REVIEWER">{label('REVIEWER')}</option>
              </select>
              <button className="secondary">Add team</button>
            </form>
          )}
          {detail.tasks?.map((t) => (
            <article className="work-item" key={String(t.id)}>
              <div>
                <strong>{String(t.title)}</strong>
                <span>
                  {String(t.assigned_name ?? t.department_name ?? 'Unassigned')}{' '}
                  · {label(t.status)}
                </span>
              </div>
              {!readOnly && (
                <form
                  onSubmit={form((f) =>
                    submit(
                      `/changes/${id}/tasks/${String(t.id)}`,
                      {
                        status: f.get('status'),
                        updateNote: f.get('updateNote'),
                      },
                      'PATCH',
                    ),
                  )}
                >
                  <select name="status" defaultValue={String(t.status)}>
                    <option value="TODO">{label('TODO')}</option>
                    <option value="IN_PROGRESS">{label('IN_PROGRESS')}</option>
                    <option value="BLOCKED">{label('BLOCKED')}</option>
                    <option value="COMPLETED">{label('COMPLETED')}</option>
                    <option value="WAIVED">{label('WAIVED')}</option>
                  </select>
                  <input name="updateNote" placeholder="Progress update" />
                  <button className="secondary">Update</button>
                </form>
              )}
            </article>
          ))}
          {!readOnly && (
            <form
              className="inline-form"
              onSubmit={form((f) =>
                submit(`/changes/${id}/tasks`, {
                  title: f.get('title'),
                  instructions: f.get('instructions'),
                  departmentId: f.get('departmentId') || undefined,
                  assignedUserId: f.get('assignedUserId') || undefined,
                  dueAt: f.get('dueAt') || undefined,
                }),
              )}
            >
              <input required name="title" placeholder="Task title" />
              <input name="instructions" placeholder="Instructions" />
              <select name="departmentId">
                <option value="">Department</option>
                <Opts items={options.departments} />
              </select>
              <select name="assignedUserId">
                <option value="">Assignee</option>
                <Opts items={options.users} />
              </select>
              <input type="datetime-local" name="dueAt" />
              <button className="primary">Add task</button>
            </form>
          )}
        </section>
      ) : null}
      {tab === 'stakeholders & files' ? (
        <div className="change-grid">
          <section className="panel">
            <h2>Stakeholders</h2>
            <p className="hint">
              Stakeholders are client-side contacts for the selected
              organization. Additional external participants are recorded by
              email; neither option grants staff portal access.
            </p>
            {detail.stakeholders?.length ? (
              detail.stakeholders.map((stakeholder) => (
                <article className="work-item" key={String(stakeholder.id)}>
                  <div>
                    <strong>
                      {String(
                        stakeholder.contact_name ??
                          stakeholder.legacy_user_name ??
                          stakeholder.external_name ??
                          stakeholder.external_email,
                      )}
                    </strong>
                    <span>
                      {label(stakeholder.stakeholder_role)}
                      {stakeholder.contact_email ||
                      stakeholder.legacy_user_email ||
                      stakeholder.external_email
                        ? ` · ${String(stakeholder.contact_email ?? stakeholder.legacy_user_email ?? stakeholder.external_email)}`
                        : ''}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty">No additional stakeholders yet.</p>
            )}
            {!readOnly && (
              <form
                className="inline-form"
                onSubmit={form((f) =>
                  submit(`/changes/${id}/stakeholders`, {
                    contactId: f.get('contactId') || undefined,
                    externalName: f.get('externalName') || undefined,
                    externalEmail: f.get('externalEmail') || undefined,
                    role: f.get('role'),
                  }),
                )}
              >
                <select name="contactId">
                  <option value="">Client contact</option>
                  <Opts
                    items={options.contacts.filter(
                      (contact) =>
                        String(contact.client_id) === String(c.client_id) &&
                        (!contact.site_id ||
                          String(contact.site_id) === String(c.site_id)),
                    )}
                  />
                </select>
                <input name="externalName" placeholder="External name" />
                <input
                  type="email"
                  name="externalEmail"
                  placeholder="External email"
                />
                <select name="role" defaultValue="STAKEHOLDER">
                  <option value="STAKEHOLDER">{label('STAKEHOLDER')}</option>
                  <option value="BUSINESS_CONTACT">{label('BUSINESS_CONTACT')}</option>
                  <option value="TECHNICAL_CONTACT">{label('TECHNICAL_CONTACT')}</option>
                  <option value="OBSERVER">{label('OBSERVER')}</option>
                </select>
                <button className="primary">Add stakeholder</button>
              </form>
            )}
          </section>
          <ExpandablePanel title="Attachments and evidence" className="">
            <p className="hint">
              Attach implementation plans, screenshots, validation evidence or
              rollback documentation. Maximum 5 MB per file.
            </p>
            {detail.attachments?.length ? (
              detail.attachments.map((file) => (
                <a
                  className="attachment"
                  key={String(file.id)}
                  href={`/api/changes/${id}/attachments/${String(file.id)}`}
                >
                  <strong>{String(file.file_name)}</strong>
                  <small>
                    {Math.ceil(Number(file.size_bytes) / 1024)} KB ·{' '}
                    {String(file.uploaded_by ?? 'System')}
                  </small>
                </a>
              ))
            ) : (
              <p className="empty">No change evidence attached yet.</p>
            )}
            {!readOnly && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const element = event.currentTarget;
                  const file = new FormData(element).get('attachment');
                  if (!(file instanceof File) || !file.size) return;
                  if (file.size > 5 * 1024 * 1024) {
                    element.reset();
                    return;
                  }
                  void fileToBase64(file).then(async (contentBase64) => {
                    await submit(`/changes/${id}/attachments`, {
                      fileName: file.name,
                      contentType: file.type || 'application/octet-stream',
                      contentBase64,
                    });
                    element.reset();
                  });
                }}
              >
                <label>
                  Add attachment
                  <input
                    required
                    type="file"
                    name="attachment"
                    accept=".pdf,.zip,.docx,.xlsx,.gif,.jpg,.jpeg,.png,.csv,.txt"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Upload file
                </button>
              </form>
            )}
          </ExpandablePanel>
        </div>
      ) : null}
      {tab === 'updates' ? (
        <section className="panel">
          <h2>Team updates</h2>
          {!readOnly && (
            <form
              onSubmit={form((f) =>
                submit(`/changes/${id}/updates`, {
                  updateType: f.get('updateType'),
                  body: f.get('body'),
                }),
              )}
            >
              <select name="updateType">
                <option value="INTERNAL">{label('INTERNAL')}</option>
                <option value="IMPLEMENTATION">{label('IMPLEMENTATION')}</option>
                <option value="VALIDATION">{label('VALIDATION')}</option>
                <option value="CLIENT_COMMUNICATION">{label('CLIENT_COMMUNICATION')}</option>
              </select>
              <textarea
                required
                name="body"
                rows={4}
                placeholder="Record an update or evidence…"
              />
              <button className="primary">Add update</button>
            </form>
          )}
          {detail.updates?.map((u) => (
            <article className="timeline-item" key={String(u.id)}>
              <strong>
                {label(u.update_type)} · {String(u.author_name)}
              </strong>
              <p>{String(u.body)}</p>
              <small>{date(u.created_at)}</small>
            </article>
          ))}
        </section>
      ) : null}
      {tab === 'communications' ? (
        <section className="panel">
          <h2>Communication history</h2>
          <p className="hint">
            CAB email delivery is disabled. Record progress and decisions in
            Updates so reviewers and stakeholders with portal access can follow
            the change.
          </p>
          {detail.communications?.map((x) => (
            <article className="work-item" key={String(x.id)}>
              <div>
                <strong>{String(x.subject)}</strong>
                <span>
                  {label(x.status)} ·{' '}
                  {String((x.recipient_emails as string[])?.length ?? 0)}{' '}
                  recipients
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {tab === 'history' ? (
        <section className="panel">
          <h2>Immutable change history</h2>
          {detail.history?.map((h) => (
            <article className="timeline-item" key={String(h.id)}>
              <strong>{label(h.event)}</strong>
              <p>
                {String(h.actor_name ?? 'System')} · {date(h.created_at)}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
