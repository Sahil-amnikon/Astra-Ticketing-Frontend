# Phase 2 v15 LAB release candidate

V15 corrects the Management dashboard scope in the deployed v14 baseline. It has
no database migration.

## Correction

- Team Leads now receive the all-ticket Management dashboard counts, recent-ticket
  list, charts and workload data already permitted by their Management ticket queue.
- Managers and Administrators retain the same all-ticket dashboard access.
- Technician Dashboard remains restricted to tickets assigned to the signed-in user.
- Reports and approval decisions remain restricted to Manager and Administrator;
  this correction does not expand those permissions.

## Safe LAB update

1. Keep v14 running and verify the v15 ZIP checksum.
2. Back up the v14 application folder. No new database backup is required because
   v15 has no migration or data change.
3. Extract v15 to a new folder, copy the protected v14 `.env`, and update
   `RELEASE_TAG`.
4. Build backend and frontend images, run migration once expecting count `0`, and
   recreate backend, worker and frontend.
5. Confirm the Management dashboard and Tickets page show the same underlying
   ticket population for a Team Lead account.
