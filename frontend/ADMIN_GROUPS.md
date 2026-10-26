# Administration overview and customer/staff groups

Administration `/admin` has an overview of active users, active customer organizations, active contacts and active groups. Four areas link to customer records, access management, service settings and reporting/channels. Recent audit activity and the ticket queue remain available.

Administrators can open **Customers → Groups** (`/admin/groups`) to create, edit, search, activate or deactivate groups and manage their permissions and membership. Groups retain their audit history; there is no permanent-delete action. Saves reject stale revisions.

## Customer groups

A customer group belongs to one active customer organization. Its type and customer cannot be changed after creation. Members are active contacts from that organization, with a database foreign key enforcing contact/customer consistency.

Permissions are **View organization tickets** and **Reply to organization tickets**. Reply requires view. These add access to tickets, public conversations and public attachments in the authenticated `/client` workspace. Personal ticket access continues without a group. Internal notes are never returned by the client endpoints.

Membership uses an explicitly linked contact account; a matching email address or unlinked contact does not grant access. The account still needs its User role and existing customer membership. Existing site restrictions continue to apply. Inactive groups, contacts, accounts and customer organizations grant no organization access.

The email-verification `/support` page continues to provide ticket submission only. Organization viewing and replying require the signed-in client workspace.

## Staff groups

Staff groups contain active Technician, Team Lead, Manager or Administrator accounts. They add these operational permissions to the selected workspace role: team ticket viewing, ticket assignment, ticket approval, category management, SLA management, reports and tag management.

Staff permissions apply across each member's existing assigned customer/site scope. Groups do not assign customers, sites, roles, administrative capabilities, change-management access or access to another workspace. This release intentionally excludes system-wide user/customer management and audit permissions from the group catalog. Intern and customer workspaces do not inherit staff group permissions. Removing a membership or deactivating a group removes its additional permissions on the next server request; role permissions continue to apply.

## Security and deployment

All group configuration endpoints require the Administration workspace and Administrator role. Writes also verify CSRF. Group changes, membership and permission changes are recorded transactionally in audit history.

Migration `023_customer_staff_groups.cjs` adds group configuration and membership tables. Deployment verifies the existing migration baseline, validates a database backup archive, applies only this additive migration, builds and switches application images, and verifies health, environment, mounts and protected services. Application rollback retains the additive tables and audit history; no database restore or down migration is performed.

## Validation

Automated tests exercise the migration in embedded PostgreSQL, cross-customer membership rejection, scoped portal list/detail/replies, site restrictions, view-only access, activation and revocation, staff workspace caps, validation, CSRF and anonymous HTTP denial. Headless Edge checks cover the overview, customer/staff create and edit flows, navigation, search/type filters, failed loads, retry and mobile layout. QA screenshots use isolated test data.
