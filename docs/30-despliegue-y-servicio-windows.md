# Despliegue y Servicio Windows

Ultima actualizacion: 2026-03-27

Este documento cubre el uso del servicio `CotizadorPocketBase` y los archivos que
participan en despliegue local o interno.

## 1. Piezas involucradas

- `backend-service.bat`
- `deploy/backend-service.local.conf`
- `deploy/CotizadorServiceHost.exe`
- `deploy/run-pocketbase-service.bat`
- `deploy/run-pocketbase-service.ps1`
- `deploy/https-reverse-proxy.ps1`
- `deploy/configure-https-selfsigned.ps1`

## 2. Servicio Windows

Nombre:

- `CotizadorPocketBase`

Comandos soportados:

```bat
backend-service.bat help
backend-service.bat show
backend-service.bat install
backend-service.bat start
backend-service.bat stop
backend-service.bat restart
backend-service.bat status
backend-service.bat uninstall
backend-service.bat cleanup-orphans
backend-service.bat set-url http://127.0.0.1:8090
backend-service.bat set-bind 127.0.0.1:8090
backend-service.bat set-ics /api/cotizador/cp-calendar-ics TOKEN_OPCIONAL
backend-service.bat enable-https localhost 9443
backend-service.bat disable-https
```

## 3. Configuracion local del servicio

Archivo:

- `deploy/backend-service.local.conf`

Claves:

- `SERVICE_NAME`
- `DISPLAY_NAME`
- `BIND_ADDR`
- `BACKEND_URL`
- `CP_CALENDAR_ICS_URL`
- `CP_CALENDAR_ICS_TOKEN`
- `HTTPS_ENABLED`
- `HTTPS_HOST`
- `HTTPS_PORT`
- `HTTPS_CERT_THUMBPRINT`
- `HTTPS_CERT_FILE`

## 4. Relacion con el frontend

`backend-service.bat set-url`, `set-ip` y `set-ics` actualizan el runtime del frontend.

Archivo impactado:

- `client/config/hub-runtime.json`

Esto es importante porque muchas incidencias aparentes del frontend son en realidad un
runtime viejo apuntando a otra IP o puerto.

## 5. HTTPS local

El flujo soportado es con certificado autofirmado y proxy local.

Uso:

```bat
backend-service.bat enable-https localhost 9443
```

Consideraciones:

- requiere permisos de administrador
- genera o exporta certificado en `deploy/certs/`
- actualiza `BACKEND_URL` a `https://HOST:PUERTO`
- puede requerir instalar el `.cer` en equipos cliente para quitar advertencias

Desactivacion:

```bat
backend-service.bat disable-https
```

## 6. Recomendaciones de despliegue

- mantener `pb_data/` fuera de sincronizacion agresiva mientras el servicio corre
- no editar manualmente `pb_data/`
- aplicar cambios de `pb_hooks/` y `pb_migrations/` con backup previo
- confirmar `BACKEND_URL` despues de cambios de IP, hostname o HTTPS
- validar siempre:
  - `/api/health`
  - login
  - preview PDF
  - apertura de documentos

## 7. Estrategia de actualizacion

Cuando se actualiza codigo:

1. backup del repo y `pb_data/`
2. detener servicio
3. actualizar archivos
4. revisar `client/config/hub-runtime.json`
5. revisar `deploy/backend-service.local.conf`
6. iniciar servicio
7. validar health y frontend

## 8. Exposicion de frontend

El frontend es estatico.
Opciones comunes:

- `python -m http.server`
- IIS o servidor interno equivalente
- cualquier static host interno

No existe build step obligatorio.

