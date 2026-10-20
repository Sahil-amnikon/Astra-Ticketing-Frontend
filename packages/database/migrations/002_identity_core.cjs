const ROLE_CODES = ['USER', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];

exports.up = async function (db) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await db.schema.createTable('roles', (table) => {
    table.text('code').primary();
    table.text('name').notNullable();
    table.text('description').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });

  await db('roles').insert(
    ROLE_CODES.map((code) => ({
      code,
      name: code
        .toLowerCase()
        .split('_')
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' '),
      description: `Built-in ${code.toLowerCase()} role`,
    })),
  );

  await db.schema.createTable('clients', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('name').notNullable();
    table.text('status').notNullable().defaultTo('ACTIVE');
    table.text('primary_email');
    table.text('primary_phone');
    table.text('notes');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check("status IN ('ACTIVE', 'INACTIVE')");
  });
  await db.raw(
    'CREATE UNIQUE INDEX clients_name_ci_uq ON clients (lower(name))',
  );

  await db.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.uuid('entra_object_id').notNullable();
    table.uuid('entra_tenant_id').notNullable();
    table.text('email').notNullable();
    table.text('display_name').notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('last_login_at', { useTz: true });
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.unique(['entra_tenant_id', 'entra_object_id']);
  });
  await db.raw('CREATE UNIQUE INDEX users_email_ci_uq ON users (lower(email))');

  await db.schema.createTable('user_roles', (table) => {
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('role_code').notNullable().references('code').inTable('roles');
    table
      .uuid('granted_by')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['user_id', 'role_code']);
  });

  await db.schema.createTable('client_users', (table) => {
    table
      .uuid('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['client_id', 'user_id']);
  });

  await db.schema.createTable('contacts', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');
    table
      .uuid('user_id')
      .unique()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('name').notNullable();
    table.text('email');
    table.text('phone');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw('CREATE INDEX contacts_client_idx ON contacts (client_id)');
  await db.raw('CREATE INDEX contacts_email_ci_idx ON contacts (lower(email))');

  await db.schema.createTable('sites', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');
    table.text('name').notNullable();
    table.text('address');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.unique(['client_id', 'name']);
    table.unique(['id', 'client_id']);
  });
  await db.schema.createTable('assets', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');
    table
      .uuid('site_id')
      .references('id')
      .inTable('sites')
      .onDelete('SET NULL');
    table.text('name').notNullable();
    table.text('asset_type').notNullable();
    table.text('serial_number');
    table.text('external_reference');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw('CREATE INDEX assets_client_idx ON assets (client_id)');
  await db.raw(
    `ALTER TABLE assets
     ADD CONSTRAINT assets_site_client_fk
     FOREIGN KEY (site_id, client_id) REFERENCES sites(id, client_id)
     ON DELETE RESTRICT`,
  );
  await db.raw(
    'CREATE UNIQUE INDEX assets_serial_ci_uq ON assets (lower(serial_number)) WHERE serial_number IS NOT NULL',
  );

  await db.schema.createTable('categories', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('parent_id')
      .references('id')
      .inTable('categories')
      .onDelete('RESTRICT');
    table.text('name').notNullable();
    table.text('description');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw(
    'CREATE UNIQUE INDEX categories_root_name_ci_uq ON categories (lower(name)) WHERE parent_id IS NULL',
  );
  await db.raw(
    'CREATE UNIQUE INDEX categories_child_name_ci_uq ON categories (parent_id, lower(name)) WHERE parent_id IS NOT NULL',
  );

  await db.schema.createTable('tags', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('name').notNullable();
    table.text('description');
    table.boolean('active').notNullable().defaultTo(true);
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw('CREATE UNIQUE INDEX tags_name_ci_uq ON tags (lower(name))');

  await db.schema.createTable('audit_logs', (table) => {
    table.bigIncrements('id').primary();
    table
      .uuid('actor_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('action').notNullable();
    table.text('entity_type').notNullable();
    table.text('entity_id');
    table.jsonb('details').notNullable().defaultTo('{}');
    table.text('request_id');
    table.specificType('source_ip', 'inet');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw(
    'CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC)',
  );
  await db.raw(
    'CREATE INDEX audit_actor_idx ON audit_logs (actor_user_id, created_at DESC)',
  );

  await db('app_schema_state').where({ id: 1 }).update({ version: 2 });

  await db.raw('GRANT SELECT ON roles TO amnikon_app');
  for (const table of [
    'clients',
    'users',
    'user_roles',
    'client_users',
    'contacts',
    'sites',
    'assets',
    'categories',
    'tags',
  ]) {
    await db.raw(`GRANT SELECT, INSERT, UPDATE ON ${table} TO amnikon_app`);
  }
  await db.raw('GRANT SELECT, INSERT ON audit_logs TO amnikon_app');
  await db.raw(
    'GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO amnikon_app',
  );
};

exports.down = async function (db) {
  for (const table of [
    'audit_logs',
    'assets',
    'sites',
    'contacts',
    'client_users',
    'user_roles',
    'users',
    'tags',
    'categories',
    'clients',
    'roles',
  ]) {
    await db.schema.dropTableIfExists(table);
  }
  await db('app_schema_state').where({ id: 1 }).update({ version: 1 });
};
