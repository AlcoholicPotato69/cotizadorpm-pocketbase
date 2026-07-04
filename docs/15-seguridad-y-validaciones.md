# Seguridad y Validaciones

Ultima actualizacion: 2026-04-24

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

La politica CORS se define en `backend/pb_hooks/20_auth_session.pb.js` y `backend/pb_hooks/auth_session_shared.js` (`isAllowedRequestOrigin`).

Se permiten origenes cuando:

- son loopback (`127.0.0.1`, `localhost`, `::1`)
- son IP privada RFC1918
- o el host del `Origin` coincide con `Host` / `X-Forwarded-Host`

Cualquier otro origen recibe la respuesta sin headers CORS y sin token en el cuerpo del login.

Eso evita exponer la API autenticada a origenes arbitrarios de internet.

## 3.1. Headers de seguridad en API

Todas las respuestas bajo `/api/` incluyen:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

Los endpoints de sesion agregan ademas `Cache-Control: no-store`.

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

## 10.1. `client_profile`: cuarentena y Windows Defender

Archivo principal:

- `backend/pb_hooks/client_profile_shared.js`

Reglas activas desde 2026-04-24:

- cada archivo cargado al expediente publico pasa primero por una carpeta temporal `_upload_quarantine`
- el hook ejecuta `MpCmdRun.exe` de Windows Defender antes de aceptar el archivo
- si Defender detecta amenaza, el backend rechaza el upload con un mensaje de usuario:
  - `El archivo de <documento> no paso la seguridad del sistema. Intenta de nuevo con otro archivo.`
- si el archivo es rechazado, la UI publica marca el documento con error y elimina el archivo pendiente para forzar una nueva seleccion

Objetivo operativo:

- evitar que archivos maliciosos entren a `clientes`, `documentos` o espejos del expediente
- dejar trazabilidad clara en `client_profile` sin mensajes ambiguos al usuario final

Archivos relacionados:

- `frontend/client/public/perfil_cliente.html`
- `frontend/pb_public/client/public/perfil_cliente.html`

## 11. Validaciones de negocio relevantes

Plaza Mayor:

- permanencia mensual salvo configuracion personalizada
- impuestos solo sobre espacios no-convenio

Casa de Piedra:

- no mezclar `publicidad` con `espacio` en una misma cotizacion
- convenio solo en espacios con `permite_convenio = true`
- `espacio` requiere personas, horario y fechas coherentes
- disponibilidad considera evento, premontaje, montaje y bloqueo indefinido

## 11.1. Autoextraccion de constancia fiscal

Flujo activo:

- `frontend/client/public/perfil_cliente.html` extrae RFC, fecha de emision y razon social desde la constancia PDF
- al guardar el expediente, el frontend envia `rfc` y `nombre_completo` al endpoint publico
- `backend/pb_hooks/client_profile_shared.js` actualiza automaticamente el perfil cuando la constancia forma parte del submit

Resultado esperado:

- un perfil creado desde cotizacion rapida puede nacer con datos minimos
- al subir la constancia fiscal, el expediente corrige RFC y razon social sin captura manual adicional

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

- `development/deploy/audit-smoke.ps1`

Auditoria de seguridad 2026-07-04:

- `docs/95-auditoria-2026-07-04-seguridad-y-hardening.md`

El script valida:

- archivos criticos
- sintaxis JS de modulos y hooks clave
- arranque limpio de PocketBase con migraciones
- barrido read-only de la base viva para detectar deuda de datos
