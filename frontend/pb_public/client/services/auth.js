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
  const AUTH_KEYS = ["pb_native_auth_v1", "pb_compat_auth_v1", "pb_auth"];
  const SESSION_ACTIVITY_KEY = "hub_auth_last_activity_v1";
  const LAYOUT_LAST_GOOD_AUTH_KEY = "hub_layout_last_good_auth_v1";
  const USER_CACHE_KEYS = ["hub_user_cache_name", "hub_user_cache_email", "hub_user_cache_role"];
  const SESSION_INACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;
  const SESSION_REFRESH_THRESHOLD_MS = 15 * 60 * 1000;
  const SESSION_SERVER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  const SESSION_ACTIVITY_WRITE_GAP_MS = 15 * 1000;
  const SESSION_WATCH_INTERVAL_MS = 60 * 1000;
  const AUTH_SYNC_CHANNEL_NAME = "hub_auth_sync_v1";
  const AUTH_SYNC_TIMEOUT_MS = 1200;
  let activeSessionCache = null;
  let authRefreshPromise = null;
  let authActivityBound = false;
  let authWatchTimer = null;
  let lastActivityWriteTs = 0;
  let authSyncChannel = null;
  let authSyncChannelBound = false;
  let authSyncRequestSeq = 0;
  let lastServerSessionTouchTs = 0;
  const authSyncResolvers = {};
  const authSyncTabId = Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

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

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function safeStorageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  }

  function readAuthStorage(key) {
    return safeSessionGet(key) || safeStorageGet(key);
  }

  function writeAuthStorage(key, value) {
    safeSessionSet(key, value);
    safeStorageRemove(key);
  }

  function clearAuthStorage(key) {
    safeSessionRemove(key);
    safeStorageRemove(key);
  }

  function safeSessionRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function trimSlash(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function normalizeRole(value) {
    const safe = String(value || "").trim().toLowerCase();
    if (!safe) return "";
    if (safe === "administrador" || safe === "superadmin" || safe === "super_admin") return "admin";
    if (safe === "both" || safe === "ambos" || safe === "user" || safe === "usuario") return "";
    if (["admin", "plaza_mayor", "casa_de_piedra", "verificador"].indexOf(safe) === -1) return "";
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
      role: role || "",
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
      const parsed = safeParse(readAuthStorage(AUTH_KEYS[i]) || "null", null);
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
      role: role || ""
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
    const payload = {
      token: token || "",
      record: normalized.record || normalized.user || null,
      user: normalized.user || null
    };
    const raw = JSON.stringify(payload);
    AUTH_KEYS.forEach(function (key) {
      try {
        if (safeSessionGet(key) !== raw) safeSessionSet(key, raw);
        safeStorageRemove(key);
      } catch (_) {}
    });
    return normalized;
  }

  function buildAuthSyncPayload(session) {
    const normalized = buildSession(session);
    const token = getSessionToken(normalized);
    if (!normalized || !token) return null;
    return {
      token: token,
      access_token: token,
      record: normalized.record || normalized.user || null,
      user: normalized.user || null
    };
  }

  function resolveShareableSession() {
    const session = buildSession(readRememberedSession() || readStoredSession() || activeSessionCache || window.__HUB_ACTIVE_SESSION || null);
    if (!session || !getSessionToken(session)) return null;
    if (getActivityState().isInactive) return null;
    return session;
  }

  function consumePeerSessionPayload(rawPayload) {
    const session = buildSession(rawPayload);
    if (!session || !getSessionToken(session)) return null;
    syncAuthStorage(session);
    rememberSession(session);
    ensureActivitySeed(session);
    return session;
  }

  function ensureAuthSyncChannel() {
    if (authSyncChannelBound) return authSyncChannel;
    authSyncChannelBound = true;
    if (typeof BroadcastChannel === "undefined") return null;
    try {
      authSyncChannel = new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME);
      authSyncChannel.addEventListener("message", function (event) {
        const message = event && event.data && typeof event.data === "object" ? event.data : null;
        if (!message) return;
        if (String(message.sourceTabId || "") === authSyncTabId) return;

        if (message.type === "auth_request") {
          const targetTabId = String(message.sourceTabId || "").trim();
          if (!targetTabId) return;
          const shareable = resolveShareableSession();
          const payload = buildAuthSyncPayload(shareable);
          if (!payload) return;
          try {
            authSyncChannel.postMessage({
              type: "auth_response",
              sourceTabId: authSyncTabId,
              targetTabId: targetTabId,
              requestId: String(message.requestId || "").trim(),
              payload: payload
            });
          } catch (_) {}
          return;
        }

        if (message.type === "auth_response") {
          if (String(message.targetTabId || "") !== authSyncTabId) return;
          const requestId = String(message.requestId || "").trim();
          if (!requestId || typeof authSyncResolvers[requestId] !== "function") return;
          const resolve = authSyncResolvers[requestId];
          delete authSyncResolvers[requestId];
          resolve(consumePeerSessionPayload(message.payload));
          return;
        }

        if (message.type === "auth_logout") {
          clearPersistedSession({ preserveActivity: false, suppressSync: true });
        }
      });
      return authSyncChannel;
    } catch (_) {
      authSyncChannel = null;
      return null;
    }
  }

  async function requestSessionFromPeer(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const channel = ensureAuthSyncChannel();
    if (!channel) return null;
    const requestId = authSyncTabId + ":" + (++authSyncRequestSeq);
    const timeoutMs = Math.max(250, Number(opts.timeoutMs) || AUTH_SYNC_TIMEOUT_MS);
    return await new Promise(function (resolve) {
      const finish = function (session) {
        try { delete authSyncResolvers[requestId]; } catch (_) {}
        resolve(session || null);
      };
      authSyncResolvers[requestId] = finish;
      const timer = window.setTimeout(function () {
        if (authSyncResolvers[requestId] === finish) finish(null);
      }, timeoutMs);
      authSyncResolvers[requestId] = function (session) {
        try { window.clearTimeout(timer); } catch (_) {}
        finish(session);
      };
      try {
        channel.postMessage({
          type: "auth_request",
          sourceTabId: authSyncTabId,
          requestId: requestId
        });
      } catch (_) {
        try { window.clearTimeout(timer); } catch (_) {}
        delete authSyncResolvers[requestId];
        resolve(null);
      }
    });
  }

  function clearPersistedSession(options) {
    const opts = (options && typeof options === "object") ? options : {};
    AUTH_KEYS.forEach(function (key) {
      clearAuthStorage(key);
    });
    if (opts.preserveActivity !== true) safeStorageRemove(SESSION_ACTIVITY_KEY);
    clearAuthStorage(LAYOUT_LAST_GOOD_AUTH_KEY);
    safeSessionRemove(LAYOUT_LAST_GOOD_AUTH_KEY);
    USER_CACHE_KEYS.forEach(function (key) {
      safeStorageRemove(key);
    });
    activeSessionCache = null;
    try {
      window.__HUB_ACTIVE_SESSION = null;
    } catch (_) {}
    if (opts.suppressSync !== true) {
      const channel = ensureAuthSyncChannel();
      if (channel) {
        try {
          channel.postMessage({
            type: "auth_logout",
            sourceTabId: authSyncTabId
          });
        } catch (_) {}
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("hub:session-cleared", {
        detail: {
          reason: String(opts.reason || "session_cleared").trim() || "session_cleared",
          preserveActivity: opts.preserveActivity === true
        }
      }));
    } catch (_) {}
  }

  function base64UrlDecode(value) {
    const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    if (!raw) return "";
    const padded = raw + "=".repeat((4 - (raw.length % 4 || 4)) % 4);
    const decoded = atob(padded);
    try {
      return decodeURIComponent(Array.prototype.map.call(decoded, function (char) {
        return "%" + char.charCodeAt(0).toString(16).padStart(2, "0");
      }).join(""));
    } catch (_) {
      return decoded;
    }
  }

  function decodeTokenPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    try {
      return safeParse(base64UrlDecode(parts[1]), null);
    } catch (_) {
      return null;
    }
  }

  function getSessionToken(session) {
    return String(session?.access_token || session?.token || "").trim();
  }

  function getTokenExpiryMs(session) {
    const payload = decodeTokenPayload(getSessionToken(session));
    const exp = Number(payload?.exp || 0);
    return exp > 0 ? exp * 1000 : 0;
  }

  function readLastActivityTs() {
    return Math.max(0, Number(safeStorageGet(SESSION_ACTIVITY_KEY) || 0) || 0);
  }

  function getActivityState(now) {
    const ts = readLastActivityTs();
    const stamp = Number(now) || Date.now();
    const idleMs = ts ? Math.max(0, stamp - ts) : Number.POSITIVE_INFINITY;
    return {
      lastActivityTs: ts || 0,
      idleMs: idleMs,
      isInactive: idleMs > SESSION_INACTIVITY_WINDOW_MS,
      inactivityWindowMs: SESSION_INACTIVITY_WINDOW_MS
    };
  }

  function touchActivity(force) {
    const now = Date.now();
    const lastKnown = Math.max(readLastActivityTs(), lastActivityWriteTs);
    if (force !== true && lastKnown && (now - lastKnown) < SESSION_ACTIVITY_WRITE_GAP_MS) return lastKnown;
    lastActivityWriteTs = now;
    safeStorageSet(SESSION_ACTIVITY_KEY, String(now));
    return now;
  }

  function ensureActivitySeed(session) {
    if (!buildSession(session)) return null;
    if (readLastActivityTs() > 0) return readLastActivityTs();
    return touchActivity(true);
  }

  function hasActiveSessionCandidate() {
    return !!buildSession(readRememberedSession() || readStoredSession() || activeSessionCache || window.__HUB_ACTIVE_SESSION || null);
  }

  function shouldAllowCachedIdentity() {
    const state = getActivityState();
    if (state.lastActivityTs <= 0) return false;
    return state.isInactive !== true;
  }

  function resolveRefreshBaseUrl(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const clients = ensureClients(opts);
    return trimSlash(
      opts.baseUrl
      || clients.globalClient?.baseUrl
      || window.HUB_CONFIG?.pocketbaseUrl
      || window.ENV?.POCKETBASE_URL
      || ""
    );
  }

  function isCrossOriginBaseUrl(baseUrl) {
    try {
      if (!window || !window.location || !window.location.origin) return false;
      return new URL(trimSlash(baseUrl), window.location.href).origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function buildServerSessionHeaders(session) {
    const headers = { Accept: "application/json" };
    const token = getSessionToken(session);
    if (token) headers.Authorization = token;
    return headers;
  }

  async function requestSessionFromServer(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const baseUrl = resolveRefreshBaseUrl(opts);
    if (!baseUrl) return null;

    const mode = opts.mode === "refresh" ? "refresh" : "current";
    const method = mode === "refresh" ? "POST" : "GET";
    const current = buildSession(opts.session || readRememberedSession() || readStoredSession() || null);
    let response;

    try {
      const headers = buildServerSessionHeaders(current);
      response = await fetch(baseUrl + (mode === "refresh" ? "/api/hub/session/refresh" : "/api/hub/session/current"), {
        method: method,
        credentials: isCrossOriginBaseUrl(baseUrl) && String(headers.Authorization || "").trim() ? "omit" : "include",
        cache: "no-store",
        headers: headers
      });
    } catch (_) {
      return opts.allowStaleOnError === false ? null : current;
    }

    const text = await response.text();
    const data = text ? safeParse(text, null) : null;

    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        clearPersistedSession({ suppressSync: true });
        return null;
      }
      return opts.allowStaleOnError === false ? null : current;
    }

    const resolved = buildSession({
      token: data?.token || data?.access_token || "",
      record: data?.record || data?.user || null,
      user: data?.user || data?.record || null
    });

    if (!resolved) return opts.allowStaleOnError === false ? null : current;

    syncAuthStorage(resolved);
    rememberSession(resolved);
    ensureActivitySeed(resolved);
    lastServerSessionTouchTs = Date.now();
    return resolved;
  }

  async function refreshSession(options) {
    const opts = (options && typeof options === "object") ? options : {};
    const current = buildSession(opts.session || readRememberedSession() || readStoredSession() || null);
    if (!current) return null;
    ensureActivitySeed(current);
    if (getActivityState().isInactive) {
      clearPersistedSession();
      return null;
    }
    if (authRefreshPromise && opts.force !== true) return authRefreshPromise;
    authRefreshPromise = (async function () {
      const refreshed = await requestSessionFromServer({
        ...opts,
        mode: "refresh",
        session: current,
        allowStaleOnError: opts.allowStaleOnError !== false
      });
      return buildSession(refreshed || current);
    })();
    try {
      return await authRefreshPromise;
    } finally {
      authRefreshPromise = null;
    }
  }

  async function ensureFreshSession(options) {
    const opts = (options && typeof options === "object") ? options : {};
    let session = buildSession(opts.session || readRememberedSession() || readStoredSession() || null);
    if (!session) {
      session = await requestSessionFromServer({
        ...opts,
        mode: "current",
        allowStaleOnError: false
      });
    }
    if (!session) return null;
    ensureActivitySeed(session);
    const activity = getActivityState();
    if (activity.isInactive) {
      clearPersistedSession();
      return null;
    }
    const token = getSessionToken(session);
    if (!token) {
      const shouldVerifyTokenlessSession =
        opts.forceRefresh === true
        || !lastServerSessionTouchTs
        || (Date.now() - lastServerSessionTouchTs) >= SESSION_SERVER_REFRESH_INTERVAL_MS;
      if (shouldVerifyTokenlessSession) {
        const verifiedSession = await requestSessionFromServer({
          ...opts,
          mode: "current",
          session,
          allowStaleOnError: opts.allowStaleOnError !== false
        });
        if (!verifiedSession) return null;
        return verifiedSession;
      }
      rememberSession(session);
      syncAuthStorage(session);
      return session;
    }
    const expiresAt = getTokenExpiryMs(session);
    const refreshThresholdMs = Math.max(0, Number(opts.refreshThresholdMs) || SESSION_REFRESH_THRESHOLD_MS);
    const shouldRefreshNow = opts.forceRefresh === true || !!expiresAt && (expiresAt - Date.now()) <= refreshThresholdMs;
    if (!shouldRefreshNow) {
      syncAuthStorage(session);
      rememberSession(session);
      return session;
    }
    const refreshed = await refreshSession({
      ...opts,
      session,
      allowStaleOnError: opts.allowStaleOnError !== false
    });
    const normalized = buildSession(refreshed || session);
    if (normalized) {
      syncAuthStorage(normalized);
      rememberSession(normalized);
    }
    return normalized;
  }

  function bindActivityListeners() {
    if (authActivityBound) return;
    authActivityBound = true;
    ensureAuthSyncChannel();
    const markActive = function (force) {
      if (!hasActiveSessionCandidate()) return;
      touchActivity(force === true);
    };
    document.addEventListener("pointerdown", function () {
      markActive(false);
    }, true);
    document.addEventListener("keydown", function () {
      markActive(false);
    }, true);
    document.addEventListener("submit", function () {
      markActive(true);
    }, true);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      markActive(true);
      ensureFreshSession({ allowStaleOnError: true }).catch(function () {});
    });
    window.addEventListener("focus", function () {
      markActive(true);
      ensureFreshSession({ allowStaleOnError: true }).catch(function () {});
    });
  }

  function startSessionWatch() {
    bindActivityListeners();
    if (authWatchTimer) return authWatchTimer;
    authWatchTimer = window.setInterval(function () {
      const session = buildSession(readRememberedSession() || readStoredSession() || null);
      if (!session) return;
      if (!readLastActivityTs()) ensureActivitySeed(session);
      const activity = getActivityState();
      if (activity.isInactive) {
        clearPersistedSession();
        return;
      }
      if (document.visibilityState === "hidden") return;
      const expiresAt = getTokenExpiryMs(session);
      const shouldRefreshCookieBackedSession = !expiresAt && (Date.now() - lastServerSessionTouchTs) >= SESSION_SERVER_REFRESH_INTERVAL_MS;
      if (!shouldRefreshCookieBackedSession && (!expiresAt || (expiresAt - Date.now()) > SESSION_REFRESH_THRESHOLD_MS)) return;
      refreshSession({ session, allowStaleOnError: true }).catch(function () {});
    }, SESSION_WATCH_INTERVAL_MS);
    return authWatchTimer;
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
    startSessionWatch();
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
    if (!session) {
      session = await requestSessionFromServer({
        ...opts,
        mode: "current",
        allowStaleOnError: false
      });
      if (session) source = "cookie";
    }
    if (!session) {
      session = await requestSessionFromPeer({ timeoutMs: opts.peerTimeoutMs });
      if (session) source = "peer";
    }
    if (session) {
      session = await ensureFreshSession({
        ...opts,
        session,
        allowStaleOnError: true
      });
    }
    if (!session && opts.allowCachedUser === true && shouldAllowCachedIdentity()) {
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
      const session = syncAuthStorage(result?.session || result);
      rememberSession(session || result?.session || result);
      lastServerSessionTouchTs = Date.now();
      touchActivity(true);
      startSessionWatch();
      return result;
    },
    /** Cierra la sesión actual y limpia tokens. */
    async logout(options) {
      const result = await client(options).logout();
      clearPersistedSession();
      lastServerSessionTouchTs = 0;
      return result;
    },
    /** Retorna la sesión activa desde sessionStorage con fallback legado. */
    async getSession(options) {
      startSessionWatch();
      const session = await ensureFreshSession({
        ...(options && typeof options === "object" ? options : {}),
        allowStaleOnError: true
      });
      return { session: session || null, user: session?.user || null };
    },
    /** Obtiene los datos del usuario autenticado actual. */
    async getUser(options) {
      const session = await ensureFreshSession({
        ...(options && typeof options === "object" ? options : {}),
        allowStaleOnError: true
      });
      return session?.user || null;
    },
    /** Obtiene el perfil completo de un usuario por su ID. */
    async getProfile(userId, options) {
      return client(options).getProfile(userId);
    },
    /** Inicializa clientes y resuelve una sesión tolerante a vacíos transitorios. */
    async bootstrap(options) {
      return bootstrap(options);
    },
    /** Fuerza renovación silenciosa del token actual cuando sea posible. */
    async refreshSession(options) {
      startSessionWatch();
      return refreshSession({
        ...(options && typeof options === "object" ? options : {}),
        allowStaleOnError: true
      });
    },
    /** Garantiza sesión vigente respetando la ventana de inactividad compartida. */
    async ensureFreshSession(options) {
      startSessionWatch();
      return ensureFreshSession({
        ...(options && typeof options === "object" ? options : {}),
        allowStaleOnError: true
      });
    },
    /** Marca actividad del usuario para extender la sesión activa. */
    touchActivity(force) {
      if (!hasActiveSessionCandidate()) return 0;
      return touchActivity(force === true);
    },
    /** Devuelve el estado de actividad compartido entre pestañas. */
    getActivityState() {
      return getActivityState();
    },
    /** Inicializa el observador de actividad y renovación silenciosa. */
    startSessionWatch() {
      return startSessionWatch();
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
      const activity = getActivityState();
      if (activity.lastActivityTs > 0 && activity.isInactive) return null;
      return readStoredSession() || readRememberedSession() || null;
    },
    inactivityWindowMs: SESSION_INACTIVITY_WINDOW_MS
  };

  startSessionWatch();
})();

