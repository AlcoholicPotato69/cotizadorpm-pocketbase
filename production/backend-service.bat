@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "DEPLOY_DIR=%SCRIPT_DIR%\deploy"
set "CONF_FILE=%DEPLOY_DIR%\backend-service.local.conf"
set "RUNNER_FILE=%DEPLOY_DIR%\run-pocketbase-service.bat"
set "SERVICE_HOST_EXE=%DEPLOY_DIR%\CotizadorServiceHost.exe"
set "SERVICE_HOST_SRC=%DEPLOY_DIR%\CotizadorServiceHost.cs"
set "SERVICE_HOST_BUILD=%DEPLOY_DIR%\build-service-host.bat"
set "HTTPS_SETUP_FILE=%DEPLOY_DIR%\configure-https-selfsigned.ps1"
set "SYNC_FRONTEND_FILE=%DEPLOY_DIR%\sync-frontend-runtime.ps1"
set "PREPARE_NGINX_SITE_FILE=%DEPLOY_DIR%\prepare-nginx-site.ps1"
set "WRITE_NGINX_CONF_FILE=%DEPLOY_DIR%\write-nginx-conf.ps1"

if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%" >nul 2>&1
if not exist "%CONF_FILE%" call :write_default_conf
call :load_conf

if "%~1"=="" goto :help

set "ACTION=%~1"
if /I "%ACTION%"=="help" goto :help
if /I "%ACTION%"=="show" goto :show
if /I "%ACTION%"=="set-url" goto :set_url
if /I "%ACTION%"=="set-frontend-url" goto :set_frontend_url
if /I "%ACTION%"=="set-frontend-origin" goto :set_frontend_origin
if /I "%ACTION%"=="set-public-dir" goto :set_public_dir
if /I "%ACTION%"=="set-ip" goto :set_ip
if /I "%ACTION%"=="set-bind" goto :set_bind
if /I "%ACTION%"=="sync-frontend" goto :sync_frontend
if /I "%ACTION%"=="prepare-nginx" goto :prepare_nginx
if /I "%ACTION%"=="cleanup-orphans" goto :cleanup_orphans_action
if /I "%ACTION%"=="enable-https" goto :enable_https
if /I "%ACTION%"=="disable-https" goto :disable_https
if /I "%ACTION%"=="install" goto :install
if /I "%ACTION%"=="start" goto :start
if /I "%ACTION%"=="stop" goto :stop
if /I "%ACTION%"=="restart" goto :restart
if /I "%ACTION%"=="status" goto :status
if /I "%ACTION%"=="uninstall" goto :uninstall

echo [ERROR] Accion desconocida: %ACTION%
echo Usa: %~n0 help
exit /b 1

:help
echo.
echo backend-service.bat - Gestiona PocketBase como servicio nativo de Windows
echo.
echo Uso:
echo   backend-service.bat install
echo   backend-service.bat start
echo   backend-service.bat stop
echo   backend-service.bat restart
echo   backend-service.bat status
echo   backend-service.bat uninstall
echo   backend-service.bat show
echo   backend-service.bat set-url ^<URL_BACKEND_REAL^>
echo   backend-service.bat set-frontend-url ^<URL_O_PATH_FRONTEND^>
echo   backend-service.bat set-frontend-origin ^<ORIGEN_FRONTEND^>
echo   backend-service.bat set-public-dir ^<RUTA^|off^>
echo   backend-service.bat set-ip ^<IP_O_HOST^> [PUERTO]
echo   backend-service.bat set-bind ^<BIND_IP:PUERTO^>
echo   backend-service.bat sync-frontend
echo   backend-service.bat prepare-nginx [RUTA_SITE] [SERVER_NAME]
echo   backend-service.bat cleanup-orphans
echo   backend-service.bat enable-https ^<IP_O_HOST^> [PUERTO_HTTPS]
echo   backend-service.bat disable-https
echo.
echo Ejemplos:
echo   backend-service.bat set-ip 127.0.0.1 8090
echo   backend-service.bat set-frontend-url /
echo   backend-service.bat set-frontend-origin http://127.0.0.1
echo   backend-service.bat set-public-dir off
echo   backend-service.bat prepare-nginx production\deploy\nginx-site _
echo   backend-service.bat cleanup-orphans
echo   backend-service.bat enable-https localhost 9443
echo   backend-service.bat set-url http://127.0.0.1:8090
echo   backend-service.bat install
echo.
echo Notas:
echo   - set-url cambia la URL real del backend.
echo   - set-frontend-url define la base que usara el frontend ^(ej: / para mismo origen Nginx^).
echo   - set-frontend-origin autoriza por CORS el origen donde se sirven los HTML.
echo   - set-public-dir off deja PocketBase sin HTML publico; recomendado para frontend separado.
echo   - sync-frontend actualiza frontend\client\config\hub-runtime.json y frontend\client\public\assets\libs\js\env.js.
echo   - prepare-nginx deja una carpeta estatica lista para Nginx y genera un .conf base.
echo   - PUBLIC_DIR solo debe usarse si TI decide que PocketBase sirva estaticos; por defecto queda apagado.
echo   - enable-https genera certificado autofirmado, lo vincula en Windows y activa proxy HTTPS local.
echo   - install configura el servicio con production\deploy\CotizadorServiceHost.exe.
echo.
exit /b 0

:show
echo.
echo [CONFIG]
echo   SERVICE_NAME=%SERVICE_NAME%
echo   DISPLAY_NAME=%DISPLAY_NAME%
echo   BIND_ADDR=%BIND_ADDR%
echo   BACKEND_URL=%BACKEND_URL%
echo   FRONTEND_BACKEND_URL=%FRONTEND_BACKEND_URL%
echo   FRONTEND_LOCAL_MODE=%FRONTEND_LOCAL_MODE%
echo   CORS_ALLOWED_ORIGINS=%CORS_ALLOWED_ORIGINS%
echo   PUBLIC_DIR=%PUBLIC_DIR%
echo   NGINX_SITE_DIR=%NGINX_SITE_DIR%
echo   NGINX_SERVER_NAME=%NGINX_SERVER_NAME%
echo   NGINX_CONF_FILE=%NGINX_CONF_FILE%
echo   HTTPS_ENABLED=%HTTPS_ENABLED%
echo   HTTPS_HOST=%HTTPS_HOST%
echo   HTTPS_PORT=%HTTPS_PORT%
echo   HTTPS_CERT_THUMBPRINT=%HTTPS_CERT_THUMBPRINT%
echo   HTTPS_CERT_FILE=%HTTPS_CERT_FILE%
echo   CONF_FILE=%CONF_FILE%
echo.
exit /b 0

:set_url
set "PREV_BACKEND_URL=%BACKEND_URL%"
set "NEXT_URL=%~2"
if not defined NEXT_URL set /p NEXT_URL=Escribe la URL del backend ^(ej: http://192.168.1.50:8090^): 
if not defined NEXT_URL (
  echo [ERROR] URL vacia.
  exit /b 1
)
echo %NEXT_URL% | findstr /r /i "^[a-z][a-z0-9+.-]*://" >nul
if errorlevel 1 set "NEXT_URL=http://%NEXT_URL%"
if "%NEXT_URL:~-1%"=="/" set "NEXT_URL=%NEXT_URL:~0,-1%"
set "BACKEND_URL=%NEXT_URL%"
call :sync_frontend_url_if_tracking_backend "%PREV_BACKEND_URL%" "%BACKEND_URL%"
call :write_conf
call :sync_frontend_runtime || exit /b 1
echo [OK] BACKEND_URL actualizado a %BACKEND_URL%
if /I "%HTTPS_ENABLED%"=="1" (
  echo [INFO] HTTPS local sigue activo en puerto %HTTPS_PORT%. Si cambiaste host/IP, ejecuta:
  echo        backend-service.bat enable-https ^<IP_O_HOST^> %HTTPS_PORT%
)
exit /b 0

:set_frontend_url
set "NEXT_FRONTEND_URL=%~2"
if not defined NEXT_FRONTEND_URL set /p NEXT_FRONTEND_URL=Escribe la base del frontend hacia el backend ^(ej: / o /pb o http://api.midominio.com^): 
if not defined NEXT_FRONTEND_URL (
  echo [ERROR] URL/base del frontend vacia.
  exit /b 1
)
if not "%NEXT_FRONTEND_URL%"=="/" if "%NEXT_FRONTEND_URL:~-1%"=="/" set "NEXT_FRONTEND_URL=%NEXT_FRONTEND_URL:~0,-1%"
echo %NEXT_FRONTEND_URL% | findstr /r "^[./]" >nul
if errorlevel 1 (
  echo %NEXT_FRONTEND_URL% | findstr /r /i "^[a-z][a-z0-9+.-]*://" >nul
  if errorlevel 1 set "NEXT_FRONTEND_URL=http://%NEXT_FRONTEND_URL%"
)
set "FRONTEND_BACKEND_URL=%NEXT_FRONTEND_URL%"
call :write_conf
call :sync_frontend_runtime || exit /b 1
echo [OK] FRONTEND_BACKEND_URL actualizado a %FRONTEND_BACKEND_URL%
exit /b 0

:set_frontend_origin
set "NEXT_FRONTEND_ORIGIN=%~2"
if not defined NEXT_FRONTEND_ORIGIN set /p NEXT_FRONTEND_ORIGIN=Escribe el origen del frontend ^(ej: http://192.168.1.50 o http://192.168.1.50:8080^): 
if not defined NEXT_FRONTEND_ORIGIN (
  echo [ERROR] Origen del frontend vacio.
  exit /b 1
)
echo %NEXT_FRONTEND_ORIGIN% | findstr "," >nul
if errorlevel 1 (
  echo %NEXT_FRONTEND_ORIGIN% | findstr /r /i "^[a-z][a-z0-9+.-]*://" >nul
  if errorlevel 1 set "NEXT_FRONTEND_ORIGIN=http://%NEXT_FRONTEND_ORIGIN%"
  if "%NEXT_FRONTEND_ORIGIN:~-1%"=="/" set "NEXT_FRONTEND_ORIGIN=%NEXT_FRONTEND_ORIGIN:~0,-1%"
)
set "CORS_ALLOWED_ORIGINS=%NEXT_FRONTEND_ORIGIN%"
call :write_conf
echo [OK] CORS_ALLOWED_ORIGINS actualizado a %CORS_ALLOWED_ORIGINS%
echo [INFO] Reinicia el servicio si PocketBase ya estaba en ejecucion.
exit /b 0

:set_public_dir
set "NEXT_PUBLIC_DIR=%~2"
if not defined NEXT_PUBLIC_DIR set /p NEXT_PUBLIC_DIR=Escribe PUBLIC_DIR o off para desactivar HTML en PocketBase: 
if /I "%NEXT_PUBLIC_DIR%"=="off" set "NEXT_PUBLIC_DIR="
if /I "%NEXT_PUBLIC_DIR%"=="none" set "NEXT_PUBLIC_DIR="
if /I "%NEXT_PUBLIC_DIR%"=="disabled" set "NEXT_PUBLIC_DIR="
if /I "%NEXT_PUBLIC_DIR%"=="false" set "NEXT_PUBLIC_DIR="
set "PUBLIC_DIR=%NEXT_PUBLIC_DIR%"
call :write_conf
if defined PUBLIC_DIR (
  echo [OK] PUBLIC_DIR actualizado a %PUBLIC_DIR%
) else (
  echo [OK] PUBLIC_DIR desactivado. Los HTML deben servirse por Nginx u otro servidor estatico.
)
echo [INFO] Reinicia el servicio para aplicar el cambio.
exit /b 0

:set_ip
set "PREV_BACKEND_URL=%BACKEND_URL%"
set "NEXT_HOST=%~2"
set "NEXT_PORT=%~3"
if not defined NEXT_HOST set /p NEXT_HOST=Escribe IP o hostname del backend ^(ej: 192.168.1.50^): 
if not defined NEXT_HOST (
  echo [ERROR] IP/host vacio.
  exit /b 1
)
if not defined NEXT_PORT set "NEXT_PORT=8090"

if /I "%HTTPS_ENABLED%"=="1" (
  echo [INFO] HTTPS esta activo. Se regenerara certificado para %NEXT_HOST%:%HTTPS_PORT%.
  call :enable_https_core "%NEXT_HOST%" "%HTTPS_PORT%"
  exit /b %ERRORLEVEL%
)

set "BACKEND_URL=http://%NEXT_HOST%:%NEXT_PORT%"
call :sync_frontend_url_if_tracking_backend "%PREV_BACKEND_URL%" "%BACKEND_URL%"
call :write_conf
call :sync_frontend_runtime || exit /b 1
echo [OK] BACKEND_URL actualizado a %BACKEND_URL%
exit /b 0

:set_bind
set "NEXT_BIND=%~2"
if not defined NEXT_BIND set /p NEXT_BIND=Escribe bind de PocketBase ^(ej: 127.0.0.1:8090^): 
if not defined NEXT_BIND (
  echo [ERROR] bind vacio.
  exit /b 1
)
set "BIND_ADDR=%NEXT_BIND%"
call :write_conf
echo [OK] BIND_ADDR actualizado a %BIND_ADDR%
if /I "%HTTPS_ENABLED%"=="1" (
  echo [WARN] HTTPS activo: si expones 0.0.0.0 en BIND_ADDR tambien expones HTTP sin TLS.
)
echo [INFO] Reinicia el servicio para aplicar el nuevo bind.
exit /b 0

:sync_frontend
call :sync_frontend_runtime
exit /b %ERRORLEVEL%

:prepare_nginx
set "NEXT_SITE_DIR=%~2"
set "NEXT_SERVER_NAME=%~3"
if not defined NEXT_SITE_DIR set "NEXT_SITE_DIR=%NGINX_SITE_DIR%"
if not defined NEXT_SITE_DIR set "NEXT_SITE_DIR=production\deploy\nginx-site"
if not defined NEXT_SERVER_NAME set "NEXT_SERVER_NAME=%NGINX_SERVER_NAME%"
if not defined NEXT_SERVER_NAME set "NEXT_SERVER_NAME=_"

set "NGINX_SITE_DIR=%NEXT_SITE_DIR%"
set "NGINX_SERVER_NAME=%NEXT_SERVER_NAME%"
set "FRONTEND_BACKEND_URL=/"
set "FRONTEND_LOCAL_MODE=0"
set "PUBLIC_DIR="

call :write_conf
call :sync_frontend_runtime || exit /b 1
call :prepare_nginx_site_core || exit /b 1
call :write_nginx_conf_core || exit /b 1

echo [OK] Frontend de produccion listo para Nginx.
echo [INFO] Site estatico: %NGINX_SITE_DIR%
echo [INFO] Configuracion Nginx: %NGINX_CONF_FILE%
echo [INFO] El frontend quedo configurado para usar mismo origen ^(/api y /_/ via Nginx^).
exit /b 0

:enable_https
set "NEXT_HOST=%~2"
set "NEXT_HTTPS_PORT=%~3"
if not defined NEXT_HOST set /p NEXT_HOST=Escribe IP o hostname para HTTPS ^(ej: 192.168.1.50^): 
if not defined NEXT_HOST (
  echo [ERROR] IP/host vacio.
  exit /b 1
)
if not defined NEXT_HTTPS_PORT set "NEXT_HTTPS_PORT=%HTTPS_PORT%"
if not defined NEXT_HTTPS_PORT set "NEXT_HTTPS_PORT=9443"
call :enable_https_core "%NEXT_HOST%" "%NEXT_HTTPS_PORT%"
exit /b %ERRORLEVEL%

:enable_https_core
set "NEXT_HOST=%~1"
set "NEXT_HTTPS_PORT=%~2"
set "PREV_BACKEND_URL=%BACKEND_URL%"
if not defined NEXT_HTTPS_PORT set "NEXT_HTTPS_PORT=9443"
call :require_admin || exit /b 1

if not exist "%HTTPS_SETUP_FILE%" (
  echo [ERROR] No existe script HTTPS: %HTTPS_SETUP_FILE%
  exit /b 2
)

set "HTTPS_OUT_FILE=%TEMP%\cotizador_https_setup_%RANDOM%%RANDOM%.tmp"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HTTPS_SETUP_FILE%" -HostName "%NEXT_HOST%" -Port %NEXT_HTTPS_PORT% -ExportDir "%DEPLOY_DIR%\certs" > "%HTTPS_OUT_FILE%"
if errorlevel 1 (
  echo [ERROR] No se pudo configurar HTTPS autofirmado.
  if exist "%HTTPS_OUT_FILE%" type "%HTTPS_OUT_FILE%"
  if exist "%HTTPS_OUT_FILE%" del /q "%HTTPS_OUT_FILE%" >nul 2>&1
  exit /b 4
)

set "HTTPS_CERT_THUMBPRINT="
set "HTTPS_CERT_FILE="
for /f "usebackq tokens=1,* delims==" %%A in ("%HTTPS_OUT_FILE%") do (
  if /I "%%~A"=="HTTPS_CERT_THUMBPRINT" set "HTTPS_CERT_THUMBPRINT=%%~B"
  if /I "%%~A"=="HTTPS_CERT_FILE" set "HTTPS_CERT_FILE=%%~B"
)
if exist "%HTTPS_OUT_FILE%" del /q "%HTTPS_OUT_FILE%" >nul 2>&1

set "HTTPS_ENABLED=1"
set "HTTPS_HOST=%NEXT_HOST%"
set "HTTPS_PORT=%NEXT_HTTPS_PORT%"
if /I "%BIND_ADDR%"=="0.0.0.0:8090" set "BIND_ADDR=127.0.0.1:8090"
set "BACKEND_URL=https://%HTTPS_HOST%:%HTTPS_PORT%"
call :sync_frontend_url_if_tracking_backend "%PREV_BACKEND_URL%" "%BACKEND_URL%"

call :write_conf
call :sync_frontend_runtime || exit /b 1
echo [OK] HTTPS habilitado correctamente para %HTTPS_HOST%:%HTTPS_PORT%
if defined HTTPS_CERT_FILE (
  echo [INFO] Certificado publico exportado en:
  echo        %HTTPS_CERT_FILE%
  echo [INFO] Instala este .cer en equipos cliente ^(Trusted Root^) para evitar advertencias.
)
echo [INFO] Reinicia el servicio para aplicar cambios: %~n0 restart
exit /b 0

:disable_https
call :require_admin || exit /b 1
if not defined HTTPS_PORT set "HTTPS_PORT=9443"
set "PREV_BACKEND_URL=%BACKEND_URL%"

set "PB_HTTPS_PORT=%HTTPS_PORT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port = $env:PB_HTTPS_PORT;" ^
  "& netsh http delete sslcert ipport=('0.0.0.0:' + $port) | Out-Null;" ^
  "& netsh http delete urlacl url=('https://+:' + $port + '/') | Out-Null;"

set "HTTPS_ENABLED=0"
set "HTTPS_HOST="
set "HTTPS_PORT=9443"
set "HTTPS_CERT_THUMBPRINT="
set "HTTPS_CERT_FILE="
if /I "%BIND_ADDR%"=="0.0.0.0:8090" set "BIND_ADDR=127.0.0.1:8090"
set "BACKEND_URL=http://127.0.0.1:8090"
call :sync_frontend_url_if_tracking_backend "%PREV_BACKEND_URL%" "%BACKEND_URL%"

call :write_conf
call :sync_frontend_runtime || exit /b 1
echo [OK] HTTPS deshabilitado. El backend queda en HTTP local.
echo [INFO] Reinicia el servicio para aplicar cambios: %~n0 restart
exit /b 0

:install
call :require_admin || exit /b 1
if not exist "%ROOT_DIR%\backend\pocketbase.exe" (
  echo [ERROR] No existe backend\pocketbase.exe en %ROOT_DIR%
  exit /b 2
)
if not exist "%RUNNER_FILE%" (
  echo [ERROR] No existe runner: %RUNNER_FILE%
  exit /b 2
)
call :ensure_service_host || exit /b 2
call :write_conf
call :sync_frontend_runtime || exit /b 1

set "BIN_PATH=\"%SERVICE_HOST_EXE%\" --service-name \"%SERVICE_NAME%\" --root \"%ROOT_DIR%\""
sc.exe create "%SERVICE_NAME%" binPath= "%BIN_PATH%" start= auto displayname= "%DISPLAY_NAME%" >nul 2>&1
if errorlevel 1 (
  sc.exe config "%SERVICE_NAME%" binPath= "%BIN_PATH%" start= auto displayname= "%DISPLAY_NAME%" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] No se pudo crear/configurar el servicio %SERVICE_NAME%.
    exit /b 3
  )
)
sc.exe description "%SERVICE_NAME%" "PocketBase del cotizador (instalado por backend-service.bat)" >nul 2>&1
echo [OK] Servicio instalado/configurado: %SERVICE_NAME%
sc.exe qc "%SERVICE_NAME%" | findstr /I "BINARY_PATH_NAME" >nul 2>&1
if not errorlevel 1 (
  echo [INFO] BinPath actualizado con ServiceHost nativo.
)
echo [INFO] Ejecuta: %~n0 start
exit /b 0

:start
call :require_admin || exit /b 1
call :cleanup_orphans
sc.exe start "%SERVICE_NAME%"
exit /b %ERRORLEVEL%

:stop
call :require_admin || exit /b 1
sc.exe stop "%SERVICE_NAME%"
exit /b %ERRORLEVEL%

:restart
call :require_admin || exit /b 1
sc.exe stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 2 /nobreak >nul
call :cleanup_orphans
sc.exe start "%SERVICE_NAME%"
exit /b %ERRORLEVEL%

:status
sc.exe query "%SERVICE_NAME%"
exit /b %ERRORLEVEL%

:uninstall
call :require_admin || exit /b 1
sc.exe stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 2 /nobreak >nul
sc.exe delete "%SERVICE_NAME%"
exit /b %ERRORLEVEL%

:cleanup_orphans_action
call :require_admin || exit /b 1
call :cleanup_orphans
exit /b 0

:write_default_conf
> "%CONF_FILE%" echo SERVICE_NAME=CotizadorPocketBase
>> "%CONF_FILE%" echo DISPLAY_NAME=Cotizador PocketBase
>> "%CONF_FILE%" echo BIND_ADDR=127.0.0.1:8090
>> "%CONF_FILE%" echo BACKEND_URL=http://127.0.0.1:8090
>> "%CONF_FILE%" echo FRONTEND_BACKEND_URL=http://127.0.0.1:8090
>> "%CONF_FILE%" echo FRONTEND_LOCAL_MODE=0
>> "%CONF_FILE%" echo CORS_ALLOWED_ORIGINS=
>> "%CONF_FILE%" echo PUBLIC_DIR=
>> "%CONF_FILE%" echo NGINX_SITE_DIR=production\deploy\nginx-site
>> "%CONF_FILE%" echo NGINX_SERVER_NAME=_
>> "%CONF_FILE%" echo NGINX_CONF_FILE=production\deploy\nginx\cotizador-production.conf
>> "%CONF_FILE%" echo HTTPS_ENABLED=0
>> "%CONF_FILE%" echo HTTPS_HOST=
>> "%CONF_FILE%" echo HTTPS_PORT=9443
>> "%CONF_FILE%" echo HTTPS_CERT_THUMBPRINT=
>> "%CONF_FILE%" echo HTTPS_CERT_FILE=
exit /b 0

:write_conf
> "%CONF_FILE%" echo SERVICE_NAME=%SERVICE_NAME%
>> "%CONF_FILE%" echo DISPLAY_NAME=%DISPLAY_NAME%
>> "%CONF_FILE%" echo BIND_ADDR=%BIND_ADDR%
>> "%CONF_FILE%" echo BACKEND_URL=%BACKEND_URL%
>> "%CONF_FILE%" echo FRONTEND_BACKEND_URL=%FRONTEND_BACKEND_URL%
>> "%CONF_FILE%" echo FRONTEND_LOCAL_MODE=%FRONTEND_LOCAL_MODE%
>> "%CONF_FILE%" echo CORS_ALLOWED_ORIGINS=%CORS_ALLOWED_ORIGINS%
>> "%CONF_FILE%" echo PUBLIC_DIR=%PUBLIC_DIR%
>> "%CONF_FILE%" echo NGINX_SITE_DIR=%NGINX_SITE_DIR%
>> "%CONF_FILE%" echo NGINX_SERVER_NAME=%NGINX_SERVER_NAME%
>> "%CONF_FILE%" echo NGINX_CONF_FILE=%NGINX_CONF_FILE%
>> "%CONF_FILE%" echo HTTPS_ENABLED=%HTTPS_ENABLED%
>> "%CONF_FILE%" echo HTTPS_HOST=%HTTPS_HOST%
>> "%CONF_FILE%" echo HTTPS_PORT=%HTTPS_PORT%
>> "%CONF_FILE%" echo HTTPS_CERT_THUMBPRINT=%HTTPS_CERT_THUMBPRINT%
>> "%CONF_FILE%" echo HTTPS_CERT_FILE=%HTTPS_CERT_FILE%
exit /b 0

:load_conf
set "SERVICE_NAME="
set "DISPLAY_NAME="
set "BIND_ADDR="
set "BACKEND_URL="
set "FRONTEND_BACKEND_URL="
set "FRONTEND_LOCAL_MODE="
set "CORS_ALLOWED_ORIGINS="
set "PUBLIC_DIR="
set "NGINX_SITE_DIR="
set "NGINX_SERVER_NAME="
set "NGINX_CONF_FILE="
set "HTTPS_ENABLED="
set "HTTPS_HOST="
set "HTTPS_PORT="
set "HTTPS_CERT_THUMBPRINT="
set "HTTPS_CERT_FILE="
for /f "usebackq tokens=1,* delims==" %%A in ("%CONF_FILE%") do (
  if /I "%%~A"=="SERVICE_NAME" set "SERVICE_NAME=%%~B"
  if /I "%%~A"=="DISPLAY_NAME" set "DISPLAY_NAME=%%~B"
  if /I "%%~A"=="BIND_ADDR" set "BIND_ADDR=%%~B"
  if /I "%%~A"=="BACKEND_URL" set "BACKEND_URL=%%~B"
  if /I "%%~A"=="FRONTEND_BACKEND_URL" set "FRONTEND_BACKEND_URL=%%~B"
  if /I "%%~A"=="FRONTEND_LOCAL_MODE" set "FRONTEND_LOCAL_MODE=%%~B"
  if /I "%%~A"=="CORS_ALLOWED_ORIGINS" set "CORS_ALLOWED_ORIGINS=%%~B"
  if /I "%%~A"=="PUBLIC_DIR" set "PUBLIC_DIR=%%~B"
  if /I "%%~A"=="NGINX_SITE_DIR" set "NGINX_SITE_DIR=%%~B"
  if /I "%%~A"=="NGINX_SERVER_NAME" set "NGINX_SERVER_NAME=%%~B"
  if /I "%%~A"=="NGINX_CONF_FILE" set "NGINX_CONF_FILE=%%~B"
  if /I "%%~A"=="HTTPS_ENABLED" set "HTTPS_ENABLED=%%~B"
  if /I "%%~A"=="HTTPS_HOST" set "HTTPS_HOST=%%~B"
  if /I "%%~A"=="HTTPS_PORT" set "HTTPS_PORT=%%~B"
  if /I "%%~A"=="HTTPS_CERT_THUMBPRINT" set "HTTPS_CERT_THUMBPRINT=%%~B"
  if /I "%%~A"=="HTTPS_CERT_FILE" set "HTTPS_CERT_FILE=%%~B"
)
if not defined SERVICE_NAME set "SERVICE_NAME=CotizadorPocketBase"
if not defined DISPLAY_NAME set "DISPLAY_NAME=Cotizador PocketBase"
if not defined BIND_ADDR set "BIND_ADDR=127.0.0.1:8090"
if not defined BACKEND_URL set "BACKEND_URL=http://127.0.0.1:8090"
if not defined FRONTEND_BACKEND_URL set "FRONTEND_BACKEND_URL=%BACKEND_URL%"
if not defined FRONTEND_LOCAL_MODE set "FRONTEND_LOCAL_MODE=0"
if not defined NGINX_SITE_DIR set "NGINX_SITE_DIR=production\deploy\nginx-site"
if not defined NGINX_SERVER_NAME set "NGINX_SERVER_NAME=_"
if not defined NGINX_CONF_FILE set "NGINX_CONF_FILE=production\deploy\nginx\cotizador-production.conf"
if not defined HTTPS_ENABLED set "HTTPS_ENABLED=0"
if not defined HTTPS_PORT set "HTTPS_PORT=9443"
exit /b 0

:sync_frontend_runtime
if not exist "%SYNC_FRONTEND_FILE%" (
  echo [ERROR] No existe script de sincronizacion frontend: %SYNC_FRONTEND_FILE%
  exit /b 5
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SYNC_FRONTEND_FILE%" -RootDir "%ROOT_DIR%" -BackendUrl "%BACKEND_URL%" -FrontendBackendUrl "%FRONTEND_BACKEND_URL%" -LocalMode "%FRONTEND_LOCAL_MODE%"
if errorlevel 1 (
  echo [ERROR] No se pudo sincronizar la configuracion runtime del frontend.
  exit /b 5
)
echo [OK] Runtime del frontend sincronizado.
exit /b 0

:sync_frontend_url_if_tracking_backend
set "PREVIOUS_BACKEND_URL=%~1"
set "NEXT_BACKEND_URL=%~2"
if not defined FRONTEND_BACKEND_URL (
  set "FRONTEND_BACKEND_URL=%NEXT_BACKEND_URL%"
  exit /b 0
)
if /I "%FRONTEND_BACKEND_URL%"=="%PREVIOUS_BACKEND_URL%" set "FRONTEND_BACKEND_URL=%NEXT_BACKEND_URL%"
exit /b 0

:prepare_nginx_site_core
if not exist "%PREPARE_NGINX_SITE_FILE%" (
  echo [ERROR] No existe script de site Nginx: %PREPARE_NGINX_SITE_FILE%
  exit /b 7
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PREPARE_NGINX_SITE_FILE%" -RootDir "%ROOT_DIR%" -SiteDir "%NGINX_SITE_DIR%"
if errorlevel 1 (
  echo [ERROR] No se pudo preparar la carpeta estatica para Nginx.
  exit /b 7
)
exit /b 0

:write_nginx_conf_core
if not exist "%WRITE_NGINX_CONF_FILE%" (
  echo [ERROR] No existe script de configuracion Nginx: %WRITE_NGINX_CONF_FILE%
  exit /b 8
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%WRITE_NGINX_CONF_FILE%" -RootDir "%ROOT_DIR%" -SiteDir "%NGINX_SITE_DIR%" -BackendUrl "%BACKEND_URL%" -ServerName "%NGINX_SERVER_NAME%" -OutputPath "%NGINX_CONF_FILE%"
if errorlevel 1 (
  echo [ERROR] No se pudo generar el archivo de configuracion Nginx.
  exit /b 8
)
exit /b 0

:ensure_service_host
set "REBUILD_SERVICE_HOST=0"
if not exist "%SERVICE_HOST_EXE%" set "REBUILD_SERVICE_HOST=1"
if "%REBUILD_SERVICE_HOST%"=="0" if exist "%SERVICE_HOST_SRC%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$src='%SERVICE_HOST_SRC%'; $exe='%SERVICE_HOST_EXE%'; if ((Test-Path $src) -and (Test-Path $exe) -and ((Get-Item $src).LastWriteTimeUtc -gt (Get-Item $exe).LastWriteTimeUtc)) { exit 0 } else { exit 1 }"
  if not errorlevel 1 set "REBUILD_SERVICE_HOST=1"
)
if "%REBUILD_SERVICE_HOST%"=="0" exit /b 0
if not exist "%SERVICE_HOST_BUILD%" (
  echo [ERROR] No existe compilador del ServiceHost: %SERVICE_HOST_BUILD%
  exit /b 6
)
echo [INFO] Compilando ServiceHost nativo...
call "%SERVICE_HOST_BUILD%"
if errorlevel 1 (
  echo [ERROR] No se pudo compilar el ServiceHost.
  exit /b 6
)
if not exist "%SERVICE_HOST_EXE%" (
  echo [ERROR] Compilacion incompleta: no existe %SERVICE_HOST_EXE%
  exit /b 6
)
echo [OK] ServiceHost listo: %SERVICE_HOST_EXE%
exit /b 0

:require_admin
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent());" ^
  "if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo [ERROR] Ejecuta este comando en una consola con privilegios de Administrador.
  echo [INFO] Tip: clic derecho sobre CMD/PowerShell -^> Ejecutar como administrador.
  exit /b 10
)
exit /b 0

:cleanup_orphans
set "PB_ROOT=%ROOT_DIR%"
set "PB_BIND=%BIND_ADDR%"
set "CLEANUP_OUT=%TEMP%\pb_cleanup_%RANDOM%%RANDOM%.tmp"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = [string]$env:PB_ROOT; $killed = @();" ^
  "$bind = [string]$env:PB_BIND; $bindPort = 8090; if ($bind -match ':(\d+)$') { $bindPort = [int]$matches[1] };" ^
  "$targets = Get-CimInstance Win32_Process -Filter \"name='pocketbase.exe'\" -ErrorAction SilentlyContinue;" ^
  "foreach ($p in $targets) { $cmd = [string]$p.CommandLine; $exe = [string]$p.ExecutablePath; if (($cmd -like ('*' + $root + '*')) -or ($exe -like ('*' + $root + '*'))) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $killed += ('pocketbase:' + $p.ProcessId) } catch {} } }" ^
  "try { $listeners = Get-CimInstance Win32_Process -Filter \"name='pocketbase.exe'\" -ErrorAction SilentlyContinue; $allPids = @{}; foreach($l in (netstat -ano | Select-String (':'+$bindPort+' '))){ $parts = ($l.ToString() -replace '\s+',' ').Trim().Split(' '); if($parts.Length -ge 5 -and $parts[1] -like '*:'+$bindPort -and $parts[3] -eq 'LISTENING'){ $pid=[int]$parts[4]; if($pid -gt 0){ $allPids[$pid]=1 } } }; foreach($pid in $allPids.Keys){ try { Stop-Process -Id $pid -Force -ErrorAction Stop; $killed += ('port'+$bindPort+':' + $pid) } catch {} } } catch {}" ^
  "$psTargets = Get-CimInstance Win32_Process -Filter \"name='powershell.exe' or name='pwsh.exe'\" -ErrorAction SilentlyContinue;" ^
  "foreach ($p in $psTargets) { $cmd = [string]$p.CommandLine; if ($cmd -like '*https-reverse-proxy.ps1*' -and $cmd -like ('*' + $root + '*')) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $killed += ('proxy:' + $p.ProcessId) } catch {} } }" ^
  "if ($killed.Count -gt 0) { 'KILLED=' + (($killed | Sort-Object -Unique) -join ',') }" > "%CLEANUP_OUT%"
if exist "%CLEANUP_OUT%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%CLEANUP_OUT%") do (
    if /I "%%~A"=="KILLED" (
      echo [INFO] Procesos huerfanos finalizados: %%~B
    )
  )
  del /q "%CLEANUP_OUT%" >nul 2>&1
)
exit /b 0
