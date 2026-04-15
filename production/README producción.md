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

La estrategia recomendada es separar frontend y backend:

- PocketBase queda como backend/API/dashboard.
- Los HTML se sirven por fuera de PocketBase, normalmente desde `production\deploy\nginx-site\`.
- `PUBLIC_DIR` debe quedar apagado (`set-public-dir off`) salvo decisión explícita de TI.

Flujo completo:

```bat
production\levantar-todo.bat
```

Ese flujo pide IP/puerto del backend y del frontend, actualiza `CORS_ALLOWED_ORIGINS`, sincroniza `hub-runtime.json`/`env.js`, prepara `production\deploy\nginx-site\` y deja `PUBLIC_DIR` desactivado.

Si necesitas preparar solo el frontend estático:

```bat
production\backend-service.bat set-frontend-url /
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat set-public-dir off
production\backend-service.bat prepare-nginx production\deploy\nginx-site FRONTEND_HOST
```

Si el frontend se sirve desde otro host sin proxy Nginx, cambia el runtime para apuntar al backend real:

```bat
production\backend-service.bat set-frontend-url http://BACKEND_HOST:8090
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat sync-frontend
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
