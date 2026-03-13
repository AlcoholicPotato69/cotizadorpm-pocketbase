
// =========================================================================
// MÓDULO DE COTIZACIONES ADMIN - PLAZA MAYOR
// =========================================================================
let orderClientProfiles = []; let orderClientProfilesById = {};

async function loadClientProfilesForOrderModal() {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel || !window.tenantPocketBase) return;

    try {
        const { data, error } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,telefono,correo,rfc').order('nombre_completo', { ascending: true });
        if (error) throw error;
        orderClientProfiles = data || []; orderClientProfilesById = {}; orderClientProfiles.forEach(c => orderClientProfilesById[c.id] = c);
        const current = sel.value;
        sel.innerHTML = '<option value="">— Sin perfil —</option>' + orderClientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()}</option>`).join('');
        if (current) sel.value = current;

        sel.onchange = () => {
            const id = sel.value; if (!id) { if (hid) hid.value = ''; return; }
            const c = orderClientProfilesById[id]; if (!c) return;
            if (hid) hid.value = id;
            if(document.getElementById('oed-client')) document.getElementById('oed-client').value = c.nombre_completo || '';
            if(document.getElementById('oed-phone')) document.getElementById('oed-phone').value = (c.telefono || '');
            if(document.getElementById('oed-email')) document.getElementById('oed-email').value = (c.correo || '');
            if(document.getElementById('fiscal-rfc-re')) document.getElementById('fiscal-rfc-re').value = (c.rfc || '');
        };
        const clearAssoc = () => { if (sel.value) sel.value = ''; if (hid) hid.value = ''; };
        ['oed-client','oed-phone','oed-email','fiscal-rfc-re'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', clearAssoc); });
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

const _p = (window.location.pathname || '') + ' ' + (window.location.href || '');
const _isCP = /\/cotizadorcp(\/|$)/.test(window.location.pathname || '') || _p.includes('cotizadorcp');
const COMPANY_LOGO_URL = _isCP ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../../assets/logocp.png') : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../../assets/logo.png');
let __PM_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
const __PM_PDF_PAGE_WIDTH_PX = 816;
const __PM_PDF_PAGE_HEIGHT_PX = 1056;
const __PM_LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const __PM_LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const __PM_LETTERHEAD_MARGINS_DESIGN_PX = { top: 150, right: 45, bottom: 85, left: 45 };
const __PM_PDF_CONTENT_BASE_WIDTH_PX = 816;
const __PM_CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __PM_LETTERHEAD_PATH = 'membretes_pdf';
let PB_URL = '';
let PB_KEY = '';
let FIN_SCHEMA = 'finanzas';
let __pmPdfRenderWarmPromise = null;
const __pmPdfWarmImageCache = new Set();

function __pmSyncHubRuntimeConfig() {
    PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
    PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
    FIN_SCHEMA = (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA)
        ? TENANT_SCHEMA
        : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_PLAZA_MAYOR || 'finanzas');
}

__pmSyncHubRuntimeConfig();

function __pmCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __pmBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function __pmLoadLetterheadConfig() {
    __PM_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('*')
            .eq('clave', __PM_CFG_LETTERHEAD_KEY)
            .maybeSingle();
        if (error || !data) return;
        const cfg = data.valor_json || {};
        const rawPath = cfg.path || cfg.file_path || cfg.value || '';
        const safePath = rawPath || (cfg.file_name ? `${__PM_LETTERHEAD_PATH}/${cfg.file_name}` : '');
        if (!safePath) return;
        const { data: signed, error: signedError } = await window.globalPocketBase.storage.from('documentos').createSignedUrl(safePath, 3600);
        if (!signedError && signed?.signedUrl) {
            __PM_LETTERHEAD_URL = signed.signedUrl;
            return;
        }
        const fallbackName = __pmBasename(safePath);
        if (fallbackName) {
            const fallbackPath = `${__PM_LETTERHEAD_PATH}/${fallbackName}`;
            const { data: fallbackSigned, error: fallbackErr } = await window.globalPocketBase.storage.from('documentos').createSignedUrl(fallbackPath, 3600);
            if (!fallbackErr && fallbackSigned?.signedUrl) __PM_LETTERHEAD_URL = fallbackSigned.signedUrl;
        }
    } catch (_) {}
}

function __pmLetterheadFrame() {
    return {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: __PM_PDF_PAGE_WIDTH_PX,
        height: __PM_PDF_PAGE_HEIGHT_PX
    };
}

function __pmContentBaseHeightPx() {
    const frame = __pmLetterheadFrame();
    if (!frame.width || !frame.height) return 945;
    return (__PM_PDF_CONTENT_BASE_WIDTH_PX * frame.height) / frame.width;
}

function __pmWrapLetterheadPage(innerHtml, options = {}) {
    const frame = __pmLetterheadFrame();
    const baseWidth = Math.max(1, parseFloat(options.baseWidth) || __PM_PDF_PAGE_WIDTH_PX);
    const baseHeight = Math.max(1, parseFloat(options.baseHeight) || __PM_PDF_PAGE_HEIGHT_PX);
    const scale = Math.min(frame.width / baseWidth, frame.height / baseHeight);
    const finalW = baseWidth * scale;
    const finalH = baseHeight * scale;
    const left = frame.left + ((frame.width - finalW) / 2);
    const top = frame.top + ((frame.height - finalH) / 2);
    const bgUrl = __pmCssSafeUrl(__PM_LETTERHEAD_URL);
    const imageLayer = bgUrl
        ? `<img src='${bgUrl}' crossorigin='anonymous' onerror='this.style.display=\"none\"' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
    return `<div style="position:relative;width:${__PM_PDF_PAGE_WIDTH_PX}px;height:${__PM_PDF_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:hidden;background:#f5f5f5;">${imageLayer}<div style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:hidden;z-index:1;">${innerHtml}</div></div>`;
}

const STATUS_LEVEL = { 'pendiente': 0, 'rechazada': 0, 'aprobada': 1, 'finalizada': 2 };
const PM_ORDERS_PAGE_MODE = window.__PM_ORDERS_MODE || 'list';
const IS_PM_ORDER_DETAIL_PAGE = PM_ORDERS_PAGE_MODE === 'detail';
const PM_ORDERS_REFRESH_KEY = 'pm_orders_refresh_signal';

let allOrders = [], allSpaces = [], catalogConcepts = [], dbTaxes = [], currentPreviewOrder = null;
let currentConcepts = []; 
let myPermissions = { access: false, orders_edit: false };
let currentUserProfile = null;
let pmSpaceCardOrder = [];
let __pmLastRefreshSignalTs = 0;

function __pmNativeCotizaciones() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}

async function __pmQuotesList(params) {
    const svc = __pmNativeCotizaciones();
    if (svc) {
        try {
            const out = await svc.list(params || {}, { schema: FIN_SCHEMA });
            return { data: out.items || [], error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    const query = window.tenantPocketBase.from('cotizaciones').select('*');
    if (params && params.filter && params.filter.indexOf('status = "aprobada"') !== -1) query.eq('status', 'aprobada');
    if (params && params.sort) query.order(String(params.sort).replace('-', ''), { ascending: !String(params.sort).startsWith('-') });
    const result = await query;
    return { data: result.data || [], error: result.error || null };
}

async function __pmQuotesUpdate(id, payload) {
    const svc = __pmNativeCotizaciones();
    if (svc) {
        try {
            await svc.update(id, payload || {}, { schema: FIN_SCHEMA });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').update(payload || {}).eq('id', id);
    return { error: result && result.error ? result.error : null };
}

async function __pmQuotesDelete(id) {
    const svc = __pmNativeCotizaciones();
    if (svc) {
        try {
            await svc.remove(id, { schema: FIN_SCHEMA });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').delete().eq('id', id);
    return { error: result && result.error ? result.error : null };
}

window.safeFormatDate = function(dateStr) { if (!dateStr) return '--'; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parts[2]}/${parts[1]}/${parts[0]}`; };
window.parseIds = function(v){ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v === 'string'){ try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch(e){ return v.split(',').map(x=>x.trim()).filter(Boolean); } } return []; };

function __pmReadRefreshSignal() {
    try {
        const raw = localStorage.getItem(PM_ORDERS_REFRESH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        return { ts, reason: parsed?.reason || 'updated' };
    } catch (_) {
        return null;
    }
}

function __pmHandleExternalRefresh(force = false) {
    if (IS_PM_ORDER_DETAIL_PAGE) return;
    const signal = __pmReadRefreshSignal();
    if (!signal) return;
    if (force || signal.ts > __pmLastRefreshSignalTs) {
        __pmLastRefreshSignalTs = signal.ts;
        window.loadOrders?.();
    }
}

window.__pmBroadcastOrdersRefresh = function(reason = 'saved') {
    const payload = { ts: Date.now(), reason };
    try { localStorage.setItem(PM_ORDERS_REFRESH_KEY, JSON.stringify(payload)); } catch (_) {}
    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'pm_orders_refresh', reason }, window.location.origin);
        }
    } catch (_) {}
};

window.downloadBlobAsFile = function(blob, fileName = 'documento.pdf') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

async function __pmWaitForPdfAssets(node, timeoutMs = 7000) {
    if (!node) return;
    const imgs = Array.from(node.querySelectorAll('img'));
    await Promise.race([
        Promise.all(imgs.map(img => {
            const decodeImage = () => {
                if (typeof img.decode === 'function') return img.decode().catch(() => {});
                return Promise.resolve();
            };
            if (img.complete && (img.naturalWidth || img.naturalHeight)) return decodeImage();
            return new Promise(resolve => {
                const done = () => { decodeImage().finally(resolve); };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        })),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function __pmGetPdfRenderHost() {
    let host = document.getElementById('pm-order-pdf-render-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'pm-order-pdf-render-host';
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '816px';
    host.style.maxWidth = '816px';
    host.style.minHeight = '1056px';
    host.style.zIndex = '-1';
    host.style.opacity = '1';
    host.style.pointerEvents = 'none';
    host.style.background = '#ffffff';
    document.body.appendChild(host);
    return host;
}

function __pmPrimePdfImage(url) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl || __pmPdfWarmImageCache.has(safeUrl)) return Promise.resolve();
    __pmPdfWarmImageCache.add(safeUrl);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const done = () => resolve();
        img.onload = done;
        img.onerror = done;
        img.src = safeUrl;
        if (img.complete) done();
    });
}

function __pmPrewarmPdfRenderer() {
    const safeLetterhead = String(__PM_LETTERHEAD_URL || '').trim();
    if (__pmPdfRenderWarmPromise && (!safeLetterhead || __pmPdfWarmImageCache.has(safeLetterhead))) return __pmPdfRenderWarmPromise;
    __pmPdfRenderWarmPromise = (async () => {
        __pmGetPdfRenderHost();
        await __pmPrimePdfImage(safeLetterhead);
        if (document.fonts && typeof document.fonts.ready?.then === 'function') {
            await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1000))]);
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
    })().catch(() => false);
    return __pmPdfRenderWarmPromise;
}

window.generatePdfBlobFromNode = async function(sourceNode, extraOptions = {}) {
    if (!sourceNode) throw new Error('No hay contenido para generar PDF.');
    await __pmPrewarmPdfRenderer();
    const host = __pmGetPdfRenderHost();
    const markup = String(sourceNode.innerHTML || '').trim();
    if (!markup) throw new Error('Contenido PDF vacío.');
    try {
        host.innerHTML = markup;
        const target = host.firstElementChild || host;
        if (target?.classList?.contains('hidden')) target.classList.remove('hidden');
        await new Promise(resolve => setTimeout(resolve, 120));
        await __pmWaitForPdfAssets(target, 7000);

        const baseOptions = {
            margin: 0,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                scrollY: 0,
                logging: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        const options = {
            ...baseOptions,
            ...extraOptions,
            image: { ...baseOptions.image, ...(extraOptions.image || {}) },
            html2canvas: { ...baseOptions.html2canvas, ...(extraOptions.html2canvas || {}) },
            jsPDF: { ...baseOptions.jsPDF, ...(extraOptions.jsPDF || {}) }
        };

        let blob = await html2pdf().set(options).from(target).output('blob');
        if (!blob || blob.size < 4096) {
            await new Promise(resolve => setTimeout(resolve, 400));
            blob = await html2pdf().set({
                ...options,
                html2canvas: { ...(options.html2canvas || {}), scale: 2.5 }
            }).from(target).output('blob');
        }
        if (!blob || blob.size < 4096) throw new Error('No se pudo generar el PDF correctamente.');
        return blob;
    } finally {
        host.innerHTML = '';
    }
};

function __pmIsLockedOrder() {
    return ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
}

function __pmEnsureSpaceCardOrder() {
    const ids = allSpaces.map(s => String(s.id));
    pmSpaceCardOrder = pmSpaceCardOrder.filter(id => ids.includes(id));
    ids.forEach(id => { if (!pmSpaceCardOrder.includes(id)) pmSpaceCardOrder.push(id); });
}

window.scrollOrderSpaceCards = function(direction) {
    const viewport = document.getElementById('oed-space-cards');
    if (!viewport) return;
    const delta = Math.max(240, Math.floor(viewport.clientWidth * 0.82));
    viewport.scrollBy({ left: delta * (direction || 1), behavior: 'smooth' });
};

window.renderOrderSpaceCards = function() {
    const track = document.getElementById('oed-space-cards-track');
    const sel = document.getElementById('oed-space');
    if (!track || !sel) return;
    __pmEnsureSpaceCardOrder();
    const selectedId = String(sel.value || '');
    const locked = __pmIsLockedOrder();
    track.innerHTML = pmSpaceCardOrder.map(spaceId => {
        const space = allSpaces.find(s => String(s.id) === String(spaceId));
        if (!space) return '';
        const active = String(space.id) === selectedId;
        const cardCls = active
            ? 'border-brand-red bg-red-50 ring-1 ring-red-200 text-brand-dark'
            : 'border-gray-200 bg-white text-gray-700 hover:border-brand-red';
        return `<button type="button" ${locked ? 'disabled' : ''} onclick="window.selectOrderSpaceCard('${space.id}')" class="shrink-0 text-left rounded-xl border ${cardCls} p-3 transition ${locked ? 'opacity-70 cursor-not-allowed' : ''}" style="min-width: calc((100% - 1.5rem) / 4);">
            <p class="text-[11px] font-black uppercase leading-tight whitespace-normal break-words">${space.nombre || '--'}</p>
            <p class="text-[10px] font-mono text-gray-500 mt-1 whitespace-normal break-all">ID: ${space.id || '--'}${space.clave ? ` · ${space.clave}` : ''}</p>
        </button>`;
    }).join('');
};

window.selectOrderSpaceCard = function(spaceId) {
    if (__pmIsLockedOrder()) return;
    const sel = document.getElementById('oed-space');
    if (!sel) return;
    const sid = String(spaceId || '');
    if (!sid) return;
    pmSpaceCardOrder = [sid, ...pmSpaceCardOrder.filter(id => String(id) !== sid)];
    sel.value = sid;
    window.renderOrderSpaceCards();
    const spaceObj = allSpaces.find(s => String(s.id) === sid);
    if (spaceObj) window.renderTaxesForSpace(spaceObj);
    window.recalcTotal();
};

function calculateSpaceTotal(space, startStr, endStr) {
    if(!startStr || !endStr || !space) return 0;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if(end < start) return 0;
    return parseFloat(space.precio_base) || 0;
}

window.openModal = (id) => { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); };
window.closeModal = (id) => { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); };
window.showToast = (msg, type='success') => { const c = document.getElementById('toast-container'); const e = document.createElement('div'); e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`; e.innerText = msg; c.appendChild(e); setTimeout(() => e.remove(), 3000); };
window.openStoredDocument = async function(path) { if(!path) return window.showToast("Documento no disponible", "error"); window.showToast("Abriendo documento...", "info"); const { data, error } = await window.globalPocketBase.storage.from('documentos').createSignedUrl(path, 3600); if (error || !data) return window.showToast("Error de acceso al archivo", "error"); window.open(data.signedUrl, '_blank'); };

// MODALES DE CONFIRMACIÓN Y CIERRE INTELIGENTE
let confirmCallback = null;
let cancelCallback = null;
window.openConfirm = function(msg, confirmCb, isWarning = false, confirmTxt = "Confirmar", cancelTxt = "Cancelar", cancelCb = null) { 
    const titleEl = document.getElementById('confirm-title'); 
    titleEl.innerHTML = isWarning ? `<i class="fa-solid fa-triangle-exclamation text-red-600 mb-2 text-2xl block"></i> ${msg}` : msg; 
    confirmCallback = confirmCb; 
    cancelCallback = cancelCb;
    document.getElementById('btn-confirm-action').innerText = confirmTxt;
    document.getElementById('btn-cancel-action').innerText = cancelTxt;
    window.openModal('generic-confirm-modal'); 
};

window.askCloseEditModal = function() {
    if (IS_PM_ORDER_DETAIL_PAGE) {
        window.openConfirm(
            "¿Deseas guardar los cambios en la cotización?",
            async () => { await window.processSaveOrder(); window.location.href = 'orders.html'; },
            false,
            "Guardar Cambios",
            "Cerrar sin guardar",
            () => { window.location.href = 'orders.html'; }
        );
        return;
    }
    window.openConfirm(
        "¿Deseas guardar los cambios en la cotización?",
        () => { window.processSaveOrder(); }, 
        false,
        "Guardar Cambios",
        "Cerrar sin guardar",
        () => { window.closeModal('order-edit-modal'); }
    );
};

window.askDeleteOrder = function(id, e) {
    if (e) e.stopPropagation();
    window.openConfirm("¿Eliminar cotización y TODOS sus archivos? Esta acción es irreversible.", async () => {
        try {
            window.showToast("Eliminando archivos...", "info");
            const { data: files } = await window.globalPocketBase.storage.from('documentos').list(`${id}`, { limit: 100 });
            if (files && files.length > 0) await window.globalPocketBase.storage.from('documentos').remove(files.map(x => `${id}/${x.name}`));
            const { error } = await __pmQuotesDelete(id);
            if (error) throw error;
            window.showToast("Cotización eliminada", "success");
            window.loadOrders();
        } catch (err) {
            window.showToast("Error: " + err.message, "error");
        }
    }, true);
};

window.addEventListener('click', function(e) {
    const editModal = document.getElementById('order-edit-modal');
    const docsModal = document.getElementById('docs-modal');
    const previewModal = document.getElementById('preview-modal');
    const confirmModal = document.getElementById('generic-confirm-modal');

    if (!confirmModal.classList.contains('hidden')) {
        if(e.target === confirmModal) window.closeModal('generic-confirm-modal');
        return; 
    }

    if (e.target === editModal) window.askCloseEditModal();
    if (e.target === docsModal) window.closeModal('docs-modal');
    if (e.target === previewModal) window.closeModal('preview-modal');
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.HUB_CONFIG_READY && typeof window.HUB_CONFIG_READY.then === 'function') {
        await window.HUB_CONFIG_READY;
    }
    __pmSyncHubRuntimeConfig();
    if (window.PB_CLIENT) {
        if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }
    const { data: { session } } = await window.globalPocketBase.auth.getSession(); if (!session) return;
    await __pmLoadLetterheadConfig();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { void __pmPrewarmPdfRenderer(); }, { timeout: 1500 });
    else setTimeout(() => { void __pmPrewarmPdfRenderer(); }, 250);
    
    const { data: profile } = await window.globalPocketBase.from('profiles').select('*').eq('id', session.user.id).single();
    window.currentUserProfile = profile;
    await __pmLoadSharedPdfStyleConfig();
    __pmInitPdfStyleEditor();

    document.getElementById('btn-confirm-action')?.addEventListener('click', () => { if(confirmCallback) confirmCallback(); window.closeModal('generic-confirm-modal'); });
    document.getElementById('btn-cancel-action')?.addEventListener('click', () => { if(cancelCallback) cancelCallback(); window.closeModal('generic-confirm-modal'); });

    document.getElementById('search-orders')?.addEventListener('input', (e) => filterOrders(e.target.value));
    document.getElementById('oed-start')?.addEventListener('change', function() { document.getElementById('oed-end').min = this.value; window.recalcTotal(); }); 
    document.getElementById('oed-end')?.addEventListener('change', () => window.recalcTotal()); 
    document.getElementById('oed-space')?.addEventListener('change', () => { 
        const s = allSpaces.find(x => x.id == document.getElementById('oed-space').value); 
        if(s) window.renderTaxesForSpace(s); 
        window.renderOrderSpaceCards();
        window.recalcTotal(); 
    });
    document.getElementById('new-concept-select')?.addEventListener('change', function() { const c = catalogConcepts.find(x => x.id == this.value); if(c) document.getElementById('new-concept-amount').value = c.precio_sugerido; });
    
    await Promise.all([loadTaxes(), loadSpaces(), loadConcepts()]); await window.loadOrders();
    if (!IS_PM_ORDER_DETAIL_PAGE) {
        const firstSignal = __pmReadRefreshSignal();
        if (firstSignal) __pmLastRefreshSignalTs = firstSignal.ts;
        window.addEventListener('storage', (ev) => {
            if (ev.key === PM_ORDERS_REFRESH_KEY) __pmHandleExternalRefresh(true);
        });
        window.addEventListener('focus', () => __pmHandleExternalRefresh(false));
        window.addEventListener('pageshow', () => __pmHandleExternalRefresh(false));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) __pmHandleExternalRefresh(false);
        });
        window.addEventListener('message', (ev) => {
            if (ev.origin !== window.location.origin) return;
            if (ev.data?.type === 'pm_orders_refresh') __pmHandleExternalRefresh(true);
        });
    }
    if (IS_PM_ORDER_DETAIL_PAGE) {
        const listWrap = document.getElementById('orders-list-section');
        if (listWrap) listWrap.classList.add('hidden');
        const quoteId = new URLSearchParams(window.location.search || '').get('quote');
        if (!quoteId) {
            window.showToast("No se indicó cotización.", "error");
            return;
        }
        await window.openOrderEditModal(quoteId);
    }
});

async function loadTaxes() { const { data } = await window.tenantPocketBase.from('impuestos').select('*'); dbTaxes = data || []; }
async function loadSpaces() { const { data } = await window.tenantPocketBase.from('espacios').select('*'); allSpaces = data || []; __pmEnsureSpaceCardOrder(); window.renderOrderSpaceCards(); }
async function loadConcepts() { const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true); catalogConcepts = data || []; }

window.loadOrders = async function() {
    const { data, error } = await __pmQuotesList({ sort: '-created_at' });
    if (error) {
        window.showToast(`No se pudieron cargar cotizaciones: ${error.message || error}`, 'error');
        allOrders = [];
    } else {
        allOrders = data || [];
    }
    renderOrdersTable(allOrders);
};

function renderOrdersTable(data) {
    const t = document.getElementById('orders-table'); if(!t) return; t.innerHTML = ''; 
    if(!data.length) { t.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-400">Sin registros.</td></tr>'; return; }
    data.forEach(o => {
        let sColor = 'bg-gray-100 text-gray-600', sText = 'Pendiente', missingIcons = []; 
        if(o.status === 'aprobada') { sColor = 'bg-blue-100 text-blue-700'; sText = 'Aprobada'; if (!o.contrato_url && !o.numero_contrato) missingIcons.push('<i class="fa-solid fa-file-signature" title="Falta Contrato"></i>'); if (!o.factura_xml_url) missingIcons.push('<i class="fa-solid fa-file-invoice" title="Falta Factura"></i>'); if (!o.historial_pagos || o.historial_pagos.length === 0) missingIcons.push('<i class="fa-solid fa-money-bill-wave" title="Falta Pago"></i>'); }
        if(o.status === 'finalizada') { sColor = 'bg-green-100 text-green-700 border border-green-200'; sText = 'Finalizada'; }
        if(o.status === 'rechazada') { sColor = 'bg-red-50 text-red-600'; sText = 'Rechazada'; }
        let alertsHTML = ''; if (missingIcons.length > 0 && o.status === 'aprobada') alertsHTML = `<div class="flex gap-2 justify-center mt-1.5 text-[10px] text-red-400">${missingIcons.join('')}</div>`;

        const tr = document.createElement('tr'); tr.className = "border-b hover:bg-gray-50 transition group cursor-pointer";
        tr.onclick = (e) => { if(!e.target.closest('button')) window.openOrderEditorPage(o.id); };
        
        const folioUnificado = o.numero_orden || o.id.split('-')[0].toUpperCase();
        
        tr.innerHTML = `<td class="p-4 font-black text-brand-dark">${folioUnificado}</td><td class="p-4 font-bold text-xs text-gray-700">${o.cliente_nombre}</td><td class="p-4 text-xs"><span class="font-bold block">${o.espacio_nombre}</span><span class="text-gray-500 font-mono">${window.safeFormatDate(o.fecha_inicio)}</span></td><td class="p-4 text-right font-mono font-bold text-xs">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(o.precio_final)}</td><td class="p-4 text-center"><span class="${sColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider">${sText}</span>${alertsHTML}</td><td class="p-4 text-center"><button onclick="event.stopPropagation(); window.openDocsModal('${o.id}')" class="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-brand-dark px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 mx-auto"><i class="fa-solid fa-folder-open text-brand-red"></i> Expediente</button></td><td class="p-4 text-center"><button onclick="window.askDeleteOrder('${o.id}', event)" class="text-gray-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button></td>`;
        t.appendChild(tr);
    });
}

window.openOrderEditorPage = function(id) {
    const url = `order_detail.html?quote=${encodeURIComponent(id)}`;
    window.open(url, '_blank', 'noopener');
};

function filterOrders(term) { 
    const lower = term.toLowerCase();
    renderOrdersTable(allOrders.filter(o => {
        const folioUnificado = o.numero_orden || o.id.split('-')[0].toUpperCase();
        return (o.cliente_nombre || '').toLowerCase().includes(lower) || 
               folioUnificado.toLowerCase().includes(lower);
    })); 
}

window.openOrderEditModal = async function(id) { 
    const order = allOrders.find(o => o.id === id); 
    if (!order) return;

    await loadClientProfilesForOrderModal();
    
    currentConcepts = [];
    if (order.conceptos_adicionales) {
        if (typeof order.conceptos_adicionales === 'string') {
            try { currentConcepts = JSON.parse(order.conceptos_adicionales); } catch(e) {}
        } else if (Array.isArray(order.conceptos_adicionales)) {
            currentConcepts = order.conceptos_adicionales;
        }
    }
    if(!Array.isArray(currentConcepts)) currentConcepts = [];
    
    currentPreviewOrder = order;

    document.getElementById('oed-id').value = order.id; 
    document.getElementById('oed-client').value = order.cliente_nombre || ''; 
    document.getElementById('oed-status').value = order.status; 
    
    const statusSelect = document.getElementById('oed-status');
    const currentLevel = STATUS_LEVEL[order.status] || 0;
    Array.from(statusSelect.options).forEach(opt => opt.disabled = (STATUS_LEVEL[opt.value] || 0) < currentLevel);

    document.getElementById('oed-phone').value = order.cliente_contacto || '';
    document.getElementById('oed-email').value = order.cliente_email || '';
    document.getElementById('fiscal-rfc-re').value = order.cliente_rfc || '';
    
    const selCli = document.getElementById('oed-client-profile');
    const hidCli = document.getElementById('oed-client-id');
    if (selCli) selCli.value = '';
    if (hidCli) hidCli.value = '';

    if (order.cliente_id) {
        if (selCli) selCli.value = order.cliente_id;
        if (hidCli) hidCli.value = order.cliente_id;

        if (!orderClientProfilesById[order.cliente_id]) {
            await loadClientProfilesForOrderModal();
        }
        const c = orderClientProfilesById[order.cliente_id];
        if (c) {
            document.getElementById('oed-client').value = c.nombre_completo || (order.cliente_nombre || '');
            document.getElementById('oed-phone').value = (c.telefono || order.cliente_contacto || '');
            document.getElementById('oed-email').value = (c.correo || order.cliente_email || '');
            document.getElementById('fiscal-rfc-re').value = (c.rfc || order.cliente_rfc || '');
        }
    }

    document.getElementById('oed-start').value = order.fecha_inicio; 
    document.getElementById('oed-end').value = order.fecha_fin; 
    
    const sel = document.getElementById('oed-space'); sel.innerHTML = ''; 
    allSpaces.forEach(s => sel.innerHTML += `<option value="${s.id}" ${s.id == order.espacio_id ? 'selected' : ''}>${s.nombre}</option>`);
    pmSpaceCardOrder = [String(order.espacio_id), ...pmSpaceCardOrder.filter(id => String(id) !== String(order.espacio_id))];
    window.renderOrderSpaceCards();
    
    if(document.getElementById('oed-adj-type')) { 
        document.getElementById('oed-adj-type').value = order.tipo_ajuste || 'ninguno'; 
        document.getElementById('oed-adj-val').value = order.valor_ajuste || 0; 
        document.getElementById('oed-adj-unit').value = order.ajuste_es_porcentaje ? 'percent' : 'fixed'; 
    }
    
    const isLocked = ['aprobada', 'finalizada'].includes(order.status);
    const inputs = document.querySelectorAll('#order-edit-modal input, #order-edit-modal select');
    inputs.forEach(i => { if(i.id !== 'btn-save-progress' && i.id !== 'btn-save-approve') i.disabled = isLocked; });
    const saveBtn = document.getElementById('btn-save-progress');
    if (saveBtn) {
        saveBtn.disabled = isLocked;
        saveBtn.classList.toggle('opacity-60', isLocked);
        saveBtn.title = isLocked ? 'Cotización aprobada: edición bloqueada' : '';
    }
    const approveBtn = document.getElementById('btn-save-approve');
    if (approveBtn) {
        approveBtn.disabled = isLocked;
        approveBtn.classList.toggle('opacity-60', isLocked);
        approveBtn.title = isLocked ? 'Cotización aprobada: edición bloqueada' : '';
    }
    
    const spaceObj = allSpaces.find(s => s.id == order.espacio_id);
    if(spaceObj) window.renderTaxesForSpace(spaceObj, order.desglose_precios?.impuestos_detalle);
    
    const conceptSel = document.getElementById('new-concept-select');
    conceptSel.innerHTML = '<option value="">-- Agregar --</option>';
    catalogConcepts.forEach(c => conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);

    window.renderConceptsList(); 
    window.recalcTotal(); 
    window.openModal('order-edit-modal');
};

// IMPUESTOS BLINDADOS (Si son del espacio, se bloquean activados)
window.renderTaxesForSpace = function(spaceObj, activeTaxIds = null) {
    const container = document.getElementById('oed-taxes-list');
    if(!container) return;
    container.innerHTML = '';
    
    const defaultTaxIds = window.parseIds(spaceObj.impuestos_ids || spaceObj.impuestos).map(String);
    const isLocked = currentPreviewOrder && ['aprobada', 'finalizada'].includes(currentPreviewOrder.status);
    
    dbTaxes.forEach(t => {
        const tIdStr = String(t.id);
        const isMandatory = defaultTaxIds.includes(tIdStr);
        let isChecked = isMandatory || (activeTaxIds && activeTaxIds.map(String).includes(tIdStr));
        let isDisabled = isLocked || isMandatory;
        
        container.innerHTML += `<label class="flex items-center gap-1.5 ${isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}">
            <input type="checkbox" value="${t.id}" class="oed-tax-check accent-brand-red w-3 h-3" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} onchange="window.recalcTotal()">
            <span class="text-[10px] font-bold uppercase text-gray-700">${t.nombre}</span>
        </label>`;
    });
};

window.renderConceptsList = function() { 
    const tbody = document.getElementById('concepts-list');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    const isLocked = currentPreviewOrder && ['aprobada', 'finalizada'].includes(currentPreviewOrder.status);

    if (!currentConcepts || currentConcepts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-3 text-center text-gray-400 italic text-[10px]">Sin conceptos adicionales.</td></tr>';
        return;
    }

    currentConcepts.forEach((c, idx) => {
        const val = parseFloat(c.amount || c.value || 0);
        const desc = c.description || c.concepto || c.nombre || 'Concepto sin nombre';
        const btn = isLocked ? '' : `<button onclick="window.removeConceptRow(${idx})" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`;
        const descCol = isLocked ? desc : `<input type="text" value="${desc}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none transition" onchange="window.updateConceptName(${idx}, this.value)">`;
        const valCol = isLocked ? `$${val.toLocaleString()}` : `$<input type="number" value="${val}" min="0" class="w-20 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none text-right font-bold transition" onchange="window.updateConceptAmount(${idx}, this.value)">`;
        tbody.innerHTML += `<tr><td class="p-2 border-b text-slate-700">${descCol}</td><td class="p-2 border-b text-right text-xs">${valCol}</td><td class="p-2 border-b text-center">${btn}</td></tr>`;
    });
};

window.updateSummaryUI = function(base) {
    const sDate = document.getElementById('oed-start').value;
    const eDate = document.getElementById('oed-end').value;
    
    document.getElementById('sum-dates').innerText = (sDate && eDate) ? (sDate === eDate ? window.safeFormatDate(sDate) : `${window.safeFormatDate(sDate)} al ${window.safeFormatDate(eDate)}`) : '--';
    
    const spaceId = document.getElementById('oed-space').value;
    const spaceObj = allSpaces.find(s => s.id == spaceId);
    document.getElementById('sum-space').innerText = spaceObj ? spaceObj.nombre : '--';

    if (sDate && eDate) {
        const start = new Date(sDate + 'T00:00:00');
        const end = new Date(eDate + 'T00:00:00');
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        document.getElementById('sum-duration').innerText = diffDays + (diffDays === 1 ? ' día' : ' días');
    } else {
        document.getElementById('sum-duration').innerText = '--';
    }

    let conceptsHtml = '';
    (currentConcepts || []).forEach(c => { 
        let amt = parseFloat(c.amount || c.value || 0);
        conceptsHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span><i class="fa-solid fa-plus text-gray-300 mr-1"></i> ${c.description || c.nombre}</span><span>+${amt.toLocaleString('es-MX', {style:'currency',currency:'MXN'})}</span></div>`;
    }); 
    document.getElementById('oed-summary-concepts').innerHTML = conceptsHtml;
    document.getElementById('lbl-subtotal-base').innerText = base.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
};

window.updateConceptAmount = function(index, newVal) { currentConcepts[index].amount = parseFloat(newVal) || 0; currentConcepts[index].value = parseFloat(newVal) || 0; window.recalcTotal(); };
window.updateConceptName = function(index, newName) { currentConcepts[index].description = newName; };

window.recalcTotal = function() { 
    const spaceId = document.getElementById('oed-space').value; 
    const spaceObj = allSpaces.find(s => s.id == spaceId); 
    const sDate = document.getElementById('oed-start').value; 
    const eDate = document.getElementById('oed-end').value; 

    let base = calculateSpaceTotal(spaceObj, sDate, eDate);
    
    let conceptsSum = 0;
    (currentConcepts || []).forEach(c => { conceptsSum += parseFloat(c.amount || c.value || 0); }); 
    
    let sub = base + conceptsSum;
    
    const adjType = document.getElementById('oed-adj-type').value; 
    const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; 
    const isPercent = document.getElementById('oed-adj-unit').value === 'percent';
    
    let adjAmount = 0;
    if (adjType !== 'ninguno') {
        adjAmount = isPercent ? sub * (adjVal/100) : adjVal;
        if (adjType === 'descuento') sub -= adjAmount; else sub += adjAmount;
    }

    let taxTotal = 0;
    let taxHtml = '';
    document.querySelectorAll('.oed-tax-check:checked').forEach(cb => {
        const t = dbTaxes.find(x => x.id == cb.value);
        if(t) {
            const taxVal = sub * (t.porcentaje / 100);
            taxTotal += taxVal;
            taxHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span>${t.nombre}</span><span>+${taxVal.toLocaleString('es-MX', {style:'currency',currency:'MXN'})}</span></div>`;
        }
    });

    document.getElementById('oed-tax-summary-display').innerHTML = taxHtml;
    document.getElementById('lbl-subtotal').innerText = sub.toLocaleString('es-MX', {style:'currency',currency:'MXN'}); 
    document.getElementById('lbl-adjustment').innerText = (adjType==='descuento'?'-':'+') + adjAmount.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
    document.getElementById('oed-price').value = (sub + taxTotal).toFixed(2);
    
    window.updateSummaryUI(base);
    window.updatePriceColor(base);
};

window.updatePriceColor = function(base) { 
    const priceInput = document.getElementById('oed-price'); const val = parseFloat(priceInput.value) || 0; 
    priceInput.classList.remove('text-green-600', 'text-red-600', 'text-gray-700'); 
    if (val < base) priceInput.classList.add('text-green-600'); 
    else if (val > base) priceInput.classList.add('text-red-600'); 
    else priceInput.classList.add('text-gray-700'); 
};

window.addConceptRow = function() { 
    const id = document.getElementById('new-concept-select').value;
    const amount = parseFloat(document.getElementById('new-concept-amount').value);
    if (!id || isNaN(amount) || amount === 0) return;
    const c = catalogConcepts.find(x => x.id == id);
    currentConcepts.push({ description: c.nombre, amount: amount, value: amount, unit: 'fixed', type: 'aumento' });
    document.getElementById('new-concept-select').value = "";
    document.getElementById('new-concept-amount').value = "";
    window.renderConceptsList();
    window.recalcTotal();
};

window.removeConceptRow = function(index) {
    currentConcepts.splice(index, 1);
    window.renderConceptsList();
    window.recalcTotal();
};

window.attemptSaveOrder = function() {
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    const newStatus = document.getElementById('oed-status').value;
    const currentLevel = STATUS_LEVEL[currentPreviewOrder.status] || 0;
    const newLevel = STATUS_LEVEL[newStatus] || 0;

    if (newLevel < currentLevel) return window.showToast("No puedes regresar a un estado anterior.", "error");

    if (newStatus === 'aprobada' && currentPreviewOrder.status !== 'aprobada') {
        const missing = [];
        if(!document.getElementById('oed-client').value) missing.push("Nombre Cliente");
        if(!document.getElementById('oed-email').value) missing.push("Email");
        if(!document.getElementById('fiscal-rfc-re').value) missing.push("RFC");
        if(!document.getElementById('oed-start').value) missing.push("Fechas");
        
        if (missing.length > 0) return window.openConfirm(`<p class="text-red-600 font-bold mb-2">Faltan datos para aprobar:</p><ul class="list-disc ml-4 text-xs text-left">${missing.map(m=>`<li>${m}</li>`).join('')}</ul>`, () => window.closeModal('generic-confirm-modal'), true);
        
        window.initiateApprovalSnapshot();
    } else {
        window.processSaveOrder();
    }
};

window.initiateApprovalSnapshot = async function() {
    await __pmEnsurePdfStyleProfile('quote');
    void __pmPrewarmPdfRenderer();
    const formData = window.getFormDataFromModal();
    if (!formData.numero_orden) { formData.numero_orden = currentPreviewOrder.id.split('-')[0].toUpperCase(); }

    const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, 'quote'); 
    
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    const btnAction = document.getElementById('btn-download-preview');
    
    pdfContainer.innerHTML = content;
    __pmResetPreviewEditingState();
    __pmApplyPdfStyleToLivePreview();
    pdfContainer.classList.remove('hidden');
    embedViewer.classList.add('hidden');
    
    btnAction.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Aprobación';
    btnAction.className = "bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
    
    document.getElementById('prev-order-num').innerText = "VISTA PREVIA DE APROBACIÓN";
    
    btnAction.onclick = () => window.executeApprovalTransaction(formData);
    
    window.openModal('preview-modal');
};

window.executeApprovalTransaction = async function(formData) {
    const btn = document.getElementById('btn-download-preview');
    btn.disabled = true; btn.innerText = "Generando Snapshot...";
    
    try {
        const element = document.getElementById('pdf-content');
        const pdfBlob = await window.generatePdfBlobFromNode(element);
        
        const folioUnificado = formData.numero_orden || currentPreviewOrder.id.split('-')[0].toUpperCase();
        const path = `${currentPreviewOrder.id}/cotizacion_aprobada_${folioUnificado}.pdf`;
        
        const { error: uploadError } = await window.globalPocketBase.storage.from('documentos').upload(path, pdfBlob);
        if (uploadError) throw uploadError;

        const payload = { ...formData, status: 'aprobada', url_cotizacion_final: path };
        
        const { error: dbError } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
        if (dbError) throw dbError;
        window.__pmBroadcastOrdersRefresh('approved_snapshot');

        window.downloadBlobAsFile(pdfBlob, `Cotizacion_Aprobada_${folioUnificado}.pdf`);

        window.showToast("¡Cotización Aprobada y Archivada!", "success");
        window.closeModal('preview-modal');
        window.closeModal('order-edit-modal');
        await window.loadOrders();

    } catch (e) {
        console.error(e);
        window.showToast("Error en la aprobación: " + e.message, "error");
        btn.disabled = false; btn.innerText = "Reintentar";
    }
};

window.getFormDataFromModal = function() {
    const spaceId = document.getElementById('oed-space').value; 
    const spaceObj = allSpaces.find(s => s.id == spaceId); 
    const sDate = document.getElementById('oed-start').value;
    const eDate = document.getElementById('oed-end').value;
    
    let base = calculateSpaceTotal(spaceObj, sDate, eDate); 
    let concepts = 0;
    currentConcepts.forEach(c => { concepts += parseFloat(c.amount || c.value || 0); });
    let sub = base + concepts;

    const activeTaxIds = Array.from(document.querySelectorAll('.oed-tax-check:checked')).map(cb => parseInt(cb.value));
    const priceFinal = parseFloat(document.getElementById('oed-price').value);

    const adjType = document.getElementById('oed-adj-type').value; 
    const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; 
    const isPercent = document.getElementById('oed-adj-unit').value === 'percent';

    return {
        cliente_nombre: document.getElementById('oed-client').value,
        cliente_email: document.getElementById('oed-email').value,
        cliente_contacto: document.getElementById('oed-phone').value,
        cliente_rfc: document.getElementById('fiscal-rfc-re').value,
        cliente_id: (document.getElementById('oed-client-id') ? (document.getElementById('oed-client-id').value || null) : null),
        fecha_inicio: sDate,
        fecha_fin: eDate,
        precio_final: priceFinal,
        espacio_id: spaceId,
        espacio_nombre: spaceObj ? spaceObj.nombre : '',
        espacio_clave: spaceObj ? spaceObj.clave : '',
        tipo_ajuste: adjType,
        valor_ajuste: adjVal,
        ajuste_es_porcentaje: isPercent,
        conceptos_adicionales: currentConcepts, 
        desglose_precios: { subtotal_antes_impuestos: sub, impuestos_detalle: activeTaxIds }
    };
};

window.processSaveOrder = async function() {
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    const btn = document.getElementById('btn-save-progress');
    btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const formData = window.getFormDataFromModal();
        formData.status = document.getElementById('oed-status').value;
        if(!formData.numero_orden) formData.numero_orden = currentPreviewOrder.id.split('-')[0].toUpperCase();
        
        const { error } = await __pmQuotesUpdate(document.getElementById('oed-id').value, formData);
        if (error) throw error;
        window.__pmBroadcastOrdersRefresh(formData.status === 'aprobada' ? 'approved_saved' : 'saved');

        window.showToast("Cambios guardados", "success");
        window.closeModal('order-edit-modal');
        await window.loadOrders(); 
    } catch(e) { window.showToast("Error: " + e.message, "error"); } finally { btn.disabled = false; btn.innerText = "Guardar Directamente"; }
};

window.previewOrderForGeneration = async function(id) {
    await __pmEnsurePdfStyleProfile('order');
    void __pmPrewarmPdfRenderer();
    const order = allOrders.find(o => o.id === id);
    if(!order) return;
    currentPreviewOrder = { ...order, docType: 'order' }; 
    
    const content = await window.getOrderHTML(order, 'order');
    
    const pdfContainer = document.getElementById('pdf-content');
    const embed = document.getElementById('doc-preview');
    
    pdfContainer.innerHTML = content;
    __pmResetPreviewEditingState();
    __pmApplyPdfStyleToLivePreview();
    pdfContainer.classList.remove('hidden');
    embed.classList.add('hidden');
    
    const btn = document.getElementById('btn-download-preview');
    btn.innerHTML = '<i class="fa-solid fa-file-contract"></i> Confirmar y Generar OC';
    btn.className = "bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
    
    btn.onclick = window.confirmAndGeneratePurchaseOrder;
    
    window.openModal('preview-modal');
};

window.confirmAndGeneratePurchaseOrder = async function() {
    window.openConfirm("¿Generar Orden de Compra Oficial? Se guardará una copia exacta.", async () => {
        const btn = document.getElementById('btn-download-preview');
        btn.disabled = true; btn.innerText = "Generando OC...";
        
        try {
            const element = document.getElementById('pdf-content'); 
            const pdfBlob = await window.generatePdfBlobFromNode(element);
            const folioUnificado = currentPreviewOrder.numero_orden || currentPreviewOrder.id.split('-')[0].toUpperCase();
            const path = `${currentPreviewOrder.id}/orden_compra_${folioUnificado}.pdf`;
            
            await window.globalPocketBase.storage.from('documentos').upload(path, pdfBlob);
            const ocUpdate = await __pmQuotesUpdate(currentPreviewOrder.id, { url_orden_compra: path, fecha_orden_compra: new Date().toISOString() });
            if (ocUpdate.error) throw ocUpdate.error;
            
            window.downloadBlobAsFile(pdfBlob, `OC_${folioUnificado}.pdf`);
    
            window.showToast("Orden de Compra Generada");
            await window.loadOrders(); 
            window.closeModal('preview-modal');
            window.closeModal('docs-modal');
            
        } catch(e) { window.showToast("Error al generar OC", "error"); } finally { btn.disabled = false; }
    });
};

window.openDocsModal = function(id) {
    const order = allOrders.find(o => o.id === id); if(!order) return;
    document.getElementById('doc-client').innerText = order.cliente_nombre;
    const folioUnificado = order.numero_orden || order.id.split('-')[0].toUpperCase();
    document.getElementById('doc-folio').innerText = folioUnificado;
    document.getElementById('doc-space').innerText = order.espacio_nombre;
    document.getElementById('doc-dates').innerText = `${window.safeFormatDate(order.fecha_inicio)} - ${window.safeFormatDate(order.fecha_fin)}`;
    
    const list = document.getElementById('docs-list'); list.innerHTML = '';
    
    const createBtn = (label, icon, color, action) => {
        list.innerHTML += `<button type="button" onclick="${action}" class="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm group bg-white mb-2"><div class="w-8 h-8 rounded-full bg-${color}-100 text-${color}-600 flex items-center justify-center shrink-0"><i class="${icon}"></i></div><div class="flex-grow"><p class="text-xs font-bold text-gray-700">${label}</p></div><i class="fa-solid fa-arrow-right text-xs text-gray-300"></i></button>`;
    };

    if (order.url_cotizacion_final) { createBtn('Ver Cotización Aprobada', 'fa-solid fa-file-circle-check', 'blue', `window.openStoredDocument('${order.url_cotizacion_final}')`); } else { createBtn('Ver Borrador Cotización', 'fa-solid fa-file-pen', 'gray', `window.openPDFPreview('${order.id}', 'quote')`); }
    if (order.url_orden_compra) { createBtn('Ver Orden de Compra', 'fa-solid fa-file-contract', 'purple', `window.openStoredDocument('${order.url_orden_compra}')`); } else if(['aprobada', 'finalizada'].includes(order.status)) { createBtn('Generar Orden de Compra', 'fa-solid fa-plus', 'purple', `window.previewOrderForGeneration('${order.id}')`); } else { list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-lock text-gray-400"></i><span class="text-xs font-bold text-gray-400">Orden de Compra (Pendiente)</span></div>`; }
    if (order.contrato_url) { createBtn('Ver Contrato Firmado', 'fa-solid fa-file-signature', 'indigo', `window.openStoredDocument('${order.contrato_url}')`); } else { list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-signature text-gray-400"></i><span class="text-xs font-bold text-gray-400">Contrato (Pendiente Firma)</span></div>`; }
    if (order.factura_pdf_url) { createBtn('Ver Factura (PDF)', 'fa-solid fa-file-pdf', 'red', `window.openStoredDocument('${order.factura_pdf_url}')`); if(order.factura_xml_url) createBtn('Descargar XML', 'fa-solid fa-file-code', 'orange', `window.openStoredDocument('${order.factura_xml_url}')`); } else { list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-file-invoice-dollar text-gray-400"></i><span class="text-xs font-bold text-gray-400">Factura (Pendiente)</span></div>`; }
    if (order.historial_pagos?.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'border-t border-gray-100 my-2 pt-2 text-[10px] font-bold text-gray-400 uppercase text-center';
        divider.innerText = 'Historial de Recibos';
        list.appendChild(divider);
        let recNo = 0;
        order.historial_pagos.forEach((p) => {
            const type = String(p?.type || p?.tipo || '').toLowerCase();
            const isConstancia = type === 'constancia_liquidacion' || p?.closed === true || p?.is_closure === true;
            const label = isConstancia ? 'Constancia de Liquidación' : `Recibo #${++recNo}`;
            const icon = isConstancia ? 'fa-solid fa-circle-check' : 'fa-solid fa-receipt';
            createBtn(label, icon, 'green', `window.openStoredDocument('${p.file_path}')`);
        });
    }

    window.openModal('docs-modal');
};

window.openPDFPreview = async function(id, type) { 
    await __pmEnsurePdfStyleProfile(type);
    void __pmPrewarmPdfRenderer();
    const o = allOrders.find(x => x.id === id); if(!o) return; 
    currentPreviewOrder = { ...o, docType: type }; 
    const content = await window.getOrderHTML(o, type); 
    const pdfContainer = document.getElementById('pdf-content'); 
    const embedViewer = document.getElementById('doc-preview'); 
    const btnDownload = document.getElementById('btn-download-preview'); 
    pdfContainer.classList.remove('hidden'); embedViewer.classList.add('hidden'); pdfContainer.innerHTML = content; __pmResetPreviewEditingState(); __pmApplyPdfStyleToLivePreview();
    btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
    btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
    btnDownload.onclick = window.downloadPDFFromPreview; 
    window.openModal('preview-modal'); 
};

window.downloadPDFFromPreview = async function() { 
    const element = document.getElementById('pdf-content'); 
    const folioUnificado = currentPreviewOrder.numero_orden || currentPreviewOrder.id.split('-')[0].toUpperCase();
    try {
        const pdfBlob = await window.generatePdfBlobFromNode(element);
        window.downloadBlobAsFile(pdfBlob, `Documento_${folioUnificado}.pdf`);
    } catch (e) {
        window.showToast("No se pudo descargar el PDF: " + (e?.message || e), "error");
    }
};

function __pmOrdersTransparentPdfHtml(html) {
    return String(html || '')
        .replace(/\bbg-(?:white|gray-\d{2,3}|red-\d{2,3}|green-\d{2,3}|blue-\d{2,3}|amber-\d{2,3}|purple-\d{2,3}|brand-red)\b/g, '')
        .replace(/background:\s*#(?:[0-9a-f]{3,8});?/gi, 'background: transparent;')
        .replace(/background:\s*rgba?\([^)]+\);?/gi, 'background: transparent;')
        .replace(/\s{2,}/g, ' ');
}

function __pmOrdersBoostPdfTypography(html) {
    return String(html || '')
        .replace(/\btext-\[9px\]\b/g, '__PM_TXT_9__')
        .replace(/\btext-\[10px\]\b/g, '__PM_TXT_10__')
        .replace(/\btext-\[11px\]\b/g, '__PM_TXT_11__')
        .replace(/\btext-xs\b/g, '__PM_TXT_XS__')
        .replace(/\btext-sm\b/g, '__PM_TXT_SM__')
        .replace(/__PM_TXT_9__/g, 'text-[10px]')
        .replace(/__PM_TXT_10__/g, 'text-[11px]')
        .replace(/__PM_TXT_11__/g, 'text-[12px]')
        .replace(/__PM_TXT_XS__/g, 'text-sm')
        .replace(/__PM_TXT_SM__/g, 'text-base');
}

const __PM_PDF_STYLE_CONFIG_KEY = 'pdf_typography_style';
const __PM_PDF_STYLE_TENANT = 'plaza_mayor';
const __PM_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'contract']);
const __PM_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: 'Segoe UI, Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, Times New Roman, serif',
    times: 'Times New Roman, Times, serif',
    trebuchet: 'Trebuchet MS, Arial, sans-serif'
});
const __PM_PDF_STYLE_FONT_LABELS = Object.freeze({
    segoe: 'Segoe UI',
    arial: 'Arial',
    verdana: 'Verdana',
    georgia: 'Georgia',
    times: 'Times New Roman',
    trebuchet: 'Trebuchet MS'
});
const __PM_PDF_BASE_TEXT_BLOCKS = Object.freeze([
    { id: 'base:header-title', key: 'header-title', label: 'Título Encabezado', sizeField: 'titlePx', alignField: 'headerAlign' },
    { id: 'base:header-meta', key: 'header-meta', label: 'Meta Encabezado', sizeField: 'metaPx', alignField: 'metaAlign' },
    { id: 'base:header-line', key: 'header-line', label: 'Linea Encabezado', sizeField: 'headerLinePx', kind: 'shape', inspectorEnabled: false },
    { id: 'base:table', key: 'table', label: 'Tabla Conceptos', sizeField: 'tableBodyPx', alignField: 'tableAlign' },
    { id: 'base:summary-client', key: 'summary-client', label: 'Resumen Cliente', alignField: 'summaryAlign' },
    { id: 'base:summary-totals', key: 'summary-totals', label: 'Resumen Totales', alignField: 'summaryAlign' },
    { id: 'base:quick', key: 'quick', label: 'Notas', sizeField: 'quickPx', alignField: 'quickAlign', contentEditor: 'quick' },
    { id: 'base:conditions', key: 'conditions', label: 'Condiciones', sizeField: 'conditionsPx', alignField: 'conditionsAlign', contentEditor: 'conditions' },
    { id: 'base:sign-line', key: 'sign-line', label: 'Linea Firma', sizeField: 'signLinePx', kind: 'shape', inspectorEnabled: false },
    { id: 'base:sign', key: 'sign', label: 'Firmas', sizeField: 'signPx', alignField: 'signAlign' },
    { id: 'base:footer', key: 'footer', label: 'Footer', sizeField: 'footerPx', alignField: 'footerAlign' }
]);
const __PM_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -2400, max: 2400 },
    y: { min: -3200, max: 3200 },
    scalePct: { min: 15, max: 500 }
});
const __PM_PDF_BASE_LAYOUT_ALIASES = Object.freeze({
    'header-line': ['header-line'],
    'sign-line': ['sign-line'],
    table: ['table', 'table-body'],
    'summary-client': ['summary-client', 'summary'],
    'summary-totals': ['summary-totals', 'summary']
});
const __PM_PDF_BASE_TEXT_STYLE_DEFAULTS = Object.freeze({
    fontFamilyKey: '',
    fontSize: null,
    color: '',
    bold: false,
    italic: false,
    underline: false
});
const __PM_PDF_BASE_SIZE_LIMITS = Object.freeze({
    headerLinePx: { min: 1, max: 16 },
    signLinePx: { min: 1, max: 16 },
    titlePx: { min: 20, max: 42 },
    metaPx: { min: 8, max: 18 },
    tableBodyPx: { min: 9, max: 16 },
    quickPx: { min: 9, max: 16 },
    conditionsPx: { min: 9, max: 18 },
    signPx: { min: 9, max: 16 },
    footerPx: { min: 8, max: 14 }
});
const __PM_PDF_CONTENT_EDITOR_FIELDS = Object.freeze({
    quick: Object.freeze([
        { key: 'quickLeftTitle', label: 'Titulo izquierda', multiline: false, max: 80 },
        { key: 'quickLeftLines', label: 'Notas izquierda', multiline: true, rows: 5, max: 1200 },
        { key: 'quickRightTitle', label: 'Titulo derecha', multiline: false, max: 80 },
        { key: 'quickRightBody', label: 'Texto derecha', multiline: true, rows: 4, max: 700 }
    ]),
    conditions: Object.freeze([
        { key: 'conditionsTitle', label: 'Titulo condiciones', multiline: false, max: 120 },
        { key: 'conditionsLines', label: 'Condiciones', multiline: true, rows: 8, max: 5000 },
        { key: 'annexHintTitle', label: 'Titulo anexo', multiline: false, max: 120 },
        { key: 'annexHintBody', label: 'Texto anexo', multiline: true, rows: 4, max: 900 }
    ])
});
const __PM_PDF_STYLE_CONTENT_DEFAULTS = Object.freeze({
    quickLeftTitle: 'Condiciones:',
    quickLeftLines: 'a) Pago anticipado.\nb) Doc. completa 3 semanas antes.\nc) Sujeto a disponibilidad.',
    quickRightTitle: 'Vigencia:',
    quickRightBody: '7 días naturales a partir de la emisión.',
    conditionsTitle: 'CONDICIONES GENERALES',
    conditionsLines: [
        'La instalación será responsabilidad exclusiva del cliente. Esto incluye cualquier costo asociado con la instalación, como mano de obra, herramientas y materiales necesarios.',
        'El diseño y contenido del material publicitario deben cumplir con las normativas establecidas por el centro comercial.',
        'El cliente es completamente responsable del contenido del material publicitario y de no infringir derechos de terceros.',
        'Durante el proceso de instalación y desinstalación, el cliente será responsable de cualquier daño causado al espacio o propiedad del centro comercial.',
        'Cualquier modificación en la duración, diseño o ubicación del material publicitario debe ser comunicada y aprobada por el centro comercial con anticipación.',
        'No se permite volanteo fuera del espacio designado, ni equipo de audio (perifoneo, música, etc) salvo previa autorización por escrito.',
        'Al finalizar la campaña publicitaria, el cliente deberá retirar el material publicitario a más tardar al día siguiente.',
        'No se permite la venta ni promoción de artículos para adultos, bebidas alcohólicas, tabaco, CBD y/o cannabinoides.',
        'El almacenamiento y/o recolección de basura correrá por cuenta del cliente.',
        'El cliente deberá instalar la toma eléctrica necesaria. Plaza Mayor podrá suministrar energía de 110v para uso moderado previa autorización.',
        'Esta es una propuesta económica; las condiciones generales y específicas finales se presentarán en el contrato correspondiente.'
    ].join('\n'),
    annexHintTitle: 'Página adicional editable',
    annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
});
const __PM_PDF_STYLE_DEFAULTS = Object.freeze({
    fontFamilyKey: 'segoe',
    headerLinePx: 4,
    signLinePx: 1,
    titlePx: 30,
    metaPx: 13,
    tableHeadPx: 14,
    tableBodyPx: 12,
    lineHeightPct: 120,
    quickPx: 12,
    conditionsPx: 14,
    signPx: 12,
    footerPx: 10,
    offsetXPx: 0,
    offsetYPx: 0,
    extraPages: 0,
    baseLayouts: {},
    baseTextStyles: {},
    resources: [],
    content: __PM_PDF_STYLE_CONTENT_DEFAULTS,
    headerAlign: 'right',
    metaAlign: 'right',
    tableAlign: 'left',
    quickAlign: 'left',
    conditionsAlign: 'justify',
    signAlign: 'center',
    summaryAlign: 'left',
    footerAlign: 'center'
});
const __PM_PDF_STYLE_UI_STATE_KEY = 'pm_pdf_style_editor_ui';
let __pmPdfStyleState = null;
let __pmPdfStyleConfigRecordId = '';
let __pmPdfStyleSyncTimer = null;
let __pmPdfStyleUiState = { collapsed: false, pinned: false };
let __pmPdfResourceEditorSelectedId = '';
let __pmPdfResourcePointerState = null;
let __pmPdfStyleActiveProfile = 'quote';
let __pmPdfPreviewEditLocked = true;
let __pmPdfTextInspectorState = null;

function __pmClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __pmNormalizeStyleAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __pmSafeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function __pmNormalizeHexColor(value, fallback) {
    const input = String(value || '').trim();
    const candidate = input.startsWith('#') ? input : `#${input}`;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

function __pmNormalizeOptionalFontKey(value) {
    const fontKey = String(value || '').toLowerCase().trim();
    return __PM_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : '';
}

function __pmNormalizeOptionalHexColor(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    const candidate = input.startsWith('#') ? input : `#${input}`;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : '';
}

function __pmNormalizeNullableStyleNumber(value, min, max) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return null;
    return Math.min(max, Math.max(min, num));
}

function __pmGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __PM_PDF_BASE_TEXT_BLOCKS.find((block) => block.key === safe) || null;
}

function __pmNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __pmClampStyleNumber(base.x, __PM_PDF_BASE_LAYOUT_LIMITS.x.min, __PM_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __pmClampStyleNumber(base.y, __PM_PDF_BASE_LAYOUT_LIMITS.y.min, __PM_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __pmClampStyleNumber(base.scalePct ?? base.scale, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        hidden: base.hidden === true
    };
}

function __pmNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __PM_PDF_BASE_TEXT_BLOCKS.forEach((block) => {
        const aliases = __PM_PDF_BASE_LAYOUT_ALIASES[block.key] || [block.key];
        let candidate = null;
        aliases.some((alias) => {
            if (source[alias] && typeof source[alias] === 'object') {
                candidate = source[alias];
                return true;
            }
            return false;
        });
        out[block.key] = __pmNormalizePdfBaseLayout(candidate || {});
    });
    return out;
}

function __pmNormalizePdfBaseTextStyle(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        fontFamilyKey: __pmNormalizeOptionalFontKey(base.fontFamilyKey),
        fontSize: __pmNormalizeNullableStyleNumber(base.fontSize, 8, 72),
        color: __pmNormalizeOptionalHexColor(base.color),
        bold: base.bold === true,
        italic: base.italic === true,
        underline: base.underline === true
    };
}

function __pmNormalizePdfBaseTextStyles(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __PM_PDF_BASE_TEXT_BLOCKS.forEach((block) => {
        out[block.key] = __pmNormalizePdfBaseTextStyle(source[block.key] || {});
    });
    return out;
}

function __pmHasPdfBaseTextStyle(style) {
    const safe = __pmNormalizePdfBaseTextStyle(style);
    return !!(safe.fontFamilyKey || safe.fontSize || safe.color || safe.bold || safe.italic || safe.underline);
}

function __pmBuildPdfBaseTransform(layout) {
    const safe = __pmNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __pmNormalizePdfContent(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __PM_PDF_STYLE_CONTENT_DEFAULTS;
    const normalizeText = (key, max) => String(base[key] ?? defaults[key] ?? '').slice(0, max);
    return {
        quickLeftTitle: normalizeText('quickLeftTitle', 80),
        quickLeftLines: normalizeText('quickLeftLines', 1200),
        quickRightTitle: normalizeText('quickRightTitle', 80),
        quickRightBody: normalizeText('quickRightBody', 700),
        conditionsTitle: normalizeText('conditionsTitle', 120),
        conditionsLines: normalizeText('conditionsLines', 5000),
        annexHintTitle: normalizeText('annexHintTitle', 120),
        annexHintBody: normalizeText('annexHintBody', 900)
    };
}

function __pmGetPdfContentEditorFieldConfig(fieldKey) {
    const safe = String(fieldKey || '').trim();
    const groups = Object.values(__PM_PDF_CONTENT_EDITOR_FIELDS);
    for (const fields of groups) {
        const match = fields.find((field) => field.key === safe);
        if (match) return match;
    }
    return null;
}

function __pmNormalizePdfResources(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.slice(0, 80).map((item, index) => {
        const base = item && typeof item === 'object' ? item : {};
        const type = ['bar', 'title', 'text', 'logo'].includes(String(base.type || '').toLowerCase()) ? String(base.type).toLowerCase() : 'text';
        return {
            id: String(base.id || `pmres_${Date.now()}_${index}`),
            type,
            enabled: base.enabled !== false,
            page: __pmClampStyleNumber(base.page, 1, 8, 1),
            x: __pmClampStyleNumber(base.x, -4000, 4000, 80),
            y: __pmClampStyleNumber(base.y, -5000, 5000, 120),
            w: __pmClampStyleNumber(base.w, 16, 4000, type === 'bar' ? 240 : (type === 'logo' ? 180 : 260)),
            h: __pmClampStyleNumber(base.h, 10, 5000, type === 'bar' ? 12 : (type === 'logo' ? 72 : 42)),
            text: String(base.text || (type === 'title' ? 'TITULO' : (type === 'logo' ? '' : 'Texto editable'))).slice(0, 180),
            fontSize: __pmClampStyleNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
            fontFamilyKey: __pmNormalizeOptionalFontKey(base.fontFamilyKey),
            bold: base.bold !== false,
            italic: base.italic === true,
            underline: base.underline === true,
            align: __pmNormalizeStyleAlign(base.align, 'left'),
            color: __pmNormalizeHexColor(base.color, '#111827'),
            bgColor: __pmNormalizeHexColor(base.bgColor, type === 'bar' ? '#d32f2f' : '#ffffff')
        };
    });
}

function __pmRenderPdfResources(style, pageIndex) {
    const cfg = __pmNormalizePdfStyle(style || {});
    const resources = __pmNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:${__pmIsAdminProfile() ? 'auto' : 'none'};`;
            if (resource.type === 'bar') {
                return `<div class="pm-pdf-resource ${__pmIsAdminProfile() ? 'pm-pdf-editable' : ''}" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="bar" style="${common}background:${resource.bgColor};border-radius:2px;"></div>`;
            }
            if (resource.type === 'logo') {
                return `<div class="pm-pdf-resource ${__pmIsAdminProfile() ? 'pm-pdf-editable' : ''}" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="logo" style="${common}padding:0;background:transparent;border-radius:0;"><img src="${__pmSafeHtml(COMPANY_LOGO_URL)}" alt="Logo tenant" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;"></div>`;
            }
            const resourceFont = resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? `font-family:${__PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]};`
                : '';
            return `<div class="pm-pdf-resource ${__pmIsAdminProfile() ? 'pm-pdf-editable' : ''}" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="${__pmSafeHtml(resource.type)}" data-res-font-size="${resource.fontSize}" style="${common}color:${resource.color};background:${resource.bgColor};font-size:${resource.fontSize}px;line-height:1.2;font-weight:${resource.bold ? 800 : 500};font-style:${resource.italic ? 'italic' : 'normal'};text-decoration:${resource.underline ? 'underline' : 'none'};text-align:${resource.align};white-space:pre-wrap;overflow:hidden;padding:3px 6px;border-radius:2px;${resourceFont}">${__pmSafeHtml(resource.text)}</div>`;
        })
        .join('');
}

function __pmAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (!type || type === 'bar' || type === 'logo') return;
    const baseFont = __pmClampStyleNumber(
        node.getAttribute('data-res-font-size') || node.style.fontSize || window.getComputedStyle(node).fontSize,
        8,
        72,
        14
    );
    node.style.fontSize = `${baseFont}px`;
    node.style.lineHeight = '1.2';
    if ((node.scrollWidth <= node.clientWidth + 1) && (node.scrollHeight <= node.clientHeight + 1)) return;
    let low = 8;
    let high = baseFont;
    let best = 8;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        node.style.fontSize = `${mid}px`;
        if ((node.scrollWidth <= node.clientWidth + 1) && (node.scrollHeight <= node.clientHeight + 1)) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    node.style.fontSize = `${best}px`;
}

function __pmAutoFitPdfTextResources() {
    document.querySelectorAll('#pdf-content .pm-pdf-resource[data-res-type="text"], #pdf-content .pm-pdf-resource[data-res-type="title"]').forEach((node) => {
        __pmAutoFitPdfTextNode(node);
    });
}

function __pmSyncPdfResourceNodes() {
    const resources = __pmGetPdfResourcesFromState();
    const resourceMap = new Map(resources.map((resource) => [`${resource.id}:${resource.page}`, resource]));
    document.querySelectorAll('#pdf-content .pm-pdf-resource[data-res-id][data-res-page]').forEach((node) => {
        const resourceId = String(node.getAttribute('data-res-id') || '');
        const resourcePage = parseInt(node.getAttribute('data-res-page') || '1', 10);
        const resource = resourceMap.get(`${resourceId}:${resourcePage}`);
        if (!resource || !resource.enabled) {
            node.remove();
            return;
        }
        node.setAttribute('data-res-type', resource.type);
        node.setAttribute('data-res-font-size', String(resource.fontSize || 14));
        node.style.left = `${resource.x}px`;
        node.style.top = `${resource.y}px`;
        node.style.width = `${resource.w}px`;
        node.style.height = `${resource.h}px`;
        node.style.pointerEvents = __pmIsAdminProfile() ? 'auto' : 'none';
        node.style.borderRadius = '2px';
        if (resource.type === 'bar') {
            node.textContent = '';
            node.style.background = resource.bgColor;
            node.style.padding = '0';
            node.style.color = 'transparent';
            node.style.fontSize = '0';
            node.style.fontWeight = '400';
            node.style.fontStyle = 'normal';
            node.style.textDecoration = 'none';
            node.style.textAlign = 'left';
            node.style.whiteSpace = 'normal';
            node.style.overflow = 'hidden';
            node.style.removeProperty('font-family');
            return;
        }
        if (resource.type === 'logo') {
            node.style.background = 'transparent';
            node.style.padding = '0';
            node.style.color = 'transparent';
            node.style.fontSize = '0';
            node.style.fontWeight = '400';
            node.style.fontStyle = 'normal';
            node.style.textDecoration = 'none';
            node.style.textAlign = 'left';
            node.style.whiteSpace = 'normal';
            node.style.overflow = 'hidden';
            node.style.removeProperty('font-family');
            const currentImg = node.querySelector('img');
            if (currentImg) currentImg.setAttribute('src', COMPANY_LOGO_URL);
            else node.innerHTML = `<img src="${__pmSafeHtml(COMPANY_LOGO_URL)}" alt="Logo tenant" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">`;
            return;
        }
        if (node.querySelector('img')) node.innerHTML = '';
        node.textContent = resource.text || '';
        node.style.background = resource.bgColor;
        node.style.color = resource.color;
        node.style.fontSize = `${resource.fontSize}px`;
        node.style.fontWeight = resource.bold ? '800' : '500';
        node.style.fontStyle = resource.italic ? 'italic' : 'normal';
        node.style.textDecoration = resource.underline ? 'underline' : 'none';
        node.style.textAlign = resource.align;
        node.style.whiteSpace = 'pre-wrap';
        node.style.overflow = 'hidden';
        node.style.overflowWrap = 'anywhere';
        node.style.wordBreak = 'break-word';
        node.style.padding = '3px 6px';
        if (resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]) node.style.fontFamily = __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey];
        else node.style.removeProperty('font-family');
    });
    __pmAutoFitPdfTextResources();
}

function __pmNormalizePdfStyle(raw = {}) {
    const base = { ...__PM_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    return {
        fontFamilyKey: __PM_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __PM_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __pmClampStyleNumber(base.headerLinePx, 1, 16, __PM_PDF_STYLE_DEFAULTS.headerLinePx),
        signLinePx: __pmClampStyleNumber(base.signLinePx, 1, 16, __PM_PDF_STYLE_DEFAULTS.signLinePx),
        titlePx: __pmClampStyleNumber(base.titlePx, 20, 42, __PM_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __pmClampStyleNumber(base.metaPx, 8, 18, __PM_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __pmClampStyleNumber(base.tableHeadPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __pmClampStyleNumber(base.tableBodyPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __pmClampStyleNumber(base.lineHeightPct, 90, 180, __PM_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __pmClampStyleNumber(base.quickPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __pmClampStyleNumber(base.conditionsPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __pmClampStyleNumber(base.signPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __pmClampStyleNumber(base.footerPx, 8, 14, __PM_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __pmClampStyleNumber(base.offsetXPx, -120, 120, __PM_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __pmClampStyleNumber(base.offsetYPx, -120, 120, __PM_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __pmClampStyleNumber(base.extraPages, -1, 6, __PM_PDF_STYLE_DEFAULTS.extraPages),
        baseLayouts: __pmNormalizePdfBaseLayouts(base.baseLayouts),
        baseTextStyles: __pmNormalizePdfBaseTextStyles(base.baseTextStyles),
        resources: __pmNormalizePdfResources(base.resources),
        content: __pmNormalizePdfContent(base.content),
        headerAlign: __pmNormalizeStyleAlign(base.headerAlign, __PM_PDF_STYLE_DEFAULTS.headerAlign),
        metaAlign: __pmNormalizeStyleAlign(base.metaAlign, __PM_PDF_STYLE_DEFAULTS.metaAlign),
        tableAlign: __pmNormalizeStyleAlign(base.tableAlign, __PM_PDF_STYLE_DEFAULTS.tableAlign),
        quickAlign: __pmNormalizeStyleAlign(base.quickAlign, __PM_PDF_STYLE_DEFAULTS.quickAlign),
        conditionsAlign: __pmNormalizeStyleAlign(base.conditionsAlign, __PM_PDF_STYLE_DEFAULTS.conditionsAlign),
        signAlign: __pmNormalizeStyleAlign(base.signAlign, __PM_PDF_STYLE_DEFAULTS.signAlign),
        summaryAlign: __pmNormalizeStyleAlign(base.summaryAlign, __PM_PDF_STYLE_DEFAULTS.summaryAlign),
        footerAlign: __pmNormalizeStyleAlign(base.footerAlign, __PM_PDF_STYLE_DEFAULTS.footerAlign)
    };
}

function __pmNormalizePdfStyleProfileKey(profile) {
    const safe = String(profile || '').toLowerCase();
    if (__PM_PDF_STYLE_PROFILE_KEYS.includes(safe)) return safe;
    return safe === 'order' ? 'order' : 'quote';
}

function __pmExtractPdfStyleProfile(raw, profile = 'quote') {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const normalizedProfile = __pmNormalizePdfStyleProfileKey(profile);
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    if (profiles) {
        const candidate = profiles[normalizedProfile] || profiles.quote || profiles.default;
        if (candidate && typeof candidate === 'object') return candidate;
    }
    return cfg;
}

function __pmNormalizePdfStyleProfiles(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    const fallback = __pmNormalizePdfStyle(profiles ? (profiles.quote || profiles.default || __PM_PDF_STYLE_DEFAULTS) : cfg);
    const out = {};
    __PM_PDF_STYLE_PROFILE_KEYS.forEach((profileKey) => {
        out[profileKey] = __pmNormalizePdfStyle(profiles ? (profiles[profileKey] || fallback) : fallback);
    });
    return out;
}

function __pmBuildPdfStyleConfigPayload(rawExisting, style, profile = __pmPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const normalizedProfile = __pmNormalizePdfStyleProfileKey(profile);
    const profiles = __pmNormalizePdfStyleProfiles(existing);
    profiles[normalizedProfile] = __pmNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __PM_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: new Date().toISOString(),
        profiles
    };
}

function __pmLoadPdfStyleState() {
    return __pmNormalizePdfStyle();
}

function __pmLoadPdfStyleUiState() {
    try {
        const raw = localStorage.getItem(__PM_PDF_STYLE_UI_STATE_KEY);
        if (!raw) return { collapsed: false, pinned: false };
        const parsed = JSON.parse(raw);
        return { collapsed: !!parsed?.collapsed, pinned: !!parsed?.pinned };
    } catch (_) {
        return { collapsed: false, pinned: false };
    }
}

function __pmSavePdfStyleUiState() {
    try {
        localStorage.setItem(__PM_PDF_STYLE_UI_STATE_KEY, JSON.stringify(__pmPdfStyleUiState));
    } catch (_) {}
}

function __pmGetPdfStyleConfig() {
    if (!__pmPdfStyleState) __pmPdfStyleState = __pmLoadPdfStyleState();
    return { ...__pmPdfStyleState };
}

function __pmPdfStyleVars(style) {
    const safe = __pmNormalizePdfStyle(style);
    const headerAlign = safe.headerAlign === 'justify' ? 'left' : safe.headerAlign;
    return {
        '--pm-font-family': __PM_PDF_STYLE_FONT_MAP[safe.fontFamilyKey],
        '--pm-header-line': `${safe.headerLinePx}px`,
        '--pm-sign-line': `${safe.signLinePx}px`,
        '--pm-title-size': `${safe.titlePx}px`,
        '--pm-meta-size': `${safe.metaPx}px`,
        '--pm-date-size': `${Math.max(8, safe.metaPx - 2)}px`,
        '--pm-table-head-size': `${safe.tableHeadPx}px`,
        '--pm-table-body-size': `${safe.tableBodyPx}px`,
        '--pm-line-height': `${(safe.lineHeightPct / 100).toFixed(2)}`,
        '--pm-quick-size': `${safe.quickPx}px`,
        '--pm-conditions-size': `${safe.conditionsPx}px`,
        '--pm-sign-size': `${safe.signPx}px`,
        '--pm-footer-size': `${safe.footerPx}px`,
        '--pm-offset-x': `${safe.offsetXPx}px`,
        '--pm-offset-y': `${safe.offsetYPx}px`,
        '--pm-header-align': headerAlign,
        '--pm-header-justify': headerAlign === 'left' ? 'flex-start' : (headerAlign === 'center' ? 'center' : 'flex-end'),
        '--pm-meta-align': safe.metaAlign,
        '--pm-table-align': safe.tableAlign,
        '--pm-quick-align': safe.quickAlign,
        '--pm-conditions-align': safe.conditionsAlign,
        '--pm-sign-align': safe.signAlign,
        '--pm-summary-align': safe.summaryAlign,
        '--pm-footer-align': safe.footerAlign
    };
}

function __pmPdfStyleVarsInline(style) {
    const vars = __pmPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __pmApplyPdfBaseLayouts() {
    const cfg = __pmGetPdfStyleConfig();
    const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    document.querySelectorAll('#pdf-content [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        const layout = layouts[key] || __pmNormalizePdfBaseLayout();
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = __pmBuildPdfBaseTransform(layout);
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('pm-pdf-editable', __pmIsAdminProfile());
    });
}

function __pmCommitPdfBaseLayout(key, layout) {
    const meta = __pmGetPdfBaseBlockMeta(key);
    if (!meta) return;
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = {
        ...__pmNormalizePdfBaseLayouts(cfg.baseLayouts),
        [meta.key]: __pmNormalizePdfBaseLayout(layout)
    };
    const next = __pmNormalizePdfStyle({ ...cfg, baseLayouts });
    __pmSetPdfStyleConfig(next, { applyToDom: false });
    __pmApplyPdfBaseLayouts();
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmCommitBaseLayoutField(baseId, field, rawValue) {
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const meta = __pmGetPdfBaseBlockMeta(key);
    if (!meta) return;
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[meta.key] || __pmNormalizePdfBaseLayout();
    let nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __pmClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __pmClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __pmNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [meta.key]: __pmNormalizePdfBaseLayout(nextLayout)
        }
    });
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmApplyPdfBaseTextStyles() {
    const cfg = __pmGetPdfStyleConfig();
    const styles = __pmNormalizePdfBaseTextStyles(cfg.baseTextStyles);
    document.querySelectorAll('#pdf-content [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        const styleCfg = styles[key] || __PM_PDF_BASE_TEXT_STYLE_DEFAULTS;
        const hasFontFamily = !!styleCfg.fontFamilyKey && !!__PM_PDF_STYLE_FONT_MAP[styleCfg.fontFamilyKey];
        const hasFontSize = Number.isFinite(styleCfg.fontSize) && styleCfg.fontSize > 0;
        const hasColor = !!styleCfg.color;
        node.classList.toggle('pm-pdf-base-font-family', hasFontFamily);
        node.classList.toggle('pm-pdf-base-font-size', hasFontSize);
        node.classList.toggle('pm-pdf-base-color', hasColor);
        node.classList.toggle('pm-pdf-base-font-weight', !!styleCfg.bold);
        node.classList.toggle('pm-pdf-base-font-italic', !!styleCfg.italic);
        node.classList.toggle('pm-pdf-base-font-underline', !!styleCfg.underline);
        if (hasFontFamily) node.style.setProperty('--pm-base-font-family', __PM_PDF_STYLE_FONT_MAP[styleCfg.fontFamilyKey]);
        else node.style.removeProperty('--pm-base-font-family');
        if (hasFontSize) node.style.setProperty('--pm-base-font-size', `${styleCfg.fontSize}px`);
        else node.style.removeProperty('--pm-base-font-size');
        if (hasColor) node.style.setProperty('--pm-base-color', styleCfg.color);
        else node.style.removeProperty('--pm-base-color');
    });
}

function __pmCommitPdfBaseBlockInspectorField(key, field, rawValue) {
    const meta = __pmGetPdfBaseBlockMeta(key);
    if (!meta) return;
    const cfg = __pmGetPdfStyleConfig();
    const nextRaw = { ...cfg };
    const baseTextStyles = {
        ...__pmNormalizePdfBaseTextStyles(cfg.baseTextStyles),
        [meta.key]: __pmNormalizePdfBaseTextStyle((cfg.baseTextStyles || {})[meta.key] || {})
    };
    const currentStyle = baseTextStyles[meta.key];
    if (field === 'align' && meta.alignField) {
        nextRaw[meta.alignField] = __pmNormalizeStyleAlign(rawValue, cfg[meta.alignField] || 'left');
    } else if (field === 'fontSize') {
        if (meta.sizeField) {
            const limits = __PM_PDF_BASE_SIZE_LIMITS[meta.sizeField] || { min: 8, max: 72 };
            nextRaw[meta.sizeField] = __pmClampStyleNumber(rawValue, limits.min, limits.max, cfg[meta.sizeField] || __PM_PDF_STYLE_DEFAULTS[meta.sizeField] || 12);
            if (meta.sizeField === 'tableBodyPx') {
                nextRaw.tableHeadPx = __pmClampStyleNumber((parseInt(nextRaw.tableBodyPx, 10) || cfg.tableBodyPx) + 2, 9, 18, cfg.tableHeadPx);
            }
        } else {
            baseTextStyles[meta.key] = __pmNormalizePdfBaseTextStyle({ ...currentStyle, fontSize: rawValue });
        }
    } else if (field === 'fontFamilyKey') {
        baseTextStyles[meta.key] = __pmNormalizePdfBaseTextStyle({ ...currentStyle, fontFamilyKey: rawValue });
    } else if (field === 'color') {
        baseTextStyles[meta.key] = __pmNormalizePdfBaseTextStyle({ ...currentStyle, color: rawValue });
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        baseTextStyles[meta.key] = __pmNormalizePdfBaseTextStyle({ ...currentStyle, [field]: !!rawValue });
    } else {
        return;
    }
    nextRaw.baseTextStyles = baseTextStyles;
    const next = __pmNormalizePdfStyle(nextRaw);
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmCommitPdfContentField(field, rawValue) {
    const schema = __pmGetPdfContentEditorFieldConfig(field);
    if (!schema) return;
    const cfg = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({
        ...cfg,
        content: {
            ...__pmNormalizePdfContent(cfg.content),
            [schema.key]: String(rawValue || '').slice(0, schema.max || 5000)
        }
    });
    __pmSetPdfStyleConfig(next, { applyToDom: false });
    __pmRefreshPreviewFromStyleState();
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmResetPdfBaseBlockInspectorStyle(key) {
    const meta = __pmGetPdfBaseBlockMeta(key);
    if (!meta) return;
    const cfg = __pmGetPdfStyleConfig();
    const nextRaw = { ...cfg };
    const baseTextStyles = __pmNormalizePdfBaseTextStyles(cfg.baseTextStyles);
    baseTextStyles[meta.key] = __pmNormalizePdfBaseTextStyle({});
    nextRaw.baseTextStyles = baseTextStyles;
    if (meta.alignField && Object.prototype.hasOwnProperty.call(__PM_PDF_STYLE_DEFAULTS, meta.alignField)) {
        nextRaw[meta.alignField] = __PM_PDF_STYLE_DEFAULTS[meta.alignField];
    }
    if (meta.sizeField && Object.prototype.hasOwnProperty.call(__PM_PDF_STYLE_DEFAULTS, meta.sizeField)) {
        nextRaw[meta.sizeField] = __PM_PDF_STYLE_DEFAULTS[meta.sizeField];
        if (meta.sizeField === 'tableBodyPx') nextRaw.tableHeadPx = __PM_PDF_STYLE_DEFAULTS.tableHeadPx;
    }
    const next = __pmNormalizePdfStyle(nextRaw);
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmCommitPdfResourceInspectorField(resourceId, field, rawValue) {
    const resources = __pmGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    if (field === 'text') {
        resources[idx].text = String(rawValue || '').slice(0, 180);
    } else if (field === 'fontFamilyKey') {
        resources[idx].fontFamilyKey = __pmNormalizeOptionalFontKey(rawValue);
    } else if (field === 'fontSize') {
        resources[idx].fontSize = __pmClampStyleNumber(rawValue, 8, 72, resources[idx].fontSize);
    } else if (field === 'align') {
        resources[idx].align = __pmNormalizeStyleAlign(rawValue, resources[idx].align);
    } else if (field === 'color') {
        resources[idx].color = __pmNormalizeHexColor(rawValue, resources[idx].color);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        resources[idx][field] = !!rawValue;
    } else {
        return;
    }
    __pmCommitPdfResources(resources, { refreshPreview: false });
}

function __pmResetPdfResourceInspectorStyle(resourceId) {
    const resources = __pmGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    const current = resources[idx];
    const reset = __pmNormalizePdfResources([{
        id: current.id,
        type: current.type,
        enabled: current.enabled,
        page: current.page,
        x: current.x,
        y: current.y,
        w: current.w,
        h: current.h,
        text: current.text
    }])[0];
    resources[idx] = { ...current, ...reset, text: current.text };
    __pmCommitPdfResources(resources, { refreshPreview: false });
}

function __pmSyncPreviewEditMode() {
    const editingEnabled = __pmIsAdminProfile() && !__pmPdfPreviewEditLocked;
    document.querySelectorAll('#pdf-content .pm-pdf-root').forEach((node) => {
        node.classList.toggle('pm-pdf-admin-enabled', editingEnabled);
    });
    const toggleBtn = document.getElementById('pm-pdf-edit-toggle');
    if (toggleBtn) {
        toggleBtn.classList.toggle('hidden', !__pmIsAdminProfile());
        toggleBtn.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>Edición</span>`;
        toggleBtn.classList.toggle('bg-emerald-600', editingEnabled);
        toggleBtn.classList.toggle('hover:bg-emerald-500', editingEnabled);
        toggleBtn.classList.toggle('border-emerald-400/50', editingEnabled);
        toggleBtn.classList.toggle('bg-gray-800', !editingEnabled);
        toggleBtn.classList.toggle('hover:bg-gray-700', !editingEnabled);
        toggleBtn.classList.toggle('border-gray-700', !editingEnabled);
    }
}

function __pmGetPdfTextInspectorTarget() {
    if (!__pmPdfTextInspectorState || !__pmIsAdminProfile()) return null;
    const cfg = __pmGetPdfStyleConfig();
    if (__pmPdfTextInspectorState.kind === 'base') {
        const meta = __pmGetPdfBaseBlockMeta(__pmPdfTextInspectorState.key);
        if (!meta) return null;
        if (meta.kind === 'shape' || meta.inspectorEnabled === false) return null;
        const custom = __pmNormalizePdfBaseTextStyles(cfg.baseTextStyles)[meta.key] || __PM_PDF_BASE_TEXT_STYLE_DEFAULTS;
        const baseFontSize = meta.sizeField ? Number(cfg[meta.sizeField] || __PM_PDF_STYLE_DEFAULTS[meta.sizeField] || 12) : Number(custom.fontSize || 14);
        return {
            kind: 'base',
            id: meta.key,
            label: meta.label,
            fontFamilyKey: custom.fontFamilyKey || cfg.fontFamilyKey,
            fontSize: baseFontSize,
            align: meta.alignField ? String(cfg[meta.alignField] || 'left') : 'left',
            color: custom.color || '#111827',
            bold: custom.bold,
            italic: custom.italic,
            underline: custom.underline,
            text: '',
            allowText: false,
            contentFields: meta.contentEditor && __PM_PDF_CONTENT_EDITOR_FIELDS[meta.contentEditor]
                ? __PM_PDF_CONTENT_EDITOR_FIELDS[meta.contentEditor].map((field) => ({
                    ...field,
                    value: String(__pmNormalizePdfContent(cfg.content)[field.key] || '')
                }))
                : []
        };
    }
    if (__pmPdfTextInspectorState.kind === 'resource') {
        const resource = __pmGetPdfResourcesFromState().find((item) => item.id === __pmPdfTextInspectorState.id);
        if (!resource || resource.type === 'bar' || resource.type === 'logo') return null;
        return {
            kind: 'resource',
            id: resource.id,
            label: resource.type === 'title' ? 'Título libre' : 'Texto libre',
            fontFamilyKey: resource.fontFamilyKey || cfg.fontFamilyKey,
            fontSize: Number(resource.fontSize || 14),
            align: resource.align || 'left',
            color: resource.color || '#111827',
            bold: !!resource.bold,
            italic: !!resource.italic,
            underline: !!resource.underline,
            text: resource.text || '',
            allowText: true,
            contentFields: []
        };
    }
    return null;
}

function __pmGetPdfTextInspectorAnchorNode() {
    if (!__pmPdfTextInspectorState) return null;
    if (__pmPdfTextInspectorState.kind === 'resource') {
        const selector = __pmPdfTextInspectorState.page
            ? `#pdf-content .pm-pdf-resource[data-res-id="${__pmPdfTextInspectorState.id}"][data-res-page="${__pmPdfTextInspectorState.page}"]`
            : `#pdf-content .pm-pdf-resource[data-res-id="${__pmPdfTextInspectorState.id}"]`;
        return document.querySelector(selector);
    }
    if (__pmPdfTextInspectorState.kind === 'base') {
        const nodes = Array.from(document.querySelectorAll(`#pdf-content [data-base-resource="${__pmPdfTextInspectorState.key}"]`));
        if (!nodes.length) return null;
        const preferredIndex = Number.isFinite(__pmPdfTextInspectorState.anchorIndex)
            ? __pmPdfTextInspectorState.anchorIndex
            : 0;
        return nodes[Math.max(0, Math.min(nodes.length - 1, preferredIndex))] || nodes[0];
    }
    return document.querySelector('#pdf-content .pm-pdf-edit-selected');
}

function __pmPositionPdfTextInspector() {
    const panel = document.getElementById('pm-pdf-text-inspector');
    const previewContainer = document.getElementById('preview-container');
    const anchorNode = __pmGetPdfTextInspectorAnchorNode();
    if (!panel || !previewContainer || !anchorNode || panel.classList.contains('hidden')) return;
    const containerRect = previewContainer.getBoundingClientRect();
    const anchorRect = anchorNode.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 290;
    const panelHeight = panel.offsetHeight || 260;
    const gap = 14;
    const scrollLeft = previewContainer.scrollLeft;
    const scrollTop = previewContainer.scrollTop;
    const minLeft = scrollLeft + 8;
    const maxLeft = Math.max(minLeft, scrollLeft + previewContainer.clientWidth - panelWidth - 8);
    const minTop = scrollTop + 8;
    const maxTop = Math.max(minTop, scrollTop + previewContainer.clientHeight - panelHeight - 8);
    let left = (anchorRect.right - containerRect.left) + scrollLeft + gap;
    if (left > maxLeft) left = (anchorRect.left - containerRect.left) + scrollLeft - panelWidth - gap;
    if (left < minLeft) left = Math.max(minLeft, Math.min(maxLeft, (anchorRect.left - containerRect.left) + scrollLeft));
    let top = (anchorRect.top - containerRect.top) + scrollTop;
    top = Math.max(minTop, Math.min(maxTop, top));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
}

function __pmRenderPdfTextInspector() {
    const panel = document.getElementById('pm-pdf-text-inspector');
    if (!panel) return;
    const target = __pmGetPdfTextInspectorTarget();
    if (!target || __pmPdfPreviewEditLocked) {
        panel.classList.add('hidden');
        return;
    }
    const title = panel.querySelector('[data-inspector-role="title"]');
    const textRow = panel.querySelector('[data-inspector-row="text"]');
    const textInput = panel.querySelector('[data-inspector-field="text"]');
    const fontSelect = panel.querySelector('[data-inspector-field="fontFamilyKey"]');
    const fontSize = panel.querySelector('[data-inspector-field="fontSize"]');
    const colorInput = panel.querySelector('[data-inspector-field="color"]');
    const alignSelect = panel.querySelector('[data-inspector-field="align"]');
    const contentSection = panel.querySelector('[data-inspector-content-section]');
    if (title) title.textContent = target.label;
    if (textRow) textRow.classList.toggle('hidden', !target.allowText);
    if (textInput) {
        textInput.value = target.text || '';
        textInput.dataset.targetId = target.id;
        textInput.dataset.targetKind = target.kind;
    }
    if (fontSelect) {
        fontSelect.innerHTML = __pmRenderFontFamilyOptions(target.fontFamilyKey || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey);
        fontSelect.dataset.targetId = target.id;
        fontSelect.dataset.targetKind = target.kind;
    }
    if (fontSize) {
        fontSize.value = String(target.fontSize || 14);
        fontSize.dataset.targetId = target.id;
        fontSize.dataset.targetKind = target.kind;
    }
    if (colorInput) {
        colorInput.value = target.color || '#111827';
        colorInput.dataset.targetId = target.id;
        colorInput.dataset.targetKind = target.kind;
    }
    if (alignSelect) {
        alignSelect.value = target.align || 'left';
        alignSelect.dataset.targetId = target.id;
        alignSelect.dataset.targetKind = target.kind;
    }
    if (contentSection) {
        const fields = Array.isArray(target.contentFields) ? target.contentFields : [];
        if (fields.length) {
            contentSection.classList.remove('hidden');
            contentSection.innerHTML = fields.map((field) => {
                if (field.multiline) {
                    return `<label class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span>
                        <textarea data-content-field="${field.key}" rows="${field.rows || 4}" maxlength="${field.max || 5000}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__pmSafeHtml(field.value || '')}</textarea>
                    </label>`;
                }
                return `<label class="flex flex-col gap-1">
                    <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span>
                    <input data-content-field="${field.key}" type="text" maxlength="${field.max || 5000}" value="${__pmSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
                </label>`;
            }).join('');
        } else {
            contentSection.classList.add('hidden');
            contentSection.innerHTML = '';
        }
    }
    panel.querySelectorAll('[data-inspector-toggle]').forEach((btn) => {
        const field = String(btn.getAttribute('data-inspector-toggle') || '');
        const active = !!target[field];
        btn.dataset.targetId = target.id;
        btn.dataset.targetKind = target.kind;
        btn.classList.toggle('bg-brand-red', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('border-brand-red', active);
        btn.classList.toggle('bg-white', !active);
        btn.classList.toggle('text-gray-600', !active);
        btn.classList.toggle('border-gray-200', !active);
    });
    const resetBtn = panel.querySelector('[data-inspector-action="reset"]');
    if (resetBtn) {
        resetBtn.dataset.targetId = target.id;
        resetBtn.dataset.targetKind = target.kind;
    }
    panel.classList.remove('hidden');
    requestAnimationFrame(__pmPositionPdfTextInspector);
}

function __pmClosePdfTextInspector() {
    __pmPdfTextInspectorState = null;
    const panel = document.getElementById('pm-pdf-text-inspector');
    if (panel) panel.classList.add('hidden');
}

function __pmOpenPdfTextInspector(state) {
    if (!state || __pmPdfPreviewEditLocked || !__pmIsAdminProfile()) return;
    __pmPdfTextInspectorState = { ...state };
    if (state.kind === 'base') __pmPdfResourceEditorSelectedId = `base:${state.key}`;
    if (state.kind === 'resource') __pmPdfResourceEditorSelectedId = state.id;
    __pmHighlightSelectedBaseTextBlock();
    __pmRenderPdfTextInspector();
}

function __pmHandlePdfTextInspectorInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const contentField = String(target.getAttribute('data-content-field') || '');
    if (contentField) {
        if (event.type === 'change') {
            __pmCommitPdfContentField(contentField, target.value);
            __pmRenderPdfTextInspector();
        }
        return;
    }
    const field = String(target.getAttribute('data-inspector-field') || '');
    const kind = String(target.getAttribute('data-target-kind') || '');
    const id = String(target.getAttribute('data-target-id') || '');
    if (!field || !kind || !id) return;
    const rawValue = target.type === 'checkbox'
        ? !!target.checked
        : target.value;
    if (kind === 'base') __pmCommitPdfBaseBlockInspectorField(id, field, rawValue);
    if (kind === 'resource') __pmCommitPdfResourceInspectorField(id, field, rawValue);
    __pmRenderPdfTextInspector();
}

function __pmHandlePdfTextInspectorClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-inspector-action],[data-inspector-toggle]') : null;
    if (!button) return;
    const action = String(button.getAttribute('data-inspector-action') || '');
    const toggleField = String(button.getAttribute('data-inspector-toggle') || '');
    const kind = String(button.getAttribute('data-target-kind') || '');
    const id = String(button.getAttribute('data-target-id') || '');
    if (action === 'close') {
        __pmClosePdfTextInspector();
        return;
    }
    if (!kind || !id) return;
    if (action === 'reset') {
        if (kind === 'base') __pmResetPdfBaseBlockInspectorStyle(id);
        if (kind === 'resource') __pmResetPdfResourceInspectorStyle(id);
        __pmRenderPdfTextInspector();
        return;
    }
    if (!toggleField) return;
    const target = __pmGetPdfTextInspectorTarget();
    if (!target) return;
    const nextValue = !target[toggleField];
    if (kind === 'base') __pmCommitPdfBaseBlockInspectorField(id, toggleField, nextValue);
    if (kind === 'resource') __pmCommitPdfResourceInspectorField(id, toggleField, nextValue);
    __pmRenderPdfTextInspector();
}

function __pmSetPreviewEditLocked(locked) {
    __pmPdfPreviewEditLocked = locked !== false;
    if (__pmPdfPreviewEditLocked) __pmClosePdfTextInspector();
    __pmSyncPreviewEditMode();
}

function __pmResetPreviewEditingState() {
    __pmPdfResourcePointerState = null;
    __pmPdfResourceEditorSelectedId = '';
    __pmSetPreviewEditLocked(true);
    __pmHighlightSelectedBaseTextBlock();
}

function __pmEnsurePreviewEditingChrome() {
    const previewModal = document.getElementById('preview-modal');
    const previewContainer = document.getElementById('preview-container');
    if (!previewModal || !previewContainer) return;
    const header = previewModal.querySelector('.bg-gray-900');
    const actionBar = header?.lastElementChild;
    if (actionBar && !document.getElementById('pm-pdf-edit-toggle')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'pm-pdf-edit-toggle';
        button.className = 'hidden inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition';
        button.addEventListener('click', () => __pmSetPreviewEditLocked(!__pmPdfPreviewEditLocked));
        actionBar.insertBefore(button, actionBar.firstChild || null);
    }
    previewContainer.style.position = 'relative';
    if (!document.getElementById('pm-pdf-text-inspector')) {
        const panel = document.createElement('aside');
        panel.id = 'pm-pdf-text-inspector';
        panel.className = 'hidden absolute z-[90] w-[290px] max-w-[calc(100%-2rem)] rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur';
        panel.innerHTML = `
            <div class="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Edición</p>
                    <h4 data-inspector-role="title" class="text-sm font-black text-gray-800">Texto</h4>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" data-inspector-action="reset" class="rounded-full border border-gray-200 px-3 py-1 text-[10px] font-black uppercase text-gray-500 transition hover:border-brand-red hover:text-brand-red">Restablecer</button>
                    <button type="button" data-inspector-action="close" class="h-8 w-8 rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="space-y-3 px-4 py-4 text-xs text-gray-600">
                <label data-inspector-row="text" class="flex flex-col gap-1">
                    <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Texto</span>
                    <textarea data-inspector-field="text" rows="3" maxlength="180" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></textarea>
                </label>
                <div data-inspector-content-section class="hidden space-y-3"></div>
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fuente</span>
                        <select data-inspector-field="fontFamilyKey" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></select>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Tamaño</span>
                        <input data-inspector-field="fontSize" type="number" min="8" max="72" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Color</span>
                        <input data-inspector-field="color" type="color" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red">
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alineación</span>
                        <select data-inspector-field="align" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
                            <option value="left">Izquierda</option>
                            <option value="center">Centro</option>
                            <option value="right">Derecha</option>
                            <option value="justify">Justificado</option>
                        </select>
                    </label>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <button type="button" data-inspector-toggle="bold" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Negrita</button>
                    <button type="button" data-inspector-toggle="italic" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Itálica</button>
                    <button type="button" data-inspector-toggle="underline" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Subrayado</button>
                </div>
            </div>`;
        previewContainer.appendChild(panel);
        panel.addEventListener('input', __pmHandlePdfTextInspectorInput);
        panel.addEventListener('change', __pmHandlePdfTextInspectorInput);
        panel.addEventListener('click', __pmHandlePdfTextInspectorClick);
    }
    if (previewContainer.dataset.pmPdfTextInspectorPositionBound !== '1') {
        previewContainer.dataset.pmPdfTextInspectorPositionBound = '1';
        previewContainer.addEventListener('scroll', () => requestAnimationFrame(__pmPositionPdfTextInspector), { passive: true });
        window.addEventListener('resize', () => requestAnimationFrame(__pmPositionPdfTextInspector));
    }
    if (document.body.dataset.pmPdfTextInspectorBound !== '1') {
        document.body.dataset.pmPdfTextInspectorBound = '1';
        document.addEventListener('dblclick', (event) => {
            if (!__pmIsAdminProfile() || __pmPdfPreviewEditLocked) return;
            const eventTarget = event.target instanceof Element ? event.target : null;
            if (!eventTarget) return;
            if (eventTarget.closest('#pm-pdf-text-inspector')) return;
            const resourceNode = eventTarget.closest('#pdf-content .pm-pdf-resource[data-res-id][data-res-type]:not([data-res-type="bar"]):not([data-res-type="logo"])');
            if (resourceNode) {
                __pmOpenPdfTextInspector({
                    kind: 'resource',
                    id: String(resourceNode.getAttribute('data-res-id') || ''),
                    page: parseInt(resourceNode.getAttribute('data-res-page') || '1', 10)
                });
                return;
            }
            const baseNode = eventTarget.closest('#pdf-content [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            const baseMeta = __pmGetPdfBaseBlockMeta(baseKey);
            if (!baseMeta || baseMeta.kind === 'shape' || baseMeta.inspectorEnabled === false) return;
            const anchorNodes = Array.from(document.querySelectorAll(`#pdf-content [data-base-resource="${baseKey}"]`));
            __pmOpenPdfTextInspector({ kind: 'base', key: baseKey, anchorIndex: anchorNodes.indexOf(baseNode) });
        });
    }
    if (!__pmIsAdminProfile()) __pmClosePdfTextInspector();
    __pmSyncPreviewEditMode();
    __pmRenderPdfTextInspector();
}

function __pmApplyPdfStyleToLivePreview() {
    const rootNodes = document.querySelectorAll('#pdf-content .pm-pdf-root');
    if (!rootNodes.length) return;
    const vars = __pmPdfStyleVars(__pmGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __pmApplyPdfBaseLayouts();
    __pmApplyPdfBaseTextStyles();
    __pmEnsurePreviewEditingChrome();
    __pmSyncPdfResourceNodes();
    __pmBindPdfResourceDrag();
    __pmHighlightSelectedBaseTextBlock();
    if (__pmIsAdminProfile()) __pmRenderPdfResourcesEditorList();
}

function __pmSyncPdfStyleValueLabels(style) {
    const cfg = __pmNormalizePdfStyle(style);
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('pdf-style-header-line-value', `${cfg.headerLinePx}px`);
    setText('pdf-style-title-size-value', `${cfg.titlePx}px`);
    setText('pdf-style-meta-size-value', `${cfg.metaPx}px`);
    setText('pdf-style-table-size-value', `${cfg.tableBodyPx}px`);
    setText('pdf-style-line-height-value', `${cfg.lineHeightPct}%`);
    setText('pdf-style-offset-x-value', `${cfg.offsetXPx}px`);
    setText('pdf-style-offset-y-value', `${cfg.offsetYPx}px`);
    setText('pdf-style-extra-pages-value', `${cfg.extraPages >= 0 ? '+' : ''}${cfg.extraPages}`);
    setText('pdf-style-quick-size-value', `${cfg.quickPx}px`);
    setText('pdf-style-conditions-size-value', `${cfg.conditionsPx}px`);
    setText('pdf-style-sign-size-value', `${cfg.signPx}px`);
}

function __pmWritePdfStyleControls(style) {
    const cfg = __pmNormalizePdfStyle(style);
    const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
    setValue('pdf-style-font-family', cfg.fontFamilyKey);
    setValue('pdf-style-header-line', cfg.headerLinePx);
    setValue('pdf-style-title-size', cfg.titlePx);
    setValue('pdf-style-meta-size', cfg.metaPx);
    setValue('pdf-style-table-size', cfg.tableBodyPx);
    setValue('pdf-style-line-height', cfg.lineHeightPct);
    setValue('pdf-style-offset-x', cfg.offsetXPx);
    setValue('pdf-style-offset-y', cfg.offsetYPx);
    setValue('pdf-style-extra-pages', cfg.extraPages);
    setValue('pdf-style-quick-size', cfg.quickPx);
    setValue('pdf-style-conditions-size', cfg.conditionsPx);
    setValue('pdf-style-sign-size', cfg.signPx);
    setValue('pdf-style-align-header', cfg.headerAlign);
    setValue('pdf-style-align-meta', cfg.metaAlign);
    setValue('pdf-style-align-table', cfg.tableAlign);
    setValue('pdf-style-align-quick', cfg.quickAlign);
    setValue('pdf-style-align-conditions', cfg.conditionsAlign);
    setValue('pdf-style-align-sign', cfg.signAlign);
    setValue('pdf-style-align-summary', cfg.summaryAlign);
    setValue('pdf-style-align-footer', cfg.footerAlign);
    __pmSyncPdfStyleValueLabels(cfg);
}

function __pmReadPdfStyleControls() {
    const current = __pmGetPdfStyleConfig();
    return __pmNormalizePdfStyle({
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __PM_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
        tableBodyPx: document.getElementById('pdf-style-table-size')?.value,
        lineHeightPct: document.getElementById('pdf-style-line-height')?.value,
        offsetXPx: document.getElementById('pdf-style-offset-x')?.value,
        offsetYPx: document.getElementById('pdf-style-offset-y')?.value,
        extraPages: document.getElementById('pdf-style-extra-pages')?.value,
        baseLayouts: current.baseLayouts,
        baseTextStyles: current.baseTextStyles,
        resources: current.resources,
        content: current.content,
        quickPx: document.getElementById('pdf-style-quick-size')?.value,
        conditionsPx: document.getElementById('pdf-style-conditions-size')?.value,
        signPx: document.getElementById('pdf-style-sign-size')?.value,
        footerPx: current.footerPx,
        headerAlign: document.getElementById('pdf-style-align-header')?.value,
        metaAlign: document.getElementById('pdf-style-align-meta')?.value,
        tableAlign: document.getElementById('pdf-style-align-table')?.value,
        quickAlign: document.getElementById('pdf-style-align-quick')?.value,
        conditionsAlign: document.getElementById('pdf-style-align-conditions')?.value,
        signAlign: document.getElementById('pdf-style-align-sign')?.value,
        summaryAlign: document.getElementById('pdf-style-align-summary')?.value,
        footerAlign: document.getElementById('pdf-style-align-footer')?.value
    });
}

function __pmSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __pmPdfStyleState = __pmNormalizePdfStyle(style);
    if (opts.applyToDom !== false) __pmApplyPdfStyleToLivePreview();
}

function __pmIsAdminProfile() {
    return String(window.currentUserProfile?.role || '').toLowerCase() === 'admin';
}

async function __pmLoadSharedPdfStyleConfig(profile = 'quote') {
    if (!window.tenantPocketBase) return;
    const profileKey = __pmNormalizePdfStyleProfileKey(profile);
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,valor_json')
            .eq('clave', __PM_PDF_STYLE_CONFIG_KEY)
            .maybeSingle();
        if (error || !data) {
            __pmPdfStyleActiveProfile = profileKey;
            return;
        }
        __pmPdfStyleConfigRecordId = String(data.id || '');
        const resolved = __pmExtractPdfStyleProfile(data.valor_json || __PM_PDF_STYLE_DEFAULTS, profileKey);
        __pmSetPdfStyleConfig(resolved || __PM_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __pmPdfStyleActiveProfile = profileKey;
    } catch (e) {
        console.warn('No se pudo cargar la tipografía PDF compartida (PM):', e);
    }
}

async function __pmEnsurePdfStyleProfile(docType) {
    const wanted = __pmNormalizePdfStyleProfileKey(docType === 'order' ? 'order' : 'quote');
    if (__pmPdfStyleActiveProfile === wanted && __pmPdfStyleState) return;
    await __pmLoadSharedPdfStyleConfig(wanted);
}

async function __pmPersistSharedPdfStyleConfig(style) {
    if (!__pmIsAdminProfile() || !window.tenantPocketBase) return;
    const normalized = __pmNormalizePdfStyle(style);
    try {
        let existingPayload = null;
        if (__pmPdfStyleConfigRecordId) {
            const { data: existing, error: existingError } = await window.tenantPocketBase
                .from('configuracion')
                .select('id,valor_json')
                .eq('id', __pmPdfStyleConfigRecordId)
                .maybeSingle();
            if (!existingError && existing?.id) {
                __pmPdfStyleConfigRecordId = String(existing.id);
                existingPayload = existing.valor_json && typeof existing.valor_json === 'object' ? existing.valor_json : {};
            }
        }
        if (!__pmPdfStyleConfigRecordId) {
            const { data: existing, error: existingError } = await window.tenantPocketBase
                .from('configuracion')
                .select('id,valor_json')
                .eq('clave', __PM_PDF_STYLE_CONFIG_KEY)
                .maybeSingle();
            if (!existingError && existing?.id) {
                __pmPdfStyleConfigRecordId = String(existing.id);
                existingPayload = existing.valor_json && typeof existing.valor_json === 'object' ? existing.valor_json : {};
            }
        }
        const payload = __pmBuildPdfStyleConfigPayload(existingPayload, normalized, __pmPdfStyleActiveProfile);
        if (__pmPdfStyleConfigRecordId) {
            const { error: updError } = await window.tenantPocketBase
                .from('configuracion')
                .update({ valor_json: payload })
                .eq('id', __pmPdfStyleConfigRecordId);
            if (updError) throw updError;
            return;
        }
        const { data: inserted, error: insError } = await window.tenantPocketBase
            .from('configuracion')
            .insert({ tenant: __PM_PDF_STYLE_TENANT, clave: __PM_PDF_STYLE_CONFIG_KEY, valor_json: payload })
            .select('id')
            .single();
        if (insError) throw insError;
        __pmPdfStyleConfigRecordId = String(inserted?.id || '');
    } catch (e) {
        console.warn('No se pudo guardar la tipografía PDF compartida (PM):', e);
    }
}

function __pmScheduleSharedPdfStyleSync(style) {
    if (!__pmIsAdminProfile()) return;
    if (__pmPdfStyleSyncTimer) clearTimeout(__pmPdfStyleSyncTimer);
    __pmPdfStyleSyncTimer = setTimeout(() => {
        __pmPersistSharedPdfStyleConfig(style || __pmPdfStyleState);
    }, 450);
}

function __pmHandlePdfStyleControlChange() {
    if (!__pmIsAdminProfile()) return;
    const next = __pmReadPdfStyleControls();
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmSyncPdfStyleValueLabels(next);
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmRefreshPreviewFromStyleState() {
    if (!currentPreviewOrder) return;
    const pdfContainer = document.getElementById('pdf-content');
    if (!pdfContainer || pdfContainer.classList.contains('hidden')) return;
    const docType = currentPreviewOrder.docType || 'quote';
    pdfContainer.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
    __pmApplyPdfStyleToLivePreview();
}

function __pmCommitPdfResources(resources, options = {}) {
    const cfg = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({ ...cfg, resources: __pmNormalizePdfResources(resources) });
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
    if (options.refreshPreview !== false) __pmRefreshPreviewFromStyleState();
    __pmRenderPdfResourcesEditorList();
}

function __pmGetPdfResourcesFromState() {
    return __pmNormalizePdfResources(__pmGetPdfStyleConfig().resources);
}

function __pmRenderFontFamilyOptions(selectedKey) {
    const selected = String(selectedKey || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey).toLowerCase();
    return Object.entries(__PM_PDF_STYLE_FONT_LABELS)
        .map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function __pmRenderBaseTextBlocksEditorList(cfg) {
    const baseLayouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    return __PM_PDF_BASE_TEXT_BLOCKS.map((block) => {
        const selectedClass = block.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-700';
        const sizeCfg = block.sizeField ? (__PM_PDF_BASE_SIZE_LIMITS[block.sizeField] || { min: 8, max: 72 }) : null;
        const sizeValue = block.sizeField ? Number(cfg[block.sizeField] || __PM_PDF_STYLE_DEFAULTS[block.sizeField] || 12) : null;
        const alignValue = String(cfg[block.alignField] || 'left');
        const layout = baseLayouts[block.key] || __pmNormalizePdfBaseLayout();
        const layoutHtml = `
            <div class="grid grid-cols-4 gap-1">
                <label class="text-[9px] text-gray-400">X
                    <input data-base-id="${block.id}" data-base-layout-field="x" type="number" value="${layout.x}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                </label>
                <label class="text-[9px] text-gray-400">Y
                    <input data-base-id="${block.id}" data-base-layout-field="y" type="number" value="${layout.y}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                </label>
                <label class="text-[9px] text-gray-400">Escala
                    <input data-base-id="${block.id}" data-base-layout-field="scalePct" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${layout.scalePct}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                </label>
                <label class="text-[9px] text-gray-400">Visible
                    <select data-base-id="${block.id}" data-base-layout-field="visible" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        <option value="true" ${!layout.hidden ? 'selected' : ''}>Si</option>
                        <option value="false" ${layout.hidden ? 'selected' : ''}>No</option>
                    </select>
                </label>
            </div>
        `;
        if (block.kind === 'shape') {
            return `
                <div class="border ${selectedClass} rounded-md p-2 bg-gray-900/70 space-y-1">
                    <div class="flex items-center justify-between gap-1">
                        <button type="button" data-base-action="select" data-base-id="${block.id}" class="text-[10px] font-bold uppercase text-gray-100">${block.label}</button>
                        <span class="text-[9px] uppercase text-gray-400">Forma</span>
                    </div>
                    <div class="grid grid-cols-2 gap-1">
                        ${sizeCfg ? `<label class="text-[9px] text-gray-400">Grosor
                            <input data-base-id="${block.id}" data-base-field="${block.sizeField}" type="number" min="${sizeCfg.min}" max="${sizeCfg.max}" value="${sizeValue}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        </label>` : '<div></div>'}
                        <div class="text-[9px] text-gray-500 flex items-end">Mueve, escala u oculta</div>
                    </div>
                    ${layoutHtml}
                </div>
            `;
        }
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-900/70 space-y-1">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-base-action="select" data-base-id="${block.id}" class="text-[10px] font-bold uppercase text-gray-100">${block.label}</button>
                    <span class="text-[9px] uppercase text-gray-400">Base</span>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400">Fuente
                        <select data-base-id="${block.id}" data-base-field="fontFamilyKey" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            ${__pmRenderFontFamilyOptions(cfg.fontFamilyKey)}
                        </select>
                    </label>
                    <label class="text-[9px] text-gray-400">Alineación
                        <select data-base-id="${block.id}" data-base-field="${block.alignField}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            <option value="left" ${alignValue === 'left' ? 'selected' : ''}>Izquierda</option>
                            <option value="center" ${alignValue === 'center' ? 'selected' : ''}>Centro</option>
                            <option value="right" ${alignValue === 'right' ? 'selected' : ''}>Derecha</option>
                            <option value="justify" ${alignValue === 'justify' ? 'selected' : ''}>Justificado</option>
                        </select>
                    </label>
                    ${sizeCfg ? `<label class="text-[9px] text-gray-400">Tamaño
                        <input data-base-id="${block.id}" data-base-field="${block.sizeField}" type="number" min="${sizeCfg.min}" max="${sizeCfg.max}" value="${sizeValue}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>` : `<div class="text-[9px] text-gray-500 flex items-end">Sin tamaño dedicado</div>`}
                    <div class="text-[9px] text-gray-500 flex items-end">${block.contentEditor ? 'Doble click para editar contenido' : 'Click sobre el PDF para seleccionar'}</div>
                </div>
                ${layoutHtml}
            </div>
        `;
    }).join('');
}

function __pmCommitBaseTextBlockField(field, rawValue) {
    const cfg = __pmGetPdfStyleConfig();
    const nextRaw = { ...cfg };
    if (field === 'fontFamilyKey') {
        const fontKey = String(rawValue || '').toLowerCase();
        if (!__PM_PDF_STYLE_FONT_MAP[fontKey]) return;
        nextRaw.fontFamilyKey = fontKey;
    } else if (field && field.endsWith('Align')) {
        nextRaw[field] = __pmNormalizeStyleAlign(rawValue, cfg[field] || 'left');
    } else if (Object.prototype.hasOwnProperty.call(__PM_PDF_BASE_SIZE_LIMITS, field)) {
        const limits = __PM_PDF_BASE_SIZE_LIMITS[field];
        nextRaw[field] = __pmClampStyleNumber(rawValue, limits.min, limits.max, cfg[field]);
        if (field === 'tableBodyPx') {
            nextRaw.tableHeadPx = __pmClampStyleNumber((parseInt(nextRaw.tableBodyPx, 10) || cfg.tableBodyPx) + 2, 9, 18, cfg.tableHeadPx);
        }
    } else {
        return;
    }
    const next = __pmNormalizePdfStyle(nextRaw);
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmWritePdfStyleControls(next);
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmHighlightSelectedBaseTextBlock() {
    document.querySelectorAll('#pdf-content .pm-pdf-edit-selected').forEach((node) => node.classList.remove('pm-pdf-edit-selected'));
    if (!__pmIsAdminProfile()) return;
    const selected = String(__pmPdfResourceEditorSelectedId || '');
    if (!selected) return;
    if (selected.startsWith('base:')) {
        const key = selected.slice(5);
        document.querySelectorAll(`#pdf-content [data-base-resource="${key}"]`).forEach((node) => node.classList.add('pm-pdf-edit-selected'));
        return;
    }
    document.querySelectorAll(`#pdf-content .pm-pdf-resource[data-res-id="${selected}"]`).forEach((node) => node.classList.add('pm-pdf-edit-selected'));
}

function __pmAddPdfResource(type) {
    const resources = __pmGetPdfResourcesFromState();
    const safeType = ['bar', 'logo', 'title', 'text'].includes(type) ? type : 'text';
    resources.push({
        id: `pmres_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: safeType,
        enabled: true,
        page: 1,
        x: 80,
        y: 120,
        w: safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : 260),
        h: safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : 42),
        text: safeType === 'title' ? 'TITULO NUEVO' : (safeType === 'text' ? 'Texto nuevo' : ''),
        fontSize: safeType === 'title' ? 24 : 14,
        fontFamilyKey: '',
        bold: true,
        italic: false,
        underline: false,
        align: 'left',
        color: '#111827',
        bgColor: safeType === 'bar' ? '#d32f2f' : '#ffffff'
    });
    __pmPdfResourceEditorSelectedId = resources[resources.length - 1].id;
    __pmCommitPdfResources(resources);
}

function __pmRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list || !__pmIsAdminProfile()) return;
    const cfg = __pmGetPdfStyleConfig();
    const resources = __pmGetPdfResourcesFromState();
    const baseBlocksHtml = __pmRenderBaseTextBlocksEditorList(cfg);
    const resourcesHtml = resources.map((resource) => {
        const selectedClass = resource.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-600';
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isLogo = resource.type === 'logo';
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__pmSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${__pmSafeHtml(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-red-300">Eliminar</button>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400">Tipo
                        <select data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="type" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            <option value="bar" ${resource.type === 'bar' ? 'selected' : ''}>Barra</option>
                            <option value="logo" ${resource.type === 'logo' ? 'selected' : ''}>Logo</option>
                            <option value="title" ${resource.type === 'title' ? 'selected' : ''}>Título</option>
                            <option value="text" ${resource.type === 'text' ? 'selected' : ''}>Texto</option>
                        </select>
                    </label>
                    <label class="text-[9px] text-gray-400">Página
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="page" type="number" min="1" max="8" value="${resource.page}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">X
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="x" type="number" value="${resource.x}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="y" type="number" value="${resource.y}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Ancho
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="w" type="number" min="16" value="${resource.w}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Alto
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="h" type="number" min="10" value="${resource.h}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400 ${isTextLike ? '' : 'opacity-50'}">Fuente
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Activo
                        <select data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="enabled" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            <option value="true" ${resource.enabled ? 'selected' : ''}>Sí</option>
                            <option value="false" ${!resource.enabled ? 'selected' : ''}>No</option>
                        </select>
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-1 ${isLogo ? 'hidden' : ''}">
                    <label class="text-[9px] text-gray-400">Color Texto
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="color" type="color" value="${resource.color}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400">Color Fondo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${resource.bgColor}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>
                <label class="text-[9px] text-gray-400 block ${isTextLike ? '' : 'hidden'}">Texto
                    <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="text" type="text" value="${__pmSafeHtml(resource.text)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                </label>
                <p class="text-[9px] text-gray-500 ${isLogo ? '' : 'hidden'}">Usa el logo configurado para el tenant actual.</p>
            </div>
        `;
    }).join('');
    const customEmpty = !resources.length ? '<p class="text-[10px] text-gray-400">Sin recursos personalizados. Usa + Barra, + Logo, + Título o + Texto.</p>' : '';
    list.innerHTML = `
        <div class="space-y-2">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Textos base del PDF</p>
            ${baseBlocksHtml}
        </div>
        <div class="space-y-2 pt-2 border-t border-gray-700/80">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Recursos personalizados</p>
            ${customEmpty}
            ${resourcesHtml}
        </div>
    `;
    __pmHighlightSelectedBaseTextBlock();
}

function __pmHandleResourceListEvent(event) {
    const trigger = event.target.closest('[data-res-action], [data-res-field], [data-base-action], [data-base-field], [data-base-layout-field]');
    if (!trigger) return;
    const baseId = String(trigger.dataset.baseId || '');
    const baseAction = String(trigger.dataset.baseAction || '');
    const baseField = String(trigger.dataset.baseField || '');
    const baseLayoutField = String(trigger.dataset.baseLayoutField || '');
    if (baseAction === 'select' && baseId.startsWith('base:')) {
        __pmPdfResourceEditorSelectedId = baseId;
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }
    if (baseLayoutField && baseId.startsWith('base:')) {
        __pmPdfResourceEditorSelectedId = baseId;
        const rawValue = trigger.type === 'checkbox'
            ? !!trigger.checked
            : (String(trigger.value) === 'true' ? true : (String(trigger.value) === 'false' ? false : trigger.value));
        __pmCommitBaseLayoutField(baseId, baseLayoutField, rawValue);
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }
    if (baseField && baseId.startsWith('base:')) {
        __pmPdfResourceEditorSelectedId = baseId;
        __pmCommitBaseTextBlockField(baseField, trigger.value);
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }

    const resources = __pmGetPdfResourcesFromState();
    const id = trigger.dataset.resId || '';
    const idx = resources.findIndex((resource) => resource.id === id);
    if (idx < 0) return;

    if (trigger.dataset.resAction === 'remove') {
        resources.splice(idx, 1);
        if (__pmPdfResourceEditorSelectedId === id) __pmPdfResourceEditorSelectedId = '';
        __pmCommitPdfResources(resources);
        return;
    }
    if (trigger.dataset.resAction === 'select') {
        __pmPdfResourceEditorSelectedId = id;
        __pmRenderPdfResourcesEditorList();
        return;
    }

    const field = trigger.dataset.resField;
    if (!field) return;
    let nextValue = trigger.value;
    if (field === 'enabled') nextValue = String(nextValue) === 'true';
    if (['page', 'x', 'y', 'w', 'h', 'fontSize'].includes(field)) nextValue = parseInt(nextValue, 10);
    resources[idx] = { ...resources[idx], [field]: nextValue };
    __pmPdfResourceEditorSelectedId = id;
    __pmCommitPdfResources(resources);
}

function __pmBindPdfResourceEditor() {
    if (!__pmIsAdminProfile()) return;
    const list = document.getElementById('pdf-style-resources-list');
    if (list && list.dataset.bound !== '1') {
        list.addEventListener('input', __pmHandleResourceListEvent);
        list.addEventListener('change', __pmHandleResourceListEvent);
        list.addEventListener('click', __pmHandleResourceListEvent);
        list.dataset.bound = '1';
    }
    document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => __pmAddPdfResource('bar'));
    document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => __pmAddPdfResource('logo'));
    document.getElementById('pdf-style-add-title')?.addEventListener('click', () => __pmAddPdfResource('title'));
    document.getElementById('pdf-style-add-text')?.addEventListener('click', () => __pmAddPdfResource('text'));
    __pmRenderPdfResourcesEditorList();
}

function __pmBindPdfResourceDrag() {
    if (document.body.dataset.pmPdfResourceDragBound === '1') return;
    document.body.dataset.pmPdfResourceDragBound = '1';
    const getPointerScale = (node) => {
        const ref = node?.parentElement || node;
        if (!ref || !(ref instanceof HTMLElement)) return { x: 1, y: 1 };
        const rect = ref.getBoundingClientRect();
        const rawWidth = ref.offsetWidth || parseFloat(ref.style.width || '0') || rect.width || 1;
        const rawHeight = ref.offsetHeight || parseFloat(ref.style.height || '0') || rect.height || 1;
        const scaleX = rect.width > 0 && rawWidth > 0 ? (rect.width / rawWidth) : 1;
        const scaleY = rect.height > 0 && rawHeight > 0 ? (rect.height / rawHeight) : 1;
        return {
            x: scaleX > 0 ? scaleX : 1,
            y: scaleY > 0 ? scaleY : 1
        };
    };
    const isResizeGesture = (rect, event) => (
        event.shiftKey ||
        (((rect.right - event.clientX) < 18) && ((rect.bottom - event.clientY) < 18))
    );
    const releasePointer = (state) => {
        const captureNode = state?.captureNode;
        if (!captureNode || typeof captureNode.releasePointerCapture !== 'function') return;
        try { captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
    };
    const endDrag = () => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        if (state.kind === 'base') {
            __pmCommitPdfBaseLayout(state.key, state.current || state.origin);
            __pmHighlightSelectedBaseTextBlock();
        } else {
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id);
            if (idx >= 0) {
                resources[idx] = { ...resources[idx], ...(state.current || state.origin) };
                __pmCommitPdfResources(resources, { refreshPreview: false });
            }
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
        __pmPdfResourcePointerState = null;
    };
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!__pmIsAdminProfile() || __pmPdfPreviewEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const node = target.closest('#pdf-content .pm-pdf-resource[data-res-id]');
        if (node) {
            const resourceId = String(node.getAttribute('data-res-id') || '');
            const page = parseInt(node.getAttribute('data-res-page') || '1', 10);
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === resourceId);
            if (idx < 0) return;
            const rect = node.getBoundingClientRect();
            const scale = getPointerScale(node);
            const mode = isResizeGesture(rect, event) ? 'resize' : 'move';
            __pmPdfResourceEditorSelectedId = resourceId;
            __pmRenderPdfResourcesEditorList();
            __pmHighlightSelectedBaseTextBlock();
            if (__pmPdfTextInspectorState?.kind === 'resource' && __pmPdfTextInspectorState.id === resourceId) {
                __pmPdfTextInspectorState = { ...__pmPdfTextInspectorState, page };
            }
            __pmPdfResourcePointerState = {
                kind: 'resource',
                id: resourceId,
                page,
                mode,
                startX: event.clientX,
                startY: event.clientY,
                pointerId: event.pointerId,
                captureNode: node,
                scaleX: scale.x,
                scaleY: scale.y,
                origin: { ...resources[idx] },
                current: { ...resources[idx] }
            };
            if (typeof node.setPointerCapture === 'function') {
                try { node.setPointerCapture(event.pointerId); } catch (_) {}
            }
            document.body.style.userSelect = 'none';
            document.body.style.cursor = mode === 'resize' ? 'nwse-resize' : 'move';
            event.preventDefault();
            return;
        }

        const baseNode = target.closest('#pdf-content [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
        const rect = baseNode.getBoundingClientRect();
        const scale = getPointerScale(baseNode);
        const mode = isResizeGesture(rect, event) ? 'scale' : 'move';
        const cfg = __pmGetPdfStyleConfig();
        const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
        __pmPdfResourceEditorSelectedId = `base:${baseKey}`;
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        const anchorNodes = Array.from(document.querySelectorAll(`#pdf-content [data-base-resource="${baseKey}"]`));
        const anchorIndex = anchorNodes.indexOf(baseNode);
        if (__pmPdfTextInspectorState?.kind === 'base' && __pmPdfTextInspectorState.key === baseKey) {
            __pmPdfTextInspectorState = { ...__pmPdfTextInspectorState, anchorIndex };
        }
        __pmPdfResourcePointerState = {
            kind: 'base',
            key: baseKey,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
            captureNode: baseNode,
            scaleX: scale.x,
            scaleY: scale.y,
            origin: { ...(layouts[baseKey] || __pmNormalizePdfBaseLayout()) },
            current: { ...(layouts[baseKey] || __pmNormalizePdfBaseLayout()) }
        };
        if (typeof baseNode.setPointerCapture === 'function') {
            try { baseNode.setPointerCapture(event.pointerId); } catch (_) {}
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = mode === 'scale' ? 'nwse-resize' : 'move';
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        const dx = (event.clientX - state.startX) / (state.scaleX || 1);
        const dy = (event.clientY - state.startY) / (state.scaleY || 1);
        if (state.kind === 'base') {
            if (state.mode === 'scale') {
                const delta = (dx + dy) / 2;
                const next = __pmNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + delta });
                state.current = next;
                document.querySelectorAll(`#pdf-content [data-base-resource="${state.key}"]`).forEach((baseNode) => {
                    baseNode.style.transform = __pmBuildPdfBaseTransform(next);
                });
            } else {
                const next = __pmNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
                state.current = next;
                document.querySelectorAll(`#pdf-content [data-base-resource="${state.key}"]`).forEach((baseNode) => {
                    baseNode.style.transform = __pmBuildPdfBaseTransform(next);
                });
            }
            __pmPositionPdfTextInspector();
        } else {
            const node = document.querySelector(`#pdf-content .pm-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
            if (!node) return;
            if (state.mode === 'resize') {
                const next = {
                    ...state.current,
                    w: Math.max(16, state.origin.w + dx),
                    h: Math.max(10, state.origin.h + dy)
                };
                state.current = next;
                node.style.width = `${next.w.toFixed(2)}px`;
                node.style.height = `${next.h.toFixed(2)}px`;
                __pmAutoFitPdfTextNode(node);
            } else {
                const next = {
                    ...state.current,
                    x: state.origin.x + dx,
                    y: state.origin.y + dy
                };
                state.current = next;
                node.style.left = `${next.x.toFixed(2)}px`;
                node.style.top = `${next.y.toFixed(2)}px`;
            }
            __pmPositionPdfTextInspector();
        }
        event.preventDefault();
    });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function __pmApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    const body = document.getElementById('pdf-style-editor-body');
    const toggleBtn = document.getElementById('btn-pdf-style-toggle');
    const pinBtn = document.getElementById('btn-pdf-style-pin');
    if (!editorWrap) return;

    if (body) body.classList.toggle('hidden', !!__pmPdfStyleUiState.collapsed);
    if (toggleBtn) toggleBtn.textContent = __pmPdfStyleUiState.collapsed ? 'Mostrar' : 'Ocultar';
    if (pinBtn) pinBtn.textContent = __pmPdfStyleUiState.pinned ? 'Desfijar' : 'Fijar';

    if (__pmPdfStyleUiState.pinned) {
        editorWrap.style.position = 'fixed';
        editorWrap.style.left = '';
        editorWrap.style.right = '16px';
        editorWrap.style.bottom = '16px';
        editorWrap.style.top = '';
        editorWrap.style.zIndex = '140';
        editorWrap.style.width = '340px';
        editorWrap.style.maxHeight = '85vh';
        editorWrap.style.overflow = 'auto';
        editorWrap.style.border = '1px solid #374151';
        editorWrap.style.borderRadius = '12px';
        editorWrap.style.boxShadow = '0 18px 45px rgba(0, 0, 0, 0.45)';
    } else {
        editorWrap.style.position = 'fixed';
        editorWrap.style.left = '';
        editorWrap.style.right = '16px';
        editorWrap.style.top = '84px';
        editorWrap.style.bottom = '12px';
        editorWrap.style.zIndex = '140';
        editorWrap.style.width = '340px';
        editorWrap.style.maxHeight = 'calc(100vh - 96px)';
        editorWrap.style.overflow = 'auto';
        editorWrap.style.border = '1px solid #374151';
        editorWrap.style.borderRadius = '12px';
        editorWrap.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.35)';
    }
}

function __pmTogglePdfStylePanel() {
    __pmPdfStyleUiState = { ...__pmPdfStyleUiState, collapsed: !__pmPdfStyleUiState.collapsed };
    __pmSavePdfStyleUiState();
    __pmApplyPdfStyleEditorUiState();
}

function __pmTogglePdfStylePin() {
    __pmPdfStyleUiState = { ...__pmPdfStyleUiState, pinned: !__pmPdfStyleUiState.pinned };
    __pmSavePdfStyleUiState();
    __pmApplyPdfStyleEditorUiState();
}

function __pmInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__pmPdfStyleState) __pmPdfStyleState = __pmLoadPdfStyleState();
    // Editor centralizado en users1.html (admin). En cotizador solo se aplica configuración.
    editorWrap.classList.add('hidden');
    __pmPdfStyleUiState = __pmLoadPdfStyleUiState();
    __pmBindPdfResourceDrag();
}

window.resetPdfStyleEditor = function() {
    if (!__pmIsAdminProfile()) return;
    const reset = __pmNormalizePdfStyle(__PM_PDF_STYLE_DEFAULTS);
    __pmSetPdfStyleConfig(reset, { applyToDom: true });
    __pmWritePdfStyleControls(reset);
    __pmScheduleSharedPdfStyleSync(reset);
};

window.getOrderHTML = function(o, type) { 
    const isOrder = type === 'order'; 
    const logoImg = ''; 
    const pdfStyle = __pmGetPdfStyleConfig();
    const pdfContent = __pmNormalizePdfContent(pdfStyle.content);
    const pdfStyleInlineVars = __pmPdfStyleVarsInline(pdfStyle);
    const isAdminPreview = __pmIsAdminProfile();
    const pdfStyleTag = `<style>.pm-pdf-root{font-family:var(--pm-font-family)!important;}.pm-pdf-root .pm-pdf-shift{transform:translate(var(--pm-offset-x),var(--pm-offset-y));position:relative;}.pm-pdf-root .pm-pdf-header{justify-content:var(--pm-header-justify)!important;}.pm-pdf-root .pm-pdf-header>div:last-child{text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-header-line{width:100%;height:var(--pm-header-line)!important;background:#ef4444!important;}.pm-pdf-root .pm-pdf-sign-line{width:100%;height:var(--pm-sign-line)!important;background:#111827!important;border-radius:999px;}.pm-pdf-root .pm-pdf-title{font-size:var(--pm-title-size)!important;line-height:1.05!important;text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-folio{font-size:var(--pm-meta-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-date{font-size:var(--pm-date-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-table-head th{font-size:var(--pm-table-head-size)!important;}.pm-pdf-root .pm-pdf-table-body td,.pm-pdf-root .pm-pdf-table-body p,.pm-pdf-root .pm-pdf-table-body span{font-size:var(--pm-table-body-size)!important;line-height:var(--pm-line-height)!important;}.pm-pdf-root .pm-pdf-table-body td:first-child,.pm-pdf-root .pm-pdf-table-body td:first-child *{text-align:var(--pm-table-align)!important;}.pm-pdf-root .pm-pdf-summary,.pm-pdf-root .pm-pdf-summary *{text-align:var(--pm-summary-align)!important;}.pm-pdf-root .pm-pdf-quick,.pm-pdf-root .pm-pdf-quick *{font-size:var(--pm-quick-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-quick-align)!important;}.pm-pdf-root .pm-pdf-general-conditions,.pm-pdf-root .pm-pdf-general-conditions *{font-size:var(--pm-conditions-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-conditions-align)!important;}.pm-pdf-root .pm-pdf-sign,.pm-pdf-root .pm-pdf-sign *{font-size:var(--pm-sign-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-sign-align)!important;}.pm-pdf-root .pm-pdf-footer-text{font-size:var(--pm-footer-size)!important;text-align:var(--pm-footer-align)!important;}.pm-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.pm-pdf-root .pm-pdf-resource,.pm-pdf-root .pm-pdf-editable{cursor:default;}.pm-pdf-root .pm-pdf-editable{box-sizing:border-box;outline:none;outline-offset:2px;}.pm-pdf-root .pm-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 2px #ffffff;opacity:0;}.pm-pdf-root .pm-pdf-edit-selected{outline:none;outline-offset:2px;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable{cursor:move;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable{outline:1px dashed rgba(239,68,68,0.45);}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::after{opacity:.9;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected{outline:2px solid #ef4444;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected::after{opacity:1;transform:scale(1.08);}.pm-pdf-root [data-base-resource].pm-pdf-base-font-family,.pm-pdf-root [data-base-resource].pm-pdf-base-font-family *{font-family:var(--pm-base-font-family)!important;}.pm-pdf-root [data-base-resource].pm-pdf-base-font-size,.pm-pdf-root [data-base-resource].pm-pdf-base-font-size *{font-size:var(--pm-base-font-size)!important;line-height:var(--pm-line-height)!important;}.pm-pdf-root [data-base-resource].pm-pdf-base-color,.pm-pdf-root [data-base-resource].pm-pdf-base-color *{color:var(--pm-base-color)!important;}.pm-pdf-root [data-base-resource].pm-pdf-base-font-weight,.pm-pdf-root [data-base-resource].pm-pdf-base-font-weight *{font-weight:800!important;}.pm-pdf-root [data-base-resource].pm-pdf-base-font-italic,.pm-pdf-root [data-base-resource].pm-pdf-base-font-italic *{font-style:italic!important;}.pm-pdf-root [data-base-resource].pm-pdf-base-font-underline,.pm-pdf-root [data-base-resource].pm-pdf-base-font-underline *{text-decoration:underline!important;}</style>`;

    const now = new Date(); const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); const genDateTime = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }); let docTitle = isOrder ? "ORDEN DE COMPRA" : "COTIZACIÓN"; 
    
    let folio = o.numero_orden || o.id.split('-')[0].toUpperCase(); 
    
    const space = allSpaces.find(s=>s.id==o.espacio_id); const basePrice = parseFloat(space ? space.precio_base : 0); 
    const descHTML = isOrder ? '' : `<p class="text-[9px] text-gray-500 italic mt-0.5 truncate max-w-xs">${space?.descripcion || ''}</p>`; 
    const footerHubHTML = `<div class="w-full text-center mt-10"><p class="pm-pdf-footer-text text-[10px] text-gray-400 font-medium leading-tight ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="footer">Generado el ${genDateTime}<br>a través de Marketing Hub - Plaza Mayor</p></div>`; 
    const renderHeader = (title) => `<div class="pm-pdf-header flex justify-end items-start pb-1">${logoImg}<div class="text-right"><div class="${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="header-title"><h1 class="pm-pdf-title text-2xl font-black text-gray-800 tracking-tighter uppercase">${title}</h1></div><div class="${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="header-meta"><p class="pm-pdf-folio text-sm font-mono text-brand-red font-bold mt-1">FOLIO: ${folio}</p><p class="pm-pdf-date text-[10px] text-gray-500 mt-1">${dateStr}</p></div></div></div><div class="${isAdminPreview ? 'pm-pdf-editable' : ''} mb-2" data-base-resource="header-line"><div class="pm-pdf-header-line rounded-full"></div></div>`; 
    const quickLeftItems = String(pdfContent.quickLeftLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const quickLeftItemsHtml = quickLeftItems.length
        ? quickLeftItems.map((line) => `<li>${__pmSafeHtml(line)}</li>`).join('')
        : '<li>Sin notas configuradas.</li>';
    const conditionsItems = String(pdfContent.conditionsLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const conditionsItemsHtml = conditionsItems.length
        ? conditionsItems.map((line) => `<li>${__pmSafeHtml(line)}</li>`).join('')
        : '<li>Sin condiciones configuradas.</li>';
    let clientName = o.cliente_nombre || 'CLIENTE';
    let clientRfc = o.cliente_rfc;
    let nameSizeClass = 'text-xl';
    if (clientName.length > 35) nameSizeClass = 'text-xs'; else if (clientName.length > 25) nameSizeClass = 'text-sm';
    const quoteStatus = String(o?.status || '').toLowerCase();
    const isApprovedQuote = !isOrder && ['aprobada', 'finalizada'].includes(quoteStatus);
    const clientComponent = (isOrder || isApprovedQuote)
        ? `<div class="pm-pdf-summary flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="summary-client"><div class="w-1/2 border-r border-gray-200 pr-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div><div class="w-1/2 pl-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Contacto / Fiscal</p><p class="font-mono text-xs text-gray-700 truncate">${o.cliente_email || 'Sin correo'}</p>${clientRfc ? `<p class="font-mono text-xs text-gray-700 mt-0.5">RFC: <strong>${clientRfc}</strong></p>` : ''}</div></div>`
        : `<div class="pm-pdf-summary mb-2 p-2 bg-gray-50 rounded border border-gray-100 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="summary-client"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div>`;
    
    let detailSpaces = [];
    if (Array.isArray(o.espacios_detalle)) detailSpaces = o.espacios_detalle;
    else if (typeof o.espacios_detalle === 'string') { try { detailSpaces = JSON.parse(o.espacios_detalle); } catch(e){} }
    detailSpaces = Array.isArray(detailSpaces) ? detailSpaces.filter(Boolean) : [];

    let rentalTotal = calculateSpaceTotal(space, o.fecha_inicio, o.fecha_fin);
    let runningSubtotal = 0;
    let rowsHtml = '';
    if (detailSpaces.length) {
        detailSpaces.forEach(sp => {
            const spSubtotal = parseFloat(sp.subtotal_espacio || sp.total_espacio || 0) || 0;
            runningSubtotal += spSubtotal;
            rowsHtml += `<tr><td class="py-2 px-3 align-top break-words"><p class="font-bold text-gray-800 text-xs break-words">${sp.espacio_nombre || '--'}</p><span class="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[10px] font-mono mt-0.5 inline-block">${sp.espacio_clave || ''}</span></td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${window.safeFormatDate(sp.fecha_inicio)}<br>${window.safeFormatDate(sp.fecha_fin)}</td><td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(spSubtotal)}</td></tr>`;
        });
    } else {
        runningSubtotal = rentalTotal;
        rowsHtml = `<tr><td class="py-2 px-3 align-top break-words"><p class="font-bold text-gray-800 text-xs break-words">${o.espacio_nombre}</p>${descHTML}<span class="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[10px] font-mono mt-0.5 inline-block">${o.espacio_clave || ''}</span></td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${window.safeFormatDate(o.fecha_inicio)}<br>${window.safeFormatDate(o.fecha_fin)}</td><td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(rentalTotal)}</td></tr>`;
    }
    
    let cArray = [];
    if(Array.isArray(o.conceptos_adicionales)) cArray = o.conceptos_adicionales;
    else if(typeof o.conceptos_adicionales === 'string') try{cArray=JSON.parse(o.conceptos_adicionales)}catch(e){}
    cArray.forEach(c => { 
        let val = parseFloat(c.amount !== undefined ? c.amount : (c.value || 0));
        let amount = val;
        if(c.unit === 'percent') amount = runningSubtotal * (val/100); 
        
        if(c.type === 'descuento') runningSubtotal -= amount; else runningSubtotal += amount; 
        const sign = (c.type === 'descuento') ? '-' : '+'; 
        const sid = String(c?.meta?.space_id || '');
        const spName = sid ? (detailSpaces.find(sp => String(sp.espacio_id || sp.space_id || '') === sid)?.espacio_nombre || '') : '';
        const label = `${spName ? `${spName} - ` : ''}${c.description || c.nombre || 'Adicional'}`;
        rowsHtml += `<tr><td class="py-2 px-3 text-[13px] font-medium text-gray-600 break-words leading-snug">${label}</td><td class="py-2 px-3"></td><td class="py-2 px-3 text-right text-[13px] font-medium text-gray-600">${sign} ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(amount)}</td></tr>`; 
    }); 
    
    if(o.tipo_ajuste && o.tipo_ajuste !== 'ninguno') { let val = parseFloat(o.valor_ajuste); let displayAmount = val; if (o.ajuste_es_porcentaje) { displayAmount = runningSubtotal * (val / 100); } const sign = o.tipo_ajuste === 'descuento' ? '-' : '+'; if(o.tipo_ajuste==='descuento') runningSubtotal -= displayAmount; else runningSubtotal += displayAmount; rowsHtml += `<tr class="bg-gray-50"><td class="py-2 px-3 italic text-[12px] text-gray-500">Ajuste Global</td><td></td><td class="py-2 px-3 text-right font-bold text-[12px] text-gray-600">${sign} ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(displayAmount)}</td></tr>`; } 
    let taxRows = '';
    let taxIds = [];
    if (o.desglose_precios && o.desglose_precios.impuestos_detalle) taxIds = o.desglose_precios.impuestos_detalle;
    else { const s = allSpaces.find(sp => sp.id === o.espacio_id); taxIds = s ? parseIds(s.impuestos) : []; }
    taxRows += `<tr><td class="py-1 px-3 text-[10px] font-bold text-gray-500 text-right" colspan="2">Subtotal</td><td class="py-1 px-3 text-right text-xs font-bold text-gray-800">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(runningSubtotal)}</td></tr>`;
    const storedTaxTotal = parseFloat(o?.desglose_precios?.tax_total || 0) || 0;
    if (storedTaxTotal > 0) {
        taxRows += `<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="2">Impuestos</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">+ ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(storedTaxTotal)}</td></tr>`;
    } else if (taxIds.length > 0 && dbTaxes.length > 0) {
        taxIds.forEach(tid => { const t = dbTaxes.find(x => x.id == tid); if(t) { const rate = t.porcentaje > 1 ? t.porcentaje/100 : t.porcentaje; const val = runningSubtotal * rate; taxRows += `<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="2">${t.nombre} (${t.porcentaje}%)</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">+ ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(val)}</td></tr>`; } });
    }
    const totalsBlock = `<div class="pm-pdf-summary flex justify-end mb-2 pr-4 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="summary-totals"><div class="w-64"><table class="w-full border-collapse">${taxRows}<tr><td class="pt-2 border-t-2 border-gray-800 align-middle text-right" colspan="2"><span class="text-[10px] font-bold uppercase text-gray-500 mr-2">Total Neto</span></td><td class="pt-2 border-t-2 border-gray-800 align-middle text-right"><span class="text-xl font-black text-gray-900">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(o.precio_final)}</span></td></tr></table></div></div>`; 
    
    // FIRMA DINÁMICA
    let staffName = window.currentUserProfile?.Usernames || window.currentUserProfile?.username || window.currentUserProfile?.full_name || 'Staff';

    let signBlock = ''; 
    if (isOrder) { 
        signBlock = `<div class="flex justify-center w-full"><div class="text-center w-64"><div class="${isAdminPreview ? 'pm-pdf-editable' : ''} mb-1" data-base-resource="sign-line"><div class="pm-pdf-sign-line"></div></div><p class="font-bold text-xs text-brand-dark">${staffName}</p><p class="text-[10px] text-gray-500 uppercase">Staff Plaza Mayor</p></div></div>`; 
    } else { 
        signBlock = `<div class="text-center w-56"><div class="${isAdminPreview ? 'pm-pdf-editable' : ''} mb-1" data-base-resource="sign-line"><div class="pm-pdf-sign-line"></div></div><p class="font-bold text-xs text-brand-dark">${staffName}</p><p class="text-[10px] text-gray-500 uppercase">Staff Plaza Mayor</p></div><div class="text-center w-56"><div class="${isAdminPreview ? 'pm-pdf-editable' : ''} mb-1" data-base-resource="sign-line"><div class="pm-pdf-sign-line"></div></div><p class="font-bold text-xs text-brand-dark uppercase">${o.cliente_nombre.substring(0,25)}</p><p class="text-[10px] text-gray-500 uppercase">Cliente / Representante</p></div>`; 
    } 
    
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
    const page1Raw = `<div class="pm-pdf-shift" style="width: 100%; min-height: ${pageBaseHeight}px; height: ${pageBaseHeight}px; overflow: hidden; padding: 0; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;"><div>${renderHeader(docTitle)}${clientComponent}${isOrder ? `<div class="mb-2 bg-gray-100 p-2 rounded text-base flex justify-between"><span>Folio de Servicio: <strong class="font-black text-lg">${folio}</strong></span><span>Contrato: <strong class="font-black text-lg">${o.numero_contrato||'---'}</strong></span></div>` : ''}<div class="${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="table"><table class="w-full text-left mb-2 mt-3 table-fixed border-separate border-spacing-0"><colgroup><col style="width:64%;"><col style="width:16%;"><col style="width:20%;"></colgroup><thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead><tbody class="pm-pdf-table-body divide-y divide-gray-50 text-[12px]">${rowsHtml}</tbody></table></div>${totalsBlock}</div><div class="pb-2">${!isOrder ? `<div class="pm-pdf-quick grid grid-cols-2 gap-4 mb-20 pt-4 border-t border-gray-100 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="quick"><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickLeftTitle || 'Condiciones:')}</h4><ul class="list-none text-xs text-gray-600 space-y-0.5 leading-tight">${quickLeftItemsHtml}</ul></div><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickRightTitle || 'Vigencia:')}</h4><p class="text-xs text-gray-600">${__pmSafeHtml(pdfContent.quickRightBody || '')}</p></div></div>` : ''}<div class="pm-pdf-sign flex justify-between items-start px-2 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="sign">${signBlock}</div>${footerHubHTML}</div>${__pmRenderPdfResources(pdfStyle, 1)}</div>`; 
    const pages = [
        __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(page1Raw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })
    ];
    if (!isOrder) { 
        const page2Raw = `<div class="pm-pdf-shift" style="width: 100%; min-height: ${pageBaseHeight}px; height: ${pageBaseHeight}px; overflow: hidden; padding: 0; box-sizing: border-box;">${renderHeader(__pmSafeHtml(pdfContent.conditionsTitle || 'CONDICIONES GENERALES'))}<ol class="pm-pdf-general-conditions list-decimal list-outside ml-6 text-[14px] text-gray-800 space-y-2 text-justify leading-tight mt-5 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="conditions">${conditionsItemsHtml}</ol>${__pmRenderPdfResources(pdfStyle, 2)}</div>`; 
        pages.push(__pmWrapLetterheadPage(page2Raw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
    } 
    const extraPages = __pmClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
    if (extraPages < 0 && pages.length > 1) {
        const keepCount = Math.max(1, pages.length + extraPages);
        pages.length = keepCount;
    } else if (extraPages > 0) {
        for (let i = 0; i < extraPages; i += 1) {
            const extraRaw = `<div class="pm-pdf-shift" style="width: 100%; min-height: ${pageBaseHeight}px; height: ${pageBaseHeight}px; overflow: hidden; padding: 0; box-sizing: border-box;">${renderHeader(`ANEXO ${i + 1}`)}<div class="pm-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4 ${isAdminPreview ? 'pm-pdf-editable' : ''}" data-base-resource="conditions"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__pmSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__pmSafeHtml(pdfContent.annexHintBody || '')}</p></div>${footerHubHTML}${__pmRenderPdfResources(pdfStyle, (isOrder ? 2 : 3) + i)}</div>`;
            pages.push(__pmWrapLetterheadPage(extraRaw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
        }
    }
    const raw = `<div class="pm-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;${pdfStyleInlineVars}">${pdfStyleTag}${pages.join('')}</div>`;
    return __pmOrdersTransparentPdfHtml(raw); 
};



// =========================================================================
// PLAZA MAYOR - OVERRIDES MINIMOS MULTIESPACIO PARA ORDER_DETAIL
// =========================================================================
(function () {
  if (typeof _isCP === "undefined" || _isCP) return;

  let pmSpaces = [];
  let pmActive = null;
  let pmTotals = { spaces: [], subtotal: 0, adjusted: 0, adjustment: 0, tax: 0, final: 0, adjType: "ninguno", subtotalBase: 0 };

  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim()) ? String(v).trim() : "");
  const today = () => new Date().toISOString().slice(0, 10);
  const safeArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  };
  const monthBounds = (anchor) => {
    const s = iso(anchor) || today();
    const start = new Date(`${s}T00:00:00`);
    start.setDate(start.getDate() + 29);
    return { s, e: start.toISOString().slice(0, 10) };
  };
  const getSpace = (sid) => allSpaces.find((s) => String(s.id) === String(sid)) || null;
  const defaultTaxIds = (space) => window.parseIds(space?.impuestos_ids || space?.impuestos).map((x) => parseInt(x, 10)).filter(Number.isFinite);
  const parseDetail = (raw) => safeArr(raw).map((x) => x || {}).filter((x) => x.espacio_id || x.space_id);
  const normConcept = (c) => {
    const amount = parseFloat(c?.amount ?? c?.value ?? 0) || 0;
    return { description: c?.description || c?.concepto || c?.nombre || "Concepto", amount, value: amount, unit: c?.unit || "fixed", type: c?.type || "aumento", meta: c?.meta && typeof c.meta === "object" ? { ...c.meta } : {} };
  };
  const getCfg = (sid) => pmSpaces.find((x) => String(x.spaceId) === String(sid)) || null;
  const selectedCfg = () => pmSpaces.filter((x) => x.selected);
  const activeCfg = () => getCfg(pmActive);
  const ensureActive = () => {
    if (!selectedCfg().length && pmSpaces.length) pmSpaces[0].selected = true;
    if (!pmActive || !getCfg(pmActive)?.selected) pmActive = String(selectedCfg()[0]?.spaceId || pmSpaces[0]?.spaceId || "");
  };
  const normDates = (cfg) => {
    if (!cfg) return;
    if (cfg.customPermanence) {
      cfg.startDate = iso(cfg.startDate || "");
      cfg.endDate = iso(cfg.endDate || "");
      if (!cfg.startDate && cfg.endDate) cfg.startDate = cfg.endDate;
      if (!cfg.endDate && cfg.startDate) cfg.endDate = cfg.startDate;
      if (cfg.startDate && cfg.endDate && new Date(cfg.endDate + "T00:00:00") < new Date(cfg.startDate + "T00:00:00")) cfg.endDate = cfg.startDate;
      return;
    }
    const m = monthBounds(cfg.startDate || cfg.endDate || today());
    cfg.startDate = m.s;
    cfg.endDate = m.e;
  };
  const mkCfg = (spaceId, seed = {}) => {
    const sp = getSpace(spaceId);
    const cfg = {
      spaceId: String(spaceId),
      selected: seed.selected !== false,
      customPermanence: !!seed.customPermanence,
      startDate: iso(seed.startDate || ""),
      endDate: iso(seed.endDate || ""),
      customBasePrice: seed.customBasePrice === null || seed.customBasePrice === undefined || seed.customBasePrice === "" ? "" : (parseFloat(seed.customBasePrice) || 0),
      taxIds: Array.isArray(seed.taxIds) && seed.taxIds.length ? seed.taxIds.map((x) => parseInt(x, 10)).filter(Number.isFinite) : defaultTaxIds(sp),
      concepts: safeArr(seed.concepts).map(normConcept)
    };
    normDates(cfg);
    return cfg;
  };
  const taxRate = (ids) => ids.reduce((acc, tid) => {
    const t = dbTaxes.find((x) => String(x.id) === String(tid));
    if (!t) return acc;
    const p = parseFloat(t.porcentaje || 0);
    return acc + (p > 1 ? p / 100 : p);
  }, 0);
  const money = (v) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v || 0);
  const PM_REFRESH_KEY = "pm_orders_refresh_signal";
  const signalOrdersRefresh = (reason = "saved") => {
    try { localStorage.setItem(PM_REFRESH_KEY, JSON.stringify({ ts: Date.now(), reason })); } catch (_) {}
    try {
      if (typeof window.__pmBroadcastOrdersRefresh === "function") {
        window.__pmBroadcastOrdersRefresh(reason);
        return;
      }
    } catch (_) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "pm_orders_refresh", reason }, window.location.origin);
      }
    } catch (_) {}
  };
  const PM_ORDER_DATE_PICKER = { start: "", end: "", reserved: new Set() };
  let pmOrderEventPickerCal = null;
  const addDays = (ds, delta = 0) => {
    const n = iso(ds);
    if (!n) return "";
    const d = new Date(`${n}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const toYmd = (dateObj) => {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const datesBetween = (startStr, endStr) => {
    const s = iso(startStr || "");
    const e = iso(endStr || s);
    if (!s || !e) return [];
    const start = new Date(`${s}T00:00:00`);
    const end = new Date(`${e}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
    return out;
  };
  const isApprovedStatus = (status) => String(status || "").toLowerCase() === "aprobada";
  async function renderPdfBlobFallback(sourceNode) {
    const sourceRoot = sourceNode?.firstElementChild || sourceNode;
    if (!sourceRoot) throw new Error("No hay contenido PDF para generar.");
    await __pmPrewarmPdfRenderer();
    const hostId = "pm-order-pdf-fallback-host";
    let host = document.getElementById(hostId);
    if (!host) {
      host = document.createElement("div");
      host.id = hostId;
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      host.style.width = "816px";
      host.style.maxWidth = "816px";
      host.style.minHeight = "1056px";
      host.style.zIndex = "-1";
      host.style.background = "#ffffff";
      host.style.pointerEvents = "none";
      document.body.appendChild(host);
    }
    const target = sourceRoot.cloneNode(true);
    target.removeAttribute?.("id");
    target.classList?.remove?.("hidden");
    target.style.width = "816px";
    target.style.minWidth = "816px";
    target.style.maxWidth = "816px";
    target.style.margin = "0";
    target.style.boxSizing = "border-box";
    target.style.background = "#ffffff";
    host.replaceChildren(target);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const width = Math.max(816, Math.ceil(target.scrollWidth || 0), Math.ceil(target.getBoundingClientRect?.().width || 0));
    const blob = await html2pdf().set({
      margin: 0,
      image: { type: "jpeg", quality: 0.98 },
      pagebreak: { mode: ["css", "legacy"] },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: width,
        windowHeight: 1056,
        width,
        logging: false,
        backgroundColor: "#ffffff"
      },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    }).from(target).output("blob");
    host.innerHTML = "";
    if (!blob || blob.size < 4096) throw new Error("No se pudo generar el PDF.");
    return blob;
  }

  function refreshCalendarLayout(calendar) {
    if (!calendar || typeof calendar.updateSize !== "function") return;
    const refresh = () => {
      try { calendar.updateSize(); } catch (_) {}
    };
    requestAnimationFrame(() => {
      refresh();
      setTimeout(refresh, 60);
      setTimeout(refresh, 180);
    });
  }

  function applyStatusVisual() {
    const sel = document.getElementById("oed-status");
    if (!sel) return;
    const v = String(sel.value || "").toLowerCase();
    sel.classList.remove(
      "border-amber-300", "bg-amber-50", "text-amber-700",
      "border-emerald-300", "bg-emerald-50", "text-emerald-700",
      "border-red-300", "bg-red-50", "text-red-700",
      "border-gray-300", "bg-white", "text-gray-700"
    );
    if (v === "pendiente") sel.classList.add("border-amber-300", "bg-amber-50", "text-amber-700");
    else if (v === "aprobada") sel.classList.add("border-emerald-300", "bg-emerald-50", "text-emerald-700");
    else if (v === "rechazada") sel.classList.add("border-red-300", "bg-red-50", "text-red-700");
    else sel.classList.add("border-gray-300", "bg-white", "text-gray-700");

    const sum = document.getElementById("sum-status");
    if (sum) {
      sum.classList.remove("text-amber-700", "text-emerald-700", "text-red-700", "text-gray-800");
      if (v === "pendiente") sum.classList.add("text-amber-700");
      else if (v === "aprobada") sum.classList.add("text-emerald-700");
      else if (v === "rechazada") sum.classList.add("text-red-700");
      else sum.classList.add("text-gray-800");
    }
  }

  function saveActiveFromForm() {
    const cfg = activeCfg();
    if (!cfg) return;
    cfg.customPermanence = !!document.getElementById("oed-custom-permanence")?.checked;
    cfg.startDate = iso(document.getElementById("oed-start")?.value || "");
    cfg.endDate = iso(document.getElementById("oed-end")?.value || "");
    cfg.customBasePrice = cfg.customPermanence ? (() => {
      const raw = document.getElementById("oed-space-custom-price")?.value;
      if (raw === "" || raw === null || raw === undefined) return "";
      return Math.max(0, parseFloat(raw) || 0);
    })() : "";
    cfg.concepts = safeArr(currentConcepts).map(normConcept);
    normDates(cfg);
  }

  function syncTaxUI() {
    const cfg = activeCfg();
    const box = document.getElementById("oed-taxes-list");
    if (!cfg || !box) return;
    const sp = getSpace(cfg.spaceId);
    const mandatory = defaultTaxIds(sp).map(String);
    const locked = __pmIsLockedOrder();
    box.innerHTML = "";
    dbTaxes.forEach((t) => {
      const tid = String(t.id);
      const checked = mandatory.includes(tid) || (cfg.taxIds || []).map(String).includes(tid);
      const disabled = locked || mandatory.includes(tid);
      box.innerHTML += `<label class="flex items-center gap-1.5 ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}"><input type="checkbox" value="${t.id}" class="oed-tax-check accent-brand-red w-3 h-3" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} onchange="window.onOrderTaxSelectionChanged()"><span class="text-[10px] font-bold uppercase text-gray-700">${t.nombre}</span></label>`;
    });
  }

  function loadActiveToForm() {
    ensureActive();
    const cfg = activeCfg();
    if (!cfg) return;
    normDates(cfg);
    const s = document.getElementById("oed-start");
    const e = document.getElementById("oed-end");
    if (s) s.value = cfg.startDate || "";
    if (e) { e.value = cfg.endDate || ""; e.min = cfg.startDate || ""; }
    const chk = document.getElementById("oed-custom-permanence");
    const wrap = document.getElementById("oed-custom-price-wrap");
    const price = document.getElementById("oed-space-custom-price");
    if (chk) chk.checked = !!cfg.customPermanence;
    if (wrap) wrap.classList.toggle("hidden", !cfg.customPermanence);
    if (price) price.value = cfg.customBasePrice === "" ? "" : String(cfg.customBasePrice);
    currentConcepts = safeArr(cfg.concepts).map(normConcept);
    window.renderConceptsList();
    syncTaxUI();
    const sel = document.getElementById("oed-space");
    if (sel) {
      sel.innerHTML = "";
      selectedCfg().forEach((x) => {
        const sp = getSpace(x.spaceId);
        sel.innerHTML += `<option value="${x.spaceId}">${sp?.nombre || x.spaceId}</option>`;
      });
      sel.value = String(pmActive || "");
    }
  }

  function getReservedDatesForSpace(spaceId) {
    const sid = String(spaceId || "");
    const reserved = new Set();
    const addDate = (ds) => {
      const n = iso(ds);
      if (n) reserved.add(n);
    };
    const addRange = (fi, ff) => {
      datesBetween(fi, ff).forEach(addDate);
    };
    (allOrders || []).forEach((order) => {
      if (!order || String(order.id) === String(currentPreviewOrder?.id || "")) return;
      if (!isApprovedStatus(order.status)) return;
      const details = parseDetail(order.espacios_detalle);
      if (details.length) {
        details.forEach((item) => {
          const itemSid = String(item.espacio_id || item.space_id || "");
          if (itemSid !== sid) return;
          const eventDates = safeArr(item.fechas_evento).map(iso).filter(Boolean);
          if (eventDates.length) eventDates.forEach(addDate);
          else addRange(item.fecha_inicio, item.fecha_fin);
        });
        return;
      }
      if (String(order.espacio_id || "") === sid) addRange(order.fecha_inicio, order.fecha_fin);
    });
    return reserved;
  }

  async function renderOrderDatePicker() {
    const grid = document.getElementById("order-date-fc");
    const startLbl = document.getElementById("order-date-picked-start");
    const endLbl = document.getElementById("order-date-picked-end");
    const list = document.getElementById("order-date-reserved-list");
    if (!grid) return;
    const cfg = activeCfg();
    if (!cfg) return;
    const reserved = getReservedDatesForSpace(cfg.spaceId);
    PM_ORDER_DATE_PICKER.reserved = reserved;

    if (startLbl) startLbl.textContent = PM_ORDER_DATE_PICKER.start ? window.safeFormatDate(PM_ORDER_DATE_PICKER.start) : "--";
    if (endLbl) endLbl.textContent = PM_ORDER_DATE_PICKER.end ? window.safeFormatDate(PM_ORDER_DATE_PICKER.end) : "--";

    const events = [];
    const pushEvent = (oid, fi, ff, title) => {
      const start = iso(fi || "");
      const end = iso(ff || fi || "");
      if (!start || !end) return;
      events.push({
        id: `${oid}-${cfg.spaceId}-${start}`,
        title: title || "Ocupado",
        start,
        end: addDays(end, 1),
        allDay: true,
        backgroundColor: "#1f2937",
        borderColor: "#1f2937",
        textColor: "#ffffff"
      });
    };

    (allOrders || []).forEach((order) => {
      if (!order || String(order.id) === String(currentPreviewOrder?.id || "")) return;
      if (!isApprovedStatus(order.status)) return;
      const details = parseDetail(order.espacios_detalle);
      if (details.length) {
        details.forEach((item) => {
          if (String(item.espacio_id || item.space_id || "") !== String(cfg.spaceId)) return;
          const eventDates = safeArr(item.fechas_evento).map(iso).filter(Boolean).sort();
          if (eventDates.length) {
            let chunkStart = eventDates[0];
            let prev = eventDates[0];
            const flush = () => pushEvent(order.id, chunkStart, prev, order.cliente_nombre || "Ocupado");
            for (let i = 1; i < eventDates.length; i += 1) {
              if (eventDates[i] !== addDays(prev, 1)) {
                flush();
                chunkStart = eventDates[i];
              }
              prev = eventDates[i];
            }
            flush();
            return;
          }
          pushEvent(order.id, item.fecha_inicio, item.fecha_fin, order.cliente_nombre || "Ocupado");
        });
      } else if (String(order.espacio_id || "") === String(cfg.spaceId)) {
        pushEvent(order.id, order.fecha_inicio, order.fecha_fin, order.cliente_nombre || "Ocupado");
      }
    });

    if (PM_ORDER_DATE_PICKER.start) {
      events.push({
        id: "__selection_event_pm",
        start: PM_ORDER_DATE_PICKER.start,
        end: addDays(PM_ORDER_DATE_PICKER.end || PM_ORDER_DATE_PICKER.start, 1),
        display: "background",
        backgroundColor: "rgba(16, 185, 129, 0.22)",
        borderColor: "transparent",
        allDay: true
      });
    }

    if (pmOrderEventPickerCal) {
      pmOrderEventPickerCal.destroy();
      pmOrderEventPickerCal = null;
    }
    pmOrderEventPickerCal = new FullCalendar.Calendar(grid, {
      initialView: "dayGridMonth",
      locale: "es",
      initialDate: PM_ORDER_DATE_PICKER.start || today(),
      height: "100%",
      buttonText: { today: "Hoy", month: "Mes", list: "Lista" },
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,listMonth" },
      events,
      dateClick: (info) => { window.pickOrderDate(info.dateStr); },
      dayCellDidMount: (arg) => {
        const ds = toYmd(arg.date);
        const isPast = ds < today();
        const isReserved = reserved.has(ds);
        if (isPast || isReserved) {
          arg.el.classList.add("opacity-60");
          arg.el.style.backgroundColor = isReserved ? "#fef2f2" : "#f3f4f6";
        }
        if (isReserved) {
          const frame = arg.el.querySelector(".fc-daygrid-day-frame");
          if (frame) {
            const ban = document.createElement("i");
            ban.className = "fa-solid fa-ban text-gray-300 text-base absolute inset-0 m-auto h-4 w-4 pointer-events-none";
            frame.style.position = "relative";
            frame.appendChild(ban);
          }
        }
      }
    });
    pmOrderEventPickerCal.render();

    if (list) {
      const rows = Array.from(reserved).filter((d) => d >= today()).sort().slice(0, 45);
      list.innerHTML = rows.length
        ? rows.map((d) => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join("")
        : '<p class="text-[10px] text-gray-400 italic">Sin reservas aprobadas visibles.</p>';
    }
  }

  function setDateOnForm(startDate, endDate) {
    const cfg = activeCfg();
    if (!cfg) return;
    const start = iso(startDate);
    const end = iso(endDate || start);
    if (start && start < today()) return window.showToast("No se permiten fechas pasadas.", "error");
    if (end && end < today()) return window.showToast("No se permiten fechas pasadas.", "error");
    const sEl = document.getElementById("oed-start");
    const eEl = document.getElementById("oed-end");
    if (sEl) sEl.value = start || "";
    if (eEl) eEl.value = end || "";
    saveActiveFromForm();
    window.recalcTotal();
  }

  window.renderOrderSpaceCards = function () {
    const track = document.getElementById("oed-space-cards-track");
    if (!track) return;
    ensureActive();
    const locked = __pmIsLockedOrder();
    const selectedIds = selectedCfg().map((x) => String(x.spaceId));
    const ids = [...selectedIds, ...allSpaces.map((s) => String(s.id)).filter((id) => !selectedIds.includes(id))];
    track.style.display = "grid";
    track.style.gridAutoFlow = "column";
    track.style.gridTemplateRows = "repeat(2, minmax(0, 1fr))";
    track.style.gridAutoColumns = "calc((100% - 0.5rem) / 2)";
    track.style.gap = "0.5rem";
    track.innerHTML = ids.map((sid) => {
      const sp = getSpace(sid);
      if (!sp) return "";
      let cfg = getCfg(sp.id);
      if (!cfg) cfg = mkCfg(sp.id, { selected: false });
      const sel = !!cfg.selected;
      const active = sel && String(pmActive) === String(sp.id);
      const card = active ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : (sel ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white");
      return `<div onclick="${locked ? "" : `window.selectOrderSpaceCard('${sp.id}')`}" class="text-left rounded-xl border ${card} p-3 transition ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"} min-h-[96px]"><div class="min-w-0"><p class="text-[11px] font-black uppercase leading-tight whitespace-normal break-words">${sp.nombre || "--"}</p><p class="text-[10px] font-mono text-gray-500 mt-1 whitespace-normal break-all">ID: ${sp.id || "--"}${sp.clave ? ` · ${sp.clave}` : ""}</p></div></div>`;
    }).join("");
  };

  window.selectOrderSpaceCard = function (sid) {
    if (__pmIsLockedOrder()) return;
    saveActiveFromForm();
    let cfg = getCfg(sid);
    const selectedCount = selectedCfg().length;
    if (cfg?.selected && String(pmActive) === String(sid) && selectedCount > 1) {
      cfg.selected = false;
      pmActive = String(selectedCfg()[0]?.spaceId || "");
      ensureActive();
      window.renderOrderSpaceCards();
      loadActiveToForm();
      window.recalcTotal();
      return;
    }
    if (!cfg) {
      const a = activeCfg();
      cfg = mkCfg(sid, { selected: true, customPermanence: !!a?.customPermanence, startDate: a?.startDate || "", endDate: a?.endDate || "", customBasePrice: a?.customBasePrice ?? "" });
      pmSpaces.push(cfg);
    }
    cfg.selected = true;
    pmActive = String(sid);
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();
    window.recalcTotal();
  };

  window.toggleOrderSpaceSwitch = function (sid, enabled) {
    if (__pmIsLockedOrder()) return;
    saveActiveFromForm();
    let cfg = getCfg(sid);
    if (enabled) {
      if (!cfg) { cfg = mkCfg(sid, { selected: true }); pmSpaces.push(cfg); }
      cfg.selected = true;
      pmActive = String(sid);
    } else {
      const count = selectedCfg().length;
      if (cfg?.selected && count <= 1) { window.showToast("La cotización debe conservar al menos un espacio activo.", "error"); window.renderOrderSpaceCards(); return; }
      if (cfg) cfg.selected = false;
      if (String(pmActive) === String(sid)) pmActive = String(selectedCfg()[0]?.spaceId || "");
    }
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();
    window.recalcTotal();
  };

  window.toggleOrderCustomPermanence = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    cfg.customPermanence = !!document.getElementById("oed-custom-permanence")?.checked;
    if (!cfg.customPermanence) cfg.customBasePrice = "";
    normDates(cfg);
    loadActiveToForm();
    window.recalcTotal();
  };

  window.openOrderDatePicker = async function (_target = "start") {
    const cfg = activeCfg();
    if (!cfg) return;
    if (typeof FullCalendar === "undefined") return window.showToast("No se pudo cargar el calendario.", "error");
    PM_ORDER_DATE_PICKER.start = iso(document.getElementById("oed-start")?.value || cfg.startDate || "");
    PM_ORDER_DATE_PICKER.end = iso(document.getElementById("oed-end")?.value || cfg.endDate || PM_ORDER_DATE_PICKER.start || "");
    window.openModal("order-date-modal");
    await renderOrderDatePicker();
    refreshCalendarLayout(pmOrderEventPickerCal);
  };

  window.pickOrderDate = async function (ds) {
    const day = iso(ds);
    if (!day) return;
    if (day < today()) return;
    if (PM_ORDER_DATE_PICKER.reserved?.has(day)) return window.showToast(`La fecha ${window.safeFormatDate(day)} ya está ocupada para este espacio.`, "error");
    const cfg = activeCfg();
    if (!cfg) return;
    if (!cfg.customPermanence) {
      const m = monthBounds(day);
      const clash = datesBetween(m.s, m.e).find((d) => PM_ORDER_DATE_PICKER.reserved?.has(d));
      if (clash) return window.showToast(`Ese periodo automático de 30 días incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, "error");
      PM_ORDER_DATE_PICKER.start = m.s;
      PM_ORDER_DATE_PICKER.end = m.e;
      await renderOrderDatePicker();
      return;
    }
    if (!PM_ORDER_DATE_PICKER.start || PM_ORDER_DATE_PICKER.end) {
      PM_ORDER_DATE_PICKER.start = day;
      PM_ORDER_DATE_PICKER.end = "";
    } else if (day < PM_ORDER_DATE_PICKER.start) {
      PM_ORDER_DATE_PICKER.start = day;
    } else {
      const range = datesBetween(PM_ORDER_DATE_PICKER.start, day);
      const clash = range.find((d) => PM_ORDER_DATE_PICKER.reserved?.has(d));
      if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, "error");
      PM_ORDER_DATE_PICKER.end = day;
    }
    await renderOrderDatePicker();
  };

  window.applyOrderDatePickerSelection = function () {
    if (!PM_ORDER_DATE_PICKER.start) return window.showToast("Selecciona al menos una fecha.", "error");
    setDateOnForm(PM_ORDER_DATE_PICKER.start, PM_ORDER_DATE_PICKER.end || PM_ORDER_DATE_PICKER.start);
    window.closeModal("order-date-modal");
  };

  window.onOrderTaxSelectionChanged = function () {
    const cfg = activeCfg();
    if (!cfg) return;
    cfg.taxIds = Array.from(document.querySelectorAll(".oed-tax-check:checked")).map((cb) => parseInt(cb.value, 10)).filter(Number.isFinite);
    window.recalcTotal();
  };

  window.recalcTotal = function () {
    saveActiveFromForm();
    ensureActive();
    const rows = selectedCfg().map((cfg) => {
      const sp = getSpace(cfg.spaceId);
      normDates(cfg);
      const base = (cfg.customPermanence && cfg.customBasePrice !== "" && cfg.customBasePrice !== null && cfg.customBasePrice !== undefined) ? (Math.max(0, parseFloat(cfg.customBasePrice) || 0)) : calculateSpaceTotal(sp, cfg.startDate, cfg.endDate);
      const concepts = safeArr(cfg.concepts).map(normConcept);
      const conceptsTotal = concepts.reduce((a, c) => a + (parseFloat(c.amount || c.value || 0) || 0), 0);
      const subtotalSpace = base + conceptsTotal;
      const taxIds = (cfg.taxIds && cfg.taxIds.length) ? cfg.taxIds.slice() : defaultTaxIds(sp);
      return { cfg, sp, base, concepts, conceptsTotal, subtotalSpace, taxIds, rate: taxRate(taxIds) };
    });
    const subtotalRaw = rows.reduce((a, r) => a + r.subtotalSpace, 0);
    const subtotalBase = rows.reduce((a, r) => a + r.base, 0);
    const adjType = document.getElementById("oed-adj-type")?.value || "ninguno";
    const adjVal = parseFloat(document.getElementById("oed-adj-val")?.value || 0) || 0;
    const isPct = (document.getElementById("oed-adj-unit")?.value || "fixed") === "percent";
    let adjustment = 0;
    let adjusted = subtotalRaw;
    if (adjType !== "ninguno") {
      adjustment = isPct ? (subtotalRaw * (adjVal / 100)) : adjVal;
      adjusted = adjType === "descuento" ? Math.max(0, subtotalRaw - adjustment) : subtotalRaw + adjustment;
    }
    let tax = 0;
    const denom = subtotalRaw > 0 ? subtotalRaw : 1;
    rows.forEach((r) => {
      const ratio = subtotalRaw > 0 ? (r.subtotalSpace / denom) : (1 / Math.max(1, rows.length));
      r.adjustedSubtotal = adjusted * ratio;
      r.tax = r.adjustedSubtotal * r.rate;
      r.total = r.adjustedSubtotal + r.tax;
      tax += r.tax;
    });
    const final = adjusted + tax;
    pmTotals = { spaces: rows, subtotal: subtotalRaw, adjusted, adjustment, tax, final, adjType, subtotalBase };

    const cHtml = [];
    rows.forEach((r) => {
      cHtml.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>${r.sp?.nombre || r.cfg.spaceId} - Base</span><span>${money(r.base)}</span></div>`);
      r.concepts.forEach((c) => cHtml.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>${r.sp?.nombre || r.cfg.spaceId} - ${c.description}</span><span>+${money(c.amount)}</span></div>`));
    });
    document.getElementById("oed-summary-concepts").innerHTML = cHtml.join("");
    document.getElementById("oed-tax-summary-display").innerHTML = rows.filter((r) => r.tax > 0).map((r) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${r.sp?.nombre || r.cfg.spaceId}</span><span>+${money(r.tax)}</span></div>`).join("");
    document.getElementById("lbl-subtotal-base").innerText = money(subtotalBase);
    document.getElementById("lbl-subtotal").innerText = money(adjusted);
    document.getElementById("lbl-adjustment").innerText = `${adjType === "descuento" ? "-" : "+"}${money(adjustment)}`;
    document.getElementById("oed-price").value = (final || 0).toFixed(2);

    const min = rows.map((r) => r.cfg.startDate).filter(Boolean).sort()[0] || "";
    const max = rows.map((r) => r.cfg.endDate).filter(Boolean).sort().slice(-1)[0] || "";
    document.getElementById("sum-dates").innerText = (min && max) ? `${window.safeFormatDate(min)} al ${window.safeFormatDate(max)}` : "--";
    document.getElementById("sum-quote-name").innerText = (document.getElementById("oed-quote-name")?.value || currentPreviewOrder?.nombre_cotizacion || "---");
    document.getElementById("sum-status").innerText = String(document.getElementById("oed-status")?.value || "pendiente").toUpperCase();
    document.getElementById("sum-client").innerText = document.getElementById("oed-client")?.value || "---";
    applyStatusVisual();
    document.getElementById("sum-spaces-count").innerText = String(rows.length);
    const list = document.getElementById("sum-spaces-list");
    if (list) {
      list.innerHTML = rows.map((r) => {
        const active = String(r.cfg.spaceId) === String(pmActive);
        return `<button type="button" onclick="window.selectOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${active ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-brand-red"} p-2 transition"><div class="flex justify-between items-start gap-2"><div class="min-w-0"><p class="text-[10px] font-black uppercase text-gray-800 whitespace-normal break-words leading-tight">${r.sp?.nombre || r.cfg.spaceId}</p><p class="text-[10px] font-mono text-gray-500 mt-0.5 break-all">ID: ${r.cfg.spaceId}${r.sp?.clave ? ` · ${r.sp.clave}` : ""}</p></div><span class="text-[10px] font-bold shrink-0 ${active ? "text-emerald-700" : "text-gray-400"}">${active ? "Editando" : "Editar"}</span></div><p class="text-[10px] text-gray-500 mt-1">${window.safeFormatDate(r.cfg.startDate)} - ${window.safeFormatDate(r.cfg.endDate)}</p><p class="text-[10px] font-bold text-gray-700 mt-1">${money(r.total)}</p></button>`;
      }).join("");
    }
  };

  window.getFormDataFromModal = function () {
    saveActiveFromForm();
    window.recalcTotal();
    if (!pmTotals.spaces.length) throw new Error("No hay espacios activos.");
    const details = pmTotals.spaces.map((r) => ({
      espacio_id: r.cfg.spaceId,
      espacio_nombre: r.sp?.nombre || r.cfg.spaceId,
      espacio_clave: r.sp?.clave || "",
      fecha_inicio: r.cfg.startDate,
      fecha_fin: r.cfg.endDate,
      permanencia_personalizada: !!r.cfg.customPermanence,
      precio_personalizado: (r.cfg.customPermanence && r.cfg.customBasePrice !== "" && r.cfg.customBasePrice !== null && r.cfg.customBasePrice !== undefined) ? (parseFloat(r.cfg.customBasePrice) || 0) : null,
      subtotal_espacio: r.adjustedSubtotal,
      impuestos_ids: r.taxIds || [],
      impuestos_total: r.tax || 0,
      total_espacio: r.total || 0
    }));
    const concepts = [];
    pmTotals.spaces.forEach((r) => r.concepts.forEach((c) => {
      const n = normConcept(c);
      n.meta = { ...(n.meta || {}), space_id: r.cfg.spaceId };
      concepts.push(n);
    }));
    const starts = details.map((d) => d.fecha_inicio).filter(Boolean).sort();
    const ends = details.map((d) => d.fecha_fin).filter(Boolean).sort();
    const first = pmTotals.spaces[0];
    const taxUnion = Array.from(new Set(pmTotals.spaces.flatMap((r) => (r.taxIds || []).map((x) => String(x)))));
    return {
      nombre_cotizacion: (document.getElementById("oed-quote-name")?.value || "").trim() || currentPreviewOrder?.nombre_cotizacion || null,
      cliente_nombre: document.getElementById("oed-client")?.value || "",
      cliente_email: document.getElementById("oed-email")?.value || "",
      cliente_contacto: document.getElementById("oed-phone")?.value || "",
      cliente_rfc: document.getElementById("fiscal-rfc-re")?.value || "",
      cliente_id: (document.getElementById("oed-client-id") ? (document.getElementById("oed-client-id").value || null) : null),
      fecha_inicio: starts[0] || first.cfg.startDate,
      fecha_fin: ends[ends.length - 1] || first.cfg.endDate,
      precio_final: parseFloat(document.getElementById("oed-price")?.value || 0) || 0,
      espacio_id: first.cfg.spaceId,
      espacio_nombre: pmTotals.spaces.length === 1 ? (first.sp?.nombre || first.cfg.spaceId) : `${first.sp?.nombre || first.cfg.spaceId} + ${pmTotals.spaces.length - 1} espacio(s)`,
      espacio_clave: pmTotals.spaces.length === 1 ? (first.sp?.clave || "") : "MULTI",
      tipo_ajuste: document.getElementById("oed-adj-type")?.value || "ninguno",
      valor_ajuste: parseFloat(document.getElementById("oed-adj-val")?.value || 0) || 0,
      ajuste_es_porcentaje: (document.getElementById("oed-adj-unit")?.value || "fixed") === "percent",
      conceptos_adicionales: concepts,
      espacios_detalle: details,
      desglose_precios: { subtotal_antes_impuestos: pmTotals.adjusted, impuestos_detalle: taxUnion, tax_total: pmTotals.tax, espacios: details },
      detalles_evento: { multi_espacio: details.length > 1, total_espacios: details.length, nombre_cotizacion: (document.getElementById("oed-quote-name")?.value || "").trim() || currentPreviewOrder?.nombre_cotizacion || null, permanencia_personalizada: details.some((d) => !!d.permanencia_personalizada) }
    };
  };

  async function findConflict(orderId) {
    const selected = selectedCfg();
    if (!selected.length) return null;
    const { data, error } = await __pmQuotesList({ filter: 'status = "aprobada"', perPage: 500 });
    if (error) throw error;
    for (const cfg of selected) {
      const s = iso(cfg.startDate); const e = iso(cfg.endDate); const sid = String(cfg.spaceId);
      for (const row of (data || [])) {
        if (String(row.id) === String(orderId)) continue;
        const d = parseDetail(row.espacios_detalle);
        const ranges = [];
        if (d.length) d.forEach((x) => { const id = String(x.espacio_id || x.space_id || ""); const fi = iso(x.fecha_inicio || ""); const ff = iso(x.fecha_fin || ""); if (id === sid && fi && ff) ranges.push({ fi, ff }); });
        else if (String(row.espacio_id || "") === sid) { const fi = iso(row.fecha_inicio || ""); const ff = iso(row.fecha_fin || ""); if (fi && ff) ranges.push({ fi, ff }); }
        const hit = ranges.find((r) => new Date(s + "T00:00:00") <= new Date(r.ff + "T00:00:00") && new Date(r.fi + "T00:00:00") <= new Date(e + "T00:00:00"));
        if (hit) return { space: getSpace(sid)?.nombre || sid, fi: hit.fi, ff: hit.ff };
      }
    }
    return null;
  }

  window.attemptSaveOrder = async function () {
    const locked = __pmIsLockedOrder();
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    saveActiveFromForm();
    window.recalcTotal();
    const newStatus = document.getElementById("oed-status")?.value || "pendiente";
    const curLvl = STATUS_LEVEL[currentPreviewOrder?.status] || 0;
    const newLvl = STATUS_LEVEL[newStatus] || 0;
    if (newLvl < curLvl) return window.showToast("No puedes regresar a un estado anterior.", "error");
    if (newStatus === "aprobada" && String(currentPreviewOrder?.status || "").toLowerCase() !== "aprobada") {
      const missing = [];
      if (!document.getElementById("oed-client")?.value) missing.push("Nombre Cliente");
      if (!document.getElementById("oed-email")?.value) missing.push("Email");
      if (!document.getElementById("fiscal-rfc-re")?.value) missing.push("RFC");
      if (!selectedCfg().every((c) => c.startDate && c.endDate)) missing.push("Fechas");
      if (missing.length) return window.showToast(`Faltan datos para aprobar: ${missing.join(", ")}`, "error");
      try {
        const c = await findConflict(currentPreviewOrder?.id);
        if (c) return window.showToast(`${c.space} ocupado (${window.safeFormatDate(c.fi)}${c.fi !== c.ff ? " a " + window.safeFormatDate(c.ff) : ""}).`, "error");
      } catch (e) { return window.showToast(`No se pudo validar disponibilidad: ${e.message}`, "error"); }
      window.initiateApprovalSnapshot();
      return;
    }
    window.processSaveOrder();
  };

  window.processSaveOrder = async function () {
    const locked = __pmIsLockedOrder();
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    const btn = document.getElementById("btn-save-progress");
    btn.disabled = true; btn.innerText = "Guardando...";
    try {
      const formData = window.getFormDataFromModal();
      const nextStatus = document.getElementById("oed-status")?.value || "pendiente";
      const prevStatus = String(currentPreviewOrder?.status || "").toLowerCase();
      const approvalTransition = nextStatus === "aprobada" && !["aprobada", "finalizada"].includes(prevStatus);
      formData.status = nextStatus;
      if (!formData.numero_orden) formData.numero_orden = currentPreviewOrder?.numero_orden || String(currentPreviewOrder?.id || "").split("-")[0].toUpperCase();
      if (approvalTransition) {
        const missing = [];
        if (!document.getElementById("oed-client")?.value) missing.push("Nombre Cliente");
        if (!document.getElementById("oed-email")?.value) missing.push("Email");
        if (!document.getElementById("fiscal-rfc-re")?.value) missing.push("RFC");
        if (!selectedCfg().every((c) => c.startDate && c.endDate)) missing.push("Fechas");
        if (missing.length) throw new Error(`Faltan datos para aprobar: ${missing.join(", ")}`);
        const c = await findConflict(currentPreviewOrder?.id);
        if (c) throw new Error(`${c.space} ocupado (${window.safeFormatDate(c.fi)}${c.fi !== c.ff ? " a " + window.safeFormatDate(c.ff) : ""}).`);
      }
      const { error } = await __pmQuotesUpdate(document.getElementById("oed-id")?.value || currentPreviewOrder?.id, formData);
      if (error) throw error;
      currentPreviewOrder = { ...currentPreviewOrder, ...formData };
      signalOrdersRefresh(nextStatus === "aprobada" ? "approved_saved" : "saved");
      if (approvalTransition) {
        await __pmEnsurePdfStyleProfile('quote');
        const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, "quote");
        const pdfContainer = document.getElementById("pdf-content");
        const embedViewer = document.getElementById("doc-preview");
        const btnDownload = document.getElementById("btn-download-preview");
        pdfContainer.innerHTML = content;
        __pmResetPreviewEditingState();
        __pmApplyPdfStyleToLivePreview();
        pdfContainer.classList.remove("hidden");
        embedViewer.classList.add("hidden");
        window.openModal("preview-modal");

        const pdfBlob = (typeof window.generatePdfBlobFromNode === "function")
          ? await window.generatePdfBlobFromNode(pdfContainer)
          : await renderPdfBlobFallback(pdfContainer);
        const folio = formData.numero_orden || String(currentPreviewOrder.id || "").split("-")[0].toUpperCase();
        const path = `${currentPreviewOrder.id}/cotizacion_aprobada_${folio}.pdf`;
        const { error: uploadErr } = await window.globalPocketBase.storage.from("documentos").upload(path, pdfBlob, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { error: dbErr } = await __pmQuotesUpdate(currentPreviewOrder.id, { url_cotizacion_final: path, status: "aprobada" });
        if (dbErr) throw dbErr;
        currentPreviewOrder = { ...currentPreviewOrder, url_cotizacion_final: path, status: "aprobada" };
        signalOrdersRefresh("approved_snapshot");
        if (btnDownload) {
          btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
          btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
          btnDownload.onclick = () => {
            if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(pdfBlob, `Cotizacion_Aprobada_${folio}.pdf`);
            else {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(pdfBlob);
              a.download = `Cotizacion_Aprobada_${folio}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
          };
        }
        window.showToast("Cotización aprobada, PDF y snapshot generados.", "success");
      } else {
        window.showToast("Cambios guardados", "success");
      }
      if (!IS_PM_ORDER_DETAIL_PAGE) window.closeModal("order-edit-modal");
      await window.loadOrders();
      if (approvalTransition && IS_PM_ORDER_DETAIL_PAGE) {
        await window.openOrderEditModal(currentPreviewOrder.id);
      }
    } catch (e) { window.showToast("Error: " + e.message, "error"); }
    finally { btn.disabled = false; btn.innerText = "Guardar"; }
  };

  window.executeApprovalTransaction = async function (formData) {
    const btn = document.getElementById("btn-download-preview");
    if (btn) { btn.disabled = true; btn.innerText = "Generando Snapshot..."; }
    try {
      const element = document.getElementById("pdf-content");
      const pdfBlob = (typeof window.generatePdfBlobFromNode === "function")
        ? await window.generatePdfBlobFromNode(element)
        : await renderPdfBlobFallback(element);
      const folio = formData.numero_orden || String(currentPreviewOrder.id || "").split("-")[0].toUpperCase();
      const path = `${currentPreviewOrder.id}/cotizacion_aprobada_${folio}.pdf`;
      const { error: uploadErr } = await window.globalPocketBase.storage.from("documentos").upload(path, pdfBlob, { upsert: true });
      if (uploadErr) throw uploadErr;
      const payload = { ...formData, status: "aprobada", url_cotizacion_final: path };
      const { error: dbErr } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
      if (dbErr) throw dbErr;
      if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(pdfBlob, `Cotizacion_Aprobada_${folio}.pdf`);
      else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Cotizacion_Aprobada_${folio}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
      }
      window.showToast("¡Cotización aprobada y archivada!", "success");
      window.closeModal("preview-modal");
      await window.loadOrders();
      if (IS_PM_ORDER_DETAIL_PAGE) await window.openOrderEditModal(currentPreviewOrder.id);
      else window.closeModal("order-edit-modal");
    } catch (e) {
      window.showToast("Error en la aprobación: " + e.message, "error");
      if (btn) { btn.disabled = false; btn.innerText = "Reintentar"; }
    }
  };

  window.openOrderEditModal = async function (id) {
    const order = allOrders.find((o) => String(o.id) === String(id));
    if (!order) return;
    await loadClientProfilesForOrderModal();
    currentPreviewOrder = { ...order };

    document.getElementById("oed-id").value = order.id;
    document.getElementById("oed-client").value = order.cliente_nombre || "";
    document.getElementById("oed-phone").value = order.cliente_contacto || "";
    document.getElementById("oed-email").value = order.cliente_email || "";
    document.getElementById("fiscal-rfc-re").value = order.cliente_rfc || "";
    document.getElementById("oed-status").value = order.status || "pendiente";
    applyStatusVisual();
    if (document.getElementById("oed-quote-name")) document.getElementById("oed-quote-name").value = order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || "";

    const details = parseDetail(order.espacios_detalle);
    pmSpaces = details.length
      ? details.map((d) => mkCfg(d.espacio_id || d.space_id, { selected: true, customPermanence: d.permanencia_personalizada === true, startDate: d.fecha_inicio || "", endDate: d.fecha_fin || "", customBasePrice: d.precio_personalizado, taxIds: safeArr(d.impuestos_ids).map((x) => parseInt(x, 10)).filter(Number.isFinite) }))
      : [mkCfg(order.espacio_id, { selected: true, startDate: order.fecha_inicio, endDate: order.fecha_fin })];

    const rawConcepts = safeArr(order.conceptos_adicionales).map(normConcept);
    if (rawConcepts.length) {
      pmSpaces.forEach((c) => { c.concepts = []; });
      rawConcepts.forEach((c) => {
        const sid = String(c?.meta?.space_id || pmSpaces[0]?.spaceId || "");
        const cfg = getCfg(sid) || pmSpaces[0];
        if (cfg) cfg.concepts.push(c);
      });
    }

    if (document.getElementById("oed-adj-type")) {
      document.getElementById("oed-adj-type").value = order.tipo_ajuste || "ninguno";
      document.getElementById("oed-adj-val").value = order.valor_ajuste || 0;
      document.getElementById("oed-adj-unit").value = order.ajuste_es_porcentaje ? "percent" : "fixed";
    }

    pmActive = String(selectedCfg()[0]?.spaceId || pmSpaces[0]?.spaceId || "");
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();

    const conceptSel = document.getElementById("new-concept-select");
    if (conceptSel) {
      conceptSel.innerHTML = '<option value="">-- Agregar --</option>';
      catalogConcepts.forEach((c) => conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    }

    const isLocked = __pmIsLockedOrder();
    document.querySelectorAll("#order-edit-modal input, #order-edit-modal select").forEach((i) => {
      if (i.id === "btn-save-progress" || i.id === "btn-save-approve") return;
      i.disabled = isLocked;
    });
    const saveBtn = document.getElementById("btn-save-progress");
    if (saveBtn) { saveBtn.disabled = isLocked; saveBtn.classList.toggle("opacity-60", isLocked); saveBtn.title = isLocked ? "Cotización aprobada: edición bloqueada" : ""; saveBtn.innerText = "Guardar"; }
    const approveBtn = document.getElementById("btn-save-approve");
    if (approveBtn) { approveBtn.disabled = isLocked; approveBtn.classList.toggle("opacity-60", isLocked); approveBtn.title = isLocked ? "Cotización aprobada: edición bloqueada" : ""; }
    const quoteName = document.getElementById("oed-quote-name");
    if (quoteName) quoteName.disabled = isLocked;
    const statusSel = document.getElementById("oed-status");
    if (statusSel) {
      statusSel.disabled = isLocked;
      statusSel.onchange = () => { applyStatusVisual(); window.recalcTotal(); };
    }

    window.renderConceptsList();
    window.recalcTotal();
    window.openModal("order-edit-modal");
    const loading = document.getElementById("editor-loading");
    if (loading) loading.classList.add("hidden");
  };

  window.addEventListener("click", (ev) => {
    const modal = document.getElementById("order-date-modal");
    if (modal && ev.target === modal) window.closeModal("order-date-modal");
  });

  const originalScroll = window.scrollOrderSpaceCards;
  window.scrollOrderSpaceCards = function(direction) {
    const viewport = document.getElementById("oed-space-cards");
    if (!viewport) return originalScroll ? originalScroll(direction) : undefined;
    const delta = viewport.clientWidth + 8;
    viewport.scrollBy({ left: (direction || 1) * delta, behavior: "smooth" });
  };
})();






