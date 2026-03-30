/**
 * DOC: client\cotizadorcp\catalog.js
 * Proposito: Gestion y catalogo de espacios (administracion).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

let clientProfiles = [];
let clientProfilesById = {};

window.finalMontajeDates = [];
window.tempMontajeDates = [];
window.currentMontajePrefix = 'q';

async function loadClientProfilesForQuoteModal() {
    const sel = document.getElementById('cli-select'); const hid = document.getElementById('cli-id'); if (!sel || !window.tenantPocketBase) return;
    try {
        const { data, error } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,telefono,correo,rfc').order('nombre_completo', { ascending: true });
        if (error) throw error; clientProfiles = data || []; clientProfilesById = {}; clientProfiles.forEach(c => clientProfilesById[c.id] = c);
        sel.innerHTML = '<option value="">— Capturar manualmente —</option>' + clientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()}</option>`).join('');
        sel.onchange = () => { const id = sel.value; if (!id) { if (hid) hid.value = ''; return; } const c = clientProfilesById[id]; if (!c) return; if (hid) hid.value = id; const n = document.getElementById('cli-name'); const p = document.getElementById('cli-phone'); const e = document.getElementById('cli-email'); const r = document.getElementById('cli-rfc'); if (n) n.value = c.nombre_completo || ''; if (p) p.value = (c.telefono || ''); if (e) e.value = (c.correo || ''); if (r) r.value = (c.rfc || ''); };
        const clearAssoc = () => { if (sel.value) sel.value = ''; if (hid) hid.value = ''; }; ['cli-name','cli-phone','cli-email','cli-rfc'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', clearAssoc); });
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
const __cpPath = window.location.pathname || '';
const __cpIsCP = /\/cotizadorcp(\/|$)/.test(__cpPath) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __cpIsCP ? 'finanzas_casadepiedra' : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_CASA_PIEDRA || 'finanzas');
// Fallback por pathname: si falta __CP_PAGE_MODE, la vista de cotizacion no debe degradar a modo catalogo.
const CP_PAGE_MODE = window.__CP_PAGE_MODE || ((String(window.location.pathname || '').toLowerCase().includes('cotizacion.html')) ? 'cotizacion' : 'catalog_admin');
const IS_QUOTE_PAGE = CP_PAGE_MODE === 'cotizacion';
const IS_CATALOG_ADMIN_PAGE = CP_PAGE_MODE === 'catalog_admin';

let allSpaces = [], catalogConcepts = [], dbTaxes = [], currentSpace = null, currentPricing = { base:0, final:0 };
let adminSelectedConcepts = []; let myPermissions = { access:false, catalog_manage:false };
let __cpPremontajePct = 25;

function normalizeCpCatalogTenantSlug(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'finanzas' || raw.indexOf('plaza') !== -1) return 'plaza_mayor';
    if (raw.indexOf('casadepiedra') !== -1 || raw.indexOf('casa_de_piedra') !== -1 || raw.indexOf('casa-de-piedra') !== -1) return 'casa_de_piedra';
    return raw;
}

function resolveCpCatalogTenantSlug(fallback = '') {
    const fromClient = normalizeCpCatalogTenantSlug(window.tenantPocketBase?.tenant || '');
    if (fromClient) return fromClient;
    const fromFallback = normalizeCpCatalogTenantSlug(fallback);
    if (fromFallback) return fromFallback;
    const fromSchema = normalizeCpCatalogTenantSlug(FIN_SCHEMA);
    if (fromSchema) return fromSchema;
    const path = String(window.location.pathname || '').toLowerCase();
    return path.indexOf('/cotizadorcp/') !== -1 ? 'casa_de_piedra' : 'plaza_mayor';
}

function filterCpCatalogRowsByTenant(rows, fallback = '') {
    const tenant = resolveCpCatalogTenantSlug(fallback);
    const source = Array.isArray(rows) ? rows : [];
    if (!tenant) return source.slice();
    return source.filter((row) => {
        const rowTenant = normalizeCpCatalogTenantSlug(row?.tenant || '');
        return !rowTenant || rowTenant === tenant;
    });
}

function pickCpCatalogLatestConfigRow(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

function parseCpCatalogConfigJson(value) {
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

function findCpCatalogTaxRecord(taxId, space = null) {
    const safeId = String(taxId || '').trim();
    if (!safeId) return null;
    const tenant = resolveCpCatalogTenantSlug(space?.tenant || '');
    const tenantTaxes = filterCpCatalogRowsByTenant(dbTaxes, tenant);
    return tenantTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || dbTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || null;
}

function cpEspaciosService() {
    return window.PB_SERVICES && window.PB_SERVICES.espacios ? window.PB_SERVICES.espacios : null;
}

async function cpEnsureCatalogManageSession(actionLabel = 'guardar cambios') {
    if (!IS_CATALOG_ADMIN_PAGE) return true;
    try {
        const authCtx = window.HUB_SESSION?.ensureAuth
            ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, allowCachedUser: false, redirectOnFail: false })
            : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA, allowCachedUser: false });
        const session = authCtx?.session || null;
        const token = String(session?.access_token || session?.token || '').trim();
        if (session?.user && (token || authCtx?.profile || authCtx?.user)) return true;
    } catch (_) {}
    window.showToast?.(`Tu sesión expiró. Inicia sesión de nuevo para ${actionLabel}.`, 'error');
    return false;
}

async function cpSaveEspacioRecord(id, payload) {
    const svc = cpEspaciosService();
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

async function cpDeleteEspacioRecord(id) {
    const svc = cpEspaciosService();
    if (svc) {
        await svc.remove(id, { schema: FIN_SCHEMA });
        return true;
    }
    const result = await window.tenantPocketBase.from('espacios').delete().eq('id', id);
    if (result?.error) throw result.error;
    return true;
}

// Evita recargar el mismo documento por una navegación accidental.
function cpNormalizeUrlForNav(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.href);
        parsed.hash = '';
        return parsed.toString();
    } catch (_) {
        return String(value || '').trim();
    }
}

function cpNavigateSafely(targetUrl, options = {}) {
    const target = String(targetUrl || '').trim();
    if (!target) return false;
    const allowSamePage = options.allowSamePage === true;
    if (!allowSamePage && cpNormalizeUrlForNav(target) === cpNormalizeUrlForNav(window.location.href || '')) {
        window.showToast?.('Recarga bloqueada para proteger tus cambios.', 'info');
        return false;
    }
    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
        return window.__HUB_SAFE_NAVIGATE(target, { allowSamePage });
    }
    window.location.href = target;
    return true;
}

function cpNativeCotizacionesService() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}

async function cpCreateQuoteRecord(payload) {
    const svc = cpNativeCotizacionesService();
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

async function cpResolveQuoteActorAudit() {
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
    } catch (_) {}
    const cachedName = sanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) actorName = cachedName;
    if (!actorName) actorName = 'Usuario';
    return { actorId, actorName };
}

async function cpResolveCurrentUserProfile(sessionUser = {}) {
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
        } catch (_) {}
        return null;
    };
    let profile = await lookupOne('app_users', 'id', id);
    if (!profile) profile = await lookupOne('app_users', 'email', email);
    const merged = { ...fallback, ...(profile || {}) };
    if (!merged.app_metadata && fallback?.app_metadata) merged.app_metadata = fallback.app_metadata;
    return merged;
}

function parseIds(v){ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v === 'string'){ try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch(e){ return v.split(',').map(x=>x.trim()).filter(Boolean); } } return []; }
function formatMoney(v){ return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }
function buildCpCatalogPriceDisplay(baseBeforeTax, taxOnlyAmount, finalPrice, taxLabel, options = {}) {
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
function formatTaxPercent(value){ const raw = parseFloat(value); const pct = Number.isFinite(raw) ? (raw > 0 && raw <= 1 ? raw * 100 : raw) : 0; return Number.isInteger(pct) ? String(pct) : pct.toLocaleString('es-MX', { maximumFractionDigits: 2 }); }
function getSpaceTaxDetails(space){
    const taxIds = parseIds(space?.impuestos_ids || space?.impuestos).map(id => String(id || '').trim()).filter(Boolean);
    return taxIds.map(taxId => findCpCatalogTaxRecord(taxId, space)).filter(Boolean);
}
function getSpaceTaxLabel(space){
    const rows = getSpaceTaxDetails(space);
    if (!rows.length) return 'Sin impuestos';
    return rows.map(t => `${t.nombre} ${formatTaxPercent(t.porcentaje)}%`).join(', ');
}
function normalizeCpSpaceTag(value) {
    const raw = String(value || '').trim();
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
    return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function getCpSpaceTags(space) {
    const tags = new Set();
    const push = (value) => {
        const normalized = normalizeCpSpaceTag(value);
        if (normalized) tags.add(normalized);
    };
    push(space?.tipo);
    let rawTags = [];
    try {
        rawTags = typeof space?.etiquetas === 'string' ? JSON.parse(space.etiquetas) : (space?.etiquetas || []);
    } catch (_) {
        rawTags = [];
    }
    (Array.isArray(rawTags) ? rawTags : []).forEach(push);
    return tags;
}
function cpSpaceHasTag(space, term) {
    const needle = normalizeCpSpaceTag(term);
    return Array.from(getCpSpaceTags(space)).some((tag) => tag === needle || tag.includes(needle));
}
function isCpAdvertisingSpace(space) {
    return cpSpaceHasTag(space, 'publicidad');
}
function isCpLocalLikeSpace(space) {
    return cpSpaceHasTag(space, 'local') || cpSpaceHasTag(space, 'isla') || cpSpaceHasTag(space, 'espacio');
}
function normalizeCpMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}
function normalizeCpMeasureUnit(value) {
    return String(value || 'M').trim().toUpperCase() === 'CM' ? 'CM' : 'M';
}
function trimCpMeasureValue(value) {
    return String(value || '')
        .replace(/(\.\d*?[1-9])0+$/g, '$1')
        .replace(/\.0+$/g, '')
        .trim();
}
function getCpSpaceMeasuresLabel(space) {
    const width = normalizeCpMeasureValue(space?.medida_ancho ?? space?.ancho);
    const height = normalizeCpMeasureValue(space?.medida_alto ?? space?.alto);
    const unit = normalizeCpMeasureUnit(space?.medida_unidad || space?.unidad_medida || 'M');
    if (width === null && height === null) return 'Sin medidas';
    if (width !== null && height !== null) return `${trimCpMeasureValue(width)} x ${trimCpMeasureValue(height)} ${unit}`;
    const single = width !== null ? width : height;
    return `${trimCpMeasureValue(single)} ${unit}`;
}
function getCpCardInfoRows(space) {
    const rows = [];
    if (isCpAdvertisingSpace(space)) rows.push({ label: 'Medidas', value: getCpSpaceMeasuresLabel(space) });
    if (!isCpAdvertisingSpace(space) && !isCpLocalLikeSpace(space)) rows.push({ label: 'Impuestos', value: getSpaceTaxLabel(space) });
    return rows.filter((row) => String(row?.value || '').trim());
}
function renderCpCardInfoRows(space) {
    return getCpCardInfoRows(space).map((row) => `<div class="mb-4 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-[11px] flex justify-between gap-3"><span class="font-black uppercase text-gray-400">${row.label}</span><span class="font-bold text-gray-700 text-right">${row.value}</span></div>`).join('');
}
function renderCpPreviewBadges(space) {
    return getCpCardInfoRows(space).map((row) => `<span class="px-2 py-1 rounded-full bg-white/15 text-white font-bold">${row.label}: ${row.value}</span>`).join('');
}
window.safeFormatDate = function(dateStr) { if (!dateStr) return '--'; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parts[2]}/${parts[1]}/${parts[0]}`; };
function getPremontajePct(){ const n = parseFloat(__cpPremontajePct); return Number.isFinite(n) && n >= 0 ? n : 25; }
function getSpaceMaxCapacity(space){
    let rules = [];
    try { rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []); } catch(e){}
    if(!Array.isArray(rules) || !rules.length) return 999999;
    const finite = rules.map(r => parseInt(r?.max, 10)).filter(v => Number.isFinite(v) && v > 0 && v < 999999);
    return finite.length ? Math.max(...finite) : 999999;
}
async function loadPremontajePctConfig() {
    const tenant = resolveCpCatalogTenantSlug('casa_de_piedra');
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,valor_num,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'premontaje_pct');
        if (error) throw error;
        const row = pickCpCatalogLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const cfg = parseCpCatalogConfigJson(row?.valor_json);
        const raw = row?.valor_num ?? cfg?.value ?? cfg?.percent;
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed) && parsed >= 0) __cpPremontajePct = parsed;
    } catch (e) {
        __cpPremontajePct = 25;
    }
}

function calculateDayByDayTotal(space, startStr, endStr, guests, options = {}) {
    if (!startStr) return { total: 0 };
    const endS = endStr || startStr;
    let rules = [];
    try { rules = typeof space.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space.precios_por_dia || []); } catch(e){}
    if (!Array.isArray(rules) || rules.length === 0) rules = [{ min: 0, max: 999999, precios: {lunes: space.precio_base||0, martes:space.precio_base||0, miercoles:space.precio_base||0, jueves:space.precio_base||0, viernes:space.precio_base||0, sabado:space.precio_base||0, domingo:space.precio_base||0} }];
    
    const guestCount = parseInt(guests) || 1;
    let activeRule = rules.find(r => guestCount >= r.min && guestCount <= r.max);
    if (!activeRule) activeRule = rules[rules.length - 1];
    
    const prices = activeRule ? (activeRule.precios || {}) : {}; let total = 0;
    const start = new Date(startStr + 'T00:00:00'); const end = new Date(endS + 'T00:00:00'); const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    let blockedDays = []; try { blockedDays = typeof space.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space.dias_bloqueados || []); } catch(e){}
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = keys[d.getDay()];
        let price = parseFloat(prices[key] || 0);
        if (!options.ignoreBlocks && blockedDays.includes(key)) price = 0;
        total += price;
    }
    return { total };
}

// CLICK AFUERA CIERRA MODALES (EXCEPTO CUANDO SE REQUIERE CONFIRMACIÓN O EDICIÓN)
window.addEventListener('click', function(e) {
    const qModal = document.getElementById('quote-modal');
    const mgrModal = document.getElementById('manager-modal');
    const montajeModal = document.getElementById('montaje-modal');

    if (e.target === mgrModal) window.closeModal('manager-modal');
    if (e.target === qModal) window.closeModal('quote-modal');
    if (e.target === montajeModal) montajeModal.classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (window.PB_CLIENT) { if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } }); if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY); }
    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: false })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }
    const profile = authCtx?.profile || await cpResolveCurrentUserProfile(session.user);
    const cachedRole = String(localStorage.getItem('hub_user_cache_role') || '').trim().toLowerCase();
    const userRole = String(profile?.role || profile?.rol || cachedRole).toLowerCase().trim();
    const roleHasAccess = (userRole === 'admin') || (userRole === 'casa_de_piedra') || (userRole === 'ambos');
    if (userRole === 'admin') myPermissions = { access: true, catalog_manage: true };
    else if (roleHasAccess) myPermissions = { access: true, catalog_manage: false };
    else {
        const profilePerms = profile?.app_metadata?.finanzas?.permissions;
        if (profilePerms && typeof profilePerms === 'object') {
            myPermissions = { access: true, catalog_manage: false, ...profilePerms, catalog_manage: !!profilePerms.catalog_manage };
        } else {
            myPermissions = { access: true, catalog_manage: false };
        }
    }
    if (!myPermissions.access) return window.showToast?.('No tienes permisos.', 'error');
    if (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) { const btn = document.getElementById('btn-new-space'); if(btn) btn.classList.remove('hidden'); }
    await loadTaxes();
    await loadPremontajePctConfig();
    if (IS_QUOTE_PAGE) await loadClientProfilesForQuoteModal();
    loadCatalog();
    if (IS_QUOTE_PAGE) {
        const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true);
        catalogConcepts = data || [];
        const preselect = new URLSearchParams(window.location.search || '').get('space');
        if (preselect) setTimeout(() => window.openQuoteModal(preselect), 150);
    }
});

async function loadTaxes() {
    const tenant = resolveCpCatalogTenantSlug();
    let rows = [];
    try {
        const { data } = await window.tenantPocketBase.from('impuestos').select('*').order('nombre', { ascending: true });
        rows = data || [];
    } catch (_) {
        rows = [];
    }
    dbTaxes = filterCpCatalogRowsByTenant(rows, tenant);
    if (!dbTaxes.length && window.globalPocketBase && tenant) {
        try {
            const { data } = await window.globalPocketBase.from('impuestos').select('*').eq('tenant', tenant);
            dbTaxes = filterCpCatalogRowsByTenant(data || [], tenant);
        } catch (_) {}
    }
}
async function loadCatalog() {
    const tenant = resolveCpCatalogTenantSlug();
    const { data } = await window.tenantPocketBase.from('espacios').select('*').order('clave');
    allSpaces = filterCpCatalogRowsByTenant(data || [], tenant).sort((a, b) => String(a?.clave || a?.nombre || '').localeCompare(String(b?.clave || b?.nombre || ''), 'es', { numeric: true, sensitivity: 'base' }));
    renderSpaces(allSpaces);
}

function renderSpaces(list) { 
    const g = document.getElementById('spaces-grid'); g.innerHTML=''; if(list.length === 0) { g.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400 font-bold">No se encontraron espacios.</div>'; return; }
    list.forEach(s => { 
        const infoRowsHtml = renderCpCardInfoRows(s);
        let adjustedBase = parseFloat(s.precio_base || 0) || 0;
        const taxDetails = getSpaceTaxDetails(s);
        const taxPriceLabel = taxDetails.length === 1 ? taxDetails[0].nombre : 'Impuestos';
        if (s.ajuste_tipo === 'aumento') adjustedBase += adjustedBase * ((parseFloat(s.ajuste_porcentaje || 0) || 0) / 100);
        if (s.ajuste_tipo === 'descuento') adjustedBase -= adjustedBase * ((parseFloat(s.ajuste_porcentaje || 0) || 0) / 100);
        let totalTax = 0;
        taxDetails.forEach((t) => {
            const rate = parseFloat(t?.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje || 0) / 100) : (parseFloat(t?.porcentaje || 0) || 0);
            totalTax += adjustedBase * rate;
        });
        const finalPrice = adjustedBase + totalTax;
        const taxOnlyAmount = finalPrice - adjustedBase;
        const priceDisplay = buildCpCatalogPriceDisplay(adjustedBase, taxOnlyAmount, finalPrice, taxPriceLabel);
        let allUrls = []; try { if(s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if(s.imagen_url) allUrls = [s.imagen_url]; } catch(e){}
        if (allUrls.length === 0) allUrls = ['../../assets/img/placeholder_cp.png'];
        
        let eTags = []; try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch(e){}
        let tagsHtml = ''; if(eTags.length > 0) { tagsHtml = `<div class="flex gap-1 mb-2 flex-wrap">` + eTags.map(t => `<span class="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">${t}</span>`).join('') + `</div>`; }
        
        const editBtn = (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) ? `<button onclick="event.stopPropagation(); window.openManagerModal('${String(s.id)}')" class="absolute top-3 right-3 bg-white/90 text-gray-700 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-20"><i class="fa-solid fa-pen"></i></button>` : '';
        const actionBtn = IS_QUOTE_PAGE
            ? `<div class="border-t pt-3"><button onclick="event.stopPropagation(); window.openQuoteModal('${String(s.id)}')" class="bg-gray-900 text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-brand-red transition-colors duration-300 shadow-lg"><i class="fa-solid fa-calculator mr-2"></i> Cotizar Evento</button></div>`
            : (myPermissions.catalog_manage
                ? `<div class="border-t pt-3"><button onclick="event.stopPropagation(); window.openManagerModal('${String(s.id)}')" class="bg-gray-900 text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-brand-red transition-colors duration-300 shadow-lg"><i class="fa-solid fa-sliders mr-2"></i> Administrar Espacio</button></div>`
                : '');

        // Carousel logic: create multiple img tags and cycle them with data-index
        const imgsHtml = allUrls.map((url, i) => `<img src="${url}" class="card-img absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i===0?'opacity-100':'opacity-0'}" data-index="${i}">`).join('');
        
        const cardHtml = `
            <div class="bg-white rounded-xl shadow-md relative group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden border border-gray-100 cursor-pointer" 
                 onclick="window.openPreviewCardModal('${String(s.id)}')"
                 onmouseenter="window.startCardCarousel(this)" 
                 onmouseleave="window.stopCardCarousel(this)">
                <div class="h-48 bg-gray-200 relative overflow-hidden">
                    ${editBtn}
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
                    <p class="text-xs text-gray-500 line-clamp-2 mb-4 h-8">${s.descripcion || ''}</p>
                    ${infoRowsHtml}
                    ${actionBtn}
                </div>
            </div>`;
        g.innerHTML += cardHtml;
    }); 
}

// Carousel helpers
window.startCardCarousel = function(el) {
    const imgs = el.querySelectorAll('.card-img');
    if (imgs.length <= 1) return;
    let current = 0;
    el._carouselInterval = setInterval(() => {
        imgs[current].classList.replace('opacity-100', 'opacity-0');
        current = (current + 1) % imgs.length;
        imgs[current].classList.replace('opacity-0', 'opacity-100');
    }, 2000);
};
window.stopCardCarousel = function(el) {
    if (el._carouselInterval) clearInterval(el._carouselInterval);
    const imgs = el.querySelectorAll('.card-img');
    imgs.forEach((img, i) => {
        if (i === 0) img.classList.replace('opacity-0', 'opacity-100');
        else img.classList.replace('opacity-100', 'opacity-0');
    });
};

// Public Preview Modal
window.openPreviewCardModal = function(id) {
    const s = allSpaces.find(x => x.id === id);
    if (!s) return;
    const previewBadges = renderCpPreviewBadges(s);
    let allUrls = []; try { if(s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if(s.imagen_url) allUrls = [s.imagen_url]; } catch(e){}
    if (allUrls.length === 0) allUrls = ['../../assets/img/placeholder_cp.png'];

    const modal = document.createElement('div');
    modal.id = 'preview-card-modal';
    modal.className = 'fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-enter';
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };

    let current = 0;
    const renderContent = () => {
        const dots = allUrls.map((_, i) => `<div class="w-2 h-2 rounded-full ${i===current?'bg-white':'bg-white/30'}" onclick="event.stopPropagation(); window._updatePreviewIndex(${i})"></div>`).join('');
        modal.innerHTML = `
            <div class="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                <button onclick="this.closest('#preview-card-modal').remove()" class="absolute top-4 right-4 text-white/70 hover:text-white z-20 text-2xl drop-shadow-lg"><i class="fa-solid fa-times"></i></button>
                <img src="${allUrls[current]}" class="max-w-full max-h-full object-contain animate-enter">
                
                ${allUrls.length > 1 ? `
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current-1+allUrls.length)%allUrls.length})" class="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-left"></i></button>
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current+1)%allUrls.length})" class="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-right"></i></button>
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

window.addRangeRow = function(data = null) {
    const container = document.getElementById('mgr-ranges-container'); const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const min = data ? data.min : 1; const max = data ? data.max : 100; const prices = data ? data.precios : {lunes:0, martes:0, miercoles:0, jueves:0, viernes:0, sabado:0, domingo:0};
    const row = document.createElement('div'); row.className = "range-row bg-gray-50 p-3 rounded-lg border border-gray-200 relative animate-enter"; row.id = `range-${id}`;
    row.innerHTML = `<div class="flex justify-between items-center mb-2"><div class="flex items-center gap-2"><span class="text-[10px] font-bold uppercase text-brand-red bg-yellow-50 px-2 py-0.5 rounded">Rango</span><input type="number" class="range-min w-16 border rounded text-xs p-1 text-center font-bold" value="${min}"><span class="text-xs text-gray-400">-</span><input type="number" class="range-max w-16 border rounded text-xs p-1 text-center font-bold" value="${max}"><span class="text-[10px] font-bold uppercase text-gray-400 ml-1">Personas</span></div><button onclick="document.getElementById('range-${id}').remove()" class="text-gray-400 hover:text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div><div class="grid grid-cols-4 gap-2"><div><label class="text-[9px] uppercase font-bold text-gray-400">Lun</label><input type="number" value="${prices.lunes}" class="p-lun w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mar</label><input type="number" value="${prices.martes}" class="p-mar w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mié</label><input type="number" value="${prices.miercoles}" class="p-mie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Jue</label><input type="number" value="${prices.jueves}" class="p-jue w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Vie</label><input type="number" value="${prices.viernes}" class="p-vie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Sáb</label><input type="number" value="${prices.sabado}" class="p-sab w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Dom</label><input type="number" value="${prices.domingo}" class="p-dom w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div></div>`;
    container.appendChild(row);
}

window.addHorarioRow = function(data = null) {
    const container = document.getElementById('mgr-horarios-container'); const nombre = data ? data.nombre : ''; const start = data ? data.start : ''; const end = data ? data.end : ''; const price = data ? data.price : 0;
    const row = document.createElement('div'); row.className = "horario-row flex flex-col sm:flex-row gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200 animate-enter";
    row.innerHTML = `<input type="text" placeholder="Nombre (Ej. Turno Especial)" value="${nombre}" class="h-name w-full sm:w-1/3 border rounded p-1.5 text-xs outline-none focus:border-brand-red font-bold text-gray-700"><input type="time" value="${start}" class="h-start w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><span class="text-xs text-gray-400">a</span><input type="time" value="${end}" class="h-end w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><input type="number" placeholder="Precio $" value="${price}" class="h-price w-full sm:w-24 border rounded p-1.5 text-xs text-right outline-none focus:border-brand-red font-bold"><button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 transition px-2"><i class="fa-solid fa-trash"></i></button>`;
    container.appendChild(row);
}

window.previewImage = function(i, id){ const p = document.getElementById(id); if(i.files && i.files[0]){ const r=new FileReader(); r.onload=e=>{ p.src=e.target.result; p.classList.remove('hidden'); p.setAttribute('data-modified', 'true'); }; r.readAsDataURL(i.files[0]); } }
window.clearManagerImage = function(num) { const input = document.getElementById(`mgr-file-${num}`); if(input) input.value = ''; const img = document.getElementById(`mgr-preview-${num}`); if(img) { img.src = ''; img.classList.add('hidden'); img.setAttribute('data-modified', 'true'); } }

window.openManagerModal = function(id){
    if (!myPermissions.catalog_manage) return window.showToast("No tienes permisos.", "error"); 
    document.getElementById('mgr-id').value = id || ''; const container = document.getElementById('mgr-taxes-list'); document.querySelectorAll('.day-block-check').forEach(cb => cb.checked = false); document.querySelectorAll('.day-block-premontaje-check').forEach(cb => cb.checked = false);
    if(container) { container.innerHTML = ''; let currentTaxes = []; if(id) { const s = allSpaces.find(x => x.id === id); currentTaxes = parseIds((s && (s.impuestos_ids || s.impuestos)) || []); } dbTaxes.forEach(t => { const isChecked = currentTaxes.some(cid => String(cid) === String(t.id)) ? 'checked' : ''; container.innerHTML += `<label class="flex items-center gap-2 p-2 border rounded bg-white hover:bg-gray-50 cursor-pointer"><input type="checkbox" value="${t.id}" class="tax-check accent-brand-red cursor-pointer" ${isChecked}><span class="text-[10px] font-bold uppercase text-gray-600 cursor-pointer select-none">${t.nombre} (${t.porcentaje}%)</span></label>`; }); }

    const rangesContainer = document.getElementById('mgr-ranges-container'); rangesContainer.innerHTML = '';
    const horariosContainer = document.getElementById('mgr-horarios-container'); horariosContainer.innerHTML = '';

    if(id) { 
        const s = allSpaces.find(x => x.id === id); 
        document.getElementById('mgr-title').innerText = "Editar: " + s.nombre; document.getElementById('mgr-key').value = s.clave; document.getElementById('mgr-key').disabled = true; document.getElementById('mgr-name').value = s.nombre; document.getElementById('mgr-type').value = s.tipo; document.getElementById('mgr-desc').value = s.descripcion || ''; 
        let eTags = []; try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch(e){}
        if(!Array.isArray(eTags)) eTags = []; document.getElementById('mgr-tags').value = eTags.join(', ');

        let rules = []; try { rules = typeof s.precios_por_dia === 'string' ? JSON.parse(s.precios_por_dia) : (s.precios_por_dia || []); } catch(e){}
        if (!Array.isArray(rules) || rules.length === 0) rules = [{min: 1, max: 9999, precios: {lunes:0, martes:0, miercoles:0, jueves:0, viernes:0, sabado:0, domingo:0}}];
        rules.forEach(rule => window.addRangeRow(rule));

        let blockedDays = []; try { blockedDays = typeof s.dias_bloqueados === 'string' ? JSON.parse(s.dias_bloqueados) : (s.dias_bloqueados || []); } catch(e){}
        document.querySelectorAll('.day-block-check').forEach(cb => { if(blockedDays.includes(cb.value)) cb.checked = true; });
        let blockedPremontaje = []; try { blockedPremontaje = typeof s.dias_bloqueados_premontaje === 'string' ? JSON.parse(s.dias_bloqueados_premontaje) : (s.dias_bloqueados_premontaje || []); } catch(e){}
        document.querySelectorAll('.day-block-premontaje-check').forEach(cb => { if(blockedPremontaje.includes(cb.value)) cb.checked = true; });

        let b2b = {}; try { b2b = typeof s.config_b2b === 'string' ? JSON.parse(s.config_b2b) : (s.config_b2b || {}); } catch(e){}
        document.getElementById('cfg-precio-hora').value = b2b.precio_hora_extra || 0;
        let h = b2b.horarios || []; if (!Array.isArray(h)) { const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' }; h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k].start, end: h[k].end, price: h[k].price })).filter(item => item.start && item.end); }
        if (h.length > 0) h.forEach(item => window.addHorarioRow(item)); else window.addHorarioRow();

        document.getElementById('mgr-adj-type').value = s.ajuste_tipo || 'ninguno'; document.getElementById('mgr-adj-pct').value = s.ajuste_porcentaje || 0; document.getElementById('mgr-active').checked = s.activa !== false; document.getElementById('btn-delete-mgr').classList.remove('hidden'); 
        let allUrls = []; try { if(s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if(s.imagen_url) allUrls = [s.imagen_url]; } catch(e){}
        for(let i=1; i<=5; i++){
            const mgrPrev = document.getElementById(`mgr-preview-${i}`);
            if(mgrPrev) { 
                if(allUrls[i-1]) { mgrPrev.src = allUrls[i-1]; mgrPrev.classList.remove('hidden'); mgrPrev.removeAttribute('data-modified'); }
                else { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); } 
            }
        }
    } else { 
        document.getElementById('mgr-title').innerText = "Nuevo Espacio"; document.getElementById('mgr-key').value = ''; document.getElementById('mgr-key').disabled = false; document.getElementById('mgr-name').value = ''; document.getElementById('mgr-tags').value = ''; document.getElementById('mgr-desc').value = ''; window.addRangeRow(); window.addHorarioRow(); 
        document.getElementById('cfg-precio-hora').value = 0; document.getElementById('mgr-active').checked = true; document.getElementById('btn-delete-mgr').classList.add('hidden'); 
        for(let i=1; i<=5; i++){ const mgrPrev = document.getElementById(`mgr-preview-${i}`); if (mgrPrev) { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); } const fi = document.getElementById(`mgr-file-${i}`); if(fi) fi.value = ''; }
    } 
    window.openModal('manager-modal');
}

window.saveSpace = async function(){ 
    if (!myPermissions.catalog_manage) return; const btn = document.getElementById('btn-save-mgr'); btn.disabled = true; btn.innerText = "Guardando...";
    try {
        if (!(await cpEnsureCatalogManageSession('guardar cambios'))) return;
        const id = document.getElementById('mgr-id').value; 
        const selectedTaxes = Array.from(document.querySelectorAll('.tax-check:checked'))
            .map(cb => String(cb.value || '').trim())
            .filter(Boolean);
        const blockedDays = Array.from(document.querySelectorAll('.day-block-check:checked')).map(cb => cb.value);
        const blockedPremontajeDays = Array.from(document.querySelectorAll('.day-block-premontaje-check:checked')).map(cb => cb.value);

        const rows = document.querySelectorAll('.range-row'); let ranges = []; let maxPriceFound = 0;
        rows.forEach(row => {
            const min = parseInt(row.querySelector('.range-min').value) || 0; const max = parseInt(row.querySelector('.range-max').value) || 999999;
            const precios = { lunes: parseFloat(row.querySelector('.p-lun').value) || 0, martes: parseFloat(row.querySelector('.p-mar').value) || 0, miercoles: parseFloat(row.querySelector('.p-mie').value) || 0, jueves: parseFloat(row.querySelector('.p-jue').value) || 0, viernes: parseFloat(row.querySelector('.p-vie').value) || 0, sabado: parseFloat(row.querySelector('.p-sab').value) || 0, domingo: parseFloat(row.querySelector('.p-dom').value) || 0 };
            const localMax = Math.max(...Object.values(precios)); if(localMax > maxPriceFound) maxPriceFound = localMax; ranges.push({ min, max, precios });
        });
        
        const tagsArray = (document.getElementById('mgr-tags').value || '').split(',').map(t => t.trim()).filter(Boolean); 

        let horariosArray = []; document.querySelectorAll('.horario-row').forEach(row => { const nombre = row.querySelector('.h-name').value.trim(); const start = row.querySelector('.h-start').value; const end = row.querySelector('.h-end').value; const price = parseFloat(row.querySelector('.h-price').value) || 0; if (nombre && start && end) horariosArray.push({ nombre, start, end, price }); });
        const b2bConfig = { precio_hora_extra: parseFloat(document.getElementById('cfg-precio-hora').value) || 0, horarios: horariosArray };

        const payload = { 
            clave: document.getElementById('mgr-key').value.toUpperCase().trim(), nombre: document.getElementById('mgr-name').value, tipo: document.getElementById('mgr-type').value, descripcion: document.getElementById('mgr-desc').value, precio_base: maxPriceFound, 
            precios_por_dia: ranges, dias_bloqueados: blockedDays, dias_bloqueados_premontaje: blockedPremontajeDays, config_b2b: b2bConfig, etiquetas: tagsArray, 
            ajuste_tipo: document.getElementById('mgr-adj-type').value, ajuste_porcentaje: parseFloat(document.getElementById('mgr-adj-pct').value) || 0, activa: document.getElementById('mgr-active').checked, impuestos_ids: selectedTaxes 
        }; 
        
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
            if (Array.isArray(v) || (v && typeof v === 'object')) fd.append(k, JSON.stringify(v));
            else if (v !== undefined && v !== null) fd.append(k, String(v));
        });

        for(let i=1; i<=5; i++){
            const fi = document.getElementById(`mgr-file-${i}`);
            const preview = document.getElementById(`mgr-preview-${i}`);
            const fieldName = i === 1 ? 'imagen' : `imagen${i}`;
            if (fi && fi.files && fi.files.length > 0) fd.append(fieldName, fi.files[0], fi.files[0].name || `img${i}`);
            else if (preview && preview.getAttribute('data-modified') === 'true' && preview.classList.contains('hidden')) fd.append(fieldName, '');
        }

        await cpSaveEspacioRecord(id, fd);
        window.showToast("Guardado", "success"); window.closeModal('manager-modal'); loadCatalog(); for(let i=1; i<=5; i++){ const fi = document.getElementById(`mgr-file-${i}`); if(fi) fi.value = ''; }

    } catch(e) { console.error("Error al guardar:", e); window.showToast("Error al guardar: " + (e?.message || e), "error"); } finally { btn.disabled = false; btn.innerText = "Guardar"; }
}

// LOGICA DE FECHAS DE MONTAJE PARA CATALOG (COTIZACIÓN RÁPIDA)
window.handleMontajeInput = function(prefix) {
    const val = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    if (window.finalMontajeDates.length > val) window.finalMontajeDates = window.finalMontajeDates.slice(0, val);
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
}

window.actualizarLabelMontaje = function(prefix) {
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    if (window.finalMontajeDates.length > 0) {
        lbl.innerText = window.finalMontajeDates.map(d => window.safeFormatDate(d)).join(', ');
        lbl.classList.remove('hidden');
    } else {
        lbl.classList.add('hidden');
    }
}

window.abrirModalMontaje = function(prefix) {
    window.currentMontajePrefix = prefix;
    const diasM = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    if (diasM <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");
    
    let sDate = document.getElementById('date-start').value;
    if (!sDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    document.getElementById('montaje-limit-num').innerText = diasM;
    window.tempMontajeDates = [...window.finalMontajeDates].slice(0, diasM);
    
    const dp = document.getElementById('montaje-date-input');
    const maxD = new Date(sDate + 'T00:00:00'); 
    maxD.setDate(maxD.getDate() - 1);
    dp.max = maxD.toISOString().split('T')[0];
    dp.value = '';
    
    window.renderListaMontaje();
    document.getElementById('montaje-modal').classList.remove('hidden');
}

window.addMontajeDate = function() {
    const dp = document.getElementById('montaje-date-input');
    const dateVal = dp.value;
    if(!dateVal) return window.showToast("Selecciona una fecha.", "error");
    
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if(window.tempMontajeDates.length >= limit) return window.showToast(`Solo puedes seleccionar ${limit} día(s).`, "error");
    
    if(window.tempMontajeDates.includes(dateVal)) return window.showToast("Esta fecha ya fue agregada.", "error");
    
    const maxD = new Date(dp.max + 'T00:00:00');
    const selD = new Date(dateVal + 'T00:00:00');
    if(selD > maxD) return window.showToast("La fecha debe ser antes del evento.", "error");
    
    window.tempMontajeDates.push(dateVal);
    window.tempMontajeDates.sort();
    window.renderListaMontaje();
}

window.removeMontajeDate = function(idx) {
    window.tempMontajeDates.splice(idx, 1);
    window.renderListaMontaje();
}

window.renderListaMontaje = function() {
    const list = document.getElementById('montaje-dates-list');
    list.innerHTML = '';
    window.tempMontajeDates.forEach((d, i) => {
        list.innerHTML += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 shadow-sm"><span class="text-xs font-bold text-gray-700">${window.safeFormatDate(d)}</span><button onclick="window.removeMontajeDate(${i})" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

window.confirmMontajeDates = function() {
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if(window.tempMontajeDates.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");
    
    window.finalMontajeDates = [...window.tempMontajeDates];
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
}


window.openQuoteModal = function(id) {
    currentSpace = allSpaces.find(s => s.id === id); if (!currentSpace) return;
    document.getElementById('q-name').innerText = currentSpace.nombre; document.getElementById('q-key').innerText = currentSpace.clave; document.getElementById('q-price').innerText = "$0.00";
    let modalImg = currentSpace.imagen_url || ''; if(modalImg.startsWith('[')) { try { modalImg = JSON.parse(modalImg)[0]; } catch(e){} } document.getElementById('q-img').src = modalImg; 
    
    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(e){}
    let h = b2b.horarios || []; if (!Array.isArray(h)) { const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' }; h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k].start, end: h[k].end, price: h[k].price })).filter(item => item.start && item.end); }
    const selHorario = document.getElementById('q-horario'); selHorario.innerHTML = '';
    if (h.length > 0) h.forEach(item => { selHorario.innerHTML += `<option value="${item.nombre}" data-price="${item.price}">${item.nombre} (${item.start} a ${item.end})</option>`; }); else selHorario.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';

    const selConcept = document.getElementById('admin-concept-select'); selConcept.innerHTML = '<option value="">Selecciona servicio...</option>';
    catalogConcepts.forEach(c => { selConcept.innerHTML += `<option value="${c.id}">${c.nombre} (+$${c.precio_sugerido})</option>`; });

    document.getElementById('date-start').value = ''; document.getElementById('date-end').value = ''; 
    document.getElementById('q-guests').value = 100; document.getElementById('q-premontaje').value = 0; document.getElementById('q-horas').value = 0;
    document.getElementById('cli-name').value = ''; document.getElementById('cli-rfc').value = ''; document.getElementById('cli-phone').value = ''; document.getElementById('cli-email').value = ''; 
    
    adminSelectedConcepts = []; window.finalMontajeDates = []; window.actualizarLabelMontaje('q'); document.getElementById('q-btn-montaje').classList.add('hidden');
    window.updateAdminConceptsSummary();

    const cliSel = document.getElementById('cli-select'); if(cliSel) cliSel.value=''; const cliId = document.getElementById('cli-id'); if(cliId) cliId.value='';
	loadClientProfilesForQuoteModal(); document.getElementById('avail-msg').classList.add('hidden'); document.getElementById('btn-generate').disabled = true; window.openModal('quote-modal');
}

window.addAdminConcept = function() { const sel = document.getElementById('admin-concept-select'); const id = sel.value; if(!id) return; const concept = catalogConcepts.find(c => c.id == id); if(concept) { adminSelectedConcepts.push({ description: concept.nombre, amount: concept.precio_sugerido, value: concept.precio_sugerido, unit: 'fixed', type: 'aumento' }); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); } sel.value = ''; }
window.removeAdminConcept = function(index) { adminSelectedConcepts.splice(index, 1); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); }
window.updateAdminConceptsSummary = function() { const container = document.getElementById('admin-concepts-summary'); container.innerHTML = ''; adminSelectedConcepts.forEach((c, idx) => { container.innerHTML += `<div class="flex justify-between items-center bg-gray-50 border border-gray-100 p-2 rounded text-xs"><span class="font-bold text-gray-700">${c.description}</span><div class="flex items-center gap-3"><span class="font-black text-brand-dark">$${parseFloat(c.amount).toLocaleString()}</span><button onclick="window.removeAdminConcept(${idx})" class="text-gray-400 hover:text-red-500"><i class="fas fa-times"></i></button></div></div>`; }); }

window.updateQuoteCalculation = function() {
    if(!currentSpace) return;
    const s = document.getElementById('date-start').value; const e = document.getElementById('date-end').value; const g = document.getElementById('q-guests').value; 
    let base = 0; if (s && e) { base = calculateDayByDayTotal(currentSpace, s, e, g).total; } 

    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(ex){}
    const pMontaje = parseFloat(b2b.precio_montaje) || 0; const pHora = parseFloat(b2b.precio_hora_extra) || 0;
    const selOpt = document.getElementById('q-horario').options[document.getElementById('q-horario').selectedIndex];
    const costoHorario = selOpt ? parseFloat(selOpt.getAttribute('data-price')) || 0 : 0;
    const diasM = parseInt(document.getElementById('q-premontaje').value) || 0; const hrsE = parseInt(document.getElementById('q-horas').value) || 0;

    let subtotal = base + costoHorario + (diasM * pMontaje) + (hrsE * pHora);
    adminSelectedConcepts.forEach(c => { subtotal += parseFloat(c.amount); });

    if(currentSpace.ajuste_tipo === 'aumento') subtotal += subtotal * (currentSpace.ajuste_porcentaje/100);
    if(currentSpace.ajuste_tipo === 'descuento') subtotal -= subtotal * (currentSpace.ajuste_porcentaje/100);

    let taxAmt = 0; const sTaxes = parseIds(currentSpace.impuestos_ids || currentSpace.impuestos);
    if(sTaxes.length && dbTaxes.length) { sTaxes.forEach(tid => { const t = findCpCatalogTaxRecord(tid, currentSpace); if(t) { const rate = t.porcentaje > 1 ? t.porcentaje/100 : t.porcentaje; taxAmt += subtotal * rate; } }); }

    currentPricing = { subtotal: subtotal, taxes: taxAmt, final: subtotal + taxAmt };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
}

window.generatePDF = async function() {
    const diasM = parseInt(document.getElementById('q-premontaje').value) || 0;
    if(diasM > 0 && window.finalMontajeDates.length !== diasM) {
        return window.showToast("Faltan asignar las fechas específicas del montaje.", "error");
    }

    const cli = { name: document.getElementById('cli-name').value, rfc: document.getElementById('cli-rfc').value, phone: document.getElementById('cli-phone').value.trim(), email: document.getElementById('cli-email').value.trim() };
    if(!cli.name) return window.showToast("Falta nombre del cliente", "error"); const phoneRegex = /^\d{10}$/; if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");

    window.updateQuoteCalculation(); const guests = parseInt(document.getElementById('q-guests').value) || 1;
    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch(ex){}
    const pMontaje = parseFloat(b2b.precio_montaje) || 0; const pHora = parseFloat(b2b.precio_hora_extra) || 0;
    const selOpt = document.getElementById('q-horario').options[document.getElementById('q-horario').selectedIndex];
    const costoHorario = selOpt ? parseFloat(selOpt.getAttribute('data-price')) || 0 : 0;
    const hrsE = parseInt(document.getElementById('q-horas').value) || 0;

    let conceptosB2B = [];
    if(selOpt) conceptosB2B.push({ description: `Horario: ${selOpt.text}`, amount: costoHorario, value: costoHorario, unit: 'fixed', type: 'b2b_horario', meta: { selected: selOpt.value, custom_name: selOpt.text } });
    if(diasM > 0) conceptosB2B.push({ description: `Montaje extra (${diasM} días)${window.finalMontajeDates.length ? ' - ' + window.finalMontajeDates.map(d=>window.safeFormatDate(d)).join(', ') : ''}`, amount: (diasM * pMontaje), value: (diasM * pMontaje), unit: 'fixed', type: 'b2b_montaje', meta: { days: diasM, unit_price: pMontaje, dates: window.finalMontajeDates } });
    if(hrsE > 0) conceptosB2B.push({ description: `Horas Extras (${hrsE} hrs)`, amount: (hrsE * pHora), value: (hrsE * pHora), unit: 'fixed', type: 'b2b_horas', meta: { hours: hrsE, unit_price: pHora } });
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    const auditSingle = await cpResolveQuoteActorAudit();
    const payload = { cliente_id: (document.getElementById('cli-id') ? (document.getElementById('cli-id').value || null) : null), espacio_id: currentSpace.id, espacio_nombre: currentSpace.nombre, espacio_clave: currentSpace.clave, cliente_nombre: cli.name, cliente_rfc: cli.rfc, cliente_contacto: cli.phone, cliente_email: cli.email, fecha_inicio: document.getElementById('date-start').value, fecha_fin: document.getElementById('date-end').value, precio_final: currentPricing.final, desglose_precios: { subtotal_antes_impuestos: currentPricing.subtotal, impuestos_detalle: parseIds(currentSpace.impuestos_ids || currentSpace.impuestos), tax_total: currentPricing.taxes }, conceptos_adicionales: conceptosB2B, status: 'pendiente', creado_por: auditSingle.actorId || null, creado_por_nombre: auditSingle.actorName, modificado_por: auditSingle.actorId || null, modificado_por_nombre: auditSingle.actorName, personas: guests };
    
    const { error, id: createdQuoteId } = await cpCreateQuoteRecord(payload);
    if (error) {
        return window.showToast(`Error al guardar: ${error.message || error}`, "error");
    }
    const targetUrl = createdQuoteId ? `order_detail.html?quote=${encodeURIComponent(createdQuoteId)}` : 'orders.html';
    window.showToast("Cotización Creada");
    setTimeout(() => { cpNavigateSafely(targetUrl); }, 900);
}

window.filterCatalogLogic = function() { const term = document.getElementById('cat-search').value.toLowerCase(); const type = document.getElementById('cat-filter-type').value; const sort = document.getElementById('cat-sort').value; let filtered = allSpaces.filter(s => (s.nombre.toLowerCase().includes(term) || s.clave.toLowerCase().includes(term)) && (type === 'all' || s.tipo === type)); if (sort === 'price_asc') filtered.sort((a,b) => a.precio_base - b.precio_base); if (sort === 'price_desc') filtered.sort((a,b) => b.precio_base - a.precio_base); renderSpaces(filtered); }
window.previewImage = function(i, id){ const p = document.getElementById(id || 'mgr-preview'); if(i.files && i.files[0]){ const r=new FileReader(); r.onload=e=>{ p.src=e.target.result; p.classList.remove('hidden'); p.setAttribute('data-modified', 'true'); }; r.readAsDataURL(i.files[0]); } }
window.checkAvailability = async function() { const s=document.getElementById('date-start').value, e=document.getElementById('date-end').value; if(!s||!e)return; const {data} = await window.tenantPocketBase.from('cotizaciones').select('id').eq('espacio_id',currentSpace.id).in('status',['aprobada','finalizada']).or(`and(fecha_inicio.lte.${e},fecha_fin.gte.${s})`); const msg=document.getElementById('avail-msg'); msg.classList.remove('hidden'); if(data.length){ msg.innerText='OCUPADO'; msg.className='text-red-500 font-bold text-center'; document.getElementById('btn-generate').disabled=true; }else{ msg.innerText='DISPONIBLE'; msg.className='text-green-600 font-bold text-center'; document.getElementById('btn-generate').disabled=false; } }
window.askDeleteSpace = async function(){ window.openConfirm("¿Eliminar espacio?", async () => { try { if (!(await cpEnsureCatalogManageSession('eliminar el espacio'))) return; await cpDeleteEspacioRecord(document.getElementById('mgr-id').value); window.showToast("Eliminado"); window.closeModal('manager-modal'); loadCatalog(); } catch(e) { console.error(e); window.showToast("Error al eliminar: " + (e?.message || e), "error"); } }); }

// =========================================================================
// EXTENSIÓN 2026: MULTI-ESPACIO + PREMONTAJE 25% DÍA BASE + BLOQUEO CRUZADO
// =========================================================================
const __CP_RESERVATION_STATUSES = ['pendiente', 'aprobada', 'finalizada'];
const __CP_RESERVATION_CACHE_MS = 10000;
let __cpQuoteSpaces = [];
let __cpActiveSpaceId = null;
let __cpReservationsCache = null;
let __cpReservationsAt = 0;

function __cpSafeArray(v){
    if(!v) return [];
    if(Array.isArray(v)) return v;
    if(typeof v === 'string'){ try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch(e){ return []; } }
    return [];
}
function __cpSafeObject(v){
    if(!v) return {};
    if(typeof v === 'object') return v;
    if(typeof v === 'string'){ try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch(e){ return {}; } }
    return {};
}
function __cpNormalizeDate(v){ const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function __cpDatesBetween(startStr, endStr){
    const s = __cpNormalizeDate(startStr), e = __cpNormalizeDate(endStr || startStr);
    if(!s || !e) return [];
    const start = new Date(`${s}T00:00:00`), end = new Date(`${e}T00:00:00`);
    if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)){
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${day}`);
    }
    return out;
}
function __cpGetSpaceById(spaceId){ return allSpaces.find(s => String(s.id) === String(spaceId)) || null; }
function __cpB2B(space){ return __cpSafeObject(space?.config_b2b); }
function __cpCalcPremCost(space, cfg){
    const dates = __cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean).sort();
    const guests = parseInt(cfg.guests, 10) || 1;
    const courtesyDays = Math.max(0, parseInt(cfg.premontajeCourtesyDays, 10) || 0);
    const breakdown = [];
    let total = 0;
    dates.forEach((ds, idx) => {
        const base = calculateDayByDayTotal(space, ds, ds, guests, { ignoreBlocks: true }).total || 0;
        const amount = idx < courtesyDays ? 0 : base * (getPremontajePct() / 100);
        total += amount;
        breakdown.push({ date: ds, base_day: base, porcentaje: getPremontajePct(), courtesy: idx < courtesyDays, amount });
    });
    return { total, breakdown };
}
function __cpCreateSpaceCfg(spaceId, seed = {}){
    const space = __cpGetSpaceById(spaceId);
    const b2b = __cpB2B(space);
    const h = __cpSafeArray(b2b.horarios);
    return {
        spaceId: String(spaceId),
        startDate: __cpNormalizeDate(seed.startDate || ''),
        endDate: __cpNormalizeDate(seed.endDate || ''),
        guests: parseInt(seed.guests, 10) || 100,
        horarioValue: seed.horarioValue || (h[0]?.nombre || ''),
        horarioText: seed.horarioText || '',
        horarioPrice: parseFloat(seed.horarioPrice || h[0]?.price || 0),
        premontajeDays: parseInt(seed.premontajeDays, 10) || 0,
        premontajeDates: __cpSafeArray(seed.premontajeDates),
        premontajeCourtesyDays: parseInt(seed.premontajeCourtesyDays, 10) || 0,
        horasExtra: parseInt(seed.horasExtra, 10) || 0
    };
}
function __cpGetActiveCfg(){ return __cpQuoteSpaces.find(x => String(x.spaceId) === String(__cpActiveSpaceId)) || null; }
function __cpSaveActiveCfgFromForm(){
    const cfg = __cpGetActiveCfg(); if(!cfg) return;
    cfg.startDate = __cpNormalizeDate(document.getElementById('date-start')?.value || '');
    cfg.endDate = __cpNormalizeDate(document.getElementById('date-end')?.value || '');
    cfg.guests = parseInt(document.getElementById('q-guests')?.value, 10) || 100;
    cfg.premontajeDays = parseInt(document.getElementById('q-premontaje')?.value, 10) || 0;
    cfg.premontajeCourtesyDays = Math.max(0, parseInt(document.getElementById('q-premontaje-cortesia')?.value, 10) || 0);
    cfg.horasExtra = parseInt(document.getElementById('q-horas')?.value, 10) || 0;
    cfg.premontajeDates = (__cpSafeArray(window.finalMontajeDates) || []).slice(0, cfg.premontajeDays);
    if(cfg.premontajeCourtesyDays > cfg.premontajeDays) cfg.premontajeCourtesyDays = cfg.premontajeDays;
    const sel = document.getElementById('q-horario');
    const opt = sel?.options?.[sel.selectedIndex];
    cfg.horarioValue = sel?.value || '';
    cfg.horarioText = opt?.text || '';
    cfg.horarioPrice = parseFloat(opt?.getAttribute('data-price') || 0);
}
function __cpSetHeader(space){
    if(!space) return;
    document.getElementById('q-name').innerText = space.nombre || 'Espacio';
    document.getElementById('q-key').innerText = space.clave || '--';
    let modalImg = space.imagen_url || '';
    if(typeof modalImg === 'string' && modalImg.startsWith('[')){ try { modalImg = JSON.parse(modalImg)[0]; } catch(e){} }
    document.getElementById('q-img').src = modalImg || '../../assets/img/no-image.svg';
}
function __cpRenderHorario(space, selectedValue = ''){
    const b2b = __cpB2B(space);
    let h = __cpSafeArray(b2b.horarios);
    if(!h.length && b2b.horarios && typeof b2b.horarios === 'object'){
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(b2b.horarios).map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end, price: b2b.horarios[k]?.price })).filter(item => item.start && item.end);
    }
    const sel = document.getElementById('q-horario');
    sel.innerHTML = '';
    if(h.length) h.forEach(item => { sel.innerHTML += `<option value="${item.nombre}" data-price="${parseFloat(item.price || 0)}">${item.nombre} (${item.start} a ${item.end})</option>`; });
    else sel.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';
    if(selectedValue){
        const found = Array.from(sel.options).find(opt => opt.value === selectedValue);
        if(found) sel.value = selectedValue;
    }
}
function __cpRenderSpaceAddSelect(){
    const sel = document.getElementById('q-space-add');
    if(!sel) return;
    const selectedIds = new Set(__cpQuoteSpaces.map(q => String(q.spaceId)));
    sel.innerHTML = '<option value="">Selecciona espacio...</option>';
    allSpaces.forEach(space => {
        const disabled = selectedIds.has(String(space.id)) ? 'disabled' : '';
        sel.innerHTML += `<option value="${space.id}" ${disabled}>${space.nombre}</option>`;
    });
}
function __cpRenderSpaceTabs(){
    const container = document.getElementById('q-spaces-tabs');
    if(!container) return;
    container.innerHTML = '';
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        const active = String(cfg.spaceId) === String(__cpActiveSpaceId);
        const classes = active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-red';
        container.innerHTML += `<div class="flex items-center border rounded-full ${classes}">
            <button onclick="window.selectQuoteSpace('${cfg.spaceId}')" class="px-3 py-1.5 text-[10px] font-bold uppercase">${space?.nombre || cfg.spaceId}</button>
            ${__cpQuoteSpaces.length > 1 ? `<button onclick="window.removeQuoteSpaceFromQuote('${cfg.spaceId}')" class="pr-2 text-[10px]"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
    });
}
function __cpLoadActiveCfgToForm(){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    currentSpace = __cpGetSpaceById(cfg.spaceId);
    __cpSetHeader(currentSpace);
    __cpRenderHorario(currentSpace, cfg.horarioValue);
    document.getElementById('date-start').value = cfg.startDate || '';
    document.getElementById('date-end').value = cfg.endDate || '';
    document.getElementById('q-guests').value = cfg.guests || 100;
    document.getElementById('q-premontaje').value = cfg.premontajeDays || 0;
    document.getElementById('q-premontaje-cortesia').value = cfg.premontajeCourtesyDays || 0;
    document.getElementById('q-horas').value = cfg.horasExtra || 0;
    window.finalMontajeDates = __cpSafeArray(cfg.premontajeDates).slice();
    window.handleMontajeInput('q');
}
function __cpBuildReservationsMap(rows){
    const map = new Map();
    const addDate = (spaceId, dateStr) => {
        const sid = String(spaceId || '').trim();
        const ds = __cpNormalizeDate(dateStr);
        if(!sid || !ds) return;
        if(!map.has(sid)) map.set(sid, new Set());
        map.get(sid).add(ds);
    };
    const addRange = (spaceId, startStr, endStr) => { __cpDatesBetween(startStr, endStr).forEach(d => addDate(spaceId, d)); };
    const addConceptMontaje = (spaceIdDefault, conceptos) => {
        __cpSafeArray(conceptos).forEach(c => {
            if(String(c?.type || '').toLowerCase().trim() !== 'b2b_montaje') return;
            const meta = __cpSafeObject(c.meta);
            const sid = meta.space_id || spaceIdDefault;
            __cpSafeArray(meta.dates).forEach(d => addDate(sid, d));
        });
    };
    (rows || []).forEach(order => {
        const details = __cpSafeArray(order.espacios_detalle);
        if(details.length){
            details.forEach(item => {
                const sid = item.espacio_id || item.space_id;
                addRange(sid, item.fecha_inicio, item.fecha_fin);
                __cpSafeArray(item.premontaje_fechas).forEach(d => addDate(sid, d));
                addConceptMontaje(sid, item.conceptos_adicionales);
            });
        } else if(order.espacio_id){
            addRange(order.espacio_id, order.fecha_inicio, order.fecha_fin);
            addConceptMontaje(order.espacio_id, order.conceptos_adicionales);
        }
    });
    return map;
}
async function __cpGetReservations(force = false){
    const now = Date.now();
    if(!force && __cpReservationsCache && (now - __cpReservationsAt <= __CP_RESERVATION_CACHE_MS)) return __cpReservationsCache;
    let rows = [];
    let query = await window.tenantPocketBase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales,espacios_detalle').in('status', __CP_RESERVATION_STATUSES);
    if(query.error){
        const fallback = await window.tenantPocketBase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales').in('status', __CP_RESERVATION_STATUSES);
        if(!fallback.error) rows = fallback.data || [];
    } else {
        rows = query.data || [];
    }
    __cpReservationsCache = __cpBuildReservationsMap(rows);
    __cpReservationsAt = now;
    return __cpReservationsCache;
}
async function __cpEvalAvailability(force = false){
    const map = await __cpGetReservations(force);
    const bySpace = {};
    __cpQuoteSpaces.forEach(cfg => {
        const sid = String(cfg.spaceId);
        const reserved = map.get(sid) || new Set();
        const needed = [...__cpDatesBetween(cfg.startDate, cfg.endDate), ...__cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean)];
        const conflicts = needed.filter(d => reserved.has(d));
        bySpace[sid] = { available: conflicts.length === 0, conflicts };
    });
    return bySpace;
}

window.selectQuoteSpace = function(spaceId){
    __cpSaveActiveCfgFromForm();
    __cpActiveSpaceId = String(spaceId);
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.addSpaceToQuote = function(){
    const sel = document.getElementById('q-space-add');
    const newId = sel?.value;
    if(!newId || __cpQuoteSpaces.some(x => String(x.spaceId) === String(newId))) return;
    __cpSaveActiveCfgFromForm();
    const active = __cpGetActiveCfg();
    const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
    __cpQuoteSpaces.push(__cpCreateSpaceCfg(newId, seed));
    __cpActiveSpaceId = String(newId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.removeQuoteSpaceFromQuote = function(spaceId){
    if(__cpQuoteSpaces.length <= 1) return;
    __cpSaveActiveCfgFromForm();
    __cpQuoteSpaces = __cpQuoteSpaces.filter(x => String(x.spaceId) !== String(spaceId));
    if(String(__cpActiveSpaceId) === String(spaceId) && __cpQuoteSpaces.length) __cpActiveSpaceId = String(__cpQuoteSpaces[0].spaceId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
}

window.handleMontajeInput = function(prefix){
    const cfg = __cpGetActiveCfg(); if(!cfg) return;
    const val = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if(val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    cfg.premontajeDays = val;
    cfg.premontajeDates = __cpSafeArray(cfg.premontajeDates).slice(0, val);
    const courtesyInput = document.getElementById(prefix + '-premontaje-cortesia');
    const courtesyVal = Math.max(0, parseInt(courtesyInput?.value, 10) || 0);
    cfg.premontajeCourtesyDays = Math.min(courtesyVal, val);
    if(courtesyInput) courtesyInput.value = cfg.premontajeCourtesyDays;
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.actualizarLabelMontaje = function(prefix){
    const cfg = __cpGetActiveCfg();
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    const dates = __cpSafeArray(cfg?.premontajeDates || []);
    if(dates.length > 0){ lbl.innerText = dates.map(d => window.safeFormatDate(d)).join(', '); lbl.classList.remove('hidden'); }
    else lbl.classList.add('hidden');
}
window.abrirModalMontaje = function(prefix){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    window.currentMontajePrefix = prefix;
    const diasM = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    if(diasM <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");
    if(!cfg.startDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");
    document.getElementById('montaje-limit-num').innerText = diasM;
    window.tempMontajeDates = __cpSafeArray(cfg.premontajeDates).slice(0, diasM);
    const dp = document.getElementById('montaje-date-input');
    const maxD = new Date(`${cfg.startDate}T00:00:00`); maxD.setDate(maxD.getDate() - 1);
    dp.max = maxD.toISOString().split('T')[0];
    dp.value = '';
    window.renderListaMontaje();
    document.getElementById('montaje-modal').classList.remove('hidden');
}
window.addMontajeDate = async function(){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    const dp = document.getElementById('montaje-date-input');
    const dateVal = dp.value;
    if(!dateVal) return window.showToast("Selecciona una fecha.", "error");
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value, 10) || 0;
    if(window.tempMontajeDates.includes(dateVal)) return window.showToast("Esa fecha ya fue agregada.", "error");
    if(window.tempMontajeDates.length >= limit) return window.showToast(`Solo puedes seleccionar ${limit} día(s).`, "error");
    const maxD = new Date(dp.max + 'T00:00:00');
    const selD = new Date(dateVal + 'T00:00:00');
    if(selD > maxD) return window.showToast("La fecha debe ser antes del evento.", "error");
    const reservations = await __cpGetReservations();
    const reserved = reservations.get(String(cfg.spaceId)) || new Set();
    if(reserved.has(dateVal)) return window.showToast("La fecha está ocupada para ese espacio.", "error");
    window.tempMontajeDates.push(dateVal);
    window.tempMontajeDates.sort();
    window.renderListaMontaje();
}
window.removeMontajeDate = function(idx){ window.tempMontajeDates.splice(idx, 1); window.renderListaMontaje(); }
window.renderListaMontaje = function(){
    const list = document.getElementById('montaje-dates-list');
    list.innerHTML = '';
    window.tempMontajeDates.forEach((d, i) => {
        list.innerHTML += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 shadow-sm"><span class="text-xs font-bold text-gray-700">${window.safeFormatDate(d)}</span><button onclick="window.removeMontajeDate(${i})" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}
window.confirmMontajeDates = function(){
    const cfg = __cpGetActiveCfg();
    if(!cfg) return;
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value, 10) || 0;
    if(window.tempMontajeDates.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");
    cfg.premontajeDates = window.tempMontajeDates.slice();
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
    window.updateQuoteCalculation();
    window.checkAvailability();
}

const __oldLoadCatalog = loadCatalog;
loadCatalog = async function(){
    await __oldLoadCatalog();
    if (IS_QUOTE_PAGE) __cpRenderSpaceAddSelect();
};

window.openQuoteModal = function(id){
    if (!IS_QUOTE_PAGE) {
        cpNavigateSafely(`cotizacion.html?space=${encodeURIComponent(id)}`);
        return;
    }
    const space = __cpGetSpaceById(id);
    if(!space) return;
    __cpQuoteSpaces = [__cpCreateSpaceCfg(id)];
    __cpActiveSpaceId = String(id);
    currentSpace = space;
    adminSelectedConcepts = [];
    window.updateAdminConceptsSummary();
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    const selConcept = document.getElementById('admin-concept-select');
    selConcept.innerHTML = '<option value="">Selecciona servicio...</option>';
    catalogConcepts.forEach(c => { selConcept.innerHTML += `<option value="${c.id}">${c.nombre} (+$${c.precio_sugerido})</option>`; });
    document.getElementById('q-price').innerText = '$0.00';
    const quoteName = document.getElementById('q-quote-name');
    if (quoteName) quoteName.value = '';
    document.getElementById('cli-name').value = ''; document.getElementById('cli-rfc').value = ''; document.getElementById('cli-phone').value = ''; document.getElementById('cli-email').value = '';
    const cliSel = document.getElementById('cli-select'); if(cliSel) cliSel.value = '';
    const cliId = document.getElementById('cli-id'); if(cliId) cliId.value = '';
    loadClientProfilesForQuoteModal();
    document.getElementById('avail-msg').classList.add('hidden');
    document.getElementById('btn-generate').disabled = true;
    window.openModal('quote-modal');
};

window.updateQuoteCalculation = function(){
    __cpSaveActiveCfgFromForm();
    const spacesPricing = [];
    let subtotal = 0, taxesTotal = 0;
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        if(!space) return;
        const guests = parseInt(cfg.guests, 10) || 1;
        const maxCapacity = getSpaceMaxCapacity(space);
        const capacityOk = !(maxCapacity < 999999 && guests > maxCapacity);
        const base = (cfg.startDate && cfg.endDate) ? calculateDayByDayTotal(space, cfg.startDate, cfg.endDate, guests).total : 0;
        const b2b = __cpB2B(space);
        const horaUnit = parseFloat(b2b.precio_hora_extra || 0);
        const horarioCost = parseFloat(cfg.horarioPrice || 0);
        const prem = __cpCalcPremCost(space, cfg);
        const horasCost = (parseInt(cfg.horasExtra, 10) || 0) * horaUnit;
        let subSpace = 0;
        if (capacityOk) {
            subSpace = base + horarioCost + prem.total + horasCost;
            if(space.ajuste_tipo === 'aumento') subSpace += subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
            if(space.ajuste_tipo === 'descuento') subSpace -= subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
        }
        let spaceTaxTotal = 0;
        const taxIds = parseIds(space.impuestos_ids || space.impuestos);
        taxIds.forEach(tid => { const t = findCpCatalogTaxRecord(tid, space); if(t){ const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0); spaceTaxTotal += subSpace * rate; } });
        subtotal += subSpace; taxesTotal += spaceTaxTotal;
        spacesPricing.push({ spaceId: space.id, spaceName: space.nombre, spaceKey: space.clave, startDate: cfg.startDate, endDate: cfg.endDate, guests, maxCapacity, capacityOk, horarioValue: cfg.horarioValue, horarioText: cfg.horarioText || cfg.horarioValue || '', horarioCost, premontajeDays: parseInt(cfg.premontajeDays, 10) || 0, premontajeCourtesyDays: parseInt(cfg.premontajeCourtesyDays, 10) || 0, premontajeDates: __cpSafeArray(cfg.premontajeDates), premontajeCost: prem.total, premontajeBreakdown: prem.breakdown, horasExtra: parseInt(cfg.horasExtra, 10) || 0, horasExtraUnit: horaUnit, horasExtraCost: horasCost, subtotalBeforeTax: subSpace, taxIds, taxTotal: spaceTaxTotal });
    });
    let adminConceptTotal = 0; adminSelectedConcepts.forEach(c => { adminConceptTotal += parseFloat(c.amount || 0); });
    subtotal += adminConceptTotal;
    if (adminConceptTotal > 0 && spacesPricing.length > 0) {
        const firstTaxes = spacesPricing[0].taxIds || [];
        firstTaxes.forEach(tid => {
            const t = findCpCatalogTaxRecord(tid, { tenant: resolveCpCatalogTenantSlug() });
            if (!t) return;
            const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0);
            taxesTotal += adminConceptTotal * rate;
        });
    }
    currentPricing = { subtotal, taxes: taxesTotal, final: subtotal + taxesTotal, spaces: spacesPricing, adminConceptTotal };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
}

window.checkAvailability = async function(){
    __cpSaveActiveCfgFromForm();
    const msg = document.getElementById('avail-msg');
    const btn = document.getElementById('btn-generate');
    const activeCfg = __cpGetActiveCfg();
    if(!activeCfg){ btn.disabled = true; msg.classList.add('hidden'); return; }
    const allRequired = __cpQuoteSpaces.every(cfg => { if(!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    const allCapacityOk = __cpQuoteSpaces.every(cfg => {
        const sp = __cpGetSpaceById(cfg.spaceId);
        if (!sp) return false;
        const maxCap = getSpaceMaxCapacity(sp);
        const guests = parseInt(cfg.guests, 10) || 0;
        return !(maxCap < 999999 && guests > maxCap);
    });
    const availability = await __cpEvalAvailability();
    const allAvailable = __cpQuoteSpaces.every(cfg => availability[String(cfg.spaceId)]?.available !== false);
    const activeAvailable = availability[String(activeCfg.spaceId)]?.available !== false;
    msg.classList.remove('hidden');
    if(!allCapacityOk){
        msg.innerText = 'AFORO EXCEDIDO EN UNO O MÁS ESPACIOS';
        msg.className = 'text-red-500 font-bold text-center';
    } else if(activeAvailable && allAvailable){
        msg.innerText = __cpQuoteSpaces.length > 1 ? 'DISPONIBLE EN TODOS LOS ESPACIOS' : 'DISPONIBLE';
        msg.className = 'text-green-600 font-bold text-center';
    } else {
        msg.innerText = activeAvailable ? 'OTRO ESPACIO ESTÁ OCUPADO' : 'OCUPADO';
        msg.className = 'text-red-500 font-bold text-center';
    }
    btn.disabled = !(allRequired && allAvailable && allCapacityOk);
}

window.generatePDF = async function(){
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    await window.checkAvailability();
    const allRequired = __cpQuoteSpaces.every(cfg => { if(!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    if(!allRequired) return window.showToast("Completa fechas y premontajes de todos los espacios.", "error");
    const availability = await __cpEvalAvailability(true);
    const allAvailable = __cpQuoteSpaces.every(cfg => availability[String(cfg.spaceId)]?.available !== false);
    if(!allAvailable) return window.showToast("Hay espacios o fechas ocupadas. Ajusta tu selección.", "error");
    const spaces = currentPricing.spaces || [];
    const invalidCapacity = spaces.find(sp => sp.capacityOk === false);
    if(invalidCapacity) return window.showToast(`El aforo para ${invalidCapacity.spaceName} excede su capacidad máxima.`, "error");
    const cli = { name: document.getElementById('cli-name').value, rfc: document.getElementById('cli-rfc').value, phone: document.getElementById('cli-phone').value.trim(), email: document.getElementById('cli-email').value.trim() };
    if(!cli.name) return window.showToast("Falta nombre del cliente", "error");
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");
    if(!spaces.length) return window.showToast("No hay espacios configurados.", "error");
    const quoteNameInput = document.getElementById('q-quote-name');
    const quoteNameRaw = (quoteNameInput?.value || '').trim();
    const quoteName = quoteNameRaw || `${cli.name} - ${spaces.map(s => s.spaceName).join(' + ')}`;

    const conceptosB2B = [];
    const espaciosDetalle = spaces.map(sp => {
        if(sp.horarioText){
            conceptosB2B.push({ description: `[${sp.spaceName}] Horario: ${sp.horarioText}`, amount: sp.horarioCost, value: sp.horarioCost, unit: 'fixed', type: 'b2b_horario', meta: { space_id: sp.spaceId, selected: sp.horarioValue, custom_name: sp.horarioText } });
        }
        if(sp.premontajeDays > 0){
            const courtesy = parseInt(sp.premontajeCourtesyDays, 10) || 0;
            conceptosB2B.push({ description: `[${sp.spaceName}] Premontaje (${sp.premontajeDays} días) - ${sp.premontajeDates.map(d => window.safeFormatDate(d)).join(', ')}${courtesy > 0 ? ` [${courtesy} cortesía]` : ''}`, amount: sp.premontajeCost, value: sp.premontajeCost, unit: 'fixed', type: 'b2b_montaje', meta: { space_id: sp.spaceId, days: sp.premontajeDays, courtesy_days: courtesy, dates: sp.premontajeDates, percentage: getPremontajePct(), per_day_base: sp.premontajeBreakdown } });
        }
        if(sp.horasExtra > 0){
            conceptosB2B.push({ description: `[${sp.spaceName}] Horas Extras (${sp.horasExtra} hrs)`, amount: sp.horasExtraCost, value: sp.horasExtraCost, unit: 'fixed', type: 'b2b_horas', meta: { space_id: sp.spaceId, hours: sp.horasExtra, unit_price: sp.horasExtraUnit } });
        }
        return { espacio_id: sp.spaceId, espacio_nombre: sp.spaceName, espacio_clave: sp.spaceKey, fecha_inicio: sp.startDate, fecha_fin: sp.endDate, personas: sp.guests, horario: { value: sp.horarioValue, label: sp.horarioText, amount: sp.horarioCost }, premontaje_dias: sp.premontajeDays, premontaje_cortesia_dias: sp.premontajeCourtesyDays || 0, premontaje_fechas: sp.premontajeDates, premontaje_total: sp.premontajeCost, premontaje_detalle: sp.premontajeBreakdown, horas_extra: sp.horasExtra, horas_extra_unitario: sp.horasExtraUnit, horas_extra_total: sp.horasExtraCost, subtotal_espacio: sp.subtotalBeforeTax, impuestos_ids: sp.taxIds, impuestos_total: sp.taxTotal };
    });
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    const first = spaces[0];
    const startDates = spaces.map(s => s.startDate).filter(Boolean).sort();
    const endDates = spaces.map(s => s.endDate).filter(Boolean).sort();
    const minStart = startDates[0] || '';
    const maxEnd = endDates[endDates.length - 1] || '';
    const maxGuests = Math.max(...spaces.map(s => parseInt(s.guests, 10) || 0), 0);
    const taxIdsUnion = Array.from(new Set(spaces.flatMap(s => s.taxIds || []).map(x => String(x))));
    const auditMulti = await cpResolveQuoteActorAudit();
    const payload = { cliente_id: (document.getElementById('cli-id') ? (document.getElementById('cli-id').value || null) : null), nombre_cotizacion: quoteName, espacio_id: first.spaceId, espacio_nombre: spaces.length === 1 ? first.spaceName : `${first.spaceName} + ${spaces.length - 1} espacio(s)`, espacio_clave: spaces.length === 1 ? first.spaceKey : 'MULTI', cliente_nombre: cli.name, cliente_rfc: cli.rfc, cliente_contacto: cli.phone, cliente_email: cli.email, fecha_inicio: minStart, fecha_fin: maxEnd, precio_final: currentPricing.final, desglose_precios: { subtotal_antes_impuestos: currentPricing.subtotal, impuestos_detalle: taxIdsUnion, tax_total: currentPricing.taxes, espacios: espaciosDetalle }, detalles_evento: { multi_espacio: spaces.length > 1, total_espacios: spaces.length, nombre_cotizacion: quoteName }, espacios_detalle: espaciosDetalle, conceptos_adicionales: conceptosB2B, status: 'pendiente', creado_por: auditMulti.actorId || null, creado_por_nombre: auditMulti.actorName, modificado_por: auditMulti.actorId || null, modificado_por_nombre: auditMulti.actorName, personas: maxGuests || 1 };
    const { error, id: createdQuoteId } = await cpCreateQuoteRecord(payload);
    if(error){
        console.error(error);
        if (String(error.message || '').toLowerCase().includes('espacios_detalle')) {
            return window.showToast('Falta aplicar migración de BD para multi-espacio.', 'error');
        }
        return window.showToast(`Error al guardar: ${error.message}`, "error");
    }
    __cpReservationsCache = null; __cpReservationsAt = 0;
    window.showToast("Cotización Creada");
    const targetUrl = createdQuoteId ? `order_detail.html?quote=${encodeURIComponent(createdQuoteId)}` : 'orders.html';
    setTimeout(() => { cpNavigateSafely(targetUrl); }, 900);
}






