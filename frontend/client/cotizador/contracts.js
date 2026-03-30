/**
 * DOC: client\cotizador\receipts.js
 * Proposito: Gestion de recibos vinculados a cotizaciones aprobadas (editor PDF en receipts.html).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE RECIBOS - (FINAL: CORRECCIÓN DE CARGA Y ERRORES)
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

const __PM_RECEIPTS_EDITOR_DRAFT_KEY = 'pm_receipts_pdf_style_draft_v1';
function __pmContractsNormalizeNonSubmitButtons(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('button:not([type])').forEach((button) => {
        button.setAttribute('type', 'button');
    });
}
function __pmContractsSaveEditorDraft(style) {
    try {
        const safeStyle = __pmContractsNormalizePdfStyle(style || __pmContractsPdfStyleState || {});
        localStorage.setItem(__PM_RECEIPTS_EDITOR_DRAFT_KEY, JSON.stringify({
            updated_at: new Date().toISOString(),
            style: safeStyle
        }));
    } catch (_) {}
}
function __pmContractsLoadEditorDraft() {
    try {
        const raw = localStorage.getItem(__PM_RECEIPTS_EDITOR_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return __pmContractsNormalizePdfStyle(parsed.style || {});
    } catch (_) {
        return null;
    }
}

const __PM_CONTRACTS_PAGE_MODE = ((document.body && document.body.dataset && document.body.dataset.pageMode) || 'combined').toLowerCase();
function __pmContractsIsContractsOnlyPage() {
    return __PM_CONTRACTS_PAGE_MODE === 'contracts';
}
function __pmContractsIsReceiptsOnlyPage() {
    return __PM_CONTRACTS_PAGE_MODE === 'receipts';
}
function __pmContractsApplyPageModeLayout() {
    const tabs = document.getElementById('wk-tabs');
    if (__pmContractsIsContractsOnlyPage() || __pmContractsIsReceiptsOnlyPage()) {
        if (tabs) tabs.classList.add('hidden');
    }
}


// --- LOGICA DE TABS SINCRONIZADA ---
window.switchTab = function(tab) { 
    if (__pmContractsIsContractsOnlyPage()) tab = 'contract';
    if (__pmContractsIsReceiptsOnlyPage()) tab = 'receipt';
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
        if (styleEditor && __pmContractsIsAdminProfile()) {
            styleEditor.classList.add('hidden');
            __pmContractsRenderPdfResourcesEditorList();
            __pmContractsHighlightSelectedResource();
        }
        __pmContractsEnsureReceiptEditingChrome();
        __pmContractsRenderReceiptToolbar();
        
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __pmContractsPdfMarginGuideController?.refresh(), 90);

        
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
        __pmContractsCloseReceiptInspector();
        __pmContractsRenderReceiptToolbar();
        
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __pmContractsPdfMarginGuideController?.refresh(), 90);
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
        const doc = iframe.contentDocument;
        if (doc?.documentElement) doc.documentElement.dataset.contractTextEdit = '0';
        __pmContractsTemplateTextPositions = {};
        setTimeout(window.adjustPreviewScale, 50);
    };
    iframe.srcdoc = html;
}

function __pmContractsTemplateTextStorageKey() {
    return `pm_contract_text_layout:${String(__pmContractsActiveTemplateFile || 'default')}`;
}

function __pmContractsLoadTemplateTextPositions() {
    const sharedKey = String(__pmContractsActiveTemplateFile || 'default');
    const shared = __pmContractsSharedTemplateTextLayouts && typeof __pmContractsSharedTemplateTextLayouts === 'object'
        ? __pmContractsSharedTemplateTextLayouts[sharedKey]
        : null;
    if (shared && typeof shared === 'object') {
        try {
            return JSON.parse(JSON.stringify(shared));
        } catch (_) {
            return { ...shared };
        }
    }
    try {
        const raw = window.localStorage.getItem(__pmContractsTemplateTextStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function __pmContractsSaveTemplateTextPositions() {
    const safe = __pmContractsTemplateTextPositions && typeof __pmContractsTemplateTextPositions === 'object'
        ? JSON.parse(JSON.stringify(__pmContractsTemplateTextPositions))
        : {};
    try {
        window.localStorage.setItem(__pmContractsTemplateTextStorageKey(), JSON.stringify(safe));
    } catch (_) {}
    if (__pmContractsIsAdminProfile()) {
        __pmContractsSharedTemplateTextLayouts = {
            ...(__pmContractsSharedTemplateTextLayouts && typeof __pmContractsSharedTemplateTextLayouts === 'object' ? __pmContractsSharedTemplateTextLayouts : {}),
            [String(__pmContractsActiveTemplateFile || 'default')]: safe
        };
        __pmContractsScheduleSharedPdfStyleSync(__pmContractsGetPdfStyleConfig());
    }
}

function __pmContractsCollectTextNodes(doc) {
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

function __pmContractsInitContractTextDrag() {
    const iframe = document.getElementById('contract-preview-iframe');
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;
    if (!doc.getElementById('pm-contract-text-drag-style')) {
        const style = doc.createElement('style');
        style.id = 'pm-contract-text-drag-style';
        style.textContent = `
html[data-contract-text-edit="1"] [data-contract-node-key]{cursor:move;outline:1px dashed rgba(37,99,235,.45);outline-offset:2px;transition:outline-color .15s ease;position:relative;}
html[data-contract-text-edit="1"] [data-contract-node-key].is-contract-node-active{outline:2px solid #2563eb;}
`;
        doc.head.appendChild(style);
    }
    doc.documentElement.dataset.contractTextEdit = __pmContractsIsAdminProfile() ? '1' : '0';
    __pmContractsTemplateTextPositions = __pmContractsLoadTemplateTextPositions();
    const nodes = __pmContractsCollectTextNodes(doc);
    nodes.forEach((node, index) => {
        const key = `node_${index}`;
        node.setAttribute('data-contract-node-key', key);
        const position = __pmContractsTemplateTextPositions[key] || { x: 0, y: 0 };
        node.style.translate = `${Number(position.x) || 0}px ${Number(position.y) || 0}px`;
    });
    if (doc.body.dataset.pmContractTextDragBound === '1') return;
    doc.body.dataset.pmContractTextDragBound = '1';
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
        __pmContractsSaveTemplateTextPositions();
    };
    doc.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !__pmContractsIsAdminProfile()) return;
        const target = event.target instanceof Element ? event.target.closest('[data-contract-node-key]') : null;
        if (!(target instanceof HTMLElement)) return;
        const key = String(target.getAttribute('data-contract-node-key') || '');
        const current = __pmContractsTemplateTextPositions[key] || { x: 0, y: 0 };
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
        __pmContractsTemplateTextPositions[dragState.key] = next;
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
            pushCandidate(explicitBucket || 'documentos', cleanPath);
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
            'documentos',
            'documentos-cp'
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
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
const LOGO_URL = (window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl)
  || ((window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl)
      ? (window.HUB_CONFIG.pocketbaseUrl + '/storage/v1/object/public/espacios/logo.png')
      : '');
let PM_PDF_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
const RECEIPT_PAGE_WIDTH_PX = 816;
const RECEIPT_PAGE_HEIGHT_PX = 1056;
const LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const LETTERHEAD_MARGINS_DESIGN_PX = { top: 150, right: 45, bottom: 85, left: 45 };
const PM_CONTRACTS_CONTENT_BASE_WIDTH_PX = 816;

function __pmContractsCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __pmContractsLetterheadFrame() {
    return {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: RECEIPT_PAGE_WIDTH_PX,
        height: RECEIPT_PAGE_HEIGHT_PX
    };
}

function __pmContractsContentBaseHeightPx() {
    const frame = __pmContractsLetterheadFrame();
    if (!frame.width || !frame.height) return 945;
    return (PM_CONTRACTS_CONTENT_BASE_WIDTH_PX * frame.height) / frame.width;
}

function __pmContractsWrapLetterheadPage(innerHtml, options = {}) {
    const frame = __pmContractsLetterheadFrame();
    const baseWidth = Math.max(1, parseFloat(options.baseWidth) || RECEIPT_PAGE_WIDTH_PX);
    const baseHeight = Math.max(1, parseFloat(options.baseHeight) || RECEIPT_PAGE_HEIGHT_PX);
    const scale = Math.min(frame.width / baseWidth, frame.height / baseHeight);
    const finalW = baseWidth * scale;
    const finalH = baseHeight * scale;
    const left = frame.left + ((frame.width - finalW) / 2);
    const top = frame.top + ((frame.height - finalH) / 2);
    const bgUrl = __pmContractsCssSafeUrl(PM_PDF_LETTERHEAD_URL);
    const imageLayer = bgUrl
        ? `<img src='${bgUrl}' crossorigin='anonymous' onerror='this.style.display=\"none\"' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
    const idAttr = options.id ? ` id="${options.id}"` : '';
    return `<div${idAttr} data-pdf-preview-page="1" class="bg-white font-sans text-gray-800 relative leading-relaxed" style="width:${RECEIPT_PAGE_WIDTH_PX}px;min-height:${RECEIPT_PAGE_HEIGHT_PX}px;height:${RECEIPT_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:hidden;background:#f5f5f5;">${imageLayer}<div data-pdf-preview-frame="1" data-base-width="${baseWidth}" data-base-height="${baseHeight}" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:hidden;z-index:1;">${innerHtml}</div></div>`;
}
const TEMPLATE_BUCKET = 'documentos';
const TEMPLATE_PATH = 'templates_contratos';
const LETTERHEAD_PATH = 'membretes_pdf';
const CFG_TEMPLATE_DEFAULT_KEY = 'contract_template_default';
const CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __PM_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY = 'pm_contract_template_letterhead_enabled';
let __pmContractsActiveTemplateFile = '';
let __pmContractsTemplateTextPositions = {};
let __pmContractsSharedTemplateTextLayouts = {};

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
let __pmContractsTemplateLetterheadEnabled = true;

function __pmContractsIsTemplateLetterheadEnabled() {
    return __pmContractsTemplateLetterheadEnabled !== false;
}

function __pmContractsSyncTemplateLetterheadToggle() {
    const toggle = document.getElementById('contract-letterhead-toggle');
    if (toggle) toggle.checked = __pmContractsIsTemplateLetterheadEnabled();
}

function __pmContractsLoadTemplateLetterheadPreference() {
    try {
        const stored = window.localStorage.getItem(__PM_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY);
        __pmContractsTemplateLetterheadEnabled = stored !== 'false';
    } catch (_) {
        __pmContractsTemplateLetterheadEnabled = true;
    }
    __pmContractsSyncTemplateLetterheadToggle();
}

function __pmContractsBindTemplateLetterheadToggle() {
    const toggle = document.getElementById('contract-letterhead-toggle');
    if (!toggle || toggle.dataset.bound === '1') {
        __pmContractsSyncTemplateLetterheadToggle();
        return;
    }
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', () => {
        __pmContractsTemplateLetterheadEnabled = !!toggle.checked;
        try {
            window.localStorage.setItem(__PM_CONTRACT_TEMPLATE_LETTERHEAD_STORAGE_KEY, String(__pmContractsTemplateLetterheadEnabled));
        } catch (_) {}
        if (window.loadSelectedTemplate && document.getElementById('template-selector').value) {
            window.loadSelectedTemplate();
        }
    });
    __pmContractsSyncTemplateLetterheadToggle();
}

function __pmContractsPayments(order) {
    return Array.isArray(order?.historial_pagos) ? order.historial_pagos : [];
}

function __pmContractsPaymentAmount(item) {
    const amount = parseFloat(item?.amount ?? item?.monto ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

function __pmContractsTotalPaid(order) {
    return __pmContractsPayments(order).reduce((sum, item) => sum + __pmContractsPaymentAmount(item), 0);
}

function __pmContractsRemaining(order) {
    const total = parseFloat(order?.precio_final || 0) || 0;
    const paid = __pmContractsTotalPaid(order);
    const remaining = Math.round((total - paid) * 100) / 100;
    return remaining < 0 ? 0 : remaining;
}

function __pmContractsConstanciaEntry(order) {
    return __pmContractsPayments(order).find((item) => {
        const t = String(item?.type || item?.tipo || '').toLowerCase();
        return t === 'constancia_liquidacion' || item?.closed === true || item?.is_closure === true;
    }) || null;
}

function __pmContractsIsClosed(order) {
    return !!__pmContractsConstanciaEntry(order);
}

function __pmContractsIsPaidComplete(order) {
    return __pmContractsIsClosed(order) || __pmContractsRemaining(order) <= 0.1;
}

function __pmContractsTransparentPdfHtml(html) {
    return String(html || '')
        .replace(/\bbg-(?:white|gray-\d{2,3}|red-\d{2,3}|green-\d{2,3}|blue-\d{2,3}|amber-\d{2,3}|purple-\d{2,3}|brand-red)\b/g, '')
        .replace(/\sstyle=(["'])([^"']*?)background(?:-color)?\s*:\s*[^;"']+;?([^"']*)\1/gi, (match, quote, before, after) => {
            const cleaned = `${before || ''}${after || ''}`.replace(/\s{2,}/g, ' ').trim();
            return cleaned ? ` style=${quote}${cleaned}${quote}` : '';
        })
        .replace(/\s{2,}/g, ' ');
}

function __pmContractsBoostPdfTypography(html) {
    return String(html || '')
        .replace(/\btext-\[9px\]\b/g, '__PMC_TXT_9__')
        .replace(/\btext-\[10px\]\b/g, '__PMC_TXT_10__')
        .replace(/\btext-\[11px\]\b/g, '__PMC_TXT_11__')
        .replace(/\btext-xs\b/g, '__PMC_TXT_XS__')
        .replace(/\btext-sm\b/g, '__PMC_TXT_SM__')
        .replace(/__PMC_TXT_9__/g, 'text-[10px]')
        .replace(/__PMC_TXT_10__/g, 'text-[11px]')
        .replace(/__PMC_TXT_11__/g, 'text-[12px]')
        .replace(/__PMC_TXT_XS__/g, 'text-sm')
        .replace(/__PMC_TXT_SM__/g, 'text-base');
}

const __PM_CONTRACTS_PDF_STYLE_TENANT = 'plaza_mayor';
const __PM_CONTRACTS_PDF_OVERLAYS_COLLECTION = 'pdf_overlays';
const __PM_CONTRACTS_PDF_OVERLAY_TYPES = Object.freeze({
    receipts: 'generator:receipts',
    contracts: 'generator:contracts'
});
const __PM_CONTRACTS_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'contract']);
const __PM_CONTRACTS_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const __PM_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS = Object.freeze({
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
const __PM_CONTRACTS_PDF_BASE_BLOCKS = Object.freeze([
    { id: 'base:header', key: 'header', label: 'Encabezado' },
    { id: 'base:summary-main', key: 'summary-main', label: 'Resumen principal' },
    { id: 'base:details', key: 'details', label: 'Detalles / Tabla pagos' },
    { id: 'base:balance', key: 'balance', label: 'Saldo / Totales' },
    { id: 'base:sign', key: 'sign', label: 'Firmas' },
    { id: 'base:footer', key: 'footer', label: 'Footer' },
    { id: 'base:watermark', key: 'watermark', label: 'Marca de agua' }
]);
const __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -2400, max: 2400 },
    y: { min: -3200, max: 3200 },
    scalePct: { min: 15, max: 500 }
});
const __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS = Object.freeze({
    receiptLeftName: 'Cobranza / Finanzas',
    receiptLeftRole: 'Plaza Mayor',
    receiptRightName: 'Mercadotecnia',
    receiptRightRole: 'Plaza Mayor',
    liquidatedLeftName: 'Cobranza',
    liquidatedLeftRole: 'Plaza Mayor',
    liquidatedRightName: 'Administración',
    liquidatedRightRole: 'Plaza Mayor',
    clientName: 'CLIENTE',
    clientRole: 'Cliente / Representante'
});
const __PM_CONTRACTS_PDF_STYLE_DEFAULTS = Object.freeze({
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
    signLabels: __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS,
    content: __PM_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS,
    headerAlign: 'right',
    metaAlign: 'right',
    tableAlign: 'left',
    quickAlign: 'left',
    conditionsAlign: 'justify',
    signAlign: 'center',
    summaryAlign: 'left',
    footerAlign: 'center'
});
const __PM_CONTRACTS_PDF_STYLE_UI_STATE_KEY = 'pm_contracts_pdf_style_ui';
let __pmContractsPdfStyleState = null;
let __pmContractsPdfStyleConfigRecordId = '';
let __pmContractsPdfStyleConfigStore = '';
let __pmContractsPdfStyleRawPayload = null;
let __pmContractsPdfStyleSyncTimer = null;
let __pmContractsPdfStyleUiState = { collapsed: false, pinned: false };
let __pmContractsPdfStyleActiveProfile = 'receipt';
let __pmContractsPdfResourceSelectedId = '';
let __pmContractsPdfResourcePointerState = null;
let __pmContractsPdfMarginGuideController = null;
let __pmContractsReceiptEditLocked = true;
let __pmContractsReceiptInspectorState = null;

function __pmContractsClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __pmContractsNormalizeAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __pmContractsRenderFontFamilyOptions(selectedKey) {
    const active = String(selectedKey || __PM_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey || 'segoe').toLowerCase();
    return Object.entries(__PM_CONTRACTS_PDF_STYLE_FONT_MAP)
        .map(([key, stack]) => {
            const label = stack
                .split(',')
                .map((item) => item.replace(/["']/g, '').trim())
                .find(Boolean) || key;
            return `<option value="${key}" ${key === active ? 'selected' : ''}>${__pmContractsSafeHtml(label)}</option>`;
        })
        .join('');
}

function __pmContractsSafeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function __pmContractsNormalizeHexColor(value, fallback = '#111827') {
    const raw = String(value || '').trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(raw)) {
        if (raw.length === 4) {
            return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
        }
        return raw.toLowerCase();
    }
    return fallback;
}

function __pmContractsGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __PM_CONTRACTS_PDF_BASE_BLOCKS.find((block) => block.key === safe) || null;
}

function __pmContractsNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __pmContractsClampStyleNumber(base.x, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.min, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __pmContractsClampStyleNumber(base.y, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.min, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __pmContractsClampStyleNumber(base.scalePct ?? base.scale, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        hidden: base.hidden === true
    };
}

function __pmContractsNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __PM_CONTRACTS_PDF_BASE_BLOCKS.forEach((block) => {
        out[block.key] = __pmContractsNormalizePdfBaseLayout(source[block.key] || {});
        Object.keys(source).forEach((k) => {
            if (k.startsWith(block.key + '__')) out[k] = __pmContractsNormalizePdfBaseLayout(source[k]);
        });
    });
    return out;
}

function __pmContractsBuildPdfBaseTransform(layout) {
    const safe = __pmContractsNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __pmContractsNormalizePdfSignLabels(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS;
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

function __pmContractsEscapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function __pmContractsResolveResourceTemplate(value, context = {}) {
    let output = String(value ?? '');
    const tokens = context && typeof context === 'object'
        ? (context.tokens && typeof context.tokens === 'object' ? context.tokens : {})
        : {};
    Object.entries(tokens).forEach(([token, tokenValue]) => {
        const safeToken = String(token || '').trim();
        if (!safeToken) return;
        const replaceValue = String(tokenValue ?? '');
        const pattern = new RegExp(`\\{\\{\\s*${__pmContractsEscapeRegExp(safeToken)}\\s*\\}\\}`, 'gi');
        output = output.replace(pattern, replaceValue);
    });
    return output;
}

function __pmContractsBuildReceiptResourceContext({ isLiquidated, dateStr, timeStr, pdfContent, signLabels } = {}) {
    const content = __pmContractsNormalizePdfContent(pdfContent || {});
    const labels = __pmContractsNormalizePdfSignLabels(signLabels || {});
    const liquidatedMode = isLiquidated === true;
    const safeOrderNum = String(selectedOrder?.numero_orden || '---').trim() || '---';
    const safeShortId = String(selectedOrder?.id || '').slice(0, 8).toUpperCase();
    const clientName = String(selectedOrder?.cliente_nombre || labels.clientName || __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientName || 'CLIENTE').trim();
    const clientRole = String(labels.clientRole || __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientRole || '').trim();
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
            SIGN_CLIENT_ROLE: clientRole
        }
    };
}

function __pmContractsBuildDefaultReceiptResources() {
    return __pmContractsNormalizePdfResources([
        {
            id: 'pmc_def_doc_title',
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
            bgColor: '#ffffff',
            bold: true
        },
        {
            id: 'pmc_def_doc_folio',
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
            bgColor: '#ffffff',
            bold: true
        },
        {
            id: 'pmc_def_doc_date',
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
            bgColor: '#ffffff'
        },
        {
            id: 'pmc_def_doc_time',
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
            bgColor: '#ffffff'
        },
        {
            id: 'pmc_def_sign_left',
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
            id: 'pmc_def_sign_client',
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
            id: 'pmc_def_sign_right',
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

function __pmContractsEnsureReceiptResourceDefaults(style, options = {}) {
    const safe = __pmContractsNormalizePdfStyle(style || {});
    if (safe.resourcesInitialized || (Array.isArray(safe.resources) && safe.resources.length > 0)) return safe;
    const next = __pmContractsNormalizePdfStyle({
        ...safe,
        resourcesInitialized: true,
        resources: __pmContractsBuildDefaultReceiptResources()
    });
    if (options.persist === true && __pmContractsIsAdminProfile()) {
        __pmContractsSetPdfStyleConfig(next, { applyToDom: true });
        __pmContractsScheduleSharedPdfStyleSync(next);
    }
    return next;
}
function __pmContractsNormalizePdfResources(raw) {
    const list = Array.isArray(raw) ? raw : [];
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
            : (isSign ? '#111827' : (safeType === 'bar' ? '#d32f2f' : '#ffffff'));
        return {
            id: String(base.id || `pmc_res_${Date.now()}_${index}`),
            type: safeType,
            enabled: base.enabled !== false,
            page: __pmContractsClampStyleNumber(base.page, 1, 8, 1),
            x: __pmContractsClampStyleNumber(base.x, -4000, 4000, 80),
            y: __pmContractsClampStyleNumber(base.y, -5000, 5000, 120),
            w: __pmContractsClampStyleNumber(base.w, 16, 4000, defaultW),
            h: __pmContractsClampStyleNumber(base.h, 1, 5000, defaultH),
            bgColor: __pmContractsNormalizeHexColor(base.bgColor, defaultColor),
            text: safeType === 'title' || safeType === 'text' ? String(base.text || '').slice(0, 500) : '',
            fontFamilyKey: String(base.fontFamilyKey || ''),
            fontSize: __pmContractsClampStyleNumber(base.fontSize, 8, 72, safeType === 'title' ? 24 : 14),
            align: __pmContractsNormalizeAlign(base.align, 'left'),
            color: __pmContractsNormalizeHexColor(base.color, '#111827'),
            bold: !!base.bold,
            italic: !!base.italic,
            underline: !!base.underline,
            angle: __pmContractsClampStyleNumber(base.angle, -360, 360, 0),
            signTitle: safeType === 'sign-block' ? String(base.signTitle || '').slice(0, 80) : '',
            signRole: safeType === 'sign-block' ? String(base.signRole || '').slice(0, 80) : ''
        };
    });
}

function __pmContractsRenderPdfResources(style, pageIndex, context = {}) {
    const cfg = __pmContractsNormalizePdfStyle(style || {});
    const resources = __pmContractsNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    const isAdmin = __pmContractsIsAdminProfile();
    const globalFont = __PM_CONTRACTS_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __PM_CONTRACTS_PDF_STYLE_FONT_MAP.segoe;
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const isSignBlock = resource.type === 'sign-block';
            const isSign = resource.type === 'sign' || resource.type === 'sign-line';
            let bgFill = resource.bgColor;
            if (resource.type === 'logo' || isSign || isSignBlock) bgFill = 'transparent';
            const extraWrapStyle = isSignBlock ? 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;pointer-events:none;' : '';
            const rectEvents = isSignBlock && isAdmin ? 'pointer-events:auto;' : '';
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:35;box-sizing:border-box;pointer-events:${isAdmin ? 'auto' : 'none'};background:${bgFill};transform:rotate(${resource.angle || 0}deg);transform-origin:center center;${extraWrapStyle}`;
            const deleteBtnHtml = isAdmin ? `<div class="pmc-pdf-delete-btn" data-res-action="remove" data-res-id="${__pmContractsSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';

            if (resource.type === 'logo') {
                return `<div class="pmc-pdf-resource ${isAdmin ? 'pmc-pdf-editable' : ''}" data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="logo" style="${common}padding:0;border-radius:0;"><img src="${__pmContractsSafeHtml(LOGO_URL)}" alt="Logo tenant" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">${deleteBtnHtml}</div>`;
            }

            if (isSign) {
                const lineColor = resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#111827';
                return `<div class="pmc-pdf-resource ${isAdmin ? 'pmc-pdf-editable' : ''}" data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="sign" style="${common}background:transparent;border-radius:2px;"><div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${lineColor};transform:translateY(-50%);border-radius:999px;"></div>${deleteBtnHtml}</div>`;
            }

            if (isSignBlock) {
                const titleStr = __pmContractsSafeHtml(__pmContractsResolveResourceTemplate(resource.signTitle || '', context));
                const roleStr = __pmContractsSafeHtml(__pmContractsResolveResourceTemplate(resource.signRole || '', context));
                const tColor = resource.color && resource.color !== 'transparent' ? resource.color : '#111827';
                const lineColor = resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#111827';
                const fontStack = resource.fontFamilyKey && __PM_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __PM_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const titleSize = Math.max(10, Number(resource.fontSize || 14));
                const roleSize = Math.max(9, titleSize - 2);
                return `
                <div class="pmc-pdf-resource ${isAdmin ? 'pmc-pdf-editable' : ''}" data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="sign-block" style="${common}${rectEvents}">
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
                const fontStack = resource.fontFamilyKey && __PM_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __PM_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const fw = resource.bold ? '800' : 'normal';
                const fs = resource.italic ? 'italic' : 'normal';
                const td = resource.underline ? 'underline' : 'none';
                const ta = resource.align;
                const tColor = resource.color && resource.color !== 'transparent' ? resource.color : '#111827';
                const content = __pmContractsSafeHtml(__pmContractsResolveResourceTemplate(resource.text, context));
                const placeholder = isAdmin && !content ? (resource.type === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
                return `
                <div class="pmc-pdf-resource ${isAdmin ? 'pmc-pdf-editable' : ''}" data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="${resource.type}" data-res-font-size="${resource.fontSize}" style="${common}">
                    <div style="width:100%;height:100%;padding:4px;overflow:hidden;font-family:${fontStack};font-size:${resource.fontSize}px;font-weight:${fw};font-style:${fs};text-decoration:${td};text-align:${ta};color:${tColor};white-space:pre-wrap;pointer-events:none;user-select:none;display:flex;flex-direction:column;justify-content:flex-start;">
                        ${content || `<span style="opacity:0.3;">${placeholder}</span>`}
                    </div>
                
                    ${deleteBtnHtml}
                </div>
                `;
            }
            
            return `<div class="pmc-pdf-resource ${isAdmin ? 'pmc-pdf-editable' : ''}" data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-page="${resource.page}" data-res-type="${resource.type}" style="${common}background:${resource.bgColor};border-radius:2px;">${deleteBtnHtml}</div>`;
        })
        .join('');
}

function __pmContractsAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (type !== 'text' && type !== 'title') return;
    const textNode = node.firstElementChild instanceof HTMLElement ? node.firstElementChild : node;
    if (!(textNode instanceof HTMLElement)) return;
    const baseFont = __pmContractsClampStyleNumber(
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

function __pmContractsAutoFitPdfTextResources() {
    document.querySelectorAll('#receipt-preview-box .pmc-pdf-resource[data-res-type="text"], #receipt-preview-box .pmc-pdf-resource[data-res-type="title"]').forEach((node) => {
        __pmContractsAutoFitPdfTextNode(node);
    });
}

function __pmContractsInjectResourcesIntoPage(rawHtml, resourcesHtml) {
    const html = String(rawHtml || '');
    const extra = String(resourcesHtml || '');
    if (!extra) return html;
    const idx = html.lastIndexOf('</div>');
    if (idx < 0) return `${html}${extra}`;
    return `${html.slice(0, idx)}${extra}${html.slice(idx)}`;
}

function __pmContractsNormalizePdfContent(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __PM_CONTRACTS_PDF_STYLE_CONTENT_DEFAULTS;
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

function __pmContractsGetPdfContentFieldMaxLength(field) {
    const longFields = new Set(['annexHintBody', 'liquidatedFooterLine1', 'liquidatedFooterLine2', 'receiptFooterLine1', 'receiptFooterLine2']);
    if (field === 'annexHintBody') return 900;
    if (longFields.has(field)) return 180;
    return 120;
}

function __pmContractsCommitPdfContentField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __pmContractsGetPdfStyleConfig();
    const max = __pmContractsGetPdfContentFieldMaxLength(key);
    const content = __pmContractsNormalizePdfContent({
        ...(cfg.content || {}),
        [key]: String(rawValue ?? '').slice(0, max)
    });
    const next = __pmContractsNormalizePdfStyle({ ...cfg, content });
    __pmContractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __pmContractsScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __pmContractsRefreshPreviewFromStyleState();
}

function __pmContractsCommitPdfSignLabelField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const current = __pmContractsGetPdfStyleConfig();
    const nextSignLabels = __pmContractsNormalizePdfSignLabels({
        ...(current.signLabels || __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS),
        [key]: String(rawValue || '').slice(0, 80)
    });
    const next = __pmContractsNormalizePdfStyle({ ...current, signLabels: nextSignLabels });
    __pmContractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __pmContractsScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __pmContractsRefreshPreviewFromStyleState();
}

function __pmContractsGetReceiptBaseContentFields(baseKey) {
    const key = String(baseKey || '').trim();
    const content = __pmContractsNormalizePdfContent(__pmContractsGetPdfStyleConfig().content);
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
            ? [
                { key: 'liquidatedPaymentsHeading', label: 'Titulo de tabla', value: content.liquidatedPaymentsHeading, max: 120 }
            ]
            : [
                { key: 'receiptBankHeading', label: 'Titulo bancario', value: content.receiptBankHeading, max: 120 },
                { key: 'receiptBankLabel', label: 'Etiqueta banco', value: content.receiptBankLabel, max: 60 },
                { key: 'receiptAccountLabel', label: 'Etiqueta cuenta', value: content.receiptAccountLabel, max: 80 },
                { key: 'receiptReferenceHeading', label: 'Titulo referencia', value: content.receiptReferenceHeading, max: 120 }
            ];
    }
    if (key === 'balance') {
        return [
            { key: isLiquidated ? 'liquidatedBalanceLabel' : 'receiptPendingBalanceLabel', label: 'Etiqueta saldo', value: isLiquidated ? content.liquidatedBalanceLabel : content.receiptPendingBalanceLabel, max: 140 }
        ];
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
    if (key === 'sign') return [];
    if (key === 'watermark' && isLiquidated) {
        return [
            { key: 'liquidatedWatermarkText', label: 'Texto marca', value: content.liquidatedWatermarkText, max: 120 }
        ];
    }
    return [];
}

function __pmContractsNormalizePdfStyle(raw = {}) {
    const base = { ...__PM_CONTRACTS_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    const safeResources = __pmContractsNormalizePdfResources(base.resources);
    return {
        fontFamilyKey: __PM_CONTRACTS_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __PM_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __pmContractsClampStyleNumber(base.headerLinePx, 1, 8, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.headerLinePx),
        signLinePx: __pmContractsClampStyleNumber(base.signLinePx, 1, 16, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.signLinePx),
        titlePx: __pmContractsClampStyleNumber(base.titlePx, 20, 42, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __pmContractsClampStyleNumber(base.metaPx, 8, 18, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __pmContractsClampStyleNumber(base.tableHeadPx, 9, 18, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __pmContractsClampStyleNumber(base.tableBodyPx, 9, 16, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __pmContractsClampStyleNumber(base.lineHeightPct, 90, 180, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __pmContractsClampStyleNumber(base.quickPx, 9, 16, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __pmContractsClampStyleNumber(base.conditionsPx, 9, 18, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __pmContractsClampStyleNumber(base.signPx, 9, 16, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __pmContractsClampStyleNumber(base.footerPx, 8, 14, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __pmContractsClampStyleNumber(base.offsetXPx, -120, 120, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __pmContractsClampStyleNumber(base.offsetYPx, -120, 120, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __pmContractsClampStyleNumber(base.extraPages, 0, 6, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.extraPages),
        marginTopPx: __pmContractsClampStyleNumber(base.marginTopPx, -4000, 4000, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.marginTopPx),
        marginBottomPx: __pmContractsClampStyleNumber(base.marginBottomPx, -4000, 4000, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.marginBottomPx),
        marginLeftPx: __pmContractsClampStyleNumber(base.marginLeftPx, -4000, 4000, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.marginLeftPx),
        marginRightPx: __pmContractsClampStyleNumber(base.marginRightPx, -4000, 4000, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.marginRightPx),
        baseLayouts: __pmContractsNormalizePdfBaseLayouts(base.baseLayouts),
        resources: safeResources,
        resourcesInitialized: base.resourcesInitialized === true || safeResources.length > 0,
        signLabels: __pmContractsNormalizePdfSignLabels(base.signLabels),
        content: __pmContractsNormalizePdfContent(base.content),
        headerAlign: __pmContractsNormalizeAlign(base.headerAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.headerAlign),
        metaAlign: __pmContractsNormalizeAlign(base.metaAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.metaAlign),
        tableAlign: __pmContractsNormalizeAlign(base.tableAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.tableAlign),
        quickAlign: __pmContractsNormalizeAlign(base.quickAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.quickAlign),
        conditionsAlign: __pmContractsNormalizeAlign(base.conditionsAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.conditionsAlign),
        signAlign: __pmContractsNormalizeAlign(base.signAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.signAlign),
        summaryAlign: __pmContractsNormalizeAlign(base.summaryAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.summaryAlign),
        footerAlign: __pmContractsNormalizeAlign(base.footerAlign, __PM_CONTRACTS_PDF_STYLE_DEFAULTS.footerAlign)
    };
}

function __pmContractsNormalizeProfileKey(profile) {
    const safe = String(profile || '').toLowerCase();
    return __PM_CONTRACTS_PDF_STYLE_PROFILE_KEYS.includes(safe) ? safe : 'receipt';
}

function __pmContractsExtractPdfStyleProfile(raw, profile = 'receipt') {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const key = __pmContractsNormalizeProfileKey(profile);
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    if (profiles) {
        const candidate = profiles[key] || profiles.receipt || profiles.quote || profiles.default;
        if (candidate && typeof candidate === 'object') return candidate;
    }
    return cfg;
}

function __pmContractsNormalizePdfStyleProfiles(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    const fallback = __pmContractsNormalizePdfStyle(profiles ? (profiles.receipt || profiles.quote || profiles.default || __PM_CONTRACTS_PDF_STYLE_DEFAULTS) : cfg);
    const out = {};
    __PM_CONTRACTS_PDF_STYLE_PROFILE_KEYS.forEach((key) => {
        out[key] = __pmContractsNormalizePdfStyle(profiles ? (profiles[key] || fallback) : fallback);
    });
    return out;
}

function __pmContractsBuildPdfStyleConfigPayload(rawExisting, style, profile = __pmContractsPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const key = __pmContractsNormalizeProfileKey(profile);
    const profiles = __pmContractsNormalizePdfStyleProfiles(existing);
    profiles[key] = __pmContractsNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __PM_CONTRACTS_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: new Date().toISOString(),
        profiles
    };
}

function __pmContractsLoadPdfStyleState() {
    return __pmContractsNormalizePdfStyle();
}

function __pmContractsLoadPdfStyleUiState() {
    try {
        const raw = localStorage.getItem(__PM_CONTRACTS_PDF_STYLE_UI_STATE_KEY);
        if (!raw) return { collapsed: false, pinned: false };
        const parsed = JSON.parse(raw);
        return { collapsed: !!parsed?.collapsed, pinned: !!parsed?.pinned };
    } catch (_) {
        return { collapsed: false, pinned: false };
    }
}

function __pmContractsSavePdfStyleUiState() {
    try {
        localStorage.setItem(__PM_CONTRACTS_PDF_STYLE_UI_STATE_KEY, JSON.stringify(__pmContractsPdfStyleUiState));
    } catch (_) {}
}

function __pmContractsGetPdfStyleConfig() {
    if (!__pmContractsPdfStyleState) __pmContractsPdfStyleState = __pmContractsLoadPdfStyleState();
    return { ...__pmContractsPdfStyleState };
}

function __pmContractsPdfStyleVars(style) {
    const safe = __pmContractsNormalizePdfStyle(style);
    const headerAlign = safe.headerAlign === 'justify' ? 'left' : safe.headerAlign;
    return {
        '--pm-font-family': __PM_CONTRACTS_PDF_STYLE_FONT_MAP[safe.fontFamilyKey],
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
        '--pm-footer-align': safe.footerAlign,
        '--pm-margin-top': `${safe.marginTopPx}px`,
        '--pm-margin-bottom': `${safe.marginBottomPx}px`,
        '--pm-margin-left': `${safe.marginLeftPx}px`,
        '--pm-margin-right': `${safe.marginRightPx}px`
    };
}

function __pmContractsPdfStyleVarsInline(style) {
    const vars = __pmContractsPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __pmContractsApplyPdfBaseLayouts() {
    const cfg = __pmContractsGetPdfStyleConfig();
    const layouts = __pmContractsNormalizePdfBaseLayouts(cfg.baseLayouts);
    const groups = {};
    document.querySelectorAll('#receipt-preview-box [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__pmContractsGetPdfBaseBlockMeta(key)) return;
        groups[key] = (groups[key] || 0);
        const index = groups[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __pmContractsNormalizePdfBaseLayout();
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = __pmContractsBuildPdfBaseTransform(layout);
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('pmc-pdf-editable', __pmContractsIsAdminProfile());
        node.dataset.baseInstance = instanceKey;
    });
}

function __pmContractsCommitPdfBaseLayout(key, layout) {
    const baseKey = String(key || '').split('__')[0].trim();
    if (!__pmContractsGetPdfBaseBlockMeta(baseKey)) return;
    const fullKey = String(key || '').trim();
    const cfg = __pmContractsGetPdfStyleConfig();
    const baseLayouts = {
        ...__pmContractsNormalizePdfBaseLayouts(cfg.baseLayouts),
        [fullKey]: __pmContractsNormalizePdfBaseLayout(layout)
    };
    const next = __pmContractsNormalizePdfStyle({ ...cfg, baseLayouts });
    __pmContractsSetPdfStyleConfig(next, { applyToDom: false });
    __pmContractsApplyPdfBaseLayouts();
    __pmContractsScheduleSharedPdfStyleSync(next);
}

function __pmContractsCommitBaseLayoutField(baseId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const baseKey = key.split('__')[0];
    if (!__pmContractsGetPdfBaseBlockMeta(baseKey)) return;
    const cfg = __pmContractsGetPdfStyleConfig();
    const baseLayouts = __pmContractsNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[key] || baseLayouts[baseKey] || __pmContractsNormalizePdfBaseLayout();
    let nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __pmContractsClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __pmContractsClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __pmContractsNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [key]: __pmContractsNormalizePdfBaseLayout(nextLayout)
        }
    });
    __pmContractsSetPdfStyleConfig(next, {
        applyToDom: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
    __pmContractsScheduleSharedPdfStyleSync(next);
}

function __pmContractsApplyPdfStyleToLivePreview(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const rootNodes = document.querySelectorAll('#receipt-preview-box .pmc-pdf-root');
    if (!rootNodes.length) return;
    const vars = __pmContractsPdfStyleVars(__pmContractsGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __pmContractsApplyPdfBaseLayouts();
    __pmContractsAutoFitPdfTextResources();
    __pmContractsEnsureReceiptEditingChrome(opts);
    __pmContractsBindPdfResourceDrag();
    __pmContractsInitPdfResourceModalDrag();
    __pmContractsSyncReceiptEditMode();
    __pmContractsHighlightSelectedResource();
    if (__pmContractsIsAdminProfile() && !skipEditorUiRefresh) __pmContractsRenderPdfResourcesEditorList();
    if (!skipEditorUiRefresh) __pmContractsRenderReceiptToolbar();
    __pmContractsEnsureMarginGuideController()?.refresh();
}

function __pmContractsMarginStateFromConfig(style) {
    const cfg = __pmContractsNormalizePdfStyle(style || __pmContractsGetPdfStyleConfig());
    return {
        top: cfg.marginTopPx,
        bottom: cfg.marginBottomPx,
        left: cfg.marginLeftPx,
        right: cfg.marginRightPx
    };
}

function __pmContractsApplyMarginVarsToLivePreview(style) {
    const cfg = __pmContractsNormalizePdfStyle(style || __pmContractsGetPdfStyleConfig());
    document.querySelectorAll('#receipt-preview-box .pmc-pdf-root').forEach((node) => {
        node.style.setProperty('--pm-margin-top', `${cfg.marginTopPx}px`);
        node.style.setProperty('--pm-margin-bottom', `${cfg.marginBottomPx}px`);
        node.style.setProperty('--pm-margin-left', `${cfg.marginLeftPx}px`);
        node.style.setProperty('--pm-margin-right', `${cfg.marginRightPx}px`);
    });
}

function __pmContractsCommitMargins(margins, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const current = __pmContractsGetPdfStyleConfig();
    const next = __pmContractsNormalizePdfStyle({
        ...current,
        marginTopPx: margins.top,
        marginBottomPx: margins.bottom,
        marginLeftPx: margins.left,
        marginRightPx: margins.right
    });
    __pmContractsPdfStyleState = next;
    __pmContractsApplyMarginVarsToLivePreview(next);
    __pmContractsSyncPdfStyleValueLabels(next);
    __pmContractsRenderReceiptToolbar();
    if (opts.persist !== false) __pmContractsScheduleSharedPdfStyleSync(next);
    return next;
}

function __pmContractsEnsureMarginGuideController() {
    if (!window.createPdfMarginGuideController) return null;
    if (!__pmContractsPdfMarginGuideController) {
        __pmContractsPdfMarginGuideController = window.createPdfMarginGuideController({
            container: () => document.getElementById('receipt-preview-container'),
            root: () => document.getElementById('receipt-preview-box'),
            minMarginPx: -4000,
            maxMarginPx: 4000,
            isVisible: () => {
                const view = document.getElementById('view-receipt');
                return !!view && !view.classList.contains('hidden') && __pmContractsIsAdminProfile() && !__pmContractsReceiptEditLocked;
            },
            getMargins: () => __pmContractsMarginStateFromConfig(),
            onChange: (margins) => {
                __pmContractsCommitMargins(margins, { persist: false });
            },
            onCommit: (margins) => {
                __pmContractsCommitMargins(margins, { persist: false });
                __pmContractsScheduleSharedPdfStyleSync(__pmContractsGetPdfStyleConfig());
            }
        });
    }
    return __pmContractsPdfMarginGuideController;
}

function __pmContractsShouldRefreshResourcePreviewField(field) {
    return true;
}

function __pmContractsCommitResourceInspectorField(resourceId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const resources = __pmContractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    if (field === 'text') {
        resources[idx].text = String(rawValue || '').slice(0, 500);
    } else if (field === 'fontFamilyKey') {
        const safeKey = String(rawValue || '').toLowerCase();
        resources[idx].fontFamilyKey = __PM_CONTRACTS_PDF_STYLE_FONT_MAP[safeKey] ? safeKey : '';
    } else if (field === 'signTitle' || field === 'signRole') {
        resources[idx][field] = String(rawValue || '').slice(0, 80);
    } else if (field === 'fontSize') {
        resources[idx].fontSize = __pmContractsClampStyleNumber(rawValue, 8, 72, resources[idx].fontSize);
    } else if (field === 'align') {
        resources[idx].align = __pmContractsNormalizeAlign(rawValue, resources[idx].align);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        resources[idx][field] = !!rawValue;
    } else if (field === 'color') {
        resources[idx].color = __pmContractsNormalizeHexColor(rawValue, resources[idx].color);
    } else if (field === 'bgColor') {
        resources[idx].bgColor = __pmContractsNormalizeHexColor(rawValue, resources[idx].bgColor);
    } else if (field === 'page') {
        resources[idx].page = __pmContractsClampStyleNumber(rawValue, 1, 8, resources[idx].page);
    } else if (field === 'x') {
        resources[idx].x = __pmContractsClampStyleNumber(rawValue, -4000, 4000, resources[idx].x);
    } else if (field === 'y') {
        resources[idx].y = __pmContractsClampStyleNumber(rawValue, -5000, 5000, resources[idx].y);
    } else if (field === 'w') {
        resources[idx].w = __pmContractsClampStyleNumber(rawValue, 16, 4000, resources[idx].w);
    } else if (field === 'h') {
        resources[idx].h = __pmContractsClampStyleNumber(rawValue, 1, 5000, resources[idx].h);
    } else if (field === 'angle') {
        resources[idx].angle = __pmContractsClampStyleNumber(rawValue, -360, 360, resources[idx].angle || 0);
    } else if (field === 'enabled') {
        resources[idx].enabled = !!rawValue;
    } else {
        return;
    }
    __pmContractsCommitPdfResources(resources, {
        refreshPreview: __pmContractsShouldRefreshResourcePreviewField(field),
        // En inputs continuos evitamos reconstruir panel/lista para no perder foco.
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
}

function __pmContractsBindReceiptToolbarDrag(panel, host) {
    if (!(panel instanceof HTMLElement) || !(host instanceof HTMLElement) || panel.dataset.dragBound === '1') return;
    panel.dataset.dragBound = '1';
    const handle = panel.querySelector('[data-receipt-panel-handle]');
    if (!(handle instanceof HTMLElement)) return;
    const clampPosition = (left, top) => {
        const hostWidth = host.clientWidth || window.innerWidth || 320;
        const hostHeight = host.clientHeight || window.innerHeight || 240;
        const panelWidth = panel.offsetWidth || 280;
        const panelHeight = panel.offsetHeight || 180;
        const maxLeft = Math.max(16, hostWidth - panelWidth - 16);
        const maxTop = Math.max(16, hostHeight - panelHeight - 16);
        return {
            left: Math.min(maxLeft, Math.max(16, Math.round(left))),
            top: Math.min(maxTop, Math.max(16, Math.round(top)))
        };
    };
    const applyPosition = (left, top) => {
        const next = clampPosition(left, top);
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
    };
    const ensureInitialPosition = () => {
        if (panel.dataset.positioned === '1') {
            applyPosition(parseFloat(panel.style.left || '0') || 0, parseFloat(panel.style.top || '0') || 0);
            return;
        }
        panel.dataset.positioned = '1';
        applyPosition((host.clientWidth || window.innerWidth || 320) - (panel.offsetWidth || 280) - 24, 84);
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
    requestAnimationFrame(ensureInitialPosition);
}

function __pmContractsRenderReceiptToolbar() {
    const buttonBar = document.getElementById('pmc-receipt-edit-button-bar');
    if (!buttonBar) return;
    const viewVisible = !document.getElementById('view-receipt')?.classList.contains('hidden');
    const isAdmin = __pmContractsIsAdminProfile();
    const showToolbar = isAdmin && viewVisible;
    buttonBar.classList.toggle('hidden', !showToolbar);
    if (!showToolbar) {
        document.getElementById('pmc-receipt-inspector')?.classList.add('hidden');
        document.getElementById('pmc-receipt-inspector-backdrop')?.classList.add('hidden');
        return;
    }
    const headerToggleBtn = document.getElementById('pmc-receipt-edit-button');
    const editingEnabled = !__pmContractsReceiptEditLocked;
    if (headerToggleBtn) {
        headerToggleBtn.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>${editingEnabled ? 'Edicion activa' : 'Editar PDF'}</span>`;
        headerToggleBtn.classList.toggle('bg-emerald-600', editingEnabled);
        headerToggleBtn.classList.toggle('hover:bg-emerald-500', editingEnabled);
        headerToggleBtn.classList.toggle('border-emerald-400/50', editingEnabled);
        headerToggleBtn.classList.toggle('bg-gray-950', !editingEnabled);
        headerToggleBtn.classList.toggle('hover:bg-gray-900', !editingEnabled);
        headerToggleBtn.classList.toggle('border-gray-700', !editingEnabled);
    }
    const addButton = document.getElementById('pmc-receipt-add-button');
    if (addButton) {
        addButton.classList.toggle('pointer-events-none', __pmContractsReceiptEditLocked);
        addButton.classList.toggle('opacity-60', __pmContractsReceiptEditLocked);
    }
}

function __pmContractsSyncReceiptEditMode() {
    const editingEnabled = __pmContractsIsAdminProfile() && !__pmContractsReceiptEditLocked && !document.getElementById('view-receipt')?.classList.contains('hidden');
    document.querySelectorAll('#receipt-preview-box .pmc-pdf-root').forEach((node) => {
        node.classList.toggle('pmc-pdf-admin-enabled', editingEnabled);
    });
    if (!editingEnabled) __pmContractsCloseReceiptInspector();
    __pmContractsRenderReceiptToolbar();
    __pmContractsEnsureMarginGuideController()?.refresh();
}

function __pmContractsSetReceiptEditLocked(locked) {
    __pmContractsReceiptEditLocked = locked !== false;
    if (__pmContractsReceiptEditLocked) __pmContractsCloseReceiptInspector();
    __pmContractsSyncReceiptEditMode();
}

function __pmContractsOverlayDocumentType(generatorType) {
    const safeType = String(generatorType || '').trim().toLowerCase();
    return __PM_CONTRACTS_PDF_OVERLAY_TYPES[safeType] || `generator:${safeType || 'receipts'}`;
}

function __pmContractsGetReceiptInspectorTarget() {
    if (!__pmContractsReceiptInspectorState || !__pmContractsIsAdminProfile()) return null;
    if (__pmContractsReceiptInspectorState.kind === 'base') {
        const key = String(__pmContractsReceiptInspectorState.key || '').trim();
        const meta = __pmContractsGetPdfBaseBlockMeta(key);
        if (!meta) return null;
        const layouts = __pmContractsNormalizePdfBaseLayouts(__pmContractsGetPdfStyleConfig().baseLayouts);
        const instanceKey = String(__pmContractsReceiptInspectorState.instanceKey || key).trim();
        const layout = layouts[instanceKey] || layouts[key] || __pmContractsNormalizePdfBaseLayout();
        return {
            kind: 'base',
            id: instanceKey,
            label: meta.label,
            layout: {
                x: layout.x,
                y: layout.y,
                scalePct: layout.scalePct,
                visible: !layout.hidden
            },
            contentFields: __pmContractsGetReceiptBaseContentFields(key),
            canDelete: false
        };
    }
    if (__pmContractsReceiptInspectorState.kind === 'resource') {
        const safeId = String(__pmContractsReceiptInspectorState.id || '').trim();
        const preferredPage = __pmContractsClampStyleNumber(__pmContractsReceiptInspectorState.page, 1, 8, 1);
        const resource = __pmContractsGetPdfResourcesFromState().find((item) => {
            if (item.id !== safeId) return false;
            if (__pmContractsReceiptInspectorState.page == null) return true;
            return Number(item.page || 1) === preferredPage;
        });
        if (!resource) return null;
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const isLogo = resource.type === 'logo';
        const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
        const isBar = resource.type === 'bar';
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
            allowText: isTextLike,
            showTypography: isTextLike || isSignBlock,
            showToggles: isTextLike,
            showAlign: isTextLike,
            showColor: isTextLike || isSignBlock,
            showBgColor: !isLogo,
            bgColorLabel: isSignBlock || isSignLine ? 'Color linea' : (isBar ? 'Color' : 'Fondo'),
            text: resource.text || '',
            fontFamilyKey: resource.fontFamilyKey || '',
            fontSize: Number(resource.fontSize || 14),
            align: resource.align || 'left',
            color: resource.color || '#111827',
            bgColor: resource.bgColor || '#ffffff',
            bold: !!resource.bold,
            italic: !!resource.italic,
            underline: !!resource.underline,
            layout: {
                page: Number(resource.page || 1),
                x: Number(resource.x || 0),
                y: Number(resource.y || 0),
                w: Number(resource.w || 0),
                h: Number(resource.h || 0),
                angle: Number(resource.angle || 0),
                visible: resource.enabled !== false
            },
            contentFields: isSignBlock
                ? [
                    { key: 'signTitle', label: 'Nombre', value: String(resource.signTitle || ''), max: 80 },
                    { key: 'signRole', label: 'Cargo o rol', value: String(resource.signRole || ''), max: 80 }
                ]
                : [],
            canDelete: true
        };
    }
    return null;
}

function __pmContractsGetReceiptInspectorAnchorNode() {
    if (!__pmContractsReceiptInspectorState) return null;
    if (__pmContractsReceiptInspectorState.kind === 'resource') {
        const safeId = String(__pmContractsReceiptInspectorState.id || '').trim();
        const safePage = __pmContractsClampStyleNumber(__pmContractsReceiptInspectorState.page, 1, 8, 1);
        const withPage = __pmContractsReceiptInspectorState.page == null
            ? null
            : document.querySelector(`#receipt-preview-box .pmc-pdf-resource[data-res-id="${safeId}"][data-res-page="${safePage}"]`);
        if (withPage) return withPage;
        return document.querySelector(`#receipt-preview-box .pmc-pdf-resource[data-res-id="${safeId}"]`);
    }
    if (__pmContractsReceiptInspectorState.kind === 'base') {
        const key = String(__pmContractsReceiptInspectorState.key || '').trim();
        return document.querySelector(`#receipt-preview-box [data-base-resource="${key}"]`);
    }
    return null;
}

function __pmContractsPositionReceiptInspector() {
    const panel = document.getElementById('pmc-receipt-inspector');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.style.left = '0';
    panel.style.top = '0';
    panel.style.right = '0';
}

function __pmContractsRenderReceiptInspector() {
    const panel = document.getElementById('pmc-receipt-inspector');
    const backdrop = document.getElementById('pmc-receipt-inspector-backdrop');
    if (!panel) return;
    const target = __pmContractsGetReceiptInspectorTarget();
    if (!target || __pmContractsReceiptEditLocked) {
        panel.classList.add('hidden');
        if (backdrop) backdrop.classList.add('hidden');
        return;
    }
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
        fontSelect.innerHTML = __pmContractsRenderFontFamilyOptions(target.fontFamilyKey || __PM_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey);
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
                <input data-receipt-inspector-field="${field.key}" data-target-id="${target.id}" data-target-kind="${target.kind}" type="text" maxlength="${field.max || 5000}" value="${__pmContractsSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">
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
        if (target.kind === 'base') {
            advancedSection.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-receipt-inspector-field="x" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.min}" max="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.x.max}" value="${layout.x ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-receipt-inspector-field="y" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.min}" max="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.y.max}" value="${layout.y ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Escala</span><input data-receipt-inspector-field="scalePct" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${layout.scalePct ?? 100}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-receipt-inspector-field="visible" data-target-id="${target.id}" data-target-kind="${target.kind}" class="${inputClass}">${boolOptions(layout.visible !== false)}</select></label>
                </div>
            `;
        } else {
            const showBgColor = target.showBgColor !== false;
            advancedSection.innerHTML = `
                <div class="grid grid-cols-2 gap-3">
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Pagina</span><input data-receipt-inspector-field="page" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="1" max="8" value="${layout.page ?? 1}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-receipt-inspector-field="enabled" data-target-id="${target.id}" data-target-kind="${target.kind}" class="${inputClass}">${boolOptions(layout.visible !== false)}</select></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-receipt-inspector-field="x" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-4000" max="4000" value="${layout.x ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-receipt-inspector-field="y" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-5000" max="5000" value="${layout.y ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-receipt-inspector-field="angle" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="-360" max="360" value="${layout.angle ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ancho</span><input data-receipt-inspector-field="w" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="16" max="4000" value="${layout.w ?? 0}" class="${inputClass}"></label>
                    <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alto</span><input data-receipt-inspector-field="h" data-target-id="${target.id}" data-target-kind="${target.kind}" type="number" min="1" max="5000" value="${layout.h ?? 0}" class="${inputClass}"></label>
                    ${showBgColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__pmContractsSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-receipt-inspector-field="bgColor" data-target-id="${target.id}" data-target-kind="${target.kind}" type="color" value="${target.bgColor || '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
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
    }
    panel.classList.remove('hidden');
    requestAnimationFrame(__pmContractsPositionReceiptInspector);
}

function __pmContractsCloseReceiptInspector() {
    __pmContractsReceiptInspectorState = null;
    const panel = document.getElementById('pmc-receipt-inspector');
    if (panel) panel.classList.add('hidden');
    const backdrop = document.getElementById('pmc-receipt-inspector-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
}

function __pmContractsOpenReceiptInspector(state) {
    if (!state || __pmContractsReceiptEditLocked || !__pmContractsIsAdminProfile()) return;
    const safeState = { ...state };
    if (safeState.kind === 'resource') {
        safeState.page = __pmContractsClampStyleNumber(safeState.page, 1, 8, 1);
    }
    __pmContractsReceiptInspectorState = safeState;
    if (state.kind === 'base') __pmContractsPdfResourceSelectedId = `base:${state.instanceKey || state.key}`;
    if (state.kind === 'resource') __pmContractsPdfResourceSelectedId = state.id;
    __pmContractsHighlightSelectedResource();
    __pmContractsRenderReceiptInspector();
}

function __pmContractsHandleReceiptInspectorInput(event) {
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
        if (['x', 'y', 'scalePct', 'visible'].includes(field)) {
            __pmContractsCommitBaseLayoutField(`base:${id}`, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
        } else if (field.startsWith('signLabel:')) {
            __pmContractsCommitPdfSignLabelField(field.slice('signLabel:'.length), rawValue, {
                refreshPreview: !isContinuousInput,
                skipEditorUiRefresh: isContinuousInput
            });
        } else {
            __pmContractsCommitPdfContentField(field, rawValue, {
                refreshPreview: !isContinuousInput,
                skipEditorUiRefresh: isContinuousInput
            });
        }
    }
    if (kind === 'resource') __pmContractsCommitResourceInspectorField(id, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
    if (isContinuousInput) {
        requestAnimationFrame(__pmContractsPositionReceiptInspector);
        return;
    }
    __pmContractsRenderReceiptInspector();
}

function __pmContractsResetReceiptInspectorTarget(kind, id) {
    const safeKind = String(kind || '');
    const safeId = String(id || '');
    if (!safeKind || !safeId) return;
    if (safeKind === 'base') {
        __pmContractsCommitBaseLayoutField(`base:${safeId}`, 'x', 0);
        __pmContractsCommitBaseLayoutField(`base:${safeId}`, 'y', 0);
        __pmContractsCommitBaseLayoutField(`base:${safeId}`, 'scalePct', 100);
        __pmContractsCommitBaseLayoutField(`base:${safeId}`, 'visible', true);
        return;
    }
    if (safeKind !== 'resource') return;
    const resources = __pmContractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === safeId);
    if (idx < 0) return;
    const current = resources[idx];
    const fallback = __pmContractsNormalizePdfResources([{ id: current.id, type: current.type, page: current.page }])[0];
    resources[idx] = {
        ...current,
        ...fallback,
        id: current.id,
        type: current.type,
        page: current.page
    };
    __pmContractsCommitPdfResources(resources);
}

function __pmContractsHandleReceiptInspectorClick(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-receipt-inspector-action],[data-receipt-inspector-toggle]') : null;
    if (!button) return;
    const action = String(button.getAttribute('data-receipt-inspector-action') || '');
    const toggleField = String(button.getAttribute('data-receipt-inspector-toggle') || '');
    const kind = String(button.getAttribute('data-target-kind') || '');
    const id = String(button.getAttribute('data-target-id') || '');
    if (action === 'close') {
        __pmContractsCloseReceiptInspector();
        return;
    }
    if (toggleField && kind === 'resource' && id) {
        const currentTarget = __pmContractsGetReceiptInspectorTarget();
        __pmContractsCommitResourceInspectorField(id, toggleField, !currentTarget?.[toggleField]);
        __pmContractsRenderReceiptInspector();
        return;
    }
    if (action === 'delete' && __pmContractsReceiptInspectorState?.kind === 'resource') {
        __pmContractsRemovePdfResource(__pmContractsReceiptInspectorState.id);
        return;
    }
    if (action === 'reset' && kind && id) {
        __pmContractsResetReceiptInspectorTarget(kind, id);
        __pmContractsRenderReceiptInspector();
        return;
    }
    __pmContractsCloseReceiptInspector();
}

function __pmContractsEnsureReceiptEditingChrome(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const container = document.getElementById('receipt-preview-container');
    const view = document.getElementById('view-receipt');
    if (!container) return;
    if (view && window.getComputedStyle(view).position === 'static') view.style.position = 'relative';
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (!document.getElementById('pmc-receipt-edit-button-bar')) {
        const buttonBar = document.createElement('div');
        buttonBar.id = 'pmc-receipt-edit-button-bar';
        buttonBar.className = 'hidden absolute right-4 top-4 z-[96] flex items-center gap-2';
        buttonBar.innerHTML = `
            <button type="button" id="pmc-receipt-add-button" class="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-700 shadow-lg transition hover:border-brand-red hover:text-brand-red">
                <i class="fa-solid fa-plus"></i>
                <span>Elemento</span>
            </button>
            <button type="button" id="pmc-receipt-edit-button" class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition"></button>
        `;
        buttonBar.addEventListener('click', (event) => {
            const addButton = event.target instanceof Element ? event.target.closest('#pmc-receipt-add-button') : null;
            if (addButton) {
                if (__pmContractsReceiptEditLocked || !__pmContractsIsAdminProfile()) return;
                window.openModal('pdf-resource-modal');
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('#pmc-receipt-edit-button') : null;
            if (!button) return;
            __pmContractsSetReceiptEditLocked(!__pmContractsReceiptEditLocked);
        });
        (view || container).appendChild(buttonBar);
    }
    if (!document.getElementById('pmc-receipt-inspector-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'pmc-receipt-inspector-backdrop';
        backdrop.className = 'hidden absolute inset-0 z-[96] bg-gray-950/45 backdrop-blur-[1px]';
        container.appendChild(backdrop);
    }
    if (!document.getElementById('pmc-receipt-inspector')) {
        const panel = document.createElement('div');
        panel.id = 'pmc-receipt-inspector';
        panel.className = 'hidden absolute inset-0 z-[97] flex items-center justify-center p-4';
        panel.innerHTML = `
            <div data-receipt-inspector-card class="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div class="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Edicion</p>
                        <h4 data-receipt-inspector-title class="text-sm font-black text-gray-800">Elemento</h4>
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" data-receipt-inspector-action="reset" class="rounded-full border border-gray-200 px-3 py-1 text-[10px] font-black uppercase text-gray-500 transition hover:border-brand-red hover:text-brand-red">Restablecer</button>
                        <button type="button" data-receipt-inspector-action="close" class="h-8 w-8 rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="custom-scroll space-y-3 overflow-y-auto px-4 py-4 text-xs text-gray-600" style="max-height:calc(100vh - 10rem);">
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
        panel.addEventListener('input', __pmContractsHandleReceiptInspectorInput);
        panel.addEventListener('change', __pmContractsHandleReceiptInspectorInput);
        panel.addEventListener('click', __pmContractsHandleReceiptInspectorClick);
        container.appendChild(panel);
    }
    if (container.dataset.pmContractsReceiptInspectorBound !== '1') {
        container.dataset.pmContractsReceiptInspectorBound = '1';
        container.addEventListener('scroll', () => requestAnimationFrame(__pmContractsPositionReceiptInspector), { passive: true });
        window.addEventListener('resize', () => requestAnimationFrame(__pmContractsPositionReceiptInspector));
        document.addEventListener('dblclick', (event) => {
            if (!__pmContractsIsAdminProfile() || __pmContractsReceiptEditLocked) return;
            if (document.getElementById('view-receipt')?.classList.contains('hidden')) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            if (target.closest('#pmc-receipt-inspector')) return;
            const resourceNode = target.closest('#receipt-preview-box .pmc-pdf-resource[data-res-id]');
            if (resourceNode) {
                __pmContractsOpenReceiptInspector({
                    kind: 'resource',
                    id: String(resourceNode.getAttribute('data-res-id') || ''),
                    page: parseInt(resourceNode.getAttribute('data-res-page') || '1', 10)
                });
                return;
            }
            const baseNode = target.closest('#receipt-preview-box [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            if (!__pmContractsGetPdfBaseBlockMeta(baseKey)) return;
            __pmContractsOpenReceiptInspector({ kind: 'base', key: baseKey, instanceKey: String(baseNode.dataset.baseInstance || baseKey).trim() });
        });
    }
    __pmContractsSyncReceiptEditMode();
    if (!skipEditorUiRefresh) __pmContractsRenderReceiptInspector();
}

function __pmContractsSyncPdfStyleValueLabels(style) {
    const cfg = __pmContractsNormalizePdfStyle(style);
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

function __pmContractsWritePdfStyleControls(style) {
    const cfg = __pmContractsNormalizePdfStyle(style);
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
    const signs = __pmContractsNormalizePdfSignLabels(cfg.signLabels);
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
    __pmContractsSyncPdfStyleValueLabels(cfg);
}

function __pmContractsReadPdfStyleControls() {
    const current = __pmContractsGetPdfStyleConfig();
    return __pmContractsNormalizePdfStyle({
        ...current,
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __PM_CONTRACTS_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        signLinePx: document.getElementById('pdf-style-sign-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __PM_CONTRACTS_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
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
        footerPx: Math.max(8, (parseInt(document.getElementById('pdf-style-meta-size')?.value || __PM_CONTRACTS_PDF_STYLE_DEFAULTS.metaPx, 10) - 3)),
        headerAlign: document.getElementById('pdf-style-align-header')?.value,
        metaAlign: document.getElementById('pdf-style-align-meta')?.value,
        tableAlign: document.getElementById('pdf-style-align-table')?.value,
        quickAlign: document.getElementById('pdf-style-align-quick')?.value,
        conditionsAlign: document.getElementById('pdf-style-align-conditions')?.value,
        signAlign: document.getElementById('pdf-style-align-sign')?.value,
        summaryAlign: document.getElementById('pdf-style-align-summary')?.value,
        footerAlign: document.getElementById('pdf-style-align-footer')?.value,
        baseLayouts: current.baseLayouts,
        signLabels: {
            ...(current.signLabels || __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS),
            receiptLeftName: document.getElementById('pdf-style-sign-receipt-left-name')?.value,
            receiptLeftRole: document.getElementById('pdf-style-sign-receipt-left-role')?.value,
            receiptRightName: document.getElementById('pdf-style-sign-receipt-right-name')?.value,
            receiptRightRole: document.getElementById('pdf-style-sign-receipt-right-role')?.value,
            liquidatedLeftName: document.getElementById('pdf-style-sign-liquid-left-name')?.value,
            liquidatedLeftRole: document.getElementById('pdf-style-sign-liquid-left-role')?.value,
            liquidatedRightName: document.getElementById('pdf-style-sign-liquid-right-name')?.value,
            liquidatedRightRole: document.getElementById('pdf-style-sign-liquid-right-role')?.value,
            clientName: __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientName,
            clientRole: __PM_CONTRACTS_PDF_SIGN_LABELS_DEFAULTS.clientRole
        },
        resources: current.resources
    });
}

function __pmContractsSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __pmContractsPdfStyleState = __pmContractsNormalizePdfStyle(style);
    __pmContractsSaveEditorDraft(__pmContractsPdfStyleState);
    if (opts.applyToDom !== false) __pmContractsApplyPdfStyleToLivePreview(opts);
}

function __pmContractsResolveCurrentUserRole() {
    const candidates = [
        window.currentUserProfile?.role,
        window.currentUserProfile?.record?.role,
        window.currentUserProfile?.profile?.role
    ];
    for (const candidate of candidates) {
        const safe = String(candidate || '').trim().toLowerCase();
        if (safe) return safe;
    }
    return '';
}

function __pmContractsIsAdminProfile() {
    return __pmContractsResolveCurrentUserRole() === 'admin';
}

async function __pmContractsLoadCurrentUserProfile(user) {
    const pbClient = window.globalPocketBase || window.pbClient || window.tenantPocketBase;
    const fallback = user && typeof user === 'object' ? user : {};
    if (!pbClient) return { ...fallback };
    const normalizeRole = (value) => {
        const role = String(value || '').trim().toLowerCase();
        if (!role) return '';
        if (role === 'administrador' || role === 'superadmin' || role === 'super_admin') return 'admin';
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
        String(fallback?.username || '').trim(),
        String(fallback?.record?.username || '').trim(),
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
    if (!appUser) appUser = await lookupByField('app_users', 'username', usernameCandidates);
    const merged = {
        ...(appUser || {}),
        ...fallback
    };
    const role = normalizeRole(
        appUser?.role
        || fallback?.role
        || fallback?.record?.role
    );
    if (role) {
        merged.role = role;
        localStorage.setItem('hub_user_cache_role', role);
    }
    if (!merged.username) merged.username = appUser?.username || appUser?.login_username || fallback?.username || fallback?.email?.split('@')[0] || '';
    return merged;
}

function __pmContractsResolvePdfOverlayConfigPayload(record = {}) {
    const rawRecord = record && typeof record === 'object' ? record : {};
    if (rawRecord.config_json && typeof rawRecord.config_json === 'object') return rawRecord.config_json;
    const elements = rawRecord.elements && typeof rawRecord.elements === 'object' ? rawRecord.elements : {};
    if (elements.config_json && typeof elements.config_json === 'object') return elements.config_json;
    if (elements.profiles && typeof elements.profiles === 'object') {
        return {
            tenant: rawRecord.tenant || elements.tenant || __PM_CONTRACTS_PDF_STYLE_TENANT,
            version: Math.max(2, parseInt(elements.version, 10) || 2),
            updated_at: elements.updated_at || new Date().toISOString(),
            profiles: elements.profiles
        };
    }
    return {};
}

function __pmContractsBuildPdfOverlayElementsPayload(configJson) {
    const resolved = __pmContractsResolvePdfOverlayConfigPayload({ config_json: configJson });
    const profiles = __pmContractsNormalizePdfStyleProfiles(resolved);
    const objects = [];
    Object.entries(profiles).forEach(([profileKey, style]) => {
        const safeStyle = __pmContractsNormalizePdfStyle(style);
        const safeResources = __pmContractsNormalizePdfResources(safeStyle.resources);
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
                fontFamily: __PM_CONTRACTS_PDF_STYLE_FONT_MAP[resource.fontFamilyKey || safeStyle.fontFamilyKey] || __PM_CONTRACTS_PDF_STYLE_FONT_MAP.segoe,
                scaleX: 1,
                scaleY: 1,
                page: Number(resource.page || 1),
                enabled: resource.enabled !== false
            });
        });
    });
    return {
        tenant: resolved.tenant || __PM_CONTRACTS_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(resolved.version, 10) || 2),
        updated_at: resolved.updated_at || new Date().toISOString(),
        profiles,
        config_json: resolved,
        objects
    };
}

async function __pmContractsLoadModernPdfStyleRecord(generatorType) {
    const pbClient = window.tenantPocketBase || window.globalPocketBase;
    if (!pbClient) return null;
    const overlayDocumentType = __pmContractsOverlayDocumentType(generatorType);
    try {
        const { data, error } = await pbClient
            .from(__PM_CONTRACTS_PDF_OVERLAYS_COLLECTION)
            .select('id,config_json,elements')
            .eq('tenant', __PM_CONTRACTS_PDF_STYLE_TENANT)
            .eq('document_type', overlayDocumentType)
            .maybeSingle();
        if (error || !data) return null;
        return {
            source: 'pdf_overlays',
            id: String(data.id || ''),
            config: __pmContractsResolvePdfOverlayConfigPayload(data),
            raw: data.config_json || data.elements || {}
        };
    } catch (_) {
        return null;
    }
}

async function __pmContractsUpsertModernPdfStyleRecord(generatorType, configJson) {
    const pbClient = window.tenantPocketBase || window.globalPocketBase;
    if (!pbClient) return { id: '', config: configJson || {} };
    const overlayDocumentType = __pmContractsOverlayDocumentType(generatorType);
    const safeConfig = __pmContractsResolvePdfOverlayConfigPayload({ config_json: configJson || {} });
    const payload = {
        tenant: __PM_CONTRACTS_PDF_STYLE_TENANT,
        document_type: overlayDocumentType,
        config_json: safeConfig,
        elements: __pmContractsBuildPdfOverlayElementsPayload(safeConfig)
    };
    const { data: existingModern, error: modernLookupError } = await pbClient
        .from(__PM_CONTRACTS_PDF_OVERLAYS_COLLECTION)
        .select('id')
        .eq('tenant', __PM_CONTRACTS_PDF_STYLE_TENANT)
        .eq('document_type', overlayDocumentType)
        .maybeSingle();
    if (modernLookupError) throw modernLookupError;
    if (existingModern?.id) {
        const { error: updError } = await pbClient.from(__PM_CONTRACTS_PDF_OVERLAYS_COLLECTION).update(payload).eq('id', existingModern.id);
        if (updError) throw updError;
        return { id: String(existingModern.id), config: payload.config_json };
    }
    const { data: inserted, error: insError } = await pbClient
        .from(__PM_CONTRACTS_PDF_OVERLAYS_COLLECTION)
        .insert(payload)
        .select('id')
        .single();
    if (insError) throw insError;
    return { id: String(inserted?.id || ''), config: payload.config_json };
}

async function __pmContractsLoadSharedPdfStyleConfig(profile = 'receipt') {
    if (!window.tenantPocketBase && !window.globalPocketBase) return;
    const profileKey = __pmContractsNormalizeProfileKey(profile);
    try {
        const generatorType = profileKey === 'contract' ? 'contracts' : 'receipts';
        const record = await __pmContractsLoadModernPdfStyleRecord(generatorType);

        if (!record) {
            __pmContractsPdfStyleActiveProfile = profileKey;
            __pmContractsPdfStyleConfigRecordId = '';
            __pmContractsPdfStyleConfigStore = '';
            __pmContractsPdfStyleRawPayload = null;
            __pmContractsSharedTemplateTextLayouts = {};
            __pmContractsSetPdfStyleConfig(__PM_CONTRACTS_PDF_STYLE_DEFAULTS, { applyToDom: false });
            return;
        }

        __pmContractsPdfStyleConfigRecordId = record.id;
        __pmContractsPdfStyleConfigStore = record.source;
        __pmContractsPdfStyleRawPayload = record.raw || record.config || {};
        __pmContractsSharedTemplateTextLayouts = __pmContractsPdfStyleRawPayload?.templateTextLayouts && typeof __pmContractsPdfStyleRawPayload.templateTextLayouts === 'object'
            ? __pmContractsPdfStyleRawPayload.templateTextLayouts
            : {};
        const resolved = __pmContractsExtractPdfStyleProfile(record.config || __PM_CONTRACTS_PDF_STYLE_DEFAULTS, profileKey);
        __pmContractsSetPdfStyleConfig(resolved || __PM_CONTRACTS_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __pmContractsPdfStyleActiveProfile = profileKey;
    } catch (e) {
        console.warn('No se pudo cargar estilo PDF compartido (Maestro PM contracts):', e);
    }
}

async function __pmContractsPersistSharedPdfStyleConfig(style) {
    if (!__pmContractsIsAdminProfile()) return;
    const pbClient = window.tenantPocketBase || window.globalPocketBase;
    if (!pbClient) return;
    const profileKey = __pmContractsNormalizeProfileKey(__pmContractsPdfStyleActiveProfile);
    const generatorType = profileKey === 'contract' ? 'contracts' : 'receipts';
    const safeStyle = __pmContractsNormalizePdfStyle(style || __pmContractsPdfStyleState || {});
    const existingPayload = __pmContractsPdfStyleRawPayload && typeof __pmContractsPdfStyleRawPayload === 'object'
        ? __pmContractsPdfStyleRawPayload
        : {};
    const configJson = __pmContractsBuildPdfStyleConfigPayload(existingPayload, safeStyle, profileKey);
    configJson.templateTextLayouts = __pmContractsSharedTemplateTextLayouts && typeof __pmContractsSharedTemplateTextLayouts === 'object'
        ? __pmContractsSharedTemplateTextLayouts
        : {};
    try {
        const saved = await __pmContractsUpsertModernPdfStyleRecord(generatorType, configJson);
        __pmContractsPdfStyleConfigRecordId = saved.id;
        __pmContractsPdfStyleConfigStore = 'pdf_overlays';
        __pmContractsPdfStyleRawPayload = configJson;
    } catch (e) {
        console.warn('No se pudo guardar estilo PDF compartido en pdf_overlays (PM contracts):', e);
    }
}

function __pmContractsScheduleSharedPdfStyleSync(style) {
    if (!__pmContractsIsAdminProfile()) return;
    if (__pmContractsPdfStyleSyncTimer) clearTimeout(__pmContractsPdfStyleSyncTimer);
    __pmContractsPdfStyleSyncTimer = setTimeout(() => {
        __pmContractsPersistSharedPdfStyleConfig(style || __pmContractsPdfStyleState);
    }, 450);
}

function __pmContractsHandlePdfStyleControlChange() {
    if (!__pmContractsIsAdminProfile()) return;
    const next = __pmContractsReadPdfStyleControls();
    __pmContractsSetPdfStyleConfig(next, { applyToDom: true });
    __pmContractsSyncPdfStyleValueLabels(next);
    __pmContractsScheduleSharedPdfStyleSync(next);
}

function __pmContractsApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    const body = document.getElementById('pdf-style-editor-body');
    const toggleBtn = document.getElementById('btn-pdf-style-toggle');
    const pinBtn = document.getElementById('btn-pdf-style-pin');
    if (!editorWrap) return;

    if (body) body.classList.toggle('hidden', !!__pmContractsPdfStyleUiState.collapsed);
    if (toggleBtn) toggleBtn.textContent = __pmContractsPdfStyleUiState.collapsed ? 'Mostrar' : 'Ocultar';
    if (pinBtn) pinBtn.textContent = __pmContractsPdfStyleUiState.pinned ? 'Desfijar' : 'Fijar';

    if (__pmContractsPdfStyleUiState.pinned) {
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

function __pmContractsTogglePdfStylePanel() {
    __pmContractsPdfStyleUiState = { ...__pmContractsPdfStyleUiState, collapsed: !__pmContractsPdfStyleUiState.collapsed };
    __pmContractsSavePdfStyleUiState();
    __pmContractsApplyPdfStyleEditorUiState();
}

function __pmContractsTogglePdfStylePin() {
    __pmContractsPdfStyleUiState = { ...__pmContractsPdfStyleUiState, pinned: !__pmContractsPdfStyleUiState.pinned };
    __pmContractsSavePdfStyleUiState();
    __pmContractsApplyPdfStyleEditorUiState();
}

function __pmContractsInitPdfResourceModalDrag() {
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

    const clampOffsets = (nextX, nextY) => {
        const rect = card.getBoundingClientRect();
        const maxX = Math.max(24, (window.innerWidth - rect.width) / 2);
        const maxY = Math.max(24, (window.innerHeight - rect.height) / 2);
        return {
            x: Math.max(-maxX, Math.min(maxX, nextX)),
            y: Math.max(-maxY, Math.min(maxY, nextY))
        };
    };

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
function __pmContractsInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__pmContractsPdfStyleState) __pmContractsPdfStyleState = __pmContractsLoadPdfStyleState();
    __pmContractsPdfStyleUiState = __pmContractsLoadPdfStyleUiState();
    __pmContractsWritePdfStyleControls(__pmContractsGetPdfStyleConfig());
    __pmContractsApplyPdfStyleEditorUiState();
    if (!__pmContractsIsAdminProfile()) {
        editorWrap.classList.add('hidden');
        __pmContractsBindPdfResourceDrag();
        __pmContractsInitPdfResourceModalDrag();
        return;
    }
    if (editorWrap.dataset.bound !== '1') {
        editorWrap.querySelectorAll('.pdf-style-control').forEach((control) => {
            control.addEventListener('input', __pmContractsHandlePdfStyleControlChange);
            control.addEventListener('change', __pmContractsHandlePdfStyleControlChange);
        });
        document.getElementById('btn-reset-pdf-style')?.addEventListener('click', () => {
            const reset = __pmContractsNormalizePdfStyle(__PM_CONTRACTS_PDF_STYLE_DEFAULTS);
            __pmContractsSetPdfStyleConfig(reset, { applyToDom: true });
            __pmContractsWritePdfStyleControls(reset);
            __pmContractsScheduleSharedPdfStyleSync(reset);
            __pmContractsRenderPdfResourcesEditorList();
            __pmContractsRefreshPreviewFromStyleState();
            __pmContractsEnsureMarginGuideController()?.refresh();
        });
        document.getElementById('btn-pdf-style-toggle')?.addEventListener('click', __pmContractsTogglePdfStylePanel);
        document.getElementById('btn-pdf-style-pin')?.addEventListener('click', __pmContractsTogglePdfStylePin);
        editorWrap.dataset.bound = '1';
    }
    __pmContractsBindPdfResourceEditor();
    __pmContractsBindPdfResourceDrag();
    __pmContractsInitPdfResourceModalDrag();
    editorWrap.classList.add('hidden');
    __pmContractsEnsureReceiptEditingChrome();
    __pmContractsEnsureMarginGuideController()?.refresh();
}

function __pmContractsRefreshPreviewFromStyleState(options = {}) {
    if (!selectedOrder) return;
    window.updateReceiptPreview(options);
}

function __pmContractsCommitPdfResources(resources, options = {}) {
    const cfg = __pmContractsGetPdfStyleConfig();
    const next = __pmContractsNormalizePdfStyle({ ...cfg, resources: __pmContractsNormalizePdfResources(resources) });
    // Permite actualizar vista sin reconstruir inspector/lista en cada tecla.
    const skipEditorUiRefresh = options && options.skipEditorUiRefresh === true;
    __pmContractsSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh });
    __pmContractsScheduleSharedPdfStyleSync(next);
    if (options.refreshPreview !== false) __pmContractsRefreshPreviewFromStyleState({ skipEditorUiRefresh });
    if (!skipEditorUiRefresh) __pmContractsRenderPdfResourcesEditorList();
}

function __pmContractsGetPdfResourcesFromState() {
    return __pmContractsNormalizePdfResources(__pmContractsGetPdfStyleConfig().resources);
}

function __pmContractsRemovePdfResource(resourceId) {
    const id = String(resourceId || '').trim();
    if (!id) return;
    const nextResources = __pmContractsGetPdfResourcesFromState().filter((resource) => resource.id !== id);
    if (__pmContractsPdfResourceSelectedId === id) {
        __pmContractsPdfResourceSelectedId = __PM_CONTRACTS_PDF_BASE_BLOCKS[0]?.id || nextResources[0]?.id || '';
    }
    if (__pmContractsReceiptInspectorState?.kind === 'resource' && __pmContractsReceiptInspectorState.id === id) {
        __pmContractsCloseReceiptInspector();
    }
    __pmContractsCommitPdfResources(nextResources);
}

function __pmContractsHighlightSelectedResource() {
    document.querySelectorAll('#receipt-preview-box .pmc-pdf-edit-selected').forEach((node) => {
        node.classList.remove('pmc-pdf-edit-selected');
    });
    if (!__pmContractsIsAdminProfile()) return;
    const selected = String(__pmContractsPdfResourceSelectedId || '');
    if (!selected) return;
    if (selected.startsWith('base:')) {
        const key = selected.replace(/^base:/, '').split('__')[0].trim();
        if (!key) return;
        document.querySelectorAll(`#receipt-preview-box [data-base-resource="${key}"]`).forEach((node) => node.classList.add('pmc-pdf-edit-selected'));
        return;
    }
    document.querySelectorAll('#receipt-preview-box .pmc-pdf-resource[data-res-id]').forEach((node) => {
        if (String(node.getAttribute('data-res-id') || '') === selected) node.classList.add('pmc-pdf-edit-selected');
    });
}

function __pmContractsAddPdfResource(type) {
    const normalizedType = String(type || '').toLowerCase() === 'sign-line' ? 'sign' : String(type || '').toLowerCase();
    const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
    const isSign = safeType === 'sign' || safeType === 'sign-block';
    const defaultW = safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : (isSign ? 220 : 260));
    const defaultH = safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : (safeType === 'sign' ? 24 : (safeType === 'sign-block' ? 42 : 14)));
    const defaultColor = safeType === 'logo'
        ? 'transparent'
        : (isSign ? '#111827' : (safeType === 'bar' ? '#d32f2f' : '#ffffff'));
    const resources = __pmContractsGetPdfResourcesFromState();
    const newId = `pmc_res_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    resources.push({
        id: newId,
        type: safeType,
        enabled: true,
        page: 1,
        x: 80,
        y: 120,
        w: defaultW,
        h: defaultH,
        bgColor: defaultColor,
        text: safeType === 'title' ? 'Nuevo Título' : (safeType === 'text' ? 'Agrega texto aquí' : ''),
        fontSize: safeType === 'title' ? 24 : 14,
        align: 'left',
        color: '#111827',
        angle: 0,
        signTitle: safeType === 'sign-block' ? 'NOMBRE FIRMANTE' : '',
        signRole: safeType === 'sign-block' ? 'PUESTO / ROL' : ''
    });
    __pmContractsPdfResourceSelectedId = resources[resources.length - 1].id;
    __pmContractsCommitPdfResources(resources);
    return newId;
}

function __pmContractsRenderBaseBlocksEditorList(styleCfg) {
    const selectedId = String(__pmContractsPdfResourceSelectedId || '');
    const baseLayouts = __pmContractsNormalizePdfBaseLayouts(styleCfg.baseLayouts);
    return __PM_CONTRACTS_PDF_BASE_BLOCKS.map((block) => {
        const layout = baseLayouts[block.key] || __pmContractsNormalizePdfBaseLayout();
        const selectedClass = (selectedId === block.id || selectedId === `base:${block.key}` || selectedId.startsWith(`base:${block.key}__`))
            ? 'border-brand-red'
            : 'border-gray-700';
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-900/70 space-y-1">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-base-action="select" data-base-id="${block.id}" class="text-[10px] font-bold uppercase text-gray-100">${block.label}</button>
                    <span class="text-[9px] uppercase text-gray-400">Base</span>
                </div>
                <div class="grid grid-cols-4 gap-1">
                    <label class="text-[9px] text-gray-400">X
                        <input data-base-id="${block.id}" data-base-layout-field="x" type="number" value="${layout.x}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-base-id="${block.id}" data-base-layout-field="y" type="number" value="${layout.y}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Escala
                        <input data-base-id="${block.id}" data-base-layout-field="scalePct" type="number" min="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__PM_CONTRACTS_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${layout.scalePct}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Visible
                        <select data-base-id="${block.id}" data-base-layout-field="visible" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                            <option value="true" ${!layout.hidden ? 'selected' : ''}>Si</option>
                            <option value="false" ${layout.hidden ? 'selected' : ''}>No</option>
                        </select>
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

function __pmContractsRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list) return;
    if (!__pmContractsIsAdminProfile()) {
        list.innerHTML = '';
        return;
    }
    const cfg = __pmContractsGetPdfStyleConfig();
    const resources = __pmContractsGetPdfResourcesFromState();
    const selectedId = String(__pmContractsPdfResourceSelectedId || '');
    if (!selectedId) {
        __pmContractsPdfResourceSelectedId = __PM_CONTRACTS_PDF_BASE_BLOCKS[0]?.id || resources[0]?.id || '';
    } else if (!selectedId.startsWith('base:') && resources.length && !resources.some((resource) => resource.id === selectedId)) {
        __pmContractsPdfResourceSelectedId = resources[0].id;
    }
    const typeLabel = (type) => {
        const labels = {
            'bar': 'Barra',
            'logo': 'Logo',
            'title': 'Título',
            'text': 'Texto',
            'sign': 'Línea Firma',
            'sign-line': 'Línea Firma',
            'sign-block': 'Firma Grupo'
        };
        return labels[type] || 'Elem';
    };
    const rows = resources.map((resource) => {
        const selectedClass = resource.id === __pmContractsPdfResourceSelectedId ? 'border-brand-red' : 'border-gray-600';
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const hideBgColor = resource.type === 'logo' || isSignBlock ? 'hidden' : '';
        const showTextColor = isTextLike || isSignBlock ? '' : 'hidden';

        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__pmContractsSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__pmContractsSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${typeLabel(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__pmContractsSafeHtml(resource.id)}" class="text-red-300 hover:text-red-200 text-xs" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>

                ${isTextLike ? `
                <div class="mt-1 space-y-1">
                    <textarea data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="text" rows="2" class="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-xs text-white" placeholder="Texto o variables...">${__pmContractsSafeHtml(resource.text)}</textarea>
                    <div class="flex gap-1">
                        <label class="text-[9px] text-gray-400 flex-1">Tamaño
                            <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        </label>
                        <label class="text-[9px] text-gray-400 flex-1">Alineación
                            <select data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="align" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                                <option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izq</option>
                                <option value="center" ${resource.align === 'center' ? 'selected' : ''}>Cen</option>
                                <option value="right" ${resource.align === 'right' ? 'selected' : ''}>Der</option>
                                <option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Jus</option>
                            </select>
                        </label>
                    </div>
                </div>
                ` : ''}

                ${isSignBlock ? `
                <div class="mt-1 space-y-1">
                    <label class="text-[9px] text-gray-400 block">Nombre
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="signTitle" type="text" value="${__pmContractsSafeHtml(resource.signTitle)}" placeholder="{{CLIENTE}}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                    <label class="text-[9px] text-gray-400 block">Puesto o Rol
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="signRole" type="text" value="${__pmContractsSafeHtml(resource.signRole)}" placeholder="Puesto" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                </div>
                ` : ''}

                <div class="grid grid-cols-3 gap-1 mt-1">
                    <label class="text-[9px] text-gray-400">Pág
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="page" type="number" min="1" max="8" value="${resource.page}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">X
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="x" type="number" value="${resource.x}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="y" type="number" value="${resource.y}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Ancho
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="w" type="number" min="16" value="${resource.w}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Alto
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="h" type="number" min="1" value="${resource.h}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>

                <div class="flex gap-2 mt-1">
                    <label class="text-[9px] text-gray-400 flex-1 ${hideBgColor}">Color Fondo
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${resource.bgColor}" class="w-full h-5 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400 flex-1 ${showTextColor}">Color Texto
                        <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="color" type="color" value="${resource.color}" class="w-full h-5 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>

                <label class="text-[9px] text-gray-400 mt-1 flex items-center gap-1 cursor-pointer">
                    <input data-res-id="${__pmContractsSafeHtml(resource.id)}" data-res-field="enabled" type="checkbox" ${resource.enabled ? 'checked' : ''} class="w-3 h-3 text-brand-red bg-gray-900 border-gray-700 rounded focus:ring-brand-red">
                    <span>Habilitado</span>
                </label>
            </div>
        `;
    }).join('');
    const baseBlocksHtml = __pmContractsRenderBaseBlocksEditorList(cfg);
    const customEmpty = !resources.length ? '<p class="text-[10px] text-gray-400">Sin recursos adicionales. Usa el botón + Añadir arriba.</p>' : '';
    list.innerHTML = `
        <div class="space-y-2">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Bloques base del recibo</p>
            ${baseBlocksHtml}
        </div>
        <div class="space-y-2 pt-2 border-t border-gray-700/80">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Recursos personalizados</p>
            ${customEmpty}
            ${rows}
        </div>
    `;
    __pmContractsHighlightSelectedResource();
}

function __pmContractsHandleResourceListEvent(event) {
    const trigger = event.target.closest('[data-res-action], [data-res-field], [data-base-action], [data-base-layout-field]');
    if (!trigger || !__pmContractsIsAdminProfile()) return;
    const isContinuousInput = event.type === 'input'
        && (
            trigger instanceof HTMLTextAreaElement
            || (trigger instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(trigger.type || '').toLowerCase()))
        );
    const baseId = String(trigger.dataset.baseId || '');
    const baseAction = String(trigger.dataset.baseAction || '');
    const baseLayoutField = String(trigger.dataset.baseLayoutField || '');

    if (baseAction === 'select' && baseId.startsWith('base:')) {
        __pmContractsPdfResourceSelectedId = baseId;
        __pmContractsRenderPdfResourcesEditorList();
        return;
    }
    if (baseLayoutField && baseId.startsWith('base:')) {
        __pmContractsPdfResourceSelectedId = baseId;
        const rawValue = trigger.type === 'checkbox'
            ? !!trigger.checked
            : (String(trigger.value) === 'true' ? true : (String(trigger.value) === 'false' ? false : trigger.value));
        __pmContractsCommitBaseLayoutField(baseId, baseLayoutField, rawValue, { skipEditorUiRefresh: isContinuousInput });
        if (!isContinuousInput) __pmContractsRenderPdfResourcesEditorList();
        __pmContractsHighlightSelectedResource();
        return;
    }

    const id = String(trigger.dataset.resId || '');
    const resources = __pmContractsGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === id);
    if (idx < 0) return;

    if (trigger.dataset.resAction === 'remove') {
        __pmContractsRemovePdfResource(id);
        return;
    }
    if (trigger.dataset.resAction === 'select') {
        __pmContractsPdfResourceSelectedId = id;
        __pmContractsRenderPdfResourcesEditorList();
        return;
    }

    const field = String(trigger.dataset.resField || '');
    if (!field) return;

    let nextValue;
    if (trigger.type === 'checkbox') nextValue = trigger.checked;
    else nextValue = trigger.value;

    if (['page', 'x', 'y', 'w', 'h', 'fontSize'].includes(field)) nextValue = parseInt(nextValue, 10);
    if (field === 'bgColor' || field === 'color') nextValue = __pmContractsNormalizeHexColor(nextValue, resources[idx][field]);

    resources[idx] = { ...resources[idx], [field]: nextValue };
    __pmContractsPdfResourceSelectedId = id;
    __pmContractsCommitPdfResources(resources, {
        refreshPreview: __pmContractsShouldRefreshResourcePreviewField(field),
        skipEditorUiRefresh: isContinuousInput
    });
}

function __pmContractsBindPdfResourceEditor() {
    if (!__pmContractsIsAdminProfile()) return;
    const list = document.getElementById('pdf-style-resources-list');
    if (list && list.dataset.bound !== '1') {
        list.addEventListener('input', __pmContractsHandleResourceListEvent);
        list.addEventListener('change', __pmContractsHandleResourceListEvent);
        list.addEventListener('click', __pmContractsHandleResourceListEvent);
        list.dataset.bound = '1';
    }
    document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => { __pmContractsAddPdfResource('bar'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => { __pmContractsAddPdfResource('logo'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-title')?.addEventListener('click', () => { __pmContractsAddPdfResource('title'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-text')?.addEventListener('click', () => { __pmContractsAddPdfResource('text'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-sign-line')?.addEventListener('click', () => { __pmContractsAddPdfResource('sign'); window.closeModal('pdf-resource-modal'); });
    document.getElementById('pdf-style-add-sign-block')?.addEventListener('click', () => { __pmContractsAddPdfResource('sign-block'); window.closeModal('pdf-resource-modal'); });
    __pmContractsRenderPdfResourcesEditorList();
}
function __pmContractsApplyResourceGeometryToNode(node, resource) {
    if (!(node instanceof HTMLElement)) return;
    node.style.left = `${resource.x}px`;
    node.style.top = `${resource.y}px`;
    node.style.width = `${resource.w}px`;
    node.style.height = `${resource.h}px`;
    node.style.transform = `rotate(${resource.angle || 0}deg)`;
    node.style.transformOrigin = 'center center';
}

function __pmContractsBindPdfResourceDrag() {
    if (document.body.dataset.pmContractsResourceDragBound === '1') return;
    document.body.dataset.pmContractsResourceDragBound = '1';
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
    const isResizeGesture = (rect, event) => (
        event.shiftKey ||
        (((rect.right - event.clientX) < 18) && ((rect.bottom - event.clientY) < 18))
    );
    const minHeightForType = (type) => (type === 'sign' || type === 'sign-line'
        ? 1
        : (type === 'logo'
            ? 24
            : (type === 'sign-block'
                ? 42
                : (type === 'bar' ? 4 : 10))));
    const releasePointer = (state) => {
        const captureNode = state?.captureNode;
        if (!captureNode || typeof captureNode.releasePointerCapture !== 'function') return;
        try { captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
    };
    const endDrag = () => {
        if (!__pmContractsPdfResourcePointerState) return;
        const state = __pmContractsPdfResourcePointerState;
        if (state.kind === 'base') {
            __pmContractsCommitPdfBaseLayout(state.instanceKey, state.current || state.origin);
        } else {
            const resources = __pmContractsGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id && resource.page === state.page);
            if (idx >= 0) {
                resources[idx] = { ...resources[idx], ...(state.current || state.origin) };
                __pmContractsCommitPdfResources(resources, { refreshPreview: false });
            }
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
        __pmContractsPdfResourcePointerState = null;
        __pmContractsHighlightSelectedResource();
        __pmContractsRenderReceiptInspector();
        requestAnimationFrame(__pmContractsPositionReceiptInspector);
    };

    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!__pmContractsIsAdminProfile()) return;
        if (__pmContractsReceiptEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        const node = target.closest('#receipt-preview-box .pmc-pdf-resource[data-res-id]');
        if (node) {
            if (target.closest('.pmc-pdf-delete-btn')) {
                const resId = String(node.getAttribute('data-res-id') || '');
                __pmContractsRemovePdfResource(resId);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const id = String(node.getAttribute('data-res-id') || '');
            const page = parseInt(node.getAttribute('data-res-page') || '1', 10);
            const resources = __pmContractsGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === id && resource.page === page);
            if (idx < 0) return;
            const rect = node.getBoundingClientRect();
            const scale = getPointerScale(node);
            const mode = isResizeGesture(rect, event) ? 'resize' : 'move';
            __pmContractsPdfResourceSelectedId = id;
            __pmContractsRenderPdfResourcesEditorList();
            __pmContractsHighlightSelectedResource();
            if (__pmContractsReceiptInspectorState?.kind === 'resource' && __pmContractsReceiptInspectorState.id === id) {
                __pmContractsReceiptInspectorState = { ...__pmContractsReceiptInspectorState, page };
            }
            __pmContractsPdfResourcePointerState = {
                kind: 'resource',
                id,
                page,
                type: String(resources[idx]?.type || ''),
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

        const baseNode = target.closest('#receipt-preview-box [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!__pmContractsGetPdfBaseBlockMeta(baseKey)) return;
        const rect = baseNode.getBoundingClientRect();
        const scale = getPointerScale(baseNode);
        const mode = isResizeGesture(rect, event) ? 'scale' : 'move';
        const cfg = __pmContractsGetPdfStyleConfig();
        const layouts = __pmContractsNormalizePdfBaseLayouts(cfg.baseLayouts);
        const instanceKey = String(baseNode.dataset.baseInstance || baseKey).trim();
        __pmContractsPdfResourceSelectedId = `base:${instanceKey}`;
        __pmContractsRenderPdfResourcesEditorList();
        __pmContractsHighlightSelectedResource();
        __pmContractsPdfResourcePointerState = {
            kind: 'base',
            key: baseKey,
            instanceKey,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
            captureNode: baseNode,
            scaleX: scale.x,
            scaleY: scale.y,
            origin: { ...(layouts[instanceKey] || layouts[baseKey] || __pmContractsNormalizePdfBaseLayout()) },
            current: { ...(layouts[instanceKey] || layouts[baseKey] || __pmContractsNormalizePdfBaseLayout()) }
        };
        if (typeof baseNode.setPointerCapture === 'function') {
            try { baseNode.setPointerCapture(event.pointerId); } catch (_) {}
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = mode === 'scale' ? 'nwse-resize' : 'move';
        event.preventDefault();
    });

    document.addEventListener('pointermove', (event) => {
        if (!__pmContractsPdfResourcePointerState) return;
        const state = __pmContractsPdfResourcePointerState;
        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        const dx = (event.clientX - state.startX) / (state.scaleX || 1);
        const dy = (event.clientY - state.startY) / (state.scaleY || 1);

        if (state.kind === 'base') {
            if (state.mode === 'scale') {
                const delta = (dx + dy) / 2;
                const next = __pmContractsNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + delta });
                state.current = next;
                if (state.captureNode) state.captureNode.style.transform = __pmContractsBuildPdfBaseTransform(next);
            } else {
                const next = __pmContractsNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
                state.current = next;
                if (state.captureNode) state.captureNode.style.transform = __pmContractsBuildPdfBaseTransform(next);
            }
            __pmContractsPositionReceiptInspector();
            event.preventDefault();
            return;
        }

        const next = { ...state.origin };
        if (state.mode === 'resize') {
            next.w = Math.max(16, next.w + dx);
            next.h = Math.max(minHeightForType(next.type), next.h + dy);
        } else {
            next.x += dx;
            next.y += dy;
        }
        state.current = next;
        const node = document.querySelector(`#receipt-preview-box .pmc-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
        if (node) {
            __pmContractsApplyResourceGeometryToNode(node, next);
            if (state.mode === 'resize') __pmContractsAutoFitPdfTextNode(node);
        }
        __pmContractsPositionReceiptInspector();
        event.preventDefault();
    });

    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function __pmContractsBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

function __pmContractsParseJsonObjectLike(value) {
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

function __pmContractsPickLatestConfigRow(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

async function __pmContractsSignedUrl(path) {
    const cleanPath = String(path || '').trim();
    if (!cleanPath) return null;
    const { data, error } = await window.globalPocketBase.storage.from(TEMPLATE_BUCKET).createSignedUrl(cleanPath, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
}

async function __pmContractsLoadPreferences() {
    defaultTemplateFile = '';
    PM_PDF_LETTERHEAD_URL = (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('*')
            .eq('tenant', __PM_CONTRACTS_PDF_STYLE_TENANT)
            .in('clave', [CFG_TEMPLATE_DEFAULT_KEY, CFG_LETTERHEAD_KEY]);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const templateRow = __pmContractsPickLatestConfigRow(rows.filter((row) => String(row?.clave || '').toLowerCase() === CFG_TEMPLATE_DEFAULT_KEY));
        const templateCfg = __pmContractsParseJsonObjectLike(templateRow?.valor_json);
        const templatePath = templateCfg.path || templateCfg.file_path || templateCfg.value || '';
        defaultTemplateFile = templateCfg.file_name || __pmContractsBasename(templatePath) || '';
        const letterheadRow = __pmContractsPickLatestConfigRow(rows.filter((row) => String(row?.clave || '').toLowerCase() === CFG_LETTERHEAD_KEY));
        const letterheadCfg = __pmContractsParseJsonObjectLike(letterheadRow?.valor_json);
        const savedPath = letterheadCfg.path || letterheadCfg.file_path || letterheadCfg.value || '';
        const safePath = savedPath || (letterheadCfg.file_name ? `${LETTERHEAD_PATH}/${letterheadCfg.file_name}` : '');
        if (safePath) {
            const signed = await __pmContractsSignedUrl(safePath);
            if (signed) PM_PDF_LETTERHEAD_URL = signed;
        }
    } catch (_) {}
}

function __pmContractsApplyTemplateDefault() {
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
    __pmContractsNormalizeNonSubmitButtons(document);
    if (document.body && document.body.dataset.pmReceiptSubmitGuard !== '1') {
        document.body.dataset.pmReceiptSubmitGuard = '1';
        document.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopPropagation();
        }, true);
    }
    window.addEventListener('beforeunload', () => {
        try {
            if (__pmContractsIsAdminProfile()) __pmContractsSaveEditorDraft(__pmContractsGetPdfStyleConfig());
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
        window.currentUserProfile = authCtx?.profile || await __pmContractsLoadCurrentUserProfile(session.user);
    } catch (_) {
        window.currentUserProfile = authCtx?.profile || (session?.user && typeof session.user === 'object'
            ? { ...session.user }
            : null);
    }
    await __pmContractsLoadSharedPdfStyleConfig();
    const draftStyle = __pmContractsLoadEditorDraft();
    if (draftStyle && __pmContractsIsAdminProfile()) {
        __pmContractsSetPdfStyleConfig(draftStyle, { applyToDom: false });
    } else if (!__pmContractsIsAdminProfile()) {
        try { localStorage.removeItem(__PM_RECEIPTS_EDITOR_DRAFT_KEY); } catch (_) {}
    }
    __pmContractsInitPdfStyleEditor();
    __pmContractsLoadTemplateLetterheadPreference();
    __pmContractsBindTemplateLetterheadToggle();

    console.log("Sistema iniciado correctamente. Cargando módulos...");

    // 4. Cargar Datos
    await loadApprovedOrders();
    await __pmContractsLoadPreferences();

    setContractPreviewSrcdoc(null);
    await window.loadTemplatesList();
    __pmContractsApplyPageModeLayout();

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
        const paidComplete = __pmContractsIsPaidComplete(o);
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

function __pmContractsSyncPaidIndicator(order) {
    const badge = document.getElementById('wk-paid-indicator');
    if (!badge) return;
    const paidComplete = __pmContractsIsPaidComplete(order);
    badge.classList.toggle('hidden', !paidComplete);
}

function selectOrder(order) {
    selectedOrder = order;
    
    // UI Updates
    document.getElementById('workspace-empty').classList.add('hidden');
    document.getElementById('wk-header').classList.remove('hidden');
    document.getElementById('wk-header').classList.add('flex');
    const wkTabs = document.getElementById('wk-tabs');
    if (wkTabs) {
        if (__pmContractsIsContractsOnlyPage() || __pmContractsIsReceiptsOnlyPage()) wkTabs.classList.add('hidden');
        else wkTabs.classList.remove('hidden');
    }
    document.getElementById('wk-content').classList.remove('hidden');
    document.getElementById('sidebar-empty').classList.add('hidden');
    
    // Data Binding
    document.getElementById('wk-client-name').innerText = order.cliente_nombre;
    document.getElementById('wk-order-id').innerText = order.numero_orden || 'PENDIENTE';
    document.getElementById('wk-total').innerText = formatMoney(order.precio_final);
    document.getElementById('rcp-ref').value = order.numero_orden || `ORD-${order.id.slice(0,6).toUpperCase()}`;
    __pmContractsSyncPaidIndicator(order);
    
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
    const history = __pmContractsPayments(order);
    currentRemainingBalance = __pmContractsRemaining(order);

    const nextPaymentNum = history.length + 1;
    document.getElementById('rcp-concept').value = `Pago ${nextPaymentNum} / ${order.espacio_nombre}`;
    
    const amountInput = document.getElementById('rcp-amount');
    const btnGen = document.getElementById('btn-gen-receipt');
    const statusMsg = document.getElementById('payment-status-message');

    const paymentClosed = __pmContractsIsClosed(order);

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
    const targetTab = __pmContractsIsContractsOnlyPage() ? 'contract' : 'receipt';
    switchTab(targetTab);

    updateReceiptPreview();
    __pmContractsApplyTemplateDefault();
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
    const paymentClosed = __pmContractsIsClosed(selectedOrder);
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

window.updateReceiptPreview = function(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
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
    __pmContractsApplyPdfStyleToLivePreview(opts);
    const remaining = currentRemainingBalance - amount;
    document.getElementById('lbl-remaining').innerText = formatMoney(remaining < 0 ? 0 : remaining);
    window.adjustPreviewScale();
    requestAnimationFrame(() => __pmContractsEnsureMarginGuideController()?.refresh());
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
    if (__pmContractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
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
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos').upload(filePath, pdfBlob);
        if (upErr) throw upErr;

        const history = __pmContractsPayments(selectedOrder).filter((p) => String(p?.type || p?.tipo || '').toLowerCase() !== 'constancia_liquidacion');
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
    if (__pmContractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
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
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos').upload(filePath, pdfBlob);
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
    if (__pmContractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    window.openCustomConfirm("¿Eliminar este recibo? El saldo aumentará.", async () => {
        try {
            const history = [...selectedOrder.historial_pagos];
            const item = history[index];
            const itemType = String(item?.type || item?.tipo || '').toLowerCase();
            if (itemType === 'constancia_liquidacion') return window.showToast("La constancia de liquidación no se puede eliminar.", "error");
            if(item.file_path) await window.globalPocketBase.storage.from('documentos').remove([item.file_path]);
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
            name: file?.name || __pmContractsBasename(file?.path || ''),
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
    __pmContractsApplyTemplateDefault();
};
window.loadSelectedTemplate = async function() {
    const fileName = document.getElementById('template-selector').value;
    __pmContractsActiveTemplateFile = String(fileName || '');
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

        text = __pmContractsTransparentPdfHtml(text);

        if (__pmContractsIsTemplateLetterheadEnabled()) {
            text = __pmContractsWrapLetterheadPage(text, {
                baseWidth: PM_CONTRACTS_CONTENT_BASE_WIDTH_PX,
                baseHeight: __pmContractsContentBaseHeightPx()
            });
        }

        setContractPreviewSrcdoc(text);
        setTimeout(window.adjustPreviewScale, 50);
        setTimeout(() => __pmContractsPdfMarginGuideController?.refresh(), 90);
    } catch (e) {
        console.error(e);
        window.showToast("Error al cargar plantilla", "error");
        setContractPreviewSrcdoc(null);
    }
};
function __pmContractsBuildPrintableContractHtml(previewDoc) {
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
    display: ${__pmContractsIsTemplateLetterheadEnabled() ? 'flex' : 'block'};
    justify-content: ${__pmContractsIsTemplateLetterheadEnabled() ? 'center' : 'initial'};
    align-items: ${__pmContractsIsTemplateLetterheadEnabled() ? 'flex-start' : 'initial'};
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

    const iframe = document.getElementById('contract-preview-iframe');
    const doc = iframe && iframe.contentDocument;
    if(!doc) {
        window.showToast("No hay contrato cargado.", "error");
        return;
    }

    const printableHtml = __pmContractsBuildPrintableContractHtml(doc);
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
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos').upload(path, signedFileToUpload); 
        if(upErr) throw upErr; 
        
        // MODIFICADO: Se elimina 'status: finalizada'. 
        // La orden permanece en el estado actual (aprobada) hasta que se suba la factura.
        const { error: dbErr } = await window.tenantPocketBase.from('cotizaciones').update({ contrato_url: path, numero_contrato: contractNum, fecha_contrato: new Date().toISOString() }).eq('id', selectedOrder.id); 
        
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
    if (__pmContractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    
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
    if (__pmContractsIsClosed(selectedOrder)) return window.showToast("PAGADO", "info");
    
    const amount = parseFloat(document.getElementById('up-rcp-amount').value);
    if(isNaN(amount) || amount <= 0) return window.showToast("Monto inválido", "error");
    
    const btn = document.getElementById('btn-save-ext-receipt');
    btn.disabled = true; btn.innerText = "Subiendo...";
    
    try {
        const fileExt = externalReceiptFile.name.split('.').pop();
        const fileName = `Comprobante_Externo_${Date.now()}.${fileExt}`;
        const filePath = `${selectedOrder.id}/recibos/${fileName}`;
        
        const { error: upErr } = await window.globalPocketBase.storage.from('documentos').upload(filePath, externalReceiptFile);
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
    if (!selectedOrder) return '';
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isLiquidated = currentRemainingBalance <= 0.01;
    const receiptBaseHeight = Number(__pmContractsContentBaseHeightPx().toFixed(2));
    const isAdminPreview = __pmContractsIsAdminProfile();
    const basePdfStyle = __pmContractsGetPdfStyleConfig();
    const pdfStyle = __pmContractsEnsureReceiptResourceDefaults(basePdfStyle, { persist: isAdminPreview });
    const pdfContent = __pmContractsNormalizePdfContent(pdfStyle.content);
    const signLabels = __pmContractsNormalizePdfSignLabels(pdfStyle.signLabels);
    const resourceContext = __pmContractsBuildReceiptResourceContext({
        isLiquidated,
        dateStr,
        timeStr,
        pdfContent,
        signLabels
    });
    const pdfStyleInlineVars = __pmContractsPdfStyleVarsInline(pdfStyle);
    const pdfStyleTag = `<style>.pmc-pdf-root{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;font-family:var(--pm-font-family)!important;}.pmc-pdf-root .pmc-pdf-shift{transform:translate(var(--pm-offset-x),var(--pm-offset-y));}.pmc-pdf-root .pmc-pdf-main{padding:var(--pm-margin-top) var(--pm-margin-right) var(--pm-margin-bottom) var(--pm-margin-left)!important;}.pmc-pdf-root .pmc-pdf-header{border-bottom-width:var(--pm-header-line)!important;justify-content:var(--pm-header-justify)!important;}.pmc-pdf-root .pmc-pdf-sign-line{width:100%;height:var(--pm-sign-line)!important;background:#111827!important;border-radius:999px;}.pmc-pdf-root .pmc-pdf-title{font-size:var(--pm-title-size)!important;line-height:1.05!important;text-align:var(--pm-header-align)!important;}.pmc-pdf-root .pmc-pdf-meta,.pmc-pdf-root .pmc-pdf-meta *{font-size:var(--pm-meta-size)!important;text-align:var(--pm-meta-align)!important;}.pmc-pdf-root .pmc-pdf-table-head th{font-size:var(--pm-table-head-size)!important;}.pmc-pdf-root .pmc-pdf-table-body td,.pmc-pdf-root .pmc-pdf-table-body p,.pmc-pdf-root .pmc-pdf-table-body span{font-size:var(--pm-table-body-size)!important;line-height:var(--pm-line-height)!important;}.pmc-pdf-root .pmc-pdf-table-body td:first-child,.pmc-pdf-root .pmc-pdf-table-body td:first-child *{text-align:var(--pm-table-align)!important;}.pmc-pdf-root .pmc-pdf-summary,.pmc-pdf-root .pmc-pdf-summary *{text-align:var(--pm-summary-align)!important;}.pmc-pdf-root .pmc-pdf-quick,.pmc-pdf-root .pmc-pdf-quick *{font-size:var(--pm-quick-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-quick-align)!important;}.pmc-pdf-root .pmc-pdf-general-conditions,.pmc-pdf-root .pmc-pdf-general-conditions *{font-size:var(--pm-conditions-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-conditions-align)!important;}.pmc-pdf-root .pmc-pdf-sign,.pmc-pdf-root .pmc-pdf-sign *{font-size:var(--pm-sign-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-sign-align)!important;}.pmc-pdf-root .pmc-pdf-footer-text{font-size:var(--pm-footer-size)!important;text-align:var(--pm-footer-align)!important;}.pmc-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.pmc-pdf-root .pmc-pdf-resource,.pmc-pdf-root .pmc-pdf-editable{cursor:default;}.pmc-pdf-root .pmc-pdf-editable{box-sizing:border-box;outline:none;outline-offset:2px;}.pmc-pdf-root .pmc-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 2px #ffffff;opacity:0;}.pmc-pdf-root .pmc-pdf-edit-selected{outline:none;outline-offset:2px;}.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-resource,.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable{cursor:move;}.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable{outline:1px dashed rgba(239,68,68,.45);}.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-editable::after{opacity:.9;}.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-edit-selected{outline:2px solid #ef4444;}.pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-edit-selected::after{opacity:1;transform:scale(1.08);} .pmc-pdf-delete-btn { position:absolute; top:-8px; right:-8px; width:22px; height:22px; border-radius:50%; background:#ef4444; color:#fff; display:none; align-items:center; justify-content:center; cursor:pointer; font-size:11px; z-index:80; box-shadow:0 0 0 2px #fff; pointer-events:auto; } .pmc-pdf-root.pmc-pdf-admin-enabled .pmc-pdf-edit-selected .pmc-pdf-delete-btn { display:flex; } .pmc-pdf-delete-btn:hover { background:#dc2626; transform:scale(1.08); transition:all .2s; }</style>`;

    const wrapStyledReceipt = (rawHtml, extraPages = 0) => {
        const pageOneRaw = __pmContractsInjectResourcesIntoPage(rawHtml, __pmContractsRenderPdfResources(pdfStyle, 1, resourceContext));
        const pages = [
            __pmContractsWrapLetterheadPage(__pmContractsTransparentPdfHtml(__pmContractsBoostPdfTypography(pageOneRaw)), { baseWidth: PM_CONTRACTS_CONTENT_BASE_WIDTH_PX, baseHeight: receiptBaseHeight, id: 'receipt-print-area' })
        ];
        for (let i = 0; i < extraPages; i += 1) {
            const annexRaw = `<div class="pmc-pdf-main pmc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: ${PM_CONTRACTS_CONTENT_BASE_WIDTH_PX}px; min-height: ${receiptBaseHeight}px; height: ${receiptBaseHeight}px; box-sizing: border-box; overflow: hidden;"><div class="pmc-pdf-header flex justify-end items-start mb-8 border-b-4 border-brand-red pb-3"><div class="pmc-pdf-meta text-right"><h1 class="pmc-pdf-title text-2xl font-black uppercase text-gray-900 tracking-tighter">ANEXO ${i + 1}</h1></div></div><div class="pmc-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__pmContractsSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__pmContractsSafeHtml(pdfContent.annexHintBody || '')}</p></div></div>`;
            const pageIndex = i + 2;
            const withResources = __pmContractsInjectResourcesIntoPage(annexRaw, __pmContractsRenderPdfResources(pdfStyle, pageIndex, resourceContext));
            pages.push(__pmContractsWrapLetterheadPage(__pmContractsTransparentPdfHtml(__pmContractsBoostPdfTypography(withResources)), { baseWidth: PM_CONTRACTS_CONTENT_BASE_WIDTH_PX, baseHeight: receiptBaseHeight }));
        }
        const adminClass = isAdminPreview ? ' pmc-pdf-admin-enabled' : '';
        return `<div class="pmc-pdf-root${adminClass}" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;${pdfStyleInlineVars}">${pdfStyleTag}${pages.join('')}</div>`;
    };

    const extraPages = __pmContractsClampStyleNumber(pdfStyle.extraPages, 0, 6, 0);

    if (isLiquidated) {
        const payments = selectedOrder.historial_pagos || [];
        let rowsHtml = '';
        payments.forEach((p) => {
            rowsHtml += `
                <tr class="border-b border-gray-100 last:border-0">
                    <td class="py-3 text-gray-600">${window.formatDate(p.date)}</td>
                    <td class="py-3 text-gray-600 font-bold">${p.bank || '---'} / ${p.account || '---'}</td>
                    <td class="py-3 text-gray-600">${p.reference}</td>
                    <td class="py-3 text-right font-mono font-bold text-gray-800">${window.formatMoney(p.amount)}</td>
                </tr>
            `;
        });
        const watermark = `<div class="${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="watermark" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 118px; color: rgba(34, 197, 94, 0.16); font-weight: 900; z-index: 0; pointer-events: none; white-space: nowrap;">${__pmContractsSafeHtml(pdfContent.liquidatedWatermarkText || 'LIQUIDADO')}</div>`;
        const receiptRaw = `
            <div class="pmc-pdf-main pmc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: ${PM_CONTRACTS_CONTENT_BASE_WIDTH_PX}px; min-height: ${receiptBaseHeight}px; height: ${receiptBaseHeight}px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;">
                ${watermark}
                <div style="position: relative; z-index: 10; flex-grow: 1;">
                    <div class="pmc-pdf-header flex justify-end items-start mb-10 border-b-4 border-green-600 pb-4 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="header"><div class="w-full h-1"></div></div>
                    <div class="pmc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="summary-main">
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.liquidatedClientLabel || 'Cliente:')}</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                        <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.liquidatedSpaceLabel || 'Espacio:')}</span><span class="text-base font-bold text-gray-900">${selectedOrder.espacio_nombre}</span></div>
                        <div class="flex justify-between"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.liquidatedTotalLabel || 'Total Contrato:')}</span><span class="text-xl font-black text-brand-red">${window.formatMoney(selectedOrder.precio_final)}</span></div>
                    </div>
                    <div class="mb-10 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="details"><h3 class="pmc-pdf-quick font-bold text-xs uppercase text-gray-400 mb-4 tracking-widest pl-2">${__pmContractsSafeHtml(pdfContent.liquidatedPaymentsHeading || 'Resumen de Pagos Realizados')}</h3><div class="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"><table class="pmc-pdf-table w-full text-xs text-left"><thead class="pmc-pdf-table-head"><tr class="text-gray-400 uppercase text-[10px] font-black tracking-wider border-b border-gray-100"><th class="pb-3">Fecha</th><th class="pb-3">Banco / Cuenta</th><th class="pb-3">Referencia</th><th class="text-right pb-3">Monto</th></tr></thead><tbody class="pmc-pdf-table-body">${rowsHtml}</tbody></table></div></div>
                    <div class="pmc-pdf-summary mb-12 flex justify-end ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="balance"><div class="bg-green-50 px-8 py-5 rounded-xl border border-green-100 text-right shadow-sm"><p class="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">${__pmContractsSafeHtml(pdfContent.liquidatedBalanceLabel || 'Saldo Pendiente')}</p><p class="text-3xl font-black text-green-700">$0.00</p></div></div>
                </div>
                <div style="margin-top: auto; position: relative; z-index: 10;">
                    <div class="pmc-pdf-sign mb-8 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="sign"></div>
                    <div class="pmc-pdf-footer-text pmc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="footer"><p class="mb-1">${__pmContractsSafeHtml(pdfContent.liquidatedFooterLine1 || '')}</p><p>${__pmContractsSafeHtml(pdfContent.liquidatedFooterLine2 || '')}</p></div>
                </div>
            </div>`;
        return wrapStyledReceipt(receiptRaw, extraPages);
    }

    const amount = parseFloat(document.getElementById('rcp-amount')?.value || '0') || 0;
    const concept = __pmContractsSafeHtml(document.getElementById('rcp-concept')?.value || '');
    const bank = __pmContractsSafeHtml(document.getElementById('rcp-bank')?.value || '');
    const account = __pmContractsSafeHtml(document.getElementById('rcp-account')?.value || '');
    const ref = __pmContractsSafeHtml(document.getElementById('rcp-ref')?.value || '');
    let projectedRemaining = currentRemainingBalance - amount;
    if (projectedRemaining < 0) projectedRemaining = 0;

    const receiptRaw = `
        <div class="pmc-pdf-main pmc-pdf-shift font-sans text-gray-800 w-full h-full relative leading-relaxed" style="width: ${PM_CONTRACTS_CONTENT_BASE_WIDTH_PX}px; min-height: ${receiptBaseHeight}px; height: ${receiptBaseHeight}px; box-sizing: border-box; display: flex; flex-direction: column;">
            <div style="flex-grow: 1;">
                <div class="pmc-pdf-header flex justify-end items-start mb-10 border-b-4 border-brand-red pb-4 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="header"><div class="w-full h-1"></div></div>
                <div class="pmc-pdf-summary mb-8 p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-sm ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="summary-main">
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.receiptReceivedFromLabel || 'Recibimos de:')}</span><span class="text-lg font-bold text-gray-900">${selectedOrder.cliente_nombre}</span></div>
                    <div class="flex justify-between mb-4 border-b border-gray-200 pb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.receiptAmountLabel || 'La cantidad de:')}</span><span class="text-2xl font-black text-brand-red">${window.formatMoney(amount)}</span></div>
                    <div class="flex justify-between mb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.receiptConceptLabel || 'Concepto:')}</span><span class="text-sm font-medium text-gray-700 text-right max-w-[60%]">${concept}</span></div>
                    <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-lg mt-4"><span class="text-xs font-bold text-gray-500 uppercase tracking-wider">${__pmContractsSafeHtml(pdfContent.receiptInternalReferenceLabel || 'Referencia Interna:')}</span><div class="text-right"><span class="block text-sm font-bold text-gray-800 font-mono">${selectedOrder.numero_orden || '---'}</span><span class="block text-[10px] text-gray-400 font-mono tracking-widest">${selectedOrder.id.slice(0,8).toUpperCase()}</span></div></div>
                </div>
                <div class="pmc-pdf-quick grid grid-cols-2 gap-12 text-xs text-gray-600 mb-8 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="details">
                    <div><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">${__pmContractsSafeHtml(pdfContent.receiptBankHeading || 'Datos Bancarios')}</p><p class="mb-1">${__pmContractsSafeHtml(pdfContent.receiptBankLabel || 'Banco:')} <strong class="text-gray-900 uppercase">${bank}</strong></p><p>${__pmContractsSafeHtml(pdfContent.receiptAccountLabel || 'Cuenta/CLABE:')} <strong class="text-gray-900 uppercase">${account}</strong></p></div>
                    <div class="text-right"><p class="font-black uppercase mb-2 text-gray-800 border-b pb-1 text-sm">${__pmContractsSafeHtml(pdfContent.receiptReferenceHeading || 'Referencia')}</p><p class="font-mono text-base text-gray-900">${ref}</p></div>
                </div>
                <div class="pmc-pdf-summary mb-12 flex justify-end ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="balance"><div class="bg-red-50 px-8 py-4 rounded-xl border border-red-100 text-right shadow-sm"><p class="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">${__pmContractsSafeHtml(pdfContent.receiptPendingBalanceLabel || 'Saldo Pendiente por Liquidar')}</p><p class="text-2xl font-black text-red-600">${window.formatMoney(projectedRemaining)}</p></div></div>
            </div>
            <div style="margin-top: auto;">
                <div class="pmc-pdf-sign mb-8 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="sign"></div>
                <div class="pmc-pdf-footer-text pmc-pdf-general-conditions text-[10px] text-center text-gray-400 mt-4 ${isAdminPreview ? 'pmc-pdf-editable' : ''}" data-base-resource="footer"><p class="mb-1">${__pmContractsSafeHtml(pdfContent.receiptFooterLine1 || '')}</p><p>${__pmContractsSafeHtml(pdfContent.receiptFooterLine2 || '')}</p></div>
            </div>
        </div>`;

    return wrapStyledReceipt(receiptRaw, extraPages);
}



