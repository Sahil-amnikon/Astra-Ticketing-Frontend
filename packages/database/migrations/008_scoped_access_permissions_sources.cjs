const PERMISSIONS = [
  [
    'TICKETS_TEAM_VIEW',
    'View site team tickets',
    'View other technicians tickets at assigned sites',
  ],
  [
    'TICKETS_ASSIGN',
    'Assign tickets',
    'Assign or transfer tickets within permitted scope',
  ],
  [
    'TICKETS_APPROVE',
    'Approve tickets',
    'Approve or reject ticket approval requests',
  ],
  [
    'CATEGORY_MANAGE',
    'Manage categories',
    'Create, edit and remove ticket categories',
  ],
  ['SLA_MANAGE', 'Manage SLA', 'Configure SLA policies'],
  ['REPORTS_VIEW', 'View reports', 'View and export operational reports'],
  [
    'USERS_MANAGE',
    'Manage users',
    'Manage users, roles, permissions and scope',
  ],
  ['CLIENTS_MANAGE', 'Manage clients', 'Manage client records'],
  ['CONTACTS_MANAGE', 'Manage contacts', 'Manage requester records'],
  ['SITES_MANAGE', 'Manage sites', 'Manage client sites'],
  ['TAGS_MANAGE', 'Manage tags', 'Manage ticket tags'],
  ['AUDIT_VIEW', 'View audit history', 'Review system audit events'],
  [
    'SOURCES_MANAGE',
    'Manage ticket sources',
    'Add, edit or deactivate ticket sources',
  ],
];

const SOURCES = [
  ['MISSIVE', 'Missive'],
  ['MICROSOFT_TEAMS', 'Microsoft Teams'],
  ['PHONE_CALL', 'Phone Call'],
  ['SMS', 'SMS'],
  ['EMAIL', 'Email'],
];

exports.up = async function (db) {
  await db.schema.createTable('permissions', (table) => {
    table.text('code').primary();
    table.text('name').notNullable();
    table.text('description').notNullable();
  });
  await db('permissions').insert(
    PERMISSIONS.map(([code, name, description]) => ({
      code,
      name,
      description,
    })),
  );
  await db.schema.createTable('user_permissions', (table) => {
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .text('permission_code')
      .notNullable()
      .references('code')
      .inTable('permissions')
      .onDelete('CASCADE');
    table
      .uuid('granted_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['user_id', 'permission_code']);
  });
  await db.schema.createTable('user_sites', (table) => {
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('site_id')
      .notNullable()
      .references('id')
      .inTable('sites')
      .onDelete('CASCADE');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['user_id', 'site_id']);
  });
  await db.schema.createTable('ticket_sources', (table) => {
    table.text('code').primary();
    table.text('name').notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.integer('sort_order').notNullable().defaultTo(100);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db('ticket_sources').insert(
    SOURCES.map(([code, name], index) => ({
      code,
      name,
      sort_order: (index + 1) * 10,
    })),
  );
  await db.raw(
    'ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_source_check',
  );
  await db.raw(
    'ALTER TABLE tickets ADD CONSTRAINT tickets_source_fk FOREIGN KEY (source) REFERENCES ticket_sources(code) ON UPDATE CASCADE ON DELETE RESTRICT',
  );

  await db.raw(`INSERT INTO user_permissions(user_id,permission_code,granted_by)
    SELECT DISTINCT ur.user_id,p.code,NULL::uuid FROM user_roles ur
    JOIN permissions p ON p.code=ANY(CASE ur.role_code
      WHEN 'TEAM_LEAD' THEN ARRAY['TICKETS_TEAM_VIEW','TICKETS_ASSIGN','CATEGORY_MANAGE']::text[]
      WHEN 'MANAGER' THEN ARRAY['TICKETS_TEAM_VIEW','TICKETS_ASSIGN','TICKETS_APPROVE','CATEGORY_MANAGE','REPORTS_VIEW']::text[]
      ELSE ARRAY[]::text[] END)
    WHERE ur.role_code IN ('TEAM_LEAD','MANAGER') ON CONFLICT DO NOTHING`);

  await db.raw('GRANT SELECT ON permissions TO amnikon_app');
  await db.raw(
    'GRANT SELECT,INSERT,DELETE ON user_permissions,user_sites TO amnikon_app',
  );
  await db.raw(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON ticket_sources TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 8 });
};

exports.down = async function (db) {
  await db.raw(
    'ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_source_fk',
  );
  await db.raw(
    "ALTER TABLE tickets ADD CONSTRAINT tickets_source_check CHECK (source IN ('MISSIVE','MICROSOFT_TEAMS','PHONE_CALL','SMS','EMAIL'))",
  );
  await db.schema.dropTableIfExists('ticket_sources');
  await db.schema.dropTableIfExists('user_sites');
  await db.schema.dropTableIfExists('user_permissions');
  await db.schema.dropTableIfExists('permissions');
  await db('app_schema_state').where({ id: 1 }).update({ version: 7 });
};
