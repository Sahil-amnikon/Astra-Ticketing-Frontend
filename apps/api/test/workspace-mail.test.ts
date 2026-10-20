import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import {
  AuthService,
  workspaceUser,
  type AuthenticatedUser,
} from '../src/auth';
import {
  validSmtpEndpoint,
  MailSettingsService,
  type SaveMailSettingsDto,
} from '../src/mail-settings';
import { InternalService } from '../src/internal';
import type { Dependencies } from '../src/dependencies';

const account: AuthenticatedUser = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Admin',
  email: 'admin@example.invalid',
  roles: ['ADMIN'],
  permissions: ['*'],
  clientIds: [],
  changeAccess: 'CHANGE_MANAGER',
  workScope: 'ALL',
};
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

test('admin privileges are capped by the selected workspace without changing the account', () => {
  assert.deepEqual(
    workspaceUser({ ...account, roles: ['USER', 'INTERN'] }, 'operations')
      .roles,
    ['INTERN'],
  );
  const technician = workspaceUser(account, 'operations');
  assert.deepEqual(technician.roles, ['TECHNICIAN']);
  assert.ok(!technician.permissions?.includes('*'));
  assert.ok(!technician.permissions?.includes('USERS_MANAGE'));
  assert.equal(technician.changeAccess, 'CONTRIBUTOR');
  const manager = workspaceUser(account, 'management');
  assert.deepEqual(manager.roles, ['MANAGER']);
  assert.ok(manager.permissions?.includes('REPORTS_VIEW'));
  assert.ok(!manager.permissions?.includes('*'));
  assert.deepEqual(workspaceUser(account, 'admin').roles, ['ADMIN']);
  assert.deepEqual(account.roles, ['ADMIN']);
});
test('workspace selection cannot elevate an ordinary technician', () => {
  const staff = {
    ...account,
    roles: ['TECHNICIAN'],
    permissions: ['TICKETS_ASSIGN'],
  };
  assert.throws(() => workspaceUser(staff, 'admin'), ForbiddenException);
  assert.throws(() => workspaceUser(staff, 'management'), ForbiddenException);
  assert.throws(() => workspaceUser(account, 'invalid'), ForbiddenException);
  assert.throws(() => workspaceUser(account, 'client'), ForbiddenException);
});
test('AuthService blocks administrative APIs in technician workspace and missing context', async () => {
  const deps = {
    redis: {
      status: 'ready',
      get: async () =>
        JSON.stringify({ userId: account.id, version: 0, csrfToken: 'test' }),
    },
    db: {
      query: async (sql: string) =>
        sql === 'SELECT id FROM clients'
          ? { rows: [{ id: '20000000-0000-4000-8000-000000000001' }] }
          : {
              rows: [
                {
                  id: account.id,
                  display_name: 'Admin',
                  email: account.email,
                  active: true,
                  session_version: 0,
                  roles: ['ADMIN'],
                  client_ids: [],
                  site_ids: [],
                  department_ids: [],
                  work_scope: 'ALL',
                  change_access: 'CHANGE_MANAGER',
                },
              ],
            },
    },
  } as unknown as Dependencies;
  const auth = new AuthService(deps);
  const request = (workspace?: string, url = '/admin/email') =>
    ({
      url,
      headers: {
        cookie: 'amnikon_session=test',
        ...(workspace ? { 'x-amnikon-workspace': workspace } : {}),
      },
    }) as unknown as FastifyRequest;
  await assert.rejects(
    () => auth.requireRoles(request('operations'), ['ADMIN']),
    ForbiddenException,
  );
  await assert.rejects(
    () => auth.requirePermission(request('operations'), 'USERS_MANAGE'),
    ForbiddenException,
  );
  await assert.rejects(
    () => auth.requireRoles(request(), ['ADMIN']),
    ForbiddenException,
  );
  await assert.rejects(
    () => auth.requireRoles(request('chooser'), ['ADMIN']),
    ForbiddenException,
  );
  assert.deepEqual(
    (await auth.requireRoles(request('admin'), ['ADMIN'])).roles,
    ['ADMIN'],
  );
  assert.deepEqual(
    (await auth.currentUser(request('chooser', '/auth/me'))).roles,
    ['ADMIN'],
  );
  assert.deepEqual((await auth.currentUser(request('operations'))).clientIds, [
    '20000000-0000-4000-8000-000000000001',
  ]);
});
test('SMTP supports alternate providers and rejects malformed endpoints or TLS downgrade', () => {
  for (const host of [
    'mail.smtp2go.com',
    'smtp.office365.com',
    'smtp.gmail.com',
    'smtp.internal.example',
  ])
    assert.equal(validSmtpEndpoint(host, 587, 'STARTTLS'), true);
  for (const host of [
    'https://smtp.example.com',
    'user:pass@smtp.example.com',
    'smtp.example.com/path',
    '127.0.0.1',
    'smtp.example.com:80',
    '-bad.example.com',
    'a..example.com',
  ])
    assert.equal(validSmtpEndpoint(host, 587, 'STARTTLS'), false);
  assert.equal(validSmtpEndpoint('smtp.example.com', 80, 'STARTTLS'), false);
  assert.equal(validSmtpEndpoint('smtp.example.com', 465, 'STARTTLS'), false);
  assert.equal(validSmtpEndpoint('smtp.example.com', 587, 'TLS'), false);
  assert.equal(validSmtpEndpoint('smtp.example.com', 465, 'TLS'), true);
});
test('changing provider cannot silently reuse the saved SMTP password', async () => {
  const db = {
    query: async (sql: string) =>
      sql.includes('SELECT * FROM mail_settings')
        ? {
            rows: [
              {
                smtp_host: 'mail.smtp2go.com',
                smtp_username: 'old',
                password_ciphertext: 'saved',
              },
            ],
          }
        : { rows: [] },
    release: () => {},
  };
  const service = new MailSettingsService({
    db: { connect: async () => db },
  } as unknown as Dependencies);
  await assert.rejects(
    () =>
      service.save(account, {
        enabled: false,
        smtpHost: 'smtp.other.example',
        smtpPort: 587,
        tlsMode: 'STARTTLS',
        smtpUsername: 'old',
        ticketAddress: 'tickets@example.invalid',
        changeAddress: 'changes@example.invalid',
        inboundProvider: 'DISABLED',
      } as SaveMailSettingsDto),
    BadRequestException,
  );
});
test('directory includes staff without departments once and excludes client-only users, inactive staff and self', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,display_name text,active boolean); CREATE TABLE user_roles(user_id uuid,role_code text); CREATE TABLE departments(id uuid PRIMARY KEY,name text,active boolean); CREATE TABLE department_users(user_id uuid,department_id uuid,expertise text,is_lead boolean);
 INSERT INTO users VALUES('${account.id}','Self',true),('10000000-0000-4000-8000-000000000002','Unassigned Staff',true),('10000000-0000-4000-8000-000000000003','Client Only',true),('10000000-0000-4000-8000-000000000004','Inactive Staff',false),('10000000-0000-4000-8000-000000000005','Multi Department Staff',true);
 INSERT INTO user_roles VALUES('${account.id}','ADMIN'),('10000000-0000-4000-8000-000000000002','TECHNICIAN'),('10000000-0000-4000-8000-000000000003','USER'),('10000000-0000-4000-8000-000000000004','TECHNICIAN'),('10000000-0000-4000-8000-000000000005','TECHNICIAN');
 INSERT INTO departments VALUES('60000000-0000-4000-8000-000000000001','Support',true),('60000000-0000-4000-8000-000000000002','Network',true);
 INSERT INTO department_users VALUES('10000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000001','Support',false),('10000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000002','Routing',false);`);
    const directory = await new InternalService({
      db,
    } as unknown as Dependencies).directory(account);
    assert.equal(directory.length, 2);
    assert.ok(directory.some((x) => x.name === 'Unassigned Staff'));
    assert.equal(
      directory.filter((x) => x.name === 'Multi Department Staff').length,
      1,
    );
  } finally {
    await db.close();
  }
});
