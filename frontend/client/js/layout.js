/**
 * DOC: client\js\layout.js
 * Proposito: Layout maestro: sesion, encabezado, navegacion y utilidades globales UI.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

/**
 * LAYOUT MAESTRO - DISEÑO HUB 2.0 (OPTIMIZADO V11)
 * - Conexión centralizada vía HUB_CONFIG
 */
(function() {
    if (window.layoutInitialized) return;
    window.layoutInitialized = true;

    /* -------------------------------------------------------------------------
     * CONEXIÓN A POCKETBASE (LEÍDA DE HUB_CONFIG)
     * ------------------------------------------------------------------------- */
    const LAYOUT_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
    const LAYOUT_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
    const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
    const IS_LOCAL = !!(window.HUB_CONFIG && window.HUB_CONFIG.localMode);
    const CONSOLE_VERBOSE = IS_LOCAL || window.__HUB_VERBOSE_CONSOLE === true;

    function installConsoleShield() {
        if (CONSOLE_VERBOSE || window.__HUB_CONSOLE_SHIELDED === true || !window.console) return;
        const source = window.console;
        const original = window.__HUB_CONSOLE_ORIGINAL || {};
        ['log', 'info', 'debug', 'warn', 'error', 'table', 'trace'].forEach((name) => {
            try {
                if (!original[name] && typeof source[name] === 'function') {
                    original[name] = source[name].bind(source);
                }
                if (typeof source[name] === 'function') {
                    source[name] = function () {};
                }
            } catch (_) {}
        });
        try { window.__HUB_CONSOLE_ORIGINAL = original; } catch (_) {}
        try { window.__HUB_CONSOLE_SHIELDED = true; } catch (_) {}
    }

    installConsoleShield();
    
    let layoutClient;
    let myId = '';
    let layoutNotifPollTimer = null;
    let layoutNotifLastKey = '';
    let layoutNotifVisibilityBound = false;
    let layoutNotifCache = new Map();
    let layoutNotifActive = null;
    
    const scriptTag = document.querySelector('script[src*="layout.js"]');
    const pathPrefix = scriptTag ? scriptTag.getAttribute('src').replace('js/layout.js', '') : './';

    

    const NOTIFY_SOUND = pathPrefix + 'public/assets/sfx/notify.wav';
    // Ruta / logos según tenant (Plaza Mayor vs Casa de Piedra)
    const _p = window.location.pathname || '';
    const _isCP = /\/cotizadorcp(\/|$)/.test(_p) || (window.location.href || '').includes('cotizadorcp');
    const TENANT_SCHEMA = _isCP ? 'finanzas_casadepiedra' : FIN_SCHEMA;
    const pmLogo = (window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../public/assets/img/logo.png';
    const cpLogo = (window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../public/assets/img/logocp.png';
    const layoutLogoSrc = _isCP ? cpLogo : pmLogo;
    const layoutBrandName = _isCP ? 'CASA DE PIEDRA' : 'PLAZA MAYOR';
    const layoutAccentHex = _isCP ? '#c1621e' : '#D32F2F';
// --- FORZAR FAVICON ---
    (function forceFavicon() {
        const iconPath = scriptTag ? scriptTag.getAttribute('src').replace('layout.js', 'favicon.png') : 'js/favicon.png';
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = iconPath;
    })();

    function ensureResponsiveLayoutStyles() {
        if (document.getElementById('hub-responsive-style')) return;
        const style = document.createElement('style');
        style.id = 'hub-responsive-style';
        style.textContent = `
            :root{
                --hub-shell-pad:clamp(14px,1.8vw,28px);
                --hub-preview-pad:clamp(12px,1.8vw,28px);
                --hub-preview-modal-width:1280px;
                --hub-dialog-width:560px;
                --hub-editor-modal-width:1460px;
            }
            html,
            body{
                width:100%;
                max-width:100%;
                overscroll-behavior-x:none;
                overscroll-behavior-y:none;
            }
            body{
                overflow-x:hidden;
            }
            main,
            header,
            nav,
            footer{
                max-width:100%;
            }
            img,
            svg,
            canvas,
            video,
            iframe{
                max-width:100%;
            }
            header .container{
                max-width:min(1680px,calc(100vw - (var(--hub-shell-pad) * 2)));
                padding-inline:var(--hub-shell-pad)!important;
            }
            nav[data-master-nav="1"]{
                padding-inline:var(--hub-shell-pad);
            }
            #main-container{
                padding:var(--hub-shell-pad)!important;
            }
            #view-dashboard{
                max-width:min(1680px,100%)!important;
            }
            #apps-grid{
                grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));
            }
            [id$="-modal"]{
                overscroll-behavior:contain;
            }
            [id$="-modal"] > div{
                margin-inline:auto;
                max-width:min(96vw,var(--hub-editor-modal-width));
                max-height:min(94vh,calc(100dvh - 20px));
            }
            #preview-modal > div{
                width:min(96vw,var(--hub-preview-modal-width))!important;
                max-width:none!important;
                height:min(94vh,calc(100dvh - 20px))!important;
            }
            #docs-modal > div,
            #generic-confirm-modal > div,
            #generic-input-modal > div{
                width:min(96vw,var(--hub-dialog-width))!important;
            }
            #preview-container,
            #receipt-preview-container,
            #contract-preview-container{
                padding:var(--hub-preview-pad)!important;
                min-width:0;
                min-height:0;
            }
            #pdf-content,
            #receipt-preview-box,
            #contract-preview-box{
                margin-inline:auto;
            }
            #receipt-preview-box,
            #contract-preview-box{
                max-width:min(100%,816px)!important;
            }
            .custom-scroll,
            .no-scrollbar,
            #preview-container,
            #receipt-preview-container,
            #contract-preview-container,
            #docs-list,
            #payments-history-list,
            #approved-list,
            #sidebar-contract,
            [data-pdf-inspector-body]{
                overscroll-behavior:contain;
                -webkit-overflow-scrolling:touch;
            }
            @media (max-width: 1279px){
                #sidebar-container{
                    width:100%!important;
                    min-width:0!important;
                    max-height:42vh;
                }
            }
            @media (max-width: 1023px){
                #order-edit-modal > div,
                #manager-modal > div,
                #quote-modal > div,
                #upload-receipt-modal > div,
                #missing-data-modal > div,
                #finalize-modal > div,
                #pdf-resource-modal > div,
                #order-date-modal > div,
                #montaje-modal > div{
                    width:min(97vw,var(--hub-editor-modal-width))!important;
                }
            }
            @media (max-width: 767px){
                #preview-modal,
                #docs-modal,
                #order-edit-modal,
                #manager-modal,
                #quote-modal,
                #upload-receipt-modal,
                #missing-data-modal,
                #finalize-modal,
                #pdf-resource-modal,
                #order-date-modal,
                #montaje-modal,
                #color-modal,
                #client-modal,
                #client-history-modal,
                #client-quote-docs-modal,
                #confirm-modal{
                    padding:12px!important;
                }
                #preview-modal > div,
                #order-edit-modal > div,
                #manager-modal > div,
                #quote-modal > div,
                #upload-receipt-modal > div,
                #missing-data-modal > div,
                #finalize-modal > div,
                #pdf-resource-modal > div,
                #order-date-modal > div,
                #montaje-modal > div{
                    width:min(calc(100vw - 12px),var(--hub-editor-modal-width))!important;
                    max-height:min(calc(100vh - 12px),calc(100dvh - 12px))!important;
                }
            }
            @keyframes softFadeIn {
                0% { opacity: 0; transform: translateY(8px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes titlePulse {
                0% { opacity: 0; transform: scale(0.95); }
                100% { opacity: 1; transform: scale(1); }
            }
            body > main, #main-container, .main-content {
                animation: softFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .title-anim {
                display: inline-block;
                animation: titlePulse 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
        `;
        document.head.appendChild(style);
    }

    function syncResponsiveViewport() {
        const width = window.innerWidth || document.documentElement.clientWidth || 1280;
        let tier = 'hd';
        if (width >= 3200) tier = '4k';
        else if (width >= 2560) tier = 'qhd';
        else if (width >= 1920) tier = 'fhd';
        document.documentElement.dataset.screenTier = tier;
        const root = document.documentElement;
        root.style.setProperty('--hub-shell-pad', width >= 2560 ? '32px' : (width >= 1920 ? '24px' : 'clamp(14px,1.8vw,24px)'));
        root.style.setProperty('--hub-preview-pad', width >= 2560 ? '36px' : (width >= 1920 ? '24px' : 'clamp(12px,1.8vw,24px)'));
        root.style.setProperty('--hub-preview-modal-width', width >= 3200 ? '1800px' : (width >= 2560 ? '1640px' : (width >= 1920 ? '1460px' : '1280px')));
        root.style.setProperty('--hub-dialog-width', width >= 2560 ? '680px' : (width >= 1920 ? '620px' : '560px'));
        root.style.setProperty('--hub-editor-modal-width', width >= 3200 ? '1920px' : (width >= 2560 ? '1760px' : (width >= 1920 ? '1580px' : '1460px')));
    }

    function findScrollableAncestor(target) {
        let node = target instanceof Element ? target : null;
        while (node && node !== document.body && node !== document.documentElement) {
            const style = window.getComputedStyle(node);
            const overflowY = style.overflowY || '';
            const canScrollY = node.scrollHeight > node.clientHeight + 1;
            if (canScrollY && (overflowY === 'auto' || overflowY === 'scroll' || node.classList.contains('custom-scroll'))) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function installTouchOverscrollGuard() {
        if (window.__hubTouchOverscrollGuardBound) return;
        const supportsTouch = (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 0)
            || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
            || 'ontouchstart' in window;
        if (!supportsTouch) return;
        window.__hubTouchOverscrollGuardBound = true;

        let lastTouchX = 0;
        let lastTouchY = 0;
        let activeScrollable = null;

        const resetTouchState = () => {
            lastTouchX = 0;
            lastTouchY = 0;
            activeScrollable = null;
        };

        document.addEventListener('touchstart', (event) => {
            if (!event.touches || event.touches.length !== 1) return;
            const touch = event.touches[0];
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            activeScrollable = findScrollableAncestor(event.target);
        }, { passive: true, capture: true });

        document.addEventListener('touchmove', (event) => {
            if (!event.touches || event.touches.length !== 1) return;
            const touch = event.touches[0];
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;

            if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

            const scrollable = findScrollableAncestor(event.target) || activeScrollable;
            if (!scrollable) {
                const rootScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
                if (rootScrollTop <= 0 && deltaY > 0 && event.cancelable) {
                    event.preventDefault();
                }
                return;
            }

            const maxScrollTop = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
            if (maxScrollTop <= 0) {
                if (event.cancelable) event.preventDefault();
                return;
            }

            const scrollTop = scrollable.scrollTop || 0;
            const pushingPastTop = deltaY > 0 && scrollTop <= 0;
            const pushingPastBottom = deltaY < 0 && scrollTop >= maxScrollTop - 1;
            if ((pushingPastTop || pushingPastBottom) && event.cancelable) {
                event.preventDefault();
            }
        }, { passive: false, capture: true });

        document.addEventListener('touchend', resetTouchState, { passive: true, capture: true });
        document.addEventListener('touchcancel', resetTouchState, { passive: true, capture: true });
    }

    ensureResponsiveLayoutStyles();
    syncResponsiveViewport();
    installTouchOverscrollGuard();
    let responsiveRaf = 0;
    window.addEventListener('resize', () => {
        if (responsiveRaf) cancelAnimationFrame(responsiveRaf);
        responsiveRaf = requestAnimationFrame(() => {
            responsiveRaf = 0;
            syncResponsiveViewport();
        });
    });

    // 1. INICIALIZACIÓN SINGLETON
    if (window.PB_CLIENT) {
        if (!window.globalPocketBase) {
            window.globalPocketBase = window.PB_CLIENT.createClient(LAYOUT_URL, LAYOUT_KEY);
        }
        layoutClient = window.globalPocketBase;
        window.pbClient = window.globalPocketBase;
        
        if (!window.tenantPocketBase) {
            // tenantPocketBase debe reutilizar la sesión del cliente global (evita requests sin JWT y RLS devolviendo vacío)
            window.tenantPocketBase = window.globalPocketBase.schema((typeof TENANT_SCHEMA !== 'undefined' ? TENANT_SCHEMA : FIN_SCHEMA));
            window.__FIN_SCHEMA = (typeof TENANT_SCHEMA !== 'undefined' ? TENANT_SCHEMA : FIN_SCHEMA);
        }
    } else {
        console.error("❌ Runtime PocketBase no encontrado.");
    }

    // 2. HELPERS VISUALES
    function ensureToastContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        c.className = 'fixed bottom-6 right-6 z-[10000] flex flex-col gap-3 pointer-events-none';
        return c;
    }

    if (!window.showToast) {
        window.showToast = (message, type = 'info') => {
            const container = ensureToastContainer();
            const styles = {
                success: { icon: 'fa-circle-check', border: 'border-green-500', text: 'text-green-600', bgIcon: 'bg-green-50' },
                error:   { icon: 'fa-triangle-exclamation', border: 'border-red-500', text: 'text-red-600', bgIcon: 'bg-red-50' },
                info:    { icon: 'fa-circle-info', border: 'border-blue-500', text: 'text-blue-600', bgIcon: 'bg-blue-50' },
                warning: { icon: 'fa-bell', border: 'border-yellow-500', text: 'text-yellow-600', bgIcon: 'bg-yellow-50' }
            };
            const s = styles[type] || styles.info;
            const toast = document.createElement('div');
            toast.className = `pointer-events-auto bg-white border-l-4 ${s.border} rounded-xl shadow-2xl p-4 flex items-start gap-3 w-80 transform transition-all duration-500 translate-x-full opacity-0`;
            toast.innerHTML = `<div class="shrink-0 w-8 h-8 rounded-full ${s.bgIcon} ${s.text} flex items-center justify-center shadow-sm"><i class="fa-solid ${s.icon}"></i></div><div class="flex-grow pt-1"><p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Sistema</p><p class="text-xs font-bold text-gray-800 leading-snug">${message || ''}</p></div>`;
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.remove('translate-x-full', 'opacity-0'));
            setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => toast.remove(), 500); }, 4000);
        };
    }

    if (!window.openConfirm) {
        window.openConfirm = (msg, onYes) => {
            let modal = document.getElementById('generic-confirm-modal');
            if (!modal) { modal = document.createElement('div'); modal.id = 'generic-confirm-modal'; document.body.appendChild(modal); }
            modal.className = 'fixed inset-0 bg-slate-900/80 z-[9000] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300';
            modal.innerHTML = `<div class="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center transform scale-100 transition-transform duration-300"><div class="w-16 h-16 bg-red-50 text-brand-red rounded-full flex items-center justify-center mx-auto text-3xl mb-5 shadow-sm"><i class="fa-solid fa-triangle-exclamation"></i></div><h3 class="font-black text-xl text-gray-800 mb-2">Confirmación</h3><p class="text-sm text-gray-500 font-medium mb-8 leading-relaxed">${msg || '¿Estás seguro?'}</p><div class="flex gap-3 justify-center"><button id="btn-conf-cancel" class="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition text-xs uppercase tracking-wide">Cancelar</button><button id="btn-conf-yes" class="px-6 py-2.5 bg-brand-red text-white rounded-xl font-bold hover:bg-brand-red/90 shadow-lg shadow-red-100 transition transform hover:-translate-y-0.5 text-xs uppercase tracking-wide">Confirmar</button></div></div>`;
            modal.classList.remove('hidden');
            const cleanup = () => modal.classList.add('hidden');
            document.getElementById('btn-conf-cancel').onclick = cleanup;
            document.getElementById('btn-conf-yes').onclick = async () => { try { if (typeof onYes === 'function') await onYes(); } finally { cleanup(); } };
        };
    }

    if (!window.openInputModal) {
        window.openInputModal = (title, msg, currentValue, onSave) => {
            let modal = document.getElementById('generic-input-modal');
            if (!modal) { modal = document.createElement('div'); modal.id = 'generic-input-modal'; document.body.appendChild(modal); }
            modal.className = 'fixed inset-0 bg-slate-900/80 z-[9000] flex items-center justify-center p-4 backdrop-blur-sm';
            modal.innerHTML = `<div class="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"><h3 class="font-black text-xl text-gray-800 mb-2">${title}</h3><p class="text-xs text-gray-400 font-bold uppercase tracking-wider mb-6">${msg}</p><input type="text" id="gen-input-val" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-center outline-none focus:border-brand-red transition mb-6" value="${currentValue || ''}"><div class="flex gap-3 justify-center"><button id="btn-inp-cancel" class="px-6 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition border border-transparent hover:border-gray-200">Cancelar</button><button id="btn-inp-save" class="px-6 py-2.5 bg-brand-dark text-white rounded-xl font-bold hover:bg-black shadow-lg transition transform hover:-translate-y-0.5">Guardar</button></div></div>`;
            modal.classList.remove('hidden');
            const input = document.getElementById('gen-input-val');
            input.focus(); input.onkeydown = (e) => { if(e.key === 'Enter') document.getElementById('btn-inp-save').click(); };
            const close = () => modal.classList.add('hidden');
            document.getElementById('btn-inp-cancel').onclick = close;
            document.getElementById('btn-inp-save').onclick = async () => { const val = input.value; if (typeof onSave === 'function') await onSave(val); close(); };
        };
    }

    if (!window.openModal) window.openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
    if (!window.closeModal) window.closeModal = (id) => document.getElementById(id)?.classList.add('hidden');
    if (!window.formatMoney) window.formatMoney = (amount) => { try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount) || 0); } catch(e) { return '$' + (Number(amount) || 0).toFixed(2); } };
    if (!window.getLocalYMD) window.getLocalYMD = (d) => { const dt = d instanceof Date ? d : new Date(d); if (isNaN(dt.getTime())) return ''; const offset = dt.getTimezoneOffset() * 60000; return new Date(dt.getTime() - offset).toISOString().slice(0, 10); };

    function getCurrentModuleTitle() {
        const path = window.location.pathname.toLowerCase();
        const file = path.split('/').pop().split('?')[0].split('#')[0];
        
        if (path.includes('/users/') || path.includes('/system/') || path.includes('/config/')) return 'CONFIGURACIÓN';
        
        if (file === 'orders.html') return 'COTIZACIONES';
        if (file === 'cotizacion.html' || file === 'order_detail.html') return 'COTIZACIÓN';
        if (file === 'catalog.html') return 'CATÁLOGO';
        if (file === 'clientes.html') return 'CLIENTES';
        if (file === 'contracts.html') return 'CONTRATOS';
        if (file === 'receipts.html' || file === 'recibos.html') return 'RECIBOS';
        if (file === 'reports.html' || file === 'report.html') return 'REPORTES';
        if (file === 'invoices.html') return 'FACTURAS';
        if (file === 'agenda.html') return 'AGENDA';
        if (file === 'montajes.html') return 'MONTAJES';
        
        if (path.includes('/finanzas/')) return 'FINANZAS';
        
        return 'MARKETING HUB';
    }

    function getManualLink(type, originalLink) {
        const t = (type || '').toLowerCase();
        
        if (t === 'calendar') return pathPrefix + 'calendar/index.html';
        if (t === 'ticket' || t === 'tickets') return pathPrefix + 'tickets/index.html';
        
        if (t.includes('orden') || t.includes('order')) {
            return pathPrefix + 'cotizador/orders.html';
        }

        if (t.includes('client') || t.includes('cliente') || t.includes('document')) {
            return originalLink || pathPrefix + 'cotizador/clientes.html';
        }

        if (t.includes('cotiza') || t.includes('catalog')) {
             return pathPrefix + 'cotizador/catalog.html';
        }

        if (t.includes('fina')) return pathPrefix + 'finanzas/index.html';
        
        return originalLink || '#';
    }

    function normalizeNotificationLink(link) {
        const value = String(link || '').trim();
        if (!value || value === '#') return '#';
        if (/^(?:https?:|mailto:|tel:)/i.test(value)) return value;
        if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('?') || value.startsWith('#')) return value;
        return pathPrefix + value;
    }

    function parseNotificationMetadata(value) {
        if (!value) return {};
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        }
        return value && typeof value === 'object' ? value : {};
    }

    function escapeNotificationHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatNotificationDateTime(value) {
        const stamp = value ? new Date(value) : null;
        if (!stamp || Number.isNaN(stamp.getTime())) return 'Sin fecha disponible';
        try {
            return new Intl.DateTimeFormat('es-MX', {
                timeZone: 'America/Mexico_City',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(stamp).replace(/\./g, '');
        } catch (_) {
            return stamp.toLocaleString('es-MX');
        }
    }

    function summarizeNotificationDocuments(metadata) {
        const source = parseNotificationMetadata(metadata);
        const primaryDoc = source.documento && typeof source.documento === 'object' ? [source.documento] : [];
        const docs = primaryDoc.length ? primaryDoc : (Array.isArray(source.documentos) ? source.documentos : []);
        const labels = docs.map((item) => String(item?.label || item?.documento_nombre || item?.field || '').trim()).filter(Boolean);
        if (!labels.length) return '';
        if (labels.length === 1) return labels[0];
        if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
        return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
    }

    function getNotificationVisual(type) {
        const sourceType = String(type || '').toLowerCase();
        let icon = 'fa-bell text-gray-400';
        let bgIcon = 'bg-gray-50';
        if (sourceType === 'calendar') { icon = 'fa-calendar text-blue-500'; bgIcon = 'bg-blue-50'; }
        else if (sourceType === 'ticket' || sourceType === 'tickets') { icon = 'fa-ticket text-orange-500'; bgIcon = 'bg-orange-50'; }
        else if (sourceType === 'finanzas' || sourceType === 'cotizador' || sourceType === 'order' || sourceType.includes('quote')) { icon = 'fa-file-invoice-dollar text-brand-red'; bgIcon = 'bg-red-50'; }
        else if (sourceType.includes('client') || sourceType.includes('cliente') || sourceType.includes('document')) { icon = 'fa-user-check text-brand-red'; bgIcon = 'bg-red-50'; }
        return { icon, bgIcon };
    }

    function buildNotificationTargetLink(notification) {
        const source = notification && typeof notification === 'object' ? notification : {};
        const metadata = parseNotificationMetadata(source.metadata);
        const tenant = normalizeTenantSlug(metadata.tenant || metadata.tenant_slug || '');
        const quoteId = String(metadata.cotizacion_id || metadata.quote_id || '').trim();
        const clientId = String(metadata.cliente_id || metadata.client_id || '').trim();
        const explicitLink = normalizeNotificationLink(metadata.redirect_url || source.link || '');
        const tenantModule = tenant === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';

        if (metadata.redirect_url) return explicitLink;
        if (quoteId && tenant) return normalizeNotificationLink(`${tenantModule}/orders.html?quote=${encodeURIComponent(quoteId)}`);
        if (clientId && tenant) return normalizeNotificationLink(`${tenantModule}/clientes.html?verify=${encodeURIComponent(clientId)}`);
        return normalizeNotificationLink(getManualLink(source.source_app || source.type, source.link));
    }

    function buildNotificationActionLabel(notification) {
        const source = notification && typeof notification === 'object' ? notification : {};
        const metadata = parseNotificationMetadata(source.metadata);
        if (String(metadata.cotizacion_id || metadata.quote_id || '').trim()) return 'Ir a la cotizacion';
        if (String(metadata.cliente_id || metadata.client_id || '').trim()) return 'Ir al perfil del cliente';
        return 'Abrir modulo';
    }

    function buildNotificationKicker(notification) {
        const source = notification && typeof notification === 'object' ? notification : {};
        const metadata = parseNotificationMetadata(source.metadata);
        const tenant = normalizeTenantSlug(metadata.tenant || metadata.tenant_slug || '');
        if (String(source.type || '').toLowerCase().includes('rejected')) return 'Documento rechazado';
        if (String(metadata.cotizacion_id || metadata.quote_id || '').trim()) return tenant === 'casa_de_piedra' ? 'Cotizacion CP' : 'Cotizacion PM';
        if (String(metadata.cliente_id || metadata.client_id || '').trim()) return tenant === 'casa_de_piedra' ? 'Cliente CP' : 'Cliente PM';
        return 'Notificacion';
    }

    function buildNotificationDetailRows(notification) {
        const source = notification && typeof notification === 'object' ? notification : {};
        const metadata = parseNotificationMetadata(source.metadata);
        const rows = [{ label: 'Fecha y hora', value: formatNotificationDateTime(source.created_at || source.updated_at || '') }];
        const actor = String(metadata.actor_nombre || metadata.actor_name || '').trim();
        const clientName = String(metadata.cliente_nombre || metadata.client_name || '').trim();
        const quoteFolio = String(metadata.cotizacion_folio || metadata.quote_folio || '').trim();
        const status = String(metadata.estado_actual || metadata.status || '').trim();
        const reason = String(metadata.motivo || metadata.reason || metadata.documento?.reason || '').trim();
        const docs = summarizeNotificationDocuments(metadata);
        const tenant = normalizeTenantSlug(metadata.tenant || metadata.tenant_slug || '');

        if (tenant) rows.push({ label: 'Tenant', value: tenant === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor' });
        if (actor) rows.push({ label: 'Usuario', value: actor });
        if (clientName) rows.push({ label: 'Cliente', value: clientName });
        if (quoteFolio) rows.push({ label: 'Cotizacion', value: quoteFolio });
        if (status) rows.push({ label: 'Estado', value: status });
        if (docs) rows.push({ label: 'Documento', value: docs });
        if (reason) rows.push({ label: 'Motivo', value: reason });
        return rows;
    }

    function renderNotificationDetailRows(rows) {
        const source = Array.isArray(rows) ? rows : [];
        if (!source.length) return '';
        return source.map((row) => `
            <div class="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">${escapeNotificationHtml(row.label)}</div>
                <div class="mt-1 text-sm font-semibold text-slate-700 leading-relaxed break-words">${escapeNotificationHtml(row.value)}</div>
            </div>
        `).join('');
    }

    function openLayoutNotificationDetail(notificationOrId) {
        const record = typeof notificationOrId === 'string'
            ? layoutNotifCache.get(String(notificationOrId).trim())
            : notificationOrId;
        if (!record) return;
        const modal = document.getElementById('global-notif-modal');
        if (!modal) return;
        const targetLink = buildNotificationTargetLink(record);
        const cta = document.getElementById('global-notif-modal-cta');
        document.getElementById('global-notif-modal-kicker').textContent = buildNotificationKicker(record);
        document.getElementById('global-notif-modal-title').textContent = String(record.title || 'Notificacion').trim() || 'Notificacion';
        document.getElementById('global-notif-modal-datetime').textContent = formatNotificationDateTime(record.created_at || record.updated_at || '');
        document.getElementById('global-notif-modal-message').textContent = String(record.message || 'Sin descripcion.').trim() || 'Sin descripcion.';
        document.getElementById('global-notif-modal-meta').innerHTML = renderNotificationDetailRows(buildNotificationDetailRows(record));
        if (cta) {
            cta.dataset.href = targetLink;
            cta.textContent = buildNotificationActionLabel(record);
            cta.classList.toggle('hidden', !targetLink || targetLink === '#');
        }
        layoutNotifActive = { ...record, __targetLink: targetLink };
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('global-notif-dropdown')?.classList.add('hidden');
    }

    function closeLayoutNotificationDetail() {
        const modal = document.getElementById('global-notif-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        layoutNotifActive = null;
    }

    function navigateLayoutNotification(targetUrl) {
        const destination = normalizeNotificationLink(targetUrl || layoutNotifActive?.__targetLink || '');
        if (!destination || destination === '#') return;
        closeLayoutNotificationDetail();
        if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
            window.__HUB_SAFE_NAVIGATE(destination, { allowSamePage: true });
        } else {
            window.location.href = destination;
        }
    }

    if (typeof window.__HUB_LAYOUT_READY_RESOLVE !== 'function' || !window.__HUB_LAYOUT_READY || typeof window.__HUB_LAYOUT_READY.then !== 'function') {
        window.__HUB_LAYOUT_READY = new Promise((resolve) => {
            window.__HUB_LAYOUT_READY_RESOLVE = resolve;
        });
    }
    window.__HUB_PAGE_ACCESS_DENIED = false;
    window.__HUB_PAGE_ACCESS_DENIED_REASON = '';

    let layoutReadyPublished = false;
    let layoutAuthEnsurePromise = null;
    const layoutAuthSubscribers = new Set();
    let layoutHeartbeatBound = false;
    const LAYOUT_CORE_PERMISSION_KEYS = Object.freeze([
        'access',
        'catalog_view',
        'catalog_manage',
        'orders_view',
        'orders_edit',
        'quotes_delete',
        'contracts_view',
        'contracts_generate',
        'receipts_view',
        'invoices_view',
        'reports_view',
        'clients_view',
        'clients_manage',
        'clients_create',
        'clients_verify',
        'clients_all_docs',
        'control_view',
        'pdf_layout_manage',
        'config_manage',
        'users_manage',
        'roles_manage',
        'permissions_manage'
    ]);

    function isTruthyAdminFlag(value) {
        if (value === true) return true;
        if (value === 1 || value === '1' || value === 'true') return true;
        return false;
    }

    function getLayoutAuthContextForRbac(inputCtx) {
        if (inputCtx && typeof inputCtx === 'object') return inputCtx;
        const payloadCtx = window.__HUB_LAYOUT_AUTH_STATE?.context;
        if (payloadCtx && typeof payloadCtx === 'object') return payloadCtx;
        return window.__HUB_AUTH_CONTEXT || null;
    }

    function resolveRbacTenantFromRoute(routeCtx) {
        const route = routeCtx && typeof routeCtx === 'object' ? routeCtx : resolveLayoutRouteContext();
        if (route?.tenant) return normalizeTenantSlug(route.tenant);
        return normalizeTenantSlug(window.__HUB_AUTH_CONTEXT?.route?.tenant || '');
    }

    function resolveRbacTenantFromOptions(opts = {}, authCtx = null) {
        const rawOpts = opts && typeof opts === 'object' ? opts : {};
        const tenantFromOpts = normalizeTenantSlug(rawOpts.tenant);
        if (tenantFromOpts) return tenantFromOpts;
        const routeTenant = resolveRbacTenantFromRoute(rawOpts.routeCtx);
        if (routeTenant) return routeTenant;
        const context = authCtx && typeof authCtx === 'object' ? authCtx : null;
        const contextRouteTenant = normalizeTenantSlug(context?.route?.tenant || '');
        if (contextRouteTenant) return contextRouteTenant;
        return '';
    }

    function ensureBooleanPermissionMap(input, { includeCore = true } = {}) {
        const src = input && typeof input === 'object' ? input : {};
        const out = {};
        Object.keys(src).forEach((key) => {
            out[key] = src[key] === true;
        });
        if (includeCore) {
            LAYOUT_CORE_PERMISSION_KEYS.forEach((key) => {
                if (!hasOwn(out, key)) out[key] = false;
            });
        }
        return out;
    }

    function resolveContextPermissionMap(authCtx, tenant) {
        const context = authCtx && typeof authCtx === 'object' ? authCtx : {};
        const map = context.permissionMap && typeof context.permissionMap === 'object'
            ? context.permissionMap
            : {};
        if (tenant && map[tenant] && typeof map[tenant] === 'object') {
            return ensureBooleanPermissionMap(map[tenant]);
        }
        if (!tenant && context.permissions && typeof context.permissions === 'object') {
            return ensureBooleanPermissionMap(context.permissions);
        }
        if (context.permissions && typeof context.permissions === 'object') {
            return ensureBooleanPermissionMap(context.permissions);
        }
        const profile = context.profile && typeof context.profile === 'object' ? context.profile : {};
        if (tenant && profile.effective_permissions_map && typeof profile.effective_permissions_map === 'object') {
            const explicit = profile.effective_permissions_map[tenant];
            if (explicit && typeof explicit === 'object') return ensureBooleanPermissionMap(explicit);
        }
        if (profile.effective_permissions && typeof profile.effective_permissions === 'object') {
            return ensureBooleanPermissionMap(profile.effective_permissions);
        }
        return ensureBooleanPermissionMap({});
    }

    function resolveRbacCan(action, options = {}) {
        const safeAction = String(action || '').trim();
        if (!safeAction) return false;
        const authCtx = getLayoutAuthContextForRbac(options.context);
        if (!authCtx?.session?.user) return false;
        if (isTruthyAdminFlag(authCtx.isAdmin) || isTruthyAdminFlag(authCtx.permissions?.is_admin)) return true;
        const tenant = resolveRbacTenantFromOptions(options, authCtx);
        if (tenant && authCtx.tenantAllowed === false && resolveRbacTenantFromRoute(authCtx.route) === tenant) return false;
        const perms = resolveContextPermissionMap(authCtx, tenant);
        const tenantPermissionMap = authCtx.permissionMap && typeof authCtx.permissionMap === 'object'
            ? authCtx.permissionMap
            : {};
        const allowedTenants = Array.isArray(authCtx.allowedTenants) ? authCtx.allowedTenants : [];
        if (safeAction === 'access') {
            if (tenant && Array.isArray(authCtx.allowedTenants) && authCtx.allowedTenants.length) {
                return authCtx.allowedTenants.includes(tenant) && perms.access === true;
            }
            if (!tenant) {
                const tenantKeys = Object.keys(tenantPermissionMap);
                for (let i = 0; i < tenantKeys.length; i += 1) {
                    const tenantKey = normalizeTenantSlug(tenantKeys[i]);
                    if (!tenantKey) continue;
                    if (allowedTenants.length && !allowedTenants.includes(tenantKey)) continue;
                    const tenantPerms = resolveContextPermissionMap(authCtx, tenantKey);
                    if (tenantPerms.access === true) return true;
                }
            }
            return perms.access === true;
        }
        if (hasOwn(perms, safeAction)) return perms[safeAction] === true;
        if (!tenant) {
            const tenantKeys = Object.keys(tenantPermissionMap);
            for (let i = 0; i < tenantKeys.length; i += 1) {
                const tenantKey = normalizeTenantSlug(tenantKeys[i]);
                if (!tenantKey) continue;
                if (allowedTenants.length && !allowedTenants.includes(tenantKey)) continue;
                const tenantPerms = resolveContextPermissionMap(authCtx, tenantKey);
                if (tenantPerms[safeAction] === true) return true;
            }
        }
        return false;
    }

    function resolveRbacCanAny(actions, options = {}) {
        const list = Array.isArray(actions) ? actions : [actions];
        return list.some((action) => resolveRbacCan(action, options));
    }

    function resolveRbacCanAll(actions, options = {}) {
        const list = Array.isArray(actions) ? actions : [actions];
        if (!list.length) return false;
        return list.every((action) => resolveRbacCan(action, options));
    }

    function applyRbacVisibilityToNode(node, visible) {
        if (!(node instanceof Element)) return;
        node.classList.toggle('hidden', !visible);
        node.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function parseRbacPermissionList(raw) {
        return String(raw || '')
            .split(',')
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    function refreshRbacDomBindings(root = document) {
        const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
        scope.querySelectorAll('[data-rbac-any]').forEach((node) => {
            const actions = parseRbacPermissionList(node.getAttribute('data-rbac-any'));
            const tenant = node.getAttribute('data-rbac-tenant') || '';
            const visible = resolveRbacCanAny(actions, tenant ? { tenant } : {});
            applyRbacVisibilityToNode(node, visible);
        });
        scope.querySelectorAll('[data-rbac-all]').forEach((node) => {
            const actions = parseRbacPermissionList(node.getAttribute('data-rbac-all'));
            const tenant = node.getAttribute('data-rbac-tenant') || '';
            const visible = resolveRbacCanAll(actions, tenant ? { tenant } : {});
            applyRbacVisibilityToNode(node, visible);
        });
    }

    window.HUB_RBAC = {
        getContext(context) {
            return getLayoutAuthContextForRbac(context);
        },
        getPermissions(options = {}) {
            const authCtx = getLayoutAuthContextForRbac(options.context);
            const tenant = resolveRbacTenantFromOptions(options, authCtx);
            return resolveContextPermissionMap(authCtx, tenant);
        },
        can(action, options = {}) {
            return resolveRbacCan(action, options);
        },
        canAny(actions, options = {}) {
            return resolveRbacCanAny(actions, options);
        },
        canAll(actions, options = {}) {
            return resolveRbacCanAll(actions, options);
        },
        isAdmin(context) {
            const authCtx = getLayoutAuthContextForRbac(context);
            return isTruthyAdminFlag(authCtx?.isAdmin) || isTruthyAdminFlag(authCtx?.permissions?.is_admin);
        },
        guard(actions, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const modeAll = opts.requireAll === true;
            const allowed = modeAll
                ? resolveRbacCanAll(actions, opts)
                : resolveRbacCanAny(actions, opts);
            if (allowed) return true;
            const redirectUrl = String(opts.redirectUrl || (pathPrefix + 'index.html')).trim();
            const shouldRedirect = opts.redirect !== false;
            if (opts.toast !== false && typeof window.showToast === 'function') {
                window.showToast(String(opts.message || 'No tienes permisos para acceder a este módulo.'), 'error');
            }
            if (shouldRedirect && redirectUrl) {
                if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
                    window.__HUB_SAFE_NAVIGATE(redirectUrl, { allowSamePage: true });
                } else {
                    window.location.href = redirectUrl;
                }
            }
            return false;
        },
        refreshBindings(root) {
            refreshRbacDomBindings(root);
        }
    };

    function buildLayoutAuthEventPayload(context, reason = 'update') {
        const authCtx = context || null;
        return {
            reason: String(reason || 'update'),
            route: authCtx?.route || resolveLayoutRouteContext(),
            context: authCtx,
            session: authCtx?.session || null,
            user: authCtx?.user || authCtx?.session?.user || null,
            profile: authCtx?.profile || authCtx?.user || authCtx?.session?.user || null,
            permissions: authCtx?.permissions || {},
            role: authCtx?.role || '',
            tenantAllowed: authCtx?.tenantAllowed === true,
            isAdmin: isTruthyAdminFlag(authCtx?.isAdmin),
            canAccessCurrentRoute: authCtx?.canAccessCurrentRoute !== false,
            isAuthenticated: !!(authCtx?.session?.user),
            ts: Date.now()
        };
    }

    function notifyLayoutAuthSubscribers(context, reason = 'update') {
        const payload = buildLayoutAuthEventPayload(context, reason);
        try { window.__HUB_LAYOUT_AUTH_STATE = payload; } catch (_) {}
        try { window.HUB_RBAC?.refreshBindings?.(); } catch (_) {}
        layoutAuthSubscribers.forEach((listener) => {
            try { listener(payload); } catch (_) {}
        });
        try {
            window.dispatchEvent(new CustomEvent('hub:auth-state', { detail: payload }));
        } catch (_) {}
        return payload;
    }

    function publishLayoutReady(context, options = {}) {
        const payload = context || null;
        try { window.__HUB_AUTH_CONTEXT = payload; } catch (_) {}
        notifyLayoutAuthSubscribers(payload, options.reason || (layoutReadyPublished ? 'refresh' : 'ready'));
        if (!layoutReadyPublished) {
            layoutReadyPublished = true;
            try {
                const resolve = window.__HUB_LAYOUT_READY_RESOLVE;
                if (typeof resolve === 'function') resolve(payload);
            } catch (_) {}
            try { window.__HUB_LAYOUT_READY_RESOLVE = null; } catch (_) {}
        }
        return payload;
    }

    function resolveLayoutDisplayName(profile, sessionUser) {
        const identity = (profile && typeof profile === 'object') ? profile : {};
        const fallbackUser = (sessionUser && typeof sessionUser === 'object') ? sessionUser : {};
        const username = String(
            identity.username
            || identity.login_username
            || identity.full_name
            || identity.name
            || fallbackUser.username
            || fallbackUser.login_username
            || ''
        ).trim();
        if (username) return username;
        const email = String(identity.email || fallbackUser.email || '').trim();
        if (!email) return 'Usuario';
        const simpleName = email.split('@')[0] || 'Usuario';
        return simpleName.charAt(0).toUpperCase() + simpleName.slice(1);
    }

    function syncLayoutIdentityCache(authCtx) {
        const sessionUser = authCtx?.user || authCtx?.session?.user || null;
        const profile = authCtx?.profile || sessionUser || null;
        const displayName = resolveLayoutDisplayName(profile, sessionUser);
        const email = String(sessionUser?.email || profile?.email || '').trim();
        localStorage.setItem('hub_user_cache_name', displayName || 'Usuario');
        localStorage.setItem('hub_user_cache_email', email || '');
        updateHeaderInfo(displayName, email);
        return { displayName, email };
    }

    function applyResolvedLayoutAuthContext(authCtx, options = {}) {
        const ctx = authCtx || null;
        const reason = options.reason || 'resolved';
        try { window.currentUserProfile = ctx?.profile || ctx?.user || ctx?.session?.user || null; } catch (_) {}
        try { window.currentUserPermissions = ctx?.permissions || {}; } catch (_) {}
        myId = String(ctx?.user?.id || ctx?.session?.user?.id || '').trim();
        if (ctx?.session?.user) syncLayoutIdentityCache(ctx);
        applyLayoutNavPermissions(ctx);
        publishLayoutReady(ctx, { reason });
        return ctx;
    }

    function shouldDeferSystemPageAuth(routeCtx) {
        return !!routeCtx?.isSystem && window.__HUB_SYSTEM_PAGE_MANAGES_AUTH === true;
    }

    function redirectLayoutToLogin(routeCtx, reason = 'missing_session') {
        const route = routeCtx || resolveLayoutRouteContext();
        if (shouldDeferSystemPageAuth(route)) return false;
        if (route.isLoginPage || window.__HUB_SUPPRESS_AUTO_REDIRECTS === true) return false;
        window.__HUB_PAGE_ACCESS_DENIED = true;
        window.__HUB_PAGE_ACCESS_DENIED_REASON = String(reason || 'missing_session');
        try { window.__HUB_ALLOW_NEXT_UNLOAD?.(`layout_${reason}`); } catch (_) {}
        
        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        const destination = route.redirectUrl + '?redirect=' + currentUrl;
        
        if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
            window.__HUB_SAFE_NAVIGATE(destination, { allowSamePage: true });
        } else {
            window.location.href = destination;
        }
        return true;
    }

    async function resolveManagedLayoutAuthContext(options = {}) {
        const opts = (options && typeof options === 'object') ? options : {};
        const routeCtx = opts.routeCtx || resolveLayoutRouteContext();
        if (layoutAuthEnsurePromise && opts.forceRefresh !== true) return layoutAuthEnsurePromise;

        const currentCtx = window.__HUB_AUTH_CONTEXT || null;
        if (!opts.forceRefresh && currentCtx?.session?.user) {
            if (opts.requireAccess === false || canAccessCurrentRoute(routeCtx, currentCtx)) return currentCtx;
        }

        layoutAuthEnsurePromise = (async () => {
            let session = null;
            try {
                session = await window.PB_SERVICES?.auth?.ensureFreshSession?.({
                    schema: opts.schema || ((typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA) ? TENANT_SCHEMA : FIN_SCHEMA),
                    allowStaleOnError: false,
                    forceRefresh: opts.forceRefresh === true
                });
            } catch (_) {
                session = null;
            }

            if (!session?.user) {
                try {
                    const authState = await window.PB_SERVICES?.auth?.bootstrap?.({
                        schema: opts.schema || ((typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA) ? TENANT_SCHEMA : FIN_SCHEMA),
                        retries: 1,
                        delayMs: 120
                    });
                    session = authState?.session || null;
                } catch (_) {
                    session = null;
                }
            }

            if (!session?.user) {
                publishLayoutReady({
                    route: routeCtx,
                    session: null,
                    user: null,
                    profile: null,
                    permissions: {},
                    role: '',
                    tenantAllowed: false,
                    isAdmin: false,
                    canAccessCurrentRoute: false,
                    deniedReason: 'missing_session'
                }, { reason: 'layout_manager_missing_session' });
                if (opts.redirectOnFail !== false && !shouldDeferSystemPageAuth(routeCtx)) {
                    redirectLayoutToLogin(routeCtx, 'missing_session');
                }
                return null;
            }

            let authCtx = null;
            try {
                const data = await loadLayoutIdentity(session.user);
                authCtx = {
                    route: routeCtx,
                    session,
                    user: session.user,
                    profile: data,
                    ...buildLayoutPermissions(data, routeCtx)
                };
            } catch (_) {
                const fallbackProfile = session?.user && typeof session.user === 'object'
                    ? { ...session.user }
                    : {};
                authCtx = {
                    route: routeCtx,
                    session,
                    user: session.user,
                    profile: fallbackProfile,
                    ...buildLayoutPermissions(fallbackProfile, routeCtx)
                };
            }
            authCtx.canAccessCurrentRoute = canAccessCurrentRoute(routeCtx, authCtx);
            applyResolvedLayoutAuthContext(authCtx, {
                reason: opts.forceRefresh === true ? 'layout_manager_refresh' : 'layout_manager'
            });

            if (authCtx.canAccessCurrentRoute === false && opts.requireAccess !== false) {
                if (opts.redirectOnFail !== false && !shouldDeferSystemPageAuth(routeCtx)) {
                    window.__HUB_PAGE_ACCESS_DENIED = true;
                    window.__HUB_PAGE_ACCESS_DENIED_REASON = authCtx.tenantAllowed ? 'insufficient_permissions' : 'tenant_forbidden';
                    redirectLayoutToLogin(routeCtx, window.__HUB_PAGE_ACCESS_DENIED_REASON);
                }
            }
            return authCtx;
        })();

        try {
            return await layoutAuthEnsurePromise;
        } finally {
            layoutAuthEnsurePromise = null;
        }
    }

    function installLayoutSessionHeartbeat(routeCtx) {
        if (layoutHeartbeatBound) return;
        layoutHeartbeatBound = true;
        const guardedEnsure = () => {
            if (document.visibilityState === 'hidden') return;
            resolveManagedLayoutAuthContext({
                routeCtx,
                requireAccess: false,
                forceRefresh: true,
                redirectOnFail: !routeCtx?.isLoginPage
            }).catch(function () {
                if (!routeCtx?.isLoginPage) redirectLayoutToLogin(routeCtx, 'missing_session');
            });
        };
        const handleSessionCleared = (event) => {
            if (routeCtx?.isLoginPage) return;
            const reason = String(event?.detail?.reason || 'session_cleared').trim() || 'session_cleared';
            redirectLayoutToLogin(routeCtx, reason);
        };
        window.addEventListener('focus', guardedEnsure);
        window.addEventListener('pageshow', guardedEnsure);
        window.addEventListener('hub:session-cleared', handleSessionCleared);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState !== 'visible') return;
            guardedEnsure();
        });
    }

    window.HUB_SESSION = {
        waitUntilReady() {
            if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') return window.__HUB_LAYOUT_READY;
            return Promise.resolve(window.__HUB_AUTH_CONTEXT || null);
        },
        getContext() {
            return window.__HUB_AUTH_CONTEXT || null;
        },
        getSession() {
            return window.__HUB_AUTH_CONTEXT?.session || null;
        },
        getUser() {
            return window.__HUB_AUTH_CONTEXT?.user || window.__HUB_AUTH_CONTEXT?.session?.user || null;
        },
        getProfile() {
            return window.__HUB_AUTH_CONTEXT?.profile || this.getUser();
        },
        getPermissions() {
            return window.__HUB_AUTH_CONTEXT?.permissions || {};
        },
        isAuthenticated() {
            return !!this.getUser();
        },
        async ensureAuth(options = {}) {
            if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
                try { await window.__HUB_LAYOUT_READY; } catch (_) {}
            }
            return resolveManagedLayoutAuthContext(options);
        },
        async refresh(options = {}) {
            return resolveManagedLayoutAuthContext({
                ...(options && typeof options === 'object' ? options : {}),
                forceRefresh: true
            });
        },
        async logout(options = {}) {
            const opts = (options && typeof options === 'object') ? options : {};
            localStorage.removeItem('hub_user_cache_name');
            localStorage.removeItem('hub_user_cache_email');
            localStorage.removeItem('hub_user_cache_role');
            localStorage.removeItem(SHARED_AUTH_ACTIVITY_KEY);
            writeLayoutSessionState(LAYOUT_LAST_GOOD_AUTH_KEY, null);
            try { sessionStorage.removeItem(SHARED_AUTH_ACTIVITY_KEY); } catch (_) {}
            try { window.currentUserProfile = null; } catch (_) {}
            try { window.currentUserPermissions = {}; } catch (_) {}
            publishLayoutReady({
                route: resolveLayoutRouteContext(),
                session: null,
                user: null,
                profile: null,
                permissions: {},
                role: '',
                tenantAllowed: false,
                isAdmin: false,
                canAccessCurrentRoute: false,
                deniedReason: 'logout'
            }, { reason: 'logout' });
            try {
                if (layoutClient && layoutClient.auth && typeof layoutClient.auth.signOut === 'function') {
                    await layoutClient.auth.signOut();
                } else {
                    await window.PB_SERVICES?.auth?.logout?.();
                }
            } catch (_) {}
            if (opts.redirect !== false) {
                window.location.href = (opts.redirectUrl || (pathPrefix + 'index.html'));
            }
            return true;
        },
        touchActivity(force = true) {
            try { return window.PB_SERVICES?.auth?.touchActivity?.(force === true) || 0; } catch (_) { return 0; }
        },
        subscribe(listener) {
            if (typeof listener !== 'function') return function () {};
            layoutAuthSubscribers.add(listener);
            try {
                if (window.__HUB_LAYOUT_AUTH_STATE) listener(window.__HUB_LAYOUT_AUTH_STATE);
            } catch (_) {}
            return function unsubscribe() {
                layoutAuthSubscribers.delete(listener);
            };
        }
    };
    window.__HUB_REQUIRE_AUTH = function(options = {}) {
        return window.HUB_SESSION.ensureAuth(options);
    };

    function normalizeLayoutRole(value) {
        let safe = String(value || '').trim().toLowerCase();
        if (!safe) return '';
        if (typeof safe.normalize === 'function') safe = safe.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        safe = safe.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        // Aliases de tenant para compatibilidad de datos legacy (no seguridad)
        if (safe === 'alta_clientes' || safe === 'alta_clientes_role' || safe === 'alta_de_clientes') return 'alta_clientes';
        if (safe === 'both' || safe === 'ambos' || safe === 'user' || safe === 'usuario') return '';
        if (safe === 'plazamayor' || safe === 'plaza_mayor' || safe === 'pm' || safe === 'finanzas') return 'plaza_mayor';
        if (safe === 'casadepiedra' || safe === 'casa_de_piedra' || safe === 'cp') return 'casa_de_piedra';
        // NOTA: NO se mapean aliases de admin — is_admin viene del engine RBAC (grants_admin=true).
        return safe;
    }

    function normalizeTenantSlug(value) {
        const safe = String(value || '').trim().toLowerCase();
        if (!safe) return '';
        if (safe === 'pm' || safe === 'plaza mayor' || safe === 'plaza_mayor') return 'plaza_mayor';
        if (safe === 'cp' || safe === 'casa de piedra' || safe === 'casa_de_piedra') return 'casa_de_piedra';
        if (safe === 'ambos' || safe === 'both') return 'ambos';
        return safe;
    }

    function normalizeTenantList(input, fallbackTenant) {
        const values = Array.isArray(input)
            ? input
            : (input == null || input === '' ? [] : [input]);
        const unique = new Set();
        values.forEach((item) => {
            const normalized = normalizeTenantSlug(item);
            if (!normalized) return;
            if (normalized === 'ambos') {
                unique.add('plaza_mayor');
                unique.add('casa_de_piedra');
                return;
            }
            unique.add(normalized);
        });
        const fallback = normalizeTenantSlug(fallbackTenant);
        if (fallback && fallback !== 'ambos') unique.add(fallback);
        return Array.from(unique);
    }

    function resolveLayoutRouteContext() {
        const path = String(window.location.pathname || '').toLowerCase();
        const file = path.split('/').pop().split('?')[0].split('#')[0];
        const isPM = /\/cotizador(\/|$)/.test(path);
        const isCP = /\/cotizadorcp(\/|$)/.test(path);
        const isSystem = /\/system(\/|$)/.test(path);
        const isLoginPage = file === 'index.html' && !path.includes('/calendar/');
        return {
            path,
            file,
            isPM,
            isCP,
            isSystem,
            isCotizadorArea: isPM || isCP,
            isLoginPage,
            tenant: isPM ? 'plaza_mayor' : (isCP ? 'casa_de_piedra' : null),
            redirectUrl: pathPrefix + 'index.html'
        };
    }

    const LAYOUT_LAST_GOOD_AUTH_KEY = 'hub_layout_last_good_auth_v1';
    const SHARED_AUTH_ACTIVITY_KEY = 'hub_auth_last_activity_v1';
    const LAYOUT_ROUTE_STABILITY_KEY = 'hub_layout_route_stability_v1';
    const LAYOUT_SCROLL_STATE_PREFIX = 'hub_layout_scroll_v1:';
    const LAYOUT_SCROLL_RESTORE_STEPS = [0, 120, 320, 700, 1400];
    let layoutScrollSaveRaf = 0;

    function readLayoutSessionState(key) {
        try {
            const raw = sessionStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function writeLayoutSessionState(key, value) {
        try {
            if (!value) {
                sessionStorage.removeItem(key);
                return;
            }
            sessionStorage.setItem(key, JSON.stringify(value));
        } catch (_) {}
    }

    function currentLayoutScrollKey() {
        const path = String(window.location.pathname || '').toLowerCase();
        const search = String(window.location.search || '');
        return `${LAYOUT_SCROLL_STATE_PREFIX}${path}${search}`;
    }

    function readLayoutScrollState() {
        return readLayoutSessionState(currentLayoutScrollKey());
    }

    function writeLayoutScrollState(value) {
        writeLayoutSessionState(currentLayoutScrollKey(), value);
    }

    function getRootScrollY() {
        return Math.max(
            0,
            Number(window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) || 0
        );
    }

    function persistLayoutScrollPosition(reason = 'auto') {
        writeLayoutScrollState({
            y: Math.max(0, Math.round(getRootScrollY())),
            ts: Date.now(),
            reason: String(reason || 'auto').slice(0, 40)
        });
    }

    function scheduleLayoutScrollPersist(reason = 'scroll') {
        if (window.__HUB_SCROLL_RESTORING === true || layoutScrollSaveRaf) return;
        layoutScrollSaveRaf = window.requestAnimationFrame(function () {
            layoutScrollSaveRaf = 0;
            persistLayoutScrollPosition(reason);
        });
    }

    function restoreLayoutScrollPosition(options = {}) {
        const navEntry = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
            ? performance.getEntriesByType('navigation')[0]
            : null;
        const navType = String(navEntry?.type || '');
        const shouldRestore = options.force === true || navType === 'reload' || navType === 'back_forward';
        if (!shouldRestore) return false;
        const state = readLayoutScrollState();
        const targetY = Math.max(0, Math.round(Number(state?.y || 0) || 0));
        if (!targetY) return false;

        window.__HUB_SCROLL_RESTORING = true;
        const maxDelay = Math.max.apply(null, LAYOUT_SCROLL_RESTORE_STEPS);
        LAYOUT_SCROLL_RESTORE_STEPS.forEach((delay) => {
            window.setTimeout(() => {
                const maxY = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
                window.scrollTo(0, Math.min(targetY, maxY));
            }, delay);
        });
        window.setTimeout(() => {
            window.__HUB_SCROLL_RESTORING = false;
            persistLayoutScrollPosition('restore_complete');
        }, maxDelay + 180);
        return true;
    }

    function markLayoutRouteLoad(routeCtx) {
        const now = Date.now();
        const currentPath = String(routeCtx?.path || window.location.pathname || '').toLowerCase();
        const prev = readLayoutSessionState(LAYOUT_ROUTE_STABILITY_KEY) || {};
        const withinWindow = prev.path === currentPath && (now - Number(prev.lastTs || 0)) < 45000;
        const hits = withinWindow ? (Number(prev.hits || 0) + 1) : 1;
        const navEntry = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
            ? performance.getEntriesByType('navigation')[0]
            : null;
        const state = {
            path: currentPath,
            lastTs: now,
            hits,
            navType: String(navEntry?.type || 'unknown'),
            tenant: routeCtx?.tenant || null
        };
        writeLayoutSessionState(LAYOUT_ROUTE_STABILITY_KEY, state);
        return {
            ...state,
            suppressAutoRedirects: !!routeCtx?.isCotizadorArea && hits >= 3
        };
    }

    function hasOwn(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    // Recuperación global de sesión: ante un 401 de la API se intenta UNA renovación
    // silenciosa del token; si falla, se redirige al login una sola vez.
    // Los 403 NO recargan ni redirigen: la autoridad es el backend (API rules + engine),
    // cada módulo muestra su error y la UI sigue utilizable. El interceptor anterior
    // recargaba la página ante cualquier 401/403 y convertía un permiso denegado
    // en un bucle infinito de recargas ("pestaña bloqueada").
    (function installSessionRecoveryGuard() {
        if (window.__HUB_RBAC_GUARD_INSTALLED) return;
        window.__HUB_RBAC_GUARD_INSTALLED = true;

        let recoveringSession = false;

        function isSessionEndpoint(url) {
            return /\/api\/hub\/session\//.test(String(url || ''));
        }

        function handleUnauthorized(url) {
            if (recoveringSession) return;
            if (window.HUB_IS_LOGIN_PAGE || document.getElementById('login-form')) return;
            if (isSessionEndpoint(url)) return;
            recoveringSession = true;
            Promise.resolve()
                .then(() => window.PB_SERVICES?.auth?.refreshSession?.())
                .then((session) => {
                    if (session?.user) return; // token renovado: los siguientes requests ya pasan
                    redirectLayoutToLogin(resolveLayoutRouteContext(), 'session_expired');
                })
                .catch(() => {
                    redirectLayoutToLogin(resolveLayoutRouteContext(), 'session_expired');
                })
                .finally(() => {
                    setTimeout(() => { recoveringSession = false; }, 5000);
                });
        }

        let lastForbiddenToastAt = 0;
        function handleForbidden(url) {
            if (isSessionEndpoint(url)) return;
            const now = Date.now();
            if (now - lastForbiddenToastAt < 2500) return;
            lastForbiddenToastAt = now;
            const message = 'No tienes permisos para realizar esta acción.';
            if (typeof window.showToast === 'function') {
                window.showToast(message, 'warning');
            } else if (typeof window._toast === 'function') {
                window._toast(message, 'warning');
            }
        }

        const origFetch = window.fetch;
        if (origFetch) {
            window.fetch = async function(...args) {
                const res = await origFetch.apply(this, args);
                if (res && res.status === 401) {
                    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                    if (url.includes('/api/')) handleUnauthorized(url);
                } else if (res && res.status === 403) {
                    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                    if (url.includes('/api/')) handleForbidden(url);
                }
                return res;
            };
        }

        const origXHRSend = XMLHttpRequest.prototype.send;
        if (origXHRSend) {
            XMLHttpRequest.prototype.send = function(...args) {
                this.addEventListener('load', function() {
                    if (this.responseURL && this.responseURL.includes('/api/')) {
                        if (this.status === 401) handleUnauthorized(this.responseURL);
                        else if (this.status === 403) handleForbidden(this.responseURL);
                    }
                });
                return origXHRSend.apply(this, args);
            };
        }
    })();

    function resolveRoutePermission(perms, key, fallbackAccess) {
        if (!perms || typeof perms !== 'object') return false;
        // is_admin es un permiso sintético escrito por el engine, no un permiso CORE real
        if (isTruthyAdminFlag(perms.is_admin)) return true;
        if (hasOwn(perms, key) && !!perms[key]) return true;
        if (key === 'catalog_view') {
            return !!perms.catalog_manage || !!perms.catalog_view;
        }
        if (key === 'orders_view') {
            return !!perms.orders_view || !!perms.orders_edit || !!perms.quotes_delete || !!perms.contracts_generate || !!perms.contracts_view || !!perms.receipts_view || !!perms.invoices_view;
        }
        if (key === 'reports_view') {
            return !!perms.reports_view || !!perms.reports_manage;
        }
        if (key === 'control_view') {
            return !!perms.control_view || !!perms.control_manage;
        }
        return false;
    }

    function resolveOrderModulePermission(perms, moduleKey, fallbackAccess) {
        if (!perms || typeof perms !== 'object') return false;
        if (isTruthyAdminFlag(perms.is_admin)) return true;
        if (hasOwn(perms, moduleKey) && !!perms[moduleKey]) return true;
        if (hasOwn(perms, 'orders_edit') && !!perms.orders_edit) return true;
        return false;
    }

    function resolveClientsPermission(perms, fallbackAccess) {
        if (!perms || typeof perms !== 'object') return false;
        if (isTruthyAdminFlag(perms.is_admin)) return true;
        if (hasOwn(perms, 'clients_view') || hasOwn(perms, 'clients_manage') || hasOwn(perms, 'clients_verify') || hasOwn(perms, 'clients_create')) {
            return !!perms.clients_view || !!perms.clients_manage || !!perms.clients_verify || !!perms.clients_create;
        }
        return false;
    }

    // ponytail: única puerta is_admin en frontend — alineada con buildSessionUser() del backend
    function resolveProfileIsAdmin(profile) {
        if (!profile || typeof profile !== 'object') return false;
        if (isTruthyAdminFlag(profile.is_admin) || isTruthyAdminFlag(profile.rbac_is_admin)) return true;
        const rbacMeta = profile.app_metadata && typeof profile.app_metadata === 'object'
            ? profile.app_metadata.rbac
            : null;
        return !!(rbacMeta && typeof rbacMeta === 'object' && isTruthyAdminFlag(rbacMeta.is_admin));
    }

    const LAYOUT_SESSION_RBAC_KEYS = Object.freeze([
        'is_admin',
        'effective_permissions',
        'effective_permissions_map',
        'permissions',
        'rbac_mode',
        'rbac_version'
    ]);

    function mergeSessionRbacProfile(sessionUser, appUser) {
        const session = sessionUser && typeof sessionUser === 'object' ? sessionUser : {};
        const app = appUser && typeof appUser === 'object' ? appUser : {};
        const merged = { ...session, ...app };
        LAYOUT_SESSION_RBAC_KEYS.forEach((key) => {
            if (session[key] !== undefined && session[key] !== null) merged[key] = session[key];
        });
        const sessionMeta = session.app_metadata && typeof session.app_metadata === 'object' ? session.app_metadata : null;
        const appMeta = app.app_metadata && typeof app.app_metadata === 'object' ? app.app_metadata : null;
        if (sessionMeta || appMeta) {
            const sessionRbac = sessionMeta?.rbac && typeof sessionMeta.rbac === 'object' ? sessionMeta.rbac : {};
            const appRbac = appMeta?.rbac && typeof appMeta.rbac === 'object' ? appMeta.rbac : {};
            merged.app_metadata = {
                ...(appMeta || {}),
                ...(sessionMeta || {}),
                rbac: { ...appRbac, ...sessionRbac },
                finanzas: {
                    ...(appMeta?.finanzas && typeof appMeta.finanzas === 'object' ? appMeta.finanzas : {}),
                    ...(sessionMeta?.finanzas && typeof sessionMeta.finanzas === 'object' ? sessionMeta.finanzas : {}),
                },
            };
        }
        return merged;
    }

    function resolveControlPermission(authCtx) {
        if (isTruthyAdminFlag(authCtx?.isAdmin)) return true;
        const perms = authCtx && authCtx.permissions && typeof authCtx.permissions === 'object'
            ? authCtx.permissions
            : {};
        return !!perms.control_view || !!perms.control_manage;
    }

    function buildLayoutPermissions(identity, routeCtx) {
        const profile = identity && typeof identity === 'object' ? identity : {};
        const role = normalizeLayoutRole(profile.role || profile.rol || '');
        const defaultTenant = normalizeTenantSlug(profile.tenant_default || profile.default_tenant || '');
        const allowedTenants = normalizeTenantList(profile.allowed_tenants, defaultTenant);
        const appMeta = profile.app_metadata && typeof profile.app_metadata === 'object' ? profile.app_metadata : {};
        const rbacMeta = appMeta.rbac && typeof appMeta.rbac === 'object' ? appMeta.rbac : {};
        const explicitMap = profile.effective_permissions_map && typeof profile.effective_permissions_map === 'object'
            ? profile.effective_permissions_map
            : (rbacMeta.effective && typeof rbacMeta.effective === 'object' ? rbacMeta.effective : {});
        const permissionsByTenant = {};
        Object.keys(explicitMap || {}).forEach((tenantKey) => {
            const normalizedTenant = normalizeTenantSlug(tenantKey);
            if (!normalizedTenant || normalizedTenant === 'ambos') return;
            const value = explicitMap[tenantKey];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                permissionsByTenant[normalizedTenant] = ensureBooleanPermissionMap(value, { includeCore: false });
            }
        });
        const directPermissions = profile.effective_permissions && typeof profile.effective_permissions === 'object'
            ? ensureBooleanPermissionMap(profile.effective_permissions, { includeCore: false })
            : ensureBooleanPermissionMap({}, { includeCore: false });
        const tenant = routeCtx && routeCtx.tenant ? routeCtx.tenant : null;
        const tenantPermissions = tenant && permissionsByTenant[tenant]
            ? { ...permissionsByTenant[tenant] }
            : {};
        const hasTenantPermissionObject = Object.keys(tenantPermissions).length > 0;
        const permissions = hasTenantPermissionObject
            ? tenantPermissions
            : { ...(directPermissions && typeof directPermissions === 'object' ? directPermissions : {}) };

        let tenantAllowed = !tenant
            || allowedTenants.includes(tenant);
        if (tenant && permissions.access === false) tenantAllowed = false;

        if (!hasOwn(permissions, 'access')) {
            permissions.access = tenant ? !!tenantAllowed : true;
        } else if (tenant && !tenantAllowed) {
            permissions.access = false;
        }

        const isAdminByPermission = resolveProfileIsAdmin(profile);

        if (isAdminByPermission) {
            permissions.is_admin = true;
            tenantAllowed = true;
            permissions.access = true;
            LAYOUT_CORE_PERMISSION_KEYS.forEach((key) => {
                permissions[key] = true;
            });
        }
        if (permissions.catalog_manage) permissions.catalog_view = true;
        if (permissions.orders_edit || permissions.quotes_delete || permissions.contracts_generate || permissions.contracts_view || permissions.receipts_view || permissions.invoices_view) permissions.orders_view = true;
        if (permissions.clients_manage || permissions.clients_create || permissions.clients_verify) permissions.clients_view = true;
        if (permissions.control_manage) permissions.control_view = true;

        return {
            role,
            allowedTenants,
            defaultTenant: defaultTenant || null,
            tenantAllowed: !!tenantAllowed,
            permissions,
            rawPermissions: { ...permissions },
            permissionMap: permissionsByTenant,
            isAdmin: isAdminByPermission,
            effective: {
                is_admin: isAdminByPermission,
                permissions: { ...permissions },
                tenant: tenant || defaultTenant || null
            }
        };
    }

    function canAccessCurrentRoute(routeCtx, authCtx) {
        if (!routeCtx) return true;
        if (routeCtx.isLoginPage) return true;
        if (!authCtx || !authCtx.session || !authCtx.session.user) return false;
        if (isTruthyAdminFlag(authCtx.isAdmin) || isTruthyAdminFlag(authCtx.permissions?.is_admin)) return true;
        if (routeCtx.isSystem) {
            const systemPerms = authCtx.permissions || {};
            if (routeCtx.file === 'config.html') {
                return isTruthyAdminFlag(authCtx.isAdmin)
                    || !!systemPerms.config_manage
                    || !!systemPerms.catalog_manage
                    || !!systemPerms.pdf_layout_manage
                    || !!systemPerms.users_manage
                    || !!systemPerms.roles_manage
                    || !!systemPerms.permissions_manage;
            }
            return isTruthyAdminFlag(authCtx.isAdmin)
                || !!systemPerms.config_manage
                || !!systemPerms.catalog_manage
                || !!systemPerms.pdf_layout_manage
                || !!systemPerms.permissions_manage
                || !!systemPerms.users_manage;
        }
        if (!routeCtx.tenant) return true;
        if (authCtx.tenantAllowed !== true) return false;

        const perms = authCtx.permissions || {};
        const accessFallback = perms.access === true;

        switch (routeCtx.file) {
            case 'catalog.html':
                return resolveRoutePermission(perms, 'catalog_view', accessFallback);
            case 'agenda.html':
            case 'montajes.html':
            case 'orders.html':
            case 'order_detail.html':
            case 'cotizacion.html':
                return resolveRoutePermission(perms, 'orders_view', accessFallback);
            case 'contracts.html':
                return resolveOrderModulePermission(perms, 'contracts_view', accessFallback);
            case 'receipts.html':
                return resolveOrderModulePermission(perms, 'receipts_view', accessFallback);
            case 'invoices.html':
                return resolveOrderModulePermission(perms, 'invoices_view', accessFallback);
            case 'reports.html':
            case 'report.html':
                return resolveRoutePermission(perms, 'reports_view', accessFallback);
            case 'clientes.html':
                return resolveClientsPermission(perms, accessFallback);
            case 'control.html':
                return resolveRoutePermission(perms, 'control_view', resolveControlPermission(authCtx));
            default:
                return !!accessFallback;
        }
    }

    function getLayoutNavFile(link) {
        const rawHref = String(link?.getAttribute?.('href') || link?.getAttribute?.('data-href') || '').trim();
        if (!rawHref) return '';
        const cleanHref = rawHref.split('#')[0].split('?')[0].replace(/\\/g, '/');
        return String(cleanHref.split('/').pop() || '').trim().toLowerCase();
    }

    function applyLayoutNavPermissions(authCtx) {
        if (!authCtx || !authCtx.permissions) return;
        const isAdmin = isTruthyAdminFlag(authCtx.isAdmin) || isTruthyAdminFlag(authCtx.permissions.is_admin);
        const perms = authCtx.permissions || {};
        const accessFallback = perms.access !== false;
        const navRules = {
            'catalog.html': resolveRoutePermission(perms, 'catalog_view', accessFallback),
            'agenda.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'contracts.html': resolveOrderModulePermission(perms, 'contracts_view', accessFallback),
            'receipts.html': resolveOrderModulePermission(perms, 'receipts_view', accessFallback),
            'invoices.html': resolveOrderModulePermission(perms, 'invoices_view', accessFallback),
            'montajes.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'orders.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'cotizacion.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'reports.html': resolveRoutePermission(perms, 'reports_view', accessFallback),
            'clientes.html': resolveClientsPermission(perms, accessFallback),
            'control.html': resolveRoutePermission(perms, 'control_view', resolveControlPermission(authCtx))
        };
        document.querySelectorAll('a[href], a[data-href]').forEach((link) => {
            const file = getLayoutNavFile(link);
            if (!file) return;
            if (Object.prototype.hasOwnProperty.call(navRules, file)) {
                const visible = isAdmin || !!navRules[file];
                link.classList.toggle('hidden', !visible);
                if (!visible && link.style) link.style.display = 'none';
            }
        });
        document.querySelectorAll('nav a[href], nav a[data-href]').forEach((link) => {
            const href = String(link.getAttribute('href') || link.getAttribute('data-href') || '').toLowerCase();
            if (/(^|\/)control\.html(?:$|[?#])/.test(href)) {
                if (!isAdmin && !resolveRoutePermission(perms, 'control_view', resolveControlPermission(authCtx))) {
                    link.remove();
                }
            }
        });
        const settingsBtn = document.getElementById('layout-settings-btn');
        if (settingsBtn) {
            const canOpenSettings = isAdmin
                || perms.config_manage === true
                || perms.users_manage === true
                || perms.roles_manage === true
                || perms.permissions_manage === true
                || perms.catalog_manage === true
                || perms.pdf_layout_manage === true;
            settingsBtn.classList.toggle('hidden', !canOpenSettings);
            settingsBtn.classList.toggle('flex', canOpenSettings);
            if (!canOpenSettings && settingsBtn.style) settingsBtn.style.display = 'none';
        }
    }

    (function installClientProfileHoverHelper() {
        if (window.HUB_CLIENT_PROFILE_HOVER) return;

        const REQUIRED_BY_TENANT = {
            plaza_mayor: [
                { field: 'doc_acta_constitutiva', label: 'Acta constitutiva' },
                { field: 'doc_ine', label: 'INE' },
                { field: 'doc_comprobante_domicilio', label: 'Comprobante de domicilio', dateField: 'comprobante_domicilio_emitido_el', validDays: 90 },
                { field: 'doc_constancia_fiscal', label: 'Constancia fiscal', dateField: 'constancia_fiscal_emitida_el', validDays: 30 }
            ],
            casa_de_piedra: [
                { field: 'doc_ine', label: 'INE' },
                { field: 'doc_comprobante_domicilio', label: 'Comprobante de domicilio', dateField: 'comprobante_domicilio_emitido_el', validDays: 90 },
                { field: 'doc_constancia_fiscal', label: 'Constancia fiscal', dateField: 'constancia_fiscal_emitida_el', validDays: 30 }
            ]
        };
        let hoverTimer = 0;
        let hoverModal = null;
        let activeTrigger = null;

        function escapeProfileHtml(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }

        function safeProfileObject(value) {
            if (value && typeof value === 'object' && !Array.isArray(value)) return value;
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
                } catch (_) {}
            }
            return {};
        }

        function safeProfileArray(value) {
            if (Array.isArray(value)) return value;
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (_) {}
            }
            return [];
        }

        function normalizeProfileDate(value) {
            const raw = String(value || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10);
            return '';
        }

        function isTruthyProfileFlag(value) {
            if (value === true) return true;
            if (typeof value === 'number') return value === 1;
            const normalized = String(value ?? '').trim().toLowerCase();
            return ['1', 'true', 'si', 'sí', 'yes', 'aprobado', 'aprobada', 'validado', 'validada', 'listo', 'lista', 'activo', 'activa'].includes(normalized);
        }

        function isReadyProfileStatus(value) {
            const normalized = String(value ?? '').trim().toLowerCase();
            return ['validado', 'validada', 'aprobado', 'aprobada', 'listo', 'lista', 'listo_para_cotizar', 'lista_para_cotizar', 'activo', 'activa'].includes(normalized);
        }

        function normalizeProfileTenant(value, fallback = 'plaza_mayor') {
            const tenant = String(value || '').trim().toLowerCase();
            if (tenant === 'cp' || tenant === 'casa de piedra' || tenant === 'casa_de_piedra') return 'casa_de_piedra';
            if (tenant === 'pm' || tenant === 'plaza mayor' || tenant === 'plaza_mayor') return 'plaza_mayor';
            return fallback;
        }

        function normalizeProfilePhone(value) {
            const digits = String(value || '').replace(/\D+/g, '').slice(-10);
            return digits.length === 10 ? digits : '';
        }

        function profileHasFile(profile, field, docInfo = {}) {
            if (docInfo.uploaded === true || String(docInfo.fileName || '').trim()) return true;
            const raw = profile?.[field];
            if (Array.isArray(raw)) return String(raw[0] || '').trim() !== '';
            return String(raw || '').trim() !== '';
        }

        function getProfileDocState(profile, field) {
            const validation = safeProfileObject(profile?.expediente_validacion);
            const docs = safeProfileObject(validation.documents);
            const docInfo = safeProfileObject(docs[field]);
            const states = safeProfileObject(profile?.documentos_estado);
            const stateInfo = safeProfileObject(states[field]);
            const status = String(stateInfo.status || docInfo.estado || docInfo.status || '').trim().toLowerCase();
            const omitted = stateInfo.omitido === true || docInfo.omitido === true || status === 'omitido';
            const uploaded = profileHasFile(profile, field, docInfo);
            const approved = omitted || status === 'aprobado';
            return {
                uploaded,
                omitted,
                approved,
                status: omitted ? 'omitido' : (status || (uploaded ? 'pendiente' : 'faltante')),
                date: normalizeProfileDate(
                    stateInfo.subido_at
                    || stateInfo.aprobado_at
                    || stateInfo.revisado_at
                    || docInfo.subidoAt
                    || docInfo.subido_at
                    || docInfo.aprobadoAt
                    || docInfo.revisadoAt
                    || ''
                )
            };
        }

        function getProfileReferenceDate(profile, doc, state) {
            const validation = safeProfileObject(profile?.expediente_validacion);
            if (doc.field === 'doc_constancia_fiscal') {
                return normalizeProfileDate(
                    state.date
                    || validation.constanciaFiscalSubidaEl
                    || validation.constancia_fiscal_subida_el
                    || validation.constanciaFiscalEmitidaEl
                    || validation.constancia_fiscal_emitida_el
                    || profile?.constancia_fiscal_emitida_el
                );
            }
            if (doc.field === 'doc_comprobante_domicilio') {
                return normalizeProfileDate(
                    profile?.comprobante_domicilio_emitido_el
                    || validation.comprobanteDomicilioEmitidoEl
                    || validation.comprobante_domicilio_emitido_el
                    || state.date
                );
            }
            return state.date;
        }

        function isProfileDateValid(dateValue, maxAgeDays) {
            const normalized = normalizeProfileDate(dateValue);
            if (!normalized) return false;
            const parsed = new Date(normalized + 'T00:00:00Z');
            if (Number.isNaN(parsed.getTime())) return false;
            const now = new Date();
            const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const ageDays = Math.floor((todayUtc.getTime() - parsed.getTime()) / 86400000);
            return ageDays >= 0 && ageDays <= Math.max(0, Number(maxAgeDays) || 0);
        }

        function normalizeContractProfileTag(value) {
            const raw = String(value ?? '').trim().toLowerCase();
            if (!raw) return '';
            return raw
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
        }

        function collectContractProfileTags(validation) {
            const source = safeProfileObject(validation);
            const out = [];
            const seen = new Set();
            const pushTag = (value) => {
                const tag = normalizeContractProfileTag(value);
                if (!tag || seen.has(tag)) return;
                seen.add(tag);
                out.push(tag);
            };
            ['contractTags', 'etiquetasContrato', 'etiquetas_contrato'].forEach((field) => {
                safeProfileArray(source[field]).forEach(pushTag);
            });
            pushTag(source.canGenerateContractTag);
            pushTag(source.contractTag);
            return out;
        }

        function profileHasContractTag(validation) {
            const source = safeProfileObject(validation);
            if (isTruthyProfileFlag(source.canGenerateContract) || isTruthyProfileFlag(source.canGenerateContracts)) return true;
            return collectContractProfileTags(source).includes('puede_generar_contrato');
        }

        function profileHasContractEligibilityMetadata(validation) {
            const source = safeProfileObject(validation);
            return [
                'canGenerateContract',
                'canGenerateContracts',
                'canGenerateContractTag',
                'contractTag',
                'contractTags',
                'etiquetasContrato',
                'etiquetas_contrato'
            ].some((field) => Object.prototype.hasOwnProperty.call(source, field));
        }

        function getProfileChecks(profile, tenantHint) {
            const tenant = normalizeProfileTenant(profile?.tenant || tenantHint, tenantHint || 'plaza_mayor');
            const docs = REQUIRED_BY_TENANT[tenant] || REQUIRED_BY_TENANT.plaza_mayor;
            const validation = safeProfileObject(profile?.expediente_validacion);
            const hasName = String(profile?.nombre_completo || '').trim() !== '';
            const hasEmail = String(profile?.correo || '').trim() !== '';
            const hasRfc = String(profile?.rfc || '').trim() !== '';
            const hasPhone = !!normalizeProfilePhone(profile?.telefono) || safeProfileArray(profile?.telefonos_adicionales).some((phone) => !!normalizeProfilePhone(phone));
            const docChecks = docs.map((doc) => {
                const state = getProfileDocState(profile, doc.field);
                const referenceDate = getProfileReferenceDate(profile, doc, state);
                const validDate = !doc.validDays || state.omitted || isProfileDateValid(referenceDate, doc.validDays);
                return {
                    ...doc,
                    ...state,
                    referenceDate,
                    validDate,
                    ok: (state.uploaded || state.omitted) && state.approved && validDate
                };
            });
            const docsReady = docChecks.every((doc) => doc.ok);
            const dataReady = hasName && hasEmail && hasRfc && hasPhone;
            const readyByFlag =
                isTruthyProfileFlag(profile?.perfil_validado)
                || isTruthyProfileFlag(validation.readyForQuotes)
                || isTruthyProfileFlag(validation.ready)
                || isTruthyProfileFlag(validation.puedeCotizar)
                || isTruthyProfileFlag(validation.quoteApproved)
                || isTruthyProfileFlag(validation.quoteReady)
                || isReadyProfileStatus(profile?.perfil_estatus || validation.status);
            const canQuote = readyByFlag || (dataReady && docsReady);
            const hasDictamen =
                isTruthyProfileFlag(validation.readyForContracts)
                || isTruthyProfileFlag(validation.dictamenAprobado)
                || isTruthyProfileFlag(validation.dictamenGuardado)
                || isTruthyProfileFlag(validation?.dictamen?.saved)
                || isTruthyProfileFlag(profile?.dictamen?.saved)
                || isTruthyProfileFlag(profile?.dictamen?.approved);
            const canContract = canQuote && (profileHasContractTag(validation) || (!profileHasContractEligibilityMetadata(validation) && hasDictamen));
            return {
                tenant,
                data: [
                    { label: 'Nombre', ok: hasName },
                    { label: 'Correo', ok: hasEmail },
                    { label: 'RFC', ok: hasRfc },
                    { label: 'Telefono', ok: hasPhone }
                ],
                docs: docChecks,
                canQuote,
                hasDictamen,
                canContract,
                status: String(profile?.perfil_estatus || validation.status || '').trim()
            };
        }

        function buildProfileHtml(profile, options = {}) {
            const checks = getProfileChecks(profile, options.tenant || profile?.tenant);
            const name = String(profile?.nombre_completo || 'Perfil de cliente').trim();
            const line = (label, ok, detail) => `
                <label style="display:flex;align-items:flex-start;gap:8px;margin:6px 0;color:${ok ? '#065f46' : '#92400e'};">
                    <input type="checkbox" disabled ${ok ? 'checked' : ''} style="margin-top:2px;accent-color:#059669;">
                    <span><strong>${escapeProfileHtml(label)}</strong>${detail ? `<small style="display:block;color:#64748b;font-weight:700;">${escapeProfileHtml(detail)}</small>` : ''}</span>
                </label>`;
            const docRows = checks.docs.map((doc) => {
                const detail = doc.omitted
                    ? 'Omitido por verificador'
                    : (doc.ok
                        ? (doc.referenceDate ? `Vigente desde ${doc.referenceDate}` : 'Aprobado')
                        : (doc.uploaded ? `Estado: ${doc.status}` : 'No cargado'));
                return line(doc.label, doc.ok, detail);
            }).join('');
            const dataRows = checks.data.map((item) => line(item.label, item.ok)).join('');
            return `
                <div style="font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#0f172a;margin-bottom:4px;">${escapeProfileHtml(name)}</div>
                <div style="font-size:11px;color:#64748b;font-weight:800;margin-bottom:10px;">${checks.tenant === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor'}${checks.status ? ` · ${escapeProfileHtml(checks.status)}` : ''}</div>
                ${line('Puede cotizar', checks.canQuote)}
                ${line('Dictamen guardado/aprobado', checks.hasDictamen)}
                ${line('Puede generar contrato', checks.canContract)}
                <div style="height:1px;background:#e2e8f0;margin:10px 0;"></div>
                <div style="font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Datos</div>
                ${dataRows}
                <div style="font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;margin:10px 0 4px;">Documentos</div>
                ${docRows}
            `;
        }

        function ensureProfileModal() {
            if (hoverModal) return hoverModal;
            hoverModal = document.createElement('div');
            hoverModal.id = 'hub-client-profile-hover-card';
            hoverModal.setAttribute('role', 'tooltip');
            hoverModal.style.cssText = 'position:fixed;z-index:10050;display:none;width:min(340px,calc(100vw - 24px));max-height:min(78vh,620px);overflow:auto;border:1px solid rgba(148,163,184,.35);border-radius:18px;background:#fff;box-shadow:0 26px 62px rgba(15,23,42,.24);padding:14px 16px;color:#334155;font-size:12px;line-height:1.4;';
            hoverModal.addEventListener('mouseenter', () => { if (hoverTimer) clearTimeout(hoverTimer); hoverTimer = 0; });
            hoverModal.addEventListener('mouseleave', hideProfileModal);
            document.body.appendChild(hoverModal);
            return hoverModal;
        }

        function positionProfileModal(trigger, modal) {
            const rect = trigger?.getBoundingClientRect ? trigger.getBoundingClientRect() : null;
            if (!rect) return;
            modal.style.display = 'block';
            modal.style.left = '0px';
            modal.style.top = '0px';
            const card = modal.getBoundingClientRect();
            let top = rect.bottom + 10;
            let left = rect.left;
            if (left + card.width > window.innerWidth - 12) left = window.innerWidth - card.width - 12;
            if (left < 12) left = 12;
            if (top + card.height > window.innerHeight - 12) top = Math.max(12, rect.top - card.height - 10);
            modal.style.left = `${left}px`;
            modal.style.top = `${top}px`;
        }

        function showProfileModal(trigger, profile, options = {}) {
            if (!profile) return;
            const modal = ensureProfileModal();
            modal.innerHTML = buildProfileHtml(profile, options);
            activeTrigger = trigger || null;
            positionProfileModal(trigger, modal);
        }

        function hideProfileModal() {
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverTimer = 0;
            if (hoverModal) hoverModal.style.display = 'none';
            activeTrigger = null;
        }

        function scheduleProfileModal(trigger, getProfile, options = {}) {
            if (hoverTimer) clearTimeout(hoverTimer);
            hoverTimer = window.setTimeout(() => {
                hoverTimer = 0;
                const profile = typeof getProfile === 'function' ? getProfile() : null;
                if (!profile) return;
                showProfileModal(trigger, profile, options);
            }, Math.max(250, Number(options.delayMs) || 700));
        }

        function bindSelect(selectEl, getProfile, options = {}) {
            if (!selectEl || selectEl.dataset.clientProfileHoverBound === '1') return;
            selectEl.dataset.clientProfileHoverBound = '1';
            selectEl.addEventListener('mouseenter', () => scheduleProfileModal(selectEl, getProfile, options));
            selectEl.addEventListener('focus', () => scheduleProfileModal(selectEl, getProfile, options));
            selectEl.addEventListener('mouseleave', (event) => {
                const related = event.relatedTarget || null;
                if (hoverModal && related && hoverModal.contains(related)) return;
                hideProfileModal();
            });
            selectEl.addEventListener('blur', hideProfileModal);
            selectEl.addEventListener('change', () => {
                if (!hoverModal || hoverModal.style.display === 'none') return;
                const profile = typeof getProfile === 'function' ? getProfile() : null;
                if (profile) showProfileModal(selectEl, profile, options);
                else hideProfileModal();
            });
        }

        window.addEventListener('scroll', () => {
            if (!activeTrigger) return;
            hideProfileModal();
        }, true);
        window.addEventListener('resize', hideProfileModal);

        window.HUB_CLIENT_PROFILE_HOVER = {
            bindSelect,
            show: showProfileModal,
            hide: hideProfileModal,
            getChecks: getProfileChecks,
            isQuoteReady(profile, tenant) {
                return getProfileChecks(profile || {}, tenant).canQuote;
            },
            hasDictamen(profile, tenant) {
                return getProfileChecks(profile || {}, tenant).hasDictamen;
            },
            isContractReady(profile, tenant) {
                return getProfileChecks(profile || {}, tenant).canContract;
            },
            buildHtml: buildProfileHtml
        };
    })();

    async function loadLayoutIdentity(sessionUser) {
        const fields = '*';
        const userId = String(sessionUser?.id || '').trim();
        const userEmail = String(sessionUser?.email || '').trim().toLowerCase();
        const lookupOne = async (table, field, value) => {
            if (!value || !layoutClient) return null;
            try {
                const { data } = await layoutClient.from(table).select(fields).eq(field, value).maybeSingle();
                return data || null;
            } catch (_) {
                return null;
            }
        };
        let appUser = await lookupOne('app_users', 'id', userId);
        if (!appUser) appUser = await lookupOne('app_users', 'email', userEmail);
        let sessionBase = sessionUser;
        try {
            const fresh = await window.PB_SERVICES?.auth?.ensureFreshSession?.({
                schema: (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA) ? TENANT_SCHEMA : FIN_SCHEMA,
                allowStaleOnError: true,
                forceRefresh: false
            });
            if (fresh?.user) sessionBase = fresh.user;
        } catch (_) {}
        const merged = mergeSessionRbacProfile(sessionBase, appUser);
        const resolvedRole = normalizeLayoutRole(
            appUser?.role
            || sessionUser?.role
            || sessionUser?.rol
            || ''
        );
        const resolvedDefaultTenant = normalizeTenantSlug(
            appUser?.tenant_default
            || appUser?.default_tenant
            || sessionUser?.tenant_default
            || sessionUser?.default_tenant
            || ''
        );
        merged.role = resolvedRole || normalizeLayoutRole(merged.role || merged.rol || '');
        merged.tenant_default = resolvedDefaultTenant || null;
        merged.default_tenant = resolvedDefaultTenant || null;
        merged.allowed_tenants = normalizeTenantList(
            appUser?.allowed_tenants
            || sessionUser?.allowed_tenants,
            merged.tenant_default
        );
        merged.profile = null;
        merged.app_user = appUser || null;
        return merged;
    }

    window.layoutApi = {
        toggleNotif: () => {
            if (IS_LOCAL) return;

            const drop = document.getElementById('global-notif-dropdown');
            if (!drop) return;
            drop.classList.toggle('hidden');
            if (!drop.classList.contains('hidden')) {
                drop.style.opacity = '0'; drop.style.transform = 'translateY(-10px)';
                requestAnimationFrame(() => { drop.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'; drop.style.opacity = '1'; drop.style.transform = 'translateY(0)'; });
            }
        },
        openNotif: (id) => {
            if (IS_LOCAL) return;
            openLayoutNotificationDetail(id);
        },
        closeNotifModal: () => {
            closeLayoutNotificationDetail();
        },
        openNotifLink: (url) => {
            navigateLayoutNotification(url);
        },
        deleteNotif: async (id) => {
            if (IS_LOCAL) return;
            if (layoutClient) {
                await layoutClient.from('hub_notifications').delete().eq('id', id);
                loadHistory();
            }
        },
        deleteAll: async () => {
            if (IS_LOCAL) return;
            if (!confirm('¿Estás seguro de que quieres borrar TODAS las notificaciones?')) return;
            if (!layoutClient || !myId) return;
            const { error } = await layoutClient.from('hub_notifications').delete().eq('user_id', myId);
            if (!error) {
                window.showToast('Notificaciones eliminadas', 'success');
                loadHistory();
            } else {
                window.showToast('Error al eliminar', 'error');
            }
        },
        logout: async () => {
            return window.HUB_SESSION?.logout?.({ redirect: true, redirectUrl: pathPrefix + 'index.html' });
        }
    };

    function installNavigationSafetyGuards() {
        const path = String(window.location.pathname || '').toLowerCase();
        const isCotizadorArea = /\/cotizador(cp)?\//.test(path);
        if (!isCotizadorArea) return;
        if (document.documentElement.dataset.hubNavSafetyBound === '1') return;
        document.documentElement.dataset.hubNavSafetyBound = '1';
        const DIAG_KEY = 'hub_nav_diag_log_v1';
        const LAST_UNLOAD_KEY = 'hub_nav_diag_last_unload_v1';
        const MAX_DIAG_ENTRIES = 250;
        let lastInteraction = null;
        let lastBlockedNavToastTs = 0;

        const safeSlice = (value, max = 240) => String(value == null ? '' : value).slice(0, max);
        const normalizeUrl = (value) => {
            try {
                const parsed = new URL(String(value || ''), window.location.href);
                parsed.hash = '';
                return parsed.toString();
            } catch (_) {
                return String(value || '').trim();
            }
        };
        const isSamePageUrl = (target) => normalizeUrl(target) === normalizeUrl(window.location.href || '');
        const showBlockedNavToast = (message) => {
            const now = Date.now();
            if ((now - lastBlockedNavToastTs) < 1400) return;
            lastBlockedNavToastTs = now;
            if (typeof window.showToast === 'function') window.showToast(message, 'info');
        };
        const readDiag = () => {
            try {
                const raw = localStorage.getItem(DIAG_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        };
        const pushDiag = (type, detail = {}) => {
            if (!CONSOLE_VERBOSE) return;
            try {
                const list = readDiag();
                list.push({
                    ts: (window.__serverDateService ? window.__serverDateService.nowISO() : new Date().toISOString()),
                    type: safeSlice(type, 80),
                    path: safeSlice(window.location.pathname || '', 200),
                    href: safeSlice(window.location.href || '', 320),
                    detail: detail && typeof detail === 'object' ? detail : { value: safeSlice(detail, 240) }
                });
                localStorage.setItem(DIAG_KEY, JSON.stringify(list.slice(-MAX_DIAG_ENTRIES)));
            } catch (_) {}
        };

        if (CONSOLE_VERBOSE) {
            window.__HUB_NAV_DIAG_DUMP = function(limit = 60) {
                const max = Math.max(1, parseInt(limit, 10) || 60);
                const rows = readDiag().slice(-max);
                try { console.table(rows); } catch (_) {}
                return rows;
            };
            window.__HUB_NAV_DIAG_LAST = function() {
                const rows = readDiag();
                return rows.length ? rows[rows.length - 1] : null;
            };
            window.__HUB_NAV_DIAG_CLEAR = function() {
                try { localStorage.removeItem(DIAG_KEY); } catch (_) {}
                try { sessionStorage.removeItem(LAST_UNLOAD_KEY); } catch (_) {}
                return true;
            };
        }
        window.__HUB_ALLOW_NEXT_UNLOAD = function(reason = 'manual') {
            try { window.__HUB_ALLOW_UNLOAD_ONCE = true; } catch (_) {}
            pushDiag('allow_next_unload', { reason: safeSlice(reason, 120) });
            return true;
        };
        const canUseProgrammaticNav = () => {
            return window.__HUB_ALLOW_UNLOAD_ONCE === true
                || window.__HUB_ALLOW_MANUAL_RELOAD === true
                || window.__HUB_ALLOW_PROGRAMMATIC_NAV === true;
        };
        if (!window.__HUB_SAFE_NAVIGATE) {
            window.__HUB_SAFE_NAVIGATE = function(targetUrl, options = {}) {
                const target = String(targetUrl || '').trim();
                if (!target) return false;
                const opts = (options && typeof options === 'object') ? options : {};
                const allowSamePage = opts.allowSamePage === true;
                if (!allowSamePage && isSamePageUrl(target)) {
                    pushDiag('safe_navigate_same_page_blocked', { target: safeSlice(target, 260), interaction: lastInteraction });
                    showBlockedNavToast('Recarga automática bloqueada para evitar pérdida de avance.');
                    return false;
                }
                try { window.__HUB_ALLOW_UNLOAD_ONCE = true; } catch (_) {}
                pushDiag('safe_navigate', { target: safeSlice(target, 260), interaction: lastInteraction });
                window.location.href = target;
                return true;
            };
        }
        if (!window.__HUB_ORIGINAL_LOCATION_RELOAD) {
            try {
                window.__HUB_ORIGINAL_LOCATION_RELOAD = window.location.reload.bind(window.location);
            } catch (_) {
                window.__HUB_ORIGINAL_LOCATION_RELOAD = null;
            }
        }
        if (!window.__HUB_LOCATION_RELOAD_PATCHED && window.__HUB_ORIGINAL_LOCATION_RELOAD) {
            try {
                window.location.reload = function(forceReload) {
                    if (canUseProgrammaticNav()) return window.__HUB_ORIGINAL_LOCATION_RELOAD(forceReload);
                    pushDiag('reload_api_blocked', { force: !!forceReload, interaction: lastInteraction });
                    showBlockedNavToast('Recarga automática bloqueada para evitar pérdida de avance.');
                    return false;
                };
                window.__HUB_LOCATION_RELOAD_PATCHED = true;
            } catch (_) {}
        }
        if (!window.__HUB_ORIGINAL_LOCATION_ASSIGN) {
            try {
                window.__HUB_ORIGINAL_LOCATION_ASSIGN = window.location.assign.bind(window.location);
            } catch (_) {
                window.__HUB_ORIGINAL_LOCATION_ASSIGN = null;
            }
        }
        if (!window.__HUB_LOCATION_ASSIGN_PATCHED && window.__HUB_ORIGINAL_LOCATION_ASSIGN) {
            try {
                window.location.assign = function(nextUrl) {
                    const target = String(nextUrl || '').trim();
                    if (!target) return;
                    if (!canUseProgrammaticNav() && isSamePageUrl(target)) {
                        pushDiag('assign_same_page_blocked', { target: safeSlice(target, 260), interaction: lastInteraction });
                        showBlockedNavToast('Recarga automática bloqueada para evitar pérdida de avance.');
                        return;
                    }
                    try { window.__HUB_ALLOW_UNLOAD_ONCE = true; } catch (_) {}
                    return window.__HUB_ORIGINAL_LOCATION_ASSIGN(target);
                };
                window.__HUB_LOCATION_ASSIGN_PATCHED = true;
            } catch (_) {}
        }
        if (!window.__HUB_ORIGINAL_LOCATION_REPLACE) {
            try {
                window.__HUB_ORIGINAL_LOCATION_REPLACE = window.location.replace.bind(window.location);
            } catch (_) {
                window.__HUB_ORIGINAL_LOCATION_REPLACE = null;
            }
        }
        if (!window.__HUB_LOCATION_REPLACE_PATCHED && window.__HUB_ORIGINAL_LOCATION_REPLACE) {
            try {
                window.location.replace = function(nextUrl) {
                    const target = String(nextUrl || '').trim();
                    if (!target) return;
                    if (!canUseProgrammaticNav() && isSamePageUrl(target)) {
                        pushDiag('replace_same_page_blocked', { target: safeSlice(target, 260), interaction: lastInteraction });
                        showBlockedNavToast('Recarga automática bloqueada para evitar pérdida de avance.');
                        return;
                    }
                    try { window.__HUB_ALLOW_UNLOAD_ONCE = true; } catch (_) {}
                    return window.__HUB_ORIGINAL_LOCATION_REPLACE(target);
                };
                window.__HUB_LOCATION_REPLACE_PATCHED = true;
            } catch (_) {}
        }
        const hasUnsavedChangesGuard = () => {
            try {
                const resolver = window.__HUB_HAS_UNSAVED_CHANGES;
                if (typeof resolver === 'function') return !!resolver();
                return resolver === true;
            } catch (_) {
                return false;
            }
        };

        let lastUnload = null;
        try {
            const rawLastUnload = sessionStorage.getItem(LAST_UNLOAD_KEY);
            if (rawLastUnload) {
                lastUnload = JSON.parse(rawLastUnload);
                sessionStorage.removeItem(LAST_UNLOAD_KEY);
            }
        } catch (_) {}
        const navEntry = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
            ? performance.getEntriesByType('navigation')[0]
            : null;
        pushDiag('nav_init', {
            navigationType: safeSlice(navEntry?.type || 'unknown', 40),
            referrer: safeSlice(document.referrer || '', 220)
        });
        if (lastUnload && typeof lastUnload === 'object') {
            pushDiag('nav_after_unload', lastUnload);
        }

        document.addEventListener('pointerdown', (event) => {
            const target = event.target instanceof Element
                ? event.target.closest('button,a,input,select,textarea,[data-base-resource],[data-res-id],[data-receipt-inspector-field]')
                : null;
            if (!target) {
                lastInteraction = null;
                return;
            }
            lastInteraction = {
                tag: safeSlice(String(target.tagName || '').toLowerCase(), 30),
                id: safeSlice(target.id || '', 80),
                cls: safeSlice(target.className || '', 120),
                href: safeSlice(target.getAttribute?.('href') || '', 180),
                text: safeSlice(target.textContent || '', 120)
            };
        }, true);

        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            if (form.id === 'login-form') return;
            if (form.dataset.allowSubmit === '1') return;
            // Solo bloquear forms con action explícito que causaría navegación
            // Los forms sin action (JS-driven) no causan recarga
            const formAction = (form.getAttribute('action') || '').trim();
            if (!formAction || formAction === '#' || formAction === 'javascript:void(0)') return;
            event.preventDefault();
            pushDiag('submit_blocked', {
                formId: safeSlice(form.id || '', 120),
                action: safeSlice(formAction, 180),
                interaction: lastInteraction
            });
            if (typeof window.showToast === 'function') {
                window.showToast('Envio de formulario bloqueado para evitar recarga accidental.', 'info');
            }
        }, true);

        // Recarga manual por teclado (F5 / Ctrl+R) siempre permitida.
        window.__HUB_ALLOW_MANUAL_RELOAD = true;

        document.addEventListener('click', (event) => {
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!anchor) return;
            const href = String(anchor.getAttribute('href') || '').trim().toLowerCase();
            if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
                event.preventDefault();
                pushDiag('anchor_blocked', {
                    href: safeSlice(href, 180),
                    id: safeSlice(anchor.id || '', 120),
                    text: safeSlice(anchor.textContent || '', 120),
                    interaction: lastInteraction
                });
                return;
            }
            pushDiag('link_click', {
                href: safeSlice(href, 220),
                id: safeSlice(anchor.id || '', 120),
                text: safeSlice(anchor.textContent || '', 120)
            });
        }, true);

        window.addEventListener('beforeunload', (event) => {
            persistLayoutScrollPosition('beforeunload');
            const allowOnce = window.__HUB_ALLOW_UNLOAD_ONCE === true;
            if (allowOnce) {
                try { window.__HUB_ALLOW_UNLOAD_ONCE = false; } catch (_) {}
            }
            const blockedByUnsaved = !allowOnce && hasUnsavedChangesGuard();
            if (blockedByUnsaved) {
                try {
                    event.preventDefault();
                    event.returnValue = '';
                } catch (_) {}
            }
            const payload = {
                reason: 'beforeunload',
                interaction: lastInteraction,
                ts: Date.now(),
                blockedByUnsaved,
                allowOnce
            };
            try { sessionStorage.setItem(LAST_UNLOAD_KEY, JSON.stringify(payload)); } catch (_) {}
            pushDiag('beforeunload', payload);
        });
        window.addEventListener('pagehide', (event) => {
            persistLayoutScrollPosition('pagehide');
            pushDiag('pagehide', {
                persisted: !!event.persisted,
                interaction: lastInteraction
            });
        });
        // window.addEventListener('unload', () => {
        //     pushDiag('unload', { interaction: lastInteraction });
        // });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                persistLayoutScrollPosition('visibility_hidden');
                pushDiag('visibility_hidden', { interaction: lastInteraction });
            }
        });
        window.addEventListener('error', (event) => {
            pushDiag('runtime_error', {
                message: safeSlice(event?.message || 'unknown', 220),
                source: safeSlice(event?.filename || '', 220),
                line: Number(event?.lineno || 0) || 0,
                column: Number(event?.colno || 0) || 0,
                stack: safeSlice(event?.error?.stack || '', 800)
            });
        });
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            pushDiag('unhandled_rejection', {
                reason: safeSlice(reason?.message || reason || 'unknown', 260)
            });
        });
        window.addEventListener('storage', (event) => {
            const keyName = String(event?.key || '');
            if (!keyName) return;
            if (!/(auth|session|token|pocketbase|supabase)/i.test(keyName)) return;
            pushDiag('storage_auth_change', {
                key: safeSlice(keyName, 180)
            });
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        installNavigationSafetyGuards();
        window.addEventListener('scroll', () => scheduleLayoutScrollPersist('scroll'), { passive: true });
        try { window.PB_SERVICES?.auth?.startSessionWatch?.(); } catch (_) {}
        const routeCtx = resolveLayoutRouteContext();
        const routeLoadState = markLayoutRouteLoad(routeCtx);
        window.__HUB_SUPPRESS_AUTO_REDIRECTS = routeLoadState.suppressAutoRedirects === true;
        installLayoutSessionHeartbeat(routeCtx);
        
        const nav = document.querySelector('nav[data-master-nav="1"]');
        if (nav) {
            const header = document.querySelector('header');
            if (header) nav.style.top = header.offsetHeight + 'px';
            const links = nav.querySelectorAll('a[data-href]');
            const currentPath = (window.location.pathname || '').toLowerCase();
            links.forEach(a => {
                const dh = a.getAttribute('data-href');
                if (!dh) return;
                a.setAttribute('href', pathPrefix + dh.replace(/^\/+/, ''));
                if (currentPath.includes(dh.toLowerCase())) { a.classList.add('opacity-100', 'border-b-2', 'border-white'); a.classList.remove('opacity-80'); } 
                else { a.classList.add('opacity-80', 'hover:opacity-100'); a.classList.remove('border-b-2', 'border-white'); }
            });
        }
        restoreLayoutScrollPosition();

        if (layoutClient) {
            let session = null;
            try {
                const authState = await window.PB_SERVICES?.auth?.bootstrap?.({
                    schema: (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA) ? TENANT_SCHEMA : FIN_SCHEMA,
                    retries: 2,
                    delayMs: 220
                });
                session = authState?.session || null;
            } catch (_) {
                session = null;
            }
            
            if (!session) {
                publishLayoutReady({
                    route: routeCtx,
                    session: null,
                    user: null,
                    profile: null,
                    permissions: {},
                    role: '',
                    tenantAllowed: false,
                    isAdmin: false,
                    canAccessCurrentRoute: false,
                    deniedReason: 'missing_session'
                });
                if (!routeCtx.isLoginPage && pathPrefix !== '' && window.__HUB_SUPPRESS_AUTO_REDIRECTS !== true && !shouldDeferSystemPageAuth(routeCtx)) {
                    window.__HUB_PAGE_ACCESS_DENIED = true;
                    window.__HUB_PAGE_ACCESS_DENIED_REASON = 'missing_session';
                    try { window.__HUB_ALLOW_NEXT_UNLOAD?.('layout_missing_session'); } catch (_) {}
                    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
                        window.__HUB_SAFE_NAVIGATE(routeCtx.redirectUrl, { allowSamePage: true });
                    } else {
                        window.location.href = routeCtx.redirectUrl;
                    }
                }
                return;
            }
            try { window.PB_SERVICES?.auth?.rememberSession?.(session); } catch (_) {}
            
            myId = session.user.id;
            let authCtx = null;
            
            try {
                const data = await loadLayoutIdentity(session.user);
                authCtx = {
                    route: routeCtx,
                    session,
                    user: session.user,
                    profile: data,
                    ...buildLayoutPermissions(data, routeCtx)
                };
                authCtx.canAccessCurrentRoute = canAccessCurrentRoute(routeCtx, authCtx);
                applyResolvedLayoutAuthContext(authCtx, { reason: 'layout_bootstrap' });

                if (!authCtx.canAccessCurrentRoute && !routeCtx.isLoginPage) {
                    if (shouldDeferSystemPageAuth(routeCtx)) return;
                    window.__HUB_PAGE_ACCESS_DENIED = true;
                    window.__HUB_PAGE_ACCESS_DENIED_REASON = authCtx.tenantAllowed ? 'insufficient_permissions' : 'tenant_forbidden';
                    try { window.__HUB_ALLOW_NEXT_UNLOAD?.('layout_access_guard'); } catch (_) {}
                    if (typeof window.showToast === 'function') {
                        window.showToast('Tu sesión no tiene acceso a esta pantalla. Redirigiendo al inicio.', 'warning');
                    }
                    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
                        window.__HUB_SAFE_NAVIGATE(routeCtx.redirectUrl, { allowSamePage: true });
                    } else {
                        window.location.href = routeCtx.redirectUrl;
                    }
                    return;
                }

            } catch(e) {
                const identityProfile = session?.user && typeof session.user === 'object'
                    ? { ...session.user }
                    : {};
                authCtx = {
                    route: routeCtx,
                    session,
                    user: session.user,
                    profile: identityProfile,
                    ...buildLayoutPermissions(identityProfile, routeCtx)
                };
                authCtx.canAccessCurrentRoute = canAccessCurrentRoute(routeCtx, authCtx);
                applyResolvedLayoutAuthContext(authCtx, { reason: 'layout_identity_recovery' });
                if (!authCtx.canAccessCurrentRoute && !routeCtx.isLoginPage) {
                    if (shouldDeferSystemPageAuth(routeCtx)) return;
                    window.__HUB_PAGE_ACCESS_DENIED = true;
                    window.__HUB_PAGE_ACCESS_DENIED_REASON = authCtx.tenantAllowed ? 'insufficient_permissions' : 'tenant_forbidden';
                    try { window.__HUB_ALLOW_NEXT_UNLOAD?.('layout_access_guard'); } catch (_) {}
                    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
                        window.__HUB_SAFE_NAVIGATE(routeCtx.redirectUrl, { allowSamePage: true });
                    } else {
                        window.location.href = routeCtx.redirectUrl;
                    }
                    return;
                }
            }

            initUnifiedNotifications();
            initOrderNotifications(authCtx);
            initLegacyCalendarListener(); 
            loadHistory();
            return;
        }
        publishLayoutReady({
            route: routeCtx,
            session: null,
            user: null,
            profile: null,
            permissions: {},
            role: '',
            tenantAllowed: true,
            isAdmin: false,
            canAccessCurrentRoute: true,
            deniedReason: ''
        });
    });

    function updateHeaderInfo(name, email) {
        const nameEl = document.getElementById('layout-user-name');
        const emailEl = document.getElementById('layout-user-email');
        if (nameEl) nameEl.innerText = name;
        if (emailEl) emailEl.innerText = email;
    }

    function renderHeader(settingsClass) {
        const title = getCurrentModuleTitle();
        const cachedName = localStorage.getItem('hub_user_cache_name') || 'Cargando...';
        const cachedEmail = localStorage.getItem('hub_user_cache_email') || '...';

        const userInfoHTML = `
        <div class="flex items-center border-l border-gray-700 pl-4 ml-4 h-8 transition-opacity duration-500 animate-enter">
             <div class="flex flex-col justify-center leading-none text-left">
                 <span id="layout-user-name" class="font-bold text-sm text-white tracking-tight">${cachedName}</span>
                 <span id="layout-user-email" class="text-[10px] text-gray-400 font-medium mt-0.5">${cachedEmail}</span>
             </div>
        </div>`;

        if (document.getElementById('hub-layout-header-rendered')) return;

        const html = `
        <header id="hub-layout-header-rendered" class="bg-brand-dark text-white h-16 shadow-lg z-50 sticky top-0 w-full flex-shrink-0 font-sans border-b border-gray-800">
            <div class="container mx-auto px-6 h-full flex justify-between items-center">
                
                <div class="flex items-center">
                    <a href="${pathPrefix}index.html" class="flex items-center gap-3 hover:opacity-80 transition group mr-2">
                        <img src="${layoutLogoSrc}" class="h-8 w-auto filter brightness-0 invert group-hover:scale-105 transition" onerror="this.style.display='none'">
                        <div class="flex flex-col justify-center leading-tight">
                            <span class="font-bold text-[10px] tracking-[0.2em] text-gray-500 group-hover:text-gray-400 transition">${layoutBrandName}</span>
                            <span class="text-xs font-black tracking-widest uppercase whitespace-nowrap title-anim" style="color:${layoutAccentHex}">${title}</span>
                        </div>
                    </a>
                    ${userInfoHTML}
                </div>

                <div class="flex items-center gap-4 h-full text-sm">
                    ${IS_LOCAL ? '' : `<div class="relative">
                        <button onclick="window.layoutApi.toggleNotif()" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition border border-white/5 relative">
                            <i class="fa-regular fa-bell text-gray-300"></i>
                            <span id="global-badge" class="absolute -top-1 -right-1 bg-brand-red text-white text-[9px] font-black px-1.5 py-0.5 rounded-full hidden shadow-sm border border-brand-dark">0</span>
                        </button>
                        <div id="global-notif-dropdown" class="absolute top-12 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 hidden flex flex-col text-gray-800 z-50 overflow-hidden">
                            <div class="px-5 py-4 border-b border-gray-50 bg-white flex justify-between items-center">
                                <h4 class="text-xs font-black text-gray-800 uppercase tracking-wide">Novedades</h4>
                                <button onclick="window.layoutApi.deleteAll()" class="text-[9px] font-bold text-red-400 hover:text-red-600 uppercase tracking-wider transition border border-transparent hover:border-red-100 rounded px-2 py-0.5 hover:bg-red-50">Borrar Todo</button>
                            </div>
                            <div id="global-notif-list" class="flex-col text-sm max-h-80 overflow-y-auto custom-scroll divide-y divide-gray-50">
                                <div class="p-8 text-center text-gray-300 text-xs italic font-medium">Todo está tranquilo por aquí.</div>
                            </div>
                        </div>
                    </div>
                    <div class="h-6 w-px bg-white/10 mx-1"></div>`}
                    
                    <a href="${pathPrefix}system/config.html" id="layout-settings-btn" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition border border-white/5 text-gray-300 hover:text-white ${settingsClass}" title="Configuración">
                        <i class="fa-solid fa-gear"></i>
                    </a>
                    
                    <button onclick="window.layoutApi.logout()" class="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-300 transition uppercase tracking-wide ml-2">
                        <span class="inline">Salir</span> <i class="fa-solid fa-right-from-bracket"></i>
                    </button>
                </div>
            </div>
        </header>
        <div id="global-widget-layer" class="fixed inset-0 pointer-events-none z-[100] flex flex-col items-end justify-end p-6 gap-4"></div>
        <div id="global-notif-modal" class="fixed inset-0 z-[120] hidden items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4" onclick="if(event.target === this) window.layoutApi.closeNotifModal()">
            <div class="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
                <div class="flex items-start justify-between gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-5 text-white">
                    <div class="min-w-0">
                        <div id="global-notif-modal-kicker" class="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">Notificacion</div>
                        <h3 id="global-notif-modal-title" class="mt-2 text-xl font-black leading-tight">Notificacion</h3>
                        <p id="global-notif-modal-datetime" class="mt-2 text-xs font-medium text-white/70">Sin fecha disponible</p>
                    </div>
                    <button type="button" onclick="window.layoutApi.closeNotifModal()" class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="space-y-5 px-6 py-5">
                    <p id="global-notif-modal-message" class="text-sm font-medium leading-relaxed text-slate-600">Sin descripcion.</p>
                    <div id="global-notif-modal-meta" class="grid gap-3 md:grid-cols-2"></div>
                    <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onclick="window.layoutApi.closeNotifModal()" class="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700">Cerrar</button>
                        <button id="global-notif-modal-cta" type="button" onclick="window.layoutApi.openNotifLink(this.dataset.href)" class="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-dark px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-300/60 transition hover:bg-brand-red">
                            <span>Abrir modulo</span>
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        if (document.body) document.body.insertAdjacentHTML('afterbegin', html);
        else window.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('afterbegin', html));
    }

    function tryRenderHeaderSync() {
        if (document.getElementById('hub-layout-header-rendered')) return;
        if (document.body) {
            renderHeader('hidden');
        } else {
            const obs = new MutationObserver((mutations, observer) => {
                if (document.body) {
                    observer.disconnect();
                    if (!document.getElementById('hub-layout-header-rendered')) renderHeader('hidden');
                }
            });
            obs.observe(document.documentElement, { childList: true });
        }
    }
    tryRenderHeaderSync();

    function initUnifiedNotifications() {
        if (IS_LOCAL) return;
        if (!layoutClient) return;
        if (layoutNotifPollTimer) clearInterval(layoutNotifPollTimer);
        loadHistory({ initial: true });
        layoutNotifPollTimer = window.setInterval(() => {
            loadHistory({ notifyNew: true });
        }, 15000);
        if (!layoutNotifVisibilityBound) {
            layoutNotifVisibilityBound = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') loadHistory({ notifyNew: true });
            });
            window.addEventListener('focus', () => loadHistory({ notifyNew: true }));
        }
        layoutClient.channel('global-hub-v10')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_notifications', filter: `user_id=eq.${myId}` }, 
            (payload) => {
                const n = payload.new;
                const type = n.source_app || n.type || 'system';
                spawnWidget(n.title, n.message, type, buildNotificationTargetLink(n));
                loadHistory();
                const audio = new Audio('' + NOTIFY_SOUND + ''); audio.volume = 0.2; audio.play().catch(()=>{});
            }).subscribe();
    }

        function initOrderNotifications(authCtx) {
        if (IS_LOCAL) return;
        if (!layoutClient) return;
        const permissionMap = authCtx && authCtx.permissionMap && typeof authCtx.permissionMap === 'object'
            ? authCtx.permissionMap
            : {};
        const allowedTenants = (authCtx && Array.isArray(authCtx.allowedTenants)) ? authCtx.allowedTenants : [];
        const pmPerms = permissionMap.plaza_mayor && typeof permissionMap.plaza_mayor === 'object'
            ? permissionMap.plaza_mayor
            : {};
        const cpPerms = permissionMap.casa_de_piedra && typeof permissionMap.casa_de_piedra === 'object'
            ? permissionMap.casa_de_piedra
            : {};
        const hasPM = allowedTenants.includes('plaza_mayor')
            && (pmPerms.access === true || pmPerms.orders_view === true || pmPerms.notifications_view === true);
        const hasCP = allowedTenants.includes('casa_de_piedra')
            && (cpPerms.access === true || cpPerms.orders_view === true || cpPerms.notifications_view === true);

        const PM_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
        const CP_SCHEMA = 'finanzas_casadepiedra';

        const statusLabels = {
            'borrador': 'Borrador',
            'pendiente': 'Pendiente',
            'aprobada': 'Aprobada',
            'rechazada': 'Rechazada',
            'finalizada': 'Finalizada',
            'cancelada': 'Cancelada'
        };

        async function handleOrderChange(payload, tenantLabel, tenantPath) {
            const rec = payload.new || {};
            const old = payload.old || {};
            const eventType = payload.eventType || 'UPDATE';
            const folio = rec.numero_cotizacion || rec.folio || rec.id || '';
            const tenant = tenantPath === 'cotizadorcp' ? 'casa_de_piedra' : 'plaza_mayor';
            const quoteId = String(rec.id || old.id || '').trim();
            let title = '';
            let msg = '';
            let link = tenantPath + '/orders.html' + (quoteId ? `?quote=${encodeURIComponent(quoteId)}` : '');
            const newStatus = rec.status || rec.estado || '';
            const oldStatus = old.status || old.estado || '';

            if (eventType === 'INSERT') {
                title = '\u{1F4CB} Nueva Orden — ' + tenantLabel;
                msg = 'Folio ' + folio + (rec.client_name || rec.nombre_cliente ? ' · ' + (rec.client_name || rec.nombre_cliente) : '');
            } else {
                if (newStatus && newStatus !== oldStatus) {
                    const statusText = statusLabels[newStatus] || newStatus;
                    title = '\u{1F504} Estado actualizado — ' + tenantLabel;
                    msg = 'Orden ' + folio + ' → ' + statusText;
                } else {
                    title = '\u{270F}\uFE0F Orden modificada — ' + tenantLabel;
                    msg = 'Orden ' + folio + ' fue actualizada.';
                }
            }

            try {
                await layoutClient.from('hub_notifications').insert({
                    user_id: myId,
                    title: title,
                    message: msg,
                    type: 'order',
                    source_app: 'cotizador',
                    link: link,
                    metadata: {
                        tenant,
                        cotizacion_id: quoteId,
                        cotizacion_folio: String(folio || '').trim(),
                        cliente_nombre: String(rec.client_name || rec.nombre_cliente || rec.cliente_nombre || '').trim(),
                        estado_anterior: String(oldStatus || '').trim(),
                        estado_actual: String(newStatus || '').trim(),
                        redirect_url: link,
                        redirect_kind: 'quote_detail'
                    }
                });
            } catch (_) {}
        }

        if (hasPM) {
            layoutClient.channel('hub-orders-pm-v1')
                .on('postgres_changes', { event: 'INSERT', schema: PM_SCHEMA, table: 'cotizaciones' },
                    (p) => handleOrderChange(p, 'Plaza Mayor', 'cotizador'))
                .on('postgres_changes', { event: 'UPDATE', schema: PM_SCHEMA, table: 'cotizaciones' },
                    (p) => handleOrderChange(p, 'Plaza Mayor', 'cotizador'))
                .subscribe();
        }

        if (hasCP) {
            layoutClient.channel('hub-orders-cp-v1')
                .on('postgres_changes', { event: 'INSERT', schema: CP_SCHEMA, table: 'cotizaciones' },
                    (p) => handleOrderChange(p, 'Casa de Piedra', 'cotizadorcp'))
                .on('postgres_changes', { event: 'UPDATE', schema: CP_SCHEMA, table: 'cotizaciones' },
                    (p) => handleOrderChange(p, 'Casa de Piedra', 'cotizadorcp'))
                .subscribe();
        }
    }

    async function initLegacyCalendarListener() {
        if (!layoutClient) return;
        layoutClient.channel('global-calendar-fix-v10').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calen_events' }, async (payload) => {
            const evt = payload.new;
            if (evt.title && (evt.title.toLowerCase().includes('orden') || evt.title.toLowerCase().includes('reserva'))) return; 
            if (evt.visibility === 'public_all') {
                await layoutClient.from('hub_notifications').insert({ user_id: myId, title: '📅 Nuevo Evento Público', message: evt.title, type: 'calendar', source_app: 'calendar', link: 'calendar/index.html' });
            }
        }).subscribe();
    }

    function spawnWidget(title, msg, type, link) {
        const container = document.getElementById('global-widget-layer'); if(!container) return;
        let borderClass = 'border-gray-500'; let iconClass = 'fa-bell text-gray-500'; let bgIcon = 'bg-gray-100';
        if (type === 'calendar') { borderClass = 'border-blue-500'; iconClass = 'fa-calendar-check text-blue-600'; bgIcon = 'bg-blue-50'; }
        else if (type === 'ticket') { borderClass = 'border-orange-500'; iconClass = 'fa-ticket text-orange-600'; bgIcon = 'bg-orange-50'; }
        else if (type === 'finanzas' || type === 'cotizador' || type === 'order') { borderClass = 'border-brand-red'; iconClass = 'fa-file-invoice-dollar text-brand-red'; bgIcon = 'bg-red-50'; }
        else if (String(type || '').includes('client') || String(type || '').includes('document')) { borderClass = 'border-brand-red'; iconClass = 'fa-user-check text-brand-red'; bgIcon = 'bg-red-50'; }

        const w = document.createElement('div'); 
        w.className = `pointer-events-auto w-80 bg-white rounded-2xl shadow-2xl border-l-4 ${borderClass} p-4 transform transition-all duration-500 translate-x-full opacity-0 flex gap-3`;
        w.innerHTML = `<div class="shrink-0 w-10 h-10 rounded-full ${bgIcon} flex items-center justify-center"><i class="fa-solid ${iconClass} text-lg"></i></div><div class="flex-grow pt-0.5"><div class="flex justify-between items-start mb-1"><span class="font-black text-[10px] uppercase tracking-wider text-gray-400">${title}</span><button onclick="this.closest('div.pointer-events-auto').remove()" class="text-gray-300 hover:text-gray-500 -mt-1 -mr-1"><i class="fa-solid fa-times"></i></button></div><p class="text-xs font-bold text-gray-700 leading-snug">${msg}</p></div>`;
        if (link) { w.style.cursor = 'pointer'; w.onclick = (e) => { if(!e.target.closest('button')) window.location.href = link; }; }
        container.appendChild(w);
        requestAnimationFrame(() => w.classList.remove('translate-x-full', 'opacity-0'));
        setTimeout(() => { w.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => w.remove(), 500); }, 6000);
    }

    async function loadHistory(options = {}) {
        if (!layoutClient) return;
        const list = document.getElementById('global-notif-list'); const badge = document.getElementById('global-badge'); if(!list) return;
        const { data } = await layoutClient.from('hub_notifications').select('*').eq('user_id', myId).order('created_at', { ascending: false }).limit(10);
        const rows = Array.isArray(data) ? data : [];
        const latest = rows[0] || null;
        const latestKey = latest ? String(latest.id || latest.created_at || latest.created || '') : '';
        const shouldNotify = options.notifyNew === true && !!layoutNotifLastKey && !!latestKey && latestKey !== layoutNotifLastKey;
        if (shouldNotify) {
            const sourceType = latest.source_app || latest.type || 'system';
            spawnWidget(latest.title, latest.message, sourceType, buildNotificationTargetLink(latest));
            const audio = new Audio('' + NOTIFY_SOUND + '');
            audio.volume = 0.2;
            audio.play().catch(()=>{});
        }
        if (latestKey) layoutNotifLastKey = latestKey;
        list.innerHTML = '';
        layoutNotifCache = new Map();
        if (rows.length > 0) {
            badge.innerText = rows.length; badge.classList.remove('hidden');
            rows.forEach(n => {
                const sourceType = n.source_app || n.type || 'system';
                const { icon, bgIcon } = getNotificationVisual(sourceType);
                const dateText = formatNotificationDateTime(n.created_at || n.updated_at || '');
                const item = document.createElement('div');
                item.className = "p-4 relative group hover:bg-gray-50 transition cursor-pointer flex gap-3 items-start";
                item.innerHTML = `<div class="w-8 h-8 rounded-full ${bgIcon} flex items-center justify-center shrink-0 mt-0.5"><i class="fa-solid ${icon}"></i></div><div class="min-w-0 flex-grow"><div class="flex flex-col gap-1"><p class="text-xs font-bold text-gray-800 leading-snug break-words">${escapeNotificationHtml(n.title)}</p><p class="text-[11px] text-gray-500 leading-snug break-words">${escapeNotificationHtml(n.message)}</p><div class="flex items-center justify-between gap-3 pt-1"><span class="text-[10px] font-semibold text-slate-400">${escapeNotificationHtml(dateText)}</span><span class="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Ver detalle <i class="fa-solid fa-chevron-right text-[9px]"></i></span></div></div></div><button onclick="event.stopPropagation(); window.layoutApi.deleteNotif('${n.id}')" class="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"><i class="fa-solid fa-trash-can"></i></button>`;
                layoutNotifCache.set(String(n.id || ''), n);
                item.onclick = () => openLayoutNotificationDetail(n);
                list.appendChild(item); 
            });
        } else { badge.classList.add('hidden'); list.innerHTML = `<div class="p-10 text-center flex flex-col items-center"><div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3"><i class="fa-regular fa-bell-slash text-gray-300 text-xl"></i></div><p class="text-xs font-bold text-gray-400">Todo al día</p><p class="text-[10px] text-gray-300 mt-1">No tienes notificaciones nuevas.</p></div>`; }
    }

    window.addEventListener('click', (e) => {
        const drop = document.getElementById('global-notif-dropdown');
        if (drop && !drop.contains(e.target) && !e.target.closest('button[onclick*="toggleNotif"]')) { drop.classList.add('hidden'); }
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLayoutNotificationDetail();
    });
})();





