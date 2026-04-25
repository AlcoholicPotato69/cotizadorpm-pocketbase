// Este archivo actÃºa como tus variables de entorno globales
window.ENV = {
    POCKETBASE_URL: 'http://127.0.0.1:8090',
    BACKEND_URL: 'http://127.0.0.1:8090',
    POCKETBASE_ANON_KEY: '',
    SCHEMA_PLAZA_MAYOR: 'finanzas',
    SCHEMA_CASA_PIEDRA: 'finanzas_casadepiedra',
    LOCAL_MODE: false
};

(function () {
    const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(String(window.location.hostname || '').trim());
    if (!isLocalHost && window.__HUB_VERBOSE_CONSOLE !== true && window.console && window.__HUB_CONSOLE_SHIELDED !== true) {
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

    const KEY_PREFIX = 'hub_public_scroll_v1:';
    const key = KEY_PREFIX + String(window.location.pathname || '').toLowerCase() + String(window.location.search || '');
    const navEntry = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
        ? performance.getEntriesByType('navigation')[0]
        : null;
    const navType = String(navEntry && navEntry.type || '');
    const canRestore = navType === 'reload' || navType === 'back_forward';

    function saveScroll() {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                y: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
                ts: Date.now()
            }));
        } catch (_) {}
    }

    if (canRestore) {
        try {
            const raw = sessionStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            const targetY = Math.max(0, Math.round(Number(parsed && parsed.y || 0) || 0));
            if (targetY > 0) {
                [0, 120, 320, 700].forEach((delay) => {
                    window.setTimeout(() => window.scrollTo(0, targetY), delay);
                });
            }
        } catch (_) {}
    }

    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', saveScroll);
    window.addEventListener('beforeunload', saveScroll);
})();












































