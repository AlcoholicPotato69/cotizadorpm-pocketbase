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
    if (!sel || !window.tenantPocketBase) return;

    try {
        const { data, error } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,telefono,correo,rfc').order('nombre_completo', { ascending: true });
        if (error) throw error;
        orderClientProfiles = data || []; orderClientProfilesById = {}; orderClientProfiles.forEach(c => orderClientProfilesById[c.id] = c);
        const current = String(sel.value || hid?.value || '').trim();
        sel.innerHTML = '<option value="">— Sin perfil —</option>' + orderClientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()}</option>`).join('');
        if (current) {
            sel.value = current;
            if (hid) hid.value = sel.value || '';
        }

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

function __pmOrderNormalizeMatchValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function __pmResolveOrderClientProfileId(order = {}) {
    const requestedId = String(order?.cliente_id || '').trim();
    if (requestedId && orderClientProfilesById[requestedId]) return requestedId;
    const targetEmail = __pmOrderNormalizeMatchValue(order?.cliente_email);
    const targetName = __pmOrderNormalizeMatchValue(order?.cliente_nombre);
    const targetRfc = __pmOrderNormalizeMatchValue(order?.cliente_rfc).replace(/\s+/g, '');
    const match = orderClientProfiles.find((profile) => {
        if (!profile) return false;
        const email = __pmOrderNormalizeMatchValue(profile.correo);
        const name = __pmOrderNormalizeMatchValue(profile.nombre_completo);
        const rfc = __pmOrderNormalizeMatchValue(profile.rfc).replace(/\s+/g, '');
        if (targetEmail && email && targetEmail === email) return true;
        if (targetRfc && rfc && targetRfc === rfc) return true;
        if (targetName && name && targetName === name) return true;
        return false;
    });
    return match?.id ? String(match.id) : '';
}

function __pmApplyOrderClientProfileSelection(order = {}) {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel) return '';
    const profileId = __pmResolveOrderClientProfileId(order);
    sel.value = profileId || '';
    if (hid) hid.value = profileId || '';
    return profileId;
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
        ? `<img src='${bgUrl}' ${bgUrl.startsWith('http') ? "crossorigin='anonymous'" : ""} onerror='this.style.display=\"none\"' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
return `<div style="position:relative;width:${__PM_PDF_PAGE_WIDTH_PX}px;height:${__PM_PDF_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:visible;background:#f5f5f5;">${imageLayer}<div data-pdf-preview-frame="1" data-base-width="${baseWidth}" data-base-height="${baseHeight}" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:visible;z-index:1;">${innerHtml}</div></div>`;
}

const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
const FIN_SCHEMA = (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA)
    ? TENANT_SCHEMA
    : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_PLAZA_MAYOR || 'finanzas');
const STATUS_LEVEL = { 'pendiente': 0, 'rechazada': 0, 'aprobada': 1, 'finalizada': 2 };
const PM_ORDERS_PAGE_MODE = window.__PM_ORDERS_MODE || 'list';
const IS_PM_ORDER_DETAIL_PAGE = PM_ORDERS_PAGE_MODE === 'detail';
const IS_PM_ORDER_PREVIEW_PAGE = PM_ORDERS_PAGE_MODE === 'preview';
const PM_ORDERS_REFRESH_KEY = 'pm_orders_refresh_signal';

function __pmIsPreviewOnlyQueryMode() {
    try {
        return String(new URLSearchParams(window.location.search || '').get('previewOnly') || '') === '1';
    } catch (_) {
        return false;
    }
}

function __pmIsPdfPreviewVisible() {
    const root = document.getElementById('pdf-content');
    if (!root || root.classList.contains('hidden')) return false;
    if (IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode()) return true;
    const modal = document.getElementById('preview-modal');
    return !!modal && !modal.classList.contains('hidden');
}

function __pmClosePreviewTabIfNeeded() {
    if (!(IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode())) return;
    const attemptClose = () => {
        try {
            if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') {
                window.__HUB_ALLOW_NEXT_UNLOAD('pm_preview_tab_close');
            }
            window.close();
        } catch (_) {}
    };
    setTimeout(() => {
        attemptClose();
        let tries = 0;
        const timer = setInterval(() => {
            if (window.closed) {
                clearInterval(timer);
                return;
            }
            tries += 1;
            attemptClose();
            if (tries >= 6) {
                clearInterval(timer);
                if (!window.closed) {
                    try { window.showToast("No se pudo cerrar automáticamente la pestaña. Ciérrala manualmente.", "info"); } catch (_) {}
                }
            }
        }, 120);
    }, 40);
}

let allOrders = [], allSpaces = [], catalogConcepts = [], dbTaxes = [], currentPreviewOrder = null;
let currentConcepts = []; 
let myPermissions = { access: false, orders_edit: false };
let currentUserProfile = null;
let pmSpaceCardOrder = [];
let __pmLastRefreshSignalTs = 0;
let __pmOrderDetailDirty = false;
let __pmOrderDetailDirtyBound = false;
let __pmOrderUsersById = Object.create(null);

window.__HUB_HAS_UNSAVED_CHANGES = function() {
    try {
        return IS_PM_ORDER_DETAIL_PAGE === true && __pmOrderDetailDirty === true;
    } catch (_) {
        return false;
    }
};

function __pmReadAuthState(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function __pmResolveCurrentActorId() {
    const compatAuth = __pmReadAuthState('pb_compat_auth_v1');
    const nativeAuth = __pmReadAuthState('pb_native_auth_v1');
    const candidates = [
        currentUserProfile?.id,
        currentUserProfile?.record?.id,
        currentUserProfile?.user?.id,
        compatAuth?.user?.id,
        compatAuth?.record?.id,
        nativeAuth?.user?.id,
        nativeAuth?.record?.id
    ];
    return candidates.map((v) => String(v || '').trim()).find(Boolean) || '';
}

function __pmResolveCurrentActorName() {
    const fromProfile = __pmSanitizeActorName(__pmResolvePdfActorName?.());
    if (fromProfile) return fromProfile;
    const cachedName = __pmSanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) return cachedName;
    const compatAuth = __pmReadAuthState('pb_compat_auth_v1');
    const nativeAuth = __pmReadAuthState('pb_native_auth_v1');
    const username = [
        currentUserProfile?.login_username,
        currentUserProfile?.record?.login_username,
        currentUserProfile?.username,
        currentUserProfile?.record?.username,
        compatAuth?.user?.login_username,
        compatAuth?.record?.login_username,
        compatAuth?.user?.username,
        compatAuth?.record?.username,
        nativeAuth?.user?.login_username,
        nativeAuth?.record?.login_username,
        nativeAuth?.user?.username,
        nativeAuth?.record?.username
    ]
        .map((value) => __pmSanitizeActorName(value))
        .find(Boolean);
    if (username) return username;
    const email = [
        currentUserProfile?.email,
        currentUserProfile?.record?.email,
        compatAuth?.user?.email,
        compatAuth?.record?.email,
        nativeAuth?.user?.email,
        nativeAuth?.record?.email
    ].map((v) => String(v || '').trim()).find(Boolean) || '';
    const emailUser = __pmSanitizeActorName(email ? email.split('@')[0] : '');
    return emailUser || 'Usuario';
}

function __pmBuildQuoteAuditPayload(payload = {}) {
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    const actorId = __pmResolveCurrentActorId();
    const actorName = __pmResolveCurrentActorName();
    if (actorId) next.modificado_por_legacy = actorId;
    if (actorName) next.modificado_por_nombre = actorName;
    return next;
}

function __pmMarkOrderDetailDirty() {
    if (!IS_PM_ORDER_DETAIL_PAGE) return;
    __pmOrderDetailDirty = true;
}

function __pmClearOrderDetailDirty() {
    __pmOrderDetailDirty = false;
}

function __pmBindOrderDetailDirtyTracking() {
    if (!IS_PM_ORDER_DETAIL_PAGE || __pmOrderDetailDirtyBound) return;
    const shouldTrack = (target) => {
        if (!(target instanceof Element)) return false;
        if (!target.closest('#order-edit-modal')) return false;
        if (target.closest('#generic-confirm-modal')) return false;
        return true;
    };
    const onInputOrChange = (event) => {
        if (!shouldTrack(event.target)) return;
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === 'hidden') return;
        __pmMarkOrderDetailDirty();
    };
    document.addEventListener('input', onInputOrChange, true);
    document.addEventListener('change', onInputOrChange, true);
    __pmOrderDetailDirtyBound = true;
}

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
    const safePayload = __pmBuildQuoteAuditPayload(payload || {});
    const svc = __pmNativeCotizaciones();
    if (svc) {
        try {
            await svc.update(id, safePayload, { schema: FIN_SCHEMA });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').update(safePayload).eq('id', id);
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
    if (IS_PM_ORDER_DETAIL_PAGE || IS_PM_ORDER_PREVIEW_PAGE) return;
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

function __pmStripPdfEditingChrome(rootNode) {
    if (!(rootNode instanceof HTMLElement)) return;
    rootNode.classList.remove('pm-pdf-admin-enabled', 'pm-pdf-edit-selected', 'pm-pdf-base-selected', 'pm-pdf-editable');
    rootNode.querySelectorAll('.pdf-margin-guides-layer,[data-margin-guide]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.pm-pdf-delete-btn,[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.pm-pdf-admin-enabled,.pm-pdf-edit-selected,.pm-pdf-base-selected,.pm-pdf-editable').forEach((node) => {
        node.classList.remove('pm-pdf-admin-enabled', 'pm-pdf-edit-selected', 'pm-pdf-base-selected', 'pm-pdf-editable');
        if (node instanceof HTMLElement) {
            node.style.outline = 'none';
            node.style.outlineOffset = '0';
        }
    });
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
        __pmStripPdfEditingChrome(target);
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

async function __pmUploadApprovalSnapshotBlob(orderId, blob, formData = {}) {
    const safeOrderId = String(orderId || '').trim();
    if (!safeOrderId) throw new Error('Cotización inválida para snapshot.');
    if (!blob || !(blob.size > 0)) throw new Error('Snapshot PDF vacío.');
    const folio = String(formData?.numero_orden || currentPreviewOrder?.numero_orden || safeOrderId.split('-')[0].toUpperCase()).trim();
    const path = `${safeOrderId}/cotizacion_aprobada_${folio}.pdf`;
    const { error: uploadErr } = await window.globalPocketBase.storage.from('documentos').upload(path, blob, { upsert: true });
    if (uploadErr) throw uploadErr;
    const { error: dbErr } = await __pmQuotesUpdate(safeOrderId, { status: 'aprobada', url_cotizacion_final: path });
    if (dbErr) throw dbErr;
    return { path, folio };
}

function __pmBuildApprovalSnapshotMeta(orderId, formData = {}) {
    const safeOrderId = String(orderId || '').trim();
    const folio = String(formData?.numero_orden || currentPreviewOrder?.numero_orden || safeOrderId.split('-')[0].toUpperCase()).trim();
    return {
        folio,
        path: safeOrderId ? `${safeOrderId}/cotizacion_aprobada_${folio}.pdf` : ''
    };
}

async function __pmUploadApprovalSnapshotBlob(orderId, blob, formData = {}, options = {}) {
    const safeOrderId = String(orderId || '').trim();
    if (!safeOrderId) throw new Error('CotizaciÃ³n invÃ¡lida para snapshot.');
    if (!blob || !(blob.size > 0)) throw new Error('Snapshot PDF vacÃ­o.');
    const opts = options && typeof options === 'object' ? options : {};
    const resolved = __pmBuildApprovalSnapshotMeta(safeOrderId, formData);
    const folio = String(opts.folio || resolved.folio).trim();
    const path = String(opts.path || resolved.path || `${safeOrderId}/cotizacion_aprobada_${folio}.pdf`).trim();
    const { error: uploadErr } = await window.globalPocketBase.storage.from('documentos').upload(path, blob, { upsert: true });
    if (uploadErr) throw uploadErr;
    if (opts.persistQuote !== false) {
        const { error: dbErr } = await __pmQuotesUpdate(safeOrderId, { status: 'aprobada', url_cotizacion_final: path });
        if (dbErr) throw dbErr;
    }
    return { path, folio };
}

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

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    if (id === 'preview-modal') {
        requestAnimationFrame(() => {
            __pmEnsurePdfEditingChrome();
            __pmSyncPdfEditMode();
            __pmRenderPdfInspector();
            __pmHighlightSelectedBaseTextBlock();
        });
    }
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    if (id === 'preview-modal') {
        __pmClosePdfInspector();
        __pmRenderPdfToolbar();
        __pmEnsureMarginGuideController()?.refresh();
        __pmClosePreviewTabIfNeeded();
    }
};
window.showToast = (msg, type='success') => {
    const c = document.getElementById('toast-container');
    if (!c) {
        try { console[type === 'error' ? 'error' : 'log'](String(msg || '')); } catch (_) {}
        return;
    }
    const e = document.createElement('div');
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`;
    e.innerText = msg;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3000);
};
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
            async () => {
                await window.processSaveOrder();
                if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') window.__HUB_ALLOW_NEXT_UNLOAD('pm_order_detail_close_saved');
                window.location.href = 'orders.html';
            },
            false,
            "Guardar Cambios",
            "Cerrar sin guardar",
            () => {
                if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') window.__HUB_ALLOW_NEXT_UNLOAD('pm_order_detail_close_discarded');
                window.location.href = 'orders.html';
            }
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
    if (!__pmIsAdminProfile()) {
        window.showToast("Solo administradores pueden eliminar cotizaciones.", "error");
        return;
    }
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

    if (e.target === editModal && !IS_PM_ORDER_DETAIL_PAGE) window.askCloseEditModal();
    if (e.target === docsModal) window.closeModal('docs-modal');
    if (e.target === previewModal) {
        if (IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode()) return;
        window.closeModal('preview-modal');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.PB_CLIENT) {
        if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }
    const { data: { session } } = await window.globalPocketBase.auth.getSession(); if (!session) return;
    await __pmLoadLetterheadConfig();
    try {
        window.currentUserProfile = await __pmLoadCurrentUserProfile(session.user);
    } catch (_) {
        window.currentUserProfile = session.user || null;
    }
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
        __pmMarkOrderDetailDirty();
    });
    document.getElementById('new-concept-select')?.addEventListener('change', function() { const c = catalogConcepts.find(x => x.id == this.value); if(c) document.getElementById('new-concept-amount').value = c.precio_sugerido; });
    __pmBindOrderDetailDirtyTracking();
    
    await Promise.all([loadTaxes(), loadSpaces(), loadConcepts()]); await window.loadOrders();
    if (!IS_PM_ORDER_DETAIL_PAGE && !IS_PM_ORDER_PREVIEW_PAGE) {
        const firstSignal = __pmReadRefreshSignal();
        if (firstSignal) __pmLastRefreshSignalTs = firstSignal.ts;
        window.addEventListener('storage', (ev) => {
            if (ev.key === PM_ORDERS_REFRESH_KEY) __pmHandleExternalRefresh(true);
        });
        window.addEventListener('message', (ev) => {
            if (ev.origin !== window.location.origin) return;
            if (ev.data?.type === 'pm_orders_refresh') __pmHandleExternalRefresh(true);
        });
    }
    if (IS_PM_ORDER_PREVIEW_PAGE) {
        const params = new URLSearchParams(window.location.search || '');
        const quoteId = String(params.get('quote') || '').trim();
        const previewDoc = String(params.get('previewDoc') || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
        const previewAction = String(params.get('previewAction') || '').toLowerCase();
        const mainWrap = document.querySelector('main');
        if (mainWrap) mainWrap.classList.add('hidden');
        document.getElementById('order-edit-modal')?.classList.add('hidden');
        document.getElementById('orders-list-section')?.classList.add('hidden');
        document.getElementById('editor-loading')?.classList.add('hidden');
        if (!quoteId) {
            window.showToast("No se indicó cotización para vista previa.", "error");
            return;
        }
        if (previewDoc === 'order' && previewAction === 'generate') await window.previewOrderForGeneration(quoteId);
        else await window.openPDFPreview(quoteId, previewDoc);
        return;
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
        __pmClearOrderDetailDirty();
    }
});

async function loadTaxes() { const { data } = await window.tenantPocketBase.from('impuestos').select('*'); dbTaxes = data || []; }
async function loadSpaces() { const { data } = await window.tenantPocketBase.from('espacios').select('*'); allSpaces = data || []; __pmEnsureSpaceCardOrder(); window.renderOrderSpaceCards(); }
async function loadConcepts() { const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true); catalogConcepts = data || []; }

function __pmFormatUserNameFromRecord(record) {
    const candidates = [
        record?.login_username,
        record?.user_name,
        record?.username,
        record?.full_name,
        record?.name,
        record?.nombre_completo,
        record?.email ? String(record.email).split('@')[0] : ''
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmLooksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function __pmIsNumericLike(value) {
    return /^[0-9]+$/.test(String(value || '').trim());
}

function __pmLooksLikePbRecordId(value) {
    return /^[a-z0-9]{15}$/i.test(String(value || '').trim());
}

function __pmLooksLikeMongoObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function __pmLooksLikeOpaqueActorId(value) {
    const safe = String(value || '').trim();
    if (!safe || safe.includes('@')) return false;
    if (!/^[a-z0-9_-]+$/i.test(safe)) return false;
    if (safe.length < 12) return false;
    if (/\d/.test(safe) || safe.includes('-') || safe.includes('_')) return true;
    return /^[a-z0-9]{12,}$/i.test(safe);
}

function __pmIsIdentifierLike(value) {
    const safe = String(value || '').trim();
    if (!safe) return false;
    return __pmLooksLikeUuid(safe)
        || __pmIsNumericLike(safe)
        || __pmLooksLikePbRecordId(safe)
        || __pmLooksLikeMongoObjectId(safe)
        || __pmLooksLikeOpaqueActorId(safe);
}

function __pmSanitizeActorName(value) {
    const safe = String(value || '').trim();
    if (!safe) return '';
    if (safe.includes('@')) return safe.split('@')[0];
    if (__pmIsIdentifierLike(safe)) return '';
    return safe;
}

function __pmRegisterOrderUserRecord(record) {
    if (!record || typeof record !== 'object') return;
    const name = __pmFormatUserNameFromRecord(record);
    if (!name) return;
    const aliases = [
        record?.id,
        record?.legacy_id,
        record?.legacyId,
        record?.user_id,
        record?.userId,
        record?.login_username,
        record?.user_name,
        record?.username,
        record?.email ? String(record.email).split('@')[0] : ''
    ];
    aliases
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((alias) => {
            __pmOrderUsersById[alias] = name;
        });
}

function __pmResolveOrderActorId(order, kind = 'created') {
    if (!order || typeof order !== 'object') return '';
    const createdCandidates = [
        order.creado_por_legacy,
        order.creado_por,
        order.created_by,
        order.created_by_id,
        order.creado_por_id,
        order.user_id,
        order.userId,
        order.creator_id,
        order.autor_id
    ];
    const updatedCandidates = [
        order.modificado_por_legacy,
        order.modificado_por,
        order.updated_by,
        order.updated_by_id,
        order.modificado_por_id,
        order.last_modified_by,
        order.last_editor_id,
        order.editor_id
    ];
    const base = kind === 'updated' ? updatedCandidates : createdCandidates;
    return base.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmResolveOrderActorName(order, kind = 'created') {
    const actorId = __pmResolveOrderActorId(order, kind);
    if (actorId && __pmOrderUsersById[actorId]) return __pmOrderUsersById[actorId];
    const directCandidates = kind === 'updated'
        ? [
            order?.modificado_por_nombre,
            order?.ultimo_editor_nombre,
            order?.updated_by_name,
            order?.last_modified_name,
            order?.modificado_por_username,
            order?.ultimo_editor_username,
            order?.updated_by_username,
            order?.edited_by_username,
            order?.modificado_por_login
        ]
        : [
            order?.creado_por_nombre,
            order?.creador_nombre,
            order?.created_by_name,
            order?.creado_por_username,
            order?.creador_username,
            order?.created_by_username,
            order?.creado_por_login,
            order?.created_by_login
        ];
    const direct = directCandidates
        .map((value) => __pmSanitizeActorName(value))
        .find((value) => value && (!actorId || value !== actorId));
    if (direct) return direct;
    if (actorId) {
        if (actorId.includes('@')) return actorId.split('@')[0];
        if (!__pmIsIdentifierLike(actorId)) return actorId;
    }
    if (kind === 'updated') return __pmResolveOrderActorName(order, 'created') || 'Usuario';
    return 'Usuario';
}

function __pmRegisterActorAliasFromOrder(order, kind = 'created') {
    if (!order || typeof order !== 'object') return;
    const actorId = __pmResolveOrderActorId(order, kind);
    if (!actorId) return;
    const directCandidates = kind === 'updated'
        ? [
            order?.modificado_por_nombre,
            order?.ultimo_editor_nombre,
            order?.updated_by_name,
            order?.last_modified_name,
            order?.modificado_por_username,
            order?.ultimo_editor_username,
            order?.updated_by_username,
            order?.edited_by_username,
            order?.modificado_por_login
        ]
        : [
            order?.creado_por_nombre,
            order?.creador_nombre,
            order?.created_by_name,
            order?.creado_por_username,
            order?.creador_username,
            order?.created_by_username,
            order?.creado_por_login,
            order?.created_by_login
        ];
    const direct = directCandidates
        .map((value) => __pmSanitizeActorName(value))
        .find(Boolean);
    if (direct) __pmOrderUsersById[actorId] = direct;
}

function __pmResolveOrderAuditTimestamp(order, kind = 'created') {
    if (!order || typeof order !== 'object') return '';
    const candidates = kind === 'updated'
        ? [order.updated_at, order.updated, order.modificado_en, order.last_modified_at, order.last_update]
        : [order.created_at, order.created, order.fecha_creacion, order.creado_en];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmFormatAuditTooltipDateTime(rawValue) {
    const safe = String(rawValue || '').trim();
    if (!safe) return '';
    const parsed = new Date(safe);
    if (Number.isNaN(parsed.getTime())) return '';
    try {
        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Mexico_City'
        }).format(parsed);
    } catch (_) {
        return parsed.toLocaleString('es-MX');
    }
}

function __pmEscapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function __pmBuildOrderAuditTooltip(order, kind = 'created') {
    const label = kind === 'updated' ? 'Última edición' : 'Creada';
    const formatted = __pmFormatAuditTooltipDateTime(__pmResolveOrderAuditTimestamp(order, kind));
    return formatted ? `${label}: ${formatted}` : '';
}

async function __pmPrimeOrderUsers(rows = []) {
    const ids = new Set();
    __pmOrderUsersById = Object.create(null);
    const currentActorId = __pmResolveCurrentActorId();
    const currentActorName = __pmSanitizeActorName(__pmResolveCurrentActorName());
    if (currentActorId && currentActorName) __pmOrderUsersById[currentActorId] = currentActorName;
    rows.forEach((row) => {
        const createdId = __pmResolveOrderActorId(row, 'created');
        const updatedId = __pmResolveOrderActorId(row, 'updated');
        __pmRegisterActorAliasFromOrder(row, 'created');
        __pmRegisterActorAliasFromOrder(row, 'updated');
        if (createdId) ids.add(createdId);
        if (updatedId) ids.add(updatedId);
    });
    const idList = Array.from(ids);
    if (!idList.length) return;
    const chunkSize = 50;
    const sources = [window.globalPocketBase, window.tenantPocketBase].filter(Boolean);
    for (let i = 0; i < idList.length; i += chunkSize) {
        const chunk = idList.slice(i, i + chunkSize);
        const numericChunk = chunk.filter((value) => __pmIsNumericLike(value));
        const textChunk = chunk.filter((value) => !__pmIsNumericLike(value) && !__pmLooksLikeUuid(value));
        for (const source of sources) {
            try {
                const { data } = await source.from('app_users').select('*').in('id', chunk);
                (data || []).forEach(__pmRegisterOrderUserRecord);
            } catch (_) {}
            try {
                const { data } = await source.from('app_users').select('*').in('legacy_id', chunk);
                (data || []).forEach(__pmRegisterOrderUserRecord);
            } catch (_) {
                if (numericChunk.length) {
                    try {
                        const { data } = await source.from('app_users').select('*').in('legacy_id', numericChunk);
                        (data || []).forEach(__pmRegisterOrderUserRecord);
                    } catch (_) {}
                }
            }
            if (textChunk.length) {
                try {
                    const { data } = await source.from('app_users').select('*').in('login_username', textChunk);
                    (data || []).forEach(__pmRegisterOrderUserRecord);
                } catch (_) {}
                try {
                    const { data } = await source.from('app_users').select('*').in('username', textChunk);
                    (data || []).forEach(__pmRegisterOrderUserRecord);
                } catch (_) {}
            }
        }
    }
    const unresolved = idList.filter((id) => id && !__pmOrderUsersById[id]);
    if (!unresolved.length) return;
    for (const source of sources) {
        try {
            const { data } = await source
                .from('app_users')
                .select('id,legacy_id,legacyId,user_id,userId,login_username,user_name,username,full_name,name,email');
            (data || []).forEach(__pmRegisterOrderUserRecord);
        } catch (_) {}
    }
}

window.loadOrders = async function() {
    const { data, error } = await __pmQuotesList({ sort: '-created_at' });
    if (error) {
        window.showToast(`No se pudieron cargar cotizaciones: ${error.message || error}`, 'error');
        allOrders = [];
    } else {
        allOrders = data || [];
    }
    await __pmPrimeOrderUsers(allOrders);
    renderOrdersTable(allOrders);
};

function renderOrdersTable(data) {
    const t = document.getElementById('orders-table'); if(!t) return; t.innerHTML = ''; 
    if(!data.length) { t.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-400">Sin registros.</td></tr>'; return; }
    const canDelete = __pmIsAdminProfile();
    data.forEach(o => {
        let sColor = 'bg-gray-100 text-gray-600', sText = 'Pendiente', missingIcons = []; 
        if(o.status === 'aprobada') { sColor = 'bg-blue-100 text-blue-700'; sText = 'Aprobada'; if (!o.contrato_url && !o.numero_contrato) missingIcons.push('<i class="fa-solid fa-file-signature" title="Falta Contrato"></i>'); if (!o.factura_xml_url) missingIcons.push('<i class="fa-solid fa-file-invoice" title="Falta Factura"></i>'); if (!o.historial_pagos || o.historial_pagos.length === 0) missingIcons.push('<i class="fa-solid fa-money-bill-wave" title="Falta Pago"></i>'); }
        if(o.status === 'finalizada') { sColor = 'bg-green-100 text-green-700 border border-green-200'; sText = 'Finalizada'; }
        if(o.status === 'rechazada') { sColor = 'bg-red-50 text-red-600'; sText = 'Rechazada'; }
        let alertsHTML = ''; if (missingIcons.length > 0 && o.status === 'aprobada') alertsHTML = `<div class="flex gap-2 justify-center mt-1.5 text-[10px] text-red-400">${missingIcons.join('')}</div>`;

        const tr = document.createElement('tr'); tr.className = "border-b hover:bg-gray-50 transition group cursor-pointer";
        tr.onclick = (e) => { if(!e.target.closest('button')) window.openOrderEditorPage(o.id); };
        
        const folioUnificado = o.numero_orden || o.id.split('-')[0].toUpperCase();
        const createdBy = __pmResolveOrderActorName(o, 'created');
        const updatedBy = __pmResolveOrderActorName(o, 'updated');
        const createdTooltip = __pmBuildOrderAuditTooltip(o, 'created');
        const updatedTooltip = __pmBuildOrderAuditTooltip(o, 'updated');
        const createdTooltipAttr = createdTooltip ? ` title="${__pmEscapeHtmlAttr(createdTooltip)}"` : '';
        const updatedTooltipAttr = updatedTooltip ? ` title="${__pmEscapeHtmlAttr(updatedTooltip)}"` : '';
        const deleteCell = canDelete
            ? `<button type="button" onclick="window.askDeleteOrder('${o.id}', event)" class="text-gray-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>`
            : `<span class="text-[10px] text-gray-300">—</span>`;
        
        tr.innerHTML = `<td class="p-4 font-black text-brand-dark">${folioUnificado}</td><td class="p-4 font-bold text-xs text-gray-700">${o.cliente_nombre}</td><td class="p-4 text-xs"><span class="font-bold block">${o.espacio_nombre}</span><span class="text-gray-500 font-mono">${window.safeFormatDate(o.fecha_inicio)}</span></td><td class="p-4 text-right font-mono font-bold text-xs">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(o.precio_final)}</td><td class="p-4 text-center"><span class="${sColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider">${sText}</span>${alertsHTML}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${createdTooltipAttr}>${createdBy}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${updatedTooltipAttr}>${updatedBy}</td><td class="p-4 text-center"><button type="button" onclick="event.stopPropagation(); window.openDocsModal('${o.id}')" class="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-brand-dark px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 mx-auto"><i class="fa-solid fa-folder-open text-brand-red"></i> Expediente</button></td><td class="p-4 text-center">${deleteCell}</td>`;
        t.appendChild(tr);
    });
}

window.openOrderEditorPage = function(id) {
    const url = `order_detail.html?quote=${encodeURIComponent(id)}`;
    window.open(url, '_blank', 'noopener');
};

window.openOrderPreviewTab = function(id, docType = 'quote', action = 'view') {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    const safeDoc = String(docType || '').toLowerCase() === 'order' ? 'order' : 'quote';
    const safeAction = String(action || '').toLowerCase() === 'generate' ? 'generate' : 'view';
    const url = `order_detail.html?quote=${encodeURIComponent(safeId)}&previewOnly=1&previewDoc=${encodeURIComponent(safeDoc)}&previewAction=${encodeURIComponent(safeAction)}`;
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
    
    const requestedClientId = String(order.cliente_id || '').trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) {
        await loadClientProfilesForOrderModal();
    }
    const selectedProfileId = __pmApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
        const c = orderClientProfilesById[selectedProfileId];
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
    __pmClearOrderDetailDirty();
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
        const btn = isLocked ? '' : `<button type="button" onclick="window.removeConceptRow(${idx})" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`;
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
    const statusField = document.getElementById('oed-status');
    if (statusField) statusField.value = 'aprobada';
    const newStatus = 'aprobada';
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
    await __pmEnsurePdfStyleProfile('quote', { forceReload: !__pmIsAdminProfile() });
    const formData = window.getFormDataFromModal();
    if (!formData.numero_orden) { formData.numero_orden = currentPreviewOrder.id.split('-')[0].toUpperCase(); }

    const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, 'quote'); 
    
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    const btnAction = document.getElementById('btn-download-preview');
    
    pdfContainer.innerHTML = content;
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
        if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
            await __pmEnsurePdfStyleProfile('quote', { forceReload: true });
            element.innerHTML = await window.getOrderHTML({ ...currentPreviewOrder, ...formData, status: 'aprobada' }, 'quote');
            __pmApplyPdfStyleToLivePreview();
        }
        if (__pmIsAdminProfile()) {
            await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
        }
        const pdfBlob = await window.generatePdfBlobFromNode(element);
        const { path, folio } = await __pmUploadApprovalSnapshotBlob(currentPreviewOrder.id, pdfBlob, formData);
        const payload = { ...formData, status: 'aprobada', url_cotizacion_final: path };
        const { error: dbError } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
        if (dbError) throw dbError;
        currentPreviewOrder = { ...currentPreviewOrder, ...payload };
        window.__pmBroadcastOrdersRefresh('approved_snapshot');
        window.downloadBlobAsFile(pdfBlob, `Cotizacion_Aprobada_${folio}.pdf`);

        window.showToast("¡Cotización Aprobada y Archivada!", "success");
        __pmClearOrderDetailDirty();
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
        __pmClearOrderDetailDirty();
        window.closeModal('order-edit-modal');
        await window.loadOrders(); 
    } catch(e) { window.showToast("Error: " + e.message, "error"); } finally { btn.disabled = false; btn.innerText = "Guardar Directamente"; }
};

window.previewOrderForGeneration = async function(id) {
    await __pmEnsurePdfStyleProfile('order', { forceReload: !__pmIsAdminProfile() });
    const order = allOrders.find(o => o.id === id);
    if(!order) return;
    currentPreviewOrder = { ...order, docType: 'order' }; 
    
    const content = await window.getOrderHTML(order, 'order');
    
    const pdfContainer = document.getElementById('pdf-content');
    const embed = document.getElementById('doc-preview');
    
    pdfContainer.innerHTML = content;
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
            if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
                await __pmEnsurePdfStyleProfile('order', { forceReload: true });
                element.innerHTML = window.getOrderHTML(currentPreviewOrder, 'order');
                __pmApplyPdfStyleToLivePreview();
            }
            const pdfBlob = await window.generatePdfBlobFromNode(element);
            const folioUnificado = currentPreviewOrder.numero_orden || currentPreviewOrder.id.split('-')[0].toUpperCase();
            const path = `${currentPreviewOrder.id}/orden_compra_${folioUnificado}.pdf`;
            
            await window.globalPocketBase.storage.from('documentos').upload(path, pdfBlob, { upsert: true });
            const ocUpdate = await __pmQuotesUpdate(currentPreviewOrder.id, { url_orden_compra: path, fecha_orden_compra: new Date().toISOString() });
            if (ocUpdate.error) throw ocUpdate.error;
            window.__pmBroadcastOrdersRefresh('purchase_order');
            
            window.downloadBlobAsFile(pdfBlob, `OC_${folioUnificado}.pdf`);
    
            window.showToast("Orden de Compra Generada");
            if (!(IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode())) await window.loadOrders();
            window.closeModal('preview-modal');
            window.closeModal('docs-modal');
            __pmClosePreviewTabIfNeeded();
            
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

    // Cotización
    if (order.url_cotizacion_final) {
        createBtn('Ver Cotización Aprobada', 'fa-solid fa-file-circle-check', 'blue', `window.openStoredDocument('${order.url_cotizacion_final}')`);
    } else {
        createBtn('Ver Borrador Cotización', 'fa-solid fa-file-pen', 'gray', `window.openOrderPreviewTab('${order.id}', 'quote', 'view')`);
    }

    // Orden de compra
    if (order.url_orden_compra) {
        createBtn('Ver Orden de Compra', 'fa-solid fa-file-contract', 'purple', `window.openStoredDocument('${order.url_orden_compra}')`);
    } else if(['aprobada', 'finalizada'].includes(order.status)) {
        createBtn('Generar Orden de Compra', 'fa-solid fa-plus', 'purple', `window.openOrderPreviewTab('${order.id}', 'order', 'generate')`);
    } else {
        list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-lock text-gray-400"></i><span class="text-xs font-bold text-gray-400">Orden de Compra (Pendiente)</span></div>`;
    }

    // Contrato (sin cambios funcionales)
    if (order.contrato_url) { createBtn('Ver Contrato Firmado', 'fa-solid fa-file-signature', 'indigo', `window.openStoredDocument('${order.contrato_url}')`); } else { list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-signature text-gray-400"></i><span class="text-xs font-bold text-gray-400">Contrato (Pendiente Firma)</span></div>`; }

    // Factura
    if (order.factura_pdf_url) {
        createBtn('Ver Factura (PDF)', 'fa-solid fa-file-pdf', 'red', `window.openStoredDocument('${order.factura_pdf_url}')`);
        if(order.factura_xml_url) createBtn('Descargar XML', 'fa-solid fa-file-code', 'orange', `window.openStoredDocument('${order.factura_xml_url}')`);
    } else {
        list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="fa-solid fa-file-invoice-dollar text-gray-400"></i><span class="text-xs font-bold text-gray-400">Factura (Pendiente)</span></div>`;
    }

    // Historial de recibos
    if (order.historial_pagos?.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'border-t border-gray-100 my-2 pt-2 text-[10px] font-bold text-gray-400 uppercase text-center';
        divider.innerHTML = 'Historial de Recibos';
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
    const safeId = String(id || '').trim();
    if (!safeId) return;
    try {
        await __pmEnsurePdfStyleProfile(type, { forceReload: !__pmIsAdminProfile() });
        let order = allOrders.find((x) => String(x.id || '') === safeId) || null;
        if (!order) {
            const { data, error } = await window.tenantPocketBase.from('cotizaciones').select('*').eq('id', safeId).maybeSingle();
            if (error || !data) throw (error || new Error('No se encontró la cotización.'));
            order = data;
            if (!allOrders.some((row) => String(row.id || '') === safeId)) allOrders.push(order);
        }
        currentPreviewOrder = { ...order, docType: type }; 
        const content = await window.getOrderHTML(order, type); 
        const pdfContainer = document.getElementById('pdf-content'); 
        const embedViewer = document.getElementById('doc-preview'); 
        const btnDownload = document.getElementById('btn-download-preview'); 
        if (pdfContainer) {
            pdfContainer.classList.remove('hidden');
            pdfContainer.innerHTML = content;
            __pmApplyPdfStyleToLivePreview();
        }
        if (embedViewer) embedViewer.classList.add('hidden');
        if (btnDownload) {
            btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
            btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
            btnDownload.onclick = window.downloadPDFFromPreview;
        }
        window.openModal('preview-modal');
    } catch (e) {
        console.error('openPDFPreview(pm) failed', e);
        window.showToast(`No se pudo abrir la vista previa: ${e?.message || e}`, 'error');
    }
};

window.downloadPDFFromPreview = async function() { 
    const element = document.getElementById('pdf-content'); 
    const folioUnificado = currentPreviewOrder.numero_orden || currentPreviewOrder.id.split('-')[0].toUpperCase();
    try {
        if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
            const docType = String(currentPreviewOrder.docType || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
            await __pmEnsurePdfStyleProfile(docType, { forceReload: true });
            element.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
            __pmApplyPdfStyleToLivePreview();
        }
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
const __PM_PDF_OVERLAYS_COLLECTION = 'pdf_overlays';
const __PM_PDF_SETTINGS_COLLECTION = 'pdf_generator_settings';
const __PM_PDF_OVERLAY_TYPES = Object.freeze({
    quote: 'generator:quotes',
    order: 'generator:orders'
});
const __PM_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'contract']);
const __PM_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
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
    { id: 'base:table-body', key: 'table-body', label: 'Tabla Conceptos', sizeField: 'tableBodyPx', alignField: 'tableAlign' },
    { id: 'base:summary', key: 'summary', label: 'Resumen Totales', alignField: 'summaryAlign' },
    { id: 'base:quick', key: 'quick', label: 'Notas', sizeField: 'quickPx', alignField: 'quickAlign' },
    { id: 'base:conditions', key: 'conditions', label: 'Condiciones', sizeField: 'conditionsPx', alignField: 'conditionsAlign' },
    { id: 'base:sign', key: 'sign', label: 'Firmas', sizeField: 'signPx', alignField: 'signAlign' },
    { id: 'base:footer', key: 'footer', label: 'Footer', sizeField: 'footerPx', alignField: 'footerAlign' }
]);
const __PM_PDF_BASE_MOVABLE_KEYS = Object.freeze(['header-title', 'header-meta', 'table-body', 'summary', 'quick', 'conditions', 'sign', 'footer']);
const __PM_PDF_MOVABLE_RESOURCE_TYPES = Object.freeze(['bar', 'logo', 'sign', 'sign-block', 'title']);
const __PM_PDF_BASE_SIZE_LIMITS = Object.freeze({
    titlePx: { min: 20, max: 42 },
    metaPx: { min: 8, max: 18 },
    tableBodyPx: { min: 9, max: 16 },
    quickPx: { min: 9, max: 16 },
    conditionsPx: { min: 9, max: 18 },
    signPx: { min: 9, max: 16 },
    footerPx: { min: 8, max: 14 }
});
const __PM_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -4000, max: 4000 },
    y: { min: -5000, max: 5000 },
    scalePct: { min: 15, max: 500 },
    angle: { min: -360, max: 360 }
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
    quoteApproverTitle: 'QUIEN APRUEBA',
    quoteApproverSubtitle: 'Plaza Mayor',
    quoteClientTitle: '{{CLIENT_NAME}}',
    quoteClientSubtitle: 'Cliente / Representante',
    orderApproverTitle: 'QUIEN APRUEBA',
    orderApproverSubtitle: 'Plaza Mayor',
    annexHintTitle: 'Página adicional editable',
    annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
});
const __PM_PDF_STYLE_DEFAULTS = Object.freeze({
    fontFamilyKey: 'segoe',
    headerLinePx: 4,
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
    marginTopPx: 0,
    marginBottomPx: 0,
    marginLeftPx: 0,
    marginRightPx: 0,
    baseLayouts: {},
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
let __pmPdfStyleConfigStore = '';
let __pmPdfStyleRawPayload = null;
let __pmPdfStyleSyncTimer = null;
let __pmPdfStyleUiState = { collapsed: false, pinned: false };
let __pmPdfResourceEditorSelectedId = '';
let __pmPdfResourcePointerState = null;
let __pmPdfStyleActiveProfile = 'quote';
let __pmPdfMarginGuideController = null;
let __pmPdfEditLocked = true;
let __pmPdfInspectorState = null;

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
        quoteApproverTitle: normalizeText('quoteApproverTitle', 80),
        quoteApproverSubtitle: normalizeText('quoteApproverSubtitle', 80),
        quoteClientTitle: normalizeText('quoteClientTitle', 120),
        quoteClientSubtitle: normalizeText('quoteClientSubtitle', 80),
        orderApproverTitle: normalizeText('orderApproverTitle', 80),
        orderApproverSubtitle: normalizeText('orderApproverSubtitle', 80),
        annexHintTitle: normalizeText('annexHintTitle', 120),
        annexHintBody: normalizeText('annexHintBody', 900)
    };
}

function __pmGetPdfContentFieldMaxLength(field) {
    const key = String(field || '').trim();
    if (key === 'quickLeftLines') return 1200;
    if (key === 'quickRightBody') return 700;
    if (key === 'conditionsLines') return 5000;
    if (key === 'quoteClientTitle') return 120;
    if (key === 'annexHintBody') return 900;
    return 120;
}

function __pmCommitPdfContentField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __pmGetPdfStyleConfig();
    const max = __pmGetPdfContentFieldMaxLength(key);
    const content = __pmNormalizePdfContent({
        ...(cfg.content || {}),
        [key]: String(rawValue ?? '').slice(0, max)
    });
    const next = __pmNormalizePdfStyle({ ...cfg, content });
    __pmSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh: opts.skipEditorUiRefresh === true });
    __pmScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __pmRefreshPreviewFromStyleState();
}

function __pmResolvePdfTemplateString(value, context = {}) {
    let output = String(value ?? '');
    Object.entries(context && typeof context === 'object' ? context : {}).forEach(([key, resolvedValue]) => {
        const token = String(key || '').trim();
        if (!token) return;
        const pattern = new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
        output = output.replace(pattern, String(resolvedValue ?? ''));
    });
    return output;
}

function __pmGetOrderBaseContentFields(baseKey) {
    const key = String(baseKey || '').trim();
    const content = __pmNormalizePdfContent(__pmGetPdfStyleConfig().content);
    const isOrder = String(currentPreviewOrder?.docType || 'quote').toLowerCase() === 'order';
    if (key === 'quick') {
        return [
            { key: 'quickLeftTitle', label: 'Titulo izquierda', value: content.quickLeftTitle, max: 80, multiline: false },
            { key: 'quickLeftLines', label: 'Notas izquierda', value: content.quickLeftLines, max: 1200, multiline: true, rows: 5 },
            { key: 'quickRightTitle', label: 'Titulo derecha', value: content.quickRightTitle, max: 80, multiline: false },
            { key: 'quickRightBody', label: 'Notas derecha', value: content.quickRightBody, max: 700, multiline: true, rows: 4 }
        ];
    }
    if (key === 'conditions') {
        return [
            { key: 'conditionsTitle', label: 'Titulo', value: content.conditionsTitle, max: 120, multiline: false },
            { key: 'conditionsLines', label: 'Terminos y condiciones', value: content.conditionsLines, max: 5000, multiline: true, rows: 9 },
            { key: 'annexHintTitle', label: 'Titulo anexos', value: content.annexHintTitle, max: 120, multiline: false },
            { key: 'annexHintBody', label: 'Texto anexos', value: content.annexHintBody, max: 900, multiline: true, rows: 4 }
        ];
    }
    if (key === 'sign') {
        if (isOrder) {
            return [
                { key: 'orderApproverTitle', label: 'Quien aprueba', value: content.orderApproverTitle, max: 80, multiline: false },
                { key: 'orderApproverSubtitle', label: 'Subtitulo', value: content.orderApproverSubtitle, max: 80, multiline: false }
            ];
        }
        return [
            { key: 'quoteApproverTitle', label: 'Aprobacion titulo', value: content.quoteApproverTitle, max: 80, multiline: false },
            { key: 'quoteApproverSubtitle', label: 'Aprobacion subtitulo', value: content.quoteApproverSubtitle, max: 80, multiline: false },
            { key: 'quoteClientTitle', label: 'Cliente titulo', value: content.quoteClientTitle, max: 120, multiline: false },
            { key: 'quoteClientSubtitle', label: 'Cliente subtitulo', value: content.quoteClientSubtitle, max: 80, multiline: false }
        ];
    }
    return [];
}

function __pmGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __PM_PDF_BASE_TEXT_BLOCKS.find((block) => block.key === safe) || null;
}

function __pmCanMovePdfBaseBlock(key) {
    const safe = String(key || '').trim();
    return !!__pmGetPdfBaseBlockMeta(safe) && __PM_PDF_BASE_MOVABLE_KEYS.includes(safe);
}

function __pmCanEditPdfBaseBlock(key) {
    return !!__pmGetPdfBaseBlockMeta(key);
}

function __pmIsTemplateDrivenResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    const text = `${resource.text || ''} ${resource.signTitle || ''} ${resource.signRole || ''}`;
    return /\{\{[^}]+\}\}/.test(text);
}

function __pmCanMovePdfResource(resource) {
    return !!resource && typeof resource === 'object';
}

function __pmCanEditPdfResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    if (resource.isUserNote === true) return true;
    const type = String(resource.type || '').toLowerCase();
    if (type === 'sign' || type === 'sign-line' || type === 'sign-block') return true;
    if (type !== 'title' && type !== 'text') return false;
    return !__pmIsTemplateDrivenResource(resource);
}

function __pmFindPdfResourceById(resourceId) {
    const safeId = String(resourceId || '').trim();
    if (!safeId) return null;
    return __pmGetPdfResourcesFromState().find((resource) => String(resource.id || '') === safeId) || null;
}

function __pmNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __pmClampStyleNumber(base.x, __PM_PDF_BASE_LAYOUT_LIMITS.x.min, __PM_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __pmClampStyleNumber(base.y, __PM_PDF_BASE_LAYOUT_LIMITS.y.min, __PM_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __pmClampStyleNumber(base.scalePct ?? base.scale, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        angle: __pmClampStyleNumber(base.angle, __PM_PDF_BASE_LAYOUT_LIMITS.angle.min, __PM_PDF_BASE_LAYOUT_LIMITS.angle.max, 0),
        hidden: base.hidden === true
    };
}

function __pmNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __PM_PDF_BASE_TEXT_BLOCKS.forEach((block) => {
        out[block.key] = __pmNormalizePdfBaseLayout(source[block.key] || {});
        Object.keys(source).forEach((key) => {
            if (key.startsWith(`${block.key}__`)) out[key] = __pmNormalizePdfBaseLayout(source[key]);
        });
    });
    return out;
}

function __pmBuildPdfBaseTransform(layout) {
    const safe = __pmNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) rotate(${safe.angle || 0}deg) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __pmNormalizePdfResources(raw) {
    const list = (Array.isArray(raw) ? raw : []).filter((item) => !(item && typeof item === 'object' && item.isUserNote === true));
    return list.slice(0, 80).map((item, index) => {
        const base = item && typeof item === 'object' ? item : {};
        const rawType = String(base.type || '').toLowerCase();
        const normalizedType = rawType === 'sign-line' ? 'sign' : rawType;
        const type = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
        const isSign = type === 'sign' || type === 'sign-block';
        const defaultW = type === 'bar' ? 240 : (type === 'logo' ? 180 : (isSign ? 220 : 260));
        const defaultH = type === 'bar' ? 12 : (type === 'logo' ? 72 : (type === 'sign' ? 24 : (type === 'sign-block' ? 42 : 42)));
        const defaultBg = type === 'logo'
            ? 'transparent'
            : (isSign ? '#111827' : (type === 'bar' ? '#d32f2f' : 'transparent'));
        return {
            id: String(base.id || `pmres_${Date.now()}_${index}`),
            type,
            enabled: base.enabled !== false,
            page: __pmClampStyleNumber(base.page, 1, 8, 1),
            x: __pmClampStyleNumber(base.x, -4000, 4000, 80),
            y: __pmClampStyleNumber(base.y, -5000, 5000, 120),
            w: __pmClampStyleNumber(base.w, 16, 4000, defaultW),
            h: __pmClampStyleNumber(base.h, 1, 5000, defaultH),
            text: (type === 'title' || type === 'text') ? String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 1200) : '',
            fontFamilyKey: String(base.fontFamilyKey || '').toLowerCase(),
            fontSize: __pmClampStyleNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
            bold: base.bold !== false,
            italic: !!base.italic,
            underline: !!base.underline,
            align: __pmNormalizeStyleAlign(base.align, 'left'),
            color: __pmNormalizeHexColor(base.color, '#111827'),
            bgColor: __pmNormalizeHexColor(base.bgColor, defaultBg),
            angle: __pmClampStyleNumber(base.angle, -360, 360, 0),
            signTitle: type === 'sign-block' ? String(base.signTitle || '').slice(0, 120) : '',
            signRole: type === 'sign-block' ? String(base.signRole || '').slice(0, 120) : '',
            isUserNote: base.isUserNote === true,
            noteAuthor: String(base.noteAuthor || '').slice(0, 120)
        };
    });
}

function __pmRenderPdfResources(style, pageIndex) {
    const cfg = __pmNormalizePdfStyle(style || {});
    const resources = __pmNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    const isAdmin = __pmIsAdminProfile();
    const globalFont = __PM_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __PM_PDF_STYLE_FONT_MAP.segoe;
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const isSignBlock = resource.type === 'sign-block';
            const isSign = resource.type === 'sign' || resource.type === 'sign-line';
            let bgFill = resource.bgColor;
            if (resource.type !== 'bar' || resource.type === 'logo' || isSign || isSignBlock) bgFill = 'transparent';
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:${isAdmin ? 'auto' : 'none'};background:${bgFill};transform:rotate(${resource.angle || 0}deg);transform-origin:center center;`;
            const deleteBtnHtml = isAdmin ? `<div class="pm-pdf-delete-btn" data-res-action="remove" data-res-id="${__pmSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';
            if (resource.type === 'logo') {
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="logo" style="${common}padding:0;border-radius:0;"><img src="${__pmSafeHtml(COMPANY_LOGO_URL)}" alt="Logo" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">${deleteBtnHtml}</div>`;
            }
            if (isSign) {
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign" style="${common}background:transparent;border-radius:2px;"><div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${lineColor};transform:translateY(-50%);border-radius:999px;"></div>${deleteBtnHtml}</div>`;
            }
            if (isSignBlock) {
                const fontStack = resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const titleStr = __pmSafeHtml(resource.signTitle || '');
                const roleStr = __pmSafeHtml(resource.signRole || '');
                const titleSize = Math.max(10, Number(resource.fontSize || 14));
                const roleSize = Math.max(9, titleSize - 2);
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                const textColor = (resource.color && resource.color !== 'transparent') ? resource.color : '#111827';
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign-block" style="${common}display:flex;flex-direction:column;align-items:center;justify-content:flex-end;background:transparent;"><div style="width:100%;height:2px;background:${lineColor};border-radius:999px;margin-bottom:4px;"></div><div style="width:100%;text-align:center;color:${textColor};font-family:${fontStack};pointer-events:none;user-select:none;">${titleStr ? `<div style="font-size:${titleSize}px;font-weight:800;line-height:1.2;">${titleStr}</div>` : ''}${roleStr ? `<div style="font-size:${roleSize}px;text-transform:uppercase;opacity:0.6;margin-top:2px;">${roleStr}</div>` : ''}</div>${deleteBtnHtml}</div>`;
            }
            if (resource.type === 'bar') {
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="bar" style="${common}background:${resource.bgColor};border-radius:2px;">${deleteBtnHtml}</div>`;
            }
            const fontStack = resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                : globalFont;
            const placeholder = isAdmin && !resource.text ? (resource.type === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
            return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="${__pmSafeHtml(resource.type)}" data-res-font-size="${resource.fontSize}" style="${common}"><div style="width:100%;height:100%;padding:4px;overflow:hidden;font-family:${fontStack};font-size:${resource.fontSize}px;line-height:1.2;font-weight:${resource.bold ? 800 : 500};font-style:${resource.italic ? 'italic' : 'normal'};text-decoration:${resource.underline ? 'underline' : 'none'};text-align:${resource.align};white-space:pre-wrap;color:${resource.color};pointer-events:none;user-select:none;">${__pmSafeHtml(resource.text) || `<span style="opacity:0.3;">${placeholder}</span>`}</div>${deleteBtnHtml}</div>`;
        })
        .join('');
}

function __pmNormalizePdfStyle(raw = {}) {
    const base = { ...__PM_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    return {
        fontFamilyKey: __PM_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __PM_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __pmClampStyleNumber(base.headerLinePx, 1, 8, __PM_PDF_STYLE_DEFAULTS.headerLinePx),
        titlePx: __pmClampStyleNumber(base.titlePx, 20, 42, __PM_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __pmClampStyleNumber(base.metaPx, 8, 18, __PM_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __pmClampStyleNumber(base.tableHeadPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __pmClampStyleNumber(base.tableBodyPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __pmClampStyleNumber(base.lineHeightPct, 90, 180, __PM_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __pmClampStyleNumber(base.quickPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __pmClampStyleNumber(base.conditionsPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __pmClampStyleNumber(base.signPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __pmClampStyleNumber(base.footerPx, 8, 14, __PM_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __pmClampStyleNumber(base.offsetXPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __pmClampStyleNumber(base.offsetYPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __pmClampStyleNumber(base.extraPages, -1, 6, __PM_PDF_STYLE_DEFAULTS.extraPages),
        marginTopPx: __pmClampStyleNumber(base.marginTopPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginTopPx),
        marginBottomPx: __pmClampStyleNumber(base.marginBottomPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginBottomPx),
        marginLeftPx: __pmClampStyleNumber(base.marginLeftPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginLeftPx),
        marginRightPx: __pmClampStyleNumber(base.marginRightPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginRightPx),
        baseLayouts: __pmNormalizePdfBaseLayouts(base.baseLayouts),
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
        '--pm-margin-top': `${safe.marginTopPx}px`,
        '--pm-margin-right': `${safe.marginRightPx}px`,
        '--pm-margin-bottom': `${safe.marginBottomPx}px`,
        '--pm-margin-left': `${safe.marginLeftPx}px`,
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

function __pmBuildPdfContentFrameStyle(baseHeightPx, extraStyle = '') {
    const extra = String(extraStyle || '').trim();
    const suffix = extra ? `${extra}${extra.endsWith(';') ? '' : ';'}` : '';
  return `position:relative;left:var(--pm-margin-left);top:var(--pm-margin-top);width:max(48px,calc(100% - var(--pm-margin-left) - var(--pm-margin-right)));height:max(48px,calc(${baseHeightPx}px - var(--pm-margin-top) - var(--pm-margin-bottom)));min-height:max(48px,calc(${baseHeightPx}px - var(--pm-margin-top) - var(--pm-margin-bottom)));box-sizing:border-box;overflow:visible;${suffix}`;
}

function __pmApplyPdfBaseLayouts() {
    const cfg = __pmGetPdfStyleConfig();
    const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    const counters = {};
    document.querySelectorAll('#pdf-content [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__pmGetPdfBaseBlockMeta(key)) return;
        counters[key] = (counters[key] || 0);
        const index = counters[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __pmNormalizePdfBaseLayout();
        if (node.dataset.baseNativeTransformCaptured !== '1') {
            node.dataset.baseNativeTransform = String(node.style.transform || '').trim();
            node.dataset.baseNativeTransformCaptured = '1';
        }
        const nativeTransform = String(node.dataset.baseNativeTransform || '').trim();
        const layoutTransform = __pmBuildPdfBaseTransform(layout);
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('pm-pdf-editable', __pmIsAdminProfile());
        node.dataset.baseInstance = instanceKey;
    });
}

function __pmCommitPdfBaseLayout(key, layout) {
    const baseKey = String(key || '').split('__')[0].trim();
    if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
    const fullKey = String(key || '').trim();
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = {
        ...__pmNormalizePdfBaseLayouts(cfg.baseLayouts),
        [fullKey]: __pmNormalizePdfBaseLayout(layout)
    };
    const next = __pmNormalizePdfStyle({ ...cfg, baseLayouts });
    __pmSetPdfStyleConfig(next, { applyToDom: false });
    __pmApplyPdfBaseLayouts();
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmCommitBaseLayoutField(baseId, field, rawValue) {
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const baseKey = key.split('__')[0];
    if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
    if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(String(field || '')) && !__pmCanMovePdfBaseBlock(baseKey)) return;
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[key] || baseLayouts[baseKey] || __pmNormalizePdfBaseLayout();
    const nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __pmClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __pmClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'angle') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS.angle;
        nextLayout.angle = __pmClampStyleNumber(rawValue, limits.min, limits.max, current.angle || 0);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __pmNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [key]: __pmNormalizePdfBaseLayout(nextLayout)
        }
    });
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (type !== 'text' && type !== 'title') return;
    const baseFont = __pmClampStyleNumber(
        node.getAttribute('data-res-font-size') || window.getComputedStyle(node).fontSize,
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

function __pmMarginStateFromConfig(style) {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    return {
        top: cfg.marginTopPx,
        right: cfg.marginRightPx,
        bottom: cfg.marginBottomPx,
        left: cfg.marginLeftPx
    };
}

function __pmApplyMarginVarsToLivePreview(style) {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    document.querySelectorAll('#pdf-content .pm-pdf-root').forEach((node) => {
        node.style.setProperty('--pm-margin-top', `${cfg.marginTopPx}px`);
        node.style.setProperty('--pm-margin-right', `${cfg.marginRightPx}px`);
        node.style.setProperty('--pm-margin-bottom', `${cfg.marginBottomPx}px`);
        node.style.setProperty('--pm-margin-left', `${cfg.marginLeftPx}px`);
    });
}

function __pmCommitMargins(margins, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const current = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({
        ...current,
        marginTopPx: margins.top,
        marginRightPx: margins.right,
        marginBottomPx: margins.bottom,
        marginLeftPx: margins.left
    });
    __pmPdfStyleState = next;
    __pmApplyMarginVarsToLivePreview(next);
    __pmSyncPdfStyleValueLabels(next);
    __pmRenderPdfToolbar();
    if (opts.persist !== false) __pmScheduleSharedPdfStyleSync(next);
    return next;
}

function __pmEnsureMarginGuideController() {
    if (!window.createPdfMarginGuideController) return null;
    if (!__pmPdfMarginGuideController) {
        __pmPdfMarginGuideController = window.createPdfMarginGuideController({
            container: () => document.getElementById('preview-container'),
            root: () => document.getElementById('pdf-content'),
            minMarginPx: -4000,
            maxMarginPx: 4000,
            isVisible: () => {
                return __pmIsPdfPreviewVisible() && __pmIsAdminProfile() && !__pmPdfEditLocked;
            },
            getMargins: () => __pmMarginStateFromConfig(),
            onChange: (margins) => {
                __pmCommitMargins(margins, { persist: false });
            },
            onCommit: (margins) => {
                __pmCommitMargins(margins, { persist: false });
                __pmScheduleSharedPdfStyleSync(__pmGetPdfStyleConfig());
            }
        });
    }
    return __pmPdfMarginGuideController;
}

function __pmBindFloatingPanelDrag(panel, host) {
    if (!(panel instanceof HTMLElement) || !(host instanceof HTMLElement) || panel.dataset.dragBound === '1') return;
    panel.dataset.dragBound = '1';
    const handle = panel.querySelector('[data-pdf-panel-handle]');
    if (!(handle instanceof HTMLElement)) return;
    const syncPanelViewport = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240;
        const maxPanelHeight = Math.max(220, viewportHeight - 16);
        const card = panel.querySelector('[data-pdf-inspector-card]');
        const body = panel.querySelector('[data-pdf-inspector-body]');
        panel.style.maxHeight = `${maxPanelHeight}px`;
        if (card instanceof HTMLElement) {
            card.style.maxHeight = `${maxPanelHeight}px`;
        }
        if (body instanceof HTMLElement) {
            const handleHeight = handle.offsetHeight || 56;
            body.style.maxHeight = `${Math.max(120, maxPanelHeight - handleHeight - 8)}px`;
        }
    };
    const clampPosition = (left, top) => {
        const margin = 8;
        const w = panel.offsetWidth || 320;
        const h = panel.offsetHeight || 240;
        const maxLeft = Math.max(margin, (window.innerWidth || w) - w - margin);
        const maxTop = Math.max(margin, (window.innerHeight || h) - h - margin);
        return {
            left: Math.round(Math.min(maxLeft, Math.max(margin, left))),
            top: Math.round(Math.min(maxTop, Math.max(margin, top)))
        };
    };
    const applyPosition = (left, top) => {
        const next = clampPosition(left, top);
        panel.style.position = 'fixed';
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
    };
    const ensureInitialPosition = () => {
        syncPanelViewport();
        if ((panel.offsetWidth || 0) < 80 || (panel.offsetHeight || 0) < 80) {
            panel.dataset.positioned = '';
            return;
        }
        if (panel.dataset.positioned === '1') {
            applyPosition(parseFloat(panel.style.left || '0') || 0, parseFloat(panel.style.top || '0') || 0);
            return;
        }
        panel.dataset.positioned = '1';
        const defaultLeft = panel.dataset.defaultLeft || String((window.innerWidth || 320) - (panel.offsetWidth || 280) - 24);
        const defaultTop = panel.dataset.defaultTop || '84';
        applyPosition(parseFloat(defaultLeft) || 24, parseFloat(defaultTop) || 84);
    };
    let dragState = null;
    const endDrag = () => {
        dragState = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };
    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        ensureInitialPosition();
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            left: parseFloat(panel.style.left || '0') || 0,
            top: parseFloat(panel.style.top || '0') || 0,
            pointerId: event.pointerId
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        if (typeof handle.setPointerCapture === 'function') {
            try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        }
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!dragState) return;
        if (dragState.pointerId !== undefined && dragState.pointerId !== event.pointerId) return;
        applyPosition(dragState.left + (event.clientX - dragState.startX), dragState.top + (event.clientY - dragState.startY));
        event.preventDefault();
    });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', ensureInitialPosition);
    panel.__ensureFloatingPosition = ensureInitialPosition;
    requestAnimationFrame(ensureInitialPosition);
}

function __pmRenderPdfToolbar() {
    const buttonBar = document.getElementById('pm-pdf-edit-button-bar');
    const isAdmin = __pmIsAdminProfile();
    document.querySelectorAll('[data-pdf-admin-caption="1"]').forEach((node) => {
        node.classList.toggle('hidden', !isAdmin);
    });
    if (!buttonBar) return;
    const showToolbar = __pmIsPdfPreviewVisible() && isAdmin;
    buttonBar.classList.toggle('hidden', !showToolbar);
    if (!showToolbar) {
        document.getElementById('pm-pdf-inspector')?.classList.add('hidden');
        document.getElementById('pm-pdf-inspector-backdrop')?.classList.add('hidden');
        return;
    }
    const adminTools = document.getElementById('pm-pdf-admin-tools');
    if (adminTools) adminTools.classList.toggle('hidden', !isAdmin);
    const button = document.getElementById('pm-pdf-edit-button');
    if (button) {
        const editingEnabled = !__pmPdfEditLocked;
        button.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>${editingEnabled ? 'Edicion activa' : 'Editar PDF'}</span>`;
        button.className = `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition ${editingEnabled ? 'bg-emerald-600 border-emerald-400/50 hover:bg-emerald-500' : 'bg-gray-950 border-gray-700 hover:bg-gray-900'}`;
        button.classList.toggle('hidden', !isAdmin);
    }
    const addButton = document.getElementById('pm-pdf-add-button');
    if (addButton) {
        addButton.classList.toggle('pointer-events-none', __pmPdfEditLocked);
        addButton.classList.toggle('opacity-60', __pmPdfEditLocked);
    }
}

function __pmGetOrderPreviewPages() {
    const root = document.querySelector('#pdf-content .pm-pdf-root');
    if (!(root instanceof HTMLElement)) return [];
    return Array.from(root.children).filter((child) => child instanceof HTMLDivElement);
}

function __pmGetOrderBasePageCount() {
    const docType = String(currentPreviewOrder?.docType || __pmPdfStyleActiveProfile || 'quote').toLowerCase();
    return docType === 'order' ? 1 : 2;
}

function __pmAttachOrderPageControls() {
    const pages = __pmGetOrderPreviewPages();
    pages.forEach((page) => page.querySelectorAll('[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove()));
    const canShow = __pmIsAdminProfile() && !__pmPdfEditLocked;
    if (!canShow || !pages.length) return;
    const cfg = __pmGetPdfStyleConfig();
    const lastPage = pages[pages.length - 1];
    if (!(lastPage instanceof HTMLElement)) return;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.setAttribute('data-pdf-page-add', '1');
    addBtn.title = 'Añadir hoja';
    addBtn.style.position = 'absolute';
    addBtn.style.left = '50%';
    addBtn.style.bottom = '8px';
    addBtn.style.transform = 'translateX(-50%)';
    addBtn.style.zIndex = '95';
    addBtn.style.width = '28px';
    addBtn.style.height = '28px';
    addBtn.style.borderRadius = '999px';
    addBtn.style.background = '#ffffff';
    addBtn.style.border = '1px solid #e5e7eb';
    addBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
    addBtn.style.cursor = 'pointer';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    lastPage.appendChild(addBtn);

    const canRemove = Number(cfg.extraPages || 0) > 0 || (Number(cfg.extraPages || 0) === 0 && __pmGetOrderBasePageCount() > 1);
    if (!canRemove) return;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.setAttribute('data-pdf-page-delete', '1');
    delBtn.title = 'Quitar última hoja';
    delBtn.style.position = 'absolute';
    delBtn.style.right = '8px';
    delBtn.style.top = '8px';
    delBtn.style.zIndex = '95';
    delBtn.style.width = '28px';
    delBtn.style.height = '28px';
    delBtn.style.borderRadius = '999px';
    delBtn.style.background = '#ffffff';
    delBtn.style.border = '1px solid #e5e7eb';
    delBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
    delBtn.style.cursor = 'pointer';
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    lastPage.appendChild(delBtn);
}

function __pmHandleOrderPageControlClick(targetEl) {
    if (!targetEl || !__pmIsAdminProfile() || __pmPdfEditLocked) return false;
    if (targetEl.hasAttribute('data-pdf-page-add')) {
        const cfg = __pmGetPdfStyleConfig();
        const nextExtra = __pmClampStyleNumber((parseInt(cfg.extraPages, 10) || 0) + 1, -1, 6, cfg.extraPages);
        const next = __pmNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __pmSetPdfStyleConfig(next, { applyToDom: true });
        __pmWritePdfStyleControls(next);
        __pmScheduleSharedPdfStyleSync(next);
        return true;
    }
    if (targetEl.hasAttribute('data-pdf-page-delete')) {
        const cfg = __pmGetPdfStyleConfig();
        const currentExtra = __pmClampStyleNumber(cfg.extraPages, -1, 6, 0);
        const basePages = __pmGetOrderBasePageCount();
        const nextExtra = currentExtra > 0
            ? (currentExtra - 1)
            : ((currentExtra === 0 && basePages > 1) ? -1 : currentExtra);
        if (nextExtra === currentExtra) return true;
        const next = __pmNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __pmSetPdfStyleConfig(next, { applyToDom: true });
        __pmWritePdfStyleControls(next);
        __pmScheduleSharedPdfStyleSync(next);
        return true;
    }
    return false;
}

function __pmSyncPdfEditMode() {
    const editingEnabled = __pmIsAdminProfile() && !__pmPdfEditLocked;
    document.querySelectorAll('#pdf-content .pm-pdf-root').forEach((node) => {
        node.classList.toggle('pm-pdf-admin-enabled', editingEnabled);
    });
    if (!editingEnabled) __pmClosePdfInspector();
    __pmRenderPdfToolbar();
    __pmAttachOrderPageControls();
    __pmEnsureMarginGuideController()?.refresh();
}

function __pmSetPdfEditLocked(locked) {
    const wasLocked = __pmPdfEditLocked;
    __pmPdfEditLocked = locked !== false;
    if (__pmPdfEditLocked) __pmClosePdfInspector();
    __pmSyncPdfEditMode();
    if (!wasLocked && __pmPdfEditLocked && __pmIsAdminProfile()) {
        Promise.resolve()
            .then(() => __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true }))
            .catch(() => {});
    }
}

function __pmGetPdfInspectorTarget() {
    if (!__pmPdfInspectorState || !__pmIsAdminProfile()) return null;
    if (__pmPdfInspectorState.kind === 'base') {
        const key = String(__pmPdfInspectorState.key || '').trim();
        const meta = __pmGetPdfBaseBlockMeta(key);
        if (!meta) return null;
        const layouts = __pmNormalizePdfBaseLayouts(__pmGetPdfStyleConfig().baseLayouts);
        const instanceKey = String(__pmPdfInspectorState.instanceKey || key).trim();
        const layout = layouts[instanceKey] || layouts[key] || __pmNormalizePdfBaseLayout();
        const canEdit = __pmCanEditPdfBaseBlock(key);
        return {
            kind: 'base',
            id: instanceKey,
            label: meta.label,
            layout,
            canMove: __pmCanMovePdfBaseBlock(key),
            canEdit,
            contentFields: canEdit ? __pmGetOrderBaseContentFields(key) : [],
            canDelete: false
        };
    }
    if (__pmPdfInspectorState.kind === 'resource') {
        const resource = __pmGetPdfResourcesFromState().find((item) => item.id === __pmPdfInspectorState.id);
        if (!resource) return null;
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const isLogo = resource.type === 'logo';
        const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
        const isBar = resource.type === 'bar';
        const canMove = __pmCanMovePdfResource(resource);
        const canEdit = __pmCanEditPdfResource(resource);
        return {
            kind: 'resource',
            id: resource.id,
            label: resource.type === 'title'
                ? 'Titulo libre'
                : (isSignBlock
                    ? 'Bloque de firma'
                    : (isSignLine
                        ? 'Linea de firma'
                        : (isBar ? 'Linea decorativa' : (isLogo ? 'Logo' : 'Texto libre')))),
            resource,
            canMove,
            canEdit,
            allowText: canEdit && isTextLike,
            showTypography: canEdit && (isTextLike || isSignBlock),
            showToggles: canEdit && isTextLike,
            showAlign: canEdit && isTextLike,
            showColor: canEdit && (isTextLike || isSignBlock),
            showBgColor: canEdit && !isLogo,
            bgColorLabel: isSignBlock || isSignLine ? 'Color linea' : (isBar ? 'Color' : 'Fondo'),
            contentFields: canEdit && isSignBlock
                ? [
                    { key: 'signTitle', label: 'Titulo', value: String(resource.signTitle || ''), max: 120, multiline: false },
                    { key: 'signRole', label: 'Subtitulo', value: String(resource.signRole || ''), max: 120, multiline: false }
                ]
                : [],
            canDelete: canMove || canEdit
        };
    }
    return null;
}

function __pmRenderPdfInspector() {
    const panel = document.getElementById('pm-pdf-inspector');
    const backdrop = document.getElementById('pm-pdf-inspector-backdrop');
    if (!(panel instanceof HTMLElement)) return;
    const target = __pmGetPdfInspectorTarget();
    const shouldShow = !!target && !__pmPdfEditLocked && __pmIsAdminProfile();
    panel.classList.toggle('hidden', !shouldShow);
    if (backdrop) backdrop.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;
    if (typeof panel.__ensureFloatingPosition === 'function') requestAnimationFrame(() => panel.__ensureFloatingPosition());
    const title = panel.querySelector('[data-pdf-inspector-title]');
    const body = panel.querySelector('[data-pdf-inspector-body]');
    if (title) title.textContent = target.label;
    if (!(body instanceof HTMLElement)) return;
    if (target.kind === 'base') {
        const contentFields = Array.isArray(target.contentFields) ? target.contentFields : [];
        const layoutSection = target.canMove
            ? `<div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.x.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.x.max}" value="${target.layout.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.y.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.y.max}" value="${target.layout.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Escala</span><input data-pdf-inspector-field="scalePct" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${target.layout.scalePct}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-pdf-inspector-field="angle" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.angle.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.angle.max}" value="${target.layout.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Visible</span><select data-pdf-inspector-field="visible" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${!target.layout.hidden ? 'selected' : ''}>Sí</option><option value="false" ${target.layout.hidden ? 'selected' : ''}>No</option></select></label>
            </div>`
            : '';
        const contentSection = contentFields.length
            ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
                ${contentFields.map((field) => field.multiline
                    ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><textarea data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" rows="${field.rows || 4}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__pmSafeHtml(field.value || '')}</textarea></label>`
                    : `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="text" value="${__pmSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
            </div>`
            : '';
        const resetButton = target.canMove
            ? `<button type="button" data-pdf-inspector-action="reset" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:border-brand-red hover:text-brand-red">Restablecer bloque</button>`
            : '';
        body.innerHTML = `
            ${layoutSection}
            ${contentSection}
            ${resetButton}
        `;
        return;
    }
    const resource = target.resource;
    const contentSection = Array.isArray(target.contentFields) && target.contentFields.length
        ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
            ${target.contentFields.map((field) => `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="text" value="${__pmSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
        </div>`
        : '';
    const moveFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" value="${resource.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" value="${resource.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ancho</span><input data-pdf-inspector-field="w" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="16" value="${resource.w}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alto</span><input data-pdf-inspector-field="h" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="1" value="${resource.h}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
        `
        : '';
    const moveMetaFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ángulo</span><input data-pdf-inspector-field="angle" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Página</span><input data-pdf-inspector-field="page" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="1" max="8" value="${resource.page}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-pdf-inspector-field="enabled" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${resource.enabled ? 'selected' : ''}>Sí</option><option value="false" ${!resource.enabled ? 'selected' : ''}>No</option></select></label>
        `
        : '';
    body.innerHTML = `
        ${target.allowText ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Texto</span><textarea data-pdf-inspector-field="text" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" rows="4" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__pmSafeHtml(resource.text)}</textarea></label>` : ''}
        ${contentSection}
        <div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
            ${moveFields}
            ${target.showTypography ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fuente</span><input data-pdf-inspector-field="fontSize" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>` : ''}
            ${moveMetaFields}
            ${target.showAlign ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alineación</span><select data-pdf-inspector-field="align" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option><option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option><option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option><option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option></select></label>` : ''}
            ${target.showColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Color</span><input data-pdf-inspector-field="color" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="color" value="${resource.color}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
            ${target.showBgColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__pmSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-pdf-inspector-field="bgColor" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="color" value="${resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2 ${target.showToggles ? '' : 'hidden'}">
            <button type="button" data-pdf-inspector-toggle="bold" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.bold ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Negrita</button>
            <button type="button" data-pdf-inspector-toggle="italic" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.italic ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Itálica</button>
            <button type="button" data-pdf-inspector-toggle="underline" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.underline ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Subrayado</button>
        </div>
        ${target.canDelete ? `<button type="button" data-pdf-inspector-action="delete" data-target-id="${__pmSafeHtml(resource.id)}" class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition hover:bg-red-100"><i class="fa-solid fa-trash"></i><span>Eliminar recurso</span></button>` : ''}
    `;
}

function __pmOpenPdfInspector(state) {
    __pmPdfInspectorState = state && typeof state === 'object' ? { ...state } : null;
    __pmRenderPdfInspector();
}

function __pmClosePdfInspector() {
    __pmPdfInspectorState = null;
    __pmRenderPdfInspector();
}

function __pmCommitResourceInspectorField(resourceId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const resources = __pmGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    const current = resources[idx];
    const canMove = __pmCanMovePdfResource(current);
    const canEdit = __pmCanEditPdfResource(current);
    if (field === 'text') {
        if (!canEdit) return;
        current.text = String(rawValue || '').slice(0, 1200);
    } else if (field === 'signTitle' || field === 'signRole') {
        if (!canEdit) return;
        current[field] = String(rawValue || '').slice(0, 120);
    } else if (field === 'fontSize') {
        if (!canEdit) return;
        current.fontSize = __pmClampStyleNumber(rawValue, 8, 72, current.fontSize);
    } else if (field === 'align') {
        if (!canEdit) return;
        current.align = __pmNormalizeStyleAlign(rawValue, current.align);
    } else if (field === 'color') {
        if (!canEdit) return;
        current.color = __pmNormalizeHexColor(rawValue, current.color);
    } else if (field === 'bgColor') {
        if (!canEdit) return;
        current.bgColor = __pmNormalizeHexColor(rawValue, current.bgColor);
    } else if (field === 'page') {
        if (!canMove) return;
        current.page = __pmClampStyleNumber(rawValue, 1, 8, current.page);
    } else if (field === 'x') {
        if (!canMove) return;
        current.x = __pmClampStyleNumber(rawValue, -4000, 4000, current.x);
    } else if (field === 'y') {
        if (!canMove) return;
        current.y = __pmClampStyleNumber(rawValue, -5000, 5000, current.y);
    } else if (field === 'w') {
        if (!canMove) return;
        current.w = __pmClampStyleNumber(rawValue, 16, 4000, current.w);
    } else if (field === 'h') {
        if (!canMove) return;
        current.h = __pmClampStyleNumber(rawValue, 1, 5000, current.h);
    } else if (field === 'angle') {
        if (!canMove) return;
        current.angle = __pmClampStyleNumber(rawValue, -360, 360, current.angle || 0);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        if (!canEdit) return;
        current[field] = !!rawValue;
    } else if (field === 'enabled') {
        if (!canMove) return;
        current.enabled = !!rawValue;
    }
    else return;
    resources[idx] = { ...current };
    __pmCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
}

function __pmHandlePdfInspectorInput(event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const isContinuousInput = event.type === 'input'
        && (
            target instanceof HTMLTextAreaElement
            || (target instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(target.type || '').toLowerCase()))
        );
    const field = String(target.getAttribute('data-pdf-inspector-field') || '').trim();
    const kind = String(target.getAttribute('data-target-kind') || '').trim();
    const id = String(target.getAttribute('data-target-id') || '').trim();
    if (!field || !kind || !id) return;
    const rawValue = target instanceof HTMLSelectElement
        ? ((field === 'visible' || field === 'enabled') ? String(target.value) === 'true' : target.value)
        : (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '');
    if (kind === 'base') {
        const baseKey = String(id || '').split('__')[0].trim();
        if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(field)) {
            __pmCommitBaseLayoutField(`base:${id}`, field, rawValue);
        } else if (__pmCanEditPdfBaseBlock(baseKey)) {
            __pmCommitPdfContentField(field, rawValue, {
                refreshPreview: !isContinuousInput,
                skipEditorUiRefresh: isContinuousInput
            });
        } else {
            return;
        }
    }
    else __pmCommitResourceInspectorField(id, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
    if (isContinuousInput) {
        // En escritura continua no re-renderizamos el inspector para evitar perdida de foco por tecla.
        requestAnimationFrame(() => {
            const panel = document.getElementById('pm-pdf-inspector');
            if (panel && typeof panel.__ensureFloatingPosition === 'function') panel.__ensureFloatingPosition();
        });
        return;
    }
    __pmRenderPdfInspector();
}

function __pmHandlePdfInspectorClick(event) {
    const actionEl = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-action]') : null;
    if (actionEl) {
        const action = String(actionEl.getAttribute('data-pdf-inspector-action') || '').trim();
        const id = String(actionEl.getAttribute('data-target-id') || '').trim();
        const kind = String(actionEl.getAttribute('data-target-kind') || '').trim();
        if (action === 'close') {
            __pmClosePdfInspector();
            return;
        }
        if (action === 'reset' && kind === 'base' && id) {
            __pmCommitBaseLayoutField(`base:${id}`, 'x', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'y', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'scalePct', 100);
            __pmCommitBaseLayoutField(`base:${id}`, 'angle', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'visible', true);
            __pmRenderPdfInspector();
            return;
        }
        if (action === 'delete' && id) {
            const resources = __pmGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            __pmPdfResourceEditorSelectedId = '';
            __pmClosePdfInspector();
            __pmCommitPdfResources(resources);
        }
        return;
    }
    const toggle = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-toggle]') : null;
    if (!toggle) return;
    const field = String(toggle.getAttribute('data-pdf-inspector-toggle') || '').trim();
    const id = String(toggle.getAttribute('data-target-id') || '').trim();
    if (!field || !id) return;
    const current = __pmGetPdfResourcesFromState().find((resource) => resource.id === id);
    if (!current) return;
    __pmCommitResourceInspectorField(id, field, !current[field]);
    __pmRenderPdfInspector();
}

function __pmEnsurePdfEditingChrome(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const container = document.getElementById('preview-container');
    if (!(container instanceof HTMLElement)) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (!document.getElementById('pm-pdf-edit-button-bar')) {
        const buttonBar = document.createElement('div');
        buttonBar.id = 'pm-pdf-edit-button-bar';
        buttonBar.className = 'hidden absolute right-4 top-4 z-[96] flex items-center gap-2';
        buttonBar.innerHTML = `
            <div id="pm-pdf-admin-tools" class="flex items-center gap-2 transition">
                <button type="button" id="pm-pdf-add-button" class="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-700 shadow-lg transition hover:border-brand-red hover:text-brand-red">
                    <i class="fa-solid fa-plus"></i>
                    <span>Anadir recurso</span>
                </button>
            </div>
            <button type="button" id="pm-pdf-edit-button" class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition"></button>
        `;
        buttonBar.addEventListener('click', (event) => {
            const addButton = event.target instanceof Element ? event.target.closest('#pm-pdf-add-button') : null;
            if (addButton) {
                if (__pmPdfEditLocked || !__pmIsAdminProfile()) return;
                window.openModal('pdf-resource-modal');
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('#pm-pdf-edit-button') : null;
            if (!button) return;
            __pmSetPdfEditLocked(!__pmPdfEditLocked);
        });
        container.appendChild(buttonBar);
    }
    if (!document.getElementById('pm-pdf-inspector-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'pm-pdf-inspector-backdrop';
        backdrop.className = 'hidden absolute inset-0 z-[96] bg-gray-950/45 backdrop-blur-[1px]';
        backdrop.addEventListener('click', () => __pmClosePdfInspector());
        container.appendChild(backdrop);
    }
    if (!document.getElementById('pm-pdf-inspector')) {
        const panel = document.createElement('div');
        panel.id = 'pm-pdf-inspector';
        panel.className = 'hidden absolute z-[97] w-full max-w-[420px]';
        panel.innerHTML = `
            <div data-pdf-inspector-card class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div data-pdf-panel-handle class="flex cursor-grab items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-4 active:cursor-grabbing">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Edicion</p>
                        <h4 data-pdf-inspector-title class="text-sm font-black text-gray-800">Elemento</h4>
                    </div>
                    <button type="button" data-pdf-inspector-action="close" class="h-8 w-8 rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div data-pdf-inspector-body class="custom-scroll space-y-3 overflow-y-auto px-4 py-4 text-xs text-gray-600" style="max-height:min(72vh,calc(100vh - 8rem));"></div>
            </div>
        `;
        panel.addEventListener('input', __pmHandlePdfInspectorInput);
        panel.addEventListener('change', __pmHandlePdfInspectorInput);
        panel.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            if (!(event.target instanceof HTMLInputElement)) return;
            if (event.target.type === 'button' || event.target.type === 'submit' || event.target.type === 'reset') return;
            event.preventDefault();
        });
        panel.addEventListener('click', __pmHandlePdfInspectorClick);
        panel.addEventListener('click', (event) => {
            if (event.target === panel) __pmClosePdfInspector();
        });
        container.appendChild(panel);
    }
    __pmBindFloatingPanelDrag(document.getElementById('pm-pdf-inspector'), container);
    if (container.dataset.pmPdfEditingChromeBound !== '1') {
        container.dataset.pmPdfEditingChromeBound = '1';
        container.addEventListener('click', (event) => {
            const pageCtl = event.target instanceof Element ? event.target.closest('[data-pdf-page-add],[data-pdf-page-delete]') : null;
            if (pageCtl && __pmHandleOrderPageControlClick(pageCtl)) {
                event.preventDefault();
                return;
            }
            const del = event.target instanceof Element ? event.target.closest('.pm-pdf-delete-btn[data-res-id]') : null;
            if (!del || __pmPdfEditLocked || !__pmIsAdminProfile()) return;
            const id = String(del.getAttribute('data-res-id') || '').trim();
            if (!id) return;
            const resources = __pmGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            if (__pmPdfResourceEditorSelectedId === id) __pmPdfResourceEditorSelectedId = '';
            __pmClosePdfInspector();
            __pmCommitPdfResources(resources);
        });
        document.addEventListener('dblclick', (event) => {
            if (!__pmIsAdminProfile() || __pmPdfEditLocked) return;
            if (!__pmIsPdfPreviewVisible()) return;
            const target = event.target instanceof Element
                ? event.target
                : (event.target && event.target.parentElement instanceof Element ? event.target.parentElement : null);
            if (!target || target.closest('#pm-pdf-inspector')) return;
            const resourceNode = target.closest('#pdf-content .pm-pdf-resource[data-res-id]');
            if (resourceNode) {
                const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
                const resource = __pmFindPdfResourceById(resourceId);
                if (!resource) return;
                if (!__pmCanMovePdfResource(resource) && !__pmCanEditPdfResource(resource)) return;
                __pmPdfResourceEditorSelectedId = resourceId;
                __pmHighlightSelectedBaseTextBlock();
                __pmOpenPdfInspector({ kind: 'resource', id: __pmPdfResourceEditorSelectedId });
                return;
            }
            const baseNode = target.closest('#pdf-content [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
            if (!__pmCanMovePdfBaseBlock(baseKey) && !__pmCanEditPdfBaseBlock(baseKey)) return;
            __pmPdfResourceEditorSelectedId = `base:${baseKey}`;
            __pmHighlightSelectedBaseTextBlock();
            __pmOpenPdfInspector({ kind: 'base', key: baseKey, instanceKey: String(baseNode.dataset.baseInstance || baseKey).trim() });
        });
    }
    __pmSyncPdfEditMode();
    if (!skipEditorUiRefresh) __pmRenderPdfInspector();
}

function __pmApplyPdfStyleToLivePreview(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const rootNodes = document.querySelectorAll('#pdf-content .pm-pdf-root');
    if (!rootNodes.length) return;
    const vars = __pmPdfStyleVars(__pmGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __pmApplyMarginVarsToLivePreview(__pmGetPdfStyleConfig());
    __pmApplyPdfBaseLayouts();
    __pmAutoFitPdfTextResources();
    __pmEnsurePdfEditingChrome(opts);
    __pmBindPdfResourceDrag();
    __pmHighlightSelectedBaseTextBlock();
    if (!skipEditorUiRefresh) __pmRenderPdfInspector();
    __pmSyncPdfEditMode();
    if (!skipEditorUiRefresh && __pmIsAdminProfile()) __pmRenderPdfResourcesEditorList();
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
    setText('pdf-style-margin-top-value', `${cfg.marginTopPx}px`);
    setText('pdf-style-margin-right-value', `${cfg.marginRightPx}px`);
    setText('pdf-style-margin-bottom-value', `${cfg.marginBottomPx}px`);
    setText('pdf-style-margin-left-value', `${cfg.marginLeftPx}px`);
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
    setValue('pdf-style-margin-top', cfg.marginTopPx);
    setValue('pdf-style-margin-right', cfg.marginRightPx);
    setValue('pdf-style-margin-bottom', cfg.marginBottomPx);
    setValue('pdf-style-margin-left', cfg.marginLeftPx);
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
        marginTopPx: document.getElementById('pdf-style-margin-top')?.value ?? __pmGetPdfStyleConfig().marginTopPx,
        marginRightPx: document.getElementById('pdf-style-margin-right')?.value ?? __pmGetPdfStyleConfig().marginRightPx,
        marginBottomPx: document.getElementById('pdf-style-margin-bottom')?.value ?? __pmGetPdfStyleConfig().marginBottomPx,
        marginLeftPx: document.getElementById('pdf-style-margin-left')?.value ?? __pmGetPdfStyleConfig().marginLeftPx,
        baseLayouts: __pmGetPdfStyleConfig().baseLayouts,
        resources: __pmGetPdfStyleConfig().resources,
        quickPx: document.getElementById('pdf-style-quick-size')?.value,
        conditionsPx: document.getElementById('pdf-style-conditions-size')?.value,
        signPx: document.getElementById('pdf-style-sign-size')?.value,
        footerPx: __pmGetPdfStyleConfig().footerPx,
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
    if (opts.applyToDom !== false) __pmApplyPdfStyleToLivePreview(opts);
}

function __pmNormalizeUserRole(value) {
    const safe = String(value || '').trim().toLowerCase();
    if (!safe) return '';
    if (safe === 'administrador' || safe === 'administrator' || safe === 'administrators' || safe === 'superadmin' || safe === 'super_admin' || safe === 'admins') return 'admin';
    return safe;
}

function __pmResolveCurrentUserRole() {
    const parseAuthState = (key) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const compatAuth = parseAuthState('pb_compat_auth_v1');
    const nativeAuth = parseAuthState('pb_native_auth_v1');
    const candidates = [
        window.currentUserProfile?.role,
        window.currentUserProfile?.rol,
        window.currentUserProfile?.record?.role,
        window.currentUserProfile?.record?.rol,
        window.currentUserProfile?.profile?.role,
        window.currentUserProfile?.profile?.rol,
        window.currentUserProfile?.user?.role,
        window.currentUserProfile?.app_user?.role,
        window.currentUserProfile?.user_metadata?.role,
        window.currentUserProfile?.app_metadata?.role,
        window.currentUser?.role,
        window.userProfile?.role,
        Array.isArray(window.currentUserProfile?.roles) ? window.currentUserProfile.roles[0] : '',
        localStorage.getItem('hub_user_cache_role') || '',
        compatAuth?.user?.role,
        compatAuth?.record?.role,
        nativeAuth?.user?.role,
        nativeAuth?.record?.role
    ];
    for (const candidate of candidates) {
        const safe = __pmNormalizeUserRole(candidate);
        if (safe) return safe;
    }
    return '';
}

function __pmIsAdminProfile() {
    return __pmResolveCurrentUserRole() === 'admin';
}

function __pmResolvePdfActorName() {
    const candidates = [
        window.currentUserProfile?.login_username,
        window.currentUserProfile?.record?.login_username,
        window.currentUserProfile?.profile?.login_username,
        window.currentUserProfile?.Usernames,
        window.currentUserProfile?.username,
        window.currentUserProfile?.record?.username,
        window.currentUserProfile?.profile?.username,
        window.currentUserProfile?.full_name,
        window.currentUserProfile?.name,
        window.currentUserProfile?.record?.full_name,
        window.currentUserProfile?.record?.name,
        window.currentUserProfile?.profile?.full_name,
        window.currentUserProfile?.profile?.name,
        window.currentUserProfile?.email ? String(window.currentUserProfile.email).split('@')[0] : '',
        window.currentUserProfile?.record?.email ? String(window.currentUserProfile.record.email).split('@')[0] : ''
    ];
    const resolved = candidates.map((value) => __pmSanitizeActorName(value)).find(Boolean);
    return resolved || 'Usuario';
}

function __pmCanUsePdfNotes() {
    return false;
}

async function __pmLoadCurrentUserProfile(user) {
    const pbClient = window.globalPocketBase || window.pbClient || window.tenantPocketBase;
    const fallback = user && typeof user === 'object' ? user : {};
    if (!pbClient) return { ...fallback };
    const parseAuthState = (key) => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const compatAuth = parseAuthState('pb_compat_auth_v1');
    const nativeAuth = parseAuthState('pb_native_auth_v1');
    const idCandidates = [...new Set([
        String(fallback?.id || '').trim(),
        String(fallback?.record?.id || '').trim(),
        String(compatAuth?.user?.id || '').trim(),
        String(compatAuth?.record?.id || '').trim(),
        String(nativeAuth?.user?.id || '').trim(),
        String(nativeAuth?.record?.id || '').trim()
    ].filter(Boolean))];
    const emailCandidates = [...new Set([
        String(fallback?.email || '').trim().toLowerCase(),
        String(fallback?.record?.email || '').trim().toLowerCase(),
        String(compatAuth?.user?.email || '').trim().toLowerCase(),
        String(compatAuth?.record?.email || '').trim().toLowerCase(),
        String(nativeAuth?.user?.email || '').trim().toLowerCase(),
        String(nativeAuth?.record?.email || '').trim().toLowerCase()
    ].filter(Boolean))];
    const usernameCandidates = [...new Set([
        String(fallback?.login_username || '').trim(),
        String(fallback?.record?.login_username || '').trim(),
        String(fallback?.username || '').trim(),
        String(fallback?.record?.username || '').trim(),
        String(compatAuth?.user?.login_username || '').trim(),
        String(compatAuth?.record?.login_username || '').trim(),
        String(compatAuth?.user?.username || '').trim(),
        String(compatAuth?.record?.username || '').trim(),
        String(nativeAuth?.user?.login_username || '').trim(),
        String(nativeAuth?.record?.login_username || '').trim(),
        String(nativeAuth?.user?.username || '').trim(),
        String(nativeAuth?.record?.username || '').trim()
    ].filter(Boolean))];
    const lookupByField = async (table, field, values) => {
        for (const value of values) {
            try {
                const { data } = await pbClient.from(table).select('*').eq(field, value).maybeSingle();
                if (data) return data;
            } catch (_) {}
        }
        return null;
    };
    let appUser = await lookupByField('app_users', 'id', idCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'email', emailCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'login_username', usernameCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'username', usernameCandidates);
    const merged = { ...(appUser || {}), ...fallback };
    const role = __pmNormalizeUserRole(
        appUser?.role
        || appUser?.rol
        || fallback?.role
        || fallback?.rol
        || fallback?.record?.role
        || fallback?.record?.rol
    );
    if (role) {
        merged.role = role;
        localStorage.setItem('hub_user_cache_role', role);
    }
    if (!merged.username) merged.username = appUser?.login_username || appUser?.username || fallback?.login_username || fallback?.username || fallback?.email?.split('@')[0] || '';
    return merged;
}

function __pmOverlayDocumentType(profile) {
    const safeProfile = __pmNormalizePdfStyleProfileKey(profile);
    return __PM_PDF_OVERLAY_TYPES[safeProfile] || __PM_PDF_OVERLAY_TYPES.quote;
}

function __pmParseJsonObjectLike(value) {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function __pmResolvePdfOverlayConfigPayload(record = {}) {
    const rawRecord = record && typeof record === 'object' ? record : {};
    const configJson = __pmParseJsonObjectLike(rawRecord.config_json);
    if (configJson) return configJson;
    const elements = __pmParseJsonObjectLike(rawRecord.elements) || {};
    const elementConfig = __pmParseJsonObjectLike(elements.config_json);
    if (elementConfig) return elementConfig;
    if (elements.profiles && typeof elements.profiles === 'object') {
        return {
            tenant: rawRecord.tenant || elements.tenant || __PM_PDF_STYLE_TENANT,
            version: Math.max(2, parseInt(elements.version, 10) || 2),
            updated_at: elements.updated_at || new Date().toISOString(),
            profiles: elements.profiles
        };
    }
    return {};
}

function __pmBuildPdfStyleConfigPayload(rawExisting, style, profile = __pmPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const key = __pmNormalizePdfStyleProfileKey(profile);
    const profiles = existing.profiles && typeof existing.profiles === 'object' ? { ...existing.profiles } : {};
    profiles[key] = __pmNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __PM_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: new Date().toISOString(),
        profiles
    };
}

function __pmBuildPdfOverlayElementsPayload(configJson) {
    const resolved = __pmResolvePdfOverlayConfigPayload({ config_json: configJson });
    const objects = [];
    const profiles = resolved.profiles && typeof resolved.profiles === 'object' ? resolved.profiles : {};
    Object.entries(profiles).forEach(([profileKey, style]) => {
        const safeStyle = __pmNormalizePdfStyle(style);
        const safeResources = __pmNormalizePdfResources(safeStyle.resources);
        safeResources.forEach((resource, index) => {
            const safeType = String(resource.type || '').toLowerCase();
            objects.push({
                id: `${profileKey}:${resource.id || index}`,
                overlay_profile: profileKey,
                overlay_resource_type: safeType,
                type: safeType === 'logo' ? 'image' : ((safeType === 'bar' || safeType === 'sign' || safeType === 'sign-line') ? 'rect' : 'textbox'),
                left: Number(resource.x || 0),
                top: Number(resource.y || 0),
                width: Number(resource.w || 0),
                height: Number(resource.h || 0),
                angle: Number(resource.angle || 0),
                fill: resource.bgColor || resource.color || '#111827',
                backgroundColor: resource.bgColor || 'transparent',
                text: resource.text || '',
                signTitle: resource.signTitle || '',
                signRole: resource.signRole || '',
                fontSize: Number(resource.fontSize || 14),
                fontFamily: __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey || safeStyle.fontFamilyKey] || __PM_PDF_STYLE_FONT_MAP.segoe,
                page: Number(resource.page || 1),
                enabled: resource.enabled !== false
            });
        });
    });
    return {
        tenant: resolved.tenant || __PM_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(resolved.version, 10) || 2),
        updated_at: resolved.updated_at || new Date().toISOString(),
        profiles,
        config_json: resolved,
        objects
    };
}

function __pmPickLatestRecord(records) {
    const list = Array.isArray(records) ? records.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

async function __pmLoadModernPdfStyleRecord(profileKey) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    const overlayDocumentType = __pmOverlayDocumentType(profileKey);
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
                .select('id,config_json,elements,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                return {
                    source: 'pdf_overlays',
                    id: String(row.id || ''),
                    config: __pmResolvePdfOverlayConfigPayload(row),
                    raw: row.config_json || row.elements || {}
                };
            }
        } catch (_) {}
    }
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from(__PM_PDF_SETTINGS_COLLECTION)
                .select('id,config_json,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('generator_type', profileKey === 'order' ? 'orders' : 'quotes');
            const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                return { source: 'pdf_generator_settings', id: String(row.id || ''), config: row.config_json || {}, raw: row.config_json || {} };
            }
        } catch (_) {}
    }
    return null;
}

async function __pmLoadLegacyPdfStyleRecord() {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from('configuracion')
                .select('id,valor_json,updated,created,updated_at,created_at')
                .eq('clave', __PM_PDF_STYLE_CONFIG_KEY);
            const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                const parsed = __pmParseJsonObjectLike(row.valor_json) || {};
                return { source: 'legacy', id: String(row.id || ''), raw: parsed, config: parsed };
            }
        } catch (_) {}
    }
    return null;
}

async function __pmUpsertModernPdfStyleRecord(profileKey, configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return { id: '', config: configJson || {} };
    const overlayDocumentType = __pmOverlayDocumentType(profileKey);
    const safeConfig = __pmResolvePdfOverlayConfigPayload({ config_json: configJson || {} });
    const payload = {
        tenant: __PM_PDF_STYLE_TENANT,
        document_type: overlayDocumentType,
        config_json: safeConfig,
        elements: __pmBuildPdfOverlayElementsPayload(safeConfig)
    };
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existing, error: lookupError } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
                .select('id,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            if (lookupError) throw lookupError;
            const existingRow = __pmPickLatestRecord(Array.isArray(existing) ? existing : (existing ? [existing] : []));
            if (existingRow?.id) {
                const { error: updError } = await pbClient
                    .from(__PM_PDF_OVERLAYS_COLLECTION)
                    .update(payload)
                    .eq('tenant', __PM_PDF_STYLE_TENANT)
                    .eq('document_type', overlayDocumentType);
                if (updError) throw updError;
                return { id: String(existingRow.id), config: payload.config_json };
            }
            const { data: inserted, error: insError } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
                .insert(payload)
                .select('id')
                .single();
            if (insError) throw insError;
            return { id: String(inserted?.id || ''), config: payload.config_json };
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    return { id: '', config: payload.config_json };
}

async function __pmUpsertLegacyPdfStyleRecord(configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existing, error: lookupError } = await pbClient
                .from('configuracion')
                .select('id,updated,created,updated_at,created_at')
                .eq('clave', __PM_PDF_STYLE_CONFIG_KEY);
            if (lookupError) throw lookupError;
            const existingRow = __pmPickLatestRecord(Array.isArray(existing) ? existing : (existing ? [existing] : []));
            if (existingRow?.id) {
                const { error: updError } = await pbClient
                    .from('configuracion')
                    .update({ valor_json: configJson || {} })
                    .eq('clave', __PM_PDF_STYLE_CONFIG_KEY);
                if (updError) throw updError;
                return { id: String(existingRow.id || '') };
            }
            const { data: inserted, error: insError } = await pbClient
                .from('configuracion')
                .insert({ clave: __PM_PDF_STYLE_CONFIG_KEY, valor_json: configJson || {} })
                .select('id')
                .single();
            if (insError) throw insError;
            return { id: String(inserted?.id || '') };
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    return null;
}

async function __pmUpsertCompatPdfSettingsRecord(profileKey, configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    const generatorType = profileKey === 'order' ? 'orders' : 'quotes';
    const payload = {
        tenant: __PM_PDF_STYLE_TENANT,
        generator_type: generatorType,
        config_json: configJson || {}
    };
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existing, error: lookupError } = await pbClient
                .from(__PM_PDF_SETTINGS_COLLECTION)
                .select('id,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('generator_type', generatorType);
            if (lookupError) throw lookupError;
            const existingRow = __pmPickLatestRecord(Array.isArray(existing) ? existing : (existing ? [existing] : []));
            if (existingRow?.id) {
                const { error: updError } = await pbClient
                    .from(__PM_PDF_SETTINGS_COLLECTION)
                    .update(payload)
                    .eq('tenant', __PM_PDF_STYLE_TENANT)
                    .eq('generator_type', generatorType);
                if (updError) throw updError;
                return { id: String(existingRow.id || '') };
            }
            const { data: inserted, error: insError } = await pbClient
                .from(__PM_PDF_SETTINGS_COLLECTION)
                .insert(payload)
                .select('id')
                .single();
            if (insError) throw insError;
            return { id: String(inserted?.id || '') };
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    return null;
}

async function __pmLoadSharedPdfStyleConfig(profile = 'quote') {
    const profileKey = __pmNormalizePdfStyleProfileKey(profile);
    try {
        const canMigrate = __pmIsAdminProfile();
        let record = await __pmLoadModernPdfStyleRecord(profileKey);
        if (!record) {
            const legacyRecord = await __pmLoadLegacyPdfStyleRecord();
            if (legacyRecord?.config) {
                const legacyPayload = __pmBuildPdfStyleConfigPayload(
                    legacyRecord.raw || {},
                    __pmExtractPdfStyleProfile(legacyRecord.config, profileKey),
                    profileKey
                );
                if (canMigrate) {
                    try {
                        const saved = await __pmUpsertModernPdfStyleRecord(profileKey, legacyPayload);
                        record = { source: 'pdf_overlays', id: saved.id, config: saved.config, raw: saved.config };
                    } catch (_) {
                        record = { source: 'legacy', id: legacyRecord.id || '', config: legacyPayload, raw: legacyPayload };
                    }
                } else {
                    record = { source: 'legacy', id: legacyRecord.id || '', config: legacyPayload, raw: legacyPayload };
                }
            }
        } else if (record.source !== 'pdf_overlays' && record.config && canMigrate) {
            try {
                const saved = await __pmUpsertModernPdfStyleRecord(profileKey, record.config);
                record = { source: 'pdf_overlays', id: saved.id, config: saved.config, raw: saved.config };
            } catch (_) {}
        }
        __pmPdfStyleActiveProfile = profileKey;
        __pmPdfStyleConfigRecordId = record?.id || '';
        __pmPdfStyleConfigStore = record?.source || '';
        __pmPdfStyleRawPayload = record?.raw || {};
        const resolved = record?.config ? __pmExtractPdfStyleProfile(record.config, profileKey) : __PM_PDF_STYLE_DEFAULTS;
        __pmSetPdfStyleConfig(resolved || __PM_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __pmWritePdfStyleControls(__pmGetPdfStyleConfig());
        if (__pmIsAdminProfile()) __pmRenderPdfResourcesEditorList();
    } catch (e) {
        console.warn('No se pudo cargar la configuracion PDF compartida (PM):', e);
    }
}

async function __pmEnsurePdfStyleProfile(docType, options = {}) {
    const wanted = __pmNormalizePdfStyleProfileKey(docType === 'order' ? 'order' : 'quote');
    const forceReload = !!(options && options.forceReload);
    if (!forceReload && __pmPdfStyleActiveProfile === wanted && __pmPdfStyleState) return;
    await __pmLoadSharedPdfStyleConfig(wanted);
}

async function __pmPersistSharedPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__pmIsAdminProfile() && opts.force !== true) return;
    const normalized = __pmNormalizePdfStyle(style);
    try {
        const configJson = __pmBuildPdfStyleConfigPayload(__pmPdfStyleRawPayload || {}, normalized, __pmPdfStyleActiveProfile);
        const saved = await __pmUpsertModernPdfStyleRecord(__pmPdfStyleActiveProfile, configJson);
        __pmPdfStyleConfigRecordId = saved.id;
        __pmPdfStyleConfigStore = 'pdf_overlays';
        __pmPdfStyleRawPayload = saved.config;
        try { await __pmUpsertCompatPdfSettingsRecord(__pmPdfStyleActiveProfile, configJson); } catch (_) {}
        try { await __pmUpsertLegacyPdfStyleRecord(configJson); } catch (_) {}
    } catch (e) {
        console.warn('No se pudo guardar la configuracion PDF compartida (PM):', e);
    }
}

function __pmScheduleSharedPdfStyleSync(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__pmIsAdminProfile() && opts.force !== true) return;
    if (__pmPdfStyleSyncTimer) clearTimeout(__pmPdfStyleSyncTimer);
    __pmPdfStyleSyncTimer = setTimeout(() => {
        __pmPersistSharedPdfStyleConfig(style || __pmPdfStyleState, opts);
    }, 450);
}

function __pmHandlePdfStyleControlChange() {
    if (!__pmIsAdminProfile()) return;
    const next = __pmReadPdfStyleControls();
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmSyncPdfStyleValueLabels(next);
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmRefreshPreviewFromStyleState(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!currentPreviewOrder) return;
    const pdfContainer = document.getElementById('pdf-content');
    if (!pdfContainer || pdfContainer.classList.contains('hidden')) return;
    const docType = currentPreviewOrder.docType || 'quote';
    pdfContainer.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
    __pmApplyPdfStyleToLivePreview(opts);
}

function __pmCommitPdfResources(resources, options = {}) {
    const cfg = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({ ...cfg, resources: __pmNormalizePdfResources(resources) });
    // Permite actualizar preview sin reconstruir paneles de edicion (evita blur al escribir).
    const skipEditorUiRefresh = options && options.skipEditorUiRefresh === true;
    __pmSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh });
    __pmScheduleSharedPdfStyleSync(next, { force: options.forcePersist === true });
    if (options.refreshPreview !== false) __pmRefreshPreviewFromStyleState({ skipEditorUiRefresh });
    if (!skipEditorUiRefresh) {
        __pmRenderPdfResourcesEditorList();
        __pmRenderPdfInspector();
    }
}

function __pmGetPdfResourcesFromState() {
    return __pmNormalizePdfResources(__pmGetPdfStyleConfig().resources);
}

function __pmGetPdfBasePageCount(docType = currentPreviewOrder?.docType || 'quote') {
    return String(docType || 'quote').toLowerCase() === 'order' ? 1 : 2;
}

function __pmResolvePdfNotePlacement(style, docType = currentPreviewOrder?.docType || 'quote') {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    const basePages = __pmGetPdfBasePageCount(docType);
    let extraPages = Math.max(0, __pmClampStyleNumber(cfg.extraPages, 0, 6, 0));
    if (extraPages === 0) extraPages = 1;
    let page = basePages + extraPages;
    const resources = __pmNormalizePdfResources(cfg.resources);
    const noteResources = resources
        .filter((resource) => resource.isUserNote === true && Number(resource.page || 1) === page)
        .sort((a, b) => (a.y + a.h) - (b.y + b.h));
    let y = noteResources.length ? (noteResources[noteResources.length - 1].y + noteResources[noteResources.length - 1].h + 22) : 140;
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
    if (y > pageBaseHeight - 220 && extraPages < 6) {
        extraPages += 1;
        page = basePages + extraPages;
        y = 140;
    }
    return { page, extraPages, y };
}

function __pmBuildPdfNoteResource(noteText, authorName, style) {
    const placement = __pmResolvePdfNotePlacement(style);
    return {
        id: `pmnote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: 'text',
        enabled: true,
        page: placement.page,
        x: 72,
        y: placement.y,
        w: 320,
        h: 110,
        text: `NOTA\n${String(noteText || '').trim()}\n\nAgregado por: ${authorName}`,
        fontFamilyKey: '',
        fontSize: 13,
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        color: '#7c2d12',
        bgColor: '#fef3c7',
        angle: 0,
        isUserNote: true,
        noteAuthor: authorName,
        __extraPages: placement.extraPages
    };
}

function __pmOpenPdfNoteModal() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
}

window.submitPdfNoteFromModal = async function() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
};

function __pmRenderFontFamilyOptions(selectedKey) {
    const selected = String(selectedKey || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey).toLowerCase();
    return Object.entries(__PM_PDF_STYLE_FONT_LABELS)
        .map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function __pmRenderBaseTextBlocksEditorList(cfg) {
    return __PM_PDF_BASE_TEXT_BLOCKS.map((block) => {
        const selectedClass = block.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-700';
        const canEdit = __pmCanEditPdfBaseBlock(block.key);
        const disabledAttr = canEdit ? '' : 'disabled';
        const disabledClass = canEdit ? '' : ' opacity-60 cursor-not-allowed';
        const sizeCfg = block.sizeField ? (__PM_PDF_BASE_SIZE_LIMITS[block.sizeField] || { min: 8, max: 72 }) : null;
        const sizeValue = block.sizeField ? Number(cfg[block.sizeField] || __PM_PDF_STYLE_DEFAULTS[block.sizeField] || 12) : null;
        const alignValue = String(cfg[block.alignField] || 'left');
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-900/70 space-y-1">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-base-action="select" data-base-id="${block.id}" class="text-[10px] font-bold uppercase text-gray-100">${block.label}</button>
                    <span class="text-[9px] uppercase text-gray-400">Base</span>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400">Fuente
                        <select data-base-id="${block.id}" data-base-field="fontFamilyKey" ${disabledAttr} class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                            ${__pmRenderFontFamilyOptions(cfg.fontFamilyKey)}
                        </select>
                    </label>
                    <label class="text-[9px] text-gray-400">Alineación
                        <select data-base-id="${block.id}" data-base-field="${block.alignField}" ${disabledAttr} class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                            <option value="left" ${alignValue === 'left' ? 'selected' : ''}>Izquierda</option>
                            <option value="center" ${alignValue === 'center' ? 'selected' : ''}>Centro</option>
                            <option value="right" ${alignValue === 'right' ? 'selected' : ''}>Derecha</option>
                            <option value="justify" ${alignValue === 'justify' ? 'selected' : ''}>Justificado</option>
                        </select>
                    </label>
                    ${sizeCfg ? `<label class="text-[9px] text-gray-400">Tamaño
                        <input data-base-id="${block.id}" data-base-field="${block.sizeField}" ${disabledAttr} type="number" min="${sizeCfg.min}" max="${sizeCfg.max}" value="${sizeValue}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                    </label>` : `<div class="text-[9px] text-gray-500 flex items-end">Sin tamaño dedicado</div>`}
                    <div class="text-[9px] text-gray-500 flex items-end">${canEdit ? 'Click sobre el PDF para seleccionar' : 'Solo posición (drag & drop / doble click)'}</div>
                </div>
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
    document.querySelectorAll('#pdf-content [data-base-resource].pm-pdf-base-selected').forEach((node) => node.classList.remove('pm-pdf-base-selected'));
    document.querySelectorAll('#pdf-content .pm-pdf-resource.pm-pdf-edit-selected').forEach((node) => node.classList.remove('pm-pdf-edit-selected'));
    if (!__pmIsAdminProfile()) return;
    const selected = String(__pmPdfResourceEditorSelectedId || '');
    if (selected.startsWith('base:')) {
        const key = selected.slice(5);
        document.querySelectorAll(`#pdf-content [data-base-resource="${key}"]`).forEach((node) => node.classList.add('pm-pdf-base-selected'));
        return;
    }
    if (!selected) return;
    document.querySelectorAll(`#pdf-content .pm-pdf-resource[data-res-id="${selected}"]`).forEach((node) => node.classList.add('pm-pdf-edit-selected'));
}

function __pmAddPdfResource(type) {
    const resources = __pmGetPdfResourcesFromState();
    const normalizedType = String(type || '').toLowerCase() === 'sign-line' ? 'sign' : String(type || '').toLowerCase();
    const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
    const isSign = safeType === 'sign' || safeType === 'sign-block';
    const newId = `pmres_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    resources.push({
        id: newId,
        type: safeType,
        enabled: true,
        page: 1,
        x: 80,
        y: 120,
        w: safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : (isSign ? 220 : 260)),
        h: safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : (safeType === 'sign' ? 24 : (safeType === 'sign-block' ? 42 : 42))),
        text: safeType === 'title' ? 'TITULO NUEVO' : (safeType === 'text' ? 'Texto nuevo' : ''),
        fontFamilyKey: '',
        fontSize: safeType === 'title' ? 24 : 14,
        bold: true,
        italic: false,
        underline: false,
        align: 'left',
        color: '#111827',
        bgColor: safeType === 'logo' ? 'transparent' : (isSign ? '#111827' : (safeType === 'bar' ? '#d32f2f' : 'transparent')),
        angle: 0,
        signTitle: safeType === 'sign-block' ? 'QUIEN APRUEBA' : '',
        signRole: safeType === 'sign-block' ? 'SUBTITULO' : '',
        isUserNote: false,
        noteAuthor: ''
    });
    __pmPdfResourceEditorSelectedId = newId;
    __pmCommitPdfResources(resources);
    return newId;
}

function __pmRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list || !__pmIsAdminProfile()) return;
    const cfg = __pmGetPdfStyleConfig();
    const resources = __pmGetPdfResourcesFromState();
    const baseBlocksHtml = __pmRenderBaseTextBlocksEditorList(cfg);
    const typeLabel = (type) => ({
        bar: 'Barra',
        logo: 'Logo',
        title: 'Titulo',
        text: 'Texto',
        sign: 'Linea firma',
        'sign-line': 'Linea firma',
        'sign-block': 'Bloque firma'
    }[type] || 'Elemento');
    const resourcesHtml = resources.map((resource) => {
        const selectedClass = resource.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-600';
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const showTextColor = isTextLike || isSignBlock ? '' : 'hidden';
        const showBgColor = resource.type === 'logo' ? 'hidden' : '';
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__pmSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${typeLabel(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-red-300">Eliminar</button>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400 block">Texto
                    <textarea data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="text" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-white">${__pmSafeHtml(resource.text)}</textarea>
                </label>` : ''}
                ${isSignBlock ? `<div class="grid grid-cols-1 gap-1">
                    <label class="text-[9px] text-gray-400">Titulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="signTitle" type="text" value="${__pmSafeHtml(resource.signTitle)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                    <label class="text-[9px] text-gray-400">Subtitulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="signRole" type="text" value="${__pmSafeHtml(resource.signRole)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                </div>` : ''}
                <div class="grid grid-cols-3 gap-1">
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
                    <label class="text-[9px] text-gray-400 ${isTextLike || isSignBlock ? '' : 'hidden'}">Fuente
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Angulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="angle" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400 ${showTextColor}">Color Texto
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="color" type="color" value="${resource.color}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400 ${showBgColor}">Color Fondo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${resource.bgColor}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400">Alineacion
                    <select data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="align" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        <option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option>
                        <option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option>
                        <option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option>
                        <option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option>
                    </select>
                </label>` : ''}
                <label class="text-[9px] text-gray-400 mt-1 flex items-center gap-1 cursor-pointer">
                    <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="enabled" type="checkbox" ${resource.enabled ? 'checked' : ''} class="w-3 h-3 text-brand-red bg-gray-900 border-gray-700 rounded focus:ring-brand-red">
                    <span>Habilitado</span>
                </label>
            </div>
        `;
    }).join('');
    const customEmpty = !resources.length ? '<p class="text-[10px] text-gray-400">Sin recursos personalizados. Usa el boton de Anadir recurso o el boton de Notas.</p>' : '';
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
    const trigger = event.target.closest('[data-res-action], [data-res-field], [data-base-action], [data-base-field]');
    if (!trigger) return;
    const baseId = String(trigger.dataset.baseId || '');
    const baseAction = String(trigger.dataset.baseAction || '');
    const baseField = String(trigger.dataset.baseField || '');
    if (baseAction === 'select' && baseId.startsWith('base:')) {
        __pmPdfResourceEditorSelectedId = baseId;
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }
    if (baseField && baseId.startsWith('base:')) {
        const baseKey = baseId.slice(5).split('__')[0].trim();
        if (!__pmCanEditPdfBaseBlock(baseKey)) {
            __pmPdfResourceEditorSelectedId = baseId;
            __pmHighlightSelectedBaseTextBlock();
            return;
        }
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
    const selected = resources[idx];
    const canMove = __pmCanMovePdfResource(selected);
    const canEdit = __pmCanEditPdfResource(selected);
    if (['page', 'x', 'y', 'w', 'h', 'angle', 'enabled'].includes(field) && !canMove) return;
    if (['text', 'signTitle', 'signRole', 'fontSize', 'align', 'bold', 'italic', 'underline', 'color', 'bgColor'].includes(field) && !canEdit) return;
    let nextValue = trigger.type === 'checkbox' ? !!trigger.checked : trigger.value;
    if (['page', 'x', 'y', 'w', 'h', 'fontSize', 'angle'].includes(field)) nextValue = parseInt(nextValue, 10);
    if (field === 'color' || field === 'bgColor') nextValue = __pmNormalizeHexColor(nextValue, resources[idx][field]);
    resources[idx] = { ...resources[idx], [field]: nextValue };
    __pmPdfResourceEditorSelectedId = id;
    const isContinuousInput = event.type === 'input'
        && (
            trigger instanceof HTMLTextAreaElement
            || (trigger instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(trigger.type || '').toLowerCase()))
        );
    __pmCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: isContinuousInput
    });
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
    if (document.body.dataset.pmPdfResourceButtonsBound !== '1') {
        document.body.dataset.pmPdfResourceButtonsBound = '1';
        document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => { __pmAddPdfResource('bar'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => { __pmAddPdfResource('logo'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-title')?.addEventListener('click', () => { __pmAddPdfResource('title'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-text')?.addEventListener('click', () => { __pmAddPdfResource('text'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-line')?.addEventListener('click', () => { __pmAddPdfResource('sign'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-block')?.addEventListener('click', () => { __pmAddPdfResource('sign-block'); window.closeModal('pdf-resource-modal'); });
    }
    __pmRenderPdfResourcesEditorList();
}

function __pmBindPdfResourceDrag() {
    if (document.body.dataset.pmPdfResourceDragBound === '1') return;
    document.body.dataset.pmPdfResourceDragBound = '1';
    document.addEventListener('pointerdown', (event) => {
        if (!__pmIsAdminProfile() || __pmPdfEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('#pm-pdf-inspector')) return;
        const resourceNode = target.closest('#pdf-content .pm-pdf-resource[data-res-id]');
        if (resourceNode) {
            const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
            const page = parseInt(resourceNode.getAttribute('data-res-page') || '1', 10);
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === resourceId);
            if (idx < 0) return;
            if (!__pmCanMovePdfResource(resources[idx])) return;
            const mode = 'move';
            __pmPdfResourceEditorSelectedId = resourceId;
            __pmPdfResourcePointerState = {
                kind: 'resource',
                id: resourceId,
                page,
                mode,
                startX: event.clientX,
                startY: event.clientY,
                origin: { ...resources[idx] }
            };
            __pmRenderPdfResourcesEditorList();
            event.preventDefault();
            return;
        }
        const baseNode = target.closest('#pdf-content [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!baseKey || !__pmGetPdfBaseBlockMeta(baseKey)) return;
        if (!__pmCanMovePdfBaseBlock(baseKey)) return;
        const instanceKey = String(baseNode.dataset.baseInstance || baseKey).trim();
        const cfg = __pmGetPdfStyleConfig();
        const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
        const origin = layouts[instanceKey] || layouts[baseKey] || __pmNormalizePdfBaseLayout();
        __pmPdfResourceEditorSelectedId = `base:${baseKey}`;
        __pmPdfResourcePointerState = {
            kind: 'base',
            key: baseKey,
            instanceKey,
            mode: 'move',
            startX: event.clientX,
            startY: event.clientY,
            origin: { ...origin },
            current: { ...origin }
        };
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        const dx = Math.round(event.clientX - state.startX);
        const dy = Math.round(event.clientY - state.startY);
        if (state.kind === 'resource') {
            const node = document.querySelector(`#pdf-content .pm-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
            if (!node) return;
            if (state.mode === 'resize') {
                node.style.width = `${Math.max(16, state.origin.w + dx)}px`;
                node.style.height = `${Math.max(1, state.origin.h + dy)}px`;
            } else {
                node.style.left = `${state.origin.x + dx}px`;
                node.style.top = `${state.origin.y + dy}px`;
            }
            return;
        }
        const node = document.querySelector(`#pdf-content [data-base-resource="${state.key}"][data-base-instance="${state.instanceKey}"]`);
        if (!node) return;
        if (state.mode === 'scale') {
            const delta = Math.round((event.clientX - state.startX) * 0.35);
            const next = __pmNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + delta });
            state.current = next;
            node.style.transform = __pmBuildPdfBaseTransform(next);
        } else {
            const next = __pmNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
            state.current = next;
            node.style.transform = __pmBuildPdfBaseTransform(next);
        }
        event.preventDefault();
    });
    document.addEventListener('pointerup', () => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        if (state.kind === 'resource') {
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id);
            if (idx >= 0) {
                const node = document.querySelector(`#pdf-content .pm-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
                if (node) {
                    if (state.mode === 'resize') {
                        resources[idx].w = __pmClampStyleNumber(parseInt(node.style.width, 10), 16, 4000, resources[idx].w);
                        resources[idx].h = __pmClampStyleNumber(parseInt(node.style.height, 10), 1, 5000, resources[idx].h);
                    } else {
                        resources[idx].x = __pmClampStyleNumber(parseInt(node.style.left, 10), -4000, 4000, resources[idx].x);
                        resources[idx].y = __pmClampStyleNumber(parseInt(node.style.top, 10), -5000, 5000, resources[idx].y);
                    }
                    __pmCommitPdfResources(resources, { refreshPreview: false });
                }
            }
        } else if (state.kind === 'base') {
            __pmCommitPdfBaseLayout(state.instanceKey, state.current || state.origin);
        }
        __pmPdfResourcePointerState = null;
    });
}

function __pmApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap) return;
    editorWrap.classList.add('hidden');
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
    __pmPdfStyleUiState = __pmLoadPdfStyleUiState();
    __pmWritePdfStyleControls(__pmGetPdfStyleConfig());
    __pmApplyPdfStyleEditorUiState();
    __pmBindPdfResourceEditor();
    __pmBindPdfResourceDrag();
    __pmEnsurePdfEditingChrome();
    editorWrap.classList.add('hidden');
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
    const pdfStyleTag = `<style>.pm-pdf-root{font-family:var(--pm-font-family)!important;}.pm-pdf-root .pm-pdf-shift{transform:translate(var(--pm-offset-x),var(--pm-offset-y));position:relative;}.pm-pdf-root .pm-pdf-header{border-bottom-width:var(--pm-header-line)!important;justify-content:var(--pm-header-justify)!important;}.pm-pdf-root .pm-pdf-header>div:last-child{text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-title{font-size:var(--pm-title-size)!important;line-height:1.05!important;text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-folio{font-size:var(--pm-meta-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-date{font-size:var(--pm-date-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-table-head th{font-size:var(--pm-table-head-size)!important;}.pm-pdf-root .pm-pdf-table-body td,.pm-pdf-root .pm-pdf-table-body p,.pm-pdf-root .pm-pdf-table-body span{font-size:var(--pm-table-body-size)!important;line-height:var(--pm-line-height)!important;}.pm-pdf-root .pm-pdf-table-body td:first-child,.pm-pdf-root .pm-pdf-table-body td:first-child *{text-align:var(--pm-table-align)!important;}.pm-pdf-root .pm-pdf-summary,.pm-pdf-root .pm-pdf-summary *{text-align:var(--pm-summary-align)!important;}.pm-pdf-root .pm-pdf-quick,.pm-pdf-root .pm-pdf-quick *{font-size:var(--pm-quick-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-quick-align)!important;}.pm-pdf-root .pm-pdf-general-conditions,.pm-pdf-root .pm-pdf-general-conditions *{font-size:var(--pm-conditions-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-conditions-align)!important;}.pm-pdf-root .pm-pdf-sign,.pm-pdf-root .pm-pdf-sign *{font-size:var(--pm-sign-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-sign-align)!important;}.pm-pdf-root .pm-pdf-footer-text{font-size:var(--pm-footer-size)!important;text-align:var(--pm-footer-align)!important;}.pm-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.pm-pdf-root .pm-pdf-resource,.pm-pdf-root .pm-pdf-editable{cursor:default;box-sizing:border-box;outline:none;outline-offset:2px;}.pm-pdf-root .pm-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 2px #fff;opacity:0;}.pm-pdf-root .pm-pdf-base-selected,.pm-pdf-root .pm-pdf-edit-selected{outline:none;outline-offset:2px;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable{cursor:move;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable{outline:1px dashed rgba(239,68,68,.45);}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::after{opacity:.9;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-base-selected,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected{outline:2px solid #ef4444;}.pm-pdf-delete-btn{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;font-size:11px;z-index:80;box-shadow:0 0 0 2px #fff;pointer-events:auto;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected .pm-pdf-delete-btn{display:flex;}.pm-pdf-delete-btn:hover{background:#dc2626;transform:scale(1.08);transition:all .2s;}</style>`;
    const pdfTableFitTag = `<style>.pm-pdf-root .pm-pdf-table-head th{font-size:var(--pm-fit-head-size,var(--pm-table-head-size))!important;padding-top:var(--pm-fit-cell-py,.5rem)!important;padding-bottom:var(--pm-fit-cell-py,.5rem)!important;padding-left:var(--pm-fit-cell-px,.75rem)!important;padding-right:var(--pm-fit-cell-px,.75rem)!important;}.pm-pdf-root .pm-pdf-table-body td,.pm-pdf-root .pm-pdf-table-body p,.pm-pdf-root .pm-pdf-table-body span{font-size:var(--pm-fit-body-size,var(--pm-table-body-size))!important;line-height:var(--pm-fit-line-height,var(--pm-line-height))!important;}.pm-pdf-root .pm-pdf-table-body td{padding-top:var(--pm-fit-cell-py,.5rem)!important;padding-bottom:var(--pm-fit-cell-py,.5rem)!important;padding-left:var(--pm-fit-cell-px,.75rem)!important;padding-right:var(--pm-fit-cell-px,.75rem)!important;}</style>`;

    const now = new Date(); const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); const genDateTime = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }); let docTitle = isOrder ? "ORDEN DE COMPRA" : "COTIZACIÓN"; 
    
    let folio = o.numero_orden || o.id.split('-')[0].toUpperCase(); 
    
    const space = allSpaces.find(s=>s.id==o.espacio_id); const basePrice = parseFloat(space ? space.precio_base : 0); 
    const descHTML = isOrder ? '' : `<p class="text-[9px] text-gray-500 italic mt-0.5 truncate max-w-xs">${space?.descripcion || ''}</p>`; 
    const footerHubHTML = `<div class="w-full text-center mt-10"><p class="pm-pdf-footer-text text-[10px] text-gray-400 font-medium leading-tight" data-base-resource="footer">Generado el ${genDateTime}<br>a través de Marketing Hub - Plaza Mayor</p></div>`; 
    const renderHeader = (title) => `<div class="pm-pdf-header flex justify-end items-start border-b-4 border-brand-red pb-3 mb-2">${logoImg}<div class="text-right"><h1 class="pm-pdf-title text-2xl font-black text-gray-800 tracking-tighter uppercase" data-base-resource="header-title">${title}</h1><p class="pm-pdf-folio text-sm font-mono text-brand-red font-bold mt-1" data-base-resource="header-meta">FOLIO: ${folio}</p><p class="pm-pdf-date text-[10px] text-gray-500 mt-1" data-base-resource="header-meta">${dateStr}</p></div></div>`; 
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
        ? `<div class="pm-pdf-summary flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><div class="w-1/2 border-r border-gray-200 pr-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div><div class="w-1/2 pl-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Contacto / Fiscal</p><p class="font-mono text-xs text-gray-700 truncate">${o.cliente_email || 'Sin correo'}</p>${clientRfc ? `<p class="font-mono text-xs text-gray-700 mt-0.5">RFC: <strong>${clientRfc}</strong></p>` : ''}</div></div>`
        : `<div class="pm-pdf-summary mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div>`;
    
    let detailSpaces = [];
    if (Array.isArray(o.espacios_detalle)) detailSpaces = o.espacios_detalle;
    else if (typeof o.espacios_detalle === 'string') { try { detailSpaces = JSON.parse(o.espacios_detalle); } catch(e){} }
    detailSpaces = Array.isArray(detailSpaces) ? detailSpaces.filter(Boolean) : [];
    // Resuelve personas por concepto usando (1) el propio concepto, (2) el espacio ligado o (3) el fallback global.
    const __pmParsePeople = (value) => {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const __pmGlobalPeople = __pmParsePeople(o?.personas);
    const __pmPeopleBySpace = {};
    detailSpaces.forEach((sp) => {
        const sid = String(sp?.espacio_id || sp?.space_id || '').trim();
        const people = __pmParsePeople(sp?.personas ?? sp?.guests ?? sp?.people);
        if (sid && people > 0) __pmPeopleBySpace[sid] = people;
    });
    const __pmResolveConceptPeople = (concept) => {
        const meta = concept && typeof concept.meta === 'object' ? concept.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '').trim();
        const direct = __pmParsePeople(concept?.personas ?? concept?.guests ?? meta.personas ?? meta.guests);
        if (direct > 0) return direct;
        if (sid && __pmPeopleBySpace[sid] > 0) return __pmPeopleBySpace[sid];
        return __pmGlobalPeople;
    };

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
        const meta = c && typeof c.meta === 'object' ? c.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '');
        const spName = sid ? (detailSpaces.find(sp => String(sp.espacio_id || sp.space_id || '') === sid)?.espacio_nombre || '') : '';
        const conceptPeople = __pmResolveConceptPeople(c);
        const peopleSuffix = conceptPeople > 0 ? ` (${conceptPeople} persona${conceptPeople === 1 ? '' : 's'})` : '';
        const label = `${spName ? `${spName} - ` : ''}${c.description || c.nombre || 'Adicional'}${peopleSuffix}`;
        rowsHtml += `<tr><td class="py-2 px-3 text-[13px] font-medium text-gray-600 break-words leading-snug">${label}</td><td class="py-2 px-3"></td><td class="py-2 px-3 text-right text-[13px] font-medium text-gray-600">${sign} ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(amount)}</td></tr>`; 
    }); 
    
    if(o.tipo_ajuste && o.tipo_ajuste !== 'ninguno') { let val = parseFloat(o.valor_ajuste); let displayAmount = val; if (o.ajuste_es_porcentaje) { displayAmount = runningSubtotal * (val / 100); } const sign = o.tipo_ajuste === 'descuento' ? '-' : '+'; if(o.tipo_ajuste==='descuento') runningSubtotal -= displayAmount; else runningSubtotal += displayAmount; rowsHtml += `<tr class="bg-gray-50"><td class="py-2 px-3 italic text-[12px] text-gray-500">Ajuste Global</td><td></td><td class="py-2 px-3 text-right font-bold text-[12px] text-gray-600">${sign} ${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(displayAmount)}</td></tr>`; } 
    const __pmTableRows = (String(rowsHtml).match(/<tr\b/gi) || []).length;
    const __pmTableChars = String(rowsHtml).replace(/<[^>]+>/g, '').length;
    let __pmDensityLevel = 0;
    if (__pmTableRows > 16 || __pmTableChars > 2300) __pmDensityLevel = 1;
    if (__pmTableRows > 24 || __pmTableChars > 3200) __pmDensityLevel = 2;
    if (__pmTableRows > 32 || __pmTableChars > 4200) __pmDensityLevel = 3;
    const __pmFitBodyPx = Math.max(8, (parseInt(pdfStyle.tableBodyPx, 10) || 12) - __pmDensityLevel);
    const __pmFitHeadPx = Math.max(9, (parseInt(pdfStyle.tableHeadPx, 10) || (__pmFitBodyPx + 2)) - (__pmDensityLevel >= 2 ? 2 : __pmDensityLevel));
    const __pmFitCellPy = __pmDensityLevel >= 3 ? 2 : (__pmDensityLevel >= 2 ? 3 : (__pmDensityLevel === 1 ? 4 : 8));
    const __pmFitCellPx = __pmDensityLevel >= 2 ? 6 : 12;
    const __pmFitLineHeight = __pmDensityLevel >= 3 ? '105%' : (__pmDensityLevel >= 2 ? '112%' : '120%');
    const __pmTableFitInline = `--pm-fit-head-size:${__pmFitHeadPx}px;--pm-fit-body-size:${__pmFitBodyPx}px;--pm-fit-cell-py:${__pmFitCellPy}px;--pm-fit-cell-px:${__pmFitCellPx}px;--pm-fit-line-height:${__pmFitLineHeight};`;
    const __pmQuickMarginClass = __pmDensityLevel >= 2 ? 'mb-8' : (__pmDensityLevel === 1 ? 'mb-12' : 'mb-20');
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
    const totalsBlock = `<div class="pm-pdf-summary flex justify-end mb-2 pr-4" data-base-resource="summary"><div class="w-64"><table class="w-full border-collapse">${taxRows}<tr><td class="pt-2 border-t-2 border-gray-800 align-middle text-right" colspan="2"><span class="text-[10px] font-bold uppercase text-gray-500 mr-2">Total Neto</span></td><td class="pt-2 border-t-2 border-gray-800 align-middle text-right"><span class="text-xl font-black text-gray-900">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(o.precio_final)}</span></td></tr></table></div></div>`; 
    
    const quoteApproverTitle = __pmResolvePdfTemplateString(pdfContent.quoteApproverTitle || 'QUIEN APRUEBA', { CLIENT_NAME: clientName });
    const quoteApproverSubtitle = __pmResolvePdfTemplateString(pdfContent.quoteApproverSubtitle || 'Plaza Mayor', { CLIENT_NAME: clientName });
    const quoteClientTitle = __pmResolvePdfTemplateString(pdfContent.quoteClientTitle || '{{CLIENT_NAME}}', { CLIENT_NAME: clientName }).slice(0, 40);
    const quoteClientSubtitle = __pmResolvePdfTemplateString(pdfContent.quoteClientSubtitle || 'Cliente / Representante', { CLIENT_NAME: clientName });
    const orderApproverTitle = __pmResolvePdfTemplateString(pdfContent.orderApproverTitle || 'QUIEN APRUEBA', { CLIENT_NAME: clientName });
    const orderApproverSubtitle = __pmResolvePdfTemplateString(pdfContent.orderApproverSubtitle || 'Plaza Mayor', { CLIENT_NAME: clientName });

    let signBlock = '';
    if (isOrder) {
        signBlock = `<div class="flex justify-center w-full"><div class="text-center w-64"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark">${__pmSafeHtml(orderApproverTitle)}</p><p class="text-[10px] text-gray-500 uppercase">${__pmSafeHtml(orderApproverSubtitle)}</p></div></div>`;
    } else {
        signBlock = `<div class="text-center w-56"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark">${__pmSafeHtml(quoteApproverTitle)}</p><p class="text-[10px] text-gray-500 uppercase">${__pmSafeHtml(quoteApproverSubtitle)}</p></div><div class="text-center w-56"><div class="border-b border-black mb-1"></div><p class="font-bold text-xs text-brand-dark uppercase">${__pmSafeHtml(quoteClientTitle)}</p><p class="text-[10px] text-gray-500 uppercase">${__pmSafeHtml(quoteClientSubtitle)}</p></div>`;
    }
    
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
const page1Raw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight, 'display:flex;flex-direction:column;justify-content:space-between;')}"><div>${renderHeader(docTitle)}${clientComponent}${isOrder ? `<div class="mb-2 bg-gray-100 p-2 rounded text-base flex justify-between"><span>Folio de Servicio: <strong class="font-black text-lg">${folio}</strong></span><span>Contrato: <strong class="font-black text-lg">${o.numero_contrato||'---'}</strong></span></div>` : ''}<table class="w-full text-left mb-2 mt-3 table-fixed border-separate border-spacing-0"><colgroup><col style="width:64%;"><col style="width:16%;"><col style="width:20%;"></colgroup><thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead><tbody class="pm-pdf-table-body divide-y divide-gray-50 text-[12px]" data-base-resource="table-body">${rowsHtml}</tbody></table> ${totalsBlock}</div><div class="pb-2">${!isOrder ? `<div class="pm-pdf-quick grid grid-cols-2 gap-4 ${__pmQuickMarginClass} pt-4 border-t border-gray-100" data-base-resource="quick"><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickLeftTitle || 'Condiciones:')}</h4><ul class="list-none text-xs text-gray-600 space-y-0.5 leading-tight">${quickLeftItemsHtml}</ul></div><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickRightTitle || 'Vigencia:')}</h4><p class="text-xs text-gray-600">${__pmSafeHtml(pdfContent.quickRightBody || '')}</p></div></div>` : ''}<div class="pm-pdf-sign flex justify-between items-start px-2" data-base-resource="sign">${signBlock}</div>${footerHubHTML}</div></div>${__pmRenderPdfResources(pdfStyle, 1)}</div>`;
    const pages = [
        __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(page1Raw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })
    ];
    if (!isOrder) { 
const page2Raw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight)}">${renderHeader(__pmSafeHtml(pdfContent.conditionsTitle || 'CONDICIONES GENERALES'))}<ol class="pm-pdf-general-conditions list-decimal list-outside ml-6 text-[14px] text-gray-800 space-y-2 text-justify leading-tight mt-5" data-base-resource="conditions">${conditionsItemsHtml}</ol></div>${__pmRenderPdfResources(pdfStyle, 2)}</div>`;
        pages.push(__pmWrapLetterheadPage(page2Raw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
    } 
    const extraPages = __pmClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
    if (extraPages < 0 && pages.length > 1) {
        const keepCount = Math.max(1, pages.length + extraPages);
        pages.length = keepCount;
    } else if (extraPages > 0) {
        for (let i = 0; i < extraPages; i += 1) {
const extraRaw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight)}">${renderHeader(`ANEXO ${i + 1}`)}<div class="pm-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4" data-base-resource="conditions"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__pmSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__pmSafeHtml(pdfContent.annexHintBody || '')}</p></div>${footerHubHTML}</div>${__pmRenderPdfResources(pdfStyle, (isOrder ? 2 : 3) + i)}</div>`;
            pages.push(__pmWrapLetterheadPage(extraRaw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
        }
    }
    const raw = `<div class="pm-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;${pdfStyleInlineVars}${__pmTableFitInline}">${pdfStyleTag}${pdfTableFitTag}${pages.join('')}</div>`;
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
    if (typeof __pmStripPdfEditingChrome === "function") __pmStripPdfEditingChrome(target);
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
    const statusField = document.getElementById("oed-status");
    if (statusField) statusField.value = "aprobada";
    applyStatusVisual();
    const newStatus = "aprobada";
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
      const saveOrderId = String(document.getElementById("oed-id")?.value || currentPreviewOrder?.id || "").trim();
      if (!saveOrderId) throw new Error("Cotización inválida.");
      if (!formData.numero_orden) formData.numero_orden = currentPreviewOrder?.numero_orden || saveOrderId.split("-")[0].toUpperCase();
      const approvalSnapshotMeta = approvalTransition ? __pmBuildApprovalSnapshotMeta(saveOrderId, formData) : null;
      if (approvalSnapshotMeta?.path) formData.url_cotizacion_final = approvalSnapshotMeta.path;
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
      const { error } = await __pmQuotesUpdate(saveOrderId, formData);
      if (error) throw error;
      currentPreviewOrder = { ...currentPreviewOrder, ...formData };
      signalOrdersRefresh(nextStatus === "aprobada" ? "approved_saved" : "saved");
      if (approvalTransition) {
        await __pmEnsurePdfStyleProfile('quote', { forceReload: !__pmIsAdminProfile() });
        const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, "quote");
        const pdfContainer = document.getElementById("pdf-content");
        const embedViewer = document.getElementById("doc-preview");
        const btnDownload = document.getElementById("btn-download-preview");
        pdfContainer.innerHTML = content;
        __pmApplyPdfStyleToLivePreview();
        pdfContainer.classList.remove("hidden");
        embedViewer.classList.add("hidden");
        window.openModal("preview-modal");

        if (__pmIsAdminProfile()) {
          await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
        }

        const pdfBlob = (typeof window.generatePdfBlobFromNode === "function")
          ? await window.generatePdfBlobFromNode(pdfContainer)
          : await renderPdfBlobFallback(pdfContainer);
        const { path, folio } = await __pmUploadApprovalSnapshotBlob(saveOrderId, pdfBlob, formData, {
          persistQuote: false,
          path: approvalSnapshotMeta?.path,
          folio: approvalSnapshotMeta?.folio
        });
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
      __pmClearOrderDetailDirty();
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
      if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
        await __pmEnsurePdfStyleProfile("quote", { forceReload: true });
        element.innerHTML = await window.getOrderHTML({ ...currentPreviewOrder, ...formData, status: "aprobada" }, "quote");
        __pmApplyPdfStyleToLivePreview();
      }
      if (__pmIsAdminProfile()) {
        await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
      }
      const pdfBlob = (typeof window.generatePdfBlobFromNode === "function")
        ? await window.generatePdfBlobFromNode(element)
        : await renderPdfBlobFallback(element);
      const snapshotMeta = __pmBuildApprovalSnapshotMeta(currentPreviewOrder.id, formData);
      const { path, folio } = await __pmUploadApprovalSnapshotBlob(currentPreviewOrder.id, pdfBlob, formData, {
        persistQuote: false,
        path: snapshotMeta.path,
        folio: snapshotMeta.folio
      });
      const payload = { ...formData, status: "aprobada", url_cotizacion_final: path };
      const { error: dbErr } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
      if (dbErr) throw dbErr;
      currentPreviewOrder = { ...currentPreviewOrder, ...payload };
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
    const requestedClientId = String(order.cliente_id || "").trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) {
      await loadClientProfilesForOrderModal();
    }
    const selectedProfileId = __pmApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
      const profile = orderClientProfilesById[selectedProfileId];
      if (profile) {
        document.getElementById("oed-client").value = profile.nombre_completo || (order.cliente_nombre || "");
        document.getElementById("oed-phone").value = (profile.telefono || order.cliente_contacto || "");
        document.getElementById("oed-email").value = (profile.correo || order.cliente_email || "");
        document.getElementById("fiscal-rfc-re").value = (profile.rfc || order.cliente_rfc || "");
      }
    }

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
    __pmClearOrderDetailDirty();
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
