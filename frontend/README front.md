# Frontend

Aquí vive todo lo necesario para la interfaz del cotizador.

## Estructura

- `client/`
  HTML, JS y configuración del sistema (canónico para desarrollo y despliegue).
- `assets/`
  librerías, imágenes, fuentes, sonidos y plantillas.

## Desarrollo local

PocketBase sirve el frontend junto con la API:

```bat
development\dev-start.bat
```

URL esperada:

- `http://127.0.0.1:8090/client/index.html`

## Configuración

Runtime principal:

- `client/config/hub-runtime.json`

Resolución de entorno y backend:

- `client/js/hub-config.js`

Legacy / páginas públicas:

- `client/public/assets/libs/js/env.js`
