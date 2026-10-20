'use client';
import { FormEvent, useEffect, useState } from 'react';
import ContactPortalLink from './contact-portal-link';
export type Row = Record<string, unknown>;
export type Request = (path: string, init?: RequestInit) => Promise<unknown>;
const roleProfiles = [
  {
    code: 'USER',
    name: 'Client user',
    description:
      'Own support tickets, public replies and published guidance. An administrator must link the account to a client contact.',
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
      'Work assigned tickets, use authorized site-team queues, assign or transfer work, reply and add internal notes.',
  },
  {
    code: 'TEAM_LEAD',
    name: 'Team Lead',
    description:
      'Technician access plus team oversight, category and tag maintenance, and operational reports.',
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description:
      'Team Lead access plus approvals, SLA management, complete reporting and audit review.',
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
    ['primaryEmail', 'Primary email', 'email'],
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

export function RecordPicker({
  resource,
  label,
  value,
  onChange,
  request,
  clientId,
  optional = false,
  disabled = false,
}: {
  resource: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  request: Request;
  clientId?: string;
  optional?: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number }>({
    items: [],
    total: 0,
  });
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void request(
        `/admin/${resource}?pageSize=50&page=${page}&q=${encodeURIComponent(search)}${clientId ? `&clientId=${clientId}` : ''}`,
      )
        .then((result) => {
          if (live) {
            setData(result as typeof data);
            setError('');
          }
        })
        .catch(() => {
          if (live)
            setError('Could not load options. Change the search to retry.');
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [resource, page, search, clientId, request]);
  return (
    <div className="picker">
      <label>
        {label}
        <input
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={search}
          disabled={disabled}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={label}
          value={value}
          required={!optional}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{optional ? 'None' : 'Select…'}</option>
          {value && !data.items.some((row) => row.id === value) ? (
            <option value={value}>Current selection</option>
          ) : null}
          {data.items.map((row) => (
            <option key={String(row.id)} value={String(row.id)}>
              {String(row.name)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {data.total > 50 ? (
        <div className="pager">
          <button
            type="button"
            disabled={page === 1 || disabled}
            onClick={() => setPage(page - 1)}
          >
            Previous options
          </button>
          <span>{page}</span>
          <button
            type="button"
            disabled={page * 50 >= data.total || disabled}
            onClick={() => setPage(page + 1)}
          >
            More options
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Membership({
  id,
  index,
  resource = 'clients',
  label = 'Client access',
  request,
  remove,
  lead,
  onLeadChange,
}: {
  id: string;
  index: number;
  resource?: string;
  label?: string;
  request: Request;
  remove: () => void;
  lead?: boolean;
  onLeadChange?: (value: boolean) => void;
}) {
  const [name, setName] = useState(`${label} ${index + 1}`);
  useEffect(() => {
    let live = true;
    void request(`/admin/${resource}?q=${id}&pageSize=1`)
      .then((value) => {
        const row = (value as { items: Row[] }).items[0];
        if (live && row) setName(String(row.name));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, request, resource]);
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
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<Row>();
  const [matches, setMatches] = useState<Row[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [selectedRole, setSelectedRole] = useState(() => initialRole(record));
  const [workScope, setWorkScope] = useState(
    String(
      record?.work_scope ??
        (initialRole(record) === 'INTERN' ? 'INTERNAL' : 'CLIENT'),
    ),
  );
  const [changeAccess, setChangeAccess] = useState(
    String(record?.change_access ?? 'NONE'),
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
  const [related, setRelated] = useState(
    String(record?.site_id ?? record?.parent_id ?? ''),
  );
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
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      let payload: Row;
      if (resource === 'users') {
        if (!record && !verified)
          throw new Error('Search and select an Entra account first.');
        if (
          selectedRole !== 'ADMIN' &&
          ['CLIENT', 'BOTH'].includes(workScope) &&
          !clientIds.length
        )
          throw new Error('Select at least one client for this staff member.');
        payload = {
          roles: [selectedRole],
          clientIds: selectedRole === 'ADMIN' ? [] : clientIds,
          siteIds: selectedRole === 'ADMIN' ? [] : siteIds,
          workScope:
            selectedRole === 'ADMIN'
              ? 'ALL'
              : selectedRole === 'USER'
                ? 'CLIENT'
                : workScope,
          changeAccess:
            selectedRole === 'ADMIN'
              ? 'CHANGE_MANAGER'
              : selectedRole === 'USER'
                ? 'NONE'
                : changeAccess,
          supervisorUserId:
            selectedRole === 'INTERN' ? supervisorUserId : undefined,
          departmentIds,
          leadDepartmentIds: leadDepartmentIds.filter((id) =>
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
        <button className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
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
        <fieldset disabled={busy} className="form-grid">
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
                      className={selectedRole === role.code ? 'selected' : ''}
                    >
                      <input
                        type="radio"
                        name="accessProfile"
                        value={role.code}
                        checked={selectedRole === role.code}
                        onChange={() => {
                          setSelectedRole(role.code);
                          if (role.code === 'INTERN') setWorkScope('INTERNAL');
                          if (role.code === 'USER') {
                            setWorkScope('CLIENT');
                            setChangeAccess('NONE');
                            setDepartmentIds([]);
                            setLeadDepartmentIds([]);
                          }
                          if (role.code === 'ADMIN') {
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
              {selectedRole !== 'ADMIN' && selectedRole !== 'USER' ? (
                <div className="wide form-grid">
                  <label>
                    Work scope
                    <select
                      value={workScope}
                      onChange={(e) => setWorkScope(e.target.value)}
                    >
                      <option value="INTERNAL">
                        Internal organization only
                      </option>
                      <option value="CLIENT">Client work only</option>
                      <option value="BOTH">Internal and client work</option>
                    </select>
                  </label>
                  <label>
                    Change Management access
                    <select
                      value={changeAccess}
                      onChange={(e) => setChangeAccess(e.target.value)}
                    >
                      <option value="NONE">No access</option>
                      <option value="CONTRIBUTOR">Contributor</option>
                      <option value="COORDINATOR">Coordinator</option>
                      <option value="APPROVER">Approver</option>
                      <option value="CHANGE_MANAGER">Change Manager</option>
                    </select>
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
              {selectedRole !== 'ADMIN' && selectedRole !== 'USER' ? (
                <div className="wide">
                  <div className="access-scope-heading">
                    <div>
                      <p className="label">Internal routing (optional)</p>
                      <p className="hint">
                        Assign only when this person belongs to an internal
                        operational team. This is used for internal tickets,
                        Change teams/approvals and specialist-help requests. It
                        does not grant client access or general permissions.
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
                  <ul className="memberships">
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
              {selectedRole !== 'ADMIN' &&
              ['CLIENT', 'BOTH'].includes(workScope) ? (
                <div className="wide">
                  <div className="access-scope-heading">
                    <div>
                      <p className="label">Client access</p>
                      <p className="hint">
                        This person can work only with the clients added below.
                        Multiple clients are supported.
                      </p>
                    </div>
                    <span>{clientIds.length} selected</span>
                  </div>
                  <RecordPicker
                    resource="clients"
                    label="Find a client"
                    value={client}
                    onChange={setClient}
                    request={request}
                    optional
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={!client || clientIds.includes(client)}
                    onClick={() => {
                      setClientIds([...clientIds, client]);
                      setClient('');
                    }}
                  >
                    Add selected client
                  </button>
                  <ul className="memberships">
                    {clientIds.map((id, index) => (
                      <Membership
                        key={id}
                        id={id}
                        index={index}
                        request={request}
                        remove={() =>
                          setClientIds(clientIds.filter((c) => c !== id))
                        }
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {selectedRole !== 'ADMIN' ? (
                <div className="wide">
                  <p className="label">Site access</p>
                  <p className="hint">
                    Optional. If no site is selected, access covers all sites of
                    the assigned clients. If sites are selected, Site Team
                    Tickets is restricted to those locations.
                  </p>
                  <RecordPicker
                    resource="clients"
                    label="Assigned client"
                    value={siteClient}
                    onChange={(value) => {
                      setSiteClient(value);
                      setSite('');
                    }}
                    request={request}
                    optional
                  />
                  {siteClient && clientIds.includes(siteClient) ? (
                    <RecordPicker
                      resource="sites"
                      label="Site"
                      value={site}
                      onChange={setSite}
                      request={request}
                      clientId={siteClient}
                      optional
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
                    Add selected site
                  </button>
                  <ul className="memberships">
                    {siteIds.map((id, index) => (
                      <Membership
                        key={id}
                        id={id}
                        index={index}
                        resource="sites"
                        label="Site access"
                        request={request}
                        remove={() =>
                          setSiteIds(siteIds.filter((value) => value !== id))
                        }
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {selectedRole === 'ADMIN' ? (
                <div className="wide admin-access-note">
                  <strong>Administrator has full system access</strong>
                  <p>
                    Client and site restrictions do not apply to administrators.
                    Administrators can create, assign, own and receive tickets
                    while also managing the complete service-desk configuration.
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
              {(fields[resource] ?? []).map(([key, label, type]) => (
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
                        (key === 'ticketPrefix' && !!record)
                      }
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
              ))}
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
