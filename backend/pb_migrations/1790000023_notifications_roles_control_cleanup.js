/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const APP_ROLES = ["admin", "plaza_mayor", "casa_de_piedra", "verificador"];
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const adminOnly = '@request.auth.id != "" && @request.auth.role = "admin"';
  const adminVerifierOnly = '@request.auth.id != "" && (@request.auth.role = "admin" || @request.auth.role = "verificador")';
  const ownNotification = '@request.auth.id != "" && (user_id = @request.auth.id || @request.auth.role = "admin")';
  const tenantScopedAccess = [
    '@request.auth.id != ""',
    '&& (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= tenant',
    '  || @request.auth.tenant_default = tenant',
    '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
    ')'
  ].join(" ");
  const tenantScopedCreate = [
    '@request.auth.id != ""',
    '&& (',
    '  @request.auth.role = "admin"',
    '  || @request.auth.role = "verificador"',
    '  || @request.auth.allowed_tenants ?= @request.body.tenant',
    '  || @request.auth.tenant_default = @request.body.tenant',
    '  || (@request.auth.role = "plaza_mayor" && @request.body.tenant = "plaza_mayor")',
    '  || (@request.auth.role = "casa_de_piedra" && @request.body.tenant = "casa_de_piedra")',
    ')'
  ].join(" ");

  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function getField(collection, name) {
    try {
      return collection.fields.getByName(name);
    } catch (_) {
      return null;
    }
  }

  function addFieldIfMissing(collection, name, factory) {
    const existing = getField(collection, name);
    if (existing) return existing;
    const field = factory();
    collection.fields.add(field);
    return field;
  }

  function trim(value) {
    return String(value || "").trim();
  }

  function normalizeTenant(value) {
    const tenant = trim(value).toLowerCase();
    return TENANTS.indexOf(tenant) !== -1 ? tenant : "";
  }

  function normalizeRoleForRecord(record) {
    let role = trim(record && record.getString ? record.getString("role") : "").toLowerCase();
    if (role === "administrador" || role === "superadmin" || role === "super_admin") return "admin";
    if (APP_ROLES.indexOf(role) !== -1) return role;
    const tenantDefault = normalizeTenant(record ? record.get("tenant_default") : "");
    return tenantDefault || "plaza_mayor";
  }

  const users = findCollection("app_users");
  if (users) {
    try {
      let offset = 0;
      while (true) {
        const records = app.findRecordsByFilter("app_users", 'id != ""', "", 500, offset) || [];
        if (!records.length) break;
        for (let i = 0; i < records.length; i += 1) {
          const record = records[i];
          const role = normalizeRoleForRecord(record);
          const tenantDefault = normalizeTenant(record.get("tenant_default")) || (role === "casa_de_piedra" ? "casa_de_piedra" : "plaza_mayor");
          record.set("role", role);
          record.set("tenant_default", tenantDefault);
          if (role === "admin" || role === "verificador") record.set("allowed_tenants", TENANTS);
          else if (role === "plaza_mayor" || role === "casa_de_piedra") record.set("allowed_tenants", [role]);
          app.save(record);
        }
        if (records.length < 500) break;
        offset += records.length;
      }
    } catch (err) {
      console.log("[roles cleanup] No se pudieron normalizar usuarios:", String(err));
    }

    const roleField = getField(users, "role");
    if (roleField) {
      roleField.values = APP_ROLES;
      roleField.required = true;
      roleField.maxSelect = 1;
    }
    const tenantField = getField(users, "tenant_default");
    if (tenantField) {
      tenantField.values = TENANTS;
      tenantField.required = true;
      tenantField.maxSelect = 1;
    }
    const allowedField = getField(users, "allowed_tenants");
    if (allowedField) {
      allowedField.values = TENANTS;
      allowedField.required = true;
      allowedField.maxSelect = 2;
    }
    app.save(users);
  }

  let notifications = findCollection("hub_notifications");
  if (!notifications && users) {
    notifications = new Collection({
      type: "base",
      name: "hub_notifications",
      listRule: ownNotification,
      viewRule: ownNotification,
      createRule: adminOnly,
      updateRule: ownNotification,
      deleteRule: ownNotification,
      fields: [
        { name: "user_id", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: "title", type: "text", required: true, max: 180 },
        { name: "message", type: "text", required: false, max: 600 },
        { name: "type", type: "text", required: false, max: 40 },
        { name: "source_app", type: "text", required: false, max: 80 },
        { name: "link", type: "text", required: false, max: 255 },
        { name: "read_at", type: "date", required: false },
        { name: "metadata", type: "json", required: false },
        { name: "created_at", type: "date", required: false },
        { name: "updated_at", type: "date", required: false }
      ],
      indexes: [
        "CREATE INDEX idx_hub_notifications_user_created ON hub_notifications (user_id, created_at)",
        "CREATE INDEX idx_hub_notifications_source ON hub_notifications (source_app, type)"
      ]
    });
    app.save(notifications);
  } else if (notifications) {
    notifications.listRule = ownNotification;
    notifications.viewRule = ownNotification;
    notifications.createRule = adminOnly;
    notifications.updateRule = ownNotification;
    notifications.deleteRule = ownNotification;

    if (users) {
      const relationField = addFieldIfMissing(notifications, "user_id", () => new RelationField({
        name: "user_id",
        required: true,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: true
      }));
      relationField.required = true;
      relationField.maxSelect = 1;
      relationField.collectionId = users.id;
    }
    addFieldIfMissing(notifications, "title", () => new TextField({ name: "title", required: true, max: 180 }));
    addFieldIfMissing(notifications, "message", () => new TextField({ name: "message", required: false, max: 600 }));
    addFieldIfMissing(notifications, "type", () => new TextField({ name: "type", required: false, max: 40 }));
    addFieldIfMissing(notifications, "source_app", () => new TextField({ name: "source_app", required: false, max: 80 }));
    addFieldIfMissing(notifications, "link", () => new TextField({ name: "link", required: false, max: 255 }));
    addFieldIfMissing(notifications, "read_at", () => new DateField({ name: "read_at", required: false }));
    addFieldIfMissing(notifications, "metadata", () => new JSONField({ name: "metadata", required: false }));
    addFieldIfMissing(notifications, "created_at", () => new DateField({ name: "created_at", required: false }));
    addFieldIfMissing(notifications, "updated_at", () => new DateField({ name: "updated_at", required: false }));
    const indexes = Array.isArray(notifications.indexes) ? notifications.indexes.slice() : [];
    [
      "CREATE INDEX idx_hub_notifications_user_created ON hub_notifications (user_id, created_at)",
      "CREATE INDEX idx_hub_notifications_source ON hub_notifications (source_app, type)"
    ].forEach((idx) => {
      if (indexes.indexOf(idx) === -1) indexes.push(idx);
    });
    notifications.indexes = indexes;
    app.save(notifications);
  }

  const control = findCollection("control_movimientos");
  if (control) {
    control.listRule = adminVerifierOnly;
    control.viewRule = adminVerifierOnly;
    control.createRule = adminOnly;
    control.updateRule = adminOnly;
    control.deleteRule = adminOnly;
    app.save(control);
  }

  const dictamenes = findCollection("clientes_dictamenes");
  if (dictamenes) {
    dictamenes.listRule = adminVerifierOnly;
    dictamenes.viewRule = adminVerifierOnly;
    dictamenes.createRule = adminVerifierOnly;
    dictamenes.updateRule = adminOnly;
    dictamenes.deleteRule = adminOnly;
    app.save(dictamenes);
  }

  const clientes = findCollection("clientes");
  if (clientes) {
    clientes.listRule = tenantScopedAccess;
    clientes.viewRule = tenantScopedAccess + ' || (@request.auth.id = "" && perfil_publico_token != "")';
    clientes.createRule = tenantScopedCreate;
    clientes.updateRule = tenantScopedAccess + ' || (@request.auth.id = "" && perfil_publico_token != "")';
    clientes.deleteRule = adminOnly;
    app.save(clientes);
  }

  const pdfOverlays = findCollection("pdf_overlays");
  if (pdfOverlays) {
    const overlayRead = [
      '@request.auth.id != ""',
      '&& (',
      '  @request.auth.role = "admin"',
      '  || @request.auth.role = "verificador"',
      '  || @request.auth.allowed_tenants ?= tenant',
      '  || @request.auth.tenant_default = tenant',
      '  || (@request.auth.role = "plaza_mayor" && tenant = "plaza_mayor")',
      '  || (@request.auth.role = "casa_de_piedra" && tenant = "casa_de_piedra")',
      ')'
    ].join(" ");
    pdfOverlays.listRule = overlayRead;
    pdfOverlays.viewRule = overlayRead;
    app.save(pdfOverlays);
  }
}, (app) => {
  const notifications = (() => {
    try {
      return app.findCollectionByNameOrId("hub_notifications");
    } catch (_) {
      return null;
    }
  })();
  if (notifications) app.delete(notifications);
});
