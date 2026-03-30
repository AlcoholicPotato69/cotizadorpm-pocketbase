# Development

Scripts para trabajar localmente sin tocar el flujo de producción.

## Scripts

- `dev-start.bat`
  levanta PocketBase en foreground para desarrollo.
- `frontend-dev-start.bat`
  sirve el frontend estático con Python desde `frontend/`.
- `static-file-server.ps1`
  alternativa en PowerShell para servir `frontend/` sin Python.

## Flujo recomendado

1. Ejecutar `dev-start.bat`
2. Ejecutar `frontend-dev-start.bat`
3. Abrir `http://127.0.0.1:8080/client/index.html`
