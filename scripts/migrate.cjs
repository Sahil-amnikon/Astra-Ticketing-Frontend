const knex = require('knex');
const path = require('node:path');
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error('MIGRATION_DATABASE_URL is required');
const db = knex({
  client: 'pg',
  log: {
    warn: () => console.error('Database migration warning'),
    error: () => console.error('Database migration connection error'),
  },
  connection: process.env.MIGRATION_DATABASE_URL,
  pool: { min: 0, max: 1 },
  migrations: {
    directory: path.join(__dirname, '../packages/database/migrations'),
  },
});
(async () => {
  try {
    const [, names] = await db.migrate.latest();
    console.log(
      JSON.stringify({ event: 'migrations.applied', count: names.length }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'migration.failed',
        code: error?.code ?? null,
        message: error?.message ?? 'Unknown migration error',
        detail: error?.detail ?? null,
        table: error?.table ?? null,
        constraint: error?.constraint ?? null,
      }),
    );
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
