# Phase 2 v24

Phase 2 v24 is a cumulative Site Team Tickets scope refinement built on v23. It
does not change the database schema.

## Site Team Tickets

- The shared queue includes the current technician's tickets, other
  technicians' tickets and unassigned tickets.
- Assigned clients are always enforced by the backend query.
- Explicit site assignments restrict the shared queue to those sites.
- With no explicit site assignments, the shared queue covers all sites and
  tickets within the technician's assigned clients.
- **My Tickets** remains the focused personal queue.
- Ticket detail and attachment reads retain the same client/site authorization.

## Database

V24 has no database migration. Running the migration tool against an existing
v21-or-newer schema is safe and should report `count: 0`.
