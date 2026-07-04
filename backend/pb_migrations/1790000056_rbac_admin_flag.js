/// <reference path="../pb_data/types.d.ts" />

// Fuente única de verdad admin:
// - app_roles.grants_admin: SOLO este flag otorga is_admin (system_role vuelve a
//   significar únicamente "rol protegido/no borrable", que es como lo usa handleRoleDelete).
// - app_users.is_admin: bool materializado que escriben exclusivamente los hooks backend,
//   para que las API rules de PocketBase evalúen un solo campo en vez de strings de rol.
// Backfill: corrige is_admin y el campo legacy "role" de todos los usuarios existentes.
migrate((app) => {
  const TENANTS = ["plaza_mayor", "casa_de_piedra"];
  const LEGACY_ROLE_PRIORITY = ["admin", "verificador", "plaza_mayor", "casa_de_piedra", "user"];

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

  function findCollection(name) {
    try {
      return app.findCollectionByNameOrId(name);
    } catch (_) {
      return null;
    }
  }

  function ensureBoolField(collection, name) {
    let field = null;
    try {
      field = collection.fields.getByName(name);
    } catch (_) {
      field = null;
    }
    if (field) return false;
    collection.fields.add(new BoolField({ name: name }));
    app.save(collection);
    return true;
  }

  const rolesCollection = findCollection("app_roles");
  const usersCollection = findCollection("app_users");
  if (!rolesCollection || !usersCollection) return;

  ensureBoolField(rolesCollection, "grants_admin");
  ensureBoolField(usersCollection, "is_admin");

  // 1) Solo el rol "admin" otorga privilegios de administrador.
  const roleById = {};
  const roleBySlug = {};
  const roleRows = app.findRecordsByFilter("app_roles", 'id != ""', "", 500, 0) || [];
  for (let i = 0; i < roleRows.length; i += 1) {
    const row = roleRows[i];
    const slug = normalizeRole(row.getString("slug") || row.getString("name"));
    const grantsAdmin = slug === "admin";
    if ((row.getBool("grants_admin") === true) !== grantsAdmin) {
      row.set("grants_admin", grantsAdmin);
      app.save(row);
    }
    const entry = {
      id: trim(row.get("id")),
      slug: slug,
      active: row.getBool("active") !== false,
      grants_admin: grantsAdmin
    };
    roleById[entry.id] = entry;
    if (slug) roleBySlug[slug] = entry;
  }

  // 2) Backfill de app_users: is_admin materializado + campo "role" legacy coherente.
  function resolveMatchedSlugs(userRow) {
    const meta = safeObject(parseJson(userRow.get("app_metadata"), {}));
    const rbacMeta = safeObject(meta.rbac);
    const tokens = []
      .concat(Array.isArray(rbacMeta.role_ids) ? rbacMeta.role_ids : [])
      .concat(Array.isArray(meta.roles) ? meta.roles : [])
      .concat([userRow.getString("role")]);
    const slugs = [];
    const seen = {};
    for (let i = 0; i < tokens.length; i += 1) {
      const token = trim(tokens[i]);
      if (!token) continue;
      const entry = roleById[token] || roleBySlug[normalizeRole(token)] || null;
      if (!entry || entry.active === false || seen[entry.slug]) continue;
      seen[entry.slug] = true;
      slugs.push(entry.slug);
    }
    return slugs;
  }

  let offset = 0;
  while (true) {
    const rows = app.findRecordsByFilter("app_users", 'id != ""', "", 500, offset) || [];
    if (!rows.length) break;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const slugs = resolveMatchedSlugs(row);
      let isAdmin = false;
      for (let s = 0; s < slugs.length; s += 1) {
        const entry = roleBySlug[slugs[s]];
        if (entry && entry.grants_admin === true) {
          isAdmin = true;
          break;
        }
      }

      let legacyRole = "";
      for (let p = 0; p < LEGACY_ROLE_PRIORITY.length; p += 1) {
        if (slugs.indexOf(LEGACY_ROLE_PRIORITY[p]) !== -1) {
          legacyRole = LEGACY_ROLE_PRIORITY[p];
          break;
        }
      }
      if (!legacyRole) {
        const current = normalizeRole(row.getString("role"));
        if (LEGACY_ROLE_PRIORITY.indexOf(current) !== -1) legacyRole = current;
      }
      if (!legacyRole) {
        const tenantDefault = normalizeRole(row.get("tenant_default"));
        legacyRole = TENANTS.indexOf(tenantDefault) !== -1 ? tenantDefault : "plaza_mayor";
      }

      const changedAdmin = (row.getBool("is_admin") === true) !== isAdmin;
      const changedRole = normalizeRole(row.getString("role")) !== legacyRole;
      if (!changedAdmin && !changedRole) continue;
      row.set("is_admin", isAdmin);
      row.set("role", legacyRole);
      app.save(row);
    }
    if (rows.length < 500) break;
    offset += rows.length;
  }
}, (app) => {
  const names = { app_roles: "grants_admin", app_users: "is_admin" };
  Object.keys(names).forEach((name) => {
    let collection = null;
    try {
      collection = app.findCollectionByNameOrId(name);
    } catch (_) {
      return;
    }
    if (!collection) return;
    try {
      collection.fields.removeByName(names[name]);
      app.save(collection);
    } catch (_) {}
  });
});
