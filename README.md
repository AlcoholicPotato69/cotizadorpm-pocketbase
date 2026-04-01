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

Frontend:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
development\frontend-dev-start.bat
```

Accesos locales:

- backend: `http://127.0.0.1:8090/_/`
- API health: `http://127.0.0.1:8090/api/health`
- frontend: `http://127.0.0.1:8080/client/index.html`

## Producción

La ruta recomendada es servir API, dashboard y frontend desde el mismo PocketBase.

Puntos clave:

- configuración del backend: `production/deploy/backend-service.local.conf`
- runtime del frontend: `frontend/client/config/hub-runtime.json`
- servicio Windows: `production/backend-service.bat`
- publicación estática: `frontend/pb_public/`

### 1. Levantar backend en producción

Si es un clon limpio sin datos previos, puedes arrancar con `backend\pb_data\` vacío o inexistente; PocketBase lo crea y aplica migraciones al iniciar.

Revisa o ajusta IP/puerto si hace falta:

```bat
production\backend-service.bat show
production\backend-service.bat set-bind 127.0.0.1:8090
production\backend-service.bat set-url http://127.0.0.1:8090
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

### 2. Levantar frontend en producción

No hace falta un servicio aparte si mantienes `PUBLIC_DIR=frontend\pb_public`. El runner de producción prepara esa carpeta y PocketBase publica el frontend automáticamente.

Accesos esperados después de levantar el backend:

- frontend: `http://HOST:PUERTO/index.html`
- login/runtime: `http://HOST:PUERTO/client/index.html`

Si necesitas regenerar la carpeta pública manualmente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File production\deploy\prepare-public-dir.ps1
```

### 3. Configuración de IP (Acceso en Red Local o Producción)

Para que otros equipos de la red puedan acceder al sistema, debes asignar la IP del servidor (ej. `192.168.1.100`) en lugar de `127.0.0.1`.

**1. Configurar la IP en el Backend:**
Usa los scripts de producción para que PocketBase escuche en la IP correcta o en todas las interfaces (`0.0.0.0`):

```bat
production\backend-service.bat set-bind 0.0.0.0:8090
production\backend-service.bat set-url http://TU_IP_LOCAL:8090
production\backend-service.bat restart
```
*(Reemplaza `TU_IP_LOCAL` por la IP real del servidor, por ejemplo `192.168.1.100`)*

**2. Actualizar la IP en el Frontend:**
Debes indicar al frontend dónde encontrar al backend. Tienes que modificar estos **dos archivos principales**:

1. **`frontend/client/config/hub-runtime.json`**
   Cambia `BACKEND_URL` por la IP del servidor.
   ```json
   {
       "BACKEND_URL": "http://TU_IP_LOCAL:8090",
       "FINANZAS_SCHEMA": "finanzas",
       ...
   }
   ```

2. **`frontend/client/public/assets/libs/js/env.js`**
   Cambia `POCKETBASE_URL` por la IP del servidor.
   *(Este archivo controla la conexión de las páginas públicas de los catálogos).*
   ```javascript
   window.ENV = {
       POCKETBASE_URL: 'http://TU_IP_LOCAL:8090',
       ...
   };
   ```

**(Importante)**: Si el frontend falla al cargar la nueva configuración porque la caché del navegador quedó con la IP vieja de `hub-runtime.json`, deberás borrar la caché o usar modo incógnito.

Después de realizar estos cambios, los usuarios en la red podrán acceder al sistema ingresando en su navegador a:
`http://TU_IP_LOCAL:8090/index.html`

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
- `development/frontend-dev-start.bat`
- `production/backend-service.bat`
- `docs/README.md`
