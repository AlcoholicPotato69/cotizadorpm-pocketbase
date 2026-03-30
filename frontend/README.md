# Frontend

Aquí vive todo lo necesario para la interfaz del cotizador.

## Estructura

- `client/`
  HTML, JS y configuración del sistema.
- `assets/`
  librerías, imágenes, fuentes, sonidos y plantillas.
- `pb_public/`
  carpeta pública mínima para cuando PocketBase sirve el frontend en producción.

## Desarrollo local

```bat
development\frontend-dev-start.bat
```

URL esperada:

- `http://127.0.0.1:8080/client/index.html`

## Configuración

Runtime principal:

- `client/config/hub-runtime.json`

Resolución de entorno y backend:

- `client/js/hub-config.js`
