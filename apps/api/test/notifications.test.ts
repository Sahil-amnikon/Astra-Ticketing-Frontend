import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Dependencies } from '../src/dependencies';
import type { AuthenticatedUser } from '../src/auth';
import {
  enqueueNotification,
  NotificationService,
  processNotificationJobs,
} from '../src/notifications';

const userId = '10000000-0000-4000-8000-000000000001';
const ticketId = '20000000-0000-4000-8000-000000000001';
const user: AuthenticatedUser = {
  id: userId,
  displayName: 'Technician',
  email: 'tech@example.invalid',
  roles: ['TECHNICIAN'],
  clientIds: ['30000000-0000-4000-8000-000000000001'],
  siteIds: [],
  permissions: [],
};

function harness() {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const query = async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('count(*)::int AS count'))
      return { rows: [{ count: 2 }], rowCount: 1 };
    if (sql.includes('RETURNING id'))
      return { rows: [{ id: 'notification-1' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const deps = { db: { query } } as unknown as Dependencies;
  return { service: new NotificationService(deps), deps, queries, query };
}

test('notification list and preference writes are scoped to the signed-in user', async () => {
  const h = harness();
  const list = await h.service.list(user, '500');
  assert.equal(list.unread, 2);
  assert.ok(h.queries.every((item) => item.values?.[0] === userId));
  assert.ok(
    h.queries
      .filter((item) => item.sql.includes('FROM notifications n'))
      .every((item) => item.sql.includes('t.client_id=ANY')),
  );

  const preferences = {
    ticketAssigned: true,
    ticketTransferred: true,
    publicReply: false,
    slaAtRisk: true,
    slaBreached: true,
    ticketUnattended: false,
  };
  await h.service.updatePreferences(userId, preferences);
  const upsert = h.queries.find((item) =>
    item.sql.includes('INSERT INTO notification_preferences'),
  );
  assert.equal(upsert?.values?.[0], userId);
  assert.equal(upsert?.values?.[3], false);
});

test('event notifications honor preferences and deduplicate by event key', async () => {
  const h = harness();
  await enqueueNotification({ query: h.query } as never, {
    userId,
    ticketId,
    type: 'TICKET_ASSIGNED',
    title: 'Assigned',
    body: 'Ticket subject',
    eventKey: 'assignment:1',
  });
  const insert = h.queries[0];
  assert.match(insert?.sql ?? '', /ticket_assigned/);
  assert.match(insert?.sql ?? '', /ON CONFLICT\(event_key\) DO NOTHING/);
  assert.equal(insert?.values?.[0], userId);
});

test('worker creates only unpaused SLA and unattended notifications', async () => {
  const h = harness();
  const count = await processNotificationJobs(h.deps);
  assert.equal(count, 1);
  const job = h.queries[0];
  assert.match(job?.sql ?? '', /s\.paused_at IS NULL/);
  assert.match(job?.sql ?? '', /sla_business_minutes_between/);
  assert.match(job?.sql ?? '', /ON CONFLICT\(event_key\) DO NOTHING/);
});
