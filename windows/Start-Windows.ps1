param([switch]$StartWithoutSignIn)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $appRoot '.env.windows'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Install and start Docker Desktop with Linux containers, then retry.'
}
$dockerType = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running or accessible.' }
if (($dockerType -join '').Trim() -ne 'linux') { throw 'Switch Docker Desktop to Linux containers, then retry.' }
if (-not (Test-Path -LiteralPath $environmentFile)) { & (Join-Path $PSScriptRoot 'Initialize-Windows.ps1') }
$settings = @{}
foreach ($line in Get-Content -LiteralPath $environmentFile) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2].Trim() }
}
foreach ($name in @('POSTGRES_PASSWORD', 'APP_DB_PASSWORD', 'MAIL_CONFIG_KEY')) {
    if ($settings[$name] -notmatch '^[a-fA-F0-9]{64}$') { throw ('Invalid generated local setting: ' + $name) }
}
if (-not $StartWithoutSignIn) {
    foreach ($name in @('ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'INITIAL_ADMIN_OBJECT_IDS')) {
        if ([string]::IsNullOrWhiteSpace($settings[$name])) {
            throw ('Configure ' + $name + ' in .env.windows. See windows/README_WINDOWS.md. Use -StartWithoutSignIn only for an unauthenticated startup check.')
        }
    }
}
function Invoke-LocalCompose {
    param([string[]]$ComposeArguments)
    & docker compose --project-directory $appRoot --env-file $environmentFile -p astra-windows-local -f (Join-Path $PSScriptRoot 'compose.windows.yml') @ComposeArguments
    if ($LASTEXITCODE -ne 0) { throw 'A local Docker Compose step failed. Check the output above.' }
}
Invoke-LocalCompose -ComposeArguments @('config', '--quiet')
Invoke-LocalCompose -ComposeArguments @('build', 'backend', 'frontend')
Invoke-LocalCompose -ComposeArguments @('up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis')
Invoke-LocalCompose -ComposeArguments @('run', '--rm', 'storage-init')
Invoke-LocalCompose -ComposeArguments @('run', '--rm', 'migrate')
Invoke-LocalCompose -ComposeArguments @('up', '-d', '--wait', '--wait-timeout', '180', 'frontend', 'worker')
$ready = Invoke-RestMethod -Uri 'http://localhost:3000/api/ready' -TimeoutSec 15
if ($ready.status -ne 'ready') { throw 'The local application is not ready.' }
Write-Host 'ASTRA is ready at http://localhost:3000'
if ($StartWithoutSignIn) { Write-Host 'Sign-in requires valid Entra settings; this mode does not bypass authentication.' }
