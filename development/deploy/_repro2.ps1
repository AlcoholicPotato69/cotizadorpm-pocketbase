# Repro 2: verificar si 10_cotizaciones (update) y 31_public_availability fallan por serializacion
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pbExe = Join-Path $repoRoot "backend\pocketbase.exe"
$hooksDir = Join-Path $repoRoot "backend\pb_hooks"
$migrationsDir = Join-Path $repoRoot "backend\pb_migrations"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cotizador-repro2-" + [guid]::NewGuid().ToString("N"))
$tempPbData = Join-Path $tempRoot "pb_data"
New-Item -ItemType Directory -Path $tempPbData -Force | Out-Null
$port = 53421
$baseUrl = "http://127.0.0.1:$port"

& $pbExe superuser upsert "su@x.local" "SuperPass#12345" --dir "$tempPbData" --hooksDir "$hooksDir" --migrationsDir "$migrationsDir" | Out-Null
$pbArgs = @("serve", "--http=127.0.0.1:$port", "--dir=""$tempPbData""", "--hooksDir=""$hooksDir""", "--migrationsDir=""$migrationsDir""", "--dev")
$proc = Start-Process -FilePath $pbExe -ArgumentList $pbArgs -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $tempRoot "out.log") -RedirectStandardError (Join-Path $tempRoot "err.log")

function TryCall($label, $script) {
  try { & $script; Write-Host "$label => OK" } catch {
    $msg = $_.Exception.Message
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $msg = $reader.ReadToEnd()
    } catch {}
    Write-Host "$label => FAIL: $msg"
  }
}

try {
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 2 | Out-Null; break } catch {}
  }
  $su = Invoke-RestMethod -Method POST -Uri "$baseUrl/api/collections/_superusers/auth-with-password" -Body (@{ identity = "su@x.local"; password = "SuperPass#12345" } | ConvertTo-Json) -ContentType "application/json"
  $suH = @{ Authorization = $su.token }

  # Cotizacion via superuser (create tiene bypass superuser ANTES de enforceQuotePermission)
  TryCall "CREATE cotizacion (superuser)" {
    $script:quote = Invoke-RestMethod -Method POST -Uri "$baseUrl/api/collections/cotizaciones/records" -Headers $suH -Body (@{
      tenant = "plaza_mayor"; fecha_inicio = "2026-08-01 10:00:00"; fecha_fin = "2026-08-01 18:00:00"
      precio_final = 1000; status = "pendiente"; cliente_nombre = "Cliente X"
    } | ConvertTo-Json) -ContentType "application/json"
  }

  # PATCH como superuser tiene bypass. PATCH anonimo choca con la API rule antes del hook.
  # El caso revelador: PATCH con usuario autenticado normal -> hook enforceQuotePermission.
  # Crear usuario via superuser fallara por el guard roto de app_users, asi que lo insertamos directo en el otro VM? No.
  # En su lugar: probamos public-availability (routerAdd con helpers de archivo).
  TryCall "GET public-availability" {
    Invoke-RestMethod -Uri "$baseUrl/api/cotizador/public-availability?tenant=plaza_mayor&spaceId=abc" -TimeoutSec 5 | Out-Null
  }

  # espacios: create via superuser -> hook 30 SIN bypass superuser llama enforceCatalogPermission (file-scope)
  TryCall "CREATE espacio (superuser, hook 30)" {
    Invoke-RestMethod -Method POST -Uri "$baseUrl/api/collections/espacios/records" -Headers $suH -Body (@{
      tenant = "plaza_mayor"; nombre = "Espacio X"; activo = $true
    } | ConvertTo-Json) -ContentType "application/json" | Out-Null
  }
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  Start-Sleep -Milliseconds 800
  Write-Host "--- OUT LOG (ERROR lines) ---"
  Get-Content (Join-Path $tempRoot "out.log") -ErrorAction SilentlyContinue | Select-String -Pattern "ERROR|ReferenceError" -Context 0,1 | ForEach-Object { $_.ToString() }
  try { Remove-Item -LiteralPath $tempRoot -Recurse -Force } catch {}
}
