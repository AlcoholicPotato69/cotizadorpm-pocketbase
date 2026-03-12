
/* PocketBase compatibility layer for the existing Supabase-style frontend.
 * It preserves a subset of the supabase-js API used by this project.
 */
(function () {
  const AUTH_KEY = 'pb_compat_auth_v1';
  const HUB_NOTIFS_KEY = 'pb_compat_hub_notifications_v1';

  function trimSlash(url) { return String(url || '').replace(/\/+$/, ''); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
    });
  }
  function isObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeJsonParse(v, fallback){ try { return JSON.parse(v); } catch(_) { return fallback; } }
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
    return trimSlash(baseUrl) + '/api/files/' + encodeURIComponent(collection) + '/' + encodeURIComponent(record.id) + '/' + encodeURIComponent(filename);
  }
  function normalizeSchemaToTenant(schema) {
    const s = String(schema || '').toLowerCase();
    if (s === 'finanzas') return 'plaza_mayor';
    if (s.indexOf('casadepiedra') !== -1) return 'casa_de_piedra';
    return null;
  }
  function readAuth() {
    return safeJsonParse(localStorage.getItem(AUTH_KEY) || 'null', null);
  }
  function writeAuth(payload) {
    if (!payload) localStorage.removeItem(AUTH_KEY);
    else localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
  }
  function authHeader() {
    const st = readAuth();
    return st && st.token ? { 'Authorization': st.token } : {};
  }
  function errObj(message, extra) {
    const e = Object.assign({ message: message || 'Error' }, extra || {});
    return e;
  }
  function mapProfileOut(record) {
    if (!record) return record;
    record = normalizeDeepDates(record);
    const role = String(record.role || 'user').toLowerCase().trim();
    let allowed = Array.isArray(record.allowed_tenants) ? record.allowed_tenants.filter(Boolean).map(v => String(v).toLowerCase().trim()) : [];
    if (!allowed.length) {
      if (role === 'admin') allowed = ['plaza_mayor', 'casa_de_piedra'];
      else if (role === 'plaza_mayor' || role === 'casa_de_piedra') allowed = [role];
    }
    return {
      ...record,
      id: record.id,
      username: record.login_username || record.username || '',
      role: role || 'user',
      allowed_tenants: allowed,
      tenant_default: record.tenant_default || record.default_tenant || null,
      default_tenant: record.tenant_default || record.default_tenant || null,
      created_at: record.created_at || record.created || null,
      updated_at: record.updated_at || record.updated || null,
    };
  }
  function mapBusinessOut(collection, record) {
    if (!record) return record;
    const normalized = normalizeDeepDates(record);
    const out = { ...normalized, _pb_id: record.id };
    if (collection === 'espacios') {
      const imgUrl = recordFileUrl(window.HUB_CONFIG && (window.HUB_CONFIG.pocketbaseUrl || window.HUB_CONFIG.supabaseUrl), 'espacios', record, 'imagen');
      if (imgUrl) out.imagen_url = imgUrl;
    }
    if (record.legacy_id !== undefined && record.legacy_id !== null && record.legacy_id !== '') out.id = record.legacy_id;
    if (!out.id) out.id = record.id;
    out.created_at = out.created_at || record.created || null;
    out.updated_at = out.updated_at || record.updated || null;
    if (collection === 'cotizaciones') {
      out.cliente_id = record.cliente_legacy_id || record.cliente_id || null;
      out.creado_por = record.creado_por_legacy || record.creado_por || null;
    }
    return out;
  }
  function mapDocumentOut(record, baseUrl) {
    if (!record) return record;
    record = normalizeDeepDates(record);
    const filename = Array.isArray(record.archivo) ? record.archivo[0] : record.archivo;
    return {
      ...record,
      name: record.nombre_original || filename || '',
      file_path: record.ruta_legacy || '',
      publicUrl: filename ? (trimSlash(baseUrl) + '/api/files/documentos/' + record.id + '/' + encodeURIComponent(filename)) : null,
    };
  }
  function shouldUseLegacyId(collection) {
    return ['clientes','conceptos_catalogo','configuracion','impuestos','espacios','cotizaciones'].indexOf(collection) !== -1;
  }
  function mapFieldName(collection, field, dir) {
    const f = String(field || '');
    if (collection === 'profiles' || collection === 'app_users') {
      if (f === 'username') return 'login_username';
      if (f === 'default_tenant') return 'tenant_default';
      return f;
    }
    if (collection === 'cotizaciones') {
      if (f === 'cliente_id') return 'cliente_legacy_id';
      if (f === 'creado_por') return 'creado_por_legacy';
    }
    if (shouldUseLegacyId(collection) && f === 'id') return 'legacy_id';
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
      const mappedOp = ({eq:'=',neq:'!=',lte:'<=',gte:'>=',lt:'<',gt:'>'})[op] || '=';
      out.push(field + ' ' + mappedOp + ' ' + escapeFilterValue(value));
    }
    return out;
  }
  async function pbFetch(baseUrl, path, options) {
    const url = trimSlash(baseUrl) + path;
    const opts = Object.assign({ method: 'GET', headers: {} }, options || {});
    opts.headers = Object.assign({}, opts.headers || {});
    if (opts.body && !(opts.body instanceof FormData) && !opts.headers['Content-Type']) {
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
      this.collection = table === 'profiles' ? 'app_users' : table;
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
      if (['app_users','hub_notifications'].indexOf(this.collection) !== -1) return [];
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
      if (this.originalTable === 'profiles' || this.collection === 'app_users') return mapProfileOut(record);
      if (this.collection === 'documentos') return mapDocumentOut(record, this.client.baseUrl);
      return mapBusinessOut(this.collection, record);
    }
    _normalizePayload(payload) {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        const fd = new FormData();
        for (const pair of payload.entries()) fd.append(pair[0], pair[1]);
        if (this.client.tenant && ['app_users','hub_notifications'].indexOf(this.collection) === -1 && !fd.get('tenant')) fd.append('tenant', this.client.tenant);
        return fd;
      }
      let p = clone(payload);
      if (Array.isArray(p)) p = p[0];
      if (!isObject(p)) return p;
      if (this.client.tenant && ['app_users','hub_notifications'].indexOf(this.collection) === -1 && !p.tenant) p.tenant = this.client.tenant;
      if (this.originalTable === 'profiles' || this.collection === 'app_users') {
        if (Object.prototype.hasOwnProperty.call(p, 'username')) { p.login_username = p.username; delete p.username; }
        if (Object.prototype.hasOwnProperty.call(p, 'default_tenant')) { p.tenant_default = p.default_tenant; delete p.default_tenant; }
      }
      if (this.collection === 'cotizaciones') {
        if (Object.prototype.hasOwnProperty.call(p, 'cliente_id')) { p.cliente_legacy_id = p.cliente_id; delete p.cliente_id; }
        if (Object.prototype.hasOwnProperty.call(p, 'creado_por')) {
          const auth = readAuth();
          const authUser = auth && auth.record ? auth.record : null;
          p.creado_por_legacy = (authUser && authUser.id === p.creado_por && authUser.legacy_profile_id) ? authUser.legacy_profile_id : p.creado_por;
          delete p.creado_por;
        }
      }
      return p;
    }
    async _ensureLegacyId(payload) {
      if (!shouldUseLegacyId(this.collection)) return payload;
      if (payload.legacy_id !== undefined && payload.legacy_id !== null && payload.legacy_id !== '') return payload;
      const numericCollections = ['clientes','conceptos_catalogo','configuracion','impuestos','espacios'];
      if (numericCollections.indexOf(this.collection) !== -1) {
        const list = await fetchRecords(this.client.baseUrl, this.collection, { perPage: 500, filter: this._tenantFilterParts().join(' && '), sort: '-legacy_id' });
        const max = (list.items || []).reduce((m, r) => Math.max(m, Number(r.legacy_id || 0)), 0);
        payload.legacy_id = max + 1;
      } else {
        payload.legacy_id = uuidv4();
      }
      return payload;
    }
    async _findMatchingRecords() {
      const filter = this._buildFilter();
      if ((this.originalTable === 'profiles' || this.collection === 'app_users') && this.singleMode && this.filters.length === 1 && this.filters[0].op === 'eq' && this.filters[0].field === 'id') {
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
        if (this.originalTable === 'hub_notifications') return await this._execHubNotifications();
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
          let payload = this._normalizePayload(this.payload);
          payload = await this._ensureLegacyId(payload);
          const created = await createRecord(this.client.baseUrl, this.collection, payload);
          return { data: this._mapOut(created), error: null };
        }
        if (this.action === 'upsert') {
          let payload = this._normalizePayload(this.payload);
          const conflictField = mapFieldName(this.originalTable, this.onConflict || 'id', 'filter');
          const filterField = payload[conflictField] !== undefined ? conflictField : (conflictField === 'id' ? 'legacy_id' : conflictField);
          const filterVal = payload[filterField];
          if (filterVal === undefined || filterVal === null || filterVal === '') {
            payload = await this._ensureLegacyId(payload);
            const created = await createRecord(this.client.baseUrl, this.collection, payload);
            return { data: this._mapOut(created), error: null };
          }
          const temp = new QueryBuilder(this.client, this.originalTable);
          temp.collection = this.collection;
          temp.eq(filterField === 'legacy_id' ? 'id' : filterField, filterVal);
          const found = await temp._findMatchingRecords();
          if (found.length) {
            const updated = await updateRecord(this.client.baseUrl, this.collection, found[0].id, payload);
            return { data: this._mapOut(updated), error: null };
          }
          payload = await this._ensureLegacyId(payload);
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
    async _execHubNotifications() {
      const raw = safeJsonParse(localStorage.getItem(HUB_NOTIFS_KEY) || '[]', []);
      const list = Array.isArray(raw) ? raw : [];
      const save = (items) => localStorage.setItem(HUB_NOTIFS_KEY, JSON.stringify(items));
      if (this.action === 'select') {
        let out = list.slice();
        for (const f of this.filters) {
          if (f.op === 'eq') out = out.filter(x => String(x[f.field]) === String(f.value));
        }
        if (this.sort) {
          const desc = this.sort.startsWith('-');
          const field = desc ? this.sort.slice(1) : this.sort;
          out.sort((a,b) => String(a[field] || '').localeCompare(String(b[field] || '')) * (desc ? -1 : 1));
        }
        if (this.limitNum) out = out.slice(0, this.limitNum);
        if (this.singleMode === 'single') return { data: out[0] || null, error: out[0] ? null : errObj('Expected single record') };
        if (this.singleMode === 'maybeSingle') return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (this.action === 'insert') {
        const p = clone(this.payload);
        p.id = p.id || uuidv4();
        p.created_at = p.created_at || nowIso();
        list.unshift(p); save(list);
        return { data: p, error: null };
      }
      if (this.action === 'delete') {
        let out = list.slice();
        for (const f of this.filters) if (f.op === 'eq') out = out.filter(x => String(x[f.field]) !== String(f.value));
        save(out); return { data: null, error: null };
      }
      return { data: null, error: null };
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
    _quoteLegacyIdFromPath(path) {
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
      const filter = this._tenantFilter() + ' && ruta_legacy = ' + escapeFilterValue(path);
      const list = await fetchRecords(this.client.baseUrl, 'documentos', { perPage: 1, filter: filter });
      return (list.items || [])[0] || null;
    }
    async _findQuoteByLegacyId(legacyId) {
      const filter = this._tenantFilter() + ' && legacy_id = ' + escapeFilterValue(legacyId);
      const list = await fetchRecords(this.client.baseUrl, 'cotizaciones', { perPage: 1, filter: filter });
      return (list.items || [])[0] || null;
    }
    async _syncKnownQuoteField(path, clearInstead) {
      const tipo = this._guessTipo(path);
      const field = this._fieldForTipo(tipo);
      const quoteLegacyId = this._quoteLegacyIdFromPath(path);
      if (!field || !quoteLegacyId) return;
      try {
        const quote = await this._findQuoteByLegacyId(quoteLegacyId);
        if (!quote || !quote.id) return;
        const current = quote[field] || '';
        if (clearInstead) {
          if (current && current !== path) return;
          await updateRecord(this.client.baseUrl, 'cotizaciones', quote.id, { [field]: '' });
          return;
        }
        if (current === path) return;
        await updateRecord(this.client.baseUrl, 'cotizaciones', quote.id, { [field]: path });
      } catch (_) {}
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
        const quoteLegacyId = this._quoteLegacyIdFromPath(path);
        const pathName = String(path || '').split('/').pop() || 'archivo.bin';
        const uploadName = (file && file.name) ? file.name : pathName;
        form.append('tenant', tenant);
        form.append('tipo', tipo);
        form.append('nombre_original', uploadName);
        form.append('ruta_legacy', path);
        if (quoteLegacyId) form.append('cotizacion_legacy_id', quoteLegacyId);
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
        const items = (list.items || []).filter(r => String(r.ruta_legacy || '').startsWith(pre)).map(r => ({
          id: r.id,
          name: String(r.ruta_legacy || '').split('/').pop(),
          path: r.ruta_legacy || '',
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
      const full = trimSlash(this.client.baseUrl) + '/api/legacy-file?path=' + encodeURIComponent(path);
      return { data: { publicUrl: full } };
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

  class CompatClient {
    constructor(baseUrl, options) {
      this.baseUrl = trimSlash(baseUrl || ((window.HUB_CONFIG && (window.HUB_CONFIG.pocketbaseUrl || window.HUB_CONFIG.supabaseUrl)) || 'http://127.0.0.1:8090'));
      this.options = options || {};
      this.schemaName = this.options && this.options.db ? this.options.db.schema : null;
      this.tenant = normalizeSchemaToTenant(this.schemaName);
      this.auth = {
        signInWithPassword: async ({ email, password }) => {
          try {
            const data = await pbFetch(this.baseUrl, '/api/collections/app_users/auth-with-password', { method: 'POST', body: { identity: email, password } });
            const user = mapProfileOut(data.record);
            writeAuth({ token: data.token, record: data.record, user: user });
            return { data: { user: user, session: { access_token: data.token, user: user } }, error: null };
          } catch (e) {
            return { data: null, error: errObj(e.message || String(e)) };
          }
        },
        getSession: async () => {
          const st = readAuth();
          if (!st || !st.token || !st.user) return { data: { session: null }, error: null };
          return { data: { session: { access_token: st.token, user: st.user } }, error: null };
        },
        getUser: async () => {
          const st = readAuth();
          return { data: { user: st ? st.user : null }, error: null };
        },
        signOut: async () => { writeAuth(null); return { error: null }; },
        onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }
      };
      this.storage = { from: (bucket) => new StorageBucket(this, bucket) };
      this.functions = { invoke: async (name, opts) => {
        try {
          const data = await pbFetch(this.baseUrl, '/api/' + String(name || '').replace(/^\/+/, ''), { method: (opts && opts.method) || 'POST', body: (opts && opts.body) || null, headers: Object.assign({}, authHeader(), (opts && opts.headers) || {}) });
          return { data: data, error: null };
        } catch (e) { return { data: null, error: errObj(e.message || String(e)) }; }
      } };
    }
    from(table) { return new QueryBuilder(this, table); }
    schema(schemaName) { return new CompatClient(this.baseUrl, { db: { schema: schemaName } }); }
    channel() { const self = { on(){ return self; }, subscribe(){ return self; }, unsubscribe(){ return self; } }; return self; }
    getChannels(){ return []; }
    removeChannel(){ return Promise.resolve(true); }
    removeAllChannels(){ return Promise.resolve(true); }
  }

  window.supabase = {
    createClient: function(baseUrl, anonKey, options) {
      return new CompatClient(baseUrl, options || {});
    }
  };
})();
