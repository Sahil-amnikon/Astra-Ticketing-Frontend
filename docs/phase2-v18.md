# Phase 2 v18

Phase 2 v18 completes the ticket-intake refinements requested during v17 LAB
acceptance. It is cumulative and includes the corrected migration 008.

## Ticket intake

- `Other` is available directly beside Missive, Microsoft Teams, Phone Call,
  SMS and Email in the Source selector.
- The broken and unnecessary Ticket Sources navigation item is removed.
- A new ticket accepts up to four optional attachments, each no larger than 5 MB.
- Technicians can choose files or paste clipboard screenshots with Ctrl+V.
- Selected images have a preview and can be removed before submission.
- Ticket creation and initial attachments use one database transaction.

## Categories

- New Ticket has separate Category and Subcategory selectors.
- The Subcategory selector is filtered by its selected parent Category.
- Reports and ticket details display the full `Category → Subcategory` path.
- Migration 010 adds a standard IT support hierarchy without replacing or
  changing existing custom categories.

## Database

- Migration 008 explicitly casts the legacy permission seed `NULL` to UUID.
- Migration 009 adds the fixed `Other` source.
- Migration 010 adds the standard category hierarchy and advances schema state
  to version 10.

## Audit privacy and readability

- Audit details resolve stored record references to readable names when the
  referenced record still exists.
- Camel-case and database field names are normalized so one change is not shown
  twice.
- Internal record UUIDs are no longer displayed in the standard audit view.
- Phone numbers and email addresses are removed from new audit payloads and
  suppressed when older audit records are displayed.
