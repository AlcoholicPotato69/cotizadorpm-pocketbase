# Troubleshooting y Runbooks

Ultima actualizacion: 2026-03-28

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
