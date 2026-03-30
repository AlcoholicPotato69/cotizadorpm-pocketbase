# Manual TI

Ultima actualizacion: 2026-03-28

Documento puente heredado para TI.

## Leer primero

- `docs/20-operacion-local-y-soporte.md`
- `docs/30-despliegue-y-servicio-windows.md`
- `docs/70-troubleshooting-y-runbooks.md`

## Acciones rapidas

```bat
production\backend-service.bat status
production\backend-service.bat show
production\backend-service.bat cleanup-orphans
production\backend-service.bat restart
```

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

Frontend local:

- `http://127.0.0.1:8080/client/index.html`
