'use client';
import { hasFullAccess } from '../../role-access';

import { useEffect, useState } from 'react';
import Link from '../../../navigation/link';
import { WorkspaceFrame, useWorkspace } from '../../workspace-tools';
import UiIcon from '../../ui-icon';
import './groups.css';

type Choice = {
  id: string;
  name: string;
  email?: string;
  client_id?: string;
  user_id?: string | null;
};
type Permission = { code: string; name: string; description: string };
type Options = {
  clients: Choice[];
  users: Choice[];
  contacts: Choice[];
  staffPermissions: Permission[];
  customerPermissions: Permission[];
};
type Group = {
  id: string;
  name: string;
  description: string;
  kind: 'CUSTOMER' | 'STAFF';
  client_id: string | null;
  client_name?: string;
  permissions: string[];
  active: boolean;
  revision: number;
  member_count: number;
  staff_members?: string[];
  customer_members?: string[];
};
type GroupPage = {
  items: Group[];
  total: number;
  page: number;
  pageSize: number;
};
export default function GroupsWorkspace() {
  const w = useWorkspace();
  const { request, setError, revision } = w;
  const admin = Boolean(hasFullAccess(w.session?.user.roles));
  const [options, setOptions] = useState<Options>();
  const [optionsError, setOptionsError] = useState('');
  const [data, setData] = useState<GroupPage>();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Group | null>();
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    void request<Options>('/admin/groups/options', { signal: abort.signal })
      .then((next) => {
        if (!abort.signal.aborted) {
          setOptions(next);
          setOptionsError('');
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setOptions(undefined);
          setOptionsError(`Group choices could not be loaded: ${e.message}`);
        }
      });
    return () => abort.abort();
  }, [admin, request, revision]);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setData(undefined);
      setError('');
      void request<GroupPage>(
        `/admin/groups?kind=${kind}&q=${encodeURIComponent(search)}&page=${page}`,
        { signal: abort.signal },
      )
        .then((next) => {
          if (!abort.signal.aborted) setData(next);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [admin, request, setError, revision, kind, search, page]);
  async function edit(id: string) {
    setOpening(true);
    w.setError('');
    try {
      setEditor(await w.request<Group>(`/admin/groups/${id}`));
    } catch (e) {
      w.setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  const error =
    w.error ||
    optionsError ||
    (w.session && !admin
      ? 'Administrator access is required to manage groups.'
      : '');
  return (
    <WorkspaceFrame
      title="Customer & staff groups"
      description="Bring people together and grant the access they need."
      user={w.session?.user}
      csrfToken={w.session?.csrfToken}
      error={error}
      notice={w.notice}
    >
      {admin ? (
        <div className="groups-workspace">
          <section className="groups-intro">
            <div>
              <span className="groups-kicker">CUSTOMERS / GROUPS & ACCESS</span>
              <h2>One group. Shared access.</h2>
              <p>
                Create customer contact groups or staff groups, choose
                permissions, and manage membership in one place.
              </p>
            </div>
            <button
              className="primary"
              disabled={!options || opening || w.busy}
              onClick={() => {
                setEditor(null);
                w.setNotice('');
              }}
            >
              <UiIcon name="team" /> Create group
            </button>
          </section>
          <div className="groups-type-cards">
            <div>
              <strong>Customer groups</strong>
              <p>
                Contacts from one customer organization. Organization ticket
                view and reply access in the authenticated client workspace.
              </p>
            </div>
            <div>
              <strong>Staff groups</strong>
              <p>
                Operational permissions for staff. Each member keeps their
                existing customer assignments, site scope and workspace role.
              </p>
            </div>
          </div>
          {editor !== undefined && options ? (
            <GroupEditor
              key={editor?.id ?? 'new'}
              group={editor ?? undefined}
              options={options}
              busy={w.busy}
              onCancel={() => setEditor(undefined)}
              onSave={async (body) => {
                await w.save(
                  `/admin/groups${editor?.id ? `/${editor.id}` : ''}`,
                  body,
                  editor ? 'PATCH' : 'POST',
                );
                setEditor(undefined);
                w.setNotice(
                  'Group saved. Permission changes apply on the next request.',
                );
              }}
            />
          ) : null}
          <section className="panel groups-list">
            <div className="groups-toolbar">
              <h2>Groups {data ? <small>({data.total})</small> : null}</h2>
              <label>
                Search groups
                <input
                  type="search"
                  placeholder="Group or customer name"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Group type
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All groups</option>
                  <option value="CUSTOMER">Customer groups</option>
                  <option value="STAFF">Staff groups</option>
                </select>
              </label>
              <button
                className="secondary"
                disabled={loading}
                onClick={w.refresh}
              >
                Refresh
              </button>
            </div>
            {loading || (!data && !w.error) ? (
              <p role="status" className="empty">
                Loading groups…
              </p>
            ) : data?.items.length ? (
              <div className="groups-records">
                {data.items.map((group) => (
                  <article className="group-record" key={group.id}>
                    <div className={`group-symbol ${group.kind.toLowerCase()}`}>
                      <UiIcon
                        name={group.kind === 'STAFF' ? 'team' : 'clients'}
                      />
                    </div>
                    <div className="group-record-text">
                      <h3>
                        {group.name}
                        <span
                          className={`group-state ${group.active ? '' : 'inactive'}`}
                        >
                          {group.active ? 'Active' : 'Inactive'}
                        </span>
                      </h3>
                      <p>
                        {group.kind === 'CUSTOMER'
                          ? group.client_name
                          : 'Staff · existing assigned scope'}{' '}
                        · {group.member_count}{' '}
                        {group.member_count === 1 ? 'member' : 'members'}
                      </p>
                      {group.description ? <p>{group.description}</p> : null}
                      <div className="group-permission-tags">
                        {group.permissions.length ? (
                          group.permissions.map((code) => (
                            <span key={code}>
                              {[
                                ...(options?.customerPermissions ?? []),
                                ...(options?.staffPermissions ?? []),
                              ].find((p) => p.code === code)?.name ?? code}
                            </span>
                          ))
                        ) : (
                          <span>No additional permissions</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="secondary"
                      disabled={opening || w.busy}
                      onClick={() => void edit(group.id)}
                    >
                      Manage group<span className="sr-only"> {group.name}</span>
                    </button>
                  </article>
                ))}
              </div>
            ) : data ? (
              <div className="empty">
                <h3>No groups found</h3>
                <p>
                  {search || kind !== 'ALL'
                    ? 'Adjust your search or group type.'
                    : 'Create your first group to manage shared permissions.'}
                </p>
              </div>
            ) : (
              <button className="secondary" onClick={w.refresh}>
                Retry loading groups
              </button>
            )}
            {data && data.total > 20 ? (
              <div className="groups-pagination">
                <button
                  className="secondary"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.ceil(data.total / 20)}
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= data.total || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </WorkspaceFrame>
  );
}
type Draft = {
  name: string;
  description: string;
  kind: 'CUSTOMER' | 'STAFF';
  clientId?: string;
  permissions: string[];
  memberIds: string[];
  active: boolean;
  revision?: number;
};
function GroupEditor({
  group,
  options,
  busy,
  onSave,
  onCancel,
}: {
  group?: Group;
  options: Options;
  busy: boolean;
  onSave: (body: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    kind: group?.kind ?? 'CUSTOMER',
    clientId: group?.client_id ?? undefined,
    permissions: group?.permissions ?? [],
    memberIds:
      (group?.kind === 'STAFF'
        ? group.staff_members
        : group?.customer_members) ?? [],
    active: group?.active ?? true,
    revision: group?.revision,
  });
  const [memberSearch, setMemberSearch] = useState('');
  const [error, setError] = useState('');
  const members =
    draft.kind === 'STAFF'
      ? options.users
      : options.contacts.filter((c) => c.client_id === draft.clientId);
  const catalog =
    draft.kind === 'STAFF'
      ? options.staffPermissions
      : options.customerPermissions;
  const filtered = members.filter((m) =>
    `${m.name} ${m.email ?? ''}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase()),
  );
  const missing = draft.memberIds.filter(
    (id) => !members.some((m) => m.id === id),
  );
  function permission(code: string, checked: boolean) {
    setDraft((d) => {
      let permissions = checked
        ? [...d.permissions, code]
        : d.permissions.filter((p) => p !== code);
      if (code === 'PORTAL_ORGANIZATION_REPLY' && checked)
        permissions.push('PORTAL_ORGANIZATION_VIEW');
      if (code === 'PORTAL_ORGANIZATION_VIEW' && !checked)
        permissions = permissions.filter(
          (p) => p !== 'PORTAL_ORGANIZATION_REPLY',
        );
      return { ...d, permissions: [...new Set(permissions)] };
    });
  }
  return (
    <form
      className="panel group-editor"
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        void onSave(draft).catch((e) => setError(e.message));
      }}
    >
      <div className="groups-toolbar">
        <h2>{group ? 'Manage group' : 'Create group'}</h2>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset disabled={busy}>
        <div className="group-fields">
          <label>
            Group name
            <input
              required
              minLength={2}
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Group type
            <select
              disabled={Boolean(group)}
              value={draft.kind}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  kind: e.target.value as Draft['kind'],
                  clientId: undefined,
                  memberIds: [],
                  permissions: [],
                });
                setMemberSearch('');
              }}
            >
              <option value="CUSTOMER">Customer contacts</option>
              <option value="STAFF">Internal staff</option>
            </select>
          </label>
          {draft.kind === 'CUSTOMER' ? (
            <label>
              Customer organization
              <select
                required
                disabled={Boolean(group)}
                value={draft.clientId ?? ''}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    clientId: e.target.value || undefined,
                    memberIds: [],
                  });
                  setMemberSearch('');
                }}
              >
                <option value="">Select customer</option>
                {options.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="group-scope">
              <strong>Existing staff scope</strong>
              <p>
                Permissions apply within each member’s assigned customers and
                sites. This group does not assign customers, sites or roles.
              </p>
            </div>
          )}
          <label>
            Description
            <input
              maxLength={500}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
        </div>
        <div className="group-editor-columns">
          <section>
            <h3>Permissions</h3>
            <p className="hint">
              {draft.kind === 'CUSTOMER'
                ? 'Customer groups add organization ticket access. Personal ticket access remains available.'
                : 'Add operational permissions to the existing workspace role.'}
            </p>
            {catalog.map((p) => (
              <label className="group-check" key={p.code}>
                <input
                  type="checkbox"
                  checked={draft.permissions.includes(p.code)}
                  onChange={(e) => permission(p.code, e.target.checked)}
                />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.description}</small>
                </span>
              </label>
            ))}
          </section>
          <section>
            <h3>
              Members <span>({draft.memberIds.length}/200)</span>
            </h3>
            <label>
              Find members
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Name or email"
              />
            </label>
            <div className="group-member-list">
              {missing.map((id) => (
                <label className="group-check" key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      setDraft({
                        ...draft,
                        memberIds: draft.memberIds.filter((m) => m !== id),
                      })
                    }
                  />
                  <span>
                    <strong>Unavailable member</strong>
                    <small>{id} · remove before saving</small>
                  </span>
                </label>
              ))}
              {filtered.map((m) => (
                <label className="group-check" key={m.id}>
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(m.id)}
                    disabled={
                      !draft.memberIds.includes(m.id) &&
                      draft.memberIds.length >= 200
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        memberIds: e.target.checked
                          ? [...draft.memberIds, m.id]
                          : draft.memberIds.filter((id) => id !== m.id),
                      })
                    }
                  />
                  <span>
                    <strong>{m.name}</strong>
                    <small>{m.email ?? ''}</small>
                    {draft.kind === 'CUSTOMER' && !m.user_id ? (
                      <small>
                        Link a client account before this contact can use group
                        access.
                      </small>
                    ) : null}
                  </span>
                </label>
              ))}
              {!filtered.length ? (
                <p className="empty">
                  {draft.kind === 'CUSTOMER' && !draft.clientId
                    ? 'Select a customer to choose contacts.'
                    : 'No matching members.'}
                </p>
              ) : null}
            </div>
            {draft.kind === 'CUSTOMER' ? (
              <p className="hint">
                Account links are managed under{' '}
                <Link href="/admin/contacts">Contacts</Link>. Group access
                applies in the signed-in client workspace; the email
                verification support form is for ticket submission.
              </p>
            ) : null}
          </section>
        </div>
        <label className="group-check group-active">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          <span>
            <strong>Group active</strong>
            <small>
              Inactive groups retain their members and history but grant no
              additional access.
            </small>
          </span>
        </label>
        <button className="primary" disabled={busy || missing.length > 0}>
          {busy ? 'Saving…' : group ? 'Save group' : 'Create group'}
        </button>
      </fieldset>
    </form>
  );
}
