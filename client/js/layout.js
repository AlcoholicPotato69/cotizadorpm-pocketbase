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
    const layoutAccentHex = _isCP ? '#deac07' : '#D32F2F';
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
        
        if (path.includes('users') || path.includes('system') || path.includes('config')) return 'CONFIGURACIÓN';
        if (path.includes('finanzas') || path.includes('cotiza') || path.includes('order') || path.includes('catalog') || path.includes('clientes') || path.includes('report')) return 'FINANZAS';
        
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
            if (layoutClient) { await layoutClient.from('hub_notifications').delete().eq('id', id); loadHistory(); } 
        },
        
        deleteAll: async () => {
            if (IS_LOCAL) return;

            if (!confirm('¿Estás seguro de que quieres borrar TODAS las notificaciones?')) return;
            if (layoutClient && myId) {
                const { error } = await layoutClient.from('hub_notifications').delete().eq('user_id', myId);
                if (!error) {
                    window.showToast('Notificaciones eliminadas', 'success');
                    loadHistory();
                } else {
                    window.showToast('Error al eliminar', 'error');
                }
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

    document.addEventListener('DOMContentLoaded', async () => {
        renderHeader('hidden');
        
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
            const { data: { session } } = await layoutClient.auth.getSession();
            
            if (!session) {
                const isLoginPage = window.location.pathname.endsWith('index.html') && !window.location.pathname.includes('/calendar/');
                if (!isLoginPage && pathPrefix !== '') window.location.href = pathPrefix + 'index.html';
                return;
            }
            
            myId = session.user.id;
            
            try {
                const { data } = await layoutClient.from('profiles').select('role, username').eq('id', myId).single();
                if (data?.role === 'admin') {
                    document.getElementById('layout-settings-btn')?.classList.replace('hidden', 'flex');
                    localStorage.setItem('hub_user_cache_role', 'admin');
                }
                
                let displayName = session.user.email.split('@')[0];
                if (data && data.username) displayName = data.username;
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
        const cachedRole = localStorage.getItem('hub_user_cache_role');
        
        if (cachedRole === 'admin') settingsClass = settingsClass.replace('hidden', 'flex');

        const userInfoHTML = `
        <div class="flex items-center border-l border-gray-700 pl-4 ml-4 h-8 transition-opacity duration-500 animate-enter">
             <div class="flex flex-col justify-center leading-none text-left">
                 <span id="layout-user-name" class="font-bold text-sm text-white tracking-tight">${cachedName}</span>
                 <span id="layout-user-email" class="text-[10px] text-gray-400 font-medium mt-0.5">${cachedEmail}</span>
             </div>
        </div>`;

        const html = `
        <header class="bg-brand-dark text-white h-16 shadow-lg z-50 sticky top-0 w-full flex-shrink-0 font-sans border-b border-gray-800">
            <div class="container mx-auto px-6 h-full flex justify-between items-center">
                
                <div class="flex items-center">
                    <a href="${pathPrefix}index.html" class="flex items-center gap-3 hover:opacity-80 transition group mr-2">
                        <img src="${layoutLogoSrc}" class="h-8 w-auto filter brightness-0 invert group-hover:scale-105 transition" onerror="this.style.display='none'">
                        <div class="flex flex-col justify-center leading-tight">
                            <span class="font-bold text-[10px] tracking-[0.2em] text-gray-500 group-hover:text-gray-400 transition">${layoutBrandName}</span>
                            <span class="text-xs font-black tracking-widest uppercase whitespace-nowrap" style="color:${layoutAccentHex}">${title}</span>
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



