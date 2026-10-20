import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ProblemService,
  problemScope,
  validateProblemUpdate,
  type UpdateProblemDto,
} from '../src/problems';
import { workspaceUser, type AuthenticatedUser } from '../src/auth';
import type { Dependencies } from '../src/dependencies';
import type { TicketService } from '../src/tickets';
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user: AuthenticatedUser = {
  id: id(1),
  displayName: 'Technician',
  email: 'test@example.invalid',
  roles: ['TECHNICIAN'],
  clientIds: [id(10)],
  siteIds: [],
  permissions: ['TICKETS_TEAM_VIEW'],
  workspace: 'operations',
};
const patch: UpdateProblemDto = {
  revision: 1,
  title: 'Recurring connection failures',
  description: 'Repeated connection drops across incidents.',
  priority: 'P2_HIGH',
  status: 'INVESTIGATING',
  rootCause: '',
  workaround: '',
  resolution: '',
  ownerUserId: id(1),
};
test('workspace selection caps problem closure and reassignment; known errors require evidence', () => {
  const admin = { ...user, roles: ['ADMIN'], permissions: ['*'] };
  const tech = workspaceUser(admin, 'operations');
  const manager = workspaceUser(admin, 'management');
  const current = {
    id: id(20),
    client_id: id(10),
    site_id: null,
    owner_user_id: id(1),
    created_by_user_id: id(1),
    revision: 1,
    status: 'RESOLVED',
  };
  assert.throws(
    () =>
      validateProblemUpdate(
        { ...patch, status: 'CLOSED', rootCause: 'Cause', resolution: 'Fix' },
        current,
        tech,
      ),
    ForbiddenException,
  );
  assert.doesNotThrow(() =>
    validateProblemUpdate(
      { ...patch, status: 'CLOSED', rootCause: 'Cause', resolution: 'Fix' },
      current,
      manager,
    ),
  );
  assert.throws(
    () =>
      validateProblemUpdate({ ...patch, ownerUserId: id(2) }, current, tech),
    ForbiddenException,
  );
  assert.throws(
    () =>
      validateProblemUpdate(
        { ...patch, status: 'KNOWN_ERROR' },
        { ...current, status: 'OPEN' },
        tech,
      ),
    BadRequestException,
  );
  assert.throws(
    () => problemScope({ ...user, roles: ['USER'] }),
    ForbiddenException,
  );
  assert.throws(
    () => problemScope({ ...user, roles: ['INTERN'] }),
    ForbiddenException,
  );
});
test('Problem service and migration enforce client/site isolation, lifecycle, concurrency and atomic audit', async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE amnikon_app; CREATE TABLE app_schema_state(id smallint PRIMARY KEY,version int); INSERT INTO app_schema_state VALUES(1,20);
 CREATE TABLE clients(id uuid PRIMARY KEY,name text,status text); CREATE TABLE sites(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),name text,active boolean);
 CREATE TABLE users(id uuid PRIMARY KEY,display_name text,active boolean); CREATE TABLE user_roles(user_id uuid,role_code text); CREATE TABLE client_users(user_id uuid,client_id uuid); CREATE TABLE user_sites(user_id uuid,site_id uuid);
 CREATE TABLE tickets(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),site_id uuid,assigned_user_id uuid,ticket_number text,subject text,status text,priority text,UNIQUE(id,client_id));
 CREATE TABLE ticket_collaborators(ticket_id uuid,user_id uuid); CREATE TABLE help_requests(ticket_id uuid,status text,requested_user_id uuid,department_id uuid);
 CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);`);
  const require = createRequire(__filename);
  const migration = require(
    resolve('packages/database/migrations/021_problem_management.cjs'),
  ) as { up: (db: { raw: (s: string) => Promise<unknown> }) => Promise<void> };
  await migration.up({ raw: (s) => pg.exec(s) });
  await pg.exec(`INSERT INTO clients VALUES('${id(10)}','Client A','ACTIVE'),('${id(11)}','Client B','ACTIVE'); INSERT INTO users VALUES('${id(1)}','Tech',true),('${id(2)}','Other',true); INSERT INTO user_roles VALUES('${id(1)}','TECHNICIAN'),('${id(2)}','TECHNICIAN'); INSERT INTO client_users VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(11)}'); INSERT INTO sites VALUES('${id(30)}','${id(10)}','Main',true),('${id(31)}','${id(10)}','Restricted',true);
 INSERT INTO tickets VALUES('${id(40)}','${id(10)}','${id(30)}','${id(1)}','TKT-A','Visible incident','OPEN','P2_HIGH'),('${id(41)}','${id(11)}',NULL,'${id(2)}','TKT-B','Other client','OPEN','P2_HIGH'),('${id(42)}','${id(10)}','${id(31)}','${id(2)}','TKT-C','Hidden site','OPEN','P2_HIGH');`);
  const query = async (sql: string, values?: unknown[]) => {
    const r = await pg.query<Record<string, unknown>>(sql, values);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  const client = { query, release: () => {} };
  const deps = {
    db: { query, connect: async () => client },
  } as unknown as Dependencies;
  const ticketStub = {
    detail: async (ticketId: string) => {
      const r = await query('SELECT * FROM tickets WHERE id=$1', [ticketId]);
      if (!r.rows[0]) throw new NotFoundException();
      return { ticket: r.rows[0] };
    },
  } as unknown as TicketService;
  const service = new ProblemService(deps, ticketStub);
  try {
    const problem = await service.create(user, {
      clientId: id(10),
      siteId: id(30),
      title: patch.title,
      description: patch.description,
      priority: patch.priority,
    });
    assert.equal(problem.problem_number, 'PRB-00000001');
    assert.equal(
      (await service.list(user, { q: '', page: 1, pageSize: 20 })).total,
      1,
    );
    await assert.rejects(
      service.create(user, {
        clientId: id(11),
        title: 'Other',
        description: 'Wrong client',
        priority: 'P3_MEDIUM',
      }),
      NotFoundException,
    );
    await assert.rejects(
      service.detail(problem.id, { ...user, clientIds: [id(11)] }),
      NotFoundException,
    );
    await assert.rejects(
      service.detail(problem.id, { ...user, siteIds: [id(31)] }),
      NotFoundException,
    );
    await service.link(problem.id, user, id(40));
    await assert.rejects(
      service.link(problem.id, user, id(41)),
      BadRequestException,
    );
    await assert.rejects(
      query(
        'INSERT INTO problem_tickets(problem_id,ticket_id,client_id,linked_by_user_id) VALUES($1,$2,$3,$4)',
        [problem.id, id(41), id(10), id(1)],
      ),
    );
    await service.link(problem.id, user, id(42));
    const restricted = await service.detail(problem.id, {
      ...user,
      siteIds: [id(30)],
    });
    assert.deepEqual(
      restricted.tickets.map((t) => t.id),
      [id(40)],
    );
    const before = await query('SELECT count(*)::int n FROM audit_logs');
    await assert.rejects(
      service.update(problem.id, user, { ...patch, status: 'KNOWN_ERROR' }),
      BadRequestException,
    );
    assert.deepEqual(
      (await query('SELECT count(*)::int n FROM audit_logs')).rows,
      before.rows,
    );
    const saved = await service.update(problem.id, user, {
      ...patch,
      status: 'KNOWN_ERROR',
      rootCause: 'Faulty firmware',
      workaround: 'Restart the affected gateway',
    });
    assert.equal(saved.revision, 2);
    await assert.rejects(
      service.update(problem.id, user, patch),
      ConflictException,
    );
    await assert.rejects(
      service.update(
        problem.id,
        { ...user, roles: ['MANAGER'] },
        { ...patch, revision: 2, ownerUserId: id(2) },
      ),
      BadRequestException,
    );
    await service.note(problem.id, user, {
      body: 'Vendor reproduced the fault.',
    });
    const resolved = await service.update(problem.id, user, {
      ...patch,
      revision: 2,
      status: 'RESOLVED',
      rootCause: 'Faulty firmware',
      resolution: 'Installed fixed firmware and verified stability',
    });
    await service.update(
      problem.id,
      { ...user, roles: ['MANAGER'] },
      {
        ...patch,
        revision: resolved.revision,
        status: 'CLOSED',
        rootCause: 'Faulty firmware',
        resolution: 'Validated permanent fix',
      },
    );
    await assert.rejects(
      service.note(problem.id, user, { body: 'No silent post-close edits' }),
      BadRequestException,
    );
    await pg.exec("SELECT setval('problem_number_seq',99999999)");
    const large = await service.create(user, {
      clientId: id(10),
      title: 'Sequence growth',
      description: 'Number does not truncate',
      priority: 'P3_MEDIUM',
    });
    assert.equal(large.problem_number, 'PRB-100000000');
    assert.equal(
      (await query('SELECT version FROM app_schema_state')).rows[0]?.version,
      21,
    );
  } finally {
    await pg.close();
  }
});

test('registered Problem API rejects anonymous reads and writes before business access', async () => {
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
  const { createApp } = await import('../src/app');
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  try {
    for (const [method, url] of [
      ['GET', '/problems'],
      ['GET', '/problems/options'],
      ['GET', `/problems/${id(20)}`],
      ['POST', '/problems'],
      ['PATCH', `/problems/${id(20)}`],
      ['POST', `/problems/${id(20)}/tickets`],
      ['DELETE', `/problems/${id(20)}/tickets/${id(40)}`],
    ] as const) {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method,
          url,
          payload:
            method === 'POST'
              ? url.endsWith('/tickets')
                ? { ticketId: id(40) }
                : {
                    clientId: id(10),
                    title: 'Valid title',
                    description: 'Valid description',
                    priority: 'P3_MEDIUM',
                  }
              : method === 'PATCH'
                ? patch
                : undefined,
        });
      assert.equal(
        response.statusCode,
        method === 'GET' ? 401 : 403,
        `${method} ${url}`,
      );
    }
  } finally {
    await app.close();
  }
});
