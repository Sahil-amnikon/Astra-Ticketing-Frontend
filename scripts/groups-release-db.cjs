const knex = require('knex'),
  fs = require('node:fs'),
  path = require('node:path');
const name = '023_customer_staff_groups.cjs',
  action = process.argv[2];
if (
  !['preflight', 'migrate', 'verify'].includes(action) ||
  !process.env.MIGRATION_DATABASE_URL
)
  throw Error('Migration action and owner connection are required');
const db = knex({
  client: 'pg',
  connection: process.env.MIGRATION_DATABASE_URL,
  pool: { min: 0, max: 1 },
  log: { warn: () => {}, error: () => {} },
  migrations: {
    directory: path.join(__dirname, '../packages/database/migrations'),
  },
});
(async () => {
  try {
    const applied = (await db('knex_migrations').select('name'))
      .map((r) => r.name)
      .sort();
    const expected = fs
      .readdirSync(path.join(__dirname, '../packages/database/migrations'))
      .filter((n) => n.endsWith('.cjs') && n !== name)
      .sort();
    const existing = applied.includes(name);
    if (
      JSON.stringify(applied.filter((n) => n !== name)) !==
      JSON.stringify(expected)
    )
      throw Error('Unexpected migration baseline');
    if (
      (await db('app_schema_state').where({ id: 1 }).first()).version !==
      (existing ? 23 : 22)
    )
      throw Error('Unexpected schema version');
    if (action === 'migrate' && !existing) await db.migrate.up({ name });
    if (action === 'migrate' || action === 'verify') {
      if (
        (await db('app_schema_state').where({ id: 1 }).first()).version !== 23
      )
        throw Error('Migration not applied');
      for (const table of [
        'access_groups',
        'staff_group_members',
        'customer_group_members',
      ])
        if (!(await db.schema.hasTable(table)))
          throw Error('Missing group table');
      const grants = await db.raw(
        "SELECT has_table_privilege('amnikon_app','access_groups','SELECT,INSERT,UPDATE') groups,has_table_privilege('amnikon_app','staff_group_members','SELECT,INSERT,DELETE') staff,has_table_privilege('amnikon_app','customer_group_members','SELECT,INSERT,DELETE') customers",
      );
      if (!Object.values(grants.rows[0]).every(Boolean))
        throw Error('Missing runtime privileges');
    }
    console.log(
      JSON.stringify({
        event: 'groups.database.' + action,
        status: 'passed',
        alreadyApplied: existing,
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'groups.database.failed',
        code: e.code ?? null,
        reason: [
          'Unexpected migration baseline',
          'Unexpected schema version',
          'Migration not applied',
          'Missing group table',
          'Missing runtime privileges',
        ].includes(e.message)
          ? e.message
          : 'Database operation failed',
      }),
    );
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
