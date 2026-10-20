import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientDomainService } from '../src/support-portal';
import { ClientPortalService, PortalCreateDto } from '../src/client-portal';
import { AdminService, AdminQuery } from '../src/admin';
import type { Dependencies } from '../src/dependencies';
import type { TicketService, CreateTicketDto } from '../src/tickets';
import type { AuthenticatedUser } from '../src/auth';
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
});
async function harness() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE amnikon_app;
 CREATE TABLE app_schema_state(id int PRIMARY KEY,version int);INSERT INTO app_schema_state VALUES(1,21);
 CREATE TABLE clients(id uuid PRIMARY KEY,name text,ticket_prefix text,status text DEFAULT 'ACTIVE',organization_type text DEFAULT 'CLIENT');
 CREATE TABLE users(id uuid PRIMARY KEY,active boolean DEFAULT true);
 CREATE TABLE sites(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),name text,active boolean DEFAULT true);
 CREATE TABLE contacts(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),site_id uuid,user_id uuid,name text,email text,active boolean DEFAULT true);
 CREATE TABLE categories(id uuid PRIMARY KEY,name text,parent_id uuid,active boolean DEFAULT true);
 CREATE TABLE tickets(id uuid PRIMARY KEY,client_id uuid,ticket_number text,UNIQUE(id,client_id));
 CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
 CREATE TABLE mail_settings(id int PRIMARY KEY,enabled boolean,smtp_username text,password_ciphertext text);INSERT INTO mail_settings VALUES(1,true,'fixture','encrypted');
 INSERT INTO clients VALUES('${id(10)}','AAHC','AAHC','ACTIVE','CLIENT'),('${id(11)}','ACF','ACF','ACTIVE','CLIENT');
 INSERT INTO sites VALUES('${id(30)}','${id(10)}','AAHC HQ',true),('${id(31)}','${id(10)}','AAHC Branch',true),('${id(32)}','${id(11)}','ACF HQ',true);
 INSERT INTO contacts VALUES('${id(20)}','${id(10)}',NULL,'${id(1)}','Contact A','person@aahc.example',true);
 INSERT INTO categories VALUES('${id(40)}','Network',NULL,true);`);
  await createRequire(resolve('package.json'))(
    resolve('packages/database/migrations/022_verified_support_portal.cjs'),
  ).up({ raw: (sql: string) => pg.exec(sql) });
  await pg.exec(`CREATE TABLE client_ticket_sequences(client_id uuid PRIMARY KEY,next_number bigint DEFAULT 1);
 INSERT INTO tickets VALUES('${id(51)}','${id(10)}','AAHC-000099');INSERT INTO client_ticket_sequences VALUES('${id(10)}',100);`);
  await createRequire(resolve('package.json'))(
    resolve('packages/database/migrations/024_site_ticket_numbering.cjs'),
  ).up({ raw: (sql: string) => pg.exec(sql) });
  const query = async (sql: string, values?: unknown[]) => {
    const r = await pg.query<Record<string, unknown>>(sql, values);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  const deps = {
    db: { query, connect: async () => ({ query, release: () => {} }) },
  } as unknown as Dependencies;
  const created: CreateTicketDto[] = [];
  const tickets = {
    create: async (dto: CreateTicketDto) => {
      created.push(dto);
      return {
        id: id(50),
        ticket_number: 'numbering-is-tested-in-live-rollback-check',
      };
    },
  } as unknown as TicketService;
  return {
    pg,
    query,
    domains: new ClientDomainService(deps),
    portal: new ClientPortalService(deps, tickets),
    admin: new AdminService(deps),
    created,
  };
}
const user: AuthenticatedUser = {
  id: id(1),
  displayName: 'Customer A',
  email: 'person@aahc.example',
  roles: ['USER'],
  clientIds: [id(10)],
  siteIds: [],
};
const dto = () =>
  Object.assign(new PortalCreateDto(), {
    contactId: id(20),
    categoryId: id(40),
    subject: 'Case routing test',
    description: 'A case should use the domain site.',
    attachments: [],
  });
test('multiple domains under one site are listed and searchable by administrators only', async () => {
  const h = await harness();
  try {
    await h.domains.save(
      {
        clientId: id(10),
        siteId: id(30),
        domain: 'aahc.example',
        active: true,
      },
      id(1),
    );
    await h.domains.save(
      {
        clientId: id(10),
        siteId: id(30),
        domain: 'aahc-second.example',
        active: true,
      },
      id(1),
    );
    await h.domains.save(
      { clientId: id(11), siteId: id(32), domain: 'acf.example', active: true },
      id(1),
    );
    assert.equal((await h.domains.list(id(30))).domains.length, 2);
    const q = Object.assign(new AdminQuery(), { q: 'aahc-second.example' });
    const adminPage = await h.admin.list('sites', q, true);
    assert.equal(adminPage.items?.length, 1);
    assert.equal((adminPage.items?.[0]?.email_domains as unknown[]).length, 2);
    assert.equal(adminPage.items?.[0]?.client_ticket_prefix, 'AAHC');
    const ordinary = await h.admin.list(
      'sites',
      Object.assign(new AdminQuery(), { q: '' }),
    );
    assert.ok(ordinary.items?.every((s) => !Object.hasOwn(s, 'email_domains')));
  } finally {
    await h.pg.close();
  }
});
test('signed-in client requests use the domain site and preserve client and site access limits', async () => {
  const h = await harness();
  try {
    await h.domains.save(
      {
        clientId: id(10),
        siteId: id(30),
        domain: 'aahc.example',
        active: true,
      },
      id(1),
    );
    assert.equal(
      (await h.portal.options(user)).contacts[0]?.routing_site_id,
      id(30),
    );
    await h.portal.create(user, dto());
    assert.equal(h.created[0]?.siteId, id(30));
    assert.equal(h.created[0]?.clientId, id(10));
    assert.equal(h.created[0]?.source, 'CLIENT_PORTAL');
    await assert.rejects(
      h.portal.create(user, Object.assign(dto(), { siteId: id(31) })),
      BadRequestException,
    );
    await assert.rejects(
      h.portal.create({ ...user, siteIds: [id(31)] }, dto()),
      ForbiddenException,
    );
    await assert.rejects(
      h.portal.create({ ...user, clientIds: [id(11)] }, dto()),
      ForbiddenException,
    );
    await h.query('UPDATE contacts SET site_id=$1 WHERE id=$2', [
      id(31),
      id(20),
    ]);
    await assert.rejects(h.portal.create(user, dto()), BadRequestException);
    assert.equal(h.created.length, 1);
  } finally {
    await h.pg.close();
  }
});
test('misconfigured cross-customer domains cannot move a signed-in contact to another client', async () => {
  const h = await harness();
  try {
    await h.domains.save(
      {
        clientId: id(11),
        siteId: id(32),
        domain: 'aahc.example',
        active: true,
      },
      id(1),
    );
    await assert.rejects(h.portal.create(user, dto()), BadRequestException);
    assert.equal(h.created.length, 0);
  } finally {
    await h.pg.close();
  }
});
test('routing saves reject stale revisions, retain disabled domains and do not silently reassign clients', async () => {
  const h = await harness();
  try {
    const rule = await h.domains.save(
      {
        clientId: id(10),
        siteId: id(30),
        domain: 'aahc.example',
        active: true,
      },
      id(1),
    );
    await h.domains.save(
      {
        clientId: id(10),
        siteId: id(30),
        domain: 'aahc.example',
        active: false,
        revision: 1,
      },
      id(1),
      rule.id,
    );
    await assert.rejects(
      h.domains.save(
        {
          clientId: id(10),
          siteId: id(31),
          domain: 'aahc.example',
          active: true,
          revision: 1,
        },
        id(1),
        rule.id,
      ),
      BadRequestException,
    );
    assert.equal((await h.domains.list(id(30))).domains[0]?.active, false);
    await h.portal.create(user, Object.assign(dto(), { siteId: id(31) }));
    assert.equal(h.created[0]?.siteId, id(31));
    assert.equal(
      (await h.query('SELECT count(*)::int n FROM audit_logs')).rows[0]?.n,
      2,
    );
  } finally {
    await h.pg.close();
  }
});

test('site numbering uses independent sequences, preserves history, reserves prefixes and rolls back allocations', async () => {
  const h = await harness();
  try {
    assert.equal(
      (await h.query('SELECT ticket_number FROM tickets WHERE id=$1', [id(51)]))
        .rows[0]?.ticket_number,
      'AAHC-000099',
    );
    await h.query('UPDATE sites SET ticket_prefix=$1 WHERE id=$2', [
      'AAHCHQ',
      id(30),
    ]);
    const allocate = async (client: string, site: string | null) =>
      (await h.query('SELECT next_ticket_number($1,$2) number', [client, site]))
        .rows[0]?.number;
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQ-000001');
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQ-000002');
    const branch = (
      await h.query('SELECT ticket_prefix FROM sites WHERE id=$1', [id(31)])
    ).rows[0]?.ticket_prefix;
    assert.equal(await allocate(id(10), id(31)), branch + '-000001');
    assert.equal(await allocate(id(10), null), 'AAHC-000100');
    await assert.rejects(allocate(id(11), id(30)), { code: '23514' });
    await assert.rejects(
      h.query('UPDATE sites SET ticket_prefix=$1 WHERE id=$2', [
        'AAHCHQ',
        id(32),
      ]),
      { code: '23505' },
    );
    await assert.rejects(
      h.query('UPDATE sites SET ticket_prefix=$1 WHERE id=$2', [
        'AAHC',
        id(30),
      ]),
      { code: '23505' },
    );
    await h.query('UPDATE sites SET ticket_prefix=$1 WHERE id=$2', [
      'AAHCHQA',
      id(30),
    ]);
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQA-000003');
    await assert.rejects(
      h.query('UPDATE sites SET ticket_prefix=$1 WHERE id=$2', [
        'AAHCHQ',
        id(32),
      ]),
      { code: '23505' },
    );
    await h.query('BEGIN');
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQA-000004');
    await h.query('ROLLBACK');
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQA-000004');
    await h.query(
      'UPDATE site_ticket_sequences SET next_number=1000000 WHERE site_id=$1',
      [id(30)],
    );
    assert.equal(await allocate(id(10), id(30)), 'AAHCHQA-1000000');
  } finally {
    await h.pg.close();
  }
});
