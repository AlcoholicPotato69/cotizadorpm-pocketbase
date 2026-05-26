# Requisitos Tecnicos del Servidor

Ultima actualizacion: 2026-04-14

Este documento concentra los requisitos minimos y recomendados para montar la plataforma completa en un servidor Windows, considerando backend PocketBase, servicio Windows, frontend HTML estatico separado, almacenamiento de archivos y operacion interna de TI.

## 1. Alcance

La plataforma productiva se compone de:

- backend PocketBase
- base de datos SQLite de PocketBase
- servicio Windows para el backend
- frontend HTML/JS/CSS servido por fuera de PocketBase
- storage de documentos y evidencias
- respaldos operativos

## 2. Sistema operativo soportado

Minimo recomendado:

- Windows 10 Pro 64-bit o Windows Server 2019 64-bit

Recomendado para operacion institucional:

- Windows Server 2022 64-bit

Condiciones:

- PowerShell 5.1 o superior
- servicio `sc.exe` disponible
- permisos de administrador para instalar y reiniciar el servicio Windows
- reloj del sistema sincronizado correctamente

## 3. CPU, memoria y almacenamiento

Minimo funcional para entorno pequeno o piloto:

- 2 vCPU
- 4 GB RAM
- 40 GB libres en disco SSD

Recomendado para operacion normal:

- 4 vCPU
- 8 GB RAM
- 120 GB SSD

Recomendado si se guardaran muchas evidencias, facturas o PDFs historicos:

- 4 a 8 vCPU
- 16 GB RAM
- 250 GB SSD o mas

Notas:

- el rendimiento depende mas del disco que del CPU en cargas administrativas normales
- `backend/pb_data/` y los archivos del bucket `documentos` deben vivir en almacenamiento rapido y estable
- no se recomienda HDD mecanico para produccion

## 4. Red y puertos

Puertos habituales:

- backend PocketBase: `8090`
- frontend estatico: `80`, `443` o el puerto definido por TI

Escenarios soportados:

1. proxy same-origin
   frontend y backend se publican bajo el mismo host y el proxy reenvia `/api` y `/_/`
2. frontend separado
   el HTML se sirve desde otro host o puerto y apunta al backend configurado en runtime

Requisitos de red:

- IP fija o DNS estable para backend y frontend
- conectividad entre el servidor web estatico y el backend
- firewall permitiendo los puertos publicados
- si hay HTTPS, terminacion TLS en Nginx, IIS o reverse proxy equivalente

## 5. Estructura de despliegue esperada

Rutas clave del repo:

- backend ejecutable y datos: `backend/`
- servicio Windows y configuracion: `production/backend-service.bat`
- config local del servicio: `production/deploy/backend-service.local.conf`
- runtime frontend: `frontend/client/config/hub-runtime.json`
- runtime legacy/publico: `frontend/client/public/assets/libs/js/env.js`
- sitio estatico de referencia: `production/deploy/nginx-site/`

Regla importante:

- los archivos HTML no se deben servir desde PocketBase
- `PUBLIC_DIR=off` es la configuracion recomendada
- PocketBase queda para API, auth, dashboard y archivos protegidos

## 6. Software auxiliar recomendado

Dependencias operativas recomendadas:

- Nginx para servir el frontend estatico o hacer proxy same-origin
- 7-Zip o herramienta equivalente para respaldos
- antivirus con excepciones para la carpeta del proyecto si genera bloqueos de lock sobre SQLite
- programador de tareas de Windows para respaldos automáticos

Opcional:

- IIS si TI prefiere servir el HTML con stack Microsoft
- balanceador o reverse proxy institucional

## 7. Requisitos del navegador cliente

Minimo recomendado para usuarios finales:

- Microsoft Edge actual
- Google Chrome actual

No recomendado:

- Internet Explorer
- navegadores legados sin soporte moderno de `fetch`, `Promise`, `BroadcastChannel` o `URL`

## 8. Capacidad y crecimiento

Suposicion operativa razonable:

- decenas de usuarios internos
- cientos o miles de cotizaciones historicas
- carga concurrente baja o media

Cuando conviene escalar recursos:

- crecimiento sostenido de PDFs y evidencias
- multiples usuarios exportando documentos al mismo tiempo
- uso intensivo del modulo publico y del dashboard administrativo
- respaldos lentos o saturacion de disco

Indicadores de ajuste:

- `pb_data` creciendo rapido
- tiempos altos de apertura de dashboard
- latencia en exportacion PDF
- bloqueos frecuentes de archivos SQLite

## 9. Requisitos de respaldo

TI debe respaldar como minimo:

- `backend/pb_data/`
- `production/deploy/backend-service.local.conf`
- `frontend/client/config/hub-runtime.json`
- `frontend/client/public/assets/libs/js/env.js`
- carpeta estatica publicada del frontend

Frecuencia sugerida:

- respaldo diario incremental
- respaldo completo semanal
- retencion minima de 30 dias

Buenas practicas:

- no respaldar con PocketBase escribiendo archivos criticos sin validar integridad
- si se hace respaldo en caliente, verificar restauracion en ambiente de prueba
- documentar ruta exacta de publicacion del frontend y del backend

## 10. Seguridad minima del host

Controles minimos:

- usuario administrador fuerte y resguardado
- acceso RDP restringido a red institucional o VPN
- firewall activo
- TLS si el sistema se expone fuera de LAN
- backups probados
- antivirus sin cuarentenar `pocketbase.exe`, `pb_data` ni la carpeta de despliegue

Controles recomendados:

- cuenta de servicio dedicada para backend
- bitacora de cambios de IP, puertos y certificados
- monitoreo del espacio libre en disco
- monitoreo de expiracion de certificados

## 11. Validacion previa a salida productiva

Checklist minimo:

- `production/backend-service.bat show`
- `production/backend-service.bat status`
- `production/levantar-todo.bat`
- `http://HOST/api/health`
- `http://HOST/_/`
- login correcto desde `client/index.html`
- expiracion de sesion redirige al login
- exportacion de cotizacion PDF
- exportacion de carta convenio sin montos
- apertura de documentos guardados

## 12. Recomendacion de dimensionamiento

Si el servidor sera solo para esta plataforma:

- 4 vCPU
- 8 GB RAM
- 120 GB SSD
- Windows Server 2022
- Nginx o IIS para frontend estatico

Si compartira otros servicios institucionales:

- separar por lo menos almacenamiento y monitoreo
- reservar CPU/RAM para evitar degradacion del backend SQLite

## 13. Referencias internas

- `README.md`
- `docs/30-despliegue-y-servicio-windows.md`
- `docs/15-seguridad-y-validaciones.md`
- `docs/60-pdfs-y-documentos.md`
- `production/README.md`
