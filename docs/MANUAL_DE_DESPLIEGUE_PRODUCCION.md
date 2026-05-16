# Manual de Despliegue para Producción

Este manual detalla el procedimiento oficial y recomendado para el despliegue a producción del sistema Cotizador (Plaza Mayor / Casa de Piedra). Siga estos pasos para asegurar que tanto el frontend como el backend queden configurados correctamente con acceso público y privado.

## 1. Prerrequisitos

- Un servidor (Windows Server u otro, según la arquitectura planeada) con acceso de red.
- La versión ejecutable de \`pocketbase.exe\` ubicada en la carpeta \`backend/\`.
- Scripts de despliegue ubicados en \`production/\`.
- Nginx o IIS (opcional, recomendado) si desea servir el frontend con un proxy de dominio/IP mismo-origen.

## 2. Preparación Inicial (Backend)

1. Abrir la terminal o PowerShell como Administrador.
2. Navegar a la carpeta raíz del repositorio del cotizador.
3. Configurar el puerto y la dirección IP pública o local donde correrá PocketBase:
   \`\`\`bat
   production\backend-service.bat set-bind 0.0.0.0:8090
   production\backend-service.bat set-url http://<IP_O_DOMINIO_DEL_BACKEND>:8090
   \`\`\`
   *(Nota: Reemplace `<IP_O_DOMINIO_DEL_BACKEND>` con la IP real que usarán los clientes para conectarse).*
4. Si va a servir el frontend por separado (ej. Nginx), desactive la carpeta pública integrada:
   \`\`\`bat
   production\backend-service.bat set-public-dir off
   \`\`\`

## 3. Preparación del Frontend y CORS

Debe informarle al backend desde dónde se cargarán los archivos del Frontend.

1. Configure el origen del frontend (donde vivirá el código HTML):
   \`\`\`bat
   production\backend-service.bat set-frontend-origin http://<IP_O_DOMINIO_DEL_FRONTEND>
   \`\`\`
2. Configure la URL del frontend para que el sistema sepa generar enlaces correctos:
   \`\`\`bat
   production\backend-service.bat set-frontend-url http://<IP_O_DOMINIO_DEL_BACKEND>:8090
   \`\`\`
   *(Nota: si usa Nginx como proxy inverso same-origin, \`set-frontend-url\` debe ser \`/\`).*
3. Ejecutar la sincronización para que genere los archivos de entorno (como \`env.js\` y \`hub-runtime.json\`):
   \`\`\`bat
   production\backend-service.bat sync-frontend
   \`\`\`

## 4. Instalación del Servicio en Windows

Para que el backend corra siempre al encender el servidor y no dependa de una ventana de consola abierta:

1. Ejecute el siguiente comando para instalar el servicio:
   \`\`\`bat
   production\backend-service.bat install
   \`\`\`
2. Inicie el servicio:
   \`\`\`bat
   production\backend-service.bat start
   \`\`\`
3. Verifique el estado:
   \`\`\`bat
   production\backend-service.bat status
   \`\`\`

Si necesita revisar logs o ver algún fallo, revise los archivos generados en \`backend/logs/\`.

## 5. Administrador y Clave Inicial

En la primera ejecución con una base de datos limpia (o vacía), necesita crear un usuario super administrador:

\`\`\`bat
backend\pocketbase.exe superuser upsert admin@midominio.com MiClaveSegura123 --dir=backend\pb_data
\`\`\`

Una vez hecho esto, entre a \`http://<IP_O_DOMINIO_DEL_BACKEND>:8090/_/\` desde un navegador para confirmar acceso.

## 6. Servir Frontend con Nginx (Recomendado)

En producción, el uso de Nginx para servir la carpeta \`frontend/client\` es el método más rápido y recomendado:

1. Ejecutar el preparador de Nginx:
   \`\`\`bat
   production\backend-service.bat prepare-nginx production\deploy\nginx-site <IP_O_DOMINIO_DEL_FRONTEND>
   \`\`\`
2. Configurar su Nginx para apuntar la raíz (o un bloque especial) al contenido estático recién generado en \`production\deploy\nginx-site\`.

## 7. Actualizaciones Continuas

Para aplicar una nueva versión o código al servidor:
1. Haga pull del repositorio.
2. Sincronice el frontend de nuevo (\`production\backend-service.bat sync-frontend\`).
3. Si cambió algo en las migraciones de PocketBase, simplemente reinicie el servicio (\`production\backend-service.bat restart\`) para que las migraciones se apliquen automáticamente.
