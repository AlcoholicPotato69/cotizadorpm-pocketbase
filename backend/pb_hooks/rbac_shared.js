(function () {
  const AUTH_COLLECTION = "app_users";
  const ROLE_COLLECTION = "app_roles";
  const SETTINGS_COLLECTION = "rbac_settings";
  const AUDIT_COLLECTION = "rbac_audit_logs";
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const RBAC_MODE_ENV = "PB_RBAC_MODE";
  const ROLE_CACHE_TTL_MS = 30 * 1000;
  const SETTINGS_CACHE_TTL_MS = 15 * 1000;

  const CORE_PERMISSIONS = Object.freeze({
    access: "Acceso base al tenant",
    catalog_view: "Ver catalogo",
    catalog_manage: "Modificar catalogo",
    orders_view: "Ver cotizaciones",
    orders_edit: "Crear/editar cotizaciones",
    quotes_delete: "Eliminar cotizaciones",
    contracts_view: "Ver contratos",
    contracts_generate: "Generar contratos",
    receipts_view: "Ver recibos",
    invoices_view: "Ver facturas",
    reports_view: "Ver reportes",
    clients_view: "Ver clientes",
    clients_manage: "Gestionar clientes",
    clients_create: "Alta de clientes",
    clients_verify: "Aprobar documentos de clientes",
    clients_all_docs: "Ver todos los documentos",
    control_view: "Ver panel de control",
    pdf_layout_manage: "Editar layouts PDF",
    config_manage: "Gestionar configuracion",
    users_manage: "Gestionar usuarios",
    roles_manage: "Gestionar roles",
    permissions_manage: "Gestionar permisos"
  });

  const roleCache = {
    loadedAt: 0,
    list: [],
    byId: {},
    bySlug: {}
  };

  const settingsCache = {
    loadedAt: 0,
    map: {}
  };

  function nowMs() {
    return new Date().getTime();
  }

  function trim(value) {
    return String(value || "").trim();
  }

  function uniqueStrings(values) {
    const src = Array.isArray(values) ? values : [values];
    const out = [];
    const seen = {};
    for (let i = 0; i < src.length; i += 1) {
      const safe = trim(src[i]);
      if (!safe || seen[safe]) continue;
      seen[safe] = true;
      out.push(safe);
    }
    return out;
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
    safe = safe.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (safe === "administrador" || safe === "superadmin" || safe === "super_admin") return "admin";
    if (safe === "plazamayor" || safe === "pm" || safe === "finanzas") return "plaza_mayor";
    if (safe === "casadepiedra" || safe === "cp") return "casa_de_piedra";
    return safe;
  }

  function normalizePermissionKey(value) {
    let safe = trim(value).toLowerCase();
    if (!safe) return "";
    if (typeof safe.normalize === "function") safe = safe.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return safe.replace(/[^a-z0-9_:.]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function parseJson(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch (_) {
      return fallback;
    }
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function readObjectField(obj, key) {
    const source = obj && typeof obj === "object" ? obj : null;
    const safeKey = trim(key);
    if (!source || !safeKey) return undefined;
    try {
      if (Object.prototype.hasOwnProperty.call(source, safeKey)) return source[safeKey];
    } catch (_) {}
    try {
      if (typeof source.get === "function") return source.get(safeKey);
    } catch (_) {}
    try {
      if (typeof source.Get === "function") return source.Get(safeKey);
    } catch (_) {}
    try {
      return source[safeKey];
    } catch (_) {
      return undefined;
    }
  }

  function normalizeJsonArray(value) {
    if (Array.isArray(value)) return value;
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) return parsed;
    const mapped = safeObject(parsed);
    const fromItems = readObjectField(mapped, "items");
    if (Array.isArray(fromItems)) return fromItems;
    try {
      const reparsed = parseJson(JSON.stringify(value), null);
      if (Array.isArray(reparsed)) return reparsed;
      const mappedReparsed = safeObject(reparsed);
      const reparsedItems = readObjectField(mappedReparsed, "items");
      if (Array.isArray(reparsedItems)) return reparsedItems;
    } catch (_) {}
    return [];
  }

  function readRequestHeader(event, name) {
    const safeName = trim(name);
    if (!safeName) return "";
    const header = event && event.request ? event.request.header : null;
    if (!header) return "";
    try {
      if (typeof header.get === "function") return trim(header.get(safeName));
    } catch (_) {}
    try {
      if (typeof header.values === "function") {
        const values = header.values(safeName);
        if (Array.isArray(values) && values.length) return trim(values[0]);
      }
    } catch (_) {}
    try {
      const direct = header[safeName] || header[safeName.toLowerCase()] || header[safeName.toUpperCase()];
      if (Array.isArray(direct) && direct.length) return trim(direct[0]);
      return trim(direct);
    } catch (_) {}
    return "";
  }

  function normalizePermissionList(list) {
    const source = normalizeJsonArray(list);
    const out = [];
    const seen = {};
    for (let i = 0; i < source.length; i += 1) {
      const key = normalizePermissionKey(source[i]);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function normalizeOverridePair(raw) {
    const source = safeObject(parseJson(raw, {}));
    const allowRaw = readObjectField(source, "allow");
    const denyRaw = readObjectField(source, "deny");
    return {
      allow: normalizePermissionList(allowRaw),
      deny: normalizePermissionList(denyRaw)
    };
  }

  function normalizeTenantOverrides(raw) {
    const source = safeObject(parseJson(raw, {}));
    const out = {};
    for (let i = 0; i < TENANTS.length; i += 1) {
      const tenant = TENANTS[i];
      out[tenant] = normalizeOverridePair(readObjectField(source, tenant));
    }
    return out;
  }

  function readSettingMap(forceReload) {
    const force = forceReload === true;
    if (!force && (nowMs() - settingsCache.loadedAt) < SETTINGS_CACHE_TTL_MS) {
      return settingsCache.map;
    }
    const out = {};
    try {
      const rows = $app.findRecordsByFilter(SETTINGS_COLLECTION, 'id != ""', "", 200, 0) || [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const key = trim(row.getString("clave") || row.getString("key") || row.get("clave") || row.get("key"));
        if (!key) continue;
        out[key] = trim(row.getString("valor") || row.getString("value") || row.get("valor") || row.get("value"));
      }
    } catch (_) {}
    settingsCache.loadedAt = nowMs();
    settingsCache.map = out;
    return out;
  }

  function getRbacMode() {
    return "enforce";
  }

  function readRoleCollection(forceReload) {
    const force = forceReload === true;
    if (!force && (nowMs() - roleCache.loadedAt) < ROLE_CACHE_TTL_MS) {
      return roleCache;
    }

    const list = [];
    const byId = {};
    const bySlug = {};
    try {
      const rows = $app.findRecordsByFilter(ROLE_COLLECTION, 'id != ""', "sort_order,name", 500, 0) || [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const id = trim(row.get("id"));
        const slug = normalizeRole(row.getString("slug") || row.getString("name") || row.get("slug") || row.get("name"));
        if (!id || !slug) continue;
        const role = {
          id: id,
          slug: slug,
          name: trim(row.getString("name") || row.get("name") || slug),
          description: trim(row.getString("description") || row.get("description") || ""),
          active: row.getBool ? row.getBool("active") !== false : (row.get("active") !== false),
          system_role: row.getBool ? row.getBool("system_role") === true : row.get("system_role") === true,
          sort_order: Number(row.getInt ? row.getInt("sort_order") : row.get("sort_order") || 0),
          global: normalizeOverridePair(row.getString ? row.getString("permissions_global") : row.get("permissions_global")),
          byTenant: normalizeTenantOverrides(row.getString ? row.getString("permissions_tenant_overrides") : row.get("permissions_tenant_overrides"))
        };
        list.push(role);
        byId[id] = role;
        bySlug[slug] = role;
      }
    } catch (_) {}

    roleCache.loadedAt = nowMs();
    roleCache.list = list;
    roleCache.byId = byId;
    roleCache.bySlug = bySlug;
    return roleCache;
  }

  function normalizeAllowedTenants(authRecord) {
    if (!authRecord) return [];
    const raw = authRecord.get ? authRecord.get("allowed_tenants") : authRecord.allowed_tenants;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string") {
      const parsed = parseJson(raw, []);
      if (Array.isArray(parsed)) list = parsed;
    }
    list = list.map(normalizeTenant).filter(Boolean);
    const role = normalizeRole(authRecord.getString ? authRecord.getString("role") : authRecord.role);
    const tenantDefault = normalizeTenant(authRecord.get ? authRecord.get("tenant_default") : authRecord.tenant_default);
    if (tenantDefault && list.indexOf(tenantDefault) === -1) list.push(tenantDefault);
    if (!list.length && role && TENANTS.indexOf(role) !== -1) list.push(role);
    return uniqueStrings(list);
  }

  function readAppMetadata(authRecord) {
    if (!authRecord) return {};
    const raw = authRecord.get ? authRecord.get("app_metadata") : authRecord.app_metadata;
    let parsed = parseJson(raw, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed).length) {
      try {
        const fromString = parseJson(String(raw || ""), null);
        if (fromString && typeof fromString === "object" && !Array.isArray(fromString)) {
          parsed = fromString;
        }
      } catch (_) {}
    }
    if ((!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed).length) && raw && typeof raw === "object") {
      try {
        const fromJson = parseJson(JSON.stringify(raw), null);
        if (fromJson && typeof fromJson === "object" && !Array.isArray(fromJson)) {
          parsed = fromJson;
        }
      } catch (_) {}
    }
    return safeObject(parsed);
  }

  function resolveRoleTokens(authRecord) {
    const meta = readAppMetadata(authRecord);
    const rbacMeta = safeObject(readObjectField(meta, "rbac") || meta.rbac);
    const explicit = uniqueStrings(readObjectField(rbacMeta, "role_ids") || rbacMeta.role_ids);
    const legacyRoles = uniqueStrings(meta.roles);
    const recordRole = normalizeRole(authRecord.getString ? authRecord.getString("role") : authRecord.role);
    const out = [];
    const seen = {};
    const add = function (value) {
      const safe = trim(value);
      if (!safe || seen[safe]) return;
      seen[safe] = true;
      out.push(safe);
    };
    for (let i = 0; i < explicit.length; i += 1) add(explicit[i]);
    for (let i = 0; i < legacyRoles.length; i += 1) add(normalizeRole(legacyRoles[i]));
    if (recordRole) add(recordRole);
    return out;
  }

  function resolveUserOverrides(authRecord) {
    const meta = readAppMetadata(authRecord);
    const rbacMeta = safeObject(readObjectField(meta, "rbac") || meta.rbac);
    const userOverrides = safeObject(readObjectField(rbacMeta, "user_overrides") || rbacMeta.user_overrides);
    const globalRaw = readObjectField(userOverrides, "global") || userOverrides.global;
    const tenantsRaw = readObjectField(userOverrides, "tenants") || userOverrides.tenants;
    return {
      global: normalizeOverridePair(globalRaw),
      byTenant: normalizeTenantOverrides(tenantsRaw)
    };
  }

  function mergePermissionPair(allowSet, denySet, pair) {
    const safePair = normalizeOverridePair(pair);
    for (let i = 0; i < safePair.allow.length; i += 1) allowSet[safePair.allow[i]] = true;
    for (let i = 0; i < safePair.deny.length; i += 1) denySet[safePair.deny[i]] = true;
  }

  function resolveMatchedRoles(authRecord) {
    const tokens = resolveRoleTokens(authRecord);
    const roleData = readRoleCollection(false);
    const matched = [];
    const seen = {};
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const byId = roleData.byId[token] || null;
      const bySlug = roleData.bySlug[normalizeRole(token)] || null;
      const role = byId || bySlug;
      if (role && role.active !== false) {
        if (seen[role.id]) continue;
        seen[role.id] = true;
        matched.push(role);
      }
    }
    return matched;
  }

  function hasAdminRole(authRecord, roles) {
    const directRole = normalizeRole(authRecord && authRecord.getString ? authRecord.getString("role") : authRecord && authRecord.role);
    if (directRole === "admin") return true;
    for (let i = 0; i < roles.length; i += 1) {
      if (normalizeRole(roles[i].slug) === "admin") return true;
    }
    return false;
  }

  function isTenantAllowed(authRecord, tenant, adminEffective) {
    const safeTenant = normalizeTenant(tenant);
    if (!safeTenant) return true;
    if (!authRecord) return false;
    if (adminEffective === true) return true;
    const role = normalizeRole(authRecord.getString ? authRecord.getString("role") : authRecord.role);
    if (role === "admin") return true;
    const allowed = normalizeAllowedTenants(authRecord);
    return allowed.indexOf(safeTenant) !== -1;
  }

  function resolveEffective(authRecord, tenantInput) {
    const tenant = normalizeTenant(tenantInput)
      || normalizeTenant(authRecord && authRecord.get ? authRecord.get("tenant_default") : "")
      || "plaza_mayor";
    const matchedRoles = resolveMatchedRoles(authRecord || {});
    const adminEffective = hasAdminRole(authRecord || {}, matchedRoles);
    const allowedTenants = normalizeAllowedTenants(authRecord);
    const tenantAllowed = isTenantAllowed(authRecord, tenant, adminEffective);
    const userOverrides = resolveUserOverrides(authRecord || {});
    const roleAllow = {};
    const roleDeny = {};
    const userAllow = {};
    const userDeny = {};

    for (let i = 0; i < matchedRoles.length; i += 1) {
      mergePermissionPair(roleAllow, roleDeny, matchedRoles[i].global);
      mergePermissionPair(roleAllow, roleDeny, safeObject(matchedRoles[i].byTenant)[tenant]);
    }
    mergePermissionPair(userAllow, userDeny, userOverrides.global);
    mergePermissionPair(userAllow, userDeny, safeObject(userOverrides.byTenant)[tenant]);

    const permissions = {};
    const allCoreKeys = Object.keys(CORE_PERMISSIONS);
    for (let i = 0; i < allCoreKeys.length; i += 1) {
      const key = allCoreKeys[i];
      if (adminEffective) {
        permissions[key] = true;
        continue;
      }
      let granted = !!roleAllow[key] && !roleDeny[key];
      if (userAllow[key]) granted = true;
      if (userDeny[key]) granted = false;
      permissions[key] = granted && tenantAllowed;
    }

    if (!adminEffective) {
      const keyMap = {};
      Object.keys(roleAllow).forEach((key) => { keyMap[key] = true; });
      Object.keys(roleDeny).forEach((key) => { keyMap[key] = true; });
      Object.keys(userAllow).forEach((key) => { keyMap[key] = true; });
      Object.keys(userDeny).forEach((key) => { keyMap[key] = true; });
      const allKeys = Object.keys(keyMap);
      for (let i = 0; i < allKeys.length; i += 1) {
        const key = allKeys[i];
        if (permissions[key] !== undefined) continue;
        let granted = !!roleAllow[key] && !roleDeny[key];
        if (userAllow[key]) granted = true;
        if (userDeny[key]) granted = false;
        permissions[key] = granted && tenantAllowed;
      }
    } else {
      const keyMap = {};
      Object.keys(roleAllow).forEach((key) => { keyMap[key] = true; });
      Object.keys(userAllow).forEach((key) => { keyMap[key] = true; });
      const allKeys = Object.keys(keyMap);
      for (let i = 0; i < allKeys.length; i += 1) {
        permissions[allKeys[i]] = true;
      }
    }

    if (!tenantAllowed) {
      const keys = Object.keys(permissions);
      for (let i = 0; i < keys.length; i += 1) permissions[keys[i]] = false;
    }

    permissions.access = tenantAllowed && (adminEffective || Object.keys(permissions).some((key) => key !== "access" && permissions[key] === true));

    const allowMap = {};
    Object.keys(roleAllow).forEach((key) => { allowMap[key] = true; });
    Object.keys(userAllow).forEach((key) => { allowMap[key] = true; });
    const denyMap = {};
    Object.keys(roleDeny).forEach((key) => { denyMap[key] = true; });
    Object.keys(userDeny).forEach((key) => { denyMap[key] = true; });

    return {
      tenant: tenant,
      allowed_tenants: allowedTenants,
      tenant_allowed: tenantAllowed,
      is_admin: adminEffective,
      mode: getRbacMode(),
      role_tokens: resolveRoleTokens(authRecord || {}),
      role_slugs: matchedRoles.map((item) => item.slug),
      permissions: permissions,
      allow: Object.keys(allowMap),
      deny: Object.keys(denyMap)
    };
  }

  function buildSessionUser(authRecord) {
    if (!authRecord) return null;
    const tenantDefault = normalizeTenant(authRecord.get("tenant_default")) || null;
    const allowed = normalizeAllowedTenants(authRecord);
    const map = {};
    for (let i = 0; i < TENANTS.length; i += 1) {
      const tenant = TENANTS[i];
      map[tenant] = resolveEffective(authRecord, tenant).permissions;
    }
    const effective = resolveEffective(authRecord, tenantDefault || allowed[0] || "plaza_mayor");
    const meta = readAppMetadata(authRecord);
    const finanzasMeta = safeObject(meta.finanzas);
    finanzasMeta.permissions = effective.permissions;
    meta.finanzas = finanzasMeta;
    meta.rbac = safeObject(meta.rbac);
    meta.rbac.effective = map;
    meta.rbac.mode = getRbacMode();
    meta.rbac.version = String(Math.floor(roleCache.loadedAt / 1000) || 0);
    meta.rbac.is_admin = effective.is_admin;

    const email = trim(authRecord.getString("email"));
    return {
      id: trim(authRecord.get("id")),
      email: email,
      username: trim(authRecord.getString("login_username") || authRecord.getString("username") || (email ? email.split("@")[0] : "")),
      role: normalizeRole(authRecord.getString("role")),
      allowed_tenants: allowed,
      tenant_default: tenantDefault,
      default_tenant: tenantDefault,
      app_metadata: meta,
      effective_permissions: effective.permissions,
      effective_permissions_map: map,
      permissions: effective.permissions,
      isAdmin: effective.is_admin,
      rbac_mode: getRbacMode(),
      rbac_version: meta.rbac.version
    };
  }

  function writeAudit(entry) {
    const payload = safeObject(entry);
    let collection = null;
    try {
      collection = $app.findCollectionByNameOrId(AUDIT_COLLECTION);
    } catch (_) {
      collection = null;
    }
    if (!collection) return false;
    try {
      const record = new Record(collection);
      const nowIso = new Date().toISOString();
      record.set("actor_id", trim(payload.actor_id));
      record.set("actor_name", trim(payload.actor_name));
      record.set("actor_role", trim(payload.actor_role));
      record.set("action", trim(payload.action));
      record.set("tenant", normalizeTenant(payload.tenant));
      record.set("target_type", trim(payload.target_type));
      record.set("target_id", trim(payload.target_id));
      record.set("success", payload.success === true);
      record.set("reason", trim(payload.reason));
      record.set("metadata", safeObject(payload.metadata));
      record.set("created_at", trim(payload.created_at) || nowIso);
      record.set("updated_at", trim(payload.updated_at) || nowIso);
      $app.save(record);
      return true;
    } catch (_) {
      return false;
    }
  }

  function evaluateAction(authRecord, action, tenant, _options) {
    const safeAction = normalizePermissionKey(action);
    const effective = resolveEffective(authRecord, tenant);
    const rbacAllowed = effective.is_admin === true || effective.permissions[safeAction] === true;
    const mode = getRbacMode();
    return {
      mode: mode,
      allowed: rbacAllowed,
      rbac_allowed: rbacAllowed,
      effective: effective,
      action: safeAction
    };
  }

  function resolveEventAuthRecord(event) {
    const authFromEvent = event ? (event.auth || (event.requestInfo ? event.requestInfo.auth : null)) : null;
    if (authFromEvent) return authFromEvent;
    return null;
  }

  function resolveEventTenant(event, fallbackTenant) {
    const fallback = normalizeTenant(fallbackTenant);
    if (fallback) return fallback;
    const recordTenant = normalizeTenant(event && event.record ? event.record.get("tenant") : "");
    if (recordTenant) return recordTenant;
    const requestTenant = normalizeTenant(readRequestHeader(event, "X-Tenant") || readRequestHeader(event, "x-tenant"));
    if (requestTenant) return requestTenant;
    return "";
  }

  function authorizeOrThrow(event, action, options) {
    const opts = safeObject(options);
    if (event && event.hasSuperuserAuth && event.hasSuperuserAuth()) return { allowed: true, mode: "enforce", effective: resolveEffective({}, opts.tenant || "") };
    const authRecord = opts.authRecord || resolveEventAuthRecord(event);
    if (!authRecord) throw new ForbiddenError(opts.message || "No autorizado.");

    const tenant = resolveEventTenant(event, opts.tenant);
    const decision = evaluateAction(authRecord, action, tenant, {});
    const actorRole = normalizeRole(authRecord.getString ? authRecord.getString("role") : "");
    const actorId = trim(authRecord.get ? authRecord.get("id") : "");
    const actorName = trim(authRecord.getString ? (authRecord.getString("login_username") || authRecord.getString("username") || authRecord.getString("email")) : "");

    writeAudit({
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole,
      action: decision.action,
      tenant: decision.effective.tenant,
      target_type: opts.targetType || "",
      target_id: opts.targetId || "",
      success: decision.allowed === true,
      reason: decision.allowed ? "" : (opts.message || "Acceso denegado."),
      metadata: {
        mode: decision.mode,
        rbac_allowed: decision.rbac_allowed
      }
    });

    if (!decision.allowed) {
      throw new ForbiddenError(opts.message || "No tienes permiso para realizar esta operacion.");
    }
    return decision;
  }

  function revokeUserSessionsByRecord(record) {
    if (!record) return false;
    try {
      if (typeof record.refreshTokenKey === "function") {
        record.refreshTokenKey();
        $app.save(record);
        return true;
      }
    } catch (_) {}
    try {
      const tokenKey = trim(record.getString ? record.getString("tokenKey") : "");
      if (tokenKey) {
        record.set("tokenKey", $security.randomString(50));
        $app.save(record);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function revokeUserSessionsById(userId) {
    const safeId = trim(userId);
    if (!safeId) return false;
    try {
      const record = $app.findRecordById(AUTH_COLLECTION, safeId);
      return revokeUserSessionsByRecord(record);
    } catch (_) {
      return false;
    }
  }

  function ensureLastAdminLock(authRecord, candidateRoleTokens) {
    const tokens = uniqueStrings(candidateRoleTokens).map(normalizeRole).filter(Boolean);
    const hasExplicitTokens = Array.isArray(candidateRoleTokens);
    const willRemainAdmin = tokens.indexOf("admin") !== -1
      || (!hasExplicitTokens && normalizeRole(authRecord && authRecord.getString ? authRecord.getString("role") : "") === "admin");
    if (willRemainAdmin) return true;
    const all = $app.findRecordsByFilter(AUTH_COLLECTION, 'id != ""', "", 2000, 0) || [];
    let admins = 0;
    const me = trim(authRecord && authRecord.get ? authRecord.get("id") : "");
    for (let i = 0; i < all.length; i += 1) {
      const row = all[i];
      const id = trim(row.get("id"));
      const role = normalizeRole(row.getString("role"));
      const tokensRow = resolveRoleTokens(row).map(normalizeRole);
      const hasAdmin = role === "admin" || tokensRow.indexOf("admin") !== -1;
      if (!hasAdmin) continue;
      if (id === me) continue;
      admins += 1;
      if (admins > 0) break;
    }
    return admins > 0;
  }

  function isEffectiveAdminRecord(record) {
    if (!record) return false;
    try {
      const tenantHint = normalizeTenant(record.get ? record.get("tenant_default") : "")
        || normalizeTenant(record.getString ? record.getString("tenant_default") : "")
        || "plaza_mayor";
      const effective = resolveEffective(record, tenantHint);
      return !!(effective && effective.is_admin === true);
    } catch (_) {
      const role = normalizeRole(record.getString ? record.getString("role") : record.role);
      if (role === "admin") return true;
      const tokens = resolveRoleTokens(record).map(normalizeRole);
      return tokens.indexOf("admin") !== -1;
    }
  }

  function ensureAdminWouldRemainAfterDelete(targetRecord) {
    if (!targetRecord) return true;
    if (!isEffectiveAdminRecord(targetRecord)) return true;
    const targetId = trim(targetRecord.get ? targetRecord.get("id") : targetRecord.id);
    const all = $app.findRecordsByFilter(AUTH_COLLECTION, 'id != ""', "", 2000, 0) || [];
    for (let i = 0; i < all.length; i += 1) {
      const row = all[i];
      const rowId = trim(row.get ? row.get("id") : row.id);
      if (rowId === targetId) continue;
      if (isEffectiveAdminRecord(row)) return true;
    }
    return false;
  }

  module.exports = {
    AUTH_COLLECTION,
    ROLE_COLLECTION,
    SETTINGS_COLLECTION,
    AUDIT_COLLECTION,
    TENANTS,
    CORE_PERMISSIONS,
    normalizeTenant,
    normalizeRole,
    normalizePermissionKey,
    normalizeAllowedTenants,
    resolveEffective,
    evaluateAction,
    authorizeOrThrow,
    buildSessionUser,
    getRbacMode,
    readRoleCollection,
    readSettingMap,
    resolveRoleTokens,
    resolveUserOverrides,
    writeAudit,
    revokeUserSessionsByRecord,
    revokeUserSessionsById,
    ensureLastAdminLock,
    ensureAdminWouldRemainAfterDelete
  };
})();
