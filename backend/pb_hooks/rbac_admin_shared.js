(function () {
  const RBAC = require(`${__hooks}/rbac_shared.js`);
  const AUTH_COLLECTION = RBAC.AUTH_COLLECTION || "app_users";

  function trim(value) {
    return String(value || "").trim();
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

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeRole(value) {
    return RBAC.normalizeRole ? RBAC.normalizeRole(value) : trim(value).toLowerCase();
  }

  function normalizeTenant(value) {
    return RBAC.normalizeTenant ? RBAC.normalizeTenant(value) : trim(value).toLowerCase();
  }

  function readHeader(e, name) {
    const safeName = trim(name);
    if (!safeName) return "";
    const header = e && e.request ? e.request.header : null;
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

  function readCookieValue(e, name) {
    const safeName = trim(name);
    if (!safeName) return "";
    try {
      const cookie = e && e.request && typeof e.request.cookie === "function" ? e.request.cookie(safeName) : null;
      return trim(cookie && cookie.value ? cookie.value : "");
    } catch (_) {
      return "";
    }
  }

  function readQueryParam(e, name) {
    const safeName = trim(name);
    if (!safeName) return "";
    try {
      if (e && e.request && typeof e.request.queryParam === "function") {
        return trim(e.request.queryParam(safeName));
      }
    } catch (_) {}
    return "";
  }

  function readRequestBodyObject(e) {
    try {
      const info = typeof e.requestInfo === "function" ? e.requestInfo() : null;
      const body = info && info.body && typeof info.body === "object" ? info.body : {};
      return safeObject(body);
    } catch (_) {
      return {};
    }
  }

  function readFormValue(e, bodyObject, key) {
    const safeKey = trim(key);
    if (!safeKey) return "";
    const fromBody = bodyObject && Object.prototype.hasOwnProperty.call(bodyObject, safeKey)
      ? bodyObject[safeKey]
      : "";
    if (Array.isArray(fromBody)) return fromBody;
    if (fromBody !== null && fromBody !== undefined) {
      if (typeof fromBody === "object") return fromBody;
      if (trim(fromBody)) return fromBody;
    }
    try {
      if (typeof e.formValue === "function") return e.formValue(safeKey);
    } catch (_) {}
    try {
      if (e.request && typeof e.request.formValue === "function") return e.request.formValue(safeKey);
    } catch (_) {}
    return "";
  }

  function bindBodyFlexible(e, payload, template) {
    let bodyBound = false;
    try {
      e.bindBody(payload);
      bodyBound = true;
    } catch (_) {}
    const bodyObject = readRequestBodyObject(e);
    if (!bodyBound && !Object.keys(bodyObject).length) return;
    const defaults = safeObject(template || {});
    const keys = Object.keys(defaults).length ? Object.keys(defaults) : Object.keys(payload || {});
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const currentValue = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : payload[key];
      const raw = readFormValue(e, bodyObject, key);
      if (raw === null || raw === undefined || raw === "") continue;

      if (Array.isArray(currentValue)) {
        if (Array.isArray(raw)) {
          payload[key] = safeArray(raw);
        } else {
          payload[key] = safeArray(parseJson(raw, currentValue));
        }
        continue;
      }
      if (currentValue && typeof currentValue === "object") {
        payload[key] = safeObject(parseJson(raw, currentValue));
        continue;
      }
      if (typeof currentValue === "boolean") {
        const safe = trim(raw).toLowerCase();
        payload[key] = safe === "true" || safe === "1" || safe === "yes";
        continue;
      }
      if (typeof currentValue === "number") {
        const parsed = Number(raw);
        payload[key] = Number.isFinite(parsed) ? parsed : currentValue;
        continue;
      }
      payload[key] = raw;
    }
  }

  function resolveAuthRecord(e) {
    const eventAuth = (e && e.auth) || (e && e.requestInfo ? e.requestInfo.auth : null) || null;
    if (eventAuth) {
      try {
        const authCollection = typeof eventAuth.collection === "function"
          ? trim((eventAuth.collection() || {}).name)
          : trim(eventAuth.collectionName || safeObject(eventAuth.collection).name);
        if (authCollection === AUTH_COLLECTION) return eventAuth;
      } catch (_) {}
      const authId = trim(eventAuth.id || (eventAuth.get ? eventAuth.get("id") : ""));
      if (authId) {
        try {
          const byId = $app.findRecordById(AUTH_COLLECTION, authId);
          if (byId) return byId;
        } catch (_) {}
      }
    }

    let authHeader = readHeader(e, "Authorization");
    if (!authHeader) authHeader = readHeader(e, "authorization");
    if (!authHeader) {
      authHeader = readCookieValue(e, "hub_auth_session_v1");
    }

    if (!authHeader) throw new UnauthorizedError("Debes iniciar sesion.");
    const safeHeader = authHeader.toLowerCase().startsWith("bearer ")
      ? trim(authHeader.slice(7))
      : authHeader;
    if (!safeHeader) throw new UnauthorizedError("Debes iniciar sesion.");

    let authRecord = null;
    try {
      authRecord = $app.findAuthRecordByToken(safeHeader, "auth");
    } catch (_) {
      authRecord = null;
    }
    if (!authRecord) throw new UnauthorizedError("Sesion invalida o expirada.");
    if (trim(authRecord.collection().name) !== AUTH_COLLECTION) throw new ForbiddenError("No autorizado.");
    return authRecord;
  }

  function requireAction(e, action, opts) {
    const cfg = safeObject(opts);
    const authRecord = cfg.authRecord || resolveAuthRecord(e);
    const tenant = normalizeTenant(cfg.tenant || (authRecord.get ? authRecord.get("tenant_default") : "")) || "plaza_mayor";
    const decision = RBAC.evaluateAction(authRecord, action, tenant, {});
    if (!decision || decision.allowed !== true) {
      throw new ForbiddenError(cfg.message || "No tienes permisos para esta operacion.");
    }
    return { authRecord, decision };
  }

  function requireAnyAction(e, actions, opts) {
    const list = safeArray(actions).map((item) => trim(item)).filter(Boolean);
    if (!list.length) throw new ForbiddenError((opts && opts.message) || "No autorizado.");
    let lastErr = null;
    for (let i = 0; i < list.length; i += 1) {
      try {
        return requireAction(e, list[i], opts);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new ForbiddenError((opts && opts.message) || "No autorizado.");
  }

  function requireEffectiveAdmin(e, opts) {
    const cfg = safeObject(opts);
    const authRecord = cfg.authRecord || resolveAuthRecord(e);
    const tenant = normalizeTenant(cfg.tenant || (authRecord.get ? authRecord.get("tenant_default") : "")) || "plaza_mayor";
    const effective = RBAC.resolveEffective ? RBAC.resolveEffective(authRecord, tenant) : null;
    if (!effective || effective.is_admin !== true) {
      throw new ForbiddenError(cfg.message || "Solo admin puede realizar esta operacion.");
    }
    return { authRecord, effective };
  }

  function requireReauth(authRecord, password) {
    const safePassword = trim(password);
    if (!safePassword) throw new BadRequestError("Debes confirmar tu contrasena para esta operacion.");
    if (!authRecord || typeof authRecord.validatePassword !== "function" || !authRecord.validatePassword(safePassword)) {
      throw new UnauthorizedError("No se pudo confirmar tu identidad. Verifica tu contrasena.");
    }
  }

  function listRoles() {
    const rolesCtx = RBAC.readRoleCollection ? RBAC.readRoleCollection(true) : { list: [] };
    return safeArray(rolesCtx.list).map((role) => ({
      id: trim(role.id),
      slug: trim(role.slug),
      name: trim(role.name || role.slug),
      description: trim(role.description || ""),
      active: role.active !== false,
      system_role: role.system_role === true,
      grants_admin: role.grants_admin === true,
      sort_order: Number(role.sort_order || 0),
      global: safeObject(role.global),
      byTenant: safeObject(role.byTenant)
    }));
  }

  function findCollection(name) {
    try {
      return $app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function findRoleById(roleId) {
    const safeId = trim(roleId);
    if (!safeId) return null;
    try {
      return $app.findRecordById("app_roles", safeId);
    } catch (_) {
      return null;
    }
  }

  function findRoleBySlug(slug) {
    const safeSlug = normalizeRole(slug);
    if (!safeSlug) return null;
    try {
      return $app.findFirstRecordByData("app_roles", "slug", safeSlug);
    } catch (_) {
      return null;
    }
  }

  function resolveUserRecord(userId) {
    const safeUserId = trim(userId);
    if (!safeUserId) throw new BadRequestError("Debes indicar el usuario objetivo.");
    let userRecord = null;
    try {
      userRecord = $app.findRecordById(AUTH_COLLECTION, safeUserId);
    } catch (_) {
      userRecord = null;
    }
    if (!userRecord) throw new NotFoundError("Usuario no encontrado.");
    return userRecord;
  }

  function readMetadata(record) {
    const raw = record ? record.get("app_metadata") : {};
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

  function saveRoleRecord(input, actorId, actorIsAdmin) {
    const payload = safeObject(input);
    const roleCollection = findCollection("app_roles");
    if (!roleCollection) throw new InternalServerError("Coleccion app_roles no disponible.");

    const roleId = trim(payload.id);
    const slug = normalizeRole(payload.slug || payload.name);
    if (!slug) throw new BadRequestError("Debes indicar un slug de rol valido.");

    let roleRecord = roleId ? findRoleById(roleId) : null;
    if (!roleRecord) roleRecord = findRoleBySlug(slug);
    if (!roleRecord) roleRecord = new Record(roleCollection);

    const wasActive = roleRecord.getBool ? roleRecord.getBool("active") !== false : true;
    const hadGrantsAdmin = roleRecord.getBool ? roleRecord.getBool("grants_admin") === true : false;

    roleRecord.set("slug", slug);
    roleRecord.set("name", trim(payload.name) || slug);
    roleRecord.set("description", trim(payload.description || ""));
    roleRecord.set("active", payload.active !== false);
    const existingSystemRole = roleRecord.getBool ? roleRecord.getBool("system_role") === true : false;
    roleRecord.set("system_role", existingSystemRole || payload.system_role === true);
    // grants_admin: solo un admin efectivo puede otorgarlo, y es one-way (encender).
    // Apagarlo requiere superusuario de PocketBase — evita lockouts accidentales.
    roleRecord.set("grants_admin", hadGrantsAdmin || (actorIsAdmin === true && payload.grants_admin === true));
    roleRecord.set("sort_order", Number(payload.sort_order || 0));
    roleRecord.set("permissions_global", safeObject(parseJson(payload.permissions_global, payload.permissions_global || {})));
    roleRecord.set("permissions_tenant_overrides", safeObject(parseJson(payload.permissions_tenant_overrides, payload.permissions_tenant_overrides || {})));
    if (!trim(roleRecord.get("created_by"))) roleRecord.set("created_by", trim(actorId));
    roleRecord.set("updated_by", trim(actorId));
    $app.save(roleRecord);
    RBAC.readRoleCollection(true);

    // Si cambió lo que define admin (grants_admin/active), resincroniza el flag
    // materializado de todos los usuarios y revoca sesiones de los afectados,
    // para que el cambio aplique de inmediato también en las API rules.
    const grantsAdminNow = roleRecord.getBool("grants_admin") === true;
    const activeNow = roleRecord.getBool("active") !== false;
    if (grantsAdminNow !== hadGrantsAdmin || activeNow !== wasActive) {
      resyncAllUserAdminFlags();
    }
    return roleRecord;
  }

  function resyncAllUserAdminFlags() {
    if (typeof RBAC.syncUserAdminFlag !== "function") return;
    let offset = 0;
    while (true) {
      const users = $app.findRecordsByFilter(AUTH_COLLECTION, 'id != ""', "", 300, offset) || [];
      if (!users.length) break;
      for (let i = 0; i < users.length; i += 1) {
        try {
          const result = RBAC.syncUserAdminFlag(users[i]);
          if (result && result.changed) RBAC.revokeUserSessionsByRecord(users[i]);
        } catch (_) {}
      }
      if (users.length < 300) break;
      offset += users.length;
    }
  }

  function roleIsInUse(roleRecord) {
    if (!roleRecord) return false;
    const roleId = trim(roleRecord.get("id"));
    const roleSlug = normalizeRole(roleRecord.get("slug"));
    if (!roleId && !roleSlug) return false;
    let offset = 0;
    while (true) {
      const users = $app.findRecordsByFilter(AUTH_COLLECTION, 'id != ""', "", 300, offset) || [];
      if (!users.length) break;
      for (let i = 0; i < users.length; i += 1) {
        const row = users[i];
        const meta = readMetadata(row);
        const rbac = safeObject(meta.rbac);
        const roleIds = safeArray(rbac.role_ids);
        if (roleIds.indexOf(roleId) !== -1 || roleIds.indexOf(roleSlug) !== -1) return true;
      }
      if (users.length < 300) break;
      offset += users.length;
    }
    return false;
  }

  function sanitizeRoleIds(values) {
    const input = safeArray(parseJson(values, values));
    const out = [];
    const seen = {};
    for (let i = 0; i < input.length; i += 1) {
      const safe = trim(input[i]);
      if (!safe || seen[safe]) continue;
      seen[safe] = true;
      out.push(safe);
    }
    return out;
  }

  function readAuthRoleFieldValues() {
    const fallback = ["admin", "verificador", "plaza_mayor", "casa_de_piedra", "user"];
    let collection = null;
    try {
      collection = $app.findCollectionByNameOrId(AUTH_COLLECTION);
    } catch (_) {
      collection = null;
    }
    if (!collection || !collection.fields || typeof collection.fields.getByName !== "function") return fallback;
    let field = null;
    try {
      field = collection.fields.getByName("role");
    } catch (_) {
      field = null;
    }
    if (!field) return fallback;
    const values = safeArray(field.values).map((item) => normalizeRole(item)).filter(Boolean);
    if (!values.length) return fallback;
    return values;
  }

  function resolveLegacyStorageRole(roleIds, requestedPrimaryRole, tenantDefault, allowedTenants) {
    const allowedValues = readAuthRoleFieldValues();
    const allowedMap = {};
    for (let i = 0; i < allowedValues.length; i += 1) {
      allowedMap[allowedValues[i]] = true;
    }
    // role_ids puede traer IDs de registro (UI) o slugs (datos legacy):
    // se resuelven contra app_roles ANTES de comparar. Comparar tokens crudos hacía
    // que los admins guardados desde la UI quedaran con role="plaza_mayor" (RC2).
    const normalizedRoleIds = toRoleSlugList(roleIds);
    const normalizedPrimary = normalizeRole(requestedPrimaryRole);
    const normalizedDefaultTenant = normalizeTenant(tenantDefault) || "plaza_mayor";
    const normalizedAllowedTenants = safeArray(allowedTenants).map((item) => normalizeTenant(item)).filter(Boolean);

    if (normalizedRoleIds.indexOf("admin") !== -1 && allowedMap.admin) return "admin";
    if (normalizedRoleIds.indexOf("verificador") !== -1 && allowedMap.verificador) return "verificador";
    if (normalizedPrimary && allowedMap[normalizedPrimary]) return normalizedPrimary;
    if (allowedMap[normalizedDefaultTenant]) return normalizedDefaultTenant;
    for (let i = 0; i < normalizedAllowedTenants.length; i += 1) {
      const tenant = normalizedAllowedTenants[i];
      if (allowedMap[tenant]) return tenant;
    }
    const fallbackOrder = ["plaza_mayor", "casa_de_piedra", "admin", "verificador", "user"];
    for (let i = 0; i < fallbackOrder.length; i += 1) {
      const role = fallbackOrder[i];
      if (allowedMap[role]) return role;
    }
    return allowedValues[0] || "plaza_mayor";
  }

  function toRoleSlugList(roleIds) {
    const ids = sanitizeRoleIds(roleIds);
    if (!ids.length) return [];
    const rolesCtx = RBAC.readRoleCollection ? RBAC.readRoleCollection(true) : { byId: {}, bySlug: {} };
    const out = [];
    const seen = {};
    for (let i = 0; i < ids.length; i += 1) {
      const token = trim(ids[i]);
      if (!token) continue;
      const roleById = safeObject(rolesCtx.byId)[token];
      const roleBySlug = safeObject(rolesCtx.bySlug)[normalizeRole(token)];
      const slug = normalizeRole((roleById && roleById.slug) || (roleBySlug && roleBySlug.slug) || token);
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      out.push(slug);
    }
    return out;
  }

  function sanitizeOverrides(raw) {
    const parsed = safeObject(parseJson(raw, raw));
    const normalizedParsed = safeObject(parseJson(JSON.stringify(parsed || {}), {}));
    const global = safeObject(normalizedParsed.global);
    const tenants = safeObject(normalizedParsed.tenants);
    const out = {
      global: {
        allow: safeArray(global.allow).map((item) => trim(item)).filter(Boolean),
        deny: safeArray(global.deny).map((item) => trim(item)).filter(Boolean)
      },
      tenants: {}
    };
    const keys = RBAC.TENANTS || ["plaza_mayor", "casa_de_piedra"];
    for (let i = 0; i < keys.length; i += 1) {
      const tenant = keys[i];
      const row = safeObject(tenants[tenant]);
      out.tenants[tenant] = {
        allow: safeArray(row.allow).map((item) => trim(item)).filter(Boolean),
        deny: safeArray(row.deny).map((item) => trim(item)).filter(Boolean)
      };
    }
    return out;
  }

  function saveUserAccess(input, actorId) {
    const payload = safeObject(input);
    const userRecord = resolveUserRecord(payload.user_id || payload.userId || payload.id);
    const meta = readMetadata(userRecord);
    const rbac = safeObject(meta.rbac);

    const roleIds = sanitizeRoleIds(payload.role_ids || payload.roleIds || rbac.role_ids || []);
    const overrides = sanitizeOverrides(payload.user_overrides || payload.userOverrides || safeObject(safeObject(rbac).user_overrides));
    const tenantDefault = normalizeTenant(payload.tenant_default || payload.tenantDefault || userRecord.get("tenant_default")) || "plaza_mayor";
    const allowedRaw = safeArray(parseJson(payload.allowed_tenants, payload.allowed_tenants || payload.allowedTenants || userRecord.get("allowed_tenants") || []));
    const allowedTenants = allowedRaw.map(normalizeTenant).filter(Boolean);
    if (allowedTenants.indexOf(tenantDefault) === -1) allowedTenants.push(tenantDefault);

    // Estado previo normalizado, para revocar sesiones SOLO si hubo cambios reales.
    const beforeState = JSON.stringify({
      role_ids: sanitizeRoleIds(rbac.role_ids || []),
      overrides: sanitizeOverrides(safeObject(rbac.user_overrides)),
      tenant_default: normalizeTenant(userRecord.get("tenant_default")),
      allowed_tenants: safeArray(parseJson(userRecord.get("allowed_tenants"), [])).map(normalizeTenant).filter(Boolean).sort()
    });
    const afterState = JSON.stringify({
      role_ids: roleIds,
      overrides: overrides,
      tenant_default: tenantDefault,
      allowed_tenants: allowedTenants.slice().sort()
    });
    const accessChanged = beforeState !== afterState;

    // Last-admin lock: solo aplica si el cambio realmente le quita el admin al usuario.
    const stillGrantsAdmin = (() => {
      const rolesCtx = RBAC.readRoleCollection ? RBAC.readRoleCollection(true) : { byId: {}, bySlug: {} };
      const slugs = toRoleSlugList(roleIds);
      for (let i = 0; i < slugs.length; i += 1) {
        const role = safeObject(rolesCtx.bySlug)[slugs[i]];
        if (role && role.grants_admin === true && role.active !== false) return true;
      }
      return false;
    })();
    if (!stillGrantsAdmin && !RBAC.ensureLastAdminLock(userRecord, roleIds)) {
      throw new BadRequestError("No puedes quitar el ultimo admin efectivo de la plataforma.");
    }

    rbac.role_ids = roleIds;
    rbac.user_overrides = overrides;
    meta.rbac = rbac;
    meta.roles = toRoleSlugList(roleIds);
    const requestedPrimaryRole = normalizeRole(payload.primary_role || payload.primaryRole || userRecord.get("role")) || "plaza_mayor";
    const storageRole = resolveLegacyStorageRole(roleIds, requestedPrimaryRole, tenantDefault, allowedTenants);
    meta.role_primary = storageRole;

    userRecord.set("role", storageRole);
    userRecord.set("tenant_default", tenantDefault);
    userRecord.set("allowed_tenants", allowedTenants);
    userRecord.set("app_metadata", meta);
    if (typeof RBAC.syncUserAdminFlag === "function") {
      RBAC.syncUserAdminFlag(userRecord, { save: false });
    }
    $app.save(userRecord);
    if (accessChanged) RBAC.revokeUserSessionsByRecord(userRecord);
    return userRecord;
  }

  function deleteUserAccess(input, actorRecord) {
    const payload = safeObject(input);
    const userRecord = resolveUserRecord(payload.user_id || payload.userId || payload.id);
    const actorId = trim(actorRecord && actorRecord.get ? actorRecord.get("id") : "");
    const userId = trim(userRecord.get("id"));
    if (userId === actorId) {
      throw new BadRequestError("No puedes eliminar tu propio usuario desde este panel.");
    }
    if (!RBAC.ensureAdminWouldRemainAfterDelete(userRecord)) {
      throw new BadRequestError("No puedes eliminar al ultimo admin efectivo de la plataforma.");
    }
    $app.delete(userRecord);
    RBAC.revokeUserSessionsById(userId);
    return userId;
  }

  function writeAdminAudit(actor, action, targetType, targetId, success, metadata) {
    RBAC.writeAudit({
      actor_id: trim(actor && actor.get ? actor.get("id") : ""),
      actor_name: trim(actor && actor.getString ? (actor.getString("login_username") || actor.getString("username") || actor.getString("email")) : ""),
      actor_role: normalizeRole(actor && actor.getString ? actor.getString("role") : ""),
      action: action,
      tenant: normalizeTenant(actor && actor.get ? actor.get("tenant_default") : ""),
      target_type: targetType,
      target_id: trim(targetId),
      success: success === true,
      reason: success ? "" : "Operacion rechazada",
      metadata: safeObject(metadata)
    });
  }

  function handleCatalog(e) {
    const authRecord = resolveAuthRecord(e);
    const tenant = normalizeTenant(readQueryParam(e, "tenant")) || normalizeTenant(authRecord.get("tenant_default")) || "plaza_mayor";
    requireAnyAction(e, ["users_manage", "roles_manage", "permissions_manage"], {
      authRecord,
      tenant,
      message: "No tienes permisos para consultar el catalogo RBAC."
    });
    return e.json(200, {
      ok: true,
      mode: RBAC.getRbacMode ? RBAC.getRbacMode() : "enforce",
      core_permissions: safeObject(RBAC.CORE_PERMISSIONS),
      roles: listRoles()
    });
  }

  function handleEffective(e) {
    const authRecord = resolveAuthRecord(e);
    const tenant = normalizeTenant(readQueryParam(e, "tenant")) || normalizeTenant(authRecord.get("tenant_default")) || "plaza_mayor";
    const userId = trim(readQueryParam(e, "userId") || "");
    let target = authRecord;
    if (userId && userId !== trim(authRecord.get("id"))) {
      requireAnyAction(e, ["users_manage", "roles_manage", "permissions_manage"], {
        authRecord,
        tenant,
        message: "No tienes permisos para consultar permisos de otro usuario."
      });
      target = resolveUserRecord(userId);
    }
    const effective = RBAC.resolveEffective(target, tenant);
    return e.json(200, {
      ok: true,
      tenant: effective.tenant,
      effective: effective
    });
  }

  function handleRoleUpsert(e) {
    const defaults = {
      id: "",
      slug: "",
      name: "",
      description: "",
      sort_order: 0,
      active: true,
      system_role: false,
      grants_admin: false,
      permissions_global: {},
      permissions_tenant_overrides: {},
      password: ""
    };
    const payload = new DynamicModel(defaults);
    bindBodyFlexible(e, payload, defaults);
    const guard = requireAction(e, "roles_manage", { message: "No tienes permisos para gestionar roles." });
    requireAction(e, "permissions_manage", {
      authRecord: guard.authRecord,
      tenant: normalizeTenant(guard.authRecord.get("tenant_default")) || "plaza_mayor",
      message: "No tienes permisos para gestionar permisos."
    });
    requireReauth(guard.authRecord, payload.password);
    const actorIsAdmin = typeof RBAC.isEffectiveAdminRecord === "function"
      ? RBAC.isEffectiveAdminRecord(guard.authRecord)
      : false;
    const roleRecord = saveRoleRecord(payload, guard.authRecord.get("id"), actorIsAdmin);
    writeAdminAudit(guard.authRecord, "roles_upsert", "app_roles", roleRecord.get("id"), true, { slug: roleRecord.get("slug") });
    return e.json(200, { ok: true, role: { id: trim(roleRecord.get("id")), slug: trim(roleRecord.get("slug")) } });
  }

  function handleRoleDelete(e) {
    const defaults = { id: "", password: "" };
    const payload = new DynamicModel(defaults);
    bindBodyFlexible(e, payload, defaults);
    const guard = requireAction(e, "roles_manage", { message: "No tienes permisos para eliminar roles." });
    requireReauth(guard.authRecord, payload.password);
    const roleRecord = findRoleById(payload.id);
    if (!roleRecord) throw new NotFoundError("Rol no encontrado.");
    if (roleRecord.getBool && roleRecord.getBool("system_role") === true) {
      throw new BadRequestError("No puedes eliminar un rol de sistema.");
    }
    if (roleIsInUse(roleRecord)) throw new BadRequestError("No puedes eliminar un rol que todavia tiene usuarios asignados.");
    const roleId = trim(roleRecord.get("id"));
    $app.delete(roleRecord);
    RBAC.readRoleCollection(true);
    writeAdminAudit(guard.authRecord, "roles_delete", "app_roles", roleId, true, {});
    return e.json(200, { ok: true, id: roleId });
  }

  function serializeUserForAdmin(record) {
    if (!record || !record.get) return null;
    const meta = readMetadata(record);
    const rbacMeta = safeObject(meta.rbac);
    const allowedRaw = parseJson(record.get("allowed_tenants"), record.get("allowed_tenants"));
    const allowed = safeArray(allowedRaw).map((item) => normalizeTenant(item)).filter(Boolean);
    return {
      id: trim(record.get("id")),
      email: trim(record.getString("email")),
      login_username: trim(record.getString("login_username") || record.getString("username")),
      username: trim(record.getString("login_username") || record.getString("username")),
      role: trim(record.getString("role")),
      tenant_default: normalizeTenant(record.get("tenant_default")) || "",
      allowed_tenants: allowed,
      is_admin: record.getBool("is_admin") === true,
      app_metadata: meta,
      role_ids: safeArray(rbacMeta.role_ids)
    };
  }

  function listUsersForAdmin() {
    const users = [];
    let offset = 0;
    while (true) {
      const rows = $app.findRecordsByFilter(AUTH_COLLECTION, 'id != ""', "login_username", 300, offset) || [];
      if (!rows.length) break;
      for (let i = 0; i < rows.length; i += 1) {
        const row = serializeUserForAdmin(rows[i]);
        if (row && row.id) users.push(row);
      }
      if (rows.length < 300) break;
      offset += rows.length;
    }
    return users;
  }

  function handleUsersList(e) {
    const authRecord = resolveAuthRecord(e);
    const tenant = normalizeTenant(readQueryParam(e, "tenant")) || normalizeTenant(authRecord.get("tenant_default")) || "plaza_mayor";
    requireAction(e, "users_manage", {
      authRecord: authRecord,
      tenant: tenant,
      message: "No tienes permisos para listar usuarios."
    });
    return e.json(200, { ok: true, users: listUsersForAdmin() });
  }

  function handleUserAccess(e) {
    const defaults = {
      user_id: "",
      role_ids: [],
      user_overrides: {},
      tenant_default: "",
      allowed_tenants: [],
      primary_role: "",
      password: ""
    };
    const payload = new DynamicModel(defaults);
    bindBodyFlexible(e, payload, defaults);
    const guard = requireAction(e, "users_manage", { message: "No tienes permisos para modificar accesos de usuarios." });
    requireReauth(guard.authRecord, payload.password);
    const userRecord = saveUserAccess(payload, guard.authRecord.get("id"));
    writeAdminAudit(guard.authRecord, "users_access_update", "app_users", userRecord.get("id"), true, {
      role_ids: safeArray(parseJson(payload.role_ids, []))
    });
    return e.json(200, { ok: true, user_id: trim(userRecord.get("id")) });
  }

  function handleUserDelete(e) {
    const defaults = {
      user_id: "",
      password: ""
    };
    const payload = new DynamicModel(defaults);
    bindBodyFlexible(e, payload, defaults);
    const guard = requireAction(e, "users_manage", { message: "No tienes permisos para eliminar usuarios." });
    requireReauth(guard.authRecord, payload.password);
    const deletedId = deleteUserAccess(payload, guard.authRecord);
    writeAdminAudit(guard.authRecord, "users_delete", "app_users", deletedId, true, {});
    return e.json(200, { ok: true, user_id: deletedId });
  }

  function handleMode(e) {
    const defaults = { mode: "", password: "" };
    const payload = new DynamicModel(defaults);
    bindBodyFlexible(e, payload, defaults);
    const guard = requireEffectiveAdmin(e, { message: "Solo admin puede cambiar el modo RBAC." });
    requireReauth(guard.authRecord, payload.password);
    const mode = trim(payload.mode).toLowerCase();
    if (mode !== "enforce") {
      throw new BadRequestError("El sistema RBAC esta en enforcement estricto. El unico modo valido es 'enforce'.");
    }
    const settingsCollection = findCollection("rbac_settings");
    if (!settingsCollection) throw new InternalServerError("No se encontro la coleccion de configuracion RBAC.");
    let row = null;
    try {
      row = $app.findFirstRecordByData("rbac_settings", "clave", "enforcement_mode");
    } catch (_) {
      row = null;
    }
    if (!row) row = new Record(settingsCollection);
    row.set("clave", "enforcement_mode");
    row.set("valor", mode);
    $app.save(row);
    RBAC.readSettingMap(true);
    writeAdminAudit(guard.authRecord, "rbac_mode_update", "rbac_settings", trim(row.get("id")), true, { mode });
    return e.json(200, { ok: true, mode });
  }

  module.exports = {
    handleCatalog,
    handleEffective,
    handleUsersList,
    handleRoleUpsert,
    handleRoleDelete,
    handleUserAccess,
    handleUserDelete,
    handleMode
  };
})();
