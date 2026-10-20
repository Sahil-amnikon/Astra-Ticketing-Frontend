# Phase 2 v19

Phase 2 v19 is the cumulative replacement for the un-deployed v18 candidate.
It includes all v18 ticket-intake and category improvements plus a privacy-first
Audit History correction.

## Ticket intake

- `Other` appears directly in the Source selector with Missive, Microsoft Teams,
  Phone Call, SMS and Email.
- The unused Ticket Sources administration link is removed.
- New tickets accept up to four optional attachments, each no larger than 5 MB.
- Technicians can choose files or paste clipboard screenshots with Ctrl+V.
- Selected images have previews and can be removed before submission.
- Ticket creation and its initial attachments use one database transaction.

## Categories

- New Ticket has separate Category and Subcategory selectors.
- Subcategories are filtered by the selected parent category.
- Reports and ticket details display the full `Category → Subcategory` path.
- The standard IT-support category hierarchy is added without replacing existing
  custom categories.

## Audit privacy and readability

- Audit records show readable record names when the referenced record exists.
- Internal UUIDs are suppressed in the standard audit view.
- Camel-case and database field names are normalized to prevent duplicate rows.
- Requester phone numbers and email addresses are stripped from new audit
  payloads and suppressed when older audit records are displayed.
- A regression test verifies that contact updates cannot expose phone or email
  values in Audit History.

## Database

- Migration 008 explicitly casts the legacy permission seed `NULL` to UUID.
- Migration 009 adds the fixed `Other` source.
- Migration 010 adds the standard category hierarchy and advances schema state
  to version 10.
