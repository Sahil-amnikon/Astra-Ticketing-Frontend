# Phase 1 v8 — controlled deletion and portal entry points

V8 is an upgrade from the deployed v7 LAB release. It adds controlled permanent
deletion for administration records and role-aware sign-in destinations. It does
not add tickets, client self-service or technician queues; those operational
modules remain in their planned phases.

## Included

- A Delete action for users, clients, contacts, sites, assets, categories and
  tags. The administrator must type `delete` in the confirmation dialog.
- Every successful deletion writes an immutable audit event containing the prior
  record values. Audit history has no delete action.
- A client cannot be deleted while contacts, sites, assets or user memberships
  remain. A site cannot be deleted while assets remain. A category cannot be
  deleted while child categories remain.
- An administrator cannot delete their own account, and the final active
  administrator cannot be deleted.
- Separate entry URLs:
  - `/client` — Client and end-user portal
  - `/operations` — Technician, team-lead, manager and administrator portal
  - `/admin` — Administration console
- The Entra sign-in state stores only an approved internal destination. After
  sign-in, the backend checks roles and sends the user to the requested permitted
  portal or their normal role-based destination.

## Migration 004

Migration `004_controlled_deletion` grants the application role DELETE only on
the administration tables that v8 can remove and sets schema version 4. It does
not delete or alter existing records. Audit-log DELETE permission remains absent.

Upgrading v7 applies one migration; running migration again applies zero. V7 can
continue to run against schema version 4 during a controlled rollback.

## LAB upgrade sequence

1. Back up the deployed v7 directory and database.
2. Extract v8 to a new sibling release directory, copy the existing `.env`, keep
   `INITIAL_ADMIN_OBJECT_IDS=` blank and set a new `RELEASE_TAG`.
3. Build the v8 backend and frontend images before replacing services.
4. Run the `migrate` service twice; expect 1 then 0 applied migrations.
5. Recreate backend, worker and frontend from the v8 directory and confirm
   health.
6. Test `/client`, `/operations` and `/admin` with approved role-appropriate
   Entra identities. Test deletion on a disposable record and confirm its audit
   entry. Keep v7 and its database backup until acceptance.
