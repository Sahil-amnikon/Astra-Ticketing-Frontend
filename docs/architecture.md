# Architecture

A modular monolith: Next.js frontend, NestJS API with the Fastify HTTP adapter and a separate worker process
from the API image. PostgreSQL lives on the separate DB host. Redis lives on WEB.
The worker exposes liveness/readiness and runs the deduplicated in-app SLA and
unattended-ticket notification scan every 30 seconds. External-channel notifications
remain deferred rather than being simulated.

Users connect through a private HTTPS reverse proxy to WEB. Only the frontend
publishes a host port. Its same-origin `/api/*` route forwards a restricted set of
headers and methods to the unexposed backend; it is not a general proxy. Entra
callbacks, opaque cookies and core-data requests therefore stay on one browser
origin. Database connections go from API/worker to DB's private address.

Knex is the chosen PostgreSQL migration/query solution permitted by the brief.
It gives transactional, ordered migrations and parameterized queries. Phase 2
keeps ticket operations inside the modular monolith; no extra service was
introduced. pg_trgm supports indexed ticket-number/subject groundwork. The
operator-friendly Phase 3 search syntax and AI remain absent.

WEB runtime caps total roughly 2.2 GiB for frontend/API/worker/Redis, leaving room
for Docker/OS. Builds may require more memory: build in CI or on a workstation,
then transport the same tagged images to LAB and production. Increase Compose
memory limits when increasing RAM; no topology redesign is required.

Database images are version-tagged; capture image digests with each validated
release before production. PostgreSQL 16 + pgvector 0.8.2 and Redis 7.4.9 image
tags were checked against the official publisher listings during implementation.

Ticket mutations use database transactions so the ticket row, assignment or
comment, immutable ticket history and global audit event commit or roll back
together. The API distinguishes PUBLIC replies and INTERNAL notes. No client
portal routes can retrieve tickets in this release. Attachment bytes are stored
in PostgreSQL for this initial LAB phase, behind the same authenticated ticket
authorization boundary; metadata includes size and SHA-256. A later storage
adapter migration can move bytes to approved object storage without changing
ticket or attachment identities.

The active UI has three role-gated workspaces: `/operations` for technician work,
`/management` for team oversight and `/admin` for configuration. The application
includes ticket search, saved views, reports, business-calendar SLA tracking and
in-app notifications. Client self-service, Change Management, external-channel
delivery and AI remain later controlled phases.
