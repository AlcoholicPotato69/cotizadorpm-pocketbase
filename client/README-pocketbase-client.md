# Cliente adaptado a PocketBase (compat layer)

Este paquete conserva el frontend actual y reemplaza la librería `supabase.js` por una capa de compatibilidad que habla con PocketBase.

## Qué cambia
- `client/supabase.js` y `client/public/assets/libs/js/supabase.js` ya no son el SDK de Supabase.
- Ahora exponen `window.supabase.createClient(...)`, pero por debajo llaman a PocketBase.
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

## Cómo probar
1. Levanta PocketBase:
   - `./pocketbase serve --http=127.0.0.1:8090`
2. Sirve esta carpeta con un servidor estático.
3. Entra por `index.html`.
4. Inicia sesión con un usuario de `app_users`.

## Recomendación
Usa este paquete como paso intermedio para validar login, catálogos, clientes, cotizaciones y reportes. Luego conviene hacer una segunda pasada para:
- mover imágenes de espacios a una estrategia pública definitiva
- sustituir el no-op de realtime por SSE nativo de PocketBase si lo necesitas
- reemplazar `hub_notifications` por una colección real si la vas a conservar
