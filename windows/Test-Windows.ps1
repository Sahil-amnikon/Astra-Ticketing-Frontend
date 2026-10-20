$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
foreach ($command in @('node', 'npm')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw ('Install Node.js 24 with npm. Missing command: ' + $command) }
}
Push-Location $appRoot
$previousStorageRoot = $env:ATTACHMENT_STORAGE_ROOT
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
    if ($LASTEXITCODE -ne 0) { throw 'Backend TypeScript build failed.' }
    $storageRoot = Join-Path $appRoot 'test-artifacts/attachments'
    New-Item -ItemType Directory -Path $storageRoot -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $storageRoot '.amnikon-storage-ready') -Force | Out-Null
    $env:ATTACHMENT_STORAGE_ROOT = $storageRoot
    $script = (Get-Content -LiteralPath 'apps/api/package.json' -Raw | ConvertFrom-Json).scripts.test
    $marker = 'node --test '
    $position = $script.IndexOf($marker)
    if ($position -lt 0) { throw 'The backend test command requires developer review.' }
    $tests = $script.Substring($position + $marker.Length).Split(' ', [StringSplitOptions]::RemoveEmptyEntries)
    $arguments = @('--test') + @($tests | ForEach-Object { 'apps/api/' + $_ })
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'The backend unit suite failed.' }
} finally {
    if ($null -eq $previousStorageRoot) { Remove-Item Env:ATTACHMENT_STORAGE_ROOT -ErrorAction SilentlyContinue }
    else { $env:ATTACHMENT_STORAGE_ROOT = $previousStorageRoot }
    Pop-Location
}
