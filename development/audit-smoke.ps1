$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host ("=== {0} ===" -f $title) -ForegroundColor Cyan
}

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "No se encontro el comando requerido: $name"
  }
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter()][string[]]$Arguments = @(),
    [Parameter()][string]$WorkingDirectory = (Get-Location).Path
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    $argText = if ($Arguments.Count) { $Arguments -join " " } else { "" }
    throw "El comando fallo: $FilePath $argText"
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Remove-PathWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter()][int]$Attempts = 8,
    [Parameter()][int]$DelayMs = 500
  )

  for ($try = 1; $try -le $Attempts; $try += 1) {
    try {
      if (Test-Path $LiteralPath) {
        Remove-Item -LiteralPath $LiteralPath -Recurse -Force
      }
      return $true
    } catch {
      if ($try -ge $Attempts) {
        Write-Warning ("No se pudo limpiar el temporal {0}: {1}" -f $LiteralPath, $_.Exception.Message)
        return $false
      }
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  return $false
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pbExe = Join-Path $repoRoot "backend\pocketbase.exe"
$hooksDir = Join-Path $repoRoot "backend\pb_hooks"
$migrationsDir = Join-Path $repoRoot "backend\pb_migrations"
$dataDb = Join-Path $repoRoot "backend\pb_data\data.db"

$criticalFiles = @(
  "README.md",
  "frontend\client\cotizador\catalog.js",
  "frontend\client\cotizador\orders.js",
  "frontend\client\cotizadorcp\cotizacion.js",
  "frontend\client\cotizadorcp\orders.js",
  "frontend\client\public\public_plazamayor.html",
  "frontend\client\public\public_casadepiedra.html",
  "frontend\client\services\pb-core.js",
  "frontend\client\services\auth.js",
  "frontend\client\services\security.js",
  "frontend\client\system\config.html",
  "backend\pb_hooks\00_lib.pb.js",
  "backend\pb_hooks\10_cotizaciones.pb.js",
  "backend\pb_hooks\20_auth_session.pb.js",
  "backend\pb_hooks\31_public_availability.pb.js",
  "backend\pb_migrations\1700000001_init_cotizador.js"
) | ForEach-Object { Join-Path $repoRoot $_ }

$jsSyntaxTargets = @(
  "frontend\client\cotizador\catalog.js",
  "frontend\client\cotizador\orders.js",
  "frontend\client\cotizadorcp\cotizacion.js",
  "frontend\client\cotizadorcp\orders.js",
  "frontend\client\services\pb-core.js",
  "frontend\client\services\auth.js",
  "frontend\client\services\security.js",
  "backend\pb_hooks\00_lib.pb.js",
  "backend\pb_hooks\10_cotizaciones.pb.js",
  "backend\pb_hooks\20_auth_session.pb.js",
  "backend\pb_hooks\31_public_availability.pb.js"
) | ForEach-Object { Join-Path $repoRoot $_ }

Assert-Command "node"
Assert-Command "python"

if (-not (Test-Path $pbExe)) {
  throw "No se encontro PocketBase en $pbExe"
}

Write-Section "Archivos criticos"
foreach ($file in $criticalFiles) {
  if (-not (Test-Path $file)) {
    throw "Falta el archivo critico: $file"
  }
  Write-Host ("OK  {0}" -f $file.Replace($repoRoot + "\", ""))
}

Write-Section "Sintaxis JavaScript"
foreach ($file in $jsSyntaxTargets) {
  Write-Host ("CHK {0}" -f $file.Replace($repoRoot + "\", ""))
  Invoke-CheckedCommand -FilePath "node" -Arguments @("--check", $file) -WorkingDirectory $repoRoot
}

Write-Section "PocketBase cold start"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cotizador-audit-" + [guid]::NewGuid().ToString("N"))
$tempPbData = Join-Path $tempRoot "pb_data"
$stdoutLog = Join-Path $tempRoot "pb.stdout.log"
$stderrLog = Join-Path $tempRoot "pb.stderr.log"
$port = Get-FreeTcpPort
$pbProcess = $null

try {
  New-Item -ItemType Directory -Path $tempPbData -Force | Out-Null

  $pbArgs = @(
    "serve",
    "--http=127.0.0.1:$port",
    "--dir=""$tempPbData""",
    "--hooksDir=""$hooksDir""",
    "--migrationsDir=""$migrationsDir"""
  )
  $pbProcess = Start-Process -FilePath $pbExe `
    -ArgumentList $pbArgs `
    -WorkingDirectory $repoRoot `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  $healthy = $false
  for ($i = 0; $i -lt 60; $i += 1) {
    Start-Sleep -Milliseconds 500
    if ($pbProcess.HasExited) {
      $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { "" }
      throw "PocketBase termino antes de responder health. STDERR:`n$stderr"
    }
    try {
      $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $port) -Method Get -TimeoutSec 2
      if ($health.message -eq "API is healthy.") {
        $healthy = $true
        break
      }
    } catch {
      continue
    }
  }

  if (-not $healthy) {
    $stdout = if (Test-Path $stdoutLog) { Get-Content $stdoutLog -Raw } else { "" }
    $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { "" }
    throw "PocketBase no reporto health en el tiempo esperado.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
  }

  Write-Host ("OK  cold start en http://127.0.0.1:{0}" -f $port)
} finally {
  if ($pbProcess -and -not $pbProcess.HasExited) {
    Stop-Process -Id $pbProcess.Id -Force
    try {
      Wait-Process -Id $pbProcess.Id -Timeout 10 -ErrorAction Stop
    } catch {}
  }
  if (Test-Path $tempRoot) {
    Remove-PathWithRetry -LiteralPath $tempRoot | Out-Null
  }
}

Write-Section "Barrido read-only de base viva"
if (-not (Test-Path $dataDb)) {
  throw "No se encontro la base viva en $dataDb"
}

$pythonAudit = @'
import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1])
conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row

summary = {
    "spaces_by_tenant_type": {},
    "quotes_by_tenant_status": {},
    "cp_config_keys": [],
    "warnings": []
}

space_rows = conn.execute(
    """
    select tenant, coalesce(tipo, '') as tipo, count(*) as total
    from espacios
    group by tenant, coalesce(tipo, '')
    order by tenant, tipo
    """
).fetchall()
for row in space_rows:
    summary["spaces_by_tenant_type"].setdefault(row["tenant"], {})[row["tipo"] or "(vacio)"] = row["total"]

quote_rows = conn.execute(
    """
    select tenant, status, count(*) as total
    from cotizaciones
    group by tenant, status
    order by tenant, status
    """
).fetchall()
for row in quote_rows:
    summary["quotes_by_tenant_status"].setdefault(row["tenant"], {})[row["status"] or "(vacio)"] = row["total"]

config_rows = conn.execute(
    """
    select clave
    from configuracion
    where tenant = 'casa_de_piedra'
    order by clave
    """
).fetchall()
summary["cp_config_keys"] = [row["clave"] for row in config_rows]

legacy_root_missing = conn.execute(
    """
    select q.id, q.espacio_id, q.status
    from cotizaciones q
    left join espacios e
      on e.id = q.espacio_id
     and e.tenant = q.tenant
    where q.tenant = 'casa_de_piedra'
      and coalesce(q.espacio_id, '') <> ''
      and e.id is null
    order by q.updated_at desc
    """
).fetchall()

if legacy_root_missing:
    summary["warnings"].append({
        "code": "cp_root_space_without_catalog_record",
        "count": len(legacy_root_missing),
        "sample_ids": [row["id"] for row in legacy_root_missing[:10]]
    })

missing_detail_type = []
convenio_meta_mismatch = []

quotes = conn.execute(
    """
    select id, tenant, espacio_id, espacios_detalle, detalles_evento, desglose_precios
    from cotizaciones
    order by updated_at desc
    """
).fetchall()

def parse_json(raw, fallback):
    if raw in (None, ""):
        return fallback
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return fallback

for row in quotes:
    details = parse_json(row["espacios_detalle"], [])
    event = parse_json(row["detalles_evento"], {})
    pricing = parse_json(row["desglose_precios"], {})

    for detail in details:
      if not isinstance(detail, dict):
          continue
      if not str(detail.get("espacio_tipo") or detail.get("tipo") or "").strip():
          missing_detail_type.append(row["id"])
          break

    convenio = event.get("convenio") if isinstance(event, dict) else None
    if isinstance(convenio, dict) and convenio.get("activo") is True and convenio.get("bloqueo_indefinido") is True:
        flagged_details = []
        for detail in details:
            if not isinstance(detail, dict):
                continue
            if detail.get("convenio_indefinido") is True or detail.get("bloqueo_indefinido") is True:
                flagged_details.append(detail)
        if not flagged_details:
            convenio_meta_mismatch.append(row["id"])

if missing_detail_type:
    summary["warnings"].append({
        "code": "space_details_without_type",
        "count": len(missing_detail_type),
        "sample_ids": missing_detail_type[:10]
    })

if convenio_meta_mismatch:
    summary["warnings"].append({
        "code": "convenio_meta_without_detail_flag",
        "count": len(convenio_meta_mismatch),
        "sample_ids": convenio_meta_mismatch[:10]
    })

print(json.dumps(summary, ensure_ascii=False))
'@

$auditJson = $pythonAudit | python - $dataDb
if ($LASTEXITCODE -ne 0) {
  throw "Fallo el barrido read-only sobre SQLite."
}

$audit = $auditJson | ConvertFrom-Json
Write-Host "Espacios por tenant/tipo:"
$audit.spaces_by_tenant_type.PSObject.Properties | ForEach-Object {
  $tenant = $_.Name
  $pairs = $_.Value.PSObject.Properties | ForEach-Object { "{0}={1}" -f $_.Name, $_.Value }
  Write-Host ("- {0}: {1}" -f $tenant, ($pairs -join ", "))
}

Write-Host "Cotizaciones por tenant/status:"
$audit.quotes_by_tenant_status.PSObject.Properties | ForEach-Object {
  $tenant = $_.Name
  $pairs = $_.Value.PSObject.Properties | ForEach-Object { "{0}={1}" -f $_.Name, $_.Value }
  Write-Host ("- {0}: {1}" -f $tenant, ($pairs -join ", "))
}

Write-Host "Configuraciones Casa de Piedra:"
Write-Host ("- " + (($audit.cp_config_keys | Sort-Object) -join ", "))

if ($audit.warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "Advertencias detectadas:" -ForegroundColor Yellow
  foreach ($warning in $audit.warnings) {
    $samples = if ($warning.sample_ids) { ($warning.sample_ids -join ", ") } else { "sin muestras" }
    Write-Host ("- {0}: {1} caso(s). Muestras: {2}" -f $warning.code, $warning.count, $samples)
  }
} else {
  Write-Host "No se detectaron advertencias de datos en la muestra auditada."
}

Write-Section "Resultado"
Write-Host "Auditoria smoke finalizada correctamente." -ForegroundColor Green
