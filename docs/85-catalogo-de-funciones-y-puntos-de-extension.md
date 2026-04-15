# Catalogo de Funciones y Puntos de Extension

Ultima actualizacion: 2026-04-13

Este documento resume las funciones criticas que TI debe conocer para auditar, corregir o extender el sistema sin romper la logica de cotizacion, convenio y documentos.

## 1. Regla canonica de mantenimiento

Antes de modificar convenios, `order_detail` o PDFs:

- validar la categoria real del espacio en `espacios.tipo`
- respetar `espacios.permite_convenio`
- no mezclar `publicidad` con `espacio` en una misma cotizacion
- mantener sincronizados `frontend/client/...` y `frontend/pb_public/client/...`
- ejecutar `node --check` sobre los archivos tocados
- correr `development/audit-smoke.ps1` antes de cerrar una auditoria

## 2. Plaza Mayor: convenio y selector en `orders.js`

Archivo:

- `frontend/client/cotizador/orders.js`

Funciones y responsabilidades:

| Funcion | Responsabilidad | Nota de mantenimiento |
| --- | --- | --- |
| `__pmNormalizeSpaceConvenioFlag` | normaliza valores booleanos de `permite_convenio` | usar `fallback = false` en reglas nuevas para no habilitar convenios por omision |
| `__pmSpaceAllowsConvenio` | define si un espacio puede participar en convenio | desde 2026-04-13 exige categoria `publicidad` y `permite_convenio = true` |
| `__pmParseConvenioMeta` | lee `detalles_evento.convenio` y devuelve una estructura segura | aqui se centraliza `activo`, `items`, `espacios` y `evidencias` |
| `__pmIsConvenioOrder` | detecta si la cotizacion/orden opera como convenio | revisa metadata y `espacios_detalle` |
| `__pmHasFiniteConvenioEndDate` | detecta si existe fecha fin real | evita mostrar `Indefinido` cuando la cotizacion tiene vigencia capturada |
| `__pmBuildPdfTemplateContext` | arma valores para etiquetas `{{...}}` en PDF | soporta cliente, folio, vigencia, sede y usuario actual |
| `window.openPdfTemplateTagsModal` | muestra el catalogo de etiquetas PDF | se accede desde el boton `Etiquetas {{}}` del editor PDF |
| `window.getOrderHTML` | construye el HTML base del PDF | la rama `isConvenio && !isOrder` genera la carta convenio y no debe imprimir montos |
| `canDisplayPmEditorSpace` | filtra el catalogo visible en `order_detail` | en convenio oculta cualquier espacio no elegible |
| `canAddPmEditorSpace` | valida el alta de un espacio desde la UI | muestra toast si el espacio no aplica para convenio |
| `listPmEditorSpaces` | fuente unica del catalogo visible para las tarjetas | evita que la UI muestre un espacio que luego no se pueda agregar |
| `window.renderOrderSpaceCards` | renderiza las tarjetas de espacios del editor | soporta multi-seleccion; en convenio solo lista espacios elegibles |
| `window.toggleOrderSpaceSwitch` | agrega o quita espacios activos en la cotizacion | no debe romper la regla de multi-espacio dentro de la misma categoria |

Regla especial:

- la carta convenio PDF solo muestra `publicidad acordada`, `vigencia`, `contraprestacion` y responsabilidades
- no debe renderizar `precio_base`, `subtotal`, `monto`, `balance` ni resumen economico

## 3. Casa de Piedra: convenio y selector en `orders.js`

Archivo:

- `frontend/client/cotizadorcp/orders.js`

Funciones y responsabilidades:

| Funcion | Responsabilidad | Nota de mantenimiento |
| --- | --- | --- |
| `__orderBuildConvenioPayloadItems` | arma la lista de contraprestaciones de convenio | toma conceptos y los convierte al payload documental |
| `__orderParseConvenioMeta` | lee `detalles_evento.convenio` en CP | unifica flags, items, evidencias y espacios asociados |
| `__orderSpaceAllowsConvenio` | define si un espacio CP puede entrar a convenio | desde 2026-04-13 exige `publicidad` y `permite_convenio = true` |
| `__orderIsConvenioOrder` | detecta modo convenio en el editor/documentos | revisa metadata y detalle persistido |
| `__orderHasFiniteConvenioEndDate` | detecta si existe fecha fin real | evita que convenios con vigencia capturada se muestren como indefinidos |
| `__cpBuildPdfTemplateContext` | arma valores para etiquetas `{{...}}` en PDF | soporta cliente, folio, vigencia, sede y usuario actual |
| `window.openCpPdfTemplateTagsModal` | muestra el catalogo de etiquetas PDF en CP | se accede desde el boton `Etiquetas {{}}` del editor PDF |
| `window.getOrderHTML` | construye el HTML del PDF de cotizacion/orden | la rama de carta convenio ya no imprime montos |
| `__orderCanDisplaySpaceInEditor` | filtra espacios visibles en `order_detail` | respeta categoria y modo convenio |
| `__orderListEditorCatalogSpaces` | fuente unica del catalogo visible para combo y tarjetas | garantiza que ambas vistas muestren lo mismo |
| `__orderCanAddSpaceToEditor` | valida altas manuales en el editor | evita convenio invalido y mezcla de categorias |
| `__orderRenderSpaceAddSelect` | pinta el selector `oed-space-add` | muestra solo espacios compatibles con el estado actual |
| `__orderRenderSpacePicker` | pinta las tarjetas de espacios del editor | soporta multi-seleccion y estado activo |
| `window.activateOrderSpaceCard` | activa una tarjeta y crea configuracion si hace falta | respeta validaciones antes de agregar un nuevo espacio |
| `window.toggleOrderSpaceSwitch` | enciende/apaga la presencia del espacio en la cotizacion | debe seguir permitiendo varios espacios de la misma categoria |

Regla especial:

- CP comparte el criterio documental de Plaza Mayor para cartas convenio
- el PDF entregable conserva informacion operativa y deja el pricing en el expediente interno

## 4. Casa de Piedra: flujo hibrido de cotizacion en `cotizacion.js`

Archivo:

- `frontend/client/cotizadorcp/cotizacion.js`

Funciones y responsabilidades:

| Funcion | Responsabilidad | Nota de mantenimiento |
| --- | --- | --- |
| `__cpBuildPublicidadPrice` | calcula subtotal, impuestos y total para `publicidad` | usa precio base o precio personalizado; el convenio se resuelve aparte |
| `renderCpMaterialSuggestions` | llena el selector real de materiales CP | no usa `datalist`; conserva materiales historicos que no esten en catalogo |
| `__cpDetailBlocksIndefinitely` | detecta bloqueo indefinido en un detalle de espacio | impacta disponibilidad y carta convenio |
| `__cpHasFiniteConvenioEndDate` | valida si la fecha fin del convenio es real | una fecha fin real tiene prioridad sobre banderas heredadas |
| `__cpQuoteBlocksIndefinitely` | detecta bloqueo indefinido a nivel cotizacion | debe permanecer alineada con `espacios_detalle` |
| `__cpGetQuoteCategoryMode` | identifica si la cotizacion es `publicidad`, `espacio` o `mixed` | `mixed` es estado invalido y solo se usa para bloquear acciones |
| `__cpCanAddSpaceToQuote` | impide mezclar `publicidad` con `espacio` | es una regla estructural del modelo CP |
| `__cpBuildReservationsMap` | arma el mapa de reservas/ocupacion para eventos | considera aprobadas/finalizadas y detalle multiespacio |
| `__cpEvalAvailability` | recalcula disponibilidad del calendario de CP | respeta evento, premontaje, horas extra y bloqueos |

Claves del modelo hibrido:

- `publicidad` usa logica comercial y documental parecida a Plaza Mayor
- `espacio` usa logica de evento: personas, horario, premontaje y agenda
- cualquier cambio sobre convenios CP debe revisarse junto con `orders.js` y `cotizacion.js`

## 5. Campos y estructuras que no se deben romper

Coleccion `espacios`:

- `tipo`: define si el flujo es `publicidad` o `espacio`
- `permite_convenio`: habilita convenio solo de forma explicita
- `precio_base`, `material`, `medida_ancho`, `medida_alto`, `medida_unidad`: alimentan PDF y pricing

Coleccion `cotizaciones`:

- `espacios_detalle`: snapshot por espacio, categoria, fechas, pricing y banderas de convenio
- `desglose_precios`: snapshot financiero interno
- `detalles_evento.convenio`: metadata canonica del convenio
- `conceptos_adicionales`: base de contraprestaciones y adicionales

Regla documental:

- el expediente interno puede conservar montos
- la carta convenio PDF no debe exponer esos montos al usuario final
- las etiquetas PDF disponibles son `{{CLIENT_NAME}}`, `{{CLIENT_EMAIL}}`, `{{CLIENT_PHONE}}`, `{{CLIENT_RFC}}`, `{{QUOTE_NAME}}`, `{{FOLIO}}`, `{{DOC_TITLE}}`, `{{START_DATE}}`, `{{END_DATE}}`, `{{VALIDITY}}`, `{{TODAY}}`, `{{CURRENT_USER_NAME}}`, `{{CURRENT_USER_EMAIL}}` y `{{VENUE_NAME}}`

## 6. Despliegue frontend/backend separado

Archivos:

- `production/backend-service.bat`
- `production/levantar-todo.bat`
- `production/deploy/run-pocketbase-service.ps1`
- `production/deploy/sync-frontend-runtime.ps1`
- `production/deploy/prepare-nginx-site.ps1`

Funciones/acciones operativas:

| Accion | Responsabilidad | Nota de mantenimiento |
| --- | --- | --- |
| `backend-service.bat set-public-dir off` | desactiva HTML servido desde PocketBase | requerido para despliegue actual con frontend separado |
| `backend-service.bat set-frontend-url /` | deja runtime same-origin para Nginx | Nginx debe proxear `/api/` y `/_/` |
| `backend-service.bat set-frontend-url http://BACKEND:8090` | apunta HTML estatico directo al backend | usar cuando no hay proxy same-origin |
| `backend-service.bat set-frontend-origin http://FRONTEND` | registra CORS para el origen HTML | obligatorio si frontend/backend no comparten origen |
| `backend-service.bat prepare-nginx` | prepara `production\deploy\nginx-site\` | copia `frontend\client` y `frontend\assets` con runtime actualizado |
| `run-pocketbase-service.ps1` | inicia PocketBase sin `--publicDir` si `PUBLIC_DIR` esta apagado | evita que PocketBase despliegue HTML accidentalmente |
| `levantar-todo.bat` | pide IP/puerto backend y frontend | automatiza bind, runtime, CORS, publicDir, Nginx y servicio |

## 7. Puntos seguros para extender el sistema

Si TI necesita agregar un nuevo criterio de convenio:

1. cambiar primero la funcion `*SpaceAllowsConvenio`
2. revisar el filtro visual del selector/editor
3. revisar persistencia de `espacios_detalle`
4. revisar `window.getOrderHTML`
5. validar base viva con `development/audit-smoke.ps1`

Si TI necesita agregar una nueva categoria en CP:

1. extender `__cpGetSpaceCategoryKey`
2. revisar `__cpCanAddSpaceToQuote`
3. revisar disponibilidad en `__cpBuildReservationsMap` y `__cpEvalAvailability`
4. revisar `orders.js` para PDF, editor y persistencia

## 8. Checklist minimo de auditoria para estos modulos

- una carta convenio no muestra importes en preview ni PDF descargado
- una cotizacion con `fecha_fin` real no se muestra como `Indefinido`
- una cotizacion convenio en Plaza Mayor solo deja elegir espacios con `permite_convenio = true`
- una cotizacion convenio en Casa de Piedra solo deja elegir espacios publicitarios con `permite_convenio = true`
- la multi-seleccion sigue funcionando dentro de la categoria valida
- CP sigue bloqueando la mezcla `publicidad`/`espacio`
- el modal de materiales CP usa `<select>` y no `datalist`
- el editor PDF muestra el modal `Etiquetas {{}}`
- PocketBase corre sin `PUBLIC_DIR` cuando el frontend se sirve por separado
- los espejos en `frontend/pb_public/` quedan sincronizados

## 9. Referencias cruzadas

- `docs/50-modulos-y-flujos-de-negocio.md`
- `docs/55-casa-de-piedra-publicidad-y-espacios.md`
- `docs/60-pdfs-y-documentos.md`
- `docs/80-auditoria-tecnica-y-checklist.md`
