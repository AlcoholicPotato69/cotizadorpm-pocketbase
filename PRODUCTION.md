# Guía de Despliegue en Producción (Cotizador PM & CP)

Esta guía detalla el proceso recomendado para desplegar el proyecto "Cotizador Plaza Mayor & Casa de Piedra" en un entorno de producción profesional, evitando el uso de direcciones IP locales hardcodeadas y adoptando prácticas de despliegue con proxies inversos.

## 1. Arquitectura Recomendada

El sistema se compone de dos partes principales que deben servirse de manera independiente:
1. **Frontend (Archivos Estáticos):** Se recomienda usar **Nginx** o **Apache** para servir la carpeta `/frontend`.
2. **Backend (PocketBase):** Se ejecutará como un servicio independiente y será accesible a través de un proxy inverso.

### Estructura de Dominio (Ejemplo)
- Frontend: `https://cotizador.tudominio.com`
- Backend / API: `https://api.cotizador.tudominio.com` (o bajo un path como `https://cotizador.tudominio.com/api/`)

## 2. Preparar el Frontend (Archivos Estáticos)

El aspecto más crítico para el paso a producción es actualizar el archivo `frontend/client/hub_config.js` para que apunte a tu dominio de producción, no a un "127.0.0.1" o una IP de red local genérica.

**Archivo a Modificar:** `frontend/client/hub_config.js`

```javascript
window.HUB_CONFIG = {
    // CAMBIA ESTO por tu dominio de producción. 
    // Ejemplo si usas un subdominio para la API:
    pocketbaseUrl: 'https://api.cotizador.tudominio.com',
    
    // Si la API se sirve en el mismo dominio bajo la ruta /api/, sería:
    // pocketbaseUrl: 'https://cotizador.tudominio.com/api',
    
    pocketbaseAnonKey: '', 
    finanzasSchema: 'finanzas'
};
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
        root /ruta/absoluta/a/tu/proyecto/frontend;
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
