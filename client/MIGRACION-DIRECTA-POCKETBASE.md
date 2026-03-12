# Migracion Directa a PocketBase (Progreso Real)

Fecha de actualizacion: 2026-03-11

Objetivo: mover el frontend a servicios nativos de PocketBase sin cambiar diseno visual ni romper flujos actuales.

## Estado actual del plan

1. `cotizaciones` create/update:
- Corregido hook CP para no bloquear `pendiente` por traslape.
- Reglas PocketBase ajustadas en migracion `pb_migrations/1773300100_fix_rules_native_tenants.js`.
- Frontend PM/CP en `catalog.js` ya guarda cotizaciones con `PB_SERVICES.cotizaciones.create`.
- Frontend PM/CP en `orders.js` ya usa `PB_SERVICES.cotizaciones` para `list/update/delete`.

2. login + visibilidad por rol:
- `index.html` ya carga servicios nativos (`services/*`).
- Login y sesion en `index.html` usan `PB_SERVICES.auth` (nativo).
- Dashboard en `index.html` usa perfil de `app_users` (role + allowed_tenants).
- Muestra de modulos por tenant/rol ya no depende de tablas legacy cuando se usa auth nativa.

3. snapshots/documentos/expediente:
- Bucket CP unificado en `cotizadorcp/invoices.js` y `cotizadorcp/orders.js` a `documentos-cp`.
- Eliminacion de expediente en CP ya borra estructura principal + recibos del bucket correcto.

4. extraccion de compat layer:
- Nueva capa nativa `client/services/*` creada y activa en paginas criticas.
- Runtime global unificado en `client/services/pb-client.js` (PocketBase nativo).
- Todas las paginas HTML del cliente ya cargan `pb-client.js` y no cargan `supabase.js`.

## Arquitectura aplicada

- `services/pb-core.js`
  - Cliente HTTP PocketBase nativo.
  - Auth state en `pb_native_auth_v1` y compat espejo `pb_compat_auth_v1`.
  - Tenant por schema/path.

- `services/_shared.js`
  - CRUD reusable por coleccion.
  - Traduccion de payload/filtros legacy (`cliente_id -> cliente_legacy_id`, etc.).
  - Resolucion de `id` legacy -> `id` real PocketBase.
  - Autoasignacion de `legacy_id` al crear en colecciones legacy.
  - Mapeo de salida compatible (`id`, `_pb_id`, `imagen_url`, fechas normalizadas).

- `services/*.js`
  - Servicios por dominio (`auth`, `clientes`, `cotizaciones`, `documentos`, etc.).

- `services/pb-client.js`
  - Runtime PocketBase para modulos legacy con API de consulta usada por el frontend actual.
  - Expuesto como `window.PB_CLIENT`.
  - Sin dependencia operativa a `window.supabase`.

## Paginas ya cableadas con servicios nativos

- `index.html`
- `cotizador/catalog.html`
- `cotizador/cotizacion.html`
- `cotizador/orders.html`
- `cotizador/order_detail.html`
- `cotizadorcp/catalog.html`
- `cotizadorcp/cotizacion.html`
- `cotizadorcp/orders.html`
- `cotizadorcp/order_detail.html`

Nota: el cliente web ya no depende de `supabase.js` en HTML.

## Validacion recomendada (lote minimo)

1. Login admin, PM y CP desde `index.html`.
2. Confirmar visibilidad:
   - admin: dos cotizadores.
   - plaza_mayor: solo PM.
   - casa_de_piedra: solo CP.
3. Crear cotizacion en PM y CP.
4. Editar cotizacion existente en PM y CP.
5. Aprobar cotizacion y validar snapshot PDF + `url_cotizacion_final`.
6. Subir/borrar factura XML/PDF y validar expediente.
7. Eliminar cotizacion y confirmar limpieza de archivos.

## Siguiente lote sugerido (post-migracion)

1. Migrar `clientes.js` (PM/CP) a `PB_SERVICES.clientes` + `PB_SERVICES.cotizaciones`.
2. Migrar `invoices.js` y `contracts.js` a `PB_SERVICES.documentos` para eliminar dependencias de `storage.from(...)`.
3. Migrar `calendar.js` y `reports.js`.
4. Retirar archivos legacy `client/supabase.js` y `client/public/assets/libs/js/supabase.js` cuando se confirme estabilidad en produccion.
