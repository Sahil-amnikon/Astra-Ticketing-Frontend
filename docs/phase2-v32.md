# Phase 2 v32

V32 is a cumulative release from v31. It adds an internal-workforce model,
controlled intern access, cross-team ticket collaboration, and Change Management.
It does not enable the deferred client self-service portal or in-product AI.

## Internal staff and interns

- A protected `Amnikon Internal` organization keeps internal tickets inside the
  existing organization-isolation model.
- Staff work scope is `Internal`, `Client`, `Both`, or administrator-wide.
- Intern accounts require a supervisor and expiry date. Expired accounts are
  rejected by session validation.
- Departments and expertise keywords support internal queues, change teams, and
  specialist discovery.
- Interns can see assigned or collaborative tickets, add internal notes and
  attachments, and request help. They cannot public-reply, transfer, change
  lifecycle controls, request approval, resolve, or close tickets.
- Help can target a person or department. Acceptance adds only that person as a
  ticket collaborator; it never grants access to unrelated tickets.

## Change Management

- Independent access profiles: None, Contributor, Coordinator, Approver and
  Change Manager. Administrator always has full access.
- Numbered `CHG-000001` records for server, cloud, Microsoft 365, network,
  security, application and other changes.
- Standard, Normal and Emergency change types; risk, impact, outage and planned
  window controls.
- Implementation, testing, rollback and communication plans.
- Department teams, assigned tasks, sequenced individual/department approvals,
  incident links, updates, calendar view and immutable history.
- Required approvals block implementation. Rejection and changes-requested
  decisions change the workflow state.
- Client/stakeholder messages are controlled drafts. Optional delivery uses
  Microsoft Graph only when explicitly configured; no message content, recipient,
  access token or secret is written to application logs.

## Migration

Migration `013_internal_change_management.cjs` is additive and preserves all
existing users, clients and tickets. It advances `app_schema_state` to 13. The
first v31 to v32 run must apply one migration and the immediate repeat must apply
zero.

## Acceptance focus

1. Confirm existing tickets and v31 access remain intact.
2. Create departments and assign staff expertise.
3. Add one expiring Intern with Internal scope and a supervisor.
4. Create an internal requester and ticket under `Amnikon Internal` with a
   department; validate intern restrictions and help acceptance.
5. Enable Change access for test staff, raise a Normal change, add teams/tasks and
   approvals, prove implementation is blocked until approval, then complete the
   workflow.
6. Leave change email disabled unless Graph `Mail.Send` application permission,
   tenant admin consent and an approved sender mailbox have been authorized.
