# Phase 1 v9 — portal access correction

V9 is a small follow-up to deployed v8. It keeps migration 004 and schema version
4 unchanged.

An authenticated user who manually enters a portal URL is redirected to their
role-appropriate destination when they lack that portal's role:

- USER → `/client`
- TECHNICIAN, TEAM_LEAD or MANAGER → `/operations`
- ADMIN → `/admin`

The existing backend API role checks remain in force. This correction also keeps
the browser portal shell aligned with those checks.

Deploy v9 by building its images and recreating backend, worker and frontend.
Run the migration service once; it must report zero applied migrations.
