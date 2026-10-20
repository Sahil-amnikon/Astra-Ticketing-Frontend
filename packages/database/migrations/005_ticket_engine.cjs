const SOURCES = ['MISSIVE', 'MICROSOFT_TEAMS', 'PHONE_CALL', 'SMS', 'EMAIL'];
const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CLIENT',
  'WAITING_FOR_VENDOR',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
];
const PRIORITIES = ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'];

exports.up = async function (db) {
  await db.raw('CREATE SEQUENCE ticket_number_seq START WITH 1');
  await db.raw(
    'ALTER TABLE contacts ADD CONSTRAINT contacts_id_client_uq UNIQUE (id, client_id)',
  );

  await db.schema.createTable('tickets', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('ticket_number').notNullable().unique();
    table
      .uuid('client_id')
      .notNullable()
      .references('id')
      .inTable('clients')
      .onDelete('RESTRICT');
    table
      .uuid('requester_id')
      .notNullable()
      .references('id')
      .inTable('contacts')
      .onDelete('RESTRICT');
    table
      .uuid('site_id')
      .references('id')
      .inTable('sites')
      .onDelete('SET NULL');
    table
      .uuid('category_id')
      .references('id')
      .inTable('categories')
      .onDelete('SET NULL');
    table
      .uuid('assigned_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('subject').notNullable();
    table.text('description').notNullable();
    table.text('source').notNullable();
    table.text('source_reference_id');
    table.text('source_conversation_id');
    table.text('source_message_id');
    table.text('source_url');
    table.text('external_thread_id');
    table.text('status').notNullable().defaultTo('NEW');
    table.text('priority').notNullable().defaultTo('P3_MEDIUM');
    table.text('approval_status').notNullable().defaultTo('NOT_REQUIRED');
    table.timestamp('first_response_at', { useTz: true });
    table.timestamp('resolved_at', { useTz: true });
    table.timestamp('closed_at', { useTz: true });
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check(`source IN (${SOURCES.map((v) => `'${v}'`).join(',')})`);
    table.check(`status IN (${STATUSES.map((v) => `'${v}'`).join(',')})`);
    table.check(`priority IN (${PRIORITIES.map((v) => `'${v}'`).join(',')})`);
    table.check(
      "approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')",
    );
    table.unique(['id', 'client_id']);
  });
  await db.raw(
    'CREATE INDEX tickets_client_created_idx ON tickets (client_id, created_at DESC)',
  );
  await db.raw(
    'CREATE INDEX tickets_assignee_status_idx ON tickets (assigned_user_id, status, updated_at DESC)',
  );
  await db.raw(
    'CREATE INDEX tickets_status_priority_idx ON tickets (status, priority, updated_at DESC)',
  );
  await db.raw(
    'CREATE INDEX tickets_number_trgm_idx ON tickets USING gin (ticket_number gin_trgm_ops)',
  );
  await db.raw(
    'CREATE INDEX tickets_subject_trgm_idx ON tickets USING gin (subject gin_trgm_ops)',
  );
  await db.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_requester_client_fk
     FOREIGN KEY (requester_id, client_id) REFERENCES contacts(id, client_id)
     ON DELETE RESTRICT`,
  );
  await db.raw(
    `ALTER TABLE tickets ADD CONSTRAINT tickets_site_client_fk
     FOREIGN KEY (site_id, client_id) REFERENCES sites(id, client_id)
     ON DELETE RESTRICT`,
  );

  await db.schema.createTable('ticket_comments', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('author_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('comment_type').notNullable();
    table.text('body').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check("comment_type IN ('PUBLIC','INTERNAL')");
  });
  await db.raw(
    'CREATE INDEX ticket_comments_ticket_idx ON ticket_comments (ticket_id, created_at)',
  );

  await db.schema.createTable('ticket_assignments', (table) => {
    table.bigIncrements('id').primary();
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('previous_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('assigned_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('actor_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('reason');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw(
    'CREATE INDEX ticket_assignments_ticket_idx ON ticket_assignments (ticket_id, created_at)',
  );

  await db.schema.createTable('ticket_tags', (table) => {
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('tag_id')
      .notNullable()
      .references('id')
      .inTable('tags')
      .onDelete('RESTRICT');
    table
      .uuid('added_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['ticket_id', 'tag_id']);
  });

  await db.schema.createTable('ticket_approvals', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('requested_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('decided_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('status').notNullable().defaultTo('PENDING');
    table.text('reason').notNullable();
    table.text('decision_note');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.timestamp('decided_at', { useTz: true });
    table.check("status IN ('PENDING','APPROVED','REJECTED')");
  });
  await db.raw(
    "CREATE UNIQUE INDEX ticket_approvals_pending_uq ON ticket_approvals (ticket_id) WHERE status = 'PENDING'",
  );

  await db.schema.createTable('ticket_history', (table) => {
    table.bigIncrements('id').primary();
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('actor_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('action').notNullable();
    table.jsonb('previous_value');
    table.jsonb('new_value');
    table.text('reason');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw(
    'CREATE INDEX ticket_history_ticket_idx ON ticket_history (ticket_id, created_at, id)',
  );

  await db.schema.createTable('ticket_attachments', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('uploaded_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('file_name').notNullable();
    table.text('content_type').notNullable();
    table.bigInteger('size_bytes').notNullable();
    table.text('storage_key').notNullable().unique();
    table.text('sha256').notNullable();
    table.binary('content').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check('size_bytes > 0 AND size_bytes <= 10485760');
  });
  await db.raw(
    'CREATE INDEX ticket_attachments_ticket_idx ON ticket_attachments (ticket_id, created_at)',
  );

  await db.raw(
    'GRANT SELECT, INSERT, UPDATE ON tickets, ticket_approvals TO amnikon_app',
  );
  await db.raw(
    'GRANT SELECT, INSERT ON ticket_comments, ticket_assignments, ticket_history, ticket_attachments TO amnikon_app',
  );
  await db.raw('GRANT SELECT, INSERT, DELETE ON ticket_tags TO amnikon_app');
  await db.raw(
    'GRANT USAGE, SELECT ON SEQUENCE ticket_number_seq, ticket_assignments_id_seq, ticket_history_id_seq TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 5 });
};

exports.down = async function (db) {
  for (const table of [
    'ticket_attachments',
    'ticket_history',
    'ticket_approvals',
    'ticket_tags',
    'ticket_assignments',
    'ticket_comments',
    'tickets',
  ])
    await db.schema.dropTableIfExists(table);
  await db.raw('DROP SEQUENCE IF EXISTS ticket_number_seq');
  await db.raw(
    'ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_id_client_uq',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 4 });
};
