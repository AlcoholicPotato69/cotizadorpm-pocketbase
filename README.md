# cotizadorpm-pocketbase

Repositorio reorganizado para separar claramente frontend, backend, documentación y herramientas operativas.

## Estructura

- `frontend/`
  HTML, JS, CSS, assets y archivos públicos del sistema.
- `backend/`
  `pocketbase.exe`, hooks, migraciones, base de datos y logs.
- `development/`
  scripts para levantar backend y frontend en desarrollo local.
- `production/`
  scripts y utilidades para servicio Windows, despliegue y carpeta pública de producción.
- `docs/`
  documentación técnica y operativa vigente.

## Flujo local recomendado

Backend:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
development\dev-start.bat
```

`development\dev-start.bat` ahora prevalida migraciones y crea `backend\pb_data\` si aún no existe, para que un clon limpio pueda inicializar la base sin pasos manuales extra.

Frontend y Backend unificados:
Al iniciar `development\dev-start.bat`, PocketBase sirve automáticamente el frontend y backend sin necesidad de servidores adicionales.

Accesos locales:
- Frontend: `http://127.0.0.1:8090/client/index.html` (o `http://127.0.0.1:8090/`)
- Backend API: `http://127.0.0.1:8090/api/`
- Dashboard: `http://127.0.0.1:8090/_/`

Verificación local:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File development\deploy\audit-smoke.ps1
```

## Producción

La arquitectura unificada permite que el servicio de Windows de PocketBase sirva tanto el Backend como el Frontend:

- PocketBase sirve backend, API y dashboard administrativo.
- Los HTML se sirven por fuera de PocketBase, normalmente desde Nginx con la carpeta `production\deploy\nginx-site\`.
- El frontend canónico para ejecución y despliegue es `frontend\client\` (sin espejos duplicados).

Puntos clave:

- configuración del backend: `production/deploy/backend-service.local.conf`
- runtime del frontend: `frontend/client/config/hub-runtime.json`
- runtime legacy/publico: `frontend/client/public/assets/libs/js/env.js`
- servicio Windows: `production/backend-service.bat`
- publicación estática separada: `production/deploy/nginx-site/`

### 1. Levantar backend en producción

Si es un clon limpio sin datos previos, puedes arrancar con `backend\pb_data\` vacío o inexistente; PocketBase lo crea y aplica migraciones al iniciar.

Revisa o ajusta IP/puerto si hace falta:

```bat
production\backend-service.bat show
production\backend-service.bat set-bind 127.0.0.1:8090
production\backend-service.bat set-url http://127.0.0.1:8090
production\backend-service.bat set-public-dir pb_public
```

Instala e inicia el servicio:

```bat
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat status
```

Valida salud del backend:

- dashboard PocketBase: `http://HOST:PUERTO/_/`
- health-check: `http://HOST:PUERTO/api/health`

Primer arranque de una instalación limpia:

```bat
backend\pocketbase.exe superuser upsert admin@tu-dominio.com TuPasswordSegura123 --dir=backend\pb_data
```

Ese superusuario te deja entrar al dashboard para crear o revisar los registros internos como `app_users`.

### 2. Levantar el sistema en producción

El flujo simplificado y automatizado para producción es:

```bat
production\levantar-todo.bat
```

El script pide:

- IP o dominio del servidor y puerto de PocketBase (ej: 192.168.1.50:8090)

Después actualiza automáticamente:

- `BIND_ADDR`
- `BACKEND_URL`
- `FRONTEND_BACKEND_URL=/`
- `CORS_ALLOWED_ORIGINS`
- `PUBLIC_DIR=pb_public` (PocketBase sirve el frontend unificado)
- `frontend/client/config/hub-runtime.json`
- `frontend/client/public/assets/libs/js/env.js`
- `production/deploy/nginx-site/` (sitio y configuración opcional por si se usa Nginx como Reverse Proxy)

Accesos esperados con Nginx:

- frontend: `http://FRONTEND_HOST/client/index.html`
- backend/API por proxy: `http://FRONTEND_HOST/api/health`
- dashboard por proxy: `http://FRONTEND_HOST/_/`

Si TI decide servir el HTML desde otro servidor estático sin proxy same-origin, entonces el frontend debe apuntar directamente al backend:

```bat
production\backend-service.bat set-url http://BACKEND_HOST:8090
production\backend-service.bat set-frontend-url http://BACKEND_HOST:8090
production\backend-service.bat set-frontend-origin http://FRONTEND_HOST
production\backend-service.bat sync-frontend
```

### 3. Configuración de IP (Acceso en Red Local o Producción)

Para que otros equipos de la red accedan al sistema, usa IPs reales en lugar de `127.0.0.1`.

```bat
production\backend-service.bat set-bind 0.0.0.0:8090
production\backend-service.bat set-url http://TU_IP_LOCAL:8090
production\backend-service.bat set-frontend-origin http://IP_FRONTEND
production\backend-service.bat restart
```

El frontend reconoce la IP del backend por estos archivos, generados por `sync-frontend-runtime.ps1`:

- `frontend/client/config/hub-runtime.json`
- `frontend/client/public/assets/libs/js/env.js`

No se recomienda editarlos a mano salvo emergencia. Usa:

```bat
production\backend-service.bat set-frontend-url /
production\backend-service.bat prepare-nginx production\deploy\nginx-site IP_FRONTEND
```

Con proxy Nginx same-origin, `FRONTEND_BACKEND_URL=/` es correcto. Si no hay proxy same-origin, usa `set-frontend-url http://BACKEND_HOST:8090` y autoriza CORS con `set-frontend-origin`.

Nota de recuperación:

- si el backend falló en un clon limpio sin datos reales, elimina `backend\pb_data\` y vuelve a iniciar para recrear la base desde cero
- si `backend\pb_data\` ya contiene datos reales, respáldala antes de tocarla

## Archivos importantes

- `frontend/client/config/hub-runtime.json`
- `frontend/client/js/hub-config.js`
- `frontend/client/js/layout.js`
- `backend/pb_hooks/`
- `backend/pb_migrations/`
- `backend/pb_data/`
- `development/dev-start.bat`
- `development/deploy/audit-smoke.ps1`
- `production/backend-service.bat` (wrapper → `production/deploy/backend-service.bat`)
- `docs/README docs.md`
- `docs/35-requisitos-tecnicos-del-servidor.md`
