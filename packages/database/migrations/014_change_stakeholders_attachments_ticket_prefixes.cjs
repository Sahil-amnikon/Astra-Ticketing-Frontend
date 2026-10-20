const INTERNAL_CLIENT_ID = '00000000-0000-4000-8000-000000000132';

exports.up = async function (db) {
  await db.schema.alterTable('clients', (table) => {
    table.text('ticket_prefix');
  });

  await db.raw(`
    DO $$
    DECLARE
      item record;
      base text;
      candidate text;
      suffix integer;
    BEGIN
      FOR item IN SELECT id,name FROM clients ORDER BY created_at,id LOOP
        base := CASE
          WHEN item.id='${INTERNAL_CLIENT_ID}'::uuid THEN 'INT'
          WHEN item.name ILIKE 'Ravid%' THEN 'RAV'
          WHEN item.name ILIKE 'Geometry%' THEN 'GEO'
          ELSE left(regexp_replace(upper(item.name),'[^A-Z0-9]','','g'),3)
        END;
        IF length(base)<2 THEN base := 'CLT'; END IF;
        candidate := base;
        suffix := 2;
        WHILE EXISTS(SELECT 1 FROM clients WHERE ticket_prefix=candidate) LOOP
          candidate := left(base,6) || suffix::text;
          suffix := suffix + 1;
        END LOOP;
        UPDATE clients SET ticket_prefix=candidate WHERE id=item.id;
      END LOOP;
    END $$
  `);
  await db.raw('ALTER TABLE clients ALTER COLUMN ticket_prefix SET NOT NULL');
  await db.raw(
    'ALTER TABLE clients ADD CONSTRAINT clients_ticket_prefix_unique UNIQUE(ticket_prefix)',
  );
  await db.raw(
    "ALTER TABLE clients ADD CONSTRAINT clients_ticket_prefix_format CHECK (ticket_prefix ~ '^[A-Z][A-Z0-9]{1,7}$')",
  );

  await db.raw(`
    UPDATE tickets t SET ticket_number=c.ticket_prefix || '-' ||
      lpad((regexp_match(t.ticket_number,'([0-9]+)$'))[1],6,'0')
    FROM clients c
    WHERE c.id=t.client_id AND t.ticket_number ~ '[0-9]+$'
  `);

  await db.schema.createTable('client_ticket_sequences', (table) => {
    table
      .uuid('client_id')
      .primary()
      .references('id')
      .inTable('clients')
      .onDelete('CASCADE');
    table.bigInteger('next_number').notNullable().defaultTo(1);
  });
  await db.raw(`
    INSERT INTO client_ticket_sequences(client_id,next_number)
    SELECT c.id,COALESCE(max((regexp_match(t.ticket_number,'([0-9]+)$'))[1]::bigint),0)+1
    FROM clients c LEFT JOIN tickets t ON t.client_id=c.id GROUP BY c.id
  `);

  await db.schema.createTable('change_stakeholders', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.text('external_name');
    table.text('external_email');
    table.text('stakeholder_role').notNullable().defaultTo('STAKEHOLDER');
    table
      .uuid('added_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check(
      '(user_id IS NOT NULL AND external_email IS NULL) OR (user_id IS NULL AND external_email IS NOT NULL)',
    );
    table.check(
      "stakeholder_role IN ('STAKEHOLDER','BUSINESS_CONTACT','TECHNICAL_CONTACT','OBSERVER')",
    );
  });
  await db.raw(
    'CREATE UNIQUE INDEX change_stakeholders_user_unique ON change_stakeholders(change_id,user_id) WHERE user_id IS NOT NULL',
  );
  await db.raw(
    'CREATE UNIQUE INDEX change_stakeholders_email_unique ON change_stakeholders(change_id,lower(external_email)) WHERE external_email IS NOT NULL',
  );

  await db.schema.createTable('change_attachments', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('change_id')
      .notNullable()
      .references('id')
      .inTable('changes')
      .onDelete('CASCADE');
    table
      .uuid('uploaded_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('file_name').notNullable();
    table.text('content_type').notNullable();
    table.bigInteger('size_bytes').notNullable();
    table.text('sha256').notNullable();
    table.binary('content').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(db.fn.now());
    table.check('size_bytes > 0 AND size_bytes <= 5242880');
  });

  await db('users').update({ access_expires_at: null });
  await db.raw(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON client_ticket_sequences, change_stakeholders, change_attachments TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 14 });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('change_attachments');
  await db.schema.dropTableIfExists('change_stakeholders');
  await db.schema.dropTableIfExists('client_ticket_sequences');
  await db.raw(
    'ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_ticket_prefix_format',
  );
  await db.raw(
    'ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_ticket_prefix_unique',
  );
  await db.schema.alterTable('clients', (table) => {
    table.dropColumn('ticket_prefix');
  });
  await db('app_schema_state').where({ id: 1 }).update({ version: 13 });
};
