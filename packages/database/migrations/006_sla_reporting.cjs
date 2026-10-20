const POLICIES = [
  ['P1_CRITICAL', 30, 240],
  ['P2_HIGH', 60, 480],
  ['P3_MEDIUM', 240, 960],
  ['P4_LOW', 480, 2400],
];

exports.up = async function (db) {
  await db.schema.createTable('sla_policies', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('priority').notNullable().unique();
    table.integer('response_minutes').notNullable();
    table.integer('resolution_minutes').notNullable();
    table.integer('warning_percent').notNullable().defaultTo(75);
    table.boolean('active').notNullable().defaultTo(true);
    table
      .uuid('updated_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check("priority IN ('P1_CRITICAL','P2_HIGH','P3_MEDIUM','P4_LOW')");
    table.check('response_minutes BETWEEN 1 AND 525600');
    table.check('resolution_minutes BETWEEN 1 AND 525600');
    table.check('resolution_minutes >= response_minutes');
    table.check('warning_percent BETWEEN 1 AND 99');
  });
  await db('sla_policies').insert(
    POLICIES.map(([priority, response, resolution]) => ({
      priority,
      response_minutes: response,
      resolution_minutes: resolution,
      warning_percent: 75,
    })),
  );

  await db.schema.createTable('ticket_sla', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('ticket_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table
      .uuid('policy_id')
      .notNullable()
      .references('id')
      .inTable('sla_policies')
      .onDelete('RESTRICT');
    table.text('target_priority').notNullable();
    table.timestamp('response_warning_at', { useTz: true }).notNullable();
    table.timestamp('response_due_at', { useTz: true }).notNullable();
    table.timestamp('resolution_warning_at', { useTz: true }).notNullable();
    table.timestamp('resolution_due_at', { useTz: true }).notNullable();
    table.timestamp('response_completed_at', { useTz: true });
    table.timestamp('resolution_completed_at', { useTz: true });
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
    'CREATE INDEX ticket_sla_due_idx ON ticket_sla (response_due_at, resolution_due_at)',
  );
  await db.raw(
    `INSERT INTO ticket_sla
      (ticket_id,policy_id,target_priority,response_warning_at,response_due_at,resolution_warning_at,resolution_due_at,response_completed_at,resolution_completed_at)
     SELECT t.id,p.id,t.priority,
       t.created_at + (p.response_minutes * p.warning_percent / 100.0) * interval '1 minute',
       t.created_at + p.response_minutes * interval '1 minute',
       t.created_at + (p.resolution_minutes * p.warning_percent / 100.0) * interval '1 minute',
       t.created_at + p.resolution_minutes * interval '1 minute',
       t.first_response_at,
       CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN COALESCE(t.resolved_at,t.closed_at) END
     FROM tickets t JOIN sla_policies p ON p.priority=t.priority`,
  );

  await db.raw('GRANT SELECT, INSERT, UPDATE ON ticket_sla TO amnikon_app');
  await db.raw('GRANT SELECT, UPDATE ON sla_policies TO amnikon_app');
  await db('app_schema_state').where({ id: 1 }).update({ version: 6 });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('ticket_sla');
  await db.schema.dropTableIfExists('sla_policies');
  await db('app_schema_state').where({ id: 1 }).update({ version: 5 });
};
