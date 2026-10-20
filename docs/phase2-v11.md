# Phase 2 v11 LAB release candidate

V11 is a cumulative update from the deployed, healthy Phase 2 v10 baseline. It
upgrades the database from schema version 5 to 6 and does not alter Entra secrets,
bootstrap settings or existing ticket/audit records.

## Included

- One Microsoft sign-in page; the current database role selects Technician or Admin.
- Mandatory requester search by name/email, with controlled inline contact creation.
- Editable P1–P4 first-response and resolution targets, warning percentage and active state.
- Optional administrator recalculation of SLA deadlines for currently open tickets.
- Live role-scoped status, priority, source, trend, workload and SLA dashboard statistics.
- Weekly, monthly and custom-date technician activity reports from assignment/history data.
- CSV and Excel-compatible `.xls` exports.
- Clear category guidance and readable audit event labels.

SLA clocks use continuous elapsed minutes. Business calendars, holidays, paused
states, escalations and notification jobs are deliberately not represented as
implemented. Change Management remains the separate Phase 2B increment.

## Safe LAB update

1. Keep v10 running and verify the v11 ZIP checksum.
2. Back up the v10 application folder and PostgreSQL database.
3. Extract v11 to a new folder and copy the protected v10 `.env`.
4. Set a new `RELEASE_TAG`, for example `phase2-v11-lab-20260916`.
5. Build backend and frontend images while v10 remains live.
6. Run the migration tool once (expected count `1`) and again (expected count `0`).
7. Recreate backend, worker and frontend and verify all health checks.
8. Complete the v11 LAB acceptance workflow in `docs/testing.md`.

Rollback application containers to the v10 image only after reviewing schema
compatibility. Migration 006 is additive; retain the pre-v11 database backup until
all SLA, reporting, requester and dashboard checks pass.
