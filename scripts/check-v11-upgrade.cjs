// Run ONLY against a fresh isolated database. Verifies the deployed Phase 2 v10
// schema to v11 SLA/reporting upgrade, preservation and repeatability.
const assert = require('node:assert/strict');
const knex = require('knex');
const path = require('node:path');

if (process.env.ALLOW_ISOLATED_MIGRATION_TEST !== 'true')
  throw new Error(
    'Set ALLOW_ISOLATED_MIGRATION_TEST=true only for an empty isolated database',
  );
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error('MIGRATION_DATABASE_URL is required');

const db = knex({
  client: 'pg',
  connection: process.env.MIGRATION_DATABASE_URL,
  migrations: {
    directory: path.join(__dirname, '../packages/database/migrations'),
  },
  pool: { min: 0, max: 1 },
});

(async () => {
  try {
    const existing = await db.raw(
      "SELECT to_regclass('public.app_schema_state') AS schema_table",
    );
    if (existing.rows[0].schema_table)
      throw new Error(
        'Database already contains Amnikon schema; use an empty isolated database',
      );
    for (const name of [
      '001_foundation.cjs',
      '002_identity_core.cjs',
      '003_admin_management.cjs',
      '004_controlled_deletion.cjs',
      '005_ticket_engine.cjs',
    ])
      await db.migrate.up({ name });
    const userId = '10000000-0000-4000-8000-000000000001';
    const clientId = '20000000-0000-4000-8000-000000000001';
    const contactId = '30000000-0000-4000-8000-000000000001';
    await db('users').insert({
      id: userId,
      entra_object_id: userId,
      entra_tenant_id: '10000000-0000-4000-8000-000000000099',
      email: 'v11@example.invalid',
      display_name: 'V11 Probe',
    });
    await db('clients').insert({ id: clientId, name: 'V11 Probe Client' });
    await db('contacts').insert({
      id: contactId,
      client_id: clientId,
      name: 'V11 Requester',
      email: 'requester@example.invalid',
    });
    const ticketId = '40000000-0000-4000-8000-000000000001';
    await db('tickets').insert({
      id: ticketId,
      ticket_number: 'INC-999999',
      client_id: clientId,
      requester_id: contactId,
      created_by_user_id: userId,
      subject: 'Upgrade probe',
      description: 'Preserve this ticket',
      source: 'EMAIL',
      priority: 'P2_HIGH',
    });
    const [, applied] = await db.migrate.up({ name: '006_sla_reporting.cjs' });
    assert.equal(applied.length, 1);
    assert.match(applied[0], /006_sla_reporting\.cjs$/);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      6,
    );
    assert.equal((await db('tickets').where({ id: ticketId })).length, 1);
    assert.equal(
      (await db('ticket_sla').where({ ticket_id: ticketId })).length,
      1,
    );
    assert.equal((await db('sla_policies')).length, 4);
    const [, repeated] = await db.migrate.up({
      name: '006_sla_reporting.cjs',
    });
    assert.equal(repeated.length, 0);
    const grants = await db.raw(
      "SELECT has_table_privilege('amnikon_app','ticket_sla','UPDATE') AS ticket_sla_update,has_table_privilege('amnikon_app','sla_policies','UPDATE') AS policy_update",
    );
    assert.deepEqual(grants.rows[0], {
      ticket_sla_update: true,
      policy_update: true,
    });
    console.log(
      'Phase 2 v10 -> v11 SLA/reporting migration, preservation, grants and repeatability: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
