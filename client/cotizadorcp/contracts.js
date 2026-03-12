/**
 * DOC: client\cotizadorcp\contracts.js
 * Proposito: Gestion de contratos vinculados a cotizaciones aprobadas.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE CONTRATOS - (FINAL: CORRECCIÓN DE CARGA Y ERRORES)
// =========================================================================

// --- 0. FUNCIONES GLOBALES ---
window.safeFormatDate = function(dateStr) { 
    if (!dateStr) return '--'; 
    const parts = dateStr.split('-'); 
    if (parts.length !== 3) return dateStr; 
    return `${parts[2]}/${parts[1]}/${parts[0]}`; 
};

window.formatDate = function(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    if(isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit', year:'numeric'});
};

window.formatMoney = function(v){ 
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); 
};

window.showToast = function(msg, type='success') { 
    const c = document.getElementById('toast-container'); 
    if(!c) return;
    const e = document.createElement('div'); 
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`; 
    e.innerText = msg; 
    c.appendChild(e); 
    setTimeout(() => e.remove(), 3000); 
};

window.openModal = function(id) { 
    const el = document.getElementById(id);
    if(el) { el.classList.remove('hidden'); el.classList.add('flex'); }
};

window.closeModal = function(id) { 
    const el = document.getElementById(id);
    if(el) { el.classList.add('hidden'); el.classList.remove('flex'); }
};

let confirmCallback = null;
window.openCustomConfirm = function(msg, callback) {
    const titleEl = document.getElementById('confirm-title');
    if(titleEl) titleEl.innerText = msg;
    confirmCallback = callback;
    window.openModal('generic-confirm-modal');
};

// --- LOGICA DE TABS SINCRONIZADA ---
window.switchTab = function(tab) { 
    const styleEditor = document.getElementById('pdf-style-editor');
    if(tab === 'receipt') { 
        document.getElementById('tab-btn-receipt').classList.add('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-receipt').classList.remove('border-transparent','text-gray-500'); 
        document.getElementById('tab-btn-contract').classList.remove('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-contract').classList.add('border-transparent','text-gray-500'); 
        
        document.getElementById('view-receipt').classList.remove('hidden');
        document.getElementById('view-contract').classList.add('hidden');
        
        document.getElementById('sidebar-receipt').classList.remove('hidden');
        document.getElementById('sidebar-receipt').classList.add('flex');
        document.getElementById('sidebar-contract').classList.add('hidden');
        document.getElementById('sidebar-contract').classList.remove('flex');
        if (styleEditor && __contractsIsAdminProfile()) styleEditor.classList.remove('hidden');
        
        setTimeout(window.adjustPreviewScale, 50);
        
    } else { 
        document.getElementById('tab-btn-contract').classList.add('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-contract').classList.remove('border-transparent','text-gray-500'); 
        document.getElementById('tab-btn-receipt').classList.remove('active-tab','border-brand-red','text-brand-red'); 
        document.getElementById('tab-btn-receipt').classList.add('border-transparent','text-gray-500'); 
        
        document.getElementById('view-contract').classList.remove('hidden');
        document.getElementById('view-receipt').classList.add('hidden');
        
        document.getElementById('sidebar-contract').classList.remove('hidden');
        document.getElementById('sidebar-contract').classList.add('flex');
        document.getElementById('sidebar-receipt').classList.add('hidden');
        document.getElementById('sidebar-receipt').classList.remove('flex');
        if (styleEditor) styleEditor.classList.add('hidden');
        
        setTimeout(window.adjustPreviewScale, 50);
    } 
};

// --- ESCALADO OPTIMIZADO ---
window.adjustPreviewScale = function() {
    const receiptVisible = !document.getElementById('view-receipt').classList.contains('hidden');
    const container = receiptVisible ? document.getElementById('receipt-preview-container') : document.getElementById('contract-preview-container');
    const box = receiptVisible ? document.getElementById('receipt-preview-box') : document.getElementById('contract-preview-box');

    if (!container || !box) return;

    // Calcular ancho disponible
    const availableWidth = container.clientWidth - 80; // Restamos padding
    const docWidth = 816; // Ancho carta fijo
    
    let scale = availableWidth / docWidth;
    
    // Límites de seguridad
    if (scale > 1.5) scale = 1.5; 
    if (scale < 0.4) scale = 0.4;
    
    box.style.transform = `scale(${scale})`;
    
    // Ajustar margen inferior para el scroll
    const docHeight = 1056; 
    const scaledHeight = docHeight * scale;
    const heightDifference = scaledHeight - docHeight;
    box.style.marginBottom = `${heightDifference + 50}px`;
};

// --- AISLAMIENTO DE PLANTILLAS (EVITA QUE CSS DE LA PLANTILLA AFECTE LA APP) ---
function setContractPreviewSrcdoc(rawHtml) {
    const iframe = document.getElementById('contract-preview-iframe');
    if (!iframe) return;

    const baseHref = new URL('./', window.location.href).href;
    const headInject =
        `<base href="${baseHref}">` +
        `<meta charset="utf-8">` +
        `<style>
            html, body { margin:0; padding:0; background:#fff; font-family:'Segoe UI', Arial, sans-serif; }
            .var-highlight { font-weight:800; background-color:#fef08a; padding:0 2px; border-radius:2px; }
        </style>`;

    let html = rawHtml || '<p style="font-family:Segoe UI, Arial, sans-serif; padding:24px; color:#6b7280; font-weight:700;">Sin plantilla cargada.</p>';

    if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head[\s>][^>]*>/i, (m) => m + headInject);
    } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[\s>][^>]*>/i, (m) => m + `<head>${headInject}</head>`);
    } else {
        html = `<!doctype html><html><head>${headInject}</head><body>${html}</body></html>`;
    }

    iframe.srcdoc = html;
}

window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(window.adjustPreviewScale, 100);
});

window.openStoredReceipt = async function(filePath) { 
    window.showToast("Abriendo...", "info"); 
    const { data, error } = await window.globalPocketBase.storage.from('documentos-cp').createSignedUrl(filePath, 3600); 
    if (error || !data) { window.showToast("Error archivo", "error"); return; } 
    window.open(data.signedUrl, '_blank'); 
};

window.handleSignedFile = function(input) { 
    if(input.files[0]) { 
        signedFileToUpload = input.files[0]; 
        document.getElementById('lbl-signed-file').innerText = input.files[0].name; 
        document.getElementById('btn-confirm-finalize').disabled=false; 
        document.getElementById('btn-confirm-finalize').classList.remove('bg-gray-300','cursor-not-allowed'); 
        document.getElementById('btn-confirm-finalize').classList.add('bg-green-600'); 
    } 
};

// --- CONFIGURACIÓN ---
/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';

// (Opcional) Esquema finanzas configurable
const __p = window.location.pathname || '';
const __isCP = /\/cotizadorcp(\/|$)/.test(__p) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __isCP ? 'finanzas_casadepiedra' : ((window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas');
const __pLogo = (window.location.pathname || '') + ' ' + (window.location.href || '');
const __isCPLogo = /\/cotizadorcp(\/|$)/.test(window.location.pathname || '') || __pLogo.includes('cotizadorcp');
const LOGO_URL = __isCPLogo
  ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../../assets/logocp.png')
  : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../../assets/logo.png');
let CP_PDF_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.cpPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadCasaPiedraUrl)) || '../public/assets/img/cp-letterhead-default.png';
const RECEIPT_PAGE_WIDTH_PX = 816;
const RECEIPT_PAGE_HEIGHT_PX = 1056;
const LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const LETTERHEAD_MARGINS_DESIGN_PX = { top: 202.2, right: 61.1, bottom: 113.38, left: 61.1 };
const CP_CONTRACTS_CONTENT_BASE_WIDTH_PX = 816;

function __contractsCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __contractsLetterheadFrame() {
    const sx = RECEIPT_PAGE_WIDTH_PX / LETTERHEAD_DESIGN_WIDTH_PX;
    const sy = RECEIPT_PAGE_HEIGHT_PX / LETTERHEAD_DESIGN_HEIGHT_PX;
    const top = LETTERHEAD_MARGINS_DESIGN_PX.top * sy;
    const right = LETTERHEAD_MARGINS_DESIGN_PX.right * sx;
    const bottom = LETTERHEAD_MARGINS_DESIGN_PX.bottom * sy;
    const left = LETTERHEAD_MARGINS_DESIGN_PX.left * sx;
    return {
        top,
        right,
        bottom,
        left,
        width: RECEIPT_PAGE_WIDTH_PX - left - right,
        height: RECEIPT_PAGE_HEIGHT_PX - top - bottom
    };
}

function __contractsContentBaseHeightPx() {
    const frame = __contractsLetterheadFrame();
    if (!frame.width || !frame.height) return 945;
    return (CP_CONTRACTS_CONTENT_BASE_WIDTH_PX * frame.height) / frame.width;
}

function __contractsWrapLetterheadPage(innerHtml, options = {}) {
    const frame = __contractsLetterheadFrame();
    const baseWidth = Math.max(1, parseFloat(options.baseWidth) || RECEIPT_PAGE_WIDTH_PX);
    const baseHeight = Math.max(1, parseFloat(options.baseHeight) || RECEIPT_PAGE_HEIGHT_PX);
    const scale = Math.min(frame.width / baseWidth, frame.height / baseHeight);
    const finalW = baseWidth * scale;
    const finalH = baseHeight * scale;
    const left = frame.left + ((frame.width - finalW) / 2);
    const top = frame.top + ((frame.height - finalH) / 2);
    const bgUrl = __contractsCssSafeUrl(CP_PDF_LETTERHEAD_URL);
    const imageLayer = bgUrl
        ? `<img src='${bgUrl}' crossorigin='anonymous' onerror='this.style.display=\"none\"' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
    const idAttr = options.id ? ` id="${options.id}"` : '';
    return `<div${idAttr} class="bg-white font-sans text-gray-800 relative leading-relaxed" style="width:${RECEIPT_PAGE_WIDTH_PX}px;min-height:${RECEIPT_PAGE_HEIGHT_PX}px;height:${RECEIPT_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:hidden;background:#f5f5f5;">${imageLayer}<div style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:hidden;z-index:1;">${innerHtml}</div></div>`;
}
// Aislar plantillas por tenant: Casa de Piedra usa su propio bucket
const TEMPLATE_BUCKET = 'documentos-cp';
const TEMPLATE_PATH = 'templates_contratos';
const LETTERHEAD_PATH = 'membretes_pdf';
const CFG_TEMPLATE_DEFAULT_KEY = 'contract_template_default';
const CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';

const AVAILABLE_VARS = [
    { key: '{{CLIENTE}}', desc: 'Nombre del Cliente' },
    { key: '{{RFC}}', desc: 'RFC del Cliente' },
    { key: '{{TELEFONO}}', desc: 'Teléfono' },
    { key: '{{EMAIL}}', desc: 'Email' },
    { key: '{{ESPACIO}}', desc: 'Nombre del Espacio' },
    { key: '{{CLAVE}}', desc: 'Clave de Espacio' },
    { key: '{{FECHA_INICIO}}', desc: 'Fecha Inicio' },
    { key: '{{FECHA_FIN}}', desc: 'Fecha Fin' },
    { key: '{{MONTO_TOTAL}}', desc: 'Precio Final' },
    { key: '{{FECHA_HOY}}', desc: 'Fecha Actual' },
    { key: '{{NUM_ORDEN}}', desc: 'Folio Orden' },
    { key: '{{NUM_CONTRATO}}', desc: 'Folio Contrato' }
];

let approvedOrders = [], selectedOrder = null, templates = [], signedFileToUpload = null, externalReceiptFile = null;
let currentRemainingBalance = 0;
let pendingAction = null;
let defaultTemplateFile = '';

function __contractsPayments(order) {
    return Array.isArray(order?.historial_pagos) ? order.historial_pagos : [];
}

function __contractsPaymentAmount(item) {
    const amount = parseFloat(item?.amount ?? item?.monto ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

function __contractsTotalPaid(order) {
    return __contractsPayments(order).reduce((sum, item) => sum + __contractsPaymentAmount(item), 0);
}

function __contractsRemaining(order) {
    const total = parseFloat(order?.precio_final || 0) || 0;
    const paid = __contractsTotalPaid(order);
    const remaining = Math.round((total - paid) * 100) / 100;
    return remaining < 0 ? 0 : remaining;
}

function __contractsConstanciaEntry(order) {
    return __contractsPayments(order).find((item) => {
        const t = String(item?.type || item?.tipo || '').toLowerCase();
        return t === 'constancia_liquidacion' || item?.closed === true || item?.is_closure === true;
    }) || null;
}

function __contractsIsClosed(order) {
    return !!__contractsConstanciaEntry(order);
}

function __contractsIsPaidComplete(order) {
    return __contractsIsClosed(order) || __contractsRemaining(order) <= 0.1;
}

function __contractsTransparentPdfHtml(html) {
    return String(html || '')
        .replace(/\bbg-(?:white|gray-\d{2,3}|red-\d{2,3}|green-\d{2,3}|blue-\d{2,3}|amber-\d{2,3}|purple-\d{2,3}|brand-red)\b/g, '')
        .replace(/background:\s*#(?:[0-9a-f]{3,8});?/gi, 'background: transparent;')
        .replace(/background:\s*rgba?\([^)]+\);?/gi, 'background: transparent;')
        .replace(/\s{2,}/g, ' ');
}

function __contractsBoostPdfTypography(html) {
    return String(html || '')
        .replace(/\btext-\[9px\]\b/g, '__CPC_TXT_9__')
        .replace(/\btext-\[10px\]\b/g, '__CPC_TXT_10__')
        .replace(/\btext-\[11px\]\b/g, '__CPC_TXT_11__')
        .replace(/\btext-xs\b/g, '__CPC_TXT_XS__')
        .replace(/\btext-sm\b/g, '__CPC_TXT_SM__')
        .replace(/__CPC_TXT_9__/g, 'text-[10px]')
        .replace(/__CPC_TXT_10__/g, 'text-[11px]')
        .replace(/__CPC_TXT_11__/g, 'text-[12px]')
        .replace(/__CPC_TXT_XS__/g, 'text-sm')
        .replace(/__CPC_TXT_SM__/g, 'text-base');
}

const __CP_CONTRACTS_PDF_STYLE_CONFIG_KEY = 'pdf_typography_style';
const __CP_CONTRACTS_PDF_STYLE_TENANT = 'casa_de_piedra';
const __CP_CONTRACTS_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const __CP_CONTRACTS_PDF_STYLE_DEFAULTS = Object.freeze({
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
    headerAlign: 'right',
    metaAlign: 'right',
    tableAlign: 'left',
    quickAlign: 'left',
    conditionsAlign: 'justify',
    signAlign: 'center',
    summaryAlign: 'left',
    footerAlign: 'center'
});
const __CP_CONTRACTS_PDF_STYLE_UI_STATE_KEY = 'cp_contracts_pdf_style_ui';
let __contractsPdfStyleState = null;
let __contractsPdfStyleConfigRecordId = '';
let __contractsPdfStyleSyncTimer = null;
let __contractsPdfStyleUiState = { collapsed: false, pinned: false };

function __contractsClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __contractsNormalizeAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __contractsNormalizePdfStyle(raw = {}) {
    const base = { ...__CP_CONTRACTS_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    return {
        fontFamilyKey: __CP_CONTRACTS_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __contractsClampStyleNumber(base.headerLinePx, 1, 8, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.headerLinePx),
        titlePx: __contractsClampStyleNumber(base.titlePx, 20, 42, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __contractsClampStyleNumber(base.metaPx, 8, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __contractsClampStyleNumber(base.tableHeadPx, 9, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __contractsClampStyleNumber(base.tableBodyPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __contractsClampStyleNumber(base.lineHeightPct, 90, 180, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __contractsClampStyleNumber(base.quickPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __contractsClampStyleNumber(base.conditionsPx, 9, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __contractsClampStyleNumber(base.signPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __contractsClampStyleNumber(base.footerPx, 8, 14, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.footerPx),
        headerAlign: __contractsNormalizeAlign(base.headerAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.headerAlign),
        metaAlign: __contractsNormalizeAlign(base.metaAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.metaAlign),
        tableAlign: __contractsNormalizeAlign(base.tableAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableAlign),
        quickAlign: __contractsNormalizeAlign(base.quickAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.quickAlign),
        conditionsAlign: __contractsNormalizeAlign(base.conditionsAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.conditionsAlign),
        signAlign: __contractsNormalizeAlign(base.signAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.signAlign),
        summaryAlign: __contractsNormalizeAlign(base.summaryAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.summaryAlign),
        footerAlign: __contractsNormalizeAlign(base.footerAlign, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.footerAlign)
    };
}

function __contractsLoadPdfStyleState() {
    return __contractsNormalizePdfStyle();
}

function __contractsLoadPdfStyleUiState() {
    try {
        const raw = localStorage.getItem(__CP_CONTRACTS_PDF_STYLE_UI_STATE_KEY);
        if (!raw) return { collapsed: false, pinned: false };
        const parsed = JSON.parse(raw);
        return { collapsed: !!parsed?.collapsed, pinned: !!parsed?.pinned };
    } catch (_) {
        return { collapsed: false, pinned: false };
    }
}

function __contractsSavePdfStyleUiState() {
    try {
        localStorage.setItem(__CP_CONTRACTS_PDF_STYLE_UI_STATE_KEY, JSON.stringify(__contractsPdfStyleUiState));
    } catch (_) {}
}

function __contractsGetPdfStyleConfig() {
    if (!__contractsPdfStyleState) __contractsPdfStyleState = __contractsLoadPdfStyleState();
    return { ...__contractsPdfStyleState };
}

function __contractsPdfStyleVars(style) {
    const safe = __contractsNormalizePdfStyle(style);
    const headerAlign = safe.headerAlign === 'justify' ? 'left' : safe.headerAlign;
    return {
        '--cp-font-family': __CP_CONTRACTS_PDF_STYLE_FONT_MAP[safe.fontFamilyKey],
        '--cp-header-line': `${safe.headerLinePx}px`,
        '--cp-title-size': `${safe.titlePx}px`,
        '--cp-meta-size': `${safe.metaPx}px`,
        '--cp-date-size': `${Math.max(8, safe.metaPx - 2)}px`,
        '--cp-table-head-size': `${safe.tableHeadPx}px`,
        '--cp-table-body-size': `${safe.tableBodyPx}px`,
        '--cp-line-height': `${(safe.lineHeightPct / 100).toFixed(2)}`,
        '--cp-quick-size': `${safe.quickPx}px`,
        '--cp-conditions-size': `${safe.conditionsPx}px`,
        '--cp-sign-size': `${safe.signPx}px`,
        '--cp-footer-size': `${safe.footerPx}px`,
        '--cp-header-align': headerAlign,
        '--cp-header-justify': headerAlign === 'left' ? 'flex-start' : (headerAlign === 'center' ? 'center' : 'flex-end'),
        '--cp-meta-align': safe.metaAlign,
        '--cp-table-align': safe.tableAlign,
        '--cp-quick-align': safe.quickAlign,
        '--cp-conditions-align': safe.conditionsAlign,
        '--cp-sign-align': safe.signAlign,
        '--cp-summary-align': safe.summaryAlign,
        '--cp-footer-align': safe.footerAlign
    };
}

function __contractsPdfStyleVarsInline(style) {
    const vars = __contractsPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __contractsApplyPdfStyleToLivePreview() {
    const rootNodes = document.querySelectorAll('#receipt-preview-box .cpc-pdf-root');
    if (!rootNodes.length) return;
    const vars = __contractsPdfStyleVars(__contractsGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
}

function __contractsSyncPdfStyleValueLabels(style) {
    const cfg = __contractsNormalizePdfStyle(style);
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setText('pdf-style-header-line-value', `${cfg.headerLinePx}px`);
    setText('pdf-style-title-size-value', `${cfg.titlePx}px`);
    setText('pdf-style-meta-size-value', `${cfg.metaPx}px`);
    setText('pdf-style-table-size-value', `${cfg.tableBodyPx}px`);
    setText('pdf-style-line-height-value', `${cfg.lineHeightPct}%`);
    setText('pdf-style-quick-size-value', `${cfg.quickPx}px`);
    setText('pdf-style-conditions-size-value', `${cfg.conditionsPx}px`);
    setText('pdf-style-sign-size-value', `${cfg.signPx}px`);
}

function __contractsWritePdfStyleControls(style) {
    const cfg = __contractsNormalizePdfStyle(style);
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = String(val);
    };
    setValue('pdf-style-font-family', cfg.fontFamilyKey);
    setValue('pdf-style-header-line', cfg.headerLinePx);
    setValue('pdf-style-title-size', cfg.titlePx);
    setValue('pdf-style-meta-size', cfg.metaPx);
    setValue('pdf-style-table-size', cfg.tableBodyPx);
    setValue('pdf-style-line-height', cfg.lineHeightPct);
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
    __contractsSyncPdfStyleValueLabels(cfg);
}

function __contractsReadPdfStyleControls() {
    return __contractsNormalizePdfStyle({
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
        tableBodyPx: document.getElementById('pdf-style-table-size')?.value,
        lineHeightPct: document.getElementById('pdf-style-line-height')?.value,
        quickPx: document.getElementById('pdf-style-quick-size')?.value,
        conditionsPx: document.getElementById('pdf-style-conditions-size')?.value,
        signPx: document.getElementById('pdf-style-sign-size')?.value,
        footerPx: Math.max(8, (parseInt(document.getElementById('pdf-style-meta-size')?.value || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.metaPx, 10) - 3)),
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

function __contractsSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __contractsPdfStyleState = __contractsNormalizePdfStyle(style);
    if (opts.applyToDom !== false) __contractsApplyPdfStyleToLivePreview();
}

function __contractsIsAdminProfile() {
    return String(window.currentUserProfile?.role || '').toLowerCase() === 'admin';
}

async function __contractsLoadSharedPdfStyleConfig() {
    if (!window.tenantPocketBase) return;
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,valor_json')
            .eq('clave', __CP_CONTRACTS_PDF_STYLE_CONFIG_KEY)
            .maybeSingle();
        if (error || !data) return;
        __contractsPdfStyleConfigRecordId = String(data.id || '');
        __contractsSetPdfStyleConfig(data.valor_json || __CP_CONTRACTS_PDF_STYLE_DEFAULTS, { applyToDom: false });
    } catch (e) {
        console.warn('No se pudo cargar estilo PDF compartido (CP contracts):', e);
    }
}

async function __contractsPersistSharedPdfStyleConfig(style) {
    if (!__contractsIsAdminProfile() || !window.tenantPocketBase) return;
    const normalized = __contractsNormalizePdfStyle(style);
    try {
        if (!__contractsPdfStyleConfigRecordId) {
            const { data: existing, error: existingError } = await window.tenantPocketBase
                .from('configuracion')
                .select('id')
                .eq('clave', __CP_CONTRACTS_PDF_STYLE_CONFIG_KEY)
                .maybeSingle();
            if (!existingError && existing?.id) __contractsPdfStyleConfigRecordId = String(existing.id);
        }
        if (__contractsPdfStyleConfigRecordId) {
            const { error: updError } = await window.tenantPocketBase
                .from('configuracion')
                .update({ valor_json: normalized })
                .eq('id', __contractsPdfStyleConfigRecordId);
            if (updError) throw updError;
            return;
        }
        const { data: inserted, error: insError } = await window.tenantPocketBase
            .from('configuracion')
            .insert({ tenant: __CP_CONTRACTS_PDF_STYLE_TENANT, clave: __CP_CONTRACTS_PDF_STYLE_CONFIG_KEY, valor_json: normalized })
            .select('id')
            .single();
        if (insError) throw insError;
        __contractsPdfStyleConfigRecordId = String(inserted?.id || '');
    } catch (e) {
        console.warn('No se pudo guardar estilo PDF compartido (CP contracts):', e);
    }
}

function __contractsScheduleSharedPdfStyleSync(style) {
    if (!__contractsIsAdminProfile()) return;
    if (__contractsPdfStyleSyncTimer) clearTimeout(__contractsPdfStyleSyncTimer);
    __contractsPdfStyleSyncTimer = setTimeout(() => {
        __contractsPersistSharedPdfStyleConfig(style || __contractsPdfStyleState);
    }, 450);
}

function __contractsHandlePdfStyleControlChange() {
    if (!__contractsIsAdminProfile()) return;
    const next = __contractsReadPdfStyleControls();
    __contractsSetPdfStyleConfig(next, { applyToDom: true });
    __contractsSyncPdfStyleValueLabels(next);
    __contractsScheduleSharedPdfStyleSync(next);
}

function __contractsApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    const body = document.getElementById('pdf-style-editor-body');
    const toggleBtn = document.getElementById('btn-pdf-style-toggle');
    const pinBtn = document.getElementById('btn-pdf-style-pin');
    if (!editorWrap) return;

    if (body) body.classList.toggle('hidden', !!__contractsPdfStyleUiState.collapsed);
    if (toggleBtn) toggleBtn.textContent = __contractsPdfStyleUiState.collapsed ? 'Mostrar' : 'Ocultar';
    if (pinBtn) pinBtn.textContent = __contractsPdfStyleUiState.pinned ? 'Desfijar' : 'Fijar';

    if (__contractsPdfStyleUiState.pinned) {
        editorWrap.style.position = 'fixed';
        editorWrap.style.left = '16px';
        editorWrap.style.bottom = '16px';
        editorWrap.style.top = '';
        editorWrap.style.right = '';
        editorWrap.style.zIndex = '140';
        editorWrap.style.width = '320px';
        editorWrap.style.maxHeight = '85vh';
        editorWrap.style.overflow = 'auto';
        editorWrap.style.border = '1px solid #374151';
        editorWrap.style.borderRadius = '12px';
        editorWrap.style.boxShadow = '0 18px 45px rgba(0, 0, 0, 0.45)';
    } else {
        editorWrap.style.position = 'fixed';
        editorWrap.style.left = '16px';
        editorWrap.style.top = '84px';
        editorWrap.style.right = '';
        editorWrap.style.bottom = '12px';
        editorWrap.style.zIndex = '140';
        editorWrap.style.width = '320px';
        editorWrap.style.maxHeight = 'calc(100vh - 96px)';
        editorWrap.style.overflow = 'auto';
        editorWrap.style.border = '1px solid #374151';
        editorWrap.style.borderRadius = '12px';
        editorWrap.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.35)';
    }
}

function __contractsTogglePdfStylePanel() {
    __contractsPdfStyleUiState = { ...__contractsPdfStyleUiState, collapsed: !__contractsPdfStyleUiState.collapsed };
    __contractsSavePdfStyleUiState();
    __contractsApplyPdfStyleEditorUiState();
}

function __contractsTogglePdfStylePin() {
    __contractsPdfStyleUiState = { ...__contractsPdfStyleUiState, pinned: !__contractsPdfStyleUiState.pinned };
    __contractsSavePdfStyleUiState();
    __contractsApplyPdfStyleEditorUiState();
}

function __contractsInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__contractsPdfStyleState) __contractsPdfStyleState = __contractsLoadPdfStyleState();
    if (!__contractsIsAdminProfile()) {
        editorWrap.classList.add('hidden');
        return;
    }
    editorWrap.classList.remove('hidden');
    __contractsPdfStyleUiState = __contractsLoadPdfStyleUiState();
    __contractsWritePdfStyleControls(__contractsPdfStyleState);
    __contractsApplyPdfStyleEditorUiState();
    if (document.body.dataset.cpContractsPdfStyleBound === '1') return;
    const controls = Array.from(document.querySelectorAll('.pdf-style-control'));
    controls.forEach((el) => {
        el.addEventListener('input', __contractsHandlePdfStyleControlChange);
        el.addEventListener('change', __contractsHandlePdfStyleControlChange);
    });
    document.getElementById('btn-pdf-style-toggle')?.addEventListener('click', __contractsTogglePdfStylePanel);
    document.getElementById('btn-pdf-style-pin')?.addEventListener('click', __contractsTogglePdfStylePin);
    document.getElementById('btn-reset-pdf-style')?.addEventListener('click', () => {
        const reset = __contractsNormalizePdfStyle(__CP_CONTRACTS_PDF_STYLE_DEFAULTS);
        __contractsSetPdfStyleConfig(reset, { applyToDom: true });
        __contractsWritePdfStyleControls(reset);
        __contractsScheduleSharedPdfStyleSync(reset);
    });
    document.body.dataset.cpContractsPdfStyleBound = '1';
}

function __contractsBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function __contractsSignedUrl(path) {
    const cleanPath = String(path || '').trim();
    if (!cleanPath) return null;
    const { data, error } = await window.globalPocketBase.storage.from(TEMPLATE_BUCKET).createSignedUrl(cleanPath, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
}

async function __contractsLoadPreferences() {
    defaultTemplateFile = '';
    CP_PDF_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.cpPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadCasaPiedraUrl)) || '../public/assets/img/cp-letterhead-default.png';
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('*')
            .in('clave', [CFG_TEMPLATE_DEFAULT_KEY, CFG_LETTERHEAD_KEY]);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        rows.forEach(row => {
            const key = String(row?.clave || '').toLowerCase();
            const cfg = row?.valor_json || {};
            if (key === CFG_TEMPLATE_DEFAULT_KEY) {
                const fromPath = cfg.path || cfg.file_path || cfg.value || '';
                defaultTemplateFile = cfg.file_name || __contractsBasename(fromPath) || '';
            }
        });
        const letterheadRow = rows.find(row => String(row?.clave || '').toLowerCase() === CFG_LETTERHEAD_KEY);
        const letterheadCfg = letterheadRow?.valor_json || {};
        const savedPath = letterheadCfg.path || letterheadCfg.file_path || letterheadCfg.value || '';
        const safePath = savedPath || (letterheadCfg.file_name ? `${LETTERHEAD_PATH}/${letterheadCfg.file_name}` : '');
        if (safePath) {
            const signed = await __contractsSignedUrl(safePath);
            if (signed) CP_PDF_LETTERHEAD_URL = signed;
        }
    } catch (_) {}
}

function __contractsApplyTemplateDefault() {
    const selector = document.getElementById('template-selector');
    if (!selector) return;
    if (defaultTemplateFile) {
        const exists = Array.from(selector.options || []).some(opt => opt.value === defaultTemplateFile);
        if (exists) selector.value = defaultTemplateFile;
    }
    if (selectedOrder && selector.value) window.loadSelectedTemplate();
}

// --- INICIALIZACIÓN SEGURA ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar librerías
    if (typeof window.PB_CLIENT === 'undefined') {
        alert("Error crítico: No se pudo cargar la librería de conexión. Revisa tu internet o los bloqueadores de anuncios.");
        return;
    }

    // 2. Inicializar Clientes
    if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
    if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);

    // 3. Verificar Sesión
    const { data: { session } } = await window.globalPocketBase.auth.getSession();
    if (!session) window.location.href = 'index.html';
    try {
        const { data: profile } = await window.globalPocketBase.from('profiles').select('*').eq('id', session.user.id).single();
        window.currentUserProfile = profile || null;
    } catch (_) {
        window.currentUserProfile = null;
    }
    await __contractsLoadSharedPdfStyleConfig();
    __contractsInitPdfStyleEditor();

    console.log("Sistema iniciado correctamente. Cargando módulos...");

    // 4. Cargar Datos
    await loadApprovedOrders();
    await __contractsLoadPreferences();

    setContractPreviewSrcdoc(null);
    await window.loadTemplatesList();

    // Filtros
    document.getElementById('search-approved').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        renderOrderList(approvedOrders.filter(o => o.cliente_nombre.toLowerCase().includes(term) || (o.numero_orden && o.numero_orden.toLowerCase().includes(term))));
    });
    
    // Modal Confirm
    const btnConf = document.getElementById('btn-confirm-action');
    if(btnConf) {
        btnConf.addEventListener('click', () => {
            if(confirmCallback) confirmCallback();
            window.closeModal('generic-confirm-modal');
        });
    }
});

async function loadApprovedOrders() {
    const listContainer = document.getElementById('approved-list');
    if(!listContainer) return;
    
    listContainer.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">Cargando...</div>';
    
    try {
        console.log("Solicitando órdenes aprobadas...");
        const { data, error } = await window.tenantPocketBase
            .from('cotizaciones')
            .select('*')
            .eq('status', 'aprobada')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`Órdenes cargadas: ${data?.length || 0}`);
        approvedOrders = data || [];
        renderOrderList(approvedOrders);

    } catch (e) {
        console.error("Error al cargar órdenes:", e);
        listContainer.innerHTML = `<div class="p-8 text-center text-red-400 text-xs">Error de conexión: ${e.message}</div>`;
    }
}

function renderOrderList(list) {
    const container = document.getElementById('approved-list'); 
    container.innerHTML = '';
    
    if (!list || list.length === 0) { 
        container.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">No hay órdenes pendientes de contrato.</div>'; 
        return; 
    }
    
    list.forEach(o => {
        const paidComplete = __contractsIsPaidComplete(o);
        const paidBadge = paidComplete
            ? '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">Pagado</span>'
            : '';
        const item = document.createElement('div');
        item.className = `bg-white border p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition group shadow-sm mb-2 ${paidComplete ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`;
        item.onclick = () => selectOrder(o);
        item.innerHTML = `<div class="flex justify-between mb-1"><span class="font-bold text-xs text-gray-800 group-hover:text-brand-red transition truncate w-32">${o.cliente_nombre}</span><div class="flex items-center gap-1">${paidBadge}<span class="text-[9px] font-mono text-gray-400 bg-gray-50 border border-gray-200 px-1 rounded">${o.numero_orden || '---'}</span></div></div><div class="flex justify-between items-center"><span class="text-[10px] text-gray-500 truncate w-24"><i class="fa-solid fa-map-pin mr-1"></i>${o.espacio_nombre}</span><span class="text-xs font-black text-gray-800">${formatMoney(o.precio_final)}</span></div>`;
        container.appendChild(item);
    });
}

function __contractsSyncPaidIndicator(order) {
    const badge = document.getElementById('wk-paid-indicator');
    if (!badge) return;
    const paidComplete = __contractsIsPaidComplete(order);
    badge.classList.toggle('hidden', !paidComplete);
}

function selectOrder(order) {
    selectedOrder = order;
    
    // UI Updates
    document.getElementById('workspace-empty').classList.add('hidden');
    document.getElementById('wk-header').classList.remove('hidden');
    document.getElementById('wk-header').classList.add('flex');
    document.getElementById('wk-tabs').classList.remove('hidden');
    document.getElementById('wk-content').classList.remove('hidden');
    document.getElementById('sidebar-empty').classList.add('hidden');
    
    // Data Binding
    document.getElementById('wk-client-name').innerText = order.cliente_nombre;
    document.getElementById('wk-order-id').innerText = order.numero_orden || 'PENDIENTE';
    document.getElementById('wk-total').innerText = formatMoney(order.precio_final);
    document.getElementById('rcp-ref').value = order.numero_orden || `ORD-${order.id.slice(0,6).toUpperCase()}`;
    __contractsSyncPaidIndicator(order);
    
    // GESTIÓN DE BOTONES Y ESTADOS DE CONTRATO
    const cNumInput = document.getElementById('contract-num-assign');
    const cSaveBtn = document.getElementById('btn-save-contract-num');
    const btnFinalize = document.getElementById('btn-open-finalize');

    // Estado inicial de "Guardar y Finalizar": SIEMPRE DESHABILITADO al cargar
    btnFinalize.disabled = true;
    btnFinalize.classList.add('bg-gray-300', 'cursor-not-allowed');
    btnFinalize.classList.remove('bg-green-600', 'hover:bg-green-700', 'shadow-lg');

    // Lógica para input de Número de Contrato
    if (order.numero_contrato) {
        cNumInput.value = order.numero_contrato;
        cNumInput.disabled = true; // Bloquear si ya tiene número
        cSaveBtn.disabled = true;
        cSaveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        cNumInput.value = '';
        cNumInput.disabled = false;
        cSaveBtn.disabled = false;
        cSaveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Calculations Recibos
    const history = __contractsPayments(order);
    currentRemainingBalance = __contractsRemaining(order);

    const nextPaymentNum = history.length + 1;
    document.getElementById('rcp-concept').value = `Pago ${nextPaymentNum} / ${order.espacio_nombre}`;
    
    const amountInput = document.getElementById('rcp-amount');
    const btnGen = document.getElementById('btn-gen-receipt');
    const statusMsg = document.getElementById('payment-status-message');

    const paymentClosed = __contractsIsClosed(order);

    // Estado Liquidada / Cerrada (Recibos)
    if (paymentClosed) {
        amountInput.value = '0.00';
        amountInput.disabled = true;
        amountInput.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');

        btnGen.disabled = true;
        btnGen.classList.add('bg-gray-300', 'cursor-not-allowed');
        btnGen.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-brand-dark', 'hover:bg-black');
        btnGen.innerHTML = '<i class="fa-solid fa-circle-check"></i> PAGADO';

        statusMsg.classList.remove('hidden');
        statusMsg.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i> PAGADO';
        window.showToast('PAGADO', 'info');
    } else if (currentRemainingBalance <= 0.1) {
        amountInput.value = '0.00';
        amountInput.disabled = true;
        amountInput.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        
        btnGen.disabled = false;
        btnGen.classList.remove('bg-gray-400', 'cursor-not-allowed', 'bg-brand-dark', 'hover:bg-black');
        btnGen.classList.add('bg-green-600', 'hover:bg-green-700');
        btnGen.innerHTML = '<i class="fa-solid fa-file-circle-check"></i> Generar Constancia';
        
        statusMsg.classList.remove('hidden');
        statusMsg.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i> LIQUIDADA';
    } else {
        amountInput.value = currentRemainingBalance.toFixed(2);
        amountInput.disabled = false;
        amountInput.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        
        btnGen.disabled = false;
        btnGen.classList.remove('bg-green-600', 'hover:bg-green-700', 'bg-gray-400', 'cursor-not-allowed');
        btnGen.classList.add('bg-brand-dark', 'hover:bg-black');
        btnGen.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Generar y Guardar';
        
        statusMsg.classList.add('hidden');
    }

    renderPaymentHistory(history);
    switchTab('receipt'); 
    
    updateReceiptPreview();
    __contractsApplyTemplateDefault();
    setTimeout(window.adjustPreviewScale, 100);
}

// NUEVA FUNCIÓN: GUARDAR SOLO EL NÚMERO DE CONTRATO
window.saveContractNumber = function() {
    if(!selectedOrder) return;
    const val = document.getElementById('contract-num-assign').value.trim();
    if(!val) return window.showToast("Escribe un número de contrato", "error");

    window.openCustomConfirm("¿Confirmar Número de Contrato? Una vez guardado, NO se podrá modificar y se actualizarán los documentos.", async () => {
        try {
            // Actualizar BD
            const { error } = await window.tenantPocketBase
                .from('cotizaciones')
                .update({ numero_contrato: val })
                .eq('id', selectedOrder.id);
            
            if(error) throw error;

            // Actualizar objeto local
            selectedOrder.numero_contrato = val;
            window.showToast("Número de contrato guardado", "success");

            // Bloquear UI
            document.getElementById('contract-num-assign').disabled = true;
            document.getElementById('btn-save-contract-num').disabled = true;
            document.getElementById('btn-save-contract-num').classList.add('opacity-50', 'cursor-not-allowed');

            // Si hay plantilla seleccionada, recargarla para mostrar el nuevo número
            if(document.getElementById('template-selector').value) {
                window.loadSelectedTemplate();
            }

        } catch(e) {
            console.error(e);
            window.showToast("Error al guardar: " + e.message, "error");
        }
    });
};

function renderPaymentHistory(history) {
    const container = document.getElementById('payments-history-list'); container.innerHTML = '';
    if(!history || history.length === 0) { container.innerHTML = '<p class="text-[10px] text-gray-400 italic text-center py-2">Sin pagos registrados.</p>'; return; }
    let receiptIdx = 0;
    const paymentClosed = __contractsIsClosed(selectedOrder);
    history.forEach((pay, idx) => {
        const isConstancia = String(pay?.type || pay?.tipo || '').toLowerCase() === 'constancia_liquidacion' || pay?.closed === true || pay?.is_closure === true;
        const label = isConstancia
            ? `CONSTANCIA - ${new Date(pay.date).toLocaleDateString()}`
            : `#${++receiptIdx} - ${new Date(pay.date).toLocaleDateString()}`;
        const div = document.createElement('div'); div.className = "flex justify-between items-center bg-white p-2 rounded border border-gray-100 text-[10px]";
        const viewBtn = pay.file_path ? `<button onclick="window.openStoredReceipt('${pay.file_path}')" class="text-blue-500 hover:text-blue-700 font-bold ml-2 cursor-pointer" title="Ver PDF"><i class="fa-solid fa-file-pdf"></i></button>` : '';
        const delBtn = (!paymentClosed && !isConstancia) ? `<button onclick="window.deleteReceipt(${idx})" class="text-gray-400 hover:text-red-500 ml-2" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : '';
        div.innerHTML = `<div><span class="font-bold text-gray-700">${label}</span><span class="block text-gray-400 truncate w-32">${pay.concept}</span></div><div class="flex items-center"><span class="font-mono font-bold">${formatMoney(pay.amount)}</span>${viewBtn}${delBtn}</div>`;
        container.appendChild(div);
    });
}

function validateRequiredData() {
    if(!selectedOrder) return false;
    const missing = [];
    if(!selectedOrder.cliente_contacto) missing.push({id:'miss-phone', label:'Teléfono de Contacto', db:'cliente_contacto'});
    if(!selectedOrder.cliente_email) missing.push({id:'miss-email', label:'Correo Electrónico', db:'cliente_email'});
    const rfc = selectedOrder.cliente_rfc || (selectedOrder.datos_fiscales ? selectedOrder.datos_fiscales.rfc_receptor : null);
    if(!rfc) missing.push({id:'miss-rfc', label:'RFC del Cliente', db:'cliente_rfc'});

    if(missing.length > 0) {
        const container = document.getElementById('missing-fields-container');
        container.innerHTML = '';
        missing.forEach(f => {
            container.innerHTML += `<div><label class="text-[10px] font-bold uppercase text-gray-500">${f.label}</label><input id="${f.id}" data-db="${f.db}" class="w-full border border-gray-200 rounded-lg p-2 text-xs font-bold outline-none focus:border-brand-red"></div>`;
        });
        window.openModal('missing-data-modal');
        return false;
    }
    return true;
}

window.saveMissingData = async function() {
    const inputs = document.querySelectorAll('#missing-fields-container input');
    const updates = {};
    let valid = true;
    inputs.forEach(i => { if(!i.value) valid = false; updates[i.dataset.db] = i.value; });
    if(!valid) return window.showToast("Completa todos los campos", "error");
    if(updates.cliente_rfc) { updates.datos_fiscales = { ...selectedOrder.datos_fiscales, rfc_receptor: updates.cliente_rfc }; }
    try {
        const { error } = await window.tenantPocketBase.from('cotizaciones').update(updates).eq('id', selectedOrder.id);
        if(error) throw error;
        window.showToast("Datos guardados", "success");
        window.closeModal('missing-data-modal');
        Object.assign(selectedOrder, updates);
        if(pendingAction === 'receipt') window.generateAndSaveReceipt();
        else if(pendingAction === 'finalize') window.confirmFinalize();
        pendingAction = null;
    } catch(e) { window.showToast("Error al guardar: " + e.message, "error"); }
}

window.updateReceiptPreview = function() {
    if(!selectedOrder) return;
    let amount = parseFloat(document.getElementById('rcp-amount').value);
    if(isNaN(amount)) amount = 0;
    if (currentRemainingBalance > 0.01) {
        if (amount > currentRemainingBalance + 0.01) { 
            amount = currentRemainingBalance;
            document.getElementById('rcp-amount').value = amount.toFixed(2);
            window.showToast("Monto ajustado al máximo permitido.", "warning");
        }
    } else {
        amount = 0; 
        document.getElementById('rcp-amount').value = "0.00";
    }
    document.getElementById('receipt-preview-box').innerHTML = getReceiptHTML(true);
    const remaining = currentRemainingBalance - amount;
    document.getElementById('lbl-remaining').innerText = formatMoney(remaining < 0 ? 0 : remaining);
    window.adjustPreviewScale();
}

window.downloadReceiptPDF = async function() { 
    const hiddenContainer = document.getElementById('receipt-pdf-render'); 
    hiddenContainer.innerHTML = getReceiptHTML(true); 
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    const element = hiddenContainer.firstElementChild; 
    const opt = { margin: 0, filename: currentRemainingBalance <= 0.01 ? `Constancia_Liquidacion_${selectedOrder.numero_orden}.pdf` : `Recibo_${selectedOrder.numero_orden}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().set(opt).from(element).save().then(() => hiddenContainer.innerHTML = ''); 
}

window.generateAndSaveLiquidationCertificate = async function() {
    if (!selectedOrder) return;
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    const btn = document.getElementById('btn-gen-receipt');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando constancia...';
    try {
        const hiddenContainer = document.getElementById('receipt-pdf-render');
        hiddenContainer.innerHTML = getReceiptHTML(false);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const element = hiddenContainer.firstElementChild;
        const fileName = `Constancia_Liquidacion_${selectedOrder.numero_orden || selectedOrder.id.slice(0, 6)}_${Date.now()}.pdf`;
        const pdfBlob = await html2pdf().set({ margin: 0, filename: fileName, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(element).output('blob');
        hiddenContainer.innerHTML = '';
        const filePath = `${selectedOrder.id}/constancias/${fileName}`;
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(filePath, pdfBlob);
        if (upErr) throw upErr;

        const history = __contractsPayments(selectedOrder).filter((p) => String(p?.type || p?.tipo || '').toLowerCase() !== 'constancia_liquidacion');
        const closureEntry = {
            date: new Date().toISOString(),
            amount: 0,
            concept: 'Constancia de Liquidación',
            reference: selectedOrder.numero_orden || selectedOrder.id,
            bank: 'Sistema',
            account: '--',
            file_path: filePath,
            type: 'constancia_liquidacion',
            closed: true
        };
        const updatedHistory = [...history, closureEntry];
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if (dbErr) throw dbErr;

        const link = document.createElement('a'); link.href = URL.createObjectURL(pdfBlob); link.download = fileName; link.click();
        window.showToast("Constancia guardada. Estado: PAGADO", "success");
        selectedOrder.historial_pagos = updatedHistory;
        loadApprovedOrders();
        selectOrder(selectedOrder);
    } catch (e) {
        console.error(e);
        window.showToast("Error al generar constancia: " + (e.message || e), "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> PAGADO';
    }
}

window.generateAndSaveReceipt = async function() {
    if(!selectedOrder) return;
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    if (currentRemainingBalance <= 0.01) { await window.generateAndSaveLiquidationCertificate(); return; }
    const amount = parseFloat(document.getElementById('rcp-amount').value);
    if (amount <= 0) return window.showToast("El monto debe ser mayor a 0.", "error");
    pendingAction = 'receipt';
    if(!validateRequiredData()) return;
    const btn = document.getElementById('btn-gen-receipt');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando...';
    try {
        const hiddenContainer = document.getElementById('receipt-pdf-render');
        hiddenContainer.innerHTML = getReceiptHTML(false); 
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        const element = hiddenContainer.firstElementChild;
        const fileName = `Recibo_${selectedOrder.numero_orden}_${Date.now()}.pdf`;
        const pdfBlob = await html2pdf().set({ margin: 0, filename: fileName, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(element).output('blob');
        hiddenContainer.innerHTML = '';
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(filePath, pdfBlob);
        if(upErr) throw upErr;
        const newPayment = { date: new Date().toISOString(), amount: amount, concept: document.getElementById('rcp-concept').value, reference: document.getElementById('rcp-ref').value, bank: document.getElementById('rcp-bank').value, account: document.getElementById('rcp-account').value, file_path: filePath };
        const updatedHistory = [...(selectedOrder.historial_pagos || []), newPayment];
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if(dbErr) throw dbErr;
        window.showToast("Recibo generado", "success");
        const link = document.createElement('a'); link.href = URL.createObjectURL(pdfBlob); link.download = fileName; link.click();
        loadApprovedOrders(); selectedOrder.historial_pagos = updatedHistory; selectOrder(selectedOrder);
    } catch (e) { console.error(e); window.showToast("Error: " + e.message, "error"); } 
    finally { if (currentRemainingBalance > 0.01) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Generar y Guardar'; } }
}

window.deleteReceipt = function(index) {
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    window.openCustomConfirm("¿Eliminar este recibo? El saldo aumentará.", async () => {
        try {
            const history = [...selectedOrder.historial_pagos];
            const item = history[index];
            const itemType = String(item?.type || item?.tipo || '').toLowerCase();
            if (itemType === 'constancia_liquidacion') return window.showToast("La constancia de liquidación no se puede eliminar.", "error");
            if(item.file_path) await window.globalPocketBase.storage.from('documentos-cp').remove([item.file_path]);
            history.splice(index, 1);
            await window.tenantPocketBase.from('cotizaciones').update({ historial_pagos: history }).eq('id', selectedOrder.id);
            window.showToast("Recibo eliminado");
            loadApprovedOrders();
            selectedOrder.historial_pagos = history;
            selectOrder(selectedOrder);
        } catch(e) { window.showToast("Error al eliminar", "error"); }
    });
}

window.loadTemplatesList = async function() {
    const selector = document.getElementById('template-selector');
    if (!selector) return;
    const { data, error } = await window.globalPocketBase.storage.from(TEMPLATE_BUCKET).list(TEMPLATE_PATH);
    if (error) {
        selector.innerHTML = '<option value="">-- Seleccionar Plantilla --</option>';
        templates = [];
        return;
    }
    templates = (data || [])
        .map(file => ({
            name: file?.name || __contractsBasename(file?.path || ''),
            path: file?.path || `${TEMPLATE_PATH}/${file?.name || ''}`
        }))
        .filter(file => !!file.name);
    selector.innerHTML = '<option value="">-- Seleccionar Plantilla --</option>';
    templates.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file.name;
        opt.innerText = file.name.replace(/\.[^/.]+$/, '');
        selector.appendChild(opt);
    });
    __contractsApplyTemplateDefault();
};
window.loadSelectedTemplate = async function() {
    const fileName = document.getElementById('template-selector').value;
    if(!fileName) {
        setContractPreviewSrcdoc(null);
        return;
    }
    if(!selectedOrder) return;

    try {
        const { data, error } = await window.globalPocketBase
            .storage.from(TEMPLATE_BUCKET)
            .download(`${TEMPLATE_PATH}/${fileName}`);

        if(error) throw error;
        let text = await data.text();

        const hl = (val) => `<span class="var-highlight">${val || '---'}</span>`;
        text = text
            .replace(/{{CLIENTE}}/g, hl(selectedOrder.cliente_nombre))
            .replace(/{{RFC}}/g, hl(selectedOrder.cliente_rfc || '---'))
            .replace(/{{TELEFONO}}/g, hl(selectedOrder.cliente_contacto))
            .replace(/{{EMAIL}}/g, hl(selectedOrder.cliente_email))
            .replace(/{{ESPACIO}}/g, hl(selectedOrder.espacio_nombre))
            .replace(/{{CLAVE}}/g, hl(selectedOrder.espacio_clave))
            .replace(/{{FECHA_INICIO}}/g, hl(window.formatDate(selectedOrder.fecha_inicio)))
            .replace(/{{FECHA_FIN}}/g, hl(window.formatDate(selectedOrder.fecha_fin)))
            .replace(/{{MONTO_TOTAL}}/g, hl(window.formatMoney(selectedOrder.precio_final)))
            .replace(/{{FECHA_HOY}}/g, hl(new Date().toLocaleDateString('es-MX')))
            .replace(/{{NUM_ORDEN}}/g, hl(selectedOrder.numero_orden))
            .replace(/{{NUM_CONTRATO}}/g, hl(selectedOrder.numero_contrato || 'PENDIENTE'));

        setContractPreviewSrcdoc(text);
        setTimeout(window.adjustPreviewScale, 50);
    } catch (e) {
        console.error(e);
        window.showToast("Error al cargar plantilla", "error");
        setContractPreviewSrcdoc(null);
    }
};
function __contractsBuildPrintableContractHtml(previewDoc) {
    const headHtml = previewDoc?.head ? previewDoc.head.innerHTML : '';
    const bodyHtml = previewDoc?.body ? previewDoc.body.innerHTML : '';
    const contractBaseHeight = __contractsContentBaseHeightPx();
    const wrappedPage = __contractsWrapLetterheadPage(bodyHtml, {
        baseWidth: CP_CONTRACTS_CONTENT_BASE_WIDTH_PX,
        baseHeight: contractBaseHeight,
        id: 'contract-print-area'
    });

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${headHtml}
<style>
  @page { size: letter portrait; margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; background: #ffffff; }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .var-highlight { font-weight: bold; background: transparent !important; padding: 0 !important; border-radius: 0 !important; }
</style>
</head>
<body>
${wrappedPage}
</body>
</html>`;
}

window.printContract = function() {
    if(!selectedOrder) return;

    const iframe = document.getElementById('contract-preview-iframe');
    const doc = iframe && iframe.contentDocument;
    if(!doc) {
        window.showToast("No hay contrato cargado.", "error");
        return;
    }

    const printableHtml = __contractsBuildPrintableContractHtml(doc);
    const win = window.open('', '', 'height=900,width=1100');
    if (!win) {
        window.showToast("No se pudo abrir la ventana de impresión.", "error");
        return;
    }
    win.document.open();
    win.document.write(printableHtml);
    win.document.close();
    win.focus();
    setTimeout(() => {
        try { win.print(); } catch (_) {}
    }, 250);

    // Activamos el botón para que puedan finalizar después de imprimir si lo desean
    const btnFinalize = document.getElementById('btn-open-finalize');
    btnFinalize.disabled = false;
    btnFinalize.classList.remove('bg-gray-300', 'cursor-not-allowed');
    btnFinalize.classList.add('bg-green-600', 'hover:bg-green-700', 'shadow-lg');
};

window.openFinalizeModal = function() { pendingAction = 'finalize'; if(!validateRequiredData()) return; const contractNum = document.getElementById('contract-num-assign').value; if(!contractNum) return window.showToast("Asigna un Número de Contrato.", "error"); window.openModal('finalize-modal'); }

window.confirmFinalize = async function() { 
    if(!selectedOrder || !signedFileToUpload) return; 
    const btn = document.getElementById('btn-confirm-finalize'); 
    const contractNum = document.getElementById('contract-num-assign').value; 
    btn.innerText = "Procesando..."; 
    btn.disabled = true; 
    try { 
        const path = `${selectedOrder.id}/${Date.now()}_contrato_firmado.pdf`; 
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(path, signedFileToUpload); 
        if(upErr) throw upErr; 
        
        // MODIFICADO: Se elimina 'status: finalizada'. 
        // La orden permanece en el estado actual (aprobada) hasta que se suba la factura.
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ contrato_url: path, numero_contrato: contractNum }).eq('id', selectedOrder.id); 
        
        if(dbErr) throw dbErr; 
        window.showToast("Contrato Guardado Correctamente", "success"); 
        window.closeModal('finalize-modal'); 
        loadApprovedOrders(); 
        
        // Restaurar la vista inicial
        document.getElementById('workspace-empty').classList.remove('hidden');
        document.getElementById('wk-header').classList.add('hidden'); 
        document.getElementById('wk-header').classList.remove('flex');
        document.getElementById('wk-tabs').classList.add('hidden');
        document.getElementById('wk-content').classList.add('hidden');
        document.getElementById('sidebar-empty').classList.remove('hidden');
        
        document.getElementById('sidebar-receipt').classList.add('hidden');
        document.getElementById('sidebar-receipt').classList.remove('flex');
        document.getElementById('sidebar-contract').classList.add('hidden');
        document.getElementById('sidebar-contract').classList.remove('flex');

    } catch(e) { 
        window.showToast("Error: "+e.message, "error"); 
    } finally { 
        btn.innerText = "Confirmar"; 
        btn.disabled = false; 
    } 
}

// --- NUEVA LÓGICA: RECIBOS EXTERNOS ---
window.openUploadReceiptModal = function() {
    if(!selectedOrder) return;
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    
    // Limpiar campos
    document.getElementById('ext-receipt-file').value = '';
    document.getElementById('lbl-ext-receipt').innerText = 'Seleccionar Archivo (PDF o Imagen)';
    document.getElementById('ext-preview-container').classList.add('hidden');
    document.getElementById('ext-pdf-preview').classList.add('hidden');
    document.getElementById('ext-img-preview').classList.add('hidden');
    
    // Precargar datos
    const history = selectedOrder.historial_pagos || [];
    const nextPaymentNum = history.length + 1;
    document.getElementById('up-rcp-concept').value = `Pago ${nextPaymentNum} / ${selectedOrder.espacio_nombre}`;
    document.getElementById('up-rcp-amount').value = currentRemainingBalance > 0 ? currentRemainingBalance.toFixed(2) : '';
    document.getElementById('up-rcp-bank').value = "Externo";
    document.getElementById('up-rcp-account').value = "---";
    document.getElementById('up-rcp-ref').value = selectedOrder.numero_orden || `ORD-${selectedOrder.id.slice(0,6).toUpperCase()}`;
    
    document.getElementById('btn-save-ext-receipt').disabled = true;
    document.getElementById('btn-save-ext-receipt').classList.add('bg-gray-300', 'cursor-not-allowed');
    document.getElementById('btn-save-ext-receipt').classList.remove('bg-brand-red');

    externalReceiptFile = null;
    window.openModal('upload-receipt-modal');
}

window.handleReceiptFileSelect = function(input) {
    if(input.files[0]) {
        externalReceiptFile = input.files[0];
        document.getElementById('lbl-ext-receipt').innerText = input.files[0].name;
        
        // Preview
        const previewContainer = document.getElementById('ext-preview-container');
        const pdfFrame = document.getElementById('ext-pdf-preview');
        const imgFrame = document.getElementById('ext-img-preview');
        
        previewContainer.classList.remove('hidden');
        const url = URL.createObjectURL(externalReceiptFile);
        
        if(externalReceiptFile.type.includes('pdf')) {
            pdfFrame.src = url;
            pdfFrame.classList.remove('hidden');
            imgFrame.classList.add('hidden');
        } else {
            imgFrame.src = url;
            imgFrame.classList.remove('hidden');
            pdfFrame.classList.add('hidden');
        }

        // Habilitar Guardar
        const btn = document.getElementById('btn-save-ext-receipt');
        btn.disabled = false;
        btn.classList.remove('bg-gray-300', 'cursor-not-allowed');
        btn.classList.add('bg-brand-red', 'hover:bg-red-700');
    }
}

window.saveExternalReceipt = async function() {
    if(!selectedOrder || !externalReceiptFile) return;
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    
    const amount = parseFloat(document.getElementById('up-rcp-amount').value);
    if(isNaN(amount) || amount <= 0) return window.showToast("Monto inválido", "error");
    
    const btn = document.getElementById('btn-save-ext-receipt');
    btn.disabled = true; btn.innerText = "Subiendo...";
    
    try {
        const fileExt = externalReceiptFile.name.split('.').pop();
        const fileName = `Comprobante_Externo_${Date.now()}.${fileExt}`;
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(filePath, externalReceiptFile);
        if(upErr) throw upErr;
        
        const newPayment = { 
            date: new Date().toISOString(), 
            amount: amount, 
            concept: document.getElementById('up-rcp-concept').value, 
            reference: document.getElementById('up-rcp-ref').value, 
            bank: document.getElementById('up-rcp-bank').value, 
            account: document.getElementById('up-rcp-account').value, 
            file_path: filePath 
        };
        
        const updatedHistory = [...(selectedOrder.historial_pagos || []), newPayment];
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if(dbErr) throw dbErr;
        
        window.showToast("Comprobante Guardado", "success");
        window.closeModal('upload-receipt-modal');
        
        loadApprovedOrders(); 
        selectedOrder.historial_pagos = updatedHistory; 
        selectOrder(selectedOrder);
        
    } catch(e) {
        console.error(e);
        window.showToast("Error: " + e.message, "error");
    } finally {
        btn.innerText = "Guardar";
        btn.disabled = false;
    }
}

function renderVariablesCheatSheet() {
    const container = document.getElementById('variables-list');
    if (!container) return;
    container.innerHTML = '';
    AVAILABLE_VARS.forEach(v => {
        const badge = document.createElement('span');
        badge.className = 'var-tag';
        badge.innerText = v.key;
        badge.title = v.desc;
        badge.onclick = () => { navigator.clipboard.writeText(v.key); window.showToast("Copiado"); };
        container.appendChild(badge);
    });
}

// --- GENERADOR PDF UNIFICADO (DISEÑO PREMIUM) ---
function getReceiptHTML(isVisual = false) {
    if(!selectedOrder) return '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isLiquidated = currentRemainingBalance <= 0.01;
    const receiptBaseHeight = Number(__contractsContentBaseHeightPx().toFixed(2));
    const pdfStyle = __contractsGetPdfStyleConfig();
    const pdfStyleInlineVars = __contractsPdfStyleVarsInline(pdfStyle);
    const pdfStyleTag = `<style>.cpc-pdf-root{font-family:var(--cp-font-family)!important;}.cpc-pdf-root .cpc-pdf-header{border-bottom-width:var(--cp-header-line)!important;justify-content:var(--cp-header-justify)!important;}.cpc-pdf-root .cpc-pdf-title{font-size:var(--cp-title-size)!important;line-height:1.05!important;text-align:var(--cp-header-align)!important;}.cpc-pdf-root .cpc-pdf-meta,.cpc-pdf-root .cpc-pdf-meta *{font-size:var(--cp-meta-size)!important;text-align:var(--cp-meta-align)!important;}.cpc-pdf-root .cpc-pdf-table-head th{font-size:var(--cp-table-head-size)!important;}.cpc-pdf-root .cpc-pdf-table-body td,.cpc-pdf-root .cpc-pdf-table-body p,.cpc-pdf-root .cpc-pdf-table-body span{font-size:var(--cp-table-body-size)!important;line-height:var(--cp-line-height)!important;}.cpc-pdf-root .cpc-pdf-table-body td:first-child,.cpc-pdf-root .cpc-pdf-table-body td:first-child *{text-align:var(--cp-table-align)!important;}.cpc-pdf-root .cpc-pdf-summary,.cpc-pdf-root .cpc-pdf-summary *{text-align:var(--cp-summary-align)!important;}.cpc-pdf-root .cpc-pdf-quick,.cpc-pdf-root .cpc-pdf-quick *{font-size:var(--cp-quick-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-quick-align)!important;}.cpc-pdf-root .cpc-pdf-general-conditions,.cpc-pdf-root .cpc-pdf-general-conditions *{font-size:var(--cp-conditions-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-conditions-align)!important;}.cpc-pdf-root .cpc-pdf-sign,.cpc-pdf-root .cpc-pdf-sign *{font-size:var(--cp-sign-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-sign-align)!important;}.cpc-pdf-root .cpc-pdf-footer-text{font-size:var(--cp-footer-size)!important;text-align:var(--cp-footer-align)!important;}</style>`;
    const wrapStyledReceipt = (rawHtml) => {
        const page = __contractsWrapLetterheadPage(__contractsTransparentPdfHtml(__contractsBoostPdfTypography(rawHtml)), { baseWidth: CP_CONTRACTS_CONTENT_BASE_WIDTH_PX, baseHeight: receiptBaseHeight, id: 'receipt-print-area' });
        return `<div class="cpc-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;${pdfStyleInlineVars}">${pdfStyleTag}${page}</div>`;
    };
    
    if (isLiquidated) {
        const payments = selectedOrder.historial_pagos || [];
        let rowsHtml = '';
        payments.forEach(p => {
            rowsHtml += `
                <tr class="border-b border-gray-100 last:border-0">
                    <td class="py-3 text-gray-600">${window.formatDate(p.date)}</td>
                    <td class="py-3 text-gray-600 font-bold">${p.bank || '---'} / ${p.account || '---'}</td>
                    <td class="py-3 text-gray-600">${p.reference}</td>
                    <td class="py-3 text-right font-mono font-bold text-gray-800">${window.formatMoney(p.amount)}</td>
                </tr>
            `;
        });
        let watermark = `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 118px; color: rgba(34, 197, 94, 0.16); font-weight: 900; z-index: 0; pointer-events: none; white-space: nowrap;">LIQUIDADO</div>`;
        const receiptRaw = `
            <div class="cpc-pdf-main font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: ${CP_CONTRACTS_CONTENT_BASE_WIDTH_PX}px; min-height: ${receiptBaseHeight}px; height: ${receiptBaseHeight}px; padding: 20px 80px 56px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;">
                ${watermark}
                <div style="position: relative; z-index: 10; flex-grow: 1;">
                    <div class="cpc-pdf-header flex justify-end items-start mb-10 border-b-4 border-green-600 pb-4">
                        <div class="cpc-pdf-meta text-right"><h1 class="cpc-pdf-title text-2xl font-black uppercase text-gray-900 tracking-tighter">Constancia de Liquidación</h1><p class="text-sm text-gray-500 font-mono mt-1">EMISIÓN: ${dateStr} ${timeStr}</p></div>
                    </div>
                    <div class="cpc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente:</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Espacio:</span><span class="text-base font-bold text-gray-900">${selectedOrder.espacio_nombre}</span></div>
                        <div class="flex justify-between"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Contrato:</span><span class="text-xl font-black text-brand-red">${window.formatMoney(selectedOrder.precio_final)}</span></div>
                    </div>
                    <div class="mb-10"><h3 class="cpc-pdf-quick font-bold text-xs uppercase text-gray-400 mb-4 tracking-widest pl-2">Resumen de Pagos Realizados</h3><div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"><table class="cpc-pdf-table w-full text-xs text-left"><thead class="cpc-pdf-table-head"><tr class="text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100"><th class="pb-3">Fecha</th><th class="pb-3">Banco / Cuenta</th><th class="pb-3">Referencia</th><th class="text-right pb-3">Monto</th></tr></thead><tbody class="cpc-pdf-table-body">${rowsHtml}</tbody></table></div></div>
                    <div class="cpc-pdf-summary mb-12 flex justify-end"><div class="bg-green-50 px-8 py-5 rounded-xl border border-green-100 text-right shadow-sm"><p class="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Saldo Pendiente</p><p class="text-3xl font-black text-green-700">$0.00</p></div></div>
                </div>
                <div style="margin-top: auto; position: relative; z-index: 10;">
                    <div class="cpc-pdf-sign flex justify-between gap-16 mb-8"><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-2"></div><p class="text-xs font-bold text-gray-900 uppercase">Cobranza</p></div><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-2"></div><p class="text-xs font-bold text-gray-900 uppercase">Administración</p></div></div>
                    <div class="cpc-pdf-footer-text cpc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4"><p class="mb-1">Este documento certifica que la orden de referencia ha sido liquidada en su totalidad.</p><p>Generado digitalmente a través de Marketing Hub.</p></div>
                </div>
            </div>`;
        return wrapStyledReceipt(receiptRaw);
    }
    
    const amount = parseFloat(document.getElementById('rcp-amount').value) || 0;
    const concept = document.getElementById('rcp-concept').value;
    const bank = document.getElementById('rcp-bank').value;
    const account = document.getElementById('rcp-account').value;
    const ref = document.getElementById('rcp-ref').value;
    let projectedRemaining = currentRemainingBalance - amount; if (projectedRemaining < 0) projectedRemaining = 0;

    const receiptRaw = `
        <div class="cpc-pdf-main font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: ${CP_CONTRACTS_CONTENT_BASE_WIDTH_PX}px; min-height: ${receiptBaseHeight}px; height: ${receiptBaseHeight}px; padding: 20px 80px 56px; box-sizing: border-box; display: flex; flex-direction: column;">
            <div style="flex-grow: 1;">
                <div class="cpc-pdf-header flex justify-end items-start mb-10 border-b-4 border-brand-red pb-4">
                    <div class="cpc-pdf-meta text-right"><h1 class="cpc-pdf-title text-3xl font-black uppercase text-gray-900 tracking-tighter">Recibo de Pago</h1><p class="text-sm text-gray-500 font-mono mt-1">FECHA: ${dateStr}</p><p class="text-xs text-gray-400 font-mono">HORA: ${timeStr}</p></div>
                </div>
                <div class="cpc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Recibimos de:</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">La cantidad de:</span><span class="text-2xl font-black text-brand-red">${window.formatMoney(amount)}</span></div>
                    <div class="flex justify-between mb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Concepto:</span><span class="text-sm font-medium text-gray-700 text-right max-w-[60%]">${concept}</span></div>
                    <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-lg mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Referencia Interna:</span><div class="text-right"><span class="block text-sm font-bold text-gray-800 font-mono">${selectedOrder.numero_orden || '---'}</span><span class="block text-[10px] text-gray-400 font-mono tracking-widest">${selectedOrder.id.slice(0,8).toUpperCase()}</span></div></div>
                </div>
                <div class="cpc-pdf-quick grid grid-cols-2 gap-12 text-xs text-gray-600 mb-8">
                    <div><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">Datos Bancarios</p><p class="mb-1">Banco: <strong class="text-gray-900 uppercase">${bank}</strong></p><p>Cuenta/CLABE: <strong class="text-gray-900 uppercase">${account}</strong></p></div>
                    <div class="text-right"><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">Referencia</p><p class="font-mono text-base text-gray-900">${ref}</p></div>
                </div>
                <div class="cpc-pdf-summary mb-12 flex justify-end"><div class="bg-red-50 px-8 py-4 rounded-xl border border-red-100 text-right shadow-sm"><p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Saldo Pendiente por Liquidar</p><p class="text-2xl font-black text-red-600">${window.formatMoney(projectedRemaining)}</p></div></div>
            </div>
            <div style="margin-top: auto;">
                <div class="cpc-pdf-sign flex justify-between gap-16 mb-8"><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-1"></div><p class="text-xs font-bold text-gray-900 uppercase">Cobranza / Finanzas</p><p class="text-[10px] text-gray-400 uppercase">Plaza Mayor</p></div><div class="w-1/2 text-center"><div class="border-b-2 border-gray-800 mb-1"></div><p class="text-xs font-bold text-gray-900 uppercase">Mercadotecnia</p><p class="text-[10px] text-gray-400 uppercase">Plaza Mayor</p></div></div>
                <div class="cpc-pdf-footer-text cpc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4"><p class="mb-1">Este documento es un comprobante de pago interno. No válido como factura fiscal.</p><p>Generado digitalmente a través de Marketing Hub.</p></div>
            </div>
        </div>`;
    return wrapStyledReceipt(receiptRaw);
}




