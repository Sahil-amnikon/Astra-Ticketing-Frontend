const DEFAULT_CALENDAR_ID = '00000000-0000-4000-8000-000000000126';

exports.up = async function (db) {
  await db.schema.createTable('sla_calendars', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.text('name').notNullable().unique();
    table.text('timezone').notNullable();
    table.specificType('working_days', 'smallint[]').notNullable();
    table.specificType('work_start', 'time').notNullable();
    table.specificType('work_end', 'time').notNullable();
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
    table.check('cardinality(working_days) BETWEEN 1 AND 7');
    table.check('work_end > work_start');
  });
  await db('sla_calendars').insert({
    id: DEFAULT_CALENDAR_ID,
    name: 'Standard Support Hours',
    timezone: 'Asia/Kolkata',
    working_days: db.raw('ARRAY[1,2,3,4,5]::smallint[]'),
    work_start: '09:00',
    work_end: '18:00',
  });

  await db.schema.createTable('sla_holidays', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('calendar_id')
      .notNullable()
      .references('id')
      .inTable('sla_calendars')
      .onDelete('CASCADE');
    table.date('holiday_date').notNullable();
    table.text('name').notNullable();
    table.unique(['calendar_id', 'holiday_date']);
  });

  await db.schema.alterTable('sla_policies', (table) => {
    table
      .uuid('calendar_id')
      .references('id')
      .inTable('sla_calendars')
      .onDelete('RESTRICT');
  });
  await db('sla_policies').update({ calendar_id: DEFAULT_CALENDAR_ID });
  await db.raw(
    'ALTER TABLE sla_policies ALTER COLUMN calendar_id SET NOT NULL',
  );

  await db.schema.alterTable('ticket_sla', (table) => {
    table
      .uuid('calendar_id')
      .references('id')
      .inTable('sla_calendars')
      .onDelete('RESTRICT');
    table.timestamp('paused_at', { useTz: true });
    table.integer('response_warning_remaining_minutes');
    table.integer('response_remaining_minutes');
    table.integer('resolution_warning_remaining_minutes');
    table.integer('resolution_remaining_minutes');
  });
  await db.raw(`UPDATE ticket_sla s SET calendar_id=p.calendar_id
    FROM sla_policies p WHERE p.id=s.policy_id`);
  await db.raw('ALTER TABLE ticket_sla ALTER COLUMN calendar_id SET NOT NULL');

  await db.raw(`
    CREATE OR REPLACE FUNCTION sla_add_business_minutes(
      target_calendar uuid, start_at timestamptz, requested_minutes integer
    ) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
    DECLARE
      calendar_row sla_calendars%ROWTYPE;
      cursor_at timestamptz := start_at;
      local_day date;
      day_start timestamptz;
      day_end timestamptz;
      available integer;
      remaining integer := GREATEST(requested_minutes, 0);
      guard integer := 0;
    BEGIN
      SELECT * INTO STRICT calendar_row FROM sla_calendars WHERE id=target_calendar;
      IF remaining = 0 THEN RETURN cursor_at; END IF;
      WHILE remaining > 0 LOOP
        guard := guard + 1;
        IF guard > 3700 THEN RAISE EXCEPTION 'SLA calendar cannot satisfy target'; END IF;
        local_day := (cursor_at AT TIME ZONE calendar_row.timezone)::date;
        IF extract(isodow FROM local_day)::smallint = ANY(calendar_row.working_days)
          AND NOT EXISTS (SELECT 1 FROM sla_holidays h WHERE h.calendar_id=target_calendar AND h.holiday_date=local_day)
        THEN
          day_start := (local_day + calendar_row.work_start) AT TIME ZONE calendar_row.timezone;
          day_end := (local_day + calendar_row.work_end) AT TIME ZONE calendar_row.timezone;
          cursor_at := GREATEST(cursor_at, day_start);
          IF cursor_at < day_end THEN
            available := floor(extract(epoch FROM (day_end-cursor_at))/60)::integer;
            IF remaining <= available THEN RETURN cursor_at + remaining * interval '1 minute'; END IF;
            remaining := remaining - available;
          END IF;
        END IF;
        local_day := local_day + 1;
        cursor_at := local_day::timestamp AT TIME ZONE calendar_row.timezone;
      END LOOP;
      RETURN cursor_at;
    END $$;
  `);

  await db.raw(`
    CREATE OR REPLACE FUNCTION sla_business_minutes_between(
      target_calendar uuid, start_at timestamptz, end_at timestamptz
    ) RETURNS integer LANGUAGE plpgsql STABLE AS $$
    DECLARE
      calendar_row sla_calendars%ROWTYPE;
      local_day date;
      final_day date;
      day_start timestamptz;
      day_end timestamptz;
      overlap_start timestamptz;
      overlap_end timestamptz;
      total integer := 0;
      guard integer := 0;
    BEGIN
      IF end_at <= start_at THEN RETURN 0; END IF;
      SELECT * INTO STRICT calendar_row FROM sla_calendars WHERE id=target_calendar;
      local_day := (start_at AT TIME ZONE calendar_row.timezone)::date;
      final_day := (end_at AT TIME ZONE calendar_row.timezone)::date;
      WHILE local_day <= final_day LOOP
        guard := guard + 1;
        IF guard > 3700 THEN RAISE EXCEPTION 'SLA interval is too large'; END IF;
        IF extract(isodow FROM local_day)::smallint = ANY(calendar_row.working_days)
          AND NOT EXISTS (SELECT 1 FROM sla_holidays h WHERE h.calendar_id=target_calendar AND h.holiday_date=local_day)
        THEN
          day_start := (local_day + calendar_row.work_start) AT TIME ZONE calendar_row.timezone;
          day_end := (local_day + calendar_row.work_end) AT TIME ZONE calendar_row.timezone;
          overlap_start := GREATEST(start_at, day_start);
          overlap_end := LEAST(end_at, day_end);
          IF overlap_end > overlap_start THEN
            total := total + floor(extract(epoch FROM (overlap_end-overlap_start))/60)::integer;
          END IF;
        END IF;
        local_day := local_day + 1;
      END LOOP;
      RETURN total;
    END $$;
  `);

  await db.schema.createTable('notification_preferences', (table) => {
    table
      .uuid('user_id')
      .primary()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.boolean('ticket_assigned').notNullable().defaultTo(true);
    table.boolean('ticket_transferred').notNullable().defaultTo(true);
    table.boolean('public_reply').notNullable().defaultTo(true);
    table.boolean('sla_at_risk').notNullable().defaultTo(true);
    table.boolean('sla_breached').notNullable().defaultTo(true);
    table.boolean('ticket_unattended').notNullable().defaultTo(true);
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
  });

  await db.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('ticket_id')
      .references('id')
      .inTable('tickets')
      .onDelete('CASCADE');
    table.text('type').notNullable();
    table.text('title').notNullable();
    table.text('body').notNullable();
    table.text('event_key').notNullable().unique();
    table.timestamp('read_at', { useTz: true });
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check(
      "type IN ('TICKET_ASSIGNED','TICKET_TRANSFERRED','PUBLIC_REPLY','SLA_AT_RISK','SLA_BREACHED','TICKET_UNATTENDED')",
    );
  });
  await db.raw(
    'CREATE INDEX notifications_user_unread_idx ON notifications(user_id,read_at,created_at DESC)',
  );

  await db.raw(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON sla_calendars, sla_holidays TO amnikon_app',
  );
  await db.raw(
    'GRANT EXECUTE ON FUNCTION sla_add_business_minutes(uuid,timestamptz,integer) TO amnikon_app',
  );
  await db.raw(
    'GRANT EXECUTE ON FUNCTION sla_business_minutes_between(uuid,timestamptz,timestamptz) TO amnikon_app',
  );
  await db.raw(
    'GRANT SELECT, INSERT, UPDATE ON notification_preferences, notifications TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 12 });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('notifications');
  await db.schema.dropTableIfExists('notification_preferences');
  await db.raw(
    'DROP FUNCTION IF EXISTS sla_business_minutes_between(uuid,timestamptz,timestamptz)',
  );
  await db.raw(
    'DROP FUNCTION IF EXISTS sla_add_business_minutes(uuid,timestamptz,integer)',
  );
  await db.schema.alterTable('ticket_sla', (table) => {
    table.dropColumn('resolution_remaining_minutes');
    table.dropColumn('resolution_warning_remaining_minutes');
    table.dropColumn('response_remaining_minutes');
    table.dropColumn('response_warning_remaining_minutes');
    table.dropColumn('paused_at');
    table.dropColumn('calendar_id');
  });
  await db.schema.alterTable('sla_policies', (table) =>
    table.dropColumn('calendar_id'),
  );
  await db.schema.dropTableIfExists('sla_holidays');
  await db.schema.dropTableIfExists('sla_calendars');
  await db('app_schema_state').where({ id: 1 }).update({ version: 11 });
};
