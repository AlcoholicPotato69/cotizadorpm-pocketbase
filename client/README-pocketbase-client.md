# Cliente adaptado a PocketBase (runtime nativo)

Este paquete conserva el frontend actual y usa PocketBase como backend real en todas las pantallas.

## Qué cambia
- `client/services/pb-client.js` es el runtime global (`window.PB_CLIENT`) para módulos legacy.
- Las páginas HTML del cliente cargan únicamente `pb-client.js` para runtime de datos.
- `profiles` se resuelve contra `app_users`.
- Los esquemas `finanzas` y `finanzas_casadepiedra` se convierten a `tenant = plaza_mayor` y `tenant = casa_de_piedra`.
- Los IDs que el frontend sigue viendo como `id` se resuelven a `legacy_id` en PocketBase para no romper la UI actual.

## Qué sí queda protegido en backend
- auth y sesión por `app_users`
- API Rules por colección
- validaciones de negocio en hooks (`cotizaciones`)
- archivos protegidos en `documentos`

## Qué sigue siendo una compatibilidad y no un clon 1:1
- realtime se deja como no-op en el cliente actual
- `hub_notifications` se guarda en `localStorage` del navegador
- las imágenes nuevas subidas a `Espacios` siguen requiriendo una estrategia final de media pública si quieres que queden públicas para visitantes externos sin sesión

## Configuración
En `js/hub-config.js` ya quedó apuntando a:
- `http://127.0.0.1:8090`

## Administración de documentos (system/users1.html)
- La vista de configuración ahora administra por tenant:
  - `Plantillas de contrato` (bucket `documentos` o `documentos-cp`, ruta `templates_contratos/`)
  - `Membretes PDF` (bucket `documentos` o `documentos-cp`, ruta `membretes_pdf/`)
- Claves en colección `configuracion`:
  - `contract_template_default` -> plantilla activa para `contracts.html`
  - `pdf_letterhead_path` -> membrete activo para generadores PDF (cotizaciones/órdenes/recibos)
- `Impuestos` se gestionan desde la misma vista para ambos tenants (PM y CP).

## Cómo probar
1. Levanta PocketBase:
   - `./pocketbase serve --http=127.0.0.1:8090`
2. Sirve esta carpeta con un servidor estático.
3. Entra por `index.html`.
4. Inicia sesión con un usuario de `app_users`.

## Recomendación
Usa este paquete para validar login, catálogos, clientes, cotizaciones y reportes. Como cierre final conviene:
- mover imágenes de espacios a una estrategia pública definitiva
- sustituir el no-op de realtime por SSE nativo de PocketBase si lo necesitas
- reemplazar `hub_notifications` por una colección real si la vas a conservar
- mantener únicamente `client/services/pb-client.js` como runtime activo
