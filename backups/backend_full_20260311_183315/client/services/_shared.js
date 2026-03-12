/* Shared helpers for native PocketBase service modules. */
(function () {
  if (window.PBServicesShared) return;

  const LEGACY_COLLECTIONS = new Set([
    "clientes",
    "conceptos_catalogo",
    "configuracion",
    "impuestos",
    "espacios",
    "cotizaciones"
  ]);

  const NUMERIC_LEGACY_COLLECTIONS = new Set([
    "clientes",
    "conceptos_catalogo",
    "configuracion",
    "impuestos",
    "espacios"
  ]);

  function cloneJson(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function trimSlash(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function uuidv4() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
      const random = (Math.random() * 16) | 0;
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function isPbRecordId(value) {
    return /^[a-z0-9]{15}$/i.test(String(value || "").trim());
  }

  function parseJsonSafe(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeDateString(value) {
    const str = String(value || "").trim();
    if (!str) return str;
    if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/.test(str)) return str.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);
    return str;
  }

  function normalizeDeepDates(value) {
    if (Array.isArray(value)) return value.map(normalizeDeepDates);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach(function (key) {
        out[key] = normalizeDeepDates(value[key]);
      });
      return out;
    }
    if (typeof value === "string") return normalizeDateString(value);
    return value;
  }

  function getBaseUrl() {
    const hub = window.HUB_CONFIG || {};
    return trimSlash(hub.pocketbaseUrl || hub.supabaseUrl || "http://127.0.0.1:8090");
  }

  function mapLegacyRecordOut(collectionName, record) {
    if (!record) return record;
    const normalized = normalizeDeepDates(record);
    const out = Object.assign({}, normalized, { _pb_id: record.id });
    if (record.legacy_id !== undefined && record.legacy_id !== null && record.legacy_id !== "") out.id = record.legacy_id;
    else out.id = record.id;
    out.created_at = out.created_at || record.created || null;
    out.updated_at = out.updated_at || record.updated || null;

    if (collectionName === "espacios") {
      const filename = Array.isArray(record.imagen) ? record.imagen[0] : record.imagen;
      if (filename && record.id) {
        out.imagen_url =
          getBaseUrl() +
          "/api/files/espacios/" +
          encodeURIComponent(record.id) +
          "/" +
          encodeURIComponent(filename);
      }
    }

    if (collectionName === "cotizaciones") {
      out.cliente_id = record.cliente_legacy_id || record.cliente_id || null;
      out.creado_por = record.creado_por_legacy || record.creado_por || null;
    }

    return out;
  }

  function escapeFilterValue(value) {
    if (value === null) return "null";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  function translateFilter(collectionName, filter) {
    let out = String(filter || "");
    if (!out) return out;
    if (collectionName === "cotizaciones") {
      out = out.replace(/\bcliente_id\b/g, "cliente_legacy_id");
      out = out.replace(/\bcreado_por\b/g, "creado_por_legacy");
    }
    if (LEGACY_COLLECTIONS.has(collectionName)) out = out.replace(/\bid\b/g, "legacy_id");
    return out;
  }

  function translatePayload(collectionName, payload) {
    if (typeof FormData !== "undefined" && payload instanceof FormData) {
      const form = new FormData();
      for (const pair of payload.entries()) form.append(pair[0], pair[1]);
      if (collectionName === "cotizaciones") {
        if (form.get("cliente_id")) {
          form.append("cliente_legacy_id", form.get("cliente_id"));
          form.delete("cliente_id");
        }
        if (form.get("creado_por")) {
          form.append("creado_por_legacy", form.get("creado_por"));
          form.delete("creado_por");
        }
      }
      return form;
    }
    const data = cloneJson(payload);
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    if (collectionName === "cotizaciones") {
      if (Object.prototype.hasOwnProperty.call(data, "cliente_id")) {
        data.cliente_legacy_id = data.cliente_id;
        delete data.cliente_id;
      }
      if (Object.prototype.hasOwnProperty.call(data, "creado_por")) {
        data.creado_por_legacy = data.creado_por;
        delete data.creado_por;
      }
    }
    return data;
  }

  function ensureLegacyIdInFormData(collectionName, payload, nextLegacyId) {
    if (typeof FormData === "undefined" || !(payload instanceof FormData)) return payload;
    const fd = new FormData();
    for (const pair of payload.entries()) fd.append(pair[0], pair[1]);
    if (!fd.get("legacy_id")) fd.append("legacy_id", String(nextLegacyId));
    return fd;
  }

  async function nextLegacyId(collectionName, client) {
    if (!LEGACY_COLLECTIONS.has(collectionName)) return null;
    if (NUMERIC_LEGACY_COLLECTIONS.has(collectionName)) {
      const result = await client.collection(collectionName).list({ page: 1, perPage: 1, sort: "-legacy_id" });
      const item = (result && result.items && result.items[0]) || null;
      const current = Number(item && item.legacy_id) || 0;
      return current + 1;
    }
    return uuidv4();
  }

  async function ensureLegacyId(collectionName, payload, client) {
    if (!LEGACY_COLLECTIONS.has(collectionName)) return payload;

    if (typeof FormData !== "undefined" && payload instanceof FormData) {
      if (payload.get("legacy_id")) return payload;
      return ensureLegacyIdInFormData(collectionName, payload, await nextLegacyId(collectionName, client));
    }

    const data = cloneJson(payload);
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    if (data.legacy_id !== undefined && data.legacy_id !== null && data.legacy_id !== "") return data;
    data.legacy_id = await nextLegacyId(collectionName, client);
    return data;
  }

  async function resolveRecordId(collectionName, id, client) {
    if (id === undefined || id === null || id === "") return id;
    const raw = String(id).trim();
    if (!LEGACY_COLLECTIONS.has(collectionName) || isPbRecordId(raw)) return raw;
    const queryFilter = "legacy_id = " + escapeFilterValue(raw);
    const result = await client.collection(collectionName).list({ page: 1, perPage: 1, filter: queryFilter });
    const item = (result && result.items && result.items[0]) || null;
    return (item && item.id) || raw;
  }

  function resolveSchema() {
    if (typeof TENANT_SCHEMA !== "undefined" && TENANT_SCHEMA) return TENANT_SCHEMA;
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.indexOf("/cotizadorcp/") !== -1) return "finanzas_casadepiedra";
    if (path.indexOf("/cotizador/") !== -1) return "finanzas";
    return (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || "finanzas";
  }

  function getClient(options) {
    if (!window.PocketBaseCore || !window.PocketBaseCore.createClient) {
      throw new Error("PocketBaseCore no está cargado.");
    }
    const opts = Object.assign({ schema: resolveSchema() }, options || {});
    return window.PocketBaseCore.createClient(opts);
  }

  function mapListResponse(response) {
    const items = (response && response.items) || [];
    return {
      items: items,
      totalItems: Number(response && response.totalItems) || items.length,
      totalPages: Number(response && response.totalPages) || 1,
      page: Number(response && response.page) || 1,
      perPage: Number(response && response.perPage) || items.length
    };
  }

  function createCrudService(collectionName) {
    return {
      async list(query, options) {
        const client = getClient(options);
        const params = Object.assign({}, query || {});
        if (params.filter) params.filter = translateFilter(collectionName, params.filter);
        const result = await client.collection(collectionName).list(params);
        const page = mapListResponse(result);
        page.items = (page.items || []).map(function (item) {
          return mapLegacyRecordOut(collectionName, item);
        });
        return page;
      },
      async get(id, options) {
        const client = getClient(options);
        const recordId = await resolveRecordId(collectionName, id, client);
        const row = await client.collection(collectionName).get(recordId);
        return mapLegacyRecordOut(collectionName, row);
      },
      async create(payload, options) {
        const client = getClient(options);
        let data = translatePayload(collectionName, payload || {});
        data = await ensureLegacyId(collectionName, data, client);
        const created = await client.collection(collectionName).create(data);
        return mapLegacyRecordOut(collectionName, created);
      },
      async update(id, payload, options) {
        const client = getClient(options);
        const recordId = await resolveRecordId(collectionName, id, client);
        const data = translatePayload(collectionName, payload || {});
        const updated = await client.collection(collectionName).update(recordId, data);
        return mapLegacyRecordOut(collectionName, updated);
      },
      async remove(id, options) {
        const client = getClient(options);
        const recordId = await resolveRecordId(collectionName, id, client);
        return client.collection(collectionName).remove(recordId);
      }
    };
  }

  window.PBServicesShared = {
    resolveSchema: resolveSchema,
    getClient: getClient,
    createCrudService: createCrudService,
    mapListResponse: mapListResponse,
    mapLegacyRecordOut: mapLegacyRecordOut,
    resolveRecordId: resolveRecordId,
    translateFilter: translateFilter,
    parseJsonSafe: parseJsonSafe
  };
})();
