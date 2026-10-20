# Configuration

Copy `.env.example` to a protected `.env`. Compose reads it through `--env-file`.
Native developer commands read exported process environment; they do not silently
load `.env`. No secret is sent to a Next.js public environment variable.

| Variable                       | Consumer / purpose                                                  |
| ------------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`                 | API/worker PostgreSQL runtime role; required                        |
| `MIGRATION_DATABASE_URL`       | Migration service only; privileged owner connection                 |
| `REDIS_URL`                    | Native API/worker; Compose sets `redis://redis:6379` internally     |
| `APP_BASE_URL`                 | Canonical URL and CSRF origin; HTTPS required with production Entra |
| `API_INTERNAL_URL`             | Next.js server-only API/readiness upstream                          |
| `PORT`                         | Native API listener, default 3001; Compose uses 3001                |
| `NODE_ENV`                     | development/test/production; containers use production              |
| `ENABLE_API_DOCS`              | `true` to enable internal `/docs-json`, otherwise disabled          |
| `WEB_BIND_ADDRESS`, `WEB_PORT` | Published frontend; default 127.0.0.1:3000                          |
| `DB_BIND_ADDRESS`              | DB host private interface; default loopback                         |
| `POSTGRES_PASSWORD`            | Database bootstrap owner secret                                     |
| `APP_DB_PASSWORD`              | Runtime database role secret, first initialization only             |
| `RELEASE_TAG`                  | Version of built application images                                 |
| `ENTRA_CLIENT_ID`              | Entra application/client ID                                         |
| `ENTRA_CLIENT_SECRET`          | Entra app secret; API container only                                |
| `ENTRA_TENANT_ID`              | Exact permitted Entra tenant ID                                     |
| `INITIAL_ADMIN_OBJECT_IDS`     | Comma-separated Entra object IDs allowed for first admin            |
| `SESSION_TTL_SECONDS`          | Redis application-session lifetime; default 28800                   |
| `CHANGE_EMAIL_ENABLED`         | `true` enables queued Change email through Microsoft Graph          |
| `CHANGE_EMAIL_SENDER`          | Approved Microsoft 365 sender mailbox/UPN for Change communications |
| `E2E_BASE_URL`                 | Optional running frontend URL for Playwright                        |

API config rejects missing/malformed dependency URLs, invalid ports and unsupported
protocols before startup. Validation failures report field names without values.
Native developer URLs can use localhost; deployed DB URLs must use private routing.
All three `ENTRA_*` values must be present together or all blank. When blank,
`/auth/status` reports unconfigured and login stays closed while health checks work.
The same confidential-client settings are used server-side for the Microsoft Graph
`.default` token needed by directory-backed user provisioning. The Entra app must
have the `User.ReadBasic.All` application permission with administrator consent.
Change email is disabled by default. Enabling it additionally requires Microsoft
Graph application permission `Mail.Send`, tenant administrator consent, an approved
sender mailbox, and `CHANGE_EMAIL_SENDER`. Prefer an Exchange Online application
access policy or Application RBAC scope that restricts the app to that mailbox.
When the variable is blank, the LAB placeholder is
`changes@amnikontechnologies.com`; keep `CHANGE_EMAIL_ENABLED=false` until the real
shared mailbox and inbound reply processing are approved.

When enabled, OpenAPI JSON is served at `/docs-json`; Swagger UI is not installed.

`API_HOST` controls native API binding: `0.0.0.0` by default for containers, or
`127.0.0.1` for isolated local smoke checks. It is not a LAB server address.
