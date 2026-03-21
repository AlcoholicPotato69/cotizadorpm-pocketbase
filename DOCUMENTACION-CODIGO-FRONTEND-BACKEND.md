# Documentacion Tecnica (Modo Local Simplificado)

Fecha: 2026-03-21

## 1. Configuracion activa
El frontend ahora usa una sola fuente de configuracion:
1. `client/config/hub-runtime.json`

Campos clave:
1. `BACKEND_URL`
2. `CP_CALENDAR_ICS_URL`
3. `CP_CALENDAR_ICS_TOKEN`

Valor local recomendado:
```json
{
  "BACKEND_URL": "http://127.0.0.1:8090"
}
```

## 2. Configuracion backend/servicio
Archivo:
1. `deploy/backend-service.local.conf`

Valores locales esperados:
1. `BIND_ADDR=127.0.0.1:8090`
2. `BACKEND_URL=http://127.0.0.1:8090`
3. `HTTPS_ENABLED=0`

## 3. Script principal
`levantar-todo.bat` fue simplificado a modo local y hace:
1. Limpieza de procesos huérfanos.
2. Desactivar HTTPS.
3. Forzar bind y URL local (`127.0.0.1:8090`).
4. Configurar ICS local por defecto.
5. Instalar/iniciar servicio `CotizadorPocketBase`.
6. Validar health-check local.

## 4. Comandos operativos
1. Reparar todo local:
```bat
levantar-todo.bat
```
2. Ver estado:
```bat
backend-service.bat status
```
3. Ver config:
```bat
backend-service.bat show
```
4. Limpiar huérfanos:
```bat
backend-service.bat cleanup-orphans
```

## 5. Ejecucion manual (sin servicio)
Backend:
```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

Frontend:
```powershell
cd client
python -m http.server 8080
```

## 6. Notas
1. Se eliminó el uso de `hub-runtime.override.json` para evitar configuraciones duplicadas.
2. Si habías usado overrides en navegador, puedes limpiar con:
```js
window.clearHubBackendUrl();
window.clearCpCalendarIcsConfig();
```
