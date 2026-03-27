# Manual TI

Ultima actualizacion: 2026-03-27

Este archivo queda como puerta de entrada rapida para TI.
La documentacion completa ahora vive en `docs/`.

## Leer primero

- `docs/20-operacion-local-y-soporte.md`
- `docs/30-despliegue-y-servicio-windows.md`
- `docs/70-troubleshooting-y-runbooks.md`

## Objetivo operativo

Dejar el sistema funcionando con:

1. PocketBase respondiendo
2. frontend apuntando al backend correcto
3. servicio `CotizadorPocketBase` en `RUNNING`

## Reparacion local automatica

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
levantar-todo.bat
```

## Verificaciones minimas

```bat
backend-service.bat status
backend-service.bat show
```

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

Si el frontend se sirve localmente:

- abrir `http://127.0.0.1:8080/index.html`

## Archivos clave para TI

- `client/config/hub-runtime.json`
- `deploy/backend-service.local.conf`
- `backend-service.bat`
- `levantar-todo.bat`

## Comandos de primera respuesta

```bat
backend-service.bat cleanup-orphans
backend-service.bat restart
backend-service.bat status
```

