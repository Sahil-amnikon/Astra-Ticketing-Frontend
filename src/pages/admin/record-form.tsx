'use client';
import { hasFullAccessRole } from '../role-access';
import { allActiveAccessIds, defaultChangeAccess, effectiveChangeAccess, workScopeForRole } from './user-access-options';
import './user-access-options.css';

import { FormEvent, useEffect, useRef, useState } from 'react';
import ContactPortalLink from './contact-portal-link';
import RecordPicker from './directory-record-picker';
import { findAccessRecord } from './access-record-name';
import type { RoleOption } from './add-role-dialog';
import './custom-roles.css';
import { isEmployeeUser } from './employee-user';
export { RecordPicker };
export type Row = Record<string, unknown>;
export type Request = (path: string, init?: RequestInit) => Promise<unknown>;
const roleProfiles = [
  {
    code: 'USER',
    name: 'User',
    description:
      'Raise and track your own requests. Amnikon employees belong to Amnikon and submit internal requests.',
  },
  {
    code: 'INTERN',
    name: 'Intern',
    description:
      'Internal supervised work only. Can update assigned work, add internal notes and request help from specialists.',
  },
  {
    code: 'TECHNICIAN',
    name: 'Technician',
    description:
      'Work assigned tickets, use authorized site-team queues, reply, add internal notes and resolve tickets for review.',
  },
  {
    code: 'TEAM_LEAD',
    name: 'Team Lead',
    description:
      'Technician access plus ticket assignment, review and closure, category and tag maintenance, and operational reports.',
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description:
      'Full access to all workspaces, MSPs, clients, tickets, people, permissions, configuration, approvals and reports.',
  },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description:
      'Full control of tickets, people, clients, configuration, SLA, reports and audit history. Can also own and receive tickets.',
  },
] as const;

function initialRole(record?: Row) {
  const assigned = (record?.roles as string[]) ?? [];
  return (
    ['ADMIN', 'MANAGER', 'TEAM_LEAD', 'TECHNICIAN', 'INTERN', 'USER'].find(
      (role) => assigned.includes(role),
    ) ?? 'TECHNICIAN'
  );
}
const fields: Record<string, [string, string, string?][]> = {
  clients: [
    ['name', 'Client name'],
    ['ticketPrefix', 'Ticket number prefix'],
    ['primaryEmail', 'Staff email domain', 'text'],
    ['primaryPhone', 'Primary phone'],
    ['notes', 'Notes', 'textarea'],
  ],
  contacts: [
    ['name', 'Contact name'],
    ['email', 'Email', 'email'],
    ['phone', 'Phone'],
  ],
  sites: [
    ['name', 'Site name'],
    ['ticketPrefix', 'Site ticket prefix'],
    ['address', 'Address', 'textarea'],
  ],
  assets: [
    ['name', 'Asset name'],
    ['assetType', 'Asset type'],
    ['serialNumber', 'Serial number'],
    ['externalReference', 'External reference'],
  ],
  categories: [
    ['name', 'Category name'],
    ['description', 'Description', 'textarea'],
  ],
  tags: [
    ['name', 'Tag name'],
    ['description', 'Description', 'textarea'],
  ],
  sources: [
    ['code', 'Source code'],
    ['name', 'Source name'],
  ],
};
const snake = (key: string) =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

function staffDomain(client?: Row) {
  const value = String(client?.primary_email ?? '').trim().toLowerCase();
  return value.startsWith('@') ? value : '';
}

function staffEmailDomain(email: string) {
  const domain = email.trim().match(/@([^@\s/\\?#:%]+\.[^@\s/\\?#:%.]+)$/u)?.[1];
  if (!domain) return '';
  try {
    return `@${new URL(`http://${domain}`).hostname}`;
  } catch {
    return '';
  }
}

function isStaffSupervisor(row: Row) {
  return (row.active === true || row.active === 1) && Array.isArray(row.roles) &&
    row.roles.some((role) => ['ADMIN', 'MANAGER', 'TEAM_LEAD', 'TECHNICIAN'].includes(role));
}

function Membership({
  id,
  resource = 'clients',
  label = 'Client access',
  request,
  remove,
  lead,
  onLeadChange,
  onRecord,
}: {
  id: string;
  index: number;
  resource?: string;
  label?: string;
  request: Request;
  remove: () => void;
  lead?: boolean;
  onLeadChange?: (value: boolean) => void;
  onRecord?: (row: Row) => void;
}) {
  const [name, setName] = useState('Loading…');
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;
  useEffect(() => {
    let live = true;
    setName('Loading…');
    void findAccessRecord(request, resource, id)
      .then((row) => {
        if (live && row) {
          setName(String(row.name ?? row.display_name ?? row.email ?? 'Name unavailable'));
          onRecordRef.current?.(row);
        } else if (live) setName(`${label} name unavailable`);
      })
      .catch(() => { if (live) setName(`${label} name unavailable`); });
    return () => {
      live = false;
    };
  }, [id, request, resource, label]);
  return (
    <li>
      <span>{name}</span>
      {onLeadChange ? (
        <label className="membership-lead">
          <input
            type="checkbox"
            checked={lead}
            onChange={(event) => onLeadChange(event.target.checked)}
          />
          Department lead
        </label>
      ) : null}
      <button type="button" onClick={remove} aria-label={`Remove ${name}`}>
        Remove
      </button>
    </li>
  );
}

export default function RecordForm({
  resource,
  record,
  request,
  onSaved,
  onCancel,
  isAdmin = false,
}: {
  resource: string;
  record?: Row;
  request: Request;
  onSaved: () => void;
  onCancel: () => void;
  isAdmin?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<Row>();
  const [matches, setMatches] = useState<Row[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoClient, setDemoClient] = useState<Row>();
  const [demoRole, setDemoRole] = useState('TECHNICIAN');
  const [demoSupervisor, setDemoSupervisor] = useState('');
  const demoIsIntern = demoRole === 'INTERN';
  const demoAssignmentReady = demoIsIntern ? !!demoSupervisor : !!demoClient;
  const [demoEmail, setDemoEmail] = useState('');
  const [lookupDomain, setLookupDomain] = useState('');
  const demoEmailInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!creatingDemo || demoIsIntern || !lookupDomain) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const pageSize = 50;
        for (let page = 1; !controller.signal.aborted; page++) {
          const result = (await request(
            `/admin/clients?status=active&pageSize=${pageSize}&page=${page}&q=${encodeURIComponent(lookupDomain)}`,
            { signal: controller.signal },
          )) as { items: Row[]; total: number };
          if (controller.signal.aborted) return;
          const client = result.items.find((row) => staffDomain(row) === lookupDomain);
          if (client) setDemoClient(client);
          if (client || !result.items.length || page * pageSize >= result.total) break;
        }
      } catch {
        if (!controller.signal.aborted) setError('Could not match the email domain. Select the client manually.');
      } finally {
        if (!controller.signal.aborted) setLookupDomain('');
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [creatingDemo, demoIsIntern, lookupDomain, request]);
  useEffect(() => {
    if (resource !== 'users' || record || !isAdmin) return;
    const controller = new AbortController();
    void fetch('/api/auth/status', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const status = await response.json();
          if (!controller.signal.aborted) setDemoAvailable(status.passwordTestLogin === true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [resource, record, isAdmin]);
  const [selectedRole, setSelectedRole] = useState(() => initialRole(record));
  const [customRoles, setCustomRoles] = useState<RoleOption[]>([]);
  const [customRoleId, setCustomRoleId] = useState(String(record?.custom_role_id ?? ''));
  const [rolesReady, setRolesReady] = useState(resource !== 'users' || !isAdmin);
  useEffect(() => {
    if (resource !== 'users' || !isAdmin) return;
    let live = true;
    setRolesReady(false);
    void request('/admin/access-policies').then(result => {
      if (live) { setCustomRoles((result as { roles: RoleOption[] }).roles.filter(role => role.custom)); setRolesReady(true); }
    }).catch(() => { if (live) setError('Could not load roles. Reopen this form before saving.'); });
    return () => { live = false; };
  }, [resource, isAdmin, request]);
  const [workScope, setWorkScope] = useState(
    workScopeForRole(initialRole(record), String(
      record?.work_scope ??
        (initialRole(record) === 'INTERN' ? 'INTERNAL' : 'CLIENT'),
    )),
  );
  const [changeAccess, setChangeAccess] = useState(
    effectiveChangeAccess(initialRole(record), String(record?.change_access ?? 'NONE')),
  );
  const [supervisorUserId, setSupervisorUserId] = useState(
    String(record?.supervisor_user_id ?? ''),
  );
  const [clientIds, setClientIds] = useState<string[]>(
    ((record?.client_ids as string[]) ?? []).filter(
      (id) => id !== '00000000-0000-4000-8000-000000000132',
    ),
  );
  const [siteIds, setSiteIds] = useState<string[]>(
    (record?.site_ids as string[]) ?? [],
  );
  const [siteParents, setSiteParents] = useState<Record<string, string>>({});
  const [clientCoverage, setClientCoverage] = useState<'all' | 'selected'>(
    ((record?.site_ids as string[]) ?? []).length ? 'selected' : 'all',
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    (record?.department_ids as string[]) ?? [],
  );
  const [leadDepartmentIds, setLeadDepartmentIds] = useState<string[]>(
    (record?.lead_department_ids as string[]) ?? [],
  );
  const [department, setDepartment] = useState('');
  const [siteClient, setSiteClient] = useState('');
  const [site, setSite] = useState('');
  const [client, setClient] = useState(String(record?.client_id ?? ''));
  const employeeUser = isEmployeeUser(selectedRole, String(record?.email ?? verified?.email ?? ''));
  const effectiveWorkScope = employeeUser ? 'INTERNAL' : selectedRole === 'USER' ? 'CLIENT' : workScope;
  async function selectAllAccess(resource: 'clients' | 'departments') {
    if (busy || bulkBusy) return;
    setBulkBusy(true);
    setError('');
    try {
      const ids = await allActiveAccessIds(resource, request);
      if (!ids.length) throw new Error(`No active ${resource === 'clients' ? 'MSPs' : 'departments'} are available.`);
      if (resource === 'clients') {
        setClientIds(previous => [...new Set([...previous, ...ids])]);
        setClient('');
      } else {
        setDepartmentIds(previous => [...new Set([...previous, ...ids])]);
        setDepartment('');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not select every option. Please try again.');
    } finally {
      setBulkBusy(false);
    }
  }
  const [related, setRelated] = useState(
    String(record?.site_id ?? record?.parent_id ?? ''),
  );
  async function createDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !demoAvailable || !demoAssignmentReady || lookupDomain) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await request('/admin/test-accounts', {
        method: 'POST',
        body: JSON.stringify({
          email: demoEmail.trim(),
          displayName: String(fields.get('displayName') ?? '').trim(),
          password: String(fields.get('password') ?? ''),
          role: demoRole,
          clientId: !demoIsIntern && demoClient ? String(demoClient.id) : undefined,
          supervisorUserId: demoIsIntern ? demoSupervisor : undefined,
        }),
      });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (resource === 'users' && !record && isAdmin && demoAvailable && creatingDemo) {
    return (
      <section className="panel editor" aria-label="Create account">
        <div className="section-heading">
          <h2>Create account</h2>
          <button type="button" className="secondary" disabled={busy} onClick={() => {
            setCreatingDemo(false);
            setLookupDomain('');
            setError('');
          }}>
            Back to Microsoft accounts
          </button>
        </div>
        <p className="hint">
          {demoIsIntern
            ? 'Interns work on internal tickets under an active supervisor.'
            : 'Choose a client to fill in its domain, or enter a full email to select the matching client.'}
        </p>
        <form onSubmit={createDemo}>
          <fieldset className="form-grid" disabled={busy}>
            <label>
              Display name
              <input name="displayName" required maxLength={200} placeholder="Amin (ASTRA Demo)" />
            </label>
            <label>
              Staff sign-in email
              <input
                ref={demoEmailInput}
                name="email"
                type="text"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                pattern={String.raw`[^@\s]+@[^@\s]+`}
                title="Enter a complete email address."
                maxLength={254}
                placeholder="employee@company.com"
                value={demoEmail}
                onChange={(event) => {
                  const email = event.currentTarget.value;
                  setDemoEmail(email);
                  setError('');
                  if (demoIsIntern) return;
                  const domain = staffEmailDomain(email);
                  const selectedDomain = staffDomain(demoClient);
                  if (domain && selectedDomain && domain !== selectedDomain) setDemoClient(undefined);
                  setLookupDomain(domain === selectedDomain ? '' : domain);
                }}
              />
            </label>
            <label>
              Demo password
              <input name="password" type="password" autoComplete="new-password"
                required minLength={12} maxLength={200} />
            </label>
            <label>
              Role
              <select
                name="role"
                value={demoRole}
                onChange={(event) => {
                  const role = event.currentTarget.value;
                  setDemoRole(role);
                  setError('');
                  if (role === 'INTERN') {
                    setDemoClient(undefined);
                    setLookupDomain('');
                  } else if (demoIsIntern) {
                    setLookupDomain(staffEmailDomain(demoEmail));
                  }
                }}
              >
                <option value="TECHNICIAN">Technician</option>
                <option value="TEAM_LEAD">Team Lead</option>
                <option value="MANAGER">Manager</option>
                <option value="INTERN">Intern</option>
              </select>
            </label>
            {demoIsIntern ? (
              <RecordPicker
                key="demo-supervisor"
                resource="users"
                label="Supervisor"
                value={demoSupervisor}
                onChange={setDemoSupervisor}
                filterOptions={isStaffSupervisor}
                request={request}
                disabled={busy}
              />
            ) : (
              <RecordPicker
                key="demo-client"
                resource="clients"
                label="Client"
                searchable={false}
                value={String(demoClient?.id ?? '')}
                selectedLabel={demoClient ? String(demoClient.name) : undefined}
                onChange={(_, client) => {
                  setDemoClient(client);
                  setLookupDomain('');
                  setError('');
                  const domain = staffDomain(client);
                  if (!domain) return;
                  const name = demoEmail.split('@', 1)[0].trim();
                  setDemoEmail(name + domain);
                  requestAnimationFrame(() => {
                    demoEmailInput.current?.focus();
                    demoEmailInput.current?.setSelectionRange(name.length, name.length);
                  });
                }}
                request={request}
                disabled={busy}
              />
            )}
            {error && (
              <div className="notice error wide" role="alert">
                <p>{/already (exists|registered)/i.test(error)
                  ? 'This email is already registered. Open People to edit the existing account, or enter a different email for the new member.'
                  : error}</p>
                {/already (exists|registered)/i.test(error) && (
                  <button type="button" className="secondary" onClick={onCancel}>
                    View existing accounts
                  </button>
                )}
              </div>
            )}
            <div className="wide">
              <button type="submit" className="primary" disabled={busy || !demoAssignmentReady || !!lookupDomain}>
                {busy ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    );
  }

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setVerified(undefined);
    setMatches([]);
    try {
      const result = (await request('/users/resolve', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim() }),
      })) as { items?: Row[] };
      const found = Array.isArray(result.items) ? result.items : [];
      if (!found.length)
        throw new Error(
          'No matching Entra user was found. Try another name or email.',
        );
      setMatches(found);
      if (found.length === 1) setVerified(found[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || bulkBusy) return;
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      let payload: Row;
      if (resource === 'users') {
        if (!rolesReady) throw new Error('Wait for roles to load before saving.');
        if (!record && !verified)
          throw new Error('Search and select an Entra account first.');
        if (
          !hasFullAccessRole(selectedRole) &&
          ['CLIENT', 'BOTH'].includes(effectiveWorkScope) &&
          !clientIds.length
        )
          throw new Error('Select at least one MSP, or choose All active MSPs, and add it to this account.');
        if (!hasFullAccessRole(selectedRole) && ['CLIENT', 'BOTH'].includes(effectiveWorkScope) &&
            clientCoverage === 'selected' && !siteIds.length)
          throw new Error('Add at least one client, or choose All clients in selected MSPs.');
        payload = {
          roles: [selectedRole],
          customRoleId: customRoleId || undefined,
          clientIds: hasFullAccessRole(selectedRole) || employeeUser ? [] : clientIds,
          siteIds: hasFullAccessRole(selectedRole) || clientCoverage === 'all' || effectiveWorkScope === 'INTERNAL' ? [] : siteIds,
          workScope:
            hasFullAccessRole(selectedRole)
              ? 'ALL'
              : effectiveWorkScope,
          changeAccess:
            hasFullAccessRole(selectedRole)
              ? 'CHANGE_MANAGER'
              : selectedRole === 'USER'
                ? 'NONE'
                : effectiveChangeAccess(selectedRole, changeAccess),
          supervisorUserId:
            selectedRole === 'INTERN' ? supervisorUserId : undefined,
          departmentIds: employeeUser ? [] : departmentIds,
          leadDepartmentIds: (employeeUser ? [] : leadDepartmentIds).filter((id) =>
            departmentIds.includes(id),
          ),
          expertise: String(form.get('expertise') ?? '').trim() || undefined,
          ...(record
            ? { active: form.get('active') === 'true' }
            : { entraObjectId: verified?.id }),
        };
      } else {
        payload = Object.fromEntries(
          (fields[resource] ?? [])
            .filter(
              ([key]) => !(record && resource === 'sources' && key === 'code'),
            )
            .map(([key]) => [key, String(form.get(key) ?? '').trim()])
            .filter(([, value]) => value !== ''),
        );
        if (['contacts', 'sites', 'assets'].includes(resource))
          payload.clientId = client;
        if (related && ['contacts', 'assets'].includes(resource))
          payload.siteId = related;
        if (related && resource === 'categories') payload.parentId = related;
        if (resource === 'sites' && !record) {
          const enteredDomain = String(form.get('emailDomain') ?? '').trim();
          const emailDomain = enteredDomain.replace(/^@/, '').toLowerCase();
          if (enteredDomain && (!emailDomain.includes('.') || /[@\s/:*]/.test(emailDomain)))
            throw new Error('Enter a work email domain such as example.com or @example.com.');
          payload.emailDomain = emailDomain || undefined;
        }
        if (record) payload.active = form.get('active') === 'true';
      }
      await request(
        record ? `/admin/${resource}/${record.id}` : `/${resource}`,
        { method: record ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel editor"
      aria-label={record ? 'Edit record' : 'Add record'}
    >
      <div className="section-heading">
        <h2>
          {record ? 'Edit' : 'Add'}{' '}
          {resource === 'users'
            ? 'user access'
            : resource.replace(/ies$/, 'y').replace(/s$/, '')}
        </h2>
        <div className="heading-actions" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12 }}>
          {resource === 'users' && !record && isAdmin && demoAvailable && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setCreatingDemo(true);
                setError('');
              }}
            >
              Create account
            </button>
          )}
          <button className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
      {resource === 'users' && !record ? (
        <form onSubmit={lookup} className="lookup">
          <label>
            Name, work email or Entra UPN
            <input
              type="search"
              required
              minLength={2}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setVerified(undefined);
                setMatches([]);
              }}
              disabled={busy}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Searching…' : 'Search Azure'}
          </button>
        </form>
      ) : null}
      {matches.length > 1 && !verified ? (
        <div
          className="directory-results"
          role="list"
          aria-label="Entra search results"
        >
          <p className="hint">Select the exact account to add:</p>
          {matches.map((match) => (
            <button
              type="button"
              className="secondary"
              role="listitem"
              key={String(match.id)}
              onClick={() => setVerified(match)}
            >
              <strong>{String(match.displayName)}</strong>{' '}
              <span>{String(match.email)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {verified ? (
        <div className="verified">
          <strong>{String(verified.displayName)}</strong>
          <span>{String(verified.email)}</span>
          <small>{String(verified.userPrincipalName)}</small>
        </div>
      ) : null}
      {record && resource === 'users' ? (
        <p>
          {String(record.name)} · {String(record.email)}
        </p>
      ) : null}
      <form onSubmit={save}>
        <fieldset disabled={busy || bulkBusy} className="form-grid">
          {resource === 'users' ? (
            <>
              <div className="wide">
                <p className="label">Access profile</p>
                <p className="hint">
                  Choose one role. Its feature access is applied automatically.
                </p>
                <div className="role-profile-grid">
                  {roleProfiles.map((role) => (
                    <label
                      key={role.code}
                      className={!customRoleId && selectedRole === role.code ? 'selected' : ''}
                    >
                      <input
                        type="radio"
                        name="accessProfile"
                        value={role.code}
                        checked={!customRoleId && selectedRole === role.code}
                        onChange={() => {
                          setCustomRoleId('');
                          setSelectedRole(role.code);
                          setWorkScope(workScopeForRole(role.code, workScope));
                          setChangeAccess(defaultChangeAccess(role.code));
                          if (role.code === 'USER') {
                            setWorkScope('CLIENT');
                            setChangeAccess('NONE');
                            setDepartmentIds([]);
                            setLeadDepartmentIds([]);
                          }
                          if (hasFullAccessRole(role.code)) {
                            setWorkScope('ALL');
                            setChangeAccess('CHANGE_MANAGER');
                          }
                        }}
                      />
                      <span>
                        <strong>{role.name}</strong>
                        <small>{role.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {customRoles.length ? <label className="wide custom-role-selection">Custom role
                <select value={customRoleId} disabled={!rolesReady} onChange={event => {
                  const id = event.target.value;
                  setCustomRoleId(id);
                  const profile = customRoles.find(role => role.code === 'custom-' + id);
                  if (profile?.baseRole) {
                    setSelectedRole(profile.baseRole);
                    if (profile.baseRole === 'USER') { setDepartmentIds([]); setLeadDepartmentIds([]); }
                    setWorkScope(workScopeForRole(profile.baseRole, profile.baseRole === 'INTERN' ? 'INTERNAL' : profile.baseRole === 'USER' ? 'CLIENT' : workScope));
                    setChangeAccess(defaultChangeAccess(profile.baseRole));
                  }
                }}><option value="">Use a built-in role above</option>{customRoles.map(role => <option key={role.code} value={role.code.slice(7)}>{role.name}</option>)}</select>
                <small className="hint">Choose a custom role instead of a built-in role. Its base profile controls the settings below.</small>
              </label> : null}
              {employeeUser ? <div className="wide admin-access-note"><strong>Company: Amnikon</strong><p>This User can raise and track their own internal requests. Customer MSP and client assignments are not required.</p></div> : null}
              {!hasFullAccessRole(selectedRole) && selectedRole !== 'USER' ? (
                <div className="wide form-grid">
                  <label>
                    Work scope
                    <select
                      value={workScope}
                      onChange={(e) => setWorkScope(e.target.value)}
                    >
                      <option value="CLIENT">Client work only</option>
                      <option value="BOTH">Internal and client work</option>
                      <option value="INTERNAL">Internal work only</option>
                    </select>
                    <small className="hint">Access follows this role and the MSPs selected below.</small>
                  </label>
                  <label>
                    Change Management access
                    <select
                      value={changeAccess}
                      onChange={(e) => setChangeAccess(e.target.value)}
                      disabled={selectedRole === 'TEAM_LEAD'}
                    >
                      {selectedRole !== 'TECHNICIAN' && selectedRole !== 'TEAM_LEAD' ? <option value="NONE">No Change Management access</option> : null}
                      <option value="CONTRIBUTOR">Raise changes and add updates</option>
                      <option value="COORDINATOR">Coordinate change work</option>
                      <option value="APPROVER">Approve assigned changes</option>
                      <option value="CHANGE_MANAGER">All change-workflow actions</option>
                    </select>
                    <small className="hint">{selectedRole === 'TEAM_LEAD'
                      ? 'All change-workflow actions are included with Team Lead access, within their assigned MSPs.'
                      : selectedRole === 'TECHNICIAN'
                        ? 'Technicians can raise changes. Higher change access stays within their assigned MSPs.'
                        : 'Controls Change Management only; it does not grant Administrator access.'}</small>
                  </label>
                  {selectedRole === 'INTERN' ? (
                    <RecordPicker
                      resource="users"
                      label="Supervisor"
                      value={supervisorUserId}
                      onChange={setSupervisorUserId}
                      request={request}
                    />
                  ) : null}
                </div>
              ) : null}
              {!hasFullAccessRole(selectedRole) && selectedRole !== 'USER' ? (
                <div className="wide access-selection-section">
                  <div className="access-scope-heading">
                    <div>
                      <p className="label">Internal routing (optional)</p>
                      <p className="hint">
                        Select this person's department for internal requests and approvals.
                      </p>
                    </div>
                    <span>{departmentIds.length} selected</span>
                  </div>
                  <RecordPicker
                    resource="departments"
                    label="Department"
                    value={department}
                    onChange={setDepartment}
                    request={request}
                    optional
                    emptyLabel="Select a department…"
                    allLabel="All active departments"
                    onSelectAll={() => void selectAllAccess('departments')}
                    activeOnly
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={!department || departmentIds.includes(department)}
                    onClick={() => {
                      setDepartmentIds([...departmentIds, department]);
                      setDepartment('');
                    }}
                  >
                    Add department
                  </button>
                  <ul className="memberships" aria-label="Selected departments">
                    {departmentIds.map((id, index) => (
                      <Membership
                        key={id}
                        id={id}
                        index={index}
                        resource="departments"
                        label="Department"
                        request={request}
                        lead={leadDepartmentIds.includes(id)}
                        onLeadChange={(checked) =>
                          setLeadDepartmentIds(
                            checked
                              ? [...new Set([...leadDepartmentIds, id])]
                              : leadDepartmentIds.filter((x) => x !== id),
                          )
                        }
                        remove={() => (
                          setDepartmentIds(
                            departmentIds.filter((x) => x !== id),
                          ),
                          setLeadDepartmentIds(
                            leadDepartmentIds.filter((x) => x !== id),
                          )
                        )}
                      />
                    ))}
                  </ul>
                  <label>
                    Individual expertise (optional)
                    <textarea
                      name="expertise"
                      rows={3}
                      maxLength={1000}
                      defaultValue={String(record?.expertise ?? '')}
                      placeholder="Microsoft 365, Exchange Online, Windows Server, networking…"
                    />
                  </label>
                </div>
              ) : null}
              {!hasFullAccessRole(selectedRole) &&
              ['CLIENT', 'BOTH'].includes(effectiveWorkScope) ? (
                <div className="wide access-selection-section">
                  <div className="access-scope-heading">
                    <div>
                      <p className="label">MSP access</p>
                      <p className="hint">
                        Select the MSPs this person supports, or choose All active MSPs.
                      </p>
                    </div>
                    <span>{clientIds.length} selected</span>
                  </div>
                  <RecordPicker
                    resource="clients"
                    label="MSP"
                    value={client}
                    onChange={setClient}
                    request={request}
                    optional
                    emptyLabel="Select an MSP…"
                    allLabel="All active MSPs"
                    onSelectAll={() => void selectAllAccess('clients')}
                    activeOnly
                    filterOptions={row => String(row.id) !== '00000000-0000-4000-8000-000000000132'}
                  />
                  <div className="access-selection-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={!client || clientIds.includes(client)}
                    onClick={() => {
                      setClientIds([...clientIds, client]);
                      setClient('');
                    }}
                  >
                    Add MSP
                  </button>
                  <button type="button" className="secondary" disabled={!clientIds.length}
                    onClick={() => { setClientIds([]); setSiteIds([]); setSiteClient(''); setSite(''); }}>
                    Clear MSPs
                  </button>
                  </div>
                  <ul className="memberships" aria-label="Selected MSPs">
                    {clientIds.map((id, index) => (
                      <Membership
                        key={id}
                        id={id}
                        index={index}
                        request={request}
                        label="MSP"
                        remove={() => {
                          setClientIds(clientIds.filter((c) => c !== id));
                          // Preserve selected-only coverage; never turn a narrowed selection into full coverage.
                          setSiteIds(previous => previous.filter(siteId => siteParents[siteId] && siteParents[siteId] !== id));
                          setSiteClient(''); setSite('');
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {!hasFullAccessRole(selectedRole) && ['CLIENT', 'BOTH'].includes(effectiveWorkScope) ? (
                <div className="wide access-selection-section">
                  <p className="label">Client coverage</p>
                  <p className="hint">
                    Access to all clients in the selected MSPs, or just the clients you choose.
                  </p>
                  <label>
                    Coverage
                    <select value={clientCoverage} disabled={!clientIds.length}
                      onChange={event => {
                        const value = event.target.value as 'all' | 'selected';
                        setClientCoverage(value);
                        if (value === 'all') { setSiteIds([]); setSiteClient(''); setSite(''); }
                      }}>
                      <option value="all">All clients in selected MSPs</option>
                      <option value="selected">Selected clients only</option>
                    </select>
                  </label>
                  {!clientIds.length ? <p className="hint">Add an MSP above first.</p> : null}
                  {clientCoverage === 'all' && clientIds.length ? <p className="hint">All current and future clients under these MSPs are covered. Other MSPs remain excluded.</p> : null}
                  {clientCoverage === 'selected' ? <>
                  <RecordPicker
                    resource="clients"
                    label="Assigned MSP"
                    value={siteClient}
                    onChange={(value) => {
                      setSiteClient(value);
                      setSite('');
                    }}
                    request={request}
                    optional
                    emptyLabel="Select an assigned MSP…"
                    filterOptions={row => clientIds.includes(String(row.id))}
                    activeOnly
                  />
                  {siteClient && clientIds.includes(siteClient) ? (
                    <RecordPicker
                      resource="sites"
                      label="Client"
                      value={site}
                      onChange={(value, row) => {
                        setSite(value);
                        if (row && typeof row.client_id === 'string')
                          setSiteParents(previous => ({...previous, [value]: String(row.client_id)}));
                      }}
                      request={request}
                      clientId={siteClient}
                      optional
                      emptyLabel="Select a client…"
                      activeOnly
                    />
                  ) : null}
                  <button
                    type="button"
                    className="secondary"
                    disabled={!site || siteIds.includes(site)}
                    onClick={() => {
                      setSiteIds([...siteIds, site]);
                      setSite('');
                    }}
                  >
                    Add client
                  </button>
                  <ul className="memberships">
                    {siteIds.map((id, index) => (
                      <Membership
                        key={id}
                        id={id}
                        index={index}
                        resource="sites"
                        label="Client"
                        request={request}
                        onRecord={row => {
                          if (typeof row.client_id === 'string') setSiteParents(previous =>
                            previous[id] === row.client_id ? previous : {...previous, [id]: String(row.client_id)});
                        }}
                        remove={() =>
                          setSiteIds(siteIds.filter((value) => value !== id))
                        }
                      />
                    ))}
                  </ul>
                  </> : null}
                </div>
              ) : null}
              {hasFullAccessRole(selectedRole) ? (
                <div className="wide admin-access-note">
                  <strong>{selectedRole === 'MANAGER' ? 'Manager — Amnikon' : 'Administrator — all workspaces and all MSPs'}</strong>
                  <p>
                    {selectedRole === 'MANAGER' ? 'Company: Amnikon. ' : ''}
                    All clients, internal work and Change Management are included automatically.
                    This role also manages people, permissions and system configuration. No MSP or client selection is required.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {['contacts', 'sites', 'assets'].includes(resource) ? (
                <RecordPicker
                  resource="clients"
                  label="Client"
                  value={client}
                  onChange={(v) => {
                    setClient(v);
                    setRelated('');
                  }}
                  request={request}
                  disabled={!!record}
                />
              ) : null}
              {(fields[resource] ?? []).map(([key, label, type]) => {
                const field = (
                <label key={key} className={type === 'textarea' ? 'wide' : ''}>
                  {label}
                  {type === 'textarea' ? (
                    <textarea
                      name={key}
                      rows={3}
                      maxLength={
                        resource === 'clients'
                          ? 4000
                          : resource === 'tags'
                            ? 1000
                            : 2000
                      }
                      defaultValue={String(record?.[snake(key)] ?? '')}
                    />
                  ) : (
                    <input
                      name={key}
                      type={type ?? 'text'}
                      disabled={
                        resource === 'sources' && !!record && key === 'code'
                      }
                      required={
                        key === 'name' ||
                        key === 'assetType' ||
                        key === 'code' ||
                        (key === 'primaryEmail' && (!record || String(record.primary_email ?? '').startsWith('@'))) ||
                        (key === 'ticketPrefix' && !!record)
                      }
                      placeholder={key === 'primaryEmail' ? '@company.com' : undefined}
                      pattern={
                        key === 'ticketPrefix'
                          ? resource === 'sites'
                            ? '[A-Z][A-Z0-9]{1,15}'
                            : '[A-Z][A-Z0-9]{1,7}'
                          : undefined
                      }
                      maxLength={
                        key === 'ticketPrefix'
                          ? resource === 'sites'
                            ? 16
                            : 8
                          : key === 'assetType' || resource === 'tags'
                            ? 100
                            : key.toLowerCase().includes('email')
                              ? 320
                              : key.toLowerCase().includes('phone')
                                ? 50
                                : key === 'externalReference'
                                  ? 500
                                  : 200
                      }
                      defaultValue={String(record?.[snake(key)] ?? '')}
                    />
                  )}
                  {key === 'primaryEmail' && (
                    <small>Enter the domain used by this client’s staff, such as @company.com. Add each person’s full email separately in People &amp; Permissions.</small>
                  )}
                  {key === 'ticketPrefix' ? (
                    <small>
                      {resource === 'sites' ? (
                        '2–16 uppercase letters/numbers, unique across customer and site prefixes. Leave blank when creating a site for automatic generation. Changes affect future tickets; the site sequence continues.'
                      ) : (
                        <>
                          2–8 uppercase letters/numbers. Leave blank for
                          automatic generation when creating a client. Prefix
                          changes apply only to future tickets.
                        </>
                      )}
                    </small>
                  ) : null}
                </label>
                );
                if (resource !== 'sites' || record || key !== 'name') return field;
                return (
                  <div key={key}>
                    {field}
                    <label>
                      Domain name (optional)
                      <input name="emailDomain" maxLength={253} placeholder="example.com" />
                      <small>Enter the requester’s work email domain, with or without a leading @.</small>
                    </label>
                  </div>
                );
              })}
              {['contacts', 'assets'].includes(resource) && client ? (
                <RecordPicker
                  resource="sites"
                  label={
                    resource === 'contacts'
                      ? 'Site (optional; leave blank for organization-wide)'
                      : 'Site'
                  }
                  value={related}
                  onChange={setRelated}
                  request={request}
                  clientId={client}
                  optional
                />
              ) : null}
              {resource === 'categories' ? (
                <RecordPicker
                  resource="categories"
                  label="Parent category"
                  value={related}
                  onChange={setRelated}
                  request={request}
                  optional
                />
              ) : null}
            </>
          )}
          {record ? (
            <label>
              Status
              <select
                name="active"
                defaultValue={String(
                  record.active ?? record.status === 'ACTIVE',
                )}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          ) : null}
          {record && resource === 'users' ? (
            <p className="hint wide">
              Saving access changes signs this user out of existing sessions. At
              least one active administrator must remain.
            </p>
          ) : null}
          <div className="wide">
            {error ? (
              <p className="notice error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="primary"
              disabled={busy || (resource === 'users' && !record && !verified)}
            >
              {busy
                ? 'Saving…'
                : record
                  ? 'Save changes'
                  : resource === 'users'
                    ? 'Add verified user'
                    : 'Add record'}
            </button>
          </div>
        </fieldset>
      </form>
      {isAdmin && resource === 'contacts' && record ? (
        <ContactPortalLink id={String(record.id)} request={request} />
      ) : null}
    </section>
  );
}
