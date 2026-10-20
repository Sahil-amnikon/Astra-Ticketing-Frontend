# Database

PostgreSQL 16 with pgvector and pg_trgm. Knex records migration history and uses
its migration lock to serialize concurrent runners. Migrations are transactional.
`001_foundation` enables pgvector/pg_trgm and writes schema version 1.
`002_identity_core` adds pgcrypto, schema version 2, built-in roles, users and client
memberships, clients, contacts, sites, assets, hierarchical categories, tags and
immutable audit records. Foreign keys prevent an asset's site from belonging to a
different client. Names with business uniqueness use case-insensitive indexes.

`003_admin_management` adds users.session_version, narrow association-table DELETE
grants and schema version 3. `004_controlled_deletion` grants DELETE only on the
administration record tables and sets schema version 4. Existing rows are preserved.

`005_ticket_engine` upgrades schema version 4 to 5. It adds sequential human ticket
numbers, tickets, comments, assignment/transfer records, tags, approval decisions,
immutable history and authorized attachment records. Composite foreign keys prove
that the requester and optional site belong to the selected client. Check
constraints restrict source, status, priority, approval state and comment type.
The only active sources are Missive, Microsoft Teams, Phone Call, SMS and Email.

`006_sla_reporting` upgrades schema version 5 to 6 with priority SLA policies,
per-ticket SLA snapshots and reporting data. `007_required_ticket_category`
upgrades schema version 6 to 7. It creates or reactivates the root `General Support`
category, assigns it to existing uncategorized tickets, and makes
`tickets.category_id` mandatory. Tags remain optional.

`008_scoped_access_permissions_sources` upgrades schema version 7 to 8 with
client/site scope, feature permissions and source records. V18 corrects the UUID
type used by its legacy Team Lead/Manager permission seed. `009_other_ticket_source`
adds the fixed `Other` source and removes the unused source-management permission.
`010_standard_ticket_categories` upgrades schema version 9 to 10 with standard
parent categories and subcategories while preserving existing category records.
`011_ticket_search_saved_views` upgrades schema version 10 to 11. It adds GIN and
trigram indexes for ticket content, comments, client and requester lookup, plus
per-user saved ticket views. Saved views contain filter definitions only and are
deleted automatically with their owning user.

`012_sla_calendars_notifications` upgrades schema version 11 to 12. It adds
timezone-aware business-hour calendars and holidays, assigns a calendar to every
SLA policy and ticket SLA, and stores pause/resume remaining minutes. PostgreSQL
functions add or count business minutes without relying on the web process clock.
The migration also adds user notification preferences and deduplicated in-app
notifications. Existing due timestamps are preserved during migration.

`013_internal_change_management` upgrades schema version 12 to 13 with the
protected internal organization, departments, supervised internal contributors,
cross-team help and controlled changes. `014_change_stakeholders_attachments_ticket_prefixes`
upgrades schema version 13 to 14. It adds per-client ticket prefixes and atomic
client ticket sequences, multiple internal/external change stakeholders and
authorized change attachments. Ticket UUIDs remain stable when existing `INC-…`
values are converted to client-specific human-readable numbers.

`015_client_change_stakeholders_internal_locations` upgrades schema version 14
to 15. It allows change stakeholders to reference client contacts and adds an
optional free-text location/project field to tickets. Existing internal-user and
external-email stakeholder rows are preserved for historical display.

`016_site_contacts_change_navigation` upgrades schema version 15 to 16. It adds
an optional site relationship to client contacts, with a composite foreign key
that prevents cross-client site assignment. Existing contacts remain valid as
organization-wide contacts. It also seeds missing internal routing departments
without replacing or deleting administrator-created departments.

Readiness checks this migrated version, not just socket reachability. Repeat
`npm run db:migrate` to verify a clean second run. Set MIGRATION_DATABASE_URL for
this command. Runtime connections use DATABASE_URL with a separate non-superuser.
The runtime role has explicit per-table privileges and no migration-table access.
It may insert/select audit and ticket-history rows but cannot update or delete
either history. Ticket tags receive narrowly scoped DELETE for replacement; ticket
records are not granted general DELETE. API authorization remains mandatory;
database grants are defence in depth and are not a substitute for role checks.

The application uses a maximum five-connection pool per API/worker process and
bounded connection/query timeouts. Queries are static or parameterized. No raw
client-provided SQL is accepted. Extension removal is intentionally excluded from
rollback because later schemas may depend on them. Prefer forward corrective
migrations; never edit migrations already applied to a persistent database.
