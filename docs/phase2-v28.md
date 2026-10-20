# Phase 2 v28

V28 is a cumulative presentation release built from v26 and includes the v27
notification-navigation correction. It does not change database schema 12.

## Modern workspace design

- Administration, Management and Technician workspaces share a layered
  blue/navy visual system with translucent surfaces, depth and responsive
  spacing while preserving Amnikon branding.
- Dashboard and ticket statistic cards enter in a short stagger, react to hover
  and retain the existing priority/SLA colour meanings.
- Status and trend charts animate into their real data values. There are no
  fabricated numbers or decorative placeholder charts.
- Navigation, buttons, saved views, board cards, tables, configuration cards,
  forms, modals, ticket timelines, requester results and notification popovers
  have consistent transition and interaction feedback.
- Table headings remain visible while scrolling and rows have clearer focus and
  hover states.
- The common Microsoft sign-in page uses the same visual language.

## Motion and accessibility

- Motion is short and interaction-led rather than continuous decoration.
- The interface honors the operating-system `prefers-reduced-motion` setting,
  reducing animations and transitions to effectively zero.
- Existing keyboard focus indicators, responsive navigation and mobile layouts
  remain active.

## Included correction

Ticket notifications navigate immediately to the correct Admin, Management or
Technician ticket route. Marking the notification as read no longer blocks the
navigation.
