exports.up = async function (db) {
  await db.raw(`
    CREATE TABLE mail_settings (
      id smallint PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
      smtp_host text NOT NULL DEFAULT 'mail.smtp2go.com', smtp_port integer NOT NULL DEFAULT 587,
      tls_mode text NOT NULL DEFAULT 'STARTTLS' CHECK(tls_mode IN ('STARTTLS','TLS')),
      smtp_username text NOT NULL DEFAULT '', password_ciphertext text,
      ticket_address text NOT NULL DEFAULT 'it@amnikontechnologies.com',
      change_address text NOT NULL DEFAULT 'change@amnikontechnologies.com',
      inbound_provider text NOT NULL DEFAULT 'DISABLED' CHECK(inbound_provider IN ('DISABLED','MICROSOFT_365')),
      inbound_since timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO mail_settings(id) VALUES(1);
    CREATE TABLE mail_sync_state (
      mailbox text PRIMARY KEY, cursor text, last_sync_at timestamptz,
      last_error_code text
    );
    CREATE TABLE mail_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      direction text NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
      channel text NOT NULL CHECK(channel IN ('TICKET','CHANGE','TEST')),
      ticket_id uuid REFERENCES tickets(id) ON DELETE RESTRICT,
      change_id uuid REFERENCES changes(id) ON DELETE RESTRICT,
      comment_id uuid REFERENCES ticket_comments(id) ON DELETE RESTRICT,
      communication_id uuid REFERENCES change_communications(id) ON DELETE RESTRICT,
      mailbox text NOT NULL, message_id text NOT NULL,
      in_reply_to text, reference_ids text[] NOT NULL DEFAULT '{}',
      sender_address text NOT NULL, recipient_addresses text[] NOT NULL,
      subject text NOT NULL, body text NOT NULL,
      state text NOT NULL CHECK(state IN ('QUEUED','SENDING','SENT','FAILED','UNKNOWN','RECEIVED','REVIEW','IGNORED')),
      attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
      lease_until timestamptz, last_error_code text, processed_at timestamptz,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(mailbox,message_id),
      CHECK(NOT(ticket_id IS NOT NULL AND change_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX mail_comment_once ON mail_messages(comment_id) WHERE direction='OUTBOUND' AND comment_id IS NOT NULL;
    CREATE UNIQUE INDEX mail_communication_once ON mail_messages(communication_id) WHERE direction='OUTBOUND' AND communication_id IS NOT NULL;
    CREATE INDEX mail_outbox_idx ON mail_messages(state,next_attempt_at);
    CREATE INDEX mail_ticket_idx ON mail_messages(ticket_id,created_at);
    CREATE INDEX mail_change_idx ON mail_messages(change_id,created_at);
    CREATE TABLE mail_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES mail_messages(id) ON DELETE RESTRICT,
      file_name text NOT NULL, content_type text NOT NULL,
      content bytea NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=5242880),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE ticket_attachments ADD COLUMN visibility text NOT NULL DEFAULT 'INTERNAL'
      CHECK(visibility IN ('INTERNAL','PUBLIC'));
    INSERT INTO ticket_sources(code,name,active) VALUES('CLIENT_PORTAL','Client Portal',true) ON CONFLICT(code) DO NOTHING;
    CREATE TABLE knowledge_articles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
      category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
      visibility text NOT NULL CHECK(visibility IN ('STAFF','CLIENT')),
      status text NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
      author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX knowledge_search_idx ON knowledge_articles USING gin(to_tsvector('simple',title || ' ' || body));
    CREATE TABLE service_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text NOT NULL,
      category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
      active boolean NOT NULL DEFAULT true, instructions text NOT NULL,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ticket_knowledge_links (
      ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
      article_id uuid NOT NULL REFERENCES knowledge_articles(id) ON DELETE RESTRICT,
      linked_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(ticket_id,article_id)
    );
    GRANT SELECT,UPDATE ON mail_settings TO amnikon_app;
    GRANT SELECT,INSERT,UPDATE ON mail_sync_state,mail_messages TO amnikon_app;
    GRANT SELECT,INSERT ON mail_attachments TO amnikon_app;
    GRANT SELECT,INSERT,UPDATE ON knowledge_articles,service_templates TO amnikon_app;
    GRANT SELECT,INSERT,DELETE ON ticket_knowledge_links TO amnikon_app;
    UPDATE app_schema_state SET version=18 WHERE id=1;
  `);
};

exports.down = async function () {
  throw new Error(
    'Mail and portal history must be preserved. Restore a verified backup to roll back.',
  );
};
