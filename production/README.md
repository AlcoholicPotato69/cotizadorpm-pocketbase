# Production

Herramientas para instalar y operar el backend y el frontend en producción o entornos internos.

## Contenido

- `backend-service.bat`
  administra el servicio Windows.
- `levantar-todo.bat`
  reparación y arranque rápido del entorno local/interno.
- `deploy/`
  runner, service host, HTTPS local y utilidades de despliegue.

## Configuración

Archivo principal:

- `deploy/backend-service.local.conf`

## Comandos típicos

```bat
production\backend-service.bat show
production\backend-service.bat install
production\backend-service.bat start
production\backend-service.bat restart
```
