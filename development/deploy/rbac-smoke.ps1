# Smoke test del motor RBAC: arranca un PocketBase efimero con las migraciones y hooks
# del repo, crea usuarios de prueba y verifica el contrato completo:
#   - admin (grants_admin): is_admin=true, lista usuarios/roles, edita cotizaciones
#   - verificador: is_admin=false, NO edita cotizaciones (deny del engine), lee su tenant
#   - asignacion dinamica: users/access con IDs de rol promueve a admin (RC2) y sincroniza is_admin
#   - sin cambios reales en users/access NO se revocan sesiones
$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host ("=== {0} ===" -f $title) -ForegroundColor Cyan
}

function Assert-True($condition, $label) {
  if (-not $condition) {
    throw "FALLO: $label"
  }
  Write-Host ("OK  {0}" -f $label) -ForegroundColor Green
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pbExe = Join-Path $repoRoot "backend\pocketbase.exe"
$hooksDir = Join-Path $repoRoot "backend\pb_hooks"
$migrationsDir = Join-Path $repoRoot "backend\pb_migrations"

if (-not (Test-Path $pbExe)) { throw "No se encontro PocketBase en $pbExe" }

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cotizador-rbac-" + [guid]::NewGuid().ToString("N"))
$tempPbData = Join-Path $tempRoot "pb_data"
$stdoutLog = Join-Path $tempRoot "pb.stdout.log"
$stderrLog = Join-Path $tempRoot "pb.stderr.log"
New-Item -ItemType Directory -Path $tempPbData -Force | Out-Null

$port = Get-FreeTcpPort
$baseUrl = "http://127.0.0.1:$port"
$suEmail = "smoke-superuser@cotizador.local"
$suPass = "SmokeSuper#12345"
$adminPass = "AdminSmoke#12345"
$verifPass = "VerifSmoke#12345"
$promoPass = "PromoSmoke#12345"
$pbProcess = $null

# Invoca la API devolviendo siempre @{ Status; Data } sin lanzar por códigos HTTP de error.
function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    $Body = $null
  )
  $args = @{
    Method = $Method
    Uri = $Url
    Headers = $Headers
    TimeoutSec = 15
  }
  if ($null -ne $Body) {
    $args.Body = ($Body | ConvertTo-Json -Depth 12)
    $args.ContentType = "application/json"
  }
  try {
    $data = Invoke-RestMethod @args
    return @{ Status = 200; Data = $data }
  } catch {
    $status = 0
    $response = $_.Exception.Response
    if ($response) {
      try { $status = [int]$response.StatusCode.value__ } catch {}
      if ($status -eq 0) {
        try { $status = [int]$response.StatusCode } catch {}
      }
    }
    $detail = $null
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $detail = $reader.ReadToEnd() | ConvertFrom-Json
      }
    } catch {}
    if (-not $detail -and $_.ErrorDetails -and $_.ErrorDetails.Message) {
      try { $detail = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
    }
    return @{ Status = $status; Data = $detail }
  }
}

try {
  Write-Section "Bootstrap PocketBase efimero"
  & $pbExe superuser upsert $suEmail $suPass --dir "$tempPbData" --hooksDir "$hooksDir" --migrationsDir "$migrationsDir" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el superusuario de prueba." }

  $pbArgs = @(
    "serve",
    "--http=127.0.0.1:$port",
    "--dir=""$tempPbData""",
    "--hooksDir=""$hooksDir""",
    "--migrationsDir=""$migrationsDir""",
    "--dev"
  )
  $pbProcess = Start-Process -FilePath $pbExe -ArgumentList $pbArgs -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $healthy = $false
  for ($i = 0; $i -lt 60; $i += 1) {
    Start-Sleep -Milliseconds 500
    if ($pbProcess.HasExited) {
      $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { "" }
      throw "PocketBase termino antes de responder. STDERR:`n$stderr"
    }
    $health = Invoke-Api -Method GET -Url "$baseUrl/api/health"
    if ($health.Status -eq 200) { $healthy = $true; break }
  }
  Assert-True $healthy "PocketBase respondio health en $baseUrl"

  $suAuth = Invoke-Api -Method POST -Url "$baseUrl/api/collections/_superusers/auth-with-password" -Body @{ identity = $suEmail; password = $suPass }
  Assert-True ($suAuth.Status -eq 200 -and $suAuth.Data.token) "Login de superusuario"
  $suHeaders = @{ Authorization = $suAuth.Data.token }

  Write-Section "Semillas RBAC (grants_admin)"
  $roles = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_roles/records?perPage=100" -Headers $suHeaders
  Assert-True ($roles.Status -eq 200 -and $roles.Data.items.Count -ge 5) "app_roles sembrado con roles base"
  $adminRole = $roles.Data.items | Where-Object { $_.slug -eq "admin" }
  $verifRole = $roles.Data.items | Where-Object { $_.slug -eq "verificador" }
  Assert-True ($adminRole -and $adminRole.grants_admin -eq $true) "Rol admin tiene grants_admin=true"
  Assert-True ($verifRole -and (-not $verifRole.grants_admin)) "Rol verificador NO otorga admin"
  Assert-True ($verifRole.system_role -eq $true) "Rol verificador sigue protegido (system_role)"

  Write-Section "Usuarios de prueba"
  function New-TestUser($email, $password, $roleField, $roleIds, $isAdmin) {
    $payload = @{
      email = $email
      password = $password
      passwordConfirm = $password
      login_username = ($email.Split("@")[0])
      role = $roleField
      tenant_default = "plaza_mayor"
      allowed_tenants = @("plaza_mayor", "casa_de_piedra")
      is_admin = $isAdmin
      app_metadata = @{ rbac = @{ role_ids = $roleIds } }
    }
    $res = Invoke-Api -Method POST -Url "$baseUrl/api/collections/app_users/records" -Headers $suHeaders -Body $payload
    if (-not ($res.Status -eq 200 -and $res.Data.id)) {
      $detail = if ($res.Data) { $res.Data | ConvertTo-Json -Depth 8 -Compress } else { "(sin cuerpo)" }
      throw "FALLO: Usuario creado: $email | HTTP $($res.Status) | $detail"
    }
    Write-Host ("OK  Usuario creado: {0}" -f $email) -ForegroundColor Green
    return $res.Data
  }

  $adminUser = New-TestUser "admin-smoke@cotizador.local" $adminPass "admin" @($adminRole.id) $true
  $verifUser = New-TestUser "verif-smoke@cotizador.local" $verifPass "verificador" @($verifRole.id) $false
  $promoUser = New-TestUser "promo-smoke@cotizador.local" $promoPass "plaza_mayor" @() $false

  # Origin fuerza a que el endpoint de sesion devuelva el token en el body.
  $loginHeaders = @{ Origin = $baseUrl }
  function Get-SessionToken($identity, $password, $label) {
    $login = Invoke-Api -Method POST -Url "$baseUrl/api/hub/session/login" -Headers $loginHeaders -Body @{ identity = $identity; password = $password }
    Assert-True ($login.Status -eq 200 -and $login.Data.token) "Login de $label"
    return $login
  }

  $adminLogin = Get-SessionToken "admin-smoke@cotizador.local" $adminPass "admin"
  $adminHeaders = @{ Authorization = $adminLogin.Data.token }

  $quote = Invoke-Api -Method POST -Url "$baseUrl/api/collections/cotizaciones/records" -Headers $adminHeaders -Body @{
    tenant = "plaza_mayor"
    fecha_inicio = "2026-08-01"
    fecha_fin = "2026-08-01"
    precio_final = 1000
    status = "pendiente"
    cliente_nombre = "Cliente Smoke"
  }
  if (-not ($quote.Status -eq 200 -and $quote.Data.id)) {
    $detail = if ($quote.Data) { $quote.Data | ConvertTo-Json -Depth 8 -Compress } else { "(sin cuerpo)" }
    if (Test-Path $stderrLog) {
      Write-Host "--- PB STDERR (tail) ---" -ForegroundColor Yellow
      Get-Content $stderrLog -Tail 30 -ErrorAction SilentlyContinue
    }
    if (Test-Path $stdoutLog) {
      Write-Host "--- PB STDOUT (tail) ---" -ForegroundColor Yellow
      Get-Content $stdoutLog -Tail 30 -ErrorAction SilentlyContinue
    }
    throw "FALLO: Cotizacion semilla creada | HTTP $($quote.Status) | $detail"
  }
  Write-Host ("OK  Cotizacion semilla creada") -ForegroundColor Green
  $quoteId = $quote.Data.id

  Write-Section "Asserts ADMIN"
  Assert-True ($adminLogin.Data.user.is_admin -eq $true) "Sesion admin reporta is_admin=true"

  $eff = Invoke-Api -Method GET -Url "$baseUrl/api/hub/rbac/effective" -Headers $adminHeaders
  Assert-True ($eff.Status -eq 200 -and $eff.Data.effective.is_admin -eq $true) "GET /rbac/effective is_admin=true (admin)"

  $usersList = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_users/records?perPage=50" -Headers $adminHeaders
  Assert-True ($usersList.Status -eq 200 -and $usersList.Data.items.Count -ge 3) "Admin lista app_users (regla is_admin)"

  $rolesList = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_roles/records?perPage=50" -Headers $adminHeaders
  Assert-True ($rolesList.Status -eq 200 -and $rolesList.Data.items.Count -ge 5) "Admin lista app_roles (regla is_admin)"

  $adminPatch = Invoke-Api -Method PATCH -Url "$baseUrl/api/collections/cotizaciones/records/$quoteId" -Headers $adminHeaders -Body @{ personas = 50 }
  Assert-True ($adminPatch.Status -eq 200) "Admin edita cotizacion (200)"

  $adminCatalog = Invoke-Api -Method GET -Url "$baseUrl/api/hub/rbac/catalog" -Headers $adminHeaders
  Assert-True ($adminCatalog.Status -eq 200 -and $adminCatalog.Data.ok -eq $true) "Admin accede catalogo RBAC (config)"

  $adminUsers = Invoke-Api -Method GET -Url "$baseUrl/api/hub/rbac/users" -Headers $adminHeaders
  Assert-True ($adminUsers.Status -eq 200 -and $adminUsers.Data.ok -eq $true -and $adminUsers.Data.users.Count -ge 1) "Admin lista usuarios via hub RBAC (config)"

  $adminConfig = Invoke-Api -Method GET -Url "$baseUrl/api/collections/configuracion/records?perPage=5&filter=tenant='plaza_mayor'" -Headers $adminHeaders
  Assert-True ($adminConfig.Status -eq 200) "Admin lee configuracion del tenant (200)"

  Write-Section "Asserts VERIFICADOR"
  $verifLogin = Get-SessionToken "verif-smoke@cotizador.local" $verifPass "verificador"
  Assert-True (-not $verifLogin.Data.user.is_admin) "Sesion verificador reporta is_admin=false"
  $verifHeaders = @{ Authorization = $verifLogin.Data.token }

  $verifQuotes = Invoke-Api -Method GET -Url "$baseUrl/api/collections/cotizaciones/records?perPage=10" -Headers $verifHeaders
  Assert-True ($verifQuotes.Status -eq 200 -and $verifQuotes.Data.items.Count -ge 1) "Verificador SI lee cotizaciones de su tenant"

  $verifUsers = Invoke-Api -Method GET -Url "$baseUrl/api/hub/rbac/users" -Headers $verifHeaders
  Assert-True ($verifUsers.Status -eq 403) "Verificador NO lista usuarios RBAC (403)"
  $verifQuoteId = if ($verifQuotes.Data.items[0].id) { $verifQuotes.Data.items[0].id } else { $quoteId }

  $verifPatch = Invoke-Api -Method PATCH -Url "$baseUrl/api/collections/cotizaciones/records/$verifQuoteId" -Headers $verifHeaders -Body @{ personas = 99 }
  $blockedEdit = ($verifPatch.Status -eq 403 -or $verifPatch.Status -eq 404)
  if (-not $blockedEdit) {
    $detail = if ($verifPatch.Data) { $verifPatch.Data | ConvertTo-Json -Depth 8 -Compress } else { "(sin cuerpo)" }
    throw "FALLO: Verificador NO edita cotizaciones (403/404) | HTTP $($verifPatch.Status) | $detail"
  }
  Write-Host ("OK  Verificador NO edita cotizaciones ($($verifPatch.Status))") -ForegroundColor Green

  $verifDelete = Invoke-Api -Method DELETE -Url "$baseUrl/api/collections/cotizaciones/records/$verifQuoteId" -Headers $verifHeaders
  $blockedDelete = ($verifDelete.Status -eq 403 -or $verifDelete.Status -eq 404)
  if (-not $blockedDelete) {
    $detail = if ($verifDelete.Data) { $verifDelete.Data | ConvertTo-Json -Depth 8 -Compress } else { "(sin cuerpo)" }
    throw "FALLO: Verificador NO elimina cotizaciones (403/404) | HTTP $($verifDelete.Status) | $detail"
  }
  Write-Host ("OK  Verificador NO elimina cotizaciones ($($verifDelete.Status))") -ForegroundColor Green

  $verifRoles = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_roles/records?perPage=10" -Headers $verifHeaders
  Assert-True ($verifRoles.Status -eq 200 -and $verifRoles.Data.items.Count -eq 0) "Verificador no ve app_roles (filtro is_admin)"

  Write-Section "Asignacion dinamica (users/access)"
  # Sin cambios reales -> NO se revoca la sesion del usuario objetivo.
  $noopAccess = Invoke-Api -Method POST -Url "$baseUrl/api/hub/rbac/users/access" -Headers $adminHeaders -Body @{
    user_id = $verifUser.id
    role_ids = @($verifRole.id)
    tenant_default = "plaza_mayor"
    allowed_tenants = @("plaza_mayor", "casa_de_piedra")
    password = $adminPass
  }
  Assert-True ($noopAccess.Status -eq 200) "users/access sin cambios responde 200"
  $verifStill = Invoke-Api -Method GET -Url "$baseUrl/api/collections/cotizaciones/records?perPage=1" -Headers $verifHeaders
  Assert-True ($verifStill.Status -eq 200) "Sesion del verificador sigue viva (no hubo revocacion sin cambios)"

  # Promocion usando IDs de registro de rol (el caso que rompia RC2).
  $promo = Invoke-Api -Method POST -Url "$baseUrl/api/hub/rbac/users/access" -Headers $adminHeaders -Body @{
    user_id = $promoUser.id
    role_ids = @($adminRole.id)
    tenant_default = "plaza_mayor"
    allowed_tenants = @("plaza_mayor", "casa_de_piedra")
    password = $adminPass
  }
  Assert-True ($promo.Status -eq 200) "users/access promueve con ID de rol (200)"

  $promoRecord = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_users/records/$($promoUser.id)" -Headers $suHeaders
  Assert-True ($promoRecord.Data.role -eq "admin") "Campo legacy role sincronizado a 'admin' (fix RC2)"
  Assert-True ($promoRecord.Data.is_admin -eq $true) "is_admin materializado sincronizado a true"

  $promoLogin = Get-SessionToken "promo-smoke@cotizador.local" $promoPass "usuario promovido"
  Assert-True ($promoLogin.Data.user.is_admin -eq $true) "Usuario promovido inicia sesion como admin efectivo"
  $promoHeaders = @{ Authorization = $promoLogin.Data.token }
  $promoUsers = Invoke-Api -Method GET -Url "$baseUrl/api/collections/app_users/records?perPage=10" -Headers $promoHeaders
  Assert-True ($promoUsers.Status -eq 200 -and $promoUsers.Data.items.Count -ge 3) "Usuario promovido lista app_users de inmediato"

  Write-Section "Resultado"
  Write-Host "Smoke RBAC finalizado correctamente." -ForegroundColor Green
} finally {
  if ($pbProcess -and -not $pbProcess.HasExited) {
    Stop-Process -Id $pbProcess.Id -Force
    try { Wait-Process -Id $pbProcess.Id -Timeout 10 -ErrorAction Stop } catch {}
  }
  if (Test-Path $tempRoot) {
    try { Remove-Item -LiteralPath $tempRoot -Recurse -Force } catch {
      Write-Warning ("No se pudo limpiar {0}" -f $tempRoot)
    }
  }
}
