# Modelo de Datos y Colecciones

Ultima actualizacion: 2026-03-28

## 1. Tenants

| Tenant | Schema | Uso |
| --- | --- | --- |
| `plaza_mayor` | `finanzas` | espacios comerciales |
| `casa_de_piedra` | `finanzas_casadepiedra` | eventos, salones y premontajes |

## 2. Colecciones principales

| Coleccion | Multi-tenant | Proposito |
| --- | --- | --- |
| `app_users` | No | usuarios internos y permisos |
| `clientes` | Si | clientes y datos fiscales |
| `conceptos_catalogo` | Si | conceptos reutilizables |
| `configuracion` | Si | key/value por tenant |
| `impuestos` | Si | catálogo de impuestos |
| `espacios` | Si | catálogo de espacios |
| `cotizaciones` | Si | encabezado y detalle operativo |
| `documentos` | Si | documentos generados y adjuntos |

## 3. Campo tenant

Colecciones multi-tenant usan:

- `plaza_mayor`
- `casa_de_piedra`

La inyección automática ocurre en:

- `frontend/client/services/pb-core.js`

## 4. Espacios

`espacios` concentra:

- nombre y clave
- tipo
- etiquetas
- material
- ubicacion
- medidas
- imagenes
- impuestos asociados

## 5. Cotizaciones

Campos funcionales clave:

- cliente
- fechas
- `precio_final`
- `desglose_precios`
- `espacios_detalle`
- `conceptos_adicionales`
- `status`
- rutas de documentos
- auditoria

`espacios_detalle` es el detalle operativo por espacio.

## 6. Configuracion

`configuracion` se usa como almacén flexible por tenant.

Ejemplos:

- materiales de Plaza Mayor
- ubicaciones de Plaza Mayor
- membretes PDF
- overlays
- ajustes numéricos por tenant

## 7. Permisos

Roles esperados:

- `admin`
- `plaza_mayor`
- `casa_de_piedra`
- `ambos`

Campos de soporte en `app_users`:

- `role`
- `allowed_tenants`
- `tenant_default`
- `login_username`

## 8. Backend relacionado

Hooks:

- `backend/pb_hooks/00_lib.pb.js`
- `backend/pb_hooks/10_cotizaciones.pb.js`
- `backend/pb_hooks/20_auth_session.pb.js`

Migraciones:

- `backend/pb_migrations/`

## 9. Storage

Bucket principal observado:

- `documentos`

Buenas prácticas:

- no editar manualmente `backend/pb_data/`
- respaldar antes de cambiar hooks o migraciones
