
/* PocketBase native runtime client with direct record field usage.
 * Backed directly by PocketBase REST API.
 */
(function () {
  const AUTH_KEYS = ['pb_native_auth_v1', 'pb_compat_auth_v1', 'pb_auth'];
  const APP_ROLES = ['admin', 'plaza_mayor', 'casa_de_piedra', 'verificador'];

  function trimSlash(url) { return String(url || '').replace(/\/+$/, ''); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeJsonParse(v, fallback) { try { return JSON.parse(v); } catch (_) { return fallback; } }
  function readAuthStorage(key) {
    try {
      const sessionValue = sessionStorage.getItem(key);
      if (sessionValue) return sessionValue;
    } catch (_) { }
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function writeAuthStorage(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) { }
    try { localStorage.removeItem(key); } catch (_) { }
  }
  function clearAuthStorage(key) {
    try { sessionStorage.removeItem(key); } catch (_) { }
    try { localStorage.removeItem(key); } catch (_) { }
  }
  function normalizeDateString(v) {
    const s = String(v || '').trim();
    if (!s) return s;
    if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/.test(s)) return s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    return s;
  }
  function normalizeDeepDates(value) {
    if (Array.isArray(value)) return value.map(normalizeDeepDates);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(function (k) { out[k] = normalizeDeepDates(value[k]); });
      return out;
    }
    if (typeof value === 'string') return normalizeDateString(value);
    return value;
  }
  function recordFileName(record, field) {
    const v = record ? record[field] : null;
    return Array.isArray(v) ? v[0] : v;
  }
  function recordFileUrl(baseUrl, collection, record, field) {
    const filename = recordFileName(record, field);
    if (!filename || !record || !record.id) return null;
    const versionValue = String(record.updated || record.updated_at || record.created || record.created_at || filename || '').trim();
    const versionQuery = versionValue ? ('?v=' + encodeURIComponent(versionValue)) : '';
    return trimSlash(baseUrl) + '/api/files/' + encodeURIComponent(collection) + '/' + encodeURIComponent(record.id) + '/' + encodeURIComponent(filename) + versionQuery;
  }
  function normalizeSchemaToTenant(schema) {
    const s = String(schema || '').toLowerCase();
    if (s === 'finanzas') return 'plaza_mayor';
    if (s.indexOf('casadepiedra') !== -1) return 'casa_de_piedra';
    return null;
  }
  function errObj(message, extra) {
    const e = Object.assign({ message: message || 'Error' }, extra || {});
    return e;
  }
  function parseJsonFieldValue(value) {
    if (typeof value !== 'string') return undefined;
    const raw = value.trim();
    if (!raw) return undefined;
    const parsed = safeJsonParse(raw, undefined);
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
  function mapProfileOut(record) {
    if (!record) return record;
    record = normalizeDeepDates(record);
    let role = String(record.role || '').toLowerCase().trim();
    if (role === 'administrador' || role === 'superadmin' || role === 'super_admin') role = 'admin';
    if (role === 'both' || role === 'ambos' || role === 'user' || role === 'usuario') role = '';
    if (role && APP_ROLES.indexOf(role) === -1) role = '';
    const allowedRaw = Array.isArray(record.allowed_tenants)
      ? record.allowed_tenants
      : (function () {
        const parsed = parseJsonFieldValue(record.allowed_tenants);
        return Array.isArray(parsed) ? parsed : [];
      })();
    let allowed = allowedRaw.filter(Boolean).map(v => String(v).toLowerCase().trim());
    if (!allowed.length) {
      if (role === 'admin' || role === 'verificador') allowed = ['plaza_mayor', 'casa_de_piedra'];
      else if (role === 'plaza_mayor' || role === 'casa_de_piedra') allowed = [role];
    }
    return {
      ...record,
      id: record.id,
      username: record.login_username || record.username || '',
      role: role || '',
      allowed_tenants: allowed,
      tenant_default: record.tenant_default || record.default_tenant || null,
      default_tenant: record.tenant_default || record.default_tenant || null,
      created_at: record.created_at || record.created || null,
      updated_at: record.updated_at || record.updated || null,
    };
  }
  function normalizeAuthPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const token = String(payload.token || payload.access_token || '').trim();
    const record = payload.record && typeof payload.record === 'object' ? payload.record : null;
    const user = mapProfileOut(payload.user || record || null);
    if (!token && !user) return null;
    return {
      ...payload,
      token: token || '',
      record: record || payload.user || null,
      user: user || null
    };
  }
  function readAuth() {
    let resolved = null;
    for (let i = 0; i < AUTH_KEYS.length; i += 1) {
      const parsed = safeJsonParse(readAuthStorage(AUTH_KEYS[i]) || 'null', null);
      const normalized = normalizeAuthPayload(parsed);
      if (normalized) {
        resolved = normalized;
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
  function writeAuth(payload) {
    if (!payload) {
      AUTH_KEYS.forEach(function (key) {
        clearAuthStorage(key);
      });
      try { localStorage.removeItem('hub_auth_last_activity_v1'); } catch (_) { }
      try { localStorage.removeItem('hub_user_cache_name'); } catch (_) { }
      try { localStorage.removeItem('hub_user_cache_email'); } catch (_) { }
      try { localStorage.removeItem('hub_user_cache_role'); } catch (_) { }
      try { sessionStorage.removeItem('hub_layout_last_good_auth_v1'); } catch (_) { }
      return;
    }
    const normalized = normalizeAuthPayload(payload);
    if (!normalized) return;
    const raw = JSON.stringify(normalized);
    AUTH_KEYS.forEach(function (key) {
      writeAuthStorage(key, raw);
    });
  }
  function authHeader() {
    const st = readAuth();
    return st && st.token ? { 'Authorization': st.token } : {};
  }
  function hasAuthorizationHeader(headers) {
    if (!headers || typeof headers !== 'object') return false;
    return !!String(headers.Authorization || headers.authorization || '').trim();
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
    if (isCrossOriginBaseUrl(baseUrl) && hasAuthorizationHeader(headers)) return 'omit';
    return 'include';
  }
  function buildNativeQuoteFolio(record) {
    const current = String((record && record.numero_orden) || '').trim();
    if (current) return current;
    const tenant = String((record && record.tenant) || '').trim().toLowerCase();
    const prefix = tenant === 'casa_de_piedra' ? 'CP' : (tenant === 'plaza_mayor' ? 'PM' : 'COT');
    const nativeId = String((record && record.id) || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const shortId = nativeId.slice(0, 6) || 'PEND';
    return prefix + '-' + shortId;
  }
  function mapBusinessOut(collection, record) {
    if (!record) return record;
    const normalized = normalizeDeepDates(record);
    const out = { ...normalized, _pb_id: record.id };
    if (collection === 'configuracion') {
      coerceJsonFields(out, ['valor_json']);
    } else if (collection === 'impuestos') {
      coerceJsonFields(out, ['impuestos_aplicados']);
    } else if (collection === 'clientes') {
      coerceJsonFields(out, ['telefonos_adicionales', 'correos_adicionales', 'documentos_estado', 'expediente_validacion']);
    } else if (collection === 'espacios') {
      coerceJsonFields(out, ['impuestos_ids', 'etiquetas', 'precios_por_dia', 'dias_bloqueados', 'config_b2b']);
    } else if (collection === 'cotizaciones') {
      coerceJsonFields(out, [
        'desglose_precios',
        'desglose_impuestos',
        'historial_pagos',
        'datos_factura',
        'datos_fiscales',
        'conceptos_adicionales',
        'detalles_evento',
        'espacios_detalle',
        'notas_pdf'
      ]);
    }
    if (collection === 'espacios') {
      const urls = [];
      ['imagen', 'imagen2', 'imagen3', 'imagen4', 'imagen5'].forEach(f => {
        const u = recordFileUrl(window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl, 'espacios', record, f);
        if (u) urls.push(u);
      });
      out.imagen_url = urls.length > 0 ? JSON.stringify(urls) : '';
    }
    out.id = record.id;
    out.created_at = out.created_at || record.created || null;
    out.updated_at = out.updated_at || record.updated || null;
    if (collection === 'cotizaciones') out.numero_orden = buildNativeQuoteFolio(record);
    return out;
  }
  function mapDocumentOut(record, baseUrl) {
    if (!record) return record;
    record = normalizeDeepDates(record);
    const filename = Array.isArray(record.archivo) ? record.archivo[0] : record.archivo;
    return {
      ...record,
      name: record.nombre_original || filename || '',
      file_path: record.ruta || '',
      publicUrl: filename ? (trimSlash(baseUrl) + '/api/files/documentos/' + record.id + '/' + encodeURIComponent(filename)) : null,
    };
  }
  function mapFieldName(collection, field, dir) {
    const f = String(field || '');
    if (collection === 'app_users') {
      if (f === 'username') return 'login_username';
      if (f === 'default_tenant') return 'tenant_default';
      return f;
    }
    return f;
  }
  function escapeFilterValue(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  function parseOrExpression(raw, originalCollection) {
    const s = String(raw || '').trim();
    const m = s.match(/^and\((.+)\)$/);
    const body = m ? m[1] : s;
    const parts = body.split(',').map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const mm = p.match(/^([^.]+)\.(eq|neq|lte|gte|lt|gt)\.(.+)$/);
      if (!mm) continue;
      const field = mapFieldName(originalCollection, mm[1], 'filter');
      const op = mm[2];
      const value = mm[3];
      const mappedOp = ({ eq: '=', neq: '!=', lte: '<=', gte: '>=', lt: '<', gt: '>' })[op] || '=';
      out.push(field + ' ' + mappedOp + ' ' + escapeFilterValue(value));
    }
    return out;
  }
  async function pbFetch(baseUrl, path, options) {
    const url = trimSlash(baseUrl) + path;
    const source = Object.assign({ method: 'GET', headers: {}, cache: 'no-store' }, options || {});
    const opts = Object.assign({}, source);
    opts.headers = Object.assign({}, opts.headers || {});
    opts.credentials = resolveRequestCredentials(baseUrl, opts.headers, source.credentials);
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const isUrlEncoded = typeof URLSearchParams !== 'undefined' && opts.body instanceof URLSearchParams;
    if (opts.body && !isForm && !isUrlEncoded && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let resp;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      throw errObj('No se pudo conectar con PocketBase: ' + (e.message || e));
    }
    let text = await resp.text();
    let data = text ? safeJsonParse(text, null) : null;
    if (!resp.ok) {
      const message = (data && data.data && data.data.message) ? data.data.message : ((data && data.message) ? data.message : ('HTTP ' + resp.status));
      throw errObj(message, { status: resp.status, data: data });
    }
    return data;
  }
  async function fetchRecords(baseUrl, collection, opts) {
    opts = opts || {};
    const qs = new URLSearchParams();
    qs.set('page', '1');
    qs.set('perPage', String(opts.perPage || 500));
    if (opts.sort) qs.set('sort', opts.sort);
    if (opts.filter) qs.set('filter', opts.filter);
    return pbFetch(baseUrl, '/api/collections/' + encodeURIComponent(collection) + '/records?' + qs.toString(), {
      method: 'GET', headers: Object.assign({}, authHeader())
    });
  }
  async function fetchOne(baseUrl, collection, id) {
    return pbFetch(baseUrl, '/api/collections/' + encodeURIComponent(collection) + '/records/' + encodeURIComponent(id), {
      method: 'GET', headers: Object.assign({}, authHeader())
    });
  }
  async function createRecord(baseUrl, collection, payload) {
    const isForm = (typeof FormData !== 'undefined') && payload instanceof FormData;
    return pbFetch(baseUrl, '/api/collections/' + encodeURIComponent(collection) + '/records', {
      method: 'POST', headers: Object.assign({}, authHeader()), body: payload
    });
  }
  async function updateRecord(baseUrl, collection, id, payload) {
    return pbFetch(baseUrl, '/api/collections/' + encodeURIComponent(collection) + '/records/' + encodeURIComponent(id), {
      method: 'PATCH', headers: Object.assign({}, authHeader()), body: payload
    });
  }
  async function deleteRecord(baseUrl, collection, id) {
    return pbFetch(baseUrl, '/api/collections/' + encodeURIComponent(collection) + '/records/' + encodeURIComponent(id), {
      method: 'DELETE', headers: Object.assign({}, authHeader())
    });
  }

  class QueryBuilder {
    constructor(client, table) {
      this.client = client;
      this.originalTable = table;
      this.collection = table;
      this.action = 'select';
      this.selectFields = '*';
      this.filters = [];
      this.sort = '';
      this.limitNum = 0;
      this.singleMode = '';
      this.payload = null;
      this.onConflict = null;
      this._wantReturn = false;
    }
    select(fields) { this.selectFields = fields || '*'; this._wantReturn = true; return this; }
    insert(payload) { this.action = 'insert'; this.payload = payload; return this; }
    update(payload) { this.action = 'update'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }
    upsert(payload, options) { this.action = 'upsert'; this.payload = payload; this.onConflict = options && options.onConflict ? options.onConflict : 'id'; return this; }
    eq(field, value) { this.filters.push({ op: 'eq', field, value }); return this; }
    neq(field, value) { this.filters.push({ op: 'neq', field, value }); return this; }
    lt(field, value) { this.filters.push({ op: 'lt', field, value }); return this; }
    lte(field, value) { this.filters.push({ op: 'lte', field, value }); return this; }
    gt(field, value) { this.filters.push({ op: 'gt', field, value }); return this; }
    gte(field, value) { this.filters.push({ op: 'gte', field, value }); return this; }
    in(field, values) { this.filters.push({ op: 'in', field, value: values }); return this; }
    order(field, options) { const asc = !(options && options.ascending === false); this.sort = (asc ? '' : '-') + mapFieldName(this.originalTable, field, 'sort'); return this; }
    limit(n) { this.limitNum = n || 0; return this; }
    single() { this.singleMode = 'single'; return this; }
    maybeSingle() { this.singleMode = 'maybeSingle'; return this; }
    or(expr) { this.filters.push({ op: 'orExpr', field: '', value: expr }); return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    _tenantFilterParts() {
      const tenant = this.client.tenant;
      if (!tenant) return [];
      if (this.collection === 'app_users' || this.collection === 'hub_notifications') return [];
      return ['tenant = ' + escapeFilterValue(tenant)];
    }
    _buildFilter() {
      const parts = this._tenantFilterParts();
      for (const f of this.filters) {
        const field = mapFieldName(this.originalTable, f.field, 'filter');
        if (f.op === 'eq') parts.push(field + ' = ' + escapeFilterValue(f.value));
        else if (f.op === 'neq') parts.push(field + ' != ' + escapeFilterValue(f.value));
        else if (f.op === 'lt') parts.push(field + ' < ' + escapeFilterValue(f.value));
        else if (f.op === 'lte') parts.push(field + ' <= ' + escapeFilterValue(f.value));
        else if (f.op === 'gt') parts.push(field + ' > ' + escapeFilterValue(f.value));
        else if (f.op === 'gte') parts.push(field + ' >= ' + escapeFilterValue(f.value));
        else if (f.op === 'in') {
          const vals = Array.isArray(f.value) ? f.value : [f.value];
          const orp = vals.map(v => field + ' = ' + escapeFilterValue(v));
          if (orp.length) parts.push('(' + orp.join(' || ') + ')');
        } else if (f.op === 'orExpr') {
          const sub = parseOrExpression(f.value, this.originalTable);
          parts.push.apply(parts, sub);
        }
      }
      return parts.filter(Boolean).join(' && ');
    }
    _mapOut(record) {
      if (this.collection === 'app_users') return mapProfileOut(record);
      if (this.collection === 'documentos') return mapDocumentOut(record, this.client.baseUrl);
      return mapBusinessOut(this.collection, record);
    }
    _normalizePayload(payload) {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        const fd = new FormData();
        for (const pair of payload.entries()) fd.append(pair[0], pair[1]);
        if (this.client.tenant && this.collection !== 'app_users' && this.collection !== 'hub_notifications' && !fd.get('tenant')) fd.append('tenant', this.client.tenant);
        return fd;
      }
      let p = clone(payload);
      if (Array.isArray(p)) p = p[0];
      if (!isObject(p)) return p;
      if (this.client.tenant && this.collection !== 'app_users' && this.collection !== 'hub_notifications' && !p.tenant) p.tenant = this.client.tenant;
      if (this.collection === 'app_users') {
        if (Object.prototype.hasOwnProperty.call(p, 'username')) { p.login_username = p.username; delete p.username; }
        if (Object.prototype.hasOwnProperty.call(p, 'default_tenant')) { p.tenant_default = p.default_tenant; delete p.default_tenant; }
      }
      return p;
    }
    async _findMatchingRecords() {
      const filter = this._buildFilter();
      if (this.collection === 'app_users' && this.singleMode && this.filters.length === 1 && this.filters[0].op === 'eq' && this.filters[0].field === 'id') {
        try {
          return [await fetchOne(this.client.baseUrl, 'app_users', this.filters[0].value)];
        } catch (e) {
          if (this.singleMode === 'maybeSingle') return [];
          throw e;
        }
      }
      const list = await fetchRecords(this.client.baseUrl, this.collection, { perPage: this.limitNum || 500, sort: this.sort, filter: filter });
      let items = list.items || [];
      if (this.limitNum) items = items.slice(0, this.limitNum);
      return items;
    }
    async execute() {
      try {
        if (this.action === 'select') {
          const items = await this._findMatchingRecords();
          const mapped = items.map(r => this._mapOut(r));
          if (this.singleMode === 'single') {
            if (mapped.length !== 1) return { data: null, error: errObj('Expected single record') };
            return { data: mapped[0], error: null };
          }
          if (this.singleMode === 'maybeSingle') return { data: mapped[0] || null, error: null };
          return { data: mapped, error: null };
        }
        if (this.action === 'insert') {
          const payload = this._normalizePayload(this.payload);
          const created = await createRecord(this.client.baseUrl, this.collection, payload);
          return { data: this._mapOut(created), error: null };
        }
        if (this.action === 'upsert') {
          const payload = this._normalizePayload(this.payload);
          const conflictField = mapFieldName(this.originalTable, this.onConflict || 'id', 'filter');
          const filterField = conflictField;
          const filterVal = (typeof FormData !== 'undefined' && payload instanceof FormData)
            ? payload.get(filterField)
            : (payload && typeof payload === 'object' ? payload[filterField] : undefined);
          if (filterVal === undefined || filterVal === null || filterVal === '') {
            const created = await createRecord(this.client.baseUrl, this.collection, payload);
            return { data: this._mapOut(created), error: null };
          }
          const temp = new QueryBuilder(this.client, this.originalTable);
          temp.collection = this.collection;
          temp.eq(filterField, filterVal);
          const found = await temp._findMatchingRecords();
          if (found.length) {
            const updated = await updateRecord(this.client.baseUrl, this.collection, found[0].id, payload);
            return { data: this._mapOut(updated), error: null };
          }
          const created = await createRecord(this.client.baseUrl, this.collection, payload);
          return { data: this._mapOut(created), error: null };
        }
        if (this.action === 'update') {
          const targets = await this._findMatchingRecords();
          if (!targets.length) return { data: null, error: errObj('No se encontró el registro a actualizar') };
          const payload = this._normalizePayload(this.payload);
          let last = null;
          for (const item of targets) last = await updateRecord(this.client.baseUrl, this.collection, item.id, payload);
          return { data: last ? this._mapOut(last) : null, error: null };
        }
        if (this.action === 'delete') {
          const targets = await this._findMatchingRecords();
          for (const item of targets) await deleteRecord(this.client.baseUrl, this.collection, item.id);
          return { data: targets.map(r => this._mapOut(r)), error: null };
        }
        return { data: null, error: errObj('Acción no soportada') };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e), e) };
      }
    }
  }

  class StorageBucket {
    constructor(client, bucket) { this.client = client; this.bucket = bucket; }
    _tenant() {
      const b = String(this.bucket || '').toLowerCase();
      if (b.indexOf('cp') !== -1) return 'casa_de_piedra';
      if (this.client.tenant) return this.client.tenant;
      return 'plaza_mayor';
    }
    _tenantFilter() {
      return 'tenant = ' + escapeFilterValue(this._tenant());
    }
    _guessTipo(path) {
      const p = String(path || '').toLowerCase();
      if (p.indexOf('cotizacion') !== -1) return 'cotizacion_final';
      if (p.indexOf('contrato') !== -1) return 'contrato';
      if (p.indexOf('orden') !== -1) return 'orden_compra';
      if (p.endsWith('.xml')) return 'factura_xml';
      if (p.indexOf('factura') !== -1) return 'factura_pdf';
      return 'otro';
    }
    _quotePathKeyFromPath(path) {
      const raw = String(path || '').replace(/\\/g, '/').trim();
      const first = raw.split('/').filter(Boolean)[0] || '';
      return first || '';
    }
    _fieldForTipo(tipo) {
      if (tipo === 'cotizacion_final') return 'url_cotizacion_final';
      if (tipo === 'orden_compra') return 'url_orden_compra';
      if (tipo === 'contrato') return 'contrato_url';
      if (tipo === 'factura_pdf') return 'factura_pdf_url';
      if (tipo === 'factura_xml') return 'factura_xml_url';
      return '';
    }
    async _findByPath(path) {
      const filter = this._tenantFilter() + ' && ruta = ' + escapeFilterValue(path);
      const list = await fetchRecords(this.client.baseUrl, 'documentos', { perPage: 1, filter: filter });
      return (list.items || [])[0] || null;
    }
    async _findQuoteByPathKey(pathKey) {
      const value = String(pathKey || '').trim();
      if (!value) return null;
      try {
        const byId = await fetchOne(this.client.baseUrl, 'cotizaciones', value);
        if (byId && byId.id) return byId;
      } catch (_) { }
      const filter = this._tenantFilter() + ' && id = ' + escapeFilterValue(value);
      const list = await fetchRecords(this.client.baseUrl, 'cotizaciones', { perPage: 1, filter: filter });
      return (list.items || [])[0] || null;
    }
    async _syncKnownQuoteField(path, clearInstead) {
      const tipo = this._guessTipo(path);
      const field = this._fieldForTipo(tipo);
      const quotePathKey = this._quotePathKeyFromPath(path);
      if (!field || !quotePathKey) return;
      try {
        const quote = await this._findQuoteByPathKey(quotePathKey);
        if (!quote || !quote.id) return;
        const current = quote[field] || '';
        if (clearInstead) {
          if (current && current !== path) return;
          await updateRecord(this.client.baseUrl, 'cotizaciones', quote.id, { [field]: '' });
          return;
        }
        if (current === path) return;
        await updateRecord(this.client.baseUrl, 'cotizaciones', quote.id, { [field]: path });
      } catch (_) { }
    }
    async upload(path, file) {
      try {
        if (String(this.bucket).toLowerCase() === 'espacios') {
          return { data: { path: path, fullPath: path }, error: null };
        }
        const existing = await this._findByPath(path);
        if (existing && existing.id) await deleteRecord(this.client.baseUrl, 'documentos', existing.id);
        const form = new FormData();
        const tenant = this._tenant();
        const tipo = this._guessTipo(path);
        const quotePathKey = this._quotePathKeyFromPath(path);
        const pathName = String(path || '').split('/').pop() || 'archivo.bin';
        const uploadName = (file && file.name) ? file.name : pathName;
        form.append('tenant', tenant);
        form.append('tipo', tipo);
        form.append('nombre_original', uploadName);
        form.append('ruta', path);
        if (quotePathKey) form.append('cotizacion_id', quotePathKey);
        form.append('archivo', file, uploadName);
        const created = await createRecord(this.client.baseUrl, 'documentos', form);
        await this._syncKnownQuoteField(path, false);
        return { data: mapDocumentOut(created, this.client.baseUrl), error: null };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e)) };
      }
    }
    async list(prefix) {
      try {
        const pre = String(prefix || '');
        const filter = this._tenantFilter();
        const list = await fetchRecords(this.client.baseUrl, 'documentos', { perPage: 500, filter: filter });
        const items = (list.items || []).filter(r => String(r.ruta || '').startsWith(pre)).map(r => ({
          id: r.id,
          name: String(r.ruta || '').split('/').pop(),
          path: r.ruta || '',
          created: r.created || r.created_at || null,
        }));
        return { data: items, error: null };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e)) };
      }
    }
    async remove(paths) {
      try {
        const list = Array.isArray(paths) ? paths : [paths];
        for (const p of list) {
          const rec = await this._findByPath(p);
          if (rec && rec.id) await deleteRecord(this.client.baseUrl, 'documentos', rec.id);
          await this._syncKnownQuoteField(p, true);
        }
        return { data: true, error: null };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e)) };
      }
    }
    async createSignedUrl(path) {
      try {
        const rec = await this._findByPath(path);
        if (!rec) return { data: null, error: errObj('Archivo no encontrado') };
        const raw = await fetchOne(this.client.baseUrl, 'documentos', rec.id || rec._pb_id);
        const filename = Array.isArray(raw.archivo) ? raw.archivo[0] : raw.archivo;
        if (!filename) return { data: null, error: errObj('Archivo sin contenido') };
        const fileToken = await pbFetch(this.client.baseUrl, '/api/files/token', { method: 'POST', headers: Object.assign({}, authHeader()) });
        const signedUrl = trimSlash(this.client.baseUrl) + '/api/files/documentos/' + raw.id + '/' + encodeURIComponent(filename) + '?token=' + encodeURIComponent(fileToken.token);
        return { data: { signedUrl }, error: null };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e)) };
      }
    }
    getPublicUrl(path) {
      if (String(this.bucket).toLowerCase() === 'espacios') {
        return { data: { publicUrl: path } };
      }
      return { data: { publicUrl: path } };
    }
    async download(path) {
      try {
        const signed = await this.createSignedUrl(path);
        if (signed.error) return { data: null, error: signed.error };
        const resp = await fetch(signed.data.signedUrl);
        const blob = await resp.blob();
        return { data: blob, error: null };
      } catch (e) {
        return { data: null, error: errObj(e.message || String(e)) };
      }
    }
  }

  class PocketBaseClient {
    constructor(baseUrl, options) {
      this.baseUrl = trimSlash(baseUrl || ((window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090'));
      this.options = options || {};
      this.schemaName = this.options && this.options.db ? this.options.db.schema : null;
      this.tenant = normalizeSchemaToTenant(this.schemaName);
      this.auth = {
        signInWithPassword: async ({ email, password }) => {
          try {
            const body = new FormData();
            body.append('identity', email || '');
            body.append('password', password || '');
            const data = await pbFetch(this.baseUrl, '/api/hub/session/login', { method: 'POST', body: body });
            const token = String(data?.token || data?.access_token || '').trim();
            const user = mapProfileOut(data.user || data.record);
            writeAuth({ token: token, record: data.user || data.record || null, user: user });
            return { data: { user: user, session: token ? { access_token: token, token: token, user: user } : { user: user } }, error: null };
          } catch (e) {
            return { data: null, error: errObj(e.message || String(e)) };
          }
        },
        getSession: async () => {
          const st = readAuth();
          if (st && st.user && st.token) {
            return { data: { session: { access_token: st.token, user: st.user } }, error: null };
          }
          try {
            const data = await pbFetch(this.baseUrl, '/api/hub/session/current', { method: 'GET' });
            const token = String(data?.token || data?.access_token || '').trim();
            const user = mapProfileOut(data.user || data.record);
            if (!user) return { data: { session: null }, error: null };
            writeAuth({ token: token, record: data.user || data.record || null, user: user });
            return { data: { session: token ? { access_token: token, token: token, user: user } : { user: user } }, error: null };
          } catch (e) {
            if (e && (e.status === 401 || e.status === 403 || e.status === 404)) {
              writeAuth(null);
              return { data: { session: null }, error: null };
            }
            return { data: null, error: errObj(e.message || String(e)) };
          }
        },
        getUser: async () => {
          const session = await this.auth.getSession();
          return { data: { user: session?.data?.session?.user || null }, error: session?.error || null };
        },
        signOut: async () => {
          try { await pbFetch(this.baseUrl, '/api/hub/session/logout', { method: 'POST' }); } catch (_) { }
          writeAuth(null);
          return { error: null };
        },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () { } } } }; }
      };
      this.storage = { from: (bucket) => new StorageBucket(this, bucket) };
      this.functions = {
        invoke: async (name, opts) => {
          try {
            const data = await pbFetch(this.baseUrl, '/api/' + String(name || '').replace(/^\/+/, ''), { method: (opts && opts.method) || 'POST', body: (opts && opts.body) || null, headers: Object.assign({}, authHeader(), (opts && opts.headers) || {}) });
            return { data: data, error: null };
          } catch (e) { return { data: null, error: errObj(e.message || String(e)) }; }
        }
      };
    }
    from(table) { return new QueryBuilder(this, table); }
    schema(schemaName) { return new PocketBaseClient(this.baseUrl, { db: { schema: schemaName } }); }
    channel() { const self = { on() { return self; }, subscribe() { return self; }, unsubscribe() { return self; } }; return self; }
    getChannels() { return []; }
    removeChannel() { return Promise.resolve(true); }
    removeAllChannels() { return Promise.resolve(true); }
  }

  window.PB_CLIENT = {
    createClient: function (baseUrl, anonKey, options) {
      return new PocketBaseClient(baseUrl, options || {});
    }
  };
})();



