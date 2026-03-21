param(
    [string]$RootDir = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

$confFile = Join-Path $RootDir 'deploy\backend-service.local.conf'
$pbExe = Join-Path $RootDir 'pocketbase.exe'
$logsDir = Join-Path $RootDir 'logs'
$pbLog = Join-Path $logsDir 'pocketbase-service.log'
$pbStdOut = Join-Path $logsDir 'pocketbase.stdout.log'
$pbStdErr = Join-Path $logsDir 'pocketbase.stderr.log'
$proxyLog = Join-Path $logsDir 'https-proxy.log'
$proxyStdOut = Join-Path $logsDir 'https-proxy.stdout.log'
$proxyStdErr = Join-Path $logsDir 'https-proxy.stderr.log'
$proxyScript = Join-Path $RootDir 'deploy\https-reverse-proxy.ps1'

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

    $host = $parts[0].Trim()
    $port = $parts[$parts.Length - 1].Trim()
    if ([string]::IsNullOrWhiteSpace($port)) {
        $port = '8090'
    }
    if ($host -eq '0.0.0.0' -or $host -eq '+') {
        $host = '127.0.0.1'
    }

    return "http://$host`:$port"
}

if (-not (Test-Path $pbExe)) {
    Write-RunnerLog "ERROR: pocketbase.exe no encontrado en $pbExe"
    exit 2
}

$cfg = Load-ConfMap -Path $confFile
$bindAddr = Get-ConfValue -Map $cfg -Key 'BIND_ADDR' -Default '0.0.0.0:8090'
$httpsEnabledRaw = (Get-ConfValue -Map $cfg -Key 'HTTPS_ENABLED' -Default '0').Trim().ToLowerInvariant()
$httpsEnabled = $httpsEnabledRaw -eq '1' -or $httpsEnabledRaw -eq 'true' -or $httpsEnabledRaw -eq 'yes'
$httpsPortValue = Get-ConfValue -Map $cfg -Key 'HTTPS_PORT' -Default '9443'
$httpsPort = 9443
if (-not [int]::TryParse($httpsPortValue, [ref]$httpsPort)) {
    $httpsPort = 9443
}

$pbArgsPrimary = @(
    'serve',
    "--http=$bindAddr",
    "--dir=$RootDir\pb_data",
    "--hooksDir=$RootDir\pb_hooks",
    "--migrationsDir=$RootDir\pb_migrations"
)
$pbArgsFallback = @(
    'serve',
    "--dir=$RootDir\pb_data",
    "--hooksDir=$RootDir\pb_hooks",
    "--migrationsDir=$RootDir\pb_migrations"
)

Write-RunnerLog "Iniciando PocketBase (bind $bindAddr)"
$pbProc = Start-Process -FilePath $pbExe -ArgumentList $pbArgsPrimary -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
Start-Sleep -Seconds 2

if ($pbProc.HasExited) {
    Write-RunnerLog "WARN: '--http' fallo (exit $($pbProc.ExitCode)). Intentando fallback."
    $pbProc = Start-Process -FilePath $pbExe -ArgumentList $pbArgsFallback -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
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
    Stop-Process -Id $pbProc.Id -Force
    exit 3
}

$targetBase = Convert-BindToTargetUrl -BindAddr $bindAddr
$psExe = (Get-Process -Id $PID).Path
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

Write-RunnerLog "Iniciando proxy HTTPS en puerto $httpsPort -> $targetBase"
$proxyProc = Start-Process -FilePath $psExe -ArgumentList $proxyArgs -PassThru -RedirectStandardOutput $proxyStdOut -RedirectStandardError $proxyStdErr
Start-Sleep -Seconds 2

if ($proxyProc.HasExited) {
    Write-RunnerLog "ERROR: Proxy HTTPS fallo al iniciar (exit $($proxyProc.ExitCode))."
    Stop-Process -Id $pbProc.Id -Force
    exit $proxyProc.ExitCode
}

while ($true) {
    Start-Sleep -Seconds 2

    $pbProc.Refresh()
    $proxyProc.Refresh()

    if ($pbProc.HasExited) {
        Write-RunnerLog "ERROR: PocketBase termino (exit $($pbProc.ExitCode)). Se detendra proxy HTTPS."
        if (-not $proxyProc.HasExited) {
            Stop-Process -Id $proxyProc.Id -Force
        }
        exit $pbProc.ExitCode
    }

    if ($proxyProc.HasExited) {
        Write-RunnerLog "ERROR: Proxy HTTPS termino (exit $($proxyProc.ExitCode)). Se detendra PocketBase."
        if (-not $pbProc.HasExited) {
            Stop-Process -Id $pbProc.Id -Force
        }
        exit $proxyProc.ExitCode
    }
}
