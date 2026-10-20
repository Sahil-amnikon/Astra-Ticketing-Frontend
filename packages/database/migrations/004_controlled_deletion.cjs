exports.up = async function (db) {
  for (const table of [
    'clients',
    'users',
    'contacts',
    'sites',
    'assets',
    'categories',
    'tags',
  ])
    await db.raw(`GRANT DELETE ON ${table} TO amnikon_app`);
  await db('app_schema_state').where({ id: 1 }).update({ version: 4 });
};

exports.down = async function (db) {
  for (const table of [
    'clients',
    'users',
    'contacts',
    'sites',
    'assets',
    'categories',
    'tags',
  ])
    await db.raw(`REVOKE DELETE ON ${table} FROM amnikon_app`);
  await db('app_schema_state').where({ id: 1 }).update({ version: 3 });
};
