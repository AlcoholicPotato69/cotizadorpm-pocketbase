param(
    [string]$RootDir = '',
    [string]$BackendUrl = '',
    [string]$FrontendBackendUrl = '',
    [string]$LocalMode = '0'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\..'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
    $BackendUrl = 'http://127.0.0.1:8090'
}

if ([string]::IsNullOrWhiteSpace($FrontendBackendUrl)) {
    $FrontendBackendUrl = $BackendUrl
}

function Convert-ToBoolean {
    param(
        [string]$Value,
        [bool]$Default = $false
    )

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $Default
    }

    switch ($text.Trim().ToLowerInvariant()) {
        '1' { return $true }
        'true' { return $true }
        'yes' { return $true }
        'si' { return $true }
        'on' { return $true }
        '0' { return $false }
        'false' { return $false }
        'no' { return $false }
        'off' { return $false }
        default { return $Default }
    }
}

function Ensure-Property {
    param(
        [object]$Target,
        [string]$Name,
        [object]$Value
    )

    if ($Target.PSObject.Properties[$Name]) {
        $Target.$Name = $Value
        return
    }

    $Target | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
}

function Get-JsQuotedValue {
    param(
        [string]$Content,
        [string]$Key,
        [string]$Default = ''
    )

    $pattern = "(?ms)\b$([regex]::Escape($Key))\s*:\s*'((?:\\.|[^'])*)'"
    $match = [regex]::Match($Content, $pattern)
    if (-not $match.Success) {
        return $Default
    }

    $value = $match.Groups[1].Value
    $value = $value -replace "\\'", "'"
    $value = $value -replace '\\\\', ([string][char]92)
    return $value
}

function Escape-JsSingleQuoted {
    param([string]$Value)

    return ([string]$Value).Replace('\', '\\').Replace("'", "\'")
}

$runtimePath = Join-Path $RootDir 'frontend\client\config\hub-runtime.json'
$envPath = Join-Path $RootDir 'frontend\client\public\assets\libs\js\env.js'
$localModeValue = Convert-ToBoolean -Value $LocalMode -Default $false

if (Test-Path -LiteralPath $runtimePath) {
    try {
        $runtimeConfig = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    } catch {
        $runtimeConfig = [pscustomobject]@{}
    }
} else {
    $runtimeConfig = [pscustomobject]@{}
}

Ensure-Property -Target $runtimeConfig -Name 'BACKEND_URL' -Value $FrontendBackendUrl
Ensure-Property -Target $runtimeConfig -Name 'POCKETBASE_URL' -Value $FrontendBackendUrl
Ensure-Property -Target $runtimeConfig -Name 'LOCAL_MODE' -Value $localModeValue

$propsToRemove = @('CP_CALENDAR_ICS_URL', 'CP_CALENDAR_ICS_TOKEN')
foreach ($prop in $propsToRemove) {
    if ($runtimeConfig.PSObject.Properties[$prop]) {
        $runtimeConfig.PSObject.Properties.Remove($prop)
    }
}

$runtimeConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $runtimePath -Encoding UTF8

if (Test-Path -LiteralPath $envPath) {
    $envContent = Get-Content -LiteralPath $envPath -Raw
} else {
    $envContent = ''
}

$anonKey = Get-JsQuotedValue -Content $envContent -Key 'POCKETBASE_ANON_KEY' -Default ''
$schemaPm = Get-JsQuotedValue -Content $envContent -Key 'SCHEMA_PLAZA_MAYOR' -Default 'finanzas'
$schemaCp = Get-JsQuotedValue -Content $envContent -Key 'SCHEMA_CASA_PIEDRA' -Default 'finanzas_casadepiedra'

$frontendUrlJs = Escape-JsSingleQuoted -Value $FrontendBackendUrl
$anonKeyJs = Escape-JsSingleQuoted -Value $anonKey
$schemaPmJs = Escape-JsSingleQuoted -Value $schemaPm
$schemaCpJs = Escape-JsSingleQuoted -Value $schemaCp
$localModeJs = if ($localModeValue) { 'true' } else { 'false' }

$envObject = @"
window.ENV = {
    POCKETBASE_URL: '$frontendUrlJs',
    BACKEND_URL: '$frontendUrlJs',
    POCKETBASE_ANON_KEY: '$anonKeyJs',
    SCHEMA_PLAZA_MAYOR: '$schemaPmJs',
    SCHEMA_CASA_PIEDRA: '$schemaCpJs',
    LOCAL_MODE: $localModeJs
};
"@

$envPattern = 'window\.ENV\s*=\s*\{[\s\S]*?\};'
if ([regex]::IsMatch($envContent, $envPattern)) {
    $updatedEnvContent = [regex]::Replace(
        $envContent,
        $envPattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $envObject },
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
} else {
    $updatedEnvContent = ($envObject.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $envContent.TrimStart())
}

Set-Content -LiteralPath $envPath -Value $updatedEnvContent -Encoding UTF8

Write-Output ('RUNTIME_JSON=' + $runtimePath)
Write-Output ('PUBLIC_ENV=' + $envPath)
Write-Output ('BACKEND_URL=' + $BackendUrl)
Write-Output ('FRONTEND_BACKEND_URL=' + $FrontendBackendUrl)
Write-Output ('LOCAL_MODE=' + $localModeJs)
