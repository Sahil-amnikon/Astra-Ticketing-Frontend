'use client';
import ExpandablePanel from '../../components/ui/ExpandablePanel';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  field,
  isoTime,
  localTime,
  type WorkspaceUser,
} from '../../components/layout/DashboardLayout/WorkspaceFrame';
import type { GovernanceConfig } from '../../Admin/change-governance/governance-administration';
type Row = Record<string, unknown>;
type Governance = {
  readiness: {
    ready: boolean;
    reasons: string[];
    approved: number;
    cabApproved: number;
  };
  conflicts: {
    changes: Row[];
    blackouts: Row[];
    restrictedConflictCount: number;
  };
  reviews: Row[];
};
export default function ChangeGovernancePanel({
  change,
  user,
  revision,
  request,
  submit,
}: {
  change: Row;
  user: WorkspaceUser;
  revision: number;
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  submit: (path: string, body: Row, method?: string) => Promise<unknown>;
}) {
  const [config, setConfig] = useState<GovernanceConfig>();
  const [data, setData] = useState<Governance>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = String(change.id);
  const coordinator =
    user.workspace !== 'admin' &&
    (user.roles.includes('ADMIN') ||
      ['COORDINATOR', 'CHANGE_MANAGER'].includes(user.changeAccess ?? ''));
  useEffect(() => {
    let live = true;
    void Promise.all([
      request('/change-governance'),
      request(`/change-governance/${id}`),
    ])
      .then(([c, d]) => {
        if (live) {
          setConfig(c as GovernanceConfig);
          setData(d as Governance);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [request, id, revision]);
  const save = async (path: string, body: Row, method?: string) => {
    setBusy(true);
    try {
      await submit(path, body, method);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ExpandablePanel title="CAB, scheduling & review" className="v38-stack">
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <div className="v38-row">
            <span className="v38-chip">Revision {String(change.revision)}</span>
            <span className="v38-chip">
              {data.readiness.approved} independent approvals
            </span>
            <span className="v38-chip">
              {data.readiness.cabApproved} CAB approvals
            </span>
          </div>
          {data.readiness.reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
          {data.readiness.ready ? (
            <p>Approval requirements satisfied for this revision.</p>
          ) : null}
          <h3>Schedule conflicts</h3>
          {!change.planned_start || !change.planned_end ? (
            <p>Set a planned start and end to check conflicts.</p>
          ) : !data.conflicts.changes.length &&
            !data.conflicts.blackouts.length &&
            !data.conflicts.restrictedConflictCount ? (
            <p>
              No overlapping active change or blackout was found for this
              schedule.
            </p>
          ) : (
            <ul>
              {data.conflicts.changes.map((c) => (
                <li key={String(c.id)}>
                  <Link
                    href={`/changes/${String(c.id)}${user.workspace ? `?workspace=${encodeURIComponent(user.workspace)}` : ''}`}
                  >
                    {String(c.change_number)} — {String(c.title)}
                  </Link>
                  : {String(c.reason)}
                </li>
              ))}
              {data.conflicts.blackouts.map((b) => (
                <li key={String(b.id)}>
                  Blackout: {String(b.name)} ·{' '}
                  {new Date(String(b.starts_at)).toLocaleString()}
                </li>
              ))}
              {data.conflicts.restrictedConflictCount ? (
                <li>
                  {data.conflicts.restrictedConflictCount} overlapping change(s)
                  outside your record access. Ask your Change Manager to review.
                </li>
              ) : null}
            </ul>
          )}
          {coordinator &&
          ['DRAFT', 'SUBMITTED', 'ASSESSMENT'].includes(
            String(change.status),
          ) &&
          !change.cab_group_id ? (
            <form
              className="v38-row"
              onSubmit={(e) => {
                e.preventDefault();
                void save(`/change-governance/${id}/cab`, {
                  groupId: field(new FormData(e.currentTarget), 'group'),
                }).catch((e) => setError(e.message));
              }}
            >
              <label>
                CAB group
                <select name="group" required>
                  <option value="">Select group</option>
                  {config?.groups
                    .filter((g) => g.active !== false)
                    .map((g) => (
                      <option value={g.id} key={g.id}>
                        {g.name} · quorum {g.quorum}
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Request CAB review
              </button>
            </form>
          ) : null}
          {coordinator &&
          [
            'DRAFT',
            'SUBMITTED',
            'ASSESSMENT',
            'AWAITING_APPROVAL',
            'APPROVED',
            'SCHEDULED',
          ].includes(String(change.status)) ? (
            <details>
              <summary>
                Revise schedule, resources or implementation plan
              </summary>
              <p>
                Saving starts a new revision and clears approval readiness.
                Previous decisions remain in history.
              </p>
              <form
                className="v38-stack"
                key={`amend-${change.revision}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void save(
                    `/change-governance/${id}`,
                    {
                      revision: Number(change.revision),
                      reason: field(f, 'reason'),
                      plannedStart: isoTime(f, 'start'),
                      plannedEnd: isoTime(f, 'end'),
                      risk: field(f, 'risk'),
                      affectedResources: field(f, 'resources')
                        .split(/[,\n]/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                      implementationPlan: field(f, 'implementation'),
                      testPlan: field(f, 'test'),
                      rollbackPlan: field(f, 'rollback'),
                    },
                    'PATCH',
                  ).catch((e) => setError(e.message));
                }}
              >
                <div className="v38-form-grid">
                  <label>
                    Planned start
                    <input
                      name="start"
                      type="datetime-local"
                      defaultValue={localTime(change.planned_start)}
                    />
                  </label>
                  <label>
                    Planned end
                    <input
                      name="end"
                      type="datetime-local"
                      defaultValue={localTime(change.planned_end)}
                    />
                  </label>
                  <label>
                    Risk
                    <select name="risk" defaultValue={String(change.risk)}>
                      {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Affected servers / resources
                  <textarea
                    name="resources"
                    maxLength={7500}
                    defaultValue={(
                      (change.affected_resources as string[]) ?? []
                    ).join('\n')}
                    placeholder="One consistent server or resource name per line"
                  />
                </label>
                {[
                  [
                    'implementation',
                    'Implementation plan',
                    'implementation_plan',
                  ],
                  ['test', 'Test plan', 'test_plan'],
                  ['rollback', 'Rollback plan', 'rollback_plan'],
                ].map(([name, label, key]) => (
                  <label key={name}>
                    {label}
                    <textarea
                      name={name}
                      required
                      minLength={3}
                      maxLength={10000}
                      defaultValue={String(change[key] ?? '')}
                    />
                  </label>
                ))}
                <label>
                  Reason for revision
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Save new revision
                </button>
              </form>
            </details>
          ) : null}
          <h3>Post-implementation reviews</h3>
          {data.reviews.map((r) => (
            <article className="v38-message" key={String(r.id)}>
              <strong>
                {String(r.outcome)} · {String(r.author_name)}
              </strong>
              <small>
                {' '}
                Revision {String(r.revision)} ·{' '}
                {new Date(String(r.created_at)).toLocaleString()}
              </small>
              <p className="v38-prewrap">{String(r.summary)}</p>
              <p className="v38-prewrap">Follow-up: {String(r.follow_up)}</p>
            </article>
          ))}
          {!data.reviews.length ? <p>No review recorded.</p> : null}
          {coordinator &&
          ['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(
            String(change.status),
          ) ? (
            <form
              className="v38-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save(`/change-governance/${id}/reviews`, {
                  outcome: field(f, 'outcome'),
                  summary: field(f, 'summary'),
                  followUp: field(f, 'followUp'),
                }).catch((e) => setError(e.message));
              }}
            >
              <label>
                Outcome
                <select name="outcome">
                  {['SUCCESS', 'PARTIAL', 'FAILED', 'ROLLED_BACK'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Result and lessons learned
                <textarea
                  name="summary"
                  required
                  minLength={10}
                  maxLength={10000}
                />
              </label>
              <label>
                Follow-up actions
                <textarea
                  name="followUp"
                  required
                  minLength={2}
                  maxLength={10000}
                  placeholder="Describe follow-up, or enter None."
                />
              </label>
              <button className="primary" disabled={busy}>
                Record review
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <p>Loading governance checks…</p>
      )}
    </ExpandablePanel>
  );
}
