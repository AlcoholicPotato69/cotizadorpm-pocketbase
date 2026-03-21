# cotizadorpm-pocketbase

Sistema de cotizacion multi-tenant para Plaza Mayor y Casa de Piedra con backend PocketBase y frontend HTML/JS vanilla.

## Resumen

El proyecto cubre:
1. Cotizaciones y flujo operativo.
2. Agenda/calendario de eventos y premontajes.
3. Clientes, catalogos, contratos, recibos, facturas y reportes.
4. Integracion de calendario por feed ICS para Outlook Desktop en LAN.

Tenants soportados:
1. `plaza_mayor`
2. `casa_de_piedra`

## Arquitectura

1. Backend de datos:
   - `pocketbase.exe`
   - `pb_data/`
   - `pb_hooks/`
   - `pb_migrations/`
2. Frontend:
   - `client/` (sitio estatico)
3. Servicio Windows:
   - `backend-service.bat`
   - `deploy/run-pocketbase-service.bat`
   - `deploy/run-pocketbase-service.ps1`
4. HTTPS local autofirmado (opcional/recomendado en produccion):
   - `deploy/configure-https-selfsigned.ps1`
   - `deploy/https-reverse-proxy.ps1`
5. Service host nativo Windows:
   - `deploy/CotizadorServiceHost.cs`
   - `deploy/build-service-host.bat`
6. Calendario:
   - endpoint ICS: `/api/cotizador/cp-calendar-ics`
   - suscripcion recomendada: Outlook Desktop.

## Inicio rapido (desarrollo)

Backend:
```powershell
.\pocketbase.exe serve --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

Frontend:
```powershell
cd client
python -m http.server 8080
```

Acceso:
1. Backend health: `http://127.0.0.1:8090/api/health`
2. Frontend: `http://127.0.0.1:8080/index.html`

Stack local un clic (sin servicio Windows):
1. `run-local-stack.bat [HOST] [BACKEND_PORT] [FRONT_PORT]`
2. Default: `127.0.0.1 8090 8080`
3. Detener:
   - `stop-local-stack.bat`
4. Si necesitas forzar cierre de todos los `pocketbase.exe`:
   - `stop-local-stack.bat --force-backend`

## Produccion (Windows Service)

1. Configurar backend HTTP local/LAN:
   - `backend-service.bat set-ip <IP> [PUERTO]`
2. Habilitar HTTPS autofirmado (recomendado):
   - `backend-service.bat enable-https <IP_O_HOST> [PUERTO_HTTPS]`
3. Instalar servicio:
   - `backend-service.bat install`
   - `backend-service.bat start`
4. Ver estado:
   - `backend-service.bat status`
   - `backend-service.bat show`

Despliegue rapido "un clic":
1. `deploy-production.bat <IP_O_HOST> [PUERTO_BACKEND] [TIMEOUT_SEG]`
2. El script ejecuta en secuencia: `set-ip -> install -> start -> health-check`.
3. Si lo ejecutas sin parametros, entra en modo interactivo y te pide la IP/puerto.
4. Genera log para TI en `logs/deploy-production-YYYYMMDD-HHMMSS.log`.

Notas:
1. `enable-https` genera certificado autofirmado, configura binding SSL en Windows (`http.sys`) y actualiza `BACKEND_URL` a `https://...`.
2. El backend PocketBase corre en HTTP interno y el proxy local expone HTTPS a la LAN.
3. Si cambia IP/host, ejecutar de nuevo `enable-https`.
4. Logs operativos en `logs/` (`pocketbase-service.log`, `pocketbase.stdout.log`, `pocketbase.stderr.log`, `https-proxy.log`, `service-host.log`).
5. No usar `pocketbase serve --https` en este escenario LAN sin internet (depende de ACME/autocert).

## Calendario y sincronizacion (Outlook)

Flujo recomendado sin OAuth:
1. En Agenda CP usar `Copiar enlace Outlook` o `Abrir Outlook`.
2. En Outlook Desktop: `Calendar -> Add Calendar -> From Internet`.
3. Pegar URL ICS y confirmar.
4. Outlook refresca cambios del feed segun su ciclo de sincronizacion.

Botones de Agenda CP:
1. `Copiar enlace Outlook`
2. `Abrir Outlook`
3. `Descargar ICS` (con fallback local si el endpoint falla)

## Archivos de despliegue

1. Guia TI completa:
   - `MANUAL-IMPLEMENTACION-SERVIDOR-TI.md`
2. Documentacion tecnica extendida:
   - `DOCUMENTACION-CODIGO-FRONTEND-BACKEND.md`
3. Script de despliegue un clic:
   - `deploy-production.bat`
4. Configuracion base:
   - `client/config/hub-runtime.json`
5. Override local no versionado:
   - `client/config/hub-runtime.override.json`
   - ejemplo: `client/config/hub-runtime.override.example.json`
6. Configuracion local de servicio:
   - `deploy/backend-service.local.conf`

## Git y archivos locales

En `.gitignore` se excluyen archivos locales para no sobrescribir configuraciones productivas:
1. `client/config/hub-runtime.override.json`
2. `deploy/backend-service.local.conf`
3. `deploy/certs/`
4. `logs/`
5. `pb_data/`
