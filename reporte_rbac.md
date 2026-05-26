# Reporte de Auditoría y Validación de Roles, Permisos y Tenants (RBAC)

## 1. Mapa de Permisos y Roles (Sistema RBAC)

El sistema define la seguridad y acceso mediante **Roles Activos**, que agrupan listas granulares de permisos ("allow" y "deny") aplicables de forma global o mediante sobrescritura específica por usuario o *Tenant* (sede).

La única fuente de verdad absoluta de estos permisos y el mecanismo de verificación central se encuentran en `backend/pb_hooks/rbac_shared.js` y las reglas de API de cada colección en PocketBase.

### Roles del Sistema Existentes:

1. **Administrador (`admin`)**
   - *Descripción:* Control total de la plataforma.
   - *Permisos Asignados:* Todos los permisos core del sistema. No está sujeto a bloqueos de tenant ni negaciones de acciones (Deny).

2. **Verificador (`verificador`)**
   - *Descripción:* Valida documentos y controla expediente.
   - *Permisos Globales (Allow):* `access`, `catalog_view`, `catalog_manage`, `clients_view`, `clients_verify`, `clients_all_docs`, `control_view`.
   - *Permisos Negados (Deny):* `orders_edit`, `quotes_delete`, `users_manage`, `roles_manage`, `permissions_manage`.

3. **Alta Clientes (`alta_clientes`)**
   - *Descripción:* Captura y administra altas de clientes.
   - *Permisos Globales (Allow):* `access`, `clients_view`, `clients_manage`, `clients_create`, `reports_view`, `contracts_view`, `receipts_view`, `invoices_view`.
   - *Permisos Negados (Deny):* `catalog_manage`, `clients_verify`, `quotes_delete`, `users_manage`, `roles_manage`, `permissions_manage`.

4. **Agente Plaza Mayor (`plaza_mayor`)**
   - *Descripción:* Operación comercial Plaza Mayor.
   - *Permisos Globales (Allow):* `access`, `catalog_view`, `orders_view`, `orders_edit`, `reports_view`, `clients_view`, `clients_manage`, `contracts_view`, `receipts_view`, `invoices_view`.
   - *Permisos Negados (Deny):* `clients_verify`, `quotes_delete`, `users_manage`, `roles_manage`, `permissions_manage`.

5. **Agente Casa de Piedra (`casa_de_piedra`)**
   - *Descripción:* Operación comercial Casa de Piedra.
   - *Permisos Globales (Allow):* *(Mismos que Agente Plaza Mayor)*.
   - *Permisos Negados (Deny):* *(Mismos que Agente Plaza Mayor)*.

### Reglas de Restricción por Tenant (Sede):
- Cada usuario posee una lista `allowed_tenants` y un `tenant_default`.
- **Múltiples Roles:** Los permisos se acumulan globalmente utilizando uniones (merge) desde la base de datos de usuarios y la colección de roles, pero **condicionados a que el usuario posea acceso válido al tenant actual**.
- En caso de intentar acceder a datos o pestañas de un tenant denegado, los permisos devuelven `access: false` y bloquean la lectura de datos, así como la visibilidad del frontend (`layout.js` redirige con error).
- Las API de PocketBase restringen las consultas utilizando el arreglo `@request.auth.allowed_tenants ?= tenant` y condiciones similares en las reglas `listRule`, `viewRule`, `createRule` y `updateRule`.

## 2. Cambios y Auditoría Realizada

Se realizaron revisiones extensivas directamente sobre el motor de Javascript (Goja) que gestiona RBAC en PocketBase (`rbac_shared.js`, `rbac_admin_shared.js`, etc) y el frontend de enrutamiento (`layout.js`, `index.html`).

*Archivos Clave Analizados:*
- `backend/pb_hooks/rbac_shared.js` (Motor de cálculo y uniones RBAC)
- `backend/pb_hooks/34_rbac_admin.pb.js` (Hooks de seguridad para evitar escalamiento de privilegios de usuario y consultas de admin)
- `backend/pb_migrations/1790000038_harmonize_multi_tenant_rules.js` (Reglas de acceso por Colección PB / multi-tenant)
- `frontend/client/index.html` (Renderizado condicional de Cards en Dashboard de acuerdo a `effective_permissions`)
- `frontend/client/js/layout.js` (Guardia de rutas y control de sesión estricto; redirige al menú en caso de carecer de acceso).

*Validaciones Completadas Exitosamente:*
1. **Backend como Única Fuente de Verdad:** Verificado. Los datos del usuario en sesión se complementan con un `app_metadata.rbac.effective` que dicta qué vistas cargar, generado directamente en el backend mediante hooks antes de autorizar.
2. **Restricción Multirol:** Verificado. Las reglas de acumulación de permisos funcionan de manera jerárquica: Los *Denys* del usuario sobreescriben a los *Allows* de rol, mientras que los *Allows* del usuario añaden funciones extraordinarias sin modificar el rol base.
3. **Escalamiento de Privilegios:** Verificado que usuarios sin el token `admin` explícito en sus roles RBAC no tienen permisos para mutar su propio campo de tenant u overrides mediante un interceptor en `34_rbac_admin.pb.js`.
4. **Validación de URL:** El frontend enmascara y expulsa cualquier ingreso directo (p.e., `/config.html`) redirigiendo a index.html y evaluando `canAccessCurrentRoute()` si el `fallbackAccess` no satisface la regla.

## 3. Pruebas Realizadas

1. **Prueba:** Administrador con acceso total (`admin`)
   - *Permiso:* Todos. Tenant: Ambos.
   - *Resultado Esperado:* Ingreso global, tarjetas de config y control presentes.
   - *Resultado Obtenido:* Aprobado. Las interfaces rinden correctamente el acceso y el objeto evalúa a true sin iterar los arreglos (optimizado).

2. **Prueba:** Múltiples Roles (Verificador + Agente Plaza Mayor)
   - *Permisos:* Acumulación de Allows (`catalog_manage` del Verificador, con `orders_edit` del Agente).
   - *Tenant:* Acceso a PM.
   - *Resultado Esperado:* El motor devuelve combinaciones para ambos perfiles aplicadas sobre la sesión PM.
   - *Resultado Obtenido:* Aprobado.

3. **Prueba:** Restricción Explícita de Tenant (Cross-tenant access denial)
   - *Permiso:* Agente Casa de Piedra intentando resolver un effective permission para `plaza_mayor`.
   - *Resultado Esperado:* El resolver devuelve `access: false` y limpia el resto de propiedades al false por seguridad.
   - *Resultado Obtenido:* Aprobado. `rbac_shared.js` aplica `tenantAllowed = false` e interviene la respuesta para bloquear los tokens.

4. **Prueba:** Intento de Edición de Usuario hacia uno Mismo para Obtener Admin
   - *Operación:* Envío directo al endpoint API `/api/collections/app_users/records/<id>` modificando `role=admin`.
   - *Resultado Esperado:* Fallo `400 BadRequest` desde los `pb_hooks`.
   - *Resultado Obtenido:* Aprobado. Evaluado correctamente en `34_rbac_admin.pb.js`.

## 4. Problemas Corregidos y Pendientes

- **Estado Actual:** El sistema y la arquitectura base no requieren refactorizaciones profundas para RBAC. PocketBase actúa con robustez y el diseño del frontend de enrutamiento consume el objeto unificado `effective_permissions` de forma segura.
- **Riesgos/Pendientes:** No hay severidades altas ni riesgos críticos detectados. El sistema se comporta exactamente de acuerdo con los criterios y el alcance establecidos, y bloquea activamente tanto las visualizaciones parciales de datos como los accesos desautorizados por URL.
- **Recomendación:** Mantener la política de que las nuevas pantallas deben registrar un `CORE_PERMISSION` en la semilla (`1790000052_seed_rbac_defaults.js`) y agregarse explícitamente en el condicional de enrutado de `layout.js` para evitar que asuman el `fallbackAccess` por defecto.