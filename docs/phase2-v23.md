# Phase 2 v23

Phase 2 v23 is a cumulative authorization-scope correction built on v22. It
does not change the database schema.

## Site Team Tickets

- Assigned clients are always enforced by the backend query.
- A technician with explicit site assignments can see other technicians' and
  unassigned tickets only for those sites.
- A technician with assigned clients but no explicit site assignments can see
  other technicians' and unassigned tickets across those assigned clients.
- The technician's own tickets remain in **My Tickets** and are excluded from
  the separate **Site Team Tickets** queue.
- Ticket detail and attachment authorization use the same client/site fallback
  as the list query, preventing a visible team ticket from opening as a 404.

## Database

V23 has no database migration. Running the migration tool against an existing
v21-or-newer schema is safe and should report `count: 0`.
