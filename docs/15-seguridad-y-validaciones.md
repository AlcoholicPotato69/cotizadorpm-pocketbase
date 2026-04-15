# Seguridad y Validaciones

Ultima actualizacion: 2026-04-14

Este documento resume los controles de seguridad y validacion realmente activos en frontend, PocketBase, hooks y storage.

## 1. Capas de seguridad

El sistema se apoya en cuatro capas:

1. validacion y sanitizacion en frontend
2. reglas de coleccion en PocketBase
3. hooks server-side para auth, cotizaciones publicas y availability
4. archivos protegidos y filtros por tenant

## 2. Autenticacion y sesion

Implementacion principal:

- `frontend/client/services/auth.js`
- `backend/pb_hooks/20_auth_session.pb.js`

Endpoints principales:

- `POST /api/hub/session/login`
- `GET /api/hub/session/current`
- `POST /api/hub/session/refresh`
- `POST /api/hub/session/logout`

Controles aplicados:

- cookie `hub_auth_session_v1`
- `httpOnly`
- `sameSite=Strict`
- `secure=true` cuando la solicitud corre bajo TLS o `X-Forwarded-Proto=https`
- headers `Cache-Control`, `Pragma`, `X-Content-Type-Options` y `Referrer-Policy`
- sincronizacion de sesion entre tabs via `BroadcastChannel`
- expiracion de inactividad desde `auth.js`
- heartbeat de sesion en `frontend/client/js/layout.js`
- cuando la sesion ya no es valida, las paginas protegidas redirigen automaticamente al login

## 3. CORS y origenes permitidos

La politica CORS se define en `backend/pb_hooks/20_auth_session.pb.js`.

Se permiten origenes cuando:

- son loopback (`127.0.0.1`, `localhost`, `::1`)
- son IP privada RFC1918
- o el host del `Origin` coincide con `Host` / `X-Forwarded-Host`

Eso evita exponer la API autenticada a origenes arbitrarios.

## 4. Tenant isolation

El aislamiento multi-tenant se aplica en dos frentes:

- `frontend/client/services/pb-core.js`
  inyecta `tenant` al crear/actualizar registros y agrega filtro por tenant en lecturas
- reglas PocketBase en migraciones
  restringen list/view/update/delete/create al tenant permitido por el usuario

Roles soportados:

- `admin`
- `plaza_mayor`
- `casa_de_piedra`
- `user`

Campos de soporte en `app_users`:

- `role`
- `allowed_tenants`
- `tenant_default`
- `login_username`

## 5. Reglas de coleccion relevantes

Estado funcional final esperado:

- `app_users`
  - alta solo por admin
  - lectura por admin o por el propio usuario
- `clientes`, `impuestos`, `documentos`
  - acceso solo autenticado y dentro del tenant permitido
- `conceptos_catalogo`
  - lectura publica limitada para Casa de Piedra cuando los conceptos estan activos
- `configuracion`
  - lectura publica limitada a claves CP necesarias para publico
- `espacios`
  - lectura publica solo de registros activos
  - administracion solo con auth del tenant
- `cotizaciones`
  - lectura y vista solo autenticada por tenant
  - creacion publica permitida unicamente con `status = pendiente`
  - update/delete solo con auth del tenant

Migraciones clave:

- `backend/pb_migrations/1773300100_fix_rules_native_tenants.js`
- `backend/pb_migrations/1780000007_lock_public_quotes_reads.js`
- `backend/pb_migrations/1790000004_fix_app_users_create_rule.js`

## 6. Validaciones de frontend reutilizables

Archivo:

- `frontend/client/services/security.js`

Utilidades activas:

- `escapeHtml`
- `sanitizeInput`
- `stripHtmlTags`
- `isValidEmail`
- `isValidPhone`
- `isSafeRedirectUrl`
- `isValidTenant`

Objetivo:

- prevenir XSS en textos renderizados
- bloquear redirects inseguros
- normalizar y limitar inputs
- validar tenant/correo/telefono antes del submit

## 7. Validaciones de cotizacion publica

Archivo:

- `backend/pb_hooks/10_cotizaciones.pb.js`

Controles aplicados para solicitudes sin auth:

- fuerza `status = pendiente`
- valida `tenant` contra whitelist
- sanitiza campos de texto
- remueve HTML y caracteres de control
- valida email y telefono
- valida fechas con formato ISO y rangos razonables
- limita rangos a un maximo de 366 dias
- normaliza `espacios_detalle`
- limita `premontaje_fechas` y `horas_extra`
- limpia campos sensibles de orden, contrato, factura y archivos
- recalcula/normaliza estructura financiera publica permitida

Campos sensibles que se limpian:

- `datos_fiscales`
- `historial_pagos`
- `datos_factura`
- `cliente_id`
- `cliente_rfc`
- numeros de orden/contrato
- URLs y file fields de factura, contrato y orden de compra

## 8. Throttling de cotizaciones publicas

Implementacion:

- `backend/pb_hooks/10_cotizaciones.pb.js`

Politica actual:

- ventana de 10 minutos
- maximo 4 solicitudes por combinacion `tenant + email + telefono`
- ventana anti-duplicado de 45 segundos

Limitacion conocida:

- el throttle es en memoria
- se reinicia si PocketBase reinicia
- para alta concurrencia conviene migrarlo a almacenamiento persistente

## 9. Endpoint de disponibilidad publica

Archivo:

- `backend/pb_hooks/31_public_availability.pb.js`

Controles:

- solo acepta `tenant` valido
- solo acepta `spaceId` sanitizado
- responde solo fechas ocupadas
- no expone datos de cliente ni precios
- cache de 60 segundos
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

## 10. Archivos protegidos y documentos

Las colecciones `cotizaciones` y `documentos` usan file fields protegidos para:

- `factura_pdf_file`
- `factura_xml_file`
- `contrato_file`
- `cotizacion_final_file`
- `orden_compra_file`
- `archivo` en `documentos`

La proteccion evita acceso anonimo directo al archivo fuera de reglas/autorizacion.

## 11. Validaciones de negocio relevantes

Plaza Mayor:

- permanencia mensual salvo configuracion personalizada
- impuestos solo sobre espacios no-convenio

Casa de Piedra:

- no mezclar `publicidad` con `espacio` en una misma cotizacion
- convenio solo en espacios con `permite_convenio = true`
- `espacio` requiere personas, horario y fechas coherentes
- disponibilidad considera evento, premontaje, montaje y bloqueo indefinido

## 12. Hallazgos de auditoria 2026-04-13

Hallazgos corregidos en codigo:

- persistencia inconsistente de `bloqueo_indefinido` en convenios PM/CP
- migracion PM que rompia el arranque limpio por uso invalido de `new Record("espacios", ...)`
- seed PM que guardaba `tipo = "publicitario"` en lugar de `publicidad`

Deuda historica detectada en datos vivos:

- cotizaciones CP con `espacio_id` raiz que ya no existe en catalogo
- detalles de espacios historicos sin `tipo`/`espacio_tipo`
- metadato de convenio historico sin el flag de detalle correspondiente

## 13. Validacion reproducible

Script oficial de smoke audit:

- `development/audit-smoke.ps1`

El script valida:

- archivos criticos
- sintaxis JS de modulos y hooks clave
- arranque limpio de PocketBase con migraciones
- barrido read-only de la base viva para detectar deuda de datos
