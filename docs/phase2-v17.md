# Phase 2 v17

Phase 2 v17 introduces enforced client/site scope and administrator-managed
feature permissions.

## Access scope

- Non-admin staff can only load clients assigned to their account.
- Multiple client memberships and multiple site memberships are supported.
- Ticket lists, dashboards, direct ticket URLs, mutations and attachment
  downloads enforce the server-side client boundary.
- `Site Team Tickets` is a read-only technician queue containing other
  technicians' tickets only at assigned sites.
- Assignment validates that the target technician is permitted for the ticket's
  client and site.

## Permissions

Administrators can grant individual permissions for team ticket visibility,
assignment, approvals, categories, SLA, reports, clients, contacts, sites, tags,
audit history and ticket sources. ADMIN retains unrestricted access.

Existing Team Leads receive team-ticket, assignment and category permissions;
existing Managers also receive approval and reporting permissions. An Admin may
remove or change these grants after deployment.

## Ticket sources

Ticket sources are stored as managed records. Administrators or users with the
Ticket Sources permission can add, rename, deactivate or remove unused sources.
Inactive sources remain valid on historical tickets but cannot be selected for
new tickets.

## Database

Migration 008 adds `permissions`, `user_permissions`, `user_sites` and
`ticket_sources`, preserves existing ticket sources and applies a foreign key to
the ticket source code.
