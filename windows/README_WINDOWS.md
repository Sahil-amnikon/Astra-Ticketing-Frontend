# Run the current ASTRA application on Windows

This is a source export of the live application from TKT-Web on 14 October 2026, with a separate local startup configuration. It uses React/Next.js, NestJS, PostgreSQL and Redis. It includes the application, worker, database migrations, tests and original deployment documentation.

## Prerequisites

Use a Windows 10/11 x64 development computer with Docker Desktop installed and running in Linux-container mode. Docker's Windows installation instructions are at https://docs.docker.com/desktop/setup/install/windows-install/. A supported WSL 2 backend and hardware virtualization are required. Internet access is needed to download images and npm dependencies on the first build. No host Node.js installation is required for the Docker startup.

Extract the ZIP to a short local path, such as `C:\ASTRA`. The scripts work in Windows PowerShell 5.1 and PowerShell 7. Open PowerShell in the extracted `current-app` directory. If Windows blocks scripts downloaded in a ZIP, right-click the ZIP, choose Properties > Unblock before extraction, or ask your developer to use the execution policy allowed by your organization. These scripts do not change system execution policy.

## Initialize and configure sign-in

```powershell
.\windows\Initialize-Windows.ps1
notepad .env.windows
```

The initializer creates fresh local-only PostgreSQL passwords and a mail encryption key. It never imports live configuration. Fill in `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` and `INITIAL_ADMIN_OBJECT_IDS`. Use an approved development Entra app registration and configure its **Web** redirect URI as exactly `http://localhost:3000/api/auth/callback`. Microsoft documents localhost redirect URIs at https://learn.microsoft.com/en-us/entra/identity-platform/reply-url. The first administrator's object ID must be from that tenant. No demo administrator, password login or authentication bypass is supplied.

The localhost deployment runs the existing backend in development mode to support an HTTP localhost callback. It is bound to the local computer and is not a production deployment.

## Start

```powershell
.\windows\Start-Windows.ps1
```

This builds the existing Dockerfiles, starts a fresh PostgreSQL database and Redis, prepares attachment storage, applies all PostgreSQL migrations, starts the backend/worker/frontend, and checks readiness. Open **http://localhost:3000**. Sign in with the allowlisted first administrator, then configure customers, sites and users through Administration.

To check startup before obtaining Entra settings:

```powershell
.\windows\Start-Windows.ps1 -StartWithoutSignIn
```

This starts the application with sign-in unconfigured. It does not grant access to the authenticated workspaces. If you later edit the Entra settings, rerun Start-Windows.ps1 to recreate the affected containers.

This local database is empty apart from schema reference data. Live users, customers, tickets, attachments and encrypted mail settings are not included in this source ZIP. A live-data backup and restore would be a separate controlled handoff. Changing generated database passwords after the PostgreSQL volume has been initialized does not change database role passwords automatically.

## Stop and diagnose

```powershell
.\windows\Stop-Windows.ps1
docker compose --project-directory . --env-file .env.windows -p astra-windows-local -f windows/compose.windows.yml ps
docker compose --project-directory . --env-file .env.windows -p astra-windows-local -f windows/compose.windows.yml logs --tail 100 backend worker frontend
```

Stopping retains the local database and attachment volumes. The scripts use the separate project `astra-windows-local`. They contain no live server connections. Host ports are localhost-only: web 3000, PostgreSQL 54329 and Redis 16379. Port conflicts must be resolved before startup.

For optional native development, install Node.js 24 with npm, run `npm ci`, and use the existing package scripts. Configure the native backend's DATABASE_URL and REDIS_URL to the localhost database/Redis ports above, use the generated application database credentials, and set API_INTERNAL_URL for the frontend. Docker startup is the documented complete local route.

To run the existing backend unit suite on Windows after installing Node.js 24 with npm:

```powershell
.\windows\Test-Windows.ps1
```

This runs the compiled tests from the repository root because some fixtures use root-relative paths. It sets up a separate `test-artifacts/attachments` directory for test attachments. These unit checks do not connect to or change the live application database. Full integration/browser/Entra tests remain separate.

## Validation scope

Read the bundle's VALIDATION.json for executed checks. Docker Desktop is not installed on the packaging computer, so a complete local Docker/Entra startup has not been replayed there. The Windows scripts and Compose configuration are validated separately. Existing live checks or source tests do not substitute for your developer's local Entra sign-in and end-to-end workflow review.
