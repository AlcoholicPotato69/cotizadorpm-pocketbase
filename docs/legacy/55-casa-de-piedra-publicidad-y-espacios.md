# Casa de Piedra: Publicidad y Espacios

Ultima actualizacion: 2026-04-13

Este documento explica el modelo hibrido de Casa de Piedra y resume la validacion tecnica realizada sobre las categorias `publicidad` y `espacio`.

## 1. Situacion funcional real

Casa de Piedra no es un clon directo de Plaza Mayor ni un modulo 100% aislado.

Su comportamiento actual es hibrido:

- `publicidad`
  reutiliza la logica comercial de Plaza Mayor
- `espacio`
  usa la logica propia de eventos y salones de Casa de Piedra

## 2. Inventario auditado en base viva

Resultado del smoke audit del 2026-04-13:

- `casa_de_piedra` tiene 4 registros `tipo = espacio`
- `casa_de_piedra` tiene 2 registros `tipo = publicidad`

Interpretacion:

- el tenant ya esta modelado para coexistencia real de ambas categorias

## 3. Como se identifica cada categoria

La categoria se deriva desde `espacios.tipo` y helpers del frontend.

En CP:

- `publicidad`
  activa controles de permanencia y precio personalizado
- `espacio`
  activa personas, horario, premontaje, horas extra y agenda

Archivos principales:

- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/cotizadorcp/orders.js`

## 4. Categoria `publicidad`

Comportamiento esperado:

- precio base del espacio
- impuestos asociados
- permanencia personalizada opcional
- precio personalizado opcional
- convenio opcional

Restriccion:

- convenio solo si `espacios.permite_convenio = true`
- en `order_detail`, cuando la cotizacion ya es convenio, solo se muestran esos espacios elegibles
- el modo convenio sigue permitiendo multiples espacios publicitarios dentro de la misma cotizacion

Configuracion observada:

- existe `convenios_cp` en `configuracion`
- al menos un espacio CP de publicidad auditado ya tiene `permite_convenio = true`

## 5. Categoria `espacio`

Comportamiento esperado:

- validacion de aforo/personas
- seleccion de horario
- costo de horas extra
- costo/porcentaje de premontaje
- control por dias bloqueados
- disponibilidad por fecha

Configuracion observada:

- `premontaje_pct = 25`
- `hora_extra_cfg` configurado como monto fijo 5900

## 6. Regla de no mezcla

Hallazgo confirmado:

- una cotizacion CP no puede mezclar `ESPACIO` con `PUBLICIDAD`

La regla existe y esta bien implementada en:

- `frontend/client/cotizadorcp/cotizacion.js`
  - `__cpCanAddSpaceToQuote`

Esto es correcto y necesario porque cada categoria persiste distintos datos operativos.

## 7. Disponibilidad y reservas

La disponibilidad CP esta bien planteada para la categoria `espacio`.

Fuentes que se consideran:

- cotizaciones `aprobada`
- cotizaciones `finalizada`
- `espacios_detalle`
- `premontaje_fechas`
- conceptos `b2b_montaje`
- convenios con bloqueo indefinido

Funciones clave:

- `__cpBuildReservationsMap`
- `__cpEvalAvailability`
- `__cpQuoteBlocksIndefinitely`
- `__cpHasFiniteConvenioEndDate`

Resultado:

- la logica de disponibilidad CP esta alineada con el modelo de salones/eventos
- si una cotizacion o convenio tiene `fecha_fin` real, esa fecha se respeta y no se reemplaza por `Indefinido`

## 8. Relacion con Plaza Mayor

Casa de Piedra reutiliza de Plaza Mayor principalmente:

- estructura de pricing para publicidad
- estructura de convenio
- estructura de documentos/evidencias
- algunos snapshots financieros para `espacios_detalle` y `desglose_precios`
- la regla documental de carta convenio sin montos visibles

Casa de Piedra conserva logica propia en:

- agenda del evento
- premontaje
- horas extra
- personas/aforo
- calculo por rango real del evento

## 9. Flujo publico de Casa de Piedra

Archivo:

- `frontend/client/public/public_casadepiedra.html`

Validacion funcional:

- el flujo publico cotiza solo `espacios`
- no expone `publicidad`
- crea cotizaciones `pendiente`
- sanitiza/normaliza a traves del hook `10_cotizaciones.pb.js`

Conclusión:

- esto es coherente con el modelo de negocio actual
- la `publicidad` CP es un flujo administrativo, no publico

## 10. Hallazgos corregidos en esta auditoria

### 10.1 Convenios y bloqueo indefinido

Problema detectado:

- en create/edit/finalize se estaba guardando `detalles_evento.convenio.bloqueo_indefinido = true` de forma fija en varios flujos
- eso podia no reflejar el estado real del detalle del convenio

Correccion aplicada:

- Casa de Piedra y Plaza Mayor ahora persisten el flag con base en la cobertura real del convenio
- cualquier `fecha_fin` real diferente a `2099-12-31` tiene prioridad sobre banderas heredadas de bloqueo indefinido

Archivos corregidos:

- `frontend/client/cotizadorcp/cotizacion.js`
- `frontend/client/cotizadorcp/orders.js`
- `frontend/client/cotizador/catalog.js`
- `frontend/client/cotizador/orders.js`

### 10.2 Modal de materiales de publicidad CP

Problema detectado:

- el campo `Material` usaba `datalist`
- el navegador lo presentaba como sugerencias libres, no como selector controlado

Correccion aplicada:

- el campo ahora es un `<select>` real
- `renderCpMaterialSuggestions` llena el selector desde `materiales_cp`
- si un espacio historico trae un material no incluido en catalogo, se agrega temporalmente para no perderlo al editar

Archivos corregidos:

- `frontend/client/cotizadorcp/catalog.html`
- `frontend/client/cotizadorcp/catalog.js`
- `frontend/client/cotizadorcp/cotizacion.html`
- `frontend/client/cotizadorcp/cotizacion.js`

### 10.3 Resumen de publicidad CP en `orders_detail`

Problema detectado:

- las tarjetas de publicidad CP mostraban campos de evento como personas, horario, premontaje y horas extra

Correccion aplicada:

- cuando el espacio es `publicidad`, el resumen muestra estructura tipo Plaza Mayor: fechas, base, tipo, detalle/material, medidas y total
- cuando el espacio es `espacio`, se mantiene la estructura de evento propia de Casa de Piedra

Archivo corregido:

- `frontend/client/cotizadorcp/orders.js`

### 10.4 Etiquetas editables para PDFs

Se agrego modal de referencia en el editor PDF con etiquetas soportadas:

- `{{CLIENT_NAME}}`
- `{{CLIENT_EMAIL}}`
- `{{CLIENT_PHONE}}`
- `{{CLIENT_RFC}}`
- `{{QUOTE_NAME}}`
- `{{FOLIO}}`
- `{{DOC_TITLE}}`
- `{{START_DATE}}`
- `{{END_DATE}}`
- `{{VALIDITY}}`
- `{{TODAY}}`
- `{{CURRENT_USER_NAME}}`
- `{{CURRENT_USER_EMAIL}}`
- `{{VENUE_NAME}}`

Uso:

- boton `Etiquetas {{}}` dentro del editor PDF
- campos de firma
- recursos de texto del PDF

### 10.5 Seed/migracion de Plaza Mayor

Problema detectado al validar clon limpio:

- una migracion PM creaba registros con `new Record("espacios", ...)`
- con la version actual de PocketBase esto rompia el arranque en frio
- ademas sembraba `tipo = publicitario` y el frontend trabaja con `publicidad`

Correccion aplicada:

- se normalizo la migracion para crear registros con la coleccion correcta
- se homologo el `tipo` a `publicidad`

## 11. Deuda historica detectada en datos vivos

No corresponde al flujo actual, pero si debe quedar documentada para TI:

- 1 cotizacion historica tiene `espacios_detalle` sin `tipo`/`espacio_tipo`
- 1 cotizacion historica tiene metadata de convenio sin el flag equivalente en detalle

Recomendacion:

- no borrar estos registros sin analisis previo
- tratarlos como deuda de migracion/saneamiento
- preparar script de normalizacion si TI decide corregir historico

## 12. Conclusion de validacion

Estado general:

- `publicidad` en Casa de Piedra esta bien implementada como extension administrativa del modelo PM
- `espacio` en Casa de Piedra esta bien implementado como flujo propio de eventos
- la regla de no mezcla entre ambas categorias es correcta
- la pagina publica CP esta alineada con la categoria `espacio`
- la carta convenio CP conserva solo informacion operativa en PDF y deja el pricing dentro del expediente interno

Pendientes remanentes:

- saneamiento de datos historicos
- mantener el smoke audit como parte del checklist previo a despliegue
