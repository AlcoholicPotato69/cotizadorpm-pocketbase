@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "BACKEND_SCRIPT=%SCRIPT_DIR%\backend-service.bat"
set "LOG_DIR=%ROOT_DIR%\backend\logs"
set "TMP_STEP_LOG=%TEMP%\levantar-todo-step.log"
set "PAUSE_AT_END=1"

if /I "%~1"=="--no-pause" set "PAUSE_AT_END=0"
if /I "%~1"=="help" goto :help
if /I "%~1"=="-h" goto :help
if /I "%~1"=="--help" goto :help

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

set "RUN_TS="
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "RUN_TS=%%I"
if not defined RUN_TS set "RUN_TS=%RANDOM%"
set "RUN_LOG=%LOG_DIR%\levantar-todo-%RUN_TS%.log"
> "%RUN_LOG%" echo [LEVANTAR-TODO-LOCAL] Inicio %DATE% %TIME%

echo.
echo ============================================================
echo   COTIZADOR - PREPARACION DE PRODUCCION ^+ NGINX
echo ============================================================
echo.

if not exist "%BACKEND_SCRIPT%" (
  echo [ERROR] No existe %BACKEND_SCRIPT%
  >> "%RUN_LOG%" echo [ERROR] No existe %BACKEND_SCRIPT%
  goto :fail
)
if not exist "%ROOT_DIR%\backend\pocketbase.exe" (
  echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  >> "%RUN_LOG%" echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  goto :fail
)

call :require_admin
if errorlevel 1 goto :fail

set "CUSTOM_IP=127.0.0.1"
set "CUSTOM_PORT=8090"
set "CUSTOM_FRONTEND_HOST=127.0.0.1"
set "CUSTOM_FRONTEND_PORT=80"

echo.
echo ============================================================
echo   CONFIGURACION DE BACKEND
echo ============================================================
echo.
echo Este valor se usara para que PocketBase escuche y para generar la plantilla Nginx.
echo Si Nginx correra en el mismo servidor, puedes dejar 127.0.0.1 y usar el proxy local.
set /p "CUSTOM_IP=Escribe la IP o hostname del backend [127.0.0.1]: "
set /p "CUSTOM_PORT=Escribe el puerto del backend [8090]: "
if "%CUSTOM_IP%"=="" set "CUSTOM_IP=127.0.0.1"
if "%CUSTOM_PORT%"=="" set "CUSTOM_PORT=8090"

echo.
echo ============================================================
echo   CONFIGURACION DE FRONTEND HTML
echo ============================================================
echo.
echo Los HTML NO se serviran desde PocketBase. Se preparara un site estatico para Nginx u otro servidor web.
echo Este origen se autorizara en CORS para que el frontend pueda hablar con el backend cuando no use mismo origen.
set /p "CUSTOM_FRONTEND_HOST=Escribe la IP o hostname del frontend HTML [127.0.0.1]: "
set /p "CUSTOM_FRONTEND_PORT=Escribe el puerto HTTP del frontend [80]: "
if "%CUSTOM_FRONTEND_HOST%"=="" set "CUSTOM_FRONTEND_HOST=127.0.0.1"
if "%CUSTOM_FRONTEND_PORT%"=="" set "CUSTOM_FRONTEND_PORT=80"
set "CUSTOM_FRONTEND_ORIGIN=http://%CUSTOM_FRONTEND_HOST%"
if not "%CUSTOM_FRONTEND_PORT%"=="80" set "CUSTOM_FRONTEND_ORIGIN=http://%CUSTOM_FRONTEND_HOST%:%CUSTOM_FRONTEND_PORT%"

call :exec_backend_step "Paso: Limpiando procesos huerfanos..." cleanup-orphans
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Desactivando HTTPS previo..." disable-https
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Forzando bind local..." set-bind "%CUSTOM_IP%:%CUSTOM_PORT%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Configurando URL real del backend..." set-url "http://%CUSTOM_IP%:%CUSTOM_PORT%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Configurando frontend same-origin para Nginx..." set-frontend-url "/"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Autorizando origen del frontend HTML..." set-frontend-origin "%CUSTOM_FRONTEND_ORIGIN%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Desactivando publicDir de PocketBase..." set-public-dir off
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Preparando carpeta estatica y nginx.conf..." prepare-nginx "production\deploy\nginx-site" "%CUSTOM_FRONTEND_HOST%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Instalando/actualizando servicio Windows..." install
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Iniciando servicio..." start
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Verificando estado del servicio..." status
if errorlevel 1 goto :fail

type "%TMP_STEP_LOG%" >nul 2>&1
call "%BACKEND_SCRIPT%" status > "%TMP_STEP_LOG%" 2>&1
type "%TMP_STEP_LOG%" >> "%RUN_LOG%"
type "%TMP_STEP_LOG%" | findstr /I "RUNNING" >nul
set "RUNNING_RC=%ERRORLEVEL%"
del /q "%TMP_STEP_LOG%" >nul 2>&1
if not "%RUNNING_RC%"=="0" (
  echo [ERROR] El servicio no quedo en RUNNING.
  >> "%RUN_LOG%" echo [ERROR] El servicio no quedo en RUNNING.
  goto :fail
)

echo [CHECK] Health-check local http://%CUSTOM_IP%:%CUSTOM_PORT%/api/health
>> "%RUN_LOG%" echo [CHECK] Health-check local http://%CUSTOM_IP%:%CUSTOM_PORT%/api/health
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok = $false; for ($i = 1; $i -le 20; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://%CUSTOM_IP%:%CUSTOM_PORT%/api/health' -TimeoutSec 5 -ErrorAction Stop; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $ok = $true; break } } catch { Start-Sleep -Seconds 1 } }; if (-not $ok) { exit 9 }"
if errorlevel 1 (
  echo [ERROR] Health-check local fallo.
  >> "%RUN_LOG%" echo [ERROR] Health-check local fallo.
  goto :fail
)

call "%BACKEND_SCRIPT%" show >> "%RUN_LOG%" 2>&1

echo.
echo ============================================================
echo   PREPARACION DE PRODUCCION COMPLETADA
echo ============================================================
echo   BACKEND_REAL: http://%CUSTOM_IP%:%CUSTOM_PORT%
echo   FRONTEND_ORIGIN: %CUSTOM_FRONTEND_ORIGIN%
echo   FRONTEND_RUNTIME: / ^(Nginx proxy /api y /_ al backend^)
echo   Servicio: CotizadorPocketBase
echo   Estado esperado: RUNNING
echo   Site Nginx: production\deploy\nginx-site
echo   nginx.conf: production\deploy\nginx\cotizador-production.conf
echo   Log: %RUN_LOG%
echo ============================================================
echo.

goto :end_ok

:exec_backend_step
set "STEP_LABEL=%~1"
set "STEP_CMD=%~2"
if not defined STEP_CMD (
  echo [ERROR] Paso sin comando: %STEP_LABEL%
  >> "%RUN_LOG%" echo [ERROR] Paso sin comando: %STEP_LABEL%
  exit /b 2
)
echo.
echo %STEP_LABEL%
>> "%RUN_LOG%" echo %STEP_LABEL%
>> "%RUN_LOG%" echo [CMD] "%BACKEND_SCRIPT%" %2 %3 %4 %5 %6 %7 %8 %9
call "%BACKEND_SCRIPT%" %2 %3 %4 %5 %6 %7 %8 %9 > "%TMP_STEP_LOG%" 2>&1
set "STEP_RC=%ERRORLEVEL%"
type "%TMP_STEP_LOG%"
type "%TMP_STEP_LOG%" >> "%RUN_LOG%"
del /q "%TMP_STEP_LOG%" >nul 2>&1
if not "%STEP_RC%"=="0" (
  echo [ERROR] Fallo en paso: %STEP_LABEL%
  >> "%RUN_LOG%" echo [ERROR] Fallo en paso: %STEP_LABEL% (rc=%STEP_RC%)
  exit /b %STEP_RC%
)
exit /b 0

:require_admin
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());" ^
  "if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [ERROR] Ejecuta este script como Administrador.
  >> "%RUN_LOG%" echo [ERROR] Sin privilegios de administrador.
  exit /b 10
)
exit /b 0

:fail
echo.
echo [ERROR] El flujo termino con errores.
echo [INFO] Revisa el log: %RUN_LOG%
>> "%RUN_LOG%" echo [ERROR] Finalizo con error en %DATE% %TIME%
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)
exit /b 1

:end_ok
if "%PAUSE_AT_END%"=="1" (
  echo.
  pause
)
exit /b 0

:help
echo.
echo levantar-todo.bat - Deja backend, frontend y artefactos Nginx listos para produccion.
echo.
echo Configura:
echo   - BIND_ADDR=IP:PUERTO
echo   - BACKEND_URL real del servicio
echo   - FRONTEND_BACKEND_URL=/ ^(mismo origen via Nginx^)
echo   - CORS_ALLOWED_ORIGINS con la IP/host del frontend HTML
echo   - PUBLIC_DIR desactivado para que PocketBase no sirva HTML
echo   - carpeta estatica production\deploy\nginx-site
echo   - plantilla production\deploy\nginx\cotizador-production.conf
echo   - servicio CotizadorPocketBase en RUNNING
echo.
echo Uso:
echo   levantar-todo.bat
echo   levantar-todo.bat --no-pause
echo.
exit /b 0
