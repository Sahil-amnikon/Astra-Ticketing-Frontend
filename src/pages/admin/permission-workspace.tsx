'use client';
import { hasFullAccess } from '../role-access';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Request } from './record-form';
import AddRoleDialog from './add-role-dialog';
import DeleteRoleDialog from './delete-role-dialog';

type Role = {
  code: string;
  name?: string;
  baseRole?: string;
  custom?: boolean;
  permissions: string[];
  defaults: string[];
  available: string[];
  revision: number;
  editable: boolean;
  users: number;
};
type Person = { id: string; name: string; email: string; roles: string[] };
type DirectoryPerson = {
  id: string;
  display_name?: string | null;
  name?: string | null;
  email?: string | null;
  roles?: string[] | null;
};
type UserPolicy = Person & {
  customRoleId?: string;
  customRoleName?: string;
  allow: string[];
  deny: string[];
  revision: number;
  groupPermissions: string[];
};
const builtInNames: Record<string, string> = {
  ADMIN: 'Administrator',
  USER: 'User',
  INTERN: 'Intern',
  TECHNICIAN: 'Technician',
  TEAM_LEAD: 'Team Lead',
  MANAGER: 'Manager',
};
const modules = [
  {
    name: 'Service delivery',
    pages: [
      {
        name: 'Tickets',
        path: '/tickets',
        actions: [
          ['TICKETS_TEAM_VIEW', 'View team tickets'],
          ['TICKETS_ASSIGN', 'Assign & transfer'],
          ['TICKETS_APPROVE', 'Approve'],
        ],
      },
    ],
  },
  {
    name: 'Configuration',
    pages: [
      {
        name: 'Categories',
        path: '/admin/categories',
        actions: [['CATEGORY_MANAGE', 'Manage categories']],
      },
      {
        name: 'Tags',
        path: '/admin/tags',
        actions: [['TAGS_MANAGE', 'Manage tags']],
      },
      {
        name: 'SLA Management',
        path: '/admin/sla',
        actions: [['SLA_MANAGE', 'Manage SLA']],
      },
    ],
  },
  {
    name: 'Management',
    pages: [
      {
        name: 'Reports & Analytics',
        path: '/admin/reports',
        actions: [['REPORTS_VIEW', 'View reports']],
      },
      {
        name: 'Audit History',
        path: '/admin/audit-logs',
        actions: [['AUDIT_VIEW', 'View audit history']],
      },
    ],
  },
  {
    name: 'Administration',
    pages: [
      {
        name: 'People',
        path: '/admin/users',
        actions: [['USERS_MANAGE', 'Manage users']],
      },
      {
        name: 'Clients',
        path: '/admin/clients',
        actions: [['CLIENTS_MANAGE', 'Manage clients']],
      },
      {
        name: 'Contacts',
        path: '/admin/contacts',
        actions: [['CONTACTS_MANAGE', 'Manage contacts']],
      },
      {
        name: 'Sites',
        path: '/admin/sites',
        actions: [['SITES_MANAGE', 'Manage sites']],
      },
    ],
  },
];

export default function PermissionWorkspace({
  request,
  mode,
  addRoleTarget,
}: {
  request: Request;
  mode: 'role' | 'user';
  addRoleTarget?: HTMLElement | null;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [addingRole, setAddingRole] = useState(false);
  const [deletingRole, setDeletingRole] = useState<Role>();
  const names = { ...builtInNames, ...Object.fromEntries(roles.filter(role => role.name).map(role => [role.code, role.name!])) };
  const [roleCode, setRoleCode] = useState('TECHNICIAN');
  const [personId, setPersonId] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [workspace, setWorkspace] = useState<'operations' | 'management'>(
    'operations',
  );
  const [user, setUser] = useState<UserPolicy>();
  const [grants, setGrants] = useState<string[]>([]);
  const [denials, setDenials] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState<string[]>(['Tickets']);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      setUser(undefined);
      void Promise.all([
        request('/admin/access-policies'),
        mode === 'user' && personId
          ? request(`/admin/access-policies/users/${personId}`)
          : Promise.resolve(undefined),
      ])
        .then(([result, detail]) => {
          if (!live) return;
          const next = (result as { roles: Role[] }).roles;
          setRoles(next);
          const record = detail as UserPolicy | undefined;
          setUser(record);
          setGrants(
            mode === 'role'
              ? (next.find((role) => role.code === roleCode)?.permissions ?? [])
              : (record?.allow ?? []),
          );
          setDenials(record?.deny ?? []);
          setDirty(false);
        })
        .catch((e: Error) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request, mode, roleCode, personId, refresh]);
  useEffect(() => {
    if (mode !== 'user') return;
    let live = true;
    const timer = setTimeout(() => {
      void request(
        `/admin/users?page=${page}&pageSize=30&q=${encodeURIComponent(search)}`,
      )
        .then((value) => {
          if (live) {
            const data = value as { items: DirectoryPerson[]; total: number };
            setPeople(
              data.items.map((person) => ({
                id: person.id,
                name:
                  person.display_name?.trim() ||
                  person.name?.trim() ||
                  person.email?.trim() ||
                  'Unnamed account',
                email: person.email ?? '',
                roles: Array.isArray(person.roles) ? person.roles : [],
              })),
            );
            setTotal(data.total);
          }
        })
        .catch((e: Error) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request, mode, page, search]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const tabNavigation = (event: Event) => {
      if (busy || !window.confirm('Discard unsaved permission changes?'))
        event.preventDefault();
    };
    const linkNavigation = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('a[href]')
      )
        return;
      if (busy || !window.confirm('Discard unsaved permission changes?'))
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('astra-permission-navigation', tabNavigation);
    document.addEventListener('click', linkNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('astra-permission-navigation', tabNavigation);
      document.removeEventListener('click', linkNavigation, true);
    };
  }, [dirty, busy]);
  const canLeave = () =>
    !dirty || window.confirm('Discard unsaved permission changes?');
  const selectedRole = roles.find((role) => role.code === roleCode);
  const actualRoles = user?.roles ?? [];
  const fixedUser = Boolean(user?.customRoleId) || actualRoles.some((role) =>
    ['ADMIN', 'MANAGER', 'USER', 'INTERN'].includes(role),
  );
  const effectiveRole = hasFullAccess(actualRoles)
    ? actualRoles.find(code => code === 'ADMIN') ? 'ADMIN' : 'MANAGER'
    : actualRoles.includes('USER')
    ? 'USER'
    : workspace === 'operations'
      ? actualRoles.includes('INTERN')
        ? 'INTERN'
        : 'TECHNICIAN'
      : hasFullAccess(actualRoles) || actualRoles.includes('MANAGER')
        ? 'MANAGER'
        : 'TEAM_LEAD';
  const role =
    mode === 'role'
      ? selectedRole
      : roles.find((entry) => entry.code === effectiveRole);
  const available = role?.available ?? [];
  const editable =
    !loading &&
    !busy &&
    (mode === 'role' ? Boolean(role?.editable) : Boolean(user) && !fixedUser);
  const base =
    mode === 'role'
      ? []
      : [...(role?.permissions ?? []), ...(user?.groupPermissions ?? [])];
  const enabled = (code: string) =>
    (mode === 'role' || Boolean(user)) &&
    available.includes(code) &&
    ((mode === 'user' && hasFullAccess(actualRoles)) ||
      (!denials.includes(code) && (grants.includes(code) || base.includes(code))));
  const source = (code: string) =>
    denials.includes(code)
      ? 'Denied for user'
      : grants.includes(code)
        ? mode === 'role'
          ? 'Role policy'
          : 'Allowed for user'
        : base.includes(code)
          ? user?.groupPermissions.includes(code)
            ? 'Inherited from group'
            : 'Inherited from role'
          : 'Not granted';
  const change = (code: string, checked: boolean) => {
    setGrants((current) =>
      checked
        ? [...new Set([...current, code])]
        : current.filter((p) => p !== code),
    );
    setDenials((current) =>
      checked || mode === 'role'
        ? current.filter((p) => p !== code)
        : [...new Set([...current, code])],
    );
    setDirty(true);
    setNotice('');
  };
  const allCodes = modules.flatMap((module) =>
    module.pages.flatMap((item) => item.actions.map(([code]) => code!)),
  );
  const editableCodes = allCodes.filter((code) => available.includes(code));
  const selectedName =
    mode === 'role' ? names[roleCode] : (user?.name ?? 'a person');
  async function save() {
    if (!editable || !dirty) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/admin/access-policies/${mode === 'role' ? `roles/${roleCode}` : `users/${personId}`}`,
        {
          method: 'PATCH',
          body: JSON.stringify(
            mode === 'role'
              ? { revision: selectedRole?.revision, permissions: grants }
              : { revision: user?.revision, allow: grants, deny: denials },
          ),
        },
      );
      setDirty(false);
      setNotice('Permissions saved. They apply on the next request.');
      setRefresh((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteRole() {
    if (busy || loading || !selectedRole?.custom) return;
    setError(''); setNotice('');
    if (selectedRole.users > 0) {
      setError(`This role is assigned to ${selectedRole.users} user${selectedRole.users === 1 ? '' : 's'}. Reassign them in People before deleting it.`);
      return;
    }
    setDeletingRole(selectedRole);
  }
  async function confirmDeleteRole() {
    if (busy || !deletingRole) return;
    setBusy(true);
    setError('');
    try {
      await request(`/admin/access-policies/roles/${deletingRole.code}`, { method: 'DELETE', body: JSON.stringify({ revision: deletingRole.revision }) });
      setDeletingRole(undefined); setDirty(false); setSearch(''); setRoleCode('TECHNICIAN'); setNotice('Custom role deleted.'); setRefresh(value => value + 1);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const addRoleButton = mode === 'role' ? <button type="button" className="primary" disabled={busy || loading} onClick={() => { if (canLeave()) setAddingRole(true); }}>+ Add role</button> : null;
  return (
    <section
      className="access-workspace"
      aria-label={`${mode === 'role' ? 'Role' : 'User'} permissions`}
    >
      <div className="access-summary">
        {[
          ['Roles', roles.length, 'Access profiles'],
          [
            'Users',
            roles.reduce((sum, entry) => sum + entry.users, 0),
            'Assigned role memberships',
          ],
          ['Permissions', allCodes.length, 'Supported capabilities'],
        ].map(([label, value, hint], index) => (
          <div className="access-metric" key={label}>
            <span className={`access-metric-icon tone-${index}`}>
              {index === 0 ? '◇' : index === 1 ? '♧' : '▣'}
            </span>
            <div>
              <small>Total {label}</small>
              <strong>{value}</strong>
              <small>{hint}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="access-actions">
        <p>Control access to Astra pages and actions.</p>
        {addRoleTarget && addRoleButton ? createPortal(addRoleButton, addRoleTarget) : addRoleButton}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (canLeave()) {
              setRefresh((value) => value + 1);
              setNotice('');
            }
          }}
        >
          Refresh permissions
        </button>
        {mode === 'role' ? <button type="button" className="secondary danger-button"
          disabled={busy || loading || !selectedRole?.custom}
          title={selectedRole?.custom ? 'Delete the selected custom role' : 'Built-in roles cannot be deleted'}
          onClick={() => void deleteRole()}>Delete role</button> : null}
        <button
          className="primary"
          disabled={!editable || !dirty}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save permissions'}
        </button>
      </div>
      {error ? (
        <div role="alert" className="notice error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="notice">
          {notice}
        </div>
      ) : null}
      {addingRole ? <AddRoleDialog roles={roles} request={request} onClose={() => setAddingRole(false)} onCreated={code => { setAddingRole(false); setDirty(false); setSearch(''); setRoleCode(code); setNotice('Role created. Choose its permissions, then assign it under People.'); setRefresh(value => value + 1); }} /> : null}
      {deletingRole ? <DeleteRoleDialog name={names[deletingRole.code]} busy={busy} dirty={dirty} error={error} onCancel={() => { setDeletingRole(undefined); setError(''); }} onConfirm={() => void confirmDeleteRole()} /> : null}
      <div className="access-columns">
        <aside className="access-selector panel">
          <h2>{mode === 'role' ? 'Roles' : 'People'}</h2>
          <input
            type="search"
            aria-label={`Search ${mode === 'role' ? 'roles' : 'people'}`}
            placeholder={`Search ${mode === 'role' ? 'roles' : 'people'}…`}
            value={search}
            disabled={busy}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="access-options">
            {mode === 'role'
              ? roles
                  .filter((entry) =>
                    names[entry.code]
                      ?.toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((entry) => (
                    <button
                      key={entry.code}
                      aria-pressed={entry.code === roleCode}
                      disabled={busy}
                      onClick={() => {
                        if (canLeave()) {
                          setRoleCode(entry.code);
                          setNotice('');
                        }
                      }}
                    >
                      <span className="access-avatar">
                        {names[entry.code]?.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{names[entry.code]}</strong>
                        <small>
                          {entry.users} users ·{' '}
                          {entry.editable
                            ? 'Configurable role'
                            : 'Fixed profile'}
                        </small>
                      </span>
                    </button>
                  ))
              : people.map((person) => (
                  <button
                    key={person.id}
                    aria-pressed={person.id === personId}
                    disabled={busy}
                    onClick={() => {
                      if (canLeave()) {
                        setPersonId(person.id);
                        setWorkspace('operations');
                        setNotice('');
                      }
                    }}
                  >
                    <span className="access-avatar">
                      {person.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {person.roles
                          .map((code) => names[code] ?? code)
                          .join(', ')}
                      </small>
                      <small>{person.email}</small>
                    </span>
                  </button>
                ))}
            {(mode === 'user' && !people.length) ||
            (mode === 'role' &&
              roles.length > 0 &&
              !roles.some((entry) =>
                names[entry.code]?.toLowerCase().includes(search.toLowerCase()),
              )) ? (
              <p className="hint">
                No matching {mode === 'role' ? 'roles' : 'people'}.
              </p>
            ) : null}
          </div>
          {mode === 'user' ? (
            <div className="pager">
              <button
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <small>
                {page} / {Math.max(1, Math.ceil(total / 30))}
              </small>
              <button
                disabled={page * 30 >= total || busy}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </aside>
        <section className="access-matrix panel" aria-busy={loading}>
          <div className="access-matrix-heading">
            <div>
              <h2>
                Permissions for <em>{selectedName}</em>
              </h2>
              <p>
                {mode === 'role'
                  ? 'Manage what this role can access and modify.'
                  : user?.customRoleId ? `Permissions come from ${user.customRoleName}. Edit that role under Role Permissions.` : 'Role and group permissions are inherited. A user denial takes priority.'}
              </p>
            </div>
            <label className="access-check">
              <input
                type="checkbox"
                aria-label="Select all available permissions"
                disabled={!editable || !editableCodes.length}
                checked={
                  editableCodes.length > 0 && editableCodes.every(enabled)
                }
                onChange={(event) => {
                  const checked = event.target.checked;
                  for (const code of editableCodes) change(code, checked);
                }}
              />
              <span>Select all</span>
            </label>
          </div>
          {mode === 'user' &&
          user &&
          actualRoles.some((code) =>
            ['MANAGER', 'TEAM_LEAD', 'ADMIN'].includes(code),
          ) ? (
            <label className="access-workspace-choice">
              Preview workspace
              <select
                value={workspace}
                disabled={busy}
                onChange={(event) =>
                  setWorkspace(event.target.value as typeof workspace)
                }
              >
                <option value="operations">Technician</option>
                <option value="management">Management</option>
              </select>
            </label>
          ) : null}
          <div className="access-scope-note">
            {mode === 'role'
              ? selectedRole?.custom
                ? `Based on ${names[selectedRole.baseRole ?? ''] ?? selectedRole.baseRole}. MSP and client restrictions are configured separately for each employee.`
                : roleCode === 'TECHNICIAN'
                ? 'Applies in the Technician workspace, including managers and administrators working as technicians.'
                : ['TEAM_LEAD', 'MANAGER'].includes(roleCode)
                  ? 'Applies in the Management workspace. Technician workspace access uses the Technician policy.'
                  : 'This profile has fixed access. Administrator configuration, client self-service and supervised intern access remain role controlled.'
              : !user
                ? 'Select a person to view and manage their permissions.'
                : user?.customRoleId
                  ? `This employee uses ${user.customRoleName}. Update its permissions under Role Permissions.`
                  : fixedUser
                  ? 'This profile has fixed access. Manage roles, customer/site scope, departments and Change Management access in People.'
                  : 'Customer/site scope and Change Management access are managed in People. User overrides cannot grant Administration access.'}
          </div>
          <input
            type="search"
            aria-label="Search permission pages"
            placeholder="Search pages or actions…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {loading ? (
            <p role="status">Loading permissions…</p>
          ) : (
            <div className="access-table-scroll">
              <table className="access-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((module) => {
                    const pages = module.pages.filter((item) =>
                      `${module.name} ${item.name} ${item.actions.flat().join(' ')}`
                        .toLowerCase()
                        .includes(filter.toLowerCase()),
                    );
                    if (!pages.length) return null;
                    const codes = pages
                      .flatMap((item) => item.actions.map(([code]) => code!))
                      .filter((code) => available.includes(code));
                    return (
                      <ModuleRows
                        key={module.name}
                        name={module.name}
                        count={pages.length}
                        collapsed={collapsed.includes(module.name)}
                        onCollapse={() =>
                          setCollapsed((value) =>
                            value.includes(module.name)
                              ? value.filter((name) => name !== module.name)
                              : [...value, module.name],
                          )
                        }
                        all={codes.length > 0 && codes.every(enabled)}
                        disabled={!editable || !codes.length}
                        onAll={(checked) =>
                          codes.forEach((code) => change(code, checked))
                        }
                      >
                        {pages.map((item) => {
                          const count = item.actions.filter(([code]) =>
                            enabled(code!),
                          ).length;
                          const expanded = open.includes(item.name);
                          return (
                            <RowGroup key={item.name}>
                              <tr>
                                <td>
                                  <strong>{item.name}</strong>
                                  <small>{item.path}</small>
                                </td>
                                <td>
                                  <span
                                    className={`access-badge ${count ? 'enabled' : ''}`}
                                  >
                                    {count ? 'Enabled' : 'No access'}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="access-manage"
                                    aria-expanded={expanded}
                                    aria-label={`Manage ${item.name} permissions`}
                                    onClick={() =>
                                      setOpen((value) =>
                                        expanded
                                          ? value.filter(
                                              (name) => name !== item.name,
                                            )
                                          : [...value, item.name],
                                      )
                                    }
                                  >
                                    Manage{' '}
                                    <span>
                                      {count}/{item.actions.length}
                                    </span>{' '}
                                    {expanded ? '⌃' : '⌄'}
                                  </button>
                                </td>
                              </tr>
                              {expanded ? (
                                <tr className="access-detail">
                                  <td colSpan={3}>
                                    <strong>
                                      Manage permissions · {item.name}
                                    </strong>
                                    <div className="access-permission-options">
                                      {item.actions.map(([code, label]) => (
                                        <label key={code}>
                                          <input
                                            type="checkbox"
                                            aria-label={label}
                                            checked={enabled(code!)}
                                            disabled={
                                              !editable ||
                                              !available.includes(code!)
                                            }
                                            onChange={(event) =>
                                              change(
                                                code!,
                                                event.target.checked,
                                              )
                                            }
                                          />
                                          <span>
                                            {label}
                                            <small>
                                              {!available.includes(code!)
                                                ? 'Restricted by workspace / role'
                                                : source(code!)}
                                            </small>
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </RowGroup>
                          );
                        })}
                      </ModuleRows>
                    );
                  })}
                </tbody>
              </table>
              {!modules.some((module) =>
                module.pages.some((item) =>
                  `${module.name} ${item.name} ${item.actions.flat().join(' ')}`
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                ),
              ) ? (
                <p className="hint">No matching pages or actions.</p>
              ) : null}
            </div>
          )}
          <footer className="access-footer">
            <small>
              {allCodes.filter(enabled).length} permissions enabled
              {dirty ? ' · Unsaved changes' : ''}
            </small>
            <button
              className="secondary"
              disabled={!dirty || busy}
              onClick={() => {
                if (canLeave()) setRefresh((value) => value + 1);
              }}
            >
              Cancel
            </button>
            {mode === 'user' ? (
              <button
                className="secondary"
                disabled={!editable || (!grants.length && !denials.length)}
                onClick={() => {
                  setGrants([]);
                  setDenials([]);
                  setDirty(true);
                  setNotice('');
                }}
              >
                Use inherited permissions
              </button>
            ) : (
              <button
                className="secondary"
                disabled={!editable}
                onClick={() => {
                  setGrants(role?.defaults ?? []);
                  setDirty(true);
                  setNotice('');
                }}
              >
                Restore role defaults
              </button>
            )}
            <button
              className="primary"
              disabled={!editable || !dirty}
              onClick={() => void save()}
            >
              Save changes
            </button>
          </footer>
        </section>
      </div>
    </section>
  );
}

import { Fragment, type ReactNode } from 'react';
function RowGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
function ModuleRows({
  name,
  count,
  collapsed,
  onCollapse,
  all,
  disabled,
  onAll,
  children,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onCollapse: () => void;
  all: boolean;
  disabled: boolean;
  onAll: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Fragment>
      <tr className="access-module">
        <td>
          <button
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
            aria-expanded={!collapsed}
            onClick={onCollapse}
          >
            {collapsed ? '›' : '⌄'} <strong>{name}</strong>
            <span>{count}</span>
          </button>
        </td>
        <td colSpan={2}>
          <label className="access-check">
            <span>All</span>
            <input
              type="checkbox"
              aria-label={`All ${name} permissions`}
              checked={all}
              disabled={disabled}
              onChange={(event) => onAll(event.target.checked)}
            />
          </label>
        </td>
      </tr>
      {collapsed ? null : children}
    </Fragment>
  );
}
