import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { SlaReportService } from '../src/sla-reports';
import type { Dependencies } from '../src/dependencies';
import type { AuthenticatedUser } from '../src/auth';

const actor: AuthenticatedUser = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Admin',
  email: 'admin@example.invalid',
  roles: ['ADMIN'],
  clientIds: [],
};
const technicianId = '10000000-0000-4000-8000-000000000002';
const calendarId = '10000000-0000-4000-8000-000000000003';

function harness() {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const query = async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('SELECT * FROM sla_policies'))
      return { rows: [{ id: 'policy-1', priority: 'P2_HIGH' }], rowCount: 1 };
    if (sql.includes('SELECT 1 FROM sla_calendars'))
      return { rows: [{ exists: true }], rowCount: 1 };
    if (sql.includes('SELECT DISTINCT u.id,u.display_name AS name'))
      return {
        rows: [
          {
            id: technicianId,
            name: 'Technician One',
            email: 'tech@example.invalid',
            active: true,
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 0 };
  };
  const deps = {
    db: { query, connect: async () => ({ query, release() {} }) },
  } as unknown as Dependencies;
  return { service: new SlaReportService(deps), queries };
}

test('manual SLA policy update is audited before commit and can recalculate open tickets', async () => {
  const h = harness();
  await h.service.updatePolicy(
    'P2_HIGH',
    {
      responseMinutes: 60,
      resolutionMinutes: 480,
      warningPercent: 75,
      active: true,
      calendarId,
      applyToOpenTickets: true,
    },
    actor,
  );
  assert.ok(h.queries.some((item) => item.sql.includes('UPDATE sla_policies')));
  assert.ok(h.queries.some((item) => item.sql.includes('UPDATE ticket_sla')));
  assert.ok(
    h.queries.some((item) => item.sql.includes('sla_add_business_minutes')),
  );
  assert.ok(h.queries.some((item) => item.values?.includes(calendarId)));
  assert.ok(h.queries.some((item) => item.values?.includes('P2_HIGH')));
  assert.ok(
    h.queries.findIndex((item) => item.sql.includes('INSERT INTO audit_logs')) <
      h.queries.findIndex((item) => item.sql === 'COMMIT'),
  );
});

test('SLA calendar validation rejects invalid timezone and duplicate weekdays', async () => {
  const h = harness();
  await assert.rejects(
    h.service.createCalendar(
      {
        name: 'Invalid calendar',
        timezone: 'Not/A-Timezone',
        workingDays: [1, 1],
        workStart: '09:00',
        workEnd: '18:00',
        active: true,
        holidays: [],
      },
      actor,
    ),
    BadRequestException,
  );
  assert.equal(h.queries.length, 0);
});

test('SLA target and report date validation fail closed', async () => {
  const h = harness();
  await assert.rejects(
    h.service.updatePolicy(
      'P1_CRITICAL',
      {
        responseMinutes: 300,
        resolutionMinutes: 200,
        warningPercent: 75,
        active: true,
        calendarId,
        applyToOpenTickets: false,
      },
      actor,
    ),
    BadRequestException,
  );
  await assert.rejects(
    h.service.technicianReport('2026-09-20T00:00:00Z', '2026-09-10T00:00:00Z'),
    BadRequestException,
  );
  assert.equal(h.queries.length, 0);
});

test('reports export safely as CSV and Excel-compatible XML', () => {
  const h = harness();
  const report = {
    from: '2026-09-01',
    to: '2026-10-01',
    rows: [{ name: 'A, "Tech"', email: 'a@example.invalid', received: 2 }],
    tickets: [
      {
        ticket_number: 'INC-000001',
        subject: '=unsafe spreadsheet formula',
      },
    ],
  };
  assert.match(h.service.csv(report), /"A, ""Tech"""/);
  assert.match(h.service.csv(report), /Ticket detail/);
  assert.match(h.service.csv(report), /'=unsafe spreadsheet formula/);
  assert.match(h.service.excelXml(report), /Ticket Detail/);
});

test('individual technician reports filter summary and include historical ticket activity', async () => {
  const h = harness();
  const report = await h.service.technicianReport(
    '2026-09-01T00:00:00Z',
    '2026-10-01T00:00:00Z',
    technicianId,
  );
  assert.equal(report.technicianId, technicianId);
  const summary = h.queries.find((item) => item.sql.includes('WITH staff AS'));
  assert.equal(summary?.values?.[3], technicianId);
  const detail = h.queries.find((item) =>
    item.sql.includes('FROM tickets t JOIN clients'),
  );
  assert.match(detail?.sql ?? '', /ticket_assignments/);
  assert.match(detail?.sql ?? '', /ticket_comments/);
  assert.match(detail?.sql ?? '', /ticket_history/);
  assert.equal(detail?.values?.[2], technicianId);
});
