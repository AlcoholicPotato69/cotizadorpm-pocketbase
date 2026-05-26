# Modelo de Autorización y Permisos (RBAC)

Este documento detalla técnicamente la autorización dinámica empleada en todo el Hub del Cotizador y cómo funciona la delegación de poderes a usuarios operativos.

## Core: La Única Verdad está en el Backend

Una máxima fundamental de este sistema es que **el frontend solo propone UX**.
Los botones y menús se ocultan como una cortesía visual cuando el usuario "Sabe" que no tiene permisos; esto se deriva del endpoint de sesión en su variable `effective_permissions`.

Sin embargo, **cualquier intento deliberado** de inyectar acciones (`curl`, inyecciones, o desocultar un botón por herramientas de desarrollo HTML) chocará frente a la capa central de protección instalada en PocketBase. Toda petición transaccional importante es atrapada por una barrera en Goja.

## Evaluador Central (`rbac_shared.js`)

En el archivo `backend/pb_hooks/rbac_shared.js` reside la fábrica de lógica condicional `resolveEffective()`.

1. Toma el Perfil (User) base.
2. Agrega roles explícitos si los tiene (`role_ids`).
3. Agrega reglas de sede / tenant (`allowed_tenants`).
4. Revisa si el Rol Principal es **admin** o en su defecto Superusuario.
   * Si es `admin`, el sistema "Bypass-ea" las validaciones del array de `CORE_PERMISSIONS` y automáticamente mapea todas las acciones de ese objeto a `true`.
5. Filtra Permisos Globales y Permisos Directos (Overrides).
6. Combina los Allow/Deny.

## Barreras (Hooks) de Colección

La protección sobre registros la realiza `authorizeOrThrow()`. Si vemos una intercepción como la siguiente en un `pb_hooks/*.pb.js`:

```javascript
onRecordUpdateRequest(function (e) {
  enforceQuotePermission(e, "orders_edit", "No tienes permisos.");
  e.next();
}, "cotizaciones");
```

Esto impide cualquier `PATCH` hacia `cotizaciones` salvo que el usuario en el backend tenga mapeado el scope `orders_edit = true`.

## Tipos de Permisos Nucleares

* `access`: Permite iniciar sesión en un tenant dado.
* `catalog_view`, `catalog_manage`: Acceso a espacios.
* `orders_view`, `orders_edit`: Para cotizaciones y agenda.
* `quotes_delete`: Protección estricta contra la eliminación de cotizaciones.
* `contracts_view`, `contracts_generate`, `receipts_view`, `invoices_view`: Toda la zona de liquidación económica.
* `clients_view`, `clients_manage`, `clients_create`: Trato comercial de cuentas.
* `clients_verify`: Un permiso especial de "Auditor/Verificador", la única persona capaz de aceptar un documento de Acta Constitutiva y darle pase verde a un contrato formal.

## Prevención contra Inyecciones Internas

Si un rol ordinario (`ventas`) intenta mandar un Request HTTP manual hacia `PATCH /api/collections/app_users/records/ID_DEL_PROPIO_USUARIO` añadiendo de forma astuta `"role": "admin"`, esta operación será filtrada y revertida (lanzando `BadRequestError`) por el webhook explícito `34_rbac_admin.pb.js` donde validamos que _solo un rol admin puede promover, revocar, y alterar roles, o tenants_ de los perfiles.
