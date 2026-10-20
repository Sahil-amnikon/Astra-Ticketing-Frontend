# Phase 2 v33

V33 is a cumulative correction and extension release from v32. It fixes the
Departments route and adds explicit change stakeholders, change evidence, and
client-specific incident numbering. In-product AI and the client self-service
portal remain deferred.

## Change stakeholders and evidence

- A draft change can include multiple internal users and multiple external
  email-only stakeholders.
- External entries may use `Name <email@example.com>` or an email address.
- Internal stakeholder membership grants access only to the selected change; it
  does not grant access to other client tickets or changes.
- External stakeholders never receive portal access automatically.
- Coordinators can add stakeholders after creation.
- Change attachments support PDF, ZIP, DOCX, XLSX, GIF, JPEG, PNG, CSV and text,
  with a 5 MB per-file limit and authorized download checks.

## Departments and internal users

- `/admin/departments` is an allowed administration route again.
- Administrators can create departments and mark selected department members as
  leads from Users & Access.
- Intern supervision remains mandatory, but the access-expiry field and expiry
  enforcement are removed. Existing expiry values are cleared by migration 014.

## Client-specific ticket numbers

- Every client receives a unique, editable 2–8 character uppercase ticket
  prefix.
- Known LAB organizations are initialized as `RAV`, `GEO`, and protected
  internal organization `INT`.
- Existing `INC-000001`-style values are converted without changing ticket UUIDs
  or relationships.
- New ticket numbers are allocated atomically per client, for example
  `RAV-000001`, `GEO-000001`, and `INT-000001`.
- Editing a client prefix affects only future tickets. Historical ticket numbers
  remain stable after migration.

## Migration

Migration `014_change_stakeholders_attachments_ticket_prefixes.cjs` is cumulative
from schema 13 and advances `app_schema_state` to 14. The first v32 to v33 run
must apply one migration and the immediate repeat must apply zero.

## Acceptance focus

1. Confirm existing tickets retain their data and show the expected client
   prefix.
2. Open Departments & Expertise, create a department, and assign a department
   lead from Users & Access.
3. Confirm Intern configuration requires a supervisor but has no expiry field.
4. Raise a change with two internal stakeholders and one external email.
5. Confirm an internal stakeholder can open that change but cannot browse
   unrelated client data.
6. Upload and download change evidence; verify an unauthorized account cannot
   retrieve the attachment URL.
