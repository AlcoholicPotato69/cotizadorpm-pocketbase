# Modelo de Datos y Colecciones

Ultima actualizacion: 2026-03-27

## 1. Tenants y schemas

| Tenant | Schema | Uso principal |
| --- | --- | --- |
| `plaza_mayor` | `finanzas` | Espacios comerciales |
| `casa_de_piedra` | `finanzas_casadepiedra` | Salones, eventos y premontajes |

## 2. Colecciones principales

| Coleccion | Multi-tenant | Proposito | Campos clave |
| --- | --- | --- | --- |
| `app_users` | No | usuarios internos y permisos | `role`, `allowed_tenants`, `tenant_default`, `login_username`, `email` |
| `clientes` | Si | catalogo de clientes | datos de contacto y RFC |
| `conceptos_catalogo` | Si | servicios y conceptos reutilizables | `nombre`, `precio_sugerido`, `activo` |
| `configuracion` | Si | key/value por tenant | `clave`, `valor_json`, `valor_num` |
| `impuestos` | Si | catalogo de impuestos | `nombre`, `porcentaje` |
| `espacios` | Si | catalogo de espacios | `clave`, `nombre`, `tipo`, `etiquetas`, `material`, `ubicacion`, `medidas`, imagenes |
| `cotizaciones` | Si | encabezado y detalle de cotizaciones | cliente, fechas, `espacios_detalle`, `desglose_precios`, docs, auditoria |
| `documentos` | Si | archivos generados y adjuntos | rutas de bucket y metadatos |

## 3. Campo tenant

`tenant` vive en todas las colecciones multi-tenant y usa solo estos valores:

- `plaza_mayor`
- `casa_de_piedra`

`client/services/pb-core.js` inyecta tenant automaticamente en create/update y filtra
consultas cuando la coleccion pertenece al conjunto multi-tenant.

## 4. Espacios

La coleccion `espacios` concentra:

- datos base del espacio
- tags (`etiquetas`)
- material
- ubicacion
- medidas
- impuestos asociados
- imagenes multiples

Notas recientes:

- Plaza Mayor usa materiales y ubicaciones configurables
- local/isla/espacio usan `ubicacion` y `medidas`
- publicidad usa `material` y `medidas`

## 5. Cotizaciones

`cotizaciones` es la coleccion mas importante.

Campos funcionales clave:

- identificadores del cliente
- fechas generales
- `precio_final`
- `desglose_precios`
- `espacios_detalle`
- `conceptos_adicionales`
- `status`
- rutas de documentos generados
- campos de auditoria

`espacios_detalle` debe considerarse el detalle operativo por espacio. Ahi viven:

- espacio_id
- nombre y clave del espacio
- fecha inicio y fin
- precio personalizado si aplica
- impuestos por espacio
- material
- ubicacion
- medidas

## 6. Configuracion

`configuracion` se usa como tabla flexible por tenant.
Claves relevantes observadas en el proyecto:

- `materiales_pm`
- `ubicaciones_pm`
- `pdf_letterhead_path`
- configuraciones de overlays y generadores PDF
- porcentajes o ajustes de Casa de Piedra

## 7. Roles y permisos

Roles esperados:

- `admin`
- `plaza_mayor`
- `casa_de_piedra`
- `ambos`

Campos soporte:

- `allowed_tenants`
- `tenant_default`

`layout.js` y `pb-core.js` usan esos datos para:

- acceso por tenant
- visibilidad de menu
- guardas de sesion

## 8. Hooks y proteccion publica

`pb_hooks/10_cotizaciones.pb.js` protege la creacion publica de cotizaciones:

- valida tenant
- sanitiza texto
- fuerza `status = pendiente`
- limpia campos sensibles

`pb_hooks/30_cp_calendar_ics.pb.js` expone calendario ICS para Casa de Piedra.

## 9. Migraciones relevantes

Migraciones observadas:

- base inicial de colecciones
- permisos multi-tenant
- reglas publicas nativas
- overlays PDF
- notas y auditoria en cotizaciones
- multi imagen de espacios
- materiales y medidas en espacios
- ids nativos para espacios e impuestos

Antes de diagnosticar un bug de datos, confirmar que el ambiente tenga las migraciones
mas recientes aplicadas.

## 10. Storage y documentos

Bucket usado:

- `documentos`

Practicas actuales:

- las rutas de archivos se guardan en registros
- al abrir un documento, el frontend genera signed URL y luego abre un blob local
  para no exponer la URL firmada al usuario final

