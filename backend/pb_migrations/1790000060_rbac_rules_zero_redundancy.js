/// <reference path="../pb_data/types.d.ts" />

// Reaplica reglas unificadas sin cláusulas role="verificador" (1790000059 las reintrodujo).
// Fuente coarse: is_admin || allowed_tenants ?= tenant. Permiso fino: hooks RBAC.
migrate((app) => {
  const authed = '@request.auth.id != ""';
  const isAdmin = "@request.auth.is_admin = true";
  const adminRule = `${authed} && ${isAdmin}`;
  // ponytail: tenant_default como fallback escalar; allowed_tenants en @request.auth no filtra en PB multiselect.
  const readTenant = `${authed} && (${isAdmin} || @request.auth.tenant_default = tenant || @request.auth.allowed_tenants ?= tenant)`;
  const writeTenant = readTenant;
  const writeTenantBody = `${authed} && (${isAdmin} || @request.auth.tenant_default = @request.body.tenant || @request.auth.allowed_tenants ?= @request.body.tenant)`;

  const publicCpConfigRead = `(${readTenant}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && (clave = "premontaje_pct" || clave = "hora_extra_cfg"))`;
  const publicCpConceptsRead = `(${readTenant}) || (@request.auth.id = "" && tenant = "casa_de_piedra" && activo = true)`;
  const publicSpacesRead = `(activo = true) || (${readTenant})`;
  const publicQuotesRead = `(${readTenant}) || (@request.auth.id = "" && (status = "aprobada" || status = "finalizada"))`;
  const publicQuoteCreate = `(${writeTenantBody}) || (@request.auth.id = "" && (@request.body.status = "" || @request.body.status = "pendiente"))`;

  const selfOrAdmin = `${authed} && (id = @request.auth.id || ${isAdmin})`;
  const ownNotification = `${authed} && (user_id = @request.auth.id || ${isAdmin})`;

  const rulesByCollection = {
    clientes: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    conceptos_catalogo: {
      listRule: publicCpConceptsRead,
      viewRule: publicCpConceptsRead,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    configuracion: {
      listRule: publicCpConfigRead,
      viewRule: publicCpConfigRead,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    impuestos: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    espacios: {
      listRule: publicSpacesRead,
      viewRule: publicSpacesRead,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    cotizaciones: {
      listRule: publicQuotesRead,
      viewRule: publicQuotesRead,
      createRule: publicQuoteCreate,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    documentos: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    clientes_dictamenes: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    control_movimientos: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule
    },
    pdf_generator_settings: {
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule
    },
    pdf_overlays: {
      listRule: readTenant,
      viewRule: readTenant,
      createRule: writeTenantBody,
      updateRule: writeTenant,
      deleteRule: writeTenant
    },
    hub_notifications: {
      listRule: ownNotification,
      viewRule: ownNotification,
      createRule: adminRule,
      updateRule: ownNotification,
      deleteRule: ownNotification
    },
    app_users: {
      listRule: adminRule,
      viewRule: selfOrAdmin,
      createRule: adminRule,
      updateRule: selfOrAdmin,
      deleteRule: adminRule
    },
    app_roles: {
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule
    },
    rbac_settings: {
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule
    },
    rbac_audit_logs: {
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule
    }
  };

  Object.keys(rulesByCollection).forEach((name) => {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(name);
    } catch (_) {
      collection = null;
    }
    if (!collection) return;
    const rules = rulesByCollection[name];
    Object.keys(rules).forEach((key) => {
      collection[key] = rules[key];
    });
    app.save(collection);
  });
}, (_app) => {
  // No-op: no reinstalar reglas legacy con role= strings.
});
