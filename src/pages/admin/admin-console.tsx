import { hasFullAccess } from '../role-access';
import ProfileIdentity from '../profile-identity';
import { uiLabel } from '../ui-label';
'use client';
import WorkspaceNavigation from '../workspace-navigation';
import {
  extensionLinks,
  type NavigationLink,
} from '../workspace-navigation-data';
import { useSidebarScroll } from '../sidebar-scroll';
import { formatApiDate } from '../api-time';
import Link from '../../navigation/link';
import { useRouter, useSearchParams } from '../../navigation/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import BrandMark from '../brand-mark';
import NotificationCenter from '../notification-center';
import UiIcon, { type IconName } from '../ui-icon';
import RecordForm, { Row, RecordPicker } from './record-form';
import SiteDomains from './site-domains';
import ClientCsvTools from './client-csv-tools';
import PermissionWorkspace from './permission-workspace';
const sections: Record<string, string> = {
  overview: 'Overview',
  tickets: 'Tickets',
  sla: 'SLA Management',
  reports: 'Reports & Analytics',
  users: 'People & Permissions',
  clients: 'Clients',
  contacts: 'Contacts',
  sites: 'Sites',
  categories: 'Categories',
  tags: 'Tags',
  'audit-logs': 'Audit History',
};
const sectionIcons: Record<string, IconName> = {
  overview: 'dashboard',
  tickets: 'tickets',
  sla: 'sla',
  reports: 'reports',
  users: 'users',
  clients: 'clients',
  contacts: 'contacts',
  sites: 'sites',
  categories: 'categories',
  tags: 'tags',
  'audit-logs': 'audit',
};
interface Session {
  csrfToken: string;
  user: {
    id: string;
    displayName: string;
    roles: string[];
    workspace?: string;
    permissions?: string[];
  };
}
interface Page {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  activeStaff?: number | null;
  vendorDirectory?: boolean;
}
export default function AdminConsole({
  section = 'overview',
}: {
  section?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<Page>();
  const [counts, setCounts] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [clientFilter, setClientFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Row | null>();
  const editorRegion = useRef<HTMLElement>(null);
  const [editorOpenVersion, setEditorOpenVersion] = useState(0);
  const [domainSite, setDomainSite] = useState<Row>();
  const [deleting, setDeleting] = useState<Row | null>();
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [menu, setMenu] = useState(false);
  const [accessTab, setAccessTab] = useState<'role' | 'user' | 'people'>(
    'role',
  );
  const [roleActionTarget, setRoleActionTarget] = useState<HTMLDivElement | null>(null);
  function openEditor(record: Row | null) {
    setError(''); setNotice(''); setDomainSite(undefined);
    if (section === 'users') setAccessTab('people');
    setEditor(record); setEditorOpenVersion(value => value + 1);
  }
  useEffect(() => {
    if (editor === undefined || (section === 'users' && accessTab !== 'people')) return;
    const region = editorRegion.current;
    if (!region) return;
    region.scrollIntoView({ block: 'start', behavior: 'auto' });
    region.focus({ preventScroll: true });
  }, [editor, editorOpenVersion, section, accessTab]);
  const request = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const response = await fetch(`/api${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(session ? { 'x-csrf-token': session.csrfToken } : {}),
          ...init?.headers,
        },
      });
      if (response.status === 401) {
        setSession(undefined);
        throw new Error('Your session has expired. Sign in again.');
      }
      if (response.status === 403) {
        const failure = await response.json().catch(() => undefined) as
          | { error?: { message?: string } }
          | undefined;
        throw new Error(
          failure?.error?.message ??
            'This action was denied. Refresh the page to check your current access and try again.',
        );
      }
      if (path === '/users/resolve' && response.status === 503)
        throw new Error(
          'Azure lookup is unavailable. Check the Graph permission and admin consent, then retry.',
        );
      if (path === '/users/resolve' && response.status === 404)
        throw new Error(
          'No matching Azure user was found. Check the work email or exact Entra UPN.',
        );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Request failed. Please retry.');
      return body;
    },
    [session],
  );
  useEffect(() => {
    let live = true;
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? 'Sign in to open administration.'
              : 'Unable to check access. Please reload.',
          );
        const me = (await response.json()) as Session;
        const sectionPermissions: Record<string, string> = {
          categories: 'CATEGORY_MANAGE',
          clients: 'CLIENTS_MANAGE',
          contacts: 'CONTACTS_MANAGE',
          sites: 'SITES_MANAGE',
          tags: 'TAGS_MANAGE',
          'audit-logs': 'AUDIT_VIEW',
        };
        const permitted =
          sectionPermissions[section] &&
          me.user.permissions?.includes(sectionPermissions[section]);
        if (!hasFullAccess(me.user.roles) && !permitted)
          throw new Error('You do not have access to this configuration area.');
        if (live) setSession(me);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [section]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      setData(undefined);
      const path =
        section === 'overview'
          ? '/admin/audit-logs?pageSize=6'
          : `/admin/${section}?page=${page}&q=${encodeURIComponent(search)}&status=${status}${clientFilter ? `&clientId=${clientFilter}` : ''}${section === 'clients' ? '&customersOnly=true' : ''}`;
      void Promise.all([
        request(path),
        section === 'overview'
          ? request('/admin/overview')
          : Promise.resolve({}),
      ])
        .then(([records, summary]) => {
          if (live) {
            setData(records as Page);
            setCounts(summary as Row);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [session, request, section, page, search, status, clientFilter, revision]);
  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteRecord() {
    if (!deleting || !session) return;
    try {
      const result = (await request(`/admin/${section}/${deleting.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      })) as { deleted?: boolean; deactivated?: boolean };
      setDeleting(undefined);
      setDeleteConfirmation('');
      setNotice(
        result.deactivated
          ? section === 'sites'
            ? 'Site deactivated. Its linked records were retained.'
            : 'Contact is referenced by retained history and was deactivated.'
          : 'Record permanently deleted.',
      );
      setRevision(revision + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const title = sections[section] ?? 'Administration';
  const sidebarScroll = useSidebarScroll(section, Boolean(session));
  const isAdministrator = hasFullAccess(session?.user.roles) ?? false;
  // Workspace controls presentation only; existing access checks remain authoritative.
  const managementSection = ['categories', 'tags', 'audit-logs'].includes(section);
  const inManagementWorkspace = managementSection &&
    (searchParams.get('workspace') === 'management' ||
      (!searchParams.has('workspace') && session?.user.workspace === 'management'));
  const selectedWorkspace = inManagementWorkspace ? 'management' : 'admin';
  const workspaceLabel = inManagementWorkspace ? 'Management' : 'Administration';
  const allowed = (permission: string) => isAdministrator || session?.user.permissions?.includes(permission);
  const managementLinks: NavigationLink[] = [
    ['/management', 'dashboard', 'Dashboard'],
    ['/management/tickets', 'tickets', 'Tickets'],
    ['/changes', 'change', 'Change Management'],
    ...(allowed('SLA_MANAGE') || session?.user.roles.includes('TEAM_LEAD') ? [['/management/sla', 'sla', 'SLA Management'] as NavigationLink] : []),
    ...(allowed('REPORTS_VIEW') ? [['/management/reports', 'reports', 'Reports & Analytics'] as NavigationLink] : []),
    ...(allowed('CATEGORY_MANAGE') ? [['/admin/categories', 'categories', 'Categories'] as NavigationLink] : []),
    ...(allowed('TAGS_MANAGE') ? [['/admin/tags', 'tags', 'Tags'] as NavigationLink] : []),
    ...(allowed('AUDIT_VIEW') ? [['/admin/audit-logs', 'audit', 'Audit History'] as NavigationLink] : []),
    ...extensionLinks(session?.user),
  ];
  const sectionPermissions: Record<string, string> = {
    categories: 'CATEGORY_MANAGE',
    clients: 'CLIENTS_MANAGE',
    contacts: 'CONTACTS_MANAGE',
    sites: 'SITES_MANAGE',
    tags: 'TAGS_MANAGE',
    'audit-logs': 'AUDIT_VIEW',
  };
  const navigationSections = Object.fromEntries(
    Object.entries(sections).filter(
      ([key]) =>
        isAdministrator ||
        session?.user.permissions?.includes(
          sectionPermissions[key] ?? '__ADMIN_ONLY__',
        ),
    ),
  );
  return (
    <div className="admin-shell">
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
          {workspaceLabel.toUpperCase()}
        </p>
        <nav ref={sidebarScroll} aria-label={workspaceLabel}>
          <WorkspaceNavigation
            workspace={selectedWorkspace}
            links={inManagementWorkspace ? managementLinks : [
              ...Object.entries(navigationSections).map(
                ([key, label]): NavigationLink => [
                  key === 'overview' ? '/admin' : `/admin/${key}`,
                  sectionIcons[key] ?? 'dashboard',
                  label,
                ],
              ),
              ...(isAdministrator
                ? [
                    [
                      '/changes',
                      'change',
                      'Change Management',
                    ] as NavigationLink,
                  ]
                : []),
              ...extensionLinks(session?.user),
            ]}
            activeHref={section === 'overview' ? '/admin' : `/admin/${section}`}
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
            {workspaceLabel} <span>/</span>{' '}
            {title}
          </span>
          <div className="profile">
            {session ? <ProfileIdentity name={session.user.displayName} /> : <span>ASTRA</span>}
            {session ? (
              <>
                <NotificationCenter
                  csrfToken={session.csrfToken}
                  ticketBase={inManagementWorkspace ? "/management/ticket" : "/admin/ticket"}
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
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                WORKSPACE / {section === 'overview' ? 'HOME' : 'CONFIGURATION'}
              </p>
              <h1>
                {section === 'overview' ? 'Administration overview' : title}
              </h1>
              <p>
                {section === 'overview'
                  ? 'Manage your people, clients and infrastructure.'
                  : section === 'audit-logs'
                    ? 'Review who changed what and when.'
                    : section === 'categories'
                      ? 'Classify tickets for routing, filtering and reports—for example Microsoft 365 → Outlook.'
                      : section === 'users'
                        ? 'Manage people, role permissions and individual access.'
                        : 'Manage records and keep your service desk up to date.'}
              </p>
            </div>
            {session && section === 'users' && accessTab === 'role' ? <div className="role-heading-action" ref={setRoleActionTarget} /> : null}
            {session &&
            section !== 'overview' &&
            section !== 'audit-logs' &&
            editor === undefined &&
            (section !== 'users' || accessTab === 'people') ? (
              <button type="button" className="primary" onClick={() => openEditor(null)}>
                + Add {section === 'users' ? 'user' : 'record'}
              </button>
            ) : null}
          </div>
          {error ? (
            <div role="alert" className="notice error">
              {error}{' '}
              {!session ? (
                <Link href="/">Sign in</Link>
              ) : (
                <button onClick={() => setRevision(revision + 1)}>Retry</button>
              )}
            </div>
          ) : null}
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          {section === 'sites' && isAdministrator && domainSite ? (
            <SiteDomains
              key={String(domainSite.id)}
              site={
                data?.items.find((row) => row.id === domainSite.id) ??
                domainSite
              }
              request={request}
              revision={revision}
              onClose={() => setDomainSite(undefined)}
              onChanged={() => setRevision((value) => value + 1)}
            />
          ) : null}
          {section === 'sites' && isAdministrator && !domainSite ? (
            <p className="site-domain-help">
              Create or select a customer site, then choose{' '}
              <strong>Domains</strong> to add its email domains. Verified portal
              cases route to that site and appear in Tickets with the customer’s
              automatic ticket number.
            </p>
          ) : null}
          {session && section === 'users' ? (
            <>
              <div
                className="access-tabs"
                role="tablist"
                aria-label="People and permissions"
              >
                {(
                  [
                    ['role', 'Role Permissions'],
                    ['user', 'User Permissions'],
                    ['people', 'People'],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={accessTab === tab}
                    aria-controls="access-tab-panel"
                    id={`access-tab-${tab}`}
                    onClick={() => {
                      if (tab === accessTab) return;
                      if (
                        !window.dispatchEvent(
                          new Event('astra-permission-navigation', {
                            cancelable: true,
                          }),
                        )
                      )
                        return;
                      setAccessTab(tab);
                      setEditor(undefined);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                id="access-tab-panel"
                role="tabpanel"
                aria-labelledby={`access-tab-${accessTab}`}
              >
                {accessTab !== 'people' ? (
                  <PermissionWorkspace
                    key={accessTab}
                    mode={accessTab}
                    request={request}
                    addRoleTarget={roleActionTarget}
                  />
                ) : (
                  <p className="access-people-hint">
                    Manage accounts, roles, customer/site assignments,
                    departments and Change Management access. Use Role
                    Permissions or User Permissions for feature access.
                  </p>
                )}
              </div>
            </>
          ) : null}
          {session &&
          editor !== undefined &&
          (section !== 'users' || accessTab === 'people') ? (
            <section ref={editorRegion} tabIndex={-1} aria-label={editor ? 'Edit record' : 'Add record'} style={{ scrollMarginTop: 90 }}>
            <RecordForm
              key={String(editor?.id ?? 'new')}
              resource={section}
              isAdmin={isAdministrator}
              record={editor ?? undefined}
              request={request}
              onCancel={() => setEditor(undefined)}
              onSaved={() => {
                setEditor(undefined);
                setNotice('Changes saved.');
                setRevision(revision + 1);
              }}
            />
            </section>
          ) : null}
          {session && isAdministrator && section === 'sites' && <ClientCsvTools request={request} search={search} status={status} msp={clientFilter} onSaved={() => setRevision(value => value + 1)} />}
          {loading && (section !== 'users' || accessTab === 'people') ? (
            <p role="status" className="notice">
              Loading {title.toLowerCase()}…
            </p>
          ) : null}
          {session && section === 'overview' && data ? (
            <>
              <div className="stats">
                {['tickets', 'users', 'clients', 'sites'].map((key, index) => (
                  <Link className="stat" href={`/admin/${key}`} key={key}>
                    <span className={`stat-icon tone-${index}`}>
                      <UiIcon
                        name={
                          (
                            [
                              'tickets',
                              'users',
                              'clients',
                              'sites',
                            ] as IconName[]
                          )[index]
                        }
                      />
                    </span>
                    <div>
                      <span>{sections[key]}</span>
                      <strong>{String(counts[key] ?? '—')}</strong>
                      <small>View records →</small>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Recent activity</h2>
                    <Link href="/admin/audit-logs">View history →</Link>
                  </div>
                  <AuditTable rows={data.items} />
                </section>
                <section className="panel">
                  <h2>Workspace setup</h2>
                  <p className="hint">
                    Maintain the records your support team relies on.
                  </p>
                  {['clients', 'users', 'sites', 'categories'].map((key, i) => (
                    <Link
                      key={key}
                      className="setup-link"
                      href={`/admin/${key}`}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{sections[key]}</strong>
                        <small>
                          {
                            [
                              'Organisations you support',
                              'Verified identities and access',
                              'Client locations',
                              'Ticket classification',
                            ][i]
                          }
                        </small>
                      </div>
                      →
                    </Link>
                  ))}
                </section>
              </div>
            </>
          ) : null}
          {session &&
          section !== 'overview' &&
          editor === undefined &&
          (section !== 'users' || accessTab === 'people') ? (
            <section className="panel">
              <div className="toolbar">
                <label className="search">
                  Search {title.toLowerCase()}
                  <input
                    type="search"
                    placeholder={
                      section === 'audit-logs'
                        ? 'Search action, actor or record…'
                        : 'Search records…'
                    }
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                {section !== 'audit-logs' ? (
                  <label>
                    Status
                    <select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All records</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                ) : null}
                {['users', 'contacts', 'sites', 'assets'].includes(section) ? (
                  <RecordPicker
                    resource="clients"
                    label="Filter by MSP"
                    searchable={false}
                    emptyLabel="All MSPs"
                    value={clientFilter}
                    onChange={(value) => {
                      setClientFilter(value);
                      setPage(1);
                    }}
                    request={request}
                    optional
                  />
                ) : null}
              </div>
              {data ? (
                <>
                  {section === 'users' && clientFilter && typeof data.activeStaff === 'number' && (
                    <p className="hint" role="status">
                      {data.activeStaff} active staff {data.activeStaff === 1 ? 'account' : 'accounts'}{' '}
                      {data.vendorDirectory ? 'across Amnikon' : 'for this client'}
                    </p>
                  )}
                  {section === 'audit-logs' ? (
                    <AuditTable rows={data.items} />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            {section === 'clients' && <th scope="col">Primary email</th>}
                            <th>
                              {section === 'users'
                                ? 'Roles / client access'
                                : 'Details'}
                            </th>
                            <th>Status</th>
                            {section === 'sites' && isAdministrator ? (
                              <th>Email domains</th>
                            ) : null}
                            <th>
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((row) => (
                            <tr key={String(row.id)}>
                              <td>
                                <strong>{String(row.name ?? row.display_name ?? row.email ?? 'Unnamed record')}</strong>
                                {section !== 'clients' && (
                                  <small>
                                    {String(row.email ?? row.primary_email ?? '')}
                                  </small>
                                )}
                              </td>
                              {section === 'clients' && (
                                <td>{String(row.primary_email ?? '').trim() || 'Not set'}</td>
                              )}
                              <td>
                                {section === 'users' ? (
                                  <>
                                    {row.custom_role_name ? String(row.custom_role_name) : (row.roles as string[]).map(role => uiLabel(role)).join(', ')}
                                    <small>
                                      {(row.client_ids as string[]).length}{' '}
                                      client memberships ·{' '}
                                      {(row.site_ids as string[]).length} site
                                      memberships ·{' '}
                                      {(row.permissions as string[]).length}{' '}
                                      permissions
                                    </small>
                                  </>
                                ) : section === 'sites' ? (
                                  <>
                                    <span>{String(row.client_name)}</span>
                                    <small>
                                      Ticket prefix:{' '}
                                      {String(row.ticket_prefix ?? '—')}
                                    </small>
                                  </>
                                ) : (
                                  String(
                                    row.client_name ??
                                      row.asset_type ??
                                      row.description ??
                                      row.primary_phone ??
                                      '—',
                                  )
                                )}
                              </td>
                              <td>
                                <span
                                  className={`badge ${row.active === false || row.status === 'INACTIVE' ? 'inactive' : ''}`}
                                >
                                  {row.active === false ||
                                  row.status === 'INACTIVE'
                                    ? 'Inactive'
                                    : 'Active'}
                                </span>
                              </td>
                              {section === 'sites' && isAdministrator ? (
                                <td>
                                  <div className="site-domain-chips">
                                    {(
                                      (row.email_domains as {
                                        id: string;
                                        domain: string;
                                        active: boolean;
                                      }[]) ?? []
                                    ).map((domain) => (
                                      <span
                                        key={domain.id}
                                        className={
                                          domain.active ? '' : 'disabled'
                                        }
                                      >
                                        {domain.domain}
                                        {domain.active ? '' : ' · disabled'}
                                      </span>
                                    ))}
                                  </div>
                                  {!((row.email_domains as unknown[]) ?? [])
                                    .length ? (
                                    <small>No domains assigned</small>
                                  ) : null}
                                </td>
                              ) : null}
                              <td
                                className={
                                  section === 'sites'
                                    ? 'site-row-actions'
                                    : undefined
                                }
                              >
                                {section === 'sites' &&
                                isAdministrator &&
                                row.organization_type === 'CLIENT' ? (
                                  <button
                                    className="text-button"
                                    aria-label={`Manage domains for ${row.name}`}
                                    onClick={() => {
                                      setDomainSite(row);
                                      setEditor(undefined);
                                      setNotice('');
                                    }}
                                  >
                                    Domains
                                  </button>
                                ) : null}
                                {section === 'sites' && isAdministrator ? (
                                  <Link
                                    className="text-button"
                                    href={`/admin/tickets?clientId=${encodeURIComponent(String(row.client_id))}&siteId=${encodeURIComponent(String(row.id))}`}
                                    aria-label={`View tickets for ${row.name}`}
                                  >
                                    Tickets
                                  </Link>
                                ) : null}
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => openEditor(row)}
                                  aria-label={`Edit ${row.name ?? row.display_name ?? row.email ?? 'record'}`}
                                >
                                  {section === 'sites' ? 'Edit' : 'Edit →'}
                                </button>
                                <button
                                  className="text-button danger"
                                  onClick={() => {
                                    setError('');
                                    setDeleteConfirmation('');
                                    setDeleting(row);
                                  }}
                                  aria-label={`Delete ${row.name ?? row.display_name ?? row.email ?? 'record'}`}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!data.items.length ? (
                        <p className="empty">
                          No records found.{' '}
                          {search
                            ? 'Try another search.'
                            : 'Add a record to get started.'}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="pagination">
                    <span>
                      {data.total} records · Page {page} of{' '}
                      {Math.max(1, Math.ceil(data.total / data.pageSize))}
                    </span>
                    <div>
                      <button
                        className="secondary"
                        disabled={page === 1 || loading}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </button>
                      <button
                        className="secondary"
                        disabled={page * data.pageSize >= data.total || loading}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
          {deleting ? (
            <div className="modal-backdrop" role="presentation">
              <section
                className="delete-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-title"
              >
                <h2 id="delete-title">Delete {String(deleting.name)}?</h2>
                <p>
                  {section === 'contacts'
                    ? 'Unused contacts are permanently removed. A contact referenced by a ticket or change is deactivated so its history remains accurate.'
                    : section === 'sites'
                      ? 'Unused sites are permanently removed. A site with linked records is deactivated and its links are retained.'
                      : 'This permanently removes the record. Linked records must be removed first.'}
                </p>
                <label>
                  Type <strong>delete</strong> to confirm
                  <input
                    autoFocus
                    value={deleteConfirmation}
                    onChange={(event) =>
                      setDeleteConfirmation(event.target.value)
                    }
                  />
                </label>
                <div className="dialog-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setDeleting(undefined);
                      setDeleteConfirmation('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger-button"
                    disabled={
                      deleteConfirmation.trim().toLowerCase() !== 'delete'
                    }
                    onClick={() => void deleteRecord()}
                  >
                    {section === 'contacts' || section === 'sites'
                      ? 'Delete or deactivate'
                      : 'Permanently delete'}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </main>
        <footer>
          ASTRA Ticketing System <span>Identity & administration</span>
        </footer>
      </div>
    </div>
  );
}
function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Actor</th>
            <th>Time</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const action = String(row.action ?? '');
            const type = String(row.entity_type ?? '');
            const details = readAuditDetails(row.details);
            const actor = auditText(row.actor_name) ??
              (row.actor_user_id ? 'Unavailable user' :
                action === 'PORTAL.TICKET_SUBMITTED' ? 'Client support portal' : 'System');
            const record = auditText(details.ticketNumber) ?? auditText(details.name) ??
              auditText(details.title) ?? auditText(row.entity_name);
            const subject = auditText(details.subject) ?? auditText(row.ticket_subject);
            const assignedTo = auditText(auditObject(details.after)?.assignedUserId ?? details.assignedUserId);
            const isAssignment = ['TICKET.ASSIGNED', 'TICKET.TRANSFERRED'].includes(action);
            return (
              <tr key={String(row.id)}>
                <td>
                  <strong>{auditEventName(action, type)}</strong>
                  <small>{record ? [record, subject].filter(Boolean).join(' · ') : auditValue(type)}</small>
                  {isAssignment && assignedTo ? <small>{actor} assigned to {assignedTo}</small> : null}
                </td>
                <td>{actor}</td>
                <td>{formatApiDate(row.created_at)}</td>
                <td>
                  <details>
                    <summary>View details</summary>
                    <AuditDetails details={details} />
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length ? <p className="empty">No audit events found.</p> : null}
    </div>
  );
}

function auditObject(value: unknown): Row | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : undefined;
}

function readAuditDetails(value: unknown): Row {
  if (typeof value === 'string') {
    try { return auditObject(JSON.parse(value)) ?? {}; }
    catch { return {}; }
  }
  return auditObject(value) ?? {};
}

function auditText(value: unknown) {
  return typeof value === 'string' && value.trim() && auditValue(value) !== 'Unavailable record'
    ? value.trim() : undefined;
}

function auditLabel(key: string) {
  const labels: Record<string, string> = {
    client_ids: 'Client access',
    client_id: 'Client',
    site_id: 'Site',
    site_ids: 'Site access',
    tag_ids: 'Tags',
    assigned_user_id: 'Assigned technician',
    display_name: 'Display name',
    category_id: 'Category',
    assigned_to_user_id: 'Assigned technician',
    requester_contact_id: 'Requester',
    response_minutes: 'Response target (minutes)',
    resolution_minutes: 'Resolution target (minutes)',
    role_code: 'Role',
  };
  return (
    labels[key] ??
    key
      .replaceAll('_', ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function canonicalAuditKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function visibleAuditField(key: string) {
  const normalized = canonicalAuditKey(key);
  return ![
    'id',
    'created_at',
    'updated_at',
    'entra_tenant_id',
    'entra_object_id',
    'session_version',
    'phone',
    'primary_phone',
    'email',
    'primary_email',
    'requester_email',
    'verified_email',
    'domain_rule_id',
  ].includes(normalized);
}

function normalizeAuditObject(value: Row | undefined) {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => visibleAuditField(key))
      .map(([key, item]) => [canonicalAuditKey(key), item]),
  );
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value))
    return value.length ? value.map(auditValue).join(', ') : 'None';
  if (typeof value === 'object')
    return Object.entries(value as Row)
      .filter(([key]) => visibleAuditField(key))
      .map(([key, item]) => `${auditLabel(key)}: ${auditValue(item)}`)
      .join('; ');
  const text = String(value);
  if (/^\d{4}-\d\d-\d\d[T ]/.test(text)) return formatApiDate(text);
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
  )
    return 'Unavailable record';
  return /^[A-Z0-9_]+$/.test(text)
    ? text
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : text;
}

function AuditDetails({ details }: { details: Row }) {
  const before = normalizeAuditObject(auditObject(details.before));
  const after = normalizeAuditObject(auditObject(details.after));
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
  const entries = Object.entries(details).filter(([key, item]) =>
    key !== 'before' && key !== 'after' && item !== null && item !== '' && visibleAuditField(key),
  );
  return (
    <>
      {keys.length ? (
        <table className="audit-details">
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{auditLabel(key)}</td>
                <td>{auditChangeValue(key, before?.[key])}</td>
                <td>{auditChangeValue(key, after?.[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {entries.length ? (
        <dl className="audit-details">
          {entries.map(([key, item]) => (
            <div key={key}>
              <dt>{auditLabel(canonicalAuditKey(key))}</dt>
              <dd>{auditValue(item)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!keys.length && !entries.length ? <p>No additional details were recorded.</p> : null}
    </>
  );
}

function auditChangeValue(key: string, value: unknown) {
  if (value === undefined) return 'Not recorded';
  if (value === null && key === 'assigned_user_id') return 'Unassigned';
  return auditValue(value);
}

function auditEventName(action: string, type: string) {
  const directoryNames: Record<string, string> = {
    CLIENTS: 'Client', CONTACTS: 'Requester', SITES: 'Site', ASSETS: 'Asset',
    CATEGORIES: 'Category', TAGS: 'Tag', SOURCES: 'Ticket source', DEPARTMENTS: 'Department',
  };
  if (action === 'DIRECTORY.UPDATED' || action === 'DIRECTORY.DELETED')
    return `${directoryNames[type] ?? 'Record'} ${action === 'DIRECTORY.UPDATED' ? 'updated' : 'deleted'}`;
  const names: Record<string, string> = {
    'PORTAL.TICKET_SUBMITTED': 'Ticket submitted through client portal',
    'TICKET.CREATED': 'Ticket created',
    'TICKET.UPDATED': 'Ticket updated',
    'TICKET.STATUS_CHANGED': 'Ticket status changed',
    'TICKET.PRIORITY_CHANGED': 'Ticket priority changed',
    'TICKET.CATEGORY_CHANGED': 'Ticket category changed',
    'TICKET.TAGS_CHANGED': 'Ticket tags changed',
    'TICKET.ASSIGNED': 'Ticket assigned',
    'TICKET.TRANSFERRED': 'Ticket transferred',
    'TICKET.PUBLIC_REPLY_ADDED': 'Public reply added',
    'TICKET.INTERNAL_NOTE_ADDED': 'Internal note added',
    'TICKET.APPROVAL_REQUESTED': 'Ticket approval requested',
    'TICKET.APPROVAL_APPROVED': 'Ticket approved',
    'TICKET.APPROVAL_REJECTED': 'Ticket rejected',
    'TICKET.ATTACHMENT_ADDED': 'Ticket attachment added',
    'SLA_POLICY.UPDATED': 'SLA policy updated',
    'SLA_CALENDAR.CREATED': 'SLA calendar created',
    'SLA_CALENDAR.UPDATED': 'SLA calendar updated',
    'CONTACT.CREATED': 'Requester added',
    'USER.CREATED': 'User added',
    'USER.ACCESS_UPDATED': 'User access changed',
    'USER.DELETED': 'User deleted',
    'CATEGORY.CREATED': 'Category created',
    'CATEGORY.UPDATED': 'Category updated',
    'CATEGORY.DELETED': 'Category deleted',
    'TAG.CREATED': 'Tag created',
    'TAG.UPDATED': 'Tag updated',
    'TAG.DELETED': 'Tag deleted',
    'CLIENT.CREATED': 'Client created',
    'CLIENT.UPDATED': 'Client updated',
    'CLIENT.DELETED': 'Client deleted',
    'CONTACT.UPDATED': 'Requester updated',
    'CONTACT.DELETED': 'Requester deleted',
    'SITE.CREATED': 'Site created',
    'SITE.UPDATED': 'Site updated',
    'SITE.DELETED': 'Site deleted',
    'SITE.DEACTIVATED': 'Site deactivated',
  };
  if (names[action]) return names[action];
  const [entity, event] = action.split('.');
  return `${String(entity ?? '').replaceAll('_', ' ')} ${String(event ?? '').replaceAll('_', ' ')}`
    .toLowerCase()
    .replace(/^\w|\s\w/g, (letter) => letter.toUpperCase());
}
