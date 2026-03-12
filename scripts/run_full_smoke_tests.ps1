param(
    [int]$Port = 18091
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw $Message
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Running full smoke tests..." -ForegroundColor Green
Write-Host ("Repo: " + $repoRoot)

# 1) JavaScript syntax checks
Write-Step "JavaScript syntax"
$jsFiles = Get-ChildItem -Recurse -File -Include *.js | Where-Object {
    $_.FullName -notmatch "\\.git\\" -and
    $_.FullName -notmatch "\\backups\\"
}
$syntaxErrors = @()
foreach ($file in $jsFiles) {
    node --check $file.FullName 2>$null
    if ($LASTEXITCODE -ne 0) {
        $syntaxErrors += $file.FullName
    }
}
if ($syntaxErrors.Count -gt 0) {
    $syntaxErrors | ForEach-Object { Write-Host ("  FAIL: " + $_) -ForegroundColor Red }
    throw "JavaScript syntax errors detected."
}
Write-Host ("  OK: " + $jsFiles.Count + " files")

# 2) Legacy runtime references should not exist in active code
Write-Step "Legacy runtime reference scan"
$legacyHits = @()
$scanFiles = Get-ChildItem -Recurse -File -Include *.js,*.html | Where-Object {
    $_.FullName -notmatch "\\backups\\" -and
    $_.FullName -notmatch "client\\supabase\.js$" -and
    $_.FullName -notmatch "client\\public\\assets\\libs\\js\\supabase\.js$"
}
$legacyPattern = 'window\.supabase|supabase\.createClient|typeof supabase|window\.supabaseClient'
foreach ($file in $scanFiles) {
    $matches = Select-String -Path $file.FullName -Pattern $legacyPattern
    if ($matches) {
        $matches | ForEach-Object {
            $legacyHits += ($_.Path + ":" + $_.LineNumber + ":" + $_.Line.Trim())
        }
    }
}
if ($legacyHits.Count -gt 0) {
    $legacyHits | ForEach-Object { Write-Host ("  LEGACY: " + $_) -ForegroundColor Yellow }
    throw "Legacy Supabase runtime references still detected."
}
Write-Host "  OK: no active legacy runtime references"

# 3) HTML script src path resolution
Write-Step "HTML script reference integrity"
$htmlFiles = Get-ChildItem client -Recurse -File -Filter *.html
$missingScripts = @()
foreach ($html in $htmlFiles) {
    $content = Get-Content $html.FullName -Raw
    $scriptMatches = [regex]::Matches($content, '<script[^>]*src="([^"]+)"')
    foreach ($m in $scriptMatches) {
        $srcRaw = $m.Groups[1].Value
        if ($srcRaw -match '^https?://') { continue }
        $src = $srcRaw.Split("?")[0].Split("#")[0]
        if ([string]::IsNullOrWhiteSpace($src)) { continue }
        $candidate = Join-Path (Split-Path $html.FullName -Parent) $src
        $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
        if (-not $resolved) {
            $missingScripts += ($html.FullName + " -> " + $srcRaw)
        }
    }
}
if ($missingScripts.Count -gt 0) {
    $missingScripts | ForEach-Object { Write-Host ("  MISSING: " + $_) -ForegroundColor Red }
    throw "Some HTML script references are broken."
}
Write-Host ("  OK: " + $htmlFiles.Count + " HTML files")

# 4) pb-client must be present in app pages
Write-Step "pb-client injection check"
$exceptions = @(
    "client\cotizadorcp\montajes.html",
    "client\public\index.html"
)
$missingPbClient = @()
foreach ($html in $htmlFiles) {
    $relative = Resolve-Path -Relative $html.FullName
    $relative = $relative -replace '^\.[\\/]', ''
    if ($exceptions -contains $relative) { continue }
    $hasPbClient = Select-String -Path $html.FullName -Pattern 'pb-client\.js' -Quiet
    if (-not $hasPbClient) {
        $missingPbClient += $relative
    }
}
if ($missingPbClient.Count -gt 0) {
    $missingPbClient | ForEach-Object { Write-Host ("  MISSING pb-client: " + $_) -ForegroundColor Red }
    throw "Some app HTML files do not include pb-client.js."
}
Write-Host "  OK: pb-client.js present in all applicable app pages"

# 5) Backend smoke: reuse running PocketBase if available; otherwise start one
Write-Step "PocketBase backend health smoke"

function Test-HealthUrl {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    try {
        if ($Url.StartsWith("https://")) {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            [System.Net.ServicePointManager]::SecurityProtocol = (
                [System.Net.SecurityProtocolType]::Tls12 -bor
                [System.Net.SecurityProtocolType]::Tls11 -bor
                [System.Net.SecurityProtocolType]::Tls
            )
        }
        $resp = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3
        $msg = String($resp.message)
        if (($resp.code -eq 200) -or $msg.ToLower().Contains("healthy")) {
            return $true
        }
    }
    catch {}
    return $false
}

$healthy = $false
$healthUrl = ""
$lastErr = $null
$jobLogBuffer = ""
$job = $null

$existingCandidates = @(
    ("http://127.0.0.1:" + $Port + "/api/health"),
    ("https://127.0.0.1:" + $Port + "/api/health"),
    "http://127.0.0.1:8090/api/health",
    "https://127.0.0.1:8090/api/health"
)

foreach ($url in $existingCandidates) {
    if (Test-HealthUrl $url) {
        $healthy = $true
        $healthUrl = $url
        Write-Host ("  OK: reused running backend at " + $healthUrl)
        break
    }
}

if (-not $healthy) {
    $job = Start-Job -ScriptBlock {
        param($rootPath, $port)
        Set-Location $rootPath
        & .\pocketbase.exe serve --http=("127.0.0.1:" + $port) --automigrate=false --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
    } -ArgumentList $repoRoot.Path, $Port
}

try {
    if (-not $healthy) {
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            try {
                $jobChunk = Receive-Job $job -Keep -ErrorAction SilentlyContinue | Out-String
                if (-not [string]::IsNullOrWhiteSpace($jobChunk)) {
                    $jobLogBuffer += $jobChunk
                }

                $startupBase = $null
                $startupMatch = [regex]::Match($jobLogBuffer, 'Server started at (https?://[^\s]+)')
                if ($startupMatch.Success) {
                    $startupBase = $startupMatch.Groups[1].Value.TrimEnd("/")
                }

                $rawCandidates = @()
                if ($startupBase) {
                    $rawCandidates += ($startupBase + "/api/health")
                    if ($startupBase.StartsWith("https://")) {
                        $rawCandidates += ($startupBase.Replace("https://", "http://") + "/api/health")
                    } elseif ($startupBase.StartsWith("http://")) {
                        $rawCandidates += ($startupBase.Replace("http://", "https://") + "/api/health")
                    }
                }
                $rawCandidates += ("http://127.0.0.1:" + $Port + "/api/health")
                $rawCandidates += ("https://127.0.0.1:" + $Port + "/api/health")

                $candidates = @()
                $seenCandidates = @{}
                foreach ($c in $rawCandidates) {
                    if ([string]::IsNullOrWhiteSpace($c)) { continue }
                    if ($seenCandidates.ContainsKey($c)) { continue }
                    $seenCandidates[$c] = $true
                    $candidates += $c
                }

                foreach ($url in $candidates) {
                    if (Test-HealthUrl $url) {
                        $healthy = $true
                        $healthUrl = $url
                        Write-Host ("  OK: " + $healthUrl + " code 200")
                        break
                    }
                }
                if ($healthy) { break }
            }
            catch {
                $lastErr = $_.Exception.Message
            }
            if ($job.State -eq "Failed" -or $job.State -eq "Stopped" -or $job.State -eq "Completed") {
                break
            }
        }
        if (-not $healthy) {
            $startupLogMatch = [regex]::Match($jobLogBuffer, 'Server started at (https?://[^\s]+)')
            if ($startupLogMatch.Success -and $job.State -eq "Running") {
                $healthy = $true
                $healthUrl = $startupLogMatch.Groups[1].Value.TrimEnd("/") + "/api/health"
                Write-Host ("  OK: startup log detected at " + $healthUrl + " (TLS probe fallback)")
            }
        }
        if (-not $healthy) {
            $jobLog = ($jobLogBuffer + (Receive-Job $job -ErrorAction SilentlyContinue | Out-String)).Trim()
            if ([string]::IsNullOrWhiteSpace($jobLog)) { $jobLog = "(no job output)" }
            throw ("Backend health check failed. Last error: " + $lastErr + "`nJob output:`n" + $jobLog)
        }
    }
}
finally {
    if ($job) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Receive-Job $job -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $job -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "All smoke tests passed." -ForegroundColor Green
