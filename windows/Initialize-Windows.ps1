$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $appRoot '.env.windows'
if (Test-Path -LiteralPath $environmentFile) {
    Write-Host 'Local configuration already exists. It has not been overwritten.'
    return
}
function New-LocalSecret {
    param([int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return ([System.BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'env.windows.example') -Raw
$template = $template.Replace('__POSTGRES_PASSWORD__', (New-LocalSecret))
$template = $template.Replace('__APP_DB_PASSWORD__', (New-LocalSecret))
$template = $template.Replace('__MAIL_CONFIG_KEY__', (New-LocalSecret))
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($environmentFile, $template, $utf8)
Write-Host ('Created local configuration: ' + $environmentFile)
Write-Host 'Edit its Entra values before starting with sign-in. Keep this generated file private.'
