import { hasFullAccess } from './role-access';
import ProfileIdentity from './profile-identity';
import { uiLabel } from './ui-label';
'use client';
import { reviewedFetch } from './reviewed-fetch';
import { formatApiDate } from './api-time';
import ExpandablePanel from './expandable-panel';
import WorkspaceNavigation from './workspace-navigation';
import AdministrationOversight from './administration-oversight';
import {
  extensionLinks,
  dashboardQueueFilters,
  dashboardFilterLabels,
} from './workspace-navigation-data';
import CorporateDashboard from './corporate-dashboard';
import ManagementOverview from './management/management-overview';
import type { ApiRequest } from './workspace-tools';
import TicketTags, { TagPicker, TicketTagEditor } from './ticket-tags';
import HelpChat from './help-chat';
import MailTimeline from './mail-timeline';
import TicketQaCheck from './ticket-qa-check';
import TicketInformation from './ticket-information';
import TicketCategoryFields from './ticket-category-fields';
import { ticketCategorySelection } from './ticket-category-selection';
import TicketCommentPage from './ticket-comment-page';
import RequesterSelect from './requester-select';
import { initialTicketTechnician, technicianOptions } from './ticket-assignee-default';
import { useSidebarScroll } from './sidebar-scroll';

import Link from '../navigation/link';

import { useRouter, useSearchParams, usePathname } from '../navigation/hooks';
import BrandMark from './brand-mark';
import NotificationCenter from './notification-center';
import UiIcon, { type IconName } from './ui-icon';
import {
  ClipboardEvent as ReactClipboardEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from 'react';

type Mode = 'technician' | 'management' | 'admin';
type View = 'dashboard' | 'new' | 'list' | 'detail';
type Row = Record<string, unknown>;
interface Session {
  csrfToken: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    roles: string[];
    permissions?: string[];
    workScope?: string;
    workspace?: string;
    changeAccess?: string;
    departmentIds?: string[];
  };
}
interface Options {
  clients: Row[];
  contacts: Row[];
  sites: Row[];
  categories: Row[];
  tags: Row[];
  sources: Row[];
  departments?: Row[];
  statuses: string[];
  priorities: string[];
}
interface TicketPage {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}
interface TicketFilters {
  dashboardFilter: string;
  q: string;
  status: string;
  priority: string;
  clientId: string;
  siteId: string;
  assignedUserId: string;
  categoryId: string;
  tagId: string;
  source: string;
  slaStatus: string;
  from: string;
  to: string;
}
interface SavedTicketView {
  id: string;
  name: string;
  query: Partial<TicketFilters>;
}
interface TicketDetail {
  ticket: Row;
  comments: Row[];
  history: Row[];
  attachments: Row[];
  approvals: Row[];
  collaborators?: Row[];
  helpRequests?: Row[];
}

const sourceLabels: Record<string, string> = {
  MISSIVE: 'Missive',
  MICROSOFT_TEAMS: 'Microsoft Teams',
  PHONE_CALL: 'Phone Call',
  SMS: 'SMS',
  EMAIL: 'Email',
  OTHER: 'Other',
};
const priorityLabels: Record<string, string> = {
  P1_CRITICAL: 'P1 Critical',
  P2_HIGH: 'P2 High',
  P3_MEDIUM: 'P3 Medium',
  P4_LOW: 'P4 Low',
};
const statusLabels: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_CLIENT: 'Waiting for Client',
  WAITING_FOR_VENDOR: 'Waiting for Vendor',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};
const display = uiLabel;
const formatDate = formatApiDate;
const isWideMode = (mode: Mode) => mode !== 'technician';
const workspaceBase = (mode: Mode) =>
  mode === 'admin'
    ? '/admin'
    : mode === 'management'
      ? '/management'
      : '/operations';
const ticketListPath = (mode: Mode) => `${workspaceBase(mode)}/tickets`;
const ticketReviewPath = (mode: Mode) => `${ticketListPath(mode)}?review=1`;
const canReviewTickets = (roles: string[]) =>
  roles.some((role) => ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role));
const canAssignTickets = (user: Session['user']) =>
  canReviewTickets(user.roles) &&
  (hasFullAccess(user.roles) || !!user.permissions?.includes('TICKETS_ASSIGN'));
const ticketDetailPath = (mode: Mode, id: unknown, reviewing = false) =>
  (mode === 'admin'
    ? `/admin/ticket/${String(id)}`
    : `${workspaceBase(mode)}/tickets/${String(id)}`) + (reviewing ? '?review=1' : '');
const workspaceLabel = (mode: Mode) =>
  mode === 'admin'
    ? 'Administration'
    : mode === 'management'
      ? 'Management'
      : 'Technician Portal';
const emptyTicketFilters: TicketFilters = {
  dashboardFilter: '',
  q: '',
  status: '',
  priority: '',
  clientId: '',
  siteId: '',
  assignedUserId: '',
  categoryId: '',
  tagId: '',
  source: '',
  slaStatus: '',
  from: '',
  to: '',
};

type TicketWorkspaceProps = {
  mode: Mode;
  view: View;
  ticketId?: string;
  ticketScope?: 'my' | 'team' | 'internal';
};

export default function TicketWorkspace(props: TicketWorkspaceProps) {
  return (
    <Suspense
      fallback={
        <p className="notice" role="status">
          Loading ticket workspace…
        </p>
      }
    >
      <TicketWorkspaceRoute {...props} />
    </Suspense>
  );
}

function TicketWorkspaceRoute(props: TicketWorkspaceProps) {
  const query = useSearchParams().toString();
  // Use the router's pending URL, including during client-side navigation.
  const screenKey = `${props.mode}:${props.view}:${props.ticketScope ?? 'my'}:${props.ticketId ?? ''}:${query}`;
  return (
    <TicketWorkspaceScreen key={screenKey} {...props} initialQuery={query} />
  );
}

function TicketWorkspaceScreen({
  mode,
  view,
  ticketId,
  ticketScope = 'my',
  initialQuery,
}: TicketWorkspaceProps & { initialQuery: string }) {
  const router = useRouter();
  const reviewing = new URLSearchParams(initialQuery).get('review') === '1';
  const [session, setSession] = useState<Session>();
  const [options, setOptions] = useState<Options>();
  const [data, setData] = useState<Row>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [menu, setMenu] = useState(false);
  const initialTicketFilters = (): TicketFilters => ({
    ...emptyTicketFilters,
    ...(view === 'list' ? dashboardQueueFilters(initialQuery) : {}),
  });
  const [ticketFilters, setTicketFilters] =
    useState<TicketFilters>(initialTicketFilters);
  const [appliedTicketFilters, setAppliedTicketFilters] =
    useState<TicketFilters>(initialTicketFilters);
  const [savedViews, setSavedViews] = useState<SavedTicketView[]>([]);

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await reviewedFetch(`/api${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(session ? { 'x-csrf-token': session.csrfToken } : {}),
          ...init?.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            (response.status === 401
              ? 'Your session has expired. Sign in again.'
              : 'Request failed. Please retry.'),
        );
      return body;
    },
    [session],
  );

  useEffect(() => {
    let live = true;
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace('/');
          throw new Error('Sign in to open this workspace.');
        }
        if (!response.ok) throw new Error('Unable to check access.');
        const me = (await response.json()) as Session;
        const staff = me.user.roles.some((role) =>
          ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(
            role,
          ),
        );
        const management = me.user.roles.some((role) =>
          ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role),
        );
        if (
          !staff ||
          (mode === 'admin' && !hasFullAccess(me.user.roles)) ||
          (mode === 'management' && !management)
        )
          throw new Error(
            mode === 'admin'
              ? 'Administrator access is required.'
              : mode === 'management'
                ? 'Team lead, manager or administrator access is required.'
                : 'Technician access is required.',
          );
        if (live) setSession(me);
      })
      .catch((reason: Error) => {
        if (live) {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [mode, router]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    const listQuery = new URLSearchParams({
      scope: reviewing ? 'review' : isWideMode(mode) ? 'all' : ticketScope,
      pageSize: '50',
      queue: 'true',
    });
    for (const [key, value] of Object.entries(appliedTicketFilters))
      if (value) listQuery.set(key, value);
    if (reviewing) {
      listQuery.delete('status');
      listQuery.delete('dashboardFilter');
    }
    const path =
      view === 'dashboard'
        ? `/tickets/dashboard?scope=${isWideMode(mode) ? 'all' : 'my'}`
        : view === 'list'
          ? `/tickets?${listQuery.toString()}`
          : view === 'detail' && ticketId
            ? `/tickets/${ticketId}`
            : '/tickets/options';
    void Promise.all([
      request(path, { signal: controller.signal }),
      view === 'new' || view === 'detail' || view === 'list'
        ? request('/tickets/options', { signal: controller.signal })
        : Promise.resolve(undefined),
      view === 'list'
        ? request('/tickets/views', { signal: controller.signal })
        : Promise.resolve(undefined),
    ])
      .then(([result, available, views]) => {
        if (live) {
          setData(result as Row);
          if (available) setOptions(available as Options);
          if (views) setSavedViews(views as SavedTicketView[]);
        }
      })
      .catch((reason: Error) => {
        if (live)
          setError(
            timedOut
              ? 'Ticket results took too long to load. Your previous results are still available; retry when ready.'
              : reason.name === 'AbortError'
                ? ''
                : reason.message,
          );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (live) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      live = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    appliedTicketFilters,
    mode,
    request,
    reviewing,
    revision,
    session,
    ticketId,
    ticketScope,
    view,
  ]);

  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const allowed = (permission: string) =>
    hasFullAccess(session?.user.roles) ||
    session?.user.permissions?.includes(permission);
  const nav: [string, IconName, string][] =
    mode === 'technician'
      ? [
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
          ...(allowed('CATEGORY_MANAGE')
            ? ([['/admin/categories', 'categories', 'Categories']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('CLIENTS_MANAGE')
            ? ([['/admin/clients', 'clients', 'Clients']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('CONTACTS_MANAGE')
            ? ([['/admin/contacts', 'contacts', 'Contacts']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('SITES_MANAGE')
            ? ([['/admin/sites', 'sites', 'Sites']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('TAGS_MANAGE')
            ? ([['/admin/tags', 'tags', 'Tags']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('AUDIT_VIEW')
            ? ([['/admin/audit-logs', 'audit', 'Audit History']] as [
                string,
                IconName,
                string,
              ][])
            : []),
          ...(allowed('SLA_MANAGE')
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
          ...(session?.user.changeAccess && session.user.changeAccess !== 'NONE'
            ? ([['/changes', 'change', 'Change Management']] as [
                string,
                IconName,
                string,
              ][])
            : []),
        ]
      : mode === 'management'
        ? [
            ['/management', 'dashboard', 'Dashboard'],
            ['/management/tickets', 'tickets', 'Tickets'],
            ...(allowed('CATEGORY_MANAGE')
              ? ([['/admin/categories', 'categories', 'Categories']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('CLIENTS_MANAGE')
              ? ([['/admin/clients', 'clients', 'Clients']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('CONTACTS_MANAGE')
              ? ([['/admin/contacts', 'contacts', 'Contacts']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('SITES_MANAGE')
              ? ([['/admin/sites', 'sites', 'Sites']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('TAGS_MANAGE')
              ? ([['/admin/tags', 'tags', 'Tags']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('AUDIT_VIEW')
              ? ([['/admin/audit-logs', 'audit', 'Audit History']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('SLA_MANAGE') || session?.user.roles.includes('TEAM_LEAD')
              ? ([['/management/sla', 'sla', 'SLA Management']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
            ...(allowed('REPORTS_VIEW')
              ? ([
                  ['/management/reports', 'reports', 'Reports & Analytics'],
                ] as [string, IconName, string][])
              : []),
            ...(session?.user.changeAccess &&
            session.user.changeAccess !== 'NONE'
              ? ([['/changes', 'change', 'Change Management']] as [
                  string,
                  IconName,
                  string,
                ][])
              : []),
          ]
        : [
            ['/admin', 'dashboard', 'Dashboard'],
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
          ];
  const activeHref =
    view === 'dashboard'
      ? workspaceBase(mode)
      : view === 'new'
        ? '/operations/new'
        : mode === 'technician' && ticketScope === 'team'
          ? '/operations/team-tickets'
          : mode === 'technician' && ticketScope === 'internal'
            ? '/operations/internal-tickets'
            : ticketListPath(mode);
  const sidebarScroll = useSidebarScroll(activeHref, Boolean(session));

  return (
    <div className="admin-shell ticket-shell">
      <a className="skip-link" href="#ticket-main">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link className="brand" href={workspaceBase(mode)}>
          <BrandMark />
          <span>
            ASTRA<small>Ticketing System</small>
          </span>
        </Link>
        <p className="nav-label">
          {mode === 'admin'
            ? 'ADMINISTRATION'
            : mode === 'management'
              ? 'MANAGEMENT'
              : 'TECHNICIAN PORTAL'}
        </p>
        <nav
          ref={sidebarScroll}
          aria-label={`${workspaceLabel(mode)} navigation`}
        >
          <WorkspaceNavigation
            links={[...nav, ...extensionLinks(session?.user)]}
            workspace={session?.user.workspace}
            activeHref={activeHref}
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
            <Link className="workspace-home-link" href="/">{workspaceLabel(mode)}</Link> <span>/</span>{' '}
            {view === 'new'
              ? 'New Ticket'
              : view === 'detail'
                ? 'Ticket'
                : display(view)}
          </span>
          <div className="profile">
            {session ? <ProfileIdentity name={session.user.displayName} /> : <span>ASTRA</span>}
            {session ? (
              <>
                <NotificationCenter
                  csrfToken={session.csrfToken}
                  ticketBase={
                    mode === 'admin'
                      ? '/admin/ticket'
                      : mode === 'management'
                        ? '/management/tickets'
                        : '/operations/tickets'
                  }
                />
                <Link className="secondary" href="/">
                  Switch workspace
                </Link>
                <button className="secondary" onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>
        <main id="ticket-main">
          {session && mode === 'admin' ? <AdministrationOversight /> : null}
          {error ? (
            <div className="notice error" role="alert">
              {error}{' '}
              {!session ? (
                <Link href="/">Sign in</Link>
              ) : (
                <button
                  onClick={() => {
                    setError('');
                    if (view === 'list' && data) setRefreshing(true);
                    if (!data) setLoading(true);
                    setRevision((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : null}
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          {loading && !data ? (
            <div className="notice" role="status">
              Loading ticket workspace…
            </div>
          ) : null}
          {!loading && session && view === 'dashboard' && data ? (
            <Dashboard
              userId={session.user.id}
              mode={mode}
              data={data}
              request={request}
              canReport={Boolean(
                hasFullAccess(session.user.roles) ||
                session.user.permissions?.includes('REPORTS_VIEW'),
              )}
            />
          ) : null}
          {session && view === 'list' && data && options ? (
            <TicketList
              mode={mode}
              page={data as unknown as TicketPage}
              scope={ticketScope}
              reviewing={reviewing}
              canReview={canReviewTickets(session.user.roles)}
              options={options}
              filters={ticketFilters}
              savedViews={savedViews}
              refreshing={refreshing}
              setFilters={setTicketFilters}
              applyFilters={(filters) => {
                setError('');
                setRefreshing(true);
                setAppliedTicketFilters(filters);
                setRevision((value) => value + 1);
              }}
              request={request}
              onError={setError}
              refresh={() => {
                setRefreshing(true);
                setRevision((value) => value + 1);
              }}
            />
          ) : null}
          {!loading &&
          session &&
          view === 'new' &&
          options ? (
            <NewTicket
              options={options}
              session={session}
              request={request}
              onError={setError}
              onCreated={(ticket) =>
                router.push(ticketDetailPath(mode, ticket.id))
              }
            />
          ) : null}
          {!loading &&
          session &&
          view === 'detail' &&
          data &&
          options &&
          ticketId ? (
            <TicketView
              mode={mode}
              detail={data as unknown as TicketDetail}
              options={options}
              request={request}
              onError={setError}
              onNotice={setNotice}
              refresh={() => setRevision((value) => value + 1)}
              canEdit={
                (session.user.roles.some((role) =>
                  ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role),
                ) ||
                  String(
                    (data as unknown as TicketDetail).ticket.assigned_user_id,
                  ) === session.user.id)
              }
              canAssign={canAssignTickets(session.user)}
              canReview={canReviewTickets(session.user.roles)}
              reviewing={reviewing}
              viewerId={session.user.id}
              viewerName={session.user.displayName}
              canDecideApproval={
                allowed('TICKETS_APPROVE') ?? false
              }
              intern={session.user.roles.includes('INTERN')}
              canRespondHelp={
                mode !== 'admin' &&
                Boolean(
                  (data as unknown as TicketDetail).helpRequests?.some(
                    (x) =>
                      x.status === 'PENDING' &&
                      (String(x.requested_user_id ?? '') === session.user.id ||
                        session.user.departmentIds?.includes(
                          String(x.department_id ?? ''),
                        )),
                  ),
                )
              }
            />
          ) : null}
          {!loading && session && view === 'detail' && ticketId && !['internal-note','public-reply'].includes(new URLSearchParams(initialQuery).get('compose')??'') ? (
            <div className="ticket-support-cards">
              <section className="panel v38-stack ticket-related-links">
                {session?.user.roles.some((r) =>
                  ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
                ) && (
                  <>
                    <h2>Related problems</h2>
                    {((data?.problems as Row[]) ?? []).map((p) => (
                      <p key={String(p.id)}>
                        <Link
                          href={`/problems?problem=${String(p.id)}&workspace=${session.user.workspace ?? 'operations'}`}
                        >
                          {String(p.problem_number)} · {String(p.title)}
                        </Link>
                      </p>
                    ))}
                    {mode !== 'admin' && (
                      <Link
                        href={`/problems?ticket=${String((data?.ticket as Row)?.id)}&client=${String((data?.ticket as Row)?.client_id)}&workspace=${session.user.workspace ?? 'operations'}`}
                      >
                        Investigate or link a problem
                      </Link>
                    )}
                  </>
                )}
                <h2>Linked knowledge</h2>
                {((data?.knowledge as Row[]) ?? []).map((a) => (
                  <Link
                    key={String(a.id)}
                    href={`/knowledge?article=${encodeURIComponent(String(a.id))}&workspace=${session.user.workspace ?? (mode === 'admin' ? 'admin' : mode === 'management' ? 'management' : 'operations')}`}
                  >
                    {String(a.title)}
                  </Link>
                ))}
                <Link
                  href={
                    `/knowledge?workspace=${session.user.workspace ?? (mode === 'admin' ? 'admin' : mode === 'management' ? 'management' : 'operations')}`
                  }
                >
                  {mode === 'admin'
                    ? 'View knowledge articles'
                    : 'Find and link an article'}
                </Link>
              </section>
              <MailTimeline kind="tickets" id={ticketId} revision={revision} />
            </div>
          ) : null}
        </main>
      </div>
      {session && view !== 'dashboard' ? (
        <HelpChat user={session.user} csrfToken={session.csrfToken} />
      ) : null}
    </div>
  );
}

function Heading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard({
  userId,
  mode,
  data,
  request,
  canReport,
}: {
  mode: Mode;
  data: Row;
  request: ApiRequest;
  canReport: boolean;
  userId: string;
}) {
  if (mode === 'management')
    return (
      <ManagementOverview
        snapshot={data}
        request={request}
        canReport={canReport}
      />
    );
  const charts = (data.charts ?? {}) as Row;
  return (
    <CorporateDashboard
      key={userId + mode}
      userId={userId}
      mode={mode}
      counts={(data.counts ?? {}) as Row}
      trend={(charts.trend ?? []) as Row[]}
      distributions={
        <>
          <DistributionChart
            title="Tickets by status"
            rows={(charts.status ?? []) as Row[]}
          />
          <DistributionChart
            title="Tickets by priority"
            rows={(charts.priority ?? []) as Row[]}
          />
          {isWideMode(mode) ? (
            <DistributionChart
              title="Open workload by technician"
              rows={(charts.workload ?? []) as Row[]}
              valueKey="open"
              labelKey="name"
            />
          ) : (
            <DistributionChart
              title="My tickets by source"
              rows={(charts.source ?? []) as Row[]}
            />
          )}
        </>
      }
      recent={<TicketTable rows={(data.recent ?? []) as Row[]} mode={mode} />}
    />
  );
}

function DistributionChart({
  title,
  rows,
  labelKey = 'label',
  valueKey = 'value',
}: {
  title: string;
  rows: Row[];
  labelKey?: string;
  valueKey?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] ?? 0)));
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {rows.length ? (
        rows.slice(0, 8).map((row) => {
          const value = Number(row[valueKey] ?? 0);
          return (
            <div className="bar-row" key={String(row[labelKey])}>
              <span>{display(row[labelKey])}</span>
              <div>
                <i style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          );
        })
      ) : (
        <p className="empty">No ticket data yet.</p>
      )}
    </section>
  );
}

function TicketList({
  mode,
  page,
  scope,
  reviewing,
  canReview,
  options,
  filters,
  savedViews,
  refreshing,
  setFilters,
  applyFilters,
  request,
  onError,
  refresh,
}: {
  mode: Mode;
  page: TicketPage;
  scope: 'my' | 'team' | 'internal';
  reviewing: boolean;
  canReview: boolean;
  options: Options;
  filters: TicketFilters;
  savedViews: SavedTicketView[];
  refreshing: boolean;
  setFilters: (filters: TicketFilters) => void;
  applyFilters: (filters: TicketFilters) => void;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onError: (message: string) => void;
  refresh: () => void;
}) {
  const [viewName, setViewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const update = (key: keyof TicketFilters, value: string) =>
    setFilters({ ...filters, [key]: value });
  const availableSites = options.sites;
  const selectedTicket =
    page.items.find((ticket) => String(ticket.id) === selectedTicketId) ??
    page.items[0];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const visibleCounts = page.items.reduce<{
    open: number;
    inProgress: number;
    waiting: number;
    slaAttention: number;
  }>(
    (counts, ticket) => {
      const status = String(ticket.status);
      const sla = String(ticket.sla_status);
      if (status === 'IN_PROGRESS') counts.inProgress += 1;
      if (status.startsWith('WAITING_') || status === 'ON_HOLD')
        counts.waiting += 1;
      if (sla === 'AT_RISK' || sla === 'BREACHED') counts.slaAttention += 1;
      if (!['RESOLVED', 'CLOSED', 'CANCELLED'].includes(status))
        counts.open += 1;
      return counts;
    },
    { open: 0, inProgress: 0, waiting: 0, slaAttention: 0 },
  );

  function chooseLayout(next: 'list' | 'board') {
    setLayout(next);
  }

  async function saveView() {
    if (viewName.trim().length < 2) {
      onError('Enter a saved-view name with at least two characters.');
      return;
    }
    setSaving(true);
    onError('');
    try {
      const query = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== ''),
      );
      await request('/tickets/views', {
        method: 'POST',
        body: JSON.stringify({ name: viewName.trim(), query }),
      });
      setViewName('');
      refresh();
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteView(id: string) {
    onError('');
    try {
      await request(`/tickets/views/${id}`, { method: 'DELETE' });
      refresh();
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <>
      <Heading
        eyebrow={
          reviewing || isWideMode(mode)
            ? 'SERVICE OPERATIONS / OVERSIGHT'
            : scope === 'team'
              ? 'MY WORKSPACE / ASSIGNED SITES'
              : 'MY WORKSPACE / ASSIGNED'
        }
        title={
          reviewing
            ? 'Review queue'
            : isWideMode(mode)
            ? 'All tickets'
            : scope === 'team'
              ? 'Site team tickets'
              : 'My tickets'
        }
        detail={reviewing
          ? `${page.total} resolved ticket${page.total === 1 ? '' : 's'} waiting for review and closure.`
          : `${page.total} ticket${page.total === 1 ? '' : 's'} in this queue.${filters.dashboardFilter ? ' ' + dashboardFilterLabels[filters.dashboardFilter] + '.' : ''}`}
        action={
          <div className="heading-actions" style={{ display: 'flex' }}>
            {reviewing ? (
              <Link className="secondary" href={ticketListPath(mode)}>Back to tickets</Link>
            ) : (
              <>
                {canReview && <Link className="secondary" href={ticketReviewPath(mode)}>Review queue</Link>}
                {(mode === 'technician' || mode === 'admin') && (
                  <Link className="primary" href={mode === 'admin' ? '/admin/tickets/new' : '/operations/new'}>
                    + New Ticket
                  </Link>
                )}
              </>
            )}
          </div>
        }
      />
      {!reviewing && <div
        className="queue-summary"
        aria-label="Current ticket results summary"
      >
        {[
          { label: 'Open', value: visibleCounts.open, icon: 'tickets' },
          {
            label: 'In progress',
            value: visibleCounts.inProgress,
            icon: 'pulse',
          },
          { label: 'Waiting', value: visibleCounts.waiting, icon: 'waiting' },
          {
            label: 'SLA attention',
            value: visibleCounts.slaAttention,
            icon: 'alert',
          },
        ].map(({ label, value, icon }) => (
          <article key={label}>
            <span aria-hidden="true">
              <UiIcon name={icon as IconName} />
            </span>
            <div>
              <strong>{value}</strong>
              <small>{label}</small>
            </div>
          </article>
        ))}
      </div>}
      <section className="panel ticket-search-panel queue-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters(filters);
          }}
        >
          <div className="queue-primary-tools">
            <label className="ticket-search-box">
              <span className="sr-only">Search tickets</span>
              <span className="search-icon" aria-hidden="true">
                <UiIcon name="search" />
              </span>
              <input
                value={filters.q}
                onChange={(event) => update('q', event.target.value)}
                placeholder="Search tickets, subjects, requesters, clients or sites…"
              />
            </label>
            <label className="compact-select">
              <span className="sr-only">Status</span>
              <select
                value={reviewing ? 'RESOLVED' : filters.status}
                disabled={reviewing}
                onChange={(event) => update('status', event.target.value)}
              >
                <option value="">Any status</option>
                {options.statuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value] ?? display(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span className="sr-only">Priority</span>
              <select
                value={filters.priority}
                onChange={(event) => update('priority', event.target.value)}
              >
                <option value="">Any priority</option>
                {options.priorities.map((value) => (
                  <option key={value} value={value}>
                    {priorityLabels[value] ?? display(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span className="sr-only">Client</span>
              <select
                value={filters.clientId}
                onChange={(event) => {
                  setFilters({
                    ...filters,
                    clientId: event.target.value,
                    siteId: '',
                  });
                }}
              >
                <option value="">Any client</option>
                {options.clients.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-select">
              <span className="sr-only">Site</span>
              <select
                value={filters.siteId}
                onChange={(event) => update('siteId', event.target.value)}
              >
                <option value="">Any site</option>
                {availableSites.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary queue-search-button" type="submit">
              Search
            </button>
            <button
              className="queue-clear-button"
              type="button"
              disabled={refreshing && activeFilterCount === 0}
              onClick={() => {
                setFilters(emptyTicketFilters);
                applyFilters(emptyTicketFilters);
              }}
            >
              Clear filters
            </button>
            <div className="layout-switch" aria-label="Ticket layout">
              <button
                type="button"
                aria-pressed={layout === 'list'}
                onClick={() => chooseLayout('list')}
              >
                ☷ List
              </button>
              <button
                type="button"
                aria-pressed={layout === 'board'}
                onClick={() => chooseLayout('board')}
              >
                ▥ Board
              </button>
            </div>
          </div>
          {refreshing ? (
            <div className="queue-refresh" role="status">
              <span /> Updating results… Current tickets remain available.
            </div>
          ) : null}
        </form>
        <details className="saved-ticket-views">
          <summary>
            Saved views <span>{savedViews.length}</span>
          </summary>
          <div className="saved-view-create">
            <input
              value={viewName}
              maxLength={80}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Name this filter view"
              aria-label="Saved view name"
            />
            <button
              className="secondary"
              type="button"
              disabled={saving}
              onClick={() => void saveView()}
            >
              {saving ? 'Saving…' : 'Save current view'}
            </button>
          </div>
          {savedViews.length ? (
            <div className="saved-view-list">
              {savedViews.map((savedView) => (
                <span className="saved-view-chip" key={savedView.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const selected = {
                        ...emptyTicketFilters,
                        ...savedView.query,
                      };
                      setFilters(selected);
                      applyFilters(selected);
                    }}
                  >
                    {savedView.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved view ${savedView.name}`}
                    onClick={() => void deleteView(savedView.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="hint">No saved views yet.</p>
          )}
        </details>
      </section>
      <div className={`ticket-queue-layout ${layout}`}>
        <section className="panel ticket-results-panel">
          <div className="results-heading">
            <div>
              <h2>{layout === 'list' ? 'Ticket queue' : 'Workflow board'}</h2>
              <p>
                {page.total} result{page.total === 1 ? '' : 's'} · showing up to{' '}
                {page.pageSize}
              </p>
            </div>
            <span>{refreshing ? 'Refreshing…' : 'Up to date'}</span>
          </div>
          {layout === 'list' ? (
            <TicketTable
              rows={page.items}
              mode={mode}
              reviewing={reviewing}
              showAssignee={reviewing || mode !== 'technician' || scope !== 'my'}
              selectedId={String(selectedTicket?.id ?? '')}
              onSelect={setSelectedTicketId}
            />
          ) : (
            <TicketBoard rows={page.items} mode={mode} reviewing={reviewing} />
          )}
        </section>
        <aside className="queue-side-panel">
          {layout === 'list' ? (
            <TicketQuickPreview ticket={selectedTicket} mode={mode} reviewing={reviewing} />
          ) : null}
          <QueueHealth rows={page.items} total={page.total} />
        </aside>
      </div>
    </>
  );
}

function TicketTable({
  rows,
  mode,
  reviewing = false,
  showAssignee = true,
  selectedId,
  onSelect,
}: {
  rows: Row[];
  mode: Mode;
  reviewing?: boolean;
  selectedId?: string;
  showAssignee?: boolean;
  onSelect?: (id: string) => void;
}) {
  if (!rows.length) return <p className="empty">No tickets in this queue.</p>;
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Client / requester</th>
            <th>Tags</th>
            <th>Status</th>
            <th>Priority</th>
            {showAssignee && <th>Assigned to</th>}
            <th>SLA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ticket) => {
            const id = String(ticket.id);
            return (
              <tr
                key={id}
                className={selectedId === id ? 'selected' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => onSelect?.(id)}
                onKeyDown={(event) => {
                  if (
                    onSelect &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault();
                    onSelect(id);
                  }
                }}
              >
                <td>
                  <Link
                    className="ticket-link"
                    href={ticketDetailPath(mode, ticket.id, reviewing)}
                  >
                    {String(ticket.ticket_number)}
                  </Link>
                  <strong>{String(ticket.subject)}</strong>
                  <small>
                    {String(
                      ticket.source_name ??
                        sourceLabels[String(ticket.source)] ??
                        display(ticket.source),
                    )}
                  </small>
                </td>
                <td>
                  <strong>{String(ticket.client_name)}</strong>
                  <small>{String(ticket.requester_name)}</small>
                  <small>{String(ticket.site_name ?? 'No site')}</small>
                </td>
                <td className="ticket-tags-cell">
                  <TicketTags tags={ticket.tags} />
                </td>
                <td>
                  <TicketBadge kind="status" value={String(ticket.status)} />
                </td>
                <td>
                  <TicketBadge
                    kind="priority"
                    value={String(ticket.priority)}
                  />
                </td>
                {showAssignee && <td>{String(ticket.assigned_name ?? 'Unassigned')}</td>}
                <td>
                  <span
                    className={`sla-pill sla-${String(ticket.sla_status ?? 'not_tracked').toLowerCase()}`}
                  >
                    {display(ticket.sla_status ?? 'NOT_TRACKED')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TicketQuickPreview({ ticket, mode, reviewing }: { ticket?: Row; mode: Mode; reviewing: boolean }) {
  if (!ticket)
    return (
      <section className="panel quick-preview empty-preview">
        <h2>Ticket preview</h2>
        <p>Select a ticket to view its key details.</p>
      </section>
    );
  return (
    <section className="panel quick-preview">
      <div className="preview-number">
        <span>{String(ticket.ticket_number)}</span>
        <small>{formatDate(ticket.updated_at)}</small>
      </div>
      <h2>{String(ticket.subject)}</h2>
      <p className="preview-description">
        {ticket.description
          ? String(ticket.description)
          : 'No description provided.'}
      </p>
      <TicketTags tags={ticket.tags} />
      <div className="preview-badges">
        <TicketBadge kind="status" value={String(ticket.status)} />
        <TicketBadge kind="priority" value={String(ticket.priority)} />
      </div>
      <dl>
        <div>
          <dt>Requester</dt>
          <dd>{String(ticket.requester_name)}</dd>
        </div>
        <div>
          <dt>Client / site</dt>
          <dd>
            {String(ticket.client_name)}
            <small>{String(ticket.site_name ?? 'No site')}</small>
          </dd>
        </div>
        <div>
          <dt>Assignee</dt>
          <dd>{String(ticket.assigned_name ?? 'Unassigned')}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {String(
              ticket.source_name ??
                sourceLabels[String(ticket.source)] ??
                display(ticket.source),
            )}
          </dd>
        </div>
      </dl>
      <Link className="primary full" href={ticketDetailPath(mode, ticket.id, reviewing)}>
        Open ticket →
      </Link>
    </section>
  );
}

function QueueHealth({ rows, total }: { rows: Row[]; total: number }) {
  const metrics = [
    [
      'SLA at risk',
      rows.filter((row) => row.sla_status === 'AT_RISK').length,
      'risk',
    ],
    [
      'SLA breached',
      rows.filter((row) => row.sla_status === 'BREACHED').length,
      'breach',
    ],
    [
      'SLA paused',
      rows.filter((row) => row.sla_status === 'PAUSED').length,
      'neutral',
    ],
    [
      'Unassigned',
      rows.filter((row) => !row.assigned_user_id).length,
      'neutral',
    ],
    [
      'Resolved',
      rows.filter((row) => ['RESOLVED', 'CLOSED'].includes(String(row.status)))
        .length,
      'good',
    ],
  ];
  return (
    <section className="panel queue-health">
      <div className="queue-health-title">
        <span aria-hidden="true">∿</span>
        <div>
          <h2>Queue health</h2>
          <p>Current result page</p>
        </div>
      </div>
      <div className="health-metrics">
        {metrics.map(([label, value, tone]) => (
          <div key={String(label)} className={`health-${tone}`}>
            <span>{label}</span>
            <strong>{String(value)}</strong>
          </div>
        ))}
      </div>
      <p className="health-footnote">
        Showing {rows.length} of {total} matching tickets.
      </p>
    </section>
  );
}

function TicketBoard({ rows, mode, reviewing }: { rows: Row[]; mode: Mode; reviewing: boolean }) {
  const columns = [
    { name: 'New', statuses: ['NEW', 'OPEN'], tone: 'new' },
    { name: 'In progress', statuses: ['IN_PROGRESS'], tone: 'progress' },
    {
      name: 'Waiting',
      statuses: ['WAITING_FOR_CLIENT', 'WAITING_FOR_VENDOR', 'ON_HOLD'],
      tone: 'waiting',
    },
    {
      name: 'Resolved',
      statuses: ['RESOLVED', 'CLOSED', 'CANCELLED'],
      tone: 'resolved',
    },
  ];
  if (!rows.length) return <p className="empty">No tickets in this queue.</p>;
  return (
    <div className="ticket-board">
      {columns.map((column) => {
        const tickets = rows.filter((ticket) =>
          column.statuses.includes(String(ticket.status)),
        );
        return (
          <section
            className={`board-column board-${column.tone}`}
            key={column.name}
          >
            <header>
              <h3>{column.name}</h3>
              <span>{tickets.length}</span>
            </header>
            <div className="board-cards">
              {tickets.length ? (
                tickets.map((ticket) => (
                  <Link
                    className="board-card"
                    href={ticketDetailPath(mode, ticket.id, reviewing)}
                    key={String(ticket.id)}
                  >
                    <span className="board-ticket-number">
                      {String(ticket.ticket_number)}
                    </span>
                    <strong>{String(ticket.subject)}</strong>
                    <small>{String(ticket.requester_name)}</small>
                    <small>
                      {String(ticket.client_name)} ·{' '}
                      {String(ticket.site_name ?? 'No site')}
                    </small>
                    <TicketTags tags={ticket.tags} />
                    <div className="board-card-footer">
                      <TicketBadge
                        kind="priority"
                        value={String(ticket.priority)}
                      />
                      <span
                        className={`sla-dot sla-${String(ticket.sla_status ?? 'not_tracked').toLowerCase()}`}
                        title={`SLA ${display(ticket.sla_status ?? 'NOT_TRACKED')}`}
                      />
                      <b>{String(ticket.assigned_name ?? 'Unassigned')}</b>
                    </div>
                  </Link>
                ))
              ) : (
                <p>No tickets</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TicketBadge({
  kind,
  value,
}: {
  kind: 'status' | 'priority' | 'approval';
  value: string;
}) {
  const label =
    kind === 'status'
      ? statusLabels[value]
      : kind === 'priority'
        ? priorityLabels[value]
        : display(value);
  return (
    <span className={`ticket-badge ${kind}-${value.toLowerCase()}`}>
      {label ?? display(value)}
    </span>
  );
}

function useTicketAssignees(
  clientId: string,
  siteId: string,
  request: (path: string, init?: RequestInit) => Promise<unknown>,
  includeAllStaff = false,
) {
  const [result, setResult] = useState<{ path: string; items: Row[]; error?: string }>();
  const query = new URLSearchParams({ clientId });
  if (siteId) query.set('siteId', siteId);
  if (includeAllStaff) query.set('includeAllStaff', 'true');
  const path = clientId ? `/tickets/assignees?${query}` : '';

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void request(path, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setResult({ path, items: items as Row[] });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ path, items: [], error: 'Could not load eligible team members. Refresh the page to try again.' });
        }
      });
    return () => controller.abort();
  }, [path, request]);

  const current = result?.path === path ? result : undefined;
  const items = current?.items ?? [];
  return {
    items: items.filter((item) => Number(item.can_assign ?? 1) === 1),
    unavailable: items.filter((item) => Number(item.can_assign ?? 1) === 0),
    error: current?.error,
    loading: !current && !!path,
  };
}

function NewTicket({
  options,
  session,
  request,
  onError,
  onCreated,
}: {
  options: Options;
  session: Session;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onError: (value: string) => void;
  onCreated: (ticket: { id: string }) => void;
}) {
  const canAssign = canAssignTickets(session.user);
  const [saving, setSaving] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState('');
  const [requesterIds, setRequesterIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [categoryParentIds,setCategoryParentIds]=useState<string[]>([]);
  const [categoryChildIds,setCategoryChildIds]=useState<string[]>([]);
  const [serviceTemplateClient,setServiceTemplateClient]=useState('');
  const [form, setForm] = useState({
    serviceTemplateId: '',
    requesterId: '',
    siteId: '',
    categoryId: '',
    subject: '',
    description: '',
    source: String(options.sources[0]?.code ?? ''),
    priority: 'P3_MEDIUM',
    assignedUserId: session.user.id,
    sourceReferenceId: '',
    departmentId: '',
    locationText: '',
  });
  const contacts = options.contacts.filter((item) => item.client_id === clientId && item.site_id === form.siteId);
  const sites = options.sites.filter((item) => item.client_id === clientId);
  const assignees = useTicketAssignees(
    clientId, form.siteId, request,
  );
  const selectedAssignee = assignees.items.some((item) => item.id === form.assignedUserId)
    ? form.assignedUserId : '';
  const displayedAssignees = technicianOptions(assignees.items, session.user);
  const ticketCategories=options.categories.map(item=>({id:String(item.id),name:String(item.name),parent_id:item.parent_id?String(item.parent_id):undefined}));
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('template');
    if (!id) return;
    let live = true;
    void request('/knowledge/catalogue')
      .then((result) => {
        const template = (
          result as {
            items: {
              id: string;
              name: string;
              instructions: string;
              category_id: string;
              client_id?: string;
            }[];
          }
        ).items.find((t) => t.id === id);
        if (!template || !live) return;
        setServiceTemplateClient(template.client_id ?? '');
        const category = options.categories.find(
          (c) => c.id === template.category_id,
        );
        if (template.client_id) setClientId(template.client_id);
        setCategoryParentIds(category?[String(category.parent_id??category.id)]:[]);
        setCategoryChildIds(category?.parent_id?[String(category.id)]:[]);
        setForm((f) => ({
          ...f,
          serviceTemplateId: template.id,
          subject: template.name,
          description: template.instructions,
          categoryId: template.category_id,
        }));
      })
      .catch((e) => {
        if (live) onError(e.message);
      });
    return () => {
      live = false;
    };
  }, [request, options.categories, onError]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (assignees.loading) return;
    if (!form.siteId || !requesterIds.length || requesterIds.some(id => !contacts.some(contact => contact.id === id))) {
      onError('Select a user belonging to the selected client before creating the ticket.');
      return;
    }
    if (form.assignedUserId && !selectedAssignee) {
      onError(assignees.error ?? 'The selected technician does not have access to this MSP or client. Choose an eligible technician or check your account access.');
      return;
    }
    const categorySelection=ticketCategorySelection(ticketCategories,categoryParentIds,categoryChildIds);
    if(categorySelection.error){onError(categorySelection.error);return;}
    setSaving(true);
    onError('');
    try {
      const attachmentPayload = await Promise.all(
        attachments.map(async (file) => ({
          fileName: file.name,
          contentType: file.type || 'text/plain',
          contentBase64: await fileToBase64(file),
        })),
      );
      const ticket = (await request('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          serviceTemplateId: serviceTemplateClient && serviceTemplateClient!==clientId ? undefined : form.serviceTemplateId || undefined,
          clientId,
          additionalRequesterIds: requesterIds.slice(1),
          siteId: form.siteId || undefined,
          categoryId: categorySelection.primary,
          categoryIds: categorySelection.ids,
          assignedUserId: selectedAssignee || undefined,
          departmentId: form.departmentId || undefined,
          locationText: form.locationText.trim() || undefined,
          sourceReferenceId: form.sourceReferenceId || undefined,
          tagIds,
          attachments: attachmentPayload,
        }),
      })) as { id: string };
      onCreated(ticket);
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const field = (name: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));
  function addAttachments(files: File[]) {
    onError('');
    const allowedTypes = new Set([
      'application/pdf',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/gif',
      'image/jpeg',
      'image/png',
      'text/csv',
      'text/plain',
    ]);
    if (files.some((file) => !allowedTypes.has(file.type))) {
      onError('One or more selected file types are not allowed.');
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > 5 * 1024 * 1024)) {
      onError('Each attachment must be between 1 byte and 5 MB.');
      return;
    }
    if (attachments.length + files.length > 4) {
      onError('You can attach up to four files to a new ticket.');
      return;
    }
    setAttachments((current) => [...current, ...files]);
  }
  function pasteAttachments(event: ReactClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!pasted.length) return;
    event.preventDefault();
    const stamp = Date.now();
    addAttachments(
      pasted.map((file, index) => {
        if (!file.type.startsWith('image/')) return file;
        const extension =
          file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        return new File(
          [file],
          `pasted-image-${stamp}-${index + 1}.${extension || 'png'}`,
          { type: file.type },
        );
      }),
    );
  }
  return (
    <>
      <Heading
        eyebrow="TECHNICIAN PORTAL / INTAKE"
        title="Create a new ticket"
        detail="Capture the request, requester and source. You can refine the ticket after creation."
      />
      <form
        className="ticket-form panel"
        onSubmit={(event) => void submit(event)}
      >
        <section>
          <h2>Requester and client</h2>
          <div className="form-grid">
            <Select
              label="MSP"
              required
              value={clientId}
              onChange={(value) => {
                setClientId(value);
                field('requesterId', '');
                setRequesterIds([]);
                field('siteId', '');
                field('assignedUserId', session.user.id);
                field('departmentId', '');
                field('locationText', '');
              }}
              options={options.clients}
            />
              <Select
                label="Client"
                value={form.siteId}
                onChange={(value) => {
                  field('siteId', value);
                  field('requesterId', '');
                  setRequesterIds([]);
                  field('assignedUserId', session.user.id);
                }}
                options={sites}
                required
                disabled={!clientId}
              />
            <RequesterSelect
              key={clientId + ':' + form.siteId}
              contacts={contacts}
              value={requesterIds}
              onChange={(value) => { setRequesterIds(value); field('requesterId', value[0] ?? ''); }}
              disabled={!form.siteId || contacts.length === 0}
            />
            <Select
              label="Technician"
              value={form.assignedUserId}
              onChange={(value) => field('assignedUserId', value)}
              options={displayedAssignees}
              disabled={!canAssign || !clientId || assignees.loading || !!assignees.error}
              optional
            />
            {form.siteId && contacts.length === 0 && (
              <p className="field-help span-2">No users have been added to this client yet. Add a client user before creating a ticket.</p>
            )}
            {assignees.error && <p role="alert" className="field-help span-2">{assignees.error}</p>}
            {clientId === '00000000-0000-4000-8000-000000000132' ? (
              <>
                <Select
                  label="Internal department"
                  value={form.departmentId}
                  onChange={(value) => field('departmentId', value)}
                  options={options.departments ?? []}
                  required
                />
                <label>
                  Location / project (optional)
                  <input
                    maxLength={500}
                    value={form.locationText}
                    onChange={(event) =>
                      field('locationText', event.target.value)
                    }
                    placeholder="Office, room, project or work area"
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>
        <section>
          <h2>Ticket details</h2>
          <div className="form-grid">
            <label className="span-2">
              Subject
              <input
                required
                minLength={3}
                maxLength={300}
                value={form.subject}
                onChange={(event) => field('subject', event.target.value)}
              />
            </label>
            <label className="span-2">
              Description
              <textarea
                required
                minLength={3}
                maxLength={20000}
                rows={7}
                value={form.description}
                onChange={(event) => field('description', event.target.value)}
              />
            </label>
            <div
              className="span-2 new-ticket-attachments"
              onPaste={pasteAttachments}
              tabIndex={0}
              role="group"
              aria-label="Ticket attachments"
            >
              <div>
                <strong>Attachments (optional)</strong>
                <p>
                  Choose files or click here and paste a copied screenshot with
                  Ctrl+V. Maximum four files, 5 MB each.
                </p>
              </div>
              <label className="file-button">
                Choose files
                <input
                  type="file"
                  multiple
                  accept=".pdf,.zip,.docx,.xlsx,.gif,.jpg,.jpeg,.png,.csv,.txt"
                  onChange={(event) => {
                    addAttachments(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </label>
              {attachments.length ? (
                <div className="pending-attachments">
                  {attachments.map((file, index) => (
                    <PendingAttachment
                      key={`${file.name}-${file.size}-${index}`}
                      file={file}
                      onRemove={() =>
                        setAttachments((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <label>
              Source
              <select
                value={form.source}
                onChange={(event) => field('source', event.target.value)}
              >
                {options.sources.map((source) => (
                  <option value={String(source.code)} key={String(source.code)}>
                    {String(source.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) => field('priority', event.target.value)}
              >
                {options.priorities.map((priority) => (
                  <option value={priority} key={priority}>
                    {priorityLabels[priority] ?? display(priority)}
                  </option>
                ))}
              </select>
            </label>
            <TicketCategoryFields categories={ticketCategories} parents={categoryParentIds} children={categoryChildIds} onParents={setCategoryParentIds} onChildren={setCategoryChildIds}/>
            <label className="span-2">
              Source reference (optional)
              <input
                maxLength={500}
                value={form.sourceReferenceId}
                onChange={(event) =>
                  field('sourceReferenceId', event.target.value)
                }
                placeholder="Missive conversation, Teams reference, caller reference…"
              />
            </label>
          </div>
        </section>
        <section>
          <h2>Tags</h2>
          <p className="hint">
            Choose the technologies and service labels that apply to this
            ticket.
          </p>
          <TagPicker
            options={options.tags}
            selected={tagIds}
            onChange={setTagIds}
            disabled={saving}
          />
        </section>
        <div className="form-actions">
          <Link className="secondary" href="/operations">
            Cancel
          </Link>
          <button className="primary" disabled={saving || assignees.loading || !form.siteId || !form.requesterId}>
            {saving ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </form>
    </>
  );
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Unable to read attachment.'));
    reader.readAsDataURL(file);
  });
}

function PendingAttachment({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [preview] = useState(() =>
    file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  return (
    <div className="pending-attachment">
      {preview ? (
        <img
          src={preview}
          alt="Attachment preview"
          width={48}
          height={40}
        />
      ) : (
        <span>FILE</span>
      )}
      <div>
        <strong>{file.name}</strong>
        <small>{Math.ceil(file.size / 1024)} KB</small>
      </div>
      <button type="button" className="link-danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function Select({
  label,
  options,
  unavailableOptions,
  value,
  onChange,
  optional,
  required,
  disabled,
}: {
  label: string;
  options: Row[];
  unavailableOptions?: Row[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{optional ? 'None' : 'Select…'}</option>
        {options.map((item) => (
          <option key={String(item.id)} value={String(item.id)}>
            {String(item.name)}
          </option>
        ))}
        {unavailableOptions?.length ? (
          <optgroup label="Unavailable for this client or site" disabled>
            {unavailableOptions.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {String(item.name)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}

function RequesterPicker({
  clientId,
  contacts,
  value,
  onChange,
  request,
  onCreated,
  onError,
}: {
  clientId: string;
  contacts: Row[];
  value: string;
  onChange: (value: string) => void;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onCreated: (requester: Row) => void;
  onError: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRequester, setNewRequester] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const matches = contacts.filter((contact) =>
    `${contact.name} ${contact.email ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = contacts.find((contact) => String(contact.id) === value);
  async function addRequester() {
    setSaving(true);
    onError('');
    try {
      const created = (await request('/tickets/requesters', {
        method: 'POST',
        body: JSON.stringify({ clientId, ...newRequester }),
      })) as Row;
      onCreated(created);
      setAdding(false);
      setSearch('');
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="requester-picker span-2">
      <label>
        Requester <span aria-hidden="true">*</span>
        <small>The end user who reported the issue or requested help.</small>
        <input
          required={!value}
          disabled={!clientId}
          type="search"
          placeholder={
            clientId ? 'Search by name or email…' : 'Select a client first'
          }
          value={
            selected
              ? `${selected.name}${selected.email ? ` · ${selected.email}` : ''}`
              : search
          }
          onChange={(event) => {
            onChange('');
            setSearch(event.target.value);
          }}
          onFocus={() => {
            if (selected) {
              onChange('');
              setSearch('');
            }
          }}
        />
      </label>
      {clientId && !selected && search ? (
        <div className="requester-results">
          {matches.slice(0, 8).map((contact) => (
            <button
              type="button"
              key={String(contact.id)}
              onClick={() => {
                onChange(String(contact.id));
                setSearch('');
              }}
            >
              <strong>{String(contact.name)}</strong>
              <small>{String(contact.email ?? 'No email')}</small>
            </button>
          ))}
          {!matches.length ? <p>No matching requester found.</p> : null}
          <button
            type="button"
            className="add-requester"
            onClick={() => {
              setAdding(true);
              setNewRequester((current) => ({
                ...current,
                name: search.includes('@') ? '' : search,
                email: search.includes('@') ? search : '',
              }));
            }}
          >
            + Add a new requester
          </button>
        </div>
      ) : null}
      {clientId && !selected && !search ? (
        <button
          type="button"
          className="text-button"
          onClick={() => setAdding(true)}
        >
          + Add a new requester
        </button>
      ) : null}
      {adding ? (
        <div className="requester-inline">
          <h3>Add requester</h3>
          <input
            required
            minLength={2}
            maxLength={200}
            placeholder="Full name"
            value={newRequester.name}
            onChange={(event) =>
              setNewRequester({ ...newRequester, name: event.target.value })
            }
          />
          <input
            type="email"
            maxLength={320}
            placeholder="Email"
            value={newRequester.email}
            onChange={(event) =>
              setNewRequester({ ...newRequester, email: event.target.value })
            }
          />
          <input
            maxLength={50}
            placeholder="Phone (if no email)"
            value={newRequester.phone}
            onChange={(event) =>
              setNewRequester({ ...newRequester, phone: event.target.value })
            }
          />
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                saving ||
                newRequester.name.trim().length < 2 ||
                (!newRequester.email.trim() && !newRequester.phone.trim())
              }
              onClick={() => void addRequester()}
            >
              {saving ? 'Adding…' : 'Add requester'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function describeTicketAssignment(event: Row) {
  if (!event.assignee_name) return null;
  const actor = String(event.actor_name ?? 'System');
  const assignee = String(event.assignee_name);
  if (event.previous_assignee_name) {
    return `${actor} transferred this ticket from ${event.previous_assignee_name} to ${assignee}.`;
  }
  if (event.self_assignment === true || event.self_assignment === 1) {
    return event.reason === 'Claimed by technician'
      ? `${actor} claimed this ticket.`
      : `${actor} assigned this ticket to themselves.`;
  }
  return `${actor} assigned this ticket to ${assignee}.`;
}

function describeTicketActivity(event: Row, ticket: Row): string[] {
  const actor = String(event.actor_name || 'System');
  const value = (raw: unknown): unknown => {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return raw; }
  };
  const before = value(event.previous_value);
  const after = value(event.new_value);
  const metadata = after && typeof after === 'object' && !Array.isArray(after)
    ? after as Row : {};
  const label = (raw: unknown) => {
    if (raw == null || raw === '') return 'None';
    const text = String(raw);
    return statusLabels[text] ?? priorityLabels[text] ?? display(text);
  };
  switch (event.action) {
    case 'TICKET.QA_REVIEWED': {
      const score = (rating: unknown) => rating == null ? 'Not rated' : `${rating}/5`;
      const current = metadata.criteriaVersion === 2 || metadata.communication != null || metadata.processCompliance != null;
      return [
        metadata.average == null ? `${actor} recorded a QA review without ratings.` : `${actor} recorded a QA review — ${Math.round(Number(metadata.average) * 20)}% for rated points.`,
        `Solution accuracy: ${score(metadata.solutionAccuracy)}; troubleshooting quality: ${score(metadata.troubleshootingQuality)}; ` +
          (current
            ? `communication: ${score(metadata.communication)}; process compliance: ${score(metadata.processCompliance)}.`
            : `documentation: ${score(metadata.documentation)}; fix verification: ${score(metadata.fixVerification)}.`),
        String(metadata.comment ?? ''),
      ].filter(Boolean);
    }
    case 'TICKET.TAGS_CHANGED': {
      const oldNames = (event.previous_tag_names as string[] | undefined) ?? [];
      const newNames = (event.new_tag_names as string[] | undefined) ?? [];
      const added = newNames.filter(name => !oldNames.includes(name));
      const removed = oldNames.filter(name => !newNames.includes(name));
      return [
        ...(added.length ? [`${actor} added tags — ${added.join(', ')}.`] : []),
        ...(removed.length ? [`${actor} removed tags — ${removed.join(', ')}.`] : []),
        ...(!added.length && !removed.length ? [`${actor} updated the ticket tags. Tag names are unavailable for this event.`] : []),
      ];
    }
    case 'TICKET.ASSIGNED':
      return [describeTicketAssignment(event) ?? `${actor} changed the ticket assignment.`];
    case 'TICKET.STATUS_CHANGED':
      return [`${actor} changed the status from ${label(before)} to ${label(after)}.`];
    case 'TICKET.PRIORITY_CHANGED':
      return [`${actor} changed the priority from ${label(before)} to ${label(after)}.`];
    case 'TICKET.CATEGORY_CHANGED':
      return [`${actor} changed the category from ${(event.previous_category_names as string[] | undefined)?.join(', ') || 'None'} to ${(event.new_category_names as string[] | undefined)?.join(', ') || 'None'}.`];
    case 'TICKET.CREATED':
      return [`${actor} created ${ticket.ticket_number} — ${ticket.subject}${metadata.source ? ` via ${sourceLabels[String(metadata.source)] ?? label(metadata.source)}` : ''}.`,
        ...(event.assignee_name ? [describeTicketAssignment(event)!] : [])];
    case 'TICKET.ATTACHMENT_ADDED':
      return [`${actor} attached ${metadata.fileName ?? 'a file'}${metadata.sizeBytes != null ? ` (${metadata.sizeBytes} bytes)` : ''}.`];
    case 'TICKET.APPROVAL_REQUESTED':
      return [`${actor} requested approval for this ticket.`];
    case 'TICKET.APPROVED':
    case 'TICKET.REJECTED':
    case 'TICKET.APPROVAL_DECIDED':
    case 'TICKET.APPROVAL_APPROVED':
    case 'TICKET.APPROVAL_REJECTED':
      return [`${actor} recorded the approval decision — ${label(after)}.`];
    case 'TICKET.PUBLIC_REPLY_ADDED':
    case 'TICKET.CLIENT_REPLIED':
      return [`${actor} added a public reply, shown in the conversation above.`];
    case 'TICKET.INTERNAL_NOTE_ADDED':
      return [`${actor} added an internal note, shown in the conversation above.`];
    case 'TICKET.HELP_REQUESTED':
    case 'TICKET.HELP_REQUEST_UPDATED':
      return [
        `${actor} ${event.action === 'TICKET.HELP_REQUESTED' ? 'requested specialist help' : 'updated the help request'}${event.help_recipient ? ` from ${event.help_recipient}` : ''}${metadata.status ? ` — ${label(metadata.status)}` : ''}.`,
        ...(event.help_expertise ? [`Requested help — ${event.help_expertise}`] : []),
        ...(event.help_response ? [`Response — ${event.help_response}`] : []),
      ];
    default:
      return [`${actor} performed ${display(String(event.action).replace(/^TICKET\./, '').replaceAll('.', ' ')).toLowerCase()}.`,
        ...(typeof before === 'string' || typeof after === 'string' ? [`${label(before)} → ${label(after)}`] : [])];
  }
}

function TicketView({
  mode,
  detail,
  options,
  request,
  onError,
  onNotice,
  refresh,
  canEdit,
  canAssign,
  canReview,
  reviewing,
  viewerId,
  viewerName,
  canDecideApproval,
  intern,
  canRespondHelp,
}: {
  mode: Mode;
  detail: TicketDetail;
  options: Options;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  onError: (value: string) => void;
  onNotice: (value: string) => void;
  refresh: () => void;
  canEdit: boolean;
  canAssign: boolean;
  canReview: boolean;
  reviewing: boolean;
  viewerId: string;
  viewerName: string;
  canDecideApproval: boolean;
  intern: boolean;
  canRespondHelp: boolean;
}) {
  const ticket = detail.ticket;
  const commentQuery = useSearchParams();
  const commentPath = usePathname();
  const composeType = commentQuery.get('compose') === 'internal-note' ? 'INTERNAL' : commentQuery.get('compose') === 'public-reply' ? 'PUBLIC' : undefined;
  const backQuery = new URLSearchParams(commentQuery.toString());backQuery.delete('compose');
  const backHref = commentPath + (backQuery.size ? '?'+backQuery : '');
  const composeHref = (type:'internal-note'|'public-reply') => commentPath+'?'+new URLSearchParams({...Object.fromEntries(backQuery),compose:type});
  const ticketStatus = String(ticket.status);
  const awaitingReview = ticketStatus === 'RESOLVED';
  const canChangeStatus = canEdit &&
    (canReview || (ticket.assigned_user_id === viewerId &&
      !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticketStatus)));
  const canChangeFields = canChangeStatus && !intern;
  const statusOptions = options.statuses.filter((status) =>
    canReview || !['CLOSED', 'CANCELLED'].includes(status),
  );
  const assignees = useTicketAssignees(
    canAssign ? String(ticket.client_id ?? '') : '',
    String(ticket.site_id ?? ''),
    request,
  );
  const [assignee, setAssignee] = useState(
    initialTicketTechnician(ticket.assigned_user_id, viewerId),
  );
  const selectedAssignee = assignees.items.some((item) => item.id === assignee) ? assignee : '';
  const displayedAssignees = technicianOptions(assignees.items, { id: viewerId, displayName: viewerName }, ticket.assigned_user_id ? { id: String(ticket.assigned_user_id), name: String(ticket.assigned_name ?? 'Assigned technician') } : undefined);
  const [transferReason, setTransferReason] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [directory, setDirectory] = useState<Row[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [departments, setDepartments] = useState<Row[]>([]);
  const [helpPerson, setHelpPerson] = useState('');
  const [helpDepartment, setHelpDepartment] = useState('');
  const [expertiseNeeded, setExpertiseNeeded] = useState('');
  const [attachmentVisibility, setAttachmentVisibility] = useState('INTERNAL');
  const base = `/tickets/${ticket.id}`;
  useEffect(() => {
    void Promise.all([
      request('/internal/directory'),
      request('/internal/departments'),
    ])
      .then(([people, teams]) => {
        setDirectory(people as Row[]);
        setDepartments(teams as Row[]);
        setDirectoryStatus('ready');
      })
      .catch(() => setDirectoryStatus('error'));
  }, [request]);
  async function mutate(
    path: string,
    body: Row,
    success: string,
    method = 'POST',
  ) {
    setBusy(true);
    onError('');
    onNotice('');
    try {
      await request(path, { method, body: JSON.stringify(body) });
      onNotice(success);
      refresh();
      return true;
    } catch (reason) {
      onError((reason as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onError('Attachments must be 5 MB or smaller.');
      return;
    }
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Unable to read attachment.'));
      reader.readAsDataURL(file);
    });
    await mutate(
      `${base}/attachments`,
      {
        fileName: file.name,
        contentType: file.type || 'text/plain',
        contentBase64,
        visibility: attachmentVisibility,
      },
      'Attachment added.',
    );
  }
  const timeline = useMemo<(Row & { eventKind: string; sort: string })[]>(
    () =>
      [
        ...detail.comments.map((item) => ({
          ...item,
          eventKind: 'comment',
          sort: String(item.created_at),
        })),
        ...detail.history.map((item) => ({
          ...item,
          eventKind: 'history',
          sort: String(item.created_at),
        })),
      ].sort((a, b) => a.sort.localeCompare(b.sort)),
    [detail],
  );
  if(composeType) return canEdit && !(intern && composeType==='PUBLIC')
    ? <TicketCommentPage key={String(ticket.id)+composeType} ticketId={String(ticket.id)} ticketNumber={String(ticket.ticket_number)} subject={String(ticket.subject)} type={composeType} backHref={backHref} request={request}/>
    : <section className="panel"><h2>Cannot add this reply</h2><p>This account does not have permission to add {composeType==='INTERNAL'?'internal notes':'public replies'} to this ticket.</p><Link className="secondary" href={backHref}>Back to ticket</Link></section>;
  return (
    <>
      <Heading
        eyebrow={`${ticket.ticket_number} / ${String(ticket.source_name ?? sourceLabels[String(ticket.source)] ?? display(ticket.source))}`}
        title={String(ticket.subject)}
        detail={`${ticket.client_name} · ${ticket.requester_name}`}
        action={
          <Link className="secondary" href={reviewing ? ticketReviewPath(mode) : ticketListPath(mode)}>
            {reviewing ? '← Back to review queue' : '← Back to tickets'}
          </Link>
        }
      />
      {!canEdit ? (
        <div className="notice">
          {mode === 'admin'
            ? 'Read-only ticket record for administration oversight.'
            : 'Read-only team ticket. You can review its details and activity because it belongs to one of your assigned sites.'}
        </div>
      ) : null}
      {awaitingReview && <div className="notice">Resolved. Waiting for review and closure.</div>}
      <TicketInformation ticket={ticket} history={detail.history} />
      {canAssign && !ticket.assigned_user_id ? (
        <div className="panel ticket-claim-panel">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void mutate(`${base}/claim`, {}, 'Ticket claimed.')}
          >
            Claim ticket
          </button>
        </div>
      ) : null}
      <fieldset
        className="ticket-read-scope"
        disabled={!canEdit && !canRespondHelp && mode !== 'admin'}
      >
        <div className="ticket-detail-grid">
          <div className="ticket-main-column">
            <section className="panel ticket-summary">
              <div className="ticket-summary-heading">
                <div className="ticket-badges">
                  <TicketBadge kind="status" value={String(ticket.status)} />
                  <TicketBadge kind="priority" value={String(ticket.priority)} />
                  {ticket.approval_status !== 'NOT_REQUIRED' ? (
                    <TicketBadge
                      kind="approval"
                      value={String(ticket.approval_status)}
                    />
                  ) : null}
                </div>
                {canReview ? (
                  <TicketQaCheck
                    ticket={ticket}
                    history={detail.history.map(event => ({
                      ...event,
                      summary: describeTicketActivity(event, ticket).join(' '),
                    }))}
                    request={request}
                    onSaved={refresh}
                  />
                ) : null}
              </div>
              <TicketTags tags={ticket.tags} />
              <p>{String(ticket.description)}</p>
              <small>
                Created {formatDate(ticket.created_at)} by{' '}
                {String(ticket.created_by_name ?? 'Email intake')}
              </small>
            </section>
            {canEdit ? <section className="panel ticket-comment-entry"><h2>Notes and replies</h2><p>Open a separate page to add an internal note or save a public reply.</p><div className="ticket-comment-links"><Link className="secondary" href={composeHref('internal-note')}>Internal note</Link>{intern?<button className="secondary" disabled>Public reply</button>:<Link className="primary" href={composeHref('public-reply')}>Public reply</Link>}</div></section>:null}
            <section className="panel">
              <div className="section-heading">
                <h2>Activity timeline</h2>
                <span className="hint">{timeline.length} events</span>
              </div>
              <div className="timeline">
                {timeline.length ? (
                  timeline.map((event, index) =>
                    event.eventKind === 'comment' ? (
                      <article
                        className={`timeline-item comment ${String(event.comment_type).toLowerCase()}`}
                        key={`c-${event.id}`}
                      >
                        <span className="timeline-dot" />
                        <div>
                          <div className="timeline-meta">
                            <strong>
                              {event.comment_type === 'INTERNAL'
                                ? 'Internal note'
                                : 'Public reply'}
                            </strong>
                            <span>
                              {String(event.author_name)} ·{' '}
                              {formatDate(event.created_at)}
                            </span>
                          </div>
                          <p>{String(event.body)}</p>
                        </div>
                      </article>
                    ) : (
                      <article
                        className="timeline-item history"
                        key={`h-${event.id}-${index}`}
                      >
                        <span className="timeline-dot" />
                        <div>
                          <div className="timeline-meta">
                            <strong>{display(event.action)}</strong>
                            <span>
                              {String(event.actor_name || 'System')} ·{' '}
                              {formatDate(event.created_at)}
                            </span>
                          </div>
                          {describeTicketActivity(event, ticket).map((line, lineIndex) => (
                            <p key={lineIndex}>{line}</p>
                          ))}
                          {event.reason ? <p>{String(event.reason)}</p> : null}
                        </div>
                      </article>
                    ),
                  )
                ) : (
                  <p className="empty">No activity yet.</p>
                )}
              </div>
            </section>
          </div>
          <aside className="ticket-side-column">
            <ExpandablePanel title="Collaboration & help" className="">
              <p className="hint">
                Ask a specialist or department to join this ticket. Accepting
                the request adds that person as a collaborator without exposing
                other tickets.
              </p>
              {canEdit ? (
                <>
                  <label>
                    Specialist
                    <select
                      aria-label="Specialist"
                      aria-describedby="specialist-directory-hint"
                      value={helpPerson}
                      disabled={directoryStatus !== 'ready'}
                      onChange={(e) => setHelpPerson(e.target.value)}
                    >
                      <option value="">Select a person</option>
                      {directory.map((x) => (
                        <option key={String(x.id)} value={String(x.id)}>
                          {String(x.name)}
                          {x.expertise ? ` · ${String(x.expertise)}` : ''}
                        </option>
                      ))}
                    </select>
                    <small id="specialist-directory-hint" className="hint">
                      Existing active staff appear automatically. Department and
                      expertise assignments are optional for person requests.
                    </small>
                    {directoryStatus === 'loading' ? (
                      <small className="hint" role="status">
                        Loading active specialists…
                      </small>
                    ) : null}
                    {directoryStatus === 'error' ? (
                      <p className="notice error" role="alert">
                        The staff directory could not be loaded. Refresh the
                        ticket to try again.
                      </p>
                    ) : null}
                    {directoryStatus === 'ready' && !directory.length ? (
                      <p className="hint">
                        No other active staff are available. An administrator
                        can add or activate staff in Administration → Users.
                      </p>
                    ) : null}
                  </label>
                  <label>
                    Or department
                    <select
                      value={helpDepartment}
                      onChange={(e) => setHelpDepartment(e.target.value)}
                    >
                      <option value="">Select a department</option>
                      {departments.map((x) => (
                        <option key={String(x.id)} value={String(x.id)}>
                          {String(x.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Expertise or help needed
                    <textarea
                      rows={3}
                      value={expertiseNeeded}
                      onChange={(e) => setExpertiseNeeded(e.target.value)}
                      placeholder="Describe the exact skill, review or action needed."
                    />
                  </label>
                  <button
                    className="secondary full"
                    disabled={
                      busy ||
                      (!helpPerson && !helpDepartment) ||
                      expertiseNeeded.trim().length < 3
                    }
                    onClick={async () => {
                      const ok = await mutate(
                        `/internal/tickets/${String(ticket.id)}/help`,
                        {
                          requestedUserId: helpPerson || undefined,
                          departmentId: helpDepartment || undefined,
                          expertiseNeeded,
                        },
                        'Help request sent.',
                      );
                      if (ok) {
                        setHelpPerson('');
                        setHelpDepartment('');
                        setExpertiseNeeded('');
                      }
                    }}
                  >
                    Request help
                  </button>
                </>
              ) : null}
              {detail.collaborators?.map((x) => (
                <p className="collaborator" key={String(x.user_id)}>
                  <strong>{String(x.name)}</strong>
                  <small>{String(x.reason)}</small>
                </p>
              ))}
              {detail.helpRequests?.map((x) => (
                <article className="help-request" key={String(x.id)}>
                  <strong>
                    {String(x.requested_user ?? x.department_name)}
                  </strong>
                  <small>
                    {String(x.expertise_needed)} · {display(x.status)}
                  </small>
                  {x.status === 'PENDING' && canRespondHelp ? (
                    <div>
                      <button
                        className="text-button"
                        onClick={() =>
                          void mutate(
                            `/internal/tickets/${String(ticket.id)}/help/${String(x.id)}`,
                            { status: 'ACCEPTED', note: 'Accepted' },
                            'Help request accepted.',
                            'PATCH',
                          )
                        }
                      >
                        Accept
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void mutate(
                            `/internal/tickets/${String(ticket.id)}/help/${String(x.id)}`,
                            { status: 'DECLINED', note: 'Declined' },
                            'Help request declined.',
                            'PATCH',
                          )
                        }
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </ExpandablePanel>
            {canChangeStatus ? (
              <ExpandablePanel title="Ticket controls" className="">
                <label>
                  Status
                  <select
                    value={ticketStatus}
                    disabled={busy}
                    onChange={(event) =>
                      void mutate(
                        base,
                        { status: event.target.value },
                        event.target.value === 'RESOLVED' ? 'Ticket resolved and sent to the review queue.' : 'Status updated.',
                        'PATCH',
                      )
                    }
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status] ?? display(status)}
                      </option>
                    ))}
                  </select>
                </label>
                {canChangeFields ? (
                  <>
                    <label>
                      Priority
                      <select
                        value={String(ticket.priority)}
                        onChange={(event) =>
                          void mutate(
                            base,
                            { priority: event.target.value },
                            'Priority updated.',
                            'PATCH',
                          )
                        }
                      >
                        {options.priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priorityLabels[priority] ?? display(priority)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Select
                      label="Category"
                      value={String(ticket.category_id ?? '')}
                      onChange={(value) => {
                        if (value)
                          void mutate(
                            base,
                            { categoryId: value },
                            'Category updated.',
                            'PATCH',
                          );
                      }}
                      options={options.categories}
                    />
                  </>
                ) : null}
              </ExpandablePanel>
            ) : null}
            <ExpandablePanel
              title="Tags"
              className="ticket-tag-panel"
              defaultOpen
            >
              {canChangeFields ? (
                <TicketTagEditor
                  key={JSON.stringify(ticket.tags ?? [])}
                  tags={ticket.tags}
                  options={options.tags}
                  disabled={busy}
                  onSave={(tagIds) =>
                    mutate(base, { tagIds }, 'Ticket tags updated.', 'PATCH')
                  }
                />
              ) : (
                <TicketTags tags={ticket.tags} />
              )}
            </ExpandablePanel>
            <ExpandablePanel
              title="SLA"
              className="ticket-sla-summary"
              defaultOpen
            >
              <span
                className={`sla-pill sla-${String(ticket.sla_status ?? 'not_tracked').toLowerCase()}`}
              >
                {display(ticket.sla_status ?? 'NOT_TRACKED')}
              </span>
              <dl>
                <div>
                  <dt>Response due</dt>
                  <dd>
                    {ticket.response_due_at
                      ? formatDate(ticket.response_due_at)
                      : 'Not tracked'}
                  </dd>
                </div>
                <div>
                  <dt>Resolution due</dt>
                  <dd>
                    {ticket.resolution_due_at
                      ? formatDate(ticket.resolution_due_at)
                      : 'Not tracked'}
                  </dd>
                </div>
              </dl>
              {ticket.paused_at ? (
                <p className="hint">
                  Clock paused {formatDate(ticket.paused_at)}. It resumes when
                  the ticket leaves Waiting or On hold.
                </p>
              ) : null}
            </ExpandablePanel>
            {canAssign ? (
              <ExpandablePanel title="Assignment" className="">
                <Select
                  label="Technician"
                  value={assignee}
                  onChange={setAssignee}
                  options={displayedAssignees}
                  disabled={assignees.loading || !!assignees.error}
                />
                {assignees.error ? (
                  <p role="alert" className="hint">{assignees.error}</p>
                ) : !assignees.loading && !assignees.items.length ? (
                  <p className="hint">No eligible team members for this client and site.</p>
                ) : null}
                <label>
                  Transfer reason
                  <textarea
                    rows={3}
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.target.value)}
                    placeholder="Required when transferring"
                  />
                </label>
                <button
                  className="primary full"
                  disabled={
                    busy || !selectedAssignee || selectedAssignee === ticket.assigned_user_id
                  }
                  onClick={() =>
                    void mutate(
                      `${base}/assign`,
                      {
                        assignedUserId: selectedAssignee,
                        reason: transferReason || undefined,
                      },
                      ticket.assigned_user_id
                        ? 'Ticket transferred.'
                        : 'Ticket assigned.',
                    )
                  }
                >
                  {ticket.assigned_user_id
                    ? 'Transfer ticket'
                    : 'Assign ticket'}
                </button>
              </ExpandablePanel>
            ) : null}
            {canEdit && !intern ? (
              <ExpandablePanel title="Approval" className="">
                {ticket.approval_status === 'PENDING' ? (
                  <>
                    <p className="hint">A management decision is pending.</p>
                    {canDecideApproval ? (
                      <div className="approval-actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              `${base}/approval/decision`,
                              {
                                decision: 'APPROVED',
                                note: 'Approved by management',
                              },
                              'Approval granted.',
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          className="danger-button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              `${base}/approval/decision`,
                              {
                                decision: 'REJECTED',
                                note: 'Rejected by management',
                              },
                              'Approval rejected.',
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <label>
                      Reason
                      <textarea
                        rows={3}
                        value={approvalReason}
                        onChange={(event) =>
                          setApprovalReason(event.target.value)
                        }
                        placeholder="Why is approval required?"
                      />
                    </label>
                    <button
                      className="secondary full"
                      disabled={busy || approvalReason.trim().length < 3}
                      onClick={() =>
                        void mutate(
                          `${base}/approval`,
                          { reason: approvalReason },
                          'Approval requested.',
                        )
                      }
                    >
                      Request approval
                    </button>
                  </>
                )}
              </ExpandablePanel>
            ) : null}
            {canEdit ? (
              <ExpandablePanel title="Attachments" className="">
                <label>
                  File visibility
                  <select
                    value={attachmentVisibility}
                    onChange={(e) => setAttachmentVisibility(e.target.value)}
                  >
                    <option value="INTERNAL">Staff only</option>
                    <option value="PUBLIC">Visible in the client portal</option>
                  </select>
                </label>
                <label className="file-button">
                  Add file
                  <input
                    type="file"
                    accept=".pdf,.zip,.docx,.xlsx,.csv,.txt,.log,.gif,.jpg,.jpeg,.png"
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                </label>
                <p className="hint">
                  Allowed office files, PDFs, images, text and ZIP. Maximum 5
                  MB.
                </p>
                {detail.attachments.map((file) => (
                  <a
                    className="attachment"
                    key={String(file.id)}
                    href={`/api/tickets/${ticket.id}/attachments/${file.id}`}
                  >
                    <strong>{String(file.file_name)}</strong>
                    <small>
                      {Math.ceil(Number(file.size_bytes) / 1024)} KB ·{' '}
                      {formatDate(file.created_at)} ·{' '}
                      {file.visibility === 'PUBLIC'
                        ? 'Client visible'
                        : 'Staff only'}
                    </small>
                  </a>
                ))}
              </ExpandablePanel>
            ) : null}
            <ExpandablePanel title="Details" className="ticket-facts">
              <dl>
                <dt>Client</dt>
                <dd>{String(ticket.client_name)}</dd>
                <dt>Requester</dt>
                <dd>
                  {String(ticket.requester_name)}
                  <small>{String(ticket.requester_email ?? '')}</small>
                </dd>
                <dt>Site</dt>
                <dd>{String(ticket.site_name ?? 'None')}</dd>
                {ticket.location_text ? (
                  <>
                    <dt>Location / project</dt>
                    <dd>{String(ticket.location_text)}</dd>
                  </>
                ) : null}
                <dt>Assigned to</dt>
                <dd>{String(ticket.assigned_name ?? 'Unassigned')}</dd>
                <dt>Source</dt>
                <dd>
                  {String(
                    ticket.source_name ??
                      sourceLabels[String(ticket.source)] ??
                      display(ticket.source),
                  )}
                </dd>
                <dt>Reference</dt>
                <dd>{String(ticket.source_reference_id ?? 'None')}</dd>
              </dl>
            </ExpandablePanel>
          </aside>
        </div>
      </fieldset>
    </>
  );
}
