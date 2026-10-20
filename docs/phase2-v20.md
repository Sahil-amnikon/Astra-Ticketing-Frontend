# Phase 2 v20

Phase 2 v20 is an application-only correction to v19. It fixes the Audit
History lookup query without changing the database schema.

## Audit History correction

- Replaces a PostgreSQL reserved-word table alias with a safe alias.
- Restores Audit History loading after the v19 privacy release.
- Retains readable record names and suppression of UUIDs, phone numbers, and
  email addresses.
- Adds a regression test that executes the Audit History listing and reference
  resolution path.

## Deployment

- Use the deployed v19 `.env` as the configuration baseline.
- No new migration is included; the migration runner must report zero changes.
