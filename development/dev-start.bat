@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "PB_DATA_DIR=%ROOT_DIR%\backend\pb_data"
set "PB_HOOKS_DIR=%ROOT_DIR%\backend\pb_hooks"
set "PB_MIGRATIONS_DIR=%ROOT_DIR%\backend\pb_migrations"
set "MIGRATE_LOG=%TEMP%\cotizador-dev-start-migrate-%RANDOM%%RANDOM%.log"

if not exist "%ROOT_DIR%\backend\pocketbase.exe" (
  echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  exit /b 2
)

if not exist "%PB_DATA_DIR%" mkdir "%PB_DATA_DIR%" >nul 2>&1

call "%ROOT_DIR%\production\backend-service.bat" set-url "http://127.0.0.1:8090"
if errorlevel 1 (
  echo [WARN] No se pudo sincronizar BACKEND_URL al runtime local.
)

echo [INFO] Verificando migraciones y estructura de la base local...
"%ROOT_DIR%\backend\pocketbase.exe" migrate up --dir="%PB_DATA_DIR%" --hooksDir="%PB_HOOKS_DIR%" --migrationsDir="%PB_MIGRATIONS_DIR%" > "%MIGRATE_LOG%" 2>&1
set "MIGRATE_RC=%ERRORLEVEL%"
findstr /I /C:"failed to apply migration" /C:"Error:" "%MIGRATE_LOG%" >nul
set "MIGRATE_HAS_ERROR=%ERRORLEVEL%"
if not "%MIGRATE_RC%"=="0" goto :migrate_fail
if "%MIGRATE_HAS_ERROR%"=="0" goto :migrate_fail
del /q "%MIGRATE_LOG%" >nul 2>&1

echo.
echo [INFO] Backend local en modo desarrollo
echo [INFO] API y dashboard: http://127.0.0.1:8090
echo [INFO] Para el frontend usa: development\\frontend-dev-start.bat
echo [INFO] Presiona Ctrl+C para detener PocketBase
echo.

"%ROOT_DIR%\backend\pocketbase.exe" serve --http=127.0.0.1:8090 --automigrate=false --dir="%PB_DATA_DIR%" --hooksDir="%PB_HOOKS_DIR%" --migrationsDir="%PB_MIGRATIONS_DIR%"
exit /b %ERRORLEVEL%

:migrate_fail
echo [ERROR] No se pudo preparar la base local antes de iniciar PocketBase.
echo [INFO] Log de migracion:
type "%MIGRATE_LOG%"
echo.
echo [INFO] Si esto ocurrio en un clon limpio sin datos reales, elimina backend\pb_data y vuelve a ejecutar development\dev-start.bat.
exit /b 1
