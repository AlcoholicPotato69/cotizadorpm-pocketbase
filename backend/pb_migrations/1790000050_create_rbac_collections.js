/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function saveCollectionIfMissing(factory) {
    const existing = findCollection(factory.name);
    if (existing) return existing;
    const created = new Collection(factory);
    app.save(created);
    return created;
  }

  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';

  saveCollectionIfMissing({
    type: "base",
    name: "app_roles",
    listRule: adminOnly,
    viewRule: adminOnly,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "slug", type: "text", required: true, max: 80 },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "description", type: "text", required: false, max: 5000 },
      { name: "active", type: "bool", required: false },
      { name: "system_role", type: "bool", required: false },
      { name: "sort_order", type: "number", required: false, min: null, max: null, noDecimal: true },
      { name: "permissions_global", type: "json", required: false },
      { name: "permissions_tenant_overrides", type: "json", required: false },
      { name: "created_by", type: "text", required: false, max: 80 },
      { name: "updated_by", type: "text", required: false, max: 80 }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_app_roles_slug_nocase ON app_roles (LOWER(slug))"
    ]
  });

  saveCollectionIfMissing({
    type: "base",
    name: "rbac_audit_logs",
    listRule: adminOnly,
    viewRule: adminOnly,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "actor_id", type: "text", required: false, max: 80 },
      { name: "actor_name", type: "text", required: false, max: 255 },
      { name: "actor_role", type: "text", required: false, max: 80 },
      { name: "action", type: "text", required: true, max: 160 },
      { name: "tenant", type: "select", required: false, maxSelect: 1, values: ["plaza_mayor", "casa_de_piedra"] },
      { name: "target_type", type: "text", required: false, max: 120 },
      { name: "target_id", type: "text", required: false, max: 120 },
      { name: "success", type: "bool", required: false },
      { name: "reason", type: "text", required: false, max: 5000 },
      { name: "metadata", type: "json", required: false },
      { name: "created_at", type: "date", required: false },
      { name: "updated_at", type: "date", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_rbac_audit_action_created_at ON rbac_audit_logs (action, created_at)",
      "CREATE INDEX idx_rbac_audit_actor_created_at ON rbac_audit_logs (actor_id, created_at)"
    ]
  });

  saveCollectionIfMissing({
    type: "base",
    name: "rbac_settings",
    listRule: adminOnly,
    viewRule: adminOnly,
    createRule: adminOnly,
    updateRule: adminOnly,
    deleteRule: adminOnly,
    fields: [
      { name: "clave", type: "text", required: true, max: 120 },
      { name: "valor", type: "text", required: false, max: 1200 }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_rbac_settings_clave_nocase ON rbac_settings (LOWER(clave))"
    ]
  });
}, (app) => {
  const names = ["rbac_settings", "rbac_audit_logs", "app_roles"];
  for (let i = 0; i < names.length; i += 1) {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(names[i]);
    } catch (_) {
      collection = null;
    }
    if (!collection) continue;
    app.delete(collection);
  }
});
