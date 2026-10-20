# Two-server LAB deployment

Use Ubuntu 24.04 hosts with Docker Engine and Compose v2 installed. Run commands
from the repository root. Copy the repository/release to both hosts. No host
Node.js installation is needed for the deployed application.

## DB host

Copy `.env.example` to `.env`, restrict it to the operator (`chmod 600 .env`), and
set independent strong `POSTGRES_PASSWORD` and `APP_DB_PASSWORD`. Set
`DB_BIND_ADDRESS` to the DB host's private interface. The database name is
`amnikon`; roles are `amnikon_owner` (bootstrap/migration) and `amnikon_app` (runtime).

```sh
docker compose --env-file .env -f infra/compose.db.yml up -d
docker compose --env-file .env -f infra/compose.db.yml ps
```

Allow TCP 5432 only from WEB's private address using the actual Docker forwarding
firewall path (DOCKER-USER/nftables or upstream network ACL). Do not rely on UFW
INPUT rules alone for a Docker-published port. Verify another client host cannot
connect. Never use 0.0.0.0 or a public DB interface for this deployment.

The initialization script runs only with an empty data volume. Editing environment
passwords later does not change database role passwords; rotate them explicitly.
Do not delete an existing volume to apply configuration changes.

## WEB host

Create a separate protected `.env` with `DATABASE_URL` using `amnikon_app` and
`MIGRATION_DATABASE_URL` using `amnikon_owner`, both targeting DB's private address.
Percent-encode URL password components. Set `APP_BASE_URL` to the internal HTTPS URL.
Owner credentials are injected into the one-shot migration service only.

```sh
docker compose --env-file .env -f infra/compose.web.yml build
docker compose --env-file .env -f infra/compose.web.yml --profile tools run --rm migrate
docker compose --env-file .env -f infra/compose.web.yml --profile tools run --rm migrate
docker compose --env-file .env -f infra/compose.web.yml up -d frontend backend worker redis
sh scripts/lab-check.sh
```

For the direct v31 → v32 update, the first migration run must report one migration
applied and the second must report zero. Migration 013 is additive, preserves
existing tickets and creates a protected internal organization. Phase 2 does not
seed identities, credentials or fake tickets.

For the cumulative v32 → v33 update, the first migration run must report one
migration (`014_change_stakeholders_attachments_ticket_prefixes.cjs`) and the
immediate repeat must report zero. Migration 014 assigns unique client ticket
prefixes, converts existing human-readable ticket numbers while preserving UUIDs
and relationships, clears obsolete user expiry values, and creates stakeholder
and change-attachment tables.

For the cumulative v33 → v34 update, the first migration run must report one
migration (`015_client_change_stakeholders_internal_locations.cjs`) and the
immediate repeat must report zero. Migration 015 is additive and preserves
existing tickets, changes, attachments and stakeholder history.

For the cumulative v34 → v35 update, the first migration run must report one
migration (`016_site_contacts_change_navigation.cjs`) and the immediate repeat
must report zero. Migration 016 adds optional site ownership to contacts and
missing internal routing defaults. Existing contacts remain organization-wide.

Default web binding is `127.0.0.1:3000`. Use internal DNS and an HTTPS reverse proxy
on WEB to forward to this address. Register
`https://HOST/api/auth/callback` as an Entra **Web** redirect URI. Add Microsoft
Graph **Application** permission `User.ReadBasic.All` and grant tenant administrator
consent. Then set the three `ENTRA_*` values and one approved first administrator's
Entra object ID. Never send
the client secret through chat or commit it. API and Redis publish no host ports.
API docs remain disabled unless explicitly enabled for LAB operators.

## Reusing a release

Set a unique `RELEASE_TAG`, build once, and store image digests with validation
results. Export/import with `docker save`/`docker load` or use an approved private
registry. Deploy these same images with `up --no-build`; change environment values,
secrets and databases for production. Full production acceptance is a later gate.
Compose restart policies restart exited processes; an unhealthy status alone does
not restart a process. Monitoring/operator intervention must address that condition.
