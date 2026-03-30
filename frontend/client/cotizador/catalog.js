/**
 * DOC: client\cotizador\catalog.js
 * Proposito: Gestion y catalogo de espacios (administracion).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// ---------------------------
// CLIENTES (Perfiles)
// ---------------------------
let clientProfiles = [];
let clientProfilesById = {};

async function loadClientProfilesForQuoteModal() {
    const sel = document.getElementById('cli-select');
    const hid = document.getElementById('cli-id');
    if (!sel || !window.tenantPocketBase) return;

    try {
        const { data, error } = await window.tenantPocketBase
            .from('clientes')
            .select('id,nombre_completo,telefono,correo,rfc')
            .order('nombre_completo', { ascending: true });

        if (error) throw error;

        clientProfiles = data || [];
        clientProfilesById = {};
        clientProfiles.forEach(c => clientProfilesById[c.id] = c);

        sel.innerHTML = '<option value="">— Capturar manualmente —</option>' + clientProfiles
            .map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()}</option>`)
            .join('');

        sel.onchange = () => {
            const id = sel.value;
            if (!id) {
                if (hid) hid.value = '';
                return;
            }
            const c = clientProfilesById[id];
            if (!c) return;
            if (hid) hid.value = id;
            const n = document.getElementById('cli-name');
            const p = document.getElementById('cli-phone');
            const e = document.getElementById('cli-email');
            const r = document.getElementById('cli-rfc');
            if (n) n.value = c.nombre_completo || '';
            if (p) p.value = (c.telefono || '');
            if (e) e.value = (c.correo || '');
            if (r) r.value = (c.rfc || '');
        };

        const clearAssoc = () => {
            if (sel.value) sel.value = '';
            if (hid) hid.value = '';
        };
        ['cli-name', 'cli-phone', 'cli-email', 'cli-rfc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', clearAssoc);
        });
    } catch (e) {
        console.warn("No se pudo cargar clientes", e);
    }
}

// MÓDULO DE CATÁLOGO (FINAL)
// =========================================================================

// LECTURA DE CREDENCIALES DESDE ARCHIVO CONFIG (SIN QUEMAR CÓDIGO)
const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';

const FIN_SCHEMA = window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_PLAZA_MAYOR || 'finanzas';
const PM_CATALOG_MODE = window.__PM_CATALOG_MODE || ((window.location.pathname || '').toLowerCase().includes('cotizacion.html') ? 'quote' : 'catalog_admin');
const IS_PM_QUOTE_PAGE = PM_CATALOG_MODE === 'quote';
const IS_PM_CATALOG_ADMIN_PAGE = !IS_PM_QUOTE_PAGE;
const PM_MATERIAL_TAGS = new Set(['Vinil', 'Vinil transparente', 'Vinil con reverso negro', 'Vinil con reverso gris/negro', 'Lona', 'Lona sobre bastidor', 'Coroplast', 'Imagen fija JPG']);
let allSpaces = [], dbTaxes = [], dbMaterials = [], dbLocations = [], currentSpace = null, currentPricing = { base: 0, final: 0 };
let myPermissions = { access: false, catalog_manage: false };
let pmQuoteSpaces = [];
let pmActiveSpaceId = null;
let pmQuoteDateCalendar = null;
let pmQuoteDatePickMode = 'start';
let pmQuoteTempStart = '';
let pmQuoteTempEnd = '';
let pmQuoteBlockedRanges = [];

function normalizeCatalogTenantSlug(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'finanzas' || raw.indexOf('plaza') !== -1) return 'plaza_mayor';
    if (raw.indexOf('casadepiedra') !== -1 || raw.indexOf('casa_de_piedra') !== -1 || raw.indexOf('casa-de-piedra') !== -1) return 'casa_de_piedra';
    return raw;
}

function resolveCatalogTenantSlug(fallback = '') {
    const fromClient = normalizeCatalogTenantSlug(window.tenantPocketBase?.tenant || '');
    if (fromClient) return fromClient;
    const fromFallback = normalizeCatalogTenantSlug(fallback);
    if (fromFallback) return fromFallback;
    const fromSchema = normalizeCatalogTenantSlug(FIN_SCHEMA);
    if (fromSchema) return fromSchema;
    const path = String(window.location.pathname || '').toLowerCase();
    return path.indexOf('/cotizadorcp/') !== -1 ? 'casa_de_piedra' : 'plaza_mayor';
}

function filterCatalogRowsByTenant(rows, fallback = '') {
    const tenant = resolveCatalogTenantSlug(fallback);
    const source = Array.isArray(rows) ? rows : [];
    if (!tenant) return source.slice();
    return source.filter((row) => {
        const rowTenant = normalizeCatalogTenantSlug(row?.tenant || '');
        return !rowTenant || rowTenant === tenant;
    });
}

function findCatalogTaxRecord(taxId, space = null) {
    const safeId = String(taxId || '').trim();
    if (!safeId) return null;
    const tenant = resolveCatalogTenantSlug(space?.tenant || '');
    const tenantTaxes = filterCatalogRowsByTenant(dbTaxes, tenant);
    return tenantTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || dbTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || null;
}

function pmEspaciosService() {
    return window.PB_SERVICES && window.PB_SERVICES.espacios ? window.PB_SERVICES.espacios : null;
}

async function pmEnsureCatalogManageSession(actionLabel = 'guardar cambios') {
    if (!IS_PM_CATALOG_ADMIN_PAGE) return true;
    try {
        const authCtx = window.HUB_SESSION?.ensureAuth
            ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, allowCachedUser: false, redirectOnFail: false })
            : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA, allowCachedUser: false });
        const session = authCtx?.session || null;
        const token = String(session?.access_token || session?.token || '').trim();
        if (session?.user && (token || authCtx?.profile || authCtx?.user)) return true;
    } catch (_) { }
    window.showToast?.(`Tu sesión expiró. Inicia sesión de nuevo para ${actionLabel}.`, 'error');
    return false;
}

async function pmSaveEspacioRecord(id, payload) {
    const svc = pmEspaciosService();
    if (svc) {
        return id
            ? svc.update(id, payload, { schema: FIN_SCHEMA })
            : svc.create(payload, { schema: FIN_SCHEMA });
    }
    const result = id
        ? await window.tenantPocketBase.from('espacios').update(payload).eq('id', id)
        : await window.tenantPocketBase.from('espacios').insert(payload);
    if (result?.error) throw result.error;
    return result?.data || null;
}

async function pmDeleteEspacioRecord(id) {
    const svc = pmEspaciosService();
    if (svc) {
        await svc.remove(id, { schema: FIN_SCHEMA });
        return true;
    }
    const result = await window.tenantPocketBase.from('espacios').delete().eq('id', id);
    if (result?.error) throw result.error;
    return true;
}

// Evita recargar la misma página por navegaciones accidentales.
function pmNormalizeUrlForNav(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.href);
        parsed.hash = '';
        return parsed.toString();
    } catch (_) {
        return String(value || '').trim();
    }
}

function pmNavigateSafely(targetUrl, options = {}) {
    const target = String(targetUrl || '').trim();
    if (!target) return false;
    const allowSamePage = options.allowSamePage === true;
    if (!allowSamePage && pmNormalizeUrlForNav(target) === pmNormalizeUrlForNav(window.location.href || '')) {
        window.showToast?.('Recarga bloqueada para proteger tus cambios.', 'info');
        return false;
    }
    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
        return window.__HUB_SAFE_NAVIGATE(target, { allowSamePage });
    }
    window.location.href = target;
    return true;
}

function pmNativeCotizacionesService() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}

async function pmCreateQuoteRecord(payload) {
    const svc = pmNativeCotizacionesService();
    if (svc) {
        try {
            const created = await svc.create(payload, { schema: FIN_SCHEMA });
            const createdId = String(created?.id || created?._pb_id || '').trim();
            return { error: null, data: created || null, id: createdId };
        } catch (error) {
            return { error, data: null, id: '' };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').insert(payload);
    const data = result && result.data ? result.data : null;
    const createdId = String(data?.id || data?._pb_id || '').trim();
    return { error: result && result.error ? result.error : null, data, id: createdId };
}

async function pmResolveQuoteActorAudit() {
    let actorId = '';
    let actorName = '';
    const looksLikeId = (value) => {
        const safe = String(value || '').trim();
        if (!safe) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safe)
            || /^[a-z0-9]{15}$/i.test(safe)
            || /^[a-f0-9]{24}$/i.test(safe)
            || /^[a-z0-9_-]{12,}$/i.test(safe);
    };
    const sanitizeActorName = (value) => {
        const safe = String(value || '').trim();
        if (!safe) return '';
        if (safe.includes('@')) return safe.split('@')[0];
        if (looksLikeId(safe)) return '';
        return safe;
    };
    try {
        const auth = await window.globalPocketBase.auth.getUser();
        actorId = String(auth?.data?.user?.id || '').trim();
        const email = String(auth?.data?.user?.email || '').trim();
        const candidates = [
            auth?.data?.user?.login_username,
            auth?.data?.user?.username,
            email ? email.split('@')[0] : ''
        ];
        actorName = candidates.map(sanitizeActorName).find(Boolean) || '';
    } catch (_) { }
    const cachedName = sanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) actorName = cachedName;
    if (!actorName) actorName = 'Usuario';
    return { actorId, actorName };
}

async function pmResolveCurrentUserProfile(sessionUser = {}) {
    const pbClient = window.globalPocketBase || window.tenantPocketBase;
    const fallback = sessionUser && typeof sessionUser === 'object' ? sessionUser : {};
    if (!pbClient) return { ...fallback };
    const id = String(fallback?.id || fallback?.record?.id || '').trim();
    const email = String(fallback?.email || fallback?.record?.email || '').trim().toLowerCase();
    const lookupOne = async (table, field, value) => {
        if (!value) return null;
        try {
            const { data, error } = await pbClient.from(table).select('*').eq(field, value).maybeSingle();
            if (!error && data) return data;
        } catch (_) { }
        return null;
    };
    let profile = await lookupOne('app_users', 'id', id);
    if (!profile) profile = await lookupOne('app_users', 'email', email);
    const merged = { ...fallback, ...(profile || {}) };
    if (!merged.app_metadata && fallback?.app_metadata) merged.app_metadata = fallback.app_metadata;
    return merged;
}

// --- HELPERS ---
function parseIds(v) { if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch (e) { return v.split(',').map(x => x.trim()).filter(Boolean); } } return []; }
function formatMoney(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }
function buildCatalogPriceDisplay(baseBeforeTax, taxOnlyAmount, finalPrice, taxLabel, options = {}) {
    const compact = options.compact === true;
    const wrapperClass = compact ? 'text-right leading-tight' : 'text-right leading-none';
    const finalClass = compact ? 'font-black text-base text-gray-900' : 'font-black text-lg text-gray-900';
    const hasTax = (parseFloat(taxOnlyAmount) || 0) > 0;
    return `<div class="${wrapperClass}">
        <p class="text-[10px] text-gray-400 font-bold mb-0.5">${formatMoney(baseBeforeTax)}</p>
        ${hasTax ? `<p class="text-[10px] text-red-500 font-bold mb-0.5">+ ${formatMoney(taxOnlyAmount)}${taxLabel ? ` (${taxLabel})` : ''}</p>` : ''}
        <p class="${finalClass}">${formatMoney(finalPrice)}</p>
    </div>`;
}
function formatTaxPercent(value) {
    const raw = parseFloat(value);
    const pct = Number.isFinite(raw) ? (raw > 0 && raw <= 1 ? raw * 100 : raw) : 0;
    return Number.isInteger(pct) ? String(pct) : pct.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}
function getSpaceTaxDetails(space) {
    const taxIds = parseIds(space?.impuestos_ids || space?.impuestos).map(id => String(id || '').trim()).filter(Boolean);
    return taxIds
        .map(taxId => findCatalogTaxRecord(taxId, space))
        .filter(Boolean);
}
function getSpaceTaxLabel(space) {
    const rows = getSpaceTaxDetails(space);
    if (!rows.length) return 'Sin impuestos';
    return rows.map(t => `${t.nombre} ${formatTaxPercent(t.porcentaje)}%`).join(', ');
}
function getSpaceMaterialLabel(space) {
    const material = normalizePmMaterialTag(space?.material || '');
    return material || 'Sin material';
}
function getCatalogTagLabels(space) {
    let rawTags = [];
    try {
        rawTags = typeof space?.etiquetas === 'string' ? JSON.parse(space.etiquetas) : (space?.etiquetas || []);
    } catch (_) {
        rawTags = [];
    }
    return (Array.isArray(rawTags) ? rawTags : [])
        .map((tag) => String(tag || '').trim())
        .filter(Boolean);
}
function getCatalogSpaceTags(space) {
    const tags = new Set();
    const push = (value) => {
        const normalized = normalizeCatalogSearchText(value);
        if (normalized) tags.add(normalized);
    };
    push(space?.tipo);
    getCatalogTagLabels(space).forEach(push);
    return tags;
}
function catalogSpaceHasTag(space, term) {
    const needle = normalizeCatalogSearchText(term);
    return Array.from(getCatalogSpaceTags(space)).some((tag) => tag === needle || tag.includes(needle));
}
function isCatalogAdvertisingSpace(space) {
    return catalogSpaceHasTag(space, 'publicidad');
}
function isCatalogLocalLikeSpace(space) {
    return catalogSpaceHasTag(space, 'local') || catalogSpaceHasTag(space, 'isla') || catalogSpaceHasTag(space, 'espacio');
}
function isCatalogLocalOrIslandType(value) {
    const safe = normalizeCatalogSearchText(value);
    return safe === 'local' || safe === 'isla' || safe === 'espacio';
}
function isCatalogAdvertisingType(value) {
    return normalizeCatalogSearchText(value) === 'publicidad';
}
function isCatalogTypeWithMeasures(value) {
    return isCatalogAdvertisingType(value) || isCatalogLocalOrIslandType(value);
}
function syncManagerTypeFields(selectedType = '') {
    const type = String(selectedType || document.getElementById('mgr-type')?.value || '').trim();
    const materialField = document.getElementById('mgr-material-field');
    const locationField = document.getElementById('mgr-location-field');
    const measuresField = document.getElementById('mgr-measures-field');
    const attributesGrid = document.getElementById('mgr-attributes-grid');
    const showMaterial = isCatalogAdvertisingType(type);
    const showLocation = isCatalogLocalOrIslandType(type);
    const showMeasures = isCatalogTypeWithMeasures(type);
    if (materialField) materialField.classList.toggle('hidden', !showMaterial);
    if (locationField) locationField.classList.toggle('hidden', !showLocation);
    if (measuresField) measuresField.classList.toggle('hidden', !showMeasures);
    if (attributesGrid) attributesGrid.classList.toggle('hidden', !showMaterial && !showLocation && !showMeasures);
}
function normalizePmLocationLabel(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function findPmLocationOption(value) {
    const needle = normalizeCatalogSearchText(value);
    if (!needle) return '';
    const match = dbLocations.find((item) => normalizeCatalogSearchText(item) === needle);
    return match || '';
}
function getSpaceLocationLabel(space) {
    const direct = normalizePmLocationLabel(space?.ubicacion || '');
    if (direct) return findPmLocationOption(direct) || direct;
    const tagMatch = getCatalogTagLabels(space).find((tag) => !!findPmLocationOption(tag));
    return tagMatch ? (findPmLocationOption(tagMatch) || normalizePmLocationLabel(tagMatch)) : '';
}
function getCatalogSpaceMeasuresLabel(space) {
    const width = normalizeSpaceMeasureValue(space?.medida_ancho ?? space?.ancho);
    const height = normalizeSpaceMeasureValue(space?.medida_alto ?? space?.alto);
    const unit = normalizeSpaceMeasureUnit(space?.medida_unidad || space?.unidad_medida || 'M');
    if (width === null && height === null) return 'Sin medidas';
    if (width !== null && height !== null) return `${trimCatalogMeasureNumber(width)} x ${trimCatalogMeasureNumber(height)} ${unit}`;
    const single = width !== null ? width : height;
    return `${trimCatalogMeasureNumber(single)} ${unit}`;
}
function getCatalogSpaceInfoRows(space, options = {}) {
    const rows = [];
    const includeType = options.includeType === true;
    const advertising = isCatalogAdvertisingSpace(space);
    const localLike = isCatalogLocalLikeSpace(space);
    const localOrIsland = catalogSpaceHasTag(space, 'local') || catalogSpaceHasTag(space, 'isla') || catalogSpaceHasTag(space, 'espacio');
    const locationLabel = getSpaceLocationLabel(space);
    if (includeType) rows.push({ label: 'Tipo', value: space?.tipo || '--' });
    if (localOrIsland && locationLabel) rows.push({ label: 'Ubicación', value: locationLabel });
    if (advertising || localOrIsland) rows.push({ label: 'Medidas', value: getCatalogSpaceMeasuresLabel(space) });
    if (!localLike) rows.push({ label: 'Material', value: getSpaceMaterialLabel(space) });
    if (!advertising && !localLike) rows.push({ label: 'Impuestos', value: getSpaceTaxLabel(space) });
    return rows.filter((row) => String(row?.value || '').trim());
}
function renderCatalogSpaceInfoRows(space, options = {}) {
    return getCatalogSpaceInfoRows(space, options).map((row) => `<div class="flex justify-between gap-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2"><span class="font-black uppercase text-gray-400">${row.label}</span><span class="font-bold text-gray-700 text-right">${row.value}</span></div>`).join('');
}
function renderCatalogPreviewBadges(space) {
    return getCatalogSpaceInfoRows(space).map((row) => `<span class="px-2 py-1 rounded-full bg-white/15 text-white font-bold">${row.label}: ${row.value}</span>`).join('');
}
function shouldHideCatalogTaxPriceDetail(space) {
    return isCatalogAdvertisingSpace(space) || isCatalogLocalLikeSpace(space);
}
function isQuoteWorkspacePage() { return IS_PM_QUOTE_PAGE && !!document.getElementById('quote-workspace'); }
function toDateISO(v) { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function normalizeSpaceMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}
function normalizeSpaceMeasureUnit(value) {
    const unit = String(value || '').trim().toUpperCase();
    if (unit === 'CM') return 'CM';
    if (unit === 'M2') return 'M2';
    return 'M';
}
function normalizePmMaterialTag(value) {
    const text = String(value || '').trim();
    const folded = normalizeCatalogSearchText(text);
    if (!folded) return '';
    if (folded.includes('imagen fija') || folded.includes('jpg')) return 'Imagen fija JPG';
    if (folded.includes('coroplast')) return 'Coroplast';
    if (folded.includes('lona')) return folded.includes('bastidor') ? 'Lona sobre bastidor' : 'Lona';
    if (folded.includes('vinil') || folded.includes('vinyl')) {
        if (folded.includes('transparen')) return 'Vinil transparente';
        if (folded.includes('reverso')) {
            const hasBlack = folded.includes('negro');
            const hasGray = folded.includes('gris') || folded.includes('gray');
            if (hasBlack && hasGray) return 'Vinil con reverso gris/negro';
            if (hasBlack) return 'Vinil con reverso negro';
        }
        return 'Vinil';
    }
    return text;
}
function parseConfigJsonValue(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}
function pickCatalogLatestConfigRow(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}
function buildPmMaterialOptions(primaryItems, extraItems = []) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
        const normalized = normalizePmMaterialTag(value);
        const label = String(normalized || value || '').trim();
        if (!label) return;
        const folded = normalizeCatalogSearchText(label);
        if (!folded || seen.has(folded)) return;
        seen.add(folded);
        out.push(label);
    };
    (Array.isArray(primaryItems) ? primaryItems : []).forEach(push);
    (Array.isArray(extraItems) ? extraItems : []).forEach(push);
    return out;
}
function buildPmLocationOptions(primaryItems, extraItems = []) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
        const label = normalizePmLocationLabel(value);
        if (!label) return;
        const folded = normalizeCatalogSearchText(label);
        if (!folded || seen.has(folded)) return;
        seen.add(folded);
        out.push(label);
    };
    (Array.isArray(primaryItems) ? primaryItems : []).forEach(push);
    (Array.isArray(extraItems) ? extraItems : []).forEach(push);
    return out;
}
function isPmLocationTag(value) {
    return !!findPmLocationOption(value);
}
function syncPmTagsWithSelections(tags, material, location) {
    const materialLabel = normalizePmMaterialTag(material);
    const locationLabel = findPmLocationOption(location) || normalizePmLocationLabel(location);
    const source = Array.isArray(tags) ? tags : [];
    const clean = [];
    const seen = new Set();
    source.forEach(tag => {
        const value = String(tag || '').trim();
        if (!value) return;
        if (PM_MATERIAL_TAGS.has(normalizePmMaterialTag(value))) return;
        if (isPmLocationTag(value)) return;
        if (seen.has(value)) return;
        seen.add(value);
        clean.push(value);
    });
    if (materialLabel && !seen.has(materialLabel)) clean.push(materialLabel);
    if (locationLabel && !seen.has(locationLabel)) clean.push(locationLabel);
    return clean;
}
function normalizeCatalogSearchText(value) {
    const text = String(value || '');
    const normalized = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
    return normalized
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function trimCatalogMeasureNumber(value) {
    return String(value || '')
        .replace(/(\.\d*?[1-9])0+$/g, '$1')
        .replace(/\.0+$/g, '')
        .trim();
}
function buildCatalogMeasureNumberVariants(value) {
    const num = normalizeSpaceMeasureValue(value);
    if (num === null) return [];
    const variants = new Set();
    [num.toString(), num.toFixed(1), num.toFixed(2)].forEach(item => {
        const raw = String(item || '').trim();
        const compact = trimCatalogMeasureNumber(raw);
        if (raw) variants.add(raw);
        if (compact) variants.add(compact);
    });
    return Array.from(variants).filter(Boolean);
}
function addCatalogMeasureNumberTerms(tokens, variants, unit) {
    variants.forEach(v => {
        tokens.add(v);
        if (unit) {
            tokens.add(`${v} ${unit}`);
            tokens.add(`${v}${unit}`);
        }
    });
}
function addCatalogMeasurePairTerms(tokens, firstVariants, secondVariants, unit) {
    if (!firstVariants.length || !secondVariants.length) return;
    firstVariants.forEach(first => {
        secondVariants.forEach(second => {
            tokens.add(`${first} x ${second}`);
            tokens.add(`${first}x${second}`);
            if (unit) {
                tokens.add(`${first} x ${second} ${unit}`);
                tokens.add(`${first}x${second} ${unit}`);
                tokens.add(`${first}${unit} x ${second}${unit}`);
                tokens.add(`${first}${unit}x${second}${unit}`);
            }
        });
    });
}
function buildCatalogMeasureSearchTerms(space) {
    const width = normalizeSpaceMeasureValue(space?.medida_ancho ?? space?.ancho);
    const height = normalizeSpaceMeasureValue(space?.medida_alto ?? space?.alto);
    const unit = normalizeSpaceMeasureUnit(space?.medida_unidad || space?.unidad_medida || 'M');
    const unitLower = unit.toLowerCase();
    const terms = new Set();
    const widthVariants = buildCatalogMeasureNumberVariants(width);
    const heightVariants = buildCatalogMeasureNumberVariants(height);

    addCatalogMeasureNumberTerms(terms, widthVariants, unitLower);
    addCatalogMeasureNumberTerms(terms, heightVariants, unitLower);
    addCatalogMeasurePairTerms(terms, widthVariants, heightVariants, unitLower);
    addCatalogMeasurePairTerms(terms, heightVariants, widthVariants, unitLower);

    if (width !== null && height !== null) {
        if (unit === 'M') {
            const widthCmVariants = buildCatalogMeasureNumberVariants(width * 100);
            const heightCmVariants = buildCatalogMeasureNumberVariants(height * 100);
            addCatalogMeasureNumberTerms(terms, widthCmVariants, 'cm');
            addCatalogMeasureNumberTerms(terms, heightCmVariants, 'cm');
            addCatalogMeasurePairTerms(terms, widthCmVariants, heightCmVariants, 'cm');
            addCatalogMeasurePairTerms(terms, heightCmVariants, widthCmVariants, 'cm');
        } else if (unit === 'CM') {
            const widthMVariants = buildCatalogMeasureNumberVariants(width / 100);
            const heightMVariants = buildCatalogMeasureNumberVariants(height / 100);
            addCatalogMeasureNumberTerms(terms, widthMVariants, 'm');
            addCatalogMeasureNumberTerms(terms, heightMVariants, 'm');
            addCatalogMeasurePairTerms(terms, widthMVariants, heightMVariants, 'm');
            addCatalogMeasurePairTerms(terms, heightMVariants, widthMVariants, 'm');
        }
    }

    return Array.from(terms);
}
function buildCatalogSearchIndex(space) {
    return normalizeCatalogSearchText([
        space?.nombre,
        space?.clave,
        space?.tipo,
        space?.descripcion,
        space?.material,
        getSpaceLocationLabel(space),
        ...buildCatalogMeasureSearchTerms(space)
    ].filter(Boolean).join(' | '));
}
function matchesCatalogSearch(space, term) {
    const normalizedTerm = normalizeCatalogSearchText(term);
    if (!normalizedTerm) return true;
    return buildCatalogSearchIndex(space).includes(normalizedTerm);
}
function normalizeSpaceMaterialMeasure(space) {
    const src = (space && typeof space === 'object') ? space : {};
    const medidaAncho = normalizeSpaceMeasureValue(src.medida_ancho ?? src.ancho);
    const medidaAlto = normalizeSpaceMeasureValue(src.medida_alto ?? src.alto);
    const medidaUnidad = normalizeSpaceMeasureUnit(src.medida_unidad || src.unidad_medida || 'M');
    return {
        ...src,
        material: (src.material === null || src.material === undefined) ? '' : String(src.material),
        ubicacion: (src.ubicacion === null || src.ubicacion === undefined) ? '' : normalizePmLocationLabel(src.ubicacion),
        medida_ancho: medidaAncho,
        medida_alto: medidaAlto,
        medida_unidad: medidaUnidad,
        ancho: medidaAncho,
        alto: medidaAlto,
        unidad_medida: medidaUnidad
    };
}
function compareSavedSpaceMaterialMeasure(savedSpace, expectedPayload) {
    const saved = normalizeSpaceMaterialMeasure(savedSpace);
    const expected = normalizeSpaceMaterialMeasure(expectedPayload);
    const savedAncho = saved.medida_ancho ?? 0;
    const expectedAncho = expected.medida_ancho ?? 0;
    const savedAlto = saved.medida_alto ?? 0;
    const expectedAlto = expected.medida_alto ?? 0;
    const mismatches = [];
    if (String(saved.material || '') !== String(expected.material || '')) mismatches.push('material');
    if (savedAncho !== expectedAncho) mismatches.push('medida_ancho');
    if (savedAlto !== expectedAlto) mismatches.push('medida_alto');
    if (String(saved.medida_unidad || 'M') !== String(expected.medida_unidad || 'M')) mismatches.push('medida_unidad');
    return { ok: mismatches.length === 0, mismatches, saved, expected };
}
function getMonthBounds(anchorDate) {
    const iso = toDateISO(anchorDate) || todayISO();
    const start = new Date(`${iso}T00:00:00`);
    const end = new Date(`${iso}T00:00:00`);
    end.setDate(end.getDate() + 29);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function normalizeCfgDates(cfg) {
    if (!cfg) return;
    if (cfg.customPermanence) {
        cfg.startDate = toDateISO(cfg.startDate || '');
        cfg.endDate = toDateISO(cfg.endDate || '');
        if (!cfg.startDate && cfg.endDate) cfg.startDate = cfg.endDate;
        if (!cfg.endDate && cfg.startDate) cfg.endDate = cfg.startDate;
        if (cfg.startDate && cfg.endDate && toDateObj(cfg.endDate) < toDateObj(cfg.startDate)) {
            cfg.endDate = cfg.startDate;
        }
        return;
    }
    const base = toDateISO(cfg.startDate || '') || toDateISO(cfg.endDate || '') || todayISO();
    const bounds = getMonthBounds(base);
    cfg.startDate = bounds.start;
    cfg.endDate = bounds.end;
}
function buildSpacePrice(space, opts = {}) {
    if (!space) return { subtotal: 0, taxes: 0, total: 0, taxIds: [] };
    const hasCustom = opts.customBase !== undefined && opts.customBase !== null && opts.customBase !== '';
    let subtotal = hasCustom ? (parseFloat(opts.customBase) || 0) : (parseFloat(space.precio_base || 0) || 0);
    if (!hasCustom) {
        if (String(space.ajuste_tipo || '') === 'aumento') subtotal += subtotal * ((parseFloat(space.ajuste_porcentaje || 0) || 0) / 100);
        if (String(space.ajuste_tipo || '') === 'descuento') subtotal -= subtotal * ((parseFloat(space.ajuste_porcentaje || 0) || 0) / 100);
    }
    const taxIds = parseIds(space.impuestos_ids || space.impuestos);
    let taxes = 0;
    taxIds.forEach(tid => {
        const t = findCatalogTaxRecord(tid, space);
        if (!t) return;
        const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje || 0) / 100) : parseFloat(t.porcentaje || 0);
        taxes += subtotal * rate;
    });
    return { subtotal, taxes, total: subtotal + taxes, taxIds };
}
function isSpaceIdMatch(space, candidateId) {
    const raw = String(candidateId || '').trim();
    if (!raw || !space) return false;
    return String(space.id || '').trim() === raw;
}
function getSpaceById(spaceId) { return allSpaces.find(s => isSpaceIdMatch(s, spaceId)) || null; }
function getActiveCfg() { return pmQuoteSpaces.find(x => String(x.spaceId) === String(pmActiveSpaceId)) || null; }
function createSpaceCfg(spaceId, seed = {}) {
    const customPermanence = !!seed.customPermanence;
    const startSeed = toDateISO(seed.startDate || '');
    const endSeed = toDateISO(seed.endDate || '');
    const anchor = startSeed || endSeed || todayISO();
    const month = getMonthBounds(anchor);
    return {
        spaceId: String(spaceId),
        customPermanence,
        startDate: customPermanence ? startSeed : month.start,
        endDate: customPermanence ? endSeed : month.end,
        customBasePrice: (seed.customBasePrice === undefined || seed.customBasePrice === null || seed.customBasePrice === '')
            ? ''
            : (parseFloat(seed.customBasePrice) || 0)
    };
}
function minDate(values) { const arr = values.filter(Boolean).sort(); return arr[0] || ''; }
function maxDate(values) { const arr = values.filter(Boolean).sort(); return arr[arr.length - 1] || ''; }
function toDateObj(ds) { return new Date(`${ds}T00:00:00`); }
function plusOneDay(ds) { const d = toDateObj(ds); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function safeArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
    return [];
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    const s1 = toDateObj(aStart), e1 = toDateObj(aEnd);
    const s2 = toDateObj(bStart), e2 = toDateObj(bEnd);
    return s1 <= e2 && s2 <= e1;
}
function rangeHitsBlocked(startDate, endDate) {
    const s = toDateISO(startDate), e = toDateISO(endDate || startDate);
    if (!s || !e) return false;
    return pmQuoteBlockedRanges.some(b => rangesOverlap(s, e, b.start, b.end));
}
function calculateDayByDayTotal(space, startStr, endStr, guests, options = {}) {
    const startDate = toDateObj(startStr);
    const endDate = toDateObj(endStr);
    if (!startDate || !endDate || startDate > endDate) {
        return { total: 0, days: 0, prices: {}, keys: [], blockedDays: [] };
    }

    const prices = {};
    const keys = [];
    const blockedDays = [];
    let total = 0;
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const key = currentDate.toISOString().slice(0, 10);
        keys.push(key);

        let price = parseFloat(space.precio_base || 0);
        if (String(space.ajuste_tipo || '') === 'aumento') price += price * ((parseFloat(space.ajuste_porcentaje || 0) || 0) / 100);
        if (String(space.ajuste_tipo || '') === 'descuento') price -= price * ((parseFloat(space.ajuste_porcentaje || 0) || 0) / 100);

        // Check for blocked days
        if (!options.ignoreBlocks && pmQuoteBlockedRanges.some(b => rangesOverlap(key, key, b.start, b.end))) {
            price = 0;
            blockedDays.push(key);
        }

        prices[key] = price;
        total += price;
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return { total, days: keys.length, prices, keys, blockedDays };
}
function updatePickedDateLabels() {
    const l1 = document.getElementById('quote-date-picked-start');
    const l2 = document.getElementById('quote-date-picked-end');
    if (l1) l1.innerText = pmQuoteTempStart || '--';
    if (l2) l2.innerText = pmQuoteTempEnd || '--';
}
function renderSelectedRangeEvent() {
    if (!pmQuoteDateCalendar) return;
    const old = pmQuoteDateCalendar.getEventById('pm-selected-range');
    if (old) old.remove();
    if (!pmQuoteTempStart) return;
    const end = pmQuoteTempEnd || pmQuoteTempStart;
    pmQuoteDateCalendar.addEvent({
        id: 'pm-selected-range',
        start: pmQuoteTempStart,
        end: plusOneDay(end),
        display: 'background',
        backgroundColor: 'rgba(22,163,74,0.30)',
        borderColor: 'rgba(22,163,74,0.30)'
    });
}
async function fetchBlockedRangesForSpace(spaceId) {
    const sid = String(spaceId || '');
    if (!sid) return [];
    const { data, error } = await window.tenantPocketBase
        .from('cotizaciones')
        .select('id,espacio_id,fecha_inicio,fecha_fin,espacios_detalle,status')
        .eq('status', 'aprobada');
    if (error) {
        console.error(error);
        return [];
    }
    const out = [];
    (data || []).forEach(o => {
        const detail = safeArray(o.espacios_detalle);
        if (detail.length) {
            detail.forEach(d => {
                const dsid = String(d?.espacio_id || d?.space_id || '');
                const fi = toDateISO(d?.fecha_inicio || '');
                const ff = toDateISO(d?.fecha_fin || '');
                if (dsid === sid && fi && ff) out.push({ start: fi, end: ff, orderId: o.id });
            });
            return;
        }
        if (String(o.espacio_id || '') === sid) {
            const fi = toDateISO(o.fecha_inicio || '');
            const ff = toDateISO(o.fecha_fin || '');
            if (fi && ff) out.push({ start: fi, end: ff, orderId: o.id });
        }
    });
    return out;
}
async function renderQuoteCalendarBlocked(spaceId) {
    pmQuoteBlockedRanges = await fetchBlockedRangesForSpace(spaceId);
    if (!pmQuoteDateCalendar) return;
    // Limpiar bloqueos previos
    pmQuoteDateCalendar.getEvents().forEach(ev => {
        if (String(ev.id || '').startsWith('pm-block-')) ev.remove();
    });
    pmQuoteBlockedRanges.forEach((r, i) => {
        pmQuoteDateCalendar.addEvent({
            id: `pm-block-${i}`,
            start: r.start,
            end: plusOneDay(r.end),
            display: 'background',
            backgroundColor: 'rgba(239,68,68,0.28)',
            borderColor: 'rgba(239,68,68,0.28)'
        });
    });
    renderSelectedRangeEvent();
}
function initQuoteDateCalendar() {
    if (pmQuoteDateCalendar || !document.getElementById('quote-date-fc') || typeof FullCalendar === 'undefined') return;
    pmQuoteDateCalendar = new FullCalendar.Calendar(document.getElementById('quote-date-fc'), {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1,
        selectable: false,
        height: 'auto',
        dayMaxEvents: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth' },
        dateClick: (info) => {
            const clicked = toDateISO(info.dateStr);
            if (!clicked) return;
            const cfg = getActiveCfg();
            if (cfg && !cfg.customPermanence) {
                const month = getMonthBounds(clicked);
                if (rangeHitsBlocked(month.start, month.end)) return window.showToast("Ese periodo automático de 30 días incluye días bloqueados para este espacio.", "error");
                pmQuoteTempStart = month.start;
                pmQuoteTempEnd = month.end;
                pmQuoteDatePickMode = 'start';
                updatePickedDateLabels();
                renderSelectedRangeEvent();
                return;
            }
            if (!pmQuoteTempStart || (pmQuoteTempStart && pmQuoteTempEnd && pmQuoteDatePickMode === 'start')) {
                if (rangeHitsBlocked(clicked, clicked)) return window.showToast("Ese día está bloqueado para este espacio.", "error");
                pmQuoteTempStart = clicked;
                pmQuoteTempEnd = '';
                pmQuoteDatePickMode = 'end';
                updatePickedDateLabels();
                renderSelectedRangeEvent();
                return;
            }
            let start = pmQuoteTempStart;
            let end = clicked;
            if (toDateObj(end) < toDateObj(start)) { const tmp = start; start = end; end = tmp; }
            if (rangeHitsBlocked(start, end)) return window.showToast("El rango seleccionado incluye días bloqueados.", "error");
            pmQuoteTempStart = start;
            pmQuoteTempEnd = end;
            pmQuoteDatePickMode = 'start';
            updatePickedDateLabels();
            renderSelectedRangeEvent();
        }
    });
}

function setActiveQuoteSpaceCard(_spaceId) {
    if (!IS_PM_QUOTE_PAGE) return;
}
function syncQuoteCustomUi(cfg) {
    const chk = document.getElementById('q-custom-permanence');
    const wrap = document.getElementById('q-custom-price-wrap');
    const input = document.getElementById('q-custom-price');
    const isCustom = !!cfg?.customPermanence;
    if (chk) chk.checked = isCustom;
    if (wrap) wrap.classList.toggle('hidden', !isCustom);
    if (input) input.value = (cfg && cfg.customBasePrice !== '' && cfg.customBasePrice !== null && cfg.customBasePrice !== undefined)
        ? String(cfg.customBasePrice)
        : '';
}
function saveActiveCfgFromForm() {
    const cfg = getActiveCfg();
    if (!cfg) return;
    cfg.customPermanence = !!document.getElementById('q-custom-permanence')?.checked;
    cfg.startDate = toDateISO(document.getElementById('date-start')?.value || '');
    cfg.endDate = toDateISO(document.getElementById('date-end')?.value || '');
    cfg.customBasePrice = cfg.customPermanence
        ? (() => {
            const raw = document.getElementById('q-custom-price')?.value;
            if (raw === '' || raw === null || raw === undefined) return '';
            return Math.max(0, parseFloat(raw) || 0);
        })()
        : '';
    normalizeCfgDates(cfg);
}
function renderSpaceAddSelect() {
    const sel = document.getElementById('q-space-add');
    if (!sel) return;
    const selectedIds = new Set(pmQuoteSpaces.map(x => String(x.spaceId)));
    sel.innerHTML = '<option value="">Selecciona espacio...</option>';
    allSpaces.forEach(space => {
        const disabled = selectedIds.has(String(space.id)) ? 'disabled' : '';
        sel.innerHTML += `<option value="${space.id}" ${disabled}>${space.nombre}</option>`;
    });
}
function renderSelectedSpaceTabs() {
    const container = document.getElementById('q-spaces-tabs');
    if (!container) return;
    container.innerHTML = '';
    pmQuoteSpaces.forEach(cfg => {
        const space = getSpaceById(cfg.spaceId);
        const active = String(cfg.spaceId) === String(pmActiveSpaceId);
        const classes = active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-red';
        container.innerHTML += `<div class="flex items-center border rounded-full ${classes}">
            <button onclick="window.selectQuoteSpace('${cfg.spaceId}')" class="px-3 py-1.5 text-[10px] font-bold uppercase">${space?.nombre || cfg.spaceId}</button>
            ${pmQuoteSpaces.length > 1 ? `<button onclick="window.removeSpaceFromQuote('${cfg.spaceId}')" class="pr-2 text-[10px]"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
    });
}

function refreshQuoteSpaceCards() {
    if (!IS_PM_QUOTE_PAGE) return;
    if (typeof window.filterCatalogLogic === 'function') {
        window.filterCatalogLogic();
        return;
    }
    renderSpaces(allSpaces);
}

function loadActiveCfgToForm() {
    const cfg = getActiveCfg();
    if (!cfg) return;
    normalizeCfgDates(cfg);
    const space = getSpaceById(cfg.spaceId);
    if (!space) return;
    currentSpace = space;
    setActiveQuoteSpaceCard(space.id);
    syncQuoteCustomUi(cfg);
    const qName = document.getElementById('q-name');
    const qKey = document.getElementById('q-key');
    const qImg = document.getElementById('q-img');
    if (qName) qName.innerText = space.nombre || 'Espacio';
    if (qKey) qKey.innerText = space.clave || '--';
    let image = space.imagen_url || '';
    if (typeof image === 'string' && image.startsWith('[')) { try { image = JSON.parse(image)[0]; } catch (e) { } }
    if (qImg) qImg.src = image || '';

    const start = document.getElementById('date-start');
    const end = document.getElementById('date-end');
    if (start) start.value = cfg.startDate || '';
    if (end) {
        end.value = cfg.endDate || '';
        end.min = cfg.startDate || '';
    }
}

window.toggleQuoteCustomPermanence = function () {
    const cfg = getActiveCfg();
    if (!cfg) return;
    cfg.customPermanence = !!document.getElementById('q-custom-permanence')?.checked;
    if (!cfg.customPermanence) cfg.customBasePrice = '';
    normalizeCfgDates(cfg);
    loadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
};

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (!PB_URL) {
        console.error("URL de PocketBase no encontrada en la configuración global.");
        return;
    }

    if (window.PB_CLIENT) {
        if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }

    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: false })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }

    const profile = authCtx?.profile || await pmResolveCurrentUserProfile(session.user);
    const cachedRole = String(localStorage.getItem('hub_user_cache_role') || '').trim().toLowerCase();
    const userRole = String(profile?.role || profile?.rol || cachedRole).toLowerCase().trim();
    const roleHasAccess = (userRole === 'admin') || (userRole === 'plaza_mayor') || (userRole === 'ambos');
    const roleDefaultPerms = { access: true, orders_view: true, reports_view: true, clients_view: true, clients_manage: true };

    if (userRole === 'admin') myPermissions = { ...roleDefaultPerms, catalog_manage: true };
    else if (roleHasAccess) myPermissions = { ...roleDefaultPerms, catalog_manage: false };
    else {
        const profilePerms = profile?.app_metadata?.finanzas?.permissions;
        if (profilePerms && typeof profilePerms === 'object') {
            myPermissions = {
                ...roleDefaultPerms,
                ...profilePerms,
                catalog_manage: !!profilePerms.catalog_manage
            };
        } else {
            myPermissions = { ...roleDefaultPerms, catalog_manage: false };
        }
    }

    if (!myPermissions.access) return window.showToast?.('No tienes permisos para acceder al Catálogo.', 'error');

    if (userRole !== 'admin') {
        const navRules = {
            'orders.html': ('orders_view' in myPermissions) ? !!myPermissions.orders_view : true,
            'cotizacion.html': ('orders_view' in myPermissions) ? !!myPermissions.orders_view : true,
            'reports.html': ('reports_view' in myPermissions) ? !!myPermissions.reports_view : true,
            'clientes.html': (('clients_view' in myPermissions) || ('clients_manage' in myPermissions))
                ? (!!myPermissions.clients_view || !!myPermissions.clients_manage) : true
        };
        Object.keys(navRules).forEach(page => {
            if (!navRules[page]) { const link = document.querySelector(`a[href="${page}"]`); if (link) link.classList.add('hidden'); }
        });
    }

    if (myPermissions.catalog_manage && IS_PM_CATALOG_ADMIN_PAGE) document.getElementById('btn-new-space')?.classList.remove('hidden');

    await loadTaxes();
    await loadClientProfilesForQuoteModal();
    loadCatalog();

    document.getElementById('mgr-type')?.addEventListener('change', function () {
        syncManagerTypeFields(this.value);
    });

    const dStart = document.getElementById('date-start');
    const dEnd = document.getElementById('date-end');

    if (dStart && dEnd) {
        dStart.addEventListener('change', function () {
            dEnd.min = this.value;
            if (dEnd.value && dEnd.value < this.value) { dEnd.value = this.value; }
            if (isQuoteWorkspacePage()) saveActiveCfgFromForm();
            window.updateQuoteCalculation?.();
            window.checkAvailability();
        });
        dEnd.addEventListener('change', () => {
            if (isQuoteWorkspacePage()) saveActiveCfgFromForm();
            window.updateQuoteCalculation?.();
            window.checkAvailability();
        });
    }

    // Cierra modal de calendario al dar click fuera.
    document.addEventListener('click', (ev) => {
        const modal = document.getElementById('quote-date-modal');
        if (modal && ev.target === modal) window.closeModal('quote-date-modal');
    });
});

async function loadTaxes() {
    const tenant = resolveCatalogTenantSlug();
    let rows = [];
    try {
        const { data } = await window.tenantPocketBase.from('impuestos').select('*').order('nombre', { ascending: true });
        rows = data || [];
    } catch (_) {
        rows = [];
    }
    dbTaxes = filterCatalogRowsByTenant(rows, tenant);
    if (!dbTaxes.length && window.globalPocketBase && tenant) {
        try {
            const { data } = await window.globalPocketBase.from('impuestos').select('*').eq('tenant', tenant);
            dbTaxes = filterCatalogRowsByTenant(data || [], tenant);
        } catch (_) {}
    }
}
async function pmLoadMaterials(spaceList = []) {
    const tenant = resolveCatalogTenantSlug('plaza_mayor');
    const fallback = (Array.isArray(spaceList) ? spaceList : [])
        .map(space => normalizePmMaterialTag(space?.material))
        .filter(Boolean);
    try {
        const { data } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'materiales_pm');
        const row = pickCatalogLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const configValue = parseConfigJsonValue(row?.valor_json);
        dbMaterials = buildPmMaterialOptions(configValue?.items, fallback);
    } catch (e) {
        dbMaterials = buildPmMaterialOptions(fallback, []);
    }
    const sel = document.getElementById('mgr-material');
    if (sel) {
        const current = sel.value;
        sel.innerHTML = '<option value="">— Ninguno —</option>' + dbMaterials.map(m => `<option value="${m}">${m}</option>`).join('');
        sel.value = current;
    }
}
async function pmLoadLocations(spaceList = []) {
    const tenant = resolveCatalogTenantSlug('plaza_mayor');
    const fallback = (Array.isArray(spaceList) ? spaceList : [])
        .map(space => getSpaceLocationLabel(space))
        .filter(Boolean);
    try {
        const { data } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'ubicaciones_pm');
        const row = pickCatalogLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const configValue = parseConfigJsonValue(row?.valor_json);
        dbLocations = buildPmLocationOptions(configValue?.items, fallback);
    } catch (e) {
        dbLocations = buildPmLocationOptions(fallback, []);
    }
    const sel = document.getElementById('mgr-location');
    if (sel) {
        const current = normalizePmLocationLabel(sel.value || '');
        const options = buildPmLocationOptions(dbLocations, current ? [current] : []);
        sel.innerHTML = '<option value="">— Ninguna —</option>' + options.map((item) => `<option value="${item}">${item}</option>`).join('');
        sel.value = current;
    }
}
async function loadCatalog() {
    const tenant = resolveCatalogTenantSlug();
    const { data } = await window.tenantPocketBase.from('espacios').select('*').order('clave');
    allSpaces = filterCatalogRowsByTenant(data || [], tenant)
        .map(normalizeSpaceMaterialMeasure)
        .sort((a, b) => String(a?.clave || a?.nombre || '').localeCompare(String(b?.clave || b?.nombre || ''), 'es', { numeric: true, sensitivity: 'base' }));
    await pmLoadMaterials(allSpaces);
    await pmLoadLocations(allSpaces);
    renderSpaces(allSpaces);
    if (IS_PM_QUOTE_PAGE) renderSpaceAddSelect();
}

function renderSpaces(list) {
    const g = document.getElementById('spaces-grid'); g.innerHTML = '';
    if (list.length === 0) { g.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400 font-bold">No se encontraron espacios.</div>'; return; }

    list.forEach(s => {
        let adjustedBase = parseFloat(s.precio_base);
        let badgeHTML = '';
        const taxDetails = getSpaceTaxDetails(s);
        const taxPriceLabel = taxDetails.length === 1 ? taxDetails[0].nombre : 'Impuestos';
        const infoRowsHtml = renderCatalogSpaceInfoRows(s);
        const quoteInfoRows = getCatalogSpaceInfoRows(s, { includeType: true });

        if (s.ajuste_tipo === 'aumento') {
            adjustedBase += s.precio_base * (s.ajuste_porcentaje / 100);
            badgeHTML = `<div class="absolute top-2 left-2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1"><i class="fa-solid fa-arrow-trend-up"></i> +${s.ajuste_porcentaje}%</div>`;
        }
        if (s.ajuste_tipo === 'descuento') {
            adjustedBase -= s.precio_base * (s.ajuste_porcentaje / 100);
            badgeHTML = `<div class="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md z-10 flex items-center gap-1"><i class="fa-solid fa-tag"></i> -${s.ajuste_porcentaje}%</div>`;
        }

        let totalTax = 0;
        if (taxDetails.length > 0) {
            taxDetails.forEach(t => {
                const rate = t.porcentaje > 1 ? t.porcentaje / 100 : t.porcentaje;
                totalTax += adjustedBase * rate;
            });
        }
        const finalPrice = adjustedBase + totalTax;
        const taxOnlyAmount = finalPrice - adjustedBase;

        const priceDisplay = buildCatalogPriceDisplay(adjustedBase, taxOnlyAmount, finalPrice, taxPriceLabel);

        let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
        if (allUrls.length === 0) allUrls = ['../../assets/img/no-image.svg'];

        // RENDER DE ETIQUETAS EN ADMIN
        let eTags = [];
        try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch (e) { }
        let tagsHtml = '';
        if (eTags.length > 0) {
            tagsHtml = `<div class="flex gap-1 mb-2 flex-wrap">` +
                eTags.map(t => `<span class="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">${t}</span>`).join('') +
                `</div>`;
        }

        const editBtn = (myPermissions.catalog_manage && IS_PM_CATALOG_ADMIN_PAGE)
            ? `<button onclick="event.stopPropagation(); window.openManagerModal('${s.id}')" class="absolute top-3 right-3 bg-white/90 text-gray-700 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-10"><i class="fa-solid fa-pen"></i></button>`
            : '';
        const actionBtn = IS_PM_QUOTE_PAGE
            ? ''
            : (myPermissions.catalog_manage
                ? `<button onclick="event.stopPropagation(); window.openManagerModal('${s.id}')" class="bg-gray-900 text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-brand-red transition-colors duration-300 shadow-lg"><i class="fa-solid fa-sliders mr-2"></i> Administrar Espacio</button>`
                : `<button disabled class="bg-gray-200 text-gray-500 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide cursor-not-allowed"><i class="fa-solid fa-lock mr-2"></i> Solo lectura</button>`);

        if (IS_PM_QUOTE_PAGE) {
            const sid = String(s.id);
            const inQuote = pmQuoteSpaces.some(x => String(x.spaceId) === sid);
            const isActive = String(pmActiveSpaceId || '') === sid;
            const cardState = isActive
                ? 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-50'
                : (inQuote ? 'border-red-200 ring-1 ring-red-100 bg-red-50/60' : 'border-gray-200 bg-white');
            const stateLabel = isActive
                ? '<span class="text-[9px] font-black uppercase text-emerald-700">Activo</span>'
                : (inQuote ? '<span class="text-[9px] font-black uppercase text-brand-red">Seleccionado</span>' : '<span class="text-[9px] font-bold uppercase text-gray-400">Desactivado</span>');
            const powerOffBtn = inQuote
                ? `<button type="button" onclick="event.stopPropagation(); window.powerOffQuoteSpace('${sid}')" class="px-2 py-1 rounded border border-gray-200 bg-white text-[9px] font-black uppercase text-gray-600 hover:text-red-600">Desactivar</button>`
                : '';
            g.innerHTML += `<div data-space-card="1" data-space-id="${s.id}" onclick="window.toggleQuoteSpaceCard('${sid}')" class="rounded-xl border ${cardState} p-4 shadow-sm transition hover:shadow-md cursor-pointer">
                <div class="mb-3">
                    <p class="text-sm font-black text-gray-800 uppercase leading-tight">${s.nombre}</p>
                    <p class="text-[10px] font-mono text-gray-400 mt-1">${s.clave || '--'}</p>
                </div>
                    <div class="space-y-2 mb-4 text-[11px]">
                        ${quoteInfoRows.map((row) => `<div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">${row.label}</span><span class="text-gray-700 font-bold text-right">${row.value}</span></div>`).join('')}
                        <div class="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2">${buildCatalogPriceDisplay(adjustedBase, taxOnlyAmount, finalPrice, taxPriceLabel, { compact: true })}</div>
                    </div>
                <div class="flex items-center justify-between gap-2">${stateLabel}${powerOffBtn}</div>
            </div>`;
        } else {
            const imgsHtml = allUrls.map((url, i) => `<img src="${url}" class="card-img absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === 0 ? 'opacity-100' : 'opacity-0'}" data-index="${i}">`).join('');

            g.innerHTML += `
                <div class="bg-white rounded-xl shadow-md relative group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden border border-gray-100 cursor-pointer"
                     onclick="window.openPreviewCardModal('${String(s.id)}')"
                     onmouseenter="window.startCardCarousel(this)" 
                     onmouseleave="window.stopCardCarousel(this)">
                    <div class="h-48 bg-gray-200 relative overflow-hidden">
                        ${editBtn}${badgeHTML}
                        <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                            ${imgsHtml}
                        </div>
                        <div class="absolute bottom-3 left-4 text-white z-10 pointer-events-none">
                            <p class="text-[10px] font-bold uppercase tracking-wider bg-brand-red px-2 py-0.5 rounded inline-block mb-1">${s.tipo}</p>
                            <h3 class="font-bold text-lg leading-tight shadow-black drop-shadow-md">${s.nombre}</h3>
                        </div>
                    </div>
                    <div class="p-5">
                        ${tagsHtml}
                        <div class="flex justify-between items-center mb-4">
                            <p class="text-xs text-gray-400 font-mono"><i class="fa-solid fa-tag mr-1"></i>${s.clave}</p>
                            ${priceDisplay}
                        </div>
                        <p class="text-xs text-gray-500 line-clamp-2 mb-4 h-8">${s.descripcion || 'Sin descripción disponible.'}</p>
                        ${infoRowsHtml ? `<div class="grid grid-cols-1 gap-2 text-[11px] mb-4">${infoRowsHtml}</div>` : ''}
                        <div class="border-t pt-3">${actionBtn}</div>
                    </div>
                </div>`;
        }
    });
    if (IS_PM_QUOTE_PAGE && currentSpace) setActiveQuoteSpaceCard(currentSpace.id);
}

window.startCardCarousel = function (el) {
    const imgs = el.querySelectorAll('.card-img');
    if (imgs.length <= 1) return;
    let current = 0;
    el._carouselInterval = setInterval(() => {
        imgs[current].classList.replace('opacity-100', 'opacity-0');
        current = (current + 1) % imgs.length;
        imgs[current].classList.replace('opacity-0', 'opacity-100');
    }, 2000);
};
window.stopCardCarousel = function (el) {
    if (el._carouselInterval) clearInterval(el._carouselInterval);
    const imgs = el.querySelectorAll('.card-img');
    imgs.forEach((img, i) => {
        if (i === 0) img.classList.replace('opacity-0', 'opacity-100');
        else img.classList.replace('opacity-100', 'opacity-0');
    });
};

window.openPreviewCardModal = function (id) {
    const s = getSpaceById(id);
    if (!s) return;
    const previewBadges = renderCatalogPreviewBadges(s);
    let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
    if (allUrls.length === 0) allUrls = ['../../assets/img/no-image.svg'];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-enter';
    modal.id = 'preview-card-modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    let current = 0;
    const renderContent = () => {
        const dots = allUrls.map((_, i) => `<div class="w-2 h-2 rounded-full ${i === current ? 'bg-white' : 'bg-white/30'}" onclick="event.stopPropagation(); window._updatePreviewIndex(${i})"></div>`).join('');
        modal.innerHTML = `
            <div class="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                <button onclick="this.closest('#preview-card-modal').remove()" class="absolute top-4 right-4 text-white/70 hover:text-white z-20 text-2xl drop-shadow-lg"><i class="fa-solid fa-times"></i></button>
                <img src="${allUrls[current]}" class="max-w-full max-h-full object-contain animate-enter">
                
                ${allUrls.length > 1 ? `
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current - 1 + allUrls.length) % allUrls.length})" class="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-left"></i></button>
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current + 1) % allUrls.length})" class="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="absolute bottom-6 left-1/2 -translate-y-1/2 flex gap-2">${dots}</div>
                ` : ''}
                
                <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-8 pt-20 pointer-events-none">
                    <h3 class="text-white font-black text-3xl uppercase tracking-tighter">${s.nombre}</h3>
                    <p class="text-white/60 text-sm font-bold mt-1 uppercase tracking-widest">${s.tipo} • ${s.clave}</p>
                    ${previewBadges ? `<div class="mt-3 flex flex-wrap gap-2 text-[11px]">${previewBadges}</div>` : ''}
                </div>
            </div>
        `;
    };

    window._updatePreviewIndex = (idx) => { current = idx; renderContent(); };
    renderContent();
    document.body.appendChild(modal);
};

window.selectQuoteSpace = function (spaceId) {
    if (!IS_PM_QUOTE_PAGE) return;
    saveActiveCfgFromForm();
    pmActiveSpaceId = String(spaceId);
    renderSelectedSpaceTabs();
    refreshQuoteSpaceCards();
    loadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.openQuoteDatePicker = async function (_target) {
    if (!isQuoteWorkspacePage()) return;
    saveActiveCfgFromForm();
    const cfg = getActiveCfg();
    const space = getSpaceById(cfg?.spaceId);
    if (!cfg || !space) return window.showToast("Selecciona un espacio primero.", "error");
    initQuoteDateCalendar();
    if (!pmQuoteDateCalendar) return window.showToast("No se pudo inicializar el calendario.", "error");

    pmQuoteTempStart = toDateISO(cfg.startDate || '');
    pmQuoteTempEnd = toDateISO(cfg.endDate || '');
    pmQuoteDatePickMode = (!cfg.customPermanence || !pmQuoteTempStart || (pmQuoteTempStart && pmQuoteTempEnd)) ? 'start' : 'end';
    updatePickedDateLabels();
    document.getElementById('quote-date-active-space').innerText = space.nombre || '--';

    await renderQuoteCalendarBlocked(space.id);
    const focusDate = pmQuoteTempStart || toDateISO(new Date().toISOString().slice(0, 10));
    if (focusDate) pmQuoteDateCalendar.gotoDate(focusDate);
    window.openModal('quote-date-modal');
    setTimeout(() => pmQuoteDateCalendar.render(), 25);
};

window.applyQuoteDateSelection = function () {
    const cfg = getActiveCfg();
    if (!cfg) return;
    if (cfg.customPermanence) {
        if (!pmQuoteTempStart || !pmQuoteTempEnd) return window.showToast("Debes seleccionar inicio y fin.", "error");
        if (rangeHitsBlocked(pmQuoteTempStart, pmQuoteTempEnd)) return window.showToast("El rango seleccionado incluye días bloqueados.", "error");
        cfg.startDate = pmQuoteTempStart;
        cfg.endDate = pmQuoteTempEnd;
    } else {
        if (!pmQuoteTempStart) return window.showToast("Selecciona la fecha de inicio del periodo automático (30 días).", "error");
        const month = getMonthBounds(pmQuoteTempStart);
        if (rangeHitsBlocked(month.start, month.end)) return window.showToast("El periodo automático de 30 días incluye días bloqueados.", "error");
        cfg.startDate = month.start;
        cfg.endDate = month.end;
    }
    normalizeCfgDates(cfg);
    loadActiveCfgToForm();
    window.closeModal('quote-date-modal');
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.addSpaceToQuote = function () {
    if (!IS_PM_QUOTE_PAGE) return;
    const sel = document.getElementById('q-space-add');
    const newId = String(sel?.value || '');
    if (!newId || pmQuoteSpaces.some(x => String(x.spaceId) === newId)) return;
    saveActiveCfgFromForm();
    const active = getActiveCfg();
    const seed = active ? { startDate: active.startDate, endDate: active.endDate } : {};
    pmQuoteSpaces.push(createSpaceCfg(newId, seed));
    pmActiveSpaceId = newId;
    renderSpaceAddSelect();
    if (sel) sel.value = '';
    renderSelectedSpaceTabs();
    refreshQuoteSpaceCards();
    loadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.removeSpaceFromQuote = function (spaceId) {
    if (!IS_PM_QUOTE_PAGE || pmQuoteSpaces.length <= 1) return;
    saveActiveCfgFromForm();
    pmQuoteSpaces = pmQuoteSpaces.filter(x => String(x.spaceId) !== String(spaceId));
    if (String(pmActiveSpaceId) === String(spaceId) && pmQuoteSpaces.length) pmActiveSpaceId = String(pmQuoteSpaces[0].spaceId);
    renderSpaceAddSelect();
    renderSelectedSpaceTabs();
    refreshQuoteSpaceCards();
    loadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.updateQuoteCalculation = function () {
    if (!IS_PM_QUOTE_PAGE) {
        if (!currentSpace) return;
        const pricing = buildSpacePrice(currentSpace);
        currentPricing = { base: currentSpace.precio_base, subtotal: pricing.subtotal, taxes: pricing.taxes, final: pricing.total };
        document.getElementById('q-price').innerText = formatMoney(pricing.total);
        return;
    }
    saveActiveCfgFromForm();
    let subtotal = 0;
    let taxes = 0;
    const spacesPricing = [];
    pmQuoteSpaces.forEach(cfg => {
        const space = getSpaceById(cfg.spaceId);
        if (!space) return;
        normalizeCfgDates(cfg);
        const customBase = cfg.customPermanence && cfg.customBasePrice !== '' ? cfg.customBasePrice : null;
        const pricing = buildSpacePrice(space, { customBase });
        subtotal += pricing.subtotal;
        taxes += pricing.taxes;
        spacesPricing.push({
            spaceId: space.id,
            spaceName: space.nombre,
            spaceKey: space.clave,
            startDate: cfg.startDate || '',
            endDate: cfg.endDate || '',
            customPermanence: !!cfg.customPermanence,
            customBasePrice: customBase,
            subtotalBeforeTax: pricing.subtotal,
            taxTotal: pricing.taxes,
            total: pricing.total,
            taxIds: pricing.taxIds
        });
    });
    currentPricing = { subtotal, taxes, final: subtotal + taxes, spaces: spacesPricing };
    const qPrice = document.getElementById('q-price');
    if (qPrice) qPrice.innerText = formatMoney(currentPricing.final);
};


window.clearManagerImage = function (num) { const input = document.getElementById(`mgr-file-${num}`); if (input) input.value = ''; const img = document.getElementById(`mgr-preview-${num}`); if (img) { img.src = ''; img.classList.add('hidden'); img.setAttribute('data-modified', 'true'); } }


window.openManagerModal = function (id) {
    if (IS_PM_QUOTE_PAGE) return window.showToast("Esta vista es solo para cotizar.", "error");
    if (!myPermissions.catalog_manage) return window.showToast("No tienes permisos.", "error");
    document.getElementById('mgr-id').value = id || '';
    const container = document.getElementById('mgr-taxes-list');
    if (container) {
        container.innerHTML = '';
        let currentTaxes = [];
        if (id) { const s = getSpaceById(id); currentTaxes = parseIds((s && (s.impuestos_ids || s.impuestos)) || []); }
        dbTaxes.forEach(t => {
            const isChecked = currentTaxes.some(cid => String(cid) === String(t.id)) ? 'checked' : '';
            container.innerHTML += `<label class="flex items-center gap-2 p-2 border rounded bg-white hover:bg-gray-50 cursor-pointer"><input type="checkbox" value="${t.id}" class="tax-check accent-brand-red cursor-pointer" ${isChecked}><span class="text-[10px] font-bold uppercase text-gray-600 cursor-pointer select-none">${t.nombre} (${t.porcentaje}%)</span></label>`;
        });
    }

    if (id) {
        const s = getSpaceById(id);
        if (!s) return window.showToast("No se encontro el espacio para editar.", "error");
        document.getElementById('mgr-title').innerText = "Editar: " + s.nombre;
        document.getElementById('mgr-key').value = s.clave; document.getElementById('mgr-key').disabled = true;
        document.getElementById('mgr-name').value = s.nombre; document.getElementById('mgr-type').value = s.tipo;
        document.getElementById('mgr-desc').value = s.descripcion || '';

        let eTags = [];
        try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch (e) { }
        if (!Array.isArray(eTags)) eTags = [];
        document.getElementById('mgr-tags').value = eTags.join(', ');

        document.getElementById('mgr-material').value = s.material || '';
        const currentLocation = getSpaceLocationLabel(s);
        const locationSelect = document.getElementById('mgr-location');
        if (locationSelect && currentLocation && !Array.from(locationSelect.options).some((opt) => opt.value === currentLocation)) {
            locationSelect.innerHTML += `<option value="${currentLocation}">${currentLocation}</option>`;
        }
        document.getElementById('mgr-location').value = currentLocation;
        document.getElementById('mgr-ancho').value = s.medida_ancho ?? s.ancho ?? '';
        document.getElementById('mgr-alto').value = s.medida_alto ?? s.alto ?? '';
        document.getElementById('mgr-unidad').value = s.medida_unidad || s.unidad_medida || 'M';

        document.getElementById('mgr-base').value = s.precio_base;
        document.getElementById('mgr-adj-type').value = s.ajuste_tipo || 'ninguno'; document.getElementById('mgr-adj-pct').value = s.ajuste_porcentaje || 0;
        document.getElementById('mgr-active').checked = s.activa !== false;

        let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
        for (let i = 1; i <= 5; i++) {
            const mgrPrev = document.getElementById(`mgr-preview-${i}`);
            if (mgrPrev) {
                if (allUrls[i - 1]) { mgrPrev.src = allUrls[i - 1]; mgrPrev.classList.remove('hidden'); mgrPrev.removeAttribute('data-modified'); }
                else { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); }
            }
        }
        document.getElementById('btn-delete-mgr').classList.remove('hidden');
        syncManagerTypeFields(s.tipo);
    } else {
        document.getElementById('mgr-title').innerText = "Nuevo Espacio";
        document.getElementById('mgr-key').value = ''; document.getElementById('mgr-key').disabled = false;
        document.getElementById('mgr-type').value = 'local';
        document.getElementById('mgr-name').value = ''; document.getElementById('mgr-base').value = '';
        document.getElementById('mgr-tags').value = '';
        document.getElementById('mgr-material').value = ''; document.getElementById('mgr-location').value = ''; document.getElementById('mgr-ancho').value = ''; document.getElementById('mgr-alto').value = ''; document.getElementById('mgr-unidad').value = 'M';
        document.getElementById('mgr-desc').value = ''; document.getElementById('mgr-active').checked = true;
        for (let i = 1; i <= 5; i++) {
            const mgrPrev = document.getElementById(`mgr-preview-${i}`); if (mgrPrev) { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); }
            const fi = document.getElementById(`mgr-file-${i}`); if (fi) fi.value = '';
        }
        document.getElementById('btn-delete-mgr').classList.add('hidden');
        syncManagerTypeFields('local');
    }
    window.openModal('manager-modal');
}

window.saveSpace = async function () {
    if (!myPermissions.catalog_manage) return;
    if (!(await pmEnsureCatalogManageSession('guardar cambios'))) return;
    const id = document.getElementById('mgr-id').value;
    const selectedTaxes = Array.from(document.querySelectorAll('.tax-check:checked'))
        .map(cb => String(cb.value || '').trim())
        .filter(Boolean);

    // PROCESAR TEXTO A ARREGLO JSONB
    const rawTags = document.getElementById('mgr-tags').value || '';
    const selectedType = document.getElementById('mgr-type').value || '';
    const allowsMaterial = isCatalogAdvertisingType(selectedType);
    const allowsMeasures = isCatalogTypeWithMeasures(selectedType);
    const material = allowsMaterial ? (document.getElementById('mgr-material').value || '') : '';
    const location = isCatalogLocalOrIslandType(selectedType) ? (document.getElementById('mgr-location').value || '') : '';
    const tagsArray = syncPmTagsWithSelections(rawTags.split(',').map(t => t.trim()).filter(Boolean), material, location);
    const medidaAncho = allowsMeasures ? normalizeSpaceMeasureValue(document.getElementById('mgr-ancho').value) : null;
    const medidaAlto = allowsMeasures ? normalizeSpaceMeasureValue(document.getElementById('mgr-alto').value) : null;
    const medidaUnidad = allowsMeasures ? normalizeSpaceMeasureUnit(document.getElementById('mgr-unidad').value || 'M') : 'M';
    document.getElementById('mgr-tags').value = tagsArray.join(', ');
    document.getElementById('mgr-material').value = material;
    document.getElementById('mgr-location').value = normalizePmLocationLabel(location);

    const payload = {
        clave: document.getElementById('mgr-key').value.toUpperCase().trim(),
        nombre: document.getElementById('mgr-name').value,
        tipo: selectedType,
        descripcion: document.getElementById('mgr-desc').value,
        etiquetas: tagsArray, // Guarda etiquetas en base de datos
        material,
        ubicacion: normalizePmLocationLabel(location),
        medida_ancho: medidaAncho ?? 0,
        medida_alto: medidaAlto ?? 0,
        medida_unidad: medidaUnidad,
        precio_base: parseFloat(document.getElementById('mgr-base').value),
        ajuste_tipo: document.getElementById('mgr-adj-type').value,
        ajuste_porcentaje: parseFloat(document.getElementById('mgr-adj-pct').value) || 0,
        activa: document.getElementById('mgr-active').checked,
        impuestos_ids: selectedTaxes
    };

    const buildFormData = (payloadToSave) => {
        const fd = new FormData();
        Object.entries(payloadToSave).forEach(([k, v]) => {
            if (v === null || v === undefined) return; // Skip null/undefined
            if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
                fd.append(k, JSON.stringify(v));
            } else {
                fd.append(k, String(v));
            }
        });
        for (let i = 1; i <= 5; i++) {
            const fi = document.getElementById(`mgr-file-${i}`);
            const preview = document.getElementById(`mgr-preview-${i}`);
            const fieldName = i === 1 ? 'imagen' : `imagen${i}`;
            if (fi && fi.files && fi.files.length > 0) {
                fd.append(fieldName, fi.files[0], fi.files[0].name || `img${i}`);
            } else if (preview && preview.getAttribute('data-modified') === 'true' && preview.classList.contains('hidden')) {
                fd.append(fieldName, ''); // Clear existing file
            }
        }
        return fd;
    };
    const persistSpacePayload = async (payloadToSave) => {
        const fd = buildFormData(payloadToSave);
        const savedSpace = await pmSaveEspacioRecord(id, fd);
        if (!savedSpace) throw new Error('PocketBase no devolvio el espacio guardado.');
        const verification = compareSavedSpaceMaterialMeasure(savedSpace, payloadToSave);
        if (!verification.ok) {
            throw new Error(`PocketBase no confirmo material/medidas guardadas (${verification.mismatches.join(', ')}).`);
        }
        return verification.saved;
    };

    try {
        await persistSpacePayload(payload);
        for (let i = 1; i <= 5; i++) { const fi = document.getElementById(`mgr-file-${i}`); if (fi) fi.value = ''; } window.showToast("Guardado", "success"); window.closeModal('manager-modal'); loadCatalog();
    } catch (e) {
        console.error(e);
        window.showToast("Error al guardar: " + e.message, "error");
    }
}

window.toggleQuoteSpaceCard = function (spaceId) {
    if (!IS_PM_QUOTE_PAGE) {
        pmNavigateSafely(`cotizacion.html?space=${encodeURIComponent(spaceId)}`);
        return;
    }
    const sid = String(spaceId);
    const space = getSpaceById(sid);
    if (!space) return;

    saveActiveCfgFromForm();
    const firstSelection = !pmQuoteSpaces.length;
    const exists = pmQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (!exists) {
        const active = getActiveCfg();
        const seed = active ? {
            startDate: active.startDate,
            endDate: active.endDate,
            customPermanence: !!active.customPermanence,
            customBasePrice: active.customBasePrice
        } : {};
        pmQuoteSpaces.push(createSpaceCfg(sid, seed));
    }
    pmActiveSpaceId = sid;
    renderSpaceAddSelect();
    renderSelectedSpaceTabs();
    refreshQuoteSpaceCards();
    loadActiveCfgToForm();
    document.getElementById('quote-empty-state')?.classList.add('hidden');
    document.getElementById('quote-workspace')?.classList.remove('hidden');
    if (firstSelection) {
        document.getElementById('cli-name').value = '';
        document.getElementById('cli-rfc').value = '';
        document.getElementById('cli-phone').value = '';
        document.getElementById('cli-email').value = '';
        const cliSel = document.getElementById('cli-select'); if (cliSel) cliSel.value = '';
        const cliId = document.getElementById('cli-id'); if (cliId) cliId.value = '';
        const quoteName = document.getElementById('q-quote-name'); if (quoteName) quoteName.value = '';
        loadClientProfilesForQuoteModal();
    }
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.powerOffQuoteSpace = function (spaceId) {
    if (!IS_PM_QUOTE_PAGE) return;
    const sid = String(spaceId);
    const exists = pmQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (!exists) return;
    saveActiveCfgFromForm();
    pmQuoteSpaces = pmQuoteSpaces.filter(x => String(x.spaceId) !== sid);
    if (!pmQuoteSpaces.length) {
        pmActiveSpaceId = null;
        currentSpace = null;
        renderSpaceAddSelect();
        renderSelectedSpaceTabs();
        refreshQuoteSpaceCards();
        document.getElementById('quote-workspace')?.classList.add('hidden');
        document.getElementById('quote-empty-state')?.classList.remove('hidden');
        const avail = document.getElementById('avail-msg'); if (avail) avail.classList.add('hidden');
        const btnGenerate = document.getElementById('btn-generate'); if (btnGenerate) btnGenerate.disabled = true;
        const qPrice = document.getElementById('q-price'); if (qPrice) qPrice.innerText = '$0.00';
        return;
    }
    if (String(pmActiveSpaceId) === sid) pmActiveSpaceId = String(pmQuoteSpaces[0].spaceId);
    renderSpaceAddSelect();
    renderSelectedSpaceTabs();
    refreshQuoteSpaceCards();
    loadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
};

window.openQuoteModal = function (id) {
    const space = getSpaceById(id);
    if (!space) return;

    if (isQuoteWorkspacePage()) {
        window.toggleQuoteSpaceCard(space.id);
        return;
    }

    currentSpace = space;
    const pricing = buildSpacePrice(currentSpace);
    currentPricing = { base: currentSpace.precio_base, subtotal: pricing.subtotal, taxes: pricing.taxes, final: pricing.total };
    const qName = document.getElementById('q-name');
    const qKey = document.getElementById('q-key');
    const qPrice = document.getElementById('q-price');
    const qImg = document.getElementById('q-img');
    if (qName) qName.innerText = currentSpace.nombre;
    if (qKey) qKey.innerText = currentSpace.clave;
    if (qPrice) qPrice.innerText = formatMoney(pricing.total);
    let modalImg = currentSpace.imagen_url || '';
    if (typeof modalImg === 'string' && modalImg.startsWith('[')) { try { modalImg = JSON.parse(modalImg)[0]; } catch (e) { } }
    if (qImg) qImg.src = modalImg;
    const dStart = document.getElementById('date-start');
    const dEnd = document.getElementById('date-end');
    if (dStart) dStart.value = '';
    if (dEnd) { dEnd.value = ''; dEnd.min = ''; }
    document.getElementById('cli-name').value = ''; document.getElementById('cli-rfc').value = ''; document.getElementById('cli-phone').value = ''; document.getElementById('cli-email').value = '';
    const cliSel = document.getElementById('cli-select'); if (cliSel) cliSel.value = '';
    const cliId = document.getElementById('cli-id'); if (cliId) cliId.value = '';
    loadClientProfilesForQuoteModal();
    const avail = document.getElementById('avail-msg'); if (avail) avail.classList.add('hidden');
    const btnGenerate = document.getElementById('btn-generate'); if (btnGenerate) btnGenerate.disabled = true;
    if (document.getElementById('quote-modal')) window.openModal('quote-modal');
}

window.generatePDF = async function () {
    if (isQuoteWorkspacePage()) saveActiveCfgFromForm();
    window.updateQuoteCalculation();
    const availabilityOk = await window.checkAvailability();
    if (!availabilityOk) return window.showToast("Hay espacios con conflicto de fechas o datos incompletos.", "error");

    const cli = { name: document.getElementById('cli-name').value, rfc: document.getElementById('cli-rfc').value, phone: document.getElementById('cli-phone').value.trim(), email: document.getElementById('cli-email').value.trim() };
    if (!cli.name) return window.showToast("Falta nombre del cliente", "error");

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cli.email)) return window.showToast("El correo electrónico no es válido.", "error");

    let spaces = [];
    if (isQuoteWorkspacePage()) {
        spaces = (currentPricing.spaces || []).map(x => ({ ...x }));
        if (!spaces.length) return window.showToast("Selecciona al menos un espacio.", "error");
        const missingDates = spaces.find(sp => !toDateISO(sp.startDate) || !toDateISO(sp.endDate));
        if (missingDates) return window.showToast(`Faltan fechas para ${missingDates.spaceName}.`, "error");
    } else {
        if (!currentSpace) return window.showToast("Selecciona un espacio para cotizar.", "error");
        const startDate = document.getElementById('date-start')?.value || '';
        const endDate = document.getElementById('date-end')?.value || '';
        if (!startDate || !endDate) return window.showToast("Faltan fechas del evento.", "error");
        const pricing = buildSpacePrice(currentSpace);
        spaces = [{
            spaceId: currentSpace.id,
            spaceName: currentSpace.nombre,
            spaceKey: currentSpace.clave,
            startDate,
            endDate,
            customPermanence: false,
            customBasePrice: null,
            subtotalBeforeTax: pricing.subtotal,
            taxTotal: pricing.taxes,
            total: pricing.total,
            taxIds: pricing.taxIds
        }];
        currentPricing = { subtotal: pricing.subtotal, taxes: pricing.taxes, final: pricing.total, spaces };
    }

    const quoteNameRaw = (document.getElementById('q-quote-name')?.value || '').trim();
    const quoteName = quoteNameRaw || `${cli.name} - ${spaces.map(s => s.spaceName).join(' + ')}`;
    const startDates = spaces.map(s => toDateISO(s.startDate)).filter(Boolean);
    const endDates = spaces.map(s => toDateISO(s.endDate)).filter(Boolean);
    const minStart = minDate(startDates);
    const maxEnd = maxDate(endDates);
    const taxIdsUnion = Array.from(new Set(spaces.flatMap(s => (s.taxIds || []).map(x => String(x)))));
    const first = spaces[0];
    const espaciosDetalle = spaces.map(sp => {
        const fullSpace = getSpaceById(sp.spaceId) || {};
        const medidaAncho = fullSpace.medida_ancho ?? fullSpace.ancho ?? null;
        const medidaAlto = fullSpace.medida_alto ?? fullSpace.alto ?? null;
        const medidaUnidad = fullSpace.medida_unidad || fullSpace.unidad_medida || 'M';
        return {
            espacio_id: sp.spaceId,
            espacio_nombre: sp.spaceName,
            espacio_clave: sp.spaceKey,
            espacio_tipo: fullSpace.tipo || null,
            tipo: fullSpace.tipo || null,
            fecha_inicio: sp.startDate,
            fecha_fin: sp.endDate,
            permanencia_personalizada: !!sp.customPermanence,
            precio_personalizado: (sp.customBasePrice === '' || sp.customBasePrice === null || sp.customBasePrice === undefined) ? null : (parseFloat(sp.customBasePrice) || 0),
            subtotal_espacio: sp.subtotalBeforeTax,
            impuestos_ids: sp.taxIds || [],
            impuestos_total: sp.taxTotal || 0,
            total_espacio: sp.total || 0,
            // Nuevos campos para PDF
            material: fullSpace.material || null,
            ubicacion: normalizePmLocationLabel(fullSpace.ubicacion || '') || null,
            medida_ancho: medidaAncho,
            medida_alto: medidaAlto,
            medida_unidad: medidaUnidad,
            // Compatibilidad con estructura legacy
            ancho: medidaAncho,
            alto: medidaAlto,
            unidad_medida: medidaUnidad
        };
    });
    const audit = await pmResolveQuoteActorAudit();
    const payload = {
        cliente_id: (document.getElementById('cli-id') ? (document.getElementById('cli-id').value || null) : null),
        nombre_cotizacion: quoteName,
        espacio_id: first.spaceId,
        espacio_nombre: spaces.length === 1 ? first.spaceName : `${first.spaceName} + ${spaces.length - 1} espacio(s)`,
        espacio_clave: spaces.length === 1 ? first.spaceKey : 'MULTI',
        cliente_nombre: cli.name,
        cliente_rfc: cli.rfc,
        cliente_contacto: cli.phone,
        cliente_email: cli.email,
        fecha_inicio: minStart,
        fecha_fin: maxEnd,
        precio_final: currentPricing.final,
        desglose_precios: { subtotal_antes_impuestos: currentPricing.subtotal, impuestos_detalle: taxIdsUnion, tax_total: currentPricing.taxes, espacios: espaciosDetalle },
        detalles_evento: {
            multi_espacio: spaces.length > 1,
            total_espacios: spaces.length,
            nombre_cotizacion: quoteName,
            permanencia_personalizada: spaces.some(sp => !!sp.customPermanence)
        },
        espacios_detalle: espaciosDetalle,
        conceptos_adicionales: [],
        status: 'pendiente',
        creado_por: audit.actorId || null,
        creado_por_nombre: audit.actorName,
        modificado_por: audit.actorId || null,
        modificado_por_nombre: audit.actorName
    };
    const { error, id: createdQuoteId } = await pmCreateQuoteRecord(payload);
    if (error) {
        console.error(error);
        if (String(error.message || '').toLowerCase().includes('espacios_detalle') || String(error.message || '').toLowerCase().includes('nombre_cotizacion')) {
            return window.showToast("Falta aplicar migración de BD para multiespacio en Plaza Mayor.", "error");
        }
        return window.showToast(`Error al guardar: ${error.message}`, "error");
    }
    window.showToast("Cotización Creada");
    const targetUrl = createdQuoteId ? `order_detail.html?quote=${encodeURIComponent(createdQuoteId)}` : 'orders.html';
    setTimeout(() => { pmNavigateSafely(targetUrl); }, 900);
}

window.filterCatalogLogic = function () {
    const term = document.getElementById('cat-search')?.value || '';
    const type = document.getElementById('cat-filter-type')?.value || 'all';
    const sort = document.getElementById('cat-sort')?.value || 'default';
    let filtered = allSpaces.filter(s => matchesCatalogSearch(s, term) && (type === 'all' || s.tipo === type));
    if (sort === 'price_asc') filtered.sort((a, b) => a.precio_base - b.precio_base);
    if (sort === 'price_desc') filtered.sort((a, b) => b.precio_base - a.precio_base);
    renderSpaces(filtered);
}
window.previewImage = function (i, id) { const p = document.getElementById(id || 'mgr-preview'); if (i.files && i.files[0]) { const r = new FileReader(); r.onload = e => { p.src = e.target.result; p.classList.remove('hidden'); p.setAttribute('data-modified', 'true'); }; r.readAsDataURL(i.files[0]); } }
window.checkAvailability = async function () {
    const msg = document.getElementById('avail-msg');
    const btn = document.getElementById('btn-generate');
    if (isQuoteWorkspacePage()) saveActiveCfgFromForm();

    const targets = isQuoteWorkspacePage()
        ? pmQuoteSpaces.map(cfg => ({ cfg, space: getSpaceById(cfg.spaceId) })).filter(x => !!x.space)
        : (currentSpace ? [{ cfg: { startDate: document.getElementById('date-start')?.value || '', endDate: document.getElementById('date-end')?.value || '' }, space: currentSpace }] : []);

    if (!targets.length) {
        if (msg) msg.classList.add('hidden');
        if (btn) btn.disabled = true;
        return false;
    }

    targets.forEach(item => normalizeCfgDates(item.cfg));

    const missingDates = targets.filter(item => !toDateISO(item.cfg.startDate) || !toDateISO(item.cfg.endDate));
    if (missingDates.length) {
        if (msg) {
            msg.classList.remove('hidden');
            msg.className = 'mb-6 p-2 rounded-lg text-center text-xs font-bold border border-yellow-200 bg-yellow-50 text-yellow-700';
            msg.innerText = 'COMPLETA LAS FECHAS DE CADA ESPACIO';
        }
        if (btn) btn.disabled = true;
        return false;
    }

    const { data, error } = await window.tenantPocketBase
        .from('cotizaciones')
        .select('id,espacio_id,fecha_inicio,fecha_fin,espacios_detalle,status')
        .eq('status', 'aprobada');
    if (error) {
        if (msg) {
            msg.classList.remove('hidden');
            msg.className = 'mb-6 p-2 rounded-lg text-center text-xs font-bold border border-red-200 bg-red-50 text-red-500';
            msg.innerText = 'ERROR AL VALIDAR DISPONIBILIDAD';
        }
        if (btn) btn.disabled = true;
        return false;
    }

    const conflicts = [];
    (targets || []).forEach(item => {
        const sid = String(item.space.id);
        const s = toDateISO(item.cfg.startDate);
        const e = toDateISO(item.cfg.endDate);
        (data || []).forEach(order => {
            let ranges = [];
            const detail = safeArray(order.espacios_detalle);
            if (detail.length) {
                detail.forEach(d => {
                    const dsid = String(d?.espacio_id || d?.space_id || '');
                    const fi = toDateISO(d?.fecha_inicio || '');
                    const ff = toDateISO(d?.fecha_fin || '');
                    if (dsid === sid && fi && ff) ranges.push({ start: fi, end: ff });
                });
            } else if (String(order.espacio_id || '') === sid) {
                const fi = toDateISO(order.fecha_inicio || '');
                const ff = toDateISO(order.fecha_fin || '');
                if (fi && ff) ranges.push({ start: fi, end: ff });
            }
            if (ranges.some(r => rangesOverlap(s, e, r.start, r.end))) {
                const hit = ranges.find(r => rangesOverlap(s, e, r.start, r.end));
                conflicts.push({ space: item.space.nombre, start: hit.start, end: hit.end });
            }
        });
    });

    if (conflicts.length) {
        const unique = [];
        const seen = new Set();
        conflicts.forEach(c => {
            const key = `${c.space}|${c.start}|${c.end}`;
            if (seen.has(key)) return;
            seen.add(key);
            unique.push(c);
        });
        const txt = unique
            .slice(0, 3)
            .map(c => `${c.space} (${window.safeFormatDate ? window.safeFormatDate(c.start) : c.start}${c.end !== c.start ? ` a ${window.safeFormatDate ? window.safeFormatDate(c.end) : c.end}` : ''})`)
            .join(', ');
        if (msg) {
            msg.classList.remove('hidden');
            msg.className = 'mb-6 p-2 rounded-lg text-center text-xs font-bold border border-red-200 bg-red-50 text-red-500';
            msg.innerText = `OCUPADO: ${txt}`;
        }
        if (btn) btn.disabled = true;
        return false;
    }

    if (msg) {
        msg.classList.remove('hidden');
        msg.className = 'mb-6 p-2 rounded-lg text-center text-xs font-bold border border-green-200 bg-green-50 text-green-600';
        msg.innerText = targets.length > 1 ? 'DISPONIBLE EN TODOS LOS ESPACIOS' : 'DISPONIBLE';
    }
    if (btn) btn.disabled = false;
    return true;
}
window.askDeleteSpace = async function () {
    window.openConfirm("¿Eliminar espacio?", async () => {
        if (!(await pmEnsureCatalogManageSession('eliminar el espacio'))) return;
        try {
            await pmDeleteEspacioRecord(document.getElementById('mgr-id').value);
            window.showToast("Eliminado");
            window.closeModal('manager-modal');
            loadCatalog();
        } catch (e) {
            console.error(e);
            window.showToast("Error al eliminar: " + (e?.message || e), "error");
        }
    });
}



