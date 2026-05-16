/**
 * DOC: client\cotizadorcp\receipts.js
 * Proposito: Gestion de recibos vinculados a cotizaciones aprobadas (editor PDF en receipts.html).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE RECIBOS - (FINAL: CORRECCIÓN DE CARGA Y ERRORES)
// =========================================================================

// --- 0. FUNCIONES GLOBALES ---
window.safeFormatDate = function(dateStr) { 
    if (!dateStr) return '--';
    const raw = String(dateStr).trim();
    const normalized = raw.replace('T', ' ').replace('Z', '');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
        const [, year, month, day, hh, mm, ss] = match;
        const formattedDate = `${day}/${month}/${year}`;
        if (!hh || !mm) return formattedDate;
        return `${formattedDate} ${hh}:${mm}:${ss || '00'}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = String(parsed.getFullYear());
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    const ss = String(parsed.getSeconds()).padStart(2, '0');
    const formattedDate = `${day}/${month}/${year}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formattedDate;
    return `${formattedDate} ${hh}:${mm}:${ss}`;
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

const __CP_RECEIPTS_EDITOR_DRAFT_KEY = 'cp_receipts_pdf_style_draft_v1';
function __contractsNormalizeNonSubmitButtons(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('button:not([type])').forEach((button) => {
        button.setAttribute('type', 'button');
    });
}
function __contractsSaveEditorDraft(style) {
    try {
        const safeStyle = __contractsNormalizePdfStyle(style || __contractsPdfStyleState || {});
        localStorage.setItem(__CP_RECEIPTS_EDITOR_DRAFT_KEY, JSON.stringify({
            updated_at: window.__serverDateService.nowISO(),
            style: safeStyle
        }));
    } catch (_) {}
}
function __contractsLoadEditorDraft() {
    try {
        const raw = localStorage.getItem(__CP_RECEIPTS_EDITOR_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return __contractsNormalizePdfStyle(parsed.style || {});
    } catch (_) {
        return null;
    }
}

const __CP_CONTRACTS_PAGE_MODE = ((document.body && document.body.dataset && document.body.dataset.pageMode) || 'combined').toLowerCase();
function __contractsIsContractsOnlyPage() {
    return __CP_CONTRACTS_PAGE_MODE === 'contracts';
}
function __contractsIsReceiptsOnlyPage() {
    return __CP_CONTRACTS_PAGE_MODE === 'receipts';
}
function __contractsApplyPageModeLayout() {
    const tabs = document.getElementById('wk-tabs');
    if (__contractsIsContractsOnlyPage() || __contractsIsReceiptsOnlyPage()) {
        if (tabs) tabs.classList.add('hidden');
    }
}


// --- LOGICA DE TABS SINCRONIZADA ---
window.switchTab = function(tab) { 
    if (__contractsIsContractsOnlyPage()) tab = 'contract';
    if (__contractsIsReceiptsOnlyPage()) tab = 'receipt';
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
        if (styleEditor && __contractsIsAdminProfile()) {
            styleEditor.classList.add('hidden');
            __contractsRenderPdfResourcesEditorList();
            __contractsHighlightSelectedResource();
        }
        __contractsEnsureReceiptEditingChrome();
        __contractsRenderReceiptToolbar();
        
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __contractsPdfMarginGuideController?.refresh(), 90);
        
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
        __contractsCloseReceiptInspector();
        __contractsRenderReceiptToolbar();
        
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __contractsPdfMarginGuideController?.refresh(), 90);
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
            html, body { margin:0; padding:0; background:transparent; font-family:'Segoe UI', Arial, sans-serif; }
            .var-highlight { font-weight:800; background-color:#fef08a; padding:0 2px; border-radius:2px; }
        </style>`;

    let html = rawHtml || '<p style="font-family:Segoe UI, Arial, sans-serif; padding:24px; color:#6b7280; font-weight:700;">Sin plantilla cargada.</p>';
    html = String(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+=(['"]).*?\1/gi, '')
        .replace(/\son\w+=([^\s>]+)/gi, '');

    if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head[\s>][^>]*>/i, (m) => m + headInject);
    } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[\s>][^>]*>/i, (m) => m + `<head>${headInject}</head>`);
    } else {
        html = `<!doctype html><html><head>${headInject}</head><body>${html}</body></html>`;
    }

    iframe.onload = () => {
        __contractsInitContractTextDrag();
        setTimeout(window.adjustPreviewScale, 50);
    };
    iframe.srcdoc = html;
}

function __contractsTemplateTextStorageKey() {
    return `cp_contract_text_layout:${String(__contractsActiveTemplateFile || 'default')}`;
}

function __contractsLoadTemplateTextPositions() {
    const sharedKey = String(__contractsActiveTemplateFile || 'default');
    const shared = __contractsSharedTemplateTextLayouts && typeof __contractsSharedTemplateTextLayouts === 'object'
        ? __contractsSharedTemplateTextLayouts[sharedKey]
        : null;
    if (shared && typeof shared === 'object') {
        try {
            return JSON.parse(JSON.stringify(shared));
        } catch (_) {
            return { ...shared };
        }
    }
    try {
        const raw = window.localStorage.getItem(__contractsTemplateTextStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function __contractsSaveTemplateTextPositions() {
    const safe = __contractsTemplateTextPositions && typeof __contractsTemplateTextPositions === 'object'
        ? JSON.parse(JSON.stringify(__contractsTemplateTextPositions))
        : {};
    try {
        window.localStorage.setItem(__contractsTemplateTextStorageKey(), JSON.stringify(safe));
    } catch (_) {}
    if (__contractsIsAdminProfile()) {
        __contractsSharedTemplateTextLayouts = {
            ...(__contractsSharedTemplateTextLayouts && typeof __contractsSharedTemplateTextLayouts === 'object' ? __contractsSharedTemplateTextLayouts : {}),
            [String(__contractsActiveTemplateFile || 'default')]: safe
        };
        __contractsScheduleSharedPdfStyleSync(__contractsGetPdfStyleConfig());
    }
}

function __contractsCollectTextNodes(doc) {
    if (!doc?.body) return [];
    return Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,div'))
        .filter((node) => node instanceof HTMLElement)
        .filter((node) => {
            const text = String(node.textContent || '').trim();
            if (!text) return false;
            if (node.tagName.toLowerCase() === 'div' && node.childElementCount > 0) return false;
            return true;
        });
}

function __contractsInitContractTextDrag() {
    const iframe = document.getElementById('contract-preview-iframe');
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;
    if (!doc.getElementById('cp-contract-text-drag-style')) {
        const style = doc.createElement('style');
        style.id = 'cp-contract-text-drag-style';
        style.textContent = `
html[data-contract-text-edit="1"] [data-contract-node-key]{cursor:move;outline:1px dashed rgba(37,99,235,.45);outline-offset:2px;transition:outline-color .15s ease;position:relative;}
html[data-contract-text-edit="1"] [data-contract-node-key].is-contract-node-active{outline:2px solid #2563eb;}
`;
        doc.head.appendChild(style);
    }
    doc.documentElement.dataset.contractTextEdit = __contractsIsAdminProfile() ? '1' : '0';
    __contractsTemplateTextPositions = __contractsLoadTemplateTextPositions();
    const nodes = __contractsCollectTextNodes(doc);
    nodes.forEach((node, index) => {
        const key = `node_${index}`;
        node.setAttribute('data-contract-node-key', key);
        const position = __contractsTemplateTextPositions[key] || { x: 0, y: 0 };
        node.style.translate = `${Number(position.x) || 0}px ${Number(position.y) || 0}px`;
    });
    if (doc.body.dataset.cpContractTextDragBound === '1') return;
    doc.body.dataset.cpContractTextDragBound = '1';
    let dragState = null;
    const clearActive = () => {
        doc.querySelectorAll('.is-contract-node-active').forEach((node) => node.classList.remove('is-contract-node-active'));
    };
    const endDrag = () => {
        if (!dragState) return;
        dragState = null;
        clearActive();
        doc.body.style.userSelect = '';
        doc.body.style.cursor = '';
        __contractsSaveTemplateTextPositions();
    };
    doc.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !__contractsIsAdminProfile()) return;
        const target = event.target instanceof Element ? event.target.closest('[data-contract-node-key]') : null;
        if (!(target instanceof HTMLElement)) return;
        const key = String(target.getAttribute('data-contract-node-key') || '');
        const current = __contractsTemplateTextPositions[key] || { x: 0, y: 0 };
        clearActive();
        target.classList.add('is-contract-node-active');
        dragState = {
            node: target,
            key,
            startX: event.clientX,
            startY: event.clientY,
            baseX: Number(current.x) || 0,
            baseY: Number(current.y) || 0
        };
        doc.body.style.userSelect = 'none';
        doc.body.style.cursor = 'move';
        event.preventDefault();
    });
    doc.addEventListener('pointermove', (event) => {
        if (!dragState) return;
        const next = {
            x: Math.round(dragState.baseX + (event.clientX - dragState.startX)),
            y: Math.round(dragState.baseY + (event.clientY - dragState.startY))
        };
        __contractsTemplateTextPositions[dragState.key] = next;
        dragState.node.style.translate = `${next.x}px ${next.y}px`;
        event.preventDefault();
    });
    doc.addEventListener('pointerup', endDrag);
    doc.addEventListener('pointercancel', endDrag);
}

window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(window.adjustPreviewScale, 100);
});

window.openStoredReceipt = async function(filePath) { 
    let rawPath = String(filePath || '').trim();
    if (!rawPath) return window.showToast("Error archivo", "error");
    window.showToast("Abriendo...", "info");

    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (popup) popup.opener = null;
    const openUrl = (url) => {
        if (popup && !popup.closed) {
            popup.location.href = url;
            return;
        }
        const fallback = window.open(url, '_blank', 'noopener,noreferrer');
        if (fallback) fallback.opener = null;
    };

    const normalizeCandidate = (value) => String(value || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^\/+/, '')
        .split(/[?#]/)[0];

    const parsedCandidates = [];
    const parsedBuckets = [];
    const pushRawCandidate = (candidatePath) => {
        const safePath = normalizeCandidate(candidatePath);
        if (!safePath) return;
        if (!parsedCandidates.includes(safePath)) parsedCandidates.push(safePath);
        try {
            const decoded = decodeURIComponent(safePath);
            if (decoded && !parsedCandidates.includes(decoded)) parsedCandidates.push(decoded);
        } catch (_) {}
    };
    const pushCandidate = (bucket, candidatePath) => {
        const safeBucket = String(bucket || '').trim().toLowerCase();
        const safePath = normalizeCandidate(candidatePath);
        if (!safeBucket || !safePath) return;
        if (!parsedBuckets.includes(safeBucket)) parsedBuckets.push(safeBucket);
        pushRawCandidate(safePath);
    };
    const trySignedFromCandidates = async (candidatePaths, bucketCandidates) => {
        for (const bucket of bucketCandidates) {
            for (const candidatePath of candidatePaths) {
                try {
                    const { data, error } = await window.globalPocketBase.storage.from(bucket).createSignedUrl(candidatePath, 3600);
                    if (error || !data?.signedUrl) continue;
                    return data.signedUrl;
                } catch (_) {}
            }
        }
        return '';
    };
    const tryLookupLegacyPath = async (candidatePaths) => {
        const db = window.globalPocketBase;
        if (!db || typeof db.from !== 'function') return '';
        const normalizedCandidates = Array.from(new Set((candidatePaths || []).map(normalizeCandidate).filter(Boolean)));
        if (!normalizedCandidates.length) return '';
        const exactSet = new Set(normalizedCandidates.map((item) => item.toLowerCase()));
        const baseNames = Array.from(new Set(normalizedCandidates
            .map((item) => item.split('/').filter(Boolean).pop() || '')
            .map((item) => item.toLowerCase())
            .filter(Boolean)));
        const firstSegments = Array.from(new Set(normalizedCandidates
            .map((item) => item.split('/').filter(Boolean)[0] || '')
            .map((item) => item.toLowerCase())
            .filter(Boolean)));
        const tenantHints = window.location.pathname.includes('/cotizadorcp')
            ? ['casa_de_piedra', 'plaza_mayor']
            : ['plaza_mayor', 'casa_de_piedra'];
        const rows = [];
        for (const tenant of tenantHints) {
            try {
                const { data, error } = await db.from('documentos').select('*').eq('tenant', tenant).limit(1200);
                if (error || !Array.isArray(data)) continue;
                rows.push(...data);
            } catch (_) {}
        }
        if (!rows.length) {
            try {
                const { data, error } = await db.from('documentos').select('*').limit(1200);
                if (!error && Array.isArray(data)) rows.push(...data);
            } catch (_) {}
        }
        let bestPath = '';
        let bestScore = 0;
        rows.forEach((row) => {
            const filePathRaw = String(row?.file_path || row?.ruta || '').trim();
            const filePath = normalizeCandidate(filePathRaw);
            if (!filePath) return;
            const filePathLc = filePath.toLowerCase();
            const fileNameLc = (filePath.split('/').filter(Boolean).pop() || '').toLowerCase();
            const firstSegLc = (filePath.split('/').filter(Boolean)[0] || '').toLowerCase();
            let score = 0;
            if (exactSet.has(filePathLc)) score += 100;
            if (baseNames.includes(fileNameLc)) score += 30;
            if (firstSegments.includes(firstSegLc)) score += 8;
            if (score > bestScore) {
                bestScore = score;
                bestPath = filePathRaw || filePath;
            }
        });
        return bestScore > 0 ? bestPath : '';
    };

    try {
        if (rawPath.startsWith('{') && rawPath.endsWith('}')) {
            try {
                const parsed = JSON.parse(rawPath);
                rawPath = String(parsed?.file_path || parsed?.path || parsed?.url || rawPath).trim();
            } catch (_) {}
        }
        rawPath = rawPath.replace(/^['"]|['"]$/g, '');
        const directUrl = /^(https?:)?\/\//i.test(rawPath) || rawPath.startsWith('data:') || rawPath.startsWith('blob:');
        const directRelativeUrl = /^\/?(?:api\/files|storage\/v1\/object)\//i.test(rawPath);

        if (directUrl && /^https?:\/\//i.test(rawPath)) {
            try {
                const urlObj = new URL(rawPath);
                const parts = urlObj.pathname.split('/').filter(Boolean);
                const objIdx = parts.findIndex((part, idx) =>
                    part === 'object' && (parts[idx + 1] === 'public' || parts[idx + 1] === 'sign')
                );
                if (objIdx >= 0) {
                    const parsedBucket = parts[objIdx + 2];
                    const parsedPath = parts.slice(objIdx + 3).join('/');
                    pushCandidate(parsedBucket, parsedPath);
                    pushRawCandidate(`${parsedBucket}/${parsedPath}`);
                }
                const bucketIdx = parts.findIndex((part) => /^documentos(?:-cp)?$/i.test(part));
                if (bucketIdx >= 0) {
                    const parsedBucket = parts[bucketIdx];
                    const parsedPath = parts.slice(bucketIdx + 1).join('/');
                    pushCandidate(parsedBucket, parsedPath);
                    pushRawCandidate(`${parsedBucket}/${parsedPath}`);
                }
            } catch (_) {}
        }

        const normalizedPath = normalizeCandidate(rawPath);
        const bucketMatch = normalizedPath.match(/^(documentos(?:-cp)?)\/(.+)$/i);
        const explicitBucket = bucketMatch ? String(bucketMatch[1] || '').toLowerCase() : '';
        const cleanPath = bucketMatch ? String(bucketMatch[2] || '').trim() : normalizedPath;
        if (cleanPath) {
            pushCandidate(explicitBucket || 'documentos-cp', cleanPath);
            pushRawCandidate(cleanPath);
            if (explicitBucket) pushRawCandidate(`${explicitBucket}/${cleanPath}`);
        }
        if (normalizedPath) pushRawCandidate(normalizedPath);

        const storagePathMatch = normalizedPath.match(/\/?storage\/v1\/object\/(?:public|sign)\/(documentos(?:-cp)?)\/(.+)$/i);
        if (storagePathMatch) {
            pushCandidate(storagePathMatch[1], storagePathMatch[2]);
            pushRawCandidate(`${storagePathMatch[1]}/${storagePathMatch[2]}`);
        }

        const apiFileMatch = normalizedPath.match(/\/?api\/files\/documentos\/[^/]+\/(.+)$/i);
        if (apiFileMatch?.[1]) pushRawCandidate(apiFileMatch[1]);

        const candidatePaths = parsedCandidates.length ? parsedCandidates : Array.from(new Set([cleanPath].filter(Boolean)));
        const bucketCandidates = Array.from(new Set([
            ...parsedBuckets,
            ...(explicitBucket ? [explicitBucket] : []),
            'documentos-cp',
            'documentos'
        ]));

        let signedUrl = await trySignedFromCandidates(candidatePaths, bucketCandidates);
        if (!signedUrl) {
            const lookedUpPath = await tryLookupLegacyPath(candidatePaths);
            if (lookedUpPath) {
                pushRawCandidate(lookedUpPath);
                signedUrl = await trySignedFromCandidates(parsedCandidates, bucketCandidates);
            }
        }

        if (signedUrl) {
            openUrl(signedUrl);
            return;
        }
        if (directUrl || directRelativeUrl) {
            const absolute = directUrl ? rawPath : new URL(rawPath, window.location.origin).href;
            openUrl(absolute);
            return;
        }
    } catch (_) {}

    if (popup && !popup.closed) popup.close();
    window.showToast("Error archivo", "error");
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
  ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../public/assets/logocp.png')
  : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../public/assets/logo.png');
let CP_PDF_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.cpPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadCasaPiedraUrl)) || '../public/assets/img/cp-letterhead-default.png';
const RECEIPT_PAGE_WIDTH_PX = 816;
const RECEIPT_PAGE_HEIGHT_PX = 1056;
const LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const LETTERHEAD_MARGINS_DESIGN_PX = { top: 150, right: 45, bottom: 85, left: 45 };
const CP_CONTRACTS_CONTENT_BASE_WIDTH_PX = 816;

function __contractsCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __contractsLetterheadFrame() {
    return {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: RECEIPT_PAGE_WIDTH_PX,
        height: RECEIPT_PAGE_HEIGHT_PX
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
    return `<div${idAttr} data-pdf-preview-page="1" class="bg-white font-sans text-gray-800 relative leading-relaxed" style="width:${RECEIPT_PAGE_WIDTH_PX}px;min-height:${RECEIPT_PAGE_HEIGHT_PX}px;height:${RECEIPT_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:visible;background:#f5f5f5;">${imageLayer}<div data-pdf-preview-frame="1" data-base-width="${baseWidth}" data-base-height="${baseHeight}" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:visible;z-index:1;">${innerHtml}</div></div>`;
}
// Aislar plantillas por tenant: Casa de Piedra usa su propio bucket
const TEMPLATE_BUCKET = 'documentos-cp';
const TEMPLATE_PATH = 'templates_contratos';
const LETTERHEAD_PATH = 'membretes_pdf';
const CFG_TEMPLATE_DEFAULT_KEY = 'contract_template_default';
const CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __CP_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY = 'cp_contract_template_letterhead_enabled';
let __contractsActiveTemplateFile = '';
let __contractsTemplateTextPositions = {};
let __contractsSharedTemplateTextLayouts = {};

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
let cpReceiptsRestoringViewState = false;
const CP_RECEIPTS_VIEW_STATE_SCOPE = `cp_receipts:${__CP_CONTRACTS_PAGE_MODE || 'combined'}`;
let currentRemainingBalance = 0;
let pendingAction = null;
let defaultTemplateFile = '';
let __contractsTemplateLetterheadEnabled = true;

function cpReceiptsParseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value) || {}; } catch (_) { return {}; }
    }
    return {};
}

function cpReceiptsIsConvenioOrder(order = {}) {
    const details = cpReceiptsParseJson(order?.detalles_evento);
    if (details?.convenio?.activo === true) return true;
    const spaces = cpReceiptsParseJson(order?.espacios_detalle);
    return Array.isArray(spaces) && spaces.some((item) => item?.convenio_activo === true || item?.convenio_indefinido === true);
}

function cpReceiptsViewStateApi() {
    return window.__HUB_VIEW_STATE || null;
}

function cpReceiptsReadViewState() {
    const api = cpReceiptsViewStateApi();
    return api?.read ? (api.read(CP_RECEIPTS_VIEW_STATE_SCOPE, { maxAgeMs: 30 * 60 * 1000 }) || null) : null;
}

function cpReceiptsApplyViewStateControls(state = cpReceiptsReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const searchEl = document.getElementById('search-approved');
    if (searchEl && typeof state.search === 'string') searchEl.value = state.search;
}

function cpReceiptsSaveViewState(extra = {}) {
    const api = cpReceiptsViewStateApi();
    if (!api?.write) return null;
    return api.write(CP_RECEIPTS_VIEW_STATE_SCOPE, {
        search: document.getElementById('search-approved')?.value || '',
        selectedOrderId: String(extra.selectedOrderId || selectedOrder?.id || '').trim(),
        windowScrollY: api.getWindowScrollY ? api.getWindowScrollY() : (window.scrollY || 0),
        elementScrolls: {
            '#approved-list': api.getElementScrollTop ? api.getElementScrollTop('#approved-list') : (document.getElementById('approved-list')?.scrollTop || 0)
        },
        ...(extra && typeof extra === 'object' ? extra : {})
    });
}

function cpReceiptsRestoreViewStateAfterRender(state = cpReceiptsReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const api = cpReceiptsViewStateApi();
    if (api?.restoreScrollState) api.restoreScrollState(state);
    const selectedOrderId = String(state.selectedOrderId || '').trim();
    if (!selectedOrderId) return;
    window.setTimeout(() => {
        const target = document.querySelector(`#approved-list [data-order-id="${selectedOrderId}"]`);
        if (target && typeof target.click === 'function') target.click();
    }, 90);
}

function cpReceiptsFilterApprovedOrders(term, options = {}) {
    const lower = String(term || '').toLowerCase();
    renderOrderList(approvedOrders.filter(o => o.cliente_nombre.toLowerCase().includes(lower) || (o.numero_orden && o.numero_orden.toLowerCase().includes(lower))));
    if (!cpReceiptsRestoringViewState && options.skipSave !== true) cpReceiptsSaveViewState();
}

function __contractsIsTemplateLetterheadEnabled() {
    return __contractsTemplateLetterheadEnabled !== false;
}

function __contractsSyncTemplateLetterheadToggle() {
    const toggle = document.getElementById('contract-letterhead-toggle');
    if (toggle) toggle.checked = __contractsIsTemplateLetterheadEnabled();
}

function __contractsLoadTemplateLetterheadPreference() {
    try {
        const stored = window.localStorage.getItem(__CP_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY);
        __contractsTemplateLetterheadEnabled = stored !== 'false';
    } catch (_) {
        __contractsTemplateLetterheadEnabled = true;
    }
    __contractsSyncTemplateLetterheadToggle();
}

function __contractsBindTemplateLetterheadToggle() {
    const toggle = document.getElementById('contract-letterhead-toggle');
    if (!toggle || toggle.dataset.bound === '1') {
        __contractsSyncTemplateLetterheadToggle();
        return;
    }
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', () => {
        __contractsTemplateLetterheadEnabled = !!toggle.checked;
        try {
            window.localStorage.setItem(__CP_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY, String(__contractsTemplateLetterheadEnabled));
        } catch (_) {}
        if (window.loadSelectedTemplate && document.getElementById('template-selector').value) {
            window.loadSelectedTemplate();
        }
    });
    __contractsSyncTemplateLetterheadToggle();
}

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
        .replace(/\sstyle=(["'])([^"']*?)background(?:-color)?\s*:\s*[^;"']+;?([^"']*)\1/gi, (match, quote, before, after) => {
            const cleaned = `${before || ''}${after || ''}`.replace(/\s{2,}/g, ' ').trim();
            return cleaned ? ` style=${quote}${cleaned}${quote}` : '';
        })
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

const __CP_CONTRACTS_PDF_STYLE_TENANT = 'casa_de_piedra';
const __CP_CONTRACTS_PDF_OVERLAYS_COLLECTION = 'pdf_overlays';
const __CP_CONTRACTS_PDF_OVERLAY_TYPES = Object.freeze({
    receipts: 'generator:receipts',
    contracts: 'generator:contracts'
});
const __CP_CONTRACTS_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'liquidation', 'contract']);
const __CP_CONTRACTS_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const __CP_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS = Object.freeze({
    liquidatedTitle: 'Constancia de Liquidación',
    liquidatedClientLabel: 'Cliente:',
    liquidatedSpaceLabel: 'Espacio:',
    liquidatedTotalLabel: 'Total Contrato:',
    liquidatedPaymentsHeading: 'Resumen de Pagos Realizados',
    liquidatedBalanceLabel: 'Saldo Pendiente',
    liquidatedWatermarkText: 'LIQUIDADO',
    liquidatedFooterLine1: 'Este documento certifica que la orden de referencia ha sido liquidada en su totalidad.',
    liquidatedFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
    receiptTitle: 'Recibo de Pago',
    receiptReceivedFromLabel: 'Recibimos de:',
    receiptAmountLabel: 'La cantidad de:',
    receiptConceptLabel: 'Concepto:',
    receiptInternalReferenceLabel: 'Referencia Interna:',
    receiptBankHeading: 'Datos Bancarios',
    receiptBankLabel: 'Banco:',
    receiptAccountLabel: 'Cuenta/CLABE:',
    receiptReferenceHeading: 'Referencia',
    receiptPendingBalanceLabel: 'Saldo Pendiente por Liquidar',
    receiptFooterLine1: 'Este documento es un comprobante de pago interno. No válido como factura fiscal.',
    receiptFooterLine2: 'Generado digitalmente a través de Marketing Hub.',
    annexHintTitle: 'Página adicional editable',
    annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
});
const __CP_CONTRACTS_PDF_BASE_BLOCKS = Object.freeze([
    { id: 'base:header', key: 'header', label: 'Encabezado' },
    { id: 'base:summary-main', key: 'summary-main', label: 'Resumen principal' },
    { id: 'base:details', key: 'details', label: 'Detalle' },
    { id: 'base:balance', key: 'balance', label: 'Saldo' },
    { id: 'base:sign', key: 'sign', label: 'Firma cliente' },
    { id: 'base:footer', key: 'footer', label: 'Footer' },
    { id: 'base:watermark', key: 'watermark', label: 'Marca de agua' }
]);
const __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -2400, max: 2400 },
    y: { min: -3200, max: 3200 },
    scalePct: { min: 15, max: 500 },
    angle: { min: -360, max: 360 }
});
const __CP_CONTRACTS_PDF_MOVABLE_RESOURCE_TYPES = Object.freeze(['bar', 'logo', 'sign', 'sign-block', 'title']);
const __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS = Object.freeze({
    receiptLeftName: 'Cobranza / Finanzas',
    receiptLeftRole: 'Casa de Piedra',
    receiptRightName: 'Mercadotecnia',
    receiptRightRole: 'Casa de Piedra',
    liquidatedLeftName: 'Cobranza',
    liquidatedLeftRole: 'Casa de Piedra',
    liquidatedRightName: 'Administración',
    liquidatedRightRole: 'Casa de Piedra',
    clientName: 'CLIENTE',
    clientRole: 'Cliente / Representante'
});
const __CP_CONTRACTS_PDF_STYLE_DEFAULTS = Object.freeze({
    fontFamilyKey: 'segoe',
    headerLinePx: 4,
    signLinePx: 2,
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
    resourcesInitialized: false,
    signLabels: __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS,
    content: __CP_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS,
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
let __contractsPdfStyleConfigStore = '';
let __contractsPdfStyleRawPayload = null;
let __contractsPdfStyleSyncTimer = null;
let __contractsPdfStyleUiState = { collapsed: false, pinned: false };
let __contractsPdfStyleActiveProfile = 'receipt';
let __contractsPdfResourceSelectedId = '';
let __contractsPdfResourcePointerState = null;
let __contractsPdfResourceClipboard = null;
let __contractsPdfMarginGuideController = null;
let __contractsReceiptEditLocked = true;
let __contractsReceiptInspectorState = null;

function __contractsClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __contractsNormalizeAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __contractsRenderFontFamilyOptions(selectedKey) {
    const active = String(selectedKey || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey || 'segoe').toLowerCase();
    return Object.entries(__CP_CONTRACTS_PDF_STYLE_FONT_MAP)
        .map(([key, stack]) => {
            const label = stack
                .split(',')
                .map((item) => item.replace(/["']/g, '').trim())
                .find(Boolean) || key;
            return `<option value="${key}" ${key === active ? 'selected' : ''}>${__contractsSafeHtml(label)}</option>`;
        })
        .join('');
}

function __contractsSafeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function __contractsNormalizeHexColor(value, fallback = '#111827') {
    const raw = String(value || '').trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(raw)) {
        if (raw.length === 4) {
            return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
        }
        return raw.toLowerCase();
    }
    return fallback;
}

function __contractsGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __CP_CONTRACTS_PDF_BASE_BLOCKS.find((block) => block.key === safe) || null;
}

function __contractsCanMoveReceiptBaseBlock(key) {
    return !!__contractsGetPdfBaseBlockMeta(key);
}

function __contractsCanEditReceiptBaseBlock(key) {
    return !!__contractsGetPdfBaseBlockMeta(key);
}

function __contractsIsTemplateDrivenResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    const text = `${resource.text || ''} ${resource.signTitle || ''} ${resource.signRole || ''}`;
    return /\{\{[^}]+\}\}/.test(text);
}

function __contractsCanMoveReceiptResource(resource) {
    return !!resource && typeof resource === 'object';
}

function __contractsCanEditReceiptResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    if (resource.isUserNote === true) return true;
    const type = String(resource.type || '').toLowerCase();
    if (type === 'sign' || type === 'sign-line' || type === 'sign-block') return true;
    if (type === 'title' || type === 'text') return !__contractsIsTemplateDrivenResource(resource);
    return false;
}

function __contractsFindReceiptResourceById(resourceId, page = null) {
    const safeId = String(resourceId || '').trim();
    if (!safeId) return null;
    const desiredPage = page == null ? null : __contractsClampStyleNumber(page, 1, 8, 1);
    return __contractsGetPdfResourcesFromState().find((resource) => {
        if (String(resource.id || '') !== safeId) return false;
        if (desiredPage == null) return true;
        return Number(resource.page || 1) === desiredPage;
    }) || null;
}

function __contractsNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __contractsClampStyleNumber(base.x, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.min, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __contractsClampStyleNumber(base.y, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.min, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __contractsClampStyleNumber(base.scalePct ?? base.scale, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        angle: __contractsClampStyleNumber(base.angle, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.angle.min, __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.angle.max, 0),
        hidden: base.hidden === true
    };
}

function __contractsNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __CP_CONTRACTS_PDF_BASE_BLOCKS.forEach((block) => {
        out[block.key] = __contractsNormalizePdfBaseLayout(source[block.key] || {});
        Object.keys(source).forEach((k) => {
            if (k.startsWith(block.key + '__')) out[k] = __contractsNormalizePdfBaseLayout(source[k]);
        });
    });
    return out;
}

function __contractsBuildPdfBaseTransform(layout) {
    const safe = __contractsNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) rotate(${safe.angle || 0}deg) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __contractsNormalizePdfSignLabels(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS;
    const read = (key, max = 80) => String(base[key] ?? defaults[key] ?? '').slice(0, max);
    return {
        receiptLeftName: read('receiptLeftName'),
        receiptLeftRole: read('receiptLeftRole'),
        receiptRightName: read('receiptRightName'),
        receiptRightRole: read('receiptRightRole'),
        liquidatedLeftName: read('liquidatedLeftName'),
        liquidatedLeftRole: read('liquidatedLeftRole'),
        liquidatedRightName: read('liquidatedRightName'),
        liquidatedRightRole: read('liquidatedRightRole'),
        clientName: defaults.clientName,
        clientRole: defaults.clientRole
    };
}

function __contractsEscapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function __contractsResolveResourceTemplate(value, context = {}) {
    let output = String(value ?? '');
    const tokens = context && typeof context === 'object'
        ? (context.tokens && typeof context.tokens === 'object' ? context.tokens : {})
        : {};
    Object.entries(tokens).forEach(([token, tokenValue]) => {
        const safeToken = String(token || '').trim();
        if (!safeToken) return;
        const replaceValue = String(tokenValue ?? '');
        const pattern = new RegExp(`\\{\\{\\s*${__contractsEscapeRegExp(safeToken)}\\s*\\}\\}`, 'gi');
        output = output.replace(pattern, replaceValue);
    });
    return output;
}

function __contractsBuildReceiptResourceContext({ isLiquidated, dateStr, timeStr, pdfContent, signLabels } = {}) {
    const content = __contractsNormalizePdfContent(pdfContent || {});
    const labels = __contractsNormalizePdfSignLabels(signLabels || {});
    const liquidatedMode = isLiquidated === true;
    const safeOrderNum = String(selectedOrder?.numero_orden || '---').trim() || '---';
    const safeShortId = String(selectedOrder?.id || '').slice(0, 8).toUpperCase();
    const clientName = String(selectedOrder?.cliente_nombre || labels.clientName || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientName || 'CLIENTE').trim();
    const clientRole = String(labels.clientRole || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientRole || '').trim();
    return {
        tokens: {
            DOC_TITLE: liquidatedMode ? String(content.liquidatedTitle || 'Constancia de Liquidación') : String(content.receiptTitle || 'Recibo de Pago'),
            DOC_FOLIO: safeOrderNum,
            DOC_ID_SHORT: safeShortId,
            DOC_DATE: String(dateStr || ''),
            DOC_TIME: String(timeStr || ''),
            DOC_DATE_LABEL: liquidatedMode ? 'EMISION' : 'FECHA',
            DOC_TIME_LABEL: 'HORA',
            CLIENT_NAME: clientName,
            SIGN_LEFT_NAME: liquidatedMode ? String(labels.liquidatedLeftName || '') : String(labels.receiptLeftName || ''),
            SIGN_LEFT_ROLE: liquidatedMode ? String(labels.liquidatedLeftRole || '') : String(labels.receiptLeftRole || ''),
            SIGN_RIGHT_NAME: liquidatedMode ? String(labels.liquidatedRightName || '') : String(labels.receiptRightName || ''),
            SIGN_RIGHT_ROLE: liquidatedMode ? String(labels.liquidatedRightRole || '') : String(labels.receiptRightRole || ''),
            SIGN_CLIENT_NAME: clientName || String(labels.clientName || ''),
            SIGN_CLIENT_ROLE: clientRole,
            CURRENT_USER_NAME: __contractsResolveReceiptActorName(),
            CURRENT_USER_EMAIL: __contractsResolveReceiptActorEmail()
        }
    };
}

const __CP_CONTRACTS_PDF_TEMPLATE_TOKENS = Object.freeze([
    { token: 'DOC_TITLE', label: 'Titulo del documento' },
    { token: 'DOC_FOLIO', label: 'Folio de la orden' },
    { token: 'DOC_ID_SHORT', label: 'ID corto del registro' },
    { token: 'DOC_DATE', label: 'Fecha del documento' },
    { token: 'DOC_TIME', label: 'Hora del documento' },
    { token: 'DOC_DATE_LABEL', label: 'Etiqueta de fecha' },
    { token: 'DOC_TIME_LABEL', label: 'Etiqueta de hora' },
    { token: 'CLIENT_NAME', label: 'Nombre del cliente' },
    { token: 'SIGN_LEFT_NAME', label: 'Firma izquierda: nombre' },
    { token: 'SIGN_LEFT_ROLE', label: 'Firma izquierda: cargo' },
    { token: 'SIGN_RIGHT_NAME', label: 'Firma derecha: nombre' },
    { token: 'SIGN_RIGHT_ROLE', label: 'Firma derecha: cargo' },
    { token: 'SIGN_CLIENT_NAME', label: 'Firma cliente: nombre' },
    { token: 'SIGN_CLIENT_ROLE', label: 'Firma cliente: cargo' },
    { token: 'CURRENT_USER_NAME', label: 'Usuario actual' },
    { token: 'CURRENT_USER_EMAIL', label: 'Correo del usuario actual' }
]);

let __contractsPdfTemplateInsertTarget = null;
let __contractsPdfTemplateInsertMeta = null;
function __contractsPdfTemplateSelectorEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function __contractsIsPdfTemplateEditableField(node) {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false;
    if (node.disabled || node.readOnly) return false;
    if (node instanceof HTMLInputElement) {
        const type = String(node.type || 'text').toLowerCase();
        if (!['text', 'search', 'email', 'url', 'tel'].includes(type)) return false;
    }
    return !!(
        String(node.getAttribute('data-res-field') || '').trim()
        || String(node.getAttribute('data-base-field') || '').trim()
        || String(node.getAttribute('data-pdf-inspector-field') || '').trim()
    );
}
function __contractsDescribePdfTemplateInsertTarget(node) {
    if (!__contractsIsPdfTemplateEditableField(node)) return null;
    const resId = String(node.getAttribute('data-res-id') || '').trim();
    const resField = String(node.getAttribute('data-res-field') || '').trim();
    if (resId && resField) return { type: 'resource', id: resId, field: resField };
    const baseId = String(node.getAttribute('data-base-id') || '').trim();
    const baseField = String(node.getAttribute('data-base-field') || '').trim();
    if (baseId && baseField) return { type: 'base', id: baseId, field: baseField };
    const inspectorId = String(node.getAttribute('data-target-id') || '').trim();
    const inspectorField = String(node.getAttribute('data-pdf-inspector-field') || '').trim();
    if (inspectorId && inspectorField) return { type: 'inspector', id: inspectorId, field: inspectorField };
    return null;
}
function __contractsResolvePdfTemplateInsertTargetFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (meta.type === 'resource' && meta.id && meta.field) {
        return document.querySelector(`[data-res-id="${__contractsPdfTemplateSelectorEscape(meta.id)}"][data-res-field="${__contractsPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'base' && meta.id && meta.field) {
        return document.querySelector(`[data-base-id="${__contractsPdfTemplateSelectorEscape(meta.id)}"][data-base-field="${__contractsPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'inspector' && meta.id && meta.field) {
        return document.querySelector(`[data-target-id="${__contractsPdfTemplateSelectorEscape(meta.id)}"][data-pdf-inspector-field="${__contractsPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    return null;
}
function __contractsRememberPdfTemplateInsertTarget(node) {
    const meta = __contractsDescribePdfTemplateInsertTarget(node);
    if (!meta) return;
    __contractsPdfTemplateInsertTarget = node;
    __contractsPdfTemplateInsertMeta = meta;
}
function __contractsResolvePdfTemplateInsertTarget() {
    if (__contractsIsPdfTemplateEditableField(document.activeElement)) {
        __contractsRememberPdfTemplateInsertTarget(document.activeElement);
        return document.activeElement;
    }
    if (__contractsPdfTemplateInsertTarget instanceof Element && document.body.contains(__contractsPdfTemplateInsertTarget) && __contractsIsPdfTemplateEditableField(__contractsPdfTemplateInsertTarget)) {
        return __contractsPdfTemplateInsertTarget;
    }
    const restored = __contractsResolvePdfTemplateInsertTargetFromMeta(__contractsPdfTemplateInsertMeta);
    if (__contractsIsPdfTemplateEditableField(restored)) {
        __contractsPdfTemplateInsertTarget = restored;
        return restored;
    }
    return null;
}
function __contractsInsertPdfTemplateToken(token) {
    const safeToken = String(token || '').trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
    if (!safeToken) return false;
    const insertValue = `{{${safeToken}}}`;
    const target = __contractsResolvePdfTemplateInsertTarget();
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        try {
            navigator.clipboard.writeText(insertValue);
            window.showToast?.('Etiqueta copiada', 'success');
        } catch (_) {}
        return false;
    }
    const currentValue = String(target.value || '');
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : currentValue.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    target.value = `${currentValue.slice(0, start)}${insertValue}${currentValue.slice(end)}`;
    const caret = start + insertValue.length;
    try {
        target.focus();
        target.setSelectionRange?.(caret, caret);
    } catch (_) {}
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    window.showToast?.('Etiqueta insertada', 'success');
    return true;
}
function __contractsBuildTemplateTagButtonHtml(item, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const scope = String(opts.scope || 'cp-receipts').trim();
    const token = String(item?.token || '').trim();
    const label = String(item?.label || token || '').trim();
    const tokenLabel = `{{${token}}}`;
    if (opts.style === 'modal') {
        return `
        <button type="button" data-pdf-template-scope="${__contractsSafeHtml(scope)}" data-pdf-template-token="${__contractsSafeHtml(token)}" class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:border-brand-red hover:bg-red-50/40">
            <div class="min-w-0">
                <code class="text-[11px] font-black text-brand-red">${__contractsSafeHtml(tokenLabel)}</code>
                <p class="mt-1 text-[11px] font-semibold text-gray-600">${__contractsSafeHtml(label)}</p>
            </div>
            <span class="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-brand-dark shadow-sm">Insertar</span>
        </button>`;
    }
    return `<button type="button" data-pdf-template-scope="${__contractsSafeHtml(scope)}" data-pdf-template-token="${__contractsSafeHtml(token)}" title="${__contractsSafeHtml(label)}" class="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black text-brand-red shadow-sm transition hover:border-brand-red hover:text-brand-red">${__contractsSafeHtml(tokenLabel)}</button>`;
}

function __contractsTemplateTagsModalHtml() {
    const rows = __CP_CONTRACTS_PDF_TEMPLATE_TOKENS.map((item) => __contractsBuildTemplateTagButtonHtml(item, { style: 'modal' })).join('');
    return `<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl p-6">
        <div class="flex items-start justify-between gap-4 mb-4">
            <div><h3 class="text-lg font-black text-gray-900 uppercase tracking-tight">Etiquetas para PDF</h3><p class="text-xs text-gray-500 mt-1">Haz clic para insertarlas en el ultimo campo de texto o firma que estabas editando. Si no hay campo activo, se copiaran al portapapeles.</p></div>
            <button type="button" onclick="window.closeModal('pdf-template-tags-modal')" class="text-gray-400 hover:text-gray-700"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">${rows}</div>
    </div>`;
}

window.openPdfTemplateTagsModal = function () {
    let modal = document.getElementById('pdf-template-tags-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pdf-template-tags-modal';
        modal.className = 'fixed inset-0 z-[520] hidden items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal('pdf-template-tags-modal'); });
        document.body.appendChild(modal);
    }
    modal.innerHTML = __contractsTemplateTagsModalHtml();
    window.openModal('pdf-template-tags-modal');
};

function __contractsTemplateTagsInlineHtml() {
    return `<div class="flex flex-wrap gap-2">${__CP_CONTRACTS_PDF_TEMPLATE_TOKENS.map((item) => __contractsBuildTemplateTagButtonHtml(item)).join('')}</div>`;
}

function __contractsSyncPdfTemplateTagHelpers() {
    document.querySelectorAll('[data-pdf-template-helper="cp-contracts"]').forEach((host) => {
        host.innerHTML = __contractsTemplateTagsInlineHtml();
    });
}

function __contractsBindPdfTemplateTagHelpers() {
    if (document.body.dataset.cpReceiptsPdfTemplateHelpersBound === '1') return;
    document.body.dataset.cpReceiptsPdfTemplateHelpersBound = '1';
    document.addEventListener('focusin', (event) => {
        __contractsRememberPdfTemplateInsertTarget(event.target);
    });
    document.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-pdf-template-scope="cp-receipts"][data-pdf-template-token]') : null;
        if (!button) return;
        event.preventDefault();
        __contractsInsertPdfTemplateToken(String(button.getAttribute('data-pdf-template-token') || ''));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        __contractsSyncPdfTemplateTagHelpers();
        __contractsBindPdfTemplateTagHelpers();
    }, { once: true });
} else {
    __contractsSyncPdfTemplateTagHelpers();
    __contractsBindPdfTemplateTagHelpers();
}

function __contractsBuildDefaultReceiptResources() {
    return __contractsNormalizePdfResources([
        {
            id: 'cpc_def_doc_title',
            type: 'title',
            page: 1,
            x: 460,
            y: 52,
            w: 300,
            h: 44,
            text: '{{DOC_TITLE}}',
            fontSize: 34,
            align: 'right',
            color: '#111827',
            bgColor: 'transparent',
            bold: true
        },
        {
            id: 'cpc_def_doc_folio',
            type: 'text',
            page: 1,
            x: 460,
            y: 98,
            w: 300,
            h: 20,
            text: 'FOLIO: {{DOC_FOLIO}}',
            fontSize: 14,
            align: 'right',
            color: '#374151',
            bgColor: 'transparent',
            bold: true
        },
        {
            id: 'cpc_def_doc_date',
            type: 'text',
            page: 1,
            x: 460,
            y: 120,
            w: 300,
            h: 18,
            text: '{{DOC_DATE_LABEL}}: {{DOC_DATE}}',
            fontSize: 12,
            align: 'right',
            color: '#6b7280',
            bgColor: 'transparent'
        },
        {
            id: 'cpc_def_doc_time',
            type: 'text',
            page: 1,
            x: 460,
            y: 138,
            w: 300,
            h: 16,
            text: '{{DOC_TIME_LABEL}}: {{DOC_TIME}}',
            fontSize: 11,
            align: 'right',
            color: '#9ca3af',
            bgColor: 'transparent'
        },
        {
            id: 'cpc_def_sign_left',
            type: 'sign-block',
            page: 1,
            x: 70,
            y: 878,
            w: 210,
            h: 56,
            signTitle: '{{SIGN_LEFT_NAME}}',
            signRole: '{{SIGN_LEFT_ROLE}}',
            fontSize: 13,
            color: '#111827',
            bgColor: '#111827'
        },
        {
            id: 'cpc_def_sign_client',
            type: 'sign-block',
            page: 1,
            x: 304,
            y: 878,
            w: 210,
            h: 56,
            signTitle: '{{SIGN_CLIENT_NAME}}',
            signRole: '{{SIGN_CLIENT_ROLE}}',
            fontSize: 13,
            color: '#111827',
            bgColor: '#111827'
        },
        {
            id: 'cpc_def_sign_right',
            type: 'sign-block',
            page: 1,
            x: 538,
            y: 878,
            w: 210,
            h: 56,
            signTitle: '{{SIGN_RIGHT_NAME}}',
            signRole: '{{SIGN_RIGHT_ROLE}}',
            fontSize: 13,
            color: '#111827',
            bgColor: '#111827'
        }
    ]);
}

function __contractsEnsureReceiptResourceDefaults(style, options = {}) {
    const safe = __contractsNormalizePdfStyle(style || {});
    if (safe.resourcesInitialized || (Array.isArray(safe.resources) && safe.resources.length > 0)) return safe;
    const next = __contractsNormalizePdfStyle({
        ...safe,
        resourcesInitialized: true,
        resources: __contractsBuildDefaultReceiptResources()
    });
    if (options.persist === true && __contractsIsAdminProfile()) {
        __contractsSetPdfStyleConfig(next, { applyToDom: true });
        __contractsScheduleSharedPdfStyleSync(next);
    }
    return next;
}

function __contractsNormalizePdfResources(raw) {
    const list = (Array.isArray(raw) ? raw : []).filter((item) => !(item && typeof item === 'object' && item.isUserNote === true));
    return list.slice(0, 80).map((item, index) => {
        const base = item && typeof item === 'object' ? item : {};
        const rawType = String(base.type || '').toLowerCase();
        const normalizedType = rawType === 'sign-line' ? 'sign' : rawType;
        const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
        const isSign = safeType === 'sign' || safeType === 'sign-block';
        const defaultW = safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : (isSign ? 220 : 260));
        const defaultH = safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : (safeType === 'sign' ? 24 : (safeType === 'sign-block' ? 42 : 14)));
        const defaultColor = safeType === 'logo'
            ? 'transparent'
            : (isSign ? '#111827' : (safeType === 'bar' ? '#c1621e' : 'transparent'));
        const safeId = String(base.id || `cpc_res_${Date.now()}_${index}`);
        const shouldForceTransparent = (safeType === 'title' || safeType === 'text')
            && /^cpc_def_doc_/i.test(safeId)
            && String(base.bgColor || '').trim().toLowerCase() === '#ffffff';
        const normalizedBg = __contractsNormalizeHexColor(base.bgColor, defaultColor);
        return {
            id: safeId,
            type: safeType,
            enabled: base.enabled !== false,
            page: __contractsClampStyleNumber(base.page, 1, 8, 1),
            x: __contractsClampStyleNumber(base.x, -4000, 4000, 80),
            y: __contractsClampStyleNumber(base.y, -5000, 5000, 120),
            w: __contractsClampStyleNumber(base.w, 16, 4000, defaultW),
            h: __contractsClampStyleNumber(base.h, 1, 5000, defaultH),
            bgColor: shouldForceTransparent ? 'transparent' : normalizedBg,
            text: safeType === 'title' || safeType === 'text' ? String(base.text || '').slice(0, 500) : '',
            fontFamilyKey: String(base.fontFamilyKey || ''),
            fontSize: __contractsClampStyleNumber(base.fontSize, 8, 72, safeType === 'title' ? 24 : 14),
            align: __contractsNormalizeAlign(base.align, 'left'),
            color: __contractsNormalizeHexColor(base.color, '#111827'),
            bold: !!base.bold,
            italic: !!base.italic,
            underline: !!base.underline,
            angle: __contractsClampStyleNumber(base.angle, -360, 360, 0),
            signTitle: safeType === 'sign-block' ? String(base.signTitle || '').slice(0, 80) : '',
            signRole: safeType === 'sign-block' ? String(base.signRole || '').slice(0, 80) : ''
        };
    });
}

function __contractsRenderPdfResources(style, pageIndex, context = {}) {
    const cfg = __contractsNormalizePdfStyle(style || {});
    const resources = __contractsNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    const isAdmin = __contractsIsAdminProfile();
    const globalFont = __CP_CONTRACTS_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __CP_CONTRACTS_PDF_STYLE_FONT_MAP.segoe;
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const isSignBlock = resource.type === 'sign-block';
            const isSign = resource.type === 'sign' || resource.type === 'sign-line';
            let bgFill = resource.bgColor;
            if (resource.type !== 'bar' || resource.type === 'logo' || isSign || isSignBlock) bgFill = 'transparent';
            const extraWrapStyle = isSignBlock ? 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none;' : '';
            const rectEvents = isSignBlock && isAdmin ? 'pointer-events:auto;' : '';
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:35;box-sizing:border-box;pointer-events:${isAdmin ? 'auto' : 'none'};background:${bgFill};transform:rotate(${resource.angle || 0}deg);transform-origin:center center;${extraWrapStyle}`;
            const deleteBtnHtml = isAdmin ? `<div class="cpc-pdf-delete-btn" data-res-action="remove" data-res-id="${__contractsSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';

            if (resource.type === 'logo') {
                return `<div class="cpc-pdf-resource ${isAdmin ? 'cpc-pdf-editable' : ''}" data-res-id="${__contractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="logo" style="${common}padding:0;border-radius:0;"><img src="${__contractsSafeHtml(LOGO_URL)}" alt="Logo tenant" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">${deleteBtnHtml}</div>`;
            }

            if (isSign) {
                const lineColor = resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#111827';
                return `<div class="cpc-pdf-resource ${isAdmin ? 'cpc-pdf-editable' : ''}" data-res-id="${__contractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="sign" style="${common}background:transparent;border-radius:2px;"><div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${lineColor};transform:translateY(-50%);border-radius:999px;"></div>${deleteBtnHtml}</div>`;
            }

            if (isSignBlock) {
                const titleStr = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.signTitle || '', context));
                const roleStr = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.signRole || '', context));
                const tColor = resource.color && resource.color !== 'transparent' ? resource.color : '#111827';
                const lineColor = resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#111827';
                const titleSize = Math.max(10, Number(resource.fontSize || 14));
                const roleSize = Math.max(9, titleSize - 2);
                const fontStack = resource.fontFamilyKey && __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                return `
                <div class="cpc-pdf-resource ${isAdmin ? 'cpc-pdf-editable' : ''}" data-res-id="${__contractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="sign-block" style="${common}${rectEvents}">
                    <div style="width:100%;height:2px;background:${lineColor};border-radius:999px;margin-bottom:4px;"></div>
                    <div style="width:100%;text-align:center;color:${tColor};font-family:${fontStack};pointer-events:none;user-select:none;">
                        ${titleStr ? `<div style="font-size:${titleSize}px;font-weight:800;line-height:1.2;">${titleStr}</div>` : ''}
                        ${roleStr ? `<div style="font-size:${roleSize}px;text-transform:uppercase;opacity:0.6;margin-top:2px;">${roleStr}</div>` : ''}
                    </div>
                
                    ${deleteBtnHtml}
                </div>
                `;
            }

            if (resource.type === 'title' || resource.type === 'text') {
                const fontStack = resource.fontFamilyKey && __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const fw = resource.bold ? '800' : 'normal';
                const fs = resource.italic ? 'italic' : 'normal';
                const td = resource.underline ? 'underline' : 'none';
                const ta = resource.align;
                const tColor = resource.color && resource.color !== 'transparent' ? resource.color : '#111827';
                const content = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.text, context));
                const placeholder = isAdmin && !content ? (resource.type === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
                return `
                <div class="cpc-pdf-resource ${isAdmin ? 'cpc-pdf-editable' : ''}" data-res-id="${__contractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="${resource.type}" data-res-font-size="${resource.fontSize}" style="${common}">
                    <div style="width:100%;height:100%;padding:4px;overflow:hidden;font-family:${fontStack};font-size:${resource.fontSize}px;font-weight:${fw};font-style:${fs};text-decoration:${td};text-align:${ta};color:${tColor};white-space:pre-wrap;pointer-events:none;user-select:none;display:flex;flex-direction:column;justify-content:flex-start;">
                        ${content || `<span style="opacity:0.3;">${placeholder}</span>`}
                    </div>
                 
                    ${deleteBtnHtml}
                </div>
                `;
            }
            
            return `<div class="cpc-pdf-resource ${isAdmin ? 'cpc-pdf-editable' : ''}" data-res-id="${__contractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="${resource.type}" style="${common}background:${resource.type === 'bar' ? resource.bgColor : 'transparent'};border-radius:2px;">${deleteBtnHtml}</div>`;
        })
        .join('');
}

function __contractsAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (type !== 'text' && type !== 'title') return;
    const textNode = node.firstElementChild instanceof HTMLElement ? node.firstElementChild : node;
    if (!(textNode instanceof HTMLElement)) return;
    const baseFont = __contractsClampStyleNumber(
        node.getAttribute('data-res-font-size')
        || textNode.style.fontSize
        || window.getComputedStyle(textNode).fontSize,
        8,
        72,
        14
    );
    textNode.style.fontSize = `${baseFont}px`;
    textNode.style.lineHeight = '1.2';
    if ((textNode.scrollWidth <= textNode.clientWidth + 1) && (textNode.scrollHeight <= textNode.clientHeight + 1)) return;
    let low = 8;
    let high = baseFont;
    let best = 8;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        textNode.style.fontSize = `${mid}px`;
        if ((textNode.scrollWidth <= textNode.clientWidth + 1) && (textNode.scrollHeight <= textNode.clientHeight + 1)) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    textNode.style.fontSize = `${best}px`;
}

function __contractsAutoFitPdfTextResources() {
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-resource[data-res-type="text"], #receipt-preview-box .cpc-pdf-resource[data-res-type="title"]').forEach((node) => {
        __contractsAutoFitPdfTextNode(node);
    });
}

function __contractsInjectResourcesIntoPage(rawHtml, resourcesHtml) {
    const html = String(rawHtml || '');
    const extra = String(resourcesHtml || '');
    if (!extra) return html;
    const idx = html.lastIndexOf('</div>');
    if (idx < 0) return `${html}${extra}`;
    return `${html.slice(0, idx)}${extra}${html.slice(idx)}`;
}

function __contractsNormalizePdfContent(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __CP_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS;
    const normalizeText = (key, max) => String(base[key] ?? defaults[key] ?? '').slice(0, max);
    return {
        liquidatedTitle: normalizeText('liquidatedTitle', 120),
        liquidatedClientLabel: normalizeText('liquidatedClientLabel', 80),
        liquidatedSpaceLabel: normalizeText('liquidatedSpaceLabel', 80),
        liquidatedTotalLabel: normalizeText('liquidatedTotalLabel', 80),
        liquidatedPaymentsHeading: normalizeText('liquidatedPaymentsHeading', 120),
        liquidatedBalanceLabel: normalizeText('liquidatedBalanceLabel', 120),
        liquidatedWatermarkText: normalizeText('liquidatedWatermarkText', 120),
        liquidatedFooterLine1: normalizeText('liquidatedFooterLine1', 180),
        liquidatedFooterLine2: normalizeText('liquidatedFooterLine2', 180),
        receiptTitle: normalizeText('receiptTitle', 120),
        receiptReceivedFromLabel: normalizeText('receiptReceivedFromLabel', 80),
        receiptAmountLabel: normalizeText('receiptAmountLabel', 80),
        receiptConceptLabel: normalizeText('receiptConceptLabel', 80),
        receiptInternalReferenceLabel: normalizeText('receiptInternalReferenceLabel', 120),
        receiptBankHeading: normalizeText('receiptBankHeading', 120),
        receiptBankLabel: normalizeText('receiptBankLabel', 60),
        receiptAccountLabel: normalizeText('receiptAccountLabel', 80),
        receiptReferenceHeading: normalizeText('receiptReferenceHeading', 120),
        receiptPendingBalanceLabel: normalizeText('receiptPendingBalanceLabel', 140),
        receiptFooterLine1: normalizeText('receiptFooterLine1', 180),
        receiptFooterLine2: normalizeText('receiptFooterLine2', 180),
        annexHintTitle: normalizeText('annexHintTitle', 120),
        annexHintBody: normalizeText('annexHintBody', 900)
    };
}

function __contractsGetPdfContentFieldMaxLength(field) {
    const longFields = new Set(['annexHintBody', 'liquidatedFooterLine1', 'liquidatedFooterLine2', 'receiptFooterLine1', 'receiptFooterLine2']);
    if (field === 'annexHintBody') return 900;
    if (longFields.has(field)) return 180;
    return 120;
}

function __contractsCommitPdfContentField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __contractsGetPdfStyleConfig();
    const max = __contractsGetPdfContentFieldMaxLength(key);
    const content = __contractsNormalizePdfContent({
        ...(cfg.content || {}),
        [key]: String(rawValue ?? '').slice(0, max)
    });
    const next = __contractsNormalizePdfStyle({ ...cfg, content });
    __contractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __contractsScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __contractsRefreshPreviewFromStyleState();
}

function __contractsCommitPdfSignLabelField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __contractsGetPdfStyleConfig();
    const nextSignLabels = __contractsNormalizePdfSignLabels({
        ...(cfg.signLabels || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS),
        [key]: String(rawValue ?? '').slice(0, 80)
    });
    const next = __contractsNormalizePdfStyle({ ...cfg, signLabels: nextSignLabels });
    __contractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __contractsScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __contractsRefreshPreviewFromStyleState();
}

function __contractsGetReceiptBaseContentFields(baseKey) {
    const key = String(baseKey || '').trim();
    const content = __contractsNormalizePdfContent(__contractsGetPdfStyleConfig().content);
    const signLabels = __contractsNormalizePdfSignLabels(__contractsGetPdfStyleConfig().signLabels);
    const isLiquidated = currentRemainingBalance <= 0.01;
    if (key === 'header') return [];
    if (key === 'summary-main') {
        return isLiquidated
            ? [
                { key: 'liquidatedClientLabel', label: 'Etiqueta cliente', value: content.liquidatedClientLabel, max: 80 },
                { key: 'liquidatedSpaceLabel', label: 'Etiqueta espacio', value: content.liquidatedSpaceLabel, max: 80 },
                { key: 'liquidatedTotalLabel', label: 'Etiqueta total', value: content.liquidatedTotalLabel, max: 80 }
            ]
            : [
                { key: 'receiptReceivedFromLabel', label: 'Etiqueta cliente', value: content.receiptReceivedFromLabel, max: 80 },
                { key: 'receiptAmountLabel', label: 'Etiqueta importe', value: content.receiptAmountLabel, max: 80 },
                { key: 'receiptConceptLabel', label: 'Etiqueta concepto', value: content.receiptConceptLabel, max: 80 },
                { key: 'receiptInternalReferenceLabel', label: 'Etiqueta referencia', value: content.receiptInternalReferenceLabel, max: 120 }
            ];
    }
    if (key === 'details') {
        return isLiquidated
            ? [{ key: 'liquidatedPaymentsHeading', label: 'Titulo de tabla', value: content.liquidatedPaymentsHeading, max: 120 }]
            : [
                { key: 'receiptBankHeading', label: 'Titulo bancario', value: content.receiptBankHeading, max: 120 },
                { key: 'receiptBankLabel', label: 'Etiqueta banco', value: content.receiptBankLabel, max: 60 },
                { key: 'receiptAccountLabel', label: 'Etiqueta cuenta', value: content.receiptAccountLabel, max: 80 },
                { key: 'receiptReferenceHeading', label: 'Titulo referencia', value: content.receiptReferenceHeading, max: 120 }
            ];
    }
    if (key === 'balance') {
        return [{ key: isLiquidated ? 'liquidatedBalanceLabel' : 'receiptPendingBalanceLabel', label: 'Etiqueta saldo', value: isLiquidated ? content.liquidatedBalanceLabel : content.receiptPendingBalanceLabel, max: 140 }];
    }
    if (key === 'footer') {
        return isLiquidated
            ? [
                { key: 'liquidatedFooterLine1', label: 'Linea 1', value: content.liquidatedFooterLine1, max: 180 },
                { key: 'liquidatedFooterLine2', label: 'Linea 2', value: content.liquidatedFooterLine2, max: 180 }
            ]
            : [
                { key: 'receiptFooterLine1', label: 'Linea 1', value: content.receiptFooterLine1, max: 180 },
                { key: 'receiptFooterLine2', label: 'Linea 2', value: content.receiptFooterLine2, max: 180 }
            ];
    }
    if (key === 'watermark' && isLiquidated) {
        return [{ key: 'liquidatedWatermarkText', label: 'Texto marca', value: content.liquidatedWatermarkText, max: 120 }];
    }
    if (key === 'sign') {
        return isLiquidated
            ? [
                { key: 'signLabel:liquidatedLeftName', label: 'Firma izquierda (nombre)', value: signLabels.liquidatedLeftName, max: 80 },
                { key: 'signLabel:liquidatedLeftRole', label: 'Firma izquierda (cargo)', value: signLabels.liquidatedLeftRole, max: 80 },
                { key: 'signLabel:liquidatedRightName', label: 'Firma derecha (nombre)', value: signLabels.liquidatedRightName, max: 80 },
                { key: 'signLabel:liquidatedRightRole', label: 'Firma derecha (cargo)', value: signLabels.liquidatedRightRole, max: 80 },
                { key: 'signLabel:clientRole', label: 'Cliente (cargo)', value: signLabels.clientRole, max: 80 }
            ]
            : [
                { key: 'signLabel:receiptLeftName', label: 'Firma izquierda (nombre)', value: signLabels.receiptLeftName, max: 80 },
                { key: 'signLabel:receiptLeftRole', label: 'Firma izquierda (cargo)', value: signLabels.receiptLeftRole, max: 80 },
                { key: 'signLabel:receiptRightName', label: 'Firma derecha (nombre)', value: signLabels.receiptRightName, max: 80 },
                { key: 'signLabel:receiptRightRole', label: 'Firma derecha (cargo)', value: signLabels.receiptRightRole, max: 80 },
                { key: 'signLabel:clientRole', label: 'Cliente (cargo)', value: signLabels.clientRole, max: 80 }
            ];
    }
    return [];
}

function __contractsNormalizePdfStyle(raw = {}) {
    const base = { ...__CP_CONTRACTS_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    const safeResources = __contractsNormalizePdfResources(base.resources);
    return {
        fontFamilyKey: __CP_CONTRACTS_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __contractsClampStyleNumber(base.headerLinePx, 1, 8, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.headerLinePx),
        signLinePx: __contractsClampStyleNumber(base.signLinePx, 1, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.signLinePx),
        titlePx: __contractsClampStyleNumber(base.titlePx, 20, 42, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __contractsClampStyleNumber(base.metaPx, 8, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __contractsClampStyleNumber(base.tableHeadPx, 9, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __contractsClampStyleNumber(base.tableBodyPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __contractsClampStyleNumber(base.lineHeightPct, 90, 180, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __contractsClampStyleNumber(base.quickPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __contractsClampStyleNumber(base.conditionsPx, 9, 18, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __contractsClampStyleNumber(base.signPx, 9, 16, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __contractsClampStyleNumber(base.footerPx, 8, 14, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __contractsClampStyleNumber(base.offsetXPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __contractsClampStyleNumber(base.offsetYPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __contractsClampStyleNumber(base.extraPages, 0, 6, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.extraPages),
        marginTopPx: __contractsClampStyleNumber(base.marginTopPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.marginTopPx),
        marginBottomPx: __contractsClampStyleNumber(base.marginBottomPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.marginBottomPx),
        marginLeftPx: __contractsClampStyleNumber(base.marginLeftPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.marginLeftPx),
        marginRightPx: __contractsClampStyleNumber(base.marginRightPx, -4000, 4000, __CP_CONTRACTS_PDF_STYLE_DEFAULTS.marginRightPx),
        baseLayouts: __contractsNormalizePdfBaseLayouts(base.baseLayouts),
        resources: safeResources,
        resourcesInitialized: base.resourcesInitialized === true || safeResources.length > 0,
        signLabels: __contractsNormalizePdfSignLabels(base.signLabels),
        content: __contractsNormalizePdfContent(base.content),
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

function __contractsNormalizeProfileKey(profile) {
    const safe = String(profile || '').toLowerCase();
    return __CP_CONTRACTS_PDF_STYLE_PROFILE_KEYS.includes(safe) ? safe : 'receipt';
}

function __contractsExtractPdfStyleProfile(raw, profile = 'receipt') {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const key = __contractsNormalizeProfileKey(profile);
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    if (profiles) {
        const candidate = profiles[key] || profiles.receipt || profiles.quote || profiles.default;
        if (candidate && typeof candidate === 'object') return candidate;
    }
    return cfg;
}

function __contractsNormalizePdfStyleProfiles(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    const fallback = __contractsNormalizePdfStyle(profiles ? (profiles.receipt || profiles.quote || profiles.default || __CP_CONTRACTS_PDF_STYLE_DEFAULTS) : cfg);
    const out = {};
    __CP_CONTRACTS_PDF_STYLE_PROFILE_KEYS.forEach((key) => {
        out[key] = __contractsNormalizePdfStyle(profiles ? (profiles[key] || fallback) : fallback);
    });
    return out;
}

function __contractsBuildPdfStyleConfigPayload(rawExisting, style, profile = __contractsPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const key = __contractsNormalizeProfileKey(profile);
    const profiles = __contractsNormalizePdfStyleProfiles(existing);
    profiles[key] = __contractsNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __CP_CONTRACTS_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: window.__serverDateService.nowISO(),
        profiles
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
        '--cp-sign-line': `${safe.signLinePx}px`,
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
        '--cp-offset-x': `${safe.offsetXPx}px`,
        '--cp-offset-y': `${safe.offsetYPx}px`,
        '--cp-header-align': headerAlign,
        '--cp-header-justify': headerAlign === 'left' ? 'flex-start' : (headerAlign === 'center' ? 'center' : 'flex-end'),
        '--cp-meta-align': safe.metaAlign,
        '--cp-table-align': safe.tableAlign,
        '--cp-quick-align': safe.quickAlign,
        '--cp-conditions-align': safe.conditionsAlign,
        '--cp-sign-align': safe.signAlign,
        '--cp-summary-align': safe.summaryAlign,
        '--cp-footer-align': safe.footerAlign,
        '--cp-margin-top': `${safe.marginTopPx}px`,
        '--cp-margin-bottom': `${safe.marginBottomPx}px`,
        '--cp-margin-left': `${safe.marginLeftPx}px`,
        '--cp-margin-right': `${safe.marginRightPx}px`
    };
}

function __contractsPdfStyleVarsInline(style) {
    const vars = __contractsPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __contractsBuildReceiptFrameStyle(baseHeightPx, extraStyle = '') {
    const extra = String(extraStyle || '').trim();
    const suffix = extra ? `${extra}${extra.endsWith(';') ? '' : ';'}` : '';
    return `position:relative;left:var(--cp-margin-left);top:var(--cp-margin-top);width:max(48px,calc(100% - var(--cp-margin-left) - var(--cp-margin-right)));height:max(48px,calc(${baseHeightPx}px - var(--cp-margin-top) - var(--cp-margin-bottom)));min-height:max(48px,calc(${baseHeightPx}px - var(--cp-margin-top) - var(--cp-margin-bottom)));box-sizing:border-box;overflow:visible;${suffix}`;
}

function __contractsApplyPdfStyleToLivePreview(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const rootNodes = document.querySelectorAll('#receipt-preview-box .cpc-pdf-root');
    if (!rootNodes.length) return;
    const vars = __contractsPdfStyleVars(__contractsGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __contractsApplyPdfBaseLayouts();
    __contractsSyncLiveReceiptResources();
    __contractsAutoFitPdfTextResources();
    __contractsEnsureReceiptEditingChrome(opts);
    __contractsSyncReceiptEditMode();
    __contractsHighlightSelectedResource();
    if (!skipEditorUiRefresh) __contractsRenderReceiptToolbar();
    __contractsAttachPageControls();
    __contractsEnsureMarginGuideController()?.refresh();
}

function __contractsMarginStateFromConfig(style) {
    const cfg = __contractsNormalizePdfStyle(style || __contractsGetPdfStyleConfig());
    return {
        top: cfg.marginTopPx,
        bottom: cfg.marginBottomPx,
        left: cfg.marginLeftPx,
        right: cfg.marginRightPx
    };
}

function __contractsApplyMarginVarsToLivePreview(style) {
    const cfg = __contractsNormalizePdfStyle(style || __contractsGetPdfStyleConfig());
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-root').forEach((node) => {
        node.style.setProperty('--cp-margin-top', `${cfg.marginTopPx}px`);
        node.style.setProperty('--cp-margin-bottom', `${cfg.marginBottomPx}px`);
        node.style.setProperty('--cp-margin-left', `${cfg.marginLeftPx}px`);
        node.style.setProperty('--cp-margin-right', `${cfg.marginRightPx}px`);
    });
}

function __contractsApplyPdfBaseLayouts() {
    const cfg = __contractsGetPdfStyleConfig();
    const layouts = __contractsNormalizePdfBaseLayouts(cfg.baseLayouts);
    const groups = {};
    document.querySelectorAll('#receipt-preview-box [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__contractsGetPdfBaseBlockMeta(key)) return;
        groups[key] = (groups[key] || 0);
        const index = groups[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __contractsNormalizePdfBaseLayout();
        if (node.dataset.baseNativeTransformCaptured !== '1') {
            node.dataset.baseNativeTransform = String(node.style.transform || '').trim();
            node.dataset.baseNativeTransformCaptured = '1';
        }
        const nativeTransform = String(node.dataset.baseNativeTransform || '').trim();
        const layoutTransform = __contractsBuildPdfBaseTransform(layout);
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('cpc-pdf-editable', __contractsIsAdminProfile());
        node.dataset.baseInstance = instanceKey;
    });
}

function __contractsCommitPdfBaseLayout(key, layout) {
    const baseKey = String(key || '').split('__')[0].trim();
    if (!__contractsGetPdfBaseBlockMeta(baseKey)) return;
    const fullKey = String(key || '').trim();
    const cfg = __contractsGetPdfStyleConfig();
    const baseLayouts = {
        ...__contractsNormalizePdfBaseLayouts(cfg.baseLayouts),
        [fullKey]: __contractsNormalizePdfBaseLayout(layout)
    };
    const next = __contractsNormalizePdfStyle({ ...cfg, baseLayouts });
    __contractsSetPdfStyleConfig(next, { applyToDom: false });
    __contractsApplyPdfBaseLayouts();
    __contractsScheduleSharedPdfStyleSync(next);
}

function __contractsCommitBaseLayoutField(baseId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const baseKey = key.split('__')[0];
    if (!__contractsGetPdfBaseBlockMeta(baseKey)) return;
    if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(String(field || '')) && !__contractsCanMoveReceiptBaseBlock(baseKey)) return;
    const cfg = __contractsGetPdfStyleConfig();
    const baseLayouts = __contractsNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[key] || baseLayouts[baseKey] || __contractsNormalizePdfBaseLayout();
    let nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __contractsClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __contractsClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'angle') {
        const limits = __CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.angle;
        nextLayout.angle = __contractsClampStyleNumber(rawValue, limits.min, limits.max, current.angle || 0);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __contractsNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [key]: __contractsNormalizePdfBaseLayout(nextLayout)
        }
    });
    __contractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __contractsScheduleSharedPdfStyleSync(next);
}

function __contractsBuildLiveReceiptResourceContext() {
    const now = new Date();
    const pdfStyle = __contractsGetPdfStyleConfig();
    return __contractsBuildReceiptResourceContext({
        isLiquidated: currentRemainingBalance <= 0.01,
        dateStr: now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }),
        timeStr: now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        pdfContent: __contractsNormalizePdfContent(pdfStyle.content),
        signLabels: __contractsNormalizePdfSignLabels(pdfStyle.signLabels)
    });
}

function __contractsSyncLiveReceiptResources() {
    const cfg = __contractsGetPdfStyleConfig();
    const resources = __contractsNormalizePdfResources(cfg.resources).filter((resource) => resource.enabled);
    const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
    const isAdmin = __contractsIsAdminProfile();
    const context = __contractsBuildLiveReceiptResourceContext();
    const globalFont = __CP_CONTRACTS_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __CP_CONTRACTS_PDF_STYLE_FONT_MAP.segoe;
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-resource[data-res-id]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const resource = resourceMap.get(String(node.getAttribute('data-res-id') || '').trim());
        if (!resource) return;
        const safeType = resource.type === 'sign-line' ? 'sign' : resource.type;
        node.dataset.resPage = String(resource.page);
        node.dataset.resType = safeType;
        __contractsApplyResourceGeometryToNode(node, resource);
        if (safeType === 'logo') {
            node.style.background = 'transparent';
            return;
        }
        if (safeType === 'sign') {
            node.style.background = 'transparent';
            const line = node.querySelector('div');
            if (line instanceof HTMLElement) {
                line.style.background = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
            }
            return;
        }
        if (safeType === 'sign-block') {
            const titleStr = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.signTitle || '', context));
            const roleStr = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.signRole || '', context));
            const textColor = (resource.color && resource.color !== 'transparent') ? resource.color : '#111827';
            const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
            const fontStack = resource.fontFamilyKey && __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                : globalFont;
            const titleSize = Math.max(10, Number(resource.fontSize || 14));
            const roleSize = Math.max(9, titleSize - 2);
            const deleteBtnHtml = isAdmin ? `<div class="cpc-pdf-delete-btn" data-res-action="remove" data-res-id="${__contractsSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';
            node.style.background = 'transparent';
            node.innerHTML = `
                <div style="width:100%;height:2px;background:${lineColor};border-radius:999px;margin-bottom:4px;"></div>
                <div style="width:100%;text-align:center;color:${textColor};font-family:${fontStack};pointer-events:none;user-select:none;">
                    ${titleStr ? `<div style="font-size:${titleSize}px;font-weight:800;line-height:1.2;">${titleStr}</div>` : ''}
                    ${roleStr ? `<div style="font-size:${roleSize}px;text-transform:uppercase;opacity:0.6;margin-top:2px;">${roleStr}</div>` : ''}
                </div>
                ${deleteBtnHtml}
            `;
            return;
        }
        if (safeType === 'title' || safeType === 'text') {
            const textWrap = node.firstElementChild instanceof HTMLElement ? node.firstElementChild : null;
            const fontStack = resource.fontFamilyKey && __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                : globalFont;
            const content = __contractsSafeHtml(__contractsResolveResourceTemplate(resource.text, context));
            const placeholder = isAdmin && !content ? (safeType === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
            node.style.background = 'transparent';
            node.setAttribute('data-res-font-size', String(resource.fontSize || 14));
            if (textWrap) {
                textWrap.style.fontFamily = fontStack;
                textWrap.style.fontSize = `${resource.fontSize}px`;
                textWrap.style.fontWeight = resource.bold ? '800' : 'normal';
                textWrap.style.fontStyle = resource.italic ? 'italic' : 'normal';
                textWrap.style.textDecoration = resource.underline ? 'underline' : 'none';
                textWrap.style.textAlign = resource.align;
                textWrap.style.color = (resource.color && resource.color !== 'transparent') ? resource.color : '#111827';
                textWrap.innerHTML = content || `<span style="opacity:0.3;">${placeholder}</span>`;
            }
            return;
        }
        node.style.background = safeType === 'bar' ? resource.bgColor : 'transparent';
    });
}

function __contractsShouldRefreshResourcePreviewField(field) {
    return field === 'page' || field === 'enabled';
}

function __contractsCommitMargins(margins, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const current = __contractsGetPdfStyleConfig();
    const next = __contractsNormalizePdfStyle({
        ...current,
        marginTopPx: margins.top,
        marginBottomPx: margins.bottom,
        marginLeftPx: margins.left,
        marginRightPx: margins.right
    });
    __contractsPdfStyleState = next;
    __contractsApplyMarginVarsToLivePreview(next);
    __contractsSyncPdfStyleValueLabels(next);
    __contractsRenderReceiptToolbar();
    if (opts.persist !== false) __contractsScheduleSharedPdfStyleSync(next);
    return next;
}

function __contractsEnsureMarginGuideController() {
    if (!window.createPdfMarginGuideController) return null;
    if (!__contractsPdfMarginGuideController) {
        __contractsPdfMarginGuideController = window.createPdfMarginGuideController({
            container: () => document.getElementById('receipt-preview-container'),
            root: () => document.getElementById('receipt-preview-box'),
            minMarginPx: -4000,
            maxMarginPx: 4000,
            isVisible: () => {
                const view = document.getElementById('view-receipt');
                return !!view && !view.classList.contains('hidden') && __contractsIsAdminProfile() && !__contractsReceiptEditLocked;
            },
            getMargins: () => __contractsMarginStateFromConfig(),
            onChange: (margins) => {
                __contractsCommitMargins(margins, { persist: false });
            },
            onCommit: (margins) => {
                __contractsCommitMargins(margins, { persist: false });
                __contractsScheduleSharedPdfStyleSync(__contractsGetPdfStyleConfig());
            }
        });
    }
    return __contractsPdfMarginGuideController;
}

function __contractsCommitResourceInspectorField(resourceId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const resources = __contractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    const current = { ...resources[idx] };
    const canMove = __contractsCanMoveReceiptResource(current);
    const canEdit = __contractsCanEditReceiptResource(current);
    if (field === 'text') {
        if (!canEdit) return;
        current.text = String(rawValue || '').slice(0, 500);
    } else if (field === 'fontFamilyKey') {
        if (!canEdit) return;
        const safeKey = String(rawValue || '').toLowerCase();
        current.fontFamilyKey = __CP_CONTRACTS_PDF_STYLE_FONT_MAP[safeKey] ? safeKey : '';
    } else if (field === 'signTitle' || field === 'signRole') {
        if (!canEdit) return;
        current[field] = String(rawValue || '').slice(0, 80);
    } else if (field === 'fontSize') {
        if (!canEdit) return;
        current.fontSize = __contractsClampStyleNumber(rawValue, 8, 72, current.fontSize);
    } else if (field === 'align') {
        if (!canEdit) return;
        current.align = __contractsNormalizeAlign(rawValue, current.align);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        if (!canEdit) return;
        current[field] = !!rawValue;
    } else if (field === 'color') {
        if (!canEdit) return;
        current.color = __contractsNormalizeHexColor(rawValue, current.color);
    } else if (field === 'bgColor') {
        if (!canEdit) return;
        current.bgColor = __contractsNormalizeHexColor(rawValue, current.bgColor);
    } else if (field === 'page') {
        if (!canMove) return;
        current.page = __contractsClampStyleNumber(rawValue, 1, 8, current.page);
    } else if (field === 'x') {
        if (!canMove) return;
        current.x = __contractsClampStyleNumber(rawValue, -4000, 4000, current.x);
    } else if (field === 'y') {
        if (!canMove) return;
        current.y = __contractsClampStyleNumber(rawValue, -5000, 5000, current.y);
    } else if (field === 'w') {
        if (!canMove) return;
        current.w = __contractsClampStyleNumber(rawValue, 16, 4000, current.w);
    } else if (field === 'h') {
        if (!canMove) return;
        current.h = __contractsClampStyleNumber(rawValue, 1, 5000, current.h);
    } else if (field === 'angle') {
        if (!canMove) return;
        current.angle = __contractsClampStyleNumber(rawValue, -360, 360, current.angle || 0);
    } else if (field === 'enabled') {
        if (!canMove) return;
        current.enabled = !!rawValue;
    } else {
        return;
    }
    resources[idx] = { ...current };
    __contractsCommitPdfResources(resources, {
        refreshPreview: __contractsShouldRefreshResourcePreviewField(field),
        // Evita blur al no reconstruir inspector/lista durante escritura continua.
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
}

function __contractsBindReceiptToolbarDrag(panel, host) {
    if (!(panel instanceof HTMLElement) || !(host instanceof HTMLElement) || panel.dataset.dragBound === '1') return;
    panel.dataset.dragBound = '1';
    const handle = panel.querySelector('[data-receipt-panel-handle]');
    if (!(handle instanceof HTMLElement)) return;
    const syncPanelViewport = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240;
        const maxPanelHeight = Math.max(220, viewportHeight - 16);
        const card = panel.querySelector('[data-receipt-inspector-card]');
        const body = panel.querySelector('[data-receipt-inspector-body]');
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
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240;
        const panelWidth = panel.offsetWidth || 280;
        const panelHeight = panel.offsetHeight || 180;
        const maxLeft = Math.max(12, viewportWidth - panelWidth - 12);
        const maxTop = Math.max(12, viewportHeight - panelHeight - 12);
        return {
            left: Math.min(maxLeft, Math.max(12, Math.round(left))),
            top: Math.min(maxTop, Math.max(12, Math.round(top)))
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
        const interactive = event.target instanceof Element
            ? event.target.closest('button, input, select, textarea, [data-receipt-inspector-action], [data-receipt-inspector-toggle]')
            : null;
        if (interactive) return;
        ensureInitialPosition();
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            left: parseFloat(panel.style.left || '0') || 0,
            top: parseFloat(panel.style.top || '0') || 0
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
        applyPosition(dragState.left + (event.clientX - dragState.startX), dragState.top + (event.clientY - dragState.startY));
        event.preventDefault();
    });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', ensureInitialPosition);
    panel.__ensureFloatingPosition = ensureInitialPosition;
    requestAnimationFrame(ensureInitialPosition);
}

function __contractsRenderReceiptToolbar() {
    const buttonBar = document.getElementById('cpc-receipt-edit-button-bar');
    if (!buttonBar) return;
    const viewVisible = !document.getElementById('view-receipt')?.classList.contains('hidden');
    const isAdmin = __contractsIsAdminProfile();
    const showToolbar = viewVisible && isAdmin;
    buttonBar.classList.toggle('hidden', !showToolbar);
    if (!showToolbar) {
        document.getElementById('cpc-receipt-inspector')?.classList.add('hidden');
        document.getElementById('cpc-receipt-inspector-backdrop')?.classList.add('hidden');
        document.getElementById('cpc-receipt-edit-button')?.classList.add('hidden');
        return;
    }
    const adminTools = document.getElementById('cpc-receipt-admin-tools');
    if (adminTools) adminTools.classList.toggle('hidden', false);
    const editingEnabled = !__contractsReceiptEditLocked;
    const headerToggleBtn = document.getElementById('cpc-receipt-edit-button');
    if (headerToggleBtn) {
        headerToggleBtn.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>${editingEnabled ? 'Edicion activa' : 'Editar PDF'}</span>`;
        headerToggleBtn.classList.toggle('bg-emerald-600', editingEnabled);
        headerToggleBtn.classList.toggle('hover:bg-emerald-500', editingEnabled);
        headerToggleBtn.classList.toggle('border-emerald-400/50', editingEnabled);
        headerToggleBtn.classList.toggle('bg-gray-950', !editingEnabled);
        headerToggleBtn.classList.toggle('hover:bg-gray-900', !editingEnabled);
        headerToggleBtn.classList.toggle('border-gray-700', !editingEnabled);
        headerToggleBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        headerToggleBtn.disabled = false;
        headerToggleBtn.classList.remove('hidden');
    }
    const addButton = document.getElementById('cpc-receipt-add-button');
    if (addButton) {
        const disableAdd = __contractsReceiptEditLocked;
        addButton.classList.toggle('pointer-events-none', disableAdd);
        addButton.classList.toggle('opacity-60', disableAdd);
    }
}

/**
 * Paginación visual: controles +/🗑️ y helpers
 */
function __contractsGetTotalPages() {
    const basePages = __contractsGetReceiptBasePageCount ? __contractsGetReceiptBasePageCount() : 1;
    const cfg = __contractsGetPdfStyleConfig();
    const extra = Math.max(0, parseInt(cfg.extraPages, 10) || 0);
    return basePages + extra;
}
function __contractsChangeExtraPages(delta) {
    const cfg = __contractsGetPdfStyleConfig();
    const current = Math.max(0, parseInt(cfg.extraPages, 10) || 0);
    const nextVal = Math.max(0, Math.min(6, current + delta));
    if (nextVal === current) return;
    const next = __contractsNormalizePdfStyle({ ...cfg, extraPages: nextVal });
    __contractsSetPdfStyleConfig(next, { applyToDom: true });
    __contractsScheduleSharedPdfStyleSync(next);
    __contractsRefreshPreviewFromStyleState();
}
function __contractsAttachPageControls() {
    const root = document.getElementById('receipt-preview-box');
    if (!root) return;
    root.querySelectorAll('[data-pdf-page-add],[data-pdf-page-delete]').forEach((n) => n.remove());
    if (!__contractsIsAdminProfile() || __contractsReceiptEditLocked) return;
    const pages = Array.from(root.querySelectorAll('[data-pdf-preview-page]'));
    if (!pages.length) return;
    const total = __contractsGetTotalPages();
    const last = pages[pages.length - 1];

    // Botón "+" para agregar nueva página (en última página)
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.setAttribute('data-pdf-page-add', '1');
    addBtn.title = 'Añadir página';
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
    last.appendChild(addBtn);

    // Botón "🗑️" para eliminar última página si hay extraPages > 0
    const cfg = __contractsGetPdfStyleConfig();
    const extra = Math.max(0, parseInt(cfg.extraPages, 10) || 0);
    if (extra > 0) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.setAttribute('data-pdf-page-delete', String(total));
        delBtn.title = 'Eliminar última página';
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
        last.appendChild(delBtn);
    }
}
function __contractsHandlePageControlClick(event) {
    const t = event.target instanceof Element ? event.target.closest('[data-pdf-page-add],[data-pdf-page-delete]') : null;
    if (!t) return;
    event.preventDefault();
    if (t.hasAttribute('data-pdf-page-add')) {
        __contractsChangeExtraPages(+1);
        return;
    }
    if (t.hasAttribute('data-pdf-page-delete')) {
        const total = __contractsGetTotalPages();
        const lastPage = total;
        const resourcesOnLast = __contractsGetPdfResourcesFromState().filter((r) => Number(r.page || 1) === lastPage);
        if (resourcesOnLast.length > 0) {
            window.openCustomConfirm('La última página contiene elementos. ¿Eliminar la página y sus elementos?', () => {
                const remain = __contractsGetPdfResourcesFromState().filter((r) => Number(r.page || 1) !== lastPage);
                __contractsCommitPdfResources(remain, { refreshPreview: false });
                __contractsChangeExtraPages(-1);
            });
            return;
        }
        __contractsChangeExtraPages(-1);
    }
}

function __contractsSyncReceiptEditMode() {
    const editingEnabled = __contractsIsAdminProfile() && !__contractsReceiptEditLocked && !document.getElementById('view-receipt')?.classList.contains('hidden');
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-root').forEach((node) => {
        node.classList.toggle('cpc-pdf-admin-enabled', editingEnabled);
    });
    if (!editingEnabled) __contractsCloseReceiptInspector();
    __contractsRenderReceiptToolbar();
    __contractsAttachPageControls();
    __contractsEnsureMarginGuideController()?.refresh();
}

function __contractsSetReceiptEditLocked(locked) {
    const wasLocked = __contractsReceiptEditLocked;
    __contractsReceiptEditLocked = locked !== false;
    if (__contractsReceiptEditLocked) __contractsCloseReceiptInspector();
    __contractsSyncReceiptEditMode();
    if (!wasLocked && __contractsReceiptEditLocked && __contractsIsAdminProfile()) {
        Promise.resolve()
            .then(() => __contractsPersistSharedPdfStyleConfig(__contractsGetPdfStyleConfig(), { force: true }))
            .catch(() => {});
    }
}

function __contractsOverlayDocumentType(generatorType) {
    const safeType = String(generatorType || '').trim().toLowerCase();
    return __CP_CONTRACTS_PDF_OVERLAY_TYPES[safeType] || `generator:${safeType || 'receipts'}`;
}

function __contractsGetReceiptInspectorTarget() {
    if (!__contractsReceiptInspectorState || !__contractsIsAdminProfile()) return null;
    if (__contractsReceiptInspectorState.kind === 'base') {
        const key = String(__contractsReceiptInspectorState.key || '').trim();
        const meta = __contractsGetPdfBaseBlockMeta(key);
        if (!meta) return null;
        const layouts = __contractsNormalizePdfBaseLayouts(__contractsGetPdfStyleConfig().baseLayouts);
        const instanceKey = String(__contractsReceiptInspectorState.instanceKey || key).trim();
        const layout = layouts[instanceKey] || layouts[key] || __contractsNormalizePdfBaseLayout();
        const canEdit = __contractsCanEditReceiptBaseBlock(key);
        return {
            kind: 'base',
            id: instanceKey,
            label: meta.label,
            canMove: __contractsCanMoveReceiptBaseBlock(key),
            canEdit,
            layout: {
                x: layout.x,
                y: layout.y,
                scalePct: layout.scalePct,
                angle: layout.angle || 0,
                visible: !layout.hidden
            },
            contentFields: canEdit ? __contractsGetReceiptBaseContentFields(key) : [],
            canDelete: __contractsCanMoveReceiptBaseBlock(key)
        };
    }
    const preferredPage = __contractsClampStyleNumber(__contractsReceiptInspectorState.page, 1, 8, 1);
    const resource = __contractsGetPdfResourcesFromState().find((item) => {
        if (item.id !== __contractsReceiptInspectorState.id) return false;
        if (__contractsReceiptInspectorState.page == null) return true;
        return Number(item.page || 1) === preferredPage;
    });
    if (!resource) return null;
    const isTextLike = resource.type === 'title' || resource.type === 'text';
    const isSignBlock = resource.type === 'sign-block';
    const isLogo = resource.type === 'logo';
    const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
    const isBar = resource.type === 'bar';
    const canMove = __contractsCanMoveReceiptResource(resource);
    const canEdit = __contractsCanEditReceiptResource(resource);
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
        type: resource.type,
        canMove,
        canEdit,
        allowText: canEdit && isTextLike,
        showTypography: canEdit && (isTextLike || isSignBlock),
        showToggles: canEdit && isTextLike,
        showAlign: canEdit && isTextLike,
        showColor: canEdit && (isTextLike || isSignBlock),
        showBgColor: canEdit && !isLogo,
        bgColorLabel: isSignBlock || isSignLine ? 'Color linea' : (isBar ? 'Color' : 'Fondo'),
        text: resource.text || '',
        fontFamilyKey: resource.fontFamilyKey || __contractsGetPdfStyleConfig().fontFamilyKey,
        fontSize: Number(resource.fontSize || 14),
        align: resource.align || 'left',
        color: resource.color || '#111827',
        bold: !!resource.bold,
        italic: !!resource.italic,
        underline: !!resource.underline,
        bgColor: resource.bgColor || 'transparent',
        layout: {
            page: Number(resource.page || 1),
            x: Number(resource.x || 0),
            y: Number(resource.y || 0),
            w: Number(resource.w || 0),
            h: Number(resource.h || 0),
            angle: Number(resource.angle || 0),
            visible: resource.enabled !== false
        },
        contentFields: canEdit && isSignBlock
            ? [
                { key: 'signTitle', label: 'Nombre', value: String(resource.signTitle || ''), max: 80 },
                { key: 'signRole', label: 'Cargo o rol', value: String(resource.signRole || ''), max: 80 }
            ]
            : [],
        canDelete: canMove || canEdit
    };
}

function __contractsGetReceiptInspectorAnchorNode() {
    if (!__contractsReceiptInspectorState) return null;
    if (__contractsReceiptInspectorState.kind === 'base') {
        const key = String(__contractsReceiptInspectorState.key || '').trim();
        const instanceKey = String(__contractsReceiptInspectorState.instanceKey || key).trim();
        const withInstance = document.querySelector(`#receipt-preview-box [data-base-resource="${key}"][data-base-instance="${instanceKey}"]`);
        if (withInstance) return withInstance;
        return document.querySelector(`#receipt-preview-box [data-base-resource="${key}"]`);
    }
    const safeId = String(__contractsReceiptInspectorState.id || '').trim();
    const safePage = __contractsClampStyleNumber(__contractsReceiptInspectorState.page, 1, 8, 1);
    const withPage = __contractsReceiptInspectorState.page == null
        ? null
        : document.querySelector(`#receipt-preview-box .cpc-pdf-resource[data-res-id="${safeId}"][data-res-page="${safePage}"]`);
    if (withPage) return withPage;
    return document.querySelector(`#receipt-preview-box .cpc-pdf-resource[data-res-id="${safeId}"]`);
}

function __contractsPositionReceiptInspector() {
    const panel = document.getElementById('cpc-receipt-inspector');
    const container = document.getElementById('receipt-preview-container');
    if (!(panel instanceof HTMLElement) || panel.classList.contains('hidden') || !(container instanceof HTMLElement)) return;
    __contractsBindReceiptToolbarDrag(panel, container);
}

function __contractsRenderReceiptInspector() {
    const panel = document.getElementById('cpc-receipt-inspector');
    const backdrop = document.getElementById('cpc-receipt-inspector-backdrop');
    if (!panel) return;
    const target = __contractsGetReceiptInspectorTarget();
    if (!target || __contractsReceiptEditLocked) {
        panel.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        return;
    }
    if (typeof panel.__ensureFloatingPosition === 'function') requestAnimationFrame(() => panel.__ensureFloatingPosition());
    if (backdrop) backdrop.classList.remove('hidden');
    const title = panel.querySelector('[data-receipt-inspector-title]');
    const textRow = panel.querySelector('[data-receipt-inspector-row="text"]');
    const textInput = panel.querySelector('[data-receipt-inspector-field="text"]');
    const fontSelect = panel.querySelector('[data-receipt-inspector-field="fontFamilyKey"]');
    const fontSize = panel.querySelector('[data-receipt-inspector-field="fontSize"]');
    const colorInput = panel.querySelector('[data-receipt-inspector-field="color"]');
    const alignSelect = panel.querySelector('[data-receipt-inspector-field="align"]');
    const deleteButton = panel.querySelector('[data-receipt-inspector-action="delete"]');
    const typographySection = panel.querySelector('[data-receipt-inspector-typography]');
    const toggleRow = panel.querySelector('[data-receipt-inspector-toggle-row]');
    const advancedSection = panel.querySelector('[data-receipt-inspector-advanced]');
    const contentSection = panel.querySelector('[data-receipt-inspector-content]');
    if (title) title.textContent = target.label;
    if (textRow) textRow.classList.toggle('hidden', !target.allowText);
    if (textInput) {
        textInput.value = target.text || '';
        textInput.dataset.targetId = target.id;
        textInput.dataset.targetKind = target.kind;
    }
    if (fontSelect) {
        fontSelect.innerHTML = __contractsRenderFontFamilyOptions(target.fontFamilyKey || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey);
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
    if (deleteButton) deleteButton.classList.toggle('hidden', !target.canDelete);
    if (typographySection) typographySection.classList.toggle('hidden', !target.showTypography);
    if (toggleRow) toggleRow.classList.toggle('hidden', !target.showToggles);
    if (colorInput?.parentElement) colorInput.parentElement.classList.toggle('hidden', !target.showColor);
    if (alignSelect?.parentElement) alignSelect.parentElement.classList.toggle('hidden', !target.showAlign);
    if (contentSection) {
        const fields = Array.isArray(target.contentFields) ? target.contentFields : [];
        if (fields.length) {
            contentSection.classList.remove('hidden');
            contentSection.innerHTML = fields.map((field) => `<label class="flex flex-col gap-1">
                <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span>
                <input data-receipt-inspector-field="${field.key}" data-target-id="${target.id}" data-target-kind="${target.kind}" type="text" maxlength="${field.max || 5000}" value="${__contractsSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
            </label>`).join('');
        } else {
            contentSection.classList.add('hidden');
            contentSection.innerHTML = '';
        }
    }
    if (advancedSection) {
        const layout = target.layout || {};
        const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red';
        const boolOptions = (isVisible) => `
            <option value="true" ${isVisible ? 'selected' : ''}>Visible</option>
            <option value="false" ${!isVisible ? 'selected' : ''}>Oculto</option>
        `;
        if (!target.canMove) {
            const showBgColorOnly = target.kind === 'resource' && target.showBgColor !== false;
            advancedSection.classList.remove('hidden');
            advancedSection.innerHTML = showBgColorOnly
                ? `<div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__contractsSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-receipt-inspector-field="bgColor" data-target-id="${target.id}" data-target-kind="${target.kind}" type="color" value="${target.bgColor && target.bgColor !== 'transparent' ? target.bgColor : '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>
                </div>`
                : `<p class="text-[10px] font-bold uppercase tracking-wide text-gray-400">Solo contenido editable</p>`;
        } else if (target.kind === 'base') {
            advancedSection.classList.remove('hidden');
            advancedSection.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-receipt-inspector-field="x" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.min}" max="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.max}" value="${layout.x ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-receipt-inspector-field="y" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.min}" max="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.max}" value="${layout.y ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Escala</span><input data-receipt-inspector-field="scalePct" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${layout.scalePct ?? 100}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-receipt-inspector-field="angle" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.angle.min}" max="${__CP_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.angle.max}" value="${layout.angle ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-receipt-inspector-field="visible" data-target-id="${target.id}" data-target-kind="${target.kind}" class="${inputClass}">${boolOptions(layout.visible !== false)}</select></label>
                </div>
            `;
        } else {
            const showBgColor = target.showBgColor !== false;
            advancedSection.classList.remove('hidden');
            advancedSection.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Pagina</span><input data-receipt-inspector-field="page" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="1" max="8" value="${layout.page ?? 1}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-receipt-inspector-field="enabled" data-target-id="${target.id}" data-target-kind="${target.kind}" class="${inputClass}">${boolOptions(layout.visible !== false)}</select></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-receipt-inspector-field="x" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-4000" max="4000" value="${layout.x ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-receipt-inspector-field="y" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-5000" max="5000" value="${layout.y ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-receipt-inspector-field="angle" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-360" max="360" value="${layout.angle ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ancho</span><input data-receipt-inspector-field="w" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="16" max="4000" value="${layout.w ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alto</span><input data-receipt-inspector-field="h" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="1" max="5000" value="${layout.h ?? 0}" class="${inputClass}"></label>
                    ${showBgColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__contractsSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-receipt-inspector-field="bgColor" data-target-id="${target.id}" data-target-kind="${target.kind}" type="color" value="${target.bgColor && target.bgColor !== 'transparent' ? target.bgColor : '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
                </div>
            `;
        }
    }
    panel.querySelectorAll('[data-receipt-inspector-toggle]').forEach((btn) => {
        const field = String(btn.getAttribute('data-receipt-inspector-toggle') || '');
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
    const resetBtn = panel.querySelector('[data-receipt-inspector-action="reset"]');
    if (resetBtn) {
        resetBtn.dataset.targetId = target.id;
        resetBtn.dataset.targetKind = target.kind;
        resetBtn.classList.toggle('hidden', !target.canMove);
    }
    panel.classList.remove('hidden');
    requestAnimationFrame(__contractsPositionReceiptInspector);
}

function __contractsCloseReceiptInspector() {
    __contractsReceiptInspectorState = null;
    const panel = document.getElementById('cpc-receipt-inspector');
    if (panel) panel.classList.add('hidden');
    const backdrop = document.getElementById('cpc-receipt-inspector-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

function __contractsOpenReceiptInspector(state) {
    if (!state || __contractsReceiptEditLocked || !__contractsIsAdminProfile()) return;
    __contractsReceiptInspectorState = { ...state };
    __contractsPdfResourceSelectedId = state.kind === 'base' ? `base:${state.instanceKey || state.key}` : state.id;
    __contractsHighlightSelectedResource();
    __contractsRenderReceiptInspector();
}

function __contractsHandleReceiptInspectorInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const isContinuousInput = event.type === 'input'
        && (
            target instanceof HTMLTextAreaElement
            || (target instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(target.type || '').toLowerCase()))
        );
    const field = String(target.getAttribute('data-receipt-inspector-field') || '');
    const kind = String(target.getAttribute('data-target-kind') || '');
    const id = String(target.getAttribute('data-target-id') || '');
    if (!field || !kind || !id) return;
    const rawValue = target.type === 'checkbox'
        ? !!target.checked
        : ((target instanceof HTMLSelectElement && (target.value === 'true' || target.value === 'false'))
            ? (target.value === 'true')
            : target.value);
    if (kind === 'base') {
        const baseKey = String(id || '').split('__')[0].trim();
        if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(field)) {
            __contractsCommitBaseLayoutField(`base:${id}`, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
        } else if (__contractsCanEditReceiptBaseBlock(baseKey)) {
            if (field.startsWith('signLabel:')) {
                __contractsCommitPdfSignLabelField(field.slice('signLabel:'.length), rawValue, {
                    refreshPreview: !isContinuousInput,
                    skipEditorUiRefresh: isContinuousInput
                });
            } else {
                __contractsCommitPdfContentField(field, rawValue, {
                    refreshPreview: !isContinuousInput,
                    skipEditorUiRefresh: isContinuousInput
                });
            }
        } else {
            return;
        }
    }
    if (kind === 'resource') __contractsCommitResourceInspectorField(id, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
    if (isContinuousInput) {
        requestAnimationFrame(__contractsPositionReceiptInspector);
        return;
    }
    __contractsRenderReceiptInspector();
}

function __contractsResetReceiptInspectorTarget(kind, id) {
    const safeKind = String(kind || '');
    const safeId = String(id || '');
    if (!safeKind || !safeId) return;
    if (safeKind === 'base') {
        __contractsCommitBaseLayoutField(`base:${safeId}`, 'x', 0);
        __contractsCommitBaseLayoutField(`base:${safeId}`, 'y', 0);
        __contractsCommitBaseLayoutField(`base:${safeId}`, 'scalePct', 100);
        __contractsCommitBaseLayoutField(`base:${safeId}`, 'angle', 0);
        __contractsCommitBaseLayoutField(`base:${safeId}`, 'visible', true);
        return;
    }
    if (safeKind !== 'resource') return;
    const resources = __contractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === safeId);
    if (idx < 0) return;
    const current = resources[idx];
    if (!__contractsCanMoveReceiptResource(current)) return;
    const fallback = __contractsNormalizePdfResources([{ id: current.id, type: current.type, page: current.page }])[0];
    resources[idx] = {
        ...current,
        ...fallback,
        id: current.id,
        type: current.type,
        page: current.page
    };
    __contractsCommitPdfResources(resources);
}

function __contractsHandleReceiptInspectorClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-receipt-inspector-action],[data-receipt-inspector-toggle]') : null;
    if (!button) return;
    const action = String(button.getAttribute('data-receipt-inspector-action') || '');
    const toggleField = String(button.getAttribute('data-receipt-inspector-toggle') || '');
    const kind = String(button.getAttribute('data-target-kind') || '');
    const id = String(button.getAttribute('data-target-id') || '');
    if (action === 'close') {
        __contractsCloseReceiptInspector();
        return;
    }
    if (toggleField && kind === 'resource' && id) {
        const currentTarget = __contractsGetReceiptInspectorTarget();
        if (!currentTarget?.canEdit) return;
        __contractsCommitResourceInspectorField(id, toggleField, !currentTarget?.[toggleField]);
        __contractsRenderReceiptInspector();
        return;
    }
    if (action === 'delete') {
        if (__contractsReceiptInspectorState?.kind === 'resource') {
            const selected = __contractsFindReceiptResourceById(__contractsReceiptInspectorState.id, __contractsReceiptInspectorState.page);
            if (!selected || (!__contractsCanMoveReceiptResource(selected) && !__contractsCanEditReceiptResource(selected))) return;
            __contractsRemovePdfResource(__contractsReceiptInspectorState.id);
            return;
        }
        if (__contractsReceiptInspectorState?.kind === 'base') {
            const baseInstance = String(__contractsReceiptInspectorState.instanceKey || __contractsReceiptInspectorState.key || '').trim();
            if (!baseInstance) return;
            __contractsCommitBaseLayoutField(`base:${baseInstance}`, 'visible', false);
            __contractsCloseReceiptInspector();
            return;
        }
    }
    if (action === 'reset' && kind && id) {
        __contractsResetReceiptInspectorTarget(kind, id);
        __contractsRenderReceiptInspector();
        return;
    }
    __contractsCloseReceiptInspector();
}

function __contractsEnsureReceiptEditingChrome(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const container = document.getElementById('receipt-preview-container');
    const view = document.getElementById('view-receipt');
    if (!container) return;
    if (view && window.getComputedStyle(view).position === 'static') view.style.position = 'relative';
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (!document.getElementById('cpc-receipt-edit-button-bar')) {
        const buttonBar = document.createElement('div');
        buttonBar.id = 'cpc-receipt-edit-button-bar';
        buttonBar.className = 'hidden absolute right-4 top-4 z-[96] flex items-center gap-2';
        buttonBar.innerHTML = `
            <div id="cpc-receipt-admin-tools" class="flex items-center gap-2 transition">
                <button type="button" id="cpc-receipt-add-button" class="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-700 shadow-lg transition hover:border-brand-red hover:text-brand-red">
                    <i class="fa-solid fa-plus"></i>
                    <span>Elemento</span>
                </button>
            </div>
            <button type="button" id="cpc-receipt-edit-button" class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition"></button>
        `;
        buttonBar.addEventListener('click', (event) => {
            const addButton = event.target instanceof Element ? event.target.closest('#cpc-receipt-add-button') : null;
            if (addButton) {
                if (__contractsReceiptEditLocked || !__contractsIsAdminProfile()) return;
                window.openModal('pdf-resource-modal');
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('#cpc-receipt-edit-button') : null;
            if (!button) return;
            __contractsSetReceiptEditLocked(!__contractsReceiptEditLocked);
        });
        (view || container).appendChild(buttonBar);
    }
    if (!document.getElementById('cpc-receipt-inspector-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'cpc-receipt-inspector-backdrop';
        backdrop.className = 'hidden absolute inset-0 z-[96] bg-gray-950/45 backdrop-blur-[1px]';
        container.appendChild(backdrop);
    }
    if (!document.getElementById('cpc-receipt-inspector')) {
        const panel = document.createElement('div');
        panel.id = 'cpc-receipt-inspector';
        panel.className = 'hidden absolute z-[97] w-full max-w-[420px]';
        panel.innerHTML = `
            <div data-receipt-inspector-card class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div data-receipt-panel-handle class="flex cursor-grab items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 active:cursor-grabbing">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Edicion</p>
                        <h4 data-receipt-inspector-title class="text-sm font-black text-gray-800">Elemento</h4>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" data-receipt-inspector-action="reset" class="rounded-full border border-gray-200 px-3 py-1 text-[10px] font-black uppercase text-gray-500 transition hover:border-brand-red hover:text-brand-red">Restablecer</button>
                        <button type="button" data-receipt-inspector-action="close" class="h-8 w-8 rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div data-receipt-inspector-body class="custom-scroll space-y-3 overflow-y-auto px-4 py-4 text-xs text-gray-600" style="max-height:min(72vh,calc(100vh - 8rem));">
                    <label data-receipt-inspector-row="text" class="flex flex-col gap-1">
                        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Texto</span>
                        <textarea data-receipt-inspector-field="text" rows="3" maxlength="500" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></textarea>
                    </label>
                    <div data-receipt-inspector-content class="hidden space-y-3"></div>
                    <div data-receipt-inspector-advanced class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"></div>
                    <div data-receipt-inspector-typography class="grid grid-cols-2 gap-3">
                        <label class="flex flex-col gap-1">
                            <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fuente</span>
                            <select data-receipt-inspector-field="fontFamilyKey" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></select>
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Tamano</span>
                            <input data-receipt-inspector-field="fontSize" type="number" min="8" max="72" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Color</span>
                            <input data-receipt-inspector-field="color" type="color" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red">
                        </label>
                        <label class="flex flex-col gap-1">
                            <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alineacion</span>
                            <select data-receipt-inspector-field="align" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
                                <option value="left">Izquierda</option>
                                <option value="center">Centro</option>
                                <option value="right">Derecha</option>
                                <option value="justify">Justificado</option>
                            </select>
                        </label>
                    </div>
                    <div data-receipt-inspector-toggle-row class="grid grid-cols-3 gap-2">
                        <button type="button" data-receipt-inspector-toggle="bold" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Negrita</button>
                        <button type="button" data-receipt-inspector-toggle="italic" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Itálica</button>
                        <button type="button" data-receipt-inspector-toggle="underline" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition">Subrayado</button>
                    </div>
                    <button type="button" data-receipt-inspector-action="delete" class="hidden inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition hover:bg-red-100"><i class="fa-solid fa-trash"></i><span>Eliminar recurso</span></button>
                </div>
            </div>
        `;
        panel.addEventListener('input', __contractsHandleReceiptInspectorInput);
        panel.addEventListener('change', __contractsHandleReceiptInspectorInput);
        panel.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            if (!(event.target instanceof HTMLInputElement)) return;
            if (event.target.type === 'button' || event.target.type === 'submit' || event.target.type === 'reset') return;
            event.preventDefault();
        });
        panel.addEventListener('click', __contractsHandleReceiptInspectorClick);
        container.appendChild(panel);
    }
    __contractsBindReceiptToolbarDrag(document.getElementById('cpc-receipt-inspector'), container);
    if (container.dataset.cpContractPageControlsBound !== '1') {
        container.dataset.cpContractPageControlsBound = '1';
        container.addEventListener('click', __contractsHandlePageControlClick);
    }
    if (container.dataset.cpContractsReceiptInspectorBound !== '1') {
        container.dataset.cpContractsReceiptInspectorBound = '1';
        container.addEventListener('scroll', () => requestAnimationFrame(__contractsPositionReceiptInspector), { passive: true });
        window.addEventListener('resize', () => requestAnimationFrame(__contractsPositionReceiptInspector));
        document.addEventListener('dblclick', (event) => {
            if (!__contractsIsAdminProfile() || __contractsReceiptEditLocked) return;
            if (document.getElementById('view-receipt')?.classList.contains('hidden')) return;
            const target = event.target instanceof Element
                ? event.target
                : (event.target && event.target.parentElement instanceof Element ? event.target.parentElement : null);
            if (!target) return;
            if (target.closest('#cpc-receipt-inspector')) return;
            const resourceNode = target.closest('#receipt-preview-box .cpc-pdf-resource[data-res-id]');
            if (resourceNode) {
                const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
                const page = parseInt(resourceNode.getAttribute('data-res-page') || '1', 10);
                const resource = __contractsFindReceiptResourceById(resourceId, page);
                if (!resource) return;
                if (!__contractsCanMoveReceiptResource(resource) && !__contractsCanEditReceiptResource(resource)) return;
                if (typeof event.preventDefault === 'function') event.preventDefault();
                if (typeof event.stopPropagation === 'function') event.stopPropagation();
                __contractsOpenReceiptInspector({ kind: 'resource', id: resourceId, page });
                return;
            }
            const baseNode = target.closest('#receipt-preview-box [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            if (!__contractsGetPdfBaseBlockMeta(baseKey)) return;
            if (!__contractsCanMoveReceiptBaseBlock(baseKey) && !__contractsCanEditReceiptBaseBlock(baseKey)) return;
            if (typeof event.preventDefault === 'function') event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            __contractsOpenReceiptInspector({ kind: 'base', key: baseKey, instanceKey: String(baseNode.dataset.baseInstance || baseKey).trim() });
        });
    }
    __contractsSyncReceiptEditMode();
    if (!skipEditorUiRefresh) __contractsRenderReceiptInspector();
}

function __contractsSyncPdfStyleValueLabels(style) {
    const cfg = __contractsNormalizePdfStyle(style);
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setText('pdf-style-header-line-value', `${cfg.headerLinePx}px`);
    setText('pdf-style-sign-line-value', `${cfg.signLinePx}px`);
    setText('pdf-style-title-size-value', `${cfg.titlePx}px`);
    setText('pdf-style-meta-size-value', `${cfg.metaPx}px`);
    setText('pdf-style-table-size-value', `${cfg.tableBodyPx}px`);
    setText('pdf-style-line-height-value', `${cfg.lineHeightPct}%`);
    setText('pdf-style-offset-x-value', `${cfg.offsetXPx}px`);
    setText('pdf-style-offset-y-value', `${cfg.offsetYPx}px`);
    setText('pdf-style-extra-pages-value', `+${cfg.extraPages}`);
    setText('pdf-style-quick-size-value', `${cfg.quickPx}px`);
    setText('pdf-style-conditions-size-value', `${cfg.conditionsPx}px`);
    setText('pdf-style-sign-size-value', `${cfg.signPx}px`);
    setText('pdf-style-margin-top-value', `${cfg.marginTopPx}px`);
    setText('pdf-style-margin-bottom-value', `${cfg.marginBottomPx}px`);
    setText('pdf-style-margin-left-value', `${cfg.marginLeftPx}px`);
    setText('pdf-style-margin-right-value', `${cfg.marginRightPx}px`);
}

function __contractsWritePdfStyleControls(style) {
    const cfg = __contractsNormalizePdfStyle(style);
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = String(val);
    };
    setValue('pdf-style-font-family', cfg.fontFamilyKey);
    setValue('pdf-style-header-line', cfg.headerLinePx);
    setValue('pdf-style-sign-line', cfg.signLinePx);
    setValue('pdf-style-title-size', cfg.titlePx);
    setValue('pdf-style-meta-size', cfg.metaPx);
    setValue('pdf-style-table-size', cfg.tableBodyPx);
    setValue('pdf-style-line-height', cfg.lineHeightPct);
    setValue('pdf-style-offset-x', cfg.offsetXPx);
    setValue('pdf-style-offset-y', cfg.offsetYPx);
    setValue('pdf-style-extra-pages', cfg.extraPages);
    setValue('pdf-style-margin-top', cfg.marginTopPx);
    setValue('pdf-style-margin-bottom', cfg.marginBottomPx);
    setValue('pdf-style-margin-left', cfg.marginLeftPx);
    setValue('pdf-style-margin-right', cfg.marginRightPx);
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
    const signs = __contractsNormalizePdfSignLabels(cfg.signLabels);
    setValue('pdf-style-sign-receipt-left-name', signs.receiptLeftName);
    setValue('pdf-style-sign-receipt-left-role', signs.receiptLeftRole);
    setValue('pdf-style-sign-receipt-right-name', signs.receiptRightName);
    setValue('pdf-style-sign-receipt-right-role', signs.receiptRightRole);
    setValue('pdf-style-sign-liquid-left-name', signs.liquidatedLeftName);
    setValue('pdf-style-sign-liquid-left-role', signs.liquidatedLeftRole);
    setValue('pdf-style-sign-liquid-right-name', signs.liquidatedRightName);
    setValue('pdf-style-sign-liquid-right-role', signs.liquidatedRightRole);
    setValue('pdf-style-sign-client-name', signs.clientName);
    setValue('pdf-style-sign-client-role', signs.clientRole);
    __contractsSyncPdfStyleValueLabels(cfg);
}

function __contractsReadPdfStyleControls() {
    const current = __contractsGetPdfStyleConfig();
    return __contractsNormalizePdfStyle({
        ...current,
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        signLinePx: document.getElementById('pdf-style-sign-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __CP_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
        tableBodyPx: document.getElementById('pdf-style-table-size')?.value,
        lineHeightPct: document.getElementById('pdf-style-line-height')?.value,
        offsetXPx: document.getElementById('pdf-style-offset-x')?.value,
        offsetYPx: document.getElementById('pdf-style-offset-y')?.value,
        extraPages: document.getElementById('pdf-style-extra-pages')?.value,
        marginTopPx: document.getElementById('pdf-style-margin-top')?.value ?? current.marginTopPx,
        marginBottomPx: document.getElementById('pdf-style-margin-bottom')?.value ?? current.marginBottomPx,
        marginLeftPx: document.getElementById('pdf-style-margin-left')?.value ?? current.marginLeftPx,
        marginRightPx: document.getElementById('pdf-style-margin-right')?.value ?? current.marginRightPx,
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
        footerAlign: document.getElementById('pdf-style-align-footer')?.value,
        resources: current.resources,
        signLabels: {
            ...(current.signLabels || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS),
            receiptLeftName: document.getElementById('pdf-style-sign-receipt-left-name')?.value,
            receiptLeftRole: document.getElementById('pdf-style-sign-receipt-left-role')?.value,
            receiptRightName: document.getElementById('pdf-style-sign-receipt-right-name')?.value,
            receiptRightRole: document.getElementById('pdf-style-sign-receipt-right-role')?.value,
            liquidatedLeftName: document.getElementById('pdf-style-sign-liquid-left-name')?.value,
            liquidatedLeftRole: document.getElementById('pdf-style-sign-liquid-left-role')?.value,
            liquidatedRightName: document.getElementById('pdf-style-sign-liquid-right-name')?.value,
            liquidatedRightRole: document.getElementById('pdf-style-sign-liquid-right-role')?.value,
            clientName: document.getElementById('pdf-style-sign-client-name')?.value || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientName,
            clientRole: document.getElementById('pdf-style-sign-client-role')?.value || __CP_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientRole
        }
    });
}

function __contractsSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __contractsPdfStyleState = __contractsNormalizePdfStyle(style);
    if (__contractsIsAdminProfile()) __contractsSaveEditorDraft(__contractsPdfStyleState);
    if (opts.applyToDom !== false) __contractsApplyPdfStyleToLivePreview(opts);
}

function __contractsNormalizeRoleValue(value) {
    const role = String(value || '').trim().toLowerCase();
    if (!role) return '';
    if (role === 'administrador' || role === 'administrator' || role === 'administrators' || role === 'superadmin' || role === 'super_admin' || role === 'admins') return 'admin';
    return role;
}

function __contractsIsAdminProfile() {
    const rbac = window.HUB_RBAC || null;
    if (rbac?.canAny) return rbac.canAny(['pdf_layout_manage', 'config_manage']);
    const authCtx = window.__HUB_AUTH_CONTEXT || {};
    const perms = (authCtx.permissions && typeof authCtx.permissions === 'object')
        ? authCtx.permissions
        : ((window.currentUserProfile?.effective_permissions && typeof window.currentUserProfile.effective_permissions === 'object')
            ? window.currentUserProfile.effective_permissions
            : {});
    if (authCtx.isAdmin === true) return true;
    if (Object.prototype.hasOwnProperty.call(perms || {}, 'pdf_layout_manage')) return perms.pdf_layout_manage === true;
    if (Object.prototype.hasOwnProperty.call(perms || {}, 'config_manage')) return perms.config_manage === true;
    return false;
}

function __contractsResolveReceiptActorName() {
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
    const resolved = candidates.map((value) => String(value || '').trim()).find(Boolean);
    return resolved || 'Usuario';
}

function __contractsResolveReceiptActorEmail() {
    const candidates = [
        window.currentUserProfile?.email,
        window.currentUserProfile?.record?.email,
        window.currentUserProfile?.profile?.email,
        window.currentUserProfile?.user?.email
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __contractsCanUseReceiptNotes() {
    return false;
}

async function __contractsLoadCurrentUserProfile(user) {
    const pbClient = window.globalPocketBase || window.pbClient || window.tenantPocketBase;
    const fallback = user && typeof user === 'object' ? user : {};
    if (!pbClient) return { ...fallback };
    const normalizeRole = (value) => {
        const role = String(value || '').trim().toLowerCase();
        if (!role) return '';
        if (role === 'administrador' || role === 'administrator' || role === 'administrators' || role === 'superadmin' || role === 'super_admin' || role === 'admins') return 'admin';
        return role;
    };
    const parseAuthState = (key) => {
        try {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const authState = parseAuthState('pb_native_auth_v1');
    const idCandidates = [...new Set([
        String(fallback?.id || '').trim(),
        String(fallback?.record?.id || '').trim(),
        String(authState?.user?.id || '').trim(),
        String(authState?.record?.id || '').trim()
    ].filter(Boolean))];
    const emailCandidates = [...new Set([
        String(fallback?.email || '').trim().toLowerCase(),
        String(fallback?.record?.email || '').trim().toLowerCase(),
        String(authState?.user?.email || '').trim().toLowerCase(),
        String(authState?.record?.email || '').trim().toLowerCase()
    ].filter(Boolean))];
    const usernameCandidates = [...new Set([
        String(fallback?.login_username || '').trim(),
        String(fallback?.record?.login_username || '').trim(),
        String(fallback?.username || '').trim(),
        String(fallback?.record?.username || '').trim(),
        String(authState?.user?.login_username || '').trim(),
        String(authState?.record?.login_username || '').trim(),
        String(authState?.user?.username || '').trim(),
        String(authState?.record?.username || '').trim()
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
    const merged = {
        ...(appUser || {}),
        ...fallback
    };
    const role = normalizeRole(
        appUser?.role
        || appUser?.rol
        || fallback?.role
        || fallback?.rol
        || fallback?.record?.role
        || fallback?.record?.rol
    );
    if (role) {
        merged.role = role;
    }
    if (!merged.username) merged.username = appUser?.login_username || appUser?.username || fallback?.login_username || fallback?.username || fallback?.email?.split('@')[0] || '';
    return merged;
}

function __contractsResolvePdfOverlayConfigPayload(record = {}) {
    const rawRecord = record && typeof record === 'object' ? record : {};
    const parseObjectLike = (value) => {
        if (value && typeof value === 'object') return value;
        const raw = String(value || '').trim();
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const configJson = parseObjectLike(rawRecord.config_json);
    if (configJson) return configJson;
    const elements = parseObjectLike(rawRecord.elements) || {};
    const elementConfig = parseObjectLike(elements.config_json);
    if (elementConfig) return elementConfig;
    if (elements.profiles && typeof elements.profiles === 'object') {
        return {
            tenant: rawRecord.tenant || elements.tenant || __CP_CONTRACTS_PDF_STYLE_TENANT,
            version: Math.max(2, parseInt(elements.version, 10) || 2),
            updated_at: elements.updated_at || window.__serverDateService.nowISO(),
            profiles: elements.profiles
        };
    }
    return {};
}

function __contractsBuildPdfOverlayElementsPayload(configJson) {
    const resolved = __contractsResolvePdfOverlayConfigPayload({ config_json: configJson });
    const profiles = __contractsNormalizePdfStyleProfiles(resolved);
    const objects = [];
    Object.entries(profiles).forEach(([profileKey, style]) => {
        const safeStyle = __contractsNormalizePdfStyle(style);
        const safeResources = __contractsNormalizePdfResources(safeStyle.resources);
        safeResources.forEach((resource, index) => {
            const type = String(resource.type || '').toLowerCase();
            objects.push({
                id: `${profileKey}:${resource.id || index}`,
                overlay_profile: profileKey,
                overlay_resource_type: type,
                type: type === 'logo' ? 'image' : ((type === 'bar' || type === 'sign' || type === 'sign-line') ? 'rect' : 'textbox'),
                left: Number(resource.x || 0),
                top: Number(resource.y || 0),
                width: Number(resource.w || 0),
                height: Number(resource.h || 0),
                angle: Number(resource.angle || 0),
                fill: resource.bgColor || resource.color || '#111827',
                backgroundColor: resource.bgColor || 'transparent',
                text: resource.text || resource.signTitle || '',
                signTitle: resource.signTitle || '',
                signRole: resource.signRole || '',
                fontSize: Number(resource.fontSize || 14),
                fontFamily: __CP_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey || safeStyle.fontFamilyKey] || __CP_CONTRACTS_PDF_STYLE_FONT_MAP.segoe,
                scaleX: 1,
                scaleY: 1,
                page: Number(resource.page || 1),
                enabled: resource.enabled !== false
            });
        });
    });
    return {
        tenant: resolved.tenant || __CP_CONTRACTS_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(resolved.version, 10) || 2),
        updated_at: resolved.updated_at || window.__serverDateService.nowISO(),
        profiles,
        config_json: resolved,
        objects
    };
}

function __contractsPickLatestRecord(records) {
    const list = Array.isArray(records) ? records.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

async function __contractsLoadModernPdfStyleRecord(generatorType) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    const overlayDocumentType = __contractsOverlayDocumentType(generatorType);
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from(__CP_CONTRACTS_PDF_OVERLAYS_COLLECTION)
                .select('id,config_json,elements,updated,created,updated_at,created_at')
                .eq('tenant', __CP_CONTRACTS_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            const row = __contractsPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                return {
                    source: 'pdf_overlays',
                    id: String(row.id || ''),
                    config: __contractsResolvePdfOverlayConfigPayload(row),
                    raw: row.config_json || row.elements || {}
                };
            }
        } catch (_) {}
    }
    return null;
}

async function __contractsUpsertModernPdfStyleRecord(generatorType, configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return { id: '', config: configJson || {} };
    const overlayDocumentType = __contractsOverlayDocumentType(generatorType);
    const safeConfig = __contractsResolvePdfOverlayConfigPayload({ config_json: configJson || {} });
    const payload = {
        tenant: __CP_CONTRACTS_PDF_STYLE_TENANT,
        document_type: overlayDocumentType,
        config_json: safeConfig,
        elements: __contractsBuildPdfOverlayElementsPayload(safeConfig)
    };
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existingModern, error: modernLookupError } = await pbClient
                .from(__CP_CONTRACTS_PDF_OVERLAYS_COLLECTION)
                .select('id,updated,created,updated_at,created_at')
                .eq('tenant', __CP_CONTRACTS_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            if (modernLookupError) throw modernLookupError;
            const existingRow = __contractsPickLatestRecord(Array.isArray(existingModern) ? existingModern : (existingModern ? [existingModern] : []));
            if (existingRow?.id) {
                const { error: updateError } = await pbClient
                    .from(__CP_CONTRACTS_PDF_OVERLAYS_COLLECTION)
                    .update(payload)
                    .eq('tenant', __CP_CONTRACTS_PDF_STYLE_TENANT)
                    .eq('document_type', overlayDocumentType);
                if (updateError) throw updateError;
                return { id: String(existingRow.id || ''), config: payload.config_json };
            }
            const { data: inserted, error: insertError } = await pbClient
                .from(__CP_CONTRACTS_PDF_OVERLAYS_COLLECTION)
                .insert(payload)
                .select('id')
                .single();
            if (insertError) throw insertError;
            return { id: String(inserted?.id || ''), config: payload.config_json };
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    return { id: '', config: payload.config_json };
}

async function __contractsLoadSharedPdfStyleConfig(profile = 'receipt') {
    if (!window.tenantPocketBase && !window.globalPocketBase) return;
    const profileKey = __contractsNormalizeProfileKey(profile);
    try {
        const generatorType = profileKey === 'contract' ? 'contracts' : 'receipts';
        const record = await __contractsLoadModernPdfStyleRecord(generatorType);
        if (!record) {
            __contractsPdfStyleActiveProfile = profileKey;
            __contractsPdfStyleConfigRecordId = '';
            __contractsPdfStyleConfigStore = '';
            __contractsPdfStyleRawPayload = null;
            __contractsSharedTemplateTextLayouts = {};
            __contractsSetPdfStyleConfig(__CP_CONTRACTS_PDF_STYLE_DEFAULTS, { applyToDom: false });
            return;
        }
        __contractsPdfStyleConfigRecordId = record.id;
        __contractsPdfStyleConfigStore = record.source;
        __contractsPdfStyleRawPayload = record.raw || record.config || {};
        __contractsSharedTemplateTextLayouts = __contractsPdfStyleRawPayload?.templateTextLayouts && typeof __contractsPdfStyleRawPayload.templateTextLayouts === 'object'
            ? __contractsPdfStyleRawPayload.templateTextLayouts
            : {};
        const resolved = __contractsExtractPdfStyleProfile(record.config || __CP_CONTRACTS_PDF_STYLE_DEFAULTS, profileKey);
        __contractsSetPdfStyleConfig(resolved || __CP_CONTRACTS_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __contractsPdfStyleActiveProfile = profileKey;
    } catch (e) {}
}

async function __contractsPersistSharedPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__contractsIsAdminProfile() && opts.force !== true) return;
    if (!window.tenantPocketBase && !window.globalPocketBase) return;
    const profileKey = __contractsNormalizeProfileKey(__contractsPdfStyleActiveProfile);
    const generatorType = profileKey === 'contract' ? 'contracts' : 'receipts';
    const safeStyle = __contractsNormalizePdfStyle(style || __contractsPdfStyleState || {});
    const existingPayload = __contractsPdfStyleRawPayload && typeof __contractsPdfStyleRawPayload === 'object'
        ? __contractsPdfStyleRawPayload
        : {};
    const configJson = __contractsBuildPdfStyleConfigPayload(existingPayload, safeStyle, profileKey);
    configJson.templateTextLayouts = __contractsSharedTemplateTextLayouts && typeof __contractsSharedTemplateTextLayouts === 'object'
        ? __contractsSharedTemplateTextLayouts
        : {};
    try {
        const saved = await __contractsUpsertModernPdfStyleRecord(generatorType, configJson);
        __contractsPdfStyleConfigRecordId = saved.id;
        __contractsPdfStyleConfigStore = 'pdf_overlays';
        __contractsPdfStyleRawPayload = configJson;
    } catch (e) {}
}

function __contractsResolveReceiptPreviewProfile() {
    return currentRemainingBalance <= 0.01 ? 'liquidation' : 'receipt';
}

async function __contractsEnsureActiveReceiptProfile() {
    const desiredProfile = __contractsNormalizeProfileKey(__contractsResolveReceiptPreviewProfile());
    if (__contractsPdfStyleActiveProfile === desiredProfile) return;
    await __contractsLoadSharedPdfStyleConfig(desiredProfile);
    const activeStyle = __contractsGetPdfStyleConfig();
    __contractsWritePdfStyleControls(activeStyle);
    __contractsSyncPdfStyleValueLabels(activeStyle);
    if (__contractsIsAdminProfile()) __contractsRenderPdfResourcesEditorList();
}

function __contractsScheduleSharedPdfStyleSync(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__contractsIsAdminProfile() && opts.force !== true) return;
    if (__contractsPdfStyleSyncTimer) clearTimeout(__contractsPdfStyleSyncTimer);
    __contractsPdfStyleSyncTimer = setTimeout(() => {
        __contractsPersistSharedPdfStyleConfig(style || __contractsPdfStyleState, opts);
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

function __contractsInitPdfResourceModalDrag() {
    const modal = document.getElementById('pdf-resource-modal');
    if (!modal || modal.dataset.dragReady === '1') return;
    const card = modal.firstElementChild instanceof HTMLElement ? modal.firstElementChild : null;
    if (!card) return;
    modal.dataset.dragReady = '1';

    const headerCandidate = card.querySelector('.bg-gray-50') || card.querySelector('h2, h3')?.closest('div') || card;
    const handle = headerCandidate instanceof HTMLElement ? headerCandidate : card;
    card.setAttribute('data-pdf-resource-modal-card', '1');
    handle.setAttribute('data-pdf-resource-modal-drag-handle', '1');
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';

    let offsetX = 0;
    let offsetY = 0;
    let dragState = null;

    const applyOffset = () => {
        card.style.transform = (offsetX || offsetY) ? `translate(${offsetX}px, ${offsetY}px)` : '';
    };

    const clampOffsets = (nextX, nextY) => ({ x: nextX, y: nextY });

    const resetOffset = () => {
        offsetX = 0;
        offsetY = 0;
        card.style.transform = '';
    };

    const releasePointer = (state) => {
        if (!state?.captureNode || state.pointerId === undefined) return;
        if (typeof state.captureNode.releasePointerCapture === 'function') {
            try { state.captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
        }
    };

    const endDrag = () => {
        if (!dragState) return;
        const state = dragState;
        dragState = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
    };

    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (modal.classList.contains('hidden')) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (!target.closest('[data-pdf-resource-modal-drag-handle]')) return;
        if (target.closest('button, input, select, textarea, a, label, [data-no-modal-drag]')) return;
        const start = clampOffsets(offsetX, offsetY);
        offsetX = start.x;
        offsetY = start.y;
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            baseX: offsetX,
            baseY: offsetY,
            pointerId: event.pointerId,
            captureNode: handle
        };
        if (typeof handle.setPointerCapture === 'function') {
            try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        event.preventDefault();
    });

    document.addEventListener('pointermove', (event) => {
        if (!dragState) return;
        if (dragState.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        const next = clampOffsets(dragState.baseX + dx, dragState.baseY + dy);
        offsetX = next.x;
        offsetY = next.y;
        applyOffset();
        event.preventDefault();
    });

    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', () => {
        if (modal.classList.contains('hidden')) return;
        const next = clampOffsets(offsetX, offsetY);
        offsetX = next.x;
        offsetY = next.y;
        applyOffset();
    });

    const observer = new MutationObserver(() => {
        if (modal.classList.contains('hidden')) {
            endDrag();
            resetOffset();
            return;
        }
        resetOffset();
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
function __contractsInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__contractsPdfStyleState) __contractsPdfStyleState = __contractsLoadPdfStyleState();
    __contractsPdfStyleUiState = __contractsLoadPdfStyleUiState();
    __contractsWritePdfStyleControls(__contractsGetPdfStyleConfig());
    __contractsApplyPdfStyleEditorUiState();

    if (!__contractsIsAdminProfile()) {
        editorWrap.classList.add('hidden');
        __contractsBindPdfResourceDrag();
        __contractsInitPdfResourceModalDrag();
        __contractsEnsureReceiptEditingChrome();
        __contractsRenderReceiptToolbar();
        return;
    }

    if (editorWrap.dataset.bound !== '1') {
        editorWrap.querySelectorAll('.pdf-style-control').forEach((control) => {
            control.addEventListener('input', __contractsHandlePdfStyleControlChange);
            control.addEventListener('change', __contractsHandlePdfStyleControlChange);
        });
        document.getElementById('btn-reset-pdf-style')?.addEventListener('click', () => {
            const reset = __contractsNormalizePdfStyle(__CP_CONTRACTS_PDF_STYLE_DEFAULTS);
            __contractsSetPdfStyleConfig(reset, { applyToDom: true });
            __contractsWritePdfStyleControls(reset);
            __contractsScheduleSharedPdfStyleSync(reset);
            __contractsRenderPdfResourcesEditorList();
            __contractsRefreshPreviewFromStyleState();
        });
        document.getElementById('btn-pdf-style-toggle')?.addEventListener('click', __contractsTogglePdfStylePanel);
        document.getElementById('btn-pdf-style-pin')?.addEventListener('click', __contractsTogglePdfStylePin);
        editorWrap.dataset.bound = '1';
    }

    __contractsBindPdfResourceEditor();
    __contractsBindPdfResourceDrag();
    __contractsBindPdfResourceClipboard();
    __contractsInitPdfResourceModalDrag();
    editorWrap.classList.add('hidden');
    __contractsEnsureReceiptEditingChrome();
    __contractsEnsureMarginGuideController()?.refresh();
}

function __contractsRefreshPreviewFromStyleState(options = {}) {
    if (!selectedOrder) return;
    window.updateReceiptPreview(options);
}

function __contractsCommitPdfResources(resources, options = {}) {
    const cfg = __contractsGetPdfStyleConfig();
    const next = __contractsNormalizePdfStyle({ ...cfg, resources: __contractsNormalizePdfResources(resources) });
    const skipEditorUiRefresh = options && options.skipEditorUiRefresh === true;
    __contractsSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh });
    __contractsScheduleSharedPdfStyleSync(next, { force: options.forcePersist === true });
    if (options.refreshPreview !== false) __contractsRefreshPreviewFromStyleState({ skipEditorUiRefresh });
    if (!skipEditorUiRefresh) {
        __contractsRenderPdfResourcesEditorList();
        __contractsRenderReceiptInspector();
    }
}

function __contractsGetPdfResourcesFromState() {
    return __contractsNormalizePdfResources(__contractsGetPdfStyleConfig().resources);
}

function __contractsGetReceiptBasePageCount() {
    return 1;
}

function __contractsResolveReceiptNotePlacement(style) {
    const cfg = __contractsNormalizePdfStyle(style || __contractsGetPdfStyleConfig());
    const basePages = __contractsGetReceiptBasePageCount();
    let extraPages = Math.max(0, __contractsClampStyleNumber(cfg.extraPages, 0, 6, 0));
    if (extraPages === 0) extraPages = 1;
    let page = basePages + extraPages;
    const resources = __contractsNormalizePdfResources(cfg.resources);
    const noteResources = resources
        .filter((resource) => resource.isUserNote === true && Number(resource.page || 1) === page)
        .sort((a, b) => (a.y + a.h) - (b.y + b.h));
    let y = noteResources.length ? (noteResources[noteResources.length - 1].y + noteResources[noteResources.length - 1].h + 22) : 140;
    const pageBaseHeight = Number(__contractsContentBaseHeightPx().toFixed(2));
    if (y > pageBaseHeight - 220 && extraPages < 6) {
        extraPages += 1;
        page = basePages + extraPages;
        y = 140;
    }
    return { page, extraPages, y };
}

function __contractsBuildReceiptNoteResource(noteText, authorName, style) {
    const placement = __contractsResolveReceiptNotePlacement(style);
    return {
        id: `cpcnote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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

function __contractsOpenReceiptNoteModal() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
}

window.submitPdfNoteFromModal = async function() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
};

function __contractsRemovePdfResource(resourceId) {
    const id = String(resourceId || '').trim();
    if (!id) return;
    const nextResources = __contractsGetPdfResourcesFromState().filter((resource) => resource.id !== id);
    if (__contractsPdfResourceSelectedId === id) {
        __contractsPdfResourceSelectedId = __CP_CONTRACTS_PDF_BASE_BLOCKS[0]?.id || nextResources[0]?.id || '';
    }
    if (__contractsReceiptInspectorState?.kind === 'resource' && __contractsReceiptInspectorState.id === id) {
        __contractsCloseReceiptInspector();
    }
    __contractsCommitPdfResources(nextResources);
}

function __contractsHighlightSelectedResource() {
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-edit-selected').forEach((node) => {
        node.classList.remove('cpc-pdf-edit-selected');
    });
    if (!__contractsIsAdminProfile()) return;
    const selected = String(__contractsPdfResourceSelectedId || '');
    if (!selected) return;
    if (selected.startsWith('base:')) {
        const key = selected.replace(/^base:/, '').split('__')[0].trim();
        if (!key) return;
        document.querySelectorAll(`#receipt-preview-box [data-base-resource="${key}"]`).forEach((node) => node.classList.add('cpc-pdf-edit-selected'));
        return;
    }
    document.querySelectorAll('#receipt-preview-box .cpc-pdf-resource[data-res-id]').forEach((node) => {
        if (String(node.getAttribute('data-res-id') || '') === selected) node.classList.add('cpc-pdf-edit-selected');
    });
}

function __contractsAddPdfResource(type) {
    const resources = __contractsGetPdfResourcesFromState();
    const normalizedType = String(type || '').toLowerCase() === 'sign-line' ? 'sign' : String(type || '').toLowerCase();
    const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
    const isSign = safeType === 'sign' || safeType === 'sign-block';
    const newId = `cpc_res_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    resources.push({
        id: newId,
        type: safeType,
        enabled: true,
        page: 1,
        x: 80,
        y: 120,
        w: safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : (isSign ? 220 : 260)),
        h: safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : (safeType === 'sign' ? 24 : (safeType === 'sign-block' ? 42 : 14))),
        text: safeType === 'title' ? 'TÍTULO NUEVO' : (safeType === 'text' ? 'Texto nuevo' : ''),
        fontSize: safeType === 'title' ? 24 : 14,
        fontFamilyKey: '',
        bold: true,
        italic: false,
        underline: false,
        align: 'left',
        color: '#111827',
        angle: 0,
        bgColor: safeType === 'logo' ? 'transparent' : (isSign ? '#111827' : (safeType === 'bar' ? '#c1621e' : 'transparent'))
    });
    __contractsPdfResourceSelectedId = resources[resources.length - 1].id;
    __contractsCommitPdfResources(resources);
    return newId;
}

function __contractsIsPdfClipboardEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
    return !!target.closest('.tox, .CodeMirror, .monaco-editor');
}

function __contractsBuildPdfClipboardResourceClone(resource, offsetStep = 24) {
    const base = resource && typeof resource === 'object' ? { ...resource } : null;
    if (!base) return null;
    const nextId = `cpc_res_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return __contractsNormalizePdfResources([{
        ...base,
        id: nextId,
        x: __contractsClampStyleNumber((parseInt(base.x, 10) || 0) + offsetStep, -4000, 4000, 80),
        y: __contractsClampStyleNumber((parseInt(base.y, 10) || 0) + offsetStep, -5000, 5000, 120)
    }])[0] || null;
}

function __contractsCopySelectedPdfResourceToClipboard() {
    const selectedId = String(__contractsPdfResourceSelectedId || '').trim();
    if (!selectedId || selectedId.startsWith('base:')) return false;
    const selected = __contractsGetPdfResourcesFromState().find((resource) => resource.id === selectedId);
    if (!selected) return false;
    const safeCopy = __contractsNormalizePdfResources([{ ...selected }])[0];
    if (!safeCopy) return false;
    __contractsPdfResourceClipboard = safeCopy;
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'cp-receipts',
            at: Date.now(),
            resource: { ...safeCopy }
        };
    } catch (_) {}
    return true;
}

function __contractsPastePdfResourceFromClipboard() {
    const sharedClipboard = window.__HUB_PDF_RESOURCE_CLIPBOARD?.resource;
    const source = __contractsPdfResourceClipboard || (sharedClipboard && typeof sharedClipboard === 'object' ? { ...sharedClipboard } : null);
    if (!source) return '';
    const clone = __contractsBuildPdfClipboardResourceClone(source);
    if (!clone) return '';
    const resources = __contractsGetPdfResourcesFromState();
    resources.push(clone);
    __contractsPdfResourceSelectedId = clone.id;
    __contractsCommitPdfResources(resources);
    __contractsPdfResourceClipboard = { ...clone };
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'cp-receipts',
            at: Date.now(),
            resource: { ...clone }
        };
    } catch (_) {}
    return clone.id;
}

function __contractsBindPdfResourceClipboard() {
    if (document.body.dataset.cpReceiptsPdfClipboardBound === '1') return;
    document.body.dataset.cpReceiptsPdfClipboardBound = '1';
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented) return;
        if (!__contractsIsAdminProfile() || __contractsReceiptEditLocked) return;
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (__contractsIsPdfClipboardEditableTarget(event.target)) return;
        const preview = document.getElementById('receipt-preview-box');
        if (!preview || preview.classList.contains('hidden')) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'c') {
            if (!__contractsCopySelectedPdfResourceToClipboard()) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF copiado', 'success'); } catch (_) {}
            return;
        }
        if (key === 'v') {
            const pastedId = __contractsPastePdfResourceFromClipboard();
            if (!pastedId) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF duplicado', 'success'); } catch (_) {}
        }
    }, true);
}

function __contractsRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list) return;
    if (!__contractsIsAdminProfile()) {
        list.innerHTML = '';
        return;
    }
    const resources = __contractsGetPdfResourcesFromState();
    const selectedId = String(__contractsPdfResourceSelectedId || '');
    if (!selectedId && resources.length) {
        __contractsPdfResourceSelectedId = resources[0].id;
    } else if (!selectedId.startsWith('base:') && resources.length && !resources.some((resource) => resource.id === selectedId)) {
        __contractsPdfResourceSelectedId = resources[0].id;
    }
    const typeLabel = (type) => {
        if (type === 'sign' || type === 'sign-line') return 'Línea Firma';
        if (type === 'sign-block') return 'Bloque Firma';
        if (type === 'logo') return 'Logo';
        if (type === 'title') return 'Título';
        if (type === 'text') return 'Texto';
        return 'Barra';
    };
    const rows = resources.map((resource) => {
        const selectedClass = resource.id === __contractsPdfResourceSelectedId ? 'border-brand-red' : 'border-gray-600';
        const canMove = __contractsCanMoveReceiptResource(resource);
        const canEdit = __contractsCanEditReceiptResource(resource);
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isLogo = resource.type === 'logo';
        const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
        const isSignBlock = resource.type === 'sign-block';
        const hideColor = isLogo || isSignBlock ? 'hidden' : '';
        const safeColor = (c) => (c && c !== 'transparent') ? c : '#ffffff';

        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__contractsSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__contractsSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${typeLabel(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__contractsSafeHtml(resource.id)}" class="text-red-300 hover:text-red-200 text-xs ${canMove || canEdit ? '' : 'hidden'}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="grid grid-cols-3 gap-1 ${canMove ? '' : 'hidden'}">
                    <label class="text-[9px] text-gray-400">Pág
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="page" type="number" min="1" max="8" value="${resource.page}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">X
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="x" type="number" value="${resource.x}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="y" type="number" value="${resource.y}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Ancho
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="w" type="number" min="16" value="${resource.w}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Alto
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="h" type="number" min="1" value="${resource.h}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Activo
                        <select data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="enabled" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            <option value="true" ${resource.enabled ? 'selected' : ''}>Sí</option>
                            <option value="false" ${!resource.enabled ? 'selected' : ''}>No</option>
                        </select>
                    </label>
                </div>
                
                <div class="grid grid-cols-2 gap-1 ${canEdit && !(isLogo || isSignLine || isSignBlock) ? '' : 'hidden'}">
                    <label class="text-[9px] text-gray-400">Color Texto
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="color" type="color" value="${safeColor(resource.color)}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400">Color Fondo
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${safeColor(resource.bgColor)}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>

                <div class="grid grid-cols-2 gap-1 ${canEdit && isTextLike ? '' : 'hidden'}">
                    <label class="text-[9px] text-gray-400">Tamaño Fuente
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400 block">Texto
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="text" type="text" value="${__contractsSafeHtml(resource.text)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>

                <div class="space-y-1 ${canEdit && isSignBlock ? '' : 'hidden'}">
                    <label class="text-[9px] text-gray-400 block">Nombre (Firma)
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="signTitle" type="text" value="${__contractsSafeHtml(resource.signTitle || '')}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400 block">Cargo / Rol
                        <input data-res-id="${__contractsSafeHtml(resource.id)}" data-res-field="signRole" type="text" value="${__contractsSafeHtml(resource.signRole || '')}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>
            </div>
        `;
    }).join('');
    list.innerHTML = resources.length
        ? rows
        : '<p class="text-[10px] text-gray-400">Sin recursos adicionales. Usa + Añadir Recurso.</p>';
    __contractsHighlightSelectedResource();
}

function __contractsHandleResourceListEvent(event) {
    const trigger = event.target.closest('[data-res-action], [data-res-field]');
    if (!trigger || !__contractsIsAdminProfile()) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    const isContinuousInput = event.type === 'input'
        && (
            trigger instanceof HTMLTextAreaElement
            || (trigger instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(trigger.type || '').toLowerCase()))
        );
    const id = String(trigger.dataset.resId || '');
    const resources = __contractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === id);
    if (idx < 0) return;

    if (trigger.dataset.resAction === 'remove') {
        const selected = resources[idx];
        if (!__contractsCanMoveReceiptResource(selected) && !__contractsCanEditReceiptResource(selected)) return;
        __contractsRemovePdfResource(id);
        return;
    }
    if (trigger.dataset.resAction === 'select') {
        __contractsPdfResourceSelectedId = id;
        __contractsRenderPdfResourcesEditorList();
        return;
    }

    const field = String(trigger.dataset.resField || '');
    if (!field) return;
    const selected = resources[idx];
    const canMove = __contractsCanMoveReceiptResource(selected);
    const canEdit = __contractsCanEditReceiptResource(selected);
    if (['page', 'x', 'y', 'w', 'h', 'angle', 'enabled'].includes(field) && !canMove) return;
    if (['text', 'fontFamilyKey', 'signTitle', 'signRole', 'fontSize', 'align', 'bold', 'italic', 'underline', 'color', 'bgColor'].includes(field) && !canEdit) return;
    let nextValue = trigger.value;
    if (field === 'enabled') nextValue = String(nextValue) === 'true';
    if (['page', 'x', 'y', 'w', 'h', 'fontSize'].includes(field)) nextValue = parseInt(nextValue, 10);
    if (field === 'bgColor' || field === 'color') nextValue = __contractsNormalizeHexColor(nextValue, resources[idx][field]);
    resources[idx] = { ...resources[idx], [field]: nextValue };
    __contractsPdfResourceSelectedId = id;
    __contractsCommitPdfResources(resources, {
        refreshPreview: __contractsShouldRefreshResourcePreviewField(field),
        skipEditorUiRefresh: isContinuousInput
    });
}

function __contractsBindPdfResourceEditor() {
    if (!__contractsIsAdminProfile()) return;
    const list = document.getElementById('pdf-style-resources-list');
    if (list && list.dataset.bound !== '1') {
        list.addEventListener('input', __contractsHandleResourceListEvent);
        list.addEventListener('change', __contractsHandleResourceListEvent);
        list.addEventListener('click', __contractsHandleResourceListEvent);
        list.dataset.bound = '1';
    }
    document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => { __contractsAddPdfResource('bar'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => { __contractsAddPdfResource('logo'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-title')?.addEventListener('click', () => { __contractsAddPdfResource('title'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-text')?.addEventListener('click', () => { __contractsAddPdfResource('text'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-sign-line')?.addEventListener('click', () => { __contractsAddPdfResource('sign'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-sign-block')?.addEventListener('click', () => { __contractsAddPdfResource('sign-block'); window.closeModal('pdf-resource-modal'); });
    __contractsRenderPdfResourcesEditorList();
}

function __contractsApplyResourceGeometryToNode(node, resource) {
    if (!(node instanceof HTMLElement)) return;
    node.style.left = `${resource.x}px`;
    node.style.top = `${resource.y}px`;
    node.style.width = `${resource.w}px`;
    node.style.height = `${resource.h}px`;
    node.style.transform = `rotate(${resource.angle || 0}deg)`;
    node.style.transformOrigin = 'center center';
}

function __contractsBindPdfResourceDrag() {
    if (document.body.dataset.cpContractsResourceDragBound === '1') return;
    document.body.dataset.cpContractsResourceDragBound = '1';
    const getPointerScale = (node) => {
        const ref = node?.parentElement || node;
        if (!ref || !(ref instanceof HTMLElement)) return { x: 1, y: 1 };
        const rect = ref.getBoundingClientRect();
        const rawWidth = ref.offsetWidth || parseFloat(ref.style.width || '0') || rect.width || 1;
        const rawHeight = ref.offsetHeight || parseFloat(ref.style.height || '0') || rect.height || 1;
        const scaleX = rect.width > 0 && rawWidth > 0 ? (rect.width / rawWidth) : 1;
        const scaleY = rect.height > 0 && rawHeight > 0 ? (rect.height / rawHeight) : 1;
        return { x: scaleX > 0 ? scaleX : 1, y: scaleY > 0 ? scaleY : 1 };
    };
    const getResizeHit = (node, event) => {
        if (window.PdfEditorHitbox?.resolveResizeHit) return window.PdfEditorHitbox.resolveResizeHit(node, event);
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return { resize: false, proportional: false, cursor: 'move' };
        const threshold = Math.min(24, Math.max(14, Math.min(rect.width, rect.height) / 2.75));
        let left = (event.clientX - rect.left) <= threshold;
        let right = (rect.right - event.clientX) <= threshold;
        let top = (event.clientY - rect.top) <= threshold;
        let bottom = (rect.bottom - event.clientY) <= threshold;
        if (event.shiftKey && !(left || right || top || bottom)) {
            right = true;
            bottom = true;
        }
        if (left && right) {
            if (event.clientX - rect.left <= rect.right - event.clientX) right = false;
            else left = false;
        }
        if (top && bottom) {
            if (event.clientY - rect.top <= rect.bottom - event.clientY) bottom = false;
            else top = false;
        }
        if (!(left || right || top || bottom)) return { resize: false, proportional: false, cursor: 'move' };
        let cursor = 'move';
        if ((left || right) && (top || bottom)) {
            const diagonalA = (left && top) || (right && bottom);
            cursor = diagonalA ? 'nwse-resize' : 'nesw-resize';
        } else if (left || right) {
            cursor = 'ew-resize';
        } else if (top || bottom) {
            cursor = 'ns-resize';
        }
        return { resize: true, left, right, top, bottom, proportional: (left || right) && (top || bottom), cursor };
    };
    const minHeightForType = (type) => (type === 'sign' || type === 'sign-line'
        ? 1
        : (type === 'logo'
            ? 24
            : (type === 'sign-block'
                ? 42
                : (type === 'bar' ? 4 : 10))));
    const resizeGeometry = (origin, dx, dy, resize, type) => {
        const minWidth = 16;
        const minHeight = minHeightForType(type || origin?.type);
        const safeOrigin = {
            x: parseFloat(origin?.x) || 0,
            y: parseFloat(origin?.y) || 0,
            w: Math.max(minWidth, parseFloat(origin?.w) || minWidth),
            h: Math.max(minHeight, parseFloat(origin?.h) || minHeight)
        };
        if (resize?.proportional && (resize.left || resize.right) && (resize.top || resize.bottom)) {
            const scaleX = safeOrigin.w > 0 ? ((resize.left ? safeOrigin.w - dx : safeOrigin.w + dx) / safeOrigin.w) : 1;
            const scaleY = safeOrigin.h > 0 ? ((resize.top ? safeOrigin.h - dy : safeOrigin.h + dy) / safeOrigin.h) : 1;
            let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
            if (!Number.isFinite(scale)) scale = 1;
            const minScale = Math.max(minWidth / safeOrigin.w, minHeight / safeOrigin.h);
            scale = Math.max(minScale, scale);
            const nextW = Math.max(minWidth, Math.round(safeOrigin.w * scale));
            const nextH = Math.max(minHeight, Math.round(safeOrigin.h * scale));
            return {
                ...origin,
                x: resize.left ? Math.round(safeOrigin.x + (safeOrigin.w - nextW)) : safeOrigin.x,
                y: resize.top ? Math.round(safeOrigin.y + (safeOrigin.h - nextH)) : safeOrigin.y,
                w: nextW,
                h: nextH
            };
        }
        let nextX = safeOrigin.x;
        let nextY = safeOrigin.y;
        let nextW = safeOrigin.w;
        let nextH = safeOrigin.h;
        if (resize?.left) {
            nextW = Math.max(minWidth, Math.round(safeOrigin.w - dx));
            nextX = Math.round(safeOrigin.x + (safeOrigin.w - nextW));
        } else if (resize?.right) {
            nextW = Math.max(minWidth, Math.round(safeOrigin.w + dx));
        }
        if (resize?.top) {
            nextH = Math.max(minHeight, Math.round(safeOrigin.h - dy));
            nextY = Math.round(safeOrigin.y + (safeOrigin.h - nextH));
        } else if (resize?.bottom) {
            nextH = Math.max(minHeight, Math.round(safeOrigin.h + dy));
        }
        return { ...origin, x: nextX, y: nextY, w: nextW, h: nextH };
    };
    const releasePointer = (state) => {
        const captureNode = state?.captureNode;
        if (!captureNode || typeof captureNode.releasePointerCapture !== 'function') return;
        try { captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
    };
    const endDrag = () => {
        if (!__contractsPdfResourcePointerState) return;
        const state = __contractsPdfResourcePointerState;
        if (state.kind === 'base') {
            __contractsCommitPdfBaseLayout(state.instanceKey, state.current || state.origin);
        } else {
            const resources = __contractsGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id && resource.page === state.page);
            if (idx >= 0) {
                resources[idx] = { ...resources[idx], ...(state.current || state.origin) };
                __contractsCommitPdfResources(resources, { refreshPreview: false });
            }
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
        __contractsPdfResourcePointerState = null;
        __contractsHighlightSelectedResource();
        __contractsRenderReceiptInspector();
        requestAnimationFrame(__contractsPositionReceiptInspector);
    };
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!__contractsIsAdminProfile()) return;
        if (__contractsReceiptEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const node = target.closest('#receipt-preview-box .cpc-pdf-resource[data-res-id]');
        if (node) {
            if (target.closest('.cpc-pdf-delete-btn')) {
                const resId = String(node.getAttribute('data-res-id') || '');
                const resPage = parseInt(node.getAttribute('data-res-page') || '1', 10);
                const resourceToDelete = __contractsFindReceiptResourceById(resId, resPage);
                if (!resourceToDelete || (!__contractsCanMoveReceiptResource(resourceToDelete) && !__contractsCanEditReceiptResource(resourceToDelete))) return;
                __contractsRemovePdfResource(resId);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const id = String(node.getAttribute('data-res-id') || '');
            const page = parseInt(node.getAttribute('data-res-page') || '1', 10);
            const resources = __contractsGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === id && resource.page === page);
            if (idx < 0) return;
            if (!__contractsCanMoveReceiptResource(resources[idx])) return;
            const safeType = String(resources[idx]?.type || '').toLowerCase();
            const scale = getPointerScale(node);
            const resize = getResizeHit(node, event);
            const mode = resize.resize ? 'resize' : 'move';
            __contractsPdfResourceSelectedId = id;
            __contractsRenderPdfResourcesEditorList();
            __contractsHighlightSelectedResource();
            if (safeType === 'sign' || safeType === 'sign-line' || safeType === 'sign-block') {
                __contractsOpenReceiptInspector({ kind: 'resource', id, page });
            }
            if (__contractsReceiptInspectorState?.kind === 'resource' && __contractsReceiptInspectorState.id === id) {
                __contractsReceiptInspectorState = { ...__contractsReceiptInspectorState, page };
            }
            __contractsPdfResourcePointerState = {
                kind: 'resource',
                id,
                page,
                mode,
                startX: event.clientX,
                startY: event.clientY,
                pointerId: event.pointerId,
                captureNode: node,
                scaleX: scale.x,
                scaleY: scale.y,
                resize,
                origin: { ...resources[idx] },
                current: { ...resources[idx] }
            };
            if (typeof node.setPointerCapture === 'function') {
                try { node.setPointerCapture(event.pointerId); } catch (_) {}
            }
            document.body.style.userSelect = 'none';
            document.body.style.cursor = resize.cursor || (mode === 'resize' ? 'nwse-resize' : 'move');
            event.preventDefault();
            return;
        }

        const baseNode = target.closest('#receipt-preview-box [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!__contractsGetPdfBaseBlockMeta(baseKey)) return;
        if (!__contractsCanMoveReceiptBaseBlock(baseKey)) return;
        const scale = getPointerScale(baseNode);
        const resize = getResizeHit(baseNode, event);
        const cfg = __contractsGetPdfStyleConfig();
        const layouts = __contractsNormalizePdfBaseLayouts(cfg.baseLayouts);
        const instanceKey = String(baseNode.dataset.baseInstance || baseKey).trim();
        __contractsPdfResourceSelectedId = `base:${instanceKey}`;
        __contractsHighlightSelectedResource();
        if (baseKey === 'sign') {
            __contractsOpenReceiptInspector({ kind: 'base', key: baseKey, instanceKey });
        }
        __contractsPdfResourcePointerState = {
            kind: 'base',
            key: baseKey,
            instanceKey,
            mode: resize.resize ? 'scale' : 'move',
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
            captureNode: baseNode,
            scaleX: scale.x,
            scaleY: scale.y,
            resize,
            origin: { ...(layouts[instanceKey] || layouts[baseKey] || __contractsNormalizePdfBaseLayout()) },
            current: { ...(layouts[instanceKey] || layouts[baseKey] || __contractsNormalizePdfBaseLayout()) }
        };
        if (typeof baseNode.setPointerCapture === 'function') {
            try { baseNode.setPointerCapture(event.pointerId); } catch (_) {}
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = resize.cursor || (__contractsPdfResourcePointerState.mode === 'scale' ? 'nwse-resize' : 'move');
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!__contractsPdfResourcePointerState) return;
        const state = __contractsPdfResourcePointerState;
        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        const dx = (event.clientX - state.startX) / (state.scaleX || 1);
        const dy = (event.clientY - state.startY) / (state.scaleY || 1);
        if (state.kind === 'base') {
            if (state.mode === 'scale') {
                const signedDx = state.resize?.left ? -dx : dx;
                const signedDy = state.resize?.top ? -dy : dy;
                const next = __contractsNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + ((signedDx + signedDy) / 2) });
                state.current = next;
                if (state.captureNode) {
                    const nativeTransform = String(state.captureNode.dataset.baseNativeTransform || '').trim();
                    const layoutTransform = __contractsBuildPdfBaseTransform(next);
                    state.captureNode.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
                }
            } else {
                const next = __contractsNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
                state.current = next;
                if (state.captureNode) {
                    const nativeTransform = String(state.captureNode.dataset.baseNativeTransform || '').trim();
                    const layoutTransform = __contractsBuildPdfBaseTransform(next);
                    state.captureNode.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
                }
            }
            __contractsPositionReceiptInspector();
            event.preventDefault();
            return;
        }
        const next = { ...state.origin };
        if (state.mode === 'resize') {
            const resized = resizeGeometry(state.origin, dx, dy, state.resize, next.type);
            next.x = resized.x;
            next.y = resized.y;
            next.w = resized.w;
            next.h = resized.h;
        } else {
            next.x += dx;
            next.y += dy;
        }
        state.current = next;
        const node = document.querySelector(`#receipt-preview-box .cpc-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
        if (node) {
            __contractsApplyResourceGeometryToNode(node, next);
            if (state.mode === 'resize') __contractsAutoFitPdfTextNode?.(node);
        }
        __contractsHighlightSelectedResource();
        __contractsPositionReceiptInspector();
        event.preventDefault();
    });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function __contractsBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

function __contractsParseJsonObjectLike(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
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
            .eq('tenant', __CP_CONTRACTS_PDF_STYLE_TENANT)
            .in('clave', [CFG_TEMPLATE_DEFAULT_KEY, CFG_LETTERHEAD_KEY]);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const templateRow = __contractsPickLatestRecord(rows.filter((row) => String(row?.clave || '').toLowerCase() === CFG_TEMPLATE_DEFAULT_KEY));
        const templateCfg = __contractsParseJsonObjectLike(templateRow?.valor_json);
        const templatePath = templateCfg.path || templateCfg.file_path || templateCfg.value || '';
        defaultTemplateFile = templateCfg.file_name || __contractsBasename(templatePath) || '';
        const letterheadRow = __contractsPickLatestRecord(rows.filter((row) => String(row?.clave || '').toLowerCase() === CFG_LETTERHEAD_KEY));
        const letterheadCfg = __contractsParseJsonObjectLike(letterheadRow?.valor_json);
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
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    // 1. Verificar librerías
    if (typeof window.PB_CLIENT === 'undefined') {
        alert("Error crítico: No se pudo cargar la librería de conexión. Revisa tu internet o los bloqueadores de anuncios.");
        return;
    }
    __contractsNormalizeNonSubmitButtons(document);
    if (document.body && document.body.dataset.cpReceiptSubmitGuard !== '1') {
        document.body.dataset.cpReceiptSubmitGuard = '1';
        document.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopPropagation();
        }, true);
    }
    window.addEventListener('beforeunload', () => {
        try {
            if (__contractsIsAdminProfile()) __contractsSaveEditorDraft(__contractsGetPdfStyleConfig());
        } catch (_) {}
    });

    // 2. Inicializar Clientes
    if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
    if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);

    // 3. Verificar Sesión
    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session || !session.user) {
        window.showToast('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }
    try {
        window.currentUserProfile = authCtx?.profile || await __contractsLoadCurrentUserProfile(session.user);
    } catch (_) {
        window.currentUserProfile = authCtx?.profile || (session?.user && typeof session.user === 'object'
            ? { ...session.user }
            : null);
    }
    await __contractsLoadSharedPdfStyleConfig();
    const draftStyle = __contractsLoadEditorDraft();
    if (draftStyle && __contractsIsAdminProfile()) {
        __contractsSetPdfStyleConfig(draftStyle, { applyToDom: false });
    } else if (!__contractsIsAdminProfile()) {
        try { localStorage.removeItem(__CP_RECEIPTS_EDITOR_DRAFT_KEY); } catch (_) {}
    }
    __contractsInitPdfStyleEditor();
    __contractsLoadTemplateLetterheadPreference();
    __contractsBindTemplateLetterheadToggle();

    // 4. Cargar Datos
    cpReceiptsApplyViewStateControls();
    await loadApprovedOrders();
    await __contractsLoadPreferences();

    setContractPreviewSrcdoc(null);
    await window.loadTemplatesList();
    __contractsApplyPageModeLayout();

    // Filtros
    document.getElementById('search-approved').addEventListener('input', (e) => {
        cpReceiptsFilterApprovedOrders(e.target.value);
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
    cpReceiptsApplyViewStateControls();
    if (!cpReceiptsRestoringViewState) cpReceiptsSaveViewState();
    
    listContainer.innerHTML = '<div class="p-8 text-center text-gray-400 text-xs italic">Cargando...</div>';
    
    try {
        const { data, error } = await window.tenantPocketBase
            .from('cotizaciones')
            .select('*')
            .eq('status', 'aprobada')
            .order('created_at', { ascending: false });

        if (error) throw error;

        approvedOrders = (await __contractsAttachClientReadiness(data || [])).filter((order) => !cpReceiptsIsConvenioOrder(order));
        cpReceiptsRestoringViewState = true;
        cpReceiptsFilterApprovedOrders(document.getElementById('search-approved')?.value || '', { skipSave: true });
        cpReceiptsRestoringViewState = false;
        cpReceiptsRestoreViewStateAfterRender();

    } catch (e) {
        listContainer.innerHTML = '<div class="p-8 text-center text-red-400 text-xs">No se pudieron cargar las órdenes aprobadas.</div>';
    }
}

function __contractsSafeObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}

async function __contractsAttachClientReadiness(orders = []) {
    const rows = Array.isArray(orders) ? orders : [];
    const ids = Array.from(new Set(rows.map((order) => String(order?.cliente_id || '').trim()).filter(Boolean)));
    if (!ids.length) return rows.map((order) => ({ ...order, __client_profile: null }));
    try {
        const { data, error } = await window.tenantPocketBase
            .from('clientes')
            .select('id,perfil_validado,perfil_estatus,expediente_validacion')
            .in('id', ids);
        if (error) throw error;
        const byId = {};
        (data || []).forEach((client) => { byId[String(client.id || '')] = client; });
        return rows.map((order) => ({ ...order, __client_profile: byId[String(order?.cliente_id || '')] || null }));
    } catch (_) {
        return rows.map((order) => ({ ...order, __client_profile: null }));
    }
}

function __contractsCanGenerateContract(order) {
    if (!order || !String(order.cliente_id || '').trim()) return false;
    const client = order.__client_profile || null;
    if (!client) return false;
    const validation = __contractsSafeObject(client.expediente_validacion);
    const readyForQuotes = client.perfil_validado === true || validation.readyForQuotes === true || validation.ready === true || String(client.perfil_estatus || validation.status || '').toLowerCase() === 'validado';
    const hasDictamen = validation.readyForContracts === true || validation.dictamenAprobado === true;
    return !!(readyForQuotes && hasDictamen);
}

function __contractsContractBlockReason(order) {
    if (!order || !String(order.cliente_id || '').trim()) return 'Esta orden no tiene un perfil de cliente asociado.';
    const client = order.__client_profile || null;
    if (!client) return 'No se pudo validar el perfil del cliente asociado.';
    const validation = __contractsSafeObject(client.expediente_validacion);
    const readyForQuotes = client.perfil_validado === true || validation.readyForQuotes === true || validation.ready === true || String(client.perfil_estatus || validation.status || '').toLowerCase() === 'validado';
    if (!readyForQuotes) return 'El expediente del cliente debe estar completo, vigente y aprobado.';
    if (!(validation.readyForContracts === true || validation.dictamenAprobado === true)) return 'Falta guardar o aprobar el dictamen del cliente.';
    return '';
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
        const contractReady = __contractsCanGenerateContract(o);
        const paidBadge = paidComplete
            ? '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">Pagado</span>'
            : '';
        const contractBadge = contractReady
            ? ''
            : '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">Contrato bloqueado</span>';
        const item = document.createElement('div');
        item.setAttribute('data-order-id', String(o.id || ''));
        item.title = contractReady ? '' : __contractsContractBlockReason(o);
        item.className = `bg-white border p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition group shadow-sm mb-2 ${paidComplete ? 'border-emerald-200 bg-emerald-50/40' : (contractReady ? 'border-gray-100' : 'border-amber-200 bg-amber-50/50')}`;
        item.onclick = () => selectOrder(o);
        item.innerHTML = `<div class="flex justify-between mb-1"><span class="font-bold text-xs text-gray-800 group-hover:text-brand-red transition truncate w-32">${o.cliente_nombre}</span><div class="flex items-center gap-1">${paidBadge}${contractBadge}<span class="text-[9px] font-mono text-gray-400 bg-gray-50 border border-gray-200 px-1 rounded">${o.numero_orden || '---'}</span></div></div><div class="flex justify-between items-center"><span class="text-[10px] text-gray-500 truncate w-24"><i class="fa-solid fa-map-pin mr-1"></i>${o.espacio_nombre}</span><span class="text-xs font-black text-gray-800">${formatMoney(o.precio_final)}</span></div>`;
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
    const contractReady = __contractsCanGenerateContract(order);
    cpReceiptsSaveViewState({ selectedOrderId: String(order?.id || '').trim() });
    
    // UI Updates
    document.getElementById('workspace-empty').classList.add('hidden');
    document.getElementById('wk-header').classList.remove('hidden');
    document.getElementById('wk-header').classList.add('flex');
    const wkTabs = document.getElementById('wk-tabs');
    if (wkTabs) {
        if (__contractsIsContractsOnlyPage() || __contractsIsReceiptsOnlyPage()) wkTabs.classList.add('hidden');
        else wkTabs.classList.remove('hidden');
    }
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
        cNumInput.disabled = !contractReady;
        cSaveBtn.disabled = !contractReady;
        cSaveBtn.classList.toggle('opacity-50', !contractReady);
        cSaveBtn.classList.toggle('cursor-not-allowed', !contractReady);
        if (!contractReady) window.showToast?.(__contractsContractBlockReason(order), 'warning');
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
    const targetTab = __contractsIsContractsOnlyPage() ? 'contract' : 'receipt';
    switchTab(targetTab);

    updateReceiptPreview();
    __contractsApplyTemplateDefault();
    setTimeout(window.adjustPreviewScale, 100);
}

// NUEVA FUNCIÓN: GUARDAR SOLO EL NÚMERO DE CONTRATO
window.saveContractNumber = function() {
    if(!selectedOrder) return;
    if (!__contractsCanGenerateContract(selectedOrder)) return window.showToast(__contractsContractBlockReason(selectedOrder), 'error');
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
        const viewBtn = pay.file_path ? `<button type="button" onclick="window.openStoredReceipt('${pay.file_path}')" class="text-blue-500 hover:text-blue-700 font-bold ml-2 cursor-pointer" title="Ver PDF"><i class="fa-solid fa-file-pdf"></i></button>` : '';
        const delBtn = (!paymentClosed && !isConstancia) ? `<button type="button" onclick="window.deleteReceipt(${idx})" class="text-gray-400 hover:text-red-500 ml-2" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : '';
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

window.updateReceiptPreview = async function(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if(!selectedOrder) return;
    try {
        await __contractsEnsureActiveReceiptProfile();
    } catch (e) {}
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
    __contractsApplyPdfStyleToLivePreview(opts);
    __contractsEnsureReceiptEditingChrome();
    __contractsSyncReceiptEditMode();
    __contractsHighlightSelectedResource();
    __contractsRenderReceiptInspector();
    __contractsAttachPageControls();
    const remaining = currentRemainingBalance - amount;
    document.getElementById('lbl-remaining').innerText = formatMoney(remaining < 0 ? 0 : remaining);
    window.adjustPreviewScale();
    requestAnimationFrame(() => __contractsEnsureMarginGuideController()?.refresh());
}

function __contractsStripReceiptEditingChrome(rootNode) {
    if (!(rootNode instanceof HTMLElement)) return;
    rootNode.classList.remove('cpc-pdf-admin-enabled', 'cpc-pdf-edit-selected', 'cpc-pdf-editable');
    rootNode.querySelectorAll('.pdf-margin-guides-layer,[data-margin-guide]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.cpc-pdf-delete-btn,[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.cpc-pdf-root,.cpc-pdf-resource,.cpc-pdf-editable,[data-base-resource]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.remove('cpc-pdf-admin-enabled', 'cpc-pdf-edit-selected', 'cpc-pdf-editable');
        node.style.outline = 'none';
        node.style.outlineOffset = '0';
    });
}

async function __contractsWaitForPdfAssets(node, timeoutMs = 7000) {
    if (!node) return;
    const imgs = Array.from(node.querySelectorAll('img'));
    await Promise.race([
        Promise.all(imgs.map((img) => {
            if (img.complete && (img.naturalWidth || img.naturalHeight)) return Promise.resolve();
            return new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        })),
        new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function __contractsGetPdfRenderHost() {
    let host = document.getElementById('cp-receipt-pdf-render-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'cp-receipt-pdf-render-host';
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

function __contractsApplyPdfBaseLayoutsToScope(scopeRoot, isAdmin = false) {
    if (!(scopeRoot instanceof HTMLElement)) return;
    const cfg = __contractsGetPdfStyleConfig();
    const layouts = __contractsNormalizePdfBaseLayouts(cfg.baseLayouts);
    const groups = {};
    scopeRoot.querySelectorAll('[data-base-resource]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__contractsGetPdfBaseBlockMeta(key)) return;
        groups[key] = (groups[key] || 0);
        const index = groups[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __contractsNormalizePdfBaseLayout();
        if (node.dataset.baseNativeTransformCaptured !== '1') {
            node.dataset.baseNativeTransform = String(node.style.transform || '').trim();
            node.dataset.baseNativeTransformCaptured = '1';
        }
        const nativeTransform = String(node.dataset.baseNativeTransform || '').trim();
        const layoutTransform = __contractsBuildPdfBaseTransform(layout);
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('cpc-pdf-editable', !!isAdmin);
        node.dataset.baseInstance = instanceKey;
    });
}

async function __contractsPrepareReceiptExportRoot() {
    if (!__contractsIsAdminProfile()) {
        try {
            await __contractsLoadSharedPdfStyleConfig(__contractsResolveReceiptPreviewProfile());
        } catch (_) {}
    }
    if (selectedOrder && typeof window.updateReceiptPreview === 'function') {
        try { await window.updateReceiptPreview(); } catch (_) {}
    }
    const previewRoot = document.querySelector('#receipt-preview-box .cpc-pdf-root');
    const previewMarkup = previewRoot instanceof HTMLElement ? String(previewRoot.outerHTML || '').trim() : '';
    const fallbackMarkup = String(getReceiptHTML(false) || '').trim();
    const markup = previewMarkup || fallbackMarkup;
    if (!markup) return null;
    const host = __contractsGetPdfRenderHost();
    host.innerHTML = markup;
    const exportRoot = host.firstElementChild || host;
    if (!(exportRoot instanceof HTMLElement)) {
        host.innerHTML = '';
        return null;
    }
    if (!previewMarkup) {
        __contractsApplyPdfBaseLayoutsToScope(exportRoot, false);
    }
    __contractsStripReceiptEditingChrome(exportRoot);
    exportRoot.querySelectorAll('.cpc-pdf-resource[data-res-type="text"], .cpc-pdf-resource[data-res-type="title"]').forEach((node) => {
        __contractsAutoFitPdfTextNode(node);
    });
    await __contractsWaitForPdfAssets(exportRoot, 7000);
    return { host, exportRoot };
}

async function __contractsRenderReceiptPdfBlob(exportRoot, filename, extraOptions = {}) {
    if (!(exportRoot instanceof HTMLElement)) throw new Error('No se pudo preparar el contenido PDF.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await __contractsWaitForPdfAssets(exportRoot, 7000);
    const baseOptions = {
        margin: 0,
        filename: filename || 'Documento.pdf',
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
    let blob = await html2pdf().set(options).from(exportRoot).output('blob');
    if (!blob || blob.size < 4096) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        blob = await html2pdf().set({
            ...options,
            html2canvas: { ...(options.html2canvas || {}), scale: 2.5 }
        }).from(exportRoot).output('blob');
    }
    if (!blob || blob.size < 4096) throw new Error('No se pudo generar el PDF correctamente.');
    return blob;
}

window.downloadReceiptPDF = async function() { 
    const exportCtx = await __contractsPrepareReceiptExportRoot();
    if (!exportCtx) {
        window.showToast('No se pudo preparar el PDF de recibo.', 'error');
        return;
    }
    const { host, exportRoot } = exportCtx;
    const fileName = currentRemainingBalance <= 0.01
        ? `Constancia_Liquidacion_${selectedOrder.numero_orden}.pdf`
        : `Recibo_${selectedOrder.numero_orden}.pdf`;
    try {
        const pdfBlob = await __contractsRenderReceiptPdfBlob(exportRoot, fileName);
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
    } finally {
        host.innerHTML = '';
    }
}

window.generateAndSaveLiquidationCertificate = async function() {
    if (!selectedOrder) return;
    if (__contractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    const btn = document.getElementById('btn-gen-receipt');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando constancia...';
    try {
        const exportCtx = await __contractsPrepareReceiptExportRoot();
        if (!exportCtx) throw new Error('No se pudo preparar la constancia.');
        const { host, exportRoot } = exportCtx;
        const fileName = `Constancia_Liquidacion_${selectedOrder.numero_orden || selectedOrder.id.slice(0, 6)}_${Date.now()}.pdf`;
        let pdfBlob = null;
        try {
            pdfBlob = await __contractsRenderReceiptPdfBlob(exportRoot, fileName);
        } finally {
            host.innerHTML = '';
        }
        const filePath = `${selectedOrder.id}/constancias/${fileName}`;
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(filePath, pdfBlob);
        if (upErr) throw upErr;

        const history = __contractsPayments(selectedOrder).filter((p) => String(p?.type || p?.tipo || '').toLowerCase() !== 'constancia_liquidacion');
        const closureEntry = {
            date: window.__serverDateService.nowISO(),
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
        const exportCtx = await __contractsPrepareReceiptExportRoot();
        if (!exportCtx) throw new Error('No se pudo preparar el recibo.');
        const { host, exportRoot } = exportCtx;
        const fileName = `Recibo_${selectedOrder.numero_orden}_${Date.now()}.pdf`;
        let pdfBlob = null;
        try {
            pdfBlob = await __contractsRenderReceiptPdfBlob(exportRoot, fileName);
        } finally {
            host.innerHTML = '';
        }
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(filePath, pdfBlob);
        if(upErr) throw upErr;
        const newPayment = { date: window.__serverDateService.nowISO(), amount: amount, concept: document.getElementById('rcp-concept').value, reference: document.getElementById('rcp-ref').value, bank: document.getElementById('rcp-bank').value, account: document.getElementById('rcp-account').value, file_path: filePath };
        const updatedHistory = [...(selectedOrder.historial_pagos || []), newPayment];
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ historial_pagos: updatedHistory }).eq('id', selectedOrder.id);
        if(dbErr) throw dbErr;
        window.showToast("Recibo generado", "success");
        const link = document.createElement('a'); link.href = URL.createObjectURL(pdfBlob); link.download = fileName; link.click();
        loadApprovedOrders(); selectedOrder.historial_pagos = updatedHistory; selectOrder(selectedOrder);
    } catch (_) { window.showToast("No se pudo generar el recibo.", "error"); }
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
    __contractsActiveTemplateFile = String(fileName || '');
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
            .replace(/{{FECHA_HOY}}/g, hl(window.__serverDateService.todayLocale('es-MX')))
            .replace(/{{NUM_ORDEN}}/g, hl(selectedOrder.numero_orden))
            .replace(/{{NUM_CONTRATO}}/g, hl(selectedOrder.numero_contrato || 'PENDIENTE'));

        text = __contractsTransparentPdfHtml(text);

        if (__contractsIsTemplateLetterheadEnabled()) {
            text = __contractsWrapLetterheadPage(text, {
                baseWidth: CP_CONTRACTS_CONTENT_BASE_WIDTH_PX,
                baseHeight: __contractsContentBaseHeightPx()
            });
        }

        setContractPreviewSrcdoc(text);
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __contractsPdfMarginGuideController?.refresh(), 90);
    } catch (e) {
        window.showToast("Error al cargar plantilla", "error");
        setContractPreviewSrcdoc(null);
    }
};
function __contractsBuildPrintableContractHtml(previewDoc) {
    const headHtml = previewDoc?.head ? previewDoc.head.innerHTML : '';
    const bodyHtml = previewDoc?.body ? previewDoc.body.innerHTML : '';
    
    // The bodyHtml already contains the wrapped letterhead if enabled, because we modified loadSelectedTemplate to apply it there.
    const printableBody = bodyHtml;

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
    display: ${__contractsIsTemplateLetterheadEnabled() ? 'flex' : 'block'};
    justify-content: ${__contractsIsTemplateLetterheadEnabled() ? 'center' : 'initial'};
    align-items: ${__contractsIsTemplateLetterheadEnabled() ? 'flex-start' : 'initial'};
  }
  .var-highlight { font-weight: bold; background: transparent !important; padding: 0 !important; border-radius: 0 !important; }
</style>
</head>
<body>
${printableBody}
</body>
</html>`;
}

window.printContract = function() {
    if(!selectedOrder) return;
    if (!__contractsCanGenerateContract(selectedOrder)) return window.showToast(__contractsContractBlockReason(selectedOrder), 'error');

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

window.openFinalizeModal = function() { pendingAction = 'finalize'; if (!__contractsCanGenerateContract(selectedOrder)) return window.showToast(__contractsContractBlockReason(selectedOrder), 'error'); if(!validateRequiredData()) return; const contractNum = document.getElementById('contract-num-assign').value; if(!contractNum) return window.showToast("Asigna un Número de Contrato.", "error"); window.openModal('finalize-modal'); }

window.confirmFinalize = async function() { 
    if(!selectedOrder || !signedFileToUpload) return; 
    if (!__contractsCanGenerateContract(selectedOrder)) return window.showToast(__contractsContractBlockReason(selectedOrder), 'error');
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
            date: window.__serverDateService.nowISO(), 
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
        
    } catch(_) {
        window.showToast("No se pudo guardar el comprobante.", "error");
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
    const isAdminPreview = !!(isVisual && __contractsIsAdminProfile());
    const basePdfStyle = __contractsGetPdfStyleConfig();
    const pdfStyle = __contractsEnsureReceiptResourceDefaults(basePdfStyle, { persist: isAdminPreview });
    const pdfContent = __contractsNormalizePdfContent(pdfStyle.content);
    const signLabels = __contractsNormalizePdfSignLabels(pdfStyle.signLabels);
    const resourceContext = __contractsBuildReceiptResourceContext({
        isLiquidated,
        dateStr,
        timeStr,
        pdfContent,
        signLabels
    });
    const pdfStyleInlineVars = __contractsPdfStyleVarsInline(pdfStyle);
    const pdfStyleTag = `<style>.cpc-pdf-root{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;font-family:var(--cp-font-family)!important;}.cpc-pdf-root .cpc-pdf-shift{transform:translate(var(--cp-offset-x),var(--cp-offset-y));}.cpc-pdf-root .cpc-pdf-header{border-bottom-width:var(--cp-header-line)!important;justify-content:var(--cp-header-justify)!important;}.cpc-pdf-root .cpc-pdf-sign-line{width:100%;height:var(--cp-sign-line)!important;background:#111827!important;border-radius:999px;}.cpc-pdf-root .cpc-pdf-title{font-size:var(--cp-title-size)!important;line-height:1.05!important;text-align:var(--cp-header-align)!important;}.cpc-pdf-root .cpc-pdf-meta,.cpc-pdf-root .cpc-pdf-meta *{font-size:var(--cp-meta-size)!important;text-align:var(--cp-meta-align)!important;}.cpc-pdf-root .cpc-pdf-table-head th{font-size:var(--cp-table-head-size)!important;}.cpc-pdf-root .cpc-pdf-table-body td,.cpc-pdf-root .cpc-pdf-table-body p,.cpc-pdf-root .cpc-pdf-table-body span{font-size:var(--cp-table-body-size)!important;line-height:var(--cp-line-height)!important;}.cpc-pdf-root .cpc-pdf-table-body td:first-child,.cpc-pdf-root .cpc-pdf-table-body td:first-child *{text-align:var(--cp-table-align)!important;}.cpc-pdf-root .cpc-pdf-summary,.cpc-pdf-root .cpc-pdf-summary *{text-align:var(--cp-summary-align)!important;}.cpc-pdf-root .cpc-pdf-quick,.cpc-pdf-root .cpc-pdf-quick *{font-size:var(--cp-quick-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-quick-align)!important;}.cpc-pdf-root .cpc-pdf-general-conditions,.cpc-pdf-root .cpc-pdf-general-conditions *{font-size:var(--cp-conditions-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-conditions-align)!important;}.cpc-pdf-root .cpc-pdf-sign,.cpc-pdf-root .cpc-pdf-sign *{font-size:var(--cp-sign-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-sign-align)!important;}.cpc-pdf-root .cpc-pdf-footer-text{font-size:var(--cp-footer-size)!important;text-align:var(--cp-footer-align)!important;}.cpc-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.cpc-pdf-root .cpc-pdf-resource,.cpc-pdf-root .cpc-pdf-editable{cursor:default;box-sizing:border-box;outline:none;outline-offset:1px;}.cpc-pdf-root .cpc-pdf-resource::before,.cpc-pdf-root .cpc-pdf-editable::before{content:'';position:absolute;inset:-1px;border:1px dashed rgba(193,98,30,.28);border-radius:inherit;background:radial-gradient(circle at top left,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at top right,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at bottom left,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at bottom right,#c1621e 0 3px,transparent 3.2px);background-size:12px 12px;background-repeat:no-repeat;opacity:0;pointer-events:none;}.cpc-pdf-root .cpc-pdf-resource::after,.cpc-pdf-root .cpc-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#c1621e;box-shadow:0 0 0 2px #fff;opacity:0;pointer-events:none;}.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource,.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable{outline:1px dashed rgba(193,98,30,.45);}.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource,.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable{cursor:move;}.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource::before,.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource::after,.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable::before,.cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-editable::after{opacity:.94;}.cpc-pdf-root .cpc-pdf-edit-selected{outline:2px solid #c1621e!important;}.cpc-pdf-root .cpc-pdf-edit-selected::before,.cpc-pdf-root .cpc-pdf-edit-selected::after{opacity:1;transform:scale(1.04);} .cpc-pdf-delete-btn { position:absolute; top:-8px; right:-8px; width:22px; height:22px; border-radius:50%; background:#c1621e; color:#fff; display:none; align-items:center; justify-content:center; cursor:pointer; font-size:11px; z-index:80; box-shadow:0 0 0 2px #fff; pointer-events:auto; } .cpc-pdf-root.cpc-pdf-admin-enabled .cpc-pdf-resource.cpc-pdf-edit-selected .cpc-pdf-delete-btn { display:flex; } .cpc-pdf-delete-btn:hover { background:#a85519; transform:scale(1.08); transition:all .2s; }</style>`;
    const wrapStyledReceipt = (rawHtml, extraPages = 0) => {
        const pageOneRaw = __contractsInjectResourcesIntoPage(rawHtml, __contractsRenderPdfResources(pdfStyle, 1, resourceContext));
        const pages = [
            __contractsWrapLetterheadPage(__contractsTransparentPdfHtml(__contractsBoostPdfTypography(pageOneRaw)), { baseWidth: CP_CONTRACTS_CONTENT_BASE_WIDTH_PX, baseHeight: receiptBaseHeight, id: 'receipt-print-area' })
        ];
        for (let i = 0; i < extraPages; i += 1) {
            const annexRaw = `<div class="cpc-pdf-main cpc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width:${CP_CONTRACTS_CONTENT_BASE_WIDTH_PX}px;min-height:${receiptBaseHeight}px;height:${receiptBaseHeight}px;box-sizing:border-box;overflow:hidden;position:relative;"><div class="cpc-pdf-page-frame" style="${__contractsBuildReceiptFrameStyle(receiptBaseHeight)}"><div class="cpc-pdf-header flex justify-end items-start mb-8 border-b-4 border-brand-red pb-3"><div class="cpc-pdf-meta text-right"><h1 class="cpc-pdf-title text-2xl font-black uppercase text-gray-900 tracking-tighter">ANEXO ${i + 1}</h1></div></div><div class="cpc-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__contractsSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__contractsSafeHtml(pdfContent.annexHintBody || '')}</p></div></div></div>`;
            const pageIndex = i + 2;
            const withResources = __contractsInjectResourcesIntoPage(annexRaw, __contractsRenderPdfResources(pdfStyle, pageIndex, resourceContext));
            pages.push(__contractsWrapLetterheadPage(__contractsTransparentPdfHtml(__contractsBoostPdfTypography(withResources)), { baseWidth: CP_CONTRACTS_CONTENT_BASE_WIDTH_PX, baseHeight: receiptBaseHeight }));
        }
        const adminClass = isAdminPreview ? ' cpc-pdf-admin-enabled' : '';
        return `<div class="cpc-pdf-root${adminClass}" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;${pdfStyleInlineVars}">${pdfStyleTag}${pages.join('')}</div>`;
    };
    const extraPages = __contractsClampStyleNumber(pdfStyle.extraPages, 0, 6, 0);
    
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
        let watermark = `<div class="${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="watermark" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 118px; color: rgba(34, 197, 94, 0.16); font-weight: 900; z-index: ${isAdminPreview ? 20 : 0}; pointer-events: ${isAdminPreview ? 'auto' : 'none'}; white-space: nowrap;">${__contractsSafeHtml(pdfContent.liquidatedWatermarkText || 'LIQUIDADO')}</div>`;
        const receiptRaw = `
            <div class="cpc-pdf-main cpc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width:${CP_CONTRACTS_CONTENT_BASE_WIDTH_PX}px;min-height:${receiptBaseHeight}px;height:${receiptBaseHeight}px;box-sizing:border-box;overflow:hidden;position:relative;">
                <div class="cpc-pdf-page-frame" style="${__contractsBuildReceiptFrameStyle(receiptBaseHeight, 'display:flex;flex-direction:column;')}">
                    ${watermark}
                    <div style="position: relative; z-index: 10; flex-grow: 1;">
                        <div class="cpc-pdf-header flex justify-end items-start mb-10 border-b-4 border-green-600 pb-4 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="header"><div class="w-full h-1"></div></div>
                        <div class="cpc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="summary-main">
                            <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.liquidatedClientLabel || 'Cliente:')}</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                            <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.liquidatedSpaceLabel || 'Espacio:')}</span><span class="text-base font-bold text-gray-900">${selectedOrder.espacio_nombre}</span></div>
                            <div class="flex justify-between"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.liquidatedTotalLabel || 'Total Contrato:')}</span><span class="text-xl font-black text-brand-red">${window.formatMoney(selectedOrder.precio_final)}</span></div>
                        </div>
                        <div class="mb-10 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="details"><h3 class="cpc-pdf-quick font-bold text-xs uppercase text-gray-400 mb-4 tracking-widest pl-2">${__contractsSafeHtml(pdfContent.liquidatedPaymentsHeading || 'Resumen de Pagos Realizados')}</h3><div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"><table class="cpc-pdf-table w-full text-xs text-left"><thead class="cpc-pdf-table-head"><tr class="text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100"><th class="pb-3">Fecha</th><th class="pb-3">Banco / Cuenta</th><th class="pb-3">Referencia</th><th class="text-right pb-3">Monto</th></tr></thead><tbody class="cpc-pdf-table-body">${rowsHtml}</tbody></table></div></div>
                        <div class="cpc-pdf-summary mb-12 flex justify-end ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="balance"><div class="bg-green-50 px-8 py-5 rounded-xl border border-green-100 text-right shadow-sm"><p class="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">${__contractsSafeHtml(pdfContent.liquidatedBalanceLabel || 'Saldo Pendiente')}</p><p class="text-3xl font-black text-green-700">$0.00</p></div></div>
                    </div>
                    <div style="margin-top: auto; position: relative; z-index: 10;">
                        <div class="cpc-pdf-sign mb-8 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="sign"></div>
                        <div class="cpc-pdf-footer-text cpc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="footer"><p class="mb-1">${__contractsSafeHtml(pdfContent.liquidatedFooterLine1 || '')}</p><p>${__contractsSafeHtml(pdfContent.liquidatedFooterLine2 || '')}</p></div>
                    </div>
                </div>
            </div>`;
        return wrapStyledReceipt(receiptRaw, extraPages);
    }
    
    const amount = parseFloat(document.getElementById('rcp-amount')?.value || '0') || 0;
    const concept = __contractsSafeHtml(document.getElementById('rcp-concept')?.value || '');
    const bank = __contractsSafeHtml(document.getElementById('rcp-bank')?.value || '');
    const account = __contractsSafeHtml(document.getElementById('rcp-account')?.value || '');
    const ref = __contractsSafeHtml(document.getElementById('rcp-ref')?.value || '');
    let projectedRemaining = currentRemainingBalance - amount; if (projectedRemaining < 0) projectedRemaining = 0;

    const receiptRaw = `
        <div class="cpc-pdf-main cpc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width:${CP_CONTRACTS_CONTENT_BASE_WIDTH_PX}px;min-height:${receiptBaseHeight}px;height:${receiptBaseHeight}px;box-sizing:border-box;overflow:hidden;position:relative;">
            <div class="cpc-pdf-page-frame" style="${__contractsBuildReceiptFrameStyle(receiptBaseHeight, 'display:flex;flex-direction:column;')}">
                <div style="flex-grow: 1;">
                    <div class="cpc-pdf-header flex justify-end items-start mb-10 border-b-4 border-brand-red pb-4 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="header"><div class="w-full h-1"></div></div>
                    <div class="cpc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="summary-main">
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.receiptReceivedFromLabel || 'Recibimos de:')}</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.receiptAmountLabel || 'La cantidad de:')}</span><span class="text-2xl font-black text-brand-red">${window.formatMoney(amount)}</span></div>
                        <div class="flex justify-between mb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.receiptConceptLabel || 'Concepto:')}</span><span class="text-sm font-medium text-gray-700 text-right max-w-[60%]">${concept}</span></div>
                        <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-lg mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__contractsSafeHtml(pdfContent.receiptInternalReferenceLabel || 'Referencia Interna:')}</span><div class="text-right"><span class="block text-sm font-bold text-gray-800 font-mono">${selectedOrder.numero_orden || '---'}</span><span class="block text-[10px] text-gray-400 font-mono tracking-widest">${selectedOrder.id.slice(0,8).toUpperCase()}</span></div></div>
                    </div>
                    <div class="cpc-pdf-quick grid grid-cols-2 gap-12 text-xs text-gray-600 mb-8 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="details">
                        <div><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">${__contractsSafeHtml(pdfContent.receiptBankHeading || 'Datos Bancarios')}</p><p class="mb-1">${__contractsSafeHtml(pdfContent.receiptBankLabel || 'Banco:')} <strong class="text-gray-900 uppercase">${bank}</strong></p><p>${__contractsSafeHtml(pdfContent.receiptAccountLabel || 'Cuenta/CLABE:')} <strong class="text-gray-900 uppercase">${account}</strong></p></div>
                        <div class="text-right"><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">${__contractsSafeHtml(pdfContent.receiptReferenceHeading || 'Referencia')}</p><p class="font-mono text-base text-gray-900">${ref}</p></div>
                    </div>
                    <div class="cpc-pdf-summary mb-12 flex justify-end ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="balance"><div class="bg-red-50 px-8 py-4 rounded-xl border border-red-100 text-right shadow-sm"><p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">${__contractsSafeHtml(pdfContent.receiptPendingBalanceLabel || 'Saldo Pendiente por Liquidar')}</p><p class="text-2xl font-black text-red-600">${window.formatMoney(projectedRemaining)}</p></div></div>
                </div>
                <div style="margin-top: auto;">
                    <div class="cpc-pdf-sign mb-8 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="sign"></div>
                    <div class="cpc-pdf-footer-text cpc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4 ${isAdminPreview ? 'cpc-pdf-editable' : ''}" data-base-resource="footer"><p class="mb-1">${__contractsSafeHtml(pdfContent.receiptFooterLine1 || '')}</p><p>${__contractsSafeHtml(pdfContent.receiptFooterLine2 || '')}</p></div>
                </div>
            </div>
        </div>`;
    return wrapStyledReceipt(receiptRaw, extraPages);
}



