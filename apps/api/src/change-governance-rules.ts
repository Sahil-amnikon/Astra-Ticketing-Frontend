import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { AuthenticatedUser } from './auth';
import type { Dependencies } from './dependencies';

type Db = Pick<PoolClient, 'query'>;
export type ChangeRecord = Record<string, unknown>;
export const CHANGE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT: ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['ASSESSMENT', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'ASSESSMENT', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'ASSESSMENT', 'CANCELLED'],
  IN_PROGRESS: ['VALIDATION', 'FAILED', 'ROLLED_BACK'],
  VALIDATION: ['COMPLETED', 'FAILED', 'ROLLED_BACK'],
  COMPLETED: ['CLOSED', 'ROLLED_BACK'],
  FAILED: ['CLOSED'],
  ROLLED_BACK: ['CLOSED'],
};
export const isChangeCoordinator = (user: AuthenticatedUser) =>
  user.roles.includes('ADMIN') ||
  ['COORDINATOR', 'CHANGE_MANAGER'].includes(user.changeAccess ?? '');

export async function changeTransaction<T>(
  dependencies: Dependencies,
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await dependencies.db.connect();
  try {
    await db.query('BEGIN');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
export async function recordChangeEvent(
  db: Db,
  id: string,
  actorId: string,
  event: string,
  details: object,
) {
  await db.query(
    'INSERT INTO change_history(change_id,actor_user_id,event,details) VALUES($1,$2,$3,$4::jsonb)',
    [id, actorId, event, JSON.stringify(details)],
  );
  await db.query(
    "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'CHANGE',$3,$4::jsonb)",
    [actorId, event, id, JSON.stringify(details)],
  );
}
export async function lockedChange(db: Db, id: string): Promise<ChangeRecord> {
  const result = await db.query(
    'SELECT * FROM changes WHERE id=$1 FOR UPDATE',
    [id],
  );
  if (!result.rows[0]) throw new NotFoundException();
  return result.rows[0] as ChangeRecord;
}
export function validateWindow(start: unknown, end: unknown) {
  if (
    !start ||
    !end ||
    !Number.isFinite(new Date(String(start)).getTime()) ||
    !Number.isFinite(new Date(String(end)).getTime()) ||
    new Date(String(end)) <= new Date(String(start))
  )
    throw new BadRequestException(
      'Choose a valid start and end time, with the end after the start.',
    );
}

export async function schedulingConflicts(db: Db, change: ChangeRecord) {
  if (!change.planned_start || !change.planned_end)
    return { changes: [] as ChangeRecord[], blackouts: [] as ChangeRecord[] };
  const [changes, blackouts] = await Promise.all([
    db.query(
      `SELECT id,change_number,title,planned_start,planned_end,
      CASE WHEN affected_resources && $6::text[] THEN 'Shared affected resource'
           WHEN owner_user_id=$7 THEN 'Shared change owner' ELSE 'Overlapping site or organization' END AS reason
      FROM changes WHERE id<>$1 AND client_id=$2 AND status IN ('APPROVED','SCHEDULED','IN_PROGRESS','VALIDATION')
        AND planned_start<$4::timestamptz AND planned_end>$3::timestamptz
        AND (site_id IS NULL OR $5::uuid IS NULL OR site_id=$5 OR affected_resources && $6::text[] OR owner_user_id=$7)
      ORDER BY planned_start LIMIT 100`,
      [
        change.id,
        change.client_id,
        change.planned_start,
        change.planned_end,
        change.site_id ?? null,
        change.affected_resources ?? [],
        change.owner_user_id,
      ],
    ),
    db.query(
      `SELECT id,name,starts_at,ends_at FROM change_blackouts WHERE active
      AND (client_id IS NULL OR client_id=$1) AND (site_id IS NULL OR $2::uuid IS NULL OR site_id=$2)
      AND starts_at<$4::timestamptz AND ends_at>$3::timestamptz ORDER BY starts_at LIMIT 100`,
      [
        change.client_id,
        change.site_id ?? null,
        change.planned_start,
        change.planned_end,
      ],
    ),
  ]);
  return {
    changes: changes.rows as ChangeRecord[],
    blackouts: blackouts.rows as ChangeRecord[],
  };
}

export async function approvalReadiness(db: Db, change: ChangeRecord) {
  const policy = (
    await db.query('SELECT * FROM change_governance_policy WHERE id=1')
  ).rows[0];
  const votes = await db.query(
    `SELECT a.*,u.active FROM change_approvals a
    LEFT JOIN users u ON u.id=a.decision_by_user_id WHERE a.change_id=$1 AND a.revision=$2`,
    [change.id, change.revision],
  );
  const approvals = votes.rows as ChangeRecord[];
  const approved = approvals.filter(
    (a) =>
      a.status === 'APPROVED' &&
      a.active === true &&
      a.decision_by_user_id !== change.requested_by_user_id &&
      a.decision_by_user_id !== change.owner_user_id,
  );
  const distinct = new Set(approved.map((a) => String(a.decision_by_user_id)));
  const cab = new Set(
    approved
      .filter(
        (a) =>
          a.cab_group_id === change.cab_group_id &&
          a.approver_user_id === a.decision_by_user_id,
      )
      .map((a) => String(a.decision_by_user_id)),
  );
  const cabRequired = Boolean(
    policy.high_risk_cab && ['HIGH', 'CRITICAL'].includes(String(change.risk)),
  );
  const reasons: string[] = [];
  if (distinct.size < Number(policy.minimum_approvals))
    reasons.push(
      `At least ${policy.minimum_approvals} independent approval(s) are required.`,
    );
  if (approvals.some((a) => a.required && !approved.includes(a)))
    reasons.push('All required approvals must be approved.');
  if (
    approvals.some((a) =>
      ['REJECTED', 'CHANGES_REQUESTED'].includes(String(a.status)),
    )
  )
    reasons.push(
      'A rejection or request for changes needs a new review round.',
    );
  if (cabRequired && (!change.cab_group_id || !Number(change.cab_quorum)))
    reasons.push('High/critical risk requires a CAB group.');
  if (change.cab_group_id && cab.size < Number(change.cab_quorum))
    reasons.push(
      `CAB requires ${change.cab_quorum} independent member approval(s).`,
    );
  return {
    ready: reasons.length === 0,
    reasons,
    approved: distinct.size,
    cabApproved: cab.size,
    policy,
  };
}

export async function governedStatus(
  dependencies: Dependencies,
  id: string,
  user: AuthenticatedUser,
  dto: { status: string; note?: string; overrideReason?: string },
) {
  return changeTransaction(dependencies, async (db) => {
    // Serialize schedule checks and schedule edits to avoid check-then-write races.
    await db.query('SELECT pg_advisory_xact_lock($1)', [538001]);
    const change = await lockedChange(db, id);
    if (
      !isChangeCoordinator(user) &&
      !(
        change.owner_user_id === user.id &&
        change.status === 'DRAFT' &&
        ['SUBMITTED', 'CANCELLED'].includes(dto.status)
      )
    )
      throw new ForbiddenException();
    if (!(CHANGE_TRANSITIONS[String(change.status)] ?? []).includes(dto.status))
      throw new BadRequestException(
        `Cannot move from ${change.status} to ${dto.status}`,
      );
    if (['SCHEDULED', 'IN_PROGRESS'].includes(dto.status)) {
      const readiness = await approvalReadiness(db, change);
      if (!readiness.ready)
        throw new BadRequestException(readiness.reasons.join(' '));
      validateWindow(change.planned_start, change.planned_end);
      const conflicts = await schedulingConflicts(db, change);
      if (conflicts.changes.length || conflicts.blackouts.length) {
        if (
          !(
            user.roles.includes('ADMIN') ||
            user.changeAccess === 'CHANGE_MANAGER'
          ) ||
          (dto.overrideReason?.trim().length ?? 0) < 10
        )
          throw new BadRequestException(
            'Schedule conflict or blackout found. Reschedule, or ask a Change Manager to record an override reason of at least 10 characters.',
          );
        await recordChangeEvent(db, id, user.id, 'CHANGE.CONFLICT_OVERRIDE', {
          reason: dto.overrideReason!.trim(),
          changeIds: conflicts.changes.map((c) => c.id),
          blackoutIds: conflicts.blackouts.map((c) => c.id),
          revision: change.revision,
        });
      }
    }
    if (dto.status === 'AWAITING_APPROVAL') {
      const pending = await db.query(
        'SELECT 1 FROM change_approvals WHERE change_id=$1 AND revision=$2 LIMIT 1',
        [id, change.revision],
      );
      if (!pending.rowCount)
        throw new BadRequestException(
          'Add independent approvers or request CAB review first.',
        );
    }
    if (dto.status === 'VALIDATION') {
      const unfinished = await db.query(
        "SELECT 1 FROM change_tasks WHERE change_id=$1 AND status NOT IN ('COMPLETED','WAIVED') LIMIT 1",
        [id],
      );
      if (unfinished.rowCount)
        throw new BadRequestException(
          'Complete or explicitly waive implementation tasks before validation.',
        );
    }
    if (dto.status === 'CLOSED') {
      const policy = (
        await db.query(
          'SELECT review_required FROM change_governance_policy WHERE id=1',
        )
      ).rows[0];
      if (policy.review_required || change.change_type === 'EMERGENCY') {
        const review = await db.query(
          'SELECT 1 FROM change_reviews WHERE change_id=$1 AND revision=$2 LIMIT 1',
          [id, change.revision],
        );
        if (!review.rowCount)
          throw new BadRequestException(
            'Record a post-implementation review before closing.',
          );
      }
    }
    if (
      dto.status === 'ASSESSMENT' &&
      ['APPROVED', 'SCHEDULED', 'AWAITING_APPROVAL'].includes(
        String(change.status),
      )
    ) {
      await db.query(
        'UPDATE changes SET revision=revision+1,cab_group_id=NULL,cab_quorum=0 WHERE id=$1',
        [id],
      );
    }
    await db.query(
      `UPDATE changes SET status=$2,
      actual_start=CASE WHEN $2='IN_PROGRESS' THEN COALESCE(actual_start,now()) ELSE actual_start END,
      actual_end=CASE WHEN $2 IN ('COMPLETED','CLOSED','FAILED','ROLLED_BACK') THEN COALESCE(actual_end,now()) ELSE actual_end END,
      updated_at=now() WHERE id=$1`,
      [id, dto.status],
    );
    await recordChangeEvent(db, id, user.id, 'CHANGE.STATUS_UPDATED', {
      before: change.status,
      after: dto.status,
      note: dto.note,
      revision: change.revision,
    });
    return { id, status: dto.status };
  });
}

export async function governedDecision(
  dependencies: Dependencies,
  id: string,
  approvalId: string,
  user: AuthenticatedUser,
  dto: { status: string; note: string },
) {
  return changeTransaction(dependencies, async (db) => {
    const change = await lockedChange(db, id);
    if (change.status !== 'AWAITING_APPROVAL')
      throw new BadRequestException(
        'Decisions are only allowed while awaiting approval.',
      );
    if (
      user.id === change.requested_by_user_id ||
      user.id === change.owner_user_id
    )
      throw new ForbiddenException(
        'Requester and owner cannot approve their own change.',
      );
    const vote = (
      await db.query(
        "SELECT * FROM change_approvals WHERE id=$1 AND change_id=$2 AND revision=$3 AND status='PENDING' FOR UPDATE",
        [approvalId, id, change.revision],
      )
    ).rows[0];
    if (!vote)
      throw new BadRequestException(
        'This approval is no longer pending in the current review round.',
      );
    if (
      vote.cab_group_id
        ? vote.approver_user_id !== user.id
        : !(
            vote.approver_user_id === user.id ||
            user.departmentIds?.includes(vote.department_id)
          )
    )
      throw new ForbiddenException(
        'Only an assigned reviewer can record this decision.',
      );
    const earlier = await db.query(
      "SELECT 1 FROM change_approvals WHERE change_id=$1 AND revision=$2 AND required AND sequence<$3 AND status<>'APPROVED' LIMIT 1",
      [id, change.revision, vote.sequence],
    );
    if (earlier.rowCount)
      throw new BadRequestException(
        'Earlier required approval stages must finish first.',
      );
    await db.query(
      'UPDATE change_approvals SET status=$2,decision_by_user_id=$3,decision_note=$4,decided_at=now() WHERE id=$1',
      [approvalId, dto.status, user.id, dto.note.trim()],
    );
    if (dto.status === 'REJECTED' || dto.status === 'CHANGES_REQUESTED') {
      // Old decisions stay intact; the next assessment must gather fresh approvals.
      await db.query(
        "UPDATE changes SET status='ASSESSMENT',revision=revision+1,cab_group_id=NULL,cab_quorum=0,updated_at=now() WHERE id=$1",
        [id],
      );
    } else if ((await approvalReadiness(db, change)).ready) {
      await db.query(
        "UPDATE changes SET status='APPROVED',updated_at=now() WHERE id=$1",
        [id],
      );
    }
    await recordChangeEvent(db, id, user.id, 'CHANGE.APPROVAL_DECIDED', {
      approvalId,
      status: dto.status,
      note: dto.note.trim(),
      revision: change.revision,
    });
    return { id: approvalId };
  });
}
