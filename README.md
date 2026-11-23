# ASTRA frontend

Current ASTRA interface: React 19, TypeScript, React Router and Vite. This source replaces the earlier Next.js project on this repository's main branch; previous versions remain in Git history.

## Development

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

The development server listens on `127.0.0.1:3200` and forwards `/api` to `http://127.0.0.1:5200`. Set `API_INTERNAL_URL` in local environment configuration when needed. Keep credentials out of the frontend and repository.

```sh
npm run build
```

The build checks TypeScript and generates `dist/`. Host the generated files behind the existing HTTPS reverse proxy with SPA fallback and `/api` routed to the backend.

## Backend and maintenance

The matching backend is [Astra-Ticketing-Backend](https://github.com/Sahil-amnikon/Astra-Ticketing-Backend), using ASP.NET Core 10 and MySQL. The application includes scoped workspaces, ticketing, change/problem management, article reviews, inline article images and service catalogue features.

Deployment helpers live in the backend repository's `local-maintenance/` folder. These helpers expect sibling folders named `ASTRA-Frontend-latest` and `ASTRA-Backend-latest` in their existing environment. Review a helper's scope before running it; scripts may target the configured production VM.

Publishing source to GitHub does not deploy the application. Build validation does not replace live authentication, database, mail or browser checks.
