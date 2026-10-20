exports.up = async function (db) {
  await db.raw(`
    CREATE UNIQUE INDEX sites_id_client_portal_uq ON sites(id,client_id);
    CREATE TABLE client_email_domains (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      domain text NOT NULL UNIQUE,
      site_id uuid,
      active boolean NOT NULL DEFAULT true,
      revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(site_id,client_id) REFERENCES sites(id,client_id) ON DELETE RESTRICT,
      UNIQUE(id,client_id),
      CHECK(domain=lower(trim(domain)) AND domain ~ '^[a-z0-9][a-z0-9.-]+[.][a-z0-9-]+$')
    );
    CREATE INDEX client_email_domains_client_idx ON client_email_domains(client_id);
    CREATE TABLE portal_ticket_submissions (
      request_id uuid PRIMARY KEY,
      domain_rule_id uuid NOT NULL,
      client_id uuid NOT NULL,
      requester_email text NOT NULL,
      ticket_id uuid NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(domain_rule_id,client_id) REFERENCES client_email_domains(id,client_id),
      FOREIGN KEY(ticket_id,client_id) REFERENCES tickets(id,client_id),
      CHECK(requester_email=lower(trim(requester_email)))
    );
    CREATE INDEX contacts_portal_email_idx ON contacts(client_id,lower(email)) WHERE active;
    GRANT SELECT,INSERT,UPDATE ON client_email_domains TO amnikon_app;
    GRANT SELECT,INSERT ON portal_ticket_submissions TO amnikon_app;
    UPDATE app_schema_state SET version=22 WHERE id=1;
  `);
};
exports.down = async function () {
  throw new Error(
    'Preserve submitted tickets and domain routing. Use the prior application image for rollback; do not remove portal history.',
  );
};
