# V39 local validation - 24 September 2026

TypeScript, ESLint, Prettier, API unit tests (67 passing), production build,
and the isolated 19-migration database regression passed. The database
regression includes automatic email intake, reply threading, duplicate
messages, sender authentication, contact ambiguity and internal-only
recipients. Live PostgreSQL/Redis integration needs configured LAB services.
Playwright browser tests could not run locally because the browser binary is
not installed; sidebar navigation and Microsoft 365 mailbox delivery remain
LAB acceptance checks.

---

# V9 validation — 15 September 2026

V9 adds a browser portal-role redirect to the v8 source state. It has no database
migration. Source validation is repeated before packaging; LAB validation requires
an approved USER identity and an approved staff identity in addition to ADMIN.

---

# V8 validation — 15 September 2026

V8 source validation passed: strict TypeScript, ESLint, formatting, 28 API/unit
tests and API plus Next.js production builds. The new tests cover typed deletion
confirmation, deletion audit ordering, final-admin protection and internal-only
post-login destinations. A real v7 → v8 database migration, portal sign-in and
browser deletion flow remain LAB gates.

---

# V7 validation — 15 September 2026

This section supersedes prior local validation statements for v7. Historical LAB
acceptance below describes earlier releases only. V7 has not been deployed to LAB.

| Check                                                                | V7 result                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| TypeScript                                                           | Passed                                                                                  |
| ESLint and formatting                                                | Passed                                                                                  |
| Unit/service/API checks with test doubles                            | 26 passed, 0 failed; controlled service dependencies plus real anonymous HTTP           |
| API and Next.js production builds                                    | Passed                                                                                  |
| Actual process startup / liveness / unavailable-dependency readiness | Passed: health 200, expected readiness 503 on all 3 processes; anonymous core route 401 |
| PostgreSQL integration                                               | Blocked: no PostgreSQL service; ECONNREFUSED on 127.0.0.1:5432                          |
| Schema 2 → 3 upgrade and clean schema 3 migration                    | Not executed; requires isolated PostgreSQL/pgvector                                     |
| Redis healthy readiness                                              | Not executed; Redis unavailable                                                         |
| Browser flows and 1920×1080/mobile visual inspection                 | Blocked: Chromium missing; download returned gateway 502                                |
| Docker image builds                                                  | Not executed; Docker unavailable                                                        |
| Live Entra/Graph permission, lookup and multi-user login             | LAB gate, not executed here                                                             |
| Concurrent last-admin database race                                  | LAB/CI gate; unit control-flow tests only                                               |

No full Phase 1 acceptance or production readiness is claimed. The release remains
a validation candidate until these gates pass. `npm run verify` intentionally
fails when required dependencies or browsers are unavailable.

---

## Historical evidence (v5/v6, not v7)

# Validation record — 14 September 2026

## Phase 0 LAB acceptance

Phase 0 was deployed to the two LAB hosts and accepted before Phase 1 started.
Operator-supplied evidence recorded:

| Check                                     | Result                            |
| ----------------------------------------- | --------------------------------- |
| PostgreSQL 16 + pgvector on TKTdb         | Healthy                           |
| WEB-to-DB private connectivity            | Passed                            |
| Windows-to-DB TCP 5432                    | Blocked                           |
| Backend/frontend image builds             | Passed                            |
| Foundation migration repeatability        | Applied 1, then applied 0         |
| Frontend, backend, worker and Redis       | Healthy                           |
| Health/readiness and Redis                | HTTP 200 and PONG                 |
| Browser setup page                        | Opened on LAB                     |
| Runtime schema-modification attempt       | Denied as expected                |
| Backup and isolated restore               | Passed; restored schema version 1 |
| Application and database restart recovery | Passed                            |

The user explicitly approved Phase 1 after these checks.

## Phase 1 implementation status

Phase 1 code implements Entra authentication, Microsoft Graph-backed user lookup,
users, roles, clients, contacts, sites, assets, categories, tags, client membership,
RBAC and an audit foundation. No local-password or mock-login bypass exists. Tickets
remain out of scope.

Local workspace evidence:

| Check                                          | Result                                      |
| ---------------------------------------------- | ------------------------------------------- |
| Strict API and frontend TypeScript             | Passed                                      |
| ESLint                                         | Passed                                      |
| Unit/API/security-scope tests                  | 14 passed, 0 failed, 0 skipped              |
| API compilation                                | Passed                                      |
| Next.js production build                       | Passed                                      |
| Migration JavaScript syntax                    | Passed                                      |
| Real schema-v2 migration                       | Passed; applied 1, then applied 0           |
| Real Entra authorization-code flow             | Passed for first administrator              |
| Database-backed ADMIN after bootstrap disabled | Passed                                      |
| Authenticated multi-user/client isolation      | Pending additional real Entra identities    |
| Microsoft Graph user lookup                    | Pending permission grant and LAB validation |
| Phase 1 Docker rebuild/restart                 | Passed; all services healthy                |
| Phase 1 backup/restore                         | Pending after schema-v2 migration           |

Operator-supplied LAB evidence confirms HTTPS, schema-v2 migration repeatability,
healthy containers, first-admin creation and successful sign-in after the bootstrap
allowlist was cleared. Integration, Graph provisioning, multi-user authorization,
Docker and Playwright checks still must be completed as described in
`docs/testing.md`.

## Phase 1 acceptance gates

1. Grant Microsoft Graph application permission `User.ReadBasic.All` with admin consent.
2. Deploy the directory-backed user-provisioning update and validate an exact lookup.
3. Provision test ADMIN, staff, Client A user and Client B user identities.
4. Validate rejection of an unprovisioned identity.
5. Prove client data isolation using direct API requests, not only the UI.
6. Verify logout/session revocation, CSRF rejection and immutable audit permissions.
7. Back up and restore schema version 2 into an isolated validation database.

Do not start Phase 2 until every gate passes and the user explicitly approves it.

## Phase 1 v9 LAB evidence — 15 September 2026

Operator evidence confirms migration repeatability through schema version 4,
healthy frontend/backend/worker/Redis containers, HTTPS landing 200, Entra redirect
302, existing ADMIN login, Azure directory lookup, administration screens and
typed controlled deletion. The user explicitly approved Phase 2 after validating
the v9 portal routing and deletion workflow. Multi-identity direct client-isolation
evidence remains a pre-production gate; the client portal is disabled in v10.

## Phase 2 v10 local implementation evidence

| Check                              | Result                         |
| ---------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript | Passed                         |
| ESLint                             | Passed                         |
| Prettier check                     | Passed                         |
| Unit/API/security tests            | 34 passed, 0 failed, 0 skipped |
| API compilation                    | Passed                         |
| Next.js production build           | Passed with webpack            |
| Migration JavaScript syntax        | Passed                         |
| Real v9 → v10 PostgreSQL migration | Pending isolated/LAB database  |
| Real Redis/PostgreSQL integration  | Pending services               |
| Chromium/1920×1080 workflow        | Pending browser runtime        |
| Entra technician/admin workflows   | Pending LAB identities         |

The local workspace did not have PostgreSQL, Redis or a Chromium executable. These
checks are explicitly pending and must not be inferred from compilation or unit
tests. V10 is a LAB-validation candidate, not production acceptance.

## Phase 2 v11 local implementation evidence

V11 adds schema migration 006, priority SLA snapshots, manual administrator SLA
controls, role-scoped live dashboards, historical technician reports and exports,
mandatory requester search/creation, a common Entra sign-in, and readable audit
labels.

| Check                                     | Result                         |
| ----------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript        | Passed                         |
| ESLint and Prettier                       | Passed                         |
| Unit/API/security tests                   | 38 passed, 0 failed, 0 skipped |
| API compilation                           | Passed                         |
| Next.js production build                  | Passed with webpack            |
| Migration and upgrade-script syntax       | Passed                         |
| Real v10 → v11 PostgreSQL migration       | Pending isolated/LAB database  |
| Live Entra admin/technician workflows     | Pending LAB identities         |
| 1920×1080 rendered workflow and export QA | Pending LAB browser            |

V11 is a LAB-validation candidate, not production acceptance.

## Phase 2 v12 local implementation evidence

V12 corrects empty-body sign-out requests, adds server-filtered individual
technician reports with detailed exports, and requires a category for every new
ticket. Migration 007 preserves older uncategorized tickets through the
`General Support` fallback. AI remains excluded.

| Check                                    | Result                         |
| ---------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript       | Passed                         |
| ESLint and Prettier                      | Passed                         |
| Unit/API/security tests                  | 40 passed, 0 failed, 0 skipped |
| API compilation                          | Passed                         |
| Next.js production build                 | Passed with webpack            |
| Migration and upgrade-script syntax      | Passed                         |
| Real v11 → v12 PostgreSQL migration      | Pending isolated/LAB database  |
| Live Entra sign-out and report workflows | Pending LAB identities         |
| CSV/Excel rendering and browser workflow | Pending LAB browser            |

This workspace has no Docker engine, PostgreSQL service or Chromium executable,
so database migration execution and rendered browser acceptance remain explicit
LAB gates. V12 is a LAB-validation candidate, not production acceptance.

## Phase 2 v13 local implementation evidence

V13 is cumulative from v12. It adds the common role-authorized workspace selector,
a Management workspace, secure route fallback, and scrolling navigation while
preserving the v12 migration and corrections.

| Check                                    | Result                         |
| ---------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript       | Passed                         |
| ESLint and Prettier                      | Passed                         |
| Unit/API/security tests                  | 41 passed, 0 failed, 0 skipped |
| API compilation                          | Passed                         |
| Next.js production build                 | Passed with webpack            |
| Migration and upgrade-script syntax      | Passed                         |
| Real v11 → v13 PostgreSQL migration      | Pending isolated/LAB database  |
| Live Entra role/workspace workflows      | Pending LAB identities         |
| Short-height/mobile navigation rendering | Pending LAB browser            |

V13 remains a LAB-validation candidate until the deployment and browser acceptance
checks pass.

## Phase 2 v14 local implementation evidence

V14 corrects sidebar grid stretching, dashboard statistic layout/icons and the
clarity of internal versus requester-visible ticket replies. It has no migration.

| Check                                | Result                         |
| ------------------------------------ | ------------------------------ |
| Strict API and frontend TypeScript   | Passed                         |
| ESLint and Prettier                  | Passed                         |
| Unit/API/security tests              | 41 passed, 0 failed, 0 skipped |
| Next.js production build             | Passed with webpack            |
| Migration syntax                     | Unchanged from validated v13   |
| 1920×1080 and mobile rendered layout | Pending LAB browser            |

V14 remains a LAB-validation candidate until browser acceptance passes.

## Phase 2 v15 local implementation evidence

V15 aligns Team Lead Management dashboard scope with the all-ticket Management
queue while preserving personal Technician scope and Manager/Admin-only actions.

| Check                              | Result                         |
| ---------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript | Passed                         |
| ESLint and Prettier                | Passed                         |
| Unit/API/security tests            | 42 passed, 0 failed, 0 skipped |
| Team Lead dashboard scope test     | Passed                         |
| Next.js production build           | Passed with webpack            |
| Database migration                 | None                           |
| Live Management dashboard          | Pending LAB browser            |

## Phase 2 v21 local implementation evidence

V21 adds PostgreSQL-backed full-ticket search, combined search operators,
advanced filters and user-isolated saved views. It preserves all existing
client, site, ownership and role authorization clauses.

| Check                                      | Result                         |
| ------------------------------------------ | ------------------------------ |
| Strict API and frontend TypeScript         | Passed                         |
| ESLint and Prettier                        | Passed                         |
| Unit/API/security tests                    | 51 passed, 0 failed, 0 skipped |
| Search authorization and operator tests    | Passed                         |
| Saved-view ownership and validation tests  | Passed                         |
| Next.js production build                   | Passed with webpack            |
| Migration syntax                           | Passed                         |
| Real v20 → v21 PostgreSQL migration        | Pending LAB database           |
| Search performance and browser workflow QA | Pending LAB                    |

## Phase 2 v22 local implementation evidence

V22 combines the selected split-list and visual-board interface directions,
removes duplicate ticket-creation navigation and changes filter refreshes to a
non-blocking, cancellable flow with a 15-second timeout. Ticket authorization and
the database schema are unchanged from v21.

| Check                                      | Result                         |
| ------------------------------------------ | ------------------------------ |
| Strict API and frontend TypeScript         | Passed                         |
| ESLint and Prettier                        | Passed                         |
| Unit/API/security tests                    | 51 passed, 0 failed, 0 skipped |
| API and Next.js production builds          | Passed                         |
| Database migration                         | None                           |
| Rendered List/Board and timeout workflow   | Pending LAB browser            |
| Live search performance with production DB | Pending LAB                    |

## Phase 2 v23 local implementation evidence

V23 corrects the Site Team Tickets optional-site scope. Assigned clients remain
mandatory; explicit site assignments restrict the queue, while an empty site
assignment grants team visibility across the technician's assigned clients.
Ticket detail and attachment reads use the same rule. The schema is unchanged.

| Check                                    | Result                         |
| ---------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript       | Passed                         |
| ESLint and Prettier                      | Passed                         |
| Unit/API/security tests                  | 52 passed, 0 failed, 0 skipped |
| Explicit-site and client-wide team scope | Passed                         |
| Team ticket detail and attachment scope  | Passed                         |
| API and Next.js production builds        | Passed                         |
| Database migration                       | None                           |
| Multi-user Site Team Tickets workflow    | Pending LAB identities/browser |

## Phase 2 v24 local implementation evidence

V24 changes Site Team Tickets from an other-technician queue into the complete
shared queue for the technician's authorized client/site scope. My Tickets
remains the personal subset. Client/site authorization and the database schema
are unchanged.

| Check                                      | Result                         |
| ------------------------------------------ | ------------------------------ |
| Strict API and frontend TypeScript         | Passed                         |
| ESLint and Prettier                        | Passed                         |
| Unit/API/security tests                    | 52 passed, 0 failed, 0 skipped |
| Shared queue client/site enforcement       | Passed                         |
| Own, other-technician and unassigned scope | Passed                         |
| API and Next.js production builds          | Passed                         |
| Database migration                         | None                           |
| Multi-user Site Team Tickets workflow      | Pending LAB identities/browser |

## Phase 2 v25 local implementation evidence

V25 replaces the boxed-letter brand mark with a reusable geometric SVG while
retaining the selected blue theme and all v24 ticket, priority, SLA and
authorization behavior. The database schema is unchanged.

| Check                                | Result                         |
| ------------------------------------ | ------------------------------ |
| Strict API and frontend TypeScript   | Passed                         |
| ESLint and Prettier                  | Passed                         |
| Unit/API/security tests              | 52 passed, 0 failed, 0 skipped |
| API and Next.js production builds    | Passed                         |
| Sign-in and all workspace logo usage | Passed source/build validation |
| Database migration                   | None                           |
| Rendered LAB logo inspection         | Pending LAB browser            |

## Phase 2 v26 local implementation evidence

V26 adds schema version 12, business-hour SLA calendars, holidays, automatic
pause/resume, in-app notifications, preferences and the first-response dashboard
alert. External delivery remains deferred.

| Check                                             | Result                          |
| ------------------------------------------------- | ------------------------------- |
| Strict API and frontend TypeScript                | Passed                          |
| ESLint and Prettier                               | Passed                          |
| Unit/API/security tests                           | 57 passed, 0 failed, 0 skipped  |
| Pause/resume and calendar-aware recalculation     | Passed with controlled DB tests |
| Notification isolation, preferences and dedupe    | Passed with controlled DB tests |
| API and Next.js production builds                 | Passed                          |
| Migration JavaScript syntax                       | Passed                          |
| Real schema 11 → 12 PostgreSQL migration          | Pending LAB database            |
| Worker timing and rendered notification/SLA flows | Pending LAB                     |

## Phase 2 v27 local implementation evidence

V27 corrects ticket navigation from the notification centre without changing
the database schema or notification authorization rules.

| Check                                           | Result                         |
| ----------------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript              | Passed                         |
| ESLint and Prettier                             | Passed                         |
| Unit/API/security tests                         | 57 passed, 0 failed, 0 skipped |
| Notification navigation with failed read update | Browser contract test added    |
| API and Next.js production builds               | Passed                         |
| Database migration                              | None                           |
| Browser contract and rendered workspace routes  | Pending LAB Chromium/browser   |

## Phase 2 v28 local implementation evidence

V28 applies the shared modern visual and motion system to the complete interface
and includes v27's notification-navigation correction. The schema remains at 12.

| Check                                         | Result                     |
| --------------------------------------------- | -------------------------- |
| Strict API and frontend TypeScript            | Passed                     |
| ESLint and Prettier                           | Passed                     |
| Unit/API/security tests                       | 57 passed, 0 failed        |
| API and Next.js production builds             | Passed                     |
| Notification and reduced-motion browser tests | Added; pending LAB browser |
| Database migration                            | None                       |
| Rendered desktop/mobile visual inspection     | Pending LAB browser        |

## Phase 2 v29 local implementation evidence

V29 corrects empty-body notification read requests and retains all v28 behavior.
The database schema remains unchanged.

| Check                                     | Result                     |
| ----------------------------------------- | -------------------------- |
| Strict API and frontend TypeScript        | Passed                     |
| ESLint and Prettier                       | Passed                     |
| Unit/API/security tests                   | 57 passed, 0 failed        |
| API and Next.js production builds         | Passed                     |
| Empty-body and mark-all browser contracts | Added; pending LAB browser |
| Database migration                        | None                       |

## Phase 2 v30 local implementation evidence

V30 introduces the cumulative Amnikon service-desk interface and includes the
v29 notification read-state correction. Ticket data and database schema 12 are
unchanged.

| Check                                           | Result                      |
| ----------------------------------------------- | --------------------------- |
| Strict API and frontend TypeScript              | Passed                      |
| ESLint and Prettier                             | Passed                      |
| Unit/API/security tests                         | 57 passed, 0 failed         |
| API and Next.js production builds               | Passed                      |
| Shared SVG navigation and responsive CSS        | Passed source/build checks  |
| Notification empty-body and navigation behavior | Existing contracts retained |
| Database migration                              | None                        |
| Rendered desktop/mobile visual acceptance       | Pending LAB browser         |

## Phase 2 v31 local implementation evidence

V31 replaces manual permission selection with fixed staff role profiles while
retaining the existing client/site security scope and database schema 12.

| Check                                      | Result                       |
| ------------------------------------------ | ---------------------------- |
| Strict API and frontend TypeScript         | Passed                       |
| ESLint and Prettier                        | Passed                       |
| Unit/API/security tests                    | 58 passed, 0 failed          |
| Role-derived permission enforcement        | Passed                       |
| Custom submitted permission ignored        | Passed                       |
| API and Next.js production builds          | Passed                       |
| Database migration                         | None                         |
| Entra user-edit workflow and visual review | Pending LAB identity/browser |

## Phase 2 v32 local implementation evidence

V32 adds schema 13, internal staff/intern controls, cross-team help and a
controlled Change Management workflow. Existing ticket and client records are
not rewritten by the migration.

| Check                                               | Result                                   |
| --------------------------------------------------- | ---------------------------------------- |
| Strict API and frontend TypeScript                  | Passed                                   |
| ESLint and Prettier                                 | Passed                                   |
| Unit/API/security tests                             | 61 passed, 0 failed                      |
| Intern/change access and approval security controls | Passed with controlled DB tests          |
| API and Next.js production builds                   | Passed                                   |
| Migration and guarded upgrade-script syntax         | Passed                                   |
| Real schema 12 → 13 PostgreSQL migration            | Pending LAB database                     |
| Entra multi-role and rendered workflow acceptance   | Pending LAB identities/browser           |
| Optional Graph mail delivery                        | Disabled; pending approval/configuration |

The local workspace has no Docker engine or PostgreSQL service, so real
migration execution remains a mandatory LAB gate. V32 is a LAB-validation
candidate, not production acceptance.

## Phase 2 v33 local implementation evidence

V33 adds schema 14, client-specific ticket numbers, multiple internal and
external change stakeholders, change evidence, department leads, and removes the
obsolete internal-user expiry control.

| Check                                               | Result                         |
| --------------------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript                  | Passed                         |
| ESLint and Prettier                                 | Passed                         |
| Unit/API/security tests                             | 63 passed, 0 failed            |
| Stakeholder and attachment authorization tests      | Passed                         |
| Client-specific numbering transaction test          | Passed                         |
| Migration and guarded upgrade-script syntax         | Passed                         |
| API and Next.js production builds                   | Passed                         |
| Real schema 13 → 14 PostgreSQL migration            | Pending LAB database           |
| Rendered stakeholder/department workflow acceptance | Pending LAB identities/browser |

The local workspace has no Docker engine or PostgreSQL service, so real
migration execution remains a mandatory LAB gate. V33 is a LAB-validation
candidate, not production acceptance.

## Phase 2 v34 local implementation evidence

V34 makes selected change stakeholders client contacts, filters dependent sites,
adds internal ticket location/project text and explains internal departments.

| Check                                         | Result                         |
| --------------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript            | Passed                         |
| ESLint and Prettier                           | Passed                         |
| Unit/API/security tests                       | 64 passed, 0 failed            |
| Contact/client stakeholder authorization test | Passed                         |
| Site/client authorization enforcement         | Passed                         |
| Migration and guarded upgrade-script syntax   | Passed                         |
| API and Next.js production builds             | Passed                         |
| Real schema 14 → 15 PostgreSQL migration      | Pending LAB database           |
| Rendered intake workflow acceptance           | Pending LAB identities/browser |

The local workspace has no PostgreSQL service, so real migration execution
remains a mandatory LAB gate. V34 is a LAB-validation candidate, not production
acceptance.

## Phase 2 v35 local implementation evidence

V35 integrates Change Management into normal portal navigation, moves optional
department/expertise assignment into Users & Access, adds site-linked client
contacts and inline stakeholder contact creation, and defines the disabled Change
mailbox placeholder.

| Check                                               | Result                         |
| --------------------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript                  | Passed                         |
| ESLint and Prettier                                 | Passed                         |
| Unit/API/security tests                             | 65 passed, 0 failed            |
| Site/contact and stakeholder authorization tests    | Passed                         |
| API and Next.js production builds                   | Passed                         |
| Migration and guarded upgrade-script syntax         | Passed                         |
| Real schema 15 → 16 PostgreSQL migration            | Pending LAB database           |
| Rendered access/navigation and contact intake flows | Pending LAB identities/browser |

The local workspace has no PostgreSQL service, so real migration execution
remains a mandatory LAB gate. V35 is a LAB-validation candidate, not production
acceptance.

## Phase 2 v36 local implementation evidence

V36 uses consistent portal navigation for Change Management and assigns stable
accent colours to all sidebar module icons. It includes every v35 data and access
change and adds no new schema migration.

| Check                                          | Result                         |
| ---------------------------------------------- | ------------------------------ |
| Strict API and frontend TypeScript             | Passed                         |
| ESLint and Prettier                            | Passed                         |
| Unit/API/security tests                        | 65 passed, 0 failed            |
| API and Next.js production builds              | Passed                         |
| Role-dependent Change navigation source checks | Passed                         |
| Rendered desktop/mobile navigation acceptance  | Pending LAB identities/browser |

V36 is a LAB-validation candidate. A direct v34 upgrade must still apply
migration 016; a LAB already migrated with v35 will apply zero migrations.

## Phase 2 v37 local implementation evidence

V37 replaces the expanded stakeholder cards with an explicit compact selector,
excludes internal staff contacts at the API boundary and makes contact removal
safe for retained ticket and change history. It adds no schema migration.

| Check                                                   | Result              |
| ------------------------------------------------------- | ------------------- |
| Strict API and frontend TypeScript                      | Passed              |
| Internal staff stakeholder selection enforcement        | Passed              |
| Unused contact deletion and linked contact deactivation | Passed              |
| Unit/API/security tests                                 | 67 passed, 0 failed |
| Rendered stakeholder and contact-removal LAB acceptance | Pending LAB browser |

V37 is a LAB-validation candidate. A LAB already on schema 16 applies zero
migrations.
