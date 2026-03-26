/**
 * =============================================================================
 * auth.js — Servicio de Autenticación
 * =============================================================================
 * Proporciona funciones de autenticación contra PocketBase.
 * Todas las funciones son async y retornan objetos con datos de sesión/usuario.
 *
 * Métodos:
 * - login(credentials): Inicia sesión con { email, password }
 * - logout(): Cierra la sesión y limpia tokens de localStorage
 * - getSession(): Retorna la sesión activa (token + datos básicos)
 * - getUser(): Retorna los datos del usuario autenticado
 * - getProfile(userId): Obtiene el perfil completo de un usuario por ID
 *
 * Expuesto en: window.PB_SERVICES.auth
 * =============================================================================
 */
(function () {
  window.PB_SERVICES = window.PB_SERVICES || {};
  if (window.PB_SERVICES.auth) return;
  const AUTH_KEYS = ["pb_native_auth_v1", "pb_compat_auth_v1"];
  let activeSessionCache = null;

  /**
   * Obtiene la instancia del cliente PocketBase.
   * @param {Object} options - Opciones de configuración (tenant, etc.)
   * @returns {Object} Instancia del cliente PocketBase
   */
  function client(options) {
    if (!window.PBServicesShared) throw new Error("PBServicesShared no está cargado.");
    return window.PBServicesShared.getClient(options || {});
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function normalizeRole(value) {
    const safe = String(value || "").trim().toLowerCase();
    if (!safe) return "user";
    if (safe === "administrador" || safe === "superadmin" || safe === "super_admin") return "admin";
    return safe;
  }

  function normalizeUserCandidate(raw) {
    if (!raw || typeof raw !== "object") return null;
    const role = normalizeRole(raw.role || raw.rol);
    let allowed = Array.isArray(raw.allowed_tenants)
      ? raw.allowed_tenants.map(function (item) { return String(item || "").toLowerCase().trim(); }).filter(Boolean)
      : [];
    if (!allowed.length) {
      if (role === "admin") allowed = ["plaza_mayor", "casa_de_piedra"];
      else if (role === "plaza_mayor" || role === "casa_de_piedra") allowed = [role];
    }
    const email = String(raw.email || raw.correo || "").trim();
    const username = String(
      raw.login_username
      || raw.username
      || raw.user_name
      || raw.full_name
      || raw.nombre_completo
      || (email ? email.split("@")[0] : "")
      || ""
    ).trim();
    const id = String(raw.id || raw.user_id || raw.record_id || "").trim();
    if (!id && !email && !username) return null;
    return {
      ...raw,
      id: id || raw.id || "",
      email: email || "",
      username: username || "",
      role: role || "user",
      allowed_tenants: allowed,
      tenant_default: raw.tenant_default || raw.default_tenant || null,
      default_tenant: raw.default_tenant || raw.tenant_default || null
    };
  }

  function buildSession(candidate) {
    let source = candidate;
    if (!source) return null;
    if (source.data && typeof source.data === "object" && Object.prototype.hasOwnProperty.call(source.data, "session")) {
      source = source.data.session;
    } else if (
      source.session !== undefined
      && source.user === undefined
      && source.token === undefined
      && source.access_token === undefined
    ) {
      source = source.session;
    }
    if (!source) return null;
    if (source.id || source.email || source.correo) {
      const userOnly = normalizeUserCandidate(source);
      return userOnly ? { user: userOnly, __fallback: true } : null;
    }
    const token = String(source.access_token || source.token || "").trim();
    const user = normalizeUserCandidate(source.user || source.record || source.model || null);
    if (!user) return null;
    const session = { ...source, user: user };
    if (token && !session.access_token) session.access_token = token;
    if (token && !session.token) session.token = token;
    if (!token) session.__fallback = true;
    return session;
  }

  function readStoredSession() {
    for (let i = 0; i < AUTH_KEYS.length; i += 1) {
      const parsed = safeParse(safeStorageGet(AUTH_KEYS[i]) || "null", null);
      const session = buildSession(parsed);
      if (session) return session;
    }
    return null;
  }

  function buildCachedUser() {
    const email = String(safeStorageGet("hub_user_cache_email") || "").trim();
    const username = String(safeStorageGet("hub_user_cache_name") || "").trim();
    const role = normalizeRole(safeStorageGet("hub_user_cache_role") || "");
    if (!email && !username) return null;
    return normalizeUserCandidate({
      id: email || username || "cached-user",
      email: email || "",
      username: username || (email ? email.split("@")[0] : ""),
      role: role || "user"
    });
  }

  function rememberSession(session) {
    const normalized = buildSession(session);
    activeSessionCache = normalized || null;
    try {
      window.__HUB_ACTIVE_SESSION = normalized || null;
    } catch (_) {}
    return normalized;
  }

  function readRememberedSession() {
    const remembered = buildSession(activeSessionCache || window.__HUB_ACTIVE_SESSION || null);
    return remembered || null;
  }

  function syncAuthStorage(session) {
    const normalized = buildSession(session);
    if (!normalized) return null;
    const token = String(normalized.access_token || normalized.token || "").trim();
    if (!token) return normalized;
    const payload = {
      token: token,
      record: normalized.record || normalized.user || null,
      user: normalized.user
    };
    const raw = JSON.stringify(payload);
    AUTH_KEYS.forEach(function (key) {
      try {
        if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
      } catch (_) {}
    });
    return normalized;
  }

  function resolveSchemaOption(options) {
    if (options && options.schema) return options.schema;
    try {
      if (window.PBServicesShared && typeof window.PBServicesShared.resolveSchema === "function") {
        return window.PBServicesShared.resolveSchema();
      }
    } catch (_) {}
    try {
      if (typeof TENANT_SCHEMA !== "undefined" && TENANT_SCHEMA) return TENANT_SCHEMA;
    } catch (_) {}
    return null;
  }

  function ensureClients(options) {
    if (!window.PB_CLIENT || !window.PB_CLIENT.createClient) return {
      globalClient: window.globalPocketBase || null,
      tenantClient: window.tenantPocketBase || null
    };
    const opts = (options && typeof options === "object") ? options : {};
    const baseUrl = String(window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || "").trim();
    const anonKey = String(window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || "").trim();
    const schema = resolveSchemaOption(opts);
    const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
    const currentBase = String(window.globalPocketBase?.baseUrl || "").replace(/\/+$/, "");
    if (!window.globalPocketBase || (normalizedBase && currentBase && currentBase !== normalizedBase)) {
      window.globalPocketBase = window.PB_CLIENT.createClient(baseUrl, anonKey);
      window.tenantPocketBase = null;
    }
    if (!window.tenantPocketBase && schema) {
      window.tenantPocketBase = window.PB_CLIENT.createClient(baseUrl, anonKey, { db: { schema: schema } });
    }
    return {
      globalClient: window.globalPocketBase || null,
      tenantClient: window.tenantPocketBase || null
    };
  }

  async function bootstrap(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const retries = Math.max(1, Number(opts.retries) || 2);
    const delayMs = Math.max(0, Number(opts.delayMs) || 180);
    const clients = ensureClients(opts);
    let session = null;
    let source = "none";

    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        session = buildSession(await clients.globalClient?.auth?.getSession?.());
      } catch (_) {
        session = null;
      }
      if (session) {
        source = "client";
        break;
      }
      if (attempt + 1 < retries) await wait(delayMs);
    }

    if (!session) {
      session = readStoredSession();
      if (session) {
        syncAuthStorage(session);
        source = "storage";
      }
    }
    if (!session) {
      session = readRememberedSession();
      if (session) source = "memory";
    }
    if (!session && opts.allowCachedUser !== false) {
      const cachedUser = buildCachedUser();
      if (cachedUser) {
        session = { user: cachedUser, __fallback: true };
        source = "cache_user";
      }
    }

    if (session) rememberSession(session);
    return {
      session: session || null,
      user: session?.user || null,
      degraded: !!session && !String(session.access_token || session.token || "").trim(),
      source: source,
      globalClient: clients.globalClient,
      tenantClient: clients.tenantClient
    };
  }

  window.PB_SERVICES.auth = {
    /** Inicia sesión con email y contraseña. */
    async login(credentials, options) {
      const result = await client(options).login(credentials || {});
      rememberSession(result?.session || result);
      return result;
    },
    /** Cierra la sesión actual y limpia tokens. */
    async logout(options) {
      const result = await client(options).logout();
      rememberSession(null);
      AUTH_KEYS.forEach(function (key) {
        try { localStorage.removeItem(key); } catch (_) {}
      });
      return result;
    },
    /** Retorna la sesión activa desde localStorage. */
    async getSession(options) {
      return client(options).getSession();
    },
    /** Obtiene los datos del usuario autenticado actual. */
    async getUser(options) {
      return client(options).getUser();
    },
    /** Obtiene el perfil completo de un usuario por su ID. */
    async getProfile(userId, options) {
      return client(options).getProfile(userId);
    },
    /** Inicializa clientes y resuelve una sesión tolerante a vacíos transitorios. */
    async bootstrap(options) {
      return bootstrap(options);
    },
    /** Guarda en memoria la última sesión resuelta para tolerar fallos transitorios. */
    rememberSession(session) {
      return rememberSession(session);
    },
    /** Lee la última sesión recordada en esta pestaña. */
    readRememberedSession() {
      return readRememberedSession();
    },
    /** Lee la mejor sesión disponible desde storage o caché. */
    resolveStoredSession() {
      return readStoredSession() || readRememberedSession() || null;
    }
  };
})();
