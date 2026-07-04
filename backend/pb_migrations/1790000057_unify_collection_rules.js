/// <reference path="../pb_data/types.d.ts" />

// REGLA ÚNICA UNIFICADA (cero redundancia de políticas):
// - Una sola regla permisiva por operación, con OR lógico. Se eliminan las cláusulas
//   solapadas (role="admin" || role="verificador" || tenant_default = tenant ||
//   role="plaza_mayor" && tenant=... etc.) que divergían del engine RBAC.
// - Las reglas referencian ÚNICAMENTE campos materializados del usuario autenticado
//   (is_admin, allowed_tenants, role), evaluados una sola vez por request por PocketBase
//   (equivalente nativo de la optimización "(select auth.uid())" de Postgres RLS).
// - El permiso fino por acción (orders_edit, catalog_manage, quotes_delete, etc.)
//   lo aplican los hooks del engine RBAC; la base aplica la regla coarse de tenant.
migrate((app) => {
  const authed = '@request.auth.id != ""';
  const isAdmin = "@request.auth.is_admin = true";

  // Staff = admin o verificador. El rol legacy "verificador" es confiable porque el
  // backend lo sincroniza desde los roles RBAC (syncUserAdminFlag). Único caso donde
  // una regla referencia el campo "role".
  const adminRule = `${authed} && ${isAdmin}`;

  // ponytail: PocketBase no evalúa `allowed_tenants ?= tenant` en @request.auth (multiselect auth);
  // tenant_default materializado sí funciona — fallback hasta PB lo corrija o haya campo escalar.
  const readTenant = `${authed} && (${isAdmin} || @request.auth.tenant_default = tenant || @request.auth.allowed_tenants ?= tenant)`;
  const writeTenant = readTenant;
  const writeTenantBody = `${authed} && (${isAdmin} || @request.auth.tenant_default = @request.body.tenant || @request.auth.allowed_tenants ?= @request.body.tenant)`;

  // Cláusulas públicas anónimas preexistentes (se conservan como OR de la regla única).
  const publicCpConfigRead = `(${readTenant}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && (clave = "premontaje_pct" || clave = "hora_extra_cfg"))`;
  const publicCpConceptsRead = `(${readTenant}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)`;
  const publicSpacesRead = `(activo = true) || (${readTenant})`;
  const publicQuotesRead = `(${readTenant}) || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))`;
  const publicQuoteCreate = `(${writeTenantBody}) || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))`;

  const selfOrAdmin = `${authed} && (id = @request.auth.id || ${isAdmin})`;
  const ownNotification = `${authed} && (user_id = @request.auth.id || ${isAdmin})`;

  function applyRules(name, rules) {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(name);
    } catch (_) {
      return;
    }
    if (!collection) return;
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  }

  applyRules("clientes", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("conceptos_catalogo", {
    listRule: publicCpConceptsRead,
    viewRule: publicCpConceptsRead,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("configuracion", {
    listRule: publicCpConfigRead,
    viewRule: publicCpConfigRead,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("impuestos", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("espacios", {
    listRule: publicSpacesRead,
    viewRule: publicSpacesRead,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("cotizaciones", {
    listRule: publicQuotesRead,
    viewRule: publicQuotesRead,
    createRule: publicQuoteCreate,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("documentos", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("clientes_dictamenes", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("control_movimientos", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule
  });

  applyRules("pdf_generator_settings", {
    listRule: adminRule,
    viewRule: adminRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule
  });

  applyRules("pdf_overlays", {
    listRule: readTenant,
    viewRule: readTenant,
    createRule: writeTenantBody,
    updateRule: writeTenant,
    deleteRule: writeTenant
  });

  applyRules("hub_notifications", {
    listRule: ownNotification,
    viewRule: ownNotification,
    createRule: adminRule,
    updateRule: ownNotification,
    deleteRule: ownNotification
  });

  applyRules("app_users", {
    listRule: adminRule,
    viewRule: selfOrAdmin,
    createRule: adminRule,
    updateRule: selfOrAdmin,
    deleteRule: adminRule
  });

  applyRules("app_roles", {
    listRule: adminRule,
    viewRule: adminRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule
  });

  applyRules("rbac_settings", {
    listRule: adminRule,
    viewRule: adminRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule
  });

  applyRules("rbac_audit_logs", {
    listRule: adminRule,
    viewRule: adminRule,
    createRule: adminRule,
    updateRule: adminRule,
    deleteRule: adminRule
  });
}, (_app) => {
  // No-op intencional: no se reinstalan las reglas legacy divergentes.
});
