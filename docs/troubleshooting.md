# Troubleshooting

- API fails at startup: verify required environment field names; do not paste
  secret connection URLs into logs or tickets. Logs intentionally omit values.
- `/health` 200 but `/ready` 503: the process is alive but PostgreSQL, schema version
  or Redis is unavailable. Check DB private routing, credentials, migrations and
  Redis health. Readiness details are kept generic on the HTTP endpoint.
- Migration fails: verify owner credentials, DB reachability and pgvector image.
  Do not run migration commands with the runtime role. Repeat only after fixing
  the cause; migration history tracks completed work.
- Password change has no effect: POSTGRES_PASSWORD/APP_DB_PASSWORD initialization
  runs only on an empty volume. Update the existing role via an approved rotation.
- Cannot access from another machine: frontend binds loopback by default; configure
  the internal reverse proxy or explicitly select WEB's private interface.
- `/docs-json` returns 404: expected unless ENABLE_API_DOCS=true in LAB.
- Integration test fails without services: expected and blocking. Unit probes are
  not a replacement for real PostgreSQL/Redis integration tests.
- Native start: export DATABASE_URL, REDIS_URL, APP_BASE_URL and API_INTERNAL_URL;
  run API and frontend in separate terminals after the production build.
- Container unhealthy: inspect `docker compose ... ps` and sanitized logs, then
  fix dependency availability. Compose does not restart unhealthy live processes.
