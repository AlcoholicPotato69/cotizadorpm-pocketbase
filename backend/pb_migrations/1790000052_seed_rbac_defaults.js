/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const CORE_KEYS = [
    "access",
    "catalog_view",
    "catalog_manage",
    "orders_view",
    "orders_edit",
    "quotes_delete",
    "contracts_view",
    "contracts_generate",
    "receipts_view",
    "invoices_view",
    "reports_view",
    "clients_view",
    "clients_manage",
    "clients_create",
    "clients_verify",
    "clients_all_docs",
    "control_view",
    "pdf_layout_manage",
    "config_manage",
    "users_manage",
    "roles_manage",
    "permissions_manage"
  ];

  function trim(value) {
    return String(value || "").trim();
  }

  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function normalizeRole(value) {
    return trim(value).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function upsertRole(collection, payload) {
    const slug = normalizeRole(payload.slug);
    if (!slug) return;
    let record = null;
    try {
      record = app.findFirstRecordByData("app_roles", "slug", slug);
    } catch (_) {
      record = null;
    }
    if (!record) record = new Record(collection);
    record.set("slug", slug);
    record.set("name", trim(payload.name) || slug);
    record.set("description", trim(payload.description));
    record.set("active", payload.active !== false);
    record.set("system_role", payload.system_role === true);
    record.set("sort_order", Number(payload.sort_order || 0));
    record.set("permissions_global", payload.permissions_global || { allow: [], deny: [] });
    record.set("permissions_tenant_overrides", payload.permissions_tenant_overrides || {});
    app.save(record);
  }

  function upsertSetting(collection, key, value) {
    const safeKey = trim(key);
    if (!safeKey) return;
    let record = null;
    try {
      record = app.findFirstRecordByData("rbac_settings", "clave", safeKey);
    } catch (_) {
      record = null;
    }
    if (!record) record = new Record(collection);
    record.set("clave", safeKey);
    record.set("valor", trim(value));
    app.save(record);
  }

  const roleCollection = findCollection("app_roles");
  const settingsCollection = findCollection("rbac_settings");
  if (!roleCollection || !settingsCollection) return;

  upsertRole(roleCollection, {
    slug: "admin",
    name: "Administrador",
    description: "Control total de la plataforma.",
    active: true,
    system_role: true,
    sort_order: 10,
    permissions_global: { allow: CORE_KEYS, deny: [] }
  });

  upsertRole(roleCollection, {
    slug: "verificador",
    name: "Verificador",
    description: "Valida documentos y controla expediente.",
    active: true,
    system_role: true,
    sort_order: 20,
    permissions_global: {
      allow: [
        "access",
        "catalog_view",
        "catalog_manage",
        "clients_view",
        "clients_verify",
        "clients_all_docs",
        "control_view"
      ],
      deny: ["orders_edit", "quotes_delete", "users_manage", "roles_manage", "permissions_manage"]
    }
  });

  upsertRole(roleCollection, {
    slug: "alta_clientes",
    name: "Alta Clientes",
    description: "Captura y administra altas de clientes.",
    active: true,
    system_role: true,
    sort_order: 30,
    permissions_global: {
      allow: [
        "access",
        "clients_view",
        "clients_manage",
        "clients_create",
        "reports_view",
        "contracts_view",
        "receipts_view",
        "invoices_view"
      ],
      deny: ["catalog_manage", "clients_verify", "quotes_delete", "users_manage", "roles_manage", "permissions_manage"]
    }
  });

  upsertRole(roleCollection, {
    slug: "plaza_mayor",
    name: "Agente Plaza Mayor",
    description: "Operacion comercial PM.",
    active: true,
    system_role: true,
    sort_order: 40,
    permissions_global: {
      allow: [
        "access",
        "catalog_view",
        "orders_view",
        "orders_edit",
        "reports_view",
        "clients_view",
        "clients_manage",
        "contracts_view",
        "receipts_view",
        "invoices_view"
      ],
      deny: ["clients_verify", "quotes_delete", "users_manage", "roles_manage", "permissions_manage"]
    }
  });

  upsertRole(roleCollection, {
    slug: "casa_de_piedra",
    name: "Agente Casa de Piedra",
    description: "Operacion comercial CP.",
    active: true,
    system_role: true,
    sort_order: 50,
    permissions_global: {
      allow: [
        "access",
        "catalog_view",
        "orders_view",
        "orders_edit",
        "reports_view",
        "clients_view",
        "clients_manage",
        "contracts_view",
        "receipts_view",
        "invoices_view"
      ],
      deny: ["clients_verify", "quotes_delete", "users_manage", "roles_manage", "permissions_manage"]
    }
  });

  upsertSetting(settingsCollection, "enforcement_mode", "enforce");
}, (_app) => {
  // No-op: conserva semilla y modo.
});
