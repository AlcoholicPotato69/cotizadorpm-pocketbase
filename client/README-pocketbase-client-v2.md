# Cliente PocketBase: compat + servicios nativos (v2)

Este proyecto ya opera con runtime PocketBase nativo:

1. `services/pb-client.js`: runtime global (`window.PB_CLIENT`) para modulos legacy.
2. `services/*`: servicios por dominio con acceso directo a PocketBase.

## Que agrega v2

- `services/_shared.js` ahora:
  - Resuelve `id` legacy contra `legacy_id` real de PocketBase.
  - Traduce payloads/filtros legacy (ej. `cliente_id` -> `cliente_legacy_id`).
  - Asigna `legacy_id` automaticamente en creates de colecciones legacy.
  - Mapea salida compatible (`id`, `_pb_id`, `imagen_url`, fechas).

- `index.html` ya usa auth nativa (`PB_SERVICES.auth`).
- `catalog.js` PM/CP ya crea cotizaciones por servicio nativo.
- `orders.js` PM/CP ya usa servicio nativo para list/update/delete de cotizaciones.
- Todas las paginas HTML del cliente ya cargan `pb-client.js` en lugar de `supabase.js`.

## Carga recomendada de scripts

Primero `hub-config`, luego runtime/servicios PocketBase:

- `services/pb-client.js`
- `services/pb-core.js`
- `services/_shared.js`
- `services/auth.js`
- `services/clientes.js`
- `services/conceptos.js`
- `services/configuracion.js`
- `services/impuestos.js`
- `services/espacios.js`
- `services/cotizaciones.js`
- `services/documentos.js`

## Notas operativas

- Los archivos historicos de Supabase no se migran automaticamente.
- Los logos siguen en `js/hub-config.js`.
- Los archivos `client/supabase.js` y `client/public/assets/libs/js/supabase.js` quedan solo como legado hasta cierre final.
