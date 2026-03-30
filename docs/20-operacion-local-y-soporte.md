# Operacion Local y Soporte

Ultima actualizacion: 2026-03-28

Este documento describe cómo levantar, validar y recuperar el sistema en desarrollo local o soporte interno.

## 1. Requisitos

- Windows
- `backend/pocketbase.exe`
- Python en `PATH` para servir el frontend local
- puerto `8090` libre para backend
- puerto `8080` libre para frontend

## 2. Desarrollo local recomendado

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

Accesos:

- backend: `http://127.0.0.1:8090/_/`
- health: `http://127.0.0.1:8090/api/health`
- frontend: `http://127.0.0.1:8080/client/index.html`

## 3. Reparacion local automatica

Si necesitas reparar el servicio Windows:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
production\levantar-todo.bat
```

Qué hace:

1. limpia procesos huérfanos
2. fuerza `BIND_ADDR` y `BACKEND_URL`
3. instala o actualiza el servicio Windows
4. inicia el servicio
5. ejecuta health check

## 4. Validaciones minimas

Servicio:

```bat
production\backend-service.bat status
```

Health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

Frontend:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/client/index.html
```

## 5. Arranque manual del backend

```powershell
.\backend\pocketbase.exe serve --http=127.0.0.1:8090 --dir=backend\pb_data --hooksDir=backend\pb_hooks --migrationsDir=backend\pb_migrations
```

## 6. Archivos a vigilar

- `frontend/client/config/hub-runtime.json`
- `production/deploy/backend-service.local.conf`
- `backend/logs/`
- `backend/pb_data/`
- `backend/pb_hooks/`
- `backend/pb_migrations/`

## 7. Evidencia y logs

- `backend/logs/`
- salida de `production\backend-service.bat status`
- consola del navegador
- network tab del navegador

## 8. Restore rapido

1. detener PocketBase o el servicio
2. respaldar el estado actual
3. restaurar:
   - `backend/pocketbase.exe`
   - `backend/pb_data/`
   - `backend/pb_hooks/`
   - `backend/pb_migrations/`
   - `frontend/client/services/`
   - `frontend/client/js/hub-config.js`
4. volver a iniciar backend y frontend

## 9. Checklist de soporte

Antes de cerrar un incidente:

- health responde
- frontend abre
- login funciona
- Plaza Mayor carga
- Casa de Piedra carga
- módulos de órdenes y preview PDF responden
- los documentos almacenados abren correctamente
