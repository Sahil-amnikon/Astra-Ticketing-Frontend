// Run ONLY against a fresh isolated database. Verifies the deployed v25 schema
// to v26 SLA-calendar/notification upgrade and migration repeatability.
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
    ])
      await db.migrate.up({ name });

    const before = await db('sla_policies')
      .select('id', 'priority', 'response_minutes', 'resolution_minutes')
      .orderBy('priority');
    const [, applied] = await db.migrate.up({
      name: '012_sla_calendars_notifications.cjs',
    });

    assert.equal(applied.length, 1);
    assert.match(applied[0], /012_sla_calendars_notifications\.cjs$/);
    assert.equal(
      (await db('app_schema_state').where({ id: 1 }).first()).version,
      12,
    );

    const calendar = await db('sla_calendars').first();
    assert.equal(calendar.name, 'Standard Support Hours');
    assert.equal(calendar.timezone, 'Asia/Kolkata');
    assert.equal(calendar.active, true);
    const after = await db('sla_policies')
      .select(
        'id',
        'priority',
        'response_minutes',
        'resolution_minutes',
        'calendar_id',
      )
      .orderBy('priority');
    assert.deepEqual(
      after.map((policy) => ({
        id: policy.id,
        priority: policy.priority,
        response_minutes: policy.response_minutes,
        resolution_minutes: policy.resolution_minutes,
      })),
      before,
    );
    assert.ok(after.every((policy) => policy.calendar_id === calendar.id));

    const businessTarget = await db.raw(
      `SELECT sla_add_business_minutes(?, '2026-09-18 17:00:00+05:30'::timestamptz, 120) AS target`,
      [calendar.id],
    );
    assert.equal(
      businessTarget.rows[0].target.toISOString(),
      '2026-09-21T04:30:00.000Z',
    );
    const businessMinutes = await db.raw(
      `SELECT sla_business_minutes_between(?, '2026-09-18 17:00:00+05:30'::timestamptz, '2026-09-21 11:00:00+05:30'::timestamptz) AS minutes`,
      [calendar.id],
    );
    assert.equal(businessMinutes.rows[0].minutes, 180);

    for (const relation of [
      'sla_calendars',
      'sla_holidays',
      'notification_preferences',
      'notifications',
    ])
      assert.ok(
        (await db.raw('SELECT to_regclass(?) AS relation', [relation])).rows[0]
          .relation,
      );
    const privileges = await db.raw(
      `SELECT
        has_table_privilege('amnikon_app','notifications','SELECT') AS can_select,
        has_table_privilege('amnikon_app','notifications','INSERT') AS can_insert,
        has_table_privilege('amnikon_app','notifications','UPDATE') AS can_update,
        has_table_privilege('amnikon_app','notifications','DELETE') AS can_delete`,
    );
    assert.deepEqual(privileges.rows[0], {
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: false,
    });

    const [, repeated] = await db.migrate.up({
      name: '012_sla_calendars_notifications.cjs',
    });
    assert.equal(repeated.length, 0);
    console.log(
      'Phase 2 v25 -> v26 SLA-calendar and notification migration: passed',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
