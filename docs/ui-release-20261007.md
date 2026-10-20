# Amnikon v52 frontend release — 7 October 2026

The interface update is deployed at https://ticketing-lab.amnikon.net/ on the existing web VM `172.16.3.5`. The deployment completed at 19:12:48 IST (13:42:48 UTC). The application continues to use its existing backend and database VM `172.16.4.5`.

## Delivered interface changes

- Corporate teal theme, clearer page hierarchy and consistent controls.
- Grouped navigation across ticket workspaces, changes, reporting, administration and extension screens. Existing permission checks and available routes are retained.
- Admin, management and technician dashboards retain all eight original metrics and use the existing dashboard API. No sample values are embedded in the deployed application.
- Ticket activity chart with created/resolved totals and an accessible daily-count table.
- SLA attention panel and working shortcuts into existing queues, plus new-ticket/in-progress queue shortcuts.
- URL shortcuts accept only existing status and SLA filter values. They cannot override API scope, client ownership, pagination or permissions.
- Mobile header spacing and navigation that closes when opening extension screens.

Six existing frontend files were modified and four frontend files were added. The exact file list and source hashes are in `releases/amnikon-ui-20261007/manifest.json`.

## Preserved application behavior

Ticket creation, assignment, transfer, replies, internal notes, attachments, search, saved views, boards, approvals, change workflows, catalogue, knowledge, email administration, help and reporting retain their existing handlers and APIs. The interface presents the permissions returned by the existing session; server authorization remains authoritative.

No database migration, database restore, ticket renumbering, attachment move, backend/worker update, SSO setting change, firewall change or environment-secret edit was performed. The deployment verified that backend, worker, Redis and SearxNG container IDs and start times were unchanged. It also verified that the existing `.env` file was unchanged.

The full multi-MSP hierarchy, new platform-wide numbering, CMDB/problem capabilities and broader backend extensions remain separate future work described by the production blueprint. This release does not claim to implement those capabilities.

## Executed validation

- Linux production frontend build using the existing Dockerfile, Node 24 and Next.js 16.3.5: passed.
- Frontend TypeScript check: passed.
- ESLint for the changed TypeScript/TSX files: passed.
- Prettier checks for the changed frontend files: passed; the final mobile CSS correction was also formatted locally before its production build.
- Ten navigation, role-preservation and shortcut-contract tests: passed locally and in the VM validation image.
- Twelve Edge browser checks across admin, management and technician workspaces: passed against the exact candidate image and again against the public site. These cover original metric availability, grouped permitted navigation, daily chart counts, desktop/mobile layout, scoped SLA shortcuts, injection-resistant URL filtering and menu closing.
- Public `/ready`: HTTP 200.
- Public `/api/auth/me` without credentials: HTTP 401.
- Temporary candidate preview container: removed after deployment verification.

Browser UI checks used isolated API fixtures; they did not write production tickets or approvals. Live authenticated SSO, email delivery and every ticket mutation were not replayed. Existing backend/worker images, server authorization code and integration configuration were preserved rather than being replaced by a demo backend.

Screenshots and browser results are in `outputs/v52-ui-qa/`. Their ticket values are test fixtures, not a snapshot of production customer data.

## Deployment and rollback records

| Item | Value |
| --- | --- |
| Frontend image | `amnikon-web:ui-20261007` |
| Frontend image ID | `sha256:73a6c85cd7285b6b767ed1d93414fcb913f2933a9f3dd816fcbac7f2a58fabc1` |
| Previous frontend image | `amnikon-web:rollback-ui-20261007` |
| Previous image ID | `sha256:b9c827c71e6e562b5bdf1ea36a5c2f2894de0d8edb6b788050fb10ad6c9790c5` |
| Live source | `/home/itadmin/amnikon-lab/amnikon-ticketing-v52-help-search/v52` |
| Release and rollback folder | `/home/itadmin/amnikon-lab/ui-releases/ui-20261007` |
| Compose frontend override | `infra/compose.web.ui.yml` |

The original image and six original UI source files are preserved on the web VM. `deployment-result.json` records the deployed image, container and protected-service checks. No database backup/restore was used for this interface release.

## Maintaining this release

The existing API release tag is retained. A small Compose override selects only the updated frontend image. Include this override when maintaining the current v52 deployment; using the base Compose file alone would select its original frontend image tag.

To bring up only the current frontend:

```bash
cd /home/itadmin/amnikon-lab/amnikon-ticketing-v52-help-search/v52/infra
sudo docker compose --env-file ../.env -p amnikon-web \
  -f compose.web.yml -f compose.web.ui.yml \
  up -d --no-deps --no-build frontend
```

To restore the previous frontend and original UI source:

```bash
sudo python3 /home/itadmin/amnikon-lab/ui-releases/ui-20261007/deploy-frontend.py --rollback
```

The rollback script checks hashes before restoring files and refuses to overwrite later edits. It switches only the frontend, waits for health and keeps the backend, worker and database in place. A future full application release should review and incorporate this frontend override explicitly.

This is a single-instance frontend deployment, so replacing its container entails a brief restart. Existing sessions remain in the unchanged backend/session store.
