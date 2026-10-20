import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dependencies } from '../src/dependencies';
import { createApp } from '../src/app';
test('real PostgreSQL extensions, migrated schema, Redis and API readiness', async () => {
  const deps = new Dependencies();
  try {
    const result = await deps.db.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm')",
    );
    assert.deepEqual(result.rows.map((r) => r.extname).sort(), [
      'pg_trgm',
      'vector',
    ]);
    assert.equal(await deps.check(), true);
    const schema = await deps.db.query<{ version: number }>(
      'SELECT version FROM app_schema_state WHERE id = 1',
    );
    assert.equal(schema.rows[0]?.version, 18);
    const tables = await deps.db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users', 'roles', 'clients', 'contacts', 'sites',
                            'assets', 'categories', 'tags', 'audit_logs', 'tickets',
                            'ticket_comments', 'ticket_assignments', 'ticket_tags',
                            'ticket_approvals', 'ticket_history', 'ticket_attachments',
                            'sla_policies', 'ticket_sla')`,
    );
    assert.equal(tables.rowCount, 18);
    const permissions = await deps.db.query<{
      can_update_audit: boolean;
      can_delete_audit: boolean;
    }>(
      `SELECT
         has_table_privilege(current_user, 'audit_logs', 'UPDATE') AS can_update_audit,
         has_table_privilege(current_user, 'audit_logs', 'DELETE') AS can_delete_audit`,
    );
    assert.equal(permissions.rows[0]?.can_update_audit, false);
    assert.equal(permissions.rows[0]?.can_delete_audit, false);
    const role = await deps.db.query<{
      rolsuper: boolean;
      rolcreatedb: boolean;
    }>(
      'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    assert.equal(role.rows[0]?.rolsuper, false);
    assert.equal(role.rows[0]?.rolcreatedb, false);
    await assert.rejects(
      deps.db.query('UPDATE app_schema_state SET version = 1'),
      { code: '42501' },
    );
    await assert.rejects(
      deps.db.query('UPDATE audit_logs SET action = action'),
      {
        code: '42501',
      },
    );
    await assert.rejects(
      deps.db.query('UPDATE ticket_history SET action = action'),
      { code: '42501' },
    );
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      assert.equal((await fetch(`${await app.getUrl()}/ready`)).status, 200);
    } finally {
      await app.close();
    }
  } finally {
    await deps.onModuleDestroy();
  }
});
