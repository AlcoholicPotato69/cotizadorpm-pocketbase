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
    
    const scriptTag = document.querySelector('script[src*="layout.js"]');
    const pathPrefix = scriptTag ? scriptTag.getAttribute('src').replace('js/layout.js', '') : './';

    

    const NOTIFY_SOUND = pathPrefix + '../assets/sfx/notify.wav';
    // Ruta / logos según tenant (Plaza Mayor vs Casa de Piedra)
    const _p = window.location.pathname || '';
    const _isCP = /\/cotizadorcp(\/|$)/.test(_p) || (window.location.href || '').includes('cotizadorcp');
    const TENANT_SCHEMA = _isCP ? 'finanzas_casadepiedra' : FIN_SCHEMA;
    const pmLogo = (window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../assets/logo.png';
    const cpLogo = (window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../assets/logocp.png';
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
            c.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none';
            document.body.appendChild(c);
        }
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
            modal.className = 'fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300';
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
            modal.className = 'fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm';
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

        if (t.includes('cotiza') || t.includes('catalog')) {
             return pathPrefix + 'cotizador/catalog.html';
        }

        if (t.includes('fina')) return pathPrefix + 'finanzas/index.html';
        
        return originalLink || '#';
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
            isAdmin: authCtx?.isAdmin === true,
            canAccessCurrentRoute: authCtx?.canAccessCurrentRoute !== false,
            isAuthenticated: !!(authCtx?.session?.user),
            ts: Date.now()
        };
    }

    function notifyLayoutAuthSubscribers(context, reason = 'update') {
        const payload = buildLayoutAuthEventPayload(context, reason);
        try { window.__HUB_LAYOUT_AUTH_STATE = payload; } catch (_) {}
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
        if (authCtx?.isAdmin) localStorage.setItem('hub_user_cache_role', 'admin');
        else if (authCtx?.role) localStorage.setItem('hub_user_cache_role', String(authCtx.role || ''));
        else localStorage.removeItem('hub_user_cache_role');
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
        if (ctx?.canAccessCurrentRoute) persistLastGoodLayoutAuth(ctx);
        publishLayoutReady(ctx, { reason });
        return ctx;
    }

    function redirectLayoutToLogin(routeCtx, reason = 'missing_session') {
        const route = routeCtx || resolveLayoutRouteContext();
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
                        allowCachedUser: opts.allowCachedUser === true,
                        retries: 1,
                        delayMs: 120
                    });
                    session = authState?.session || null;
                } catch (_) {
                    session = null;
                }
            }

            if (!session?.user) {
                const stableFallback = opts.allowStableFallback === true
                    ? buildStableLayoutFallback(routeCtx, opts.forceRefresh === true ? 'manager_refresh_fallback' : 'manager_fallback')
                    : null;
                if (stableFallback) {
                    return applyResolvedLayoutAuthContext(stableFallback, { reason: 'layout_manager_fallback' });
                }
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
                if (opts.redirectOnFail !== false) redirectLayoutToLogin(routeCtx, 'missing_session');
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
                const stableFallback = buildStableLayoutFallback(routeCtx, 'layout_manager_access_guard');
                if (stableFallback) return applyResolvedLayoutAuthContext(stableFallback, { reason: 'layout_manager_access_fallback' });
                if (opts.redirectOnFail !== false) {
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
                allowStableFallback: true,
                redirectOnFail: false
            }).catch(function () {});
        };
        window.addEventListener('focus', guardedEnsure);
        window.addEventListener('pageshow', guardedEnsure);
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
            if (layoutClient) {
                localStorage.removeItem('hub_user_cache_name');
                localStorage.removeItem('hub_user_cache_email');
                localStorage.removeItem('hub_user_cache_role');
                localStorage.removeItem(SHARED_AUTH_ACTIVITY_KEY);
                writeLayoutSessionState(LAYOUT_LAST_GOOD_AUTH_KEY, null);
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
                await layoutClient.auth.signOut();
            }
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
        const safe = String(value || '').trim().toLowerCase();
        if (!safe) return '';
        if (safe === 'administrador' || safe === 'superadmin' || safe === 'super_admin') return 'admin';
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

    function normalizeTenantList(input, role, fallbackTenant) {
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
        const normalizedRole = normalizeLayoutRole(role);
        if (normalizedRole === 'admin' || normalizedRole === 'ambos') {
            unique.add('plaza_mayor');
            unique.add('casa_de_piedra');
        } else if (normalizedRole === 'plaza_mayor' || normalizedRole === 'casa_de_piedra') {
            unique.add(normalizedRole);
        }
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
    const LAYOUT_ROUTE_STABILITY_KEY = 'hub_layout_route_stability_v1';
    const LAYOUT_SCROLL_STATE_PREFIX = 'hub_layout_scroll_v1:';
    const SHARED_AUTH_ACTIVITY_KEY = 'hub_auth_last_activity_v1';
    const LAYOUT_AUTH_MAX_IDLE_MS = 2 * 60 * 60 * 1000;
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

    function readSharedAuthActivityTs() {
        try {
            return Math.max(0, Number(localStorage.getItem(SHARED_AUTH_ACTIVITY_KEY) || 0) || 0);
        } catch (_) {
            return 0;
        }
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

    function resolveLayoutAuthWindowMs() {
        const declared = Number(window.PB_SERVICES?.auth?.inactivityWindowMs || 0) || 0;
        return Math.max(LAYOUT_AUTH_MAX_IDLE_MS, declared);
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

    function persistLastGoodLayoutAuth(authCtx) {
        if (!authCtx || !authCtx.session || !authCtx.user) return;
        writeLayoutSessionState(LAYOUT_LAST_GOOD_AUTH_KEY, {
            ts: Date.now(),
            tenant: authCtx.route?.tenant || null,
            user: authCtx.user || null,
            profile: authCtx.profile || null,
            permissions: authCtx.permissions || {},
            role: authCtx.role || '',
            tenantAllowed: authCtx.tenantAllowed === true,
            isAdmin: authCtx.isAdmin === true
        });
    }

    function readLastGoodLayoutAuth(routeCtx, maxAgeMs = resolveLayoutAuthWindowMs()) {
        const cached = readLayoutSessionState(LAYOUT_LAST_GOOD_AUTH_KEY);
        if (!cached) return null;
        const authWindowMs = Math.max(0, Number(maxAgeMs) || resolveLayoutAuthWindowMs());
        const activityState = window.PB_SERVICES?.auth?.getActivityState?.();
        const activityTs = Number(activityState?.lastActivityTs || readSharedAuthActivityTs() || 0) || 0;
        if (activityTs > 0 && (Date.now() - activityTs) > authWindowMs) return null;
        if ((Date.now() - Number(cached.ts || 0)) > authWindowMs) return null;
        if (!cached.user || typeof cached.user !== 'object') return null;
        const routeTenant = routeCtx?.tenant || null;
        if (routeTenant && cached.tenant && cached.tenant !== routeTenant && cached.isAdmin !== true) return null;
        return cached;
    }

    function buildStableLayoutFallback(routeCtx, reason = 'transient_auth') {
        const cached = readLastGoodLayoutAuth(routeCtx);
        if (!cached) return null;
        const identity = (cached.profile && typeof cached.profile === 'object') ? cached.profile : cached.user;
        const authCtx = {
            route: routeCtx,
            session: { user: cached.user, __fallback: true, __stable: true, reason },
            user: cached.user,
            profile: identity || cached.user,
            ...buildLayoutPermissions(identity || cached.user, routeCtx)
        };
        authCtx.canAccessCurrentRoute = canAccessCurrentRoute(routeCtx, authCtx);
        if (!authCtx.canAccessCurrentRoute) return null;
        return authCtx;
    }

    function hasOwn(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    function resolveRoutePermission(perms, key, fallbackAccess) {
        if (!perms || typeof perms !== 'object') return !!fallbackAccess;
        if (!hasOwn(perms, key)) return !!fallbackAccess;
        return !!perms[key];
    }

    function resolveClientsPermission(perms, fallbackAccess) {
        if (!perms || typeof perms !== 'object') return !!fallbackAccess;
        if (hasOwn(perms, 'clients_view') || hasOwn(perms, 'clients_manage')) {
            return !!perms.clients_view || !!perms.clients_manage;
        }
        return !!fallbackAccess;
    }

    function buildLayoutPermissions(identity, routeCtx) {
        const profile = identity && typeof identity === 'object' ? identity : {};
        const role = normalizeLayoutRole(profile.role || profile.rol || '');
        const defaultTenant = normalizeTenantSlug(profile.tenant_default || profile.default_tenant || '');
        const allowedTenants = normalizeTenantList(profile.allowed_tenants, role, defaultTenant);
        const rawPermissions = (profile.app_metadata && profile.app_metadata.finanzas && profile.app_metadata.finanzas.permissions && typeof profile.app_metadata.finanzas.permissions === 'object')
            ? { ...profile.app_metadata.finanzas.permissions }
            : {};
        const tenant = routeCtx && routeCtx.tenant ? routeCtx.tenant : null;
        const roleHasTenantAccess = role === 'admin' || role === 'ambos' || (!!tenant && role === tenant);
        const tenantAllowed = !tenant || roleHasTenantAccess || allowedTenants.includes(tenant) || defaultTenant === tenant;

        let permissions;
        if (role === 'admin') {
            permissions = {
                access: true,
                orders_view: true,
                orders_edit: true,
                reports_view: true,
                clients_view: true,
                clients_manage: true,
                catalog_manage: true
            };
        } else if (!!tenant && (role === tenant || role === 'ambos')) {
            permissions = {
                access: true,
                orders_view: true,
                orders_edit: true,
                reports_view: true,
                clients_view: true,
                clients_manage: true,
                catalog_manage: false
            };
        } else {
            permissions = {
                access: !!tenantAllowed
            };
            Object.assign(permissions, rawPermissions);
        }

        if (!tenantAllowed && tenant) permissions.access = false;

        return {
            role,
            allowedTenants,
            defaultTenant: defaultTenant || null,
            tenantAllowed: !!tenantAllowed,
            permissions,
            rawPermissions,
            isAdmin: role === 'admin'
        };
    }

    function canAccessCurrentRoute(routeCtx, authCtx) {
        if (!routeCtx) return true;
        if (routeCtx.isLoginPage) return true;
        if (!authCtx || !authCtx.session || !authCtx.session.user) return false;
        if (routeCtx.isSystem) return authCtx.isAdmin === true;
        if (!routeCtx.tenant) return true;
        if (authCtx.tenantAllowed !== true) return false;

        const perms = authCtx.permissions || {};
        const accessFallback = perms.access !== false;

        switch (routeCtx.file) {
            case 'orders.html':
            case 'order_detail.html':
            case 'cotizacion.html':
                return resolveRoutePermission(perms, 'orders_view', accessFallback);
            case 'reports.html':
            case 'report.html':
                return resolveRoutePermission(perms, 'reports_view', accessFallback);
            case 'clientes.html':
                return resolveClientsPermission(perms, accessFallback);
            default:
                return !!accessFallback;
        }
    }

    function applyLayoutNavPermissions(authCtx) {
        if (!authCtx || !authCtx.permissions) return;
        const perms = authCtx.permissions || {};
        const accessFallback = perms.access !== false;
        const navRules = {
            'catalog.html': !!accessFallback,
            'agenda.html': !!accessFallback,
            'contracts.html': !!accessFallback,
            'receipts.html': !!accessFallback,
            'invoices.html': !!accessFallback,
            'montajes.html': !!accessFallback,
            'orders.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'cotizacion.html': resolveRoutePermission(perms, 'orders_view', accessFallback),
            'reports.html': resolveRoutePermission(perms, 'reports_view', accessFallback),
            'clientes.html': resolveClientsPermission(perms, accessFallback)
        };
        Object.keys(navRules).forEach((page) => {
            const visible = !!navRules[page];
            document.querySelectorAll(`a[href="${page}"], a[data-href="${page}"]`).forEach((link) => {
                link.classList.toggle('hidden', !visible);
            });
        });
        const settingsBtn = document.getElementById('layout-settings-btn');
        if (settingsBtn) {
            if (authCtx.isAdmin) settingsBtn.classList.replace('hidden', 'flex');
            else settingsBtn.classList.add('hidden');
        }
    }

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
        const merged = {
            ...(sessionUser && typeof sessionUser === 'object' ? sessionUser : {}),
            ...(appUser && typeof appUser === 'object' ? appUser : {})
        };
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
            merged.role,
            merged.tenant_default
        );
        if (!merged.app_metadata && appUser?.app_metadata) merged.app_metadata = appUser.app_metadata;
        merged.profile = null;
        merged.app_user = appUser || null;
        return merged;
    }

    window.layoutApi = {
        toggleNotif: () => {
            if (IS_LOCAL) return;

            const drop = document.getElementById('global-notif-dropdown');
            drop.classList.toggle('hidden');
            if (!drop.classList.contains('hidden')) {
                drop.style.opacity = '0'; drop.style.transform = 'translateY(-10px)';
                requestAnimationFrame(() => { drop.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'; drop.style.opacity = '1'; drop.style.transform = 'translateY(0)'; });
            }
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
                    ts: new Date().toISOString(),
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

        document.addEventListener('keydown', (event) => {
            const key = String(event.key || '').toLowerCase();
            const wantsReload = key === 'f5' || ((event.ctrlKey || event.metaKey) && key === 'r');
            if (!wantsReload) return;
            if (window.__HUB_ALLOW_MANUAL_RELOAD === true) return;
            event.preventDefault();
            pushDiag('reload_key_blocked', {
                key: safeSlice(key, 16),
                ctrl: !!event.ctrlKey,
                meta: !!event.metaKey,
                interaction: lastInteraction
            });
            if (typeof window.showToast === 'function') {
                window.showToast('Recarga bloqueada para evitar perder cambios en progreso.', 'info');
            }
        }, true);

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
        window.addEventListener('unload', () => {
            pushDiag('unload', { interaction: lastInteraction });
        });
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

    function readAuthLikeStorageEntry(key) {
        try {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function resolveFallbackSessionUser() {
        const pool = [];
        try {
            pool.push(
                layoutClient?.authStore?.model || null,
                window.globalPocketBase?.authStore?.model || null,
                window.tenantPocketBase?.authStore?.model || null
            );
            ['pb_native_auth_v1', 'pb_compat_auth_v1', 'pb_auth'].forEach((key) => {
                const parsed = readAuthLikeStorageEntry(key);
                if (!parsed) return;
                pool.push(parsed.user || null, parsed.record || null, parsed.model || null);
            });
            [sessionStorage, localStorage].forEach((storageLike) => {
                try {
                    for (let i = 0; i < storageLike.length; i += 1) {
                        const key = String(storageLike.key(i) || '');
                        if (!/(pocketbase|pb).*(auth|session)|auth.*(pocketbase|pb)/i.test(key)) continue;
                        const parsed = readAuthLikeStorageEntry(key);
                        if (!parsed) continue;
                        pool.push(parsed.user || null, parsed.record || null, parsed.model || null);
                    }
                } catch (_) {}
            });
        } catch (_) {}
        return pool.find((candidate) => candidate && typeof candidate === 'object' && (candidate.id || candidate.email)) || null;
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
                    allowCachedUser: true,
                    retries: 2,
                    delayMs: 220
                });
                session = authState?.session || null;
            } catch (_) {
                session = null;
            }
            // Fallback legacy para mantener compatibilidad si el helper aún no resolvió sesión.
            if (!session) {
                try {
                    const response = await layoutClient.auth.getSession();
                    session = response?.data?.session || null;
                } catch (_) {
                    session = null;
                }
            }
            if (!session) {
                await new Promise(r => setTimeout(r, 300));
                try {
                    const response2 = await layoutClient.auth.getSession();
                    session = response2?.data?.session || null;
                } catch (_) {
                    session = null;
                }
            }
            if (!session) {
                const fallbackUser = resolveFallbackSessionUser();
                if (fallbackUser) session = { user: fallbackUser, __fallback: true };
            }
            
            if (!session) {
                const stableFallback = buildStableLayoutFallback(routeCtx, 'missing_session');
                if (stableFallback) {
                    applyResolvedLayoutAuthContext(stableFallback, { reason: 'missing_session_fallback' });
                    return;
                }
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
                if (!routeCtx.isLoginPage && pathPrefix !== '' && window.__HUB_SUPPRESS_AUTO_REDIRECTS !== true) {
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
                    const stableFallback = buildStableLayoutFallback(routeCtx, 'access_guard');
                    if (stableFallback) {
                        applyResolvedLayoutAuthContext(stableFallback, { reason: 'access_guard_fallback' });
                        return;
                    }
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
                authCtx.canAccessCurrentRoute = canAccessCurrentRoute(routeCtx, authCtx);
                applyResolvedLayoutAuthContext(authCtx, { reason: 'layout_identity_fallback' });
                if (!authCtx.canAccessCurrentRoute && !routeCtx.isLoginPage) {
                    const stableFallback = buildStableLayoutFallback(routeCtx, 'layout_identity_error');
                    if (stableFallback) {
                        applyResolvedLayoutAuthContext(stableFallback, { reason: 'layout_identity_error_fallback' });
                        return;
                    }
                    window.__HUB_PAGE_ACCESS_DENIED = true;
                    window.__HUB_PAGE_ACCESS_DENIED_REASON = authCtx.tenantAllowed ? 'insufficient_permissions' : 'tenant_forbidden';
                    try { window.__HUB_ALLOW_NEXT_UNLOAD?.('layout_access_guard_fallback'); } catch (_) {}
                    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
                        window.__HUB_SAFE_NAVIGATE(routeCtx.redirectUrl, { allowSamePage: true });
                    } else {
                        window.location.href = routeCtx.redirectUrl;
                    }
                    return;
                }
            }

            initUnifiedNotifications();
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
                    
                    <a href="${pathPrefix}system/users1.html" id="layout-settings-btn" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition border border-white/5 text-gray-300 hover:text-white ${settingsClass}" title="Configuración">
                        <i class="fa-solid fa-gear"></i>
                    </a>
                    
                    <button onclick="window.layoutApi.logout()" class="flex items-center gap-2 text-xs font-bold text-red-400 hover:text-red-300 transition uppercase tracking-wide ml-2">
                        <span class="hidden sm:inline">Salir</span> <i class="fa-solid fa-right-from-bracket"></i>
                    </button>
                </div>
            </div>
        </header>
        <div id="global-widget-layer" class="fixed inset-0 pointer-events-none z-[100] flex flex-col items-end justify-end p-6 gap-4"></div>
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
        layoutClient.channel('global-hub-v10')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_notifications', filter: `user_id=eq.${myId}` }, 
            (payload) => {
                const n = payload.new;
                const type = n.source_app || n.type || 'system';
                spawnWidget(n.title, n.message, type, getManualLink(type, n.link));
                loadHistory();
                const audio = new Audio('' + NOTIFY_SOUND + ''); audio.volume = 0.2; audio.play().catch(()=>{});
            }).subscribe();
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

        const w = document.createElement('div'); 
        w.className = `pointer-events-auto w-80 bg-white rounded-2xl shadow-2xl border-l-4 ${borderClass} p-4 transform transition-all duration-500 translate-x-full opacity-0 flex gap-3`;
        w.innerHTML = `<div class="shrink-0 w-10 h-10 rounded-full ${bgIcon} flex items-center justify-center"><i class="fa-solid ${iconClass} text-lg"></i></div><div class="flex-grow pt-0.5"><div class="flex justify-between items-start mb-1"><span class="font-black text-[10px] uppercase tracking-wider text-gray-400">${title}</span><button onclick="this.closest('div.pointer-events-auto').remove()" class="text-gray-300 hover:text-gray-500 -mt-1 -mr-1"><i class="fa-solid fa-times"></i></button></div><p class="text-xs font-bold text-gray-700 leading-snug">${msg}</p></div>`;
        if (link) { w.style.cursor = 'pointer'; w.onclick = (e) => { if(!e.target.closest('button')) window.location.href = link; }; }
        container.appendChild(w);
        requestAnimationFrame(() => w.classList.remove('translate-x-full', 'opacity-0'));
        setTimeout(() => { w.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => w.remove(), 500); }, 6000);
    }

    async function loadHistory() {
        if (!layoutClient) return;
        const list = document.getElementById('global-notif-list'); const badge = document.getElementById('global-badge'); if(!list) return;
        const { data } = await layoutClient.from('hub_notifications').select('*').eq('user_id', myId).order('created_at', { ascending: false }).limit(10);
        list.innerHTML = '';
        if (data && data.length > 0) {
            badge.innerText = data.length; badge.classList.remove('hidden');
            data.forEach(n => {
                const sourceType = n.source_app || n.type || 'system';
                let icon = 'fa-bell text-gray-400'; let bgIcon = 'bg-gray-50';
                if (sourceType === 'calendar') { icon = 'fa-calendar text-blue-500'; bgIcon = 'bg-blue-50'; }
                if (sourceType === 'ticket') { icon = 'fa-ticket text-orange-500'; bgIcon = 'bg-orange-50'; }
                if (sourceType === 'finanzas' || sourceType === 'cotizador' || sourceType === 'order') { icon = 'fa-file-invoice-dollar text-brand-red'; bgIcon = 'bg-red-50'; }
                const item = document.createElement('div');
                item.className = "p-4 relative group hover:bg-gray-50 transition cursor-pointer flex gap-3 items-start";
                item.innerHTML = `<div class="w-8 h-8 rounded-full ${bgIcon} flex items-center justify-center shrink-0 mt-0.5"><i class="fa-solid ${icon}"></i></div><div class="flex-grow"><div class="flex justify-between items-start"><p class="text-xs font-bold text-gray-800">${n.title}</p><span class="text-[9px] text-gray-400 font-mono">${new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div><p class="text-[11px] text-gray-500 leading-snug mt-0.5 pr-4">${n.message}</p></div><button onclick="event.stopPropagation(); window.layoutApi.deleteNotif('${n.id}')" class="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"><i class="fa-solid fa-trash-can"></i></button>`;
                const smartLink = getManualLink(sourceType, n.link);
                if(smartLink) item.onclick = () => window.location.href = smartLink;
                list.appendChild(item); 
            });
        } else { badge.classList.add('hidden'); list.innerHTML = `<div class="p-10 text-center flex flex-col items-center"><div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3"><i class="fa-regular fa-bell-slash text-gray-300 text-xl"></i></div><p class="text-xs font-bold text-gray-400">Todo al día</p><p class="text-[10px] text-gray-300 mt-1">No tienes notificaciones nuevas.</p></div>`; }
    }

    window.addEventListener('click', (e) => {
        const drop = document.getElementById('global-notif-dropdown');
        if (drop && !drop.contains(e.target) && !e.target.closest('button[onclick*="toggleNotif"]')) { drop.classList.add('hidden'); }
    });
})();




