/**
 * DOC: client\cotizadorcp\clientes.js
 * Proposito: Gestion de clientes y relacion con cotizaciones.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE CLIENTES (PERFILES REUTILIZABLES)
// =========================================================================

/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';

// (Opcional) Esquema finanzas configurable
const __p = window.location.pathname || '';
const __isCP = /\/cotizadorcp(\/|$)/.test(__p) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __isCP ? 'finanzas_casadepiedra' : ((window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas');

let allClients = [];
let canManage = false;
let canCreate = false;
let canVerify = false;
let canSeeAllDocuments = false;
let currentClientRole = '';
let adminVerifierMode = false;
let pendingVerificationClientId = '';
let clientHistoryRows = [];
let activeHistoryClient = null;
let cpClientsRestoringViewState = false;
const CP_CLIENTS_VIEW_STATE_SCOPE = 'cp_clients';
const CLIENT_TENANT_SLUG = 'casa_de_piedra';
const ADMIN_VERIFIER_MODE_STORAGE_KEY = `hub_admin_verifier_mode_${CLIENT_TENANT_SLUG}`;
const CLIENT_MISSING_FIELD_LABELS = {
  nombre_completo: 'Nombre',
  correo: 'Correo',
  rfc: 'RFC',
  telefono: 'Teléfono',
  constancia_fiscal_emitida_el: 'Fecha de constancia fiscal',
  comprobante_domicilio_emitido_el: 'Fecha de comprobante de domicilio',
  dictamen_aprobado: 'Dictamen aprobado/guardado'
};

function cpClientsViewStateApi() {
  return window.__HUB_VIEW_STATE || null;
}

function cpClientsReadViewState() {
  const api = cpClientsViewStateApi();
  return api?.read ? (api.read(CP_CLIENTS_VIEW_STATE_SCOPE, { maxAgeMs: 30 * 60 * 1000 }) || null) : null;
}

function cpClientsApplyViewStateControls(state = cpClientsReadViewState()) {
  if (!state || typeof state !== 'object') return;
  const searchEl = document.getElementById('clients-search');
  if (searchEl && typeof state.search === 'string') searchEl.value = state.search;
}

function cpClientsSaveViewState(extra = {}) {
  const api = cpClientsViewStateApi();
  if (!api?.write) return null;
  const selectedClientId = String(extra.selectedClientId || document.getElementById('client-id')?.value || '').trim();
  return api.write(CP_CLIENTS_VIEW_STATE_SCOPE, {
    search: document.getElementById('clients-search')?.value || '',
    selectedClientId,
    windowScrollY: api.getWindowScrollY ? api.getWindowScrollY() : (window.scrollY || 0),
    ...(extra && typeof extra === 'object' ? extra : {})
  });
}

function cpClientsRestoreViewStateAfterRender(state = cpClientsReadViewState()) {
  if (!state || typeof state !== 'object') return;
  const api = cpClientsViewStateApi();
  if (api?.restoreScrollState) api.restoreScrollState(state);
  const selectedClientId = String(state.selectedClientId || '').trim();
  if (!selectedClientId) return;
  window.setTimeout(() => {
    const target = document.querySelector(`[data-client-id="${selectedClientId}"]`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }, 90);
}

function normalizeRoleName(value='') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'administrador' || raw === 'superadmin' || raw === 'super_admin') return 'admin';
  return raw;
}

function deriveClientAccessFromLayout() {
  const authCtx = window.__HUB_AUTH_CONTEXT || null;
  if (!authCtx?.session?.user) return null;
  const rbac = window.HUB_RBAC || null;
  const perms = (authCtx.permissions && typeof authCtx.permissions === 'object')
    ? authCtx.permissions
    : ((authCtx.profile?.effective_permissions && typeof authCtx.profile.effective_permissions === 'object')
      ? authCtx.profile.effective_permissions
      : {});
  const role = normalizeRoleName(authCtx.role || authCtx.profile?.role || '');
  const verifyEnabled = rbac?.can ? rbac.can('clients_verify') : (authCtx.isAdmin === true || perms.clients_verify === true);
  const canManage = rbac?.can ? rbac.can('clients_manage') : (authCtx.isAdmin === true || perms.clients_manage === true);
  const canCreate = rbac?.canAny
    ? rbac.canAny(['clients_create', 'clients_manage'])
    : (authCtx.isAdmin === true || perms.clients_create === true || perms.clients_manage === true);
  const canView = rbac?.canAny
    ? rbac.canAny(['clients_view', 'clients_manage', 'clients_verify', 'clients_create'])
    : (authCtx.isAdmin === true || verifyEnabled || perms.clients_view === true || perms.clients_manage === true || perms.clients_create === true);
  return {
    role,
    perms,
    canView,
    canManage,
    canCreate,
    canVerify: verifyEnabled,
    canSeeAllDocuments: rbac?.canAny ? rbac.canAny(['clients_all_docs', 'clients_verify']) : (verifyEnabled || perms.clients_all_docs === true)
  };
}

async function fetchClientAccessContext(sessionUser) {
  const fromLayout = deriveClientAccessFromLayout();
  if (fromLayout) return fromLayout;

  const lookupOne = async (table, field, value) => {
    if (!value || !window.globalPocketBase) return null;
    try {
      const { data, error } = await window.globalPocketBase.from(table).select('*').eq(field, value).maybeSingle();
      if (!error && data) return data;
    } catch (_) {}
    return null;
  };

  const userId = String(sessionUser?.id || '').trim();
  const userEmail = String(sessionUser?.email || '').trim().toLowerCase();
  let appUser = await lookupOne('app_users', 'id', userId);
  if (!appUser) appUser = await lookupOne('app_users', 'email', userEmail);

  const role = normalizeRoleName(
    appUser?.role
    || sessionUser?.role
    || sessionUser?.rol
    || ''
  );
  const perms = (appUser?.effective_permissions && typeof appUser.effective_permissions === 'object')
    ? appUser.effective_permissions
    : {};
  const rbac = window.HUB_RBAC || null;
  const isAdminByContext = rbac?.isAdmin ? rbac.isAdmin() : (window.__HUB_AUTH_CONTEXT?.isAdmin === true);
  const canVerifyResolved = rbac?.can ? rbac.can('clients_verify') : (isAdminByContext || perms.clients_verify === true);
  const canView = rbac?.canAny
    ? rbac.canAny(['clients_view', 'clients_manage', 'clients_verify', 'clients_create'])
    : (isAdminByContext || perms.clients_view === true || perms.clients_manage === true || perms.clients_verify === true || perms.clients_create === true);
  const canManageResolved = rbac?.can ? rbac.can('clients_manage') : (isAdminByContext || perms.clients_manage === true);
  const canCreateResolved = rbac?.canAny
    ? rbac.canAny(['clients_create', 'clients_manage'])
    : (isAdminByContext || perms.clients_create === true || perms.clients_manage === true);
  return {
    role,
    perms,
    canView,
    canManage: canManageResolved,
    canCreate: canCreateResolved,
    canVerify: canVerifyResolved,
    canSeeAllDocuments: rbac?.canAny ? rbac.canAny(['clients_all_docs', 'clients_verify']) : (canVerifyResolved || perms.clients_all_docs === true)
  };
}

function currentClientPageFile() {
  return String(window.location.pathname.split('/').pop() || 'clientes.html').trim().toLowerCase();
}

function buildClientTenantPageHref(tenantSlug, fileName = currentClientPageFile()) {
  const directory = tenantSlug === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
  return new URL(`../${directory}/${fileName}`, window.location.href).toString();
}

function getVerifierAllowedTenants() {
  const authCtx = window.__HUB_AUTH_CONTEXT || {};
  const allowed = Array.isArray(authCtx.allowedTenants) && authCtx.allowedTenants.length
    ? authCtx.allowedTenants
    : [];
  return allowed.filter((slug) => slug === 'plaza_mayor' || slug === 'casa_de_piedra');
}

function installVerifierTenantNavigation() {
  const authCtx = window.__HUB_AUTH_CONTEXT || {};
  const perms = (authCtx.permissions && typeof authCtx.permissions === 'object') ? authCtx.permissions : {};
  const canVerifyByPermission = window.HUB_RBAC?.can ? window.HUB_RBAC.can('clients_verify') : (authCtx.isAdmin === true || perms.clients_verify === true);
  if (!canVerifyByPermission) return;
  const navContainer = document.querySelector('nav .container');
  if (!navContainer) return;
  navContainer.dataset.verifierTenantNav = 'true';

  const currentFile = currentClientPageFile();
  const currentTenant = CLIENT_TENANT_SLUG;
  const allowedTenants = getVerifierAllowedTenants();
  const navLinks = [
    { file: 'catalog.html', label: 'Precios', icon: 'fa-tags' },
    { file: 'clientes.html', label: 'Clientes', icon: 'fa-users' },
    { file: 'control.html', label: 'Control', icon: 'fa-clipboard-check' }
  ];

  const linksHtml = navLinks.map((item) => {
    const isActive = item.file === currentFile;
    const baseClass = isActive
      ? 'bg-white/20 shadow-inner'
      : 'hover:bg-white/20 transition';
    return `<a href="${buildClientTenantPageHref(currentTenant, item.file)}" class="${baseClass} px-4 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap flex items-center gap-2"><i class="fa-solid ${item.icon}"></i>${item.label}</a>`;
  }).join('');

  const switchHtml = allowedTenants.length > 1
    ? `<div class="ml-auto flex items-center gap-1 rounded-full bg-white/10 p-1 shadow-inner backdrop-blur">
        ${allowedTenants.map((tenantSlug) => {
          const isActive = tenantSlug === currentTenant;
          const label = tenantSlug === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor';
          const shortLabel = tenantSlug === 'casa_de_piedra' ? 'CP' : 'PM';
          const classes = isActive
            ? 'bg-white text-brand-red shadow-md'
            : 'text-white/85 hover:bg-white/15';
          const badgeClass = isActive
            ? 'bg-brand-red text-white'
            : 'bg-white/15 text-white';
          return `<a href="${buildClientTenantPageHref(tenantSlug, currentFile)}" class="${classes} rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2"><span class="${badgeClass} inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]">${shortLabel}</span><span>${label}</span></a>`;
        }).join('')}
      </div>`
    : '<div class="flex-grow"></div>';

  navContainer.innerHTML = `
    ${linksHtml}
    ${switchHtml}
  `;
}

function isAdminClientRoleActive() {
  return window.HUB_RBAC?.isAdmin ? window.HUB_RBAC.isAdmin() : (window.__HUB_AUTH_CONTEXT?.isAdmin === true);
}

function readAdminVerifierMode() {
  return false;
}

function setAdminVerifierMode(enabled) {
  adminVerifierMode = false;
  try {
    localStorage.removeItem(ADMIN_VERIFIER_MODE_STORAGE_KEY);
  } catch (_) {}
}

function isAdminVerifierModeActive() {
  return false;
}

function renderAdminVerifierModeBox() {
  const main = document.querySelector('main');
  if (!main) return;
  let box = document.getElementById('admin-verifier-mode-box');
  if (box) box.remove();
}

function escapeHTML(str='') {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(str='') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

function normalize(str='') { return String(str).toLowerCase().trim(); }
function formatMoney(v){ return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(v || 0) || 0); }
function safeArray(v){
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch(e){ return []; }
  }
  return [];
}
function safeObject(v){
  if (!v) return {};
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch(e){ return {}; }
  }
  return {};
}
function safeDate(v){
  const s = normalizeStoredDate(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '--';
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function normalizeStoredDate(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(s)) return s.slice(0, 10);
  return '';
}

function getClientValidationDate(client, field) {
  const raw = normalizeStoredDate(client?.[field]);
  if (raw) return raw;
  const validation = safeObject(client?.expediente_validacion);
  if (field === 'constancia_fiscal_emitida_el') {
    return normalizeStoredDate(validation.constanciaFiscalEmitidaEl || validation.constancia_fiscal_emitida_el);
  }
  if (field === 'comprobante_domicilio_emitido_el') {
    return normalizeStoredDate(validation.comprobanteDomicilioEmitidoEl || validation.comprobante_domicilio_emitido_el);
  }
  return '';
}

function getDocumentRefreshMeta(docState = {}, validationState = {}) {
  const updatedAt = String(docState?.actualizado_at || validationState?.actualizadoAt || validationState?.actualizado_at || '').trim();
  const updatedFromRejection = docState?.actualizado_desde_rechazo === true || validationState?.actualizadoDesdeRechazo === true || validationState?.actualizado_desde_rechazo === true;
  return {
    updatedAt,
    updatedFromRejection,
    isUpdated: !!updatedAt
  };
}

const CLIENT_DOC_REQUIREMENTS = [
  {
    field: 'doc_ine',
    label: 'INE o identificación',
    requirements: [
      'Debe estar vigente.',
      'La imagen o PDF debe verse completa y legible.'
    ]
  },
  {
    field: 'doc_comprobante_domicilio',
    label: 'Comprobante de domicilio',
    dateField: 'comprobante_domicilio_emitido_el',
    requirements: [
      'Solo se acepta luz, agua o teléfono.',
      'Vigente durante el mes de emisión y los 2 meses siguientes; al iniciar el cuarto mes debe renovarse.',
      'Debe verse completo y coincidir con el domicilio.'
    ]
  },
  {
    field: 'doc_constancia_fiscal',
    label: 'Constancia de situación fiscal',
    dateField: 'constancia_fiscal_emitida_el',
    requirements: [
      'Debe ser PDF oficial del SAT.',
      'Se puede usar para cotizar durante 30 días a partir de la carga del archivo.',
      'RFC y razón social deben verse completos y legibles.'
    ]
  }
];
const CLIENT_QUOTE_DOC_FIELDS = [
  { field: 'cotizacion_final_file', urlField: 'url_cotizacion_final', label: 'Cotizacion aprobada', fallback: 'cotizacion_aprobada.pdf' },
  { field: 'orden_compra_file', urlField: 'url_orden_compra', label: 'Orden de compra', fallback: 'orden_compra.pdf' },
  { field: 'contrato_file', urlField: 'contrato_url', label: 'Contrato', fallback: 'contrato.pdf' },
  { field: 'factura_pdf_file', urlField: 'factura_pdf_url', label: 'Factura PDF', fallback: 'factura.pdf' },
  { field: 'factura_xml_file', urlField: 'factura_xml_url', label: 'Factura XML', fallback: 'factura.xml' }
];
const CLIENT_QUOTE_DOC_SELECT_FIELDS = 'id,numero_orden,nombre_cotizacion,detalles_evento,cliente_id,cliente_nombre,cliente_email,espacio_nombre,fecha_inicio,fecha_fin,precio_final,status,created_at,updated_at,url_cotizacion_final,url_orden_compra,contrato_url,factura_pdf_url,factura_xml_url,historial_pagos,cotizacion_final_file,orden_compra_file,contrato_file,factura_pdf_file,factura_xml_file';
const CLIENT_DOC_VALIDITY_DAYS = 90;
const CLIENT_CONSTANCIA_VALIDITY_DAYS = 30;
const CLIENT_CONSTANCIA_WARNING_DAYS = 7;
const CLIENT_CONSTANCIA_CRITICAL_DAYS = 3;
const CLIENT_COMPROBANTE_VALIDITY_DAYS = 'calendar_months:3';
const CLIENT_COMPROBANTE_WARNING_DAYS = 30;
const CLIENT_COMPROBANTE_CRITICAL_DAYS = 14;

function getClientDocumentValidityConfig(field) {
  if (field === 'doc_constancia_fiscal') {
    return {
      validDays: CLIENT_CONSTANCIA_VALIDITY_DAYS,
      warningDays: CLIENT_CONSTANCIA_WARNING_DAYS,
      criticalDays: CLIENT_CONSTANCIA_CRITICAL_DAYS
    };
  }
  if (field === 'doc_comprobante_domicilio') {
    return {
      validDays: CLIENT_COMPROBANTE_VALIDITY_DAYS,
      warningDays: CLIENT_COMPROBANTE_WARNING_DAYS,
      criticalDays: CLIENT_COMPROBANTE_CRITICAL_DAYS
    };
  }
  return {
    validDays: CLIENT_DOC_VALIDITY_DAYS,
    warningDays: 30,
    criticalDays: 14
  };
}

function getClientDocumentValidityDays(field) {
  return getClientDocumentValidityConfig(field).validDays;
}

function getClientDocumentValidityReferenceDate(client, field) {
  if (field === 'doc_constancia_fiscal') {
    return getClientValidationDate(client, 'constancia_fiscal_emitida_el');
  }
  if (field === 'doc_comprobante_domicilio') {
    return getClientValidationDate(client, 'comprobante_domicilio_emitido_el');
  }

  const validation = safeObject(client?.expediente_validacion);
  const documents = safeObject(validation.documents);
  const currentDoc = safeObject(documents[field]);
  const states = safeObject(client?.documentos_estado);
  const currentState = safeObject(states[field]);

  return normalizeStoredDate(
    currentState.subido_at
    || currentDoc.subidoAt
    || currentDoc.subido_at
    || client?.created_at
    || client?.created
  );
}

function hasClientDocumentFile(client, field, documents = safeObject(getClientValidation(client).documents)) {
  const current = safeObject(documents[field]);
  if (current.uploaded === true) return true;
  const raw = client?.[field];
  return Array.isArray(raw) ? raw.filter(Boolean).length > 0 : !!String(raw || '').trim();
}

function formatDocumentUtcDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '';
  return `${dateValue.getUTCFullYear()}-${String(dateValue.getUTCMonth() + 1).padStart(2, '0')}-${String(dateValue.getUTCDate()).padStart(2, '0')}`;
}

function calcCalendarMonthDocumentValidity(dateValue, validMonths = 3, warningDays = 30, criticalDays = 14) {
  const normalized = normalizeStoredDate(dateValue);
  if (!normalized) return { status: 'missing', daysLeft: null, date: '' };
  const issued = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(issued.getTime())) return { status: 'missing', daysLeft: null, date: '' };
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (issued.getTime() > todayUtc.getTime()) return { status: 'expired', daysLeft: -1, date: normalized, expiry: '' };
  const safeMonths = Math.max(1, Number(validMonths) || 3);
  const expiryBoundary = new Date(Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth() + safeMonths, 1));
  const lastValidDay = new Date(expiryBoundary.getTime() - 86400000);
  const daysLeft = Math.floor((expiryBoundary.getTime() - todayUtc.getTime()) / 86400000);
  const expiryStr = formatDocumentUtcDate(lastValidDay);
  if (todayUtc.getTime() >= expiryBoundary.getTime()) {
    const expiredDays = Math.max(1, Math.floor((todayUtc.getTime() - expiryBoundary.getTime()) / 86400000) + 1);
    return { status: 'expired', daysLeft: -expiredDays, date: normalized, expiry: expiryStr };
  }
  const safeWarningDays = Math.max(0, Number(warningDays) || 0);
  const safeCriticalDays = Math.max(0, Math.min(safeWarningDays || daysLeft, Number(criticalDays) || 0));
  if (safeCriticalDays > 0 && daysLeft <= safeCriticalDays) return { status: 'critical', daysLeft, date: normalized, expiry: expiryStr };
  if (safeWarningDays > 0 && daysLeft <= safeWarningDays) return { status: 'warning', daysLeft, date: normalized, expiry: expiryStr };
  return { status: 'ok', daysLeft, date: normalized, expiry: expiryStr };
}

function calcDocumentValidity(dateValue, validDays = CLIENT_DOC_VALIDITY_DAYS, warningDays = 30, criticalDays = 14) {
  const specialMode = String(validDays || '').trim().toLowerCase();
  if (specialMode.indexOf('calendar_months:') === 0) {
    const months = Number(specialMode.split(':')[1]) || 3;
    return calcCalendarMonthDocumentValidity(dateValue, months, warningDays, criticalDays);
  }
  const normalized = normalizeStoredDate(dateValue);
  if (!normalized) return { status: 'missing', daysLeft: null, date: '' };
  const issued = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(issued.getTime())) return { status: 'missing', daysLeft: null, date: '' };
  const safeValidDays = Math.max(0, Number(validDays) || 0);
  const safeWarningDays = Math.max(0, Math.min(safeValidDays, Number(warningDays) || 0));
  const safeCriticalDays = Math.max(0, Math.min(safeWarningDays || safeValidDays, Number(criticalDays) || 0));
  const expiryMs = issued.getTime() + (safeValidDays * 86400000);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysLeft = Math.floor((expiryMs - todayUtc.getTime()) / 86400000);
  const expiry = new Date(expiryMs);
  const expiryStr = `${expiry.getUTCFullYear()}-${String(expiry.getUTCMonth() + 1).padStart(2, '0')}-${String(expiry.getUTCDate()).padStart(2, '0')}`;
  if (daysLeft < 0) return { status: 'expired', daysLeft, date: normalized, expiry: expiryStr };
  if (safeCriticalDays > 0 && daysLeft <= safeCriticalDays) return { status: 'critical', daysLeft, date: normalized, expiry: expiryStr };
  if (safeWarningDays > 0 && daysLeft <= safeWarningDays) return { status: 'warning', daysLeft, date: normalized, expiry: expiryStr };
  return { status: 'ok', daysLeft, date: normalized, expiry: expiryStr };
}

function isDocumentOmitted(docState = {}, validationState = {}) {
  return docState?.omitido === true
    || validationState?.omitido === true
    || String(docState?.status || '').trim().toLowerCase() === 'omitido'
    || String(validationState?.estado || '').trim().toLowerCase() === 'omitido';
}

function canClientDocumentBeOmitted(field = '') {
  return String(field || '').trim() !== 'doc_constancia_fiscal';
}

function buildTooltipButtonHtml(text, extraClasses = '', modalTitle = 'Detalle') {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return `<button type="button" class="${extraClasses}" data-tooltip-title="${escapeAttr(modalTitle)}" data-tooltip-content="${escapeAttr(clean)}" aria-label="${escapeAttr(clean)}"><i class="fa-solid fa-circle-info"></i></button>`;
}
let clientInfoHoverTimer = null;
let clientInfoHoverCard = null;
let clientInfoHoverAnchor = null;

function ensureClientInfoModal() {
  if (clientInfoHoverCard) return clientInfoHoverCard;
  const modal = document.createElement('div');
  modal.id = 'client-info-mini-modal';
  modal.setAttribute('role', 'tooltip');
  modal.style.cssText = 'position:fixed;z-index:240;display:none;max-width:320px;min-width:240px;padding:14px 16px;border:1px solid rgba(148,163,184,.35);border-radius:18px;background:#ffffff;box-shadow:0 24px 48px rgba(15,23,42,.18);color:#475569;pointer-events:auto;';
  modal.innerHTML = `
    <div id="client-info-mini-modal-title" style="font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#0f172a;margin-bottom:8px;">Detalle</div>
    <div id="client-info-mini-modal-body" style="font-size:12px;line-height:1.55;white-space:pre-line;"></div>
  `;
  modal.addEventListener('mouseenter', () => {
    if (clientInfoHoverTimer) {
      clearTimeout(clientInfoHoverTimer);
      clientInfoHoverTimer = null;
    }
  });
  modal.addEventListener('mouseleave', scheduleClientInfoHoverHide);
  document.body.appendChild(modal);
  clientInfoHoverCard = modal;
  return modal;
}
function positionClientInfoModal(trigger, modal) {
  if (!trigger || !modal) return;
  const rect = trigger.getBoundingClientRect();
  modal.style.left = '0px';
  modal.style.top = '0px';
  modal.style.display = 'block';
  const cardRect = modal.getBoundingClientRect();
  let top = rect.bottom + 10;
  let left = rect.left + (rect.width / 2) - (cardRect.width / 2);
  const maxLeft = window.innerWidth - cardRect.width - 12;
  if (left < 12) left = 12;
  if (left > maxLeft) left = maxLeft;
  if (top + cardRect.height > window.innerHeight - 12) top = Math.max(12, rect.top - cardRect.height - 10);
  modal.style.left = `${left}px`;
  modal.style.top = `${top}px`;
}
function openClientInfoModal(title, content, trigger) {
  const modal = ensureClientInfoModal();
  const titleEl = document.getElementById('client-info-mini-modal-title');
  const bodyEl = document.getElementById('client-info-mini-modal-body');
  if (titleEl) titleEl.textContent = String(title || 'Detalle').trim() || 'Detalle';
  if (bodyEl) bodyEl.textContent = String(content || '').trim();
  clientInfoHoverAnchor = trigger || null;
  positionClientInfoModal(trigger, modal);
}
function closeClientInfoModal() {
  if (clientInfoHoverTimer) {
    clearTimeout(clientInfoHoverTimer);
    clientInfoHoverTimer = null;
  }
  if (clientInfoHoverCard) clientInfoHoverCard.style.display = 'none';
  clientInfoHoverAnchor = null;
}
function scheduleClientInfoHoverHide() {
  if (clientInfoHoverTimer) clearTimeout(clientInfoHoverTimer);
  clientInfoHoverTimer = window.setTimeout(closeClientInfoModal, 120);
}
function bindClientInfoModal() {
  if (window.__CP_CLIENT_INFO_MODAL_BOUND__) return;
  window.__CP_CLIENT_INFO_MODAL_BOUND__ = true;
  document.addEventListener('mouseover', (ev) => {
    const trigger = ev.target?.closest?.('.client-tooltip-btn');
    if (trigger) {
      if (clientInfoHoverTimer) {
        clearTimeout(clientInfoHoverTimer);
        clientInfoHoverTimer = null;
      }
      openClientInfoModal(trigger.getAttribute('data-tooltip-title') || 'Detalle', trigger.getAttribute('data-tooltip-content') || '', trigger);
      return;
    }
  });
  document.addEventListener('mouseout', (ev) => {
    const trigger = ev.target?.closest?.('.client-tooltip-btn');
    if (!trigger) return;
    const related = ev.relatedTarget || null;
    if ((clientInfoHoverCard && related && clientInfoHoverCard.contains(related)) || (related && trigger.contains?.(related))) return;
    scheduleClientInfoHoverHide();
  });
  document.addEventListener('focusin', (ev) => {
    const trigger = ev.target?.closest?.('.client-tooltip-btn');
    if (trigger) openClientInfoModal(trigger.getAttribute('data-tooltip-title') || 'Detalle', trigger.getAttribute('data-tooltip-content') || '', trigger);
  });
  document.addEventListener('focusout', (ev) => {
    const trigger = ev.target?.closest?.('.client-tooltip-btn');
    if (trigger) scheduleClientInfoHoverHide();
  });
  window.addEventListener('scroll', closeClientInfoModal, true);
  window.addEventListener('resize', closeClientInfoModal);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeClientInfoModal();
  });
}

function getDocumentTrafficMeta(label, dateValue, validDays = CLIENT_DOC_VALIDITY_DAYS, warningDays = 30, criticalDays = 14) {
  const traffic = calcDocumentValidity(dateValue, validDays, warningDays, criticalDays);
  const base = { status: traffic.status, text: `${label}: sin fecha detectada`, title: `${label}: sin fecha detectada`, classes: 'bg-slate-100 text-slate-600', icon: 'fa-calendar-xmark' };
  if (traffic.status === 'expired') return { ...base, text: `${label}: vencido hace ${Math.abs(traffic.daysLeft)} día(s)`, title: `${label} emitido el ${safeDate(traffic.date)}. Vencido hace ${Math.abs(traffic.daysLeft)} día(s).`, classes: 'bg-red-100 text-red-700', icon: 'fa-circle-xmark' };
  if (traffic.status === 'critical') return { ...base, text: `${label}: vence en ${traffic.daysLeft} día(s)`, title: `${label} emitido el ${safeDate(traffic.date)}. Vence en ${traffic.daysLeft} día(s).`, classes: 'bg-orange-100 text-orange-700', icon: 'fa-triangle-exclamation' };
  if (traffic.status === 'warning') return { ...base, text: `${label}: vence en ${traffic.daysLeft} día(s)`, title: `${label} emitido el ${safeDate(traffic.date)}. Vence en ${traffic.daysLeft} día(s).`, classes: 'bg-amber-100 text-amber-700', icon: 'fa-clock' };
  if (traffic.status === 'ok') return { ...base, text: `${label}: ${traffic.daysLeft} día(s) restantes`, title: `${label} emitido el ${safeDate(traffic.date)}. Vigente por ${traffic.daysLeft} día(s) más.`, classes: 'bg-emerald-100 text-emerald-700', icon: 'fa-circle-check' };
  return base;
}

function buildTrafficBadgeHtml(label, dateValue, validDays = CLIENT_DOC_VALIDITY_DAYS, warningDays = 30, criticalDays = 14) {
  const meta = getDocumentTrafficMeta(label, dateValue, validDays, warningDays, criticalDays);
  return `<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black ${meta.classes}" title="${escapeAttr(meta.title)}"><i class="fa-solid ${meta.icon}"></i>${escapeHTML(meta.text)}</span>`;
}

function buildOmittedBadgeHtml(label) {
  return `<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black bg-sky-100 text-sky-700" title="${escapeAttr(`${label}: omitido por administración`)}"><i class="fa-solid fa-forward"></i>${escapeHTML(`${label}: omitido`)}</span>`;
}

function summarizeClientDocuments(client) {
  const validation = getClientValidation(client);
  const documents = safeObject(validation.documents);
  const estados = safeObject(client?.documentos_estado);
  const rawStatus = String(client?.perfil_estatus || validation.status || '').trim().toLowerCase();
  const constanciaValidity = getClientDocumentValidityConfig('doc_constancia_fiscal');
  const comprobanteValidity = getClientDocumentValidityConfig('doc_comprobante_domicilio');
  const summary = {
    uploadedCount: 0,
    coveredCount: 0,
    totalCount: CLIENT_DOC_REQUIREMENTS.length,
    missingDocs: [],
    pendingDocs: [],
    rejectedDocs: [],
    expiredDocs: [],
    warningDocs: [],
    omittedDocs: [],
    updatedDocs: [],
    tooltipLines: [],
    constanciaStatus: calcDocumentValidity(
      getClientDocumentValidityReferenceDate(client, 'doc_constancia_fiscal'),
      constanciaValidity.validDays,
      constanciaValidity.warningDays,
      constanciaValidity.criticalDays
    ),
    comprobanteStatus: calcDocumentValidity(
      getClientDocumentValidityReferenceDate(client, 'doc_comprobante_domicilio'),
      comprobanteValidity.validDays,
      comprobanteValidity.warningDays,
      comprobanteValidity.criticalDays
    ),
    constanciaOmitted: false,
    comprobanteOmitted: false
  };

  CLIENT_DOC_REQUIREMENTS.forEach((doc) => {
    const docState = safeObject(estados[doc.field]);
    const validationState = safeObject(documents[doc.field]);
    const uploaded = hasClientDocumentFile(client, doc.field, documents);
    const omitted = canClientDocumentBeOmitted(doc.field) && isDocumentOmitted(docState, validationState);
    const refreshMeta = getDocumentRefreshMeta(docState, validationState);
    const status = String(docState.status || validationState.estado || '').trim().toLowerCase();
    const reason = String(docState.motivo || validationState.motivo || '').trim();
    const traffic = doc.dateField
      ? (() => {
          const validity = getClientDocumentValidityConfig(doc.field);
          return calcDocumentValidity(
            getClientDocumentValidityReferenceDate(client, doc.field),
            validity.validDays,
            validity.warningDays,
            validity.criticalDays
          );
        })()
      : null;

    if (uploaded || omitted) summary.coveredCount += 1;
    if (uploaded) summary.uploadedCount += 1;
    if (omitted) {
      if (doc.field === 'doc_constancia_fiscal') summary.constanciaOmitted = true;
      if (doc.field === 'doc_comprobante_domicilio') summary.comprobanteOmitted = true;
      summary.omittedDocs.push(doc);
      return;
    }
    if (!uploaded) {
      summary.missingDocs.push(doc);
      return;
    }
    if (status === 'rechazado') {
      summary.rejectedDocs.push({ ...doc, reason: reason || 'El documento fue rechazado.' });
      return;
    }
    if (traffic && traffic.status === 'expired') {
      summary.expiredDocs.push({ ...doc, traffic });
      return;
    }
    if (traffic && (traffic.status === 'warning' || traffic.status === 'critical')) {
      summary.warningDocs.push({ ...doc, traffic });
    }
    if (refreshMeta.isUpdated) {
      summary.updatedDocs.push({ ...doc, updatedAt: refreshMeta.updatedAt, updatedFromRejection: refreshMeta.updatedFromRejection });
    }
    if (status !== 'aprobado' && rawStatus !== 'validado' && validation.readyForQuotes !== true && client?.perfil_validado !== true) {
      summary.pendingDocs.push(doc);
    }
  });

  if (summary.missingDocs.length) summary.tooltipLines.push(`Faltan: ${summary.missingDocs.map((doc) => doc.label).join(', ')}`);
  if (summary.pendingDocs.length) summary.tooltipLines.push(`Por validar: ${summary.pendingDocs.map((doc) => doc.label).join(', ')}`);
  if (summary.omittedDocs.length) summary.tooltipLines.push(`Omitidos: ${summary.omittedDocs.map((doc) => doc.label).join(', ')}`);
  if (summary.updatedDocs.length) summary.tooltipLines.push(`Actualizados: ${summary.updatedDocs.map((doc) => doc.label).join(', ')}`);
  if (summary.warningDocs.length) summary.tooltipLines.push(summary.warningDocs.map((doc) => `${doc.label}: vence en ${doc.traffic.daysLeft} día(s)`).join('\n'));
  if (summary.expiredDocs.length) summary.tooltipLines.push(summary.expiredDocs.map((doc) => `${doc.label}: vencido hace ${Math.abs(doc.traffic.daysLeft)} día(s)`).join('\n'));
  if (summary.rejectedDocs.length) summary.tooltipLines.push(summary.rejectedDocs.map((doc) => `${doc.label}: ${doc.reason}`).join('\n'));

  return summary;
}

function buildClientPublicProfileUrl(client) {
  const id = String(client?.id || '').trim();
  if (!id) return '';
  return new URL('../public/perfil_cliente.html', window.location.href).toString();
}

async function buildClientPublicProfileDirectUrl(client) {
  const clientId = String(client?.id || '').trim();
  if (!clientId) throw new Error('Este perfil no tiene ID valido.');
  const token = getAuthToken();
  if (!token) throw new Error('No se encontro una sesion valida para abrir el expediente.');
  const resp = await fetch(`${String(PB_URL || '').replace(/\/+$/, '')}/api/cotizador/client-profile-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ clientId }),
    credentials: 'omit',
    cache: 'no-store'
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok || !payload.accessToken) {
    throw new Error(payload.message || 'No se pudo generar el acceso directo al expediente.');
  }
  const url = new URL('../public/perfil_cliente.html', window.location.href);
  url.searchParams.set('access', payload.accessToken);
  return url.toString();
}

function getClientValidation(client) {
  const validation = safeObject(client?.expediente_validacion);
  return validation && typeof validation === 'object' ? validation : {};
}

function getClientValidationMissingFields(client) {
  const validation = getClientValidation(client);
  const raw = Array.isArray(validation.missingFields)
    ? validation.missingFields
    : (Array.isArray(validation.missing_fields) ? validation.missing_fields : []);
  return raw
    .map((field) => CLIENT_MISSING_FIELD_LABELS[String(field || '').trim()] || String(field || '').trim().replace(/_/g, ' '))
    .filter(Boolean);
}

function getClientContractMissingFields(client) {
  const validation = getClientValidation(client);
  const raw = Array.isArray(validation.contractMissingFields)
    ? validation.contractMissingFields
    : (Array.isArray(validation.contract_missing_fields) ? validation.contract_missing_fields : []);
  return raw
    .map((field) => CLIENT_MISSING_FIELD_LABELS[String(field || '').trim()] || String(field || '').trim().replace(/_/g, ' '))
    .filter(Boolean);
}

function getClientPendingTooltip(client, summary = summarizeClientDocuments(client), missingFieldLabels = getClientValidationMissingFields(client)) {
  const validation = getClientValidation(client);
  const rawStatus = String(client?.perfil_estatus || validation.status || '').trim().toLowerCase();
  const readyForQuotes =
    client?.perfil_validado === true ||
    validation.readyForQuotes === true ||
    validation.ready === true ||
    rawStatus === 'validado' ||
    (
      missingFieldLabels.length === 0 &&
      summary.missingDocs.length === 0 &&
      summary.pendingDocs.length === 0 &&
      summary.rejectedDocs.length === 0 &&
      summary.expiredDocs.length === 0
    );
  const lines = [];

  if (!readyForQuotes && missingFieldLabels.length) {
    const docsAlreadyReviewed =
      summary.missingDocs.length === 0 &&
      summary.pendingDocs.length === 0 &&
      summary.rejectedDocs.length === 0 &&
      summary.expiredDocs.length === 0;
    if (docsAlreadyReviewed) {
      lines.push('Los documentos ya fueron aprobados por administración, pero el expediente aún no está completo para cotizar.');
    }
    lines.push(`Faltan datos del expediente: ${missingFieldLabels.join(', ')}`);
  }

  lines.push(...summary.tooltipLines);
  return [...new Set(lines.filter(Boolean))].join('\n');
}

function getClientStatusMeta(client, summary = summarizeClientDocuments(client)) {
  const validation = getClientValidation(client);
  const rawStatus = String(client?.perfil_estatus || validation.status || '').trim().toLowerCase();
  const missingFieldLabels = getClientValidationMissingFields(client);
  const readyForQuotes =
    client?.perfil_validado === true ||
    validation.readyForQuotes === true ||
    validation.ready === true ||
    rawStatus === 'validado' ||
    (
      missingFieldLabels.length === 0 &&
      summary.missingDocs.length === 0 &&
      summary.pendingDocs.length === 0 &&
      summary.rejectedDocs.length === 0 &&
      summary.expiredDocs.length === 0
    );

  if (summary.rejectedDocs.length || summary.expiredDocs.length) {
    return {
      label: 'No utilizable',
      badgeClass: 'bg-red-100 text-red-700',
      detail: summary.rejectedDocs[0]?.reason || 'Hay documentos vencidos o rechazados.',
      cardColorClass: 'border-red-400 bg-red-50',
      tooltip: summary.tooltipLines.join('\n'),
      canQuote: false
    };
  }

  if (readyForQuotes && summary.missingDocs.length === 0 && summary.pendingDocs.length === 0) {
    return {
      label: 'Listo para cotizar',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      detail: 'Expediente validado y completo para cotizar.',
      cardColorClass: 'border-emerald-400 bg-emerald-50',
      tooltip: (summary.warningDocs.length || summary.omittedDocs.length) ? summary.tooltipLines.join('\n') : '',
      canQuote: true
    };
  }

  return {
    label: 'Pendiente',
    badgeClass: 'bg-amber-100 text-amber-700',
    detail: summary.updatedDocs.length
      ? 'Documento actualizado, pendiente de validación manual.'
      : (summary.pendingDocs.length
          ? `Hay ${summary.pendingDocs.length} documento(s) en revisión por administración.`
          : (summary.missingDocs.length
              ? `Faltan ${summary.missingDocs.length} documento(s) por revisar o cargar.`
              : (missingFieldLabels.length
                  ? `${summary.coveredCount === summary.totalCount ? 'Documentos aprobados por administración, pero faltan datos del expediente: ' : 'Faltan datos del expediente: '}${missingFieldLabels.join(', ')}.`
                  : 'Pendiente de validación manual.'))),
    cardColorClass: 'border-amber-400 bg-amber-50',
    tooltip: getClientPendingTooltip(client, summary, missingFieldLabels),
    canQuote: false
  };
}

function getClientContractStatusMeta(client, summary = summarizeClientDocuments(client), quoteStatus = getClientStatusMeta(client, summary)) {
  const validation = getClientValidation(client);
  const contractMissing = getClientContractMissingFields(client);
  const quoteReady = quoteStatus.canQuote === true;
  const hasDictamen =
    validation.readyForContracts === true ||
    validation.dictamenAprobado === true;
  const canContract = quoteReady && hasDictamen;

  if (canContract) {
    return {
      label: 'Listo para contrato',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      detail: 'Puede generar contratos con este expediente.',
      tooltip: 'Expediente validado y dictamen disponible para contrato.',
      canContract: true
    };
  }

  const tooltipLines = [];
  let detail = '';

  if (contractMissing.length) {
    detail = `Falta: ${contractMissing.join(', ')}.`;
    tooltipLines.push(`Falta para contrato: ${contractMissing.join(', ')}`);
  } else if (!quoteReady) {
    detail = quoteStatus.detail
      ? `Bloqueado hasta completar la validacion para cotizar. ${quoteStatus.detail}`
      : 'Primero debe quedar validado para cotizar.';
    tooltipLines.push('El expediente del cliente debe estar completo, vigente y aprobado antes de generar contrato.');
  } else if (validation.dictamenDesactualizado === true) {
    detail = 'El dictamen ya no corresponde al expediente vigente.';
    tooltipLines.push('Genera o aprueba un nuevo dictamen con los documentos actuales.');
  } else {
    detail = 'Falta guardar o aprobar el dictamen del cliente.';
    tooltipLines.push('Falta guardar o aprobar el dictamen del cliente.');
  }

  if (quoteStatus.tooltip) tooltipLines.push(quoteStatus.tooltip);

  return {
    label: quoteReady ? 'Contrato pendiente' : 'Contrato bloqueado',
    badgeClass: quoteReady ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700',
    detail,
    tooltip: [...new Set(tooltipLines.filter(Boolean))].join('\n'),
    canContract: false
  };
}

function getClientDocumentMeta(client) {
  return summarizeClientDocuments(client);
}

function buildClientRecordFileUrl(client, field) {
  const value = client?.[field];
  const filename = Array.isArray(value) ? value[0] : value;
  const id = String(client?.id || '').trim();
  if (!id || !filename) return '';
  const versionValue = String(client?.updated_at || client?.updated || client?.created_at || client?.created || filename || '').trim();
  const versionQuery = versionValue ? (`?v=${encodeURIComponent(versionValue)}`) : '';
  return `${String(PB_URL || '').replace(/\/+$/, '')}/api/files/clientes/${encodeURIComponent(id)}/${encodeURIComponent(filename)}${versionQuery}`;
}

function getClientDocumentStateMeta(client, field) {
  const validation = safeObject(getClientValidation(client).documents);
  const docValidation = safeObject(validation[field]);
  const docStates = safeObject(client?.documentos_estado);
  const docState = safeObject(docStates[field]);
  const status = String(docState.status || docValidation.estado || '').trim().toLowerCase();
  const omitted = canClientDocumentBeOmitted(field) && isDocumentOmitted(docState, docValidation);
  const approved = omitted || status === 'aprobado';
  return {
    status,
    omitted,
    approved,
    reviewedByName: String(docState.aprobado_por_nombre || docState.revisado_por_nombre || docValidation.aprobadoPorNombre || docValidation.revisadoPorNombre || '').trim(),
    reviewedAt: String(docState.aprobado_at || docState.revisado_at || docValidation.aprobadoAt || docValidation.revisadoAt || '').trim()
  };
}

function canAccessClientDocumentFile(client, field) {
  return canSeeAllDocuments || getClientDocumentStateMeta(client, field).approved;
}

function getAuthToken() {
  const AUTH_KEYS = ['pb_native_auth_v1', 'pb_compat_auth_v1', 'pb_auth'];
  for (const key of AUTH_KEYS) {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = String(parsed?.token || parsed?.access_token || '').trim();
      if (token) return token;
    } catch (_) {}
  }
  return '';
}

async function fetchServerNowIso() {
  try {
    const resp = await fetch(`${String(PB_URL || '').replace(/\/+$/, '')}/api/cotizador/server-time`, {
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const now = String(data?.now || '').trim();
    if (now && !Number.isNaN(new Date(now).getTime())) return now;
  } catch (_) {}
  return window.__serverDateService.nowISO();
}

async function getSignedFileUrl(collection, recordId, filename) {
  if (!filename || !recordId) return '';
  try {
    const token = getAuthToken();
    const resp = await fetch(`${String(PB_URL || '').replace(/\/+$/, '')}/api/files/token`, {
      method: 'POST',
      headers: token ? { Authorization: token } : {},
      credentials: 'omit',
      cache: 'no-store'
    });
    if (!resp.ok) {
      return `${String(PB_URL || '').replace(/\/+$/, '')}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(String(filename))}`;
    }
    const data = await resp.json();
    const fileToken = String(data?.token || '').trim();
    return `${String(PB_URL || '').replace(/\/+$/, '')}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(String(filename))}?token=${encodeURIComponent(fileToken)}`;
  } catch (_) {
    return `${String(PB_URL || '').replace(/\/+$/, '')}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(String(filename))}`;
  }
}

async function openClientProfileFile(client, field, label='documento') {
  if (!canAccessClientDocumentFile(client, field)) {
    return window.showToast?.('Solo un verificador puede abrir documentos pendientes o en revision.', 'error');
  }
  const value = client?.[field];
  const filename = Array.isArray(value) ? value[0] : value;
  const id = String(client?.id || '').trim();
  if (!id || !filename) return window.showToast?.(`No se encontró ${label}.`, 'error');
  try {
    const url = await getSignedFileUrl('clientes', id, String(filename));
    if (!url) return window.showToast?.(`No se encontró ${label}.`, 'error');
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (_) {
    window.showToast?.(`No se pudo abrir ${label}.`, 'error');
  }
}

async function openClientPublicProfile(client) {
  let popup = null;
  try {
    popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    const url = await buildClientPublicProfileDirectUrl(client);
    if (popup) {
      popup.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    if (popup) popup.close();
    window.showToast?.(error?.message || 'No se puede abrir el expediente.', 'error');
  }
}

function buildClientQuoteFolio(row) {
  const current = String(row?.numero_orden || '').trim();
  if (current) return current.toUpperCase();
  const rawId = String(row?.id || '').trim().toUpperCase();
  return rawId ? `CP-${rawId.slice(0, 6)}` : 'CP-PEND';
}

function normalizePdfNoteDocType(value='') {
  const raw = normalize(value);
  if (['cotizacion', 'cotización', 'quote', 'borrador', 'draft_quote'].includes(raw)) return 'cotizacion';
  if (['orden', 'order', 'orden_compra', 'purchase_order', 'orden de compra'].includes(raw)) return 'orden';
  if (['recibo', 'receipt', 'recibos', 'constancia', 'constancia_liquidacion', 'constancia de liquidacion'].includes(raw)) return 'recibo';
  if (['contrato', 'contract'].includes(raw)) return 'contrato';
  if (['factura', 'invoice', 'xml', 'factura_pdf', 'factura_xml'].includes(raw)) return 'factura';
  return raw;
}

function getQuotePdfNotes(row, docType) {
  return [];
}

function formatPdfNoteDate(value='') {
  const stamp = String(value || '').trim();
  if (!stamp) return 'Sin fecha registrada';
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return stamp;
  return parsed.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function openClientPdfNotesModal(row, docType, docLabel) {
  window.showToast?.("El sistema de notas está deshabilitado.", "info");
}

function showEmptyIfNeeded() {
  const grid = document.getElementById('clients-grid');
  const empty = document.getElementById('clients-empty');
  if (!grid || !empty) return;
  const hasCards = grid.querySelectorAll('[data-client-card]').length > 0;
  empty.classList.toggle('hidden', hasCards);
}

function renderClients(list) {
  const grid = document.getElementById('clients-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!Array.isArray(list) || !list.length) {
    showEmptyIfNeeded();
    return;
  }

  list.forEach(c => {
    const name = escapeHTML(c.nombre_completo || '');
    const phone = escapeHTML(c.telefono || '');
    const email = escapeHTML(c.correo || '');
    const rfc = escapeHTML(c.rfc || '');
    const documentMeta = getClientDocumentMeta(c);
    const status = getClientStatusMeta(c, documentMeta);
    const contractStatus = getClientContractStatusMeta(c, documentMeta, status);
    const profileUrl = buildClientPublicProfileUrl(c);
    const additionalPhones = safeArray(c.telefonos_adicionales).map(v => String(v || '').trim()).filter(Boolean);
    const additionalEmails = safeArray(c.correos_adicionales).map(v => String(v || '').trim()).filter(Boolean);
    const statusTooltipHtml = status.tooltip
      ? buildTooltipButtonHtml(status.tooltip, 'client-tooltip-btn inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/20 bg-white/70 text-slate-500 transition hover:text-brand-red', 'Estado del cliente')
      : '';
    const expedienteTooltipContent = status.tooltip || documentMeta.tooltipLines.join('\n');
    const expedienteTooltipHtml = expedienteTooltipContent
      ? buildTooltipButtonHtml(expedienteTooltipContent, 'client-tooltip-btn inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white text-slate-500 transition hover:text-brand-red', 'Expediente pendiente')
      : '';
    const contractTooltipHtml = contractStatus.tooltip
      ? buildTooltipButtonHtml(contractStatus.tooltip, 'client-tooltip-btn inline-flex h-7 w-7 items-center justify-center rounded-full border border-current/20 bg-white text-slate-500 transition hover:text-brand-red', 'Estado para contrato')
      : '';
    const additionalPhonesHtml = additionalPhones.length
      ? `<div class="flex items-start gap-2 text-gray-700">
          <i class="fa-solid fa-phone-volume text-gray-400 w-4 mt-0.5"></i>
          <span class="text-[11px] font-semibold leading-5">${escapeHTML(additionalPhones.join(' • '))}</span>
        </div>`
      : '';
    const additionalEmailsHtml = additionalEmails.length
      ? `<div class="flex items-start gap-2 text-gray-700">
          <i class="fa-solid fa-envelope-circle-check text-gray-400 w-4 mt-0.5"></i>
          <span class="text-[11px] font-semibold break-all leading-5">${escapeHTML(additionalEmails.join(' • '))}</span>
        </div>`
      : '';
    const constanciaValidity = getClientDocumentValidityConfig('doc_constancia_fiscal');
    const comprobanteValidity = getClientDocumentValidityConfig('doc_comprobante_domicilio');
    const constanciaBadgeHtml = documentMeta.constanciaOmitted
      ? buildOmittedBadgeHtml('Constancia')
      : buildTrafficBadgeHtml(
          'Constancia',
          getClientDocumentValidityReferenceDate(c, 'doc_constancia_fiscal'),
          constanciaValidity.validDays,
          constanciaValidity.warningDays,
          constanciaValidity.criticalDays
        );
    const comprobanteBadgeHtml = documentMeta.comprobanteOmitted
      ? buildOmittedBadgeHtml('Comprobante')
      : buildTrafficBadgeHtml(
          'Comprobante',
          getClientDocumentValidityReferenceDate(c, 'doc_comprobante_domicilio'),
          comprobanteValidity.validDays,
          comprobanteValidity.warningDays,
          comprobanteValidity.criticalDays
        );
    const constanciaHeadline = documentMeta.constanciaOmitted
      ? 'Constancia omitida'
      : (documentMeta.constanciaStatus.status === 'expired'
        ? 'Constancia vencida'
        : ((documentMeta.constanciaStatus.status === 'warning' || documentMeta.constanciaStatus.status === 'critical')
          ? 'Constancia por vencer'
          : (documentMeta.constanciaStatus.status === 'ok' ? 'Constancia vigente' : 'Expediente por revisar')));

    const actions = `
      <div class="flex flex-wrap gap-2">
        <button class="btn-docs bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
          <i class="fa-solid fa-folder-open"></i> Expediente
        </button>
        ${(canVerify) ? `
          <button class="btn-dictamen bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-black text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-file-pdf"></i> Dictamen
          </button>
        ` : ''}
        <button class="btn-link ${profileUrl ? 'bg-brand-red/10 hover:bg-brand-red/20 text-brand-red' : 'bg-gray-100 text-gray-400'} font-black text-xs px-3 py-2 rounded-xl transition flex items-center gap-2" ${profileUrl ? '' : 'disabled'}>
          <i class="fa-solid fa-link"></i> Abrir expediente
        </button>
        ${(canVerify) ? `
          <button class="btn-verify bg-orange-100 hover:bg-orange-200 text-orange-700 font-black text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-list-check"></i> Verificar
          </button>
        ` : ''}
        ${canManage ? `
          <button class="btn-edit bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-pen"></i> Editar
          </button>
        ` : ''}
        ${(canManage || canVerify) ? `
          <button class="btn-del bg-brand-red/10 hover:bg-brand-red/20 text-brand-red font-black text-xs px-3 py-2 rounded-xl transition flex items-center gap-2">
            <i class="fa-solid fa-trash"></i> Eliminar
          </button>
        ` : ''}
      </div>
    `;

    const card = document.createElement('div');
    card.setAttribute('data-client-card', '1');
    card.setAttribute('data-client-id', String(c.id || ''));
    card.className = "rounded-2xl shadow-md border p-4 hover:shadow-lg transition cursor-pointer " + (status.cardColorClass || "bg-white border-gray-100");
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-black text-sm text-gray-800 truncate">${name || '—'}</h3>
          <button class="client-id-badge mt-1 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-500 transition hover:border-brand-red/40 hover:text-brand-red" type="button">
            <span>ID: ${escapeHTML(c.id || '--')}</span>
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="w-9 h-9 rounded-2xl bg-brand-red text-white flex items-center justify-center shadow">
            <i class="fa-solid fa-user"></i>
          </span>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${status.badgeClass}">${status.label}</span>
            ${statusTooltipHtml}
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-sm">
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-phone text-gray-400 w-4"></i>
          <span class="text-xs font-semibold">${phone || '—'}</span>
        </div>
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-envelope text-gray-400 w-4"></i>
          <span class="text-xs font-semibold break-all">${email || '—'}</span>
        </div>
        <div class="flex items-center gap-2 text-gray-700">
          <i class="fa-solid fa-file-lines text-gray-400 w-4"></i>
          <span class="text-xs font-semibold">${rfc || '—'}</span>
        </div>
        ${additionalPhonesHtml}
        ${additionalEmailsHtml}
      </div>

      <div class="mt-4 rounded-2xl bg-white/70 border border-black/5 p-3 space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Expediente</span>
            <p class="mt-1 text-[11px] text-gray-500">${documentMeta.coveredCount}/${documentMeta.totalCount} requisitos del expediente cubiertos</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-black ${documentMeta.constanciaOmitted ? 'text-sky-700' : (documentMeta.constanciaStatus.status === 'ok' ? 'text-emerald-600' : (documentMeta.constanciaStatus.status === 'expired' ? 'text-red-600' : 'text-amber-600'))}">
              ${constanciaHeadline}
            </span>
          </div>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white px-3 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Puede cotizar</span>
              <p class="mt-1 text-[11px] text-gray-500">${escapeHTML(status.detail)}</p>
            </div>
            <div class="flex items-center gap-2 pl-3">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${status.badgeClass}">${status.label}</span>
              ${expedienteTooltipHtml}
            </div>
          </div>
        </div>
        <div class="rounded-xl border border-gray-200 bg-white px-3 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Puede generar contrato</span>
              <p class="mt-1 text-[11px] text-gray-500">${escapeHTML(contractStatus.detail)}</p>
            </div>
            <div class="flex items-center gap-2 pl-3">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${contractStatus.badgeClass}">${contractStatus.label}</span>
              ${contractTooltipHtml}
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          ${comprobanteBadgeHtml}
          ${constanciaBadgeHtml}
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between">
        ${actions}
      </div>
    `;

    // Para verificadores la tarjeta abre revisión directa; para el resto conserva el historial.
    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.client-id-badge')) {
        navigator.clipboard.writeText(c.id).then(() => {
          window.showToast?.('ID copiado al portapapeles', 'success');
        });
        return;
      }
      if (ev.target.closest('.client-tooltip-btn')) return;
      if (canVerify && !canManage) {
        openVerificationModal(c);
        return;
      }
      openClientHistory(c);
    });

    card.querySelector('.btn-docs')?.addEventListener('click', (ev) => { ev.stopPropagation(); openClientProfileDocs(c); });
    card.querySelector('.btn-dictamen')?.addEventListener('click', (ev) => { ev.stopPropagation(); openClientVerificationReport(c); });
    card.querySelector('.btn-link')?.addEventListener('click', async (ev) => { ev.stopPropagation(); await openClientPublicProfile(c); });
    card.querySelector('.btn-verify')?.addEventListener('click', (ev) => { ev.stopPropagation(); openVerificationModal(c); });
    card.querySelector('.btn-edit')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!canManage) return window.showToast?.('No tienes permiso para editar clientes.', 'error');
      openClientModal(c);
    });
    card.querySelector('.btn-del')?.addEventListener('click', (ev) => { ev.stopPropagation(); confirmDeleteClient(c); });

    grid.appendChild(card);
  });

  showEmptyIfNeeded();
}

async function loadClients() {
  cpClientsApplyViewStateControls();
  try {
    const { data, error } = await window.tenantPocketBase.from('clientes')
      .select('id,nombre_completo,telefono,correo,correos_adicionales,rfc,telefonos_adicionales,perfil_estatus,perfil_validado,perfil_completo,expediente_validacion,documentos_estado,constancia_fiscal_emitida_el,comprobante_domicilio_emitido_el,doc_acta_constitutiva,doc_ine,doc_comprobante_domicilio,doc_constancia_fiscal,created_at,updated_at')
      .order('nombre_completo', { ascending: true });

    if (error) throw error;
    allClients = data || [];
    cpClientsRestoringViewState = true;
    applySearch({ skipSave: true });
    cpClientsRestoringViewState = false;
    cpClientsRestoreViewStateAfterRender();
    maybeOpenQueuedVerificationClient();
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudieron cargar los clientes. (¿Ya ejecutaste el SQL?)", "error");
    allClients = [];
    cpClientsRestoringViewState = true;
    applySearch({ skipSave: true });
    cpClientsRestoringViewState = false;
    cpClientsRestoreViewStateAfterRender();
    maybeOpenQueuedVerificationClient();
  }
}

function clearQueuedVerificationClient() {
  pendingVerificationClientId = '';
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('verify')) return;
    url.searchParams.delete('verify');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch (_) {}
}

function maybeOpenQueuedVerificationClient() {
  if (!canVerify || !pendingVerificationClientId) return;
  const target = allClients.find((client) => String(client?.id || '').trim() === pendingVerificationClientId);
  if (!target) return;
  clearQueuedVerificationClient();
  openVerificationModal(target);
}

function applySearch(options = {}) {
  const q = normalize(document.getElementById('clients-search')?.value || '');
  if (!q) {
    renderClients(allClients);
    if (!cpClientsRestoringViewState && options.skipSave !== true) cpClientsSaveViewState();
    return;
  }

  const filtered = allClients.filter(c => {
    const blob = [
      c.nombre_completo, c.telefono, c.correo, c.rfc, ...(safeArray(c.telefonos_adicionales)), ...(safeArray(c.correos_adicionales))
    ].map(v => normalize(v || '')).join(' ');
    return blob.includes(q);
  });

  renderClients(filtered);
  if (!cpClientsRestoringViewState && options.skipSave !== true) cpClientsSaveViewState();
}

function openClientModal(client=null) {
  if (!canManage) return window.showToast?.("No tienes permisos para administrar clientes.", "error");
  cpClientsSaveViewState({ selectedClientId: String(client?.id || '').trim() });

  const idEl = document.getElementById('client-id');
  const nameEl = document.getElementById('client-name');
  const phoneEl = document.getElementById('client-phone');
  const emailEl = document.getElementById('client-email');
  const rfcEl = document.getElementById('client-rfc');
  const title = document.getElementById('client-modal-title');

  if (!idEl || !nameEl || !phoneEl || !emailEl || !rfcEl) return;

  idEl.value = client?.id || '';
  nameEl.value = client?.nombre_completo || '';
  phoneEl.value = client?.telefono || '';
  emailEl.value = client?.correo || '';
  rfcEl.value = client?.rfc || '';

  if (title) title.innerText = client?.id ? "Editar Cliente" : "Nuevo Cliente";

  const estados = safeObject(client?.documentos_estado);
  ['doc-ine', 'doc-domicilio', 'doc-constancia'].forEach((inputId) => {
    const input = document.getElementById(inputId);
    const statusEl = document.getElementById(`${inputId}-status`);
    if (input) {
      input.value = '';
      input.disabled = false;
      input.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (statusEl) statusEl.classList.add('hidden');

    if (client) {
      let fieldName = '';
      if (inputId === 'doc-ine') fieldName = 'doc_ine';
      if (inputId === 'doc-domicilio') fieldName = 'doc_comprobante_domicilio';
      if (inputId === 'doc-constancia') fieldName = 'doc_constancia_fiscal';
      const rawFilename = Array.isArray(client[fieldName]) ? client[fieldName][0] : client[fieldName];
      const rawStatus = String(estados?.[fieldName]?.status || '').trim().toLowerCase();
      if (rawFilename && (rawStatus === 'aprobado' || rawStatus === 'pendiente')) {
        if (input) {
          input.disabled = true;
          input.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (statusEl) {
          statusEl.classList.remove('hidden');
          statusEl.innerHTML = rawStatus === 'aprobado'
            ? '<i class="fa-solid fa-lock"></i> Bloqueado (Validado)'
            : '<i class="fa-solid fa-clock"></i> Bloqueado (En revisión)';
          statusEl.className = rawStatus === 'aprobado'
            ? 'text-[10px] text-emerald-600 font-bold mt-1'
            : 'text-[10px] text-orange-600 font-bold mt-1';
        }
      }
    }
  });

  const docsSection = document.getElementById('client-docs-section');
  if (docsSection) docsSection.classList.add('hidden');
  const chevron = document.getElementById('docs-chevron');
  if (chevron) chevron.style.transform = '';

  window.openModal?.('client-modal');
}

function closeClientModal() { window.closeModal?.('client-modal'); }

function confirmModal(text) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const txt = document.getElementById('confirm-text');
    const ok = document.getElementById('btn-confirm-ok');
    const cancel = document.getElementById('btn-confirm-cancel');

    if (!modal || !txt || !ok || !cancel) return resolve(false);

    txt.textContent = text || '¿Confirmar?';
    modal.style.zIndex = '9000';
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      ok.onclick = null;
      cancel.onclick = null;
    };

    ok.onclick = () => { cleanup(); resolve(true); };
    cancel.onclick = () => { cleanup(); resolve(false); };
  });
}

async function confirmDeleteClient(client) {
  if (!canManage && !canVerify) {
    window.showToast?.('No tienes permiso para eliminar clientes.', 'error');
    return;
  }
  const ok = await confirmModal(`¿Eliminar el cliente "${client?.nombre_completo || ''}"? Esta acción no se puede deshacer.`);
  if (!ok) return;

  try {
    const { error } = await window.tenantPocketBase.from('clientes').delete().eq('id', client.id);
    if (error) throw error;
    cpClientsSaveViewState({ selectedClientId: '' });
    window.showToast?.("Cliente eliminado", "success");
    await loadClients();
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudo eliminar el cliente.", "error");
  }
}

async function openClientStoredDocument(path) {
  if (!path) return window.showToast?.("Documento no disponible.", "error");
  try {
    const { data, error } = await window.globalPocketBase.storage.from('documentos-cp').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw (error || new Error('No se pudo firmar URL'));
    window.open(data.signedUrl, '_blank');
  } catch (e) {
    console.error(e);
    window.showToast?.("No se pudo abrir el documento.", "error");
  }
}

function getClientDocumentsBucket() {
  return CLIENT_TENANT_SLUG === 'casa_de_piedra' ? 'documentos-cp' : 'documentos';
}

function getFirstClientFileName(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function sanitizeZipSegment(value, fallback = 'archivo') {
  const clean = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return clean || fallback;
}

function basenameFromPath(value, fallback = 'archivo') {
  const raw = String(value || '').split('?')[0].split('#')[0].replace(/\\/g, '/');
  try {
    const path = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
    const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    return sanitizeZipSegment(name, fallback);
  } catch (_) {
    return sanitizeZipSegment(raw.split('/').filter(Boolean).pop() || fallback, fallback);
  }
}

function uniqueZipPath(path, used) {
  const clean = String(path || '').replace(/^\/+/, '');
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf('.');
  const base = dot > -1 ? clean.slice(0, dot) : clean;
  const ext = dot > -1 ? clean.slice(dot) : '';
  let index = 2;
  let next = `${base}_${index}${ext}`;
  while (used.has(next)) {
    index += 1;
    next = `${base}_${index}${ext}`;
  }
  used.add(next);
  return next;
}

function getClientZipCrcTable() {
  if (getClientZipCrcTable.table) return getClientZipCrcTable.table;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  getClientZipCrcTable.table = table;
  return table;
}

function crc32Zip(data) {
  const table = getClientZipCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i += 1) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipDosDateTime(dateValue = new Date()) {
  const d = dateValue instanceof Date && !Number.isNaN(dateValue.getTime()) ? dateValue : new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function concatZipParts(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function buildZipBlob(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.path);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || []);
    const crc = crc32Zip(data);
    const stamp = zipDosDateTime(entry.date || new Date());
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const centralOffset = offset;
  const centralData = concatZipParts(centralParts);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralData.length, true);
  ev.setUint32(16, centralOffset, true);
  return new Blob([concatZipParts(localParts), centralData, end], { type: 'application/zip' });
}

function addZipEntry(entries, usedPaths, path, data) {
  entries.push({
    path: uniqueZipPath(path, usedPaths),
    data: data instanceof Uint8Array ? data : new TextEncoder().encode(String(data || '')),
    date: new Date()
  });
}

async function fetchZipBytes(url) {
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function getStoredDocumentSignedUrl(path) {
  const raw = String(path || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  if (/^\/?(?:api\/files|storage\/v1\/object)\//i.test(raw)) return new URL(raw, window.location.origin).href;
  const bucketMatch = raw.match(/^(documentos(?:-cp)?)\/(.+)$/i);
  const bucket = bucketMatch ? bucketMatch[1] : getClientDocumentsBucket();
  const cleanPath = bucketMatch ? bucketMatch[2] : raw;
  const { data, error } = await window.globalPocketBase.storage.from(bucket).createSignedUrl(cleanPath, 3600);
  if (error || !data?.signedUrl) throw (error || new Error('No se pudo firmar URL'));
  return data.signedUrl;
}

async function addRemoteZipFile(entries, usedPaths, zipPath, url, failures) {
  try {
    const bytes = await fetchZipBytes(url);
    addZipEntry(entries, usedPaths, zipPath, bytes);
    return true;
  } catch (error) {
    failures.push({ path: zipPath, error: error?.message || String(error) });
    return false;
  }
}

function downloadClientBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'expediente.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }, 1500);
}

async function downloadProtectedClientZipBlob(client, zipBlob, filename) {
  const token = getAuthToken();
  if (!token) throw new Error('No se encontro una sesion valida para proteger el ZIP.');
  const formData = new FormData();
  formData.append('clientId', String(client?.id || '').trim());
  formData.append('filename', String(filename || '').trim());
  formData.append('archive', zipBlob, String(filename || 'expediente.zip').trim() || 'expediente.zip');

  const resp = await fetch(`${String(PB_URL || '').replace(/\/+$/, '')}/api/cotizador/protected-client-zip`, {
    method: 'POST',
    headers: {
      Authorization: token
    },
    body: formData,
    credentials: 'omit',
    cache: 'no-store'
  });

  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload?.message || payload?.error || `HTTP ${resp.status}`);
  }

  const blob = await resp.blob();
  const header = String(resp.headers.get('Content-Disposition') || '').trim();
  const match = header.match(/filename="?([^";]+)"?/i);
  const protectedName = String((match && match[1]) || filename || 'expediente.zip').trim();
  downloadClientBlob(blob, protectedName);
}

async function fetchClientQuoteRowsForZip(client) {
  const merged = new Map();
  const mergeRows = (arr = []) => arr.forEach(row => { if (row?.id) merged.set(row.id, row); });
  const queryBase = () => window.tenantPocketBase.from('cotizaciones').select(CLIENT_QUOTE_DOC_SELECT_FIELDS).order('created_at', { ascending: false }).limit(500);
  try {
    if (client?.id) {
      const byId = await queryBase().eq('cliente_id', client.id);
      if (!byId.error) mergeRows(byId.data || []);
    }
    if (client?.correo) {
      const byEmail = await queryBase().eq('cliente_email', client.correo);
      if (!byEmail.error) mergeRows(byEmail.data || []);
    }
    if (client?.nombre_completo) {
      const byName = await queryBase().eq('cliente_nombre', client.nombre_completo);
      if (!byName.error) mergeRows(byName.data || []);
    }
  } catch (error) {
    console.error(error);
  }
  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
}

function buildClientZipManifest(client, quotes, includeQuotes, failures) {
  return JSON.stringify({
    generado_en: window.__serverDateService.nowISO(),
    sede: CLIENT_TENANT_SLUG,
    cliente: {
      id: client?.id || '',
      nombre: client?.nombre_completo || '',
      rfc: client?.rfc || '',
      correo: client?.correo || '',
      telefono: client?.telefono || '',
      telefonos_adicionales: safeArray(client?.telefonos_adicionales),
      correos_adicionales: safeArray(client?.correos_adicionales)
    },
    incluye_documentos_cotizaciones: includeQuotes === true,
    cotizaciones_encontradas: includeQuotes ? (quotes || []).length : 0,
    archivos_no_incluidos: failures || []
  }, null, 2);
}

async function addClientPersonalFilesToZip(client, entries, usedPaths, failures) {
  for (const doc of CLIENT_DOC_REQUIREMENTS) {
    const filename = getFirstClientFileName(client?.[doc.field]);
    if (!filename) continue;
    if (!canAccessClientDocumentFile(client, doc.field)) {
      failures.push({ path: doc.label, error: 'Sin permiso para descargar este documento.' });
      continue;
    }
    const url = await getSignedFileUrl('clientes', client.id, filename);
    const folder = `informacion_personal/${sanitizeZipSegment(doc.label, doc.field)}`;
    await addRemoteZipFile(entries, usedPaths, `${folder}/${basenameFromPath(filename, doc.field)}`, url, failures);
  }
}

async function addClientDictamenFilesToZip(client, entries, usedPaths, failures) {
  const history = await fetchClientDictamenHistory(client?.id, 100);
  for (const row of history) {
    const fileName = getClientDictamenPdfFileName(row);
    const recordId = String(row?.id || '').trim();
    if (!recordId || !fileName) continue;
    const label = sanitizeZipSegment(row?.folio || fileName || 'dictamen', 'dictamen');
    const url = await getSignedFileUrl(CLIENT_DICTAMEN_COLLECTION, recordId, fileName);
    await addRemoteZipFile(entries, usedPaths, `informacion_personal/dictamenes/${label}_${basenameFromPath(fileName, 'dictamen.pdf')}`, url, failures);
  }
}

async function addClientQuoteFilesToZip(quotes, entries, usedPaths, failures) {
  for (const row of quotes) {
    const folio = sanitizeZipSegment(buildClientQuoteFolio(row) || row.id || 'cotizacion', 'cotizacion');
    const quoteFolder = `cotizaciones/${folio}`;
    for (const doc of CLIENT_QUOTE_DOC_FIELDS) {
      const filename = getFirstClientFileName(row?.[doc.field]);
      if (filename) {
        const url = await getSignedFileUrl('cotizaciones', row.id, filename);
        await addRemoteZipFile(entries, usedPaths, `${quoteFolder}/${sanitizeZipSegment(doc.label, doc.field)}_${basenameFromPath(filename, doc.fallback)}`, url, failures);
        continue;
      }
      const storedPath = String(row?.[doc.urlField] || '').trim();
      if (storedPath) {
        const zipPath = `${quoteFolder}/${sanitizeZipSegment(doc.label, doc.urlField)}_${basenameFromPath(storedPath, doc.fallback)}`;
        try {
          const signedUrl = await getStoredDocumentSignedUrl(storedPath);
          await addRemoteZipFile(entries, usedPaths, zipPath, signedUrl, failures);
        } catch (error) {
          failures.push({ path: zipPath, error: error?.message || String(error) });
        }
      }
    }
    const payments = safeArray(row.historial_pagos);
    payments.forEach((payment, index) => {
      payment.__zipIndex = index + 1;
    });
    for (const payment of payments) {
      const storedPath = String(payment?.file_path || payment?.path || payment?.url || '').trim();
      if (!storedPath) continue;
      const index = payment.__zipIndex || 1;
      const zipPath = `${quoteFolder}/recibos/recibo_${index}_${basenameFromPath(storedPath, 'recibo.pdf')}`;
      try {
        const signedUrl = await getStoredDocumentSignedUrl(storedPath);
        await addRemoteZipFile(entries, usedPaths, zipPath, signedUrl, failures);
      } catch (error) {
        failures.push({ path: zipPath, error: error?.message || String(error) });
      }
    }
  }
}

async function downloadClientExpedienteZip(client, options = {}) {
  if (!client?.id) return window.showToast?.('No se encontró el cliente para descargar expediente.', 'error');
  const includeQuotes = options.includeQuotes === true;
  const btn = options.button || null;
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparando ZIP';
  }
  const entries = [];
  const usedPaths = new Set();
  const failures = [];
  let quotes = [];
  try {
    await addClientPersonalFilesToZip(client, entries, usedPaths, failures);
    await addClientDictamenFilesToZip(client, entries, usedPaths, failures);
    if (includeQuotes) {
      quotes = await fetchClientQuoteRowsForZip(client);
      await addClientQuoteFilesToZip(quotes, entries, usedPaths, failures);
    }
    if (!entries.length) {
      window.showToast?.('No hay archivos disponibles para generar el ZIP del expediente.', 'info');
      return;
    }
    const zip = buildZipBlob(entries);
    const filename = `expediente_${sanitizeZipSegment(client.nombre_completo || client.id, 'cliente')}_${includeQuotes ? 'completo' : 'personal'}.zip`;
    await downloadProtectedClientZipBlob(client, zip, filename);
    const included = entries.length;
    const message = failures.length
      ? `ZIP protegido generado con ${included} archivo(s). ${failures.length} no se pudieron incluir. Contrasena: ID del cliente.`
      : `ZIP protegido generado con ${included} archivo(s). Contrasena: ID del cliente.`;
    window.showToast?.(message, failures.length ? 'info' : 'success');
  } catch (error) {
    console.error(error);
    window.showToast?.('No se pudo generar el ZIP del expediente.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function renderClientHistoryRows(rows) {
  const tbody = document.getElementById('client-history-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400 font-semibold">No hay cotizaciones vinculadas para este cliente.</td></tr>';
    return;
  }
  rows.forEach(o => {
    const folio = buildClientQuoteFolio(o);
    const qName = (o.nombre_cotizacion || o.detalles_evento?.nombre_cotizacion || '').trim();
    const dateLabel = (o.fecha_inicio && o.fecha_fin)
      ? (o.fecha_inicio === o.fecha_fin ? safeDate(o.fecha_inicio) : `${safeDate(o.fecha_inicio)} - ${safeDate(o.fecha_fin)}`)
      : '--';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.innerHTML = `
      <td class="p-3 font-black text-brand-dark">${folio}</td>
      <td class="p-3">
        <span class="font-bold text-gray-800 block">${qName || 'Sin nombre'}</span>
        <span class="text-[10px] text-gray-500 uppercase font-bold">${(o.status || 'pendiente')}</span>
      </td>
      <td class="p-3">
        <span class="font-bold text-gray-700 block">${o.espacio_nombre || '--'}</span>
        <span class="text-[10px] text-gray-500 font-mono">${dateLabel}</span>
      </td>
      <td class="p-3 text-right font-bold">${formatMoney(o.precio_final)}</td>
      <td class="p-3 text-center">
        <button class="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase">Expediente</button>
      </td>
    `;
    tr.querySelector('button')?.addEventListener('click', () => openClientQuoteDocs(o.id));
    tbody.appendChild(tr);
  });
}

function createQuoteDocButton(container, label, icon, action, muted=false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-stretch gap-2';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = muted
    ? 'flex-1 text-left px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 text-gray-400 flex items-center gap-3'
    : 'flex-1 text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm bg-white';
  btn.innerHTML = `<i class="${icon} text-brand-red w-4"></i><span class="text-xs font-bold">${label}</span>`;
  if (!muted) btn.addEventListener('click', action);
  wrapper.appendChild(btn);
  container.appendChild(wrapper);
}

async function openClientProfileDocs(client) {
  if (!client) return;
  const title = document.getElementById('qdocs-title');
  const sub = document.getElementById('qdocs-sub');
  const list = document.getElementById('client-quote-docs-list');
  if (!title || !sub || !list) return;

  const validation = getClientValidation(client);
  const documentMeta = getClientDocumentMeta(client);
  title.innerText = `Expediente de ${client.nombre_completo || 'cliente'}`;
  sub.innerText = `${getClientStatusMeta(client).label} • ${documentMeta.coveredCount}/${documentMeta.totalCount} requisitos cubiertos`;
  list.innerHTML = '';
  const profileDocsClientId = String(client.id || '');
  list.dataset.clientDocsClientId = profileDocsClientId;

  createQuoteDocButton(list, `ID del perfil: ${client.id || '--'}`, 'fa-solid fa-fingerprint', () => {}, true);
  if (buildClientPublicProfileUrl(client)) {
    createQuoteDocButton(list, 'Abrir expediente seguro', 'fa-solid fa-link', () => openClientPublicProfile(client));
  } else {
    createQuoteDocButton(list, 'Enlace publico no disponible', 'fa-solid fa-link', () => {}, true);
  }

  const zipPanel = document.createElement('div');
  zipPanel.className = 'rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 space-y-3';
  zipPanel.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[10px] font-black uppercase tracking-wide text-emerald-700">Descarga digital</p>
        <p class="mt-1 text-xs font-semibold text-emerald-900">Genera un ZIP con la información y documentos disponibles del cliente.</p>
      </div>
      <i class="fa-solid fa-file-zipper text-emerald-700 mt-1"></i>
    </div>
    <label class="flex items-center gap-2 text-xs font-bold text-emerald-900">
      <input id="client-expediente-zip-include-quotes" type="checkbox" class="h-4 w-4 accent-emerald-700">
      <span>Incluir documentos de cotizaciones</span>
    </label>
    <button id="btn-client-expediente-zip" type="button" class="w-full rounded-lg bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-800 transition">
      <i class="fa-solid fa-download"></i> Descargar todo
    </button>
  `;
  list.appendChild(zipPanel);
  zipPanel.querySelector('#btn-client-expediente-zip')?.addEventListener('click', (event) => {
    const includeQuotes = zipPanel.querySelector('#client-expediente-zip-include-quotes')?.checked === true;
    downloadClientExpedienteZip(client, { includeQuotes, button: event.currentTarget });
  });

  function clientHasFile(field) {
    const v = client?.[field];
    if (Array.isArray(v)) return v.filter(Boolean).length > 0;
    return !!String(v || '').trim();
  }

  function appendClientDocButton(field, readyLabel, missingLabel, icon, humanLabel) {
    const docMeta = getClientDocumentStateMeta(client, field);
    const reviewedSuffix = docMeta.reviewedByName
      ? ` · ${docMeta.status === 'aprobado' || docMeta.omitted ? 'Aprobo' : 'Reviso'}: ${docMeta.reviewedByName}`
      : '';
    if (clientHasFile(field) && canAccessClientDocumentFile(client, field)) {
      createQuoteDocButton(list, `${readyLabel}${reviewedSuffix}`, icon, () => openClientProfileFile(client, field, humanLabel));
      return;
    }
    if (clientHasFile(field) && !canAccessClientDocumentFile(client, field)) {
      createQuoteDocButton(list, `${readyLabel} · visible hasta aprobacion`, icon, () => {}, true);
      return;
    }
    createQuoteDocButton(list, missingLabel, icon, () => {}, true);
  }

  appendClientDocButton('doc_ine', 'Ver INE', 'INE pendiente', 'fa-solid fa-id-card', 'la INE');
  appendClientDocButton('doc_comprobante_domicilio', 'Ver Comprobante de Domicilio', 'Comprobante de domicilio pendiente', 'fa-solid fa-house-circle-check', 'el comprobante de domicilio');
  appendClientDocButton('doc_constancia_fiscal', 'Ver Constancia Fiscal', 'Constancia fiscal pendiente', 'fa-solid fa-file-shield', 'la constancia fiscal');

  const phones = safeArray(client.telefonos_adicionales).map(v => String(v || '').trim()).filter(Boolean);
  const constanciaStatus = getClientDocumentMeta(client).constanciaStatus;
  const constanciaValidationLabel = constanciaStatus.status === 'expired'
    ? 'Constancia fiscal vencida'
    : (constanciaStatus.status === 'missing' ? 'Constancia fiscal por revisar' : 'Constancia fiscal vigente');
  const divider = document.createElement('div');
  divider.className = 'text-[10px] font-black uppercase text-gray-400 px-1 pt-2';
  divider.innerText = 'Validacion';
  list.appendChild(divider);
  createQuoteDocButton(list, constanciaValidationLabel, 'fa-solid fa-calendar-check', () => {}, true);
  createQuoteDocButton(list, phones.length ? `Telefonos adicionales: ${phones.join(', ')}` : 'Sin telefonos adicionales registrados', 'fa-solid fa-phone-volume', () => {}, true);

  window.openModal?.('client-quote-docs-modal');

  const dictamenDivider = document.createElement('div');
  dictamenDivider.className = 'text-[10px] font-black uppercase text-gray-400 px-1 pt-4';
  dictamenDivider.innerText = 'Dictamenes guardados';
  list.appendChild(dictamenDivider);
  if (canVerify) {
    createQuoteDocButton(list, 'Generar dictamen PDF', 'fa-solid fa-file-circle-plus', () => openClientVerificationReport(client));
    createQuoteDocButton(list, 'Subir dictamen manual PDF', 'fa-solid fa-file-arrow-up', () => uploadManualClientDictamen(client));
  }

  const loadingRow = document.createElement('div');
  loadingRow.className = 'px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 text-gray-400 text-xs font-bold';
  loadingRow.innerText = 'Cargando historico de dictamenes...';
  list.appendChild(loadingRow);

  const history = await fetchClientDictamenHistory(client.id, 20);
  if (list.dataset.clientDocsClientId !== profileDocsClientId) return;
  loadingRow.remove();
  if (!history.length) {
    createQuoteDocButton(list, 'Sin dictamenes guardados', 'fa-regular fa-clock', () => {}, true);
    return;
  }
  history.forEach((row) => {
    const createdLabel = formatClientDictamenDateTime(getClientDictamenRecordDate(row));
    const actorLabel = String(row.responsable_nombre || safeObject(row.metadata).generated_by?.name || '').trim();
    const statusMeta = getClientDictamenStatusMeta(row);
    const label = `${row.folio || 'Dictamen'} · ${createdLabel}${actorLabel ? ` · ${actorLabel}` : ''}`;
    createQuoteDocButton(list, label, statusMeta.status === 'rechazado' ? 'fa-solid fa-file-circle-xmark' : 'fa-solid fa-file-pdf', () => openClientDictamenRecord(row));
  });
}


async function fetchLatestClientQuoteRow(quoteId) {
  const cols = CLIENT_QUOTE_DOC_SELECT_FIELDS;
  try {
    const { data, error } = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('id', quoteId).maybeSingle();
    if (!error && data) return data;
  } catch (_) {}
  return clientHistoryRows.find(x => x.id === quoteId) || null;
}

async function openClientQuoteDocs(quoteId) {
  const row = await fetchLatestClientQuoteRow(quoteId);
  if (!row) return window.showToast?.("No se encontró la cotización.", "error");
  const title = document.getElementById('qdocs-title');
  const sub = document.getElementById('qdocs-sub');
  const list = document.getElementById('client-quote-docs-list');
  if (!title || !sub || !list) return;
  const folio = buildClientQuoteFolio(row);
  title.innerText = `Expediente #${folio}`;
  sub.innerText = `${row.cliente_nombre || ''} • ${row.espacio_nombre || '--'}`;
  list.innerHTML = '';

  if (row.url_cotizacion_final) createQuoteDocButton(list, 'Ver Cotización Aprobada', 'fa-solid fa-file-circle-check', () => openClientStoredDocument(row.url_cotizacion_final));
  else createQuoteDocButton(list, 'Cotización aprobada no disponible', 'fa-solid fa-file-pen', () => {}, true);

  if (row.url_orden_compra) createQuoteDocButton(list, 'Ver Orden de Compra', 'fa-solid fa-file-contract', () => openClientStoredDocument(row.url_orden_compra));
  else createQuoteDocButton(list, 'Orden de compra no disponible', 'fa-solid fa-file-contract', () => {}, true);

  if (row.contrato_url) createQuoteDocButton(list, 'Ver Contrato', 'fa-solid fa-file-signature', () => openClientStoredDocument(row.contrato_url));
  else createQuoteDocButton(list, 'Contrato no disponible', 'fa-solid fa-signature', () => {}, true);

  if (row.factura_pdf_url) createQuoteDocButton(list, 'Ver Factura PDF', 'fa-solid fa-file-pdf', () => openClientStoredDocument(row.factura_pdf_url));
  else createQuoteDocButton(list, 'Factura PDF no disponible', 'fa-solid fa-file-invoice-dollar', () => {}, true);

  if (row.factura_xml_url) createQuoteDocButton(list, 'Descargar XML', 'fa-solid fa-file-code', () => openClientStoredDocument(row.factura_xml_url));

  const pagos = safeArray(row.historial_pagos);
  if (pagos.length) {
    const divider = document.createElement('div');
    divider.className = 'text-[10px] font-black uppercase text-gray-400 px-1 pt-2';
    divider.innerText = 'Recibos';
    list.appendChild(divider);
    pagos.forEach((p, i) => {
      const pth = p?.file_path || p?.path || '';
      if (pth) createQuoteDocButton(list, `Recibo #${i + 1}`, 'fa-solid fa-receipt', () => openClientStoredDocument(pth));
    });
  } else {
    createQuoteDocButton(list, 'Recibos no disponibles', 'fa-solid fa-receipt', () => {}, true);
  }

  createQuoteDocButton(list, 'Abrir en módulo de cotizaciones', 'fa-solid fa-arrow-up-right-from-square', () => {
    window.location.href = `orders.html?quote=${encodeURIComponent(row.id)}`;
  });

  window.openModal?.('client-quote-docs-modal');
}

async function openClientHistory(client) {
  activeHistoryClient = client;
  const nameEl = document.getElementById('history-client-name');
  const phoneEl = document.getElementById('history-client-phone');
  const emailEl = document.getElementById('history-client-email');
  const subEl = document.getElementById('history-client-sub');
  if (nameEl) nameEl.innerText = client?.nombre_completo || '--';
  if (phoneEl) phoneEl.innerText = client?.telefono || '--';
  if (emailEl) emailEl.innerText = client?.correo || '--';
  if (subEl) subEl.innerText = 'Cargando cotizaciones...';
  clientHistoryRows = [];
  renderClientHistoryRows([]);
  window.openModal?.('client-history-modal');

  const cols = CLIENT_QUOTE_DOC_SELECT_FIELDS;
  const merged = new Map();
  const mergeRows = (arr=[]) => arr.forEach(r => { if (r?.id) merged.set(r.id, r); });
  try {
    const qById = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_id', client.id).order('created_at', { ascending: false }).limit(20);
    if (!qById.error) mergeRows(qById.data || []);
    if (client?.correo) {
      const qByMail = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_email', client.correo).order('created_at', { ascending: false }).limit(20);
      if (!qByMail.error) mergeRows(qByMail.data || []);
    }
    if (client?.nombre_completo) {
      const qByName = await window.tenantPocketBase.from('cotizaciones').select(cols).eq('cliente_nombre', client.nombre_completo).order('created_at', { ascending: false }).limit(20);
      if (!qByName.error) mergeRows(qByName.data || []);
    }
    clientHistoryRows = Array.from(merged.values()).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    renderClientHistoryRows(clientHistoryRows);
    if (subEl) subEl.innerText = `${clientHistoryRows.length} cotización(es) encontrada(s).`;
  } catch (e) {
    console.error(e);
    if (subEl) subEl.innerText = 'No se pudo cargar historial.';
    window.showToast?.("No se pudo cargar historial de cotizaciones.", "error");
  }
}

async function saveClient() {
  const id = (document.getElementById('client-id')?.value || '').trim();
  const isCreate = !id;
  if (isCreate && !canCreate) return window.showToast?.("Solo Alta Clientes o Admin pueden crear clientes nuevos.", "error");
  if (!isCreate && !canManage) return window.showToast?.("No tienes permisos para administrar clientes.", "error");
  const nombre = (document.getElementById('client-name')?.value || '').trim();
  const telefono = (document.getElementById('client-phone')?.value || '').replace(/\D/g,'').trim();
  const correo = (document.getElementById('client-email')?.value || '').trim();
  const rfc = (document.getElementById('client-rfc')?.value || '').trim().toUpperCase();

  if (!nombre) return window.showToast?.("Falta el nombre completo.", "error");

  if (telefono && telefono.length !== 10) {
    return window.showToast?.("El teléfono debe tener 10 dígitos.", "error");
  }

  if (correo) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) return window.showToast?.("Correo inválido.", "error");
  }

  const docIne = document.getElementById('doc-ine')?.files?.[0] || null;
  const docDomicilio = document.getElementById('doc-domicilio')?.files?.[0] || null;
  const docConstancia = document.getElementById('doc-constancia')?.files?.[0] || null;
  const hasFiles = !!(docIne || docDomicilio || docConstancia);

  try {
    const btn = document.getElementById('btn-save-client');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

    if (hasFiles) {
      const token = getAuthToken();
      const apiBase = String(PB_URL || '').replace(/\/+$/, '');
      const formData = new FormData();
      formData.append('nombre_completo', nombre);
      if (telefono) formData.append('telefono', telefono);
      if (correo) formData.append('correo', correo);
      if (rfc) formData.append('rfc', rfc);
      if (!id) formData.append('tenant', CLIENT_TENANT_SLUG);
      if (docIne) formData.append('doc_ine', docIne);
      if (docDomicilio) formData.append('doc_comprobante_domicilio', docDomicilio);
      if (docConstancia) formData.append('doc_constancia_fiscal', docConstancia);

      const method = id ? 'PATCH' : 'POST';
      const url = id
        ? `${apiBase}/api/collections/clientes/records/${encodeURIComponent(id)}`
        : `${apiBase}/api/collections/clientes/records`;
      const resp = await fetch(url, {
        method,
        headers: token ? { Authorization: token } : {},
        body: formData,
        credentials: 'omit',
        cache: 'no-store'
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.message || 'No se pudo guardar el cliente.');
      cpClientsSaveViewState({ selectedClientId: id || String(data?.id || '') });
      window.showToast?.(id ? 'Cliente actualizado con documentos' : 'Cliente creado con documentos', 'success');
    } else {
      const payload = {
        nombre_completo: nombre,
        telefono: telefono || '',
        correo: correo || '',
        rfc: rfc || ''
      };
      if (id) {
        const { error } = await window.tenantPocketBase.from('clientes').update(payload).eq('id', id);
        if (error) throw error;
        cpClientsSaveViewState({ selectedClientId: id });
        window.showToast?.("Cliente actualizado", "success");
      } else {
        const { error } = await window.tenantPocketBase.from('clientes').insert({ ...payload, tenant: CLIENT_TENANT_SLUG });
        if (error) throw error;
        cpClientsSaveViewState({ selectedClientId: '' });
        window.showToast?.("Cliente creado", "success");
      }
    }

    closeClientModal();
    await loadClients();
  } catch (e) {
    console.error(e);
    window.showToast?.(e?.message || "No se pudo guardar el cliente.", "error");
  } finally {
    const btn = document.getElementById('btn-save-client');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar'; }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
    try { await window.__HUB_LAYOUT_READY; } catch (_) {}
  }
  if (window.__HUB_PAGE_ACCESS_DENIED) return;
  if (!window.PB_CLIENT) return;

  if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
  if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);

  const authCtx = window.HUB_SESSION?.ensureAuth
    ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
    : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
  const session = authCtx?.session || null;
  if (!session?.user) {
    window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
    return;
  }

  const accessCtx = await fetchClientAccessContext(session.user);
  const role = accessCtx.role;
  const perms = accessCtx.perms || {};
  currentClientRole = role;
  adminVerifierMode = false;
  installVerifierTenantNavigation();
  canManage = accessCtx.canManage === true;
  canCreate = accessCtx.canCreate === true;
  canVerify = accessCtx.canVerify === true;
  canSeeAllDocuments = accessCtx.canSeeAllDocuments === true;
  renderAdminVerifierModeBox();
  try {
    const params = new URLSearchParams(window.location.search || '');
    pendingVerificationClientId = String(params.get('verify') || '').trim();
  } catch (_) {
    pendingVerificationClientId = '';
  }

  if (!accessCtx.canView) {
    window.showToast?.('No tienes permisos para acceder a Clientes.', 'error');
    return;
  }

// Nav hide (RBAC estricto: sin permiso explicito, se oculta)
  const isAdminAccess = window.HUB_RBAC?.isAdmin ? window.HUB_RBAC.isAdmin() : (window.__HUB_AUTH_CONTEXT?.isAdmin === true);
  if (!isAdminAccess) {
    const ordersFallback = ('orders_view' in perms) ? !!perms.orders_view : false;
    const navRules = {
      'catalog.html': ('catalog_view' in perms) ? !!perms.catalog_view : false,
      'agenda.html': ordersFallback,
      'contracts.html': ('contracts_view' in perms) ? !!perms.contracts_view : ordersFallback,
      'receipts.html': ('receipts_view' in perms) ? !!perms.receipts_view : ordersFallback,
      'invoices.html': ('invoices_view' in perms) ? !!perms.invoices_view : ordersFallback,
      'orders.html': ordersFallback,
      'cotizacion.html': ordersFallback,
      'reports.html': ('reports_view' in perms) ? !!perms.reports_view : false,
      'clientes.html': (('clients_view' in perms) || ('clients_manage' in perms) || ('clients_verify' in perms) || ('clients_create' in perms))
        ? (!!perms.clients_view || !!perms.clients_manage || !!perms.clients_verify || !!perms.clients_create)
        : false
    };
    Object.keys(navRules).forEach(page => {
      if (!navRules[page]) {
        const link = document.querySelector(`a[href="${page}"]`);
        if (link) link.classList.add('hidden');
      }
    });
  }

  // UI permissions
  const btnNew = document.getElementById('btn-new-client');
  if (btnNew) {
    if (!canCreate) btnNew.classList.add('hidden');
    btnNew.addEventListener('click', () => openClientModal(null));
  }

  const btnToggleDocs = document.getElementById('btn-toggle-docs');
  if (btnToggleDocs) {
    btnToggleDocs.addEventListener('click', () => {
      const section = document.getElementById('client-docs-section');
      const chevron = document.getElementById('docs-chevron');
      if (!section) return;
      const isHidden = section.classList.toggle('hidden');
      if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(180deg)';
    });
  }

  const btnPublic = document.getElementById('btn-public-profile');
  if (btnPublic) {
    btnPublic.addEventListener('click', () => {
      const url = new URL('../public/perfil_cliente.html', window.location.href).toString();
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  bindClientInfoModal();
  cpClientsApplyViewStateControls();
  document.getElementById('clients-search')?.addEventListener('input', applySearch);
  document.getElementById('btn-save-client')?.addEventListener('click', saveClient);

  await loadClients();
});

let verifCurrentClient = null;
let verifCurrentDocField = null;
let verifCurrentDocUploaded = false;
let verifCurrentDictamenRecord = null;

function getVerificationDocState(client, field, documents = safeObject(getClientValidation(client).documents)) {
  const estados = safeObject(client?.documentos_estado);
  const docState = safeObject(estados[field]);
  const validationState = safeObject(documents[field]);
  const rawFilename = Array.isArray(client?.[field]) ? client[field][0] : client?.[field];
  const fileName = String(rawFilename || validationState.fileName || '').trim();
  const uploaded = !!fileName;
  const omittedAllowed = canClientDocumentBeOmitted(field);
  const omitted = omittedAllowed && isDocumentOmitted(docState, validationState);
  let status = String(docState.status || validationState.estado || 'pendiente').trim().toLowerCase();
  if (!omittedAllowed && status === 'omitido') status = 'pendiente';
  if (omitted) status = 'omitido';
  const reason = String(docState.motivo || validationState.motivo || '').trim();
  const refreshMeta = getDocumentRefreshMeta(docState, validationState);
  return { docState, validationState, fileName, uploaded, omitted, status, reason, ...refreshMeta };
}

function setVerificationButtonState(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.classList.toggle('opacity-50', !enabled);
  button.classList.toggle('cursor-not-allowed', !enabled);
}

const CLIENT_DICTAMEN_COLLECTION = 'clientes_dictamenes';
const CLIENT_DICTAMEN_OVERLAY_TYPE = 'generator:dictamenes';
const CLIENT_DICTAMEN_FONT_MAP = Object.freeze({
  segoe: '"Segoe UI", Arial, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const CLIENT_DICTAMEN_STYLE_DEFAULTS = Object.freeze({
  fontFamilyKey: 'segoe',
  orientation: 'landscape',
  titlePx: 30,
  metaPx: 13,
  tableHeadPx: 11,
  tableBodyPx: 12,
  lineHeightPct: 120,
  quickPx: 12,
  conditionsPx: 13,
  footerPx: 10,
  offsetXPx: 0,
  offsetYPx: 0,
  extraPages: 0,
  resources: [],
  headerAlign: 'left',
  metaAlign: 'left',
  tableAlign: 'left',
  quickAlign: 'left',
  conditionsAlign: 'justify',
  footerAlign: 'center',
  content: {
    dictamenTitle: 'DICTAMEN LEGAL DOCUMENTOS PROTOCOLIZADOS',
    dictamenNotes: 'EL QUE SUSCRIBE DA CERTEZA DE QUE LOS DATOS ASENTADOS CORRESPONDEN A DOCUMENTOS NOTARIADOS QUE SE TUVIERON A LA VISTA EN COPIA SIMPLE, LOS CUALES SE ENCUENTRAN VIGENTES A LA FECHA DE LA EMISION DEL PRESENTE DICTAMEN Y TIENEN VALIDEZ.',
    dictamenSigner: '{{CURRENT_USER_NAME}}',
    annexHintTitle: 'Anexos del Dictamen',
    annexHintBody: 'Información complementaria relevante para la validación del expediente.'
  }
});

function clampClientDictamenNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeClientDictamenAlign(value, fallback = 'left') {
  const safe = String(value || '').toLowerCase();
  return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function normalizeClientDictamenHex(value, fallback) {
  const raw = String(value || '').trim();
  const candidate = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

function normalizeClientDictamenOrientation(value) {
  return String(value || '').toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
}

function getClientDictamenPageSize(style = {}) {
  const orientation = normalizeClientDictamenOrientation(style.orientation);
  return orientation === 'portrait'
    ? { width: 816, height: 1056, orientation }
    : { width: 1056, height: 816, orientation };
}

function getClientDictamenBrandColor() {
  return CLIENT_TENANT_SLUG === 'casa_de_piedra' ? '#c1621e' : '#d32f2f';
}

function normalizeClientDictamenPdfResources(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const accent = getClientDictamenBrandColor();
  return list.slice(0, 120).map((item, index) => {
    const base = item && typeof item === 'object' ? item : {};
    const type = ['bar', 'title', 'text'].includes(String(base.type || '').toLowerCase())
      ? String(base.type).toLowerCase()
      : 'text';
    return {
      id: String(base.id || `dictamen_res_${Date.now()}_${index}`),
      type,
      enabled: base.enabled !== false,
      page: clampClientDictamenNumber(base.page, 1, 8, 1),
      x: clampClientDictamenNumber(base.x, -220, 920, 88),
      y: clampClientDictamenNumber(base.y, -220, 1420, 120),
      w: clampClientDictamenNumber(base.w, 16, 940, type === 'bar' ? 260 : 290),
      h: clampClientDictamenNumber(base.h, 10, 1240, type === 'bar' ? 14 : 44),
      text: String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 1200),
      fontSize: clampClientDictamenNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
      bold: base.bold !== false,
      locked: base.locked === true,
      align: normalizeClientDictamenAlign(base.align, 'left'),
      color: normalizeClientDictamenHex(base.color, '#111827'),
      bgColor: normalizeClientDictamenHex(base.bgColor, type === 'bar' ? accent : '#ffffff')
    };
  });
}

function normalizeClientDictamenPdfContent(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const defaults = CLIENT_DICTAMEN_STYLE_DEFAULTS.content;
  return {
    dictamenTitle: String(base.dictamenTitle ?? defaults.dictamenTitle).slice(0, 120),
    dictamenNotes: String(base.dictamenNotes ?? defaults.dictamenNotes).slice(0, 2000),
    dictamenSigner: String(base.dictamenSigner ?? defaults.dictamenSigner).slice(0, 160),
    annexHintTitle: String(base.annexHintTitle ?? defaults.annexHintTitle).slice(0, 120),
    annexHintBody: String(base.annexHintBody ?? defaults.annexHintBody).slice(0, 900)
  };
}

function normalizeClientDictamenPdfStyle(raw = {}) {
  const base = { ...CLIENT_DICTAMEN_STYLE_DEFAULTS, ...(raw || {}) };
  const fontKey = String(base.fontFamilyKey || '').toLowerCase();
  return {
    fontFamilyKey: CLIENT_DICTAMEN_FONT_MAP[fontKey] ? fontKey : CLIENT_DICTAMEN_STYLE_DEFAULTS.fontFamilyKey,
    orientation: normalizeClientDictamenOrientation(base.orientation || CLIENT_DICTAMEN_STYLE_DEFAULTS.orientation),
    titlePx: clampClientDictamenNumber(base.titlePx, 20, 42, CLIENT_DICTAMEN_STYLE_DEFAULTS.titlePx),
    metaPx: clampClientDictamenNumber(base.metaPx, 8, 18, CLIENT_DICTAMEN_STYLE_DEFAULTS.metaPx),
    tableHeadPx: clampClientDictamenNumber(base.tableHeadPx, 9, 18, CLIENT_DICTAMEN_STYLE_DEFAULTS.tableHeadPx),
    tableBodyPx: clampClientDictamenNumber(base.tableBodyPx, 9, 16, CLIENT_DICTAMEN_STYLE_DEFAULTS.tableBodyPx),
    lineHeightPct: clampClientDictamenNumber(base.lineHeightPct, 90, 180, CLIENT_DICTAMEN_STYLE_DEFAULTS.lineHeightPct),
    quickPx: clampClientDictamenNumber(base.quickPx, 9, 16, CLIENT_DICTAMEN_STYLE_DEFAULTS.quickPx),
    conditionsPx: clampClientDictamenNumber(base.conditionsPx, 9, 18, CLIENT_DICTAMEN_STYLE_DEFAULTS.conditionsPx),
    footerPx: clampClientDictamenNumber(base.footerPx, 8, 14, CLIENT_DICTAMEN_STYLE_DEFAULTS.footerPx),
    offsetXPx: clampClientDictamenNumber(base.offsetXPx, -120, 120, CLIENT_DICTAMEN_STYLE_DEFAULTS.offsetXPx),
    offsetYPx: clampClientDictamenNumber(base.offsetYPx, -120, 120, CLIENT_DICTAMEN_STYLE_DEFAULTS.offsetYPx),
    extraPages: clampClientDictamenNumber(base.extraPages, -1, 6, CLIENT_DICTAMEN_STYLE_DEFAULTS.extraPages),
    resources: normalizeClientDictamenPdfResources(base.resources),
    headerAlign: normalizeClientDictamenAlign(base.headerAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.headerAlign),
    metaAlign: normalizeClientDictamenAlign(base.metaAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.metaAlign),
    tableAlign: normalizeClientDictamenAlign(base.tableAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.tableAlign),
    quickAlign: normalizeClientDictamenAlign(base.quickAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.quickAlign),
    conditionsAlign: normalizeClientDictamenAlign(base.conditionsAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.conditionsAlign),
    footerAlign: normalizeClientDictamenAlign(base.footerAlign, CLIENT_DICTAMEN_STYLE_DEFAULTS.footerAlign),
    content: normalizeClientDictamenPdfContent(base.content)
  };
}

function pickLatestClientDictamenRecord(rows) {
  const list = Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') : [];
  if (!list.length) return null;
  list.sort((a, b) => {
    const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
    const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
    return bTs - aTs;
  });
  return list[0] || null;
}

async function loadClientDictamenPdfStyle() {
  const clients = [];
  if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
  if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
  for (const pbClient of clients) {
    try {
      const { data, error } = await pbClient
        .from('pdf_overlays')
        .select('id,config_json,elements,updated,created,updated_at,created_at')
        .eq('tenant', CLIENT_TENANT_SLUG)
        .eq('document_type', CLIENT_DICTAMEN_OVERLAY_TYPE);
      if (error) throw error;
      const row = pickLatestClientDictamenRecord(Array.isArray(data) ? data : (data ? [data] : []));
      if (!row) continue;
      const config = safeObject(row.config_json || row.elements);
      const profiles = safeObject(config.profiles);
      return normalizeClientDictamenPdfStyle(profiles.dictamen || config);
    } catch (_) {}
  }
  return normalizeClientDictamenPdfStyle();
}

function canSaveClientDictamenTemplate() {
  const auth = window.__HUB_AUTH_CONTEXT || {};
  const perms = (auth.permissions && typeof auth.permissions === 'object') ? auth.permissions : {};
  return auth.isAdmin === true || perms.pdf_layout_manage === true || perms.config_manage === true;
}

async function saveClientDictamenPdfStyle(style) {
  if (!window.tenantPocketBase) throw new Error('PocketBase no disponible.');
  const normalized = normalizeClientDictamenPdfStyle(style || {});
  const { data, error } = await window.tenantPocketBase
    .from('pdf_overlays')
    .select('id,config_json,elements,updated,created,updated_at,created_at')
    .eq('tenant', CLIENT_TENANT_SLUG)
    .eq('document_type', CLIENT_DICTAMEN_OVERLAY_TYPE)
    .limit(20);
  if (error) throw error;

  const row = pickLatestClientDictamenRecord(Array.isArray(data) ? data : (data ? [data] : []));
  const config = safeObject(row?.config_json || row?.elements);
  const profiles = safeObject(config.profiles);
  const nextConfig = {
    ...config,
    profiles: { ...profiles, dictamen: normalized },
    updated_at: window.__serverDateService.nowISO()
  };
  if (row?.id) {
    const { error: updateError } = await window.tenantPocketBase
      .from('pdf_overlays')
      .update({ config_json: nextConfig, elements: nextConfig })
      .eq('id', row.id);
    if (updateError) throw updateError;
    return;
  }
  const { error: insertError } = await window.tenantPocketBase
    .from('pdf_overlays')
    .insert({
      tenant: CLIENT_TENANT_SLUG,
      document_type: CLIENT_DICTAMEN_OVERLAY_TYPE,
      config_json: nextConfig,
      elements: nextConfig
    });
  if (insertError) throw insertError;
}

function resolveClientDictamenTemplateString(value, context = {}) {
  let output = String(value ?? '');
  Object.entries(context && typeof context === 'object' ? context : {}).forEach(([key, resolvedValue]) => {
    const token = String(key || '').trim();
    if (!token) return;
    const pattern = new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
    output = output.replace(pattern, String(resolvedValue ?? ''));
  });
  return output;
}

function getClientDictamenActorMeta() {
  const auth = window.__HUB_AUTH_CONTEXT || {};
  const user = auth.session?.user || auth.user || auth.profile || {};
  const email = String(user.email || auth.email || '').trim();
  const name = String(auth.profile?.login_username || auth.profile?.username || user.login_username || user.username || '').trim()
    || (email ? email.split('@')[0] : '')
    || 'Usuario';
  return {
    id: String(user.id || auth.profile?.id || '').trim(),
    name,
    email,
    role: String(auth.role || auth.profile?.role || user.role || currentClientRole || '').trim()
  };
}

function buildClientDictamenTemplateContext(client, folio, title) {
  const actor = getClientDictamenActorMeta();
  return {
    CLIENT_NAME: client?.nombre_completo || '',
    CLIENT_EMAIL: client?.correo || '',
    CLIENT_PHONE: client?.telefono || '',
    CLIENT_RFC: client?.rfc || '',
    FOLIO: folio || '',
    DOC_TITLE: title || 'DICTAMEN LEGAL DOCUMENTOS PROTOCOLIZADOS',
    TODAY: window.__serverDateService.todayLocale('es-MX'),
    CURRENT_USER_NAME: actor.name,
    CURRENT_USER_EMAIL: actor.email,
    GENERATED_BY: actor.name,
    APPROVER_NAME: actor.name,
    VENUE_NAME: getClientDictamenTenantLabel()
  };
}

function getClientDictamenYear() {
  return window.__serverDateService.nowDate().getFullYear();
}

function getClientDictamenYearSuffix(year = getClientDictamenYear()) {
  return String(year).slice(-2).padStart(2, '0');
}

function getClientDictamenStableNumber(seed, min = 1, span = 999) {
  const raw = String(seed || '').trim() || `${CLIENT_TENANT_SLUG}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return min + (Math.abs(hash) % span);
}

function getClientDictamenLegalMeta(client) {
  const validation = safeObject(client?.expediente_validacion);
  return safeObject(
    validation.dictamenJuridico ||
    validation.dictamen_juridico ||
    validation.legalDictamen ||
    validation.legal_dictamen ||
    client?.dictamen_juridico
  );
}

function getClientDictamenExternalCaseNumber(client) {
  const legal = getClientDictamenLegalMeta(client);
  const candidates = [
    legal.numeroExpediente,
    legal.numero_expediente,
    legal.caseNumber,
    legal.case_number,
    legal.idExterno,
    legal.id_externo,
    legal.referencia,
    legal.reference
  ];
  const explicit = candidates.map(value => String(value || '').replace(/[^\d]/g, '')).find(Boolean);
  if (explicit) return explicit;
  return String(getClientDictamenStableNumber(`${CLIENT_TENANT_SLUG}|${client?.id}|${client?.created_at || client?.created || ''}`, 10000, 90000));
}

function parseClientDictamenFolioSequence(folio, year = getClientDictamenYear()) {
  const match = String(folio || '').trim().toUpperCase().match(new RegExp(`^DF${getClientDictamenYearSuffix(year)}(\\d+)$`));
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function buildNextClientDictamenFolio(client, year = getClientDictamenYear()) {
  if (!window.tenantPocketBase) return buildClientDictamenFolio(client, year);
  const start = `${year}-01-01 00:00:00.000Z`;
  const end = `${year + 1}-01-01 00:00:00.000Z`;
  try {
    const { data, error } = await window.tenantPocketBase
      .from(CLIENT_DICTAMEN_COLLECTION)
      .select('folio,metadata')
      .gte('metadata.generated_at', start)
      .lt('metadata.generated_at', end)
      .limit(500);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const maxSequence = rows.reduce((max, row) => Math.max(max, parseClientDictamenFolioSequence(row?.folio, year)), 0);
    return `DF${getClientDictamenYearSuffix(year)}${String(maxSequence + 1).padStart(3, '0')}`;
  } catch (_) {
    return buildClientDictamenFolio(client, year);
  }
}

function buildClientDictamenFileName(client, folio, year = getClientDictamenYear()) {
  const tenantCode = getClientDictamenTenantCode();
  const caseNumber = getClientDictamenExternalCaseNumber(client);
  return `${String(folio || buildClientDictamenFolio(client, year)).toUpperCase()} DICTAMEN JURIDICO ${tenantCode} ${year} #${caseNumber}.pdf`;
}

function renderClientDictamenPdfResources(style, pageIndex, templateContext = {}) {
  const cfg = normalizeClientDictamenPdfStyle(style || {});
  const fontFamily = CLIENT_DICTAMEN_FONT_MAP[cfg.fontFamilyKey] || CLIENT_DICTAMEN_FONT_MAP.segoe;
  return cfg.resources
    .filter(resource => resource.enabled && resource.page === pageIndex)
    .map((resource) => {
      const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:none;`;
      if (resource.type === 'bar') {
        return `<div class="dictamen-render-resource" data-dictamen-resource-id="${escapeHTML(resource.id)}" style="${common}background:${resource.bgColor};border-radius:2px;"></div>`;
      }
      const text = resolveClientDictamenTemplateString(resource.text || '', templateContext);
      return `<div class="dictamen-render-resource" data-dictamen-resource-id="${escapeHTML(resource.id)}" style="${common}background:${resource.bgColor};color:${resource.color};font-family:${fontFamily};font-size:${resource.fontSize}px;font-weight:${resource.bold ? 800 : 500};line-height:1.2;text-align:${resource.align};padding:4px 6px;white-space:pre-wrap;overflow:hidden;border-radius:2px;">${escapeHTML(text)}</div>`;
    }).join('');
}

function buildClientDictamenExtraPages(style, templateContext = {}) {
  const cfg = normalizeClientDictamenPdfStyle(style || {});
  const count = Math.max(0, cfg.extraPages);
  if (!count) return '';
  const content = cfg.content || {};
  const title = escapeHTML(resolveClientDictamenTemplateString(content.annexHintTitle || 'Anexos del Dictamen', templateContext));
  const body = escapeHTML(resolveClientDictamenTemplateString(content.annexHintBody || '', templateContext)).replace(/\r?\n/g, '<br>');
  return Array.from({ length: count }).map((_, index) => {
    const pageIndex = index + 2;
    return `<section class="dictamen-pdf-page dictamen-extra-page">
      ${renderClientDictamenPdfResources(cfg, pageIndex, templateContext)}
      <div class="dictamen-content">
        <span class="pill">Anexo ${pageIndex - 1}</span>
        <h2>${title}</h2>
        <p class="dictamen-annex">${body || 'Sin información complementaria capturada.'}</p>
      </div>
    </section>`;
  }).join('');
}

function getClientDictamenPdfFileName(record = {}) {
  const raw = record?.pdf;
  return Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
}

async function fetchClientDictamenHistory(clientId, limit = 10) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId || !window.tenantPocketBase) return [];
  try {
    const { data, error } = await window.tenantPocketBase
      .from(CLIENT_DICTAMEN_COLLECTION)
      .select('id,tenant,cliente,folio,documentos_hash,responsable_nombre,pdf,metadata,created,created_at,updated,updated_at')
      .eq('cliente', safeClientId)
      .order('metadata.generated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : (data ? [data] : []);
  } catch (e) {
    console.warn('No se pudo cargar historico de dictamenes:', e);
    return [];
  }
}

function getClientDictamenMeta(record) {
  return safeObject(record?.metadata);
}

function getClientDictamenSource(record) {
  const meta = getClientDictamenMeta(record);
  const raw = String(meta.source || (meta.generated_by ? 'generated' : '')).trim().toLowerCase();
  if (raw === 'manual_upload' || raw === 'manual') return 'manual_upload';
  if (raw === 'control') return 'control';
  return 'generated';
}

function getClientDictamenApprovalStatus(record) {
  const meta = getClientDictamenMeta(record);
  const source = getClientDictamenSource(record);
  const rawStatus = String(meta.approval_status || meta.status || '').trim().toLowerCase();
  if (meta.approved === true || rawStatus === 'aprobado' || rawStatus === 'auto_aprobado') return 'aprobado';
  if (rawStatus === 'rechazado' || meta.rejected === true) return 'rechazado';
  if (source !== 'manual_upload' && !rawStatus) return 'aprobado';
  return 'pendiente';
}

function getClientDictamenStatusMeta(record) {
  const source = getClientDictamenSource(record);
  const status = getClientDictamenApprovalStatus(record);
  if (status === 'aprobado') {
    return {
      status,
      icon: 'fa-solid fa-circle-check',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      label: source === 'manual_upload' ? 'Manual aprobado' : 'Aprobado',
      sourceLabel: source === 'manual_upload' ? 'Manual' : 'Plataforma'
    };
  }
  if (status === 'rechazado') {
    return {
      status,
      icon: 'fa-solid fa-circle-xmark',
      badgeClass: 'bg-red-100 text-red-700',
      label: 'Rechazado',
      sourceLabel: source === 'manual_upload' ? 'Manual' : 'Plataforma'
    };
  }
  return {
    status,
    icon: 'fa-solid fa-clock',
    badgeClass: 'bg-amber-100 text-amber-700',
    label: source === 'manual_upload' ? 'Pendiente de validar' : 'Pendiente',
    sourceLabel: source === 'manual_upload' ? 'Manual' : 'Plataforma'
  };
}

function isVerificationDictamenField(field='') {
  return String(field || '').startsWith('__dictamen__:');
}

function getVerificationDictamenId(field='') {
  return isVerificationDictamenField(field) ? String(field).slice('__dictamen__:'.length).trim() : '';
}

async function openClientDictamenRecord(record) {
  const fileName = getClientDictamenPdfFileName(record);
  const recordId = String(record?.id || '').trim();
  if (!recordId || !fileName) return window.showToast?.('Dictamen no disponible.', 'error');
  const url = await getSignedFileUrl(CLIENT_DICTAMEN_COLLECTION, recordId, fileName);
  if (!url) return window.showToast?.('No se pudo abrir el dictamen.', 'error');
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildClientDictamenDocumentSnapshot(client) {
  const validation = safeObject(getClientValidation(client));
  const documents = safeObject(validation.documents);
  const states = safeObject(client?.documentos_estado);
  return CLIENT_DOC_REQUIREMENTS.map((item) => {
    const docInfo = getVerificationDocState(client, item.field, documents);
    const reviewMeta = getClientDocumentStateMeta(client, item.field);
    const state = safeObject(states[item.field]);
    return {
      field: item.field,
      label: item.label,
      fileName: docInfo.fileName || '',
      uploaded: docInfo.uploaded === true,
      status: docInfo.status || '',
      omitted: docInfo.omitted === true,
      reason: docInfo.reason || '',
      validityDate: item.dateField ? getClientDocumentValidityReferenceDate(client, item.field) : '',
      reviewedByName: reviewMeta.reviewedByName || '',
      reviewedAt: reviewMeta.reviewedAt || '',
      updatedAt: String(state.actualizado_at || '').trim(),
      updatedFromRejection: state.actualizado_desde_rechazo === true
    };
  });
}

function stableClientDictamenStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableClientDictamenStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableClientDictamenStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashClientDictamenSnapshot(snapshot) {
  const raw = stableClientDictamenStringify(snapshot);
  try {
    if (window.crypto?.subtle && window.TextEncoder) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return `fallback-${Math.abs(hash)}`;
}

async function renderClientDictamenPdfBlob(reportHtml, filename) {
  if (!window.html2pdf) throw new Error('html2pdf no está disponible.');
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  host.innerHTML = reportHtml;
  document.body.appendChild(host);
  try {
    const target = host.querySelector('.dictamen-pdf-root') || host;
    const orientation = normalizeClientDictamenOrientation(target?.dataset?.orientation || 'landscape');
    host.style.width = orientation === 'portrait' ? '816px' : '1056px';
    await new Promise(resolve => setTimeout(resolve, 250));
    const baseOptions = {
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
      jsPDF: { unit: 'in', format: 'letter', orientation },
      pagebreak: { mode: ['css', 'legacy'] }
    };
    let blob = await window.html2pdf().set(baseOptions).from(target).output('blob');
    if (!blob || blob.size < 4096) {
      blob = await window.html2pdf().set({
        ...baseOptions,
        html2canvas: { ...(baseOptions.html2canvas || {}), scale: 2.5 }
      }).from(target).output('blob');
    }
    if (!blob || blob.size < 4096) throw new Error('No se pudo generar el PDF correctamente.');
    return blob;
  } finally {
    host.remove();
  }
}

function downloadClientDictamenBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'dictamen.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (_) {}
  }, 1500);
}

async function forceClientValidationRefresh(client) {
  const clientId = String(client?.id || '').trim();
  if (!clientId || !window.tenantPocketBase) return null;
  const docStates = safeObject(client?.documentos_estado);
  const { data, error } = await window.tenantPocketBase
    .from('clientes')
    .update({ documentos_estado: docStates })
    .eq('id', clientId);
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

async function persistClientDictamenSnapshot(client, folio, blob, filename, documentSnapshot) {
  if (!canVerify || !client?.id || !blob) return { saved: false, reason: 'not_allowed' };
  const documentosHash = await hashClientDictamenSnapshot({
    tenant: CLIENT_TENANT_SLUG,
    clientId: client.id,
    documents: documentSnapshot
  });
  const history = await fetchClientDictamenHistory(client.id, 1);
  const latest = history[0] || null;
  const latestMeta = safeObject(latest?.metadata);
  const latestHash = String(latest?.documentos_hash || latestMeta.documentos_hash || '').trim();
  const latestStatus = latest ? getClientDictamenApprovalStatus(latest) : '';
  if (latestHash && latestHash === documentosHash && latestStatus === 'aprobado') {
    return { saved: false, reason: 'unchanged', record: latest, documentosHash };
  }
  const actor = getClientDictamenActorMeta();
  const generatedAt = window.__serverDateService.nowISO();

  const form = new FormData();
  const uploadFile = typeof File !== 'undefined'
    ? new File([blob], filename, { type: 'application/pdf' })
    : new Blob([blob], { type: 'application/pdf' });
  form.append('tenant', CLIENT_TENANT_SLUG);
  form.append('cliente', client.id);
  form.append('folio', folio);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', actor.name);
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: documentSnapshot,
    cliente_nombre: client?.nombre_completo || '',
    source: 'generated',
    approval_status: 'aprobado',
    approved: true,
    generated_by: actor,
    generated_at: generatedAt,
    reviewed_by: actor,
    reviewed_at: generatedAt,
    approved_by: actor,
    approved_at: generatedAt
  }));
  form.append('pdf', uploadFile, filename);

  const { data, error } = await window.tenantPocketBase
    .from(CLIENT_DICTAMEN_COLLECTION)
    .insert(form);
  if (error) throw error;
  try { await forceClientValidationRefresh(client); } catch (_) {}
  return { saved: true, record: data, documentosHash };
}

function pickManualClientDictamenPdf() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.click();
  });
}

async function uploadManualClientDictamen(client, options = {}) {
  if (!canVerify || !client?.id) return window.showToast?.('No tienes permisos para subir dictamen.', 'error');
  const file = await pickManualClientDictamenPdf();
  if (!file) return;
  const fileName = String(file.name || 'dictamen.pdf').trim();
  if (!/\.pdf$/i.test(fileName) && String(file.type || '').toLowerCase() !== 'application/pdf') {
    return window.showToast?.('El dictamen manual debe ser un PDF.', 'error');
  }
  const actor = getClientDictamenActorMeta();
  const folio = `MANUAL-${getClientDictamenTenantCode()}-${window.__serverDateService.todayISO().replace(/-/g, '')}-${String(client.id).slice(0, 6).toUpperCase()}`;
  const documentSnapshot = buildClientDictamenDocumentSnapshot(client);
  const documentosHash = await hashClientDictamenSnapshot({
    tenant: CLIENT_TENANT_SLUG,
    clientId: client.id,
    documents: documentSnapshot
  });
  const form = new FormData();
  form.append('tenant', CLIENT_TENANT_SLUG);
  form.append('cliente', client.id);
  form.append('folio', folio);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', actor.name);
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: documentSnapshot,
    source: 'manual_upload',
    approval_status: 'pendiente',
    approved: false,
    cliente_nombre: client?.nombre_completo || '',
    uploaded_by: actor,
    uploaded_at: window.__serverDateService.nowISO()
  }));
  form.append('pdf', file, fileName);
  try {
    const { data, error } = await window.tenantPocketBase.from(CLIENT_DICTAMEN_COLLECTION).insert(form);
    if (error) throw error;
    try { await forceClientValidationRefresh(client); } catch (_) {}
    window.showToast?.('Dictamen manual guardado.', 'success');
    await loadClients();
    const insertedId = String((Array.isArray(data) ? data[0]?.id : data?.id) || '').trim();
    const updated = allClients.find((row) => String(row?.id || '') === String(client.id));
    const preferVerificationModal = options && options.preferVerificationModal === true;
    if (updated && preferVerificationModal) {
      openVerificationModal(updated);
      const history = await fetchClientDictamenHistory(updated.id, 50);
      const target = history.find((row) => String(row?.id || '') === insertedId) || history[0] || null;
      if (target) await loadVerifDictamen(target);
      return;
    }
    if (updated) openClientProfileDocs(updated);
  } catch (e) {
    window.showToast?.(`No se pudo guardar el dictamen: ${e?.message || e}`, 'error');
  }
}

function syncVerificationActionPanel(label, options = {}) {
  const actionPanel = document.getElementById('verif-action-panel');
  const rejectBox = document.getElementById('verif-reject-box');
  const rejectReason = document.getElementById('verif-reject-reason');
  const actionLabel = document.getElementById('verif-action-doc-label');
  const omitToggle = document.getElementById('verif-omit-toggle');
  const omitNote = document.getElementById('verif-omit-note');
  const omitWrap = omitToggle?.closest('label');
  const approveBtn = document.getElementById('btn-verif-approve');
  const rejectBtn = document.getElementById('btn-verif-reject');
  const deleteBtn = document.getElementById('btn-verif-delete-doc');
  const hasFile = options.uploaded === true;
  const omitted = options.omitted === true;
  const allowOmit = options.allowOmit !== false;
  const allowDelete = options.allowDelete !== false;

  if (actionPanel) actionPanel.classList.remove('hidden');
  if (actionLabel) actionLabel.textContent = `Decisión: ${label || 'Documento'}`;
  if (rejectBox) rejectBox.classList.add('hidden');
  if (rejectReason) rejectReason.value = '';
  if (omitToggle) omitToggle.checked = omitted;
  if (omitWrap) omitWrap.classList.toggle('hidden', !allowOmit);
  if (omitToggle) omitToggle.disabled = !allowOmit;
  if (omitNote) omitNote.classList.toggle('hidden', !allowOmit || !omitted);
  setVerificationButtonState(approveBtn, hasFile && !omitted);
  setVerificationButtonState(rejectBtn, hasFile && !omitted);
  setVerificationButtonState(deleteBtn, hasFile && allowDelete);
}

function getClientDictamenTenantLabel() {
  return CLIENT_TENANT_SLUG === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor';
}

function getClientDictamenTenantCode() {
  return CLIENT_TENANT_SLUG === 'casa_de_piedra' ? 'CP' : 'PM';
}

function formatClientDictamenDateTime(value='') {
  const stamp = String(value || '').trim();
  if (!stamp) return 'Sin fecha registrada';
  const normalized = stamp.replace('T', ' ').replace('Z', '');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hh, mm, ss] = match;
    const datePart = `${day}/${month}/${year}`;
    if (!hh || !mm) return datePart;
    return `${datePart} ${hh}:${mm}:${ss || '00'}`;
  }
  const parsed = new Date(stamp);
  if (Number.isNaN(parsed.getTime())) return stamp;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = String(parsed.getFullYear());
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  const ss = String(parsed.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
}

function getClientDictamenRecordDate(record = {}) {
  const meta = safeObject(record?.metadata);
  return String(
    meta.generated_at
    || record?.created_at
    || record?.created
    || record?.updated_at
    || record?.updated
    || ''
  ).trim();
}

function buildClientDictamenFolio(client, year = getClientDictamenYear()) {
  const sequence = getClientDictamenStableNumber(`${CLIENT_TENANT_SLUG}|${client?.id}|${client?.created_at || client?.created || ''}`, 1, 999);
  return `DF${getClientDictamenYearSuffix(year)}${String(sequence).padStart(3, '0')}`;
}

function getClientDictamenStatusLabel(docInfo, traffic) {
  if (docInfo.omitted) return 'Omitido';
  if (!docInfo.uploaded) return 'Faltante';
  if (docInfo.status === 'aprobado') return 'Aprobado';
  if (docInfo.status === 'rechazado') return 'Rechazado';
  if (traffic && traffic.status === 'expired') return 'Vencido';
  if (docInfo.isUpdated) return 'Actualizado';
  return 'En revision';
}

function getClientDictamenExpiryText(traffic) {
  if (!traffic || !traffic.status || traffic.status === 'missing') return 'Sin vigencia capturada';
  if (traffic.status === 'expired') return `Vencido hace ${Math.abs(traffic.daysLeft)} dia(s)`;
  if (typeof traffic.daysLeft === 'number') return `Vence el ${safeDate(traffic.expiry || traffic.date)}`;
  return 'Sin vigencia capturada';
}

function getClientDictamenLegalValue(source, keys, fallback = '') {
  const obj = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function formatClientDictamenLegalDate(value) {
  const normalized = normalizeStoredDate(value);
  if (!normalized) return String(value || '').trim();
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function buildClientDictamenLegalData(client, folio) {
  const legal = getClientDictamenLegalMeta(client);
  const protocol = safeObject(legal.documentosProtocolizados || legal.documentos_protocolizados || legal.protocolizado || legal.sociedad);
  const attorney = safeObject(legal.apoderados || legal.apoderado || legal.poderes || legal.representante);
  const validation = safeObject(client?.expediente_validacion);
  const docStates = safeObject(client?.documentos_estado);
  const actaState = safeObject(docStates.doc_acta_constitutiva);
  const constanciaState = safeObject(docStates.doc_constancia_fiscal);
  const comprobanteState = safeObject(docStates.doc_comprobante_domicilio);
  const sociedad = getClientDictamenLegalValue(protocol, ['sociedad', 'razonSocial', 'razon_social', 'cliente'], client?.nombre_completo || '--').toUpperCase();
  const nombreComercial = getClientDictamenLegalValue(attorney, ['nombreComercial', 'nombre_comercial'], sociedad).toUpperCase();
  const domicilio = getClientDictamenLegalValue(protocol, ['domicilio', 'domicilioFiscal', 'domicilio_fiscal'], getClientDictamenLegalValue(validation, ['domicilio', 'domicilioFiscal', 'domicilio_fiscal'], '--')).toUpperCase();
  const ciudad = getClientDictamenLegalValue(protocol, ['ciudad', 'municipio'], getClientDictamenLegalValue(attorney, ['ciudad', 'municipio'], '--')).toUpperCase();
  const folioDocumento = getClientDictamenLegalValue(protocol, ['folio', 'folioMercantil', 'folio_mercantil'], getClientDictamenLegalValue(attorney, ['folio', 'folioMercantil', 'folio_mercantil'], '--'));
  const fechaDocumento = getClientDictamenLegalValue(protocol, ['fechaDocumento', 'fecha_documento', 'fechaActo', 'fecha_acto'], normalizeStoredDate(actaState.subido_at || client?.created_at || client?.created));
  const fechaPoder = getClientDictamenLegalValue(attorney, ['fechaDocumento', 'fecha_documento', 'fechaPoder', 'fecha_poder'], normalizeStoredDate(constanciaState.subido_at || comprobanteState.subido_at || client?.updated_at || client?.updated));
  return {
    sociedad,
    tipoActo: getClientDictamenLegalValue(protocol, ['tipoActo', 'tipo_acto', 'acto'], client?.doc_acta_constitutiva ? 'CONSTITUTIVA' : '--').toUpperCase(),
    fechaActo: formatClientDictamenLegalDate(getClientDictamenLegalValue(protocol, ['fechaActo', 'fecha_acto'], fechaDocumento)),
    resumen: getClientDictamenLegalValue(protocol, ['resumen', 'resumenRelevante', 'resumen_relevante', 'objetoSocial', 'objeto_social'], 'DATOS TOMADOS DE LOS DOCUMENTOS CARGADOS AL EXPEDIENTE DIGITAL.').toUpperCase(),
    fechaInscripcion: formatClientDictamenLegalDate(getClientDictamenLegalValue(protocol, ['fechaInscripcion', 'fecha_inscripcion'], '')),
    numeroActa: getClientDictamenLegalValue(protocol, ['numeroActa', 'numero_acta', 'acta'], '--'),
    fechaDocumento: formatClientDictamenLegalDate(fechaDocumento),
    notario: getClientDictamenLegalValue(protocol, ['notario', 'notarioNumero', 'notario_numero', 'notaria'], '--').toUpperCase(),
    ciudad,
    folioDocumento,
    rfc: String(client?.rfc || '--').toUpperCase(),
    domicilio,
    cliente: sociedad,
    nombreComercial,
    apoderado: getClientDictamenLegalValue(attorney, ['apoderado', 'representante', 'representanteLegal', 'representante_legal'], '--').toUpperCase(),
    facultades: getClientDictamenLegalValue(attorney, ['facultades', 'poderes'], 'PODERES Y FACULTADES SEGUN DOCUMENTACION CARGADA.').toUpperCase(),
    limitaciones: getClientDictamenLegalValue(attorney, ['limitaciones', 'restricciones'], 'SIN LIMITACIONES REGISTRADAS').toUpperCase(),
    poderFechaInscripcion: formatClientDictamenLegalDate(getClientDictamenLegalValue(attorney, ['fechaInscripcion', 'fecha_inscripcion'], '')),
    poderNumeroActa: getClientDictamenLegalValue(attorney, ['numeroActa', 'numero_acta', 'acta'], '--'),
    poderFechaDocumento: formatClientDictamenLegalDate(fechaPoder),
    poderNotario: getClientDictamenLegalValue(attorney, ['notario', 'notarioNumero', 'notario_numero', 'notaria'], '--').toUpperCase(),
    poderCiudad: getClientDictamenLegalValue(attorney, ['ciudad', 'municipio'], ciudad).toUpperCase(),
    poderFolio: getClientDictamenLegalValue(attorney, ['folio', 'folioMercantil', 'folio_mercantil'], folioDocumento),
    vigente: getClientDictamenLegalValue(attorney, ['vigente', 'vigenteSiNo', 'vigente_si_no'], 'SI').toUpperCase(),
    terminoVigencia: getClientDictamenLegalValue(attorney, ['terminoVigencia', 'termino_vigencia', 'vigencia'], 'VIGENTE').toUpperCase(),
    folioDictamen: String(folio || '').toUpperCase()
  };
}

function getClientDictamenLegalFooterDate() {
  const date = new Date();
  return `León, Guanajuato a ${date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function buildClientVerificationReportHtml(client, folio = buildClientDictamenFolio(client), pdfStyle = normalizeClientDictamenPdfStyle()) {
  if (!client) return window.showToast?.('Selecciona un cliente para generar el dictamen.', 'error');
  const style = normalizeClientDictamenPdfStyle(pdfStyle);
  const fontFamily = CLIENT_DICTAMEN_FONT_MAP[style.fontFamilyKey] || CLIENT_DICTAMEN_FONT_MAP.segoe;
  const accent = getClientDictamenBrandColor();
  const pageSize = getClientDictamenPageSize(style);
  const contentScale = pageSize.orientation === 'portrait' ? 0.76 : 1;
  const contentWidth = pageSize.orientation === 'portrait' ? 1056 : pageSize.width;
  const content = style.content || {};
  const reportTitle = resolveClientDictamenTemplateString(content.dictamenTitle || 'DICTAMEN LEGAL DOCUMENTOS PROTOCOLIZADOS', buildClientDictamenTemplateContext(client, folio, content.dictamenTitle || ''));
  const templateContext = buildClientDictamenTemplateContext(client, folio, reportTitle);
  const notesText = resolveClientDictamenTemplateString(content.dictamenNotes || 'EL QUE SUSCRIBE DA CERTEZA DE QUE LOS DATOS ASENTADOS CORRESPONDEN A DOCUMENTOS NOTARIADOS QUE SE TUVIERON A LA VISTA EN COPIA SIMPLE, LOS CUALES SE ENCUENTRAN VIGENTES A LA FECHA DE LA EMISION DEL PRESENTE DICTAMEN Y TIENEN VALIDEZ', templateContext);
  const signerName = resolveClientDictamenTemplateString(content.dictamenSigner || '{{CURRENT_USER_NAME}}', templateContext).trim() || getClientDictamenActorMeta().name;
  const legal = buildClientDictamenLegalData(client, folio);
  const legalCell = (value) => escapeHTML(String(value || '--').toUpperCase());
  const footerDate = getClientDictamenLegalFooterDate();

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(buildClientDictamenFileName(client, folio).replace(/\.pdf$/i, ''))}</title>
  <style>
    body { margin: 0; background: #ffffff; color: #0f172a; }
    .dictamen-pdf-root { width: ${pageSize.width}px; margin: 0; background: #ffffff; font-family: ${fontFamily}; }
    .dictamen-pdf-page { position: relative; width: ${pageSize.width}px; min-height: ${pageSize.height}px; padding: 56px 18px 24px; box-sizing: border-box; background: #ffffff; page-break-after: always; overflow: hidden; }
    .dictamen-pdf-page:last-child { page-break-after: auto; }
    .dictamen-content { position: relative; z-index: 5; width: ${contentWidth}px; transform: translate(${style.offsetXPx}px, ${style.offsetYPx}px) scale(${contentScale}); transform-origin: top left; }
    .legal-sheet { border: 2px solid #111; color: #111; }
    .legal-title { background: #fff7db; border-bottom: 2px solid #111; padding: 5px 8px; font-size: ${Math.max(18, style.titlePx - 8)}px; font-weight: 900; text-align: center; letter-spacing: .02em; }
    .legal-section-title { background: #fff7db; border-top: 2px solid #111; border-bottom: 2px solid #111; padding: 4px 8px; font-size: 19px; font-weight: 900; text-align: center; letter-spacing: .04em; }
    .legal-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .legal-table th, .legal-table td { border: 1px solid #111; padding: 5px 4px; font-size: ${Math.max(7, style.tableBodyPx - 3)}px; line-height: 1.22; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
    .legal-table th { background: #dde1e6; font-size: ${Math.max(7, style.tableHeadPx - 2)}px; font-weight: 900; text-transform: uppercase; }
    .legal-table .cream { background: #fff7db; }
    .legal-table .bluehead { background: #dfe5f4; }
    .legal-table .big-row td { height: 136px; }
    .legal-table .power-row td { height: 72px; }
    .legal-table .society { font-weight: 900; }
    .legal-folio-row { display: grid; grid-template-columns: 1fr 104px; border-top: 2px solid #111; border-bottom: 2px solid #111; min-height: 19px; }
    .legal-folio-spacer { border-right: 1px solid #111; display: flex; align-items: center; justify-content: center; font-size: 6px; }
    .legal-folio { background: #04aeea; color: #000; font-weight: 900; font-size: 18px; display: flex; align-items: center; justify-content: center; letter-spacing: .04em; }
    .legal-footer { min-height: 30px; padding: 4px 12px 6px; text-align: center; font-size: ${Math.max(7, style.footerPx - 2)}px; line-height: 1.35; }
    .legal-footer strong { font-weight: 500; }
    .dictamen-extra-page h2 { margin: 14px 0 10px; font-size: ${Math.max(22, style.titlePx - 4)}px; color: #0f172a; }
    .dictamen-annex { border: 1px dashed #cbd5e1; border-radius: 18px; padding: 18px; color: #475569; font-size: ${style.conditionsPx}px; line-height: 1.25; text-align: ${style.conditionsAlign}; }
  </style>
</head>
<body>
  <div class="dictamen-pdf-root" data-orientation="${pageSize.orientation}">
    <section class="dictamen-pdf-page">
      ${renderClientDictamenPdfResources(style, 1, templateContext)}
      <div class="dictamen-content">
        <section class="legal-sheet">
          <div class="legal-title" data-base-resource="header-title">${escapeHTML(reportTitle)}</div>
          <table class="legal-table" data-base-resource="table-body">
            <thead>
              <tr>
                <th style="width:5.5%">SOCIEDAD</th>
                <th style="width:9%">TIPO DE ACTO<br>PROTOCOLIZADO</th>
                <th style="width:7.5%">FECHA DEL ACTO</th>
                <th style="width:23%">RESUMEN RELEVANTE DEL CONTENIDO</th>
                <th style="width:6%">FECHA DE<br>INSCRIPCION</th>
                <th style="width:4.5%">NUMERO DE<br>ACTA</th>
                <th style="width:6.2%">FECHA DE<br>DOCUMENTO</th>
                <th style="width:7.4%">NOTARIO Y NUMERO<br>DE NOTARIA</th>
                <th style="width:6%">CIUDAD</th>
                <th style="width:6.5%">FOLIO</th>
                <th style="width:7.2%">RFC</th>
                <th style="width:10.2%">DOMICILIO</th>
              </tr>
            </thead>
            <tbody>
              <tr class="big-row">
                <td class="society">${legalCell(legal.sociedad)}</td>
                <td>${legalCell(legal.tipoActo)}</td>
                <td>${legalCell(legal.fechaActo)}</td>
                <td>${legalCell(legal.resumen)}</td>
                <td>${legalCell(legal.fechaInscripcion)}</td>
                <td>${legalCell(legal.numeroActa)}</td>
                <td>${legalCell(legal.fechaDocumento)}</td>
                <td>${legalCell(legal.notario)}</td>
                <td>${legalCell(legal.ciudad)}</td>
                <td>${legalCell(legal.folioDocumento)}</td>
                <td>${legalCell(legal.rfc)}</td>
                <td>${legalCell(legal.domicilio)}</td>
              </tr>
            </tbody>
          </table>
          <div class="legal-section-title">DICTAMEN LEGAL APODERADOS</div>
          <table class="legal-table">
            <thead>
              <tr>
                <th class="bluehead" style="width:5.5%">CLIENTE</th>
                <th class="cream" style="width:9%">NOMBRE COMERCIAL</th>
                <th class="cream" style="width:7.7%">APODERADO</th>
                <th class="bluehead" style="width:10.3%">FACULTADES</th>
                <th class="bluehead" style="width:12.5%">LIMITACIONES</th>
                <th class="bluehead" style="width:6%">FECHA DE<br>INSCRIPCION</th>
                <th class="bluehead" style="width:4.5%">NUMERO DE<br>ACTA</th>
                <th class="bluehead" style="width:6.2%">FECHA DE<br>DOCUMENTO</th>
                <th class="bluehead" style="width:7.4%">NOTARIO Y NUMERO<br>DE NOTARIA</th>
                <th class="bluehead" style="width:6%">CIUDAD</th>
                <th class="bluehead" style="width:6.5%">FOLIO</th>
                <th class="bluehead" style="width:7.2%">VIGENTE SI/NO</th>
                <th class="bluehead" style="width:10.2%">TERMINO DE VIGENCIA</th>
              </tr>
            </thead>
            <tbody>
              <tr class="power-row">
                <td class="society">${legalCell(legal.cliente)}</td>
                <td class="society">${legalCell(legal.nombreComercial)}</td>
                <td class="society">${legalCell(legal.apoderado)}</td>
                <td>${legalCell(legal.facultades)}</td>
                <td>${legalCell(legal.limitaciones)}</td>
                <td>${legalCell(legal.poderFechaInscripcion)}</td>
                <td>${legalCell(legal.poderNumeroActa)}</td>
                <td>${legalCell(legal.poderFechaDocumento)}</td>
                <td>${legalCell(legal.poderNotario)}</td>
                <td>${legalCell(legal.poderCiudad)}</td>
                <td>${legalCell(legal.poderFolio)}</td>
                <td>${legalCell(legal.vigente)}</td>
                <td>${legalCell(legal.terminoVigencia)}</td>
              </tr>
            </tbody>
          </table>
          <div class="legal-folio-row" data-base-resource="summary">
            <div class="legal-folio-spacer">.</div>
            <div class="legal-folio">${escapeHTML(legal.folioDictamen)}</div>
          </div>
          <div class="legal-footer" data-base-resource="conditions">
            <strong>“${escapeHTML(notesText)}”</strong><br>
            ${escapeHTML(signerName)}.<br>
            ${escapeHTML(footerDate)}
          </div>
        </section>
      </div>
    </section>
    ${buildClientDictamenExtraPages(style, templateContext)}
  </div>
</body>
</html>`;
}

async function openClientVerificationReport(client) {
  if (!canVerify) return window.showToast?.('Solo administradores y verificadores pueden generar dictamenes.', 'error');
  if (!client) return window.showToast?.('Selecciona un cliente para generar el dictamen.', 'error');
  try {
    const folio = await buildNextClientDictamenFolio(client);
    const filename = buildClientDictamenFileName(client, folio);
    const pdfStyle = await loadClientDictamenPdfStyle();
    const canEditDictamenTemplate = canSaveClientDictamenTemplate() && !isAdminVerifierModeActive();
    if (!window.HubDictamenGenerator?.open) {
      window.showToast?.('No se pudo abrir el editor de dictamen.', 'error');
      return;
    }
    await window.HubDictamenGenerator.open({
      idPrefix: `client-${CLIENT_TENANT_SLUG}`,
      client,
      folio,
      filename,
      style: pdfStyle,
      brandColor: getClientDictamenBrandColor(),
      fontMap: CLIENT_DICTAMEN_FONT_MAP,
      normalizeStyle: normalizeClientDictamenPdfStyle,
      buildHtml: buildClientVerificationReportHtml,
      renderPdfBlob: renderClientDictamenPdfBlob,
      downloadBlob: downloadClientDictamenBlob,
      buildDocumentSnapshot: buildClientDictamenDocumentSnapshot,
      persistSnapshot: persistClientDictamenSnapshot,
      canSnapshot: canVerify === true,
      canEdit: canEditDictamenTemplate,
      canSaveTemplate: canEditDictamenTemplate,
      saveTemplate: saveClientDictamenPdfStyle,
      showToast: (message, type) => window.showToast?.(message, type),
      onGenerated: async (generatorState) => {
        await loadClients?.();
        const refreshedClient = allClients.find((row) => String(row?.id || '') === String(client?.id || '')) || null;
        const modal = document.getElementById('client-verification-modal');
        const verifierModalOpen = !!modal && !modal.classList.contains('hidden');
        const sameClientOnVerifier = verifierModalOpen && String(verifCurrentClient?.id || '') === String(client?.id || '');
        if (sameClientOnVerifier && refreshedClient) {
          openVerificationModal(refreshedClient);
          const targetFolio = String(generatorState?.folio || '').trim();
          const history = await fetchClientDictamenHistory(refreshedClient.id, 50);
          const target = history.find((row) => String(row?.folio || '').trim() === targetFolio) || history[0] || null;
          if (target) await loadVerifDictamen(target);
        }
      }
    });
  } catch (error) {
    console.error(error);
    window.showToast?.('No se pudo abrir el editor de dictamen.', 'error');
  }
}

async function deleteVerificationDocument() {
  if (!canVerify || !verifCurrentClient || !verifCurrentDocField) return;
  if (isVerificationDictamenField(verifCurrentDocField)) {
    return window.showToast?.('Los dictamenes se validan desde este panel, pero no se eliminan aqui.', 'error');
  }
  const docConfig = CLIENT_DOC_REQUIREMENTS.find((item) => item.field === verifCurrentDocField);
  const currentDoc = getVerificationDocState(verifCurrentClient, verifCurrentDocField);
  if (!currentDoc.uploaded) {
    window.showToast?.('Este documento ya no tiene un archivo cargado.', 'error');
    return;
  }
  const ok = await confirmModal(`¿Eliminar el archivo de ${docConfig?.label || 'este documento'}? Quedará nuevamente como requisito pendiente para el cliente.`);
  if (!ok) return;

  try {
    const estados = safeObject(verifCurrentClient.documentos_estado);
    estados[verifCurrentDocField] = {
      status: 'pendiente',
      motivo: '',
      omitido: false,
      actualizado_at: '',
      actualizado_desde_rechazo: false,
      revisado_por_id: '',
      revisado_por_nombre: '',
      revisado_at: '',
      aprobado_por_id: '',
      aprobado_por_nombre: '',
      aprobado_at: ''
    };

    const payload = new FormData();
    payload.append('documentos_estado', JSON.stringify(estados));
    payload.append(`${verifCurrentDocField}-`, currentDoc.fileName);
    if (verifCurrentDocField === 'doc_constancia_fiscal') payload.append('constancia_fiscal_emitida_el', '');
    if (verifCurrentDocField === 'doc_comprobante_domicilio') payload.append('comprobante_domicilio_emitido_el', '');

    const { data, error } = await window.tenantPocketBase.from('clientes')
      .update(payload)
      .eq('id', verifCurrentClient.id);
    if (error) throw error;

    verifCurrentClient = Array.isArray(data) ? (data[0] || verifCurrentClient) : (data || verifCurrentClient);
    window.showToast?.('Documento eliminado del expediente.', 'success');
    openVerificationModal(verifCurrentClient);
    if (docConfig) await loadVerifDoc(verifCurrentDocField, docConfig.label, '');
    await loadClients();
  } catch (error) {
    console.error(error);
    window.showToast?.('No se pudo eliminar el documento.', 'error');
  }
}

function openVerificationModal(client) {
  if (!canVerify) return window.showToast?.('Solo un verificador puede validar documentos.', 'error');
  verifCurrentClient = client;
  verifCurrentDocField = null;
  verifCurrentDocUploaded = false;
  verifCurrentDictamenRecord = null;
  document.getElementById('verif-client-name').textContent = String(client?.nombre_completo || 'Cliente');
  document.getElementById('verif-doc-name').textContent = 'Selecciona un documento';
  document.getElementById('verif-preview-loading').classList.add('hidden');
  document.getElementById('verif-preview-iframe').classList.add('hidden');
  document.getElementById('verif-preview-img').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.remove('flex');
  document.getElementById('verif-preview-iframe').src = '';
  document.getElementById('verif-preview-img').src = '';
  document.getElementById('verif-action-panel').classList.add('hidden');
  document.getElementById('verif-reject-box').classList.add('hidden');

  const validation = safeObject(client?.expediente_validacion);
  const docs = safeObject(validation.documents);
  const listContainer = document.getElementById('verif-docs-list');
  listContainer.innerHTML = '';

  CLIENT_DOC_REQUIREMENTS.forEach(item => {
    const docInfo = getVerificationDocState(client, item.field, docs);
    let statusLabel = 'Pendiente';
    let statusColor = 'text-orange-500';
    let statusCss = 'bg-orange-100 text-orange-700';
    if (docInfo.omitted) {
      statusLabel = 'Omitido';
      statusColor = 'text-sky-500';
      statusCss = 'bg-sky-100 text-sky-700';
    } else if (!docInfo.uploaded) {
      statusLabel = 'Faltante';
      statusColor = 'text-gray-400';
      statusCss = 'bg-gray-100 text-gray-500';
    } else if (docInfo.status === 'aprobado') {
      statusLabel = 'Aprobado';
      statusColor = 'text-emerald-500';
      statusCss = 'bg-emerald-100 text-emerald-700';
    } else if (docInfo.status === 'rechazado') {
      statusLabel = 'Rechazado';
      statusColor = 'text-red-500';
      statusCss = 'bg-red-100 text-red-700';
    } else if (docInfo.isUpdated) {
      statusLabel = 'Actualizado';
      statusColor = 'text-sky-500';
      statusCss = 'bg-sky-100 text-sky-700';
    }

    const dateBadgeHtml = item.dateField
      ? `<div class="mt-2 flex flex-wrap gap-2">${docInfo.omitted
          ? buildOmittedBadgeHtml(item.label.includes('Constancia') ? 'Constancia' : 'Comprobante')
          : buildTrafficBadgeHtml(
              item.label.includes('Constancia') ? 'Constancia' : 'Comprobante',
              getClientDocumentValidityReferenceDate(client, item.field),
              getClientDocumentValidityDays(item.field)
            )}</div>`
      : '';
    const emittedDateValue = item.dateField ? getClientValidationDate(client, item.dateField) : '';
    const emittedDateHtml = emittedDateValue
      ? `<p class="mt-1 text-[10px] text-gray-400">Fecha detectada: ${escapeHTML(safeDate(emittedDateValue))}</p>`
      : '';
    const reviewedMeta = getClientDocumentStateMeta(client, item.field);
    const reviewedHtml = reviewedMeta.reviewedByName
      ? `<p class="mt-2 text-[10px] text-gray-500 font-semibold">${escapeHTML((reviewedMeta.status === 'aprobado' || reviewedMeta.omitted ? 'Aprobo' : 'Reviso') + ': ' + reviewedMeta.reviewedByName + (reviewedMeta.reviewedAt ? ' · ' + formatClientDictamenDateTime(reviewedMeta.reviewedAt) : ''))}</p>`
      : '';
    const reasonHtml = docInfo.status === 'rechazado' && docInfo.reason
      ? `<p class="mt-2 text-[10px] text-red-600 font-semibold">${escapeHTML(docInfo.reason)}</p>`
      : (docInfo.isUpdated
        ? `<p class="mt-2 text-[10px] text-sky-700 font-semibold">${docInfo.updatedFromRejection ? 'Se subió una nueva versión tras el rechazo. Pendiente de revisión.' : 'Se subió una nueva versión. Pendiente de revisión.'}</p>`
      : (docInfo.omitted
        ? '<p class="mt-2 text-[10px] text-sky-700 font-semibold">Marcado como omitido por administración.</p>'
        : ''));
    const allowOmit = canClientDocumentBeOmitted(item.field);
    const omitControlsHtml = allowOmit
      ? `
      <div class="flex items-center justify-between gap-3 border-t border-gray-100 px-3 py-2">
        <span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Omitir requisito</span>
        <label class="inline-flex items-center gap-2 text-[10px] font-bold text-gray-600">
          <span>${docInfo.omitted ? 'Activo' : 'Inactivo'}</span>
          <input type="checkbox" class="verif-card-omit-toggle h-4 w-4 accent-brand-red" data-field="${escapeAttr(item.field)}" data-label="${escapeAttr(item.label)}" ${docInfo.omitted ? 'checked' : ''}>
        </label>
      </div>`
      : '';

    const card = document.createElement('div');
    card.className = 'rounded-xl border border-gray-200 bg-white shadow-sm';
    card.innerHTML = `
      <button type="button" class="verif-doc-open w-full text-left p-3 hover:bg-gray-50 transition group flex items-start gap-3 rounded-t-xl">
        <div class="mt-0.5 ${statusColor}">
          ${docInfo.uploaded ? '<i class="fa-solid fa-file-invoice"></i>' : '<i class="fa-solid fa-file-circle-xmark"></i>'}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-gray-800">${item.label}</p>
          <p class="text-[10px] text-gray-400 truncate mt-0.5">${escapeHTML(docInfo.fileName || 'No cargado')}</p>
          ${emittedDateHtml}
          ${dateBadgeHtml}
          ${reasonHtml}
          ${reviewedHtml}
        </div>
        <div class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusCss}">${statusLabel}</div>
      </button>
      ${omitControlsHtml}
    `;
    card.querySelector('.verif-doc-open')?.addEventListener('click', () => {
      loadVerifDoc(item.field, item.label, docInfo.fileName);
    });
    const inlineToggle = card.querySelector('.verif-card-omit-toggle');
    inlineToggle?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    inlineToggle?.addEventListener('change', async (event) => {
      event.stopPropagation();
      verifCurrentDocField = item.field;
      await submitVerifDecision(event.target.checked ? 'omitido' : 'pendiente', '');
    });
    listContainer.appendChild(card);
  });

  renderVerificationDictamenCards(client, listContainer);

  document.getElementById('client-verification-modal').classList.remove('hidden');
}

async function renderVerificationDictamenCards(client, listContainer) {
  if (!client?.id || !listContainer) return;
  const divider = document.createElement('div');
  divider.className = 'px-1 pt-4 text-[10px] font-black uppercase text-gray-400';
  divider.innerText = 'Dictamenes del expediente';
  listContainer.appendChild(divider);

  const loading = document.createElement('div');
  loading.className = 'rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs font-bold text-gray-400';
  loading.innerText = 'Cargando dictamenes...';
  listContainer.appendChild(loading);

  const history = await fetchClientDictamenHistory(client.id, 30);
  if (String(verifCurrentClient?.id || '') !== String(client.id || '')) return;
  loading.remove();

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'rounded-xl border border-dashed border-gray-200 bg-white px-3 py-3 text-xs text-gray-400';
    empty.innerText = 'Aun no hay dictamenes guardados para este cliente.';
    listContainer.appendChild(empty);
    return;
  }

  history.forEach((row) => {
    const meta = getClientDictamenStatusMeta(row);
    const recordMeta = getClientDictamenMeta(row);
    const reviewedBy = String(recordMeta.approved_by?.name || recordMeta.reviewed_by?.name || '').trim();
    const reviewedAt = String(recordMeta.approved_at || recordMeta.reviewed_at || '').trim();
    const reviewedHtml = reviewedBy
      ? `<p class="mt-2 text-[10px] text-gray-500 font-semibold">${escapeHTML(`${meta.status === 'aprobado' ? 'Aprobo' : 'Reviso'}: ${reviewedBy}${reviewedAt ? ` · ${formatClientDictamenDateTime(reviewedAt)}` : ''}`)}</p>`
      : '';
    const reasonHtml = meta.status === 'rechazado' && recordMeta.reason
      ? `<p class="mt-2 text-[10px] text-red-600 font-semibold">${escapeHTML(recordMeta.reason)}</p>`
      : '';
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-gray-200 bg-white shadow-sm';
    card.innerHTML = `
      <button type="button" class="verif-doc-open w-full text-left p-3 hover:bg-gray-50 transition group flex items-start gap-3 rounded-xl">
        <div class="mt-0.5 ${meta.status === 'aprobado' ? 'text-emerald-500' : (meta.status === 'rechazado' ? 'text-red-500' : 'text-amber-500')}">
          <i class="${meta.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-gray-800">${escapeHTML(row.folio || 'Dictamen')}</p>
          <p class="text-[10px] text-gray-400 truncate mt-0.5">${escapeHTML(meta.sourceLabel)} Â· ${escapeHTML(formatClientDictamenDateTime(getClientDictamenRecordDate(row)))}</p>
          ${reasonHtml}
          ${reviewedHtml}
        </div>
        <div class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${meta.badgeClass}">${escapeHTML(meta.label)}</div>
      </button>
    `;
    card.querySelector('.verif-doc-open')?.addEventListener('click', () => {
      loadVerifDictamen(row);
    });
    listContainer.appendChild(card);
  });
}

async function loadVerifDictamen(record) {
  if (!verifCurrentClient) return;
  const fileName = getClientDictamenPdfFileName(record);
  const recordId = String(record?.id || '').trim();
  if (!recordId || !fileName) return;
  verifCurrentDocField = `__dictamen__:${recordId}`;
  verifCurrentDocUploaded = true;
  verifCurrentDictamenRecord = record;

  document.getElementById('verif-doc-name').textContent = String(record?.folio || 'Dictamen');
  document.getElementById('verif-preview-loading').classList.remove('hidden');
  document.getElementById('verif-preview-iframe').classList.add('hidden');
  document.getElementById('verif-preview-img').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.remove('flex');
  document.getElementById('verif-preview-iframe').src = '';
  document.getElementById('verif-preview-img').src = '';

  syncVerificationActionPanel(record?.folio || 'Dictamen', {
    uploaded: true,
    omitted: false,
    allowOmit: false,
    allowDelete: false
  });

  const previewError = document.getElementById('verif-preview-error');
  const previewErrorText = document.getElementById('verif-preview-error-text');
  const previewDownload = document.getElementById('verif-preview-download');
  const url = await getSignedFileUrl(CLIENT_DICTAMEN_COLLECTION, recordId, fileName);
  if (previewDownload) {
    previewDownload.href = url || '#';
    previewDownload.classList.toggle('hidden', !url);
  }
  if (!url) {
    document.getElementById('verif-preview-loading').classList.add('hidden');
    if (previewErrorText) previewErrorText.textContent = 'No se pudo abrir el dictamen seleccionado.';
    previewError.classList.remove('hidden');
    previewError.classList.add('flex');
    return;
  }
  if (previewErrorText) {
    previewErrorText.innerHTML = 'No se puede previsualizar. <a id="verif-preview-download" href="' + escapeAttr(url) + '" target="_blank" class="text-blue-600 underline">Descargar archivo</a>';
  }
  document.getElementById('verif-preview-loading').classList.add('hidden');
  const ifr = document.getElementById('verif-preview-iframe');
  ifr.src = url;
  ifr.classList.remove('hidden');
}

async function loadVerifDoc(field, label, fileName) {
  if (!verifCurrentClient) return;
  verifCurrentDocField = field;
  verifCurrentDictamenRecord = null;
  const validation = safeObject(verifCurrentClient?.expediente_validacion);
  const docs = safeObject(validation.documents);
  const docInfo = getVerificationDocState(verifCurrentClient, field, docs);
  const effectiveFileName = String(fileName || docInfo.fileName || '').trim();
  verifCurrentDocUploaded = docInfo.uploaded;

  document.getElementById('verif-doc-name').textContent = String(label || 'Documento');
  document.getElementById('verif-preview-loading').classList.remove('hidden');
  document.getElementById('verif-preview-iframe').classList.add('hidden');
  document.getElementById('verif-preview-img').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.add('hidden');
  document.getElementById('verif-preview-error').classList.remove('flex');
  document.getElementById('verif-preview-iframe').src = '';
  document.getElementById('verif-preview-img').src = '';

  const allowOmit = canClientDocumentBeOmitted(field);
  syncVerificationActionPanel(label, { uploaded: docInfo.uploaded, omitted: docInfo.omitted, allowOmit });

  const previewError = document.getElementById('verif-preview-error');
  const previewErrorText = document.getElementById('verif-preview-error-text');
  const previewDownload = document.getElementById('verif-preview-download');

  if (!effectiveFileName) {
    document.getElementById('verif-preview-loading').classList.add('hidden');
    if (previewErrorText) {
      previewErrorText.textContent = allowOmit
        ? 'Este documento no está cargado. Si no aplica para este cliente, puedes marcarlo como omitido.'
        : 'Este documento es obligatorio y debe cargarse para validar el expediente.';
    }
    if (previewDownload) {
      previewDownload.href = '#';
      previewDownload.classList.add('hidden');
    }
    previewError.classList.remove('hidden');
    previewError.classList.add('flex');
    return;
  }

  const url = await getSignedFileUrl('clientes', verifCurrentClient.id, effectiveFileName);
  if (previewDownload) {
    previewDownload.href = url;
    previewDownload.classList.remove('hidden');
  }
  if (previewErrorText) {
    previewErrorText.innerHTML = 'No se puede previsualizar. <a id="verif-preview-download" href="' + escapeAttr(url) + '" target="_blank" class="text-blue-600 underline">Descargar archivo</a>';
  }

  const ext = effectiveFileName.split('.').pop().toLowerCase();
  document.getElementById('verif-preview-loading').classList.add('hidden');
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const img = document.getElementById('verif-preview-img');
    img.src = url;
    img.classList.remove('hidden');
  } else if (ext === 'pdf') {
    const ifr = document.getElementById('verif-preview-iframe');
    ifr.src = url;
    ifr.classList.remove('hidden');
  } else {
    previewError.classList.remove('hidden');
    previewError.classList.add('flex');
  }
}

document.getElementById('btn-verif-approve')?.addEventListener('click', async () => {
  if (!canVerify || !verifCurrentClient || !verifCurrentDocField || !verifCurrentDocUploaded) return;
  await submitVerifDecision('aprobado', '');
});

document.getElementById('btn-verif-report')?.addEventListener('click', () => {
  if (!canVerify || !verifCurrentClient) return;
  openClientVerificationReport(verifCurrentClient);
});

document.getElementById('btn-verif-manual-report')?.addEventListener('click', async () => {
  if (!canVerify || !verifCurrentClient) return;
  await uploadManualClientDictamen(verifCurrentClient, { preferVerificationModal: true });
});

document.getElementById('btn-verif-delete-doc')?.addEventListener('click', async () => {
  await deleteVerificationDocument();
});

document.getElementById('btn-verif-reject')?.addEventListener('click', () => {
  if (!canVerify || !verifCurrentDocUploaded) return;
  document.getElementById('verif-reject-box').classList.toggle('hidden');
});

document.getElementById('btn-verif-confirm-reject')?.addEventListener('click', async () => {
  if (!canVerify || !verifCurrentClient || !verifCurrentDocField || !verifCurrentDocUploaded) return;
  const reason = document.getElementById('verif-reject-reason').value.trim();
  if (!reason) return window.showToast?.('Debes ingresar un motivo de rechazo', 'error');
  await submitVerifDecision('rechazado', reason);
});

document.getElementById('verif-omit-toggle')?.addEventListener('change', async (event) => {
  if (!canVerify || !verifCurrentClient || !verifCurrentDocField) return;
  await submitVerifDecision(event.target.checked ? 'omitido' : 'pendiente', '');
});

async function submitVerifDecision(status, motivo) {
  if (!canVerify || !verifCurrentClient || !verifCurrentDocField) return;
  try {
    const actor = getClientDictamenActorMeta();
    const reviewedAt = await fetchServerNowIso();
    if (isVerificationDictamenField(verifCurrentDocField)) {
      const dictamenId = getVerificationDictamenId(verifCurrentDocField);
      const currentRecord = verifCurrentDictamenRecord && String(verifCurrentDictamenRecord.id || '') === dictamenId
        ? verifCurrentDictamenRecord
        : (await fetchClientDictamenHistory(verifCurrentClient.id, 50)).find((row) => String(row?.id || '') === dictamenId);
      if (!currentRecord) throw new Error('No se encontro el dictamen seleccionado.');
      const nextStatus = status === 'aprobado' ? 'aprobado' : (status === 'rechazado' ? 'rechazado' : 'pendiente');
      const baseMeta = getClientDictamenMeta(currentRecord);
      const documentSnapshot = buildClientDictamenDocumentSnapshot(verifCurrentClient);
      const existingSnapshot = Array.isArray(baseMeta.documentos_snapshot) && baseMeta.documentos_snapshot.length ? baseMeta.documentos_snapshot : null;
      const currentDocumentosHash = await hashClientDictamenSnapshot({
        tenant: CLIENT_TENANT_SLUG,
        clientId: verifCurrentClient.id,
        documents: documentSnapshot
      });
      const documentosHash = existingSnapshot
        ? (String(currentRecord?.documentos_hash || baseMeta.documentos_hash || '').trim() || currentDocumentosHash)
        : currentDocumentosHash;
      const nextMeta = {
        ...baseMeta,
        documentos_hash: documentosHash,
        documentos_snapshot: existingSnapshot || documentSnapshot,
        approval_status: nextStatus,
        approved: nextStatus === 'aprobado',
        rejected: nextStatus === 'rechazado',
        reason: nextStatus === 'rechazado' ? motivo : '',
        reviewed_by: actor,
        reviewed_at: reviewedAt,
        approved_by: nextStatus === 'aprobado' ? actor : {},
        approved_at: nextStatus === 'aprobado' ? reviewedAt : ''
      };
      const { error: dictErr } = await window.tenantPocketBase.from(CLIENT_DICTAMEN_COLLECTION)
        .update({ documentos_hash: documentosHash, metadata: nextMeta })
        .eq('id', dictamenId);
      if (dictErr) throw dictErr;
      try { await forceClientValidationRefresh(verifCurrentClient); } catch (_) {}

      const verb = nextStatus === 'aprobado' ? 'aprobado' : (nextStatus === 'rechazado' ? 'rechazado' : 'actualizado');
      window.showToast?.(`Dictamen ${verb} correctamente`, 'success');
      await loadClients();
      verifCurrentClient = allClients.find((row) => String(row?.id || '') === String(verifCurrentClient?.id || '')) || verifCurrentClient;
      openVerificationModal(verifCurrentClient);
      const refreshedHistory = await fetchClientDictamenHistory(verifCurrentClient?.id, 50);
      const nextRecord = refreshedHistory.find((row) => String(row?.id || '') === dictamenId);
      if (nextRecord) await loadVerifDictamen(nextRecord);
      return;
    }

    if (status === 'omitido' && !canClientDocumentBeOmitted(verifCurrentDocField)) {
      window.showToast?.('La constancia de situación fiscal es obligatoria y no se puede omitir.', 'error');
      return;
    }

    const estados = safeObject(verifCurrentClient.documentos_estado);
    estados[verifCurrentDocField] = {
      status,
      motivo: status === 'rechazado' ? motivo : '',
      omitido: status === 'omitido',
      actualizado_at: '',
      actualizado_desde_rechazo: false,
      revisado_at: reviewedAt,
      revisado_por_id: actor.id || '',
      revisado_por_nombre: actor.name || '',
      aprobado_at: status === 'aprobado' ? reviewedAt : '',
      aprobado_por_id: status === 'aprobado' ? (actor.id || '') : '',
      aprobado_por_nombre: status === 'aprobado' ? (actor.name || '') : ''
    };

    const { data, error } = await window.tenantPocketBase.from('clientes')
      .update({ documentos_estado: estados })
      .eq('id', verifCurrentClient.id);
    if (error) throw error;

    const verb = status === 'aprobado' ? 'aprobado' : (status === 'rechazado' ? 'rechazado' : (status === 'omitido' ? 'omitido' : 'actualizado'));
    window.showToast?.(`Documento ${verb} correctamente`, 'success');

    verifCurrentClient = Array.isArray(data) ? (data[0] || verifCurrentClient) : (data || verifCurrentClient);
    const docConfig = CLIENT_DOC_REQUIREMENTS.find((item) => item.field === verifCurrentDocField);
    const nextDoc = getVerificationDocState(verifCurrentClient, verifCurrentDocField);
    openVerificationModal(verifCurrentClient);
    if (docConfig) await loadVerifDoc(verifCurrentDocField, docConfig.label, nextDoc.fileName);
    await loadClients();
  } catch (e) {
    console.error(e);
    window.showToast?.('No se pudo actualizar el estado del documento.', 'error');
  }
}


