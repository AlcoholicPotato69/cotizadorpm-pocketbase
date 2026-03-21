# Manual TI (Local Simplificado)

Fecha: 2026-03-21

## Objetivo
Dejar el sistema funcionando en local (misma PC) con:
1. Backend PocketBase en `127.0.0.1:8090`.
2. Frontend apuntando al backend local.
3. Servicio de Windows corriendo en segundo plano.

## Configuracion unica del frontend
Solo se usa este archivo:
1. `client/config/hub-runtime.json`

Campo principal:
1. `BACKEND_URL=http://127.0.0.1:8090`

## Configuracion del servicio backend
Archivo:
1. `deploy/backend-service.local.conf`

Valores locales esperados:
1. `BIND_ADDR=127.0.0.1:8090`
2. `BACKEND_URL=http://127.0.0.1:8090`
3. `HTTPS_ENABLED=0`

## Reparar todo automaticamente
En CMD como Administrador:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
levantar-todo.bat
```

## Validaciones
1. Servicio:
```bat
backend-service.bat status
```
Debe mostrar `RUNNING`.

2. Health:
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

3. Frontend:
- Abrir `http://127.0.0.1:8080/index.html` (si levantas server estatico en `client/`).

## Troubleshooting corto
1. Si aparece servicio detenido pero PocketBase responde:
```bat
backend-service.bat cleanup-orphans
backend-service.bat restart
```
2. Si no conecta frontend:
- Verifica `BACKEND_URL` en `client/config/hub-runtime.json`.
- Debe ser `http://127.0.0.1:8090`.
