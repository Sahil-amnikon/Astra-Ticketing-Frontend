# Amnikon Ticketing System — Phase 2

Latest LAB candidate: [Phase 2 v38 release guidance](docs/phase2-v38.md).

Internal MSP service desk. This repository extends the LAB-validated v9 identity
and administration baseline with the **Phase 2 ticket engine** and focused
Technician, Management and Administration workspaces. It supports controlled ticket intake, assignment,
transfer, work notes, requester-visible replies, approvals, attachments,
priority SLA targets, individual technician reports and operational dashboards.
It is a LAB-validation candidate, not a production release. See
`docs/validation.md` for exact evidence and remaining gates.

## Structure

| Directory                      | Responsibility                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| `apps/web`                     | Next.js role-based workspaces, API gateway, React and Tailwind |
| `apps/api`                     | NestJS API, Entra sessions, RBAC, core data and ticket engine  |
| `packages/database/migrations` | Knex PostgreSQL migrations                                     |
| `infra`                        | Separate WEB and DB Compose deployments and image builds       |
| `scripts`                      | Migration, seed and LAB acceptance commands                    |
| `tests/e2e`                    | Playwright identity-closure and responsive checks              |
| `docs`                         | Architecture, deployment, security and operational guidance    |

## Start here

For the Phase 2 v14 → v15 Management dashboard correction, read `docs/phase2-v15.md` first. It includes
the migration requirement, workflow scope, upgrade precautions and rollback.
`docs/roadmap.md` records what remains deliberately deferred.

1. Read `docs/deployment.md` and configure the two LAB hosts.
2. Provide the approved internal HTTPS URL and Entra app registration.
3. Apply migration 007 from WEB, then rebuild/start the services.
4. Complete ticket, SLA, reporting, authorization and attachment checks in `docs/testing.md`.

Node 24 is needed only for development/CI. LAB hosts run Docker services; host npm
installation is unnecessary. Dependencies are locked in `package-lock.json`.
No hard-coded LAB address, identity-provider credential or real user exists.
There is no local password, mock login or authentication bypass.
