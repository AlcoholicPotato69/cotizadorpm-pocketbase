# Production

Herramientas para instalar y operar el backend y el frontend en producción o entornos internos.

## Contenido

- `backend-service.bat`
  administra el servicio Windows.
- `levantar-todo.bat`
  reparación y arranque rápido del entorno local/interno.
- `deploy/`
  runner, service host, HTTPS local y utilidades de despliegue.

## Configuración

Archivo principal:

- `deploy/backend-service.local.conf`

## Arranque recomendado

### 1. Backend

En un clon limpio sin datos previos, `backend\pb_data\` puede no existir; PocketBase lo creará al iniciar y aplicará las migraciones del proyecto.

Primero revisa la configuración activa:

```bat
production\backend-service.bat show
```

Si necesitas cambiar IP o puerto:

```bat
production\backend-service.bat set-bind 127.0.0.1:8090
production\backend-service.bat set-url http://127.0.0.1:8090
```

Instala y levanta el servicio Windows:

```bat
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat status
```

Valida:

- dashboard: `http://HOST:PUERTO/_/`
- health: `http://HOST:PUERTO/api/health`

Si es la primera vez sobre una base vacía, crea un superusuario de PocketBase:

```bat
backend\pocketbase.exe superuser upsert admin@tu-dominio.com TuPasswordSegura123 --dir=backend\pb_data
```

### 2. Frontend

La estrategia recomendada es no separar frontend y backend: el mismo servicio de PocketBase publica `frontend\pb_public\`.

Una vez que el backend quede en `RUNNING`, el frontend debe responder en:

- `http://HOST:PUERTO/index.html`
- `http://HOST:PUERTO/client/index.html`

Si necesitas reconstruir la carpeta pública manualmente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File production\deploy\prepare-public-dir.ps1
```

## Comandos típicos

```bat
production\backend-service.bat show
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat restart
production\backend-service.bat stop
production\backend-service.bat status
```

## Nota operativa

- si el arranque falla sobre un clon limpio sin datos reales, puedes borrar `backend\pb_data\` y volver a iniciar
- si `backend\pb_data\` ya contiene información real, respáldala antes de cualquier limpieza o reinstalación
