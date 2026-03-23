@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_SCRIPT=%ROOT_DIR%\backend-service.bat"
set "LOG_DIR=%ROOT_DIR%\logs"
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
echo   COTIZADOR - REPARACION LOCAL ^(127.0.0.1^)
echo ============================================================
echo.

if not exist "%BACKEND_SCRIPT%" (
  echo [ERROR] No existe %BACKEND_SCRIPT%
  >> "%RUN_LOG%" echo [ERROR] No existe %BACKEND_SCRIPT%
  goto :fail
)
if not exist "%ROOT_DIR%\pocketbase.exe" (
  echo [ERROR] No existe pocketbase.exe en %ROOT_DIR%
  >> "%RUN_LOG%" echo [ERROR] No existe pocketbase.exe en %ROOT_DIR%
  goto :fail
)

call :require_admin
if errorlevel 1 goto :fail

set "CUSTOM_IP=127.0.0.1"
set "CUSTOM_PORT=8090"

echo.
echo ============================================================
echo   CONFIGURACION DE RED
echo ============================================================
echo.
CHOICE /C SN /T 10 /D N /M "Desea cambiar la IP y el Puerto por defecto (127.0.0.1:8090)? [S/N]"
if errorlevel 2 goto skip_net_cfg
if errorlevel 1 (
    set /p "CUSTOM_IP=Escribe la IP del backend (ej: 192.168.1.50) [127.0.0.1]: "
    set /p "CUSTOM_PORT=Escribe el puerto [8090]: "
)
:skip_net_cfg
if "%CUSTOM_IP%"=="" set "CUSTOM_IP=127.0.0.1"
if "%CUSTOM_PORT%"=="" set "CUSTOM_PORT=8090"

call :exec_backend_step "Paso: Limpiando procesos huerfanos..." cleanup-orphans
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Desactivando HTTPS previo..." disable-https
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Forzando bind local..." set-bind "%CUSTOM_IP%:%CUSTOM_PORT%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Forzando URL local para frontend..." set-url "http://%CUSTOM_IP%:%CUSTOM_PORT%"
if errorlevel 1 goto :fail

call :exec_backend_step "Paso: Configurando ICS local..." set-ics "/api/cotizador/cp-calendar-ics" "-"
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
echo   REPARACION LOCAL COMPLETADA
echo ============================================================
echo   BACKEND_URL: http://%CUSTOM_IP%:%CUSTOM_PORT%
echo   Servicio: CotizadorPocketBase
echo   Estado esperado: RUNNING
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
echo levantar-todo.bat - Repara y deja TODO en modo LOCAL o el configurado.
echo.
echo Fuerza:
echo   - BIND_ADDR=127.0.0.1:8090 (o el personalizado)
echo   - BACKEND_URL=http://127.0.0.1:8090 (o el personalizado)
echo   - ICS local por defecto
echo   - servicio CotizadorPocketBase en RUNNING
echo.
echo Uso:
echo   levantar-todo.bat
echo   levantar-todo.bat --no-pause
echo.
exit /b 0
