# cotizadorpm-pocketbase

Configuracion simplificada para correr en local con PocketBase.

## Modo local (simple)
1. Configuracion activa unica del frontend:
   - `client/config/hub-runtime.json`
2. URL local por defecto:
   - `http://127.0.0.1:8090`
3. Script de reparacion local:
   - `levantar-todo.bat`

## Levantar todo en local
Ejecuta en CMD como Administrador:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
levantar-todo.bat
```

Ese script fuerza:
1. `BIND_ADDR=127.0.0.1:8090`
2. `BACKEND_URL=http://127.0.0.1:8090`
3. HTTPS desactivado
4. Servicio `CotizadorPocketBase` instalado/iniciado

## Archivos que se editan manualmente
1. Frontend: `client/config/hub-runtime.json`
2. Servicio backend: `deploy/backend-service.local.conf`

## Comandos utiles
1. Ver estado del servicio:
```bat
backend-service.bat status
```
2. Ver configuracion efectiva:
```bat
backend-service.bat show
```
3. Limpiar procesos huerfanos:
```bat
backend-service.bat cleanup-orphans
```

## Desarrollo manual rapido
Backend:
```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

Frontend:
```powershell
cd client
python -m http.server 8080
```

Acceso:
1. Backend: `http://127.0.0.1:8090/_/`
2. Frontend: `http://127.0.0.1:8080/index.html`
