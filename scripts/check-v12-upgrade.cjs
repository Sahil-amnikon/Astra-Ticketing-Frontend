// Run ONLY against a fresh isolated database. Verifies the deployed Phase 2 v11
// schema to v12 required-category upgrade, preservation and repeatability.
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
      '006_sla_reporting.cjs',
    ])
      await db.migrate.up({ name });

    const userId = '10000000-0000-4000-8000-000000000001';
    const clientId = '20000000-0000-4000-8000-000000000001';
    const contactId = '30000000-0000-4000-8000-000000000001';
    const ticketId = '40000000-0000-4000-8000-000000000001';
    await db('users').insert({
      id: userId,
      entra_object_id: userId,
      entra_tenant_id: '10000000-0000-4000-8000-000000000099',
      email: 'v12@example.invalid',
      display_name: 'V12 Probe',
    });
    await db('clients').insert({ id: clientId, name: 'V12 Probe Client' });
    await db('contacts').insert({
      id: contactId,
      client_id: clientId,
      name: 'V12 Requester',
      email: 'requester@example.invalid',
    });
    await db('tickets').insert({
      id: ticketId,
      ticket_number: 'INC-999999',
      client_id: clientId,
      requester_id: contactId,
      created_by_user_id: userId,
      subject: 'V12 upgrade probe',
      description: 'Assign this existing ticket to General Support',
      source: 'EMAIL',
      priority: 'P2_HIGH',
    });

    const [, applied] = await db.migrate.up({
      name: '007_required_ticket_category.cjs',
    });
    assert.equal(applied.length, 1);
    assert.match(applied[0], /007_required_ticket_category\.cjs$/);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      7,
    );
    const fallback = await db('categories')
      .whereRaw("lower(name)=lower('General Support')")
      .whereNull('parent_id')
      .first();
    assert.ok(fallback?.id);
    assert.equal(fallback.active, true);
    assert.equal(
      (await db('tickets').where({ id: ticketId }).first()).category_id,
      fallback.id,
    );
    const nullable = await db.raw(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='tickets' AND column_name='category_id'`,
    );
    assert.equal(nullable.rows[0].is_nullable, 'NO');
    const [, repeated] = await db.migrate.up({
      name: '007_required_ticket_category.cjs',
    });
    assert.equal(repeated.length, 0);
    console.log(
      'Phase 2 v11 -> v12 category migration, preservation and repeatability: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
