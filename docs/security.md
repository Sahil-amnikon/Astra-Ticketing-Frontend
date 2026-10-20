# Security boundary

Implemented: strict configuration validation, API validation pipe, generic errors
with correlation IDs, Helmet headers, selected frontend headers, no secret values
in structured logs, non-root application containers, API/worker read-only root
filesystems and dropped capabilities, separate DB runtime credentials, no published
Redis/API ports, private-interface DB binding and disabled API documentation default.
Phase 1 adds single-tenant Entra OIDC with PKCE/state/nonce, signature and claim
validation, Redis opaque sessions, secure/HTTP-only/SameSite cookies, CSRF origin
and token checks, API-layer RBAC, client-membership filtering and immutable audits.

Core mutation routes require ADMIN. Staff roles can read core data needed for MSP
work; USER accounts are restricted to assigned client IDs by service-layer query
parameters. The API never accepts a tenant ID for user provisioning. The configured
tenant is authoritative. First-admin provisioning is restricted to an object-ID
allowlist and only an empty user table.

Administrators locate new users by exact work email/UPN. Microsoft Graph supplies
the immutable object ID and basic profile, and the API performs a second Graph read
by object ID before the database transaction. Browser-supplied display names and
email addresses are never trusted for identity provisioning. Directory reads use
the least-privilege `User.ReadBasic.All` application permission; broader directory
permissions are not required.

Phase 2 ticket routes require a current staff role at the service layer. TECHNICIAN
cannot expand the My Tickets list to `scope=all`; TEAM_LEAD, MANAGER and ADMIN may
use wider operational queues. Ticket mutations require the same origin plus the
session CSRF token. Internal notes and public replies have explicit database types,
and no client/user ticket API is exposed in v10.

V12 report endpoints remain restricted to MANAGER or ADMIN and validate any
selected technician identifier against staff records. CSV values that spreadsheet
software could interpret as formulas are neutralized. Sign-out POST requests carry
the CSRF token without declaring an empty JSON body, allowing server-side session
revocation and cookie clearing to complete.

Attachment upload validates filename, allowlisted media type, strict Base64 content
and decoded size (maximum 5 MB). Downloads re-run ticket staff authorization and
force `Content-Disposition: attachment` plus `nosniff`. Attachment bytes are not
executed or served from a public filesystem path. Ticket history and audit rows can
be inserted but not updated/deleted by the runtime database role.

Real Entra authentication, direct API authorization and attachment workflow tests
are still required in LAB. Never expose this as a production ticket system before
those acceptance gates pass.

Redis has no password in this baseline because it is confined to the dedicated
Compose network with no host port. Do not attach untrusted containers to that
network. TLS for cross-host database traffic must be configured for production;
private LAB routing is not a substitute for production transport security.
PostgreSQL owner credentials never belong in backend/worker DATABASE_URL.

NestJS uses its Fastify adapter. Phase 2 uses bounded JSON attachment payloads and
does not install the Express adapter or a multipart dependency.
