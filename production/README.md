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

- pide la IP o dominio del servidor y el puerto de PocketBase
- sincroniza `frontend\client\config\hub-runtime.json` y `env.js`
- deja el frontend configurado en mismo origen (`/`)
- activa `PUBLIC_DIR=pb_public` para que PocketBase sirva el Frontend unificado
- genera la carpeta estática y plantilla Nginx opcional por si usas proxy inverso
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

### 2. Frontend unificado y Nginx opcional

La estrategia oficial ahora es que **PocketBase sirva directamente el frontend** en `PUBLIC_DIR=pb_public`.

Al ejecutar `production\levantar-todo.bat`, el sistema configura el publicDir unificado:

```bat
production\backend-service.bat set-public-dir pb_public
```

Eso permite que PocketBase entregue `/`, `/client/index.html`, `/api/` y `/_/` en un solo puerto.

Si además deseas colocar Nginx como Reverse Proxy (proxy inverso SSL/TLS en el puerto 443 o 80) delante de PocketBase, la plantilla generada (`production\deploy\nginx\cotizador-production.conf`) está lista para redirigir todo el tráfico al puerto del servicio.

## Comandos típicos

```bat
production\backend-service.bat show
production\backend-service.bat set-frontend-url /
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat set-public-dir pb_public
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
