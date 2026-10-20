// Run ONLY against a fresh isolated database. Verifies the deployed v20 schema
// to v21 search/saved-view upgrade and migration repeatability.
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
    ])
      await db.migrate.up({ name });

    const [, applied] = await db.migrate.up({
      name: '011_ticket_search_saved_views.cjs',
    });
    assert.equal(applied.length, 1);
    assert.match(applied[0], /011_ticket_search_saved_views\.cjs$/);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      11,
    );
    assert.ok(
      (
        await db.raw(
          "SELECT to_regclass('public.saved_ticket_views') AS relation",
        )
      ).rows[0].relation,
    );
    for (const index of [
      'tickets_search_vector_idx',
      'tickets_description_trgm_idx',
      'ticket_comments_body_trgm_idx',
      'saved_ticket_views_user_name_uq',
    ])
      assert.ok(
        (await db.raw('SELECT to_regclass(?) AS relation', [index])).rows[0]
          .relation,
      );
    const privileges = await db.raw(
      `SELECT has_table_privilege('amnikon_app','saved_ticket_views','SELECT') AS can_select,
        has_table_privilege('amnikon_app','saved_ticket_views','INSERT') AS can_insert,
        has_table_privilege('amnikon_app','saved_ticket_views','UPDATE') AS can_update,
        has_table_privilege('amnikon_app','saved_ticket_views','DELETE') AS can_delete`,
    );
    assert.deepEqual(privileges.rows[0], {
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: true,
    });
    const [, repeated] = await db.migrate.up({
      name: '011_ticket_search_saved_views.cjs',
    });
    assert.equal(repeated.length, 0);
    console.log(
      'Phase 2 v20 -> v21 search migration and repeatability: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
