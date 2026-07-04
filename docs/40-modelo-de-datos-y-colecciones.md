# Modelo de Datos y Colecciones

Ultima actualizacion: 2026-04-13

Este documento describe las colecciones PocketBase, sus responsabilidades funcionales, las estructuras JSON mas importantes y las observaciones de auditoria detectadas en la base viva.

## 1. Tenants

| Tenant | Schema historico/runtime | Uso operativo |
| --- | --- | --- |
| `plaza_mayor` | `finanzas` | publicidad y espacios comerciales |
| `casa_de_piedra` | `finanzas_casadepiedra` | eventos, salones y publicidad CP |

## 2. Colecciones principales

| Coleccion | Multi-tenant | Proposito |
| --- | --- | --- |
| `app_users` | No | usuarios internos, permisos y tenants permitidos |
| `clientes` | Si | perfiles comerciales/fiscales |
| `conceptos_catalogo` | Si | conceptos adicionales reutilizables |
| `configuracion` | Si | key/value flexible por tenant |
| `impuestos` | Si | impuestos disponibles por tenant |
| `espacios` | Si | catalogo de espacios, salones y publicidad |
| `cotizaciones` | Si | encabezado, pricing, detalle, estados y auditoria |
| `documentos` | Si | archivos protegidos asociados al proceso |

## 3. Campo `tenant`

Las colecciones multi-tenant usan el campo `tenant` como frontera principal de datos.

La inyeccion automatica ocurre en:

- `frontend/client/services/pb-core.js`

Las reglas PocketBase refuerzan el mismo aislamiento.

## 4. `app_users`

Campos operativos:

- `email`
- `login_username`
- `role`
- `tenant_default`
- `allowed_tenants`
- `app_metadata`

Comportamiento:

- admin puede crear usuarios
- un usuario puede consultar/editar su propio registro
- los roles determinan acceso PM/CP

## 5. `clientes`

Campos clave:

- `tenant`
- `nombre_completo`
- `telefono`
- `correo`
- `rfc`

Uso:

- autocomplete y asociacion de clientes al crear/editar cotizaciones
- fuente de datos fiscales basicos

## 6. `conceptos_catalogo`

Campos clave:

- `tenant`
- `nombre`
- `precio_sugerido`
- `activo`

Uso:

- conceptos adicionales administrativos
- en Casa de Piedra tambien alimenta el flujo publico cuando el concepto esta activo

## 7. `configuracion`

Campos clave:

- `tenant`
- `clave`
- `valor_num`
- `valor_json`

Claves observadas en Casa de Piedra al 2026-04-13:

- `contract_template_default`
- `convenios_cp`
- `hora_extra_cfg`
- `materiales_cp`
- `pdf_letterhead_path`
- `pdf_typography_style`
- `premontaje_pct`

Ejemplos de uso:

- porcentaje de premontaje
- costo o modo de hora extra
- convenios disponibles
- materiales, overlays y recursos PDF

## 8. `impuestos`

Campos clave:

- `tenant`
- `nombre`
- `porcentaje`
- `activo`
- `impuestos_aplicados`

Uso:

- calcula IVA u otros impuestos por espacio
- se referencia desde `espacios.impuestos_ids`

## 9. `espacios`

Campos clave:

- `tenant`
- `clave`
- `nombre`
- `tipo`
- `descripcion`
- `precio_base`
- `material`
- `ubicacion`
- `medida_ancho`
- `medida_alto`
- `medida_unidad`
- `impuestos_ids`
- `dias_bloqueados`
- `config_b2b`
- `permite_convenio`
- imagenes (`imagen`, `imagen2`, `imagen3`, `imagen4`, `imagen5`)

Tipos usados realmente:

- Plaza Mayor: `publicidad`
- Casa de Piedra: `espacio`, `publicidad`

Conteo auditado en base viva al 2026-04-13:

- Plaza Mayor: 30 registros `publicidad`
- Casa de Piedra: 4 registros `espacio`, 1 registro `publicidad`

## 10. `cotizaciones`

Campos escalar clave:

- `tenant`
- `espacio_id`
- `espacio_nombre`
- `espacio_clave`
- `cliente_nombre`
- `cliente_email`
- `cliente_contacto`
- `fecha_inicio`
- `fecha_fin`
- `precio_final`
- `status`
- `personas`
- `nombre_cotizacion`
- auditoria: `creado_por`, `creado_por_nombre`, `modificado_por`, `modificado_por_nombre`

Campos JSON clave:

- `desglose_precios`
- `conceptos_adicionales`
- `desglose_impuestos`
- `historial_pagos`
- `datos_factura`
- `datos_fiscales`
- `detalles_evento`
- `espacios_detalle`
- `notas_pdf`

Archivos protegidos:

- `factura_pdf_file`
- `factura_xml_file`
- `contrato_file`
- `cotizacion_final_file`
- `orden_compra_file`

Estados observados:

- `pendiente`
- `aprobada`
- `rechazada`
- `finalizada`

Conteo auditado en base viva al 2026-04-13:

- Casa de Piedra: 1 `aprobada`, 8 `pendiente`
- Plaza Mayor: 2 `aprobada`, 1 `pendiente`

## 11. Estructura de `espacios_detalle`

`espacios_detalle` es el detalle operativo por espacio en una cotizacion multi-espacio o de evento.

Campos usados por el frontend/hook:

- `espacio_id`
- `espacio_nombre`
- `espacio_clave`
- `espacio_tipo`
- `tipo`
- `fecha_inicio`
- `fecha_fin`
- `personas`
- `horario`
- `premontaje_dias`
- `premontaje_fechas`
- `horas_extra`
- `subtotal_espacio`
- `impuestos_ids`
- `impuestos_total`
- `total_espacio`
- `convenio_activo`
- `convenio_indefinido`
- `convenio_items`
- `material`
- `ubicacion`
- `medida_ancho`
- `medida_alto`
- `medida_unidad`

## 12. Estructura de `detalles_evento`

Campos funcionales comunes:

- `multi_espacio`
- `total_espacios`
- `nombre_cotizacion`

Campos usados especialmente en Casa de Piedra:

- `convenio`
- informacion operativa de evento
- indicadores de permanencia personalizada

`detalles_evento.convenio` concentra:

- `activo`
- `bloqueo_indefinido`
- `requiere_evidencia`
- `evidencia_minima`
- `evidencia_maxima`
- `requiere_factura`
- `requiere_recibo`
- `requiere_contrato`
- `espacios`
- `items`
- `evidencias`

## 13. Estructura de `desglose_precios`

Campos clave:

- `subtotal_antes_impuestos`
- `impuestos_detalle`
- `tax_total`
- `convenio_base_total`
- `convenio_entregable_total`
- `convenio_balance_total`
- `espacios`

Observacion:

- el JSON funciona como snapshot financiero para PDF, auditoria y reapertura de orden

## 14. `documentos`

Campos clave:

- `tenant`
- `cotizacion_legacy_id`
- `tipo`
- `nombre_original`
- `ruta_legacy`
- `archivo`

Uso:

- persistencia de archivos generados o cargados
- bucket protegido por reglas de tenant/auth

## 15. Reglas de acceso resumidas

| Coleccion | Lectura publica | Creacion publica | Notas |
| --- | --- | --- | --- |
| `app_users` | No | No | alta solo admin |
| `clientes` | No | No | tenant auth |
| `conceptos_catalogo` | Parcial CP | No | solo conceptos CP activos |
| `configuracion` | Parcial CP | No | solo claves necesarias para publico CP |
| `impuestos` | No | No | tenant auth |
| `espacios` | Si, si `activo=true` | No | admin tenant para cambios |
| `cotizaciones` | No | Si, solo `pendiente` | hooks sanitizan submit publico |
| `documentos` | No | No | archivos protegidos |

## 16. Observaciones de auditoria sobre datos vivos

Hallazgos detectados por `development/deploy/audit-smoke.ps1` el 2026-04-13:

- 1 cotizacion historica contiene `espacios_detalle` sin `tipo`/`espacio_tipo`
- 1 cotizacion historica tiene `detalles_evento.convenio.bloqueo_indefinido = true` sin el flag equivalente en el detalle
- no se detectaron casos activos `cp_root_space_without_catalog_record` en la ultima corrida

Interpretacion:

- son deudas historicas de datos, no necesariamente fallas vigentes del flujo actual
- deben considerarse en una auditoria TI y en cualquier plan de saneamiento de base
