@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_SCRIPT=%ROOT_DIR%\backend-service.bat"
set "CONF_FILE=%ROOT_DIR%\deploy\backend-service.local.conf"
set "LOG_DIR=%ROOT_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

set "DEPLOY_TS="
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "DEPLOY_TS=%%I"
if not defined DEPLOY_TS set "DEPLOY_TS=%RANDOM%"
set "DEPLOY_LOG=%LOG_DIR%\deploy-production-%DEPLOY_TS%.log"
> "%DEPLOY_LOG%" echo [DEPLOY] Inicio %DATE% %TIME%

if /I "%~1"=="help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--help" goto :help

set "DEPLOY_HOST=%~1"
set "DEPLOY_PORT=%~2"
set "HEALTH_TIMEOUT=%~3"
set "INTERACTIVE_MODE=0"

if not defined DEPLOY_HOST (
  set "INTERACTIVE_MODE=1"
  echo.
  echo [INFO] Modo interactivo de despliegue.
  set /p DEPLOY_HOST=IP o hostname del backend ^(ej: 192.168.1.50^): 
  if not defined DEPLOY_HOST (
    echo [ERROR] Debes capturar una IP o hostname.
    goto :pause_and_exit_1
  )
  set /p DEPLOY_PORT=Puerto backend [8090]: 
  set /p HEALTH_TIMEOUT=Timeout health-check [45]: 
)

if not defined DEPLOY_PORT set "DEPLOY_PORT=8090"
if not defined HEALTH_TIMEOUT set "HEALTH_TIMEOUT=45"

set "PORT_NONNUM="
for /f "delims=0123456789" %%A in ("%DEPLOY_PORT%") do set "PORT_NONNUM=%%A"
if defined PORT_NONNUM (
  echo [ERROR] Puerto invalido: %DEPLOY_PORT%
  set "EXIT_CODE=1" & goto :exit_with
)
if "%DEPLOY_PORT%"=="" (
  echo [ERROR] Puerto invalido: %DEPLOY_PORT%
  set "EXIT_CODE=1" & goto :exit_with
)

set "TIMEOUT_NONNUM="
for /f "delims=0123456789" %%A in ("%HEALTH_TIMEOUT%") do set "TIMEOUT_NONNUM=%%A"
if defined TIMEOUT_NONNUM (
  echo [ERROR] Timeout invalido: %HEALTH_TIMEOUT%
  set "EXIT_CODE=1" & goto :exit_with
)
if "%HEALTH_TIMEOUT%"=="" (
  echo [ERROR] Timeout invalido: %HEALTH_TIMEOUT%
  set "EXIT_CODE=1" & goto :exit_with
)

if not exist "%BACKEND_SCRIPT%" (
  echo [ERROR] No existe: %BACKEND_SCRIPT%
  >> "%DEPLOY_LOG%" echo [ERROR] No existe: %BACKEND_SCRIPT%
  set "EXIT_CODE=2" & goto :exit_with
)

call :require_admin || (set "EXIT_CODE=10" & goto :exit_with)

echo.
echo [1/4] Configurando BACKEND_URL por IP...
>> "%DEPLOY_LOG%" echo [1/4] set-ip %DEPLOY_HOST% %DEPLOY_PORT%
call "%BACKEND_SCRIPT%" set-ip "%DEPLOY_HOST%" "%DEPLOY_PORT%" > "%TEMP%\deploy-production-step.log" 2>&1
set "STEP_RC=%ERRORLEVEL%"
type "%TEMP%\deploy-production-step.log"
type "%TEMP%\deploy-production-step.log" >> "%DEPLOY_LOG%"
del /q "%TEMP%\deploy-production-step.log" >nul 2>&1
if not "%STEP_RC%"=="0" (
  echo [ERROR] Fallo en set-ip.
  >> "%DEPLOY_LOG%" echo [ERROR] Fallo en set-ip. rc=%STEP_RC%
  set "EXIT_CODE=20" & goto :exit_with
)

echo.
echo [2/4] Instalando/actualizando servicio...
>> "%DEPLOY_LOG%" echo [2/4] install
call "%BACKEND_SCRIPT%" install > "%TEMP%\deploy-production-step.log" 2>&1
set "STEP_RC=%ERRORLEVEL%"
type "%TEMP%\deploy-production-step.log"
type "%TEMP%\deploy-production-step.log" >> "%DEPLOY_LOG%"
del /q "%TEMP%\deploy-production-step.log" >nul 2>&1
if not "%STEP_RC%"=="0" (
  echo [ERROR] Fallo al instalar/configurar el servicio.
  >> "%DEPLOY_LOG%" echo [ERROR] Fallo install. rc=%STEP_RC%
  set "EXIT_CODE=21" & goto :exit_with
)

echo.
echo [3/4] Iniciando servicio...
>> "%DEPLOY_LOG%" echo [3/4] start
call "%BACKEND_SCRIPT%" start > "%TEMP%\deploy-production-step.log" 2>&1
set "START_RC=%ERRORLEVEL%"
type "%TEMP%\deploy-production-step.log"
type "%TEMP%\deploy-production-step.log" >> "%DEPLOY_LOG%"
del /q "%TEMP%\deploy-production-step.log" >nul 2>&1

call "%BACKEND_SCRIPT%" status > "%TEMP%\deploy-production-step.log" 2>&1
type "%TEMP%\deploy-production-step.log"
type "%TEMP%\deploy-production-step.log" >> "%DEPLOY_LOG%"
type "%TEMP%\deploy-production-step.log" | findstr /I "RUNNING" >nul
del /q "%TEMP%\deploy-production-step.log" >nul 2>&1
if errorlevel 1 (
  if not "%START_RC%"=="0" echo [WARN] El comando start devolvio codigo %START_RC%.
  echo [ERROR] El servicio no quedo en estado RUNNING.
  >> "%DEPLOY_LOG%" echo [ERROR] Servicio no RUNNING. start_rc=%START_RC%
  set "EXIT_CODE=22" & goto :exit_with
)
if "%START_RC%"=="0" (
  echo [OK] Servicio iniciado.
  >> "%DEPLOY_LOG%" echo [OK] Servicio iniciado.
) else (
  echo [INFO] Servicio ya estaba en ejecucion.
  >> "%DEPLOY_LOG%" echo [INFO] Servicio ya estaba en ejecucion. start_rc=%START_RC%
)

call :load_backend_url
if not defined BACKEND_URL set "BACKEND_URL=http://%DEPLOY_HOST%:%DEPLOY_PORT%"
set "HEALTH_URL=%BACKEND_URL%/api/health"

echo.
echo [4/4] Health-check: %HEALTH_URL%
>> "%DEPLOY_LOG%" echo [4/4] health-check %HEALTH_URL%
set "PB_HEALTH_URL=%HEALTH_URL%"
set "PB_HEALTH_TIMEOUT=%HEALTH_TIMEOUT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url = $env:PB_HEALTH_URL; $timeout = [int]$env:PB_HEALTH_TIMEOUT; if ($timeout -lt 5) { $timeout = 5 }; $ok = $false;" ^
  "$supportsSkipCert = (Get-Command Invoke-WebRequest).Parameters.ContainsKey('SkipCertificateCheck');" ^
  "if ($url -like 'https://*' -and -not $supportsSkipCert) { [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true } };" ^
  "for ($i = 1; $i -le $timeout; $i++) {" ^
  "  try {" ^
  "    $req = @{ Uri = $url; Method = 'GET'; TimeoutSec = 5; ErrorAction = 'Stop' };" ^
  "    if ($url -like 'https://*' -and $supportsSkipCert) { $req.SkipCertificateCheck = $true };" ^
  "    $resp = Invoke-WebRequest @req;" ^
  "    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) { $ok = $true; break };" ^
  "  } catch { Start-Sleep -Seconds 1; continue }" ^
  "}" ^
  "if (-not $ok) { exit 9 }"
if errorlevel 1 (
  echo [ERROR] Health-check fallo en %HEALTH_URL%
  >> "%DEPLOY_LOG%" echo [ERROR] Health-check fallo en %HEALTH_URL%
  set "EXIT_CODE=23" & goto :exit_with
)

echo [OK] Health-check exitoso.
>> "%DEPLOY_LOG%" echo [OK] Health-check exitoso.
echo.
echo Despliegue completado:
echo   BACKEND_URL=%BACKEND_URL%
echo   HEALTH_URL=%HEALTH_URL%
echo   LOG=%DEPLOY_LOG%
>> "%DEPLOY_LOG%" echo [OK] Despliegue completado. BACKEND_URL=%BACKEND_URL%
>> "%DEPLOY_LOG%" echo [OK] HEALTH_URL=%HEALTH_URL%
>> "%DEPLOY_LOG%" echo [OK] Fin %DATE% %TIME%
echo.
set "EXIT_CODE=0" & goto :exit_with

:pause_and_exit_1
echo.
pause
exit /b 1

:exit_with
if not defined EXIT_CODE set "EXIT_CODE=1"
if not "%EXIT_CODE%"=="0" (
  >> "%DEPLOY_LOG%" echo [ERROR] Finalizo con codigo %EXIT_CODE% en %DATE% %TIME%
)
echo [INFO] Log: %DEPLOY_LOG%
if "%INTERACTIVE_MODE%"=="1" (
  echo.
  pause
)
exit /b %EXIT_CODE%

:load_backend_url
set "BACKEND_URL="
if not exist "%CONF_FILE%" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in ("%CONF_FILE%") do (
  if /I "%%~A"=="BACKEND_URL" set "BACKEND_URL=%%~B"
)
exit /b 0

:require_admin
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());" ^
  "if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [ERROR] Ejecuta este comando en una consola con privilegios de Administrador.
  echo [INFO] Tip: clic derecho sobre CMD/PowerShell -^> Ejecutar como administrador.
  >> "%DEPLOY_LOG%" echo [ERROR] Sin privilegios de administrador.
  if "%INTERACTIVE_MODE%"=="1" (
    echo.
    pause
  )
  exit /b 10
)
exit /b 0

:help
echo.
echo deploy-production.bat - Despliegue rapido de produccion (un clic)
echo.
echo Flujo:
echo   1) set-ip
echo   2) install
echo   3) start
echo   4) health-check
echo.
echo Uso:
echo   deploy-production.bat ^<IP_O_HOST^> [PUERTO_BACKEND] [TIMEOUT_SEG]
echo.
echo Ejemplos:
echo   deploy-production.bat 192.168.1.50
echo   deploy-production.bat 192.168.1.50 8090 60
echo.
echo Nota:
echo   - Se ejecuta como Administrador.
echo   - Para HTTPS autofirmado usa despues:
echo       backend-service.bat enable-https ^<IP_O_HOST^> [PUERTO_HTTPS]
echo.
exit /b 0
