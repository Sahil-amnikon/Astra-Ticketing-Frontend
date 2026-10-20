# Validation gates

With Node 24 and real PostgreSQL/pgvector and Redis endpoints exported:

```sh
npm ci
npm run db:migrate
npm run db:migrate
npm run db:seed
npx playwright install --with-deps chromium
npm run verify
```

`verify` checks strict TypeScript, ESLint, formatting, unit/API tests, real database
integration, production builds, and Playwright. It stops on failure. Integration
tests never substitute an in-memory database and do not silently skip missing
configuration. Unit/API tests intentionally inject healthy/unhealthy dependency
probes; they prove HTTP behavior, not actual database connectivity.

The GitHub Actions workflow provides real services, repeats migrations, runs all
checks and builds both Docker images. It has not been executed merely because
it exists in the repository. On the actual two LAB hosts, also execute
`scripts/lab-check.sh`, validate restricted-role access, DB firewall isolation,
container restart recovery and backup/restore. Record results in validation.md.

Phase 1 unit tests cover closed authentication configuration, secure session-cookie
attributes, all-or-nothing Entra settings, Graph directory resolution and
client-scope calculation. Integration
tests require real PostgreSQL/Redis and verify schema version 5, all core/ticket
tables, runtime-role restrictions and immutable audit/history privileges. Playwright starts the
actual API and frontend, verifies the closed pre-Entra screen, confirms anonymous
core API access receives 401, and checks mobile overflow.

LAB acceptance must additionally use a real approved Entra identity to test first
admin login, rejected unprovisioned identity, ADMIN core-data access, USER client-A
access, direct client-B API denial, logout and expired/revoked sessions. These checks
cannot be replaced by a mock identity.

`npm run test:smoke` starts the compiled API, worker and standalone frontend,
checks real liveness 200 and readiness 503 against deliberately unavailable
dependencies, then stops them. It requires ports 3000–3002 to be free and a
completed production build. It proves failure handling, not healthy integration.

## V7 additions

Unit tests cover last-admin protection, rechecking concurrent editor permissions,
audit-failure rollback, invalid access DTOs, ownership/cycle rejection and session
version invalidation. They use controlled dependency doubles and do not prove SQL
execution or database locking. Browser administration tests intercept API responses
to exercise UI contracts, failed-save retention, identity invalidation, edit forms,
session expiry and responsive overflow. These fixtures exist only in test code;
there is no mock login endpoint in the application.

Run real Entra and PostgreSQL tests separately in an isolated validation database.
Test two simultaneous attempts to remove the two remaining administrators: only
one may succeed. Confirm role/membership and audit updates commit together. Exercise
list pagination and each record edit against PostgreSQL, including category cycles
and an asset referencing another client's site. Verify a deactivated user's old
cookie remains invalid after reactivation. Do not run data-changing test scenarios
against production. See phase1-v8.md for the upgrade and rollback sequence.

`ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v8-upgrade.cjs` requires an
empty disposable database and owner migration URL. It applies v5's migrations,
inserts clearly labelled probe data, applies v7, checks preservation/grants, and
repeats migration. It refuses an existing Amnikon schema. CI runs this before the
rest of verification. It has not been executed locally without PostgreSQL.

## Phase 2 v10 additions

Unit/API tests cover atomic numbered-ticket creation, transfer-reason enforcement,
explicit public/internal comment types, first-response recording, technician queue
scope enforcement and attachment allowlisting. Anonymous/forged-session checks
remain closed at the shared authentication layer.

Run `ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v10-upgrade.cjs` only
against an empty disposable database. It constructs the deployed v9 schema,
inserts preservation probes, applies migration 005, verifies schema version 5 and
history grants, then confirms a second migration applies zero changes.

LAB acceptance must create a real ticket for each of the five sources, verify
`INC-000001`-style numbering, assign and transfer with a reason, add an INTERNAL
note and PUBLIC reply, request/decide approval, upload/download an allowed file,
reject an executable/oversized file, resolve/reopen the ticket, and verify every
action in both ticket history and audit history. A TECHNICIAN must receive 403 when
directly requesting `scope=all`; ADMIN must see the complete queue.

## Phase 2 v11 SLA and reporting additions

Unit/API tests also cover SLA policy validation, optional recalculation of open
tickets, transaction-safe SLA audit logging, ticket/requester SLA hooks, mandatory
requester validation, and safe CSV/Excel-compatible export encoding.

Run `ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v11-upgrade.cjs` only
against an empty disposable database. It builds the deployed v10 schema, creates
a preservation ticket, applies migration 006, verifies four default policies and
the ticket SLA snapshot, checks application grants, and verifies repeatability.

LAB acceptance must edit each priority target, apply one change to open tickets,
verify dashboard counts/charts for an administrator and technician, create a
requester inline from New Ticket, confirm a ticket cannot be saved without one,
run week/month/custom-date reports, open both exported files, and confirm friendly
audit event names. V26 replaces the earlier continuous-elapsed-time limitation with
business-hour calendars, holidays, paused clocks and deduplicated in-app notification
jobs. External notification delivery and escalation chains remain unimplemented.

## Phase 2 v12 corrections

Run `ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v12-upgrade.cjs` only
against an empty disposable database. It builds the v11 schema, creates an
uncategorized preservation ticket, applies migration 007, verifies the
`General Support` assignment and NOT NULL constraint, and checks repeatability.

LAB acceptance must sign out from both Admin and Technician workspaces and confirm
the application returns to the common sign-in page. New Ticket must block save
until an active category is selected. Reports must support All technicians and an
individual technician for week, month and custom dates. The selected technician's
ticket-detail table, CSV and Excel-compatible export must agree on ticket number,
client, requester, category, current owner, resolution and SLA result. Tags remain
optional. AI is not included in v12.

## Phase 2 v13 workspace acceptance

V13 replaces the undeployed v12 candidate and includes all v12 checks above.

1. Sign in once with an Admin account. Confirm the selector offers Technician,
   Management and Administration and each Switch workspace action returns to it.
2. Confirm a Technician-only account opens Technician directly and cannot open
   `/management` or `/admin`.
3. Confirm Team Lead can open Technician and Management, can see the all-ticket
   queue, and cannot open Reports or Administration.
4. Confirm Manager can open Technician and Management, can generate individual
   reports, and can decide a pending approval, but cannot open Administration.
5. At a short desktop height and on mobile, scroll the left navigation to its last
   item and confirm Switch workspace remains reachable.
6. Sign out from every workspace and confirm the session returns to the common
   Microsoft sign-in page without a JSON body error.

## Phase 2 v14 UI acceptance

1. At 1920×1080, open Technician Dashboard and confirm Dashboard, New Ticket and
   My Tickets remain grouped at the top of the sidebar without large gaps.
2. Confirm all seven dashboard statistic cards have visible icons and form a
   balanced responsive grid.
3. At short desktop and mobile heights, confirm the navigation scrolls and Switch
   workspace remains reachable.
4. Open a ticket and switch between Internal note and Public reply. Confirm the
   staff-only/requester-visible explanations and delivery limitation are visible.

## Phase 2 v15 Management dashboard acceptance

1. Sign in with a Team Lead account that is not assigned the existing test ticket.
2. Open Management Dashboard and confirm its open/new totals, charts and Recently
   updated section include that ticket.
3. Open Management Tickets and confirm its all-ticket population agrees with the
   dashboard.
4. Open Technician Dashboard with the same account and confirm it still shows only
   tickets assigned to that account.

## Phase 2 v21 search acceptance

Run `ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v21-upgrade.cjs`
only against an empty disposable PostgreSQL database. It builds the v20 schema,
applies migration 011, verifies search indexes, saved-view grants, schema state
and repeatability.

1. Search by ticket number, subject word, description phrase, requester, client,
   technician, comment text and tag; confirm each finds the expected ticket.
2. Combine ordinary text with operators, for example `client:"Example Client"
status:open VPN`, and confirm every condition is applied.
3. Test status, priority, client, site, technician, category, source, tag, SLA and
   date filters individually and in combination.
4. Save a filter combination, reload the browser, apply it, then delete it.
5. Sign in as a different technician and confirm the first user's saved view is
   unavailable.
6. Confirm a technician cannot discover another client's ticket through text,
   comments, tags, operators, direct filter parameters or a saved view.

## Phase 2 v26 SLA-calendar and notification acceptance

Run `ALLOW_ISOLATED_MIGRATION_TEST=true node scripts/check-v26-upgrade.cjs`
only against an empty disposable PostgreSQL database. It builds the deployed v25
schema, applies migration 012, checks calendar/policy preservation, business-time
functions, notification grants and migration repeatability.

1. Open SLA Management and confirm the default calendar uses Asia/Kolkata,
   Monday-Friday and 09:00-18:00. Add a dated holiday and save it.
2. Select the calendar for one priority, choose **Apply to open tickets**, and
   confirm an open ticket receives business-hour response and resolution dates.
3. Change that ticket to Waiting for client and confirm its SLA becomes Paused.
   Return it to In progress and confirm its deadlines move by the remaining
   business minutes rather than by elapsed wall-clock time.
4. Assign and transfer a ticket between two LAB staff users. Confirm each intended
   recipient gets one notification and cannot open a ticket outside current
   client/site authorization.
5. Add a public reply as another user and confirm the assigned technician receives
   one notification. Internal notes must not generate a public-reply notification.
6. Temporarily use a short LAB-only SLA target to exercise At risk, Breached and
   Awaiting first response alerts. Confirm the worker does not create duplicates,
   then restore the approved policy values.
7. Disable one notification preference, repeat that event and confirm no new alert
   is created for that user. Re-enable the preference after the check.

## Phase 2 v28 visual and notification acceptance

1. At 1920×1080, open every Admin, Management and Technician navigation item.
   Confirm headings, controls, tables and footers remain within the viewport.
2. Confirm dashboard cards, real-data chart bars, ticket boards, popovers,
   editors and dialogs use short entry/interaction transitions without delaying
   any save, search or navigation operation.
3. At 390×844 and at a short desktop height, confirm the sidebar scrolls, the
   menu transition completes, tables remain horizontally accessible and forms
   collapse to one column.
4. Enable **Reduce motion** in the client operating system or browser emulation.
   Reload each workspace and confirm the same interface works without visible
   movement.
5. Click unread and read ticket notifications in Administration, Management and
   Technician workspaces. Each must open the matching ticket immediately, even
   if the read-state request is interrupted.
6. Click **Mark all read** and confirm the badge becomes zero, unread highlighting
   clears, a reload keeps the state, and no HTTP 400 appears in backend logs.
