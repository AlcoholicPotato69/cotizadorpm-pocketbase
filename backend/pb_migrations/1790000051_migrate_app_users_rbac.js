/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const ROLE_PRIORITY = ["admin", "verificador", "alta_clientes", "plaza_mayor", "casa_de_piedra"];

  function trim(value) {
    return String(value || "").trim();
  }

  function parseJson(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return fallback;
    }
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeTenant(value) {
    const safe = trim(value).toLowerCase();
    if (safe === "pm" || safe === "plaza mayor" || safe === "plaza_mayor") return "plaza_mayor";
    if (safe === "cp" || safe === "casa de piedra" || safe === "casa_de_piedra") return "casa_de_piedra";
    return TENANTS.indexOf(safe) !== -1 ? safe : "";
  }

  function normalizeRole(value) {
    let safe = trim(value).toLowerCase();
    if (!safe) return "";
    if (typeof safe.normalize === "function") safe = safe.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    safe = safe.replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
    if (safe === "administrador" || safe === "superadmin" || safe === "super_admin") return "admin";
    if (safe === "plazamayor" || safe === "pm" || safe === "finanzas") return "plaza_mayor";
    if (safe === "casadepiedra" || safe === "cp") return "casa_de_piedra";
    return safe;
  }

  function unique(values) {
    const source = Array.isArray(values) ? values : [values];
    const out = [];
    const seen = {};
    for (let i = 0; i < source.length; i += 1) {
      const safe = trim(source[i]);
      if (!safe || seen[safe]) continue;
      seen[safe] = true;
      out.push(safe);
    }
    return out;
  }

  function normalizePermissionList(values) {
    return unique(values).map(normalizeRole).filter(Boolean);
  }

  function resolvePrimaryRole(tokens, fallbackRole, fallbackTenant) {
    const list = normalizePermissionList(tokens);
    for (let i = 0; i < ROLE_PRIORITY.length; i += 1) {
      if (list.indexOf(ROLE_PRIORITY[i]) !== -1) return ROLE_PRIORITY[i];
    }
    const role = normalizeRole(fallbackRole);
    if (role) return role;
    const tenant = normalizeTenant(fallbackTenant);
    return tenant || "plaza_mayor";
  }

  function normalizeAllowedTenants(raw, primaryRole, tenantDefault) {
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string") {
      const parsed = parseJson(raw, []);
      if (Array.isArray(parsed)) list = parsed;
    }
    list = list.map(normalizeTenant).filter(Boolean);
    const def = normalizeTenant(tenantDefault);
    if (def && list.indexOf(def) === -1) list.push(def);
    if (!list.length) {
      if (primaryRole === "admin" || primaryRole === "verificador" || primaryRole === "alta_clientes") {
        list = TENANTS.slice();
      } else if (primaryRole === "plaza_mayor" || primaryRole === "casa_de_piedra") {
        list = [primaryRole];
      } else if (def) {
        list = [def];
      } else {
        list = ["plaza_mayor"];
      }
    }
    return unique(list);
  }

  function ensureRoleFieldAsText(collection) {
    if (!collection) return;
    // En algunas versiones de PB la mutacion in-place de select->text falla por validacion de "values".
    // Se mantiene el campo actual y la autoridad real queda en app_metadata.rbac.role_ids.
    return;
  }

  let usersCollection = null;
  try {
    usersCollection = app.findCollectionByNameOrId("app_users");
  } catch (_) {
    usersCollection = null;
  }
  if (!usersCollection) return;

  ensureRoleFieldAsText(usersCollection);

  let offset = 0;
  while (true) {
    const rows = app.findRecordsByFilter("app_users", 'id != ""', "", 500, offset) || [];
    if (!rows.length) break;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const roleRaw = normalizeRole(row.getString("role"));
      const tenantDefault = normalizeTenant(row.get("tenant_default")) || (roleRaw === "casa_de_piedra" ? "casa_de_piedra" : "plaza_mayor");
      const appMetadata = safeObject(parseJson(row.get("app_metadata"), {}));
      const rbacMeta = safeObject(appMetadata.rbac);

      const roleIds = unique([
        ...(Array.isArray(rbacMeta.role_ids) ? rbacMeta.role_ids : []),
        ...(Array.isArray(appMetadata.roles) ? appMetadata.roles : []),
        roleRaw
      ]);
      const primaryRole = resolvePrimaryRole(roleIds, roleRaw, tenantDefault);

      const userOverrides = safeObject(rbacMeta.user_overrides);
      const globalOverride = safeObject(userOverrides.global);
      const tenantOverrides = safeObject(userOverrides.tenants);
      const normalizedOverrides = {
        global: {
          allow: unique(globalOverride.allow || []),
          deny: unique(globalOverride.deny || [])
        },
        tenants: {}
      };
      for (let t = 0; t < TENANTS.length; t += 1) {
        const tenantKey = TENANTS[t];
        const tenantValue = safeObject(tenantOverrides[tenantKey]);
        normalizedOverrides.tenants[tenantKey] = {
          allow: unique(tenantValue.allow || []),
          deny: unique(tenantValue.deny || [])
        };
      }

      const allowedTenants = normalizeAllowedTenants(row.get("allowed_tenants"), primaryRole, tenantDefault);
      rbacMeta.role_ids = roleIds;
      rbacMeta.user_overrides = normalizedOverrides;
      appMetadata.rbac = rbacMeta;
      appMetadata.roles = normalizePermissionList(roleIds);
      appMetadata.role_primary = primaryRole;

      row.set("role", primaryRole);
      row.set("tenant_default", tenantDefault);
      row.set("allowed_tenants", allowedTenants);
      row.set("app_metadata", appMetadata);
      app.save(row);
    }
    if (rows.length < 500) break;
    offset += rows.length;
  }
}, (_app) => {
  // No-op: migration intentionally one-way.
});
