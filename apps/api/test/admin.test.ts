import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  AdminService,
  AdminController,
  AdminQuery,
  UpdateAccessDto,
} from '../src/admin';
import { AuthService, AuthenticatedUser } from '../src/auth';
import type { Dependencies } from '../src/dependencies';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { permissionsForRoles } from '../src/access';
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
const actor: AuthenticatedUser = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Admin',
  email: 'admin@example.invalid',
  roles: ['ADMIN'],
  clientIds: [],
};
function harness(
  options: {
    remaining?: boolean;
    cycle?: boolean;
    auditFailure?: boolean;
    allowed?: boolean;
    contactLinked?: boolean;
  } = {},
) {
  const queries: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  const query = async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values });
    if (sql.includes('INSERT INTO audit_logs') && options.auditFailure)
      throw new Error('audit failed');
    if (sql.includes('u.id=$1 AND u.active'))
      return { rows: [], rowCount: options.allowed === false ? 0 : 1 };
    if (sql.includes('AND u.id<>$1'))
      return { rows: [], rowCount: options.remaining ? 1 : 0 };
    if (sql.includes('WITH RECURSIVE'))
      return { rows: [], rowCount: options.cycle ? 1 : 0 };
    if (sql.includes('SELECT $1,code,$2 FROM permissions'))
      return { rows: [], rowCount: 1 };
    if (sql.includes('EXISTS(SELECT 1 FROM tickets WHERE requester_id=$1)'))
      return {
        rows: [
          {
            ticket: options.contactLinked ?? false,
            change: false,
          },
        ],
        rowCount: 1,
      };
    if (sql.includes('FOR UPDATE'))
      return {
        rows: [
          {
            active: true,
            name: 'Original requester',
            email: 'original@example.invalid',
            phone: '+1 555 0100',
            roles: ['ADMIN'],
            clientIds: [],
            client_id: '20000000-0000-4000-8000-000000000002',
          },
        ],
        rowCount: 1,
      };
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
  return { service: new AdminService(deps), queries, released: () => released };
}
test('last administrator cannot be demoted or disabled and transaction rolls back', async () => {
  for (const dto of [
    { roles: ['TECHNICIAN'], clientIds: [], active: true },
    { roles: ['ADMIN'], clientIds: [], active: false },
  ]) {
    const h = harness();
    await assert.rejects(
      h.service.updateAccess(actor.id, dto, actor),
      ConflictException,
    );
    assert.ok(h.queries.some((q) => q.sql === 'ROLLBACK'));
    assert.ok(!h.queries.some((q) => q.sql.startsWith('UPDATE')));
    assert.equal(h.released(), true);
  }
});
test('administrator handover audits before commit and revokes existing sessions', async () => {
  const h = harness({ remaining: true });
  await h.service.updateAccess(
    actor.id,
    { roles: ['TECHNICIAN'], clientIds: [], active: true },
    actor,
  );
  assert.ok(
    h.queries.some((q) => q.sql.includes('session_version=session_version+1')),
  );
  assert.ok(
    h.queries.findIndex((q) => q.sql.includes('INSERT INTO audit_logs')) <
      h.queries.findIndex((q) => q.sql === 'COMMIT'),
  );
});
test('staff role profiles apply fixed permissions without trusting custom selections', async () => {
  const h = harness({ remaining: true });
  await h.service.updateAccess(
    actor.id,
    {
      roles: ['MANAGER'],
      clientIds: ['20000000-0000-4000-8000-000000000002'],
      permissions: ['USERS_MANAGE'],
      active: true,
    },
    actor,
  );
  const assigned = h.queries
    .filter((query) => query.sql.includes('SELECT $1,code,$2 FROM permissions'))
    .map((query) => query.values?.[2]);
  assert.deepEqual(assigned, permissionsForRoles(['MANAGER']));
  assert.ok(!assigned.includes('USERS_MANAGE'));
});
test('concurrent access edits recheck administrator rights after acquiring lock', async () => {
  const h = harness({ allowed: false });
  await assert.rejects(
    h.service.updateAccess(
      actor.id,
      { roles: ['ADMIN'], clientIds: [], active: true },
      actor,
    ),
    ForbiddenException,
  );
  assert.ok(!h.queries.some((q) => q.sql.startsWith('UPDATE')));
});
test('audit failure rolls back access changes', async () => {
  const h = harness({ remaining: true, auditFailure: true });
  await assert.rejects(
    h.service.updateAccess(
      actor.id,
      { roles: ['TECHNICIAN'], clientIds: [], active: true },
      actor,
    ),
    /audit failed/,
  );
  assert.ok(h.queries.some((q) => q.sql === 'ROLLBACK'));
  assert.ok(!h.queries.some((q) => q.sql === 'COMMIT'));
});
test('permanent deletion requires confirmation, preserves an audit event and protects the last administrator', async () => {
  const rejected = harness({ remaining: true });
  await assert.rejects(
    rejected.service.deleteRecord(
      'users',
      '10000000-0000-4000-8000-000000000002',
      'remove',
      actor,
    ),
    BadRequestException,
  );
  assert.equal(rejected.queries.length, 0);

  const h = harness({ remaining: true });
  await h.service.deleteRecord(
    'users',
    '10000000-0000-4000-8000-000000000002',
    'delete',
    actor,
  );
  assert.ok(h.queries.some((q) => q.sql === 'DELETE FROM users WHERE id=$1'));
  assert.ok(
    h.queries.findIndex((q) => q.sql.includes('USER.DELETED')) <
      h.queries.findIndex((q) => q.sql === 'COMMIT'),
  );

  const finalAdmin = harness();
  await assert.rejects(
    finalAdmin.service.deleteRecord(
      'users',
      '10000000-0000-4000-8000-000000000002',
      'delete',
      actor,
    ),
    ConflictException,
  );
});
test('contact removal permanently deletes unused contacts and deactivates retained history', async () => {
  const unused = harness();
  const deleted = await unused.service.deleteRecord(
    'contacts',
    '70000000-0000-4000-8000-000000000001',
    'delete',
    actor,
  );
  assert.deepEqual(deleted, {
    id: '70000000-0000-4000-8000-000000000001',
    deleted: true,
  });
  assert.ok(
    unused.queries.some((query) =>
      query.sql.includes('DELETE FROM contacts WHERE id=$1'),
    ),
  );

  const retained = harness({ contactLinked: true });
  const deactivated = await retained.service.deleteRecord(
    'contacts',
    '70000000-0000-4000-8000-000000000001',
    'delete',
    actor,
  );
  assert.deepEqual(deactivated, {
    id: '70000000-0000-4000-8000-000000000001',
    deleted: false,
    deactivated: true,
  });
  assert.ok(
    retained.queries.some((query) =>
      query.sql.includes('UPDATE contacts SET active=false'),
    ),
  );
  assert.ok(
    retained.queries.some((query) =>
      query.sql.includes("'CONTACT.DEACTIVATED'"),
    ),
  );
  assert.ok(
    !retained.queries.some((query) =>
      query.sql.includes('DELETE FROM contacts WHERE id=$1'),
    ),
  );
});
test('user membership and access DTOs reject invalid roles, fields and pagination', async () => {
  const h = harness();
  await assert.rejects(
    h.service.updateAccess(
      actor.id,
      { roles: ['USER'], clientIds: [], active: true },
      actor,
    ),
    BadRequestException,
  );
  assert.ok(
    (
      await validate(
        plainToInstance(UpdateAccessDto, {
          roles: ['OWNER'],
          clientIds: [],
          active: 'false',
        }),
      )
    ).length,
  );
  assert.ok(
    (
      await validate(
        plainToInstance(UpdateAccessDto, {
          roles: ['TECHNICIAN', 'MANAGER'],
          clientIds: [],
          active: true,
        }),
      )
    ).length,
  );
  assert.ok(
    (await validate(plainToInstance(AdminQuery, { page: 0, pageSize: 10000 })))
      .length,
  );
});
test('category cycle and cross-client ownership changes are rejected', async () => {
  const h = harness({ cycle: true });
  await assert.rejects(
    h.service.updateRecord(
      'categories',
      actor.id,
      { name: 'Test', parentId: actor.id, active: true },
      actor,
    ),
    BadRequestException,
  );
  await assert.rejects(
    h.service.updateRecord(
      'sites',
      actor.id,
      { name: 'Test', clientId: actor.id, active: true },
      actor,
    ),
    BadRequestException,
  );
});
test('unknown resources and unsupported edit fields cannot reach SQL', async () => {
  const h = harness();
  await assert.rejects(
    h.service.updateRecord('users', actor.id, { roles: ['ADMIN'] }, actor),
  );
  await assert.rejects(
    h.service.updateRecord(
      'clients',
      actor.id,
      { name: 'Test', active: true, arbitrary: 'value' },
      actor,
    ),
    BadRequestException,
  );
  assert.equal(h.queries.length, 0);
});
test('requester audit details never contain phone numbers or email addresses', async () => {
  const h = harness();
  await h.service.updateRecord(
    'contacts',
    actor.id,
    {
      clientId: '20000000-0000-4000-8000-000000000002',
      name: 'Updated requester',
      email: 'updated@example.invalid',
      phone: '+1 555 0199',
      active: true,
    },
    actor,
  );
  const audit = h.queries.find((query) =>
    query.sql.includes('INSERT INTO audit_logs'),
  );
  assert.ok(audit);
  const details = String(audit.values?.[4]);
  assert.match(details, /Updated requester/);
  assert.doesNotMatch(
    details,
    /original@example|updated@example|555 0100|555 0199/,
  );
});
test('audit history resolves names with a PostgreSQL-safe reference alias', async () => {
  const sql: string[] = [];
  const service = new AdminService({
    db: {
      query: async (statement: string) => {
        sql.push(statement);
        if (statement.includes('WITH records AS'))
          return {
            rows: [
              {
                total: 1,
                items: [
                  {
                    entity_id: '20000000-0000-4000-8000-000000000002',
                    details: {
                      before: {
                        name: 'Requester',
                        phone: '+1 555 0100',
                        email: 'requester@example.invalid',
                      },
                    },
                  },
                ],
              },
            ],
          };
        return {
          rows: [
            {
              id: '20000000-0000-4000-8000-000000000002',
              label: 'Requester',
            },
          ],
        };
      },
    },
  } as unknown as Dependencies);

  const result = await service.list('audit-logs', {
    q: '',
    status: 'all',
    page: 1,
    pageSize: 25,
  } as AdminQuery);
  const referenceQuery = sql[1];
  assert.ok(referenceQuery);
  assert.match(referenceQuery, /\) AS reference_names/);
  assert.doesNotMatch(referenceQuery, /\) references/);
  const item = result.items?.[0];
  assert.ok(item);
  assert.equal(item.entity_name, 'Requester');
  assert.deepEqual(item.details, {
    before: { name: 'Requester' },
  });
});
test('admin controller denies non-admin list and mutation; CSRF checked first', async () => {
  let listed = false;
  const controller = new AdminController(
    {
      currentUser: async () => {
        throw new ForbiddenException();
      },
      hasPermission: () => false,
      requireRoles: async () => {
        throw new ForbiddenException();
      },
      verifyCsrf: async () => {
        throw new ForbiddenException();
      },
    } as unknown as AuthService,
    {
      list: async () => {
        listed = true;
      },
    } as unknown as AdminService,
  );
  await assert.rejects(
    controller.list({} as FastifyRequest, 'users', new AdminQuery()),
    ForbiddenException,
  );
  await assert.rejects(
    controller.access({} as FastifyRequest, actor.id, {
      roles: ['ADMIN'],
      clientIds: [],
      active: true,
    }),
    ForbiddenException,
  );
  assert.equal(listed, false);
});
test('category administration uses individual permission without widening other admin resources', async () => {
  const teamLead = {
    ...actor,
    roles: ['TEAM_LEAD'],
    permissions: ['CATEGORY_MANAGE'],
  };
  const controller = new AdminController(
    {
      currentUser: async () => teamLead,
      hasPermission: (user: AuthenticatedUser, permission: string) =>
        user.permissions?.includes(permission) ?? false,
      verifyCsrf: async () => undefined,
    } as unknown as AuthService,
    {
      list: async () => ({ items: [], total: 0 }),
      updateRecord: async () => ({ id: actor.id }),
      deleteRecord: async () => ({ id: actor.id, deleted: true }),
    } as unknown as AdminService,
  );
  await controller.list({} as FastifyRequest, 'categories', new AdminQuery());
  await controller.update({} as FastifyRequest, 'categories', actor.id, {
    name: 'Email',
    active: true,
  });
  await controller.delete({} as FastifyRequest, 'categories', actor.id, {
    confirmation: 'delete',
  });
  await assert.rejects(
    controller.list({} as FastifyRequest, 'users', new AdminQuery()),
    ForbiddenException,
  );
});
test('stale or deactivated sessions fail; live session uses current database permissions', async () => {
  for (const [active, version] of [
    [true, 2],
    [false, 1],
    [true, 1],
  ] as const) {
    const deps = {
      redis: {
        status: 'ready',
        get: async () =>
          JSON.stringify({ userId: actor.id, csrfToken: 'csrf', version: 1 }),
      },
      db: {
        query: async () => ({
          rows: [
            {
              id: actor.id,
              display_name: 'User',
              email: actor.email,
              active,
              session_version: version,
              roles: ['USER'],
              client_ids: ['client-a'],
            },
          ],
        }),
      },
    } as unknown as Dependencies;
    const auth = new AuthService(deps);
    const request = {
      headers: { cookie: 'amnikon_session=test' },
    } as FastifyRequest;
    if (!active || version !== 1)
      await assert.rejects(auth.currentUser(request), UnauthorizedException);
    else assert.deepEqual((await auth.currentUser(request)).roles, ['USER']);
  }
});
