/* Shared helpers for native PocketBase service modules. */
(function () {
  if (window.PBServicesShared) return;

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

  function parseJsonFieldValue(value) {
    if (typeof value !== "string") return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    const parsed = parseJsonSafe(raw, undefined);
    return parsed === undefined ? undefined : parsed;
  }

  function coerceJsonFields(record, fields) {
    if (!record || !Array.isArray(fields)) return;
    fields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) return;
      const parsed = parseJsonFieldValue(record[field]);
      if (parsed !== undefined) record[field] = parsed;
    });
  }

  function getBaseUrl() {
    const hub = window.HUB_CONFIG || {};
    return trimSlash(hub.pocketbaseUrl || "http://127.0.0.1:8090");
  }

  function buildNativeQuoteFolio(record) {
    const current = String((record && record.numero_orden) || "").trim();
    if (current) return current;
    const tenant = String((record && record.tenant) || "").trim().toLowerCase();
    const prefix = tenant === "casa_de_piedra" ? "CP" : (tenant === "plaza_mayor" ? "PM" : "COT");
    const nativeId = String((record && record.id) || "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase();
    const shortId = nativeId.slice(0, 6) || "PEND";
    return prefix + "-" + shortId;
  }

  function mapRecordOut(collectionName, record) {
    if (!record) return record;
    const normalized = normalizeDeepDates(record);
    const out = Object.assign({}, normalized, { _pb_id: record.id });
    out.id = record.id;
    out.created_at = out.created_at || record.created || null;
    out.updated_at = out.updated_at || record.updated || null;

    if (collectionName === "configuracion") {
      coerceJsonFields(out, ["valor_json"]);
    } else if (collectionName === "impuestos") {
      coerceJsonFields(out, ["impuestos_aplicados"]);
    } else if (collectionName === "espacios") {
      coerceJsonFields(out, ["impuestos_ids", "etiquetas", "precios_por_dia", "dias_bloqueados", "config_b2b"]);
    } else if (collectionName === "cotizaciones") {
      coerceJsonFields(out, [
        "desglose_precios",
        "desglose_impuestos",
        "historial_pagos",
        "datos_factura",
        "datos_fiscales",
        "conceptos_adicionales",
        "detalles_evento",
        "espacios_detalle",
        "notas_pdf"
      ]);
      out.numero_orden = buildNativeQuoteFolio(record);
    }

    if (collectionName === "espacios") {
      const baseUrl = getBaseUrl();
      const imageFields = ["imagen", "imagen2", "imagen3", "imagen4", "imagen5"];
      const imageUrls = [];
      imageFields.forEach(function (fieldName) {
        const filename = Array.isArray(record[fieldName]) ? record[fieldName][0] : record[fieldName];
        if (!filename || !record.id) return;
        imageUrls.push(
          baseUrl +
          "/api/files/espacios/" +
          encodeURIComponent(record.id) +
          "/" +
          encodeURIComponent(filename)
        );
      });
      out.imagen_url = imageUrls.length ? JSON.stringify(imageUrls) : "";
    }

    return out;
  }

  function normalizePayload(payload) {
    if (typeof FormData !== "undefined" && payload instanceof FormData) {
      const form = new FormData();
      for (const pair of payload.entries()) form.append(pair[0], pair[1]);
      return form;
    }
    return cloneJson(payload);
  }

  async function resolveRecordId(collectionName, id, client) {
    if (id === undefined || id === null || id === "") return id;
    return String(id).trim();
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
        const result = await client.collection(collectionName).list(params);
        const page = mapListResponse(result);
        page.items = (page.items || []).map(function (item) {
          return mapRecordOut(collectionName, item);
        });
        return page;
      },
      async get(id, options) {
        const client = getClient(options);
        const recordId = await resolveRecordId(collectionName, id, client);
        const row = await client.collection(collectionName).get(recordId);
        return mapRecordOut(collectionName, row);
      },
      async create(payload, options) {
        const client = getClient(options);
        const data = normalizePayload(payload || {});
        const created = await client.collection(collectionName).create(data);
        return mapRecordOut(collectionName, created);
      },
      async update(id, payload, options) {
        const client = getClient(options);
        const recordId = await resolveRecordId(collectionName, id, client);
        const data = normalizePayload(payload || {});
        const updated = await client.collection(collectionName).update(recordId, data);
        return mapRecordOut(collectionName, updated);
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
    mapRecordOut: mapRecordOut,
    resolveRecordId: resolveRecordId,
    parseJsonSafe: parseJsonSafe
  };
})();
