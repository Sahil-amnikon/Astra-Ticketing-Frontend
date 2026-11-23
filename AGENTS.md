# ASTRA frontend development

This repository contains the current React/TypeScript/Vite frontend. Earlier Next.js/NestJS/PostgreSQL instructions describe historical versions, retained in Git history.

- Read README.md and preserve the current backend API contract and workspace access rules.
- Keep credentials, generated builds, application data and diagnostic logs out of Git.
- Run `npm run build` for frontend changes; add focused verification for meaningful behavior changes.
- Enforce authorization in the backend, not just by hiding UI controls.
- Use the existing maintenance deployment workflow. A source push is not permission to change production data or deploy.
- Report verification honestly. Do not create backups or database copies unless the user explicitly requests them.
