// Run only against a fresh isolated PostgreSQL database. Replays schema 14,
// applies v34 migration 015 and verifies client contacts and internal locations.
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
      '007_required_ticket_category.cjs',
      '008_scoped_access_permissions_sources.cjs',
      '009_other_ticket_source.cjs',
      '010_standard_ticket_categories.cjs',
      '011_ticket_search_saved_views.cjs',
      '012_sla_calendars_notifications.cjs',
      '013_internal_change_management.cjs',
      '014_change_stakeholders_attachments_ticket_prefixes.cjs',
    ])
      await db.migrate.up({ name });
    const [, applied] = await db.migrate.up({
      name: '015_client_change_stakeholders_internal_locations.cjs',
    });
    assert.equal(applied.length, 1);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      15,
    );
    assert.ok(await db.schema.hasColumn('change_stakeholders', 'contact_id'));
    assert.ok(await db.schema.hasColumn('tickets', 'location_text'));
    const [, repeated] = await db.migrate.up({
      name: '015_client_change_stakeholders_internal_locations.cjs',
    });
    assert.equal(repeated.length, 0);
    console.log('Phase 2 v33 -> v34 contact/location migration: passed');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
