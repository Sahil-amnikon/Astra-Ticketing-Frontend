# Amnikon development rules

Read docs/master-development-prompt.md before making changes. It is the supplied
product specification. Phase 0 was validated in LAB, Phase 1 v9 was validated in
LAB, and the user explicitly approved the Phase 2 ticket engine and focused
Technician/Admin workspaces on 15 September 2026. Current scope is Phase 2 only.

Use the existing Next.js/NestJS/PostgreSQL architecture. Maintain strict TypeScript,
server-side security boundaries, documentation and meaningful tests. Never add
real credentials or claim unexecuted tests passed. See docs/validation.md for the
last recorded results and remaining environment-dependent checks.
