'use client';
import { useEffect, useState } from 'react';
import {
  WorkspaceFrame,
  useWorkspace,
  field,
  optionalField,
  isoTime,
  localTime,
  SelectOptions,
  type Option,
} from '../../components/layout/DashboardLayout/WorkspaceFrame';
export type ChangeTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  implementation_plan: string;
  test_plan: string;
  rollback_plan: string;
  active: boolean;
};
type Group = {
  id: string;
  name: string;
  quorum: number;
  member_ids: string[];
  active: boolean;
};
type Blackout = {
  id: string;
  name: string;
  client_id?: string;
  site_id?: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
};
export type GovernanceConfig = {
  policy: {
    high_risk_cab: boolean;
    minimum_approvals: number;
    review_required: boolean;
  };
  groups: Group[];
  templates: ChangeTemplate[];
  blackouts: Blackout[];
};
export default function GovernanceAdministration() {
  const w = useWorkspace();
  const { session, request, revision, setError } = w;
  const [config, setConfig] = useState<GovernanceConfig>();
  const [options, setOptions] = useState<{
    users: Option[];
    clients: Option[];
    sites: Option[];
  }>({ users: [], clients: [], sites: [] });
  const [group, setGroup] = useState<Group>();
  const [template, setTemplate] = useState<ChangeTemplate>();
  const [blackout, setBlackout] = useState<Blackout>();
  const [client, setClient] = useState('');
  useEffect(() => {
    if (!session?.user.roles.includes('ADMIN')) return;
    let live = true;
    void Promise.all([
      request<GovernanceConfig>('/change-governance'),
      request<typeof options>('/changes/options'),
    ])
      .then(([c, o]) => {
        if (live) {
          setConfig(c);
          setOptions(o);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [request, session, revision, setError]);
  return (
    <WorkspaceFrame
      title="CAB & change policy"
      description="Set independent review requirements, reusable plans and maintenance blackouts."
      user={session?.user}
      csrfToken={session?.csrfToken}
      error={w.error}
      notice={w.notice}
    >
      {!session?.user.roles.includes('ADMIN') ? (
        <p>Administrator access is required.</p>
      ) : config ? (
        <>
          <form
            className="panel v38-stack"
            key={`policy-${revision}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void w
                .save(
                  '/change-governance/policy',
                  {
                    highRiskCab: f.has('highRiskCab'),
                    minimumApprovals: Number(field(f, 'minimum')),
                    reviewRequired: f.has('reviewRequired'),
                  },
                  'PATCH',
                )
                .catch(() => {});
            }}
          >
            <h2>Approval policy</h2>
            <p>
              Owners and requesters cannot approve their own changes. Decisions
              apply to one revision; revising the schedule or implementation
              plan starts a fresh assessment.
            </p>
            <label className="v38-check">
              <input
                type="checkbox"
                name="highRiskCab"
                defaultChecked={config.policy.high_risk_cab}
              />
              Require CAB for high and critical risk changes
            </label>
            <label>
              Minimum independent approvals
              <input
                type="number"
                name="minimum"
                min={1}
                max={10}
                required
                defaultValue={config.policy.minimum_approvals}
              />
            </label>
            <label className="v38-check">
              <input
                type="checkbox"
                name="reviewRequired"
                defaultChecked={config.policy.review_required}
              />
              Require a post-implementation review before closure
            </label>
            <p>
              Emergency changes always require a review. Existing approved
              changes are checked against the policy before scheduling or
              starting.
            </p>
            <button disabled={w.busy} className="primary">
              Save policy
            </button>
          </form>
          <section className="panel v38-stack">
            <h2>CAB groups</h2>
            <p>
              A CAB group is a set of named reviewers. Quorum is the number of
              distinct approvals needed. Members must have Change Management
              access and access to the affected client.
            </p>
            <div className="v38-row">
              {config.groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="secondary"
                  onClick={() => setGroup(g)}
                >
                  {g.name} · {g.quorum} approvals {g.active ? '' : '· Inactive'}
                </button>
              ))}
              <button
                className="secondary"
                type="button"
                onClick={() => setGroup(undefined)}
              >
                New group
              </button>
            </div>
            <form
              className="v38-stack"
              key={group?.id ?? `new-group-${revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void w
                  .save(
                    `/change-governance/groups${group ? `/${group.id}` : ''}`,
                    {
                      name: field(f, 'name'),
                      quorum: Number(field(f, 'quorum')),
                      memberIds: f.getAll('members'),
                      active: f.has('active'),
                    },
                    group ? 'PATCH' : 'POST',
                  )
                  .then(() => setGroup(undefined))
                  .catch(() => {});
              }}
            >
              <div className="v38-form-grid">
                <label>
                  Group name
                  <input
                    name="name"
                    minLength={2}
                    maxLength={100}
                    required
                    defaultValue={group?.name}
                  />
                </label>
                <label>
                  Quorum
                  <input
                    name="quorum"
                    type="number"
                    min={1}
                    max={50}
                    required
                    defaultValue={group?.quorum ?? 1}
                  />
                </label>
              </div>
              <label>
                Reviewers (Ctrl / Command to select multiple)
                <select
                  name="members"
                  multiple
                  size={7}
                  required
                  defaultValue={group?.member_ids ?? []}
                >
                  <SelectOptions items={options.users} />
                </select>
              </label>
              <label className="v38-check">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={group?.active ?? true}
                />
                Active
              </label>
              <button className="primary" disabled={w.busy}>
                Save CAB group
              </button>
            </form>
          </section>
          <section className="panel v38-stack">
            <h2>Reusable change templates</h2>
            <p>Templates fill in a new change. They do not bypass approval.</p>
            <div className="v38-row">
              {config.templates.map((t) => (
                <button
                  className="secondary"
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t)}
                >
                  {t.name} {t.active ? '' : '· Inactive'}
                </button>
              ))}
              <button
                className="secondary"
                type="button"
                onClick={() => setTemplate(undefined)}
              >
                New template
              </button>
            </div>
            <form
              key={template?.id ?? `new-template-${revision}`}
              className="v38-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void w
                  .save(
                    `/change-governance/templates${template ? `/${template.id}` : ''}`,
                    {
                      name: field(f, 'name'),
                      category: field(f, 'category'),
                      description: field(f, 'description'),
                      implementationPlan: field(f, 'implementationPlan'),
                      testPlan: field(f, 'testPlan'),
                      rollbackPlan: field(f, 'rollbackPlan'),
                      active: f.has('active'),
                    },
                    template ? 'PATCH' : 'POST',
                  )
                  .then(() => setTemplate(undefined))
                  .catch(() => {});
              }}
            >
              <label>
                Name
                <input
                  required
                  name="name"
                  minLength={2}
                  maxLength={150}
                  defaultValue={template?.name}
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={template?.category ?? 'SERVER'}
                >
                  {[
                    'SERVER',
                    'CLOUD',
                    'MICROSOFT_365',
                    'NETWORK',
                    'SECURITY',
                    'APPLICATION',
                    'OTHER',
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {(
                [
                  ['description', 'Description', 'description'],
                  [
                    'implementationPlan',
                    'Implementation plan',
                    'implementation_plan',
                  ],
                  ['testPlan', 'Validation / test plan', 'test_plan'],
                  ['rollbackPlan', 'Rollback plan', 'rollback_plan'],
                ] as const
              ).map(([name, label, key]) => (
                <label key={name}>
                  {label}
                  <textarea
                    name={name}
                    required
                    minLength={3}
                    maxLength={10000}
                    defaultValue={template?.[key]}
                  />
                </label>
              ))}
              <label className="v38-check">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={template?.active ?? true}
                />
                Active
              </label>
              <button className="primary" disabled={w.busy}>
                Save template
              </button>
            </form>
          </section>
          <section className="panel v38-stack">
            <h2>Maintenance blackouts</h2>
            <p>
              Blackouts block scheduling and starting overlapping changes. An
              administrator or Change Manager can record a justified override.
              Times use your browser’s time zone.
            </p>
            <div className="v38-row">
              {config.blackouts.map((b) => (
                <button
                  className="secondary"
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBlackout(b);
                    setClient(b.client_id ?? '');
                  }}
                >
                  {b.name} · {new Date(b.starts_at).toLocaleDateString()}{' '}
                  {b.active ? '' : '· Inactive'}
                </button>
              ))}
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setBlackout(undefined);
                  setClient('');
                }}
              >
                New blackout
              </button>
            </div>
            <form
              className="v38-stack"
              key={blackout?.id ?? `new-blackout-${revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void w
                  .save(
                    `/change-governance/blackouts${blackout ? `/${blackout.id}` : ''}`,
                    {
                      name: field(f, 'name'),
                      clientId: client || undefined,
                      siteId: optionalField(f, 'site'),
                      startsAt: isoTime(f, 'start'),
                      endsAt: isoTime(f, 'end'),
                      active: f.has('active'),
                    },
                    blackout ? 'PATCH' : 'POST',
                  )
                  .then(() => {
                    setBlackout(undefined);
                    setClient('');
                  })
                  .catch(() => {});
              }}
            >
              <label>
                Name
                <input
                  required
                  name="name"
                  minLength={2}
                  maxLength={200}
                  defaultValue={blackout?.name}
                />
              </label>
              <div className="v38-form-grid">
                <label>
                  Organization
                  <select
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                  >
                    <option value="">All organizations</option>
                    <SelectOptions items={options.clients} />
                  </select>
                </label>
                <label>
                  Site
                  <select
                    key={`${client}-${blackout?.id}`}
                    name="site"
                    defaultValue={
                      blackout?.client_id === client
                        ? (blackout.site_id ?? '')
                        : ''
                    }
                  >
                    <option value="">All sites</option>
                    <SelectOptions
                      items={options.sites.filter(
                        (s) => s.client_id === client,
                      )}
                    />
                  </select>
                </label>
                <label>
                  Starts
                  <input
                    name="start"
                    required
                    type="datetime-local"
                    defaultValue={localTime(blackout?.starts_at)}
                  />
                </label>
                <label>
                  Ends
                  <input
                    name="end"
                    required
                    type="datetime-local"
                    defaultValue={localTime(blackout?.ends_at)}
                  />
                </label>
              </div>
              <label className="v38-check">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={blackout?.active ?? true}
                />
                Active
              </label>
              <button className="primary" disabled={w.busy}>
                Save blackout
              </button>
            </form>
          </section>
        </>
      ) : (
        <p>Loading change policy…</p>
      )}
    </WorkspaceFrame>
  );
}
