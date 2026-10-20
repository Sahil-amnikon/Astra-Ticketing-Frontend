exports.up = async function (db) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await db.raw('CREATE EXTENSION IF NOT EXISTS vector');
  await db.raw(
    'CREATE TABLE app_schema_state (id smallint PRIMARY KEY CHECK (id = 1), version integer NOT NULL CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now())',
  );
  await db('app_schema_state').insert({ id: 1, version: 1 });
  await db.raw('GRANT SELECT ON app_schema_state TO amnikon_app');
};
exports.down = async function (db) {
  await db.schema.dropTable('app_schema_state');
};
