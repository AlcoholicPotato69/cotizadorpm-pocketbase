# Development

Scripts para trabajar localmente sin tocar el flujo de producción.

## Scripts

- `dev-start.bat`
  levanta PocketBase en foreground. Sirve backend, API, dashboard y frontend unificado en el puerto 8090.
- `deploy/audit-smoke.ps1`
  auditoría reproducible de sintaxis, migraciones y base viva (read-only).
- `deploy/rbac-smoke.ps1`
  smoke test de permisos RBAC.

## Flujo recomendado

1. Ejecutar `dev-start.bat`
2. Abrir `http://127.0.0.1:8090/client/index.html` (o `http://127.0.0.1:8090/`)

PocketBase aplica migraciones al arrancar. En un clon limpio crea `backend\pb_data\` automáticamente.

## Verificación

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File development\deploy\audit-smoke.ps1
```

## Notas

- No versionar `backend\pb_data\` (datos vivos, backups, uploads). Ver `.gitignore`.
- El frontend canónico es `frontend\client\`. PocketBase lo sirve vía `PUBLIC_DIR` en producción o directamente en desarrollo.
