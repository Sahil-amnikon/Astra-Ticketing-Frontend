exports.up = async function (db) {
  await db.raw(`
    CREATE UNIQUE INDEX contacts_group_client_uq ON contacts(id,client_id);
    CREATE TABLE access_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
      description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
      kind text NOT NULL CHECK(kind IN ('CUSTOMER','STAFF')),
      client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
      permissions text[] NOT NULL DEFAULT '{}',
      active boolean NOT NULL DEFAULT true,
      revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,client_id),
      CHECK((kind='CUSTOMER' AND client_id IS NOT NULL AND permissions <@ ARRAY['PORTAL_ORGANIZATION_VIEW','PORTAL_ORGANIZATION_REPLY']::text[])
        OR (kind='STAFF' AND client_id IS NULL AND permissions <@ ARRAY['TICKETS_TEAM_VIEW','TICKETS_ASSIGN','TICKETS_APPROVE','CATEGORY_MANAGE','SLA_MANAGE','REPORTS_VIEW','TAGS_MANAGE']::text[])),
      CHECK(NOT ('PORTAL_ORGANIZATION_REPLY'=ANY(permissions)) OR 'PORTAL_ORGANIZATION_VIEW'=ANY(permissions))
    );
    CREATE UNIQUE INDEX access_groups_name_uq ON access_groups(kind,COALESCE(client_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(name)));
    CREATE TABLE staff_group_members (
      group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(group_id,user_id)
    );
    CREATE INDEX staff_group_members_user_idx ON staff_group_members(user_id);
    CREATE TABLE customer_group_members (
      group_id uuid NOT NULL,
      client_id uuid NOT NULL,
      contact_id uuid NOT NULL,
      PRIMARY KEY(group_id,contact_id),
      FOREIGN KEY(group_id,client_id) REFERENCES access_groups(id,client_id) ON DELETE CASCADE,
      FOREIGN KEY(contact_id,client_id) REFERENCES contacts(id,client_id) ON DELETE RESTRICT
    );
    CREATE INDEX customer_group_members_contact_idx ON customer_group_members(contact_id);
    GRANT SELECT,INSERT,UPDATE ON access_groups TO amnikon_app;
    GRANT SELECT,INSERT,DELETE ON staff_group_members,customer_group_members TO amnikon_app;
    UPDATE app_schema_state SET version=23 WHERE id=1;
  `);
};
exports.down = async function () {
  throw new Error(
    'Retain access-group configuration and audit history; roll back the application images instead.',
  );
};
