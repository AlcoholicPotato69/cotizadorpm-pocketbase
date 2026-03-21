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

if (-not (Test-Path $pbExe)) {
    Write-RunnerLog "ERROR: pocketbase.exe no encontrado en $pbExe"
    exit 2
}

$cfg = Load-ConfMap -Path $confFile
$bindAddr = Get-ConfValue -Map $cfg -Key 'BIND_ADDR' -Default '0.0.0.0:8090'
$icsToken = Get-ConfValue -Map $cfg -Key 'CP_CALENDAR_ICS_TOKEN' -Default ''
$httpsEnabledRaw = (Get-ConfValue -Map $cfg -Key 'HTTPS_ENABLED' -Default '0').Trim().ToLowerInvariant()
$httpsEnabled = $httpsEnabledRaw -eq '1' -or $httpsEnabledRaw -eq 'true' -or $httpsEnabledRaw -eq 'yes'
$httpsPortValue = Get-ConfValue -Map $cfg -Key 'HTTPS_PORT' -Default '9443'
$httpsPort = 9443
if (-not [int]::TryParse($httpsPortValue, [ref]$httpsPort)) {
    $httpsPort = 9443
}

if ([string]::IsNullOrWhiteSpace($icsToken)) {
    Remove-Item Env:CP_CALENDAR_ICS_TOKEN -ErrorAction SilentlyContinue
    Write-RunnerLog 'ICS token desactivado (CP_CALENDAR_ICS_TOKEN vacio).'
} else {
    $env:CP_CALENDAR_ICS_TOKEN = $icsToken
    Write-RunnerLog 'ICS token activo (CP_CALENDAR_ICS_TOKEN configurado).'
}

$pbArgsPrimary = @(
    'serve',
    "--http=$bindAddr",
    '--dir=pb_data',
    '--hooksDir=pb_hooks',
    '--migrationsDir=pb_migrations'
)
$pbArgsFallback = @(
    'serve',
    '--dir=pb_data',
    '--hooksDir=pb_hooks',
    '--migrationsDir=pb_migrations'
)

$pbProc = $null
$proxyProc = $null

try {
    Write-RunnerLog "Iniciando PocketBase (bind $bindAddr, root $RootDir)"
    $pbProc = Start-Process -FilePath $pbExe -WorkingDirectory $RootDir -ArgumentList $pbArgsPrimary -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
    Start-Sleep -Seconds 2

    if ($pbProc.HasExited) {
        Write-RunnerLog "WARN: '--http' fallo (exit $($pbProc.ExitCode)). Intentando fallback."
        $pbProc = Start-Process -FilePath $pbExe -WorkingDirectory $RootDir -ArgumentList $pbArgsFallback -RedirectStandardOutput $pbStdOut -RedirectStandardError $pbStdErr -PassThru
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
