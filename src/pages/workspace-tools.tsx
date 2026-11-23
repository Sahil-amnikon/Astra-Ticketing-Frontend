import { hasFullAccess } from './role-access';
import ProfileIdentity from './profile-identity';
'use client';
import { reviewedFetch } from './reviewed-fetch';
import Link from '../navigation/link';
import { usePathname, useRouter, useSearchParams } from '../navigation/hooks';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import BrandMark from './brand-mark';
import UiIcon, { type IconName } from './ui-icon';
import NotificationCenter from './notification-center';
import { useSidebarScroll } from './sidebar-scroll';
import WorkspaceNavigation from './workspace-navigation';
import { extensionLinks } from './workspace-navigation-data';

export interface WorkspaceUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions?: string[];
  changeAccess?: string;
  departmentIds?: string[];
  workScope?: string;
  workspace?: string;
}
export interface WorkspaceSession {
  user: WorkspaceUser;
  csrfToken: string;
}
export type ApiRequest = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;
export type Option = {
  id: string;
  name: string;
  client_id?: string;
  site_id?: string | null;
};
export function useWorkspace() {
  const [session, setSession] = useState<WorkspaceSession>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const csrf = useRef('');
  const request = useCallback<ApiRequest>(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await reviewedFetch(`/api${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          'x-csrf-token': csrf.current,
          ...init?.headers,
        },
        signal: init?.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          response.status === 401
            ? 'Your session expired. Sign in again.'
            : response.status === 403
              ? 'Your account does not have access to this action.'
              : (data?.error?.message ?? 'The requested service is unavailable. Please retry.'),
        );
      }
      return await response.json() as T;
    },
    [],
  );
  const refreshSession = useCallback(async () => {
    const next = await request<WorkspaceSession>('/auth/me');
    csrf.current = next.csrfToken;
    setSession(next);
    setError((current) => current === 'Your session expired. Sign in again.' ? '' : current);
    return next;
  }, [request]);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void refreshSession().catch((e) => { if (live) setError(e.message); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [refreshSession]);
  const save = async (path: string, body: unknown, method = 'POST') => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await refreshSession();
      const result = await request(path, {
        method,
        body: JSON.stringify(body),
      });
      setNotice('Saved.');
      setRevision((x) => x + 1);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return {
    session,
    request,
    error,
    setError,
    notice,
    setNotice,
    busy,
    revision,
    refresh: () => setRevision((x) => x + 1),
    save,
  };
}
export function ExtensionNav({
  user,
}: {
  user?: { roles: string[]; permissions?: string[]; workspace?: string };
}) {
  const path = usePathname();
  return (
    <WorkspaceNavigation
      links={extensionLinks(user)}
      activeHref={path}
      workspace={user?.workspace}
    />
  );
}
export function WorkspaceFrame({
  title,
  description,
  pageHeading,
  user,
  csrfToken,
  error,
  notice,
  children,
}: {
  title: string;
  description?: string;
  pageHeading?: ReactNode;
  user?: WorkspaceUser;
  csrfToken?: string;
  error?: string;
  notice?: string;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const router = useRouter();
  const path = usePathname();
  const sidebarScroll = useSidebarScroll(path, Boolean(user));
  const searchParams = useSearchParams();
  const admin = hasFullAccess(user?.roles) ?? false;
  const staff = user?.roles.some((r) => ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r));
  const requestedWorkspace = searchParams.get('workspace');
  const selectedWorkspace = requestedWorkspace && ['operations', 'management', 'admin', 'client'].includes(requestedWorkspace)
    ? requestedWorkspace
    : user?.workspace ?? (admin ? 'admin' : user?.roles.some((r) => ['MANAGER', 'TEAM_LEAD'].includes(r)) ? 'management' : staff ? 'operations' : 'client');
  const administration = selectedWorkspace === 'admin';
  const management = selectedWorkspace === 'management';
  const base = administration ? '/admin' : management ? '/management' : '/operations';
  const workspaceLabel = administration ? 'Administration' : management ? 'Management' : staff ? 'Technician Portal' : user?.workScope === 'INTERNAL' || user?.workScope === 'BOTH' ? 'Employee Portal' : 'Client Portal';
  const allowed = (permission: string) => admin || user?.permissions?.includes('*') || user?.permissions?.includes(permission);
  const links: [string, IconName, string][] = staff
    ? [[base, 'dashboard', administration ? 'Overview' : 'Dashboard'], [base + '/tickets', 'tickets', selectedWorkspace === 'operations' ? 'My Tickets' : 'Tickets']]
    : [['/client', 'tickets', 'My support tickets']];
  if (staff && selectedWorkspace === 'operations') {
    if (allowed('TICKETS_TEAM_VIEW')) links.push(['/operations/team-tickets', 'team', 'Team Tickets']);
    if (['INTERNAL', 'BOTH', 'ALL'].includes(user?.workScope ?? '')) links.push(['/operations/internal-tickets', 'tickets', 'Internal Tickets']);
  }
  if (management) {
    if (allowed('REPORTS_VIEW')) links.push(['/management/reports', 'reports', 'Reports & Analytics']);
    if (allowed('SLA_MANAGE') || user?.roles.includes('TEAM_LEAD')) links.push(['/management/sla', 'sla', 'SLA Management']);
    if (allowed('CATEGORY_MANAGE')) links.push(['/admin/categories', 'categories', 'Categories']);
    if (allowed('TAGS_MANAGE')) links.push(['/admin/tags', 'tags', 'Tags']);
    if (allowed('AUDIT_VIEW')) links.push(['/admin/audit-logs', 'audit', 'Audit History']);
  }
  if (administration && admin) links.push(
    ['/admin/sla', 'sla', 'SLA Management'], ['/admin/reports', 'reports', 'Reports & Analytics'],
    ['/admin/users', 'users', 'People & Permissions'], ['/admin/clients', 'clients', 'Clients'],
    ['/admin/contacts', 'contacts', 'Contacts'], ['/admin/sites', 'sites', 'Sites'],
    ['/admin/categories', 'categories', 'Categories'], ['/admin/tags', 'tags', 'Tags'],
    ['/admin/audit-logs', 'audit', 'Audit History'],
  );
  if (admin || (user?.changeAccess && user.changeAccess !== 'NONE')) links.push(['/changes', 'change', 'Change Management']);
  return (
    <div className="admin-shell ticket-shell">
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
        <nav ref={sidebarScroll} aria-label="Workspace">
          <WorkspaceNavigation
            links={[...links, ...extensionLinks(user)]}
            activeHref={path}
            workspace={selectedWorkspace}
            onNavigate={() => setMenu(false)}
          />
        </nav>
        <div className="sidebar-bottom">
          <Link href="/">
            <UiIcon name="switch" />
            Switch workspace
          </Link>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar workspace-frame-topbar">
          <button
            className="menu-button secondary"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span className="breadcrumb">{staff ? <><Link className="workspace-home-link" href="/">{workspaceLabel}</Link><span> / </span></> : null}{title}</span>
          <div className="profile workspace-frame-profile">
            {user ? (
              <>
                <ProfileIdentity name={user.displayName} workspace={selectedWorkspace} />
              </>
            ) : null}
            {staff && csrfToken ? (
              <NotificationCenter
                csrfToken={csrfToken}
                ticketBase={administration ? '/admin/ticket' : `${base}/tickets`}
              />
            ) : null}
            <Link className="secondary" href="/">
              Switch workspace
            </Link>
            {csrfToken ? (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  void fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'x-csrf-token': csrfToken },
                  })
                    .then((r) => {
                      if (!r.ok) throw new Error('Sign out failed. Retry.');
                      router.replace('/');
                      router.refresh();
                    })
                    .catch((e) => setLogoutError(e.message))
                }
              >
                Sign out
              </button>
            ) : (
              <Link href="/">Sign in</Link>
            )}
          </div>
        </header>
        <main id="main" className="v38-content">
          {pageHeading ?? (
            <header className="page-heading">
              <div>
                <p className="eyebrow">ASTRA / TICKETING SYSTEM</p>
                <h1>{title}</h1>
                {description ? <p>{description}</p> : null}
              </div>
            </header>
          )}
          {error || logoutError ? (
            <div className="notice error" role="alert">
              {error || logoutError}
              {error === 'Your session expired. Sign in again.' && (
                <p>
                  <Link className="secondary" href="/" target="_blank" rel="noopener noreferrer">Sign in in a new tab</Link>{' '}
                  Keep this form open. After signing in, return here and retry your action.
                </p>
              )}
            </div>
          ) : null}
          {notice ? (
            <div className="notice" role="status">
              {notice}
            </div>
          ) : null}
          {user ? (
            children
          ) : !error ? (
            <p role="status">Loading workspace…</p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
export function SelectOptions({ items }: { items: Option[] }) {
  return (
    <>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </>
  );
}
export const field = (data: FormData, name: string) =>
  String(data.get(name) ?? '').trim();
export const optionalField = (data: FormData, name: string) =>
  field(data, name) || undefined;
export function localTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : '';
}
export const isoTime = (data: FormData, name: string) =>
  field(data, name) ? new Date(field(data, name)).toISOString() : undefined;
