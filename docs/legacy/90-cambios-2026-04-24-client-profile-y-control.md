# Cambios 2026-04-24: client_profile, cotizacion rapida y control

Ultima actualizacion: 2026-04-24

## 1. Resumen ejecutivo

Este mantenimiento cierra tres problemas operativos:

1. la cotizacion rapida de Casa de Piedra en `catalog.js` podia guardarse sin `cliente_id`
2. la constancia de situacion fiscal no estaba sincronizando de forma confiable RFC y razon social al perfil publico
3. `Control Operativo` mostraba demasiada carga visual y no tenia paginacion local en clientes ni ordenes

Correccion complementaria aplicada el mismo dia:

4. el hook `backend/pb_hooks/10_cotizaciones.pb.js` seguia bloqueando la creacion de cotizaciones rapidas si el perfil quedaba en `pendiente_expediente`
5. la aprobacion de una cotizacion rapida todavia podia intentarse aunque el perfil del cliente siguiera incompleto
6. un hotfix posterior corrigio un `ReferenceError` en el hook de cotizaciones que dejaba al perfil rapido creado pero no alcanzaba a persistir la cotizacion
7. el parser de constancia fiscal se ajusto para no tomar etiquetas partidas como `social` o `NombreComercial` en lugar de la razon social real

## 2. Archivos tocados

Backend:

- `backend/pb_hooks/10_cotizaciones.pb.js`
- `backend/pb_hooks/client_profile_shared.js`

Frontend:

- `frontend/client/cotizador/control.html`
- `frontend/client/cotizador/control.js`
- `frontend/client/cotizador/orders.js`
- `frontend/client/cotizadorcp/catalog.js`
- `frontend/client/cotizadorcp/control.html`
- `frontend/client/cotizadorcp/orders.js`
- `frontend/client/public/perfil_cliente.html`

Espejos sincronizados:

- `frontend/pb_public/client/cotizador/control.html`
- `frontend/pb_public/client/cotizador/control.js`
- `frontend/pb_public/client/cotizador/orders.js`
- `frontend/pb_public/client/cotizadorcp/catalog.js`
- `frontend/pb_public/client/cotizadorcp/control.html`
- `frontend/pb_public/client/cotizadorcp/control.js`
- `frontend/pb_public/client/cotizadorcp/orders.js`
- `frontend/pb_public/client/public/perfil_cliente.html`

Documentacion actualizada:

- `docs/README docs.md`
- `docs/15-seguridad-y-validaciones.md`
- `docs/50-modulos-y-flujos-de-negocio.md`
- `docs/70-troubleshooting-y-runbooks.md`
- `docs/85-catalogo-de-funciones-y-puntos-de-extension.md`

## 3. Cotizacion rapida en `frontend/client/cotizadorcp/catalog.js`

Situacion anterior:

- el flujo viejo del catalogo CP permitia captura manual del cliente
- si no existia `cliente_id`, la cotizacion podia guardarse sin perfil asociado

Comportamiento nuevo:

- `buildCpCatalogQuoteClientSnapshot` arma el snapshot del cliente desde perfil listo o captura manual
- `findCpCatalogExistingClientProfile` intenta reutilizar un perfil ya conocido por nombre, correo o RFC
- `createCpCatalogQuickQuoteClientProfile` crea un perfil `pendiente_expediente` cuando no existe uno utilizable
- `resolveCpCatalogQuoteClientId` se ejecuta antes de insertar la cotizacion y garantiza un `cliente_id`

Resultado esperado:

- si el usuario escribe manualmente un cliente nuevo, se crea el perfil pendiente y luego la cotizacion
- si el cliente ya existia, la cotizacion reutiliza ese perfil
- el hook de `cotizaciones` permite guardar la cotizacion cuando el perfil tiene `perfil_origen = cotizacion_rapida`
- la validacion de aprobacion usa helpers locales dentro de create/update para evitar errores de alcance en PocketBase JSVM
- la validacion estricta de expediente sigue vigente para perfiles normales y para generacion de contrato
- la cotizacion puede quedar `pendiente`, pero no puede pasar a `aprobada` hasta que el cliente quede listo para cotizar

## 4. `client_profile`: constancia fiscal y seguridad documental

### 4.1. Sincronizacion de RFC y razon social

Situacion anterior:

- el portal publico ya extraia RFC y fecha de la constancia
- el submit no enviaba de forma consistente RFC ni razon social al backend

Comportamiento nuevo:

- `validateConstanciaFiscal` ahora detecta la razon social priorizando la linea real del SAT y no las etiquetas partidas
- el parser contempla estos escenarios:
  - nombre arriba de `Nombre, denominacion o razon social`
  - etiqueta partida en varias lineas
  - fallback con `Nombre(s)`, `PrimerApellido` y `Segundo Apellido`
- `handleFileChange` actualiza `state.profile.nombreCompleto` y `state.profile.rfc`
- `submitProfile` envia `nombre_completo` y `rfc`
- `handlePublicClientProfileComplete` en backend actualiza el perfil cuando la constancia viene en el mismo submit

Resultado esperado:

- perfiles creados desde cotizacion rapida pueden corregirse automaticamente al subir la constancia
- la razon social deja de llenarse con fragmentos como `social` o `NombreComercial`
- el expediente queda alineado con la informacion fiscal del documento

### 4.2. Rechazo por Windows Defender

Situacion anterior:

- el backend bloqueaba el archivo, pero el mensaje era ambiguo y la UI no marcaba claramente el documento rechazado

Comportamiento nuevo:

- `scanBytesInQuarantine` devuelve el mensaje:
  - `El archivo de <documento> no paso la seguridad del sistema. Intenta de nuevo con otro archivo.`
- `applyServerDocumentUploadError` detecta el documento afectado en el portal publico
- la tarjeta del documento queda marcada en error y el archivo pendiente se limpia

Resultado esperado:

- el usuario sabe que el problema fue de seguridad del sistema
- el flujo obliga a seleccionar un archivo distinto

## 5. `Control Operativo`

Archivos:

- `frontend/client/cotizador/control.html`
- `frontend/client/cotizador/control.js`
- `frontend/client/cotizadorcp/control.html`
- `frontend/client/cotizadorcp/control.js`

Cambios visuales:

- el `h1` principal se redujo para que el header no domine la pantalla
- se elimino la tarjeta lateral `Carga eficiente`
- el campo `Buscar` subio al inicio del panel de filtros

Cambios funcionales:

- clientes: selector de 5 o 10 filas por pagina
- ordenes y responsables: selector de 5 o 10 filas por pagina
- ambos resumenes tienen `Anterior` y `Siguiente`
- la bitacora de movimientos conserva su paginacion server-side independiente

Funciones nuevas o reforzadas:

- `normalizeSummaryPageSize`
- `buildSummaryPaginationMeta`
- `updateSummaryPaginationUi`
- `goToSummaryPage`
- `renderClientsTable`
- `renderOrdersTable`

## 6. Notas de mantenimiento

- cuando se toque `frontend/client/...`, mantener sincronizados los archivos espejo en `frontend/pb_public/client/...`
- la paginacion de clientes/ordenes es local; no sustituye la paginacion server-side de movimientos
- cualquier cambio al mensaje de Windows Defender debe mantenerse alineado con el parser de errores del portal publico
- si PocketBase esta corriendo durante cambios de hooks, reiniciarlo manualmente; no recarga `pb_hooks` en caliente
- si se agrega un nuevo documento obligatorio al expediente, actualizar tambien:
  - validadores del portal publico
  - parser de errores por documento
  - documentacion en `docs/15`, `docs/50` y `docs/85`

## 7. Pruebas ejecutadas el 2026-04-24

- prueba API autenticada con usuario temporal:
  - crea perfil `clientes` con `perfil_origen = cotizacion_rapida`
  - crea cotizacion `cotizaciones` en tenant `casa_de_piedra`
  - resultado: cotizacion creada en `pendiente` y persistiendo `cliente_id`
- prueba de extraccion de razon social:
  - caso real con texto extraido de `backend/pb_data/storage/.../csf_pavj011113_pb6_uly765a3ug.pdf`
  - caso sintetico con razon social empresarial
  - resultado: `extractConstanciaBusinessName` devolvio el nombre correcto en ambos casos
