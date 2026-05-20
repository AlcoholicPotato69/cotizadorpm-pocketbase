# Despliegue y Servicio Windows

Ultima actualizacion: 2026-04-13

Este documento cubre la operación del servicio `CotizadorPocketBase` y la estructura de despliegue en Windows.

## 1. Piezas involucradas

- `production/backend-service.bat`
- `production/deploy/backend-service.local.conf`
- `production/deploy/CotizadorServiceHost.exe`
- `production/deploy/run-pocketbase-service.bat`
- `production/deploy/run-pocketbase-service.ps1`
- `production/deploy/https-reverse-proxy.ps1`
- `production/deploy/nginx-site/`
- `frontend/client/`
- `frontend/assets/`
- `backend/`

## 2. Servicio

Nombre del servicio:

- `CotizadorPocketBase`

Comandos soportados:

```bat
production\backend-service.bat help
production\backend-service.bat show
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat stop
production\backend-service.bat restart
production\backend-service.bat status
production\backend-service.bat uninstall
production\backend-service.bat cleanup-orphans
production\backend-service.bat set-url http://127.0.0.1:8090
production\backend-service.bat set-bind 127.0.0.1:8090
production\backend-service.bat set-frontend-url /
production\backend-service.bat set-frontend-origin http://127.0.0.1
production\backend-service.bat set-public-dir off
production\backend-service.bat prepare-nginx production\deploy\nginx-site _
production\backend-service.bat enable-https localhost 9443
production\backend-service.bat disable-https
```

## 3. Configuracion

Archivo principal:

- `production/deploy/backend-service.local.conf`

Claves principales:

- `SERVICE_NAME`
- `DISPLAY_NAME`
- `BIND_ADDR`
- `BACKEND_URL`
- `FRONTEND_BACKEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `PUBLIC_DIR`
- `HTTPS_ENABLED`
- `HTTPS_HOST`
- `HTTPS_PORT`
- `HTTPS_CERT_THUMBPRINT`
- `HTTPS_CERT_FILE`

## 4. Relacion con el frontend

La estrategia recomendada desde 2026-04-13 es que PocketBase no sirva los HTML. PocketBase queda como backend/API/dashboard y los HTML se sirven por separado desde Nginx u otro servidor estático.

Configuración esperada:

- `PUBLIC_DIR=` o `PUBLIC_DIR=off`
- `FRONTEND_BACKEND_URL=/` cuando Nginx proxya `/api/` y `/_/` al backend
- `CORS_ALLOWED_ORIGINS=http://FRONTEND_HOST[:PUERTO]` cuando el frontend corre en un origen distinto

El runtime del frontend se sincroniza hacia:

- `frontend/client/config/hub-runtime.json`
- `frontend/client/public/assets/libs/js/env.js`
- `production/deploy/nginx-site/` cuando se ejecuta `prepare-nginx`

Eso mantiene al frontend apuntando al backend correcto cuando cambia IP, hostname o protocolo. Si el frontend se sirve sin proxy same-origin, usar:

```bat
production\backend-service.bat set-frontend-url http://BACKEND_HOST:8090
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat sync-frontend
```

Si el frontend se sirve con Nginx same-origin, usar:

```bat
production\backend-service.bat set-frontend-url /
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat prepare-nginx production\deploy\nginx-site FRONTEND_HOST
```

## 5. HTTPS local

Uso:

```bat
production\backend-service.bat enable-https localhost 9443
```

Desactivar:

```bat
production\backend-service.bat disable-https
```

Notas:

- requiere privilegios de administrador
- exporta certificado en `production/deploy/certs/`
- actualiza `BACKEND_URL`

## 6. Recomendaciones

- no editar manualmente `backend/pb_data/`
- respaldar `backend/pb_data/` antes de aplicar hooks o migraciones
- confirmar `BACKEND_URL` después de cambiar IP o dominio
- mantener `PUBLIC_DIR` desactivado salvo que TI apruebe explícitamente servir HTML desde PocketBase
- confirmar `CORS_ALLOWED_ORIGINS` si el frontend HTML no comparte origen con el backend
- validar siempre:
  - `/api/health`
  - `/client/index.html` desde el servidor estático
  - login
  - preview PDF
  - apertura de documentos

## 7. Actualizacion

1. respaldar repo y `backend/pb_data/`
2. detener servicio
3. actualizar archivos
4. revisar `frontend/client/config/hub-runtime.json`
5. revisar `production/deploy/backend-service.local.conf`
6. iniciar servicio
7. validar health y frontend

## 8. Exposicion del frontend

La opción recomendada es que Nginx u otro servidor estático sirva el frontend desde `production/deploy/nginx-site/`.

Acceso esperado:

- `http://FRONTEND_HOST/client/index.html`
- `http://FRONTEND_HOST/api/health` si se usa proxy same-origin
- `http://BACKEND_HOST:8090/_/` para dashboard directo de PocketBase
