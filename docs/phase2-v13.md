# Phase 2 v13 LAB release candidate

V13 is a cumulative replacement for the undeployed v12 candidate. Deploy v13
directly over the live v11 baseline; do not deploy v12 first. V13 includes migration
007, so the first migration run from v11 is expected to apply one migration.

## Included

- One Microsoft sign-in followed by a role-authorized workspace selector.
- Technician workspace for `TECHNICIAN`, `TEAM_LEAD`, `MANAGER` and `ADMIN`.
- Management workspace for `TEAM_LEAD`, `MANAGER` and `ADMIN`, with the all-ticket
  dashboard, queue, workload, SLA visibility and ticket controls.
- Management reports and approval decisions for `MANAGER` and `ADMIN`.
- Administration configuration remains restricted to `ADMIN`.
- A Switch workspace action that changes the view without changing assigned roles.
- Independently scrollable desktop and mobile side navigation, with its bottom
  controls kept reachable at short viewport heights.
- All v12 corrections: reliable sign-out, per-technician reports and exports, and
  mandatory ticket categories.

AI assistance remains deliberately excluded.

## Safe LAB update

1. Keep v11 running and verify the v13 ZIP checksum.
2. Back up the v11 application folder and PostgreSQL database.
3. Extract v13 to a new folder and copy the protected v11 `.env`.
4. Set a new `RELEASE_TAG`, for example `phase2-v13-lab-20260916`.
5. Build the backend and frontend images while v11 remains live.
6. Run the migration tool once (expected count `1`) and again (expected count `0`).
7. Recreate backend, worker and frontend and verify all health checks.
8. Complete the v13 LAB checks in `docs/testing.md`.

Keep the pre-v13 database backup until sign-out, category creation, role routing,
workspace switching, navigation scrolling and report export pass LAB acceptance.
