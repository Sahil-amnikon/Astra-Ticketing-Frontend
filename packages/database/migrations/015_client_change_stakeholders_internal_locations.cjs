exports.up = async function (db) {
  await db.schema.alterTable('change_stakeholders', (table) => {
    table
      .uuid('contact_id')
      .references('id')
      .inTable('contacts')
      .onDelete('CASCADE');
  });

  await db.raw(`
    DO $$
    DECLARE item record;
    BEGIN
      FOR item IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid='change_stakeholders'::regclass
          AND contype='c'
          AND pg_get_constraintdef(oid) ILIKE '%user_id IS NOT NULL%'
          AND pg_get_constraintdef(oid) ILIKE '%external_email%'
      LOOP
        EXECUTE format('ALTER TABLE change_stakeholders DROP CONSTRAINT %I',item.conname);
      END LOOP;
    END $$
  `);
  await db.raw(`
    ALTER TABLE change_stakeholders
      ADD CONSTRAINT change_stakeholders_identity_check CHECK (
        (contact_id IS NOT NULL AND user_id IS NULL AND external_email IS NULL) OR
        (contact_id IS NULL AND user_id IS NOT NULL AND external_email IS NULL) OR
        (contact_id IS NULL AND user_id IS NULL AND external_email IS NOT NULL)
      )
  `);
  await db.raw(
    'CREATE UNIQUE INDEX change_stakeholders_contact_unique ON change_stakeholders(change_id,contact_id) WHERE contact_id IS NOT NULL',
  );

  await db.schema.alterTable('tickets', (table) => {
    table.text('location_text');
  });

  await db('app_schema_state').where({ id: 1 }).update({ version: 15 });
};

exports.down = async function (db) {
  await db.schema.alterTable('tickets', (table) => {
    table.dropColumn('location_text');
  });
  await db.raw('DROP INDEX IF EXISTS change_stakeholders_contact_unique');
  await db.raw(
    'ALTER TABLE change_stakeholders DROP CONSTRAINT IF EXISTS change_stakeholders_identity_check',
  );
  await db.raw(`
    DELETE FROM change_stakeholders WHERE contact_id IS NOT NULL;
    ALTER TABLE change_stakeholders
      ADD CONSTRAINT change_stakeholders_identity_check CHECK (
        (user_id IS NOT NULL AND external_email IS NULL) OR
        (user_id IS NULL AND external_email IS NOT NULL)
      )
  `);
  await db.schema.alterTable('change_stakeholders', (table) => {
    table.dropColumn('contact_id');
  });
  await db('app_schema_state').where({ id: 1 }).update({ version: 14 });
};
