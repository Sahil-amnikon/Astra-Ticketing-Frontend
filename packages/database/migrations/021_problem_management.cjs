exports.up = async function (db) {
  await db.raw(`
    CREATE SEQUENCE problem_number_seq;
    CREATE TABLE problems (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      number bigint NOT NULL UNIQUE DEFAULT nextval('problem_number_seq'),
      problem_number text GENERATED ALWAYS AS ('PRB-' || repeat('0',greatest(0,8-length(number::text))) || number::text) STORED UNIQUE,
      client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      site_id uuid REFERENCES sites(id) ON DELETE RESTRICT,
      title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 200),
      description text NOT NULL CHECK(length(trim(description)) BETWEEN 3 AND 10000),
      priority text NOT NULL DEFAULT 'P3_MEDIUM' CHECK(priority IN ('P1_CRITICAL','P2_HIGH','P3_MEDIUM','P4_LOW')),
      status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','KNOWN_ERROR','RESOLVED','CLOSED')),
      root_cause text NOT NULL DEFAULT '', workaround text NOT NULL DEFAULT '', resolution text NOT NULL DEFAULT '',
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      revision integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,client_id),
      CHECK(status NOT IN ('KNOWN_ERROR','RESOLVED','CLOSED') OR length(trim(root_cause)) >= 3),
      CHECK(status <> 'KNOWN_ERROR' OR length(trim(workaround)) >= 3),
      CHECK(status NOT IN ('RESOLVED','CLOSED') OR length(trim(resolution)) >= 3)
    );
    CREATE TABLE problem_tickets (
      problem_id uuid NOT NULL, ticket_id uuid NOT NULL, client_id uuid NOT NULL,
      linked_by_user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(problem_id,ticket_id),
      FOREIGN KEY(problem_id,client_id) REFERENCES problems(id,client_id) ON DELETE RESTRICT,
      FOREIGN KEY(ticket_id,client_id) REFERENCES tickets(id,client_id) ON DELETE RESTRICT
    );
    CREATE TABLE problem_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), problem_id uuid NOT NULL REFERENCES problems(id),
      actor_user_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX problems_client_status_updated ON problems(client_id,status,updated_at DESC,id);
    CREATE INDEX problems_owner_updated ON problems(owner_user_id,updated_at DESC,id);
    CREATE INDEX problem_tickets_ticket ON problem_tickets(ticket_id);
    CREATE INDEX problem_history_timeline ON problem_history(problem_id,created_at,id);
    GRANT SELECT,INSERT,UPDATE ON problems TO amnikon_app;
    GRANT SELECT,INSERT,DELETE ON problem_tickets TO amnikon_app;
    GRANT SELECT,INSERT ON problem_history TO amnikon_app;
    GRANT USAGE,SELECT ON SEQUENCE problem_number_seq TO amnikon_app;
    UPDATE app_schema_state SET version=21 WHERE id=1;
  `);
};
exports.down = async function () {
  throw new Error(
    'Problem Management is additive. Roll back application images and retain problem data.',
  );
};
