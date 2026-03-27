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
    if (!token) return null;
    const record = payload.record && typeof payload.record === "object" ? payload.record : null;
    const user = normalizeUser(payload.user || record || null);
    if (!user) return null;
    return {
      ...payload,
      token: token,
      record: record || payload.user || null,
      user: user
    };
  }

  function readAuthState() {
    let resolved = null;
    for (let i = 0; i < AUTH_KEYS.length; i += 1) {
      const state = normalizeAuthState(parseJsonSafe(localStorage.getItem(AUTH_KEYS[i]) || "null", null));
      if (state && state.token) {
        resolved = state;
        break;
      }
    }
    if (!resolved) return null;
    const raw = JSON.stringify(resolved);
    AUTH_KEYS.forEach(function (key) {
      try {
        if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
      } catch (_) {}
    });
    return resolved;
  }

  function writeAuthState(payload) {
    if (!payload) {
      AUTH_KEYS.forEach(function (key) {
        try { localStorage.removeItem(key); } catch (_) {}
      });
      return;
    }
    const normalized = normalizeAuthState(payload);
    if (!normalized) return;
    const raw = JSON.stringify(normalized);
    AUTH_KEYS.forEach(function (key) {
      try { localStorage.setItem(key, raw); } catch (_) {}
    });
  }

  function normalizeUser(record) {
    if (!record) return null;
    const role = String(record.role || "user").toLowerCase().trim();
    let allowed = Array.isArray(record.allowed_tenants)
      ? record.allowed_tenants.map((x) => String(x || "").toLowerCase().trim()).filter(Boolean)
      : [];
    if (!allowed.length) {
      if (role === "admin") allowed = ["plaza_mayor", "casa_de_piedra"];
      else if (role === "plaza_mayor" || role === "casa_de_piedra") allowed = [role];
    }
    return {
      id: record.id,
      email: record.email || "",
      username: record.login_username || record.username || "",
      role: role || "user",
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
    const opts = Object.assign({ method: "GET", headers: {} }, options || {});
    opts.headers = Object.assign({}, opts.headers || {});

    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    if (opts.body && !isForm && !opts.headers["Content-Type"]) {
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
      const data = await request(this.baseUrl, "/api/collections/app_users/auth-with-password", {
        method: "POST",
        body: {
          identity: credentials.identity || credentials.email || "",
          password: credentials.password || ""
        }
      });
      const user = normalizeUser(data.record);
      writeAuthState({ token: data.token, record: data.record, user: user });
      return {
        token: data.token,
        user: user,
        record: data.record,
        session: { access_token: data.token, user: user }
      };
    }

    async logout() {
      writeAuthState(null);
      return true;
    }

    async getSession() {
      const state = readAuthState();
      if (!state || !state.token || !state.user) return { session: null, user: null };
      return { session: { access_token: state.token, user: state.user }, user: state.user };
    }

    async getUser() {
      const session = await this.getSession();
      return session.user || null;
    }

    async getProfile(userId) {
      if (!userId) return null;
      const profile = await this.collection("app_users").get(userId);
      return normalizeUser(profile);
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


