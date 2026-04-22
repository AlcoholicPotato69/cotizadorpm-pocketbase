/**
 * DOC: client\cotizador\control.js
 * Proposito: Bitacora operativa, perfiles y ordenes para seguimiento interno.
 * Notas: Archivo compartido entre control PM y CP por configuracion en window.CONTROL_PAGE_CONFIG.
 */

const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
const PAGE_CFG = window.CONTROL_PAGE_CONFIG || {};
const FIN_SCHEMA = PAGE_CFG.schema || (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
const TENANT_SLUG = PAGE_CFG.tenantSlug || 'plaza_mayor';
const PUBLIC_PROFILE_PATH = PAGE_CFG.publicProfilePath || '../public/perfil_cliente.html';
const CONSTANCIA_VALID_DAYS = 30;
const COMPROBANTE_VALID_DAYS = 'calendar_months:3';
const CONTROL_MOVEMENTS_RETENTION_MONTHS = 3;

const DOC_REQUIREMENTS = {
  plaza_mayor: [
    { field: 'doc_acta_constitutiva', label: 'Acta constitutiva' },
    { field: 'doc_ine', label: 'INE o identificacion' },
    { field: 'doc_comprobante_domicilio', label: 'Comprobante de domicilio', dateField: 'comprobante_domicilio_emitido_el', validDays: COMPROBANTE_VALID_DAYS },
    { field: 'doc_constancia_fiscal', label: 'Constancia de situacion fiscal', dateField: 'constancia_fiscal_emitida_el', validDays: CONSTANCIA_VALID_DAYS }
  ],
  casa_de_piedra: [
    { field: 'doc_ine', label: 'INE o identificacion' },
    { field: 'doc_comprobante_domicilio', label: 'Comprobante de domicilio', dateField: 'comprobante_domicilio_emitido_el', validDays: COMPROBANTE_VALID_DAYS },
    { field: 'doc_constancia_fiscal', label: 'Constancia de situacion fiscal', dateField: 'constancia_fiscal_emitida_el', validDays: CONSTANCIA_VALID_DAYS }
  ]
};

const state = {
  access: null,
  clients: [],
  orders: [],
  movements: [],
  filteredMovements: [],
  serverNowIso: '',
  loading: false
};
let adminVerifierMode = false;
const CONTROL_ADMIN_VERIFIER_MODE_STORAGE_KEY = `hub_admin_verifier_mode_${TENANT_SLUG}`;

function safeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function safeObject(value) {
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

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeRoleName(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'administrador' || raw === 'superadmin' || raw === 'super_admin') return 'admin';
  return raw;
}

function normalizeStoredDate(value = '') {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}[ t]/i.test(raw)) return raw.slice(0, 10);
  return '';
}

function parseDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)
    ? raw.replace(' ', 'T')
    : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function getDateTimeParts(value) {
  const parsed = parseDateTime(value);
  if (!parsed) {
    const raw = String(value || '').trim();
    return { valid: false, date: raw || 'Sin fecha', time: raw ? '--:--:--' : '--:--:--', full: raw || 'Sin fecha', timestamp: 0, isoDate: '' };
  }
  const date = `${padDatePart(parsed.getDate())}/${padDatePart(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  const time = `${padDatePart(parsed.getHours())}:${padDatePart(parsed.getMinutes())}:${padDatePart(parsed.getSeconds())}`;
  return {
    valid: true,
    date,
    time,
    full: `${date} ${time}`,
    timestamp: parsed.getTime(),
    isoDate: `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`
  };
}

function formatDateTime(value) {
  return getDateTimeParts(value).full;
}

function getControlMovementsCutoffIso(baseIso = '') {
  const cutoff = parseDateTime(baseIso) || new Date();
  cutoff.setMonth(cutoff.getMonth() - CONTROL_MOVEMENTS_RETENTION_MONTHS);
  return cutoff.toISOString();
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
    if (parseDateTime(now)) return now;
  } catch (_) {}
  return new Date().toISOString();
}

function formatDate(value) {
  const raw = normalizeStoredDate(value);
  if (!raw) return 'Sin fecha';
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function calcExpiryStatus(dateValue, validDays) {
  const normalized = normalizeStoredDate(dateValue);
  if (!normalized || !validDays) return { status: 'missing', daysLeft: null, expiry: '' };
  const specialMode = String(validDays || '').trim().toLowerCase();
  if (specialMode.indexOf('calendar_months:') === 0) {
    const baseUtc = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(baseUtc.getTime())) return { status: 'missing', daysLeft: null, expiry: '' };
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (baseUtc.getTime() > todayUtc.getTime()) return { status: 'expired', daysLeft: -1, expiry: '' };
    const months = Math.max(1, Number(specialMode.split(':')[1]) || 3);
    const boundary = new Date(Date.UTC(baseUtc.getUTCFullYear(), baseUtc.getUTCMonth() + months, 1));
    const lastValid = new Date(boundary.getTime() - 86400000);
    const daysLeft = Math.floor((boundary.getTime() - todayUtc.getTime()) / 86400000);
    const expiry = lastValid.toISOString().slice(0, 10);
    if (todayUtc.getTime() >= boundary.getTime()) {
      const expiredDays = Math.max(1, Math.floor((todayUtc.getTime() - boundary.getTime()) / 86400000) + 1);
      return { status: 'expired', daysLeft: -expiredDays, expiry };
    }
    if (daysLeft <= 7) return { status: 'critical', daysLeft, expiry };
    if (daysLeft <= 15) return { status: 'warning', daysLeft, expiry };
    return { status: 'ok', daysLeft, expiry };
  }
  const base = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(base.getTime())) return { status: 'missing', daysLeft: null, expiry: '' };
  const expiry = new Date(base);
  expiry.setDate(expiry.getDate() + validDays);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = expiry.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffMs / 86400000);
  if (daysLeft < 0) return { status: 'expired', daysLeft, expiry: expiry.toISOString().slice(0, 10) };
  if (daysLeft <= 7) return { status: 'critical', daysLeft, expiry: expiry.toISOString().slice(0, 10) };
  if (daysLeft <= 15) return { status: 'warning', daysLeft, expiry: expiry.toISOString().slice(0, 10) };
  return { status: 'ok', daysLeft, expiry: expiry.toISOString().slice(0, 10) };
}

function deriveAccessFromLayout() {
  const authCtx = window.__HUB_AUTH_CONTEXT || null;
  if (!authCtx?.session?.user) return null;
  const perms = (authCtx.permissions && typeof authCtx.permissions === 'object') ? authCtx.permissions : {};
  const role = normalizeRoleName(authCtx.role || authCtx.profile?.role || '');
  return {
    role,
    perms,
    canView: authCtx.isAdmin === true || role === 'admin' || role === 'verificador',
    canVerify: authCtx.isAdmin === true || role === 'verificador' || perms.clients_verify === true
  };
}

async function fetchAccessContext(sessionUser) {
  const fromLayout = deriveAccessFromLayout();
  if (fromLayout) return fromLayout;
  const role = normalizeRoleName(sessionUser?.role || '');
  return {
    role,
    perms: {},
    canView: role === 'admin' || role === 'verificador',
    canVerify: role === 'admin' || role === 'verificador'
  };
}

function getCurrentPageFile() {
  return String(window.location.pathname.split('/').pop() || 'control.html').trim().toLowerCase();
}

function buildTenantPageHref(tenantSlug, fileName = getCurrentPageFile()) {
  const directory = tenantSlug === 'casa_de_piedra' ? 'cotizadorcp' : 'cotizador';
  return new URL(`../${directory}/${fileName}`, window.location.href).toString();
}

function getAllowedTenantsForVerifier() {
  const authCtx = window.__HUB_AUTH_CONTEXT || {};
  const allowed = Array.isArray(authCtx.allowedTenants) && authCtx.allowedTenants.length
    ? authCtx.allowedTenants
    : ['plaza_mayor', 'casa_de_piedra'];
  return allowed.filter((slug) => slug === 'plaza_mayor' || slug === 'casa_de_piedra');
}

function installVerifierTenantNavigation(accessCtx) {
  const activeRole = normalizeRoleName(accessCtx?.role || '');
  if (activeRole !== 'verificador' && activeRole !== 'admin') return;
  const currentFile = getCurrentPageFile();
  const currentTenant = TENANT_SLUG;
  const allowedTenants = getAllowedTenantsForVerifier();
  const switchHtml = allowedTenants.map((tenantSlug) => {
    const isActive = tenantSlug === currentTenant;
    const label = tenantSlug === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor';
    const shortLabel = tenantSlug === 'casa_de_piedra' ? 'CP' : 'PM';
    const classes = isActive
      ? 'bg-brand-red text-white shadow-sm'
      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900';
    return `<a href="${buildTenantPageHref(tenantSlug, currentFile)}" class="${classes} rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition whitespace-nowrap flex items-center gap-2"><span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/15 text-[10px]">${shortLabel}</span><span>${label}</span></a>`;
  }).join('');

  const switchContainer = document.getElementById('control-tenant-switch');
  if (switchContainer) {
    if (allowedTenants.length > 1) {
      switchContainer.innerHTML = switchHtml;
      switchContainer.classList.remove('hidden');
      switchContainer.classList.add('flex');
    } else {
      switchContainer.classList.add('hidden');
      switchContainer.classList.remove('flex');
    }
    return;
  }

  if (activeRole !== 'verificador') return;
  const navContainer = document.querySelector('nav .container');
  if (!navContainer) return;
  navContainer.dataset.verifierTenantNav = 'true';
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
    return `<a href="${buildTenantPageHref(currentTenant, item.file)}" class="${baseClass} px-4 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap flex items-center gap-2"><i class="fa-solid ${item.icon}"></i>${item.label}</a>`;
  }).join('');

  navContainer.innerHTML = `
    ${linksHtml}
    <div class="ml-auto flex items-center gap-1 rounded-full bg-white/10 p-1 shadow-inner backdrop-blur">
      ${switchHtml}
    </div>
  `;
}

function isAdminControlRoleActive() {
  const authCtx = window.__HUB_AUTH_CONTEXT || {};
  return authCtx.isAdmin === true || normalizeRoleName(state.access?.role || authCtx.role || authCtx.profile?.role || '') === 'admin';
}

function readAdminVerifierMode() {
  return false;
}

function setAdminVerifierMode(enabled) {
  adminVerifierMode = false;
  try {
    localStorage.removeItem(CONTROL_ADMIN_VERIFIER_MODE_STORAGE_KEY);
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

function getAuthToken() {
  const keys = ['pb_native_auth_v1', 'pb_compat_auth_v1', 'pb_auth'];
  for (const key of keys) {
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

function hasClockTime(value) {
  return /[T\s]\d{2}:\d{2}:\d{2}/.test(String(value || '').trim());
}

function hasNonZeroClockTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return false;
  return match[1] !== '00' || match[2] !== '00' || match[3] !== '00';
}

function resolveBestDateTime(...values) {
  const clean = values.map(value => String(value || '').trim()).filter(Boolean);
  return clean.find(hasNonZeroClockTime) || clean.find(hasClockTime) || clean[0] || '';
}

function resolveRecordCreatedTimestamp(row) {
  return resolveBestDateTime(row?.created_at, row?.created, row?.updated_at, row?.updated);
}

function resolveRecordUpdatedTimestamp(row) {
  return resolveBestDateTime(row?.updated_at, row?.updated, row?.created_at, row?.created);
}

function resolveMovementTimestamp(row) {
  return resolveBestDateTime(row?.created_at, row?.created, row?.updated_at, row?.updated);
}

function getClientValidation(client) {
  return safeObject(client?.expediente_validacion);
}

function getClientValidationDocs(client) {
  return safeObject(getClientValidation(client).documents);
}

function getClientDocState(client, field) {
  const validationDocs = getClientValidationDocs(client);
  const validationDoc = safeObject(validationDocs[field]);
  const docStates = safeObject(client?.documentos_estado);
  const docState = safeObject(docStates[field]);
  const rawFile = Array.isArray(client?.[field]) ? client[field][0] : client?.[field];
  const fileName = String(rawFile || validationDoc.fileName || '').trim();
  const uploaded = !!fileName;
  const status = String(docState.status || validationDoc.estado || (uploaded ? 'pendiente' : 'pendiente')).trim().toLowerCase();
  const omitted = docState.omitido === true || validationDoc.omitido === true || status === 'omitido';
  return {
    fileName,
    uploaded,
    status: omitted ? 'omitido' : status,
    omitted,
    reason: String(docState.motivo || validationDoc.motivo || '').trim(),
    reviewedByName: String(docState.aprobado_por_nombre || docState.revisado_por_nombre || validationDoc.aprobadoPorNombre || validationDoc.revisadoPorNombre || '').trim(),
    reviewedAt: String(docState.aprobado_at || docState.revisado_at || validationDoc.aprobadoAt || validationDoc.revisadoAt || '').trim()
  };
}

function getClientDocDate(client, fieldName) {
  const direct = normalizeStoredDate(client?.[fieldName]);
  if (direct) return direct;
  const validation = getClientValidation(client);
  if (fieldName === 'constancia_fiscal_emitida_el') {
    return normalizeStoredDate(validation.constanciaFiscalEmitidaEl || validation.constancia_fiscal_emitida_el);
  }
  if (fieldName === 'comprobante_domicilio_emitido_el') {
    return normalizeStoredDate(validation.comprobanteDomicilioEmitidoEl || validation.comprobante_domicilio_emitido_el);
  }
  return '';
}

function getClientRequirements() {
  return DOC_REQUIREMENTS[TENANT_SLUG] || DOC_REQUIREMENTS.plaza_mayor;
}

function summarizeClientDocuments(client) {
  const requirements = getClientRequirements();
  let coveredCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let expiredCount = 0;

  requirements.forEach((item) => {
    const doc = getClientDocState(client, item.field);
    const expiry = item.dateField ? calcExpiryStatus(getClientDocDate(client, item.dateField), item.validDays || 0) : { status: 'missing' };
    const isExpired = !!item.dateField && doc.uploaded && expiry.status === 'expired';
    if (doc.omitted) {
      coveredCount += 1;
      return;
    }
    if (isExpired) {
      expiredCount += 1;
      pendingCount += 1;
      return;
    }
    if (!doc.uploaded) {
      pendingCount += 1;
      return;
    }
    if (doc.status === 'rechazado') {
      rejectedCount += 1;
      pendingCount += 1;
      return;
    }
    if (doc.status === 'aprobado' || doc.status === 'pendiente') {
      coveredCount += 1;
      return;
    }
    pendingCount += 1;
  });

  return { totalCount: requirements.length, coveredCount, pendingCount, rejectedCount, expiredCount };
}

function getClientStatusLabel(client) {
  const summary = summarizeClientDocuments(client);
  const profileStatus = normalizeText(client?.perfil_estatus || '');
  const constanciaExpiry = calcExpiryStatus(getClientDocDate(client, 'constancia_fiscal_emitida_el'), CONSTANCIA_VALID_DAYS);
  const comprobanteExpiry = calcExpiryStatus(getClientDocDate(client, 'comprobante_domicilio_emitido_el'), COMPROBANTE_VALID_DAYS);
  if (client?.perfil_validado === true || profileStatus === 'validado') return 'Validado';
  if (constanciaExpiry.status === 'expired') return 'Constancia vencida';
  if (comprobanteExpiry.status === 'expired') return 'Comprobante vencido';
  if (summary.rejectedCount > 0 || profileStatus === 'rechazado_parcial') return 'Rechazo parcial';
  if (summary.pendingCount === 0 && summary.coveredCount === summary.totalCount) return 'En revision';
  return 'Pendiente';
}

function buildClientPublicProfileUrl(client) {
  const clientId = String(client?.id || '').trim();
  if (!clientId) return '';
  const url = new URL(PUBLIC_PROFILE_PATH, window.location.href);
  return url.toString();
}

async function buildClientPublicProfileDirectUrl(client) {
  const clientId = String(client?.id || '').trim();
  if (!clientId) throw new Error('No se pudo abrir el expediente.');
  const token = getAuthToken();
  if (!token) throw new Error('No se encontro una sesion valida.');
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
  if (!resp.ok || !payload.accessToken) throw new Error(payload.message || 'No se pudo abrir el expediente.');
  const url = new URL(PUBLIC_PROFILE_PATH, window.location.href);
  url.searchParams.set('access', payload.accessToken);
  return url.toString();
}

async function openClientPublicProfile(client) {
  let popup = null;
  try {
    popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    const url = await buildClientPublicProfileDirectUrl(client);
    if (popup) popup.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (popup) popup.close();
    window.showToast?.(error?.message || 'No se pudo abrir el expediente.', 'error');
  }
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getClientContactValues(client, primaryField, extraField) {
  return uniqueNonEmpty([client?.[primaryField], ...safeArray(client?.[extraField])]);
}

function renderContactPills(values, emptyText) {
  if (!values.length) return `<span class="text-xs font-semibold text-gray-400">${escapeHTML(emptyText)}</span>`;
  return values.map((value) => `
    <span class="inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-600">${escapeHTML(value)}</span>
  `).join('');
}

function getDocumentStatusLabel(doc) {
  if (doc.omitted) return 'Omitido';
  if (!doc.uploaded) return 'Pendiente de carga';
  if (doc.status === 'aprobado') return 'Aprobado';
  if (doc.status === 'rechazado') return 'Rechazado';
  return 'Pendiente de revisión';
}

function getDocumentValidityLabel(client, item, doc) {
  if (!item.dateField) return 'Sin vigencia configurada';
  if (!doc.uploaded) return 'Sin archivo cargado';
  const issued = getClientDocDate(client, item.dateField);
  const expiry = calcExpiryStatus(issued, item.validDays || 0);
  if (!issued) return 'Sin fecha de emision';
  const statusLabels = {
    expired: 'Vencido',
    critical: 'Por vencer',
    warning: 'Vigente con alerta',
    ok: 'Vigente',
    missing: 'Sin vigencia'
  };
  return `Emitido: ${formatDate(issued)} · ${statusLabels[expiry.status] || 'Sin vigencia'}${expiry.expiry ? ` · vence ${formatDate(expiry.expiry)}` : ''}`;
}

function renderClientProfileDocuments(client) {
  return getClientRequirements().map((item) => {
    const doc = getClientDocState(client, item.field);
    const reviewer = doc.reviewedByName
      ? `${doc.reviewedByName}${doc.reviewedAt ? ` · ${formatDateTime(doc.reviewedAt)}` : ''}`
      : 'Sin revision registrada';
    return `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-gray-800">${escapeHTML(item.label)}</p>
            <p class="mt-1 text-xs text-gray-500">${escapeHTML(doc.fileName || 'Sin archivo')}</p>
          </div>
          <span class="inline-flex w-fit rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600">${escapeHTML(getDocumentStatusLabel(doc))}</span>
        </div>
        <p class="mt-3 text-[11px] font-semibold text-gray-500">${escapeHTML(getDocumentValidityLabel(client, item, doc))}</p>
        <p class="mt-1 text-[11px] text-gray-400">Revisión: ${escapeHTML(reviewer)}</p>
      </div>
    `;
  }).join('');
}

function ensureControlClientProfileModal() {
  let modal = document.getElementById('control-client-profile-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'control-client-profile-modal';
  modal.className = 'fixed inset-0 z-[90] hidden overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="mx-auto max-w-4xl rounded-3xl bg-white shadow-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.22em] text-brand-red">Perfil del cliente</p>
          <h3 data-control-profile-title class="mt-1 text-xl font-black text-gray-900">Cliente</h3>
        </div>
        <button data-control-profile-close class="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-500 transition hover:bg-gray-50">Cerrar</button>
      </div>
      <div data-control-profile-body class="p-5"></div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-control-profile-close]')) {
      modal.classList.add('hidden');
    }
  });
  document.body.appendChild(modal);
  return modal;
}

function openControlClientProfileModal(client) {
  if (!client) return;
  const modal = ensureControlClientProfileModal();
  const title = modal.querySelector('[data-control-profile-title]');
  const body = modal.querySelector('[data-control-profile-body]');
  const latest = latestMovementByClientId().get(String(client?.id || ''));
  const phones = getClientContactValues(client, 'telefono', 'telefonos_adicionales');
  const emails = getClientContactValues(client, 'correo', 'correos_adicionales');
  const summary = summarizeClientDocuments(client);
  if (title) title.textContent = client?.nombre_completo || 'Cliente';
  if (body) {
    body.innerHTML = `
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">RFC</p>
          <p class="mt-2 text-sm font-black text-gray-800">${escapeHTML(client?.rfc || '--')}</p>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</p>
          <p class="mt-2 text-sm font-black text-gray-800">${escapeHTML(getClientStatusLabel(client))}</p>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Documentos</p>
          <p class="mt-2 text-sm font-black text-gray-800">${summary.coveredCount}/${summary.totalCount} cubiertos</p>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-gray-100 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Telefonos</p>
          <div class="mt-3 flex flex-wrap gap-2">${renderContactPills(phones, 'Sin telefonos')}</div>
        </div>
        <div class="rounded-2xl border border-gray-100 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Correos</p>
          <div class="mt-3 flex flex-wrap gap-2">${renderContactPills(emails, 'Sin correos')}</div>
        </div>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-gray-100 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fechas del perfil</p>
          <p class="mt-2 text-xs font-semibold text-gray-600">Creado: ${escapeHTML(formatDateTime(resolveRecordCreatedTimestamp(client)))}</p>
          <p class="mt-1 text-xs font-semibold text-gray-600">Actualizado: ${escapeHTML(formatDateTime(resolveRecordUpdatedTimestamp(client)))}</p>
        </div>
        <div class="rounded-2xl border border-gray-100 p-4">
          <p class="text-[10px] font-black uppercase tracking-wide text-gray-400">Último movimiento</p>
          <p class="mt-2 text-xs font-semibold text-gray-700">${escapeHTML(latest?.resumen || 'Sin movimientos')}</p>
          <p class="mt-1 text-[11px] text-gray-400">${escapeHTML(formatDateTime(resolveMovementTimestamp(latest) || resolveRecordUpdatedTimestamp(client)))}</p>
        </div>
      </div>
      <div class="mt-5">
        <p class="mb-3 text-[10px] font-black uppercase tracking-wide text-gray-400">Documentos del expediente</p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">${renderClientProfileDocuments(client)}</div>
      </div>
    `;
  }
  modal.classList.remove('hidden');
}

function getTenantDictamenCode() {
  return TENANT_SLUG === 'casa_de_piedra' ? 'CP' : 'PM';
}

function getTenantDictamenLabel() {
  return TENANT_SLUG === 'casa_de_piedra' ? 'Casa de Piedra' : 'Plaza Mayor';
}

const CONTROL_DICTAMEN_COLLECTION = 'clientes_dictamenes';
const CONTROL_DICTAMEN_OVERLAY_TYPE = 'generator:dictamenes';
const CONTROL_DICTAMEN_FONT_MAP = Object.freeze({
  segoe: '"Segoe UI", Arial, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const CONTROL_DICTAMEN_STYLE_DEFAULTS = Object.freeze({
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
    annexHintBody: 'Informacion complementaria relevante para la validacion del expediente.'
  }
});

function clampControlDictamenNumber(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeControlDictamenAlign(value, fallback = 'left') {
  const safe = String(value || '').toLowerCase();
  return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function normalizeControlDictamenHex(value, fallback) {
  const raw = String(value || '').trim();
  const candidate = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

function normalizeControlDictamenOrientation(value) {
  return String(value || '').toLowerCase() === 'portrait' ? 'portrait' : 'landscape';
}

function getControlDictamenPageSize(style = {}) {
  const orientation = normalizeControlDictamenOrientation(style.orientation);
  return orientation === 'portrait'
    ? { width: 816, height: 1056, orientation }
    : { width: 1056, height: 816, orientation };
}

function getControlDictamenBrandColor() {
  const fallback = TENANT_SLUG === 'casa_de_piedra' ? '#c1621e' : '#d32f2f';
  return normalizeControlDictamenHex(PAGE_CFG.brandColor, fallback);
}

function getControlDictamenYear() {
  return new Date().getFullYear();
}

function getControlDictamenYearSuffix(year = getControlDictamenYear()) {
  return String(year).slice(-2).padStart(2, '0');
}

function getControlDictamenStableNumber(seed, min = 1, span = 999) {
  const raw = String(seed || '').trim() || `${TENANT_SLUG}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return min + (Math.abs(hash) % span);
}

function getControlDictamenLegalMeta(client) {
  const validation = safeObject(client?.expediente_validacion);
  return safeObject(
    validation.dictamenJuridico ||
    validation.dictamen_juridico ||
    validation.legalDictamen ||
    validation.legal_dictamen ||
    client?.dictamen_juridico
  );
}

function getControlDictamenExternalCaseNumber(client) {
  const legal = getControlDictamenLegalMeta(client);
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
  return String(getControlDictamenStableNumber(`${TENANT_SLUG}|${client?.id}|${client?.created_at || client?.created || ''}`, 10000, 90000));
}

function parseControlDictamenFolioSequence(folio, year = getControlDictamenYear()) {
  const match = String(folio || '').trim().toUpperCase().match(new RegExp(`^DF${getControlDictamenYearSuffix(year)}(\\d+)$`));
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function buildNextControlDictamenFolio(client, year = getControlDictamenYear()) {
  if (!window.tenantPocketBase) return buildDictamenFolio(client, year);
  const start = `${year}-01-01 00:00:00.000Z`;
  const end = `${year + 1}-01-01 00:00:00.000Z`;
  try {
    const { data, error } = await window.tenantPocketBase
      .from(CONTROL_DICTAMEN_COLLECTION)
      .select('folio,metadata')
      .gte('metadata.generated_at', start)
      .lt('metadata.generated_at', end)
      .limit(500);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const maxSequence = rows.reduce((max, row) => Math.max(max, parseControlDictamenFolioSequence(row?.folio, year)), 0);
    return `DF${getControlDictamenYearSuffix(year)}${String(maxSequence + 1).padStart(3, '0')}`;
  } catch (_) {
    return buildDictamenFolio(client, year);
  }
}

function buildControlDictamenFileName(client, folio, year = getControlDictamenYear()) {
  const tenantCode = getTenantDictamenCode();
  const caseNumber = getControlDictamenExternalCaseNumber(client);
  return `${String(folio || buildDictamenFolio(client, year)).toUpperCase()} DICTAMEN JURIDICO ${tenantCode} ${year} #${caseNumber}.pdf`;
}

function buildDictamenFolio(client, year = getControlDictamenYear()) {
  const sequence = getControlDictamenStableNumber(`${TENANT_SLUG}|${client?.id}|${client?.created_at || client?.created || ''}`, 1, 999);
  return `DF${getControlDictamenYearSuffix(year)}${String(sequence).padStart(3, '0')}`;
}

function normalizeControlDictamenPdfResources(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const accent = getControlDictamenBrandColor();
  return list.slice(0, 120).map((item, index) => {
    const base = item && typeof item === 'object' ? item : {};
    const type = ['bar', 'title', 'text'].includes(String(base.type || '').toLowerCase())
      ? String(base.type).toLowerCase()
      : 'text';
    return {
      id: String(base.id || `dictamen_res_${Date.now()}_${index}`),
      type,
      enabled: base.enabled !== false,
      page: clampControlDictamenNumber(base.page, 1, 8, 1),
      x: clampControlDictamenNumber(base.x, -220, 920, 88),
      y: clampControlDictamenNumber(base.y, -220, 1420, 120),
      w: clampControlDictamenNumber(base.w, 16, 940, type === 'bar' ? 260 : 290),
      h: clampControlDictamenNumber(base.h, 10, 1240, type === 'bar' ? 14 : 44),
      text: String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 1200),
      fontSize: clampControlDictamenNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
      bold: base.bold !== false,
      locked: base.locked === true,
      align: normalizeControlDictamenAlign(base.align, 'left'),
      color: normalizeControlDictamenHex(base.color, '#111827'),
      bgColor: normalizeControlDictamenHex(base.bgColor, type === 'bar' ? accent : '#ffffff')
    };
  });
}

function normalizeControlDictamenPdfContent(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const defaults = CONTROL_DICTAMEN_STYLE_DEFAULTS.content;
  return {
    dictamenTitle: String(base.dictamenTitle ?? defaults.dictamenTitle).slice(0, 120),
    dictamenNotes: String(base.dictamenNotes ?? defaults.dictamenNotes).slice(0, 2000),
    dictamenSigner: String(base.dictamenSigner ?? defaults.dictamenSigner).slice(0, 160),
    annexHintTitle: String(base.annexHintTitle ?? defaults.annexHintTitle).slice(0, 120),
    annexHintBody: String(base.annexHintBody ?? defaults.annexHintBody).slice(0, 900)
  };
}

function normalizeControlDictamenPdfStyle(raw = {}) {
  const base = { ...CONTROL_DICTAMEN_STYLE_DEFAULTS, ...(raw || {}) };
  const fontKey = String(base.fontFamilyKey || '').toLowerCase();
  return {
    fontFamilyKey: CONTROL_DICTAMEN_FONT_MAP[fontKey] ? fontKey : CONTROL_DICTAMEN_STYLE_DEFAULTS.fontFamilyKey,
    orientation: normalizeControlDictamenOrientation(base.orientation || CONTROL_DICTAMEN_STYLE_DEFAULTS.orientation),
    titlePx: clampControlDictamenNumber(base.titlePx, 20, 42, CONTROL_DICTAMEN_STYLE_DEFAULTS.titlePx),
    metaPx: clampControlDictamenNumber(base.metaPx, 8, 18, CONTROL_DICTAMEN_STYLE_DEFAULTS.metaPx),
    tableHeadPx: clampControlDictamenNumber(base.tableHeadPx, 9, 18, CONTROL_DICTAMEN_STYLE_DEFAULTS.tableHeadPx),
    tableBodyPx: clampControlDictamenNumber(base.tableBodyPx, 9, 16, CONTROL_DICTAMEN_STYLE_DEFAULTS.tableBodyPx),
    lineHeightPct: clampControlDictamenNumber(base.lineHeightPct, 90, 180, CONTROL_DICTAMEN_STYLE_DEFAULTS.lineHeightPct),
    quickPx: clampControlDictamenNumber(base.quickPx, 9, 16, CONTROL_DICTAMEN_STYLE_DEFAULTS.quickPx),
    conditionsPx: clampControlDictamenNumber(base.conditionsPx, 9, 18, CONTROL_DICTAMEN_STYLE_DEFAULTS.conditionsPx),
    footerPx: clampControlDictamenNumber(base.footerPx, 8, 14, CONTROL_DICTAMEN_STYLE_DEFAULTS.footerPx),
    offsetXPx: clampControlDictamenNumber(base.offsetXPx, -120, 120, CONTROL_DICTAMEN_STYLE_DEFAULTS.offsetXPx),
    offsetYPx: clampControlDictamenNumber(base.offsetYPx, -120, 120, CONTROL_DICTAMEN_STYLE_DEFAULTS.offsetYPx),
    extraPages: clampControlDictamenNumber(base.extraPages, -1, 6, CONTROL_DICTAMEN_STYLE_DEFAULTS.extraPages),
    resources: normalizeControlDictamenPdfResources(base.resources),
    headerAlign: normalizeControlDictamenAlign(base.headerAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.headerAlign),
    metaAlign: normalizeControlDictamenAlign(base.metaAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.metaAlign),
    tableAlign: normalizeControlDictamenAlign(base.tableAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.tableAlign),
    quickAlign: normalizeControlDictamenAlign(base.quickAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.quickAlign),
    conditionsAlign: normalizeControlDictamenAlign(base.conditionsAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.conditionsAlign),
    footerAlign: normalizeControlDictamenAlign(base.footerAlign, CONTROL_DICTAMEN_STYLE_DEFAULTS.footerAlign),
    content: normalizeControlDictamenPdfContent(base.content)
  };
}

function pickLatestControlDictamenRecord(rows) {
  const list = Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') : [];
  if (!list.length) return null;
  list.sort((a, b) => {
    const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
    const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
    return bTs - aTs;
  });
  return list[0] || null;
}

async function loadControlDictamenPdfStyle() {
  const clients = [];
  if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
  if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
  for (const pbClient of clients) {
    try {
      const { data, error } = await pbClient
        .from('pdf_overlays')
        .select('id,config_json,elements,updated,created,updated_at,created_at')
        .eq('tenant', TENANT_SLUG)
        .eq('document_type', CONTROL_DICTAMEN_OVERLAY_TYPE);
      if (error) throw error;
      const row = pickLatestControlDictamenRecord(Array.isArray(data) ? data : (data ? [data] : []));
      if (!row) continue;
      const config = safeObject(row.config_json || row.elements);
      const profiles = safeObject(config.profiles);
      return normalizeControlDictamenPdfStyle(profiles.dictamen || config);
    } catch (_) {}
  }
  return normalizeControlDictamenPdfStyle();
}

function canSaveControlDictamenTemplate() {
  const auth = window.__HUB_AUTH_CONTEXT || {};
  const role = normalizeRoleName(auth.role || auth.profile?.role || state.access?.role || '');
  return auth.isAdmin === true || role === 'admin';
}

async function saveControlDictamenPdfStyle(style) {
  if (!window.tenantPocketBase) throw new Error('PocketBase no disponible.');
  const normalized = normalizeControlDictamenPdfStyle(style || {});
  const { data, error } = await window.tenantPocketBase
    .from('pdf_overlays')
    .select('id,config_json,elements,updated,created,updated_at,created_at')
    .eq('tenant', TENANT_SLUG)
    .eq('document_type', CONTROL_DICTAMEN_OVERLAY_TYPE)
    .limit(20);
  if (error) throw error;

  const row = pickLatestControlDictamenRecord(Array.isArray(data) ? data : (data ? [data] : []));
  const config = safeObject(row?.config_json || row?.elements);
  const profiles = safeObject(config.profiles);
  const nextConfig = {
    ...config,
    profiles: { ...profiles, dictamen: normalized },
    updated_at: new Date().toISOString()
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
      tenant: TENANT_SLUG,
      document_type: CONTROL_DICTAMEN_OVERLAY_TYPE,
      config_json: nextConfig,
      elements: nextConfig
    });
  if (insertError) throw insertError;
}

function resolveControlDictamenTemplateString(value, context = {}) {
  let output = String(value ?? '');
  Object.entries(context && typeof context === 'object' ? context : {}).forEach(([key, resolvedValue]) => {
    const token = String(key || '').trim();
    if (!token) return;
    const pattern = new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
    output = output.replace(pattern, String(resolvedValue ?? ''));
  });
  return output;
}

function getControlDictamenActorMeta() {
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
    role: String(auth.role || auth.profile?.role || user.role || state.access?.role || '').trim()
  };
}

function buildControlDictamenTemplateContext(client, folio, title) {
  const actor = getControlDictamenActorMeta();
  return {
    CLIENT_NAME: client?.nombre_completo || '',
    CLIENT_EMAIL: client?.correo || '',
    CLIENT_PHONE: client?.telefono || '',
    CLIENT_RFC: client?.rfc || '',
    FOLIO: folio || '',
    DOC_TITLE: title || 'DICTAMEN LEGAL DOCUMENTOS PROTOCOLIZADOS',
    TODAY: new Date().toLocaleDateString('es-MX'),
    CURRENT_USER_NAME: actor.name,
    CURRENT_USER_EMAIL: actor.email,
    GENERATED_BY: actor.name,
    APPROVER_NAME: actor.name,
    VENUE_NAME: getTenantDictamenLabel()
  };
}

function renderControlDictamenPdfResources(style, pageIndex, templateContext = {}) {
  const cfg = normalizeControlDictamenPdfStyle(style || {});
  const fontFamily = CONTROL_DICTAMEN_FONT_MAP[cfg.fontFamilyKey] || CONTROL_DICTAMEN_FONT_MAP.segoe;
  return cfg.resources
    .filter(resource => resource.enabled && resource.page === pageIndex)
    .map((resource) => {
      const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:none;`;
      if (resource.type === 'bar') {
        return `<div class="dictamen-render-resource" data-dictamen-resource-id="${escapeHTML(resource.id)}" style="${common}background:${resource.bgColor};border-radius:2px;"></div>`;
      }
      const text = resolveControlDictamenTemplateString(resource.text || '', templateContext);
      return `<div class="dictamen-render-resource" data-dictamen-resource-id="${escapeHTML(resource.id)}" style="${common}background:${resource.bgColor};color:${resource.color};font-family:${fontFamily};font-size:${resource.fontSize}px;font-weight:${resource.bold ? 800 : 500};line-height:1.2;text-align:${resource.align};padding:4px 6px;white-space:pre-wrap;overflow:hidden;border-radius:2px;">${escapeHTML(text)}</div>`;
    }).join('');
}

function buildControlDictamenExtraPages(style, templateContext = {}) {
  const cfg = normalizeControlDictamenPdfStyle(style || {});
  const count = Math.max(0, cfg.extraPages);
  if (!count) return '';
  const content = cfg.content || {};
  const title = escapeHTML(resolveControlDictamenTemplateString(content.annexHintTitle || 'Anexos del Dictamen', templateContext));
  const body = escapeHTML(resolveControlDictamenTemplateString(content.annexHintBody || '', templateContext)).replace(/\r?\n/g, '<br>');
  return Array.from({ length: count }).map((_, index) => {
    const pageIndex = index + 2;
    return `<section class="dictamen-pdf-page dictamen-extra-page">
      ${renderControlDictamenPdfResources(cfg, pageIndex, templateContext)}
      <div class="dictamen-content">
        <span class="pill">Anexo ${pageIndex - 1}</span>
        <h2>${title}</h2>
        <p class="dictamen-annex">${body || 'Sin informacion complementaria capturada.'}</p>
      </div>
    </section>`;
  }).join('');
}

function getDictamenRequirementDetail(item) {
  if (!item?.field) return 'Sin detalle';
  if (item.field === 'doc_acta_constitutiva') return 'Documento legal completo y legible.';
  if (item.field === 'doc_ine') return 'Identificación oficial vigente y legible.';
  if (item.field === 'doc_comprobante_domicilio') return 'Recibo de luz, agua o teléfono vigente durante el mes de emisión y los 2 meses siguientes.';
  if (item.field === 'doc_constancia_fiscal') return 'Constancia SAT legible con vigencia operativa de 30 días.';
  return item.label || 'Documento';
}

function getDictamenStatusLabel(doc, expiry) {
  if (doc.omitted) return 'Omitido';
  if (!doc.uploaded) return 'Faltante';
  if (doc.status === 'aprobado') return 'Aprobado';
  if (doc.status === 'rechazado') return 'Rechazado';
  if (expiry && expiry.status === 'expired') return 'Vencido';
  return 'En revision';
}

function getDictamenExpiryText(expiry) {
  if (!expiry || expiry.daysLeft === null) return 'Sin vigencia capturada';
  if (expiry.status === 'expired') return `Vencido hace ${Math.abs(expiry.daysLeft)} dia(s)`;
  return `Vence el ${formatDate(expiry.expiry)}`;
}

function getControlDictamenLegalValue(source, keys, fallback = '') {
  const obj = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function formatControlDictamenLegalDate(value) {
  const normalized = normalizeStoredDate(value);
  if (!normalized) return String(value || '').trim();
  const [year, month, day] = normalized.split('-');
  return `${day}/${month}/${year}`;
}

function buildControlDictamenLegalData(client, folio) {
  const legal = getControlDictamenLegalMeta(client);
  const protocol = safeObject(legal.documentosProtocolizados || legal.documentos_protocolizados || legal.protocolizado || legal.sociedad);
  const attorney = safeObject(legal.apoderados || legal.apoderado || legal.poderes || legal.representante);
  const validation = safeObject(client?.expediente_validacion);
  const docStates = safeObject(client?.documentos_estado);
  const actaState = safeObject(docStates.doc_acta_constitutiva);
  const constanciaState = safeObject(docStates.doc_constancia_fiscal);
  const comprobanteState = safeObject(docStates.doc_comprobante_domicilio);
  const sociedad = getControlDictamenLegalValue(protocol, ['sociedad', 'razonSocial', 'razon_social', 'cliente'], client?.nombre_completo || '--').toUpperCase();
  const nombreComercial = getControlDictamenLegalValue(attorney, ['nombreComercial', 'nombre_comercial'], sociedad).toUpperCase();
  const domicilio = getControlDictamenLegalValue(protocol, ['domicilio', 'domicilioFiscal', 'domicilio_fiscal'], getControlDictamenLegalValue(validation, ['domicilio', 'domicilioFiscal', 'domicilio_fiscal'], '--')).toUpperCase();
  const ciudad = getControlDictamenLegalValue(protocol, ['ciudad', 'municipio'], getControlDictamenLegalValue(attorney, ['ciudad', 'municipio'], '--')).toUpperCase();
  const folioDocumento = getControlDictamenLegalValue(protocol, ['folio', 'folioMercantil', 'folio_mercantil'], getControlDictamenLegalValue(attorney, ['folio', 'folioMercantil', 'folio_mercantil'], '--'));
  const fechaDocumento = getControlDictamenLegalValue(protocol, ['fechaDocumento', 'fecha_documento', 'fechaActo', 'fecha_acto'], normalizeStoredDate(actaState.subido_at || client?.created_at || client?.created));
  const fechaPoder = getControlDictamenLegalValue(attorney, ['fechaDocumento', 'fecha_documento', 'fechaPoder', 'fecha_poder'], normalizeStoredDate(constanciaState.subido_at || comprobanteState.subido_at || client?.updated_at || client?.updated));
  return {
    sociedad,
    tipoActo: getControlDictamenLegalValue(protocol, ['tipoActo', 'tipo_acto', 'acto'], client?.doc_acta_constitutiva ? 'CONSTITUTIVA' : '--').toUpperCase(),
    fechaActo: formatControlDictamenLegalDate(getControlDictamenLegalValue(protocol, ['fechaActo', 'fecha_acto'], fechaDocumento)),
    resumen: getControlDictamenLegalValue(protocol, ['resumen', 'resumenRelevante', 'resumen_relevante', 'objetoSocial', 'objeto_social'], 'DATOS TOMADOS DE LOS DOCUMENTOS CARGADOS AL EXPEDIENTE DIGITAL.').toUpperCase(),
    fechaInscripcion: formatControlDictamenLegalDate(getControlDictamenLegalValue(protocol, ['fechaInscripcion', 'fecha_inscripcion'], '')),
    numeroActa: getControlDictamenLegalValue(protocol, ['numeroActa', 'numero_acta', 'acta'], '--'),
    fechaDocumento: formatControlDictamenLegalDate(fechaDocumento),
    notario: getControlDictamenLegalValue(protocol, ['notario', 'notarioNumero', 'notario_numero', 'notaria'], '--').toUpperCase(),
    ciudad,
    folioDocumento,
    rfc: String(client?.rfc || '--').toUpperCase(),
    domicilio,
    cliente: sociedad,
    nombreComercial,
    apoderado: getControlDictamenLegalValue(attorney, ['apoderado', 'representante', 'representanteLegal', 'representante_legal'], '--').toUpperCase(),
    facultades: getControlDictamenLegalValue(attorney, ['facultades', 'poderes'], 'PODERES Y FACULTADES SEGUN DOCUMENTACION CARGADA.').toUpperCase(),
    limitaciones: getControlDictamenLegalValue(attorney, ['limitaciones', 'restricciones'], 'SIN LIMITACIONES REGISTRADAS').toUpperCase(),
    poderFechaInscripcion: formatControlDictamenLegalDate(getControlDictamenLegalValue(attorney, ['fechaInscripcion', 'fecha_inscripcion'], '')),
    poderNumeroActa: getControlDictamenLegalValue(attorney, ['numeroActa', 'numero_acta', 'acta'], '--'),
    poderFechaDocumento: formatControlDictamenLegalDate(fechaPoder),
    poderNotario: getControlDictamenLegalValue(attorney, ['notario', 'notarioNumero', 'notario_numero', 'notaria'], '--').toUpperCase(),
    poderCiudad: getControlDictamenLegalValue(attorney, ['ciudad', 'municipio'], ciudad).toUpperCase(),
    poderFolio: getControlDictamenLegalValue(attorney, ['folio', 'folioMercantil', 'folio_mercantil'], folioDocumento),
    vigente: getControlDictamenLegalValue(attorney, ['vigente', 'vigenteSiNo', 'vigente_si_no'], 'SI').toUpperCase(),
    terminoVigencia: getControlDictamenLegalValue(attorney, ['terminoVigencia', 'termino_vigencia', 'vigencia'], 'VIGENTE').toUpperCase(),
    folioDictamen: String(folio || '').toUpperCase()
  };
}

function getControlDictamenLegalFooterDate() {
  const date = new Date();
  return `León, Guanajuato a ${date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function buildControlDictamenDocumentSnapshot(client) {
  const docStates = safeObject(client?.documentos_estado);
  return getClientRequirements().map((item) => {
    const doc = getClientDocState(client, item.field);
    const stateItem = safeObject(docStates[item.field]);
    return {
      field: item.field,
      label: item.label,
      fileName: doc.fileName || '',
      uploaded: doc.uploaded === true,
      status: doc.status || '',
      omitted: doc.omitted === true,
      reason: doc.reason || '',
      validityDate: item.dateField ? getClientDocDate(client, item.dateField) : '',
      reviewedByName: doc.reviewedByName || '',
      reviewedAt: doc.reviewedAt || '',
      updatedAt: String(stateItem.actualizado_at || stateItem.updated_at || '').trim(),
      updatedFromRejection: stateItem.actualizado_desde_rechazo === true
    };
  });
}

function stableControlDictamenStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableControlDictamenStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableControlDictamenStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashControlDictamenSnapshot(snapshot) {
  const raw = stableControlDictamenStringify(snapshot);
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

async function fetchControlDictamenHistory(clientId, limit = 1) {
  const safeClientId = String(clientId || '').trim();
  if (!safeClientId || !window.tenantPocketBase) return [];
  try {
    const { data, error } = await window.tenantPocketBase
      .from(CONTROL_DICTAMEN_COLLECTION)
      .select('id,tenant,cliente,folio,documentos_hash,responsable_nombre,pdf,metadata,created,created_at,updated,updated_at')
      .eq('cliente', safeClientId)
      .order('metadata.generated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : (data ? [data] : []);
  } catch (error) {
    console.warn('No se pudo cargar historico de dictamenes:', error);
    return [];
  }
}

async function persistControlDictamenSnapshot(client, folio, blob, filename, documentSnapshot) {
  if (state.access?.canVerify !== true || !client?.id || !blob) return { saved: false, reason: 'not_allowed' };
  const documentosHash = await hashControlDictamenSnapshot({
    tenant: TENANT_SLUG,
    clientId: client.id,
    documents: documentSnapshot
  });
  const history = await fetchControlDictamenHistory(client.id, 1);
  const latest = history[0] || null;
  const latestMeta = safeObject(latest?.metadata);
  const latestHash = String(latest?.documentos_hash || latestMeta.documentos_hash || '').trim();
  if (latestHash && latestHash === documentosHash) {
    return { saved: false, reason: 'unchanged', latest, documentosHash };
  }

  const actor = getControlDictamenActorMeta();
  const generatedAt = new Date().toISOString();
  const form = new FormData();
  const uploadFile = typeof File !== 'undefined'
    ? new File([blob], filename, { type: 'application/pdf' })
    : new Blob([blob], { type: 'application/pdf' });
  form.append('tenant', TENANT_SLUG);
  form.append('cliente', client.id);
  form.append('folio', folio);
  form.append('documentos_hash', documentosHash);
  form.append('responsable_nombre', actor.name);
  form.append('metadata', JSON.stringify({
    version: 2,
    documentos_hash: documentosHash,
    documentos_snapshot: documentSnapshot,
    cliente_nombre: client?.nombre_completo || '',
    approval_status: 'aprobado',
    approved: true,
    generated_by: actor,
    generated_at: generatedAt,
    reviewed_by: actor,
    reviewed_at: generatedAt,
    approved_by: actor,
    approved_at: generatedAt,
    source: 'control'
  }));
  form.append('pdf', uploadFile, filename);

  const { data, error } = await window.tenantPocketBase
    .from(CONTROL_DICTAMEN_COLLECTION)
    .insert(form);
  if (error) throw error;
  return { saved: true, record: data, documentosHash };
}

function buildDictamenHtml(client, folio = buildDictamenFolio(client), pdfStyle = normalizeControlDictamenPdfStyle()) {
  const style = normalizeControlDictamenPdfStyle(pdfStyle);
  const fontFamily = CONTROL_DICTAMEN_FONT_MAP[style.fontFamilyKey] || CONTROL_DICTAMEN_FONT_MAP.segoe;
  const pageSize = getControlDictamenPageSize(style);
  const contentScale = pageSize.orientation === 'portrait' ? 0.76 : 1;
  const contentWidth = pageSize.orientation === 'portrait' ? 1056 : pageSize.width;
  const content = style.content || {};
  const reportTitle = resolveControlDictamenTemplateString(content.dictamenTitle || 'DICTAMEN LEGAL DOCUMENTOS PROTOCOLIZADOS', buildControlDictamenTemplateContext(client, folio, content.dictamenTitle || ''));
  const templateContext = buildControlDictamenTemplateContext(client, folio, reportTitle);
  const notesText = resolveControlDictamenTemplateString(content.dictamenNotes || 'EL QUE SUSCRIBE DA CERTEZA DE QUE LOS DATOS ASENTADOS CORRESPONDEN A DOCUMENTOS NOTARIADOS QUE SE TUVIERON A LA VISTA EN COPIA SIMPLE, LOS CUALES SE ENCUENTRAN VIGENTES A LA FECHA DE LA EMISION DEL PRESENTE DICTAMEN Y TIENEN VALIDEZ', templateContext);
  const signerName = resolveControlDictamenTemplateString(content.dictamenSigner || '{{CURRENT_USER_NAME}}', templateContext).trim() || getControlDictamenActorMeta().name;
  const legal = buildControlDictamenLegalData(client, folio);
  const legalCell = (value) => escapeHTML(String(value || '--').toUpperCase());
  const footerDate = getControlDictamenLegalFooterDate();

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(buildControlDictamenFileName(client, folio).replace(/\.pdf$/i, ''))}</title>
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
      ${renderControlDictamenPdfResources(style, 1, templateContext)}
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
    ${buildControlDictamenExtraPages(style, templateContext)}
  </div>
</body>
</html>`;
}

async function renderControlDictamenPdfBlob(reportHtml, filename) {
  if (!window.html2pdf) throw new Error('html2pdf no esta disponible.');
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.background = '#ffffff';
  host.innerHTML = reportHtml;
  document.body.appendChild(host);
  try {
    const target = host.querySelector('.dictamen-pdf-root') || host;
    const orientation = normalizeControlDictamenOrientation(target?.dataset?.orientation || 'landscape');
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

function downloadControlDictamenBlob(blob, filename) {
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

function downloadHtmlAsPdf(html, filename, fallbackMessage) {
  if (window.html2pdf) {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.width = '297mm';
    host.style.background = '#ffffff';
    host.innerHTML = html;
    document.body.appendChild(host);
    return window.html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f8fafc' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      })
      .from(host)
      .save()
      .catch((error) => {
        console.error(error);
        window.showToast?.('No se pudo generar el PDF.', 'error');
      })
      .finally(() => host.remove());
  }

  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=820');
  if (!popup) {
    window.showToast?.(fallbackMessage || 'Permite las ventanas emergentes para continuar.', 'error');
    return Promise.resolve();
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return Promise.resolve();
}

async function downloadClientDictamen(clientId) {
  const client = state.clients.find((item) => String(item?.id || '') === String(clientId || ''));
  if (!client) return window.showToast?.('No se encontro el cliente para generar el dictamen.', 'error');
  try {
    const folio = await buildNextControlDictamenFolio(client);
    const filename = buildControlDictamenFileName(client, folio);
    const pdfStyle = await loadControlDictamenPdfStyle();
    const canEditDictamenTemplate = canSaveControlDictamenTemplate() && !isAdminVerifierModeActive();
    if (!window.HubDictamenGenerator?.open) {
      window.showToast?.('No se pudo abrir el editor de dictamen.', 'error');
      return;
    }
    await window.HubDictamenGenerator.open({
      idPrefix: `control-${TENANT_SLUG}`,
      client,
      folio,
      filename,
      style: pdfStyle,
      brandColor: getControlDictamenBrandColor(),
      fontMap: CONTROL_DICTAMEN_FONT_MAP,
      normalizeStyle: normalizeControlDictamenPdfStyle,
      buildHtml: buildDictamenHtml,
      renderPdfBlob: renderControlDictamenPdfBlob,
      downloadBlob: downloadControlDictamenBlob,
      buildDocumentSnapshot: buildControlDictamenDocumentSnapshot,
      persistSnapshot: persistControlDictamenSnapshot,
      canSnapshot: state.access?.canVerify === true,
      canEdit: canEditDictamenTemplate,
      canSaveTemplate: canEditDictamenTemplate,
      saveTemplate: saveControlDictamenPdfStyle,
      showToast: (message, type) => window.showToast?.(message, type),
      onGenerated: () => loadControlData?.()
    });
  } catch (error) {
    console.error(error);
    window.showToast?.('No se pudo abrir el editor de dictamen.', 'error');
  }
}

function getMovementReportFilters() {
  return {
    actor: String(document.getElementById('filter-actor')?.value || '').trim(),
    type: String(document.getElementById('filter-type')?.value || '').trim(),
    search: String(document.getElementById('filter-search')?.value || '').trim(),
    dateFrom: String(document.getElementById('filter-date-from')?.value || '').trim(),
    dateTo: String(document.getElementById('filter-date-to')?.value || '').trim()
  };
}

function formatMovementTypeLabel(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '--';
  if (raw === 'modificacion_precio') return 'Modificacion de precio';
  return raw;
}

function getMovementSupervisionText(row) {
  const type = String(row?.tipo_movimiento || '').trim();
  const actor = String(row?.actor_nombre || 'Sistema').trim();
  const role = String(row?.actor_role || '').trim();
  const client = String(row?.cliente_nombre || '').trim();
  const documentName = String(row?.documento_nombre || '').trim();
  if (type === 'modificacion_precio') {
    return row?.resumen || `${actor}${role ? ` (${role})` : ''} modifico el precio${client ? ` de ${client}` : ''}.`;
  }
  if (type === 'documento_aprobado') {
    return `${actor}${role ? ` (${role})` : ''} aprobo ${documentName || 'un documento'}${client ? ` del cliente ${client}` : ''}.`;
  }
  if (type === 'documento_rechazado') {
    return `${actor}${role ? ` (${role})` : ''} rechazo ${documentName || 'un documento'}${client ? ` del cliente ${client}` : ''}.`;
  }
  if (type === 'documento_subido' || type === 'documento_reemplazado' || type === 'documento_actualizado') {
    return `${actor}${role ? ` (${role})` : ''} registro cambio en ${documentName || 'documento'}${client ? ` del cliente ${client}` : ''}.`;
  }
  if (String(row?.entidad_tipo || '').trim() === 'espacio' || type.indexOf('espacio_') === 0) {
    return row?.resumen || `${actor}${role ? ` (${role})` : ''} registro un movimiento de catalogo.`;
  }
  return row?.resumen || type || 'Movimiento registrado';
}

function buildMovementReportHtml(rows, generatedAtIso = '') {
  const filters = getMovementReportFilters();
  const actorValue = filters.actor || 'Todas las personas';
  const typeValue = filters.type ? formatMovementTypeLabel(filters.type) : 'Todos los movimientos';
  const searchValue = filters.search || 'Sin busqueda';
  const dateRange = `${filters.dateFrom || 'Sin inicio'} - ${filters.dateTo || 'Sin fin'}`;
  const generatedBy = getControlDictamenActorMeta();
  const generatedAt = getDateTimeParts(generatedAtIso || state.serverNowIso || new Date().toISOString());
  const approvalCount = rows.filter(row => String(row?.tipo_movimiento || '') === 'documento_aprobado').length;
  const metaRowsHtml = [
    ['Sede', PAGE_CFG.tenantLabel || TENANT_SLUG],
    ['Generado por', generatedBy.name || 'Usuario'],
    ['Usuario ID', generatedBy.id || '--'],
    ['Correo', generatedBy.email || '--'],
    ['Rol', generatedBy.role || '--'],
    ['Fecha de generacion', generatedAt.date],
    ['Hora de generacion', generatedAt.time],
    ['Filtro persona', actorValue],
    ['Filtro movimiento', typeValue],
    ['Filtro busqueda', searchValue],
    ['Rango de fechas', dateRange],
    ['Resultados', String(rows.length)],
    ['Aprobaciones de documentos', String(approvalCount)]
  ].map(([label, value]) => `
    <tr>
      <th>${escapeHTML(label)}</th>
      <td>${escapeHTML(value)}</td>
    </tr>
  `).join('');
  const rowsHtml = rows.map((row) => `
    <tr>
      <td>${escapeHTML(getDateTimeParts(resolveMovementTimestamp(row)).date)}</td>
      <td>${escapeHTML(getDateTimeParts(resolveMovementTimestamp(row)).time)}</td>
      <td>${escapeHTML(formatMovementTypeLabel(row.tipo_movimiento || '--'))}</td>
      <td>${escapeHTML(row.actor_nombre || 'Sistema')}<br><span>${escapeHTML(row.actor_role || '--')}</span></td>
      <td>${escapeHTML(row.cliente_nombre || row.entidad_nombre || '--')}<br><span>${escapeHTML(row.cliente_id || row.entidad_id || '--')}</span></td>
      <td>${escapeHTML(row.cotizacion_folio || (row.entidad_tipo === 'espacio' ? 'Catalogo' : '--'))}</td>
      <td>${escapeHTML(row.documento_nombre || row.entidad_nombre || row.entidad_tipo || '--')}</td>
      <td>${escapeHTML(getMovementSupervisionText(row))}<br><span>${escapeHTML(row.resumen || '--')}</span></td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte de movimientos - ${escapeHTML(PAGE_CFG.tenantLabel || TENANT_SLUG)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 28px 20px 40px; }
    h1 { margin: 0 0 14px; font-size: 28px; }
    h2 { margin: 22px 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; color: #64748b; }
    td span { color: #64748b; font-size: 10px; }
    tr:last-child td { border-bottom: none; }
    .meta-table { margin-bottom: 18px; }
    .meta-table th { width: 220px; }
  </style>
</head>
<body>
  <div class="shell">
    <h1>Reporte de movimientos</h1>
    <table class="meta-table">
      <tbody>${metaRowsHtml}</tbody>
    </table>
    <h2>Movimientos filtrados</h2>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Movimiento</th>
          <th>Actor</th>
          <th>Cliente / ID</th>
          <th>Folio</th>
          <th>Documento</th>
          <th>Detalle de supervision</th>
        </tr>
      </thead>
      <tbody>${rowsHtml || '<tr><td colspan="8">Sin movimientos para exportar.</td></tr>'}</tbody>
    </table>
  </div>
</body>
</html>`;
}

async function exportFilteredMovements() {
  const rows = state.filteredMovements || [];
  if (!rows.length) return window.showToast?.('No hay movimientos con los filtros actuales.', 'error');
  const slug = String(PAGE_CFG.tenantLabel || TENANT_SLUG).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  state.serverNowIso = await fetchServerNowIso();
  downloadHtmlAsPdf(buildMovementReportHtml(rows, state.serverNowIso), `reporte-movimientos-${slug || 'sede'}.pdf`, 'Permite las ventanas emergentes para abrir el reporte.');
}

function latestMovementByClientId() {
  const map = new Map();
  const sorted = (state.movements || []).slice().sort((a, b) => {
    const aTime = Date.parse(resolveMovementTimestamp(a) || '') || 0;
    const bTime = Date.parse(resolveMovementTimestamp(b) || '') || 0;
    return bTime - aTime;
  });
  sorted.forEach((row) => {
    const clientId = String(row?.cliente_id || '').trim();
    if (!clientId || map.has(clientId)) return;
    map.set(clientId, row);
  });
  return map;
}

function latestMovementText(row) {
  if (!row) return 'Sin movimientos';
  return `${row.resumen || row.tipo_movimiento || 'Movimiento'} · ${formatDateTime(resolveMovementTimestamp(row))}`;
}

function latestMovementText(row) {
  if (!row) return 'Sin movimientos';
  return `${row.resumen || formatMovementTypeLabel(row.tipo_movimiento) || 'Movimiento'} - ${formatDateTime(resolveMovementTimestamp(row))}`;
}

function matchesGlobalSearch(parts, searchValue) {
  if (!searchValue) return true;
  return normalizeText(parts.join(' ')).includes(searchValue);
}

function renderStats() {
  const approvals = (state.filteredMovements || []).filter((row) => String(row?.tipo_movimiento || '').trim() === 'documento_aprobado').length;
  document.getElementById('stat-movements').textContent = String((state.filteredMovements || []).length);
  document.getElementById('stat-orders').textContent = String((state.orders || []).length);
  document.getElementById('stat-clients').textContent = String((state.clients || []).length);
  document.getElementById('stat-doc-approvals').textContent = String(approvals);
}

function renderClientsTable() {
  const tbody = document.getElementById('control-clients-body');
  if (!tbody) return;
  const latestMap = latestMovementByClientId();
  const searchValue = normalizeText(document.getElementById('filter-search')?.value || '');
  const rows = (state.clients || [])
    .filter((client) => matchesGlobalSearch([
      client?.nombre_completo,
      client?.rfc,
      getClientStatusLabel(client),
      latestMovementText(latestMap.get(String(client?.id || '')))
    ], searchValue))
    .sort((a, b) => {
      const aTime = Date.parse(resolveMovementTimestamp(latestMap.get(String(a?.id || ''))) || resolveRecordUpdatedTimestamp(a)) || 0;
      const bTime = Date.parse(resolveMovementTimestamp(latestMap.get(String(b?.id || ''))) || resolveRecordUpdatedTimestamp(b)) || 0;
      return bTime - aTime;
    });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-gray-400 font-semibold">No hay perfiles para mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((client) => {
    const latest = latestMap.get(String(client?.id || ''));
    return `
      <tr>
        <td class="py-4 pr-3">
          <div class="font-black text-gray-800">${escapeHTML(client?.nombre_completo || '--')}</div>
          <div class="text-[11px] text-gray-400 mt-1">RFC: ${escapeHTML(client?.rfc || '--')} · ID: ${escapeHTML(client?.id || '--')}</div>
        </td>
        <td class="py-4 pr-3">
          <span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600">${escapeHTML(getClientStatusLabel(client))}</span>
        </td>
        <td class="py-4 pr-3">
          <div class="font-semibold text-gray-700">${escapeHTML(latest?.resumen || 'Sin movimientos')}</div>
          <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(formatDateTime(resolveMovementTimestamp(latest) || resolveRecordUpdatedTimestamp(client)))}</div>
        </td>
        <td class="py-4 text-right">
          <div class="flex flex-wrap justify-end gap-2">
            <button data-action="profile" data-client-id="${escapeHTML(client?.id || '')}" class="rounded-xl bg-brand-red/10 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-brand-red transition hover:bg-brand-red/20">
              Ver perfil
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderOrdersTable() {
  const tbody = document.getElementById('control-orders-body');
  if (!tbody) return;
  const searchValue = normalizeText(document.getElementById('filter-search')?.value || '');
  const rows = (state.orders || [])
    .filter((order) => matchesGlobalSearch([
      order?.numero_orden,
      order?.nombre_cotizacion,
      order?.cliente_nombre,
      order?.creado_por_nombre,
      order?.modificado_por_nombre,
      order?.status
    ], searchValue))
    .sort((a, b) => (Date.parse(resolveRecordUpdatedTimestamp(b)) || 0) - (Date.parse(resolveRecordUpdatedTimestamp(a)) || 0));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-400 font-semibold">No hay ordenes para mostrar.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((order) => `
    <tr>
      <td class="py-4 pr-3">
        <div class="font-black text-gray-800">${escapeHTML(order?.numero_orden || order?.id || '--')}</div>
        <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(order?.nombre_cotizacion || 'Sin nombre')}</div>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">${escapeHTML(order?.cliente_nombre || '--')}</div>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">Creó: ${escapeHTML(order?.creado_por_nombre || 'Sistema')}</div>
        <div class="text-[11px] text-gray-400 mt-1">Fecha: ${escapeHTML(formatDateTime(resolveRecordCreatedTimestamp(order)))}</div>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">Modificó: ${escapeHTML(order?.modificado_por_nombre || order?.creado_por_nombre || 'Sin cambios')}</div>
        <div class="text-[11px] text-gray-400 mt-1">Fecha: ${escapeHTML(formatDateTime(resolveRecordUpdatedTimestamp(order)))}</div>
      </td>
      <td class="py-4">
        <span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600">${escapeHTML(order?.status || '--')}</span>
      </td>
    </tr>
  `).join('');
}

function describeActiveFilters() {
  const { actor, type, search, dateFrom, dateTo } = getMovementReportFilters();
  const parts = [];
  if (actor) parts.push(`Persona: ${actor}`);
  if (type) parts.push(`Movimiento: ${formatMovementTypeLabel(type)}`);
  if (dateFrom) parts.push(`Desde: ${dateFrom}`);
  if (dateTo) parts.push(`Hasta: ${dateTo}`);
  if (search) parts.push(`Busqueda: ${search}`);
  return parts.length ? parts.join(' · ') : 'Sin filtros activos';
}

function renderMovementsTable() {
  const tbody = document.getElementById('control-movements-body');
  if (!tbody) return;
  document.getElementById('control-filter-caption').textContent = describeActiveFilters();
  const rows = state.filteredMovements || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-gray-400 font-semibold">No hay movimientos con los filtros activos.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td class="py-4 pr-3 whitespace-nowrap">
        <div class="font-semibold text-gray-700">${escapeHTML(getDateTimeParts(resolveMovementTimestamp(row)).date)}</div>
        <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(getDateTimeParts(resolveMovementTimestamp(row)).time)}</div>
      </td>
      <td class="py-4 pr-3">
        <span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-gray-600">${escapeHTML(formatMovementTypeLabel(row?.tipo_movimiento || '--'))}</span>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">${escapeHTML(row?.actor_nombre || 'Sistema')}</div>
        <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(row?.actor_role || '--')}</div>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">${escapeHTML(row?.cliente_nombre || row?.entidad_nombre || '--')}</div>
        <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(row?.cotizacion_folio || row?.entidad_id || '--')}</div>
      </td>
      <td class="py-4 pr-3">
        <div class="font-semibold text-gray-700">${escapeHTML(row?.documento_nombre || row?.entidad_tipo || '--')}</div>
      </td>
      <td class="py-4">
        <div class="font-semibold text-gray-700">${escapeHTML(getMovementSupervisionText(row))}</div>
        <div class="text-[11px] text-gray-400 mt-1">${escapeHTML(row?.resumen || '--')}</div>
      </td>
    </tr>
  `).join('');
}

function populateFilters() {
  const actorSelect = document.getElementById('filter-actor');
  const typeSelect = document.getElementById('filter-type');
  if (!actorSelect || !typeSelect) return;

  const currentActor = actorSelect.value;
  const currentType = typeSelect.value;
  const actors = Array.from(new Set((state.movements || []).map((row) => String(row?.actor_nombre || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const types = Array.from(new Set((state.movements || []).map((row) => String(row?.tipo_movimiento || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  actorSelect.innerHTML = '<option value="">Todas</option>' + actors.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
  typeSelect.innerHTML = '<option value="">Todos</option>' + types.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(formatMovementTypeLabel(value))}</option>`).join('');

  if (currentActor && actors.includes(currentActor)) actorSelect.value = currentActor;
  if (currentType && types.includes(currentType)) typeSelect.value = currentType;
}

function applyFilters() {
  const filters = getMovementReportFilters();
  const actor = filters.actor;
  const type = filters.type;
  const search = normalizeText(filters.search || '');
  const fromTime = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : 0;
  const toTime = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : 0;

  state.filteredMovements = (state.movements || []).filter((row) => {
    if (actor && String(row?.actor_nombre || '').trim() !== actor) return false;
    if (type && String(row?.tipo_movimiento || '').trim() !== type) return false;
    const movementTime = getDateTimeParts(resolveMovementTimestamp(row)).timestamp;
    if (fromTime && (!movementTime || movementTime < fromTime)) return false;
    if (toTime && (!movementTime || movementTime > toTime)) return false;
    if (search && !matchesGlobalSearch([
      row?.actor_nombre,
      row?.actor_role,
      row?.tipo_movimiento,
      formatMovementTypeLabel(row?.tipo_movimiento),
      row?.cliente_nombre,
      row?.cliente_id,
      row?.cotizacion_folio,
      row?.documento_nombre,
      row?.resumen,
      getMovementSupervisionText(row)
    ], search)) return false;
    return true;
  });

  renderStats();
  renderClientsTable();
  renderOrdersTable();
  renderMovementsTable();
}

function bindTableActions() {
  const tbody = document.getElementById('control-clients-body');
  if (!tbody || tbody.dataset.bound === '1') return;
  tbody.dataset.bound = '1';
  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const clientId = button.getAttribute('data-client-id') || '';
    if (!clientId) return;
    const client = state.clients.find((item) => String(item?.id || '') === clientId);
    if (!client) return;

    const action = button.getAttribute('data-action');
    if (action === 'profile') {
      openControlClientProfileModal(client);
    }
  });
}

async function loadControlData() {
  if (state.loading) return;
  state.loading = true;
  const refreshBtn = document.getElementById('btn-refresh-control');
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando';
  }

  try {
    state.serverNowIso = await fetchServerNowIso();
    const movementsCutoffIso = getControlMovementsCutoffIso(state.serverNowIso);
    const clientsQuery = window.tenantPocketBase.from('clientes')
      .select('id,nombre_completo,telefono,correo,correos_adicionales,rfc,telefonos_adicionales,perfil_estatus,perfil_validado,perfil_completo,documentos_estado,expediente_validacion,constancia_fiscal_emitida_el,comprobante_domicilio_emitido_el,doc_acta_constitutiva,doc_ine,doc_comprobante_domicilio,doc_constancia_fiscal,created_at,updated_at,created,updated')
      .order('updated_at', { ascending: false })
      .limit(400);

    const ordersQuery = window.tenantPocketBase.from('cotizaciones')
      .select('id,numero_orden,nombre_cotizacion,cliente_id,cliente_nombre,status,creado_por_nombre,modificado_por_nombre,created_at,updated_at,created,updated,precio_final')
      .order('updated_at', { ascending: false })
      .limit(500);

    const movementsQuery = window.tenantPocketBase.from('control_movimientos')
      .select('id,tenant,tipo_movimiento,entidad_tipo,entidad_id,entidad_nombre,cliente_id,cliente_nombre,cotizacion_id,cotizacion_folio,documento_campo,documento_nombre,actor_id,actor_nombre,actor_role,resumen,metadata,created_at,updated_at,created,updated')
      .gte('created_at', movementsCutoffIso)
      .order('created_at', { ascending: false })
      .limit(500);

    const [clientsResp, ordersResp, movementsResp] = await Promise.all([clientsQuery, ordersQuery, movementsQuery]);
    if (clientsResp.error) throw clientsResp.error;
    if (ordersResp.error) throw ordersResp.error;
    if (movementsResp.error) throw movementsResp.error;

    state.clients = clientsResp.data || [];
    state.orders = ordersResp.data || [];
    state.movements = (movementsResp.data || []).slice().sort((a, b) => (Date.parse(resolveMovementTimestamp(b) || '') || 0) - (Date.parse(resolveMovementTimestamp(a) || '') || 0));
    populateFilters();
    applyFilters();
  } catch (error) {
    console.error(error);
    window.showToast?.('No se pudo cargar la pagina de control.', 'error');
  } finally {
    state.loading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Actualizar';
    }
  }
}

function syncNavPermissions(accessCtx) {
  const role = accessCtx?.role || '';
  const perms = accessCtx?.perms || {};
  if (role === 'admin') return;
  const navRules = {
    'catalog.html': ('catalog_view' in perms) ? !!perms.catalog_view : true,
    'agenda.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'contracts.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'receipts.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'invoices.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'orders.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'cotizacion.html': ('orders_view' in perms) ? !!perms.orders_view : true,
    'reports.html': ('reports_view' in perms) ? !!perms.reports_view : true,
    'clientes.html': (('clients_view' in perms) || ('clients_manage' in perms) || ('clients_verify' in perms))
      ? (!!perms.clients_view || !!perms.clients_manage || !!perms.clients_verify)
      : true
  };
  Object.keys(navRules).forEach((page) => {
    if (!navRules[page]) {
      document.querySelectorAll(`a[href="${page}"]`).forEach((link) => link.classList.add('hidden'));
    }
  });
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
    window.showToast?.('No se encontro una sesion valida.', 'error');
    return;
  }

  const accessCtx = await fetchAccessContext(session.user);
  state.access = accessCtx;
  adminVerifierMode = false;
  if (!accessCtx?.canView) {
    window.showToast?.('No tienes permisos para acceder a Control.', 'error');
    return;
  }

  document.getElementById('tenant-chip').textContent = PAGE_CFG.tenantLabel || TENANT_SLUG;
  installVerifierTenantNavigation(accessCtx);
  syncNavPermissions(accessCtx);
  bindTableActions();
  document.getElementById('btn-refresh-control')?.addEventListener('click', () => loadControlData());
  document.getElementById('btn-export-movements')?.addEventListener('click', exportFilteredMovements);
  document.getElementById('filter-actor')?.addEventListener('change', applyFilters);
  document.getElementById('filter-type')?.addEventListener('change', applyFilters);
  document.getElementById('filter-date-from')?.addEventListener('change', applyFilters);
  document.getElementById('filter-date-to')?.addEventListener('change', applyFilters);
  document.getElementById('filter-search')?.addEventListener('input', applyFilters);

  await loadControlData();
});
