$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
& docker compose --project-directory $appRoot --env-file (Join-Path $appRoot '.env.windows') -p astra-windows-local -f (Join-Path $PSScriptRoot 'compose.windows.yml') stop
if ($LASTEXITCODE -ne 0) { throw 'Stopping the local application failed.' }
Write-Host 'Local containers stopped. Database and attachment volumes are retained.'
