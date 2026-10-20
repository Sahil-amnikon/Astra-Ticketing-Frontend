import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupService, GroupController, GroupDto } from '../src/groups';
import { AuthService, workspaceUser } from '../src/auth';
import { ClientPortalService } from '../src/client-portal';
import type { Dependencies } from '../src/dependencies';
import type { TicketService } from '../src/tickets';
import type { FastifyRequest } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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
async function harness() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE amnikon_app;
    CREATE TABLE app_schema_state(id int PRIMARY KEY,version int);INSERT INTO app_schema_state VALUES(1,22);
    CREATE TABLE clients(id uuid PRIMARY KEY,name text,status text DEFAULT 'ACTIVE',organization_type text DEFAULT 'CLIENT');
    CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text,active boolean DEFAULT true,session_version int DEFAULT 0,work_scope text DEFAULT 'CLIENT',change_access text DEFAULT 'NONE');
    CREATE TABLE user_roles(user_id uuid,role_code text);CREATE TABLE client_users(user_id uuid,client_id uuid);
    CREATE TABLE user_sites(user_id uuid,site_id uuid);CREATE TABLE user_permissions(user_id uuid,permission_code text);CREATE TABLE department_users(user_id uuid,department_id uuid);
    CREATE TABLE contacts(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),user_id uuid REFERENCES users(id),name text,email text,active boolean DEFAULT true);
    CREATE TABLE permissions(code text PRIMARY KEY,name text,description text);
    CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE sites(id uuid PRIMARY KEY,client_id uuid,name text,active boolean DEFAULT true);
    CREATE TABLE categories(id uuid PRIMARY KEY,name text);
    CREATE TABLE tickets(id uuid PRIMARY KEY,client_id uuid,requester_id uuid,ticket_number text,subject text,description text,status text,priority text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),assigned_user_id uuid,site_id uuid,category_id uuid);
    CREATE TABLE ticket_comments(id uuid DEFAULT gen_random_uuid(),ticket_id uuid,author_user_id uuid,comment_type text,body text);
    CREATE TABLE ticket_history(ticket_id uuid,actor_user_id uuid,action text,new_value jsonb);
    INSERT INTO clients VALUES('${id(10)}','Alpha','ACTIVE','CLIENT'),('${id(11)}','Beta','ACTIVE','CLIENT');
    INSERT INTO users(id,display_name,email) VALUES('${id(1)}','Customer A','a@alpha.test'),('${id(2)}','Customer Other','other@alpha.test'),('${id(3)}','Customer B','b@beta.test'),('${id(4)}','Tech','tech@example.test'),('${id(5)}','Administrator','admin@example.test');
    INSERT INTO user_roles VALUES('${id(1)}','USER'),('${id(2)}','USER'),('${id(3)}','USER'),('${id(4)}','TECHNICIAN'),('${id(5)}','ADMIN');
    INSERT INTO client_users VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(10)}'),('${id(3)}','${id(11)}'),('${id(4)}','${id(10)}');
    INSERT INTO contacts VALUES('${id(20)}','${id(10)}','${id(1)}','Contact A','a@alpha.test',true),('${id(21)}','${id(10)}','${id(2)}','Other contact','other@alpha.test',true),('${id(22)}','${id(11)}','${id(3)}','Contact B','b@beta.test',true);
    INSERT INTO tickets(id,client_id,requester_id,ticket_number,subject,description,status,priority) VALUES('${id(30)}','${id(10)}','${id(20)}','ALP-1','Own ticket','Own description','OPEN','P3_MEDIUM'),('${id(31)}','${id(10)}','${id(21)}','ALP-2','Other ticket','Other description','OPEN','P3_MEDIUM'),('${id(32)}','${id(11)}','${id(22)}','BET-1','Other customer','Private','OPEN','P3_MEDIUM');
  `);
  await createRequire(resolve('package.json'))(
    resolve('packages/database/migrations/023_customer_staff_groups.cjs'),
  ).up({ raw: (sql: string) => pg.exec(sql) });
  const query = async (sql: string, values?: unknown[]) => {
    const r = await pg.query<Record<string, unknown>>(sql, values);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  let sessionUser = id(1);
  const deps = {
    db: { query, connect: async () => ({ query, release: () => {} }) },
    redis: {
      status: 'ready',
      get: async () =>
        JSON.stringify({ userId: sessionUser, version: 0, csrfToken: 'csrf' }),
    },
  } as unknown as Dependencies;
  const groups = new GroupService(deps),
    auth = new AuthService(deps),
    portal = new ClientPortalService(deps, {} as TicketService);
  const user = async (n = 1, workspace = 'client') => {
    sessionUser = id(n);
    return auth.currentUser({
      headers: {
        cookie: 'amnikon_session=fixture',
        'x-amnikon-workspace': workspace,
      },
      url: '/portal/tickets',
    } as unknown as FastifyRequest);
  };
  return { pg, query, groups, auth, portal, user };
}
const customer = (changes: Partial<GroupDto> = {}): GroupDto => ({
  name: 'Customer leads',
  description: '',
  kind: 'CUSTOMER',
  clientId: id(10),
  permissions: ['PORTAL_ORGANIZATION_VIEW'],
  memberIds: [id(20)],
  active: true,
  ...changes,
});
test('group migration, membership validation and audited lifecycle', async () => {
  const h = await harness();
  try {
    assert.equal(
      (await h.query('SELECT version FROM app_schema_state')).rows[0]?.version,
      23,
    );
    await assert.rejects(
      h.groups.save(customer({ memberIds: [id(22)] }), id(5)),
      BadRequestException,
    );
    await assert.rejects(
      h.groups.save(customer({ permissions: ['USERS_MANAGE'] }), id(5)),
      BadRequestException,
    );
    await assert.rejects(
      h.groups.save(
        customer({ permissions: ['PORTAL_ORGANIZATION_REPLY'] }),
        id(5),
      ),
      BadRequestException,
    );
    await assert.rejects(
      h.groups.save(
        customer({
          kind: 'STAFF',
          clientId: undefined,
          memberIds: [id(1)],
          permissions: ['REPORTS_VIEW'],
        }),
        id(5),
      ),
      BadRequestException,
    );
    const g = await h.groups.save(customer(), id(5));
    assert.equal(g.revision, 1);
    await assert.rejects(
      h.groups.save(customer({ name: '  CUSTOMER LEADS  ' }), id(5)),
      { code: '23505' },
    );
    await assert.rejects(
      h.query(
        'INSERT INTO customer_group_members(group_id,client_id,contact_id) VALUES($1,$2,$3)',
        [g.id, id(10), id(22)],
      ),
      { code: '23503' },
    );
    await assert.rejects(
      h.groups.save(
        customer({ revision: 1, clientId: id(11), memberIds: [id(22)] }),
        id(5),
        g.id,
      ),
      BadRequestException,
    );
    const changed = await h.groups.save(
      customer({ revision: 1, active: false }),
      id(5),
      g.id,
    );
    assert.equal(changed.revision, 2);
    await assert.rejects(
      h.groups.save(customer({ revision: 1 }), id(5), g.id),
      BadRequestException,
    );
    const page = await h.groups.list({
      q: 'Customer',
      kind: 'CUSTOMER',
      page: 1,
    });
    assert.equal(page.total, 1);
    assert.equal((await h.groups.detail(g.id)).customer_members.length, 1);
    const audit = await h.query(
      'SELECT action,details FROM audit_logs ORDER BY created_at',
    );
    assert.deepEqual(
      audit.rows.map((r) => r.action),
      ['GROUP.CREATED', 'GROUP.UPDATED'],
    );
    assert.equal(
      (audit.rows[1]?.details as { after: { active: boolean } }).after.active,
      false,
    );
  } finally {
    await h.pg.close();
  }
});
test('customer group permissions cover list, detail and replies without crossing client or site scope', async () => {
  const h = await harness();
  try {
    let u = await h.user();
    assert.equal((await h.portal.list(u, { q: '', page: 1 })).total, 1);
    await assert.rejects(h.portal.own(id(31), u), NotFoundException);
    const g = await h.groups.save(customer(), id(5));
    u = await h.user();
    assert.equal((await h.portal.list(u, { q: '', page: 1 })).total, 2);
    const other = await h.portal.own(id(31), u);
    assert.equal(other.can_reply, false);
    await assert.rejects(
      h.portal.reply(id(31), u, { body: 'Public reply', attachments: [] }),
      NotFoundException,
    );
    await assert.rejects(h.portal.own(id(32), u), NotFoundException);
    assert.equal(
      (await h.portal.list(u, { q: 'Other customer', page: 1 })).total,
      0,
    );
    await h.query('UPDATE tickets SET site_id=$1 WHERE id=$2', [
      id(40),
      id(31),
    ]);
    await assert.rejects(
      h.portal.own(id(31), { ...u, siteIds: [id(41)] }),
      NotFoundException,
    );
    await h.groups.save(
      customer({
        revision: 1,
        permissions: ['PORTAL_ORGANIZATION_VIEW', 'PORTAL_ORGANIZATION_REPLY'],
      }),
      id(5),
      g.id,
    );
    assert.equal((await h.portal.own(id(31), u)).can_reply, true);
    await h.portal.reply(id(31), u, {
      body: 'Organization reply',
      attachments: [],
    });
    assert.equal(
      (await h.query('SELECT body FROM ticket_comments')).rows[0]?.body,
      'Organization reply',
    );
    await h.groups.save(customer({ revision: 2, active: false }), id(5), g.id);
    await assert.rejects(h.portal.own(id(31), u), NotFoundException);
    assert.equal((await h.portal.list(u, { q: '', page: 1 })).total, 1);
    await h.groups.save(customer({ revision: 3 }), id(5), g.id);
    await h.query('UPDATE contacts SET active=false WHERE id=$1', [id(20)]);
    await assert.rejects(h.portal.own(id(31), u), NotFoundException);
  } finally {
    await h.pg.close();
  }
});
test('staff permission changes apply on the next request and preserve role, customer and site caps', async () => {
  const h = await harness();
  try {
    const before = await h.user(4, 'operations');
    assert.ok(!before.permissions?.includes('REPORTS_VIEW'));
    const dto: GroupDto = {
      name: 'Reporting staff',
      description: '',
      kind: 'STAFF',
      permissions: ['REPORTS_VIEW'],
      memberIds: [id(4)],
      active: true,
    };
    const g = await h.groups.save(dto, id(5));
    const after = await h.user(4, 'operations');
    assert.ok(after.permissions?.includes('REPORTS_VIEW'));
    assert.deepEqual(after.roles, ['TECHNICIAN']);
    assert.deepEqual(after.clientIds, [id(10)]);
    assert.deepEqual(after.siteIds, before.siteIds);
    assert.throws(() => workspaceUser(after, 'admin'), ForbiddenException);
    assert.throws(() => workspaceUser(after, 'management'), ForbiddenException);
    await h.groups.save({ ...dto, revision: 1, memberIds: [] }, id(5), g.id);
    assert.ok(
      !(await h.user(4, 'operations')).permissions?.includes('REPORTS_VIEW'),
    );
    const intern = workspaceUser({ ...after, roles: ['INTERN'] }, 'operations');
    assert.ok(!intern.permissions?.includes('REPORTS_VIEW'));
    assert.deepEqual(
      workspaceUser({ ...after, roles: ['USER'] }, 'client').permissions,
      [],
    );
  } finally {
    await h.pg.close();
  }
});
test('group controller rejects unauthorized reads and checks CSRF before writes', async () => {
  let touched = false;
  const controller = new GroupController(
    {
      requireRoles: async () => {
        throw new ForbiddenException();
      },
      verifyCsrf: async () => {
        throw new ForbiddenException();
      },
    } as unknown as AuthService,
    {
      list: async () => {
        touched = true;
      },
      save: async () => {
        touched = true;
      },
    } as unknown as GroupService,
  );
  const req = {} as FastifyRequest;
  await assert.rejects(
    controller.list(req, { q: '', kind: 'ALL', page: 1 }),
    ForbiddenException,
  );
  await assert.rejects(controller.create(req, customer()), ForbiddenException);
  assert.equal(touched, false);
  const invalid = plainToInstance(GroupDto, {
    ...customer(),
    permissions: ['ADMIN'],
    memberIds: ['not-a-uuid'],
    active: 'true',
  });
  assert.ok((await validate(invalid)).length >= 3);
});
