# Backup and restore

Run on the DB host from the repo root using the owner environment supplied by
Compose. Use a protected destination; backups contain sensitive data in later
phases. Back up protected configuration separately with your approved secret store.

```sh
mkdir -p backups
chmod 700 backups
umask 077
docker compose --env-file .env -f infra/compose.db.yml exec -T postgres \
  pg_dump -U amnikon_owner -d amnikon -Fc > backups/amnikon.dump
```

Check exit status and nonzero output size. Copy encrypted backups off the host
under the organization's retention policy. A dump file alone is not restore proof.

Restore into a **new empty test database**, never blindly overwrite production:

```sh
docker compose --env-file .env -f infra/compose.db.yml exec -T postgres \
  createdb -U amnikon_owner amnikon_restore_check
docker compose --env-file .env -f infra/compose.db.yml exec -T postgres \
  pg_restore -U amnikon_owner -d amnikon_restore_check --exit-on-error < backups/amnikon.dump
docker compose --env-file .env -f infra/compose.db.yml exec -T postgres \
  psql -U amnikon_owner -d amnikon_restore_check -c 'SELECT * FROM app_schema_state'
```

Use a fresh restore-check name for repeated exercises. A fresh replacement DB
server must first provision the roles and pgvector extension binaries using the
same image/init workflow. pg_dump does not back up roles. Validate grants, schema,
row counts, API readiness and later business acceptance before any connection
cutover. Stop writes during a controlled cutover. Never delete the original volume
as a recovery step. Redis AOF is retained but no business jobs exist in Phase 0.
This procedure has not yet been exercised against the user's LAB servers.
