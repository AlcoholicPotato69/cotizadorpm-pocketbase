@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "PAUSE_AT_END=1"
set "FORCE_BACKEND_ALL=0"
for %%A in (%*) do (
  if /I "%%~A"=="--no-pause" set "PAUSE_AT_END=0"
  if /I "%%~A"=="--force-backend" set "FORCE_BACKEND_ALL=1"
)

echo.
echo [STOP LOCAL STACK]

echo [INFO] Intentando detener procesos remanentes...
taskkill /FI "WINDOWTITLE eq Cotizador Frontend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Cotizador Backend*" /T /F >nul 2>&1
if "%FORCE_BACKEND_ALL%"=="1" (
  echo [WARN] --force-backend activo: deteniendo todos los procesos pocketbase.exe.
  taskkill /IM pocketbase.exe /T /F >nul 2>&1
)

echo [OK] Stack local detenido.
echo.
if "%PAUSE_AT_END%"=="1" pause
exit /b 0
