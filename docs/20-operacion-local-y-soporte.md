# Operacion Local y Soporte

Ultima actualizacion: 2026-03-27

Este documento describe como levantar, validar, detener y recuperar el sistema en una
PC local o entorno interno de soporte.

## 1. Requisitos base

- Windows con permisos de administrador para instalar servicio
- `pocketbase.exe` presente en la raiz del repo
- Python disponible solo si se quiere servir `client/` con `http.server`
- Puerto backend disponible:
  por default `8090`
- Carpeta `pb_data/` integra

## 2. Arranque rapido recomendado

Comando:

```bat
cd /d "C:\Users\johan\OneDrive\Desktop\repos git\cotizadorpm-pocketbase"
levantar-todo.bat
```

Que hace:

1. limpia procesos huerfanos
2. desactiva HTTPS previo
3. fuerza bind y backend URL
4. configura URL ICS local
5. instala o actualiza el servicio Windows
6. inicia el servicio
7. ejecuta health check

## 3. Validaciones minimas despues de levantar

Servicio:

```bat
backend-service.bat status
```

Health endpoint:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8090/api/health
```

Frontend:

```powershell
cd client
python -m http.server 8080
```

Abrir:

- `http://127.0.0.1:8080/index.html`

## 4. Arranque manual sin servicio

Backend:

```powershell
.\pocketbase.exe serve --http=127.0.0.1:8090 --dir=pb_data --hooksDir=pb_hooks --migrationsDir=pb_migrations
```

Frontend:

```powershell
cd client
python -m http.server 8080
```

Usar este modo para diagnostico o desarrollo rapido.

## 5. Archivos que TI debe vigilar

- `client/config/hub-runtime.json`
- `deploy/backend-service.local.conf`
- `logs/`
- `pb_data/`
- `pb_hooks/`
- `pb_migrations/`

## 6. Logs y evidencia

Ubicaciones utiles:

- `logs/`
  logs de `levantar-todo.bat`
- salida de `backend-service.bat status`
- consola del browser
- Network tab del browser para backend URL y endpoints fallidos

## 7. Backup y restore

Carpeta de referencia:

- `backups/backend_full_20260311_183315/RESTORE.txt`

Restore rapido esperado:

1. detener servicio o proceso PocketBase
2. respaldar estado actual si aplica
3. restaurar:
   - `pocketbase.exe`
   - `pb_data/`
   - `pb_hooks/`
   - `pb_migrations/`
   - `client/services/`
   - `client/js/hub-config.js`
4. iniciar backend otra vez

## 8. Checklist diario de soporte

Antes de liberar ambiente:

- health endpoint responde
- backend URL en runtime coincide con ambiente
- login admin funciona
- Plaza Mayor carga
- Casa de Piedra carga
- modulo de orders abre preview
- apertura de documentos almacenados funciona

Antes de tocar datos:

- confirmar tenant afectado
- confirmar si el problema es publico o autenticado
- confirmar si involucra PDF, snapshot o storage
- tomar backup si se va a intervenir `pb_data/`

## 9. Checklist de cierre de incidente

- documentar sintoma
- documentar tenant y modulo
- guardar comando ejecutado
- guardar log o screenshot
- confirmar si el fix fue de runtime, datos, servicio o frontend

