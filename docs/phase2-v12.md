# Phase 2 v12 LAB release candidate

V12 is a cumulative correction to the deployed Phase 2 v11 baseline. It upgrades
the database from schema version 6 to 7 and does not add AI, external integrations,
credentials or new ticket sources.

## Included

- Correct sign-out requests in Admin and Technician workspaces. Empty POST requests
  no longer advertise a JSON body, so Fastify can revoke the session normally.
- All-technician or individual-technician reporting for weekly, monthly and custom
  date ranges.
- Individual reports include ticket-level client, requester, category, priority,
  status, current owner, resolution and SLA information.
- CSV and Excel-compatible exports include the selected technician and detailed
  ticket records. User-controlled spreadsheet values are neutralized.
- Category is mandatory for every new ticket in both the API and interface.
- Migration 007 creates or reactivates the root `General Support` category, assigns
  it to existing uncategorized tickets, and then enforces the database constraint.
- Category selectors display parent and child context, for example
  `Microsoft 365 → Outlook`. Tags remain optional.

## Safe LAB update

1. Keep v11 running and verify the v12 ZIP checksum.
2. Back up the v11 application folder and PostgreSQL database.
3. Extract v12 to a new folder and copy the protected v11 `.env`.
4. Set a new `RELEASE_TAG`, for example `phase2-v12-lab-20260916`.
5. Build backend and frontend images while v11 remains live.
6. Run the migration tool once (expected count `1`) and again (expected count `0`).
7. Recreate backend, worker and frontend and verify all health checks.
8. Complete the v12 LAB checks in `docs/testing.md`.

Keep the pre-v12 database backup until sign-out, mandatory category creation,
individual reporting and both export formats pass LAB acceptance.
