const INTERNAL_CLIENT_ID = '00000000-0000-4000-8000-000000000132';

exports.up = async function (db) {
  await db('roles')
    .insert({
      code: 'INTERN',
      name: 'Intern',
      description: 'Supervised internal service-desk contributor',
    })
    .onConflict('code')
    .ignore();

  await db.schema.alterTable('clients', (table) => {
    table.text('organization_type').notNullable().defaultTo('CLIENT');
  });
  await db.raw(
    "ALTER TABLE clients ADD CONSTRAINT clients_organization_type_check CHECK (organization_type IN ('CLIENT','INTERNAL'))",
  );
  await db('clients')
    .insert({
      id: INTERNAL_CLIENT_ID,
      name: 'Amnikon Internal',
      status: 'ACTIVE',
      organization_type: 'INTERNAL',
      notes: 'Protected organization for internal service-desk work.',
    })
    .onConflict('id')
    .ignore();

  await db.schema.alterTable('users', (table) => {
    table.text('work_scope').notNullable().defaultTo('CLIENT');
    table.text('change_access').notNullable().defaultTo('NONE');
    table
      .uuid('supervisor_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('access_expires_at', { useTz: true });
  });
  await db.raw(
    "ALTER TABLE users ADD CONSTRAINT users_work_scope_check CHECK (work_scope IN ('INTERNAL','CLIENT','BOTH','ALL'))",
  );
  await db.raw(
    "ALTER TABLE users ADD CONSTRAINT users_change_access_check CHECK (change_access IN ('NONE','CONTRIBUTOR','COORDINATOR','APPROVER','CHANGE_MANAGER'))",
  );

  await db.schema.createTable('departments', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('name').notNullable().unique();
    table.text('description');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
  await db.schema.createTable('department_users', (table) => {
    table
      .uuid('department_id')
      .notNullable()
      .references('id')
      .inTable('departments')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('expertise');
    table.boolean('is_lead').notNullable().defaultTo(false);
    table.primary(['department_id', 'user_id']);
  });
  await db.schema.alterTable('tickets', (table) => {
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
  });
  await db.schema.createTable('ticket_collaborators', (table) => {
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('added_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('reason').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.primary(['ticket_id', 'user_id']);
  });
  await db.schema.createTable('help_requests', (table) => {
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
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
    table
      .uuid('requested_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('expertise_needed').notNullable();
    table.text('status').notNullable().defaultTo('PENDING');
    table
      .uuid('responded_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('response_note');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.timestamp('responded_at', { useTz: true });
    table.check("status IN ('PENDING','ACCEPTED','DECLINED','COMPLETED')");
    table.check('department_id IS NOT NULL OR requested_user_id IS NOT NULL');
  });

  await db.raw('CREATE SEQUENCE change_number_seq START 1');
  await db.schema.createTable('changes', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .text('change_number')
      .notNullable()
      .unique()
      .defaultTo(
        db.raw("'CHG-' || lpad(nextval('change_number_seq')::text, 6, '0')"),
      );
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
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
    table.text('title').notNullable();
    table.text('description').notNullable();
    table.text('category').notNullable();
    table.text('change_type').notNullable();
    table.text('risk').notNullable();
    table.text('status').notNullable().defaultTo('DRAFT');
    table.text('impact').notNullable();
    table.boolean('outage_expected').notNullable().defaultTo(false);
    table.integer('downtime_minutes').notNullable().defaultTo(0);
    table.text('reason').notNullable();
    table.text('business_justification').notNullable();
    table.text('implementation_plan').notNullable();
    table.text('test_plan').notNullable();
    table.text('rollback_plan').notNullable();
    table.text('communication_plan').notNullable().defaultTo('');
    table.boolean('client_notification_enabled').notNullable().defaultTo(false);
    table
      .uuid('owner_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('requested_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.timestamp('planned_start', { useTz: true });
    table.timestamp('planned_end', { useTz: true });
    table.timestamp('actual_start', { useTz: true });
    table.timestamp('actual_end', { useTz: true });
    table.timestamps(true, true);
    table.check(
      "category IN ('SERVER','CLOUD','MICROSOFT_365','NETWORK','SECURITY','APPLICATION','OTHER')",
    );
    table.check("change_type IN ('STANDARD','NORMAL','EMERGENCY')");
    table.check("risk IN ('LOW','MEDIUM','HIGH','CRITICAL')");
    table.check(
      "status IN ('DRAFT','SUBMITTED','ASSESSMENT','AWAITING_APPROVAL','APPROVED','SCHEDULED','IN_PROGRESS','VALIDATION','COMPLETED','CLOSED','REJECTED','CANCELLED','FAILED','ROLLED_BACK')",
    );
    table.check('downtime_minutes >= 0');
    table.check(
      'planned_end IS NULL OR planned_start IS NULL OR planned_end > planned_start',
    );
  });
  await db.raw(
    'CREATE INDEX changes_scope_idx ON changes(client_id,status,planned_start)',
  );
  await db.schema.createTable('change_teams', (table) => {
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('department_id')
      .notNullable()
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT');
    table.text('role').notNullable();
    table.text('status').notNullable().defaultTo('PENDING');
    table.primary(['change_id', 'department_id']);
    table.check("role IN ('LEAD','IMPLEMENTER','REVIEWER')");
    table.check("status IN ('PENDING','ACTIVE','COMPLETED')");
  });
  await db.schema.createTable('change_tasks', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
    table
      .uuid('assigned_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('title').notNullable();
    table.text('instructions').notNullable().defaultTo('');
    table.text('status').notNullable().defaultTo('TODO');
    table.timestamp('due_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.text('update_note');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check(
      "status IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','WAIVED')",
    );
  });
  await db.schema.createTable('change_approvals', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('approver_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('department_id')
      .references('id')
      .inTable('departments')
      .onDelete('SET NULL');
    table.integer('sequence').notNullable().defaultTo(1);
    table.boolean('required').notNullable().defaultTo(true);
    table.text('status').notNullable().defaultTo('PENDING');
    table
      .uuid('decision_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('decision_note');
    table.timestamp('decided_at', { useTz: true });
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check('approver_user_id IS NOT NULL OR department_id IS NOT NULL');
    table.check(
      "status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')",
    );
  });
  await db.schema.createTable('change_updates', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('author_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('update_type').notNullable();
    table.text('body').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check(
      "update_type IN ('INTERNAL','IMPLEMENTATION','VALIDATION','CLIENT_COMMUNICATION')",
    );
  });
  await db.schema.createTable('change_ticket_links', (table) => {
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('ticket_id')
      .notNullable()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('linked_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.primary(['change_id', 'ticket_id']);
  });
  await db.schema.createTable('change_history', (table) => {
    table.bigIncrements('id').primary();
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('actor_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('event').notNullable();
    table.jsonb('details').notNullable().defaultTo('{}');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });
  await db.raw(
    `CREATE OR REPLACE FUNCTION prevent_change_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Change history is immutable'; END $$`,
  );
  await db.raw(
    'CREATE TRIGGER change_history_immutable BEFORE UPDATE OR DELETE ON change_history FOR EACH ROW EXECUTE FUNCTION prevent_change_history_mutation()',
  );
  await db.schema.createTable('change_communications', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table.specificType('recipient_emails', 'text[]').notNullable();
    table.text('subject').notNullable();
    table.text('body').notNullable();
    table.boolean('include_client').notNullable().defaultTo(false);
    table.text('status').notNullable().defaultTo('DRAFT');
    table.integer('attempts').notNullable().defaultTo(0);
    table.text('last_error_code');
    table.timestamp('sent_at', { useTz: true });
    table
      .uuid('created_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check("status IN ('DRAFT','QUEUED','SENT','FAILED')");
  });

  await db.schema.alterTable('notifications', (table) => {
    table
      .uuid('change_id')
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
  });
  await db.raw(
    'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check',
  );
  await db.raw(
    "ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('TICKET_ASSIGNED','TICKET_TRANSFERRED','PUBLIC_REPLY','SLA_AT_RISK','SLA_BREACHED','TICKET_UNATTENDED','CHANGE_APPROVAL_REQUESTED','CHANGE_TASK_ASSIGNED','CHANGE_STATUS_UPDATED','HELP_REQUESTED','HELP_ACCEPTED'))",
  );

  await db.raw(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON departments, department_users, ticket_collaborators, help_requests, changes, change_teams, change_tasks, change_approvals, change_updates, change_ticket_links, change_communications TO amnikon_app',
  );
  await db.raw('GRANT SELECT, INSERT ON change_history TO amnikon_app');
  await db.raw(
    'GRANT USAGE, SELECT ON SEQUENCE change_number_seq, change_history_id_seq TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 13 });
};

exports.down = async function (db) {
  await db.schema.alterTable('notifications', (table) =>
    table.dropColumn('change_id'),
  );
  await db.schema.dropTableIfExists('change_communications');
  await db.raw(
    'DROP TRIGGER IF EXISTS change_history_immutable ON change_history',
  );
  await db.raw('DROP FUNCTION IF EXISTS prevent_change_history_mutation()');
  await db.schema.dropTableIfExists('change_history');
  await db.schema.dropTableIfExists('change_ticket_links');
  await db.schema.dropTableIfExists('change_updates');
  await db.schema.dropTableIfExists('change_approvals');
  await db.schema.dropTableIfExists('change_tasks');
  await db.schema.dropTableIfExists('change_teams');
  await db.schema.dropTableIfExists('changes');
  await db.raw('DROP SEQUENCE IF EXISTS change_number_seq');
  await db.schema.dropTableIfExists('help_requests');
  await db.schema.dropTableIfExists('ticket_collaborators');
  await db.schema.alterTable('tickets', (table) =>
    table.dropColumn('department_id'),
  );
  await db.schema.dropTableIfExists('department_users');
  await db.schema.dropTableIfExists('departments');
  await db.schema.alterTable('users', (table) => {
    table.dropColumn('access_expires_at');
    table.dropColumn('supervisor_user_id');
    table.dropColumn('change_access');
    table.dropColumn('work_scope');
  });
  await db('clients').where({ id: INTERNAL_CLIENT_ID }).del();
  await db.schema.alterTable('clients', (table) =>
    table.dropColumn('organization_type'),
  );
  await db('roles').where({ code: 'INTERN' }).del();
  await db('app_schema_state').where({ id: 1 }).update({ version: 12 });
};
