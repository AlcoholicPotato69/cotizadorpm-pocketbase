# cotizadorpm-pocketbase

Proyecto de cotizacion y administracion para dos tenants:

- `plaza_mayor`
- `casa_de_piedra`

Stack actual:

- PocketBase como backend
- frontend HTML + JS vanilla
- Tailwind por script
- generadores PDF en frontend

## Documentacion vigente

La documentacion consolidada vive en `docs/`.

Puntos de entrada:

- `docs/README.md`
- `docs/10-funcionamiento-general-del-codigo.txt`
- `docs/20-operacion-local-y-soporte.md`
- `docs/30-despliegue-y-servicio-windows.md`
- `docs/40-modelo-de-datos-y-colecciones.md`
- `docs/50-modulos-y-flujos-de-negocio.md`
- `docs/60-pdfs-y-documentos.md`
- `docs/70-troubleshooting-y-runbooks.md`

## Arranque local rapido

Ejecutar en CMD como Administrador:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
levantar-todo.bat
```

## Validaciones minimas

Servicio:

```bat
backend-service.bat status
```

Health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

Frontend de desarrollo:

```powershell
cd client
python -m http.server 8080
```

Accesos:

- backend: `http://127.0.0.1:8090/_/`
- frontend: `http://127.0.0.1:8080/index.html`

## Archivos operativos mas importantes

- `client/config/hub-runtime.json`
- `deploy/backend-service.local.conf`
- `backend-service.bat`
- `levantar-todo.bat`
- `pb_hooks/`
- `pb_migrations/`
- `pb_data/`

