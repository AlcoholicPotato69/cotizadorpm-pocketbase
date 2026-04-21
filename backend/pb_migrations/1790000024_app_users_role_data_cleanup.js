/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const APP_ROLES = ["admin", "plaza_mayor", "casa_de_piedra", "verificador"];
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];

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
      else record.set("allowed_tenants", [role]);
      app.save(record);
    }
    if (records.length < 500) break;
    offset += records.length;
  }
}, (_app) => {
  // No-op: legacy role cleanup is intentionally one-way.
});
