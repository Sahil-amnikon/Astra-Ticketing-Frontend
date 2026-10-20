# Phase 2 v42 LAB release

V42 fixes the account and sign-out controls at the top right of the Knowledge
Base, Service Catalogue, CAB policy, Email Administration and Service
Performance pages. The shared header now shows the signed-in user's avatar,
name and role next to notifications and keeps its actions on one row. On narrow
screens the account label and duplicate Switch workspace link yield space for
notifications and Sign out; Switch workspace remains in the sidebar.

No database migration is required. Existing users, roles, permissions, tickets,
mailbox settings and encryption key are preserved.

For LAB: verify the package checksum, extract alongside v41, run
`sh scripts/configure-v42-lab.sh`, build backend and frontend, run migrations
twice (expect 0 then 0), recreate backend, worker and frontend, wait for healthy
services, and inspect the header on Knowledge Base and Email Administration.
