# Administration service management

The Administration workspace provides configuration and read-only oversight of Tickets, Changes and Problems. Staff select an authorized Technician or Management workspace to create records, reply, add notes, investigate, assign work or make workflow and approval decisions.

Service administration (`/admin/service-management`) links existing settings rather than introducing parallel configuration stores:

- Tickets: categories and subcategories, tags, SLA policies, site domains and numbering, staff roles and groups.
- Changes: CAB membership, approval policy, templates, blackout windows and staff change access.
- Problems: staff roles, group membership, customer/site scope and audit history. Problem status transitions and evidence requirements continue to use the existing server rules.

Administration can inspect service registers, records, attachments and history. Ticket composers, assignment and approval actions, change creation and mutation forms, problem creation and investigation mutations, and manual email ticket intake are absent in this workspace. Direct change-creation URLs show administration guidance instead of an intake form.

The API's global AdministrationReadOnlyGuard checks the authenticated, selected workspace before service-record mutations. It covers tickets, changes, problems, record-level change governance, ticket collaboration, knowledge-to-ticket links and manual mail intake. Existing role and customer/site checks still apply in support workspaces. Saved ticket filters are personal preferences and remain available; administrative configuration, mail queue administration, reports, reads and authentication routes retain their existing permissions.

Workspace context remains on change-register and schedule links, so navigation retains the selected administrative or support view. No database schema change is required.
