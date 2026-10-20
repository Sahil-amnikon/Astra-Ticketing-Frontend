# Amnikon Ticketing System

## Master Codex Development Prompt

You are the primary software engineer responsible for building the **Amnikon Ticketing System**, an internal MSP service-desk/ticketing platform.

This system is being built specifically for our organization and our MSP support workflow.

**Important:** This is NOT a generic commercial ticketing product and does NOT need to be designed for redistribution. Do not over-engineer it into a SaaS product or generic platform.

The system will be:

1. Fully developed in LAB.
2. Fully tested and validated in LAB.
3. Used as the production-ready application.
4. Deployed to production using the same codebase/release.
5. Production-specific configuration, secrets, database, DNS, authentication and integrations will be changed during deployment.

Do not create a throwaway prototype.

---

# 1. Environment

Initial LAB architecture:

### Application/Web Server

Hostname:

`Ticketing-WEB-LAB`

Current LAB resources:

- 4 vCPU
- 4 GB RAM
- Approximately 80–100 GB disk
- Ubuntu Server 24.04 LTS
- Docker

This server will host:

- Next.js frontend
- Backend API
- Background workers
- Redis
- Application services

The architecture must allow the RAM to be increased later without redesigning the application.

### Database Server

Hostname:

`Ticketing-DB-LAB`

Current LAB resources:

- 4 vCPU
- 4 GB RAM
- Approximately 100–150+ GB disk
- Ubuntu Server 24.04 LTS
- Docker

This server will host:

- PostgreSQL
- pgvector

The database server must be isolated from normal user access.

Users should access:

`Users → HTTPS → Ticketing-WEB`

Application:

`Ticketing-WEB → PostgreSQL`

Users must NOT directly access PostgreSQL.

Internet must NOT directly access PostgreSQL.

---

# 2. Technology Stack

Use the following technology unless there is a strong technical reason not to.

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Responsive UI
- Accessible components
- Modern professional MSP/helpdesk interface

## Backend

- Node.js
- TypeScript
- NestJS or an equivalent strongly structured TypeScript backend framework
- REST API
- OpenAPI documentation

## Database

- PostgreSQL
- Prisma or another robust PostgreSQL ORM/migration solution
- pgvector for future AI/RAG functionality

## Infrastructure

- Docker
- Docker Compose
- Redis

## Authentication

Microsoft Entra ID using:

- OIDC/OAuth2
- Microsoft Graph where required

Do not implement a separate password database unless explicitly required later.

## Testing

Use appropriate:

- Unit tests
- Integration tests
- API tests
- Database tests
- End-to-end tests
- Playwright for critical UI workflows

---

# 3. MSP Business Model

This is an MSP ticketing system.

The system must support:

```text
MSP
 ├── Clients
 │    ├── Contacts / Requesters
 │    ├── Sites
 │    ├── Assets
 │    └── Tickets
 │
 ├── Technicians
 ├── Teams
 ├── SLAs
 ├── Knowledge Base
 ├── Integrations
 └── Reporting
```

Clients are first-class entities.

Every ticket must belong to a client.

Every requester/contact must belong to a client.

Technicians may support multiple clients.

Client isolation must be enforced in the backend.

Never rely only on frontend filtering for security.

---

# 4. User Types / RBAC

Implement role-based access control.

Initial roles:

- USER
- TECHNICIAN
- TEAM_LEAD
- MANAGER
- ADMIN

The permission model should support:

### USER

Can:

- Create tickets
- View their own tickets
- Reply to their tickets
- Add attachments
- View public replies

Cannot:

- View internal notes
- View other clients
- Modify administrative configuration

### TECHNICIAN

Can:

- View tickets they are permitted to access
- Create tickets
- Assign tickets
- Transfer tickets
- Reply to clients
- Add internal notes
- Change status
- Change priority
- Add tags
- Add attachments
- Link tickets
- Resolve tickets
- Reopen tickets
- Search tickets
- View relevant client information

### TEAM_LEAD

Everything a technician can do plus:

- Team workload
- Team tickets
- Reassignment
- Escalation
- Team reporting
- SLA monitoring

### MANAGER

Everything appropriate for management plus:

- All technician/team reporting
- Client reporting
- SLA reporting
- Dashboard
- Workload analysis
- Operational metrics

### ADMIN

Full system administration:

- Users
- Roles
- Clients
- Contacts
- Sites
- Assets
- Categories
- Tags
- SLA configuration
- Integrations
- System configuration
- Audit logs

Implement authorization at the API/service layer.

---

# 5. Ticket Numbering

Use human-friendly ticket numbers.

Example:

```text
INC-000001
INC-000002
INC-000003
```

Ticket ID and ticket number must be separate concepts.

Database primary key may be UUID.

Ticket number should be human-readable and sequential.

Do not use client-controlled values as ticket identifiers.

---

# 6. Ticket Sources

Tickets may originate from:

- Missive
- Microsoft Teams
- Email
- Phone
- Client Portal
- Technician Created / Manual
- Monitoring
- Other

The ticket source must be stored from day one.

The data model must support future automation.

Include fields where appropriate for:

- Source
- Source reference ID
- Source conversation ID
- Source message ID
- Source URL
- External/thread ID

Examples:

```text
Source = TEAMS
SourceMessageId = ...
SourceConversationId = ...
SourceUrl = ...
```

Do not require integrations to be active in the first development phase, but design the database/API so they can be added without restructuring tickets.

---

# 7. Ticket Lifecycle

Recommended statuses:

```text
NEW
OPEN
IN_PROGRESS
WAITING_FOR_CLIENT
WAITING_FOR_VENDOR
ON_HOLD
RESOLVED
CLOSED
CANCELLED
```

Support:

- Create
- Assign
- Transfer
- Reassign
- Reply
- Internal Note
- Change Status
- Change Priority
- Change Category
- Add Tag
- Add Attachment
- Link Ticket
- Merge Ticket
- Watch
- Escalate
- Resolve
- Close
- Reopen

The UI should make the common operations easy and obvious.

---

# 8. Internal Notes vs Customer Replies

This is a critical requirement.

Ticket comments must have an explicit type.

For example:

```text
PUBLIC
INTERNAL
```

Internal notes:

- Are visible only to authorized MSP staff.
- Must NEVER be sent to customers.
- Must NEVER appear in client portal responses.
- Must NEVER be included in customer-facing email replies.

Public replies:

- Are visible to the requester/client.
- May eventually be sent through email/Teams/etc.

Backend authorization must enforce this.

Do not simply hide internal notes using frontend logic.

---

# 9. Ticket History / Audit

Every important ticket action must be recorded.

Examples:

- Ticket created
- Status changed
- Priority changed
- Category changed
- Technician assigned
- Technician changed
- Ticket transferred
- Comment added
- Internal note added
- Public reply sent
- Tag added/removed
- Attachment added
- Ticket resolved
- Ticket closed
- Ticket reopened
- SLA changed
- Client changed

Store:

- Actor
- Timestamp
- Action
- Previous value
- New value
- Reason where appropriate

Audit records must be immutable from normal user interfaces.

---

# 10. Ticket Transfer

Transfer/reassignment must be treated as a real workflow.

Do NOT simply overwrite the assigned technician.

Record:

```text
Previous technician
New technician
Transferred by
Timestamp
Reason
```

This is important because management reports need to understand technician workload and ticket ownership history.

The system must be able to determine:

- Who originally received the ticket
- Who worked on it
- Who it was transferred to
- How many times it was transferred
- Who ultimately resolved it

Design the data model so future technician time/workload reporting can be accurate.

---

# 11. Clients

Create a proper client management structure.

Example:

```text
Client
 ├── Contacts
 ├── Sites
 ├── Assets
 ├── Tickets
 └── SLA
```

Client fields should include appropriate information such as:

- Name
- Status
- Contact information
- Primary contact
- Notes
- SLA configuration
- Created date
- Updated date

Do not hard-code client names.

---

# 12. Contacts / Requesters

A requester/contact belongs to a client.

Store appropriate information:

- Name
- Email
- Phone
- Client
- Active/inactive
- Entra identity if applicable
- Created date
- Updated date

A ticket must identify:

- Client
- Requester

A technician-created ticket may have a manually selected requester or appropriate placeholder depending on the workflow.

---

# 13. Sites

Support client locations/sites.

Example:

```text
ABC Manufacturing
 ├── Headquarters
 ├── Warehouse
 └── Production Plant
```

Tickets may optionally reference a site.

---

# 14. Assets

Support client assets/devices.

Examples:

- Laptop
- Desktop
- Server
- Printer
- Network device
- Application
- Phone
- Other equipment

A ticket can optionally reference an asset.

This will be useful for:

- Ticket history
- Repeated problems
- Asset-related incidents
- Future monitoring integration
- AI similarity detection

---

# 15. Categories

Create configurable categories/subcategories.

Examples:

```text
Network
 ├── VPN
 ├── Wi-Fi
 ├── Firewall
 └── Internet

Microsoft 365
 ├── Outlook
 ├── Teams
 ├── OneDrive
 └── SharePoint

Hardware
 ├── Laptop
 ├── Desktop
 ├── Printer
 └── Monitor
```

Do not hard-code the category hierarchy into application logic.

Store categories in the database.

---

# 16. Tags

Tickets should support multiple tags.

Examples:

```text
VPN
Microsoft365
Printer
Urgent
Security
NewUser
Onboarding
```

Tags should be searchable.

---

# 17. Search

Search is one of the most important parts of this project.

The system must NOT reproduce the poor search experience of osTicket.

The goal is:

> Search should feel closer to Outlook/email search than traditional helpdesk software.

Provide one powerful search box.

A technician should be able to type:

```text
VPN John Smith
```

and receive relevant tickets.

Search should include:

- Ticket number
- Subject/title
- Description
- Client
- Requester name
- Requester email
- Technician
- Public comments
- Internal notes
- Tags
- Asset
- Source
- Error messages
- Relevant ticket metadata

Support optional filters:

- Client
- Status
- Technician
- Priority
- Category
- Source
- Date range
- Tags

Support simple search operators where practical:

```text
client:"ABC Manufacturing"
status:open
assigned:mike
priority:high
source:teams
```

Operators can be combined:

```text
client:"ABC Manufacturing" status:open VPN
```

V1 search should use PostgreSQL full-text search and `pg_trgm` where useful.

Do NOT introduce OpenSearch/Elasticsearch unless there is a demonstrated need.

The search architecture should allow it to be introduced later.

---

# 18. Dashboard

Create dashboards for different roles.

## Technician Dashboard

Show:

- My open tickets
- New tickets
- In-progress
- Waiting for client
- SLA at risk
- Recently resolved
- Ticket workload
- My response metrics
- My resolution metrics

## Manager Dashboard

Show:

- Total tickets
- Open
- New
- In progress
- Resolved
- Closed
- SLA at risk
- SLA breached
- Tickets by technician
- Tickets by client
- Tickets by category
- Tickets by source
- Transfer volume
- Reopened tickets
- Trend information

Do not make a simplistic technician "leaderboard".

Ticket volume alone is not an accurate measure of technician performance.

---

# 19. Reporting

Management needs monthly technician reports.

Reports should eventually include:

- Tickets assigned
- Tickets received
- Tickets transferred in
- Tickets transferred out
- Tickets resolved
- Tickets closed
- Open tickets
- Reopened tickets
- SLA met
- SLA breached
- SLA compliance %
- Average response time
- Median response time
- Average resolution time
- Median resolution time
- Client breakdown
- Category breakdown
- Source breakdown

Reports must use historical assignment/transfer data.

Do not calculate technician responsibility solely from the final assignee.

Provide export capability eventually for:

- CSV
- Excel
- PDF

Do not prioritize export over the actual reporting engine.

---

# 20. SLA

Implement an SLA framework.

At minimum support:

- Response SLA
- Resolution SLA
- SLA target
- SLA status
- SLA due time
- SLA breach
- SLA warning / at-risk state

The design should support different SLA policies by client.

Example:

```text
Client A
Response: 1 hour
Resolution: 4 hours

Client B
Response: 4 hours
Resolution: 2 business days
```

Business hours/holidays can be implemented as configuration rather than hard-coded.

---

# 21. Notifications

Design notification infrastructure.

Future notifications may include:

- Ticket assigned
- Ticket transferred
- Customer replied
- Ticket approaching SLA
- SLA breached
- Ticket resolved
- Ticket reopened
- Mention/tagged technician

Use background jobs where appropriate.

Do not block the main API waiting for notification processing.

---

# 22. Email Integration

Email is a major future source.

The system must eventually support:

```text
Customer Email
       ↓
Helpdesk Mailbox
       ↓
Ticketing System
       ↓
Ticket
```

And:

```text
Technician Reply
       ↓
Ticketing System
       ↓
Email
       ↓
Customer
```

Design ticket/thread fields so email threading can be implemented without changing the ticket model.

Support concepts such as:

- Message ID
- In-Reply-To
- References
- Thread ID
- External message ID
- Sender
- Recipients

Do not implement a fake email system.

When email integration is implemented, use Microsoft-supported authentication/API mechanisms appropriate for the environment.

---

# 23. Microsoft Teams Integration

Teams is an important future source.

Desired workflow:

A user sends a Teams message containing something such as:

```text
#ITSupport
```

or explicitly requests:

```text
Convert this to a ticket
```

The integration should eventually:

1. Identify the message.
2. Identify the requester.
3. Identify the client.
4. Pull message content.
5. Pull attachments where supported.
6. Create a ticket.
7. Store the Teams conversation/message references.
8. Provide the ticket number.
9. Eventually allow ticket updates/replies to synchronize back to Teams.

Do not hard-code a single Teams channel into the application.

Use configuration/database settings.

---

# 24. Missive Integration

Missive is currently an important ticket source.

Initially:

- Technician can manually select `Missive` as the source.

Later:

- Missive API/webhook can automatically create tickets.

Store:

- Missive conversation ID
- Message ID
- Source URL where available
- Thread/reference information

The integration must be designed so existing tickets do not need to be migrated to another structure when automation is enabled.

---

# 25. Monitoring Integration

The MSP environment uses monitoring.

Future monitoring integration should allow systems such as Zabbix to create/update tickets.

Examples:

```text
Zabbix Alert
      ↓
Ticketing API
      ↓
Ticket
```

Store:

- Monitoring source
- Alert/event ID
- Host/device
- Severity
- Event timestamp
- External reference

Design for deduplication so the same alert does not create unlimited tickets.

Do not implement destructive monitoring actions.

---

# 26. Knowledge Base

Create a knowledge-base foundation.

Articles should support:

- Title
- Content
- Category
- Tags
- Client applicability
- Published/draft
- Author
- Updated date

Future functionality:

- Search
- Link article to ticket
- Suggest article during ticket creation
- AI-powered article recommendations

---

# 27. AI Assistance

AI comes AFTER the core ticketing functionality is working.

AI is an assistant, not an autonomous administrator.

Initial AI capabilities:

### Ticket Summary

Summarize long ticket histories.

### Category Recommendation

Recommend:

```text
Category
Subcategory
```

### Priority Recommendation

Recommend a priority with reasoning.

### Assignment Recommendation

Suggest technician/team based on:

- Ticket category
- Client
- Previous similar tickets
- Technician expertise/history

### Suggested Customer Reply

Generate a draft response.

Technician must be able to:

- Accept
- Edit
- Reject

### Similar Tickets

Find similar historical tickets.

### Knowledge Suggestions

Suggest relevant KB articles.

### Duplicate Detection

Identify potentially duplicate tickets.

AI recommendations must be stored separately from technician-selected values.

Example:

```text
AI Recommended Priority = HIGH
Technician Selected Priority = MEDIUM
```

Do not silently overwrite technician decisions.

AI actions/recommendations must be auditable.

---

# 28. AI Safety

AI must NOT autonomously execute dangerous infrastructure operations.

Never allow AI alone to:

- Delete accounts
- Disable users
- Delete tickets
- Restart servers
- Modify firewalls
- Modify DNS
- Modify production systems
- Execute arbitrary PowerShell
- Execute arbitrary shell commands
- Change network configuration

AI is advisory unless an explicit, separately authorized automation workflow is implemented later.

---

# 29. Attachments

Tickets must support attachments.

Store attachment metadata separately from tickets.

The application should use a storage abstraction so storage can later move to:

- NAS
- S3-compatible storage
- Azure Blob
- MinIO
- Other approved storage

Do not unnecessarily build a complicated storage platform now.

For LAB, use a practical local/Docker-mounted storage approach.

Security requirements:

- Validate file type
- Validate file size
- Do not execute uploaded files
- Secure download authorization
- Prevent users from accessing another client's attachments

---

# 30. Security

Security is mandatory.

Implement:

- Entra authentication
- RBAC
- Backend authorization
- Client isolation
- Secure session handling
- Input validation
- SQL injection protection through ORM/parameterized queries
- XSS protection
- CSRF protection where applicable
- Secure headers
- Rate limiting where appropriate
- Audit logging
- Attachment authorization
- Secret management through environment/configuration
- No credentials in source code
- No secrets committed to Git

Never trust:

- Client-provided client IDs
- Client-provided technician IDs
- Client-provided authorization claims
- Frontend-only permission checks

Verify authorization server-side.

---

# 31. Database Design

Design a normalized relational model.

Likely entities include:

```text
users
roles
permissions
clients
client_users
contacts
sites
assets
tickets
ticket_comments
ticket_attachments
ticket_tags
tags
categories
ticket_categories
ticket_assignments
ticket_transfers
ticket_history
sla_policies
sla_instances
notifications
knowledge_articles
knowledge_categories
integrations
ai_recommendations
audit_logs
```

Do not blindly create every table above if the architecture can accomplish the requirement more cleanly.

Use proper:

- Foreign keys
- Indexes
- Unique constraints
- Check constraints where appropriate
- Timestamps
- Soft deletion where appropriate
- Transaction boundaries

Do not use soft deletion everywhere automatically.

---

# 32. API

Create a clean REST API.

Document it using OpenAPI.

Example resource areas:

```text
/auth
/users
/clients
/contacts
/sites
/assets
/tickets
/tickets/{id}/comments
/tickets/{id}/attachments
/tickets/{id}/assign
/tickets/{id}/transfer
/tickets/{id}/resolve
/tickets/{id}/close
/search
/reports
/dashboard
/sla
/knowledge
/ai
/integrations
/admin
```

Use DTO validation.

Return consistent API errors.

Never expose database internals unnecessarily.

---

# 33. Frontend UX

The application should feel like a modern internal MSP application.

Priorities:

1. Fast ticket lookup.
2. Fast ticket creation.
3. Fast assignment/transfer.
4. Clear ticket timeline.
5. Clear distinction between internal notes and customer replies.
6. Easy search.
7. Useful dashboards.
8. Minimal unnecessary clicks.

Do not copy osTicket's UI.

Avoid making technicians fill out excessive fields before they can work on a ticket.

---

# 34. Ticket Page

The ticket page should provide:

### Header

- Ticket number
- Subject
- Client
- Requester
- Status
- Priority
- Assigned technician
- Category
- SLA status

### Main timeline

Clearly distinguish:

- Customer messages
- Technician public replies
- Internal notes
- System events

### Actions

Provide convenient controls for:

- Reply
- Internal Note
- Assign
- Transfer
- Status
- Priority
- Category
- Tags
- Attachments
- Link
- Merge
- Resolve
- Close
- Reopen

---

# 35. Production/LAB Configuration

The code must NOT contain hard-coded LAB IP addresses or hostnames.

Use environment configuration.

Example:

```text
DATABASE_URL
REDIS_URL
ENTRA_CLIENT_ID
ENTRA_CLIENT_SECRET
ENTRA_TENANT_ID
APP_BASE_URL
EMAIL_CONFIGURATION
OPENAI_API_KEY
STORAGE_CONFIGURATION
```

Provide:

```text
.env.example
```

Never commit real secrets.

LAB and Production should use different environment configuration.

The same application image/release should be usable in both environments.

---

# 36. Docker

Use Docker Compose for LAB.

Structure the deployment cleanly.

Application server may contain:

```text
frontend
backend
worker
redis
```

Database server:

```text
postgresql
pgvector
```

Do not unnecessarily install application dependencies directly on the Ubuntu host.

The host should primarily provide:

- Docker
- networking
- storage
- OS services

---

# 37. Database Backup and Restore

Implement documented database backup/restore procedures.

The system must be recoverable.

Document:

- Database backup
- Database restore
- Application deployment
- Environment configuration
- Migration process

Do not assume production is recoverable simply because Docker exists.

---

# 38. Health Checks

Implement:

```text
/health
/ready
```

Health checks should distinguish:

- Application running
- Database reachable
- Redis reachable
- Required dependencies available

Docker health checks should use these where appropriate.

---

# 39. Logging

Use structured application logging.

Logs should make it possible to troubleshoot:

- Authentication
- API errors
- Database problems
- Background jobs
- Integrations
- Email processing
- Teams integration
- Missive integration
- AI calls

Never log:

- Passwords
- Tokens
- Client secrets
- API keys
- Sensitive authentication information

---

# 40. Error Handling

Create consistent error handling.

Frontend should provide useful user-facing messages.

Backend logs should contain useful diagnostic information.

Do not expose stack traces or internal implementation details to normal users.

---

# 41. Performance

The application must remain responsive.

Pay particular attention to:

- Ticket search
- Ticket list loading
- Dashboard queries
- Reporting queries
- Ticket timeline loading

Use appropriate database indexes.

Avoid N+1 queries.

Paginate large result sets.

Do not load an entire ticket database into the browser.

---

# 42. Testing Requirements

Every major feature must include tests.

At minimum:

### Unit

Business logic.

### Integration

Database/service interaction.

### API

Authentication and authorization.

### E2E

Critical user workflows.

At minimum test:

1. User logs in.
2. User creates ticket.
3. Technician sees ticket.
4. Technician assigns ticket.
5. Technician transfers ticket.
6. Technician adds internal note.
7. Technician sends public reply.
8. User cannot see internal note.
9. Ticket status changes.
10. Ticket is resolved.
11. Ticket is reopened.
12. Search finds ticket.
13. Client A cannot access Client B ticket.
14. Attachments respect authorization.
15. SLA is calculated correctly.
16. Dashboard displays correct values.

---

# 43. Client Isolation Tests

These are mandatory.

Create automated tests proving:

```text
Client A user
    ↓
Can access Client A tickets

Client A user
    ↓
Cannot access Client B tickets
```

Also test:

- API direct access
- Ticket IDs
- Attachments
- Search
- Reports
- Knowledge articles where client restrictions apply

Do not rely on UI behavior.

---

# 44. Migration Strategy

Database migrations must be repeatable.

A new clean database must be able to run:

```text
migration
→ seed/configuration
→ application startup
```

without manual database editing.

Do not require developers to manually alter PostgreSQL tables.

---

# 45. Seed Data

Create LAB seed data.

Include realistic sample:

- Clients
- Users
- Technicians
- Categories
- Tags
- Tickets
- Comments
- Internal notes
- Assignments
- Transfers
- SLA data

Clearly identify seed/test data.

Do not place fake production credentials in seed data.

---

# 46. Documentation

Maintain documentation as the system is built.

Create at least:

```text
README.md

docs/
 ├── architecture.md
 ├── deployment.md
 ├── configuration.md
 ├── database.md
 ├── authentication.md
 ├── security.md
 ├── testing.md
 ├── backup-restore.md
 ├── integrations.md
 └── troubleshooting.md
```

Documentation must match the actual implementation.

Do not document features that do not exist.

---

# 47. Git Repository

Maintain a clean Git repository.

Recommended structure:

```text
/apps
/packages
/infra
/docs
/tests
/scripts
```

Adjust the structure if a better architecture is justified.

Use:

```text
.env.example
.gitignore
README.md
```

Never commit:

- `.env`
- passwords
- secrets
- API keys
- certificates/private keys
- database dumps containing sensitive data

---

# 48. Development Phases

Do NOT attempt to build the entire application blindly in one step.

Work through controlled phases.

## Phase 0 — Foundation

Build:

- Repository
- Docker
- Next.js
- Backend
- PostgreSQL
- Redis
- Configuration
- Health checks
- CI/local test foundation
- Initial database migration

Validate the environment.

---

## Phase 1 — Identity and Core Database

Build:

- Entra authentication
- Users
- Roles
- Clients
- Contacts
- Sites
- Assets
- Categories
- Tags
- Audit foundation

Test authentication and authorization.

---

## Phase 2 — Ticket Engine

Build:

- Ticket creation
- Ticket numbering
- Status
- Priority
- Category
- Tags
- Requester
- Client
- Assignment
- Transfer
- Comments
- Internal notes
- Public replies
- Attachments
- Ticket history

This is the core system.

Do not proceed until it works reliably.

---

## Phase 3 — Search

Build the powerful ticket search.

Test:

- Ticket number
- Subject
- Client
- Requester
- Technician
- Comments
- Internal notes
- Tags
- Source

Test search performance.

---

## Phase 4 — Technician Portal

Build:

- Technician dashboard
- Ticket queue
- Ticket page
- Assignment
- Transfer
- Internal notes
- Public replies
- Filters
- Search
- Status management

Optimize the workflow for real MSP technicians.

---

## Phase 5 — Client/User Portal

Build:

- Ticket creation
- Ticket list
- Ticket details
- Public replies
- Attachments
- Client isolation

Users must never see internal notes.

---

## Phase 6 — SLA / Notifications

Build:

- SLA policies
- SLA timers
- At-risk status
- Breach handling
- Notifications
- Background jobs

---

## Phase 7 — Reporting / Management

Build:

- Technician reports
- Client reports
- SLA reports
- Dashboard
- Transfer reporting
- Source reporting
- Trends
- CSV/Excel export where appropriate

---

## Phase 8 — Knowledge Base

Build:

- Articles
- Categories
- Search
- Ticket linking
- Permissions

---

## Phase 9 — AI

Build:

- Ticket summary
- Category recommendation
- Priority recommendation
- Assignment recommendation
- Suggested response
- Similar tickets
- KB suggestions
- Duplicate detection

Use OpenAI API.

Do not build a separate AI server.

---

## Phase 10 — Integrations

Implement integrations in controlled order:

1. Email
2. Microsoft Teams
3. Missive
4. Monitoring/Zabbix
5. Other integrations as required

Do not let integration development destabilize the core ticketing system.

---

# 49. LAB → Production

The LAB environment is the development/staging environment.

When the application is production-ready:

1. Build production application release.
2. Build/prepare production database.
3. Configure production environment variables.
4. Configure production Entra application.
5. Configure production email.
6. Configure production integrations.
7. Configure production DNS/reverse proxy/Cloudflare as required.
8. Apply database migrations.
9. Run production health checks.
10. Test authentication.
11. Test ticket creation.
12. Test assignment.
13. Test replies.
14. Test notifications.
15. Test integrations.
16. Enable backups.
17. Enable monitoring.
18. Perform final acceptance testing.
19. Move into production.

Do not copy LAB secrets into production.

Prefer a clean production database.

Only move LAB ticket data to production if explicitly required through a controlled backup/restore process.

---

# 50. Cloudflare / Internet Exposure

Cloudflare or another approved reverse-proxy/tunnel solution may be used during production deployment.

Do not make this a requirement for local LAB development.

LAB should work internally without depending on Cloudflare.

Production should expose only the necessary application endpoint.

Never expose PostgreSQL directly to the Internet.

---

# 51. What NOT to Build

Do NOT add unnecessary complexity such as:

- Multi-tenant SaaS billing
- Subscription management
- Marketplace
- Generic plugin marketplace
- Customer self-registration unless required
- Multiple database engines
- Kubernetes
- OpenSearch from day one
- Separate AI infrastructure
- Microservices for every feature
- Generic deployment modes
- Public API marketplace
- Product licensing
- Redistribution functionality

This system is for our MSP environment.

Favor maintainability and reliability over theoretical scalability.

---

# 52. Coding Standards

Use:

- Strict TypeScript
- ESLint
- Prettier
- Clear naming
- Small maintainable modules
- Proper error handling
- Dependency injection where appropriate
- DTO validation
- Secure defaults
- Database transactions where necessary
- Meaningful comments only where logic is non-obvious

Avoid:

- `any` unless genuinely necessary
- duplicated business logic
- giant files
- giant functions
- hard-coded configuration
- hidden authorization assumptions

---

# 53. Required Self-Check After Each Phase

Before declaring a phase complete, run:

1. TypeScript compile
2. Lint
3. Unit tests
4. Integration tests
5. API tests
6. Database migration test
7. Production build
8. Start application
9. Health check
10. Readiness check
11. Critical Playwright tests where applicable

If anything fails:

- Diagnose it.
- Fix it.
- Rerun the failed test.
- Rerun the relevant full test suite.
- Do not claim completion while known failures remain.

---

# 54. Definition of Done

A feature is NOT complete merely because the code exists.

A feature is complete when:

- Backend implemented
- Frontend implemented
- Database migration implemented
- Authorization implemented
- Validation implemented
- Tests implemented
- Error handling implemented
- UI works
- API works
- Documentation updated
- Production build succeeds
- Relevant tests pass

---

# 55. Important Development Rule

Do not make major architectural changes without explaining why.

If a requirement is ambiguous:

1. Identify the ambiguity.
2. Choose the simplest sensible implementation consistent with this specification.
3. Document the decision.
4. Continue development.

Do not repeatedly stop for minor questions.

Ask for clarification only when a decision would materially affect the architecture, security, data model, or user workflow.

---

# 56. Initial Task

Start with **Phase 0 only**.

Do NOT immediately build the complete ticketing system.

First:

1. Inspect the repository.
2. Determine whether it is empty/new or contains existing work.
3. Establish the project structure.
4. Create the application architecture.
5. Configure Docker.
6. Configure PostgreSQL.
7. Configure Redis.
8. Configure Next.js.
9. Configure backend.
10. Configure environment handling.
11. Configure database migrations.
12. Configure health/readiness endpoints.
13. Configure testing.
14. Configure linting/formatting.
15. Create initial documentation.
16. Verify the complete Phase 0 stack actually runs.

At the end of Phase 0 provide:

- What was created
- Directory structure
- Docker services
- Ports
- Environment variables
- Database connection status
- Redis status
- Health endpoint result
- Test results
- Build results
- Any remaining issues

Then STOP and wait for approval before starting Phase 1.

Do not skip validation.

Do not claim something works unless you actually tested it.

# Final Objective

Build a reliable internal MSP ticketing system that can replace the current osTicket workflow and eventually centralize requests coming from:

```text
Missive
Microsoft Teams
Email
Phone
Client Portal
Monitoring
Technicians
```

The finished system should provide:

```text
Client Management
        ↓
Requester / Contact
        ↓
Ticket
        ↓
Assignment / Transfer
        ↓
Technician Work
        ↓
Internal Notes / Customer Replies
        ↓
SLA
        ↓
Resolution
        ↓
Reporting
        ↓
AI Assistance
        ↓
Integrations
```

The priority order is:

**Reliability → Security → Usability → Search → Reporting → Integrations → AI**

Build the core system correctly first.

Do not sacrifice the ticketing fundamentals to add AI or integrations early.
