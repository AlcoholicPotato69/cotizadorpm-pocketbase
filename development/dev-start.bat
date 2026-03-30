@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

if not exist "%ROOT_DIR%\backend\pocketbase.exe" (
  echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  exit /b 2
)

call "%ROOT_DIR%\production\backend-service.bat" set-url "http://127.0.0.1:8090"
if errorlevel 1 (
  echo [WARN] No se pudo sincronizar BACKEND_URL al runtime local.
)

echo.
echo [INFO] Backend local en modo desarrollo
echo [INFO] API y dashboard: http://127.0.0.1:8090
echo [INFO] Para el frontend usa: development\\frontend-dev-start.bat
echo [INFO] Presiona Ctrl+C para detener PocketBase
echo.

"%ROOT_DIR%\backend\pocketbase.exe" serve --http=127.0.0.1:8090 --dir="%ROOT_DIR%\backend\pb_data" --hooksDir="%ROOT_DIR%\backend\pb_hooks" --migrationsDir="%ROOT_DIR%\backend\pb_migrations"
exit /b %ERRORLEVEL%
