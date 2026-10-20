// Run ONLY against a fresh isolated validation database with no migrated tables.
// Verifies the actual v7 schema -> v8 upgrade, preservation and repeatability.
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
    ])
      await db.migrate.up({ name });

    const id = '10000000-0000-4000-8000-000000000001';
    await db('users').insert({
      id,
      entra_object_id: id,
      entra_tenant_id: '20000000-0000-4000-8000-000000000002',
      email: 'upgrade-probe@example.invalid',
      display_name: 'Upgrade Probe',
    });
    await db('user_roles').insert({
      user_id: id,
      role_code: 'ADMIN',
      granted_by: id,
    });
    await db('audit_logs').insert({
      actor_user_id: id,
      action: 'TEST.UPGRADE_PROBE',
      entity_type: 'USER',
      entity_id: id,
    });

    const [, applied] = await db.migrate.up({
      name: '004_controlled_deletion.cjs',
    });
    assert.equal(applied.length, 1);
    const user = await db('users').where({ id }).first();
    assert.equal(user.session_version, 0);
    assert.equal(user.email, 'upgrade-probe@example.invalid');
    assert.equal((await db('user_roles').where({ user_id: id })).length, 1);
    assert.equal(
      (await db('audit_logs').where({ actor_user_id: id })).length,
      1,
    );
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      4,
    );
    const [, repeated] = await db.migrate.up({
      name: '004_controlled_deletion.cjs',
    });
    assert.equal(repeated.length, 0);
    const grants = await db.raw(
      "SELECT has_table_privilege('amnikon_app','users','DELETE') AS user_delete,has_table_privilege('amnikon_app','clients','DELETE') AS client_delete,has_table_privilege('amnikon_app','assets','DELETE') AS asset_delete,has_table_privilege('amnikon_app','audit_logs','DELETE') AS audit_delete",
    );
    assert.deepEqual(grants.rows[0], {
      user_delete: true,
      client_delete: true,
      asset_delete: true,
      audit_delete: false,
    });
    console.log(
      'v7 -> v8 migration, data preservation, grants and repeatability: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
