/**
 * Protección backend para colecciones RBAC.
 * ponytail: handlers serializados no ven funciones del mismo archivo — solo require() inline.
 */
onRecordCreateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "roles_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "app_roles",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para gestionar roles de usuario."
  });
  e.next();
}, "app_roles");

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "roles_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "app_roles",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para gestionar roles de usuario."
  });
  e.next();
}, "app_roles");

onRecordDeleteRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "roles_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "app_roles",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para gestionar roles de usuario."
  });
  e.next();
}, "app_roles");

onRecordCreateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "permissions_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "rbac_settings",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para modificar la configuración de seguridad."
  });
  e.next();
}, "rbac_settings");

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "permissions_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "rbac_settings",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para modificar la configuración de seguridad."
  });
  e.next();
}, "rbac_settings");

onRecordDeleteRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  require(`${__hooks}/rbac_shared.js`).authorizeOrThrow(e, "permissions_manage", {
    tenant: e.record ? e.record.get("tenant") : "",
    targetType: "rbac_settings",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para modificar la configuración de seguridad."
  });
  e.next();
}, "rbac_settings");

onRecordCreateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  throw new ForbiddenError("Los registros de auditoría son inmutables y de solo lectura.");
}, "rbac_audit_logs");

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  throw new ForbiddenError("Los registros de auditoría son inmutables y de solo lectura.");
}, "rbac_audit_logs");

onRecordDeleteRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  throw new ForbiddenError("Los registros de auditoría son inmutables y de solo lectura.");
}, "rbac_audit_logs");

onRecordCreateRequest(function (e) {
  const rbac = require(`${__hooks}/rbac_shared.js`);
  if (!(e.hasSuperuserAuth && e.hasSuperuserAuth())) {
    rbac.authorizeOrThrow(e, "users_manage", {
      targetType: "app_users",
      message: "No tienes permisos para crear cuentas de usuario."
    });
  }
  try {
    rbac.syncUserAdminFlag(e.record, { save: false });
  } catch (_) {
    try { e.record.set("is_admin", false); } catch (_2) {}
  }
  e.next();
}, "app_users");

onRecordDeleteRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  const rbac = require(`${__hooks}/rbac_shared.js`);
  rbac.authorizeOrThrow(e, "users_manage", {
    targetType: "app_users",
    targetId: String(e.record ? (e.record.get("id") || "") : "").trim(),
    message: "No tienes permisos para eliminar usuarios."
  });
  if (!rbac.ensureAdminWouldRemainAfterDelete(e.record)) {
    throw new BadRequestError("No puedes eliminar al último administrador de la plataforma.");
  }
  e.next();
}, "app_users");

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth && e.hasSuperuserAuth()) return e.next();
  const authRecord = e.auth || (e.requestInfo && e.requestInfo.auth) || null;
  if (!authRecord) throw new ForbiddenError("Debes iniciar sesión.");

  const rbac = require(`${__hooks}/rbac_shared.js`);
  const tenant = rbac.normalizeTenant(authRecord.get("tenant_default")) || "plaza_mayor";
  const decision = rbac.evaluateAction(authRecord, "users_manage", tenant, {});
  const canManageUsers = decision && decision.allowed === true;

  if (canManageUsers) {
    try { rbac.syncUserAdminFlag(e.record, { save: false }); } catch (_) {}
    return e.next();
  }

  const myId = String(authRecord.get("id") || "").trim();
  const targetId = String(e.record ? (e.record.get("id") || "") : "").trim();
  if (!myId || myId !== targetId) {
    throw new ForbiddenError("No tienes permisos para modificar cuentas de otros usuarios.");
  }

  const original = typeof e.record.originalCopy === "function" ? e.record.originalCopy() : null;
  if (original) {
    const sensitiveFields = [
      "role", "allowed_tenants", "tenant_default", "default_tenant",
      "app_metadata", "effective_permissions", "effective_permissions_map",
      "permissions", "is_admin", "rbac_mode", "rbac_version", "tokenKey"
    ];
    for (let i = 0; i < sensitiveFields.length; i += 1) {
      const field = sensitiveFields[i];
      try { e.record.set(field, original.get(field)); } catch (_) {}
    }
  }

  try { rbac.syncUserAdminFlag(e.record, { save: false }); } catch (_) {}
  e.next();
}, "app_users");
