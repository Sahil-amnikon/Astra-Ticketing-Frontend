exports.up = async function (db) {
  await db.schema.alterTable('users', (table) => {
    table.integer('session_version').notNullable().defaultTo(0);
  });
  // Replacing memberships requires DELETE only on these two association tables.
  await db.raw('GRANT DELETE ON user_roles, client_users TO amnikon_app');
  await db('app_schema_state').where({ id: 1 }).update({ version: 3 });
};
exports.down = async function (db) {
  await db.raw('REVOKE DELETE ON user_roles, client_users FROM amnikon_app');
  await db.schema.alterTable('users', (table) =>
    table.dropColumn('session_version'),
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 2 });
};
