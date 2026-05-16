param(
    [string]$RootDir = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\..'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

$backendDir = Join-Path $RootDir 'backend'
$frontendDir = Join-Path $RootDir 'frontend'
$confFile = Join-Path $RootDir 'production\deploy\backend-service.local.conf'
$pbExe = Join-Path $backendDir 'pocketbase.exe'
$logsDir = Join-Path $backendDir 'logs'
$pbLog = Join-Path $logsDir 'pocketbase-service.log'
$pbStdOut = Join-Path $logsDir 'pocketbase.stdout.log'
$pbStdErr = Join-Path $logsDir 'pocketbase.stderr.log'
$proxyLog = Join-Path $logsDir 'https-proxy.log'
$proxyStdOut = Join-Path $logsDir 'https-proxy.stdout.log'
$proxyStdErr = Join-Path $logsDir 'https-proxy.stderr.log'
$proxyScript = Join-Path $RootDir 'production\deploy\https-reverse-proxy.ps1'
$pbDataDir = Join-Path $backendDir 'pb_data'
$pbHooksDir = Join-Path $backendDir 'pb_hooks'
$pbMigrationsDir = Join-Path $backendDir 'pb_migrations'

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

function Write-RunnerLog {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $pbLog -Value $line
}

function Load-ConfMap {
    param([string]$Path)

    $map = @{}
    if (-not (Test-Path $Path)) {
        return $map
    }

    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }
        if ($line.StartsWith('#')) {
            return
        }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) {
            return
        }

        $key = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        $map[$key] = $value
    }

    return $map
}

function Get-ConfValue {
    param(
        [hashtable]$Map,
        [string]$Key,
        [string]$Default
    )
    if ($Map.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Map[$Key])) {
        return $Map[$Key]
    }
    return $Default
}

function Convert-BindToTargetUrl {
    param([string]$BindAddr)

    if ([string]::IsNullOrWhiteSpace($BindAddr)) {
        return 'http://127.0.0.1:8090'
    }

    $parts = $BindAddr.Split(':')
    if ($parts.Length -lt 2) {
        return 'http://127.0.0.1:8090'
    }

    $bindHost = $parts[0].Trim()
    $port = $parts[$parts.Length - 1].Trim()
    if ([string]::IsNullOrWhiteSpace($port)) {
        $port = '8090'
    }
    if ($bindHost -eq '0.0.0.0' -or $bindHost -eq '+') {
        $bindHost = '127.0.0.1'
    }

    return "http://$bindHost`:$port"
}

function Get-UrlOrigin {
    param([string]$Url)

    $safe = ''
    if (-not [string]::IsNullOrWhiteSpace($Url)) {
        $safe = $Url.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($safe)) {
        return ''
    }

    try {
        return ([Uri]$safe).GetLeftPart([System.UriPartial]::Authority)
    } catch {
        return ''
    }
}

function Get-UrlHost {
    param([string]$Url)

    $safe = ''
    if (-not [string]::IsNullOrWhiteSpace($Url)) {
        $safe = $Url.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($safe)) {
        return ''
    }

    try {
        return ([Uri]$safe).Host
    } catch {
        return ''
    }
}

function Normalize-OriginList {
    param([string[]]$Origins)

    $seen = @{}
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($origin in ($Origins | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $safe = $origin.Trim()
        if ([string]::IsNullOrWhiteSpace($safe)) {
            continue
        }
        $key = $safe.ToLowerInvariant()
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true
        $out.Add($safe)
    }
    return $out.ToArray()
}

function Build-CorsOrigins {
    param(
        [string]$BindAddr,
        [string]$BackendUrl,
        [string]$ConfiguredOrigins
    )

    $origins = New-Object System.Collections.Generic.List[string]

    $backendOrigin = Get-UrlOrigin -Url $BackendUrl
    if (-not [string]::IsNullOrWhiteSpace($backendOrigin)) {
        $origins.Add($backendOrigin)
    }

    $backendHost = Get-UrlHost -Url $BackendUrl
    if ([string]::IsNullOrWhiteSpace($backendHost)) {
        $targetUrl = Convert-BindToTargetUrl -BindAddr $BindAddr
        $backendHost = Get-UrlHost -Url $targetUrl
    }

    if ($backendHost -eq '0.0.0.0' -or $backendHost -eq '+') {
        $backendHost = '127.0.0.1'
    }

    if (-not [string]::IsNullOrWhiteSpace($backendHost)) {
        $origins.Add("http://${backendHost}:*")
        $origins.Add("https://${backendHost}:*")
    }

    if ($backendHost -eq '127.0.0.1' -or $backendHost -eq 'localhost' -or [string]::IsNullOrWhiteSpace($backendHost)) {
        $origins.Add('http://127.0.0.1:*')
        $origins.Add('https://127.0.0.1:*')
        $origins.Add('http://localhost:*')
        $origins.Add('https://localhost:*')
    }

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredOrigins)) {
        $ConfiguredOrigins -split '[,;]' | ForEach-Object {
            if (-not [string]::IsNullOrWhiteSpace($_)) {
                $origins.Add($_.Trim())
            }
        }
    }

    return Normalize-OriginList -Origins $origins
}

function Resolve-PublicDirPath {
    param(
        [string]$RootDir,
        [string]$ConfiguredPath
    )

    $publicDirValue = 'frontend'
    if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath)) {
        $publicDirValue = $ConfiguredPath.Trim()
    }

    $candidate = $publicDirValue
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        $candidate = Join-Path $RootDir $candidate
    }

    try {
        $resolved = [System.IO.Path]::GetFullPath($candidate)
    } catch {
        throw "PUBLIC_DIR invalido: $publicDirValue"
    }

    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw "PUBLIC_DIR no existe o no es carpeta: $resolved"
    }

    return $resolved
}

function Test-PublicDirDisabled {
    param([string]$ConfiguredPath)

    if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) {
        return $true
    }

    $safe = $ConfiguredPath.Trim().ToLowerInvariant()
    return @('off', 'none', 'disabled', 'false', '0', '-') -contains $safe
}

function Resolve-PowerShellExecutable {
    $fromPsHomePowerShell = Join-Path $PSHOME 'powershell.exe'
    if (Test-Path $fromPsHomePowerShell) {
        return $fromPsHomePowerShell
    }

    $fromPsHomePwsh = Join-Path $PSHOME 'pwsh.exe'
    if (Test-Path $fromPsHomePwsh) {
        return $fromPsHomePwsh
    }

    $systemPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (Test-Path $systemPowerShell) {
        return $systemPowerShell
    }

    return 'powershell.exe'
}

function Stop-ProcessSafe {
    param(
        [Parameter(Mandatory = $false)] [System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)] [string]$Label
    )

    if ($null -eq $Process) {
        return
    }

    try {
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction Stop
            Write-RunnerLog "Proceso detenido por limpieza: $Label (PID=$($Process.Id))."
        }
    } catch {
        Write-RunnerLog "WARN: No se pudo detener $Label (PID=$($Process.Id)): $($_.Exception.Message)"
    }
}

function Test-BackendHealth {
    param([string]$BaseUrl)

    if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
        return $false
    }

    $safeBase = $BaseUrl.Trim().TrimEnd('/')
    if ([string]::IsNullOrWhiteSpace($safeBase)) {
        return $false
    }

    $healthUrl = "$safeBase/api/health"
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
        return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    } catch {
        return $false
    }
}

if (-not (Test-Path $pbExe)) {
    Write-RunnerLog "ERROR: pocketbase.exe no encontrado en $pbExe"
    exit 2
}

$cfg = Load-ConfMap -Path $confFile
$bindAddr = Get-ConfValue -Map $cfg -Key 'BIND_ADDR' -Default '0.0.0.0:8090'
$backendUrl = Get-ConfValue -Map $cfg -Key 'BACKEND_URL' -Default (Convert-BindToTargetUrl -BindAddr $bindAddr)
$publicDirRaw = if ($cfg.ContainsKey('PUBLIC_DIR')) { $cfg['PUBLIC_DIR'] } else { '' }
$corsAllowedOriginsRaw = Get-ConfValue -Map $cfg -Key 'CORS_ALLOWED_ORIGINS' -Default ''
$corsAllowedOrigins = Build-CorsOrigins -BindAddr $bindAddr -BackendUrl $backendUrl -ConfiguredOrigins $corsAllowedOriginsRaw
$httpsEnabledRaw = (Get-ConfValue -Map $cfg -Key 'HTTPS_ENABLED' -Default '0').Trim().ToLowerInvariant()
$httpsEnabled = $httpsEnabledRaw -eq '1' -or $httpsEnabledRaw -eq 'true' -or $httpsEnabledRaw -eq 'yes'
$httpsPortValue = Get-ConfValue -Map $cfg -Key 'HTTPS_PORT' -Default '9443'
$httpsPort = 9443
if (-not [int]::TryParse($httpsPortValue, [ref]$httpsPort)) {
    $httpsPort = 9443
}

if (Test-BackendHealth -BaseUrl $backendUrl) {
    Write-RunnerLog "PocketBase ya responde en $backendUrl. Se omite reinicio."
    exit 0
}

$publicDirDisabled = Test-PublicDirDisabled -ConfiguredPath $publicDirRaw
$publicDir = $null
if (-not $publicDirDisabled) {
    try {
        $publicDirLeaf = ''
        if (-not [string]::IsNullOrWhiteSpace($publicDirRaw)) {
            $publicDirLeaf = Split-Path -Leaf $publicDirRaw.Trim()
        }
        if ([string]::Equals($publicDirLeaf, 'pb_public', [System.StringComparison]::OrdinalIgnoreCase)) {
            $preparePublicDirScript = Join-Path $RootDir 'production\deploy\prepare-public-dir.ps1'
            if (-not (Test-Path -LiteralPath $preparePublicDirScript)) {
                throw "No existe script de preparacion publica: $preparePublicDirScript"
            }
            & $preparePublicDirScript -RootDir $RootDir -PublicDir $publicDirRaw | Out-Null
        }
        $publicDir = Resolve-PublicDirPath -RootDir $RootDir -ConfiguredPath $publicDirRaw
    } catch {
        Write-RunnerLog ("ERROR: " + $_.Exception.Message)
        exit 2
    }
}

$pbArgsPrimary = @(
    'serve',
    "--http=$bindAddr",
    '--origins',
    ($corsAllowedOrigins -join ','),
    "--dir=`"$pbDataDir`"",
    "--hooksDir=`"$pbHooksDir`"",
    "--migrationsDir=`"$pbMigrationsDir`""
)
$pbArgsFallback = @(
    'serve',
    '--origins',
    ($corsAllowedOrigins -join ','),
    "--dir=`"$pbDataDir`"",
    "--hooksDir=`"$pbHooksDir`"",
    "--migrationsDir=`"$pbMigrationsDir`""
)
if (-not $publicDirDisabled) {
    $pbArgsPrimary += "--publicDir=`"$publicDir`""
    $pbArgsFallback += "--publicDir=`"$publicDir`""
}

$pbProc = $null
$proxyProc = $null

try {
    $publicDirLog = if ($publicDirDisabled) { '<desactivado: HTML servido por frontend separado>' } else { $publicDir }
    Write-RunnerLog "Iniciando PocketBase (bind $bindAddr, root $RootDir, backendDir=$backendDir, frontendDir=$frontendDir, publicDir=$publicDirLog, origins=$($corsAllowedOrigins -join '; '))"
    $pbProc = Start-Process -FilePath $pbExe -WorkingDirectory $backendDir -ArgumentList $pbArgsPrimary -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
    Start-Sleep -Seconds 2

    if ($pbProc.HasExited) {
        Write-RunnerLog "WARN: '--http' fallo (exit $($pbProc.ExitCode)). Intentando fallback."
        $pbProc = Start-Process -FilePath $pbExe -WorkingDirectory $backendDir -ArgumentList $pbArgsFallback -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
        Start-Sleep -Seconds 2
    }

    if ($pbProc.HasExited) {
        Write-RunnerLog "ERROR: PocketBase no pudo iniciar (exit $($pbProc.ExitCode))."
        exit $pbProc.ExitCode
    }

    if (-not $httpsEnabled) {
        Write-RunnerLog 'HTTPS desactivado. Servicio corriendo solo con PocketBase.'
        Wait-Process -Id $pbProc.Id
        $pbProc.Refresh()
        exit $pbProc.ExitCode
    }

    if (-not (Test-Path $proxyScript)) {
        Write-RunnerLog "ERROR: Script proxy HTTPS no encontrado en $proxyScript"
        Stop-ProcessSafe -Process $pbProc -Label 'PocketBase'
        exit 3
    }

    $targetBase = Convert-BindToTargetUrl -BindAddr $bindAddr
    $psExe = Resolve-PowerShellExecutable
    $proxyArgs = @(
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $proxyScript,
        '-ListenPort',
        $httpsPort.ToString(),
        '-TargetBaseUrl',
        $targetBase,
        '-LogFile',
        $proxyLog
    )

    Write-RunnerLog "Iniciando proxy HTTPS en puerto $httpsPort -> $targetBase (host=$psExe)"
    $proxyProc = Start-Process -FilePath $psExe -ArgumentList $proxyArgs -PassThru -RedirectStandardOutput $proxyStdOut -RedirectStandardError $proxyStdErr
    Start-Sleep -Seconds 2

    if ($proxyProc.HasExited) {
        Write-RunnerLog "ERROR: Proxy HTTPS fallo al iniciar (exit $($proxyProc.ExitCode))."
        Stop-ProcessSafe -Process $pbProc -Label 'PocketBase'
        exit $proxyProc.ExitCode
    }

    while ($true) {
        Start-Sleep -Seconds 2

        $pbProc.Refresh()
        $proxyProc.Refresh()

        if ($pbProc.HasExited) {
            Write-RunnerLog "ERROR: PocketBase termino (exit $($pbProc.ExitCode)). Se detendra proxy HTTPS."
            Stop-ProcessSafe -Process $proxyProc -Label 'Proxy HTTPS'
            exit $pbProc.ExitCode
        }

        if ($proxyProc.HasExited) {
            Write-RunnerLog "ERROR: Proxy HTTPS termino (exit $($proxyProc.ExitCode)). Se detendra PocketBase."
            Stop-ProcessSafe -Process $pbProc -Label 'PocketBase'
            exit $proxyProc.ExitCode
        }
    }
} catch {
    Write-RunnerLog ("ERROR runner no controlado: " + $_.Exception.Message)
    Stop-ProcessSafe -Process $proxyProc -Label 'Proxy HTTPS'
    Stop-ProcessSafe -Process $pbProc -Label 'PocketBase'
    exit 1
}
