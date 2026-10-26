# ASTRA — SPARK UI review

The ASTRA frontend now follows the visual language and feature organization of
[`Hamza-amnikon/Orbit`](https://github.com/Hamza-amnikon/Orbit), inspected at commit
`359d13bac854dbd425a9f91410981080dde430a2`.

## Open the running review

- Workspace: `http://172.31.3.13:3100/ui-preview`
- Tickets: `http://172.31.3.13:3100/ui-preview?module=tickets`
- Login: `http://172.31.3.13:3100/ui-preview?module=login`

These addresses require network access to the existing ASTRA development host.
The standalone review runs on port 3100 and uses fictional records only. It does
not connect to the live API, send messages, or authenticate a user. Preview
editing lasts for the current browser session and resets on a full reload.

## Run from source

Use Node.js 24, from the repository root:

```sh
npm ci
npm run typecheck:web
npm run build:web
npm run preview
```

Open `http://localhost:3100/ui-preview` on the machine running the server.
Set `ASTRA_UI_PORT` to choose another port. `npm run dev:preview` starts a
development server with Webpack. The review handed to the user uses the verified
production build, avoiding the environment's Turbopack hot-reload transport issue.

`npm run test:ui` runs the UI browser suite. It starts the production preview if
needed; build first. To use a running instance on another address, set
`UI_PREVIEW_URL`. Install the browser once with `npx playwright install chromium`.

## SPARK-style frontend structure

```text
frontend/
  app/                         # Thin Next.js routes and API gateway
  pages/README.md              # Router boundary; do not remove
  public/                      # ASTRA brand assets
  src/
    Admin/                     # Administration feature components
      change-governance/
      client-domains/
      email/
      groups/
      service-management/
    components/
      layout/
        DashboardLayout/       # Shared workspace frame
        Navbar/                # Notifications, search, appearance controls
        Sidebar/               # Role-filtered navigation and scroll handling
      ui/                      # Brand, icons, dialogs, metric cards, help
    context/                   # Appearance provider
    pages/
      Changes/
      Client/
      Dashboard/
      Help/
      Knowledge/
      Login/components/
      Management/
      Preview/components/
      Preview/data/
      Problems/
      Reports/
      Support/
      Tickets/components/
    routes/                    # Navigation definitions
    theme/                     # Shared SPARK palette and responsive styles
    utils/                     # CSV download utility
```

The full file tree is recorded in `frontend/STRUCTURE.md`. All 103 existing
frontend files were retained and reorganized. Their relative imports, workspace
configuration, Docker paths, and standalone packaging were updated. Existing
authenticated route URLs and backend contracts remain connected.

Next.js reserves `src/pages` as a router name. The empty root `frontend/pages`
boundary makes `src/pages` an ordinary feature folder; routes remain in
`frontend/app`. A production build confirms that feature components are not
published as unintended endpoints. The Next.js architecture is retained; ASTRA
has not been converted to Vite or Material UI. It adapts SPARK's presentation and
organization while keeping the existing application contracts.

## Shared design changes

- White navigation with blue active items and grouped module links.
- SPARK palette: `#2563EB`, `#111B4B`, `#5B77A1`, and `#E2E9F2`.
- Pale blue workspace, rounded cards, metric accents, consistent table headers.
- Shared navbar search with Ctrl/Command K and persisted light/dark appearance.
- Shared sign-in presentation and metric cards used by existing ASTRA routes.
- Consistent forms, buttons, statuses, focus indicators, and mobile navigation.
- Reduced-motion handling and native modal focus management.

## Review coverage

The review contains 25 navigable screens: dashboard, all/team/internal tickets,
changes, problems, knowledge, service catalogue, clients, contacts, sites,
assets, reports, SLA policies, users, groups, categories, email administration,
audit history, service administration, CAB policy, client portal, support,
user guide, and login.

Interactive sample workflows include ticket creation, status/assignee updates,
internal notes and public reply composition, search/filters, board view,
customer-record creation/edit/removal, report downloads, article dialogs,
service requests, notifications, navigation search, and theme switching.

## Boundaries and remaining acceptance

The preview is available only when the server is started with
`ASTRA_UI_PREVIEW=1`; ordinary production startup returns 404 for `/ui-preview`.
It never supplies a mock login to authenticated routes. Those routes retain
Microsoft Entra sign-in and API-side authorization. Development-only CSP
exceptions support React debugging and hot reload; the production policy
retains its existing restrictions.

The original `/home/hamza/ASTRA/Astra-Ticketing-Frontend` is root-owned and was
not writable. This review is an independent working copy in the chat's artifact
directory. No live application, database, or backend deployment was replaced.
Applying this copy to the original repository requires write access there.

Live-data acceptance of every authenticated workflow still requires the actual
API, Entra identity, and role-specific accounts. The preview tests demonstrate
UI behavior with fictional records, not backend parity or production acceptance.

## HTTPS preview

Start the HTTP review with `npm run preview`, then run `npm run preview:https` in another terminal. Open `https://172.31.3.13:3443/ui-preview`. The default certificate is a local development certificate and may require browser trust. Set `ASTRA_TLS_CERT` and `ASTRA_TLS_KEY` to use a trusted certificate. Certificate files stay in ignored `.local/tls`.
