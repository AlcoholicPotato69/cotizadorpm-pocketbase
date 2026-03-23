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

    console.log("⚡ Cargando Layout Local...");

    /* -------------------------------------------------------------------------
     * CONEXIÓN A POCKETBASE (LEÍDA DE HUB_CONFIG)
     * ------------------------------------------------------------------------- */
    const LAYOUT_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
    const LAYOUT_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
    const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
    const IS_LOCAL = !!(window.HUB_CONFIG && window.HUB_CONFIG.localMode);
    
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
            #preview-modal > div{
                width:min(96vw,var(--hub-preview-modal-width))!important;
                max-width:none!important;
                height:min(92vh,calc(100vh - 24px))!important;
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
            @media (max-width: 1279px){
                #sidebar-container{
                    width:100%!important;
                    min-width:0!important;
                    max-height:42vh;
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
    }

    ensureResponsiveLayoutStyles();
    syncResponsiveViewport();
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
            if (layoutClient) {
                localStorage.removeItem('hub_user_cache_name');
                localStorage.removeItem('hub_user_cache_email');
                localStorage.removeItem('hub_user_cache_role');
                await layoutClient.auth.signOut();
                window.location.href = pathPrefix + 'index.html';
            }
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
            event.preventDefault();
            pushDiag('submit_blocked', {
                formId: safeSlice(form.id || '', 120),
                action: safeSlice(form.getAttribute('action') || '', 180),
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
            const raw = localStorage.getItem(key);
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
            ['pb_compat_auth_v1', 'pb_native_auth_v1', 'pb_auth'].forEach((key) => {
                const parsed = readAuthLikeStorageEntry(key);
                if (!parsed) return;
                pool.push(parsed.user || null, parsed.record || null, parsed.model || null);
            });
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = String(localStorage.key(i) || '');
                if (!/(pocketbase|pb).*(auth|session)|auth.*(pocketbase|pb)/i.test(key)) continue;
                const parsed = readAuthLikeStorageEntry(key);
                if (!parsed) continue;
                pool.push(parsed.user || null, parsed.record || null, parsed.model || null);
            }
        } catch (_) {}
        return pool.find((candidate) => candidate && typeof candidate === 'object' && (candidate.id || candidate.email)) || null;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        installNavigationSafetyGuards();
        
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

        if (layoutClient) {
            let session = null;
            try {
                const response = await layoutClient.auth.getSession();
                session = response?.data?.session || null;
            } catch (_) {
                session = null;
            }
            if (!session) {
                const fallbackUser = resolveFallbackSessionUser();
                if (fallbackUser) session = { user: fallbackUser, __fallback: true };
            }
            
            if (!session) {
                const isLoginPage = window.location.pathname.endsWith('index.html') && !window.location.pathname.includes('/calendar/');
                if (!isLoginPage && pathPrefix !== '') {
                    const isCotizadorArea = /\/cotizador(cp)?\//.test(window.location.pathname || '');
                    const redirectGuardKey = 'hub_session_redirect_guard_v1';
                    const now = Date.now();
                    const last = Number(sessionStorage.getItem(redirectGuardKey) || 0);
                    if (isCotizadorArea) {
                        if (typeof window.showToast === 'function') {
                            window.showToast('Sesión no disponible temporalmente. Evitando redirección automática.', 'warning');
                        }
                    } else if (!Number.isFinite(last) || (now - last) > 8000) {
                        try { sessionStorage.setItem(redirectGuardKey, String(now)); } catch (_) {}
                        window.location.href = pathPrefix + 'index.html';
                    } else if (typeof window.showToast === 'function') {
                        window.showToast('Sesión no disponible temporalmente. Evitando redirección repetitiva.', 'warning');
                    }
                }
                return;
            }
            
            myId = session.user.id;
            
            try {
                const normalizeRole = (value) => {
                    const safe = String(value || '').trim().toLowerCase();
                    if (!safe) return '';
                    if (safe === 'administrador' || safe === 'superadmin' || safe === 'super_admin') return 'admin';
                    return safe;
                };
                const userEmail = String(session?.user?.email || '').trim().toLowerCase();
                const lookupOne = async (table, field, value) => {
                    if (!value) return null;
                    try {
                        const { data } = await layoutClient.from(table).select('role, username, login_username, email').eq(field, value).maybeSingle();
                        return data || null;
                    } catch (_) {
                        return null;
                    }
                };

                let data = await lookupOne('app_users', 'id', myId);
                if (!data) data = await lookupOne('app_users', 'email', userEmail);
                if (!data) data = await lookupOne('profiles', 'id', myId);
                if (!data) data = await lookupOne('profiles', 'email', userEmail);

                const resolvedRole = normalizeRole(data?.role);
                if (resolvedRole === 'admin') {
                    document.getElementById('layout-settings-btn')?.classList.replace('hidden', 'flex');
                    localStorage.setItem('hub_user_cache_role', 'admin');
                } else {
                    localStorage.removeItem('hub_user_cache_role');
                }
                
                let displayName = session.user.email.split('@')[0];
                if (data && (data.username || data.login_username)) displayName = data.username || data.login_username;
                else displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

                localStorage.setItem('hub_user_cache_name', displayName);
                localStorage.setItem('hub_user_cache_email', session.user.email);

                updateHeaderInfo(displayName, session.user.email);

            } catch(e) {}

            initUnifiedNotifications();
            initLegacyCalendarListener(); 
            loadHistory();
        }
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



