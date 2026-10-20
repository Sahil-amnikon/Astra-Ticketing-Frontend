# Phase 2 v38 LAB release

V38 builds on deployed v37 and applies migrations 017 and 018. Existing tickets,
contacts, roles and change history are retained. This is a LAB candidate until
the real database, Entra, mailbox and rendered workflows are checked.

## Change management and CAB

Administrators configure CAB reviewer groups, approval quorum, change plan
templates and blackout windows. Reviewers vote independently; a proposer cannot
approve their own change. Changing a plan or schedule invalidates prior votes.
Overlapping schedules and blackouts are flagged, with a recorded override reason
required for an authorized exception. Post-implementation reviews record the
actual outcome and follow-up. Change Management stays in the normal workspace.

## Internal ticket email and external participants

Administration > Email configures SMTP2GO for **internal ticket notifications
only**. The sender/reply address is `it@amnikontechnologies.com`. Ticket
creation, assignment or transfer, status change, and public reply can notify
the current assigned technician, team leads scoped to that client/site, and
admins. Other technicians receive email only after they become the assigned
technician. Requesters and other client contacts never receive ticket email;
internal note contents are never included. The worker rechecks roles and scope
before sending. CAB cannot queue or send email, including from the API. The
reserved `change@amnikontechnologies.com` address is unused in this release.
Verify the ticket sender in SMTP2GO and test internal delivery before enabling
outbound mail. SMTP credentials are encrypted with `MAIL_CONFIG_KEY`; the
configuration helper creates this key once, so back it up with the database.

Incoming ticket replies are optional and require a Microsoft 365 ticket
mailbox and mailbox-scoped Entra application access. SMTP2GO handles outgoing
only. The inbox reads `it@amnikontechnologies.com` only; it ignores messages
from anyone other than active staff accounts. Replies from authorized staff
matching a single ticket thread appear in the ticket's staff history.
Ambiguous or untrusted internal messages wait for admin review. CAB mail and
inbox processing are disabled. If the incoming provider is not Microsoft 365,
keep incoming disabled until the matching adapter is added. Legacy
`CHANGE_EMAIL_ENABLED` remains false.

An admin can link an Entra USER account to a client contact with the same email,
granting client/site access explicitly. The client portal displays that person's
tickets and public replies/files. It does not show staff email history. Contacts
without portal access need a technician to enter updates manually. No local
password or self-registration is included.

## Service management

Scoped knowledge articles, catalogue templates, ticket article links, and service
reports with CSV export are available. Client visibility is explicit; staff
notes and files remain private.

## Upgrade and acceptance

Verify ZIP checksum, extract alongside v37, back up the v37 directory and
database, and run `sh scripts/configure-v38-lab.sh` from v38. It copies the v37
environment when needed, preserves existing secrets, sets the v38 release tag,
and generates `MAIL_CONFIG_KEY` once without printing it. Build backend and
frontend, apply migrations twice (first 2, then 0), and recreate backend,
worker, frontend. Confirm healthy services, HTTPS, sign-in, and role access.

Test CAB quorum, proposer exclusion, blackouts/override, plan changes, reviews,
ticket replies/attachment visibility, client isolation, email settings access,
and knowledge visibility. Configure real SMTP2GO settings only after the LAB
upgrade is healthy. If an upgrade fails after migrations, restore the pre-v38
database backup along with v37 before restarting v37 images; replacing images
alone does not reverse the schema.

Automated validation covers an isolated PostgreSQL-compatible migration run
with a v37 data-preserving upgrade, API tests, TypeScript, lint, formatting and
production builds. Live PostgreSQL 16, Entra, SMTP2GO, incoming M365 mail and
rendered browser workflows remain deployment acceptance checks.
