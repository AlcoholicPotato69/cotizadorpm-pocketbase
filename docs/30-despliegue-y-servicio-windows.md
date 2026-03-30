# Despliegue y Servicio Windows

Ultima actualizacion: 2026-03-28

Este documento cubre la operación del servicio `CotizadorPocketBase` y la estructura de despliegue en Windows.

## 1. Piezas involucradas

- `production/backend-service.bat`
- `production/deploy/backend-service.local.conf`
- `production/deploy/CotizadorServiceHost.exe`
- `production/deploy/run-pocketbase-service.bat`
- `production/deploy/run-pocketbase-service.ps1`
- `production/deploy/https-reverse-proxy.ps1`
- `frontend/pb_public/`
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
- `PUBLIC_DIR`
- `HTTPS_ENABLED`
- `HTTPS_HOST`
- `HTTPS_PORT`
- `HTTPS_CERT_THUMBPRINT`
- `HTTPS_CERT_FILE`

## 4. Relacion con el frontend

PocketBase puede servir el frontend estático desde:

- `PUBLIC_DIR=frontend\pb_public`

El runtime del frontend se sincroniza hacia:

- `frontend/client/config/hub-runtime.json`

Eso mantiene al frontend apuntando al backend correcto cuando cambia IP, hostname o protocolo.

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
- mantener `PUBLIC_DIR=frontend\pb_public` salvo que cambie la estrategia pública
- validar siempre:
  - `/api/health`
  - `/index.html`
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

La opción recomendada es que PocketBase sirva el frontend desde `frontend/pb_public/`.

Acceso esperado:

- `http://HOST:PUERTO/index.html`
