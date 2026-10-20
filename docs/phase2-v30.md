# Phase 2 v30

V30 is a cumulative service-desk interface release built from v29. It keeps the
same ticket data, workflows, authorization rules, API and database schema 12.

## Service-desk interface

- Replaces character symbols with a consistent accessible SVG icon system.
- Uses a compact operational navigation rail with a clearer active workspace,
  service status and workspace switch control.
- Gives every dashboard and configuration page a consistent workspace header,
  primary action position and information hierarchy.
- Restructures dashboard statistics and charts into a denser service-operations
  grid without adding placeholder metrics.
- Refines ticket search, filters, queue, preview and table density so the ticket
  list behaves like an operational inbox.
- Refines ticket detail, conversation composer, timeline and properties into a
  clearer two-column working surface.
- Retains responsive navigation, keyboard focus, reduced-motion support and the
  established priority/SLA colour meanings.

## Included v29 correction

Notification links open the correct workspace ticket. Empty-body read requests
no longer declare JSON content, and **Mark all read** clears and reconciles the
unread state with the API.

## Deployment

V30 has no database migration. Build and recreate the backend, worker and
frontend from the v30 directory. Running the migrator is safe and must return a
count of `0` on the current schema.
