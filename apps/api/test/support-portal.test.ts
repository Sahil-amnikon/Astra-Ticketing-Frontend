import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SupportPortalService,
  ClientDomainService,
  ClientDomainController,
  SupportTicketDto,
  normalizedDomain,
  normalizedPortalEmail,
  OTP_CHECK,
} from '../src/support-portal';
import type { Dependencies } from '../src/dependencies';
import type { TicketService } from '../src/tickets';
import type { FastifyRequest } from 'fastify';
import type { AuthService } from '../src/auth';
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
  MAIL_CONFIG_KEY: 'ab'.repeat(32),
});

class RedisFixture {
  status = 'ready';
  values = new Map<string, string>();
  expires = new Map<string, number>();
  async get(k: string) {
    if ((this.expires.get(k) ?? Infinity) <= Date.now()) {
      this.values.delete(k);
    }
    return this.values.get(k) ?? null;
  }
  async set(k: string, v: string, _ex: string, ttl: number) {
    this.values.set(k, v);
    this.expires.set(k, Date.now() + ttl * 1000);
    return 'OK';
  }
  async del(k: string) {
    this.expires.delete(k);
    return this.values.delete(k) ? 1 : 0;
  }
  async eval(script: string, _count: number, k: string, arg: string | number) {
    if (script === OTP_CHECK) {
      const raw = await this.get(k);
      if (!raw) return null;
      const v = JSON.parse(raw);
      v.attempts++;
      if (v.attempts > 5) {
        await this.del(k);
        return null;
      }
      if (v.digest !== arg) {
        if (v.attempts >= 5) await this.del(k);
        else this.values.set(k, JSON.stringify(v));
        return null;
      }
      await this.del(k);
      return raw;
    }
    const value = Number((await this.get(k)) ?? 0) + 1;
    this.values.set(k, String(value));
    if (value === 1) this.expires.set(k, Date.now() + Number(arg) * 1000);
    return value;
  }
}
async function harness() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE amnikon_app;
    CREATE TABLE app_schema_state(id int PRIMARY KEY,version int);INSERT INTO app_schema_state VALUES(1,21);
    CREATE TABLE clients(id uuid PRIMARY KEY,name text,status text DEFAULT 'ACTIVE',organization_type text DEFAULT 'CLIENT',ticket_prefix text);
    CREATE TABLE sites(id uuid PRIMARY KEY,client_id uuid REFERENCES clients(id),name text,active boolean DEFAULT true);
    CREATE TABLE categories(id uuid PRIMARY KEY,name text,active boolean DEFAULT true);
    CREATE TABLE contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),site_id uuid,name text,email text,active boolean DEFAULT true);
    CREATE TABLE tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clients(id),requester_id uuid REFERENCES contacts(id),ticket_number text,UNIQUE(id,client_id));
    CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
    CREATE TABLE mail_settings(id int PRIMARY KEY,enabled boolean,smtp_username text,password_ciphertext text);
    INSERT INTO mail_settings VALUES(1,true,'fixture','encrypted');
    INSERT INTO clients(id,name,ticket_prefix) VALUES('${id(1)}','Client Alpha','ALP'),('${id(2)}','Client Beta','BET');
    INSERT INTO sites(id,client_id,name) VALUES('${id(11)}','${id(1)}','Alpha HQ'),('${id(12)}','${id(2)}','Beta HQ');
    INSERT INTO categories VALUES('${id(21)}','Network',true);`);
  const req = createRequire(resolve('package.json'));
  await req(
    resolve('packages/database/migrations/022_verified_support_portal.cjs'),
  ).up({ raw: (sql: string) => pg.exec(sql) });
  await pg.exec(
    'CREATE TABLE client_ticket_sequences(client_id uuid PRIMARY KEY,next_number bigint DEFAULT 1)',
  );
  await req(
    resolve('packages/database/migrations/024_site_ticket_numbering.cjs'),
  ).up({ raw: (sql: string) => pg.exec(sql) });
  const query = async (sql: string, values?: unknown[]) => {
    const r = await pg.query<Record<string, unknown>>(sql, values);
    return { rows: r.rows, rowCount: r.affectedRows || r.rows.length };
  };
  const redis = new RedisFixture();
  let created = 0;
  const deps = {
    db: { query, connect: async () => ({ query, release: () => {} }) },
    redis,
  } as unknown as Dependencies;
  const tickets = {
    createVerifiedPortalTicket: async (dto: {
      clientId: string;
      requesterId: string;
      source: string;
      priority: string;
      siteId?: string;
    }) => {
      assert.equal(dto.source, 'CLIENT_PORTAL');
      assert.equal(dto.priority, 'P3_MEDIUM');
      created++;
      const number = (
        await query('SELECT next_ticket_number($1,$2) ticket_number', [
          dto.clientId,
          dto.siteId ?? null,
        ])
      ).rows[0]!.ticket_number;
      return (
        await query(
          'INSERT INTO tickets(client_id,requester_id,ticket_number) VALUES($1,$2,$3) RETURNING id,ticket_number',
          [dto.clientId, dto.requesterId, number],
        )
      ).rows[0]!;
    },
  } as unknown as TicketService;
  const service = new SupportPortalService(deps, tickets),
    admin = new ClientDomainService(deps);
  const rule = await admin.save(
    { clientId: id(1), domain: 'alpha.example', siteId: id(11), active: true },
    id(90),
  );
  async function session(email = 'person@alpha.example') {
    const token = 'cd'.repeat(32);
    const identity = {
      email,
      ruleId: rule.id,
      clientId: id(1),
      revision: rule.revision,
      csrfToken: 'csrf-token',
    };
    await redis.set(
      `support:session:${createHash('sha256').update(token).digest('hex')}`,
      JSON.stringify(identity),
      'EX',
      3600,
    );
    return {
      headers: {
        cookie: `astra_support_session=${token}`,
        origin: 'http://localhost:3000',
        'x-csrf-token': 'csrf-token',
      },
    } as unknown as FastifyRequest;
  }
  return {
    pg,
    query,
    redis,
    service,
    admin,
    rule,
    session,
    created: () => created,
  };
}
test('email domain normalization uses exact IDN-aware domains and rejects malformed domains', () => {
  assert.equal(normalizedDomain(' Example.COM '), 'example.com');
  assert.equal(normalizedDomain('bücher.example'), 'xn--bcher-kva.example');
  assert.equal(
    normalizedPortalEmail(' Person@EXAMPLE.COM '),
    'person@example.com',
  );
  for (const bad of [
    'https://example.com',
    '*.example.com',
    'user@example.com',
    'example.com.evil/',
    'example..com',
    '-example.com',
  ])
    assert.throws(() => normalizedDomain(bad), BadRequestException);
});
test('admin supports multiple domains, prevents cross-client sites and enforces uniqueness', async () => {
  const h = await harness();
  try {
    await h.admin.save(
      { clientId: id(1), domain: 'alpha-two.example', active: true },
      id(90),
    );
    assert.equal((await h.admin.list()).domains.length, 2);
    await assert.rejects(
      h.admin.save(
        { clientId: id(2), domain: 'alpha.example', active: true },
        id(90),
      ),
    );
    await assert.rejects(
      h.admin.save(
        {
          clientId: id(1),
          domain: 'other.example',
          siteId: id(12),
          active: true,
        },
        id(90),
      ),
      BadRequestException,
    );
    await assert.rejects(
      h.admin.save(
        { clientId: id(1), domain: 'gmail.com', active: true },
        id(90),
      ),
      BadRequestException,
    );
    await assert.rejects(
      h.admin.save(
        { clientId: id(2), domain: 'alpha.example', active: true },
        id(90),
        h.rule.id,
      ),
      BadRequestException,
    );
    assert.equal(
      (await h.query('SELECT version FROM app_schema_state')).rows[0]!.version,
      24,
    );
  } finally {
    await h.pg.close();
  }
});
test('verified session only returns its client sites, rejects CSRF and expires after rule edits', async () => {
  const h = await harness();
  try {
    await assert.rejects(
      h.service.options({ headers: {} } as FastifyRequest),
      UnauthorizedException,
    );
    const req = await h.session();
    const opts = await h.service.options(req);
    assert.equal(opts.client.name, 'Client Alpha');
    assert.deepEqual(
      opts.sites.map((s) => s.id),
      [id(11)],
    );
    await assert.rejects(
      h.service.identity(
        {
          headers: { ...req.headers, 'x-csrf-token': 'wrong' },
        } as unknown as FastifyRequest,
        true,
      ),
      ForbiddenException,
    );
    await assert.rejects(
      h.service.identity(
        {
          headers: { ...req.headers, origin: 'https://evil.example' },
        } as unknown as FastifyRequest,
        true,
      ),
      ForbiddenException,
    );
    await h.admin.save(
      { clientId: id(1), domain: 'alpha.example', active: false },
      id(90),
      h.rule.id,
    );
    await assert.rejects(h.service.options(req), UnauthorizedException);
  } finally {
    await h.pg.close();
  }
});
test('portal submission creates a verified contact, uses client numbering and is idempotent', async () => {
  const h = await harness();
  try {
    const req = await h.session();
    const dto = {
      requestId: randomUUID(),
      name: 'Example User',
      categoryId: id(21),
      subject: 'Cannot connect to VPN',
      description: 'Connection drops after signing in.',
    };
    const first = await h.service.submit(req, dto);
    assert.equal(first.ticket_number, 'ALPS001-000001');
    assert.deepEqual(await h.service.submit(req, dto), first);
    assert.equal(h.created(), 1);
    const contact = (await h.query('SELECT * FROM contacts')).rows[0]!;
    assert.equal(contact.client_id, id(1));
    assert.equal(contact.email, 'person@alpha.example');
    assert.equal(contact.site_id, id(11));
    await assert.rejects(
      h.service.submit(req, {
        ...dto,
        requestId: randomUUID(),
        siteId: id(12),
      }),
      BadRequestException,
    );
    const other = await h.session('another@alpha.example');
    await assert.rejects(h.service.submit(other, dto), ForbiddenException);
    const audit = (
      await h.query(
        "SELECT * FROM audit_logs WHERE action='PORTAL.TICKET_SUBMITTED'",
      )
    ).rows[0]!;
    assert.equal(audit.actor_user_id, null);
    assert.equal(h.created(), 1);
  } finally {
    await h.pg.close();
  }
});
test('an inactive contact cannot be recreated to bypass a client disable decision', async () => {
  const h = await harness();
  try {
    await h.query(
      'INSERT INTO contacts(client_id,name,email,active) VALUES($1,$2,$3,false)',
      [id(1), 'Disabled', 'person@alpha.example'],
    );
    await assert.rejects(
      h.service.submit(await h.session(), {
        requestId: randomUUID(),
        name: 'Person',
        categoryId: id(21),
        subject: 'Test issue',
        description: 'Test description',
      }),
      BadRequestException,
    );
    assert.equal(h.created(), 0);
  } finally {
    await h.pg.close();
  }
});
test('unknown domains get a neutral response; email code regeneration is rate limited', async () => {
  const h = await harness();
  try {
    const result = await h.service.sendCode('person@unknown.example');
    assert.match(result.challenge, /^[a-f0-9]{64}$/);
    assert.equal(result.expiresIn, 600);
    assert.ok(!('client' in result));
    await assert.rejects(
      h.service.sendCode('person@unknown.example'),
      (e) => (e as { getStatus: () => number }).getStatus() === 429,
    );
    await assert.rejects(
      h.service.verify({ challenge: result.challenge, code: '000000' }),
      BadRequestException,
    );
  } finally {
    await h.pg.close();
  }
});
test('HTTP ticket DTO rejects client, priority, requester and assignee overrides', async () => {
  const dto = plainToInstance(SupportTicketDto, {
    requestId: randomUUID(),
    name: 'User',
    categoryId: id(21),
    subject: 'Test ticket',
    description: 'Test issue',
    clientId: id(2),
    priority: 'P1_CRITICAL',
    requesterId: id(33),
    assignedUserId: id(90),
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  assert.deepEqual(errors.map((e) => e.property).sort(), [
    'assignedUserId',
    'clientId',
    'priority',
    'requesterId',
  ]);
});
test('administrative domain writes require effective admin workspace and CSRF', async () => {
  let saved = false;
  const controller = new ClientDomainController(
    {
      requireRoles: async () => {
        throw new ForbiddenException();
      },
      verifyCsrf: async () => {},
    } as unknown as AuthService,
    {
      save: async () => {
        saved = true;
      },
    } as unknown as ClientDomainService,
  );
  await assert.rejects(
    controller.create({} as unknown as FastifyRequest, {
      clientId: id(1),
      domain: 'alpha.example',
      active: true,
    }),
    ForbiddenException,
  );
  assert.equal(saved, false);
});

test('emailed codes are single use, limited to five guesses, expire and bind to the issued client rule', async () => {
  const req = createRequire(resolve('package.json'));
  const mail = req(resolve('apps/api/dist/src/mail-settings.js'));
  const original = mail.smtpTransport;
  let delivered = '';
  let recipient = '';
  mail.smtpTransport = () => ({
    sendMail: async (message: { text: string; to: string }) => {
      delivered = message.text.match(/code is (\d{6})/)?.[1] ?? '';
      recipient = message.to;
    },
    close: () => {},
  });
  const h = await harness();
  try {
    const result = await h.service.sendCode('Person@alpha.example');
    assert.equal(recipient, 'person@alpha.example');
    assert.match(delivered, /^\d{6}$/);
    const challengeKey = `support:challenge:${createHash('sha256').update(result.challenge).digest('hex')}`;
    assert.ok(
      !h.redis.values.get(challengeKey)?.includes(`"code":"${delivered}"`),
    );
    const authenticated = await h.service.verify({
      challenge: result.challenge,
      code: delivered,
    });
    assert.equal(authenticated.identity.clientId, id(1));
    assert.equal(authenticated.identity.email, 'person@alpha.example');
    await assert.rejects(
      h.service.verify({ challenge: result.challenge, code: delivered }),
      BadRequestException,
    );
    const guesses = await h.service.sendCode('guesses@alpha.example');
    const correct = delivered;
    const wrong = correct === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        h.service.verify({ challenge: guesses.challenge, code: wrong }),
        BadRequestException,
      );
    await assert.rejects(
      h.service.verify({ challenge: guesses.challenge, code: correct }),
      BadRequestException,
    );
    const expires = await h.service.sendCode('expires@alpha.example');
    const expiresCode = delivered;
    h.redis.expires.set(
      `support:challenge:${createHash('sha256').update(expires.challenge).digest('hex')}`,
      Date.now() - 1,
    );
    await assert.rejects(
      h.service.verify({ challenge: expires.challenge, code: expiresCode }),
      BadRequestException,
    );
    const changed = await h.service.sendCode('changed@alpha.example');
    const changedCode = delivered;
    await h.admin.save(
      {
        clientId: id(1),
        domain: 'alpha.example',
        siteId: id(11),
        active: true,
      },
      id(90),
      h.rule.id,
    );
    await assert.rejects(
      h.service.verify({ challenge: changed.challenge, code: changedCode }),
      BadRequestException,
    );
    const cookie = h.service.cookie(authenticated.token);
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Strict'));
    assert.ok(cookie.includes('Path=/api/support'));
  } finally {
    mail.smtpTransport = original;
    await h.pg.close();
  }
});
