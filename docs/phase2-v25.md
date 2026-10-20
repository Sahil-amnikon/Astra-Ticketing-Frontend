# Phase 2 v25

Phase 2 v25 is a cumulative visual-brand refinement built on v24. It does not
change the database schema, ticket workflow, authorization, priority rules or SLA
calculation.

## Brand mark

- Replaces the boxed letter `A` with a compact two-piece geometric Amnikon mark.
- Keeps the existing blue application palette selected for the LAB.
- Uses the same reusable accessible SVG component on the sign-in page and every
  Technician, Management and Administration sidebar.
- The mark is rendered locally by the application and has no external image or
  network dependency.

## Priority and SLA presentation

- Existing P1-P4 priority badge colours are unchanged.
- Existing SLA on-track, at-risk and breached colours are unchanged.
- The SLA state continues to be calculated by the API from the configured policy
  and each ticket's warning/due timestamps.

## Database

V25 has no database migration. Running the migration tool against an existing
v21-or-newer schema is safe and should report `count: 0`.
