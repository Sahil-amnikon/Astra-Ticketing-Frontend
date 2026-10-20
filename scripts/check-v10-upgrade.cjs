// Run ONLY against a fresh isolated database. Verifies the deployed v9 schema
// to Phase 2 v10 upgrade, preservation, grants and migration repeatability.
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
    ])
      await db.migrate.up({ name });

    const userId = '10000000-0000-4000-8000-000000000001';
    const clientId = '20000000-0000-4000-8000-000000000001';
    const contactId = '30000000-0000-4000-8000-000000000001';
    await db('users').insert({
      id: userId,
      entra_object_id: userId,
      entra_tenant_id: '10000000-0000-4000-8000-000000000099',
      email: 'phase2-upgrade@example.invalid',
      display_name: 'Phase 2 Upgrade Probe',
    });
    await db('user_roles').insert({
      user_id: userId,
      role_code: 'ADMIN',
      granted_by: userId,
    });
    await db('clients').insert({ id: clientId, name: 'Upgrade Probe Client' });
    await db('contacts').insert({
      id: contactId,
      client_id: clientId,
      name: 'Upgrade Probe Requester',
      email: 'requester@example.invalid',
    });

    const [, applied] = await db.migrate.up({ name: '005_ticket_engine.cjs' });
    assert.equal(applied.length, 1);
    assert.match(applied[0], /005_ticket_engine\.cjs$/);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      5,
    );
    assert.equal((await db('users').where({ id: userId })).length, 1);
    assert.equal((await db('clients').where({ id: clientId })).length, 1);
    assert.equal((await db('contacts').where({ id: contactId })).length, 1);
    assert.equal(await db.schema.hasTable('tickets'), true);
    assert.equal(await db.schema.hasTable('ticket_history'), true);

    const [, repeated] = await db.migrate.up({
      name: '005_ticket_engine.cjs',
    });
    assert.equal(repeated.length, 0);
    const grants = await db.raw(
      "SELECT has_table_privilege('amnikon_app','tickets','UPDATE') AS ticket_update,has_table_privilege('amnikon_app','ticket_history','INSERT') AS history_insert,has_table_privilege('amnikon_app','ticket_history','UPDATE') AS history_update,has_table_privilege('amnikon_app','ticket_history','DELETE') AS history_delete",
    );
    assert.deepEqual(grants.rows[0], {
      ticket_update: true,
      history_insert: true,
      history_update: false,
      history_delete: false,
    });
    console.log(
      'v9 -> Phase 2 v10 migration, preservation, grants and repeatability: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
