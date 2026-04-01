# Production

Herramientas para instalar y operar el backend y dejar el frontend listo para Nginx en producción o entornos internos.

## Contenido

- `backend-service.bat`
  administra el servicio Windows.
- `levantar-todo.bat`
  deja backend, frontend runtime y artefactos Nginx listos para producción.
- `deploy/`
  runner, service host, HTTPS local y utilidades de despliegue.

## Configuración

Archivo principal:

- `deploy/backend-service.local.conf`

## Arranque recomendado

### 1. Backend

En un clon limpio sin datos previos, `backend\pb_data\` puede no existir; PocketBase lo creará al iniciar y aplicará las migraciones del proyecto.

Para el flujo completo de producción, ejecuta primero:

```bat
production\levantar-todo.bat
```

Ese script:

- pide la IP/host y puerto reales del backend
- sincroniza `frontend\client\config\hub-runtime.json`
- sincroniza `frontend\client\public\assets\libs\js\env.js`
- deja el frontend en mismo origen (`/`) para Nginx
- genera la carpeta estática `production\deploy\nginx-site\`
- genera la plantilla `production\deploy\nginx\cotizador-production.conf`
- instala/actualiza el servicio Windows y lo deja en `RUNNING`

Primero revisa la configuración activa:

```bat
production\backend-service.bat show
```

Si necesitas cambiar IP o puerto manualmente:

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

### 2. Frontend y Nginx

La estrategia recomendada para producción es servir el frontend con Nginx y dejar PocketBase solo como backend/API.

El comando recomendado es:

```bat
production\backend-service.bat prepare-nginx
```

Eso deja listos:

- site estático: `production\deploy\nginx-site\`
- configuración Nginx: `production\deploy\nginx\cotizador-production.conf`
- frontend runtime en mismo origen (`/`), listo para proxear `/api/` y `/_/`

Si todavía quieres que PocketBase publique el frontend directamente, puedes mantener `PUBLIC_DIR=frontend\pb_public`.

Si necesitas reconstruir la carpeta pública de PocketBase manualmente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File production\deploy\prepare-public-dir.ps1
```

## Comandos típicos

```bat
production\backend-service.bat show
production\backend-service.bat set-frontend-url /
production\backend-service.bat sync-frontend
production\backend-service.bat prepare-nginx
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat restart
production\backend-service.bat stop
production\backend-service.bat status
```

## Nota operativa

- si el arranque falla sobre un clon limpio sin datos reales, puedes borrar `backend\pb_data\` y volver a iniciar
- si `backend\pb_data\` ya contiene información real, respáldala antes de cualquier limpieza o reinstalación
