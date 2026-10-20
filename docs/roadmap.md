# Consolidated roadmap — 15 September 2026

The original master specification is retained as the source brief. This addendum
records the subsequent approved Phase 1 design and the additional ITSM Word brief.
The Word document's MVP spans several implementation phases, not Phase 1 alone.

| Phase | Scope                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Identity, core data, Azure lookup, access management, administration UI, audit                                                 |
| 2     | Reliable ticket lifecycle, number/source/thread fields, transfers, public/internal comments, authorized attachments            |
| 2B    | Dedicated changes: intake, types, risk/impact, basic approvals, scheduled window, implementation/test/rollback plans and audit |
| 3     | Permission-aware PostgreSQL ticket search and filters                                                                          |
| 4     | Technician queues and operational ticket/change workflows                                                                      |
| 5     | User portal: own tickets/changes and permitted interaction                                                                     |
| 6     | SLA calendars/timers, escalation and asynchronous notifications                                                                |
| 6B    | Email ingestion/replies/threading/deduplication, brought ahead of AI to satisfy MVP                                            |
| 7     | Real management, client, technician, SLA and change reports                                                                    |
| 8     | Knowledge base and service catalogue workflows                                                                                 |
| Later | Advanced CAB/workflows, CMDB/discovery, Teams/Missive/monitoring integration, advisory AI                                      |

## Current Phase 2 v13 scope

The user approved bringing the focused Technician, Management and Administration workspaces forward with
the ticket engine. V10 therefore ships ticket Dashboard, New Ticket, My Tickets,
all-ticket admin oversight and ticket detail workflows. This is not the full
Phase 3/4 scope: advanced search operators, operational filters and further queue
optimization remain after LAB validation of the core engine.

Only Missive, Microsoft Teams, Phone Call, SMS and Email are selectable sources.
Walk-in, WhatsApp, Monitoring, Internal/Manual and client-portal intake are not
active. Assets and Knowledge Base are removed from active navigation. Client/user
self-service stays deferred until after the staff workflow goes live.

Ticket-level approval requests and ADMIN/MANAGER decisions are included. They do
not replace Phase 2B Change Management approvals. The user approved an early,
manual SLA/reporting increment in v11: editable priority response/resolution
targets, live at-risk/breach statistics, technician workload reports, and CSV or
Excel-compatible export. These use real ticket and assignment history. Business
V26 delivers configurable calendars, holidays, paused clocks and in-app
notifications as the first Phase 6 increment. External delivery and configurable
escalation chains remain later Phase 6 work.
V12 corrects sign-out, adds individual-technician ticket-detail reports and exports,
and requires a configurable category on new tickets. It does not add AI; AI remains
deferred until the core workflow and suitable infrastructure are approved.
V13 adds the role-authorized workspace selector, the Management workspace, and
scrollable navigation. It does not let users assume roles they have not been assigned.

## Change Management design — future implementation, not shipped in v7

Use a first-class change_requests entity with UUID identity and a distinct CHG
number. Each change belongs to a client. Store requester, owner, type, category,
affected service/assets, justification, impact, risk, requested/planned window,
implementation plan, validation plan, rollback plan and completion outcome.

Lifecycle: Draft → Submitted → Assessment → Approval → Scheduled → Implementation
→ Validation → Completed/Closed, with explicit Rejected, Cancelled and Emergency
transitions. Guard transitions in the backend. Retain versioned approval decisions
and actor/time/reason history; a material change to approved content invalidates
that approval. Prevent self-approval when separation of duties is required.

Standard changes require a pre-authorized template, not just the requester
selecting Standard. Normal changes require approval. Emergency changes require
an explicit expedited approval path and review; urgency never silently skips audit.

Phase 2B includes basic approvals and scheduling. Configurable approval chains,
CAB, blackout/conflict detection, calendar UI and orchestration can follow.
Links to tickets and assets respect client boundaries. Assigned reviewers only
receive permitted records. Internal implementation notes stay hidden from clients.

Do not create unused change tables or nonfunctional navigation in Phase 1.
