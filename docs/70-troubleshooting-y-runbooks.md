# Troubleshooting y Runbooks

Ultima actualizacion: 2026-03-27

## 1. El frontend no conecta al backend

Revisar:

- `client/config/hub-runtime.json`
- `backend-service.bat show`
- `http://127.0.0.1:8090/api/health`

Acciones:

```bat
backend-service.bat show
backend-service.bat set-url http://127.0.0.1:8090
backend-service.bat restart
```

## 2. El servicio no queda en RUNNING

Acciones:

```bat
backend-service.bat cleanup-orphans
backend-service.bat restart
backend-service.bat status
```

Si sigue fallando:

- revisar `logs/`
- revisar permisos de administrador
- validar que `pocketbase.exe` exista

## 3. La sesion parece recargarse o perderse

Revisar:

- consola del navegador
- runtime URL correcta
- `client/js/layout.js`

Pistas:

- un mismatch de backend URL puede parecer logout
- problemas de overscroll/pull-to-refresh pueden parecer recarga espontanea

## 4. PDF no abre o snapshot falla

Revisar:

- consola del navegador
- si el modal bloqueante aparece
- si el preview HTML se renderiza
- si el bucket `documentos` acepta upload

Puntos de codigo:

- `orders.js`
- `contracts.js`
- `receipts.js`

## 5. El PDF muestra `--` o `---` en Material/Ubicacion/Medidas

Revisar:

- `espacios_detalle` del registro
- catalogo `espacios`
- configuracion tenant en `configuracion`
- reglas actuales del tenant:
  - Plaza Mayor local/isla/espacio usan Ubicacion
  - Plaza Mayor publicidad usa Material

## 6. El expediente o pagos se siente inestable

Revisar:

- scroll encadenado en modales
- recarga por overscroll
- documentos almacenados y apertura blob

## 7. Casa de Piedra bloquea premontaje incorrectamente

Revisar:

- fechas de reserva
- fechas de premontaje
- si el bloqueo aplica a evento o montaje

## 8. El calendario ICS no funciona

Revisar:

- `CP_CALENDAR_ICS_URL`
- `CP_CALENDAR_ICS_TOKEN`
- hook `pb_hooks/30_cp_calendar_ics.pb.js`
- servicio y reachability del backend

## 9. Restore de emergencia

1. detener servicio
2. respaldar estado actual
3. restaurar backup
4. iniciar backend
5. validar health y login

Referencia:

- `backups/backend_full_20260311_183315/RESTORE.txt`

## 10. Checklist minimo antes de escalar

- tenant afectado identificado
- modulo afectado identificado
- backend URL confirmada
- health endpoint confirmado
- screenshot o log guardado
- ultimo cambio aplicado identificado

