const knex = require('knex');
const fs = require('node:fs');
const path = require('node:path');
const name = '022_verified_support_portal.cjs';
const action = process.argv[2];
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
    const state = await db('app_schema_state').where({ id: 1 }).first();
    if (state.version !== (existing ? 22 : 21))
      throw Error('Unexpected schema version');
    if (action === 'migrate' && !existing) {
      await db.migrate.up({ name });
    }
    if (action === 'verify' || action === 'migrate') {
      const result = await db.raw(
        'SELECT version FROM app_schema_state WHERE id=1',
      );
      if (result.rows[0].version !== 22) throw Error('Migration not applied');
      for (const table of ['client_email_domains', 'portal_ticket_submissions'])
        if (!(await db.schema.hasTable(table)))
          throw Error('Missing portal table');
      const grants = await db.raw(
        "SELECT has_table_privilege('amnikon_app','client_email_domains','SELECT,INSERT,UPDATE') AS domains,has_table_privilege('amnikon_app','portal_ticket_submissions','SELECT,INSERT') AS submissions",
      );
      if (!Object.values(grants.rows[0]).every(Boolean))
        throw Error('Missing runtime privileges');
    }
    console.log(
      JSON.stringify({
        event: 'support.database.' + action,
        status: 'passed',
        alreadyApplied: existing,
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'support.database.failed',
        code: e.code ?? null,
        reason: [
          'Unexpected migration baseline',
          'Unexpected schema version',
          'Migration not applied',
          'Missing portal table',
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
