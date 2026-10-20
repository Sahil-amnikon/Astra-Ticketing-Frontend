# Phase 2 v40 LAB release

V40 fixes administrator ticket assignment. Administrator access remains the full
system profile, and administrators can now create tickets assigned to themselves
or another administrator even when no explicit client or site membership exists.
The ticket assignment validator now treats administrator access as unrestricted
for client and site scope, matching the Users & Access screen.

The Users & Access copy also states that administrators can create, assign, own
and receive tickets. Scoped client and site restrictions continue to apply to
non-administrator staff profiles.

No database migration is required for this release. Existing users, roles,
permissions, mailbox settings and mail encryption key are preserved.

To upgrade LAB: verify the package checksum, extract alongside v39, run
`sh scripts/configure-v40-lab.sh`, build backend/frontend, run migrations twice
(expect 0 then 0), recreate backend/worker/frontend, wait for healthy services,
and test ticket creation as an administrator.
