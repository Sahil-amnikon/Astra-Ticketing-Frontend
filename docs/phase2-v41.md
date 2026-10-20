# Phase 2 v41 LAB release

V41 improves the Knowledge Base and Service Catalogue layout. The search area
now uses a full-width toolbar panel with a correctly sized search box, aligned
actions, a clearer empty state and responsive pagination.

No database migration is required for this release. Existing users, roles,
permissions, tickets, mailbox settings and mail encryption key are preserved.

To upgrade LAB: verify the package checksum, extract alongside v40, run
`sh scripts/configure-v41-lab.sh`, build backend/frontend, run migrations twice
(expect 0 then 0), recreate backend/worker/frontend, wait for healthy services,
and check the Knowledge Base page.
