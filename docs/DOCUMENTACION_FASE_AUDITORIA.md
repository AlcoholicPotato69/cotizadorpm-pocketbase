# Auditoría Técnica y Diagnóstico General: Marketing Hub (Cotizador PM / CP)

## 1. Mapa Técnico del Sistema

**Arquitectura Actual:**
*   **Modelo de Despliegue:** Sistema monolítico separado lógicamente. Backend basado en PocketBase (Go + SQLite empaquetado). Frontend como Single Page Application (SPA) sirviendo archivos estáticos (`HTML`/`JS`/`CSS`/`TailwindCSS` nativos, sin frameworks de compilación como React/Vue).
*   **Multi-tenant:** Soporta nativamente dos tenants principales: `plaza_mayor` y `casa_de_piedra`. El frontend renderiza temas condicionales (red para PM, naranja para CP) basados en estas variables.
*   **Backend:** PocketBase actúa como base de datos, gestor de autenticación y API principal. Utiliza _hooks_ de Goja (archivos `.pb.js` en `pb_hooks/`) para implementar lógica de negocio, validaciones transaccionales y aplicación de reglas de RBAC (Role-Based Access Control) del lado del servidor.
*   **Frontend:** `frontend/client/` centraliza todo el código cliente. Archivos como `index.html` (dashboard) y `js/layout.js` se encargan de la sesión y renderizado visual de módulos.

**Flujo Frontend/Backend:**
1.  **Arranque:** El frontend lee su configuración en runtime (desde `hub-config.js` y `hub-runtime.json`).
2.  **Autenticación:** El usuario hace login. La petición va a `/api/hub/session/login` (hook custom que extiende la autenticación por defecto de PB). El servidor valida y devuelve un token + un objeto de usuario enriquecido con metadatos de permisos calculados (`effective_permissions_map`).
3.  **Renderizado Dinámico:** En `layout.js` e `index.html`, las funciones `canAccessCurrentRoute` y `resolveEffective` interpretan estos permisos. Si el usuario tiene acceso, se pintan las *cards* de herramientas (Cotizaciones, Clientes, Reportes, etc.). En caso contrario, se deniega el acceso a nivel UI (`window.__HUB_PAGE_ACCESS_DENIED = true` y redirect).
4.  **Backend Enforcement:** Las colecciones de PocketBase (a nivel de sus API Rules en SQLite) y los *hooks* verifican los permisos en cada operación de lectura/escritura (Data Rules), usando el perfil devuelto por el motor RBAC.

## 2. Flujo Real de Permisos y Sesión

1.  **La Fuente de Verdad:** `backend/pb_hooks/rbac_shared.js`.
    *   Este archivo define cómo se evalúan las reglas. Al hacer login, `resolveEffective(authRecord, tenantInput)` calcula los permisos efectivos cruzando:
        1. Los Roles asignados (ej. `admin`, `verificador`, etc.) definidos en `app_roles`.
        2. *Tenant* seleccionado o por defecto.
        3. Metadatos de usuario (`app_metadata.rbac.effective`).
2.  **Inyección en Sesión:** El hook de auth inyecta en el JSON del token/usuario (propiedad `effective_permissions_map` y `permissions`) los booleanos permitidos (ej: `orders_view: true`, `clients_manage: false`).
3.  **Detección de Admin:**
    *   Un admin se detecta lógicamente en varios puntos:
        *   Si el rol literal es `admin`, `superadmin`.
        *   Si tiene un token de rol asociado al ID del rol administrador.
        *   Variables *legacy* de migración: `profile.is_admin === true` o `profile.rbac_is_admin === true`.
    *   El método clave `hasAdminRole` y `isEffectiveAdminRecord` en el backend validan esto. En el frontend, `layout.js` hace `isAdminByPermission = profileExplicitAdmin || mapHasAdmin || directHasAdmin;`.
4.  **Usuarios Multirol / Multitenant:**
    *   Se determinan en la propiedad `allowed_tenants`. Un usuario puede tener `["plaza_mayor", "casa_de_piedra"]`.
    *   En el Dashboard (`index.html`), se llama a `renderTenantSwitchDashboard`. Si un usuario tiene ambos tenants, se le muestra un *switcher* (una interfaz visual para elegir desde qué sede quiere trabajar), ajustando los enlaces del dashboard hacia `/cotizador/` o `/cotizadorcp/`.
5.  **Protección de Rutas (Frontend):**
    *   `layout.js` se engancha al ciclo de vida con `resolveManagedLayoutAuthContext()`. Evalúa la URL actual (`resolveLayoutRouteContext()`).
    *   Llama a `canAccessCurrentRoute(routeCtx, authCtx)`.
    *   Si devuelve `false`, la navegación por URL bloquea el acceso redirigiendo al index (Dashboard) o a Login con un mensaje de denegación (`window.__HUB_PAGE_ACCESS_DENIED_REASON = 'tenant_forbidden'`).

## 3. Lista de Problemas Detectados e Inconsistencias

*   **(ALTO) Duplicidad Lógica en Detección de Admin:** El cálculo de privilegios de administrador está fragmentado. En el frontend se usan campos variados (`is_admin`, `rbac_is_admin`, `appMetaRbac.is_admin`, `appMetaRbac.admin`, verificación de strings literales). En el backend `rbac_shared.js` y `34_rbac_admin.pb.js` tienen su propia resolución iterativa de tokens. Esto es un vector alto para *Bypass* o desincronización si cambian las estructuras.
*   **(MEDIO) Redundancia de Rutas Tenant en Frontend:** La validación se apoya en el parsing de la URL (`isPM = /\/cotizador(\/|$)/`, `isCP = /\/cotizadorcp(\/|$)/`). Si se manipula el enrutamiento o el nombre del directorio, la seguridad UI falla en identificar el tenant y asume fallbacks inseguros.
*   **(MEDIO) Cálculo en Frontend de `hasExplicitDashboardPermission`:** El archivo `index.html` cuenta con múltiples _if-else_ rígidos (ej. `normalizedRole === 'verificador'`, `key === 'reports'`, etc.) para decidir qué *card* pintar, en lugar de apoyarse 100% en las llaves genéricas devueltas por el Backend. Si en PB se crea un rol mixto, el dashboard fallará en renderizarlo correctamente sin parchear `index.html`.
*   **(BAJO) Bloqueos de Seguridad UI (SPA):** La SPA previene el acceso con scripts en `layout.js` (redirecciones). Si falla el JS o el usuario entra por un proxy directo y la validación en *PocketBase API Rules* no es estricta o está mal mapeada, la pantalla podría denegar UI pero la API aún podría procesar llamadas.

## 4. Riesgos de Seguridad Detectados

1.  **Divergencia Auth Estado Cliente/Servidor:** El frontend sincroniza estados de RBAC basándose en *LocalStorage/SessionStorage* de manera temporal (`layoutAuthEnsurePromise`, `sessionStorage`). Si un admin revoca el permiso de un usuario en la BD, la sesión de ese usuario seguirá activa en el frontend hasta que se dispare una recarga obligatoria o el token expire (`SESSION_INACTIVITY_WINDOW_MS = 2h`), dejando una ventana donde un usuario revocado ve herramientas. *Mitigación actual: Validaciones backend.*
2.  **Spoofing UI (Inyección XSS secundaria):** `security.js` tiene utilidades de escape, pero en `index.html` el manejo de notificaciones dinámicas (usando `innerHTML` concatenado y escapado superficial) y metadata JSON directa puede ser sujeto a ataques si se inyectan comillas rotas en `user_overrides`.
3.  **Falsos positivos Admin (Escalamiento):** Las variantes para determinar `is_admin` o `rbac_is_admin` provienen del `app_metadata` el cual en PocketBase es un JSON dinámico. Si una API Rule antigua permite edición del `app_metadata` por un usuario no-admin (un bug en API Rules del collection `app_users`), el usuario podría inyectarse `{rbac: {admin: true}}` y ganar acceso global.

## 5. Archivos Clave Involucrados

*   `backend/pb_hooks/rbac_shared.js`: **Core absoluto del servidor.** Define el acceso efectivo cruzando roles, overrides y tenants.
*   `frontend/client/js/layout.js`: **Core del frontend.** Orquesta sesión, `canAccessCurrentRoute` y la visibilidad de links globales.
*   `frontend/client/index.html`: **Punto de entrada y Dashboard.** Tiene la lógica de renderizado por rol (`canShowDashboardApp`, `filterDashboardAppsByAssignedModules`).
*   `backend/pb_hooks/34_rbac_admin.pb.js`: Controlador API para acciones administrativas.
*   `frontend/client/services/auth.js`: Wrapper de cliente para login y caché de sesión local.

## 6. Plan Técnico Recomendado para Siguientes Fases

**Fase 1: Unificación de la Fuente de Verdad para Admin**
*   Consolidar la comprobación de Admin. Remover verificaciones de `profile.is_admin` y `rbac_is_admin` diseminadas por el frontend y usar un único flag estandarizado retornado por el backend en la sesión: `session.user.isAdmin`.
*   Asegurar que el endpoint de actualización de usuarios solo permita mutar `app_metadata.rbac` por admins reales autenticados.

**Fase 2: Refactor UI Render por Permisos (Dashboard)**
*   Modificar `index.html` para no hacer lógica harcodeada de nombres de roles (`if (normalizedRole === 'verificador')`).
*   El backend debe decir exactamente qué módulos puede ver la persona enviando un flag de permisos directo (`profile.permissions.control_view == true`), haciendo el frontend puramente declarativo y _dumb_.

**Fase 3: Sincronización Tiempo Real de RBAC**
*   Utilizar los WebSockets (realtime subscriptions de PB) no solo para notificaciones, sino para forzar una desautenticación / recarga forzada del contexto UI si el perfil RBAC del usuario es modificado en el backend, cerrando la ventana de vulnerabilidad de 2 horas.

## 7. Prioridades Recomendadas

1.  **(Crítico)** Verificar `API Rules` de `app_users` y garantizar que ningún usuario, aparte del backend, puede modificar el campo `app_metadata` ni `role_ids`.
2.  **(Alto)** Estandarizar la bandera `isAdmin` a través de todas las capas para unificar la condición.
3.  **(Medio)** Refactorizar el renderizado condicional de `index.html` para depender únicamente del array/objeto de permisos evaluado, abstrayendo el `role` explícito.
4.  **(Bajo)** Mejorar el tiempo de retención de sesión y sincronización del Storage.
