# Phase 2 v10 LAB release candidate

This release upgrades the deployed Phase 1 v9 baseline to schema version 5. It is
staged and validated separately before replacing the running LAB containers.

## Included

- Sequential `INC-000001` ticket numbering with UUID record identity.
- Sources limited to Missive, Microsoft Teams, Phone Call, SMS and Email.
- Client/requester validation, optional site/category, priority and tags.
- Technician Dashboard, New Ticket, My Tickets and ticket workspace.
- Admin all-ticket dashboard, oversight and approval decisions.
- Assignment and reasoned transfer history.
- Explicit PUBLIC replies and staff-only INTERNAL notes.
- Status/priority/category changes, resolution/close timestamps and reopen support.
- Authorized 5 MB attachment upload/download with type allowlist and SHA-256.
- Transactional ticket history plus global audit history.
- Client self-service disabled; Assets and Knowledge Base absent from active nav.

## Deliberately deferred

SLA timers/calendars, notification jobs, advanced search, reporting/export, Change
Management, email/Teams/Missive automation and client/user self-service are not
claimed by this release.

## Upgrade sequence

1. Keep v9 running and verify the release SHA-256.
2. Back up the v9 application folder and PostgreSQL database.
3. Extract v10 into a separate folder and copy the protected v9 `.env`.
4. Set a unique `RELEASE_TAG`, for example `phase2-v10-lab-20260915`.
5. Build backend/frontend images without stopping v9.
6. Run the migration tool once; expect `count: 1`.
7. Run it again; expect `count: 0`.
8. Recreate backend, worker and frontend using the v10 images.
9. Confirm all four services are healthy, landing is HTTP 200 and Entra login is 302.
10. Execute the Phase 2 LAB acceptance workflow in `docs/testing.md`.

Migration 005 is additive. Rollback after application deployment should normally
restore the database backup and v9 folder/images together; do not run a down
migration against a database containing tickets that must be retained.
