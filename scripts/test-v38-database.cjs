// PostgreSQL semantics in an isolated WASM database; no LAB connection or external mail.
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const { vector } = require('@electric-sql/pglite-pgvector');
const Knex = require('knex');
const PostgresClient = require('knex/lib/dialects/postgres');
const { randomUUID } = require('node:crypto');
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  MAIL_CONFIG_KEY: '11'.repeat(32),
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  ENTRA_TENANT_ID: '',
  INITIAL_ADMIN_OBJECT_IDS: '',
});

async function database() {
  const pg = await PGlite.create({ extensions: { pg_trgm, pgcrypto, vector } });
  await pg.exec('CREATE ROLE amnikon_app');
  class EmbeddedPostgres extends PostgresClient {
    async acquireRawConnection() {
      return pg;
    }
    async destroyRawConnection() {}
    async _query(connection, obj) {
      const result = obj.bindings?.length
        ? await connection.query(obj.sql, obj.bindings)
        : ((await connection.exec(obj.sql)).at(-1) ?? {
            rows: [],
            affectedRows: 0,
          });
      obj.response = {
        ...result,
        rowCount: result.affectedRows ?? result.rows.length,
        command: /^\s*select|^\s*with/i.test(obj.sql)
          ? 'SELECT'
          : /^\s*insert/i.test(obj.sql)
            ? 'INSERT'
            : /^\s*update/i.test(obj.sql)
              ? 'UPDATE'
              : 'OTHER',
      };
      return obj;
    }
  }
  const knex = Knex({
    client: EmbeddedPostgres,
    connection: {},
    pool: { min: 0, max: 1 },
    migrations: {
      directory: path.join(__dirname, '../packages/database/migrations'),
    },
  });
  return { pg, knex };
}
async function main() {
  const { pg, knex } = await database();
  try {
    const migrationNames = require('node:fs')
      .readdirSync(path.join(__dirname, '../packages/database/migrations'))
      .sort();
    for (const name of migrationNames.slice(0, 16))
      await knex.migrate.up({ name });
    const legacyId = randomUUID();
    await pg.query(
      'INSERT INTO contacts(id,client_id,name,email) VALUES($1,$2,$3,$4)',
      [
        legacyId,
        '00000000-0000-4000-8000-000000000132',
        'Preserved internal contact',
        'preserved@example.invalid',
      ],
    );
    const [, names] = await knex.migrate.latest();
    assert.equal(names.length, 3);
    const [, again] = await knex.migrate.latest();
    assert.equal(again.length, 0);
    assert.equal(
      (await pg.query('SELECT version FROM app_schema_state')).rows[0].version,
      19,
    );
    assert.equal(
      (await pg.query('SELECT name FROM contacts WHERE id=$1', [legacyId]))
        .rows[0].name,
      'Preserved internal contact',
    );
    console.log(
      'PASS: all 19 migrations executed; v37 upgrade retained records; rerun applied zero migrations.',
    );
    await regressions(pg);
  } finally {
    await knex.destroy();
    await pg.close();
  }
}
async function regressions(pg) {
  const {
    TicketService,
    CreateTicketDto,
  } = require('../apps/api/dist/src/tickets');
  const {
    ClientPortalService,
    PortalQuery,
    PortalCreateDto,
    PortalReplyDto,
  } = require('../apps/api/dist/src/client-portal');
  const {
    ChangeService,
    CreateChangeDto,
    ChangeQuery,
  } = require('../apps/api/dist/src/changes');
  const {
    ChangeGovernanceService,
  } = require('../apps/api/dist/src/change-governance');
  const {
    KnowledgeService,
    KnowledgeQuery,
  } = require('../apps/api/dist/src/knowledge');
  const {
    MailSettingsService,
    protectMailSecret,
    revealMailSecret,
  } = require('../apps/api/dist/src/mail-settings');
  const { MailRecordService } = require('../apps/api/dist/src/mail-records');
  const { ingestMail } = require('../apps/api/dist/src/mail-inbox');
  const {
    ServiceReportService,
  } = require('../apps/api/dist/src/service-reports');
  const {
    smtpFailure,
    processMailOutbox,
  } = require('../apps/api/dist/src/mail-worker');
  const { queueChangeEmail } = require('../apps/api/dist/src/mail-queue');
  const query = async (sql, params = []) => {
    const r = await pg.query(sql, params);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  const deps = {
    db: { query, connect: async () => ({ query, release() {} }) },
  };
  const tickets = new TicketService(deps),
    portal = new ClientPortalService(deps, tickets),
    changes = new ChangeService(deps),
    governance = new ChangeGovernanceService(deps, changes),
    knowledge = new KnowledgeService(deps, tickets),
    mail = new MailSettingsService(deps),
    records = new MailRecordService(deps, tickets, changes),
    reports = new ServiceReportService(deps);
  const a = randomUUID(),
    b = randomUUID(),
    s1 = randomUUID(),
    s2 = randomUUID(),
    contact = randomUUID(),
    otherContact = randomUUID();
  await query(
    "INSERT INTO clients(id,name,ticket_prefix) VALUES($1,'Client A','ALPHA'),($2,'Client B','BETA')",
    [a, b],
  );
  await query(
    "INSERT INTO sites(id,client_id,name) VALUES($1,$2,'Site A1'),($3,$2,'Site A2')",
    [s1, a, s2],
  );
  const tenant = randomUUID();
  async function user(name, roles, clientIds = [a]) {
    const id = randomUUID(),
      email = `${name}@example.invalid`;
    await query(
      "INSERT INTO users(id,entra_object_id,entra_tenant_id,email,display_name,change_access) VALUES($1,$2,$3,$4,$5,'CHANGE_MANAGER')",
      [id, randomUUID(), tenant, email, name],
    );
    for (const role of roles)
      await query('INSERT INTO user_roles(user_id,role_code) VALUES($1,$2)', [
        id,
        role,
      ]);
    for (const client of clientIds)
      await query('INSERT INTO client_users(user_id,client_id) VALUES($1,$2)', [
        id,
        client,
      ]);
    return {
      id,
      email,
      displayName: name,
      roles,
      clientIds,
      siteIds: [],
      departmentIds: [],
      permissions: ['REPORTS_VIEW', 'TICKETS_TEAM_VIEW'],
      changeAccess: 'CHANGE_MANAGER',
      workScope: 'BOTH',
    };
  }
  const admin = await user('admin', ['ADMIN'], [a, b]),
    reviewer = await user('reviewer', ['MANAGER']),
    reviewer2 = await user('reviewer2', ['TECHNICIAN']),
    lead = await user('lead', ['TEAM_LEAD']),
    client = await user('client', ['USER']),
    applicant = await user('applicant', ['USER']);
  client.changeAccess = 'NONE';
  client.permissions = [];
  client.siteIds = [s1];
  await query(
    'INSERT INTO contacts(id,client_id,user_id,name,email,site_id) VALUES($1,$2,$3,$4,$5,$6)',
    [contact, a, client.id, 'Client contact', client.email, s1],
  );
  await query(
    "INSERT INTO contacts(id,client_id,name,email) VALUES($1,$2,'Other client contact','other@example.invalid')",
    [otherContact, b],
  );
  const category = (
    await query('SELECT id FROM categories WHERE active ORDER BY name LIMIT 1')
  ).rows[0].id;
  await query('SET ROLE amnikon_app');
  const makeTicket = (clientId, requesterId, siteId) =>
    Object.assign(new CreateTicketDto(), {
      clientId,
      requesterId,
      siteId,
      categoryId: category,
      subject: 'Support request',
      description: 'Needs attention to the server',
      source: 'EMAIL',
      priority: 'P3_MEDIUM',
      assignedUserId: admin.id,
      tagIds: [],
      attachments: [],
    });
  const t = await tickets.create(makeTicket(a, contact, s1), admin),
    t2 = await tickets.create(makeTicket(b, otherContact), admin),
    t3 = await tickets.create(makeTicket(a, contact, s2), admin);
  const pendingLink = randomUUID();
  await query(
    'INSERT INTO contacts(id,client_id,name,email,site_id) VALUES($1,$2,$3,$4,$5)',
    [pendingLink, a, 'Client portal applicant', applicant.email, s1],
  );
  await assert.rejects(
    () => portal.linkContact(pendingLink, admin, { userId: reviewer.id }),
    (e) => e.getStatus() === 400,
  );
  assert.equal(
    (await query('SELECT user_id FROM contacts WHERE id=$1', [pendingLink]))
      .rows[0].user_id,
    null,
  );
  await assert.rejects(
    () => portal.linkContact(pendingLink, admin, { userId: client.id }),
    (e) => e.getStatus() === 400,
  );
  await portal.linkContact(pendingLink, admin, { userId: applicant.id });
  assert.equal(
    (await query('SELECT user_id FROM contacts WHERE id=$1', [pendingLink]))
      .rows[0].user_id,
    applicant.id,
  );
  assert.match(t.ticket_number, /^ALPHA-/);
  assert.match(t2.ticket_number, /^BETA-/);
  assert.equal((await portal.list(client, new PortalQuery())).total, 1);
  await assert.rejects(
    () => portal.detail(t2.id, client),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    () => portal.detail(t3.id, client),
    (e) => e.getStatus() === 404,
  );
  await assert.rejects(
    () => portal.detail(t.id, reviewer),
    (e) => e.getStatus() === 403,
  );
  await assert.rejects(
    () =>
      portal.create(
        client,
        Object.assign(new PortalCreateDto(), {
          contactId: otherContact,
          siteId: s1,
          categoryId: category,
          subject: 'Denied request',
          description: 'Invalid contact',
        }),
      ),
    (e) => e.getStatus() === 403,
  );
  await tickets.comment(
    t.id,
    { type: 'INTERNAL', body: 'Staff-only investigation' },
    admin,
  );
  const file = {
    fileName: 'info.txt',
    contentType: 'text/plain',
    contentBase64: Buffer.from('sample file').toString('base64'),
  };
  await tickets.addAttachment(t.id, { ...file, visibility: 'INTERNAL' }, admin);
  await tickets.addAttachment(t.id, { ...file, visibility: 'PUBLIC' }, admin);
  const publicView = await portal.detail(t.id, client);
  assert.equal(publicView.comments.length, 0);
  assert.equal(publicView.attachments.length, 1);
  assert.ok(!('history' in publicView));
  await portal.reply(
    t.id,
    client,
    Object.assign(new PortalReplyDto(), { body: 'Requester update' }),
  );
  assert.equal(
    (
      await query(
        'SELECT response_completed_at FROM ticket_sla WHERE ticket_id=$1',
        [t.id],
      )
    ).rows[0].response_completed_at,
    null,
  );
  const ticketDetail = await tickets.detail(t.id, admin);
  assert.equal(ticketDetail.attachments.length, 2);
  assert.equal(ticketDetail.collaborators.length, 0);
  assert.ok(ticketDetail.history.every((h) => h.action));
  console.log(
    'PASS: ticket ownership, client/site isolation, public notes/files and detail query mapping.',
  );
  const settings = {
    enabled: true,
    smtpHost: 'mail.smtp2go.com',
    smtpPort: 587,
    tlsMode: 'STARTTLS',
    smtpUsername: 'fixture',
    password: 'test-password-do-not-send',
    ticketAddress: 'it@amnikontechnologies.com',
    changeAddress: 'change@amnikontechnologies.com',
    inboundProvider: 'DISABLED',
  };
  await assert.rejects(
    () => mail.save(reviewer, settings),
    (e) => e.getStatus() === 403,
  );
  await mail.save(admin, settings);
  const safe = await mail.settings(admin);
  assert.ok(safe.passwordSaved);
  assert.ok(!JSON.stringify(safe).includes('test-password'));
  const cipher = protectMailSecret('private');
  assert.equal(revealMailSecret(cipher), 'private');
  await assert.rejects(async () => revealMailSecret(cipher, '22'.repeat(32)));
  await tickets.comment(
    t.id,
    { type: 'INTERNAL', body: 'Internal note must not email' },
    admin,
  );
  assert.equal(
    (await query('SELECT count(*)::int n FROM mail_messages')).rows[0].n,
    0,
  );
  await tickets.comment(
    t.id,
    { type: 'PUBLIC', body: 'We have started troubleshooting.' },
    admin,
  );
  const outbound = (await query('SELECT * FROM mail_messages')).rows[0];
  assert.deepEqual(
    outbound.recipient_addresses.sort(),
    [admin.email, lead.email].sort(),
  );
  assert.ok(!outbound.recipient_addresses.includes(client.email));
  assert.ok(!outbound.recipient_addresses.includes(reviewer2.email));
  assert.equal(outbound.state, 'QUEUED');
  await query("UPDATE mail_messages SET state='SENT' WHERE id=$1", [
    outbound.id,
  ]);
  const incoming = {
    mailbox: settings.ticketAddress,
    messageId: '<reply1@example.invalid>',
    sender: admin.email,
    recipients: [settings.ticketAddress],
    subject: 'Re: support',
    body: 'Reply from a mailbox',
    references: [outbound.message_id],
    automatic: false,
    authenticated: true,
    attachments: [
      {
        fileName: 'reply.txt',
        contentType: 'text/plain',
        content: Buffer.from('mail attachment'),
      },
    ],
  };
  const receive = await ingestMail(deps, incoming);
  assert.equal(receive.state, 'RECEIVED');
  assert.ok((await ingestMail(deps, incoming)).duplicate);
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<spoof@example.invalid>',
        sender: 'outsider@example.invalid',
      })
    ).state,
    'REVIEW',
  );
  const firstEmail = await ingestMail(deps, {
    ...incoming,
    messageId: '<new-contact@example.invalid>',
    sender: client.email,
    references: [],
    inReplyTo: undefined,
  });
  assert.equal(firstEmail.state, 'RECEIVED');
  const created = (
    await query(
      'SELECT t.id,t.ticket_number,t.created_by_user_id,t.site_id FROM tickets t JOIN mail_messages m ON m.ticket_id=t.id WHERE m.id=$1',
      [firstEmail.id],
    )
  ).rows[0];
  assert.match(created.ticket_number, /^ALPHA-/);
  assert.equal(created.created_by_user_id, null);
  assert.equal(created.site_id, s1);
  const newTicketMail = (
    await query(
      "SELECT recipient_addresses FROM mail_messages WHERE ticket_id=$1 AND direction='OUTBOUND'",
      [created.id],
    )
  ).rows[0];
  assert.ok(!newTicketMail.recipient_addresses.includes(client.email));
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<new-contact@example.invalid>',
        sender: client.email,
        references: [],
        inReplyTo: undefined,
      })
    ).duplicate,
    true,
  );
  const contactReply = await ingestMail(deps, {
    ...incoming,
    messageId: '<contact-reply@example.invalid>',
    sender: client.email,
    references: ['<new-contact@example.invalid>'],
  });
  assert.equal(contactReply.state, 'RECEIVED');
  assert.equal(
    (
      await query('SELECT ticket_id FROM mail_messages WHERE id=$1', [
        contactReply.id,
      ])
    ).rows[0].ticket_id,
    created.id,
  );
  assert.equal((await tickets.detail(created.id, admin)).ticket.id, created.id);
  assert.equal((await portal.detail(created.id, client)).ticket.id, created.id);
  const unknown = await ingestMail(deps, {
    ...incoming,
    messageId: '<unknown@example.invalid>',
    sender: 'unknown@example.invalid',
    references: [],
    inReplyTo: undefined,
  });
  assert.equal(unknown.state, 'REVIEW');
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<unauth-contact@example.invalid>',
        sender: client.email,
        authenticated: false,
        references: [],
        inReplyTo: undefined,
      })
    ).state,
    'REVIEW',
  );
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<auto-contact@example.invalid>',
        sender: client.email,
        automatic: true,
        references: [],
        inReplyTo: undefined,
      })
    ).state,
    'IGNORED',
  );
  const duplicateContact = randomUUID();
  await query(
    'INSERT INTO contacts(id,client_id,name,email) VALUES($1,$2,$3,$4)',
    [duplicateContact, b, 'Duplicate contact', client.email],
  );
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<ambiguous@example.invalid>',
        sender: client.email,
        references: [],
        inReplyTo: undefined,
      })
    ).state,
    'REVIEW',
  );
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<unauth@example.invalid>',
        authenticated: false,
      })
    ).state,
    'REVIEW',
  );
  assert.equal(
    (
      await ingestMail(deps, {
        ...incoming,
        messageId: '<auto@example.invalid>',
        automatic: true,
      })
    ).state,
    'IGNORED',
  );
  assert.equal((await records.timeline('TICKET', t.id, client)).length, 0);
  assert.equal((await records.timeline('TICKET', t.id, admin)).length, 2);
  await assert.rejects(
    () => records.timeline('TICKET', t2.id, client),
    (e) => e.getStatus() === 404,
  );
  const inboundFile = (
    await query('SELECT id FROM mail_attachments WHERE message_id=$1', [
      receive.id,
    ])
  ).rows[0];
  await assert.rejects(
    () => records.attachment(inboundFile.id, client),
    (e) => e.getStatus() === 404,
  );
  assert.ok(await records.attachment(inboundFile.id, admin));
  await tickets.assign(
    t3.id,
    { assignedUserId: reviewer2.id, reason: 'Reassigned to site technician' },
    admin,
  );
  const transferMail = (
    await query(
      "SELECT recipient_addresses FROM mail_messages WHERE ticket_id=$1 AND direction='OUTBOUND'",
      [t3.id],
    )
  ).rows[0];
  assert.deepEqual(
    transferMail.recipient_addresses.sort(),
    [admin.email, lead.email, reviewer2.email].sort(),
  );
  assert.ok(!transferMail.recipient_addresses.includes(client.email));
  await assert.rejects(
    () => queueChangeEmail(deps.db, randomUUID(), randomUUID(), admin.id),
    (e) => e.getStatus() === 400,
  );
  await assert.rejects(
    () => mail.test(admin, { channel: 'CHANGE' }),
    (e) => e.getStatus() === 400,
  );
  await query(
    "UPDATE mail_messages SET state='SENT' WHERE ticket_id=$1 AND direction='OUTBOUND'",
    [t3.id],
  );
  const blockedCab = (
    await query(
      "INSERT INTO mail_messages(direction,channel,mailbox,message_id,sender_address,recipient_addresses,subject,body,state) VALUES('OUTBOUND','CHANGE',$1,$2,$1,$3,'CAB must not send','Test','QUEUED') RETURNING id",
      [
        settings.changeAddress,
        `<blocked-${randomUUID()}@example.invalid>`,
        ['external@example.invalid'],
      ],
    )
  ).rows[0].id;
  assert.equal(await processMailOutbox(deps), 0);
  assert.deepEqual(
    (
      await query(
        'SELECT state,last_error_code FROM mail_messages WHERE id=$1',
        [blockedCab],
      )
    ).rows[0],
    { state: 'FAILED', last_error_code: 'INTERNAL_TICKET_MAIL_ONLY' },
  );
  await tickets.comment(
    t2.id,
    { type: 'PUBLIC', body: 'Client B update' },
    admin,
  );
  const otherClientMail = (
    await query(
      "SELECT recipient_addresses FROM mail_messages WHERE ticket_id=$1 AND direction='OUTBOUND'",
      [t2.id],
    )
  ).rows[0];
  assert.deepEqual(otherClientMail.recipient_addresses, [admin.email]);
  assert.deepEqual(smtpFailure({ responseCode: 450 }), {
    state: 'QUEUED',
    code: 'SMTP_450',
  });
  assert.equal(smtpFailure({ code: 'ECONNRESET' }).state, 'UNKNOWN');
  console.log(
    'PASS: encrypted credentials, admin-only settings, internal-note exclusion, reply deduplication and sender/thread checks.',
  );
  const change = await changes.create(
    admin,
    Object.assign(new CreateChangeDto(), {
      clientId: a,
      siteId: s1,
      title: 'Server patch',
      description: 'Apply maintenance updates',
      category: 'SERVER',
      changeType: 'NORMAL',
      risk: 'HIGH',
      impact: 'Planned restart',
      reason: 'Security maintenance',
      businessJustification: 'Reduce vulnerabilities',
      implementationPlan: 'Install and restart',
      testPlan: 'Check application health',
      rollbackPlan: 'Restore snapshot',
      plannedStart: '2026-10-10T10:00:00Z',
      plannedEnd: '2026-10-10T11:00:00Z',
      stakeholderContactIds: [contact],
      clientNotificationEnabled: true,
    }),
  );
  const group = await governance.saveGroup(admin, {
    name: 'Operations CAB',
    quorum: 2,
    memberIds: [reviewer.id, reviewer2.id],
    active: true,
  });
  await changes.status(change.id, admin, { status: 'SUBMITTED' });
  await changes.status(change.id, admin, { status: 'ASSESSMENT' });
  await governance.requestCab(change.id, admin, { groupId: group.id });
  await changes.status(change.id, admin, { status: 'AWAITING_APPROVAL' });
  let votes = (await changes.detail(change.id, admin)).approvals;
  await assert.rejects(
    () =>
      changes.decide(change.id, votes[0].id, admin, {
        status: 'APPROVED',
        note: 'Owner attempting approval',
      }),
    (e) => e.getStatus() === 403,
  );
  await changes.decide(
    change.id,
    votes.find((v) => v.approver_user_id === reviewer.id).id,
    reviewer,
    { status: 'APPROVED', note: 'Reviewed plans' },
  );
  assert.equal(
    (await changes.detail(change.id, admin)).change.status,
    'AWAITING_APPROVAL',
  );
  await changes.decide(
    change.id,
    votes.find((v) => v.approver_user_id === reviewer2.id).id,
    reviewer2,
    { status: 'APPROVED', note: 'Reviewed tests and rollback' },
  );
  assert.equal(
    (await changes.detail(change.id, admin)).change.status,
    'APPROVED',
  );
  await governance.blackout(admin, {
    name: 'Business freeze',
    clientId: a,
    startsAt: '2026-10-10T10:30:00Z',
    endsAt: '2026-10-10T12:00:00Z',
    active: true,
  });
  await assert.rejects(
    () => changes.status(change.id, admin, { status: 'SCHEDULED' }),
    (e) => e.getStatus() === 400,
  );
  await changes.status(change.id, admin, {
    status: 'SCHEDULED',
    overrideReason: 'Approved maintenance exception by service owner',
  });
  await governance.amend(change.id, admin, {
    revision: 1,
    reason: 'Move maintenance outside the blackout',
    plannedStart: '2026-10-11T10:00:00Z',
    plannedEnd: '2026-10-11T11:00:00Z',
    affectedResources: ['SERVER-01'],
  });
  assert.equal((await changes.detail(change.id, admin)).change.revision, 2);
  assert.equal(
    (await changes.detail(change.id, admin)).change.status,
    'ASSESSMENT',
  );
  assert.equal(
    (await governance.detail(change.id, admin)).readiness.ready,
    false,
  );
  await assert.rejects(
    () =>
      governance.amend(change.id, admin, {
        revision: 1,
        reason: 'Stale revision must not overwrite',
      }),
    (e) => e.getStatus() === 400,
  );
  await governance.requestCab(change.id, admin, { groupId: group.id });
  await changes.status(change.id, admin, { status: 'AWAITING_APPROVAL' });
  votes = (await changes.detail(change.id, admin)).approvals.filter(
    (v) => v.revision === 2,
  );
  for (const u of [reviewer, reviewer2])
    await changes.decide(
      change.id,
      votes.find((v) => v.approver_user_id === u.id).id,
      u,
      { status: 'APPROVED', note: 'Reapproved revised schedule' },
    );
  for (const status of ['SCHEDULED', 'IN_PROGRESS', 'VALIDATION', 'COMPLETED'])
    await changes.status(change.id, admin, { status });
  await assert.rejects(
    () => changes.status(change.id, admin, { status: 'CLOSED' }),
    (e) => e.getStatus() === 400,
  );
  await governance.review(change.id, admin, {
    outcome: 'SUCCESS',
    summary: 'Patch installed and validated successfully.',
    followUp: 'Monitor tomorrow.',
  });
  await changes.status(change.id, admin, { status: 'CLOSED' });
  assert.equal(
    (await changes.list({ ...reviewer, clientIds: [b] }, new ChangeQuery()))
      .total,
    0,
  );
  await assert.rejects(
    () => query('UPDATE change_reviews SET summary=summary'),
    (e) => e.code === '42501',
  );
  console.log(
    'PASS: independent CAB quorum, self-approval denial, blackouts/override, revision invalidation and mandatory immutable review.',
  );
  const article = await knowledge.save(admin, {
    title: 'Restart guidance',
    body: 'Use a scheduled change for server restarts.',
    clientId: a,
    categoryId: category,
    visibility: 'STAFF',
    status: 'PUBLISHED',
  });
  assert.equal((await knowledge.list(client, new KnowledgeQuery())).total, 0);
  await knowledge.save(
    admin,
    {
      title: 'Restart guidance',
      body: 'Use a scheduled change for server restarts.',
      clientId: a,
      categoryId: category,
      visibility: 'CLIENT',
      status: 'PUBLISHED',
      revision: 1,
    },
    article.id,
  );
  assert.equal((await knowledge.list(client, new KnowledgeQuery())).total, 1);
  await assert.rejects(
    () =>
      knowledge.save(reviewer, {
        title: 'Other client',
        body: 'Must never be permitted.',
        clientId: b,
        visibility: 'STAFF',
        status: 'PUBLISHED',
      }),
    (e) => e.getStatus() === 403,
  );
  await knowledge.link(admin, article.id, t.id);
  assert.equal((await tickets.detail(t.id, admin)).knowledge.length, 1);
  await knowledge.saveTemplate(admin, {
    name: 'Request software',
    description: 'Approved software installation',
    instructions: 'Application name and business reason:',
    categoryId: category,
    clientId: a,
    active: true,
  });
  assert.equal((await knowledge.catalogue(client)).items.length, 1);
  const report = await reports.report(admin, {
    from: '2026-01-01',
    to: '2026-12-31',
  });
  assert.ok(report.tickets.created >= 3);
  assert.equal(report.knowledge.article_links, 1);
  await assert.rejects(
    () => reports.report(client, { from: '2026-01-01', to: '2026-12-31' }),
    (e) => e.getStatus() === 403,
  );
  console.log(
    'PASS: knowledge publication/client scope, ticket linking, catalogue and scoped service reports.',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
