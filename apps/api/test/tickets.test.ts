import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AttachmentDto,
  CreateRequesterDto,
  CreateTicketDto,
  SaveTicketViewDto,
  TicketListQuery,
  TicketController,
  TicketService,
} from '../src/tickets';
import type { AuthenticatedUser } from '../src/auth';
import type { Dependencies } from '../src/dependencies';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  ENTRA_TENANT_ID: '',
  INITIAL_ADMIN_OBJECT_IDS: '',
});

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  assignee: '10000000-0000-4000-8000-000000000002',
  client: '20000000-0000-4000-8000-000000000001',
  requester: '30000000-0000-4000-8000-000000000001',
  category: '30000000-0000-4000-8000-000000000002',
  site: '30000000-0000-4000-8000-000000000003',
  ticket: '40000000-0000-4000-8000-000000000001',
};
const technician: AuthenticatedUser = {
  id: ids.actor,
  displayName: 'Technician',
  email: 'technician@example.invalid',
  roles: ['TECHNICIAN'],
  clientIds: [ids.client],
  siteIds: [],
  permissions: ['TICKETS_ASSIGN'],
};

test('team lead receives the all-ticket Management dashboard scope', async () => {
  let allTickets = false;
  const teamLead = { ...technician, roles: ['TEAM_LEAD'] };
  const auth = {
    requireRoles: async () => teamLead,
  };
  const tickets = {
    dashboard: async (_user: AuthenticatedUser, all: boolean) => {
      allTickets = all;
      return {};
    },
  };

  await new TicketController(auth as never, tickets as never).dashboard(
    {} as never,
    'all',
  );

  assert.equal(allTickets, true);
});

function harness(options: { assigned?: string | null; status?: string } = {}) {
  const queries: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  const query = async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('next_ticket_number'))
      return { rows: [{ ticket_number: 'RAV-000001' }], rowCount: 1 };
    if (sql.includes('INSERT INTO tickets'))
      return {
        rows: [{ id: ids.ticket, ticket_number: 'RAV-000001' }],
        rowCount: 1,
      };
    if (sql.includes('SELECT status,priority,category_id FROM tickets'))
      return {
        rows: [
          {
            status: options.status ?? 'OPEN',
            priority: 'P2_HIGH',
            category_id: ids.category,
          },
        ],
        rowCount: 1,
      };
    if (
      sql.includes(
        'SELECT assigned_user_id,client_id,site_id,ticket_number,subject FROM tickets',
      )
    )
      return {
        rows: [
          {
            assigned_user_id: options.assigned ?? null,
            client_id: ids.client,
            site_id: null,
            ticket_number: 'INC-000001',
            subject: 'Unable to connect to VPN',
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('INSERT INTO ticket_assignments'))
      return {
        rows: [{ id: '50000000-0000-4000-8000-000000000002' }],
        rowCount: 1,
      };
    if (sql.includes('INSERT INTO ticket_comments'))
      return {
        rows: [{ id: '50000000-0000-4000-8000-000000000001' }],
        rowCount: 1,
      };
    if (sql.includes('INSERT INTO contacts'))
      return { rows: [{ id: ids.requester }], rowCount: 1 };
    if (sql.includes('FROM ticket_attachments a'))
      return {
        rows: [
          {
            file_name: 'evidence.txt',
            content_type: 'text/plain',
            content: Buffer.from('evidence'),
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('FROM tickets t JOIN clients'))
      return { rows: [{ id: ids.ticket }], rowCount: 1 };
    if (sql.includes('lower(email)')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT 1 FROM')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const deps = {
    db: {
      query,
      connect: async () => ({
        query,
        release() {
          released = true;
        },
      }),
    },
  } as unknown as Dependencies;
  return {
    service: new TicketService(deps),
    queries,
    released: () => released,
  };
}

function ticket(): CreateTicketDto {
  return {
    clientId: ids.client,
    requesterId: ids.requester,
    categoryId: ids.category,
    assignedUserId: ids.assignee,
    subject: 'Unable to connect to VPN',
    description: 'Requester receives an authentication error.',
    source: 'PHONE_CALL',
    priority: 'P2_HIGH',
    tagIds: [],
  };
}

test('verified email intake uses the shared ticket sequence and a null staff creator, without assigning privileges', async () => {
  const h = harness();
  const tx = {
    query: async (sql: string, values?: unknown[]) => {
      h.queries.push({ sql, values });
      if (sql.includes('next_ticket_number'))
        return { rows: [{ ticket_number: 'RAV-000001' }], rowCount: 1 };
      if (sql.includes('INSERT INTO tickets'))
        return {
          rows: [{ id: ids.ticket, ticket_number: 'RAV-000001' }],
          rowCount: 1,
        };
      return { rows: [{}], rowCount: 1 };
    },
  };
  const dto: CreateTicketDto = {
    ...ticket(),
    assignedUserId: undefined,
    source: 'CLIENT_PORTAL',
    priority: 'P3_MEDIUM',
    tagIds: [],
  };
  await h.service.createVerifiedPortalTicket(dto, tx as never);
  const inserted = h.queries.find((q) => q.sql.includes('INSERT INTO tickets'));
  assert.equal(inserted?.values?.[8], null);
  assert.ok(h.queries.some((q) => q.sql.includes('next_ticket_number')));
  await assert.rejects(
    h.service.createVerifiedPortalTicket(
      { ...dto, assignedUserId: ids.assignee },
      tx as never,
    ),
    BadRequestException,
  );
  assert.ok(
    !h.queries.some((q) => q.sql.includes('INSERT INTO ticket_assignments')),
  );
});

test('ticket creation allocates a human number and commits history and audit atomically', async () => {
  const h = harness();
  const created = await h.service.create(ticket(), technician);
  assert.deepEqual(created, { id: ids.ticket, ticket_number: 'RAV-000001' });
  assert.ok(h.queries.some((item) => item.sql.includes('next_ticket_number')));
  assert.ok(
    h.queries.some((item) =>
      item.sql.includes('INSERT INTO ticket_assignments'),
    ),
  );
  assert.ok(h.queries.some((item) => item.values?.includes('TICKET.CREATED')));
  assert.ok(
    h.queries.some((item) => item.sql.includes('INSERT INTO ticket_sla')),
  );
  assert.ok(
    h.queries.findIndex((item) => item.sql.includes('INSERT INTO audit_logs')) <
      h.queries.findIndex((item) => item.sql === 'COMMIT'),
  );
  assert.equal(h.released(), true);
});

test('administrator assignees are not blocked by client or site scope checks', async () => {
  const h = harness();
  await h.service.create(ticket(), technician);
  const assigneeCheck = h.queries.find(
    (item) =>
      item.sql.includes('JOIN user_roles r ON r.user_id=u.id') &&
      item.values?.[0] === ids.assignee,
  );
  assert.match(assigneeCheck?.sql ?? '', /r\.role_code='ADMIN'/);
  assert.match(assigneeCheck?.sql ?? '', /client_users/);
  assert.match(assigneeCheck?.sql ?? '', /user_sites/);
});

test('ticket creation saves selected and pasted attachments in the same transaction', async () => {
  const h = harness();
  const dto = ticket();
  dto.attachments = [
    {
      fileName: 'screenshot.png',
      contentType: 'image/png',
      contentBase64: Buffer.from('safe image evidence').toString('base64'),
    },
  ];
  await h.service.create(dto, technician);
  const attachment = h.queries.find((item) =>
    item.sql.includes('INSERT INTO ticket_attachments'),
  );
  assert.ok(attachment);
  assert.ok(attachment.values?.includes('screenshot.png'));
  assert.ok(
    h.queries.findIndex((item) =>
      item.sql.includes('INSERT INTO ticket_attachments'),
    ) < h.queries.findIndex((item) => item.sql === 'COMMIT'),
  );
});

test('transfer requires a reason and rolls back without overwriting ownership', async () => {
  const h = harness({ assigned: ids.actor });
  await assert.rejects(
    h.service.assign(ids.ticket, { assignedUserId: ids.assignee }, technician),
    BadRequestException,
  );
  assert.ok(h.queries.some((item) => item.sql === 'ROLLBACK'));
  assert.ok(!h.queries.some((item) => item.sql.startsWith('UPDATE tickets')));
});

test('internal note and public reply use explicit types and public reply records first response', async () => {
  for (const type of ['INTERNAL', 'PUBLIC'] as const) {
    const h = harness();
    await h.service.comment(
      ids.ticket,
      { type, body: 'Documented response' },
      technician,
    );
    const insert = h.queries.find((item) =>
      item.sql.includes('INSERT INTO ticket_comments'),
    );
    assert.equal(insert?.values?.[2], type);
    assert.equal(
      h.queries.some((item) => item.sql.includes('first_response_at')),
      type === 'PUBLIC',
    );
    assert.equal(
      h.queries.some((item) => item.sql.includes('response_completed_at')),
      type === 'PUBLIC',
    );
    assert.ok(
      h.queries.some((item) => item.sql.includes('assigned_user_id=$5')),
    );
  }
});

test('waiting pauses SLA clocks and returning to work resumes from stored business minutes', async () => {
  const pausing = harness({ status: 'OPEN' });
  await pausing.service.update(
    ids.ticket,
    { status: 'WAITING_FOR_CLIENT' },
    technician,
  );
  assert.ok(
    pausing.queries.some(
      (item) =>
        item.sql.includes('paused_at=now()') &&
        item.sql.includes('sla_business_minutes_between'),
    ),
  );

  const resuming = harness({ status: 'WAITING_FOR_CLIENT' });
  await resuming.service.update(
    ids.ticket,
    { status: 'IN_PROGRESS' },
    technician,
  );
  assert.ok(
    resuming.queries.some(
      (item) =>
        item.sql.includes('paused_at=NULL') &&
        item.sql.includes('sla_add_business_minutes'),
    ),
  );
});

test('requester is mandatory and a technician can add one only for an active client', async () => {
  assert.ok(
    (
      await validate(
        plainToInstance(CreateTicketDto, {
          ...ticket(),
          requesterId: undefined,
        }),
      )
    ).length > 0,
  );
  const invalid = plainToInstance(CreateRequesterDto, {
    clientId: ids.client,
    name: 'A',
  });
  assert.ok((await validate(invalid)).length > 0);
  const h = harness();
  await h.service.createRequester(
    {
      clientId: ids.client,
      name: 'New Requester',
      email: 'new@example.invalid',
    },
    technician,
  );
  assert.ok(
    h.queries.some((item) => item.sql.includes('INSERT INTO contacts')),
  );
  assert.ok(h.queries.some((item) => item.values?.includes('CONTACT.CREATED')));
});

test('category is mandatory for every new ticket', async () => {
  assert.ok(
    (
      await validate(
        plainToInstance(CreateTicketDto, {
          ...ticket(),
          categoryId: undefined,
        }),
      )
    ).length > 0,
  );
});

test('ticket detail query enforces technician ownership in SQL', async () => {
  const h = harness();
  await h.service.detail(ids.ticket, technician);
  const detail = h.queries.find((item) =>
    item.sql.includes('FROM tickets t JOIN clients'),
  );
  assert.match(detail?.sql ?? '', /assigned_user_id=\$5/);
  assert.deepEqual(detail?.values, [
    ids.ticket,
    false,
    false,
    [ids.client],
    ids.actor,
    false,
    [],
    [],
  ]);
});

test('technician cannot expand My Tickets into an all-ticket or unassigned query', async () => {
  const h = harness();
  for (const scope of ['all', 'unassigned']) {
    const query = new TicketListQuery();
    query.scope = scope;
    await assert.rejects(h.service.list(technician, query), ForbiddenException);
  }
  assert.equal(h.queries.length, 0);
});

test('site team queue includes all tickets within assigned clients and sites', async () => {
  const query = new TicketListQuery();
  query.scope = 'team';
  await assert.rejects(
    harness().service.list({ ...technician, permissions: [] }, query),
    ForbiddenException,
  );
  const h = harness();
  await h.service.list(
    {
      ...technician,
      permissions: ['TICKETS_TEAM_VIEW'],
      siteIds: [ids.site],
    },
    query,
  );
  const scoped = h.queries.at(-1);
  assert.doesNotMatch(scoped?.sql ?? '', /assigned_user_id IS DISTINCT FROM/);
  assert.match(
    scoped?.sql ?? '',
    /cardinality\(\$11::uuid\[\]\)=0 OR t\.site_id=ANY\(\$11::uuid\[\]\)/,
  );
  assert.deepEqual(scoped?.values?.[9], [ids.client]);
  assert.deepEqual(scoped?.values?.[10], [ids.site]);

  const clientWide = harness();
  await clientWide.service.list(
    {
      ...technician,
      permissions: ['TICKETS_TEAM_VIEW'],
      siteIds: [],
    },
    query,
  );
  assert.deepEqual(clientWide.queries.at(-1)?.values?.[9], [ids.client]);
  assert.deepEqual(clientWide.queries.at(-1)?.values?.[10], []);
});

test('site team detail and attachments use the same optional-site restriction', async () => {
  const h = harness();
  const siteTeamTechnician = {
    ...technician,
    permissions: ['TICKETS_TEAM_VIEW'],
    siteIds: [],
  };
  await h.service.detail(ids.ticket, siteTeamTechnician);
  await h.service.attachment(
    ids.ticket,
    '50000000-0000-4000-8000-000000000002',
    siteTeamTechnician,
  );
  const detail = h.queries.find((item) =>
    item.sql.includes('FROM tickets t JOIN clients'),
  );
  const attachment = h.queries.find((item) =>
    item.sql.includes('JOIN tickets t ON t.id=a.ticket_id'),
  );
  assert.match(
    detail?.sql ?? '',
    /cardinality\(\$7::uuid\[\]\)=0 OR t\.site_id=ANY\(\$7::uuid\[\]\)/,
  );
  assert.match(
    attachment?.sql ?? '',
    /cardinality\(\$8::uuid\[\]\)=0 OR t\.site_id=ANY\(\$8::uuid\[\]\)/,
  );
  assert.deepEqual(detail?.values?.[3], [ids.client]);
  assert.deepEqual(detail?.values?.[6], []);
  assert.deepEqual(attachment?.values?.[4], [ids.client]);
  assert.deepEqual(attachment?.values?.[7], []);
});

test('ticket search covers ticket content, comments and tags while retaining client scope', async () => {
  const h = harness();
  const query = new TicketListQuery();
  query.q = 'VPN client:"Example Client" status:open tag:urgent';
  await h.service.list(technician, query);
  const search = h.queries.at(-1);
  assert.match(search?.sql ?? '', /to_tsvector\('simple'/);
  assert.match(search?.sql ?? '', /@@ websearch_to_tsquery/);
  assert.match(search?.sql ?? '', /FROM ticket_comments search_comment/);
  assert.match(search?.sql ?? '', /JOIN tags search_tag/);
  assert.match(search?.sql ?? '', /t\.client_id=ANY\(\$10::uuid\[\]\)/);
  assert.equal(search?.values?.[0], 'VPN');
  assert.equal(search?.values?.[4], 'OPEN');
  assert.equal(search?.values?.[12], '%Example Client%');
  assert.equal(search?.values?.[16], '%urgent%');
  assert.deepEqual(search?.values?.[9], [ids.client]);
  const invalid = new TicketListQuery();
  invalid.q = 'status:not-a-real-status';
  await assert.rejects(
    h.service.list(technician, invalid),
    BadRequestException,
  );
});

test('saved ticket views are private to their owner and store only supported filters', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const dependencies = {
    db: {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (sql.includes('RETURNING id'))
          return {
            rows: [{ id: '50000000-0000-4000-8000-000000000001' }],
            rowCount: 1,
          };
        return { rows: [], rowCount: 1 };
      },
    },
  } as unknown as Dependencies;
  const service = new TicketService(dependencies);
  const query = new TicketListQuery();
  query.q = 'VPN';
  query.status = 'OPEN';
  query.page = 44;
  query.pageSize = 100;
  await service.saveView({ name: 'Open VPN', query }, technician);
  await service.deleteView('50000000-0000-4000-8000-000000000001', technician);
  const insert = queries[0];
  assert.match(insert?.sql ?? '', /INSERT INTO saved_ticket_views/);
  assert.equal(insert?.values?.[0], technician.id);
  const stored = JSON.parse(String(insert?.values?.[2])) as Record<
    string,
    unknown
  >;
  assert.deepEqual(stored, { q: 'VPN', status: 'OPEN' });
  assert.deepEqual(queries[1]?.values, [
    '50000000-0000-4000-8000-000000000001',
    technician.id,
  ]);
  assert.equal(
    (
      await validate(
        plainToInstance(SaveTicketViewDto, {
          name: '',
          query: { assignedUserId: 'not-a-uuid' },
        }),
      )
    ).length > 0,
    true,
  );
});

test('technician cannot create a ticket for an unassigned client', async () => {
  const h = harness();
  await assert.rejects(
    h.service.create(
      { ...ticket(), clientId: '20000000-0000-4000-8000-000000000099' },
      technician,
    ),
    ForbiddenException,
  );
  assert.equal(
    h.queries.some((item) => item.sql.includes('INSERT INTO tickets')),
    false,
  );
});

test('ticket DTO rejects unapproved sources and malformed attachments are rejected before SQL', async () => {
  const invalid = plainToInstance(CreateTicketDto, {
    ...ticket(),
    source: '',
  });
  assert.ok((await validate(invalid)).length > 0);
  const h = harness();
  await assert.rejects(
    h.service.addAttachment(
      ids.ticket,
      {
        fileName: 'payload.exe',
        contentType: 'application/octet-stream',
        contentBase64: 'AA==',
      },
      technician,
    ),
    BadRequestException,
  );
  assert.equal(h.queries.length, 0);
  assert.ok(
    (
      await validate(
        plainToInstance(AttachmentDto, {
          fileName: '',
          contentType: '',
          contentBase64: '',
        }),
      )
    ).length > 0,
  );
});

test('dashboard filters are validated and keep technician scope and client restrictions', async () => {
  for (const metric of [
    'WAITING',
    'RESOLVED_RECENTLY',
    'AWAITING_FIRST_RESPONSE',
    'PENDING_APPROVAL',
  ] as const) {
    const dto = plainToInstance(TicketListQuery, { dashboardFilter: metric });
    assert.deepEqual(await validate(dto), []);
    const h = harness();
    await h.service.list(technician, dto);
    const query = h.queries.at(-1)!;
    assert.equal(query.values?.[27], metric);
    assert.equal(query.values?.[3], 'my');
    assert.deepEqual(query.values?.[9], [ids.client]);
    assert.match(
      query.sql,
      /\$28::text IS NULL OR \$4<>'my' OR t\.assigned_user_id=\$3/,
    );
    dto.scope = 'all';
    await assert.rejects(h.service.list(technician, dto), ForbiddenException);
  }
  assert.ok(
    (
      await validate(
        plainToInstance(TicketListQuery, { dashboardFilter: 'arbitrary-sql' }),
      )
    ).length > 0,
  );
});

test('dashboard counts and list filters use the same waiting, resolution and first-response predicates', async () => {
  const h = harness();
  await h.service.dashboard(technician, false);
  const counts = h.queries.find((q) => q.sql.includes('AS recently_resolved'))!;
  const dto = new TicketListQuery();
  dto.dashboardFilter = 'WAITING';
  await h.service.list(technician, dto);
  const list = h.queries.at(-1)!;
  for (const sql of [counts.sql, list.sql]) {
    assert.match(
      sql,
      /t\.status IN \('WAITING_FOR_CLIENT','WAITING_FOR_VENDOR'\)/,
    );
    assert.match(
      sql,
      /t\.status='RESOLVED' AND t\.resolved_at >= now\(\) - interval '7 days'/,
    );
    assert.match(sql, /t\.first_response_at IS NULL/);
    assert.match(sql, /paused_at IS NULL AND sla_business_minutes_between/);
    assert.match(sql, />= 30/);
  }
  assert.equal(counts.values?.[0], technician.id);
});
