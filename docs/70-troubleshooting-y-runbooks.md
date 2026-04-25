# Troubleshooting y Runbooks

Ultima actualizacion: 2026-04-24

## 1. El frontend no conecta al backend

Revisar:

- `frontend/client/config/hub-runtime.json`
- `production/backend-service.bat show`
- `http://127.0.0.1:8090/api/health`

Acciones:

```bat
production\backend-service.bat show
production\backend-service.bat set-url http://127.0.0.1:8090
production\backend-service.bat restart
```

## 2. El servicio no queda en RUNNING

```bat
production\backend-service.bat cleanup-orphans
production\backend-service.bat restart
production\backend-service.bat status
```

Revisar:

- `backend/logs/`
- permisos de administrador
- `backend/pocketbase.exe`

## 3. La sesion parece perderse

Revisar:

- backend URL correcta
- `frontend/client/js/layout.js`
- consola del navegador

## 4. PDF no abre o snapshot falla

Revisar:

- consola del navegador
- preview HTML
- bucket `documentos`

Puntos de código:

- `orders.js`
- `contracts.js`
- `receipts.js`

## 5. Restore de emergencia

1. detener servicio
2. respaldar estado actual
3. restaurar backup
4. iniciar backend
5. validar health y login

## 6. Checklist antes de escalar

- tenant identificado
- modulo identificado
- backend URL confirmada
- health confirmado
- screenshot o log guardado
- último cambio identificado

## 7. Validacion estructural recomendada

Si el problema parece sistémico o después de tocar migraciones/hooks, ejecutar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File development\audit-smoke.ps1
```

Interpretacion rapida:

- si falla en `Sintaxis JavaScript`, hay error estructural de modulo u hook
- si falla en `PocketBase cold start`, hay problema de migracion o compatibilidad de inicializacion
- si reporta advertencias de base viva, documentarlas como deuda historica o corregirlas con respaldo previo

## 8. `client_profile`: el archivo no paso la seguridad del sistema

Sintoma visible:

- el portal publico muestra un error parecido a:
  - `El archivo de Constancia de situacion fiscal no paso la seguridad del sistema. Intenta de nuevo con otro archivo.`

Que revisar:

- el archivo original que entrego el cliente
- si el PDF fue generado por una fuente confiable
- si el host Windows mantiene activo `MpCmdRun.exe`
- permisos de lectura/escritura sobre `backend/pb_data/_upload_quarantine`

Accion recomendada:

1. pedir un archivo nuevo o volver a exportarlo desde la fuente oficial
2. validar manualmente con Windows Defender en el servidor
3. reintentar la carga desde el portal
4. si el error persiste con archivos sanos, revisar logs del hook `client_profile_shared.js`
