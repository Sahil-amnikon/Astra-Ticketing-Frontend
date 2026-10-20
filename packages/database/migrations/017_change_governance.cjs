exports.up = async function (db) {
  await db.raw(`
    CREATE TABLE cab_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE, quorum integer NOT NULL CHECK(quorum > 0 AND quorum <= 50),
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE cab_members (
      group_id uuid NOT NULL REFERENCES cab_groups(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      PRIMARY KEY(group_id,user_id)
    );
    CREATE TABLE change_governance_policy (
      id smallint PRIMARY KEY CHECK(id=1),
      high_risk_cab boolean NOT NULL DEFAULT true,
      minimum_approvals integer NOT NULL DEFAULT 1 CHECK(minimum_approvals BETWEEN 1 AND 10),
      review_required boolean NOT NULL DEFAULT true
    );
    INSERT INTO change_governance_policy(id) VALUES(1);
    CREATE TABLE change_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
      category text NOT NULL CHECK(category IN ('SERVER','CLOUD','MICROSOFT_365','NETWORK','SECURITY','APPLICATION','OTHER')),
      description text NOT NULL, implementation_plan text NOT NULL,
      test_plan text NOT NULL, rollback_plan text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE change_blackouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
      client_id uuid REFERENCES clients(id) ON DELETE RESTRICT,
      site_id uuid REFERENCES sites(id) ON DELETE RESTRICT,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      CHECK(ends_at > starts_at), CHECK(site_id IS NULL OR client_id IS NOT NULL),
      FOREIGN KEY(site_id,client_id) REFERENCES sites(id,client_id)
    );
    ALTER TABLE changes ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
      ADD COLUMN cab_group_id uuid REFERENCES cab_groups(id) ON DELETE RESTRICT,
      ADD COLUMN cab_quorum integer NOT NULL DEFAULT 0 CHECK(cab_quorum>=0),
      ADD COLUMN affected_resources text[] NOT NULL DEFAULT '{}';
    ALTER TABLE change_approvals ADD COLUMN revision integer NOT NULL DEFAULT 1,
      ADD COLUMN cab_group_id uuid REFERENCES cab_groups(id) ON DELETE RESTRICT;
    CREATE UNIQUE INDEX change_cab_vote_unique ON change_approvals(change_id,revision,approver_user_id)
      WHERE cab_group_id IS NOT NULL;
    CREATE TABLE change_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      change_id uuid NOT NULL REFERENCES changes(id) ON DELETE RESTRICT,
      revision integer NOT NULL, outcome text NOT NULL CHECK(outcome IN ('SUCCESS','PARTIAL','FAILED','ROLLED_BACK')),
      summary text NOT NULL, follow_up text NOT NULL,
      actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER change_reviews_immutable BEFORE UPDATE OR DELETE ON change_reviews
      FOR EACH ROW EXECUTE FUNCTION prevent_change_history_mutation();
    CREATE INDEX change_window_idx ON changes(client_id,planned_start,planned_end);
    CREATE INDEX change_resources_idx ON changes USING gin(affected_resources);
    GRANT SELECT,INSERT,UPDATE,DELETE ON cab_groups,cab_members,change_templates,change_blackouts TO amnikon_app;
    GRANT SELECT,UPDATE ON change_governance_policy TO amnikon_app;
    GRANT SELECT,INSERT ON change_reviews TO amnikon_app;
    UPDATE app_schema_state SET version=17 WHERE id=1;
  `);
};

exports.down = async function () {
  throw new Error(
    'Governance contains retained approval history. Restore a verified backup to roll back.',
  );
};
