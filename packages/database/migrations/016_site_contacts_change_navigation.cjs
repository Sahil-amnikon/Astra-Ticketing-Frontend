exports.up = async function (db) {
  await db.schema.alterTable('contacts', (table) => {
    table
      .uuid('site_id')
      .references('id')
      .inTable('sites')
      .onDelete('SET NULL');
  });
  await db.raw(`
    ALTER TABLE contacts ADD CONSTRAINT contacts_site_client_fk
      FOREIGN KEY (site_id,client_id) REFERENCES sites(id,client_id)
      ON DELETE RESTRICT
  `);
  await db.raw(
    'CREATE INDEX contacts_site_idx ON contacts(site_id) WHERE site_id IS NOT NULL',
  );

  for (const [name, description] of [
    ['Service Desk', 'Ticket intake, triage and end-user support'],
    [
      'Infrastructure & Servers',
      'Windows Server, virtualization, storage and backup',
    ],
    ['Network', 'Switching, routing, wireless, VPN and firewalls'],
    [
      'Microsoft 365',
      'Exchange Online, Teams, SharePoint, OneDrive and Entra ID',
    ],
    ['Security', 'Security controls, incidents, access and compliance'],
    ['Applications', 'Business applications and application support'],
  ])
    await db.raw(
      `INSERT INTO departments(name,description)
       SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM departments WHERE lower(name)=lower(?))`,
      [name, description, name],
    );

  await db('app_schema_state').where({ id: 1 }).update({ version: 16 });
};

exports.down = async function (db) {
  await db.raw('DROP INDEX IF EXISTS contacts_site_idx');
  await db.raw(
    'ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_site_client_fk',
  );
  await db.schema.alterTable('contacts', (table) => {
    table.dropColumn('site_id');
  });
  await db('app_schema_state').where({ id: 1 }).update({ version: 15 });
};
