# Guía de Despliegue en Producción (Cotizador PM & CP)

Esta guía detalla el proceso recomendado para desplegar el proyecto "Cotizador Plaza Mayor & Casa de Piedra" en un entorno de producción profesional, evitando el uso de direcciones IP locales hardcodeadas y adoptando prácticas de despliegue con proxies inversos.

## 1. Arquitectura Unificada (PocketBase)

El sistema ahora está diseñado para que **PocketBase sirva directamente tanto el Backend como el Frontend**, simplificando el despliegue a un solo proceso y un solo puerto.
1. **Frontend y Backend Unificados:** El servicio de PocketBase sirve los archivos estáticos en la raíz `/` y la API en `/api/` o `/_/`.
2. **Nginx Opcional:** Si se utiliza Nginx o Apache, actuará únicamente como Reverse Proxy (proxy inverso) redirigiendo todo el tráfico al puerto de PocketBase.

### Estructura de Dominio (Ejemplo)
- Sistema unificado: `https://cotizador.tudominio.com` (API en `/api/`, Dashboard en `/_/`)

## 2. Preparar el Sistema en Producción

Para configurar y levantar todo el entorno, ejecuta:

```bat
production\levantar-todo.bat
```

Ese script:

- pide la IP o dominio del servidor y el puerto de PocketBase
- actualiza `BIND_ADDR`, `BACKEND_URL`, y configura el frontend same-origin (`/`)
- activa `PUBLIC_DIR=pb_public` para que PocketBase sirva el Frontend
- actualiza automáticamente `frontend/client/config/hub-runtime.json` y `env.js`
- genera la plantilla opcional `production/deploy/nginx/cotizador-production.conf` por si usas proxy inverso

Si necesitas rehacer solo la parte del frontend/Nginx:

```bat
production\backend-service.bat set-frontend-url /
production\backend-service.bat sync-frontend
production\backend-service.bat prepare-nginx
```

## 3. Configuración de Nginx (Proxy Inverso y Archivos Estáticos)

Para un despliegue seguro, recomendamos el uso de Nginx. A continuación se presenta un bloque de configuración de ejemplo para manejar tanto los archivos estáticos del Frontend como hacer proxy al PocketBase.

### Ejemplo de configuración `nginx.conf`:

```nginx
server {
    listen 80;
    server_name cotizador.tudominio.com;

    # 1. Servir Frontend (Archivos Estáticos)
    location / {
        root /ruta/absoluta/a/tu/proyecto/production/deploy/nginx-site;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. Proxy Inverso para PocketBase (Backend)
    # Suponiendo que PocketBase corre en el puerto 8090 internamente
    location /api/ {
        proxy_pass http://127.0.0.1:8090/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 3. Proxy para acceder al panel de administración de PocketBase (Opcional pero útil)
    location /_ {
        proxy_pass http://127.0.0.1:8090/_/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

*Nota: Asegúrate de configurar certificados SSL (Let's Encrypt / Certbot) después de habilitar este bloque de servidor.*

## 4. Servicio PocketBase (Systemd)

No debes ejecutar PocketBase manualmente o mediante comandos temporales en producción. Debes crear un servicio de sistema (Systemd) para que PocketBase inicie con el sistema y se recupere automáticamente de fallos.

1. **Crear archivo de servicio**: `sudo nano /lib/systemd/system/pocketbase.service`
2. **Contenido**:
```ini
[Unit]
Description = pocketbase

[Service]
Type           = simple
User           = www-data
Group          = www-data
LimitNOFILE    = 4096
Restart        = always
RestartSec     = 5s
StandardOutput = append:/var/log/pocketbase.log
StandardError  = append:/var/log/pocketbase_error.log
ExecStart      = /ruta/absoluta/a/tu/pocketbase/pocketbase serve --http=127.0.0.1:8090

[Install]
WantedBy = multi-user.target
```
3. **Activar servicio**:
```bash
sudo systemctl enable pocketbase.service
sudo systemctl start pocketbase
```

## 5. Actualizaciones de Esquemas (PocketBase)

Asegúrate de haber migrado tu base de datos de PocketBase de desarrollo a producción.
Especialmente, debes validar que la colección `cotizaciones` de producción tenga los siguientes campos (Type: Date):
- `fecha_orden_compra`
- `fecha_contrato`
- `fecha_factura`

Estos metadatos son fundamentales para el sistema de auditoría de documentos y el Expediente del cliente.
