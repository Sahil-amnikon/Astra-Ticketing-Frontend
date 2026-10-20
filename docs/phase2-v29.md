# Phase 2 v29

V29 is a focused notification read-state correction built cumulatively from
v28. It does not change database schema 12.

- Empty-body notification PATCH requests no longer declare JSON content. This
  prevents Fastify from rejecting Mark all read and individual read updates
  with HTTP 400.
- Mark all read immediately clears the local unread badge and item highlighting,
  then confirms state from the server.
- A visible notification error is shown if an update genuinely fails.
- V28's modern visual system and workspace-aware ticket navigation are retained.
