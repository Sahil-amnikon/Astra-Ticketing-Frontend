exports.up = async function (db) {
  await db('ticket_sources')
    .insert({ code: 'OTHER', name: 'Other', sort_order: 60 })
    .onConflict('code')
    .ignore();
  await db('user_permissions')
    .where({ permission_code: 'SOURCES_MANAGE' })
    .delete();
  await db('permissions').where({ code: 'SOURCES_MANAGE' }).delete();
  await db('app_schema_state').where({ id: 1 }).update({ version: 9 });
};

exports.down = async function (db) {
  const used = await db('tickets').where({ source: 'OTHER' }).first('id');
  if (!used) await db('ticket_sources').where({ code: 'OTHER' }).delete();
  await db('permissions')
    .insert({
      code: 'SOURCES_MANAGE',
      name: 'Manage ticket sources',
      description: 'Add, edit or deactivate ticket sources',
    })
    .onConflict('code')
    .ignore();
  await db('app_schema_state').where({ id: 1 }).update({ version: 8 });
};
