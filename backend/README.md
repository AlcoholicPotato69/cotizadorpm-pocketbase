# Backend

Esta carpeta concentra todo lo que depende de PocketBase.

## Contenido

- `pocketbase.exe`
- `pb_data/`
- `pb_hooks/`
- `pb_migrations/`
- `logs/`

## Uso

Desarrollo local:

```bat
development\dev-start.bat
```

Arranque manual:

```powershell
.\backend\pocketbase.exe serve --http=127.0.0.1:8090 --dir=backend\pb_data --hooksDir=backend\pb_hooks --migrationsDir=backend\pb_migrations
```

## Nota

`pb_data/` es estado vivo. No sobrescribir ni mover sin respaldo previo.
