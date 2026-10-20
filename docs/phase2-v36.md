# Phase 2 v36

V36 is a cumulative interface correction on top of v35. It keeps all v35
stakeholder, mailbox and access-control behavior while making Change Management
use the same portal navigation as every other module.

## Unified navigation

- Change Management no longer renders a visually separate sidebar.
- Administration, Management and Technician navigation keep their normal labels,
  order, spacing, icons, footer and responsive menu while a change is viewed,
  raised or edited.
- Change Management remains the final normal module in each eligible portal.
- **Raise Change** is a page action in the Change Management header; it is not a
  duplicate sidebar tab.
- Per-user Change access continues to control both visibility and API access.

## Coloured module icons

Each navigation module has a consistent accent colour across portals. The colour
is applied to the icon only so text contrast, active selection and the dark
navigation background remain accessible and familiar.

V36 has no additional database migration. A direct v34 to v36 upgrade still
applies cumulative migration 016 from v35; an environment already on schema 16
reports zero new migrations.
