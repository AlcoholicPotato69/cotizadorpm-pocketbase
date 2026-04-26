/* PocketBase native client core for vanilla frontend pages. */
(function () {
  if (window.PocketBaseCore) return;

  const AUTH_KEYS = ["pb_native_auth_v1", "pb_compat_auth_v1", "pb_auth"];

  const TENANT_COLLECTIONS = new Set([
    "clientes",
    "conceptos_catalogo",
    "configuracion",
    "impuestos",
    "espacios",
    "cotizaciones",
    "documentos"
  ]);

  function trimSlash(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function parseJsonSafe(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function readAuthStorage(key) {
    try {
      const sessionValue = sessionStorage.getItem(key);
      if (sessionValue) return sessionValue;
    } catch (_) {}
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeAuthStorage(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function clearAuthStorage(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function toTenantFromSchema(schemaName) {
    const schema = String(schemaName || "").toLowerCase().trim();
    if (!schema) return null;
    if (schema === "finanzas") return "plaza_mayor";
    if (schema === "finanzas_casadepiedra") return "casa_de_piedra";
    if (schema.indexOf("casadepiedra") !== -1) return "casa_de_piedra";
    return null;
  }

  function toTenantFromPath(pathname) {
    const path = String(pathname || window.location.pathname || "").toLowerCase();
    if (path.indexOf("/cotizadorcp/") !== -1) return "casa_de_piedra";
    if (path.indexOf("/cotizador/") !== -1) return "plaza_mayor";
    return null;
  }

  function normalizeAuthState(payload) {
    if (!payload || typeof payload !== "object") return null;
    const token = String(payload.token || payload.access_token || "").trim();
    const record = payload.record && typeof payload.record === "object" ? payload.record : null;
    const user = normalizeUser(payload.user || record || null);
    if (!token && !user) return null;
    return {
      ...payload,
      token: token || "",
      record: record || payload.user || null,
      user: user || null
    };
  }

  function readAuthState() {
    let resolved = null;
    for (let i = 0; i < AUTH_KEYS.length; i += 1) {
      const state = normalizeAuthState(parseJsonSafe(readAuthStorage(AUTH_KEYS[i]) || "null", null));
      if (state && state.token) {
        resolved = state;
        break;
      }
    }
    if (!resolved) return null;
    const raw = JSON.stringify(resolved);
    AUTH_KEYS.forEach(function (key) {
      writeAuthStorage(key, raw);
    });
    return resolved;
  }

  function writeAuthState(payload) {
    if (!payload) {
      AUTH_KEYS.forEach(function (key) {
        clearAuthStorage(key);
      });
      try { localStorage.removeItem("hub_auth_last_activity_v1"); } catch (_) {}
      try { localStorage.removeItem("hub_user_cache_name"); } catch (_) {}
      try { localStorage.removeItem("hub_user_cache_email"); } catch (_) {}
      try { localStorage.removeItem("hub_user_cache_role"); } catch (_) {}
      try { sessionStorage.removeItem("hub_layout_last_good_auth_v1"); } catch (_) {}
      return;
    }
    const normalized = normalizeAuthState(payload);
    if (!normalized) return;
    const raw = JSON.stringify(normalized);
    AUTH_KEYS.forEach(function (key) {
      writeAuthStorage(key, raw);
    });
  }

  function normalizeUser(record) {
    if (!record) return null;
    let role = String(record.role || "").toLowerCase().trim();
    if (role === "administrador" || role === "superadmin" || role === "super_admin") role = "admin";
    if (role === "both" || role === "ambos" || role === "user" || role === "usuario") role = "";
    if (role && ["admin", "plaza_mayor", "casa_de_piedra", "verificador"].indexOf(role) === -1) role = "";
    let allowed = Array.isArray(record.allowed_tenants)
      ? record.allowed_tenants.map((x) => String(x || "").toLowerCase().trim()).filter(Boolean)
      : [];
    if (!allowed.length) {
      if (role === "admin" || role === "verificador") allowed = ["plaza_mayor", "casa_de_piedra"];
      else if (role === "plaza_mayor" || role === "casa_de_piedra") allowed = [role];
    }
    return {
      id: record.id,
      email: record.email || "",
      username: record.login_username || record.username || "",
      role: role || "",
      allowed_tenants: allowed,
      tenant_default: record.tenant_default || null,
      default_tenant: record.tenant_default || null
    };
  }

  function authHeaders(extraHeaders) {
    const state = readAuthState();
    const headers = Object.assign({}, extraHeaders || {});
    if (state && state.token) headers.Authorization = state.token;
    return headers;
  }

  function hasAuthorizationHeader(headers) {
    if (!headers || typeof headers !== "object") return false;
    return !!String(headers.Authorization || headers.authorization || "").trim();
  }

  function isCrossOriginBaseUrl(baseUrl) {
    try {
      if (!window || !window.location || !window.location.origin) return false;
      return new URL(trimSlash(baseUrl), window.location.href).origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function resolveRequestCredentials(baseUrl, headers, explicitCredentials) {
    if (explicitCredentials) return explicitCredentials;
    if (isCrossOriginBaseUrl(baseUrl) && hasAuthorizationHeader(headers)) return "omit";
    return "include";
  }

  function escapeFilterValue(value) {
    if (value === null) return "null";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function mergeFilter(a, b) {
    const left = String(a || "").trim();
    const right = String(b || "").trim();
    if (!left) return right;
    if (!right) return left;
    return "(" + left + ") && (" + right + ")";
  }

  async function request(baseUrl, path, options) {
    const url = trimSlash(baseUrl) + path;
    const source = Object.assign({ method: "GET", headers: {}, cache: "no-store" }, options || {});
    const opts = Object.assign({}, source);
    opts.headers = Object.assign({}, opts.headers || {});
    opts.credentials = resolveRequestCredentials(baseUrl, opts.headers, source.credentials);

    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const isUrlEncoded = typeof URLSearchParams !== "undefined" && opts.body instanceof URLSearchParams;
    if (opts.body && !isForm && !isUrlEncoded && !opts.headers["Content-Type"]) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }

    let response;
    try {
      response = await fetch(url, opts);
    } catch (err) {
      const netErr = new Error("No se pudo conectar con PocketBase.");
      netErr.cause = err;
      throw netErr;
    }

    const text = await response.text();
    const json = text ? parseJsonSafe(text, null) : null;
    if (!response.ok) {
      const message =
        (json && json.message) ||
        (json && json.data && json.data.message) ||
        ("HTTP " + response.status);
      const err = new Error(message);
      err.status = response.status;
      err.details = json;
      throw err;
    }
    return json;
  }

  class CollectionClient {
    constructor(client, name) {
      this.client = client;
      this.name = String(name || "");
    }

    _tenantFilter(filter) {
      if (!TENANT_COLLECTIONS.has(this.name) || !this.client.tenant) return filter || "";
      return mergeFilter("tenant = " + escapeFilterValue(this.client.tenant), filter || "");
    }

    _tenantPayload(payload) {
      if (!TENANT_COLLECTIONS.has(this.name) || !this.client.tenant || !payload) return payload;
      if (typeof FormData !== "undefined" && payload instanceof FormData) {
        const fd = new FormData();
        for (const pair of payload.entries()) fd.append(pair[0], pair[1]);
        if (!fd.get("tenant")) fd.append("tenant", this.client.tenant);
        return fd;
      }
      if (typeof payload === "object" && !Array.isArray(payload)) {
        const copy = Object.assign({}, payload);
        if (!copy.tenant) copy.tenant = this.client.tenant;
        return copy;
      }
      return payload;
    }

    async list(options) {
      const params = Object.assign({ page: 1, perPage: 500 }, options || {});
      const qs = new URLSearchParams();
      qs.set("page", String(params.page || 1));
      qs.set("perPage", String(params.perPage || 500));
      if (params.sort) qs.set("sort", String(params.sort));
      const filter = this._tenantFilter(params.filter || "");
      if (filter) qs.set("filter", filter);
      if (params.fields) qs.set("fields", String(params.fields));
      return request(
        this.client.baseUrl,
        "/api/collections/" + encodeURIComponent(this.name) + "/records?" + qs.toString(),
        { method: "GET", headers: authHeaders() }
      );
    }

    async get(id) {
      return request(
        this.client.baseUrl,
        "/api/collections/" + encodeURIComponent(this.name) + "/records/" + encodeURIComponent(id),
        { method: "GET", headers: authHeaders() }
      );
    }

    async create(payload) {
      return request(
        this.client.baseUrl,
        "/api/collections/" + encodeURIComponent(this.name) + "/records",
        { method: "POST", headers: authHeaders(), body: this._tenantPayload(payload) }
      );
    }

    async update(id, payload) {
      return request(
        this.client.baseUrl,
        "/api/collections/" + encodeURIComponent(this.name) + "/records/" + encodeURIComponent(id),
        { method: "PATCH", headers: authHeaders(), body: this._tenantPayload(payload) }
      );
    }

    async remove(id) {
      return request(
        this.client.baseUrl,
        "/api/collections/" + encodeURIComponent(this.name) + "/records/" + encodeURIComponent(id),
        { method: "DELETE", headers: authHeaders() }
      );
    }
  }

  class PocketBaseClient {
    constructor(options) {
      const opts = options || {};
      this.baseUrl = trimSlash(
        opts.baseUrl ||
          (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) ||
          "http://127.0.0.1:8090"
      );
      this.schema = opts.schema || null;
      this.tenant =
        opts.tenant ||
        toTenantFromSchema(this.schema) ||
        toTenantFromPath(opts.pathname || window.location.pathname) ||
        null;
    }

    withSchema(schemaName) {
      return new PocketBaseClient({
        baseUrl: this.baseUrl,
        schema: schemaName,
        pathname: window.location.pathname
      });
    }

    withTenant(tenantName) {
      return new PocketBaseClient({
        baseUrl: this.baseUrl,
        tenant: tenantName,
        schema: this.schema,
        pathname: window.location.pathname
      });
    }

    collection(name) {
      return new CollectionClient(this, name);
    }

    async login(credentials) {
      const body = new FormData();
      body.append("identity", credentials.identity || credentials.email || "");
      body.append("password", credentials.password || "");
      const data = await request(this.baseUrl, "/api/hub/session/login", {
        method: "POST",
        body: body
      });
      const token = String(data?.token || data?.access_token || "").trim();
      const user = normalizeUser(data.user || data.record);
      writeAuthState({ token: token, record: data.user || data.record || null, user: user });
      return {
        token: token,
        user: user,
        record: data.user || data.record || null,
        session: token ? { access_token: token, token: token, user: user } : { user: user }
      };
    }

    async logout() {
      try {
        await request(this.baseUrl, "/api/hub/session/logout", {
          method: "POST"
        });
      } catch (_) {}
      writeAuthState(null);
      return true;
    }

    async getSession() {
      const state = readAuthState();
      if (state && state.user && state.token) {
        return {
          session: { access_token: state.token, user: state.user },
          user: state.user
        };
      }
      try {
        const data = await request(this.baseUrl, "/api/hub/session/current", {
          method: "GET"
        });
        const token = String(data?.token || data?.access_token || "").trim();
        const user = normalizeUser(data.user || data.record);
        if (!user) return { session: null, user: null };
        writeAuthState({ token: token, record: data.user || data.record || null, user: user });
        return { session: token ? { access_token: token, token: token, user: user } : { user: user }, user: user };
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403 || err.status === 404)) {
          writeAuthState(null);
          return { session: null, user: null };
        }
        throw err;
      }
    }

    async getUser() {
      const session = await this.getSession();
      return session.user || null;
    }

    async refreshSession() {
      try {
        const data = await request(this.baseUrl, "/api/hub/session/refresh", {
          method: "POST",
          headers: authHeaders()
        });
        const token = String(data?.token || data?.access_token || "").trim();
        const user = normalizeUser(data.user || data.record);
        if (!user) return null;
        writeAuthState({ token: token, record: data.user || data.record || null, user: user });
        return { user: user, session: token ? { access_token: token, token: token, user: user } : { user: user } };
      } catch (err) {
        if (err && (err.status === 401 || err.status === 403 || err.status === 404)) {
          writeAuthState(null);
          return null;
        }
        throw err;
      }
    }

    async getProfile(userId) {
      if (!userId) return null;
      try {
        const result = await this.collection("app_users").list({
          perPage: 1,
          filter: "id = " + escapeFilterValue(userId)
        });
        const profile = result && Array.isArray(result.items) ? result.items[0] : null;
        return normalizeUser(profile);
      } catch (err) {
        if (err && err.status === 404) return null;
        throw err;
      }
    }

    async createFileToken() {
      return request(this.baseUrl, "/api/files/token", {
        method: "POST",
        headers: authHeaders()
      });
    }

    async createSignedFileUrl(collectionName, recordId, fileName, ttlSeconds) {
      const tokenPayload = await this.createFileToken();
      const token = tokenPayload && tokenPayload.token ? tokenPayload.token : "";
      const ttl = Number(ttlSeconds || 3600);
      const url =
        trimSlash(this.baseUrl) +
        "/api/files/" +
        encodeURIComponent(collectionName) +
        "/" +
        encodeURIComponent(recordId) +
        "/" +
        encodeURIComponent(fileName) +
        "?token=" +
        encodeURIComponent(token) +
        "&ttl=" +
        encodeURIComponent(String(ttl));
      return url;
    }
  }

  function createClient(options) {
    return new PocketBaseClient(options || {});
  }

  window.PocketBaseCore = {
    createClient: createClient,
    request: request,
    mapSchemaToTenant: toTenantFromSchema,
    resolveTenantFromPath: toTenantFromPath,
    readAuthState: readAuthState,
    writeAuthState: writeAuthState
  };
})();


