/**
 * DOC: client\js\hub-config.js
 * Proposito: Configuracion global de entorno, tenant, branding y endpoints.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

const __hubPath = String(window.location.pathname || '').toLowerCase();
const __hubNested = /\/(cotizador|cotizadorcp|public|system)\//.test(__hubPath);
const __hubAssetsBase = __hubNested ? '../public/assets' : './public/assets';
const __hubPublicBase = __hubNested ? '../public' : './public';
const __hubConfigBase = __hubNested ? '../config' : './config';
const __HUB_RUNTIME_CONFIG_CACHE_KEY = 'hub_runtime_config_cache_v2';

function __hubNormalizeBackendUrl(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  if (/^(\/|\.\/|\.\.\/)/.test(text)) {
    try {
      const base = text.startsWith('/') ? window.location.origin : window.location.href;
      return new URL(text, base).toString().replace(/\/+$/, '');
    } catch (_) {
      return text === '/' ? '' : text.replace(/\/+$/, '');
    }
  }
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

function __hubInstallConsoleShield() {
  if (window.__HUB_VERBOSE_CONSOLE === true || __hubIsLocalHostname(window.location.hostname) || !window.console || window.__HUB_CONSOLE_SHIELDED === true) {
    return;
  }
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

__hubInstallConsoleShield();

function __hubResolveBackendForClient(raw) {
  const normalized = __hubNormalizeBackendUrl(raw);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    const backendHost = String(parsed.hostname || '').trim();
    const clientHost = String(window.location.hostname || '').trim();
    if (!clientHost || __hubIsLocalHostname(clientHost)) return normalized;
    if (!__hubIsLocalHostname(backendHost)) return normalized;
    parsed.hostname = clientHost;
    if (!parsed.port) parsed.port = '8090';
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return normalized;
  }
}

function __hubGuessBackendUrl() {
  const protocol = /^https?:$/.test(window.location.protocol) ? window.location.protocol : 'http:';
  const host = String(window.location.host || '').trim();
  const hostname = String(window.location.hostname || '').trim();
  if (!host || __hubIsLocalHostname(hostname)) return 'http://127.0.0.1:8090';
  return `${protocol}//${host}`;
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

function __hubReadCachedRuntimeConfig() {
  try {
    const raw = localStorage.getItem(__HUB_RUNTIME_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function __hubWriteCachedRuntimeConfig(config) {
  try {
    if (!config || typeof config !== 'object' || !Object.keys(config).length) return;
    localStorage.setItem(__HUB_RUNTIME_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch (_) {}
}

function __hubLoadRuntimeConfig() {
  try {
    if (window.__HUB_RUNTIME_CONFIG && typeof window.__HUB_RUNTIME_CONFIG === 'object') {
      return window.__HUB_RUNTIME_CONFIG;
    }
  } catch (_) {}
  const cached = __hubReadCachedRuntimeConfig();
  if (cached) {
    window.__HUB_RUNTIME_CONFIG = cached;
    return cached;
  }
  return {};
}

async function __hubFetchRuntimeConfig() {
  const candidates = __hubRuntimeConfigCandidates();
  for (let i = 0; i < candidates.length; i += 1) {
    const path = candidates[i];
    try {
      const response = await fetch(path, {
        method: 'GET',
        cache: 'no-cache',
        credentials: 'same-origin'
      });
      if (!response.ok) continue;
      const parsed = await response.json();
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }
  return null;
}

const __hubRuntimeConfig = __hubLoadRuntimeConfig();
const __hubBackendFromRuntime = String(__hubRuntimeConfig.POCKETBASE_URL || __hubRuntimeConfig.BACKEND_URL || '').trim();
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
const __hubBackendFromQuery = '';
// Simplificado: el backend activo sale del archivo runtime y/o variables preinyectadas.

let __hubBackendBase = __hubResolveBackendForClient(
  __hubBackendFromQuery || __hubBackendFromGlobal || __hubBackendFromRuntime || __hubBackendFromEnv || __hubDefaultBackendUrl
) || __hubDefaultBackendUrl;

function __hubApplyResolvedConfig(runtimeConfig = {}) {
  const runtime = runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {};
  window.__HUB_RUNTIME_CONFIG = runtime;
  __hubWriteCachedRuntimeConfig(runtime);

  const runtimeBackend = String(runtime.POCKETBASE_URL || runtime.BACKEND_URL || '').trim();
  const runtimeAnonKey = String(runtime.POCKETBASE_ANON_KEY || runtime.POCKETBASE_PUBLIC_KEY || '').trim();
  const runtimeFinanzasSchema = String(runtime.FINANZAS_SCHEMA || runtime.SCHEMA_PLAZA_MAYOR || '').trim();
  const runtimeLocalMode = __hubToBoolean(runtime.LOCAL_MODE, null);
  const runtimeCompanyLogo = String(runtime.COMPANY_LOGO_URL || '').trim();
  const runtimeCompanyLogoCp = String(runtime.COMPANY_LOGO_URL_CP || runtime.CP_LOGO_URL || '').trim();
  const runtimePmLetterhead = String(runtime.PM_PDF_LETTERHEAD_URL || runtime.PDF_LETTERHEAD_PM_URL || '').trim();
  const runtimeCpLetterhead = String(runtime.CP_PDF_LETTERHEAD_URL || runtime.PDF_LETTERHEAD_CP_URL || '').trim();

  __hubBackendBase = __hubResolveBackendForClient(
    __hubBackendFromQuery || __hubBackendFromGlobal || runtimeBackend || __hubBackendFromEnv || __hubDefaultBackendUrl
  ) || __hubDefaultBackendUrl;

  const target = (window.HUB_CONFIG && typeof window.HUB_CONFIG === 'object') ? window.HUB_CONFIG : {};
  target.pocketbaseUrl = __hubBackendBase;
  target.pocketbaseAnonKey = runtimeAnonKey || __hubAnonKeyFromEnv || '';
  target.finanzasSchema = String(runtimeFinanzasSchema || __hubFinanzasSchemaFromEnv || 'finanzas');
  target.localMode = (runtimeLocalMode !== null ? runtimeLocalMode : (__hubLocalModeFromEnv !== null ? __hubLocalModeFromEnv : true));
  target.companyLogoUrl = String(runtimeCompanyLogo || __hubCompanyLogoFromEnv || `${__hubAssetsBase}/logo.png`);
  target.companyLogoUrlCP = String(runtimeCompanyLogoCp || __hubCompanyLogoCpFromEnv || `${__hubAssetsBase}/logocp.png`);
  target.pmPdfLetterheadUrl = String(runtimePmLetterhead || __hubPmPdfLetterheadFromEnv || `${__hubPublicBase}/assets/img/pm-letterhead-default.png`);
  target.cpPdfLetterheadUrl = String(runtimeCpLetterhead || __hubCpPdfLetterheadFromEnv || `${__hubPublicBase}/assets/img/cp-letterhead-default.png`);
  window.HUB_CONFIG = target;
  return target;
}

window.HUB_CONFIG = {
  // Backend API (usa query/global/runtime/env y fallback automatico)
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

  // Módulos visibles en el menú (index.html) cuando localMode=true
    localModules: [
    { name: 'Cotizador - Plaza Mayor',    description: 'Acceso al cotizador de Plaza Mayor.',    icon: 'fa-store', url_path: 'cotizador/catalog.html',   color: 'red',  tenant: 'plaza_mayor' },
    { name: 'Cotizador - Casa de Piedra', description: 'Acceso al cotizador de Casa de Piedra.', icon: 'fa-gem',   url_path: 'cotizadorcp/catalog.html', color: 'cp', tenant: 'casa_de_piedra' }
  ]
};

__hubApplyResolvedConfig(__hubRuntimeConfig);

window.HUB_CONFIG_READY = __hubFetchRuntimeConfig()
  .then((runtimeConfig) => {
    if (!runtimeConfig) return window.HUB_CONFIG;
    return __hubApplyResolvedConfig(runtimeConfig);
  })
  .catch(() => window.HUB_CONFIG)
  .then((config) => {
    try {
      window.dispatchEvent(new CustomEvent('hub:config-ready', { detail: config }));
    } catch (_) {}
    return config;
  });

window.getHubConfigReady = function () {
  return window.HUB_CONFIG_READY || Promise.resolve(window.HUB_CONFIG);
};


