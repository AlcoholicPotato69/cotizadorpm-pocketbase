@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "DEV_BIND=127.0.0.1:8090"
set "DEV_PORT=8090"
set "PB_DATA_DIR=%ROOT_DIR%\backend\pb_data"
set "PB_HOOKS_DIR=%ROOT_DIR%\backend\pb_hooks"
set "PB_MIGRATIONS_DIR=%ROOT_DIR%\backend\pb_migrations"
set "MIGRATE_LOG=%TEMP%\cotizador-dev-start-migrate-%RANDOM%%RANDOM%.log"
set "PORT_CHECK_LOG=%TEMP%\cotizador-dev-start-port-%RANDOM%%RANDOM%.log"

if not exist "%ROOT_DIR%\backend\pocketbase.exe" (
  echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  exit /b 2
)

if not exist "%PB_DATA_DIR%" mkdir "%PB_DATA_DIR%" >nul 2>&1

echo [INFO] Configurando variables de entorno e IPs locales para desarrollo...
call "%ROOT_DIR%\production\deploy\backend-service.bat" set-url "http://127.0.0.1:8090" >nul 2>&1
call "%ROOT_DIR%\production\deploy\backend-service.bat" set-frontend-url "/" >nul 2>&1
call "%ROOT_DIR%\production\deploy\backend-service.bat" set-frontend-origin "http://127.0.0.1:8090" >nul 2>&1
call "%ROOT_DIR%\production\deploy\backend-service.bat" set-public-dir "pb_public" >nul 2>&1

call :ensure_dev_port_free
if errorlevel 1 exit /b 1

echo [INFO] Verificando migraciones y estructura de la base local...
"%ROOT_DIR%\backend\pocketbase.exe" migrate up --dir="%PB_DATA_DIR%" --hooksDir="%PB_HOOKS_DIR%" --migrationsDir="%PB_MIGRATIONS_DIR%" > "%MIGRATE_LOG%" 2>&1
set "MIGRATE_RC=%ERRORLEVEL%"
if not "%MIGRATE_RC%"=="0" (
  echo [ERROR] migrate up salio con codigo %MIGRATE_RC%
  goto :migrate_fail
)
del /q "%MIGRATE_LOG%" >nul 2>&1

echo [INFO] Preparando carpeta estatica unificada del frontend (pb_public)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%ROOT_DIR%\production\deploy\prepare-public-dir.ps1' -RootDir '%ROOT_DIR%' -PublicDir 'pb_public'" >nul 2>&1

echo.
echo ============================================================
echo   SISTEMA LOCAL UNIFICADO EN POCKETBASE (DEV)
echo ============================================================
echo [INFO] Frontend:  http://127.0.0.1:8090/client/index.html (o http://127.0.0.1:8090/)
echo [INFO] API Rest:  http://127.0.0.1:8090/api/
echo [INFO] Dashboard: http://127.0.0.1:8090/_/
echo [INFO] Presiona Ctrl+C para detener PocketBase
echo.

"%ROOT_DIR%\backend\pocketbase.exe" serve --http=%DEV_BIND% --publicDir="%ROOT_DIR%\pb_public" --automigrate=false --dir="%PB_DATA_DIR%" --hooksDir="%PB_HOOKS_DIR%" --migrationsDir="%PB_MIGRATIONS_DIR%"
exit /b %ERRORLEVEL%

:ensure_dev_port_free
set "PORT_BLOCKING_PID="
set "PORT_BLOCKING_NAME="
set "PORT_BLOCKING_CMD="
set "PORT_KILLED="
set "DEV_ROOT=%ROOT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = [string]$env:DEV_ROOT;" ^
  "$bind = [string]$env:DEV_BIND;" ^
  "$port = [int]$env:DEV_PORT;" ^
  "$killed = @();" ^
  "$targets = Get-CimInstance Win32_Process -Filter \"name='pocketbase.exe'\" -ErrorAction SilentlyContinue;" ^
  "foreach ($p in $targets) { $cmd = [string]$p.CommandLine; $exe = [string]$p.ExecutablePath; if (($cmd -like ('*' + $root + '*')) -or ($exe -like ('*' + $root + '*'))) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $killed += [string]$p.ProcessId } catch {} } }" ^
  "Start-Sleep -Milliseconds 600;" ^
  "$listenerPid = $null;" ^
  "foreach ($line in (netstat -ano | Select-String (':'+$port+' '))) { $parts = ($line.ToString() -replace '\s+',' ').Trim().Split(' '); if ($parts.Length -ge 5 -and $parts[1] -like ('*:'+$port) -and $parts[3] -eq 'LISTENING') { $listenerPid = [int]$parts[4]; break } }" ^
  "if ($killed.Count -gt 0) { 'KILLED=' + (($killed | Sort-Object -Unique) -join ',') }" ^
  "if ($null -ne $listenerPid) { 'BLOCKING_PID=' + $listenerPid; try { $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listenerPid) -ErrorAction Stop | Select-Object -First 1 Name, CommandLine; if ($proc) { 'BLOCKING_NAME=' + [string]$proc.Name; 'BLOCKING_CMD=' + ((([string]$proc.CommandLine) -replace '[\r\n]+',' ') -replace '=','-') } } catch {} }" > "%PORT_CHECK_LOG%"
if exist "%PORT_CHECK_LOG%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%PORT_CHECK_LOG%") do (
    if /I "%%~A"=="KILLED" set "PORT_KILLED=%%~B"
    if /I "%%~A"=="BLOCKING_PID" set "PORT_BLOCKING_PID=%%~B"
    if /I "%%~A"=="BLOCKING_NAME" set "PORT_BLOCKING_NAME=%%~B"
    if /I "%%~A"=="BLOCKING_CMD" set "PORT_BLOCKING_CMD=%%~B"
  )
  del /q "%PORT_CHECK_LOG%" >nul 2>&1
)
if defined PORT_KILLED (
  echo [INFO] PocketBase previo del repo detenido para liberar el puerto %DEV_PORT%: %PORT_KILLED%
)
if defined PORT_BLOCKING_PID (
  echo [ERROR] El puerto %DEV_PORT% ya esta en uso y no se pudo liberar automaticamente.
  if defined PORT_BLOCKING_NAME echo [INFO] Proceso: %PORT_BLOCKING_NAME% ^(PID %PORT_BLOCKING_PID%^)
  if defined PORT_BLOCKING_CMD echo [INFO] Comando: %PORT_BLOCKING_CMD%
  echo [INFO] Cierra ese proceso o libera el puerto %DEV_PORT% y vuelve a ejecutar development\\dev-start.bat.
  exit /b 1
)
exit /b 0

:migrate_fail
echo [ERROR] No se pudo preparar la base local antes de iniciar PocketBase.
echo [INFO] Log de migracion:
type "%MIGRATE_LOG%"
echo.
echo [INFO] Si esto ocurrio en un clon limpio sin datos reales, elimina backend\pb_data y vuelve a ejecutar development\dev-start.bat.
exit /b 1
