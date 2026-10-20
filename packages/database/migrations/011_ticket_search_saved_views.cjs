exports.up = async function (db) {
  await db.raw(`CREATE INDEX tickets_search_vector_idx ON tickets USING gin(
      to_tsvector('simple',
        coalesce(ticket_number,'') || ' ' ||
        coalesce(subject,'') || ' ' ||
        coalesce(description,'') || ' ' ||
        coalesce(source,'')
      )
    )`);
  await db.raw(
    'CREATE INDEX tickets_description_trgm_idx ON tickets USING gin(description gin_trgm_ops)',
  );
  await db.raw(
    'CREATE INDEX ticket_comments_body_trgm_idx ON ticket_comments USING gin(body gin_trgm_ops)',
  );
  await db.raw(
    'CREATE INDEX contacts_name_trgm_idx ON contacts USING gin(name gin_trgm_ops)',
  );
  await db.raw(
    'CREATE INDEX clients_name_trgm_idx ON clients USING gin(name gin_trgm_ops)',
  );

  await db.schema.createTable('saved_ticket_views', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('name').notNullable();
    table.jsonb('query').notNullable().defaultTo(db.raw("'{}'::jsonb"));
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
    'CREATE UNIQUE INDEX saved_ticket_views_user_name_uq ON saved_ticket_views(user_id,lower(name))',
  );
  await db.raw(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON saved_ticket_views TO amnikon_app',
  );
  await db('app_schema_state').where({ id: 1 }).update({ version: 11 });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('saved_ticket_views');
  await db.raw('DROP INDEX IF EXISTS contacts_name_trgm_idx');
  await db.raw('DROP INDEX IF EXISTS clients_name_trgm_idx');
  await db.raw('DROP INDEX IF EXISTS ticket_comments_body_trgm_idx');
  await db.raw('DROP INDEX IF EXISTS tickets_description_trgm_idx');
  await db.raw('DROP INDEX IF EXISTS tickets_search_vector_idx');
  await db('app_schema_state').where({ id: 1 }).update({ version: 10 });
};
