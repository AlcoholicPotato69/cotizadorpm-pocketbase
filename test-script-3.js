
        // --- CONFIGURACIÓN ---
        let HUB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
        let HUB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
        let hubPocketBase;
        let hubAuthNative = null;
        let useNativeAuth = false;
        let currentUser = null;

        function syncHubRuntimeConfig() {
            HUB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
            HUB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
        }

        // --- UTILIDADES UI ---
        function getTextColorClass(c) { const map = { red: 'text-brand-red', cp: 'text-brand-cp', blue: 'text-blue-600', green: 'text-green-600', purple: 'text-purple-600', cyan: 'text-cyan-600', orange: 'text-orange-600', pink: 'text-pink-600' }; return map[c] || 'text-gray-600'; }
        function getBgColorClass(c) { const map = { red: 'bg-red-50', cp: 'bg-yellow-50', blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50', cyan: 'bg-cyan-50', orange: 'bg-orange-50', pink: 'bg-pink-50' }; return map[c] || 'bg-gray-50'; }
        function getBorderColorClass(c) { const map = { red: 'border-brand-red', cp: 'border-brand-cp', blue: 'border-blue-600', green: 'border-green-600', purple: 'border-purple-600', cyan: 'border-cyan-600', orange: 'border-orange-600', pink: 'border-pink-600' }; return map[c] || 'border-gray-500'; }

        // --- INICIALIZACIÓN SEGURA ---
        document.addEventListener('DOMContentLoaded', async () => {
            if (window.HUB_CONFIG_READY && typeof window.HUB_CONFIG_READY.then === 'function') {
                await window.HUB_CONFIG_READY;
            }
            syncHubRuntimeConfig();

            // 1. Inicializar cliente de autenticacion nativo
            hubAuthNative = window.PB_SERVICES && window.PB_SERVICES.auth ? window.PB_SERVICES.auth : null;
            useNativeAuth = !!hubAuthNative;
            if (typeof window.PB_CLIENT !== 'undefined') {
                hubPocketBase = window.globalPocketBase || window.pbClient || window.PB_CLIENT.createClient(HUB_URL, HUB_KEY);
            }
            if (!useNativeAuth && !hubPocketBase) {
                console.error("CRÍTICO: No hay cliente de autenticación nativo.");
                if (window.showToast) window.showToast("Error de sistema: cliente no inicializado.", "error");
                return;
            }

            // 3. LISTENERS DE EVENTOS (Ahora es seguro asignarlos)

            // A. Formulario Login
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    const btn = e.target.querySelector('button');
                    const originalContent = btn.innerHTML;

                    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> VERIFICANDO...';
                    btn.disabled = true;
                    document.getElementById('login-error').classList.add('hidden');

                    let loginError = null;
                    if (useNativeAuth && hubAuthNative) {
                        try {
                            await hubAuthNative.login({ email, password });
                        } catch (err) {
                            loginError = err;
                        }
                    } else {
                        const { error } = await hubPocketBase.auth.signInWithPassword({ email, password });
                        loginError = error || null;
                    }

                    if (loginError) {
                        document.getElementById('login-error').classList.remove('hidden');
                        btn.innerHTML = originalContent;
                        btn.disabled = false;
                    } else {
                        const qs = new URLSearchParams(window.location.search);
                        const redirectUrl = qs.get('redirect');
                        if (redirectUrl) {
                            window.location.replace(redirectUrl);
                        } else {
                            window.location.reload();
                        }
                    }
                });
            }

            // B. Botones Dashboard
            const btnToggle = document.getElementById('btn-toggle-notifs');
            if (btnToggle) btnToggle.addEventListener('click', toggleDashboardNotifs);

            const btnClear = document.getElementById('btn-clear-notifs');
            if (btnClear) btnClear.addEventListener('click', clearAllNotifs);

            const btnLogout = document.getElementById('btn-logout');
            if (btnLogout) btnLogout.addEventListener('click', dashboardLogout);

            // C. Click fuera para cerrar dropdown
            document.addEventListener('click', (e) => {
                const drop = document.getElementById('dash-notif-dropdown');
                const btn = document.getElementById('btn-toggle-notifs');
                // Si el click NO fue en el dropdown NI en el botón
                if (drop && btn && !drop.classList.contains('hidden') && !drop.contains(e.target) && !btn.contains(e.target)) {
                    drop.classList.add('hidden');
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeDashboardNotifModal();
            });

            // 4. Lógica de Sesión
            let session = null;
            if (useNativeAuth && hubAuthNative) {
                const nativeSession = await hubAuthNative.getSession();
                session = nativeSession ? nativeSession.session : null;
            } else {
                const out = await hubPocketBase.auth.getSession();
                session = out && out.data ? out.data.session : null;
            }
            if (session) {
                currentUser = session.user;
                const qs = new URLSearchParams(window.location.search);
                const redirectUrl = qs.get('redirect');
                if (redirectUrl) {
                    window.location.replace(redirectUrl);
                } else {
                    await showDashboard(currentUser);
                }
            } else {
                showLogin();
            }
        });

        function showLogin() {
            document.getElementById('view-login').classList.remove('hidden');
            document.getElementById('view-dashboard').classList.add('hidden');
            document.getElementById('main-container').classList.add('login-bg');
            document.getElementById('main-container').classList.remove('bg-brand-gray');
        }

        function normalizeDashboardRole(value) {
            let role = String(value || '').toLowerCase().trim();
            if (typeof role.normalize === 'function') role = role.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            role = role.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            if (role === 'administrador' || role === 'superadmin' || role === 'super_admin') return 'admin';
            if (role === 'ambos' || role === 'both' || role === 'user' || role === 'usuario') return '';
            if (role === 'plaza_mayor' || role === 'plazamayor' || role === 'pm' || role === 'finanzas') return 'plaza_mayor';
            if (role === 'casa_de_piedra' || role === 'casadepiedra' || role === 'cp') return 'casa_de_piedra';
            return role;
        }

        function normalizeDashboardTenant(value) {
            const tenant = String(value || '').toLowerCase().trim();
            if (tenant === 'pm' || tenant === 'plaza mayor' || tenant === 'plaza_mayor') return 'plaza_mayor';
            if (tenant === 'cp' || tenant === 'casa de piedra' || tenant === 'casa_de_piedra') return 'casa_de_piedra';
            return tenant;
        }

        function canOpenControlFromDashboard(profile) {
            const isAdmin = profile?.isAdmin === true || profile?.app_metadata?.rbac?.is_admin === true;
            if (isAdmin) return true;
            const perms = getDashboardFinanzasPermissions(profile || {});
            if (perms && Object.prototype.hasOwnProperty.call(perms, 'control_view')) return !!perms.control_view;
            return false;
        }

        function isControlDashboardModule(module) {
            const path = String(module?.url_path || module?.path || module?.href || '').toLowerCase();
            const name = String(module?.name || module?.title || '').toLowerCase();
            return /(^|\/)control\.html(?:$|[?#])/.test(path) || name === 'control' || name === 'control operativo';
        }

        function getDashboardModuleKey(module) {
            const rawPath = String(module?.url_path || module?.path || module?.href || '').toLowerCase().split('#')[0].split('?')[0];
            const file = rawPath.split('/').pop() || '';
            const name = String(module?.name || module?.title || '').toLowerCase();
            if (file === 'catalog.html' || name.includes('catalog') || name.includes('precios')) return 'catalog';
            if (file === 'orders.html' || name.includes('orden')) return 'orders';
            if (file === 'cotizacion.html' || name.includes('cotiz')) return 'quote';
            if (file === 'agenda.html' || file === 'calendar.html' || name.includes('agenda') || name.includes('calend')) return 'agenda';
            if (file === 'contracts.html' || name.includes('contrato')) return 'contracts';
            if (file === 'receipts.html' || name.includes('recibo')) return 'receipts';
            if (file === 'invoices.html' || name.includes('factura')) return 'invoices';
            if (file === 'reports.html' || name.includes('reporte')) return 'reports';
            if (file === 'clientes.html' || name.includes('cliente')) return 'clients';
            if (isControlDashboardModule(module)) return 'control';
            if (rawPath.includes('/system/') || file === 'config.html' || name.includes('config')) return 'config';
            return file || name;
        }

        function getDashboardFinanzasPermissions(profile) {
            const fromLayout = window.currentUserPermissions && typeof window.currentUserPermissions === 'object'
                ? window.currentUserPermissions
                : null;
            const fromProfile = profile?.app_metadata?.finanzas?.permissions;
            return (fromProfile && typeof fromProfile === 'object') ? fromProfile : (fromLayout || null);
        }

        function hasExplicitDashboardPermission(perms, keys) {
            if (!perms || typeof perms !== 'object') return null;
            for (const key of keys) {
                if (Object.prototype.hasOwnProperty.call(perms, key)) return !!perms[key];
            }
            return null;
        }

        function canShowDashboardApp(app, profile, role) {
            const perms = getDashboardFinanzasPermissions(profile);
            const key = getDashboardModuleKey(app);
            const accessFallback = !perms || perms.access !== false;

            const localIsAdmin = profile?.isAdmin === true || profile?.app_metadata?.rbac?.is_admin === true;
            if (localIsAdmin) return true;

            if (key === 'control') {
                const explicit = hasExplicitDashboardPermission(perms, ['control_view']);
                return explicit === null ? accessFallback : explicit;
            }
            if (key === 'config') {
                const explicit = hasExplicitDashboardPermission(perms, ['config_manage', 'permissions_manage', 'users_manage', 'catalog_manage', 'pdf_layout_manage']);
                return explicit === null ? false : explicit;
            }
            if (key === 'clients') {
                const explicit = hasExplicitDashboardPermission(perms, ['clients_view', 'clients_manage', 'clients_verify', 'clients_create']);
                return explicit === null ? accessFallback : explicit;
            }
            if (key === 'reports') {
                const explicit = hasExplicitDashboardPermission(perms, ['reports_view']);
                return explicit === null ? accessFallback : explicit;
            }
            if (key === 'catalog') {
                const explicit = hasExplicitDashboardPermission(perms, ['catalog_view', 'catalog_manage']);
                return explicit === null ? accessFallback : explicit;
            }
            if (['orders', 'quote', 'agenda', 'contracts', 'receipts', 'invoices'].includes(key)) {
                const explicit = hasExplicitDashboardPermission(perms, ['orders_view', 'orders_edit', 'contracts_view', 'receipts_view', 'invoices_view']);
                return explicit === null ? accessFallback : explicit;
            }
            return accessFallback;
        }

        async function filterDashboardAppsByAssignedModules(apps, role, profile) {
            const normalizedRole = normalizeDashboardRole(role || profile?.role || profile?.rol || '');
            return apps.filter((app) => canShowDashboardApp(app, profile, normalizedRole));
        }

        async function renderTenantSwitchDashboard(grid, profile, role, buildModulesFn, cardHTMLFn, options = {}) {
            const activeTenant = resolveVerifierDashboardTenant(profile);
            const activePrefix = activeTenant === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
            const activeAccent = activeTenant === 'casa_de_piedra' ? 'cp' : 'red';
            const includeClients = options.includeClients !== false;
            const includeAdminTools = options.includeAdminTools === true;
            const normalizedRole = normalizeDashboardRole(role || profile?.role || profile?.rol || '');

            const modules = [
                ...buildModulesFn(activePrefix, activeAccent)
            ];

            if (includeAdminTools) {
                modules.push({ name: 'Control Operativo', description: 'Supervisión de bitácoras y reportes.', icon: 'fa-shield-halved', url_path: `${activePrefix}/control.html`, color: 'admin' });
                modules.push({ name: 'Configuracion', description: 'Panel de administración general.', icon: 'fa-gear', url_path: 'system/config.html', color: 'admin' });
            }

            const allowedModules = await filterDashboardAppsByAssignedModules(modules, normalizedRole, profile);
            grid.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto';
            grid.innerHTML = buildVerifierDashboardSwitchHtml(profile, activeTenant);
            allowedModules.forEach(app => grid.innerHTML += cardHTMLFn(app));
            bindVerifierDashboardTenantSwitch(grid, async () => { await showDashboard(currentUser || profile || {}); });
        }

        function resolveDashboardControlPrefix(profile) {
            const preferredTenant = normalizeDashboardTenant(profile?.tenant_default || profile?.default_tenant || '');
            if (preferredTenant === 'casa_de_piedra') return 'cotizadorcp';
            const tenants = Array.isArray(profile?.allowed_tenants)
                ? profile.allowed_tenants.map(normalizeDashboardTenant).filter(Boolean)
                : [];
            return tenants.length === 1 && tenants[0] === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
        }

        const VERIFIER_DASHBOARD_TENANT_KEY = 'hub_verifier_dashboard_tenant_v1';

        function getVerifierDashboardTenants(profile) {
            const tenants = Array.isArray(profile?.allowed_tenants)
                ? profile.allowed_tenants.map(normalizeDashboardTenant).filter((tenant) => tenant === 'plaza_mayor' || tenant === 'casa_de_piedra')
                : [];
            const unique = Array.from(new Set(tenants));
            if (unique.length) return unique;
            return ['plaza_mayor', 'casa_de_piedra'];
        }

        function resolveVerifierDashboardTenant(profile) {
            const allowed = getVerifierDashboardTenants(profile);
            let stored = '';
            try { stored = normalizeDashboardTenant(localStorage.getItem(VERIFIER_DASHBOARD_TENANT_KEY) || ''); } catch (_) { }
            if (stored && allowed.includes(stored)) return stored;
            const preferred = normalizeDashboardTenant(profile?.tenant_default || profile?.default_tenant || '');
            if (preferred && allowed.includes(preferred)) return preferred;
            return allowed.includes('plaza_mayor') ? 'plaza_mayor' : (allowed[0] || 'plaza_mayor');
        }

        function persistVerifierDashboardTenant(tenant) {
            const normalized = normalizeDashboardTenant(tenant);
            if (!normalized) return;
            try { localStorage.setItem(VERIFIER_DASHBOARD_TENANT_KEY, normalized); } catch (_) { }
        }

        function buildVerifierDashboardSwitchHtml(profile, currentTenant) {
            const tenants = getVerifierDashboardTenants(profile);
            if (tenants.length < 2) return '';
            return `
                <div class="col-span-full">
                    <div class="mx-auto flex max-w-6xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-xl md:flex-row md:items-center md:justify-between md:px-5 md:py-5">
                        <div class="min-w-0">
                            <div class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                <i class="fa-solid fa-compass"></i>
                                Vista activa
                            </div>
                            <h2 class="mt-3 text-lg font-black tracking-tight text-slate-900 md:text-xl">Elige la sede desde la que vas a trabajar</h2>
                            <p class="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Clientes, precios, control y configuración se abrirán directamente en la vista que selecciones aquí.</p>
                        </div>
                        <div class="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                            ${tenants.map((tenant) => {
                const active = tenant === currentTenant;
                const isCP = tenant === 'casa_de_piedra';
                const label = isCP ? 'Casa de Piedra' : 'Plaza Mayor';
                const hint = isCP ? 'Acabados y operación CP' : 'Operación central PM';
                const icon = isCP ? 'fa-gem' : 'fa-building';
                const activeClasses = isCP
                    ? 'border-amber-200 bg-gradient-to-br from-amber-500 to-orange-700 text-white shadow-lg shadow-orange-200'
                    : 'border-rose-200 bg-gradient-to-br from-rose-600 to-red-700 text-white shadow-lg shadow-red-200';
                const inactiveClasses = 'border-slate-200 bg-slate-50 text-slate-600 hover:-translate-y-1 hover:border-slate-300 hover:bg-white';
                const iconClasses = active
                    ? 'bg-white/15 text-white'
                    : (isCP ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700');
                const metaClasses = active ? 'text-white/80' : 'text-slate-400';
                return `
                                    <button
                                        type="button"
                                        data-verifier-dashboard-tenant="${tenant}"
                                        class="${active ? activeClasses : inactiveClasses} flex items-center justify-between gap-3 rounded-3xl border px-4 py-4 text-left transition"
                                    >
                                        <span class="flex min-w-0 items-center gap-3">
                                            <span class="${iconClasses} flex h-12 w-12 items-center justify-center rounded-2xl text-lg shadow-sm">
                                                <i class="fa-solid ${icon}"></i>
                                            </span>
                                            <span class="min-w-0">
                                                <span class="block truncate text-sm font-black uppercase tracking-[0.14em]">${label}</span>
                                                <span class="${metaClasses} mt-1 block text-[11px] font-semibold">${active ? 'Vista actual' : hint}</span>
                                            </span>
                                        </span>
                                        <span class="${active ? 'bg-white/15 text-white' : 'bg-white text-slate-400'} flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 shadow-sm">
                                            <i class="fa-solid fa-arrow-right"></i>
                                        </span>
                                    </button>`;
            }).join('')}
                        </div>
                    </div>
                </div>`;
        }

        function bindVerifierDashboardTenantSwitch(grid, rerender) {
            if (!grid) return;
            grid.querySelectorAll('[data-verifier-dashboard-tenant]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const tenant = normalizeDashboardTenant(button.getAttribute('data-verifier-dashboard-tenant') || '');
                    if (!tenant) return;
                    persistVerifierDashboardTenant(tenant);
                    if (typeof rerender === 'function') await rerender();
                });
            });
        }

        async function showDashboard(user) {
            // Carga silenciosa de layout.js para mantener la sesión global activa al navegar
            if (!document.querySelector('script[src="./js/layout.js?v=20260426-v3-digital-calendar"]')) {
                const layoutScript = document.createElement('script');
                layoutScript.src = "./js/layout.js";
                document.body.appendChild(layoutScript);
            }

            // Obtener perfil para nombre y roles
            let profileRecord = null;
            let profileError = null;
            if (useNativeAuth && hubAuthNative) {
                try {
                    profileRecord = await hubAuthNative.getProfile(user.id);
                } catch (err) {
                    profileError = err;
                }
            } else {
                const resp = await hubPocketBase
                    .from('app_users')
                    .select('role, username, allowed_tenants, tenant_default, app_metadata')
                    .eq('id', user.id)
                    .single();
                profileRecord = resp.data || null;
                profileError = resp.error || null;
            }

            if (profileError) { console.warn('No se pudo cargar el perfil:', profileError); }

            let roleFallback = normalizeDashboardRole(user?.role || user?.rol || '');
            const allowedFallback = Array.isArray(user?.allowed_tenants)
                ? user.allowed_tenants.map(normalizeDashboardTenant).filter(Boolean)
                : ((roleFallback === 'admin' || roleFallback === 'verificador')
                    ? ['plaza_mayor', 'casa_de_piedra']
                    : ((roleFallback === 'plaza_mayor' || roleFallback === 'casa_de_piedra') ? [roleFallback] : []));

            const profile = profileRecord || {
                role: roleFallback,
                username: user?.username || user?.email?.split('@')[0] || '',
                allowed_tenants: allowedFallback,
                tenant_default: user?.tenant_default || user?.default_tenant || null,
            };

            // Determinar nombre a mostrar
            let displayName = '';
            if (profile && profile.username) {
                displayName = profile.username;
            } else {
                const simpleName = user.email.split('@')[0];
                displayName = simpleName.charAt(0).toUpperCase() + simpleName.slice(1);
            }

            const nameElement = document.getElementById('dash-user-name');
            if (nameElement) nameElement.innerText = displayName;

            // Transición de vistas
            document.getElementById('view-login').classList.add('hidden');
            document.getElementById('view-dashboard').classList.remove('hidden');
            document.getElementById('main-container').classList.remove('login-bg');
            document.getElementById('main-container').classList.add('bg-brand-gray');

            // Cargar contenido
            loadApps(user, profile);
            if (!(window.HUB_CONFIG && window.HUB_CONFIG.localMode)) {
                loadNotifications(user.id);
            } else {
                const notifBtn = document.getElementById('btn-toggle-notifs');
                const notifDrop = document.getElementById('dash-notif-dropdown');
                const notifBadge = document.getElementById('dash-badge');
                if (notifBtn) notifBtn.classList.add('hidden');
                if (notifDrop) notifDrop.classList.add('hidden');
                if (notifBadge) notifBadge.classList.add('hidden');
            }
        }

        async function loadApps(user, preloadedProfile) {
            const grid = document.getElementById('apps-grid');
            const p = preloadedProfile || user || {};
            let userRole = normalizeDashboardRole(p.role || p.rol || '');
            const isAdmin = p.isAdmin === true || p.app_metadata?.rbac?.is_admin === true;
            const allowedTenants = Array.isArray(p.allowed_tenants)
                ? p.allowed_tenants.map(normalizeDashboardTenant).filter(Boolean)
                : ((isAdmin || userRole === 'verificador')
                    ? ['plaza_mayor', 'casa_de_piedra']
                    : ((userRole === 'plaza_mayor' || userRole === 'casa_de_piedra') ? [userRole] : []));
            const isVerifier = userRole === 'verificador';

            const hasPM = isAdmin || allowedTenants.includes('plaza_mayor');
            const hasCP = isAdmin || allowedTenants.includes('casa_de_piedra');
            const defaultGridClass = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6';
            const dualGridClass = 'grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 max-w-5xl mx-auto';

            const pmLogo = (window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || './public/assets/logo.png';
            const cpLogo = (window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || './public/assets/logocp.png';

            function cardHTML(app) {
                const colorKey = app.color || 'gray';
                const isCPCard = colorKey === 'cp';
                const isAdminCard = colorKey === 'admin';

                const textColor = isAdminCard ? 'text-slate-600' : (isCPCard ? 'text-brand-cp' : getTextColorClass(colorKey));
                const bgColor = isAdminCard ? 'bg-slate-100' : (isCPCard ? 'bg-yellow-50' : getBgColorClass(colorKey));
                const cardClass = 'module-card ' + (isCPCard ? 'cp ' : '') + 'bg-white rounded-2xl p-6 relative overflow-hidden group cursor-pointer block' + (isAdminCard ? ' border border-slate-200' : '');

                const logoFallback = isCPCard ? './public/assets/logocp.png' : './public/assets/logo.png';
                const iconHTML = app.logoUrl
                    ? `<img src="${app.logoUrl}" alt="${app.name || ''}" class="h-8 object-contain" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${logoFallback}';return;} this.style.display='none';">`
                    : `<i class="fa-solid ${app.icon || 'fa-cube'}"></i>`;

                return `
                            <a href="${app.url_path || '#'}" class="${cardClass}">
                                <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 ${bgColor} group-hover:scale-150 transition-transform duration-500 ease-out"></div>
                                <div class="relative z-10 flex flex-col h-full justify-between">
                                    <div>
                                        <div class="flex justify-between items-start mb-6">
                                            <div class="module-icon w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center text-xl ${textColor}">${iconHTML}</div>
                                        </div>
                                        <h3 class="font-black text-lg text-gray-800 mb-2">${app.name || ''}</h3>
                                        <p class="text-sm text-gray-500 font-medium leading-relaxed">${app.description || ''}</p>
                                    </div>
                                    <div class="mt-6 flex items-center justify-between">
                                        <span class="text-xs font-black uppercase tracking-widest ${textColor}">Abrir</span>
                                        <i class="fa-solid fa-arrow-right text-gray-300 group-hover:text-gray-400 transition"></i>
                                    </div>
                                </div>
                            </a>`;
            }

            function heroCardHTML(prefix, isCP) {
                const textColor = isCP ? 'text-brand-cp' : 'text-brand-red';
                const bgIcon = isCP ? 'bg-yellow-50' : 'bg-red-50';
                const cardClass = 'module-card bg-white rounded-2xl p-5 relative overflow-hidden group cursor-pointer block';

                return `
                            <div class="col-span-full flex justify-center mb-2">
                                <a href="${prefix}/cotizacion.html" class="${cardClass} w-full max-w-xl border border-gray-100/80 shadow-sm flex flex-row items-center gap-5 hover:-translate-y-1 transition-transform">
                                    <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 ${bgIcon} group-hover:scale-150 transition-transform duration-500 ease-out"></div>
                                    <div class="relative z-10 w-12 h-12 rounded-xl ${bgIcon} flex items-center justify-center text-xl ${textColor} shadow-sm shrink-0">
                                        <i class="fa-solid fa-file-invoice-dollar"></i>
                                    </div>
                                    <div class="relative z-10 flex-grow">
                                        <h3 class="font-black text-lg text-gray-800 leading-tight mb-1 group-hover:${textColor} transition-colors">Crear Cotización</h3>
                                        <p class="text-[11px] text-gray-500 font-medium leading-snug">Comenzar una nueva orden, selección de espacios y conceptos para presupuestos.</p>
                                    </div>
                                    <div class="relative z-10 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <div class="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:border-current group-hover:${textColor} transition-colors bg-white shadow-sm">
                                            <i class="fa-solid fa-arrow-right -rotate-45 group-hover:rotate-0 transition-transform duration-300"></i>
                                        </div>
                                    </div>
                                </a>
                            </div>`;
            }

            const buildModules = (prefix, colorKey) => {
                return [
                    { name: 'Cotización', description: 'Crear y gestionar cotizaciones.', icon: 'fa-file-invoice-dollar', url_path: `${prefix}/cotizacion.html`, color: colorKey },
                    { name: 'Clientes', description: 'Gestión de expedientes y documentos.', icon: 'fa-users', url_path: `${prefix}/clientes.html`, color: colorKey },
                    { name: 'Catálogo', description: 'Catálogo y cotización de conceptos.', icon: 'fa-cart-shopping', url_path: `${prefix}/catalog.html`, color: colorKey },
                    { name: 'Órdenes', description: 'Gestión de órdenes y seguimiento.', icon: 'fa-clipboard-list', url_path: `${prefix}/orders.html`, color: colorKey },
                    { name: 'Agenda', description: 'Calendario y agenda de entregas.', icon: 'fa-calendar-days', url_path: `${prefix}/agenda.html`, color: colorKey },
                    { name: 'Contratos', description: 'Plantillas y generación de contratos.', icon: 'fa-file-signature', url_path: `${prefix}/contracts.html`, color: colorKey },
                    { name: 'Recibos', description: 'Recibos, constancias y control de pagos.', icon: 'fa-receipt', url_path: `${prefix}/receipts.html`, color: colorKey },
                    { name: 'Facturas', description: 'Gestión de facturación y recibos.', icon: 'fa-file-invoice-dollar', url_path: `${prefix}/invoices.html`, color: colorKey },
                    { name: 'Reportes', description: 'Reportes y métricas del cotizador.', icon: 'fa-chart-pie', url_path: `${prefix}/reports.html`, color: colorKey },
                ];
            };

            if ((window.HUB_CONFIG && window.HUB_CONFIG.localMode) || useNativeAuth) {
                grid.innerHTML = '';
                if (isVerifier) {
                    const verifierTenant = resolveVerifierDashboardTenant(p);
                    const verifierPrefix = verifierTenant === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
                    const verifierAccent = verifierTenant === 'casa_de_piedra' ? 'cp' : 'red';
                    grid.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto';
                    const verifierCards = [
                        { name: 'Catálogo', description: 'Catálogo y cotización de conceptos.', icon: 'fa-cart-shopping', url_path: `${verifierPrefix}/catalog.html`, color: verifierAccent },
                        { name: 'Clientes', description: 'Revision de expedientes, documentos y dictamenes de la vista activa.', icon: 'fa-users', url_path: `${verifierPrefix}/clientes.html`, color: verifierAccent },
                        { name: 'Control', description: 'Bitacora, responsables y supervision operativa.', icon: 'fa-shield-halved', url_path: `${verifierPrefix}/control.html`, color: 'admin' },
                        { name: 'Configuracion', description: 'Configuracion general permitida para verificacion.', icon: 'fa-gear', url_path: `system/config.html?tenant=${verifierTenant === 'casa_de_piedra' ? 'cp' : 'pm'}`, color: 'admin' },
                    ];
                    const allowedVerifierCards = await filterDashboardAppsByAssignedModules(verifierCards, userRole, p);
                    grid.innerHTML = buildVerifierDashboardSwitchHtml(p, verifierTenant);
                    allowedVerifierCards.forEach(app => grid.innerHTML += cardHTML(app));
                    bindVerifierDashboardTenantSwitch(grid, async () => { await showDashboard(currentUser || user); });
                    return;
                }
                if (isAdmin || (hasPM && hasCP)) {
                    await renderTenantSwitchDashboard(grid, p, userRole, buildModules, cardHTML, { includeClients: true, includeAdminTools: isAdmin });
                    return;
                }

                // Perfiles con ambos tenants: usamos la vista de switch para elegir sede
                if (hasPM && hasCP) {
                    await renderTenantSwitchDashboard(grid, p, userRole, buildModules, cardHTML, { includeClients: true, includeAdminTools: false });
                    return;
                }

                // Solo Plaza Mayor: muestra módulos individuales con hero central
                if (hasPM) {
                    grid.innerHTML = heroCardHTML('cotizador', false);
                    (await filterDashboardAppsByAssignedModules(buildModules('cotizador', 'red'), userRole, p)).forEach(app => grid.innerHTML += cardHTML(app));
                    return;
                }

                // Solo Casa de Piedra: muestra módulos individuales con hero central
                if (hasCP) {
                    grid.innerHTML = heroCardHTML('cotizadorcp', true);
                    (await filterDashboardAppsByAssignedModules(buildModules('cotizadorcp', 'cp'), userRole, p)).forEach(app => grid.innerHTML += cardHTML(app));
                    return;
                }

                // Sin acceso
                grid.innerHTML = `
                                <div class="col-span-full flex flex-col items-center justify-center text-gray-400 py-20 animate-enter">
                                    <i class="fa-solid fa-folder-open text-6xl mb-4 text-gray-200"></i>
                                    <p class="font-bold text-lg">Sin módulos asignados</p>
                                    <p class="text-xs">Contacta al administrador del sistema.</p>
                                </div>`;
                return;
            }

            const profile = p;
            const userCanOpenControl = canOpenControlFromDashboard(profile);
            // isAdmin ya está declarado arriba

            if (isAdmin || (hasPM && hasCP)) {
                await renderTenantSwitchDashboard(grid, profile, userRole, buildModules, cardHTML, { includeClients: true, includeAdminTools: isAdmin });
                return;
            }

            const profileAllowedTenants = Array.isArray(profile?.allowed_tenants)
                ? profile.allowed_tenants.map(normalizeDashboardTenant).filter(Boolean)
                : [];
            if (profileAllowedTenants.includes('plaza_mayor') && profileAllowedTenants.includes('casa_de_piedra')) {
                await renderTenantSwitchDashboard(grid, profile, userRole, buildModules, (app) => {
                    const colorKey = app.color || 'gray';
                    const borderColor = getBorderColorClass(colorKey);
                    const textColor = getTextColorClass(colorKey);
                    const bgColor = getBgColorClass(colorKey);

                    return `
                <a href="${app.url_path || '#'}" class="module-card bg-white rounded-2xl p-6 relative overflow-hidden group cursor-pointer block">
                    <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${bgColor} opacity-50 group-hover:scale-150 transition-transform duration-500 ease-out"></div>
                    <div class="relative z-10 flex flex-col h-full justify-between">
                        <div class="flex justify-between items-start mb-6">
                            <div class="module-icon w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center text-xl ${textColor} transition-all duration-300 shadow-sm">
                                <i class="${app.icon || 'fa-solid fa-cube'}"></i>
                            </div>
                            <div class="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:border-brand-red group-hover:text-brand-red transition-colors bg-white">
                                <i class="fa-solid fa-arrow-right -rotate-45 group-hover:rotate-0 transition-transform duration-300"></i>
                            </div>
                        </div>
                        <div>
                            <h3 class="text-xl font-black text-gray-800 mb-2 leading-tight group-hover:text-brand-red transition-colors">${app.name || 'Sin Título'}</h3>
                            <p class="text-xs text-gray-500 font-medium line-clamp-2 leading-relaxed">${app.description || 'Acceso directo al módulo del sistema.'}</p>
                        </div>
                    </div>
                </a>`;
                }, { includeClients: true, includeAdminTools: false });
                return;
            }

            let moduleCandidates = [];
            if (hasPM) moduleCandidates = moduleCandidates.concat(buildModules('cotizador', 'red'));
            if (hasCP) moduleCandidates = moduleCandidates.concat(buildModules('cotizadorcp', 'cp'));
            let filteredModules = await filterDashboardAppsByAssignedModules(moduleCandidates, userRole, profile);

            if (userCanOpenControl && !filteredModules.some(isControlDashboardModule)) {
                const controlPrefix = resolveDashboardControlPrefix(profile);
                filteredModules.push({
                    name: isAdmin ? 'Control Operativo' : 'Control',
                    description: 'Bitácora, responsables y reportes en una vista independiente.',
                    icon: 'fa-solid fa-shield-halved',
                    url_path: `${controlPrefix}/control.html`,
                    color: isAdmin ? 'gray' : 'red'
                });
            }
            if ((isAdmin || canShowDashboardApp({ name: 'Configuracion', url_path: 'system/config.html' }, profile, userRole))
                && !filteredModules.some((module) => getDashboardModuleKey(module) === 'config')) {
                filteredModules.push({
                    name: 'Configuracion',
                    description: 'Panel general de administración y permisos.',
                    icon: 'fa-solid fa-gear',
                    url_path: 'system/config.html',
                    color: 'gray'
                });
            }

            grid.innerHTML = '';
            if (filteredModules.length === 0) {
                grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center text-gray-400 py-20 animate-enter">
                    <i class="fa-solid fa-folder-open text-6xl mb-4 text-gray-200"></i>
                    <p class="font-bold text-lg">Sin módulos asignados</p>
                    <p class="text-xs">Contacta al administrador del sistema.</p>
                </div>`;
                return;
            }

            filteredModules.forEach(app => {
                const colorKey = app.color || 'gray';
                const borderColor = getBorderColorClass(colorKey);
                const textColor = getTextColorClass(colorKey);
                const bgColor = getBgColorClass(colorKey);

                grid.innerHTML += `
                <a href="${app.url_path || '#'}" class="module-card bg-white rounded-2xl p-6 relative overflow-hidden group cursor-pointer block">
                    <div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${bgColor} opacity-50 group-hover:scale-150 transition-transform duration-500 ease-out"></div>
                    <div class="relative z-10 flex flex-col h-full justify-between">
                        <div class="flex justify-between items-start mb-6">
                            <div class="module-icon w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center text-xl ${textColor} transition-all duration-300 shadow-sm">
                                <i class="${app.icon || 'fa-solid fa-cube'}"></i>
                            </div>
                            <div class="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 group-hover:border-brand-red group-hover:text-brand-red transition-colors bg-white">
                                <i class="fa-solid fa-arrow-right -rotate-45 group-hover:rotate-0 transition-transform duration-300"></i>
                            </div>
                        </div>
                        <div>
                            <h3 class="text-xl font-black text-gray-800 mb-2 leading-tight group-hover:text-brand-red transition-colors">${app.name || 'Sin Título'}</h3>
                            <p class="text-xs text-gray-500 font-medium line-clamp-2 leading-relaxed">${app.description || 'Acceso directo al módulo del sistema.'}</p>
                        </div>
                    </div>
                </a>`;
            });
        }

        // --- SISTEMA DE NOTIFICACIONES ---
        let dashboardNotifPollTimer = null;
        let dashboardNotifLastKey = '';
        let dashboardNotifVisibilityBound = false;
        let dashboardNotifCache = new Map();
        let dashboardNotifActive = null;

        function getManualLink(type, originalLink) {
            const t = (type || '').toLowerCase();
            const pathPrefix = './';

            if (t.includes('calendar')) return pathPrefix + 'calendar/index.html';
            if (t.includes('ticket')) return pathPrefix + 'tickets/index.html';
            if (t.includes('orden') || t.includes('order')) return pathPrefix + 'cotizador/orders.html';
            if (t.includes('recibo') || t.includes('receipt')) return pathPrefix + 'cotizador/receipts.html';
            if (t.includes('cliente') || t.includes('document')) return originalLink || pathPrefix + 'cotizador/clientes.html';
            if (t.includes('cotiza') || t.includes('catalog')) return pathPrefix + 'cotizador/catalog.html';
            if (t.includes('fina')) return pathPrefix + 'finanzas/index.html';

            return originalLink || '#';
        }

        function normalizeDashboardNotifLink(link) {
            const value = String(link || '').trim();
            if (!value || value === '#') return '#';
            if (/^(?:https?:|mailto:|tel:)/i.test(value)) return value;
            if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('?') || value.startsWith('#')) return value;
            return './' + value;
        }

        function parseDashboardNotifMeta(value) {
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

        function escapeDashboardNotifHtml(value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatDashboardNotifDateTime(value) {
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

        function summarizeDashboardNotifDocs(metaValue) {
            const meta = parseDashboardNotifMeta(metaValue);
            const primaryDoc = meta.documento && typeof meta.documento === 'object' ? [meta.documento] : [];
            const docs = primaryDoc.length ? primaryDoc : (Array.isArray(meta.documentos) ? meta.documentos : []);
            const labels = docs.map((item) => String(item?.label || item?.documento_nombre || item?.field || '').trim()).filter(Boolean);
            if (!labels.length) return '';
            if (labels.length === 1) return labels[0];
            if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
            return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
        }

        function getDashboardNotifVisual(type) {
            const sourceType = String(type || '').toLowerCase();
            let icon = 'fa-bell text-gray-400'; let bgIcon = 'bg-gray-50';
            if (sourceType.includes('calendar')) { icon = 'fa-calendar text-blue-500'; bgIcon = 'bg-blue-50'; }
            else if (sourceType.includes('ticket')) { icon = 'fa-ticket text-orange-500'; bgIcon = 'bg-orange-50'; }
            else if (sourceType.includes('finanzas') || sourceType.includes('order') || sourceType.includes('cotizador') || sourceType.includes('quote')) { icon = 'fa-file-invoice-dollar text-brand-red'; bgIcon = 'bg-red-50'; }
            else if (sourceType.includes('client') || sourceType.includes('document')) { icon = 'fa-user-check text-brand-red'; bgIcon = 'bg-red-50'; }
            return { icon, bgIcon };
        }

        function buildDashboardNotifTargetLink(notification) {
            const record = notification && typeof notification === 'object' ? notification : {};
            const meta = parseDashboardNotifMeta(record.metadata);
            const tenant = normalizeDashboardTenant(meta.tenant || meta.tenant_slug || '');
            const quoteId = String(meta.cotizacion_id || meta.quote_id || '').trim();
            const clientId = String(meta.cliente_id || meta.client_id || '').trim();
            const explicit = normalizeDashboardNotifLink(meta.redirect_url || record.link || '');
            const tenantModule = tenant === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
            if (meta.redirect_url) return explicit;
            if (quoteId && tenant) return normalizeDashboardNotifLink(`${tenantModule}/orders.html?quote=${encodeURIComponent(quoteId)}`);
            if (clientId && tenant) return normalizeDashboardNotifLink(`${tenantModule}/clientes.html?verify=${encodeURIComponent(clientId)}`);
            return normalizeDashboardNotifLink(getManualLink(record.source_app || record.type, record.link));
        }

        function buildDashboardNotifActionLabel(notification) {
            const meta = parseDashboardNotifMeta(notification?.metadata);
            if (String(meta.cotizacion_id || meta.quote_id || '').trim()) return 'Ir a la cotizacion';
            if (String(meta.cliente_id || meta.client_id || '').trim()) return 'Ir al perfil del cliente';
            return 'Abrir modulo';
        }

        function buildDashboardNotifKicker(notification) {
            const meta = parseDashboardNotifMeta(notification?.metadata);
            const tenant = normalizeDashboardTenant(meta.tenant || meta.tenant_slug || '');
            if (String(notification?.type || '').toLowerCase().includes('rejected')) return 'Documento rechazado';
            if (String(meta.cotizacion_id || meta.quote_id || '').trim()) return tenant === 'casa_de_piedra' ? 'Cotizacion CP' : 'Cotizacion PM';
            if (String(meta.cliente_id || meta.client_id || '').trim()) return tenant === 'casa_de_piedra' ? 'Cliente CP' : 'Cliente PM';
            return 'Notificacion';
        }

        function buildDashboardNotifDetails(notification) {
            const record = notification && typeof notification === 'object' ? notification : {};
            const meta = parseDashboardNotifMeta(record.metadata);
            const rows = [{ label: 'Fecha y hora', value: formatDashboardNotifDateTime(record.created_at || record.updated_at || '') }];
            const actor = String(meta.actor_nombre || meta.actor_name || '').trim();
            const clientName = String(meta.cliente_nombre || meta.client_name || '').trim();
            const quoteFolio = String(meta.cotizacion_folio || meta.quote_folio || '').trim();
            const status = String(meta.estado_actual || meta.status || '').trim();
            const reason = String(meta.motivo || meta.reason || meta.documento?.reason || '').trim();
            const docs = summarizeDashboardNotifDocs(meta);
            const tenant = normalizeDashboardTenant(meta.tenant || meta.tenant_slug || '');

            if (tenant) rows.push({ label: 'Tenant', value: tenant === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor' });
            if (actor) rows.push({ label: 'Usuario', value: actor });
            if (clientName) rows.push({ label: 'Cliente', value: clientName });
            if (quoteFolio) rows.push({ label: 'Cotizacion', value: quoteFolio });
            if (status) rows.push({ label: 'Estado', value: status });
            if (docs) rows.push({ label: 'Documento', value: docs });
            if (reason) rows.push({ label: 'Motivo', value: reason });
            return rows;
        }

        function renderDashboardNotifDetails(rows) {
            const source = Array.isArray(rows) ? rows : [];
            return source.map((row) => `
                <div class="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                    <div class="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">${escapeDashboardNotifHtml(row.label)}</div>
                    <div class="mt-1 text-sm font-semibold text-slate-700 leading-relaxed break-words">${escapeDashboardNotifHtml(row.value)}</div>
                </div>
            `).join('');
        }

        function openDashboardNotif(notificationOrId) {
            const record = typeof notificationOrId === 'string'
                ? dashboardNotifCache.get(String(notificationOrId).trim())
                : notificationOrId;
            if (!record) return;
            const targetLink = buildDashboardNotifTargetLink(record);
            const modal = document.getElementById('dash-notif-modal');
            const cta = document.getElementById('dash-notif-modal-cta');
            if (!modal) return;
            document.getElementById('dash-notif-modal-kicker').textContent = buildDashboardNotifKicker(record);
            document.getElementById('dash-notif-modal-title').textContent = String(record.title || 'Notificacion').trim() || 'Notificacion';
            document.getElementById('dash-notif-modal-datetime').textContent = formatDashboardNotifDateTime(record.created_at || record.updated_at || '');
            document.getElementById('dash-notif-modal-message').textContent = String(record.message || 'Sin descripcion.').trim() || 'Sin descripcion.';
            document.getElementById('dash-notif-modal-meta').innerHTML = renderDashboardNotifDetails(buildDashboardNotifDetails(record));
            if (cta) {
                cta.dataset.href = targetLink;
                cta.textContent = buildDashboardNotifActionLabel(record);
                cta.classList.toggle('hidden', !targetLink || targetLink === '#');
            }
            dashboardNotifActive = { ...record, __targetLink: targetLink };
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.getElementById('dash-notif-dropdown')?.classList.add('hidden');
        }

        function closeDashboardNotifModal() {
            const modal = document.getElementById('dash-notif-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            dashboardNotifActive = null;
        }

        function openDashboardNotifLink(targetUrl) {
            const destination = normalizeDashboardNotifLink(targetUrl || dashboardNotifActive?.__targetLink || '');
            if (!destination || destination === '#') return;
            closeDashboardNotifModal();
            window.location.href = destination;
        }

        async function loadNotifications(userId) {
            if (dashboardNotifPollTimer) clearInterval(dashboardNotifPollTimer);
            hubPocketBase.channel('dash-notif-v1')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hub_notifications', filter: `user_id=eq.${userId}` },
                    () => { fetchNotifs(userId); playSound(); })
                .subscribe();

            await fetchNotifs(userId, { initial: true });
            dashboardNotifPollTimer = window.setInterval(() => {
                fetchNotifs(userId, { notifyNew: true });
            }, 15000);
            if (!dashboardNotifVisibilityBound) {
                dashboardNotifVisibilityBound = true;
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible' && currentUser?.id) fetchNotifs(currentUser.id, { notifyNew: true });
                });
                window.addEventListener('focus', () => {
                    if (currentUser?.id) fetchNotifs(currentUser.id, { notifyNew: true });
                });
            }
        }

        async function fetchNotifs(userId, options = {}) {
            const { data } = await hubPocketBase.from('hub_notifications')
                .select('*')
                .eq('user_id', userId)
                .eq('dismissed', false)
                .order('created_at', { ascending: false })
                .limit(10);
            const rows = Array.isArray(data) ? data : [];
            const latest = rows[0] || null;
            const latestKey = latest ? String(latest.id || latest.created_at || latest.created || '') : '';
            if (options.notifyNew === true && dashboardNotifLastKey && latestKey && latestKey !== dashboardNotifLastKey) playSound();
            if (latestKey) dashboardNotifLastKey = latestKey;
            renderNotifs(rows);
        }

        function renderNotifs(data) {
            const list = document.getElementById('dash-notif-list');
            const badge = document.getElementById('dash-badge');

            list.innerHTML = '';
            dashboardNotifCache = new Map();

            if (data.length > 0) {
                badge.innerText = data.length;
                badge.classList.remove('hidden');

                data.forEach(n => {
                    const sourceType = n.source_app || n.type || 'system';
                    const { icon, bgIcon } = getDashboardNotifVisual(sourceType);
                    const dateText = formatDashboardNotifDateTime(n.created_at || n.updated_at || '');
                    dashboardNotifCache.set(String(n.id || ''), n);

                    list.innerHTML += `
                    <div class="p-4 hover:bg-gray-50 transition cursor-pointer flex gap-3 items-start border-b border-gray-50 last:border-0 relative group" onclick="openDashboardNotif('${escapeDashboardNotifHtml(n.id)}')">
                        <div class="w-8 h-8 rounded-full ${bgIcon} flex items-center justify-center shrink-0 mt-0.5">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="min-w-0 flex-grow">
                            <p class="text-xs font-bold text-gray-800 mb-0.5 leading-snug break-words">${escapeDashboardNotifHtml(n.title)}</p>
                            <p class="text-[11px] text-gray-500 leading-snug break-words">${escapeDashboardNotifHtml(n.message)}</p>
                            <div class="mt-2 flex items-center justify-between gap-3">
                                <span class="text-[10px] font-semibold text-slate-400">${escapeDashboardNotifHtml(dateText)}</span>
                                <span class="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Ver detalle <i class="fa-solid fa-chevron-right text-[9px]"></i></span>
                            </div>
                        </div>
                        <button onclick="event.stopPropagation(); window.deleteNotif('${n.id}')" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition" title="Descartar notificación">
                            <i class="fa-solid fa-times"></i>
                        </button>
                    </div>`;
                });
            } else {
                badge.classList.add('hidden');
                list.innerHTML = `
                <div class="p-8 text-center flex flex-col items-center">
                    <div class="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mb-2">
                        <i class="fa-regular fa-bell-slash text-gray-300"></i>
                    </div>
                    <p class="text-xs text-gray-400 font-medium">Todo al día</p>
                </div>`;
            }
        }

        // --- FUNCIONES GLOBALES (Para onclick) ---
        function toggleDashboardNotifs() {
            const drop = document.getElementById('dash-notif-dropdown');
            drop.classList.toggle('hidden');
        }

        window.deleteNotif = async function (id) {
            if (currentUser) {
                await hubPocketBase.from('hub_notifications').update({
                    dismissed: true,
                    dismissed_at: (window.__serverDateService ? window.__serverDateService.nowISO() : new Date().toISOString())
                }).eq('id', id).eq('user_id', currentUser.id);
                if (dashboardNotifActive && String(dashboardNotifActive.id || '') === String(id || '')) closeDashboardNotifModal();
                fetchNotifs(currentUser.id);
            }
        }

        async function clearAllNotifs() {
            if (currentUser) {
                window.openConfirm('Descartar notificaciones', '¿Estás seguro de descartar todas las notificaciones?', async () => {
                    await hubPocketBase.from('hub_notifications').update({
                        dismissed: true,
                        dismissed_at: (window.__serverDateService ? window.__serverDateService.nowISO() : new Date().toISOString())
                    }).eq('user_id', currentUser.id).eq('dismissed', false);
                    closeDashboardNotifModal();
                    fetchNotifs(currentUser.id);
                });
            }
        }

        async function dashboardLogout() {
            localStorage.removeItem('hub_user_cache_name');
            localStorage.removeItem('hub_user_cache_email');
            localStorage.removeItem('hub_user_cache_role');
            if (useNativeAuth && hubAuthNative) await hubAuthNative.logout();
            else if (hubPocketBase && hubPocketBase.auth) await hubPocketBase.auth.signOut();
            window.location.reload();
        }

        function playSound() {
            const audio = new Audio('./public/assets/sfx/notify.wav');
            audio.volume = 0.2;
            audio.play().catch(() => { });
        }
