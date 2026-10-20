# Phase 2 v22

Phase 2 v22 is a cumulative user-interface and ticket-filter reliability release
built on v21. It does not change the database schema or ticket authorization
rules.

## Ticket workspace

- The duplicate **New Ticket** sidebar entry is removed. Ticket creation remains
  one click away from the dashboard and every ticket queue.
- The default List layout combines a dense ticket queue with a selectable quick
  preview panel.
- The Board layout groups the same authorized results into New, In Progress,
  Waiting and Resolved columns.
- Queue Health shows SLA attention, unassigned and resolved counts for the
  currently loaded result page.
- Compact primary filters and collapsible advanced filters replace the oversized
  filter form.
- A user's List or Board choice applies for the current browser page session.

## Filter reliability

- Search and Clear Filters keep the current ticket results visible while the
  replacement results load.
- Starting a new ticket-list request cancels the superseded request.
- Requests time out after 15 seconds with a retryable message instead of leaving
  the workspace frozen.
- Applying the same search or clearing an already-empty filter still performs a
  deterministic refresh.
- Late responses cannot overwrite a newer filter result.

## Database

V22 has no database migration. A migration run is still safe and should report
`count: 0` on an existing v21 schema.
