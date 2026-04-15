# Auditoria Tecnica y Checklist

Ultima actualizacion: 2026-04-13

Este documento consolida la auditoria tecnica ejecutada sobre el repositorio y deja un checklist reproducible para el area de TI.

## 1. Alcance auditado

Se reviso:

- frontend administrativo PM y CP
- frontend publico PM y CP
- cliente PocketBase y servicios de auth/seguridad
- hooks PocketBase
- migraciones PocketBase
- base viva SQLite en modo read-only
- documentacion vigente

## 2. Validaciones ejecutadas

Validacion de sintaxis:

- `node --check frontend/client/cotizador/catalog.js`
- `node --check frontend/client/cotizador/orders.js`
- `node --check frontend/client/cotizadorcp/cotizacion.js`
- `node --check frontend/client/cotizadorcp/orders.js`
- `node --check frontend/client/services/pb-core.js`
- `node --check frontend/client/services/auth.js`
- `node --check frontend/client/services/security.js`
- `node --check backend/pb_hooks/00_lib.pb.js`
- `node --check backend/pb_hooks/10_cotizaciones.pb.js`
- `node --check backend/pb_hooks/20_auth_session.pb.js`
- `node --check backend/pb_hooks/31_public_availability.pb.js`

Validacion integral reproducible:

- `powershell -NoProfile -ExecutionPolicy Bypass -File development/audit-smoke.ps1`

Cobertura del script:

- archivos criticos
- sintaxis JS
- arranque limpio de PocketBase con migraciones
- lectura read-only de la base viva

## 3. Resultado global

Estado al cierre de la auditoria:

- sintaxis de archivos criticos: OK
- arranque limpio de PocketBase: OK
- auditoria smoke: OK
- documentacion canonica: actualizada

## 4. Hallazgos corregidos

### 4.1 Convenios PM/CP

Problema:

- varios flujos guardaban `bloqueo_indefinido = true` de forma fija aunque el detalle no necesariamente bloqueaba indefinidamente

Impacto:

- deuda de auditoria
- metadata inconsistente entre encabezado y detalle

Correccion:

- el valor ahora se deriva del detalle real del convenio

Archivos:

- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/cotizadorcp/orders.js`
- `frontend/client/cotizador/catalog.js`
- `frontend/client/cotizador/orders.js`

### 4.2 Arranque limpio roto por migracion

Problema:

- una migracion PM creaba registros con `new Record("espacios", ...)`
- con la version actual de PocketBase eso rompia el arranque de un clon limpio

Impacto:

- un repositorio nuevo no podia inicializarse solo con migraciones

Correccion:

- se uso la coleccion correcta para `new Record(collection)`

Archivo:

- `backend/pb_migrations/1790000000_update_pm_catalog_pedro_2026.js`

### 4.3 Tipo inconsistente en seed PM

Problema:

- el seed guardaba `tipo = publicitario`
- el frontend y el catalogo operan con `publicidad`

Impacto:

- riesgo de catalogos mal clasificados en instalaciones limpias

Correccion:

- se homologo el tipo a `publicidad`

Archivos:

- `backend/pb_migrations/1790000000_update_pm_catalog_pedro_2026.js`
- `backend/pb_migrations/1790000001_update_pm_catalog_plaza_mayor_pdf_2026.js`

### 4.4 Documentacion desactualizada

Problema:

- la documentacion seguia referenciando `frontend/client/system/users1.html`
- el README apuntaba a `docs/README.md` cuando el archivo real es `docs/README docs.md`

Correccion:

- se actualizo la documentacion canónica y los enlaces internos

### 4.5 Vigencia de convenios y fecha de termino

Problema:

- cotizaciones normales o convenios con `fecha_fin` real podian mostrarse como `Indefinido`

Correccion:

- se agregaron guardas de fecha fin real en PM y CP
- `2099-12-31` queda como unico sentinel tecnico de indefinido

Archivos:

- `frontend/client/cotizador/orders.js`
- `frontend/client/cotizador/catalog.js`
- `frontend/client/cotizadorcp/orders.js`
- `frontend/client/cotizadorcp/cotizacion.js`

### 4.6 Produccion con HTML separado

Problema:

- la documentacion y scripts todavia permitian interpretar que PocketBase debia publicar los HTML

Correccion:

- `backend-service.bat` agrega `set-public-dir off` y `set-frontend-origin`
- `run-pocketbase-service.ps1` ya no agrega `--publicDir` cuando `PUBLIC_DIR` esta apagado
- `levantar-todo.bat` pide backend y frontend, configura CORS, prepara Nginx y desactiva `PUBLIC_DIR`

### 4.7 PDF y UI administrativa

Correccion:

- cartas convenio PM/CP no imprimen montos ni resumen financiero
- editor PDF muestra modal `Etiquetas {{}}`
- CP publicidad en `orders_detail` muestra resumen tipo Plaza Mayor
- modal de materiales CP usa `<select>` real

## 5. Hallazgos abiertos en datos historicos

Resultado del barrido read-only del 2026-04-13:

- `space_details_without_type`: 1 caso
- `convenio_meta_without_detail_flag`: 1 caso

Interpretacion:

- no bloquean el flujo vigente
- si deben registrarse como deuda historica ante una auditoria TI

## 6. Resumen de datos auditados

Espacios por tenant/tipo:

- Casa de Piedra: `espacio=4`, `publicidad=2`
- Plaza Mayor: `publicidad=30`

Cotizaciones por tenant/status:

- Casa de Piedra: `aprobada=1`, `pendiente=1`
- Plaza Mayor: `aprobada=1`, `pendiente=1`

Configuraciones CP presentes:

- `contract_template_default`
- `convenios_cp`
- `hora_extra_cfg`
- `materiales_cp`
- `pdf_letterhead_path`
- `pdf_typography_style`
- `premontaje_pct`

## 7. Checklist para TI antes de liberar o auditar

1. Ejecutar `development/audit-smoke.ps1`.
2. Confirmar que el cold start siga en estado OK.
3. Confirmar que `backend/pb_data/` tenga respaldo antes de cualquier cambio estructural.
4. Validar login administrativo y acceso a ambos tenants.
5. Validar que Plaza Mayor cargue catalogo y ordenes.
6. Validar que Casa de Piedra cargue `espacio` y `publicidad`.
7. Validar que la pagina publica PM cree una cotizacion `pendiente`.
8. Validar que la pagina publica CP cree una cotizacion `pendiente`.
9. Confirmar preview/generacion de documentos en al menos una orden por tenant.
10. Registrar si los hallazgos historicos fueron saneados o siguen aceptados como deuda.
11. Confirmar que cartas convenio PM/CP no muestren importes ni resumen financiero.
12. Confirmar que convenios con `fecha_fin` real no aparezcan como `Indefinido`.
13. Confirmar que `production\backend-service.bat show` tenga `PUBLIC_DIR=` o apagado cuando el frontend se sirve por separado.
14. Confirmar que `CORS_ALLOWED_ORIGINS` incluya el origen real del frontend HTML si no hay mismo origen.

## 8. Checklist para saneamiento historico

1. Revisar la cotizacion historica con `espacios_detalle` sin `tipo`.
2. Revisar la cotizacion historica con metadata de convenio inconsistente.
3. Confirmar que no reaparezcan casos `cp_root_space_without_catalog_record`.
4. Corregir historico solo con respaldo previo de `backend/pb_data/`.
5. Repetir `development/audit-smoke.ps1` despues del saneamiento.

## 9. Limitaciones de la auditoria ejecutada

La auditoria actual no incluyo:

- suite automatizada de navegador end-to-end
- pruebas de carga
- escaneo SAST externo
- escaneo DAST contra un ambiente publicado

Conclusión:

- el repositorio queda validado a nivel estructural, logico y de arranque
- aun conviene incorporar pruebas E2E si TI requiere evidencia automatizada de interfaz
