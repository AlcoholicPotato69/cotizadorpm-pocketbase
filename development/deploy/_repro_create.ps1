# Repro temporal: crear app_user via superuser en instancia efimera con --dev
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pbExe = Join-Path $repoRoot "backend\pocketbase.exe"
$hooksDir = Join-Path $repoRoot "backend\pb_hooks"
$migrationsDir = Join-Path $repoRoot "backend\pb_migrations"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cotizador-repro-" + [guid]::NewGuid().ToString("N"))
$tempPbData = Join-Path $tempRoot "pb_data"
New-Item -ItemType Directory -Path $tempPbData -Force | Out-Null
$port = 53219
$baseUrl = "http://127.0.0.1:$port"

& $pbExe superuser upsert "su@x.local" "SuperPass#12345" --dir "$tempPbData" --hooksDir "$hooksDir" --migrationsDir "$migrationsDir" | Out-Null

$pbArgs = @("serve", "--http=127.0.0.1:$port", "--dir=""$tempPbData""", "--hooksDir=""$hooksDir""", "--migrationsDir=""$migrationsDir""", "--dev")
$proc = Start-Process -FilePath $pbExe -ArgumentList $pbArgs -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $tempRoot "out.log") -RedirectStandardError (Join-Path $tempRoot "err.log")

try {
  $ok = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 | Out-Null
      $ok = $true; break
    } catch {}
  }
  if (-not $ok) { throw "no health" }

  $su = Invoke-RestMethod -Method POST -Uri "$baseUrl/api/collections/_superusers/auth-with-password" -Body (@{ identity = "su@x.local"; password = "SuperPass#12345" } | ConvertTo-Json) -ContentType "application/json"
  $roles = Invoke-RestMethod -Method GET -Uri "$baseUrl/api/collections/app_roles/records?perPage=100" -Headers @{ Authorization = $su.token }
  $adminRole = $roles.items | Where-Object { $_.slug -eq "admin" }
  Write-Host "adminRoleId=$($adminRole.id)"

  $payload = @{
    email = "admin-x@x.local"
    password = "AdminPass#12345"
    passwordConfirm = "AdminPass#12345"
    login_username = "admin-x"
    role = "admin"
    tenant_default = "plaza_mayor"
    allowed_tenants = @("plaza_mayor", "casa_de_piedra")
    is_admin = $true
    app_metadata = @{ rbac = @{ role_ids = @($adminRole.id) } }
  } | ConvertTo-Json -Depth 8

  try {
    $res = Invoke-RestMethod -Method POST -Uri "$baseUrl/api/collections/app_users/records" -Headers @{ Authorization = $su.token } -Body $payload -ContentType "application/json"
    Write-Host "CREATED OK: $($res.id)"
  } catch {
    Write-Host "CREATE FAILED:"
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      Write-Host $reader.ReadToEnd()
    } catch { Write-Host $_.Exception.Message }
  }
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  Start-Sleep -Milliseconds 800
  Write-Host "--- ERR LOG (tail) ---"
  Get-Content (Join-Path $tempRoot "err.log") -Tail 40 -ErrorAction SilentlyContinue
  Write-Host "--- OUT LOG (tail) ---"
  Get-Content (Join-Path $tempRoot "out.log") -Tail 40 -ErrorAction SilentlyContinue
  Write-Host "TEMP=$tempRoot"
}
