# Service Performance overview

Service Performance at `/service-reports` now has a dedicated dashboard layout, using the existing authorized `/service-reports` API. A navy overview banner identifies the reporting window and organization. The primary view compares tickets created and resolved in the period, with a separate warm-colour card for current backlog. Secondary cards show elapsed resolution time, knowledge connections and visible changes raised. A source donut and change status distribution replace the browser-default meters. Expandable definitions explain the metric basis.

The design is scoped to this route. WorkspaceFrame accepts an optional pageHeading; its default heading remains intact for other pages. Sidebar, workspace selection, notifications, navigation and authentication use the existing frame. The holistic Reports & Analytics page is retained.

Metric definitions are preserved:

- Created/resolved counts use their respective event dates in the inclusive UTC reporting window. Their difference is activity volume, not backlog growth or a cohort resolution/compliance rate. Resolutions can exceed new intake.
- Open now is current backlog for the selected organization scope, independent of the reporting period.
- Resolution time is elapsed creation-to-resolution time for resolutions in the period, including pauses. Null is unavailable and displays a dash.
- Sources cover tickets created in the period. Changes show current statuses of visible changes raised in the period. If the account lacks change access, the chart shows unavailable rather than a zero claim.
- Knowledge counts article links added during the period.

The report loads initially. Organization/date filters and This month/Last 30 days/Last 90 days presets are controlled drafts. Changing filters disables CSV export until regeneration succeeds. Repeating Generate with identical filters refreshes the report. Loading and failed regeneration clear older numbers and disable export; retry remains available. CSV retains the existing filename convention and metric keys, adds organization ID/name and UTC generation timestamp, and uses the existing formula-safe CSV helper.

No dependency, API, permission, database, schema or background-service changes are required. Existing server-side authorization remains authoritative. The report-permission guard avoids requesting report data for unauthorized sessions.

Validation results are recorded in validation.json and outputs/astra-service-performance-qa. Checks cover the production build, strict frontend types, lint/formatting of changed files, period comparison and CSV data, Edge desktop/laptop/mobile rendering, scoped filters, actual downloads, repeated generation, dirty/loading/error/empty states, missing change/report access, resolutions above intake, and preservation of the default ticket reports heading and holistic report entry point. Browser fixtures reproduce the supplied screenshot's metric values; they are not live business records.
