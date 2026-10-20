# Phase 2 v21

Phase 2 v21 is the dedicated ticket-search release built on the deployed v20
baseline. It implements Phase 3 search without changing ticket authorization
scope.

## Ticket search

- One search box covers ticket number, subject, description, client, requester
  name/email, assigned technician, source, category, comments and tags.
- Search operators can be combined with ordinary words: `client:"Example"
status:open VPN`.
- Supported operators are `client`, `status`, `assigned`, `priority`, `source`,
  `category`, `tag`, `site` and `sla`.
- Exact filters are available for status, priority, client, site, technician,
  category/subcategory, source, tag, SLA state and created-date range.
- PostgreSQL full-text and trigram indexes support the search workload without
  adding a separate search service.

## Saved views

- Each staff user can save and reuse personal filter combinations.
- Reusing a name updates that user's existing view.
- Saved views are isolated by user at the API and database query layers.
- Search and saved views continue to apply backend client, site, ownership and
  role restrictions.

## Database

- Migration 011 adds search indexes and the `saved_ticket_views` table.
- The migration advances schema state from version 10 to 11.
