exports.up = async function (db) {
  await db.raw(`
    CREATE TABLE client_mail_routes (
      address text PRIMARY KEY,
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      active boolean NOT NULL DEFAULT false,
      outbound_authorized boolean NOT NULL DEFAULT false,
      CHECK (address = lower(trim(address)) AND address LIKE '%@%')
    );
    INSERT INTO client_mail_routes(address, client_id, active)
    VALUES ('it@amnikontechnologies.com', '00000000-0000-4000-8000-000000000132', true);
    ALTER TABLE mail_messages ADD COLUMN contacted_address text;
    ALTER TABLE tickets ADD COLUMN email_reply_address text;
    UPDATE app_schema_state SET version=20 WHERE id=1;
  `);
};

exports.down = async function () {
  throw new Error(
    'Restore a verified backup to roll back client mail routing.',
  );
};
