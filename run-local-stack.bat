@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "LOG_DIR=%ROOT_DIR%\logs"
set "BACKEND_SCRIPT=%ROOT_DIR%\backend-service.bat"
set "STATIC_PS=%ROOT_DIR%\deploy\static-file-server.ps1"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

set "HOST=%~1"
set "BACKEND_PORT=%~2"
set "FRONT_PORT=%~3"
set "PAUSE_AT_END=1"
if /I "%~4"=="--no-pause" set "PAUSE_AT_END=0"
if not defined HOST set "HOST=127.0.0.1"
if not defined BACKEND_PORT set "BACKEND_PORT=8090"
if not defined FRONT_PORT set "FRONT_PORT=8080"

set "HOST_NO_SCHEME=%HOST%"
if /I "%HOST_NO_SCHEME:~0,7%"=="http://" set "HOST_NO_SCHEME=%HOST_NO_SCHEME:~7%"
if /I "%HOST_NO_SCHEME:~0,8%"=="https://" set "HOST_NO_SCHEME=%HOST_NO_SCHEME:~8%"
for /f "tokens=1 delims=/" %%A in ("%HOST_NO_SCHEME%") do set "HOST_NO_SCHEME=%%A"

echo.
echo [LOCAL STACK]
echo   HOST=%HOST_NO_SCHEME%
echo   BACKEND_PORT=%BACKEND_PORT%
echo   FRONT_PORT=%FRONT_PORT%
echo.

if not exist "%ROOT_DIR%\pocketbase.exe" (
  echo [ERROR] No se encontro pocketbase.exe
  goto :end_pause
)
if not exist "%STATIC_PS%" (
  echo [ERROR] No se encontro %STATIC_PS%
  goto :end_pause
)
if not exist "%BACKEND_SCRIPT%" (
  echo [ERROR] No se encontro %BACKEND_SCRIPT%
  goto :end_pause
)

echo [1/5] Configurando BACKEND_URL para frontend...
call "%BACKEND_SCRIPT%" set-url "http://%HOST_NO_SCHEME%:%BACKEND_PORT%"
if errorlevel 1 (
  echo [ERROR] No se pudo configurar BACKEND_URL.
  goto :end_pause
)

echo [2/5] Revisando backend...
set "PB_HEALTH_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "PB_HEALTH_OK="
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri $env:PB_HEALTH_URL -Method GET -TimeoutSec 3 -ErrorAction Stop; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo [INFO] Backend no responde. Iniciando pocketbase en nueva ventana...
  start "Cotizador Backend" cmd /k ""%ROOT_DIR%\pocketbase.exe" serve --http=0.0.0.0:%BACKEND_PORT% --dir="%ROOT_DIR%\pb_data" --hooksDir="%ROOT_DIR%\pb_hooks" --migrationsDir="%ROOT_DIR%\pb_migrations""
) else (
  echo [OK] Backend ya estaba corriendo en puerto %BACKEND_PORT%.
)

echo [3/5] Iniciando frontend en nueva ventana...
set "STATIC_LOG=%LOG_DIR%\frontend-static.log"
start "Cotizador Frontend" powershell -NoProfile -ExecutionPolicy Bypass -File "%STATIC_PS%" -RootDir "%ROOT_DIR%\client" -BindHost "127.0.0.1" -Port %FRONT_PORT% -LogFile "%STATIC_LOG%"

echo [4/5] Esperando disponibilidad...
set "PB_FRONT_URL=http://127.0.0.1:%FRONT_PORT%/index.html"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok=$false; for($i=1;$i -le 20;$i++){ try { $r=Invoke-WebRequest -Uri $env:PB_FRONT_URL -Method GET -TimeoutSec 2 -ErrorAction Stop; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 500 }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo [WARN] Frontend aun no responde. Revisa logs: %STATIC_LOG%
) else (
  echo [OK] Frontend disponible.
)

echo [5/5] Abriendo cotizador...
start "" "http://127.0.0.1:%FRONT_PORT%/index.html"

echo.
echo [OK] Stack local levantado.
echo      Frontend: http://127.0.0.1:%FRONT_PORT%/index.html
echo      Backend:  http://127.0.0.1:%BACKEND_PORT%/api/health
echo.
echo Para detener:
echo      stop-local-stack.bat
echo.

:end_pause
if "%PAUSE_AT_END%"=="1" pause
exit /b 0
