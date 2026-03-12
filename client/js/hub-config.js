/**
 * DOC: client\js\hub-config.js
 * Proposito: Configuracion global de entorno, tenant, branding y endpoints.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

const __hubPath = String(window.location.pathname || '').toLowerCase();
const __hubNested = /\/(cotizador|cotizadorcp|public|system)\//.test(__hubPath);
const __hubAssetsBase = __hubNested ? '../../assets' : '../assets';
const __hubPublicBase = __hubNested ? '../public' : './public';
const __hubConfigBase = __hubNested ? '../config' : './config';

function __hubNormalizeBackendUrl(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(text)) text = `http://${text}`;
  return text.replace(/\/+$/, '');
}

function __hubIsLocalHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function __hubGuessBackendUrl() {
  const protocol = /^https?:$/.test(window.location.protocol) ? window.location.protocol : 'http:';
  const host = String(window.location.host || '').trim();
  const hostname = String(window.location.hostname || '').trim();
  if (!host || __hubIsLocalHostname(hostname)) return 'http://127.0.0.1:8090';
  return `${protocol}//${host}`;
}

function __hubResolveIcsUrl(raw, backendBase) {
  const input = String(raw || '').trim();
  if (!input) return '';
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(input)) return input;
  if (input.startsWith('/')) return `${backendBase}${input}`;
  return __hubNormalizeBackendUrl(input);
}

function __hubAppendToken(url, token) {
  const t = String(token || '').trim();
  if (!url || !t) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (!parsed.searchParams.get('token')) parsed.searchParams.set('token', t);
    return parsed.toString();
  } catch (_) {
    if (/[?&]token=/.test(url)) return url;
    return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
  }
}

function __hubPersistStorageValue(key, value) {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch (_) {}
}

function __hubToBoolean(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  if (text === '1' || text === 'true' || text === 'yes' || text === 'si' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return fallback;
}

function __hubRuntimeConfigCandidates() {
  const raw = [
    `${__hubConfigBase}/hub-runtime.json`,
    '/config/hub-runtime.json'
  ];
  const seen = {};
  return raw.filter((path) => {
    const key = String(path || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function __hubLoadRuntimeConfig() {
  try {
    if (window.__HUB_RUNTIME_CONFIG && typeof window.__HUB_RUNTIME_CONFIG === 'object') {
      return window.__HUB_RUNTIME_CONFIG;
    }
  } catch (_) {}

  const candidates = __hubRuntimeConfigCandidates();
  for (let i = 0; i < candidates.length; i += 1) {
    const path = candidates[i];
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_) {}
  }
  return {};
}

const __hubRuntimeConfig = __hubLoadRuntimeConfig();
const __hubBackendFromRuntime = String(__hubRuntimeConfig.POCKETBASE_URL || __hubRuntimeConfig.BACKEND_URL || '').trim();
const __hubIcsUrlFromRuntime = String(__hubRuntimeConfig.CP_CALENDAR_ICS_URL || '').trim();
const __hubIcsTokenFromRuntime = String(__hubRuntimeConfig.CP_CALENDAR_ICS_TOKEN || '').trim();
const __hubAnonKeyFromRuntime = String(__hubRuntimeConfig.POCKETBASE_ANON_KEY || __hubRuntimeConfig.POCKETBASE_PUBLIC_KEY || '').trim();
const __hubFinanzasSchemaFromRuntime = String(__hubRuntimeConfig.FINANZAS_SCHEMA || __hubRuntimeConfig.SCHEMA_PLAZA_MAYOR || '').trim();
const __hubLocalModeFromRuntime = __hubToBoolean(__hubRuntimeConfig.LOCAL_MODE, null);
const __hubCompanyLogoFromRuntime = String(__hubRuntimeConfig.COMPANY_LOGO_URL || '').trim();
const __hubCompanyLogoCpFromRuntime = String(__hubRuntimeConfig.COMPANY_LOGO_URL_CP || __hubRuntimeConfig.CP_LOGO_URL || '').trim();
const __hubPmPdfLetterheadFromRuntime = String(__hubRuntimeConfig.PM_PDF_LETTERHEAD_URL || __hubRuntimeConfig.PDF_LETTERHEAD_PM_URL || '').trim();
const __hubCpPdfLetterheadFromRuntime = String(__hubRuntimeConfig.CP_PDF_LETTERHEAD_URL || __hubRuntimeConfig.PDF_LETTERHEAD_CP_URL || '').trim();

const __hubDefaultBackendUrl = __hubNormalizeBackendUrl(window.__HUB_DEFAULT_BACKEND_URL || __hubGuessBackendUrl()) || 'http://127.0.0.1:8090';
const __hubBackendFromGlobal = window.__HUB_BACKEND_URL || window.__BACKEND_URL || '';
const __hubBackendFromEnv = (window.ENV && (window.ENV.POCKETBASE_URL || window.ENV.BACKEND_URL)) || '';
const __hubAnonKeyFromEnv = (window.ENV && (window.ENV.POCKETBASE_ANON_KEY || window.ENV.POCKETBASE_PUBLIC_KEY)) || '';
const __hubFinanzasSchemaFromEnv = (window.ENV && (window.ENV.SCHEMA_PLAZA_MAYOR || window.ENV.FINANZAS_SCHEMA)) || '';
const __hubLocalModeFromEnv = __hubToBoolean(window.ENV && window.ENV.LOCAL_MODE, null);
const __hubCompanyLogoFromEnv = (window.ENV && window.ENV.COMPANY_LOGO_URL) || '';
const __hubCompanyLogoCpFromEnv = (window.ENV && (window.ENV.COMPANY_LOGO_URL_CP || window.ENV.CP_LOGO_URL)) || '';
const __hubPmPdfLetterheadFromEnv = (window.ENV && (window.ENV.PM_PDF_LETTERHEAD_URL || window.ENV.PDF_LETTERHEAD_PM_URL)) || '';
const __hubCpPdfLetterheadFromEnv = (window.ENV && (window.ENV.CP_PDF_LETTERHEAD_URL || window.ENV.PDF_LETTERHEAD_CP_URL)) || '';
let __hubBackendFromStorage = '';
let __hubBackendFromQuery = '';
let __hubIcsUrlFromStorage = '';
let __hubIcsUrlFromQuery = '';
let __hubIcsTokenFromStorage = '';
let __hubIcsTokenFromQuery = '';
try {
  __hubBackendFromStorage = localStorage.getItem('HUB_BACKEND_URL') || '';
  __hubIcsUrlFromStorage = localStorage.getItem('HUB_CP_CALENDAR_ICS_URL') || '';
  __hubIcsTokenFromStorage = localStorage.getItem('HUB_CP_CALENDAR_ICS_TOKEN') || '';
} catch (_) {}
try {
  const params = new URLSearchParams(window.location.search || '');
  __hubBackendFromQuery = params.get('backend') || params.get('api') || '';
  __hubIcsUrlFromQuery = params.get('ics') || params.get('icsUrl') || params.get('cpIcs') || '';
  __hubIcsTokenFromQuery = params.get('icsToken') || params.get('cpIcsToken') || '';
} catch (_) {}

let __hubBackendBase = __hubNormalizeBackendUrl(
  __hubBackendFromQuery || __hubBackendFromStorage || __hubBackendFromGlobal || __hubBackendFromRuntime || __hubBackendFromEnv || __hubDefaultBackendUrl
) || __hubDefaultBackendUrl;

// Helpers de despliegue:
// - window.setHubBackendUrl('http://IP_O_DOMINIO:8090')
// - window.clearHubBackendUrl()
window.getHubBackendUrl = function () { return __hubBackendBase; };
window.setHubBackendUrl = function (nextUrl, options = {}) {
  const finalUrl = __hubNormalizeBackendUrl(nextUrl);
  if (!finalUrl) throw new Error('URL de backend invalida.');
  const persist = options.persist !== false;
  const reload = options.reload !== false;
  __hubBackendBase = finalUrl;
  if (persist) __hubPersistStorageValue('HUB_BACKEND_URL', finalUrl);
  if (window.HUB_CONFIG) {
    window.HUB_CONFIG.pocketbaseUrl = finalUrl;
    window.HUB_CONFIG.cpCalendarIcsUrl = window.getCpCalendarIcsUrl();
  }
  if (reload) window.location.reload();
  return finalUrl;
};
window.clearHubBackendUrl = function (options = {}) {
  const reload = options.reload !== false;
  __hubBackendBase = __hubDefaultBackendUrl;
  __hubPersistStorageValue('HUB_BACKEND_URL', '');
  if (window.HUB_CONFIG) {
    window.HUB_CONFIG.pocketbaseUrl = __hubBackendBase;
    window.HUB_CONFIG.cpCalendarIcsUrl = window.getCpCalendarIcsUrl();
  }
  if (reload) window.location.reload();
};

const __hubIcsUrlFromGlobal = window.__CP_CALENDAR_ICS_URL || '';
const __hubIcsUrlFromEnv = (window.ENV && window.ENV.CP_CALENDAR_ICS_URL) || '';
const __hubIcsTokenFromGlobal = window.__CP_CALENDAR_ICS_TOKEN || '';
const __hubIcsTokenFromEnv = (window.ENV && window.ENV.CP_CALENDAR_ICS_TOKEN) || '';
let __hubCpCalendarIcsUrlRaw = String(__hubIcsUrlFromQuery || __hubIcsUrlFromStorage || __hubIcsUrlFromGlobal || __hubIcsUrlFromRuntime || __hubIcsUrlFromEnv || '').trim();
let __hubCpCalendarIcsToken = String(__hubIcsTokenFromQuery || __hubIcsTokenFromStorage || __hubIcsTokenFromGlobal || __hubIcsTokenFromRuntime || __hubIcsTokenFromEnv || 'b1a38ff792a127d89980285a05cc8525bdcc2195227ca8a4b7b51a56ae312aa5').trim();

window.getCpCalendarIcsUrl = function (options = {}) {
  const backendBase = __hubNormalizeBackendUrl(options.backendUrl || __hubBackendBase) || __hubBackendBase;
  const directRaw = options.directUrl !== undefined ? options.directUrl : __hubCpCalendarIcsUrlRaw;
  const token = options.token !== undefined ? options.token : __hubCpCalendarIcsToken;
  const resolved = __hubResolveIcsUrl(directRaw, backendBase) || `${backendBase}/api/cotizador/cp-calendar-ics`;
  return __hubAppendToken(resolved, token);
};

window.setCpCalendarIcsConfig = function (nextConfig = {}, options = {}) {
  const persist = options.persist !== false;
  const reload = options.reload !== false;
  const hasUrl = Object.prototype.hasOwnProperty.call(nextConfig, 'url');
  const hasToken = Object.prototype.hasOwnProperty.call(nextConfig, 'token');
  const direct = hasUrl ? String(nextConfig.url || '').trim() : __hubCpCalendarIcsUrlRaw;
  const token = hasToken ? String(nextConfig.token || '').trim() : __hubCpCalendarIcsToken;
  __hubCpCalendarIcsUrlRaw = direct;
  __hubCpCalendarIcsToken = token;
  if (persist) {
    __hubPersistStorageValue('HUB_CP_CALENDAR_ICS_URL', direct);
    __hubPersistStorageValue('HUB_CP_CALENDAR_ICS_TOKEN', token);
  }
  const finalIcsUrl = window.getCpCalendarIcsUrl();
  if (window.HUB_CONFIG) {
    window.HUB_CONFIG.cpCalendarIcsUrl = finalIcsUrl;
    window.HUB_CONFIG.cpCalendarIcsToken = token;
  }
  if (reload) window.location.reload();
  return finalIcsUrl;
};

window.clearCpCalendarIcsConfig = function (options = {}) {
  const reload = options.reload !== false;
  __hubCpCalendarIcsUrlRaw = '';
  __hubCpCalendarIcsToken = '';
  __hubPersistStorageValue('HUB_CP_CALENDAR_ICS_URL', '');
  __hubPersistStorageValue('HUB_CP_CALENDAR_ICS_TOKEN', '');
  if (window.HUB_CONFIG) {
    window.HUB_CONFIG.cpCalendarIcsToken = '';
    window.HUB_CONFIG.cpCalendarIcsUrl = window.getCpCalendarIcsUrl();
  }
  if (reload) window.location.reload();
};

window.HUB_CONFIG = {
  // Backend API (usa override por query/localStorage/global/runtime/env y fallback automatico)
  pocketbaseUrl: __hubBackendBase,
  pocketbaseAnonKey: __hubAnonKeyFromRuntime || __hubAnonKeyFromEnv || '',

  // Esquema SQL del cotizador
  finanzasSchema: String(__hubFinanzasSchemaFromRuntime || __hubFinanzasSchemaFromEnv || 'finanzas'),

  // Modo local (sin roles, sin notificaciones, sin cotizador externo)
  localMode: (__hubLocalModeFromRuntime !== null ? __hubLocalModeFromRuntime : (__hubLocalModeFromEnv !== null ? __hubLocalModeFromEnv : true)),

  // Logo del sistema (opcional). Si usas Storage local, sube el archivo a:
  // Bucket: espacios  |  Ruta: logo.png  |  Público: true
  // Si prefieres un archivo local, pon una ruta relativa (ej: './assets/logo.png').
  companyLogoUrl: String(__hubCompanyLogoFromRuntime || __hubCompanyLogoFromEnv || `${__hubAssetsBase}/logo.png`),

  // Logo Casa de Piedra (Storage local)
  companyLogoUrlCP: String(__hubCompanyLogoCpFromRuntime || __hubCompanyLogoCpFromEnv || `${__hubAssetsBase}/logocp.png`),

  // Membretes PDF por tenant (carta)
  pmPdfLetterheadUrl: String(__hubPmPdfLetterheadFromRuntime || __hubPmPdfLetterheadFromEnv || `${__hubPublicBase}/assets/img/pm-letterhead-default.png`),
  cpPdfLetterheadUrl: String(__hubCpPdfLetterheadFromRuntime || __hubCpPdfLetterheadFromEnv || `${__hubPublicBase}/assets/img/cp-letterhead-default.png`),

  // Feed ICS del calendario unificado de Casa de Piedra.
  // Prioridad:
  // 1) Query params: ?ics=...&icsToken=...
  // 2) localStorage: HUB_CP_CALENDAR_ICS_URL / HUB_CP_CALENDAR_ICS_TOKEN
  // 3) Globals: window.__CP_CALENDAR_ICS_URL / window.__CP_CALENDAR_ICS_TOKEN
  // 4) Runtime file: client/config/hub-runtime.json
  // 5) window.ENV.CP_CALENDAR_ICS_URL / window.ENV.CP_CALENDAR_ICS_TOKEN
  // 6) Fallback automatico: {backend}/api/cotizador/cp-calendar-ics
  // Helpers:
  // - window.getCpCalendarIcsUrl()
  // - window.setCpCalendarIcsConfig({ url: 'https://dominio/api/cotizador/cp-calendar-ics', token: 'TOKEN' })
  // - window.clearCpCalendarIcsConfig()
  cpCalendarIcsUrl: window.getCpCalendarIcsUrl(),
  cpCalendarIcsToken: __hubCpCalendarIcsToken,

  // Módulos visibles en el menú (index.html) cuando localMode=true
    localModules: [
    { name: 'Cotizador - Plaza Mayor',    description: 'Acceso al cotizador de Plaza Mayor.',    icon: 'fa-store', url_path: 'cotizador/catalog.html',   color: 'red',  tenant: 'plaza_mayor' },
    { name: 'Cotizador - Casa de Piedra', description: 'Acceso al cotizador de Casa de Piedra.', icon: 'fa-gem',   url_path: 'cotizadorcp/catalog.html', color: 'cp', tenant: 'casa_de_piedra' }
  ]
};

