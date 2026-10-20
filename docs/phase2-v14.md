# Phase 2 v14 LAB release candidate

V14 is a UI correction for the deployed v13 baseline. It has no database
migration and keeps the same ticket, role, SLA and reporting behavior.

## Included

- Sidebar links stay grouped at the top instead of stretching vertically across
  the available navigation area.
- The navigation area remains independently scrollable and its Switch workspace
  control remains reachable.
- Dashboard statistics use a balanced responsive grid and every statistic has a
  visible icon.
- Internal note and Public reply tabs now explain their audiences directly.
- Public reply explicitly states that it is requester-visible ticket history but
  is not automatically delivered through email or another channel in this release.

## Safe LAB update

1. Keep v13 running and verify the v14 ZIP checksum.
2. Back up the v13 application folder. The existing pre-v13 database backup remains
   valid because v14 has no migration.
3. Extract v14 to a new folder, copy the protected v13 `.env`, and set a new
   `RELEASE_TAG`.
4. Build the backend and frontend images.
5. Run the migration tool once; it must report count `0`.
6. Recreate backend, worker and frontend, verify health, and complete the v14
   browser checks in `docs/testing.md`.
