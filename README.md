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

La ruta más simple sigue siendo servir HTML y API desde el mismo PocketBase.

Puntos clave:

- configuración del backend: `production/deploy/backend-service.local.conf`
- runtime del frontend: `frontend/client/config/hub-runtime.json`
- servicio Windows: `production/backend-service.bat`

Comandos típicos:

```bat
production\backend-service.bat show
production\backend-service.bat install
production\backend-service.bat start
```

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
