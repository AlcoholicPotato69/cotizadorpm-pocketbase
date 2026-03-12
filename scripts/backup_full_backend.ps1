param(
    [string]$OutputRoot = "backups",
    [switch]$AllowLiveProcess
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Get-Sha256Hash {
    param([string]$FilePath)

    if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
        return (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }

    if (Get-Command certutil.exe -ErrorAction SilentlyContinue) {
        $raw = & certutil.exe -hashfile $FilePath SHA256 2>$null
        $line = $raw | Where-Object { $_ -match '^[0-9A-Fa-f ]+$' } | Select-Object -First 1
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            return (($line -replace '\s+', '').ToLowerInvariant())
        }
    }

    throw ("Unable to compute SHA256 for: " + $FilePath)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$running = Get-Process -Name pocketbase -ErrorAction SilentlyContinue
if ($running -and -not $AllowLiveProcess) {
    throw "PocketBase is running. Stop it first for a consistent backup, or use -AllowLiveProcess."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupName = "backend_full_" + $timestamp
$outputRootPath = Join-Path $repoRoot $OutputRoot
$workDir = Join-Path $outputRootPath $backupName
$zipPath = Join-Path $outputRootPath ($backupName + ".zip")

Write-Step "Preparing backup directories"
New-Item -ItemType Directory -Path $outputRootPath -Force | Out-Null
if (Test-Path $workDir) { Remove-Item -Recurse -Force $workDir }
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

$targets = @(
    "pocketbase.exe",
    "pb_data",
    "pb_hooks",
    "pb_migrations",
    "client\services",
    "client\js\hub-config.js"
)

Write-Step "Copying backend assets"
foreach ($relative in $targets) {
    $source = Join-Path $repoRoot $relative
    if (-not (Test-Path $source)) {
        Write-Host ("  SKIP (missing): " + $relative) -ForegroundColor Yellow
        continue
    }

    $destination = Join-Path $workDir $relative
    if ((Get-Item $source).PSIsContainer) {
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force
    } else {
        $destDir = Split-Path $destination -Parent
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        Copy-Item -Path $source -Destination $destination -Force
    }
    Write-Host ("  Copied: " + $relative)
}

Write-Step "Generating manifest and checksums"
$manifest = [ordered]@{
    backup_name = $backupName
    created_at = (Get-Date).ToString("s")
    repository_root = $repoRoot.Path
    pocketbase_running_during_backup = [bool]$running
    includes = $targets
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $workDir "manifest.json") -Encoding UTF8

$hashLines = @("sha256,path")
$hashWarnings = @()
Get-ChildItem -Path $workDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($workDir.Length).TrimStart("\")
    try {
        $hash = Get-Sha256Hash -FilePath $_.FullName
        $hashLines += ($hash + "," + $rel)
    }
    catch {
        $hashWarnings += $rel
        $hashLines += ("ERROR," + $rel)
    }
}
$hashLines | Set-Content -Path (Join-Path $workDir "checksums.csv") -Encoding UTF8
if ($hashWarnings.Count -gt 0) {
    Write-Host ("  WARN: " + $hashWarnings.Count + " files without checksum (marked as ERROR in checksums.csv).") -ForegroundColor Yellow
}

$restoreNotes = @"
RESTORE QUICK STEPS
1) Stop PocketBase process/service.
2) Extract this backup in a temporary folder.
3) Replace repository folders/files with backup content:
   - pocketbase.exe
   - pb_data
   - pb_hooks
   - pb_migrations
   - client/services
   - client/js/hub-config.js
4) Start PocketBase again:
   .\pocketbase.exe serve --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
"@
$restoreNotes | Set-Content -Path (Join-Path $workDir "RESTORE.txt") -Encoding UTF8

Write-Step "Creating zip archive"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $workDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host ("Backup completed: " + $zipPath) -ForegroundColor Green
Write-Host ("Working folder: " + $workDir)
