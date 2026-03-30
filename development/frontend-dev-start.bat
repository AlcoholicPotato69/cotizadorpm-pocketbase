@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python no esta disponible en PATH.
  echo [INFO] Instala Python o usa otra alternativa como IIS/Caddy para servir estaticos.
  exit /b 2
)

echo [INFO] Frontend local en modo estatico
echo [INFO] URL frontend: http://127.0.0.1:8080/client/index.html
echo [INFO] URL backend esperada: http://127.0.0.1:8090
echo [INFO] Usa Ctrl+C para detener el servidor estatico
echo.

pushd "%FRONTEND_DIR%"
python -m http.server 8080 --bind 127.0.0.1
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
