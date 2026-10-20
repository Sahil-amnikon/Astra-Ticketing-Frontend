# Phase 2 v27

V27 is a focused UI correction built from the validated v26 release. It does
not change the database schema.

## Notification navigation

- Ticket notifications now navigate immediately to the ticket detail route for
  the active Technician, Management or Administration workspace.
- Updating the notification's read state runs independently in the background.
  A slow, interrupted or rejected read-state request can no longer prevent the
  ticket from opening.
- Read notifications continue to use the same workspace-aware links.
- Notifications without a ticket remain non-navigating.

All v26 business-hour SLA, pause/resume, notification authorization and
preference behavior is retained.
