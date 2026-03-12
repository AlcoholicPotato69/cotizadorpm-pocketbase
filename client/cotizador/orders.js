/**
 * DOC: client\cotizador\orders.js
 * Proposito: Listado y edicion de cotizaciones existentes.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE COTIZACIONES ADMIN - PLAZA MAYOR
// =========================================================================
let orderClientProfiles = []; let orderClientProfilesById = {};

async function loadClientProfilesForOrderModal() {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel || !window.finSupabase) return;

    try {
        const { data, error } = await window.finSupabase.from('clientes').select('id,nombre_completo,telefono,correo,rfc').order('nombre_completo', { ascending: true });
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
const COMPANY_LOGO_URL = _isCP ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || 'http://127.0.0.1:54321/storage/v1/object/public/Espacios/logocp.png') : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || 'http://127.0.0.1:54321/storage/v1/object/public/Espacios/logo.png');
let __PM_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
const __PM_PDF_PAGE_WIDTH_PX = 816;
const __PM_PDF_PAGE_HEIGHT_PX = 1056;
const __PM_LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const __PM_LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const __PM_LETTERHEAD_MARGINS_DESIGN_PX = { top: 202.2, right: 61.1, bottom: 113.38, left: 61.1 };
const __PM_PDF_CONTENT_BASE_WIDTH_PX = 816;
const __PM_CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __PM_LETTERHEAD_PATH = 'membretes_pdf';

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
        const { data, error } = await window.finSupabase
            .from('configuracion')
            .select('*')
            .eq('clave', __PM_CFG_LETTERHEAD_KEY)
            .maybeSingle();
        if (error || !data) return;
        const cfg = data.valor_json || {};
        const rawPath = cfg.path || cfg.file_path || cfg.value || '';
        const safePath = rawPath || (cfg.file_name ? `${__PM_LETTERHEAD_PATH}/${cfg.file_name}` : '');
        if (!safePath) return;
        const { data: signed, error: signedError } = await window.globalSupabase.storage.from('documentos').createSignedUrl(safePath, 3600);
        if (!signedError && signed?.signedUrl) {
            __PM_LETTERHEAD_URL = signed.signedUrl;
            return;
        }
        const fallbackName = __pmBasename(safePath);
        if (fallbackName) {
            const fallbackPath = `${__PM_LETTERHEAD_PATH}/${fallbackName}`;
            const { data: fallbackSigned, error: fallbackErr } = await window.globalSupabase.storage.from('documentos').createSignedUrl(fallbackPath, 3600);
            if (!fallbackErr && fallbackSigned?.signedUrl) __PM_LETTERHEAD_URL = fallbackSigned.signedUrl;
        }
    } catch (_) {}
}

function __pmLetterheadFrame() {
    const sx = __PM_PDF_PAGE_WIDTH_PX / __PM_LETTERHEAD_DESIGN_WIDTH_PX;
    const sy = __PM_PDF_PAGE_HEIGHT_PX / __PM_LETTERHEAD_DESIGN_HEIGHT_PX;
    const top = __PM_LETTERHEAD_MARGINS_DESIGN_PX.top * sy;
    const right = __PM_LETTERHEAD_MARGINS_DESIGN_PX.right * sx;
    const bottom = __PM_LETTERHEAD_MARGINS_DESIGN_PX.bottom * sy;
    const left = __PM_LETTERHEAD_MARGINS_DESIGN_PX.left * sx;
    return {
        top,
        right,
        bottom,
        left,
        width: __PM_PDF_PAGE_WIDTH_PX - left - right,
        height: __PM_PDF_PAGE_HEIGHT_PX - top - bottom
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

const SB_URL = window.HUB_CONFIG?.supabaseUrl || window.ENV?.SUPABASE_URL || '';
const SB_KEY = window.HUB_CONFIG?.supabaseAnonKey || window.ENV?.SUPABASE_ANON_KEY || '';
const FIN_SCHEMA = (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA)
    ? TENANT_SCHEMA
    : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_PLAZA_MAYOR || 'finanzas');
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
    const query = window.finSupabase.from('cotizaciones').select('*');
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
    const result = await window.finSupabase.from('cotizaciones').update(payload || {}).eq('id', id);
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
    const result = await window.finSupabase.from('cotizaciones').delete().eq('id', id);
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
            if (img.complete && (img.naturalWidth || img.naturalHeight)) return Promise.resolve();
            return new Promise(resolve => {
                const done = () => resolve();
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

window.generatePdfBlobFromNode = async function(sourceNode, extraOptions = {}) {
    if (!sourceNode) throw new Error('No hay contenido para generar PDF.');
    const host = __pmGetPdfRenderHost();
    const markup = String(sourceNode.innerHTML || '').trim();
    if (!markup) throw new Error('Contenido PDF vacío.');
    try {
        host.innerHTML = markup;
        const target = host.firstElementChild || host;
        if (target?.classList?.contains('hidden')) target.classList.remove('hidden');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await __pmWaitForPdfAssets(target, 7000);

        const baseOptions = {
            margin: 0,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                scrollY: 0,
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
window.openStoredDocument = async function(path) { if(!path) return window.showToast("Documento no disponible", "error"); window.showToast("Abriendo documento...", "info"); const { data, error } = await window.globalSupabase.storage.from('documentos').createSignedUrl(path, 3600); if (error || !data) return window.showToast("Error de acceso al archivo", "error"); window.open(data.signedUrl, '_blank'); };

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
            const { data: files } = await window.globalSupabase.storage.from('documentos').list(`${id}`, { limit: 100 });
            if (files && files.length > 0) await window.globalSupabase.storage.from('documentos').remove(files.map(x => `${id}/${x.name}`));
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
    if (window.PB_CLIENT) {
        if(!window.finSupabase) window.finSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalSupabase) window.globalSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY);
    }
    const { data: { session } } = await window.globalSupabase.auth.getSession(); if (!session) return;
    await __pmLoadLetterheadConfig();
    
    const { data: profile } = await window.globalSupabase.from('profiles').select('*').eq('id', session.user.id).single();
    window.currentUserProfile = profile;

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

async function loadTaxes() { const { data } = await window.finSupabase.from('impuestos').select('*'); dbTaxes = data || []; }
async function loadSpaces() { const { data } = await window.finSupabase.from('espacios').select('*'); allSpaces = data || []; __pmEnsureSpaceCardOrder(); window.renderOrderSpaceCards(); }
async function loadConcepts() { const { data } = await window.finSupabase.from('conceptos_catalogo').select('*').eq('activo', true); catalogConcepts = data || []; }

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
    const formData = window.getFormDataFromModal();
    if (!formData.numero_orden) { formData.numero_orden = currentPreviewOrder.id.split('-')[0].toUpperCase(); }

    const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, 'quote'); 
    
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    const btnAction = document.getElementById('btn-download-preview');
    
    pdfContainer.innerHTML = content;
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
        
        const { error: uploadError } = await window.globalSupabase.storage.from('documentos').upload(path, pdfBlob);
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
    const order = allOrders.find(o => o.id === id);
    if(!order) return;
    currentPreviewOrder = { ...order, docType: 'order' }; 
    
    const content = await window.getOrderHTML(order, 'order');
    
    const pdfContainer = document.getElementById('pdf-content');
    const embed = document.getElementById('doc-preview');
    
    pdfContainer.innerHTML = content;
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
            
            await window.globalSupabase.storage.from('documentos').upload(path, pdfBlob);
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
        list.innerHTML += `<button onclick="${action}" class="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm group bg-white mb-2"><div class="w-8 h-8 rounded-full bg-${color}-100 text-${color}-600 flex items-center justify-center shrink-0"><i class="${icon}"></i></div><div class="flex-grow"><p class="text-xs font-bold text-gray-700">${label}</p></div><i class="fa-solid fa-arrow-right text-xs text-gray-300"></i></button>`;
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
    const o = allOrders.find(x => x.id === id); if(!o) return; 
    currentPreviewOrder = { ...o, docType: type }; 
    const content = await window.getOrderHTML(o, type); 
    const pdfContainer = document.getElementById('pdf-content'); 
    const embedViewer = document.getElementById('doc-preview'); 
    const btnDownload = document.getElementById('btn-download-preview'); 
    pdfContainer.classList.remove('hidden'); embedViewer.classList.add('hidden'); pdfContainer.innerHTML = content; 
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

window.getOrderHTML = function(o, type) { 
    const isOrder = type === 'order'; 
    const logoImg = ''; 

    const now = new Date(); const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); const genDateTime = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }); let docTitle = isOrder ? "ORDEN DE COMPRA" : "COTIZACIÓN"; 
    
    let folio = o.numero_orden || o.id.split('-')[0].toUpperCase(); 
    
    const space = allSpaces.find(s=>s.id==o.espacio_id); const basePrice = parseFloat(space ? space.precio_base : 0); 
    const descHTML = isOrder ? '' : `<p class="text-[9px] text-gray-500 italic mt-0.5 truncate max-w-xs">${space?.descripcion || ''}</p>`; 
    const footerHubHTML = `<div class="w-full text-center mt-10"><p class="text-[10px] text-gray-400 font-medium leading-tight">Generado el ${genDateTime}<br>a través de Marketing Hub - Plaza Mayor</p></div>`; 
    const renderHeader = (title) => `<div class="flex justify-end items-start border-b-4 border-brand-red pb-3 mb-2">${logoImg}<div class="text-right"><h1 class="text-2xl font-black text-gray-800 tracking-tighter uppercase">${title}</h1><p class="text-sm font-mono text-brand-red font-bold mt-1">FOLIO: ${folio}</p><p class="text-[10px] text-gray-500 mt-1">${dateStr}</p></div></div>`; 
    let clientName = o.cliente_nombre || 'CLIENTE';
    let clientRfc = o.cliente_rfc;
    let nameSizeClass = 'text-xl';
    if (clientName.length > 35) nameSizeClass = 'text-xs'; else if (clientName.length > 25) nameSizeClass = 'text-sm';
    const quoteStatus = String(o?.status || '').toLowerCase();
    const isApprovedQuote = !isOrder && ['aprobada', 'finalizada'].includes(quoteStatus);
    const clientComponent = (isOrder || isApprovedQuote)
        ? `<div class="flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100"><div class="w-1/2 border-r border-gray-200 pr-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div><div class="w-1/2 pl-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Contacto / Fiscal</p><p class="font-mono text-xs text-gray-700 truncate">${o.cliente_email || 'Sin correo'}</p>${clientRfc ? `<p class="font-mono text-xs text-gray-700 mt-0.5">RFC: <strong>${clientRfc}</strong></p>` : ''}</div></div>`
        : `<div class="mb-2 p-2 bg-gray-50 rounded border border-gray-100"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div>`;
    
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
    const totalsBlock = `<div class="flex justify-end mb-2 pr-4"><div class="w-64"><table class="w-full border-collapse">${taxRows}<tr><td class="pt-2 border-t-2 border-gray-800 align-middle text-right" colspan="2"><span class="text-[10px] font-bold uppercase text-gray-500 mr-2">Total Neto</span></td><td class="pt-2 border-t-2 border-gray-800 align-middle text-right"><span class="text-xl font-black text-gray-900">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(o.precio_final)}</span></td></tr></table></div></div>`; 
    
    // FIRMA DINÁMICA
    let staffName = window.currentUserProfile?.Usernames || window.currentUserProfile?.username || window.currentUserProfile?.full_name || 'Staff';

    let signBlock = ''; 
    if (isOrder) { 
        signBlock = `<div class="flex justify-center w-full"><div class="text-center w-64"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark">${staffName}</p><p class="text-[10px] text-gray-500 uppercase">Staff Plaza Mayor</p></div></div>`; 
    } else { 
        signBlock = `<div class="text-center w-56"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark">${staffName}</p><p class="text-[10px] text-gray-500 uppercase">Staff Plaza Mayor</p></div><div class="text-center w-56"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark uppercase">${o.cliente_nombre.substring(0,25)}</p><p class="text-[10px] text-gray-500 uppercase">Cliente / Representante</p></div>`; 
    } 
    
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
    const page1Raw = `<div style="width: 100%; min-height: ${pageBaseHeight}px; height: ${pageBaseHeight}px; overflow: hidden; padding: 16px 64px 48px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;"><div>${renderHeader(docTitle)}${clientComponent}${isOrder ? `<div class="mb-2 bg-gray-100 p-2 rounded text-base flex justify-between"><span>Folio de Servicio: <strong class="font-black text-lg">${folio}</strong></span><span>Contrato: <strong class="font-black text-lg">${o.numero_contrato||'---'}</strong></span></div>` : ''}<table class="w-full text-left mb-2 mt-3 table-fixed border-separate border-spacing-0"><colgroup><col style="width:64%;"><col style="width:16%;"><col style="width:20%;"></colgroup><thead class="bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead><tbody class="divide-y divide-gray-50 text-[12px]">${rowsHtml}</tbody></table> ${totalsBlock}</div><div class="pb-2">${!isOrder ? `<div class="grid grid-cols-2 gap-4 mb-20 pt-4 border-t border-gray-100"><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">Condiciones:</h4><ul class="list-none text-xs text-gray-600 space-y-0.5 leading-tight"><li>a) Pago anticipado.</li><li>b) Doc. completa 3 semanas antes.</li><li>c) Sujeto a disponibilidad.</li></ul></div><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">Vigencia:</h4><p class="text-xs text-gray-600">7 días naturales a partir de la emisión.</p></div></div>` : ''}<div class="flex justify-between items-start px-2">${signBlock}</div>${footerHubHTML}</div></div>`; 
    let page1Content = __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(page1Raw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight });
    let page2Content = ''; 
    if (!isOrder) { 
        const page2Raw = `<div style="width: 100%; min-height: ${pageBaseHeight}px; height: ${pageBaseHeight}px; overflow: hidden; padding: 16px 64px 48px; box-sizing: border-box;">${renderHeader("CONDICIONES GENERALES")}<ol class="list-decimal list-outside ml-6 text-xs text-gray-800 space-y-4 text-justify leading-loose mt-8"><li><span class="font-bold">La instalación será responsabilidad exclusiva del cliente.</span> Esto incluye cualquier costo asociado con la instalación, como mano de obra, herramientas, y materiales necesarios. El cliente debe coordinar con el personal del centro comercial para asegurar que la instalación cumpla con las normativas y políticas de Plaza Mayor.</li><li><span class="font-bold">El diseño y contenido del material publicitario deben cumplir con las normativas establecidas por el centro comercial.</span> Antes de la instalación, el cliente deberá obtener la aprobación necesaria de Plaza Mayor para asegurar la conformidad con las políticas vigentes.</li><li><span class="font-bold">El cliente es completamente responsable del contenido del material publicitario.</span> Debe garantizar que el contenido no infrinja derechos de terceros, incluyendo derechos de autor, marcas registradas u otros derechos de propiedad intelectual. El centro comercial se reserva el derecho de rechazar la instalación de cualquier material que considere inapropiado o que viole las normativas establecidas.</li><li><span class="font-bold">Durante el proceso de instalación y desinstalación, el cliente será responsable de cualquier daño causado al espacio o propiedad del centro comercial.</span> Se recomienda que el cliente cuente con un seguro de responsabilidad civil para cubrir cualquier daño potencial.</li><li><span class="font-bold">Cualquier modificación en la duración, diseño o ubicación del material publicitario debe ser comunicada y aprobada por el centro comercial con anticipación.</span></li><li><span class="font-bold">No se permite volanteo fuera del espacio designado, ni equipo de audio (perifoneo, música, etc) salvo previa autorización por escrito de la Gerencia de Mercadotecnia.</span> Se prohíbe el uso de globos con helio.</li><li><span class="font-bold">Al finalizar la campaña publicitaria, el cliente deberá retirar el material publicitario a más tardar al día siguiente.</span> Cualquier demora en la retirada puede estar sujeta a cargos adicionales.</li><li><span class="font-bold">No se permite la venta ni promoción de artículos para adultos (como juguetes sexuales), bebidas alcohólicas, tabaco, CBD y/o cannabinoides.</span></li><li><span class="font-bold">El almacenamiento y/o recolección de basura correrá por cuenta del cliente.</span> En caso de no hacerlo, Plaza Mayor podrá generar un cargo adicional por este concepto.</li><li><span class="font-bold">El cliente deberá instalar la toma eléctrica necesaria.</span> Plaza Mayor podrá suministrar energía eléctrica de 110v para uso moderado de algunos equipos. Este tema deberá definirse previamente por escrito con la autorización de Gerencia de Operaciones.</li><li><span class="font-bold">Esta es una propuesta económica, las condiciones generales y específicas se presentarán en el contrato correspondiente, posterior a haberse autorizado este documento.</span></li></ol></div>`; 
        page2Content = __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(page2Raw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight });
    } 
    const raw = `<div style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;">${page1Content}${page2Content}</div>`;
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
    await new Promise((resolve) => setTimeout(resolve, 900));
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
        const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, "quote");
        const pdfContainer = document.getElementById("pdf-content");
        const embedViewer = document.getElementById("doc-preview");
        const btnDownload = document.getElementById("btn-download-preview");
        pdfContainer.innerHTML = content;
        pdfContainer.classList.remove("hidden");
        embedViewer.classList.add("hidden");
        window.openModal("preview-modal");

        const pdfBlob = (typeof window.generatePdfBlobFromNode === "function")
          ? await window.generatePdfBlobFromNode(pdfContainer)
          : await renderPdfBlobFallback(pdfContainer);
        const folio = formData.numero_orden || String(currentPreviewOrder.id || "").split("-")[0].toUpperCase();
        const path = `${currentPreviewOrder.id}/cotizacion_aprobada_${folio}.pdf`;
        const { error: uploadErr } = await window.globalSupabase.storage.from("documentos").upload(path, pdfBlob, { upsert: true });
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
      const { error: uploadErr } = await window.globalSupabase.storage.from("documentos").upload(path, pdfBlob, { upsert: true });
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




