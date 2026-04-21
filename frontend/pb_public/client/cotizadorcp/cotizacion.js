/**
 * DOC: client\cotizadorcp\cotizacion.js
 * Proposito: Creacion de cotizaciones (administracion).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

let clientProfiles = [];
let clientProfilesById = {};
const QUOTE_REQUIRED_DOC_FIELDS = ['doc_ine', 'doc_comprobante_domicilio', 'doc_constancia_fiscal'];
const QUOTE_CONSTANCIA_VALID_DAYS = 30;
const QUOTE_COMPROBANTE_VALID_DAYS = 90;

window.finalMontajeDates = [];
window.tempMontajeDates = [];
window.currentMontajePrefix = 'q';

function normalizeQuoteDateValue(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10);
    return '';
}

function normalizeQuotePhoneValue(value) {
    const digits = String(value || '').replace(/\D+/g, '').slice(-10);
    return digits.length === 10 ? digits : '';
}

function readQuoteClientArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function readQuoteClientValidation(client = {}) {
    const raw = client?.expediente_validacion;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}

function readQuoteClientDocuments(validation = {}) {
    const docs = validation?.documents;
    return docs && typeof docs === 'object' ? docs : {};
}

function readQuoteClientDocumentInfo(client = {}, field) {
    const validation = readQuoteClientValidation(client);
    const docs = readQuoteClientDocuments(validation);
    return docs[field] && typeof docs[field] === 'object' ? docs[field] : {};
}

function readQuoteClientDocumentState(client = {}, field) {
    const raw = client?.documentos_estado;
    if (!raw || typeof raw !== 'object') return {};
    return raw[field] && typeof raw[field] === 'object' ? raw[field] : {};
}

function isQuoteClientDocumentOmitted(client = {}, field) {
    const doc = readQuoteClientDocumentInfo(client, field);
    const state = String(doc?.estado || doc?.status || '').trim().toLowerCase();
    return doc?.omitido === true || state === 'omitido';
}

function hasQuoteClientDocumentFile(client = {}, field) {
    const doc = readQuoteClientDocumentInfo(client, field);
    if (doc?.uploaded === true) return true;
    if (String(doc?.fileName || '').trim()) return true;
    const raw = client?.[field];
    if (Array.isArray(raw)) return String(raw[0] || '').trim() !== '';
    return String(raw || '').trim() !== '';
}

function getQuoteClientDocumentStatus(client = {}, field) {
    const doc = readQuoteClientDocumentInfo(client, field);
    if (isQuoteClientDocumentOmitted(client, field)) return 'omitido';
    const status = String(doc?.estado || doc?.status || '').trim().toLowerCase();
    if (status) return status;
    return hasQuoteClientDocumentFile(client, field) ? 'pendiente' : 'pendiente';
}

function getQuoteClientDocumentActivityDate(client = {}, field) {
    const doc = readQuoteClientDocumentInfo(client, field);
    const state = readQuoteClientDocumentState(client, field);
    return normalizeQuoteDateValue(
        state?.subido_at
        || doc?.subidoAt
        || doc?.subido_at
        || state?.aprobado_at
        || doc?.aprobadoAt
        || state?.revisado_at
        || doc?.revisadoAt
        || client?.created_at
        || client?.created
    );
}

function getQuoteClientDocumentReferenceDate(client = {}, field) {
    const validation = readQuoteClientValidation(client);
    const activityDate = getQuoteClientDocumentActivityDate(client, field);
    if (field === 'doc_constancia_fiscal') {
        return normalizeQuoteDateValue(
            activityDate
            || validation?.constanciaFiscalSubidaEl
            || validation?.constancia_fiscal_subida_el
            || validation?.constanciaFiscalEmitidaEl
            || validation?.constancia_fiscal_emitida_el
            || client?.constancia_fiscal_emitida_el
        );
    }
    if (field === 'doc_comprobante_domicilio') {
        return normalizeQuoteDateValue(
            validation?.comprobanteDomicilioEmitidoEl
            || validation?.comprobante_domicilio_emitido_el
            || client?.comprobante_domicilio_emitido_el
            || activityDate
        );
    }
    return activityDate;
}

function evaluateQuoteClientDate(dateValue, maxAgeDays) {
    const normalized = normalizeQuoteDateValue(dateValue);
    if (!normalized) return { valid: false };
    const target = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(target.getTime())) return { valid: false };
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const ageDays = Math.floor((todayUtc.getTime() - target.getTime()) / 86400000);
    return {
        valid: ageDays >= 0 && ageDays <= Math.max(0, Number(maxAgeDays) || 0)
    };
}

function isQuoteReadyFlagValue(value) {
    if (value === true) return true;
    if (typeof value === 'number') return value === 1;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'si', 'sí', 'yes', 'aprobado', 'aprobada', 'validado', 'validada', 'listo', 'lista', 'activo', 'activa'].includes(normalized);
}

function isQuoteReadyStatusValue(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['validado', 'validada', 'aprobado', 'aprobada', 'listo', 'lista', 'listo_para_cotizar', 'lista_para_cotizar', 'activo', 'activa'].includes(normalized);
}

function isQuoteClientProfileReady(client = {}) {
    if (!client || typeof client !== 'object') return false;
    const validation = readQuoteClientValidation(client);
    const rawStatus = String(client?.perfil_estatus || validation?.status || '').trim().toLowerCase();
    if (['rechazado', 'rechazada', 'rechazado_expediente', 'rechazada_expediente', 'documentos_rechazados'].includes(rawStatus)) return false;
    if (
        isQuoteReadyFlagValue(client?.perfil_completo) ||
        isQuoteReadyFlagValue(validation?.isComplete) ||
        isQuoteReadyFlagValue(validation?.complete) ||
        isQuoteReadyFlagValue(validation?.perfilCompleto) ||
        isQuoteReadyFlagValue(client?.perfil_validado) ||
        isQuoteReadyFlagValue(validation?.readyForQuotes) ||
        isQuoteReadyFlagValue(validation?.ready) ||
        isQuoteReadyFlagValue(validation?.puedeCotizar) ||
        isQuoteReadyFlagValue(validation?.quoteApproved) ||
        isQuoteReadyFlagValue(validation?.quoteReady) ||
        isQuoteReadyFlagValue(validation?.readyForContracts) ||
        isQuoteReadyStatusValue(rawStatus)
    ) return true;
    const hasName = String(client?.nombre_completo || '').trim() !== '';
    const hasEmail = String(client?.correo || '').trim() !== '';
    const hasRfc = String(client?.rfc || '').trim() !== '';
    const hasPhone = !!normalizeQuotePhoneValue(client?.telefono)
        || readQuoteClientArray(client?.telefonos_adicionales).some((phone) => !!normalizeQuotePhoneValue(phone));
    if (!hasName || !hasEmail || !hasRfc || !hasPhone) return false;

    let anyRejected = false;
    for (let i = 0; i < QUOTE_REQUIRED_DOC_FIELDS.length; i += 1) {
        const field = QUOTE_REQUIRED_DOC_FIELDS[i];
        const uploaded = hasQuoteClientDocumentFile(client, field);
        const omitted = isQuoteClientDocumentOmitted(client, field);
        const status = getQuoteClientDocumentStatus(client, field);
        if (!uploaded && !omitted) return false;
        if (status === 'rechazado') anyRejected = true;
    }
    if (anyRejected) return false;

    const constanciaOmitted = isQuoteClientDocumentOmitted(client, 'doc_constancia_fiscal');
    const comprobanteOmitted = isQuoteClientDocumentOmitted(client, 'doc_comprobante_domicilio');
    const constanciaDate = getQuoteClientDocumentReferenceDate(client, 'doc_constancia_fiscal');
    const comprobanteDate = getQuoteClientDocumentReferenceDate(client, 'doc_comprobante_domicilio');
    const constanciaValid = constanciaOmitted ? true : evaluateQuoteClientDate(constanciaDate, QUOTE_CONSTANCIA_VALID_DAYS).valid;
    const comprobanteValid = comprobanteOmitted ? true : evaluateQuoteClientDate(comprobanteDate, QUOTE_COMPROBANTE_VALID_DAYS).valid;
    return !!(constanciaValid && comprobanteValid);
}

function getValidatedClientProfiles() {
    return clientProfiles.filter((client) => isQuoteClientProfileReady(client));
}

function isQuickQuoteModeEnabled() {
    return !!document.getElementById('cli-quick-quote')?.checked;
}

function fillQuoteClientFields(client = {}) {
    const nameEl = document.getElementById('cli-name');
    const phoneEl = document.getElementById('cli-phone');
    const emailEl = document.getElementById('cli-email');
    const rfcEl = document.getElementById('cli-rfc');
    if (nameEl) nameEl.value = client?.nombre_completo || '';
    if (phoneEl) phoneEl.value = client?.telefono || '';
    if (emailEl) emailEl.value = client?.correo || '';
    if (rfcEl) rfcEl.value = client?.rfc || '';
}

function clearQuoteClientFields() {
    fillQuoteClientFields({});
}

function clearQuoteClientAssociation(options = {}) {
    const selectEl = document.getElementById('cli-select');
    const hiddenIdEl = document.getElementById('cli-id');
    if (selectEl) selectEl.value = '';
    if (hiddenIdEl) hiddenIdEl.value = '';
    if (options.clearFields === true) clearQuoteClientFields();
}

function getSelectedQuoteClientProfile() {
    const hiddenIdEl = document.getElementById('cli-id');
    const selectEl = document.getElementById('cli-select');
    const selectedId = String(hiddenIdEl?.value || selectEl?.value || '').trim();
    if (!selectedId) return null;
    const selected = clientProfilesById[selectedId] || null;
    if (!selected) return null;
    if (!isQuoteClientProfileReady(selected) && !isQuickQuoteModeEnabled()) return null;
    if (hiddenIdEl) hiddenIdEl.value = selectedId;
    return selected;
}

function buildQuoteClientSnapshot() {
    const selectedProfile = getSelectedQuoteClientProfile();
    if (selectedProfile && !isQuickQuoteModeEnabled()) {
        fillQuoteClientFields(selectedProfile);
        return {
            id: String(selectedProfile.id || '').trim(),
            name: String(selectedProfile.nombre_completo || '').trim(),
            rfc: String(selectedProfile.rfc || '').trim().toUpperCase(),
            phone: String(selectedProfile.telefono || '').trim(),
            email: String(selectedProfile.correo || '').trim().toLowerCase()
        };
    }
    return {
        id: '',
        name: String(document.getElementById('cli-name')?.value || '').trim(),
        rfc: String(document.getElementById('cli-rfc')?.value || '').trim().toUpperCase(),
        phone: String(document.getElementById('cli-phone')?.value || '').trim(),
        email: String(document.getElementById('cli-email')?.value || '').trim().toLowerCase()
    };
}

function syncQuoteClientEntryMode() {
    const validatedProfiles = getValidatedClientProfiles();
    const hasValidatedProfiles = validatedProfiles.length > 0;
    const quickMode = isQuickQuoteModeEnabled();
    const selectEl = document.getElementById('cli-select');
    const hintEl = document.getElementById('cli-profile-hint');
    const manualWrap = document.getElementById('cli-manual-fields');
    const quickRow = document.getElementById('cli-quick-quote-row');

    if (manualWrap) {
        const hideManualFields = !quickMode;
        manualWrap.classList.toggle('hidden', hideManualFields);
        manualWrap.style.display = hideManualFields ? 'none' : '';
        manualWrap.setAttribute('aria-hidden', hideManualFields ? 'true' : 'false');
    }
    if (quickRow) quickRow.classList.remove('hidden');
    if (selectEl) {
        selectEl.disabled = !hasValidatedProfiles || quickMode;
        selectEl.classList.toggle('opacity-60', selectEl.disabled);
        selectEl.classList.toggle('cursor-not-allowed', selectEl.disabled);
    }

    if (hintEl) {
        if (!hasValidatedProfiles) hintEl.textContent = 'No hay perfiles completos disponibles. Captura los datos y se creará un perfil pendiente automáticamente.';
        else if (quickMode) hintEl.textContent = 'Cotización rápida activa: al generar se creará un perfil nuevo pendiente para completar su expediente después.';
        else hintEl.textContent = 'Selecciona un perfil completo. Si el cliente aún no existe, activa cotización rápida.';
    }
    if (hintEl && quickMode) hintEl.textContent = 'Cotizacion rapida activa: al generar se creara un perfil nuevo pendiente para completar su expediente despues.';
    if (hintEl && !quickMode && !hasValidatedProfiles) hintEl.textContent = 'No hay perfiles completos disponibles. Activa cotizacion rapida para capturar los datos y crear un perfil pendiente.';
}

function bindQuoteClientFieldListeners() {
    ['cli-name', 'cli-phone', 'cli-email', 'cli-rfc'].forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field || field.dataset.quoteClientBound === '1') return;
        field.dataset.quoteClientBound = '1';
        field.addEventListener('input', () => {
            const hiddenIdEl = document.getElementById('cli-id');
            if (hiddenIdEl?.value) clearQuoteClientAssociation();
        });
    });
}

function bindQuoteClientModeToggle() {
    const quickCheckbox = document.getElementById('cli-quick-quote');
    if (!quickCheckbox || quickCheckbox.dataset.quoteQuickBound === '1') return;
    quickCheckbox.dataset.quoteQuickBound = '1';
    const syncMode = () => { window.toggleQuoteQuickClientMode(); };
    quickCheckbox.addEventListener('change', syncMode);
    quickCheckbox.addEventListener('input', syncMode);
    quickCheckbox.addEventListener('click', () => {
        window.setTimeout(syncMode, 0);
    });
}
window.toggleQuoteQuickClientMode = function () {
    const quickCheckbox = document.getElementById('cli-quick-quote');
    if (!quickCheckbox) return;
    if (quickCheckbox.checked) clearQuoteClientAssociation({ clearFields: true });
    else clearQuoteClientAssociation({ clearFields: true });
    syncQuoteClientEntryMode();
};

async function createQuickQuoteClientProfile(cli) {
    const payload = {
        tenant: CP_TENANT_SLUG,
        nombre_completo: String(cli?.name || '').trim(),
        telefono: String(cli?.phone || '').trim(),
        correo: String(cli?.email || '').trim().toLowerCase() || null,
        rfc: String(cli?.rfc || '').trim().toUpperCase() || null,
        perfil_origen: 'cotizacion_rapida',
        perfil_estatus: 'pendiente_expediente',
        perfil_validado: false,
        perfil_completo: false
    };
    const { data, error } = await window.tenantPocketBase.from('clientes').insert(payload);
    if (error) throw error;
    const created = Array.isArray(data) ? (data[0] || null) : (data || null);
    const createdId = String(created?.id || '').trim();
    if (!createdId) throw new Error('No se pudo crear el perfil rápido del cliente.');
    clientProfiles.push(created || { ...payload, id: createdId });
    clientProfilesById[createdId] = created || { ...payload, id: createdId };
    const hiddenIdEl = document.getElementById('cli-id');
    if (hiddenIdEl) hiddenIdEl.value = createdId;
    return createdId;
}

async function resolveQuoteClientId(cli) {
    const selectedProfile = getSelectedQuoteClientProfile();
    if (selectedProfile) return String(selectedProfile.id || '').trim();
    const hiddenIdEl = document.getElementById('cli-id');
    const existingId = String(hiddenIdEl?.value || '').trim();
    if (existingId && isQuickQuoteModeEnabled()) return existingId;
    if (!isQuickQuoteModeEnabled()) {
        throw new Error('Selecciona un perfil completo o activa cotización rápida.');
    }
    return createQuickQuoteClientProfile(cli);
}

async function loadClientProfilesForQuoteModal() {
    const sel = document.getElementById('cli-select'); const hid = document.getElementById('cli-id'); if (!sel || !window.tenantPocketBase) return;
    try {
        const { data, error } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,telefono,telefonos_adicionales,correo,rfc,perfil_completo,perfil_validado,perfil_estatus,documentos_estado,expediente_validacion,constancia_fiscal_emitida_el,comprobante_domicilio_emitido_el,doc_ine,doc_comprobante_domicilio,doc_constancia_fiscal,created_at,created').order('nombre_completo', { ascending: true });
        if (error) throw error; clientProfiles = (data || []).slice().sort((a, b) => { const aReady = isQuoteClientProfileReady(a) ? 1 : 0; const bReady = isQuoteClientProfileReady(b) ? 1 : 0; if (aReady !== bReady) return bReady - aReady; return String(a?.nombre_completo || '').localeCompare(String(b?.nombre_completo || ''), 'es'); }); clientProfilesById = {}; clientProfiles.forEach(c => clientProfilesById[c.id] = c);
        const validatedProfiles = getValidatedClientProfiles();
        sel.innerHTML = '<option value="">' + (validatedProfiles.length ? '— Selecciona un perfil completo —' : '— Sin perfiles completos disponibles —') + '</option>' + validatedProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()} • COMPLETO</option>`).join('');
        sel.onchange = () => {
            const id = sel.value;
            const quickCheckbox = document.getElementById('cli-quick-quote');
            if (!id) {
                if (hid) hid.value = '';
                if (!isQuickQuoteModeEnabled()) clearQuoteClientFields();
                syncQuoteClientEntryMode();
                return;
            }
            const c = clientProfilesById[id];
            if (!c) return;
            if (quickCheckbox?.checked) quickCheckbox.checked = false;
            if (hid) hid.value = id;
            fillQuoteClientFields(c);
            syncQuoteClientEntryMode();
        };
        bindQuoteClientFieldListeners();
        bindQuoteClientModeToggle();
        syncQuoteClientEntryMode();
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
const __cpPath = window.location.pathname || '';
const __cpIsCP = /\/cotizadorcp(\/|$)/.test(__cpPath) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __cpIsCP ? 'finanzas_casadepiedra' : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_CASA_PIEDRA || 'finanzas');
const CP_TENANT_SLUG = 'casa_de_piedra';
// Fallback por pathname: si falta __CP_PAGE_MODE, la vista de cotizacion no debe degradar a modo catalogo.
const CP_PAGE_MODE = window.__CP_PAGE_MODE || ((String(window.location.pathname || '').toLowerCase().includes('cotizacion.html')) ? 'cotizacion' : 'catalog_admin');
const IS_QUOTE_PAGE = CP_PAGE_MODE === 'cotizacion';
const IS_CATALOG_ADMIN_PAGE = CP_PAGE_MODE === 'catalog_admin';

let allSpaces = [], catalogConcepts = [], dbTaxes = [], currentSpace = null, currentPricing = { base: 0, final: 0 };
let adminSelectedConcepts = []; let myPermissions = { access: false, catalog_manage: false };
let __cpPremontajePct = 25;
let __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
let cpMaterialCatalog = [];
let cpConvenioCatalog = [];
const CP_CONVENIOS_CFG_KEY = 'convenios_cp';
const CP_CONVENIO_INDEFINITE_END = '2099-12-31';
let cpQuoteRestoringViewState = false;
const CP_QUOTE_VIEW_STATE_SCOPE = `cp_quote:${CP_PAGE_MODE}`;
const CP_QUOTE_REGULATION_TEMPLATE_PATH = 'templates_reglamentos';
const CP_QUOTE_MANAGER_STORAGE_BUCKET = 'documentos-cp';

function paintCpQuoteManagerPlanoStatus(options = {}) {
    const statusEl = document.getElementById('mgr-plano-current');
    if (!statusEl) return;
    if (Object.prototype.hasOwnProperty.call(options, 'fileName')) statusEl.dataset.currentFileName = String(options.fileName || '');
    if (Object.prototype.hasOwnProperty.call(options, 'url')) statusEl.dataset.currentUrl = String(options.url || '');
    const currentFileName = String(statusEl.dataset.currentFileName || '').trim();
    const currentUrl = String(statusEl.dataset.currentUrl || '').trim();
    const clearRequested = String(document.getElementById('mgr-plano-clear')?.value || '0') === '1';
    const selectedFile = document.getElementById('mgr-plano-file')?.files?.[0] || null;
    statusEl.innerHTML = '';
    if (selectedFile) {
        statusEl.textContent = `Nuevo archivo: ${selectedFile.name}`;
        return;
    }
    if (clearRequested) {
        statusEl.textContent = 'Se eliminará al guardar.';
        return;
    }
    if (currentUrl) {
        const prefix = document.createElement('span');
        prefix.textContent = 'Actual: ';
        const link = document.createElement('a');
        link.href = currentUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'font-bold text-brand-red underline';
        link.textContent = currentFileName || 'Ver archivo';
        statusEl.appendChild(prefix);
        statusEl.appendChild(link);
        return;
    }
    statusEl.textContent = currentFileName ? `Actual: ${currentFileName}` : 'Sin archivo asignado.';
}

async function loadCpQuoteManagerRegulationTemplates(selectedFile = '') {
    const select = document.getElementById('mgr-reglamento-template');
    if (!select || !window.globalPocketBase?.storage) return;
    select.innerHTML = '<option value="">Usar reglamento predeterminado</option>';
    try {
        const { data, error } = await window.globalPocketBase.storage.from(CP_QUOTE_MANAGER_STORAGE_BUCKET).list(CP_QUOTE_REGULATION_TEMPLATE_PATH);
        if (error) throw error;
        (Array.isArray(data) ? data : [])
            .map((file) => ({ name: String(file?.name || '').trim() }))
            .filter((file) => !!file.name)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .forEach((file) => {
                const opt = document.createElement('option');
                opt.value = file.name;
                opt.textContent = file.name;
                select.appendChild(opt);
            });
    } catch (_) { }
    select.value = Array.from(select.options).some((opt) => opt.value === selectedFile) ? selectedFile : '';
}

async function resetCpQuoteManagerContractAssets(space = null) {
    const fileInput = document.getElementById('mgr-plano-file');
    const clearInput = document.getElementById('mgr-plano-clear');
    if (fileInput) fileInput.value = '';
    if (clearInput) clearInput.value = '0';
    await loadCpQuoteManagerRegulationTemplates(String(space?.reglamento_template || '').trim());
    paintCpQuoteManagerPlanoStatus({
        fileName: String(space?.plano_geografico_file || space?.plano_geografico || '').trim(),
        url: String(space?.plano_geografico_url || '').trim()
    });
}

window.handleManagerPlanoGeograficoChange = function () {
    const clearInput = document.getElementById('mgr-plano-clear');
    if (clearInput) clearInput.value = '0';
    paintCpQuoteManagerPlanoStatus();
};

window.clearManagerPlanoGeografico = function () {
    const fileInput = document.getElementById('mgr-plano-file');
    const clearInput = document.getElementById('mgr-plano-clear');
    if (fileInput) fileInput.value = '';
    if (clearInput) clearInput.value = '1';
    paintCpQuoteManagerPlanoStatus();
};

// NUEVO: PRECIO PERSONALIZADO
let precioPersonalizadoEnabled = false;
let precioPersonalizadoValue = 0;

function cpQuoteViewStateApi() {
    return window.__HUB_VIEW_STATE || null;
}

function cpQuoteReadViewState() {
    const api = cpQuoteViewStateApi();
    return api?.read ? (api.read(CP_QUOTE_VIEW_STATE_SCOPE, { maxAgeMs: 30 * 60 * 1000 }) || null) : null;
}

function cpQuoteApplyViewStateControls(state = cpQuoteReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const searchEl = document.getElementById('cat-search');
    const typeEl = document.getElementById('cat-filter-type');
    const sortEl = document.getElementById('cat-sort');
    if (searchEl && typeof state.search === 'string') searchEl.value = state.search;
    if (typeEl && typeof state.type === 'string') typeEl.value = state.type;
    if (sortEl && typeof state.sort === 'string') sortEl.value = state.sort;
}

function cpQuoteSaveViewState(extra = {}) {
    const api = cpQuoteViewStateApi();
    if (!api?.write) return null;
    const mgrId = document.getElementById('mgr-id')?.value || '';
    return api.write(CP_QUOTE_VIEW_STATE_SCOPE, {
        search: document.getElementById('cat-search')?.value || '',
        type: document.getElementById('cat-filter-type')?.value || 'all',
        sort: document.getElementById('cat-sort')?.value || 'default',
        selectedSpaceId: String(
            extra.selectedSpaceId
            || mgrId
            || currentSpace?.id
            || ''
        ).trim(),
        windowScrollY: api.getWindowScrollY ? api.getWindowScrollY() : (window.scrollY || 0),
        ...(extra && typeof extra === 'object' ? extra : {})
    });
}

function cpQuoteRestoreViewStateAfterRender(state = cpQuoteReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const api = cpQuoteViewStateApi();
    if (api?.restoreScrollState) api.restoreScrollState(state);
    const selectedSpaceId = String(state.selectedSpaceId || '').trim();
    if (!selectedSpaceId) return;
    window.setTimeout(() => {
        const target = document.querySelector(`[data-space-id="${selectedSpaceId}"]`);
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
    }, 90);
}

function normalizeCpQuoteTenantSlug(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'finanzas' || raw.indexOf('plaza') !== -1) return 'plaza_mayor';
    if (raw.indexOf('casadepiedra') !== -1 || raw.indexOf('casa_de_piedra') !== -1 || raw.indexOf('casa-de-piedra') !== -1) return 'casa_de_piedra';
    return raw;
}

function resolveCpQuoteTenantSlug(fallback = '') {
    const fromClient = normalizeCpQuoteTenantSlug(window.tenantPocketBase?.tenant || '');
    if (fromClient) return fromClient;
    const fromFallback = normalizeCpQuoteTenantSlug(fallback);
    if (fromFallback) return fromFallback;
    const fromSchema = normalizeCpQuoteTenantSlug(FIN_SCHEMA);
    if (fromSchema) return fromSchema;
    const path = String(window.location.pathname || '').toLowerCase();
    return path.indexOf('/cotizadorcp/') !== -1 ? 'casa_de_piedra' : 'plaza_mayor';
}

function filterCpQuoteRowsByTenant(rows, fallback = '') {
    const tenant = resolveCpQuoteTenantSlug(fallback);
    const source = Array.isArray(rows) ? rows : [];
    if (!tenant) return source.slice();
    return source.filter((row) => {
        const rowTenant = normalizeCpQuoteTenantSlug(row?.tenant || '');
        return !rowTenant || rowTenant === tenant;
    });
}
function normalizeCpQuoteAdjustmentType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'ninguno') return 'ninguno';
    if (raw === 'porcentaje') return 'aumento';
    if (raw === 'aumento' || raw === 'descuento' || raw === 'monto_fijo') return raw;
    return 'ninguno';
}
const CP_MAX_DISCOUNT_PERCENT = 10;
function normalizeCpQuoteAdjustmentPercent(type, value) {
    const pct = Math.max(0, parseCpQuoteNumberInput(value, 0));
    return normalizeCpQuoteAdjustmentType(type) === 'descuento' ? Math.min(pct, CP_MAX_DISCOUNT_PERCENT) : pct;
}
function parseCpQuoteNumberInput(value, fallback = 0) {
    const normalized = String(value ?? '').trim().replace(',', '.');
    if (!normalized) return fallback;
    const num = parseFloat(normalized);
    return Number.isFinite(num) ? num : fallback;
}

function pickCpQuoteLatestConfigRow(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

function parseCpQuoteConfigJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return {};
}

function findCpQuoteTaxRecord(taxId, space = null) {
    const safeId = String(taxId || '').trim();
    if (!safeId) return null;
    const tenant = resolveCpQuoteTenantSlug(space?.tenant || '');
    const tenantTaxes = filterCpQuoteRowsByTenant(dbTaxes, tenant);
    return tenantTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || dbTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || null;
}
async function ensureCpQuoteManageSession(actionLabel = 'guardar cambios') {
    try {
        const authCtx = window.HUB_SESSION?.ensureAuth
            ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, allowCachedUser: false, redirectOnFail: true, forceRefresh: true })
            : { session: await window.PB_SERVICES.auth.ensureFreshSession({ schema: FIN_SCHEMA, allowStaleOnError: false, forceRefresh: true }) };
        if (authCtx?.session?.user) return true;
    } catch (_) { }
    window.showToast?.(`Tu sesión expiró. Inicia sesión de nuevo para ${actionLabel}.`, 'error');
    return false;
}

// Bloquea recargas involuntarias cuando el destino coincide con la URL actual.
function __cpNormalizeUrlForNav(value) {
    try {
        const parsed = new URL(String(value || ''), window.location.href);
        parsed.hash = '';
        return parsed.toString();
    } catch (_) {
        return String(value || '').trim();
    }
}

function __cpNavigateSafely(targetUrl, options = {}) {
    const target = String(targetUrl || '').trim();
    if (!target) return false;
    const allowSamePage = options.allowSamePage === true;
    if (!allowSamePage && __cpNormalizeUrlForNav(target) === __cpNormalizeUrlForNav(window.location.href || '')) {
        window.showToast?.('Recarga bloqueada para proteger tus cambios.', 'info');
        return false;
    }
    if (typeof window.__HUB_SAFE_NAVIGATE === 'function') {
        return window.__HUB_SAFE_NAVIGATE(target, { allowSamePage });
    }
    window.location.href = target;
    return true;
}
function __cpNativeCotizacionesService() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}
function __cpCloneQuotePayloadValue(value) {
    if (Array.isArray(value)) return value.map(__cpCloneQuotePayloadValue);
    if (value && typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach((key) => {
            out[key] = __cpCloneQuotePayloadValue(value[key]);
        });
        return out;
    }
    return value;
}
function __cpToFiniteNumber(value, fallback = NaN) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function __cpComputeDetailSubtotalForCreate(detail = {}) {
    const taxTotal = __cpToFiniteNumber(detail?.impuestos_total ?? detail?.taxTotal, 0);
    const totalValue = __cpToFiniteNumber(detail?.total_espacio ?? detail?.total, NaN);
    if (Number.isFinite(totalValue)) return Math.max(0, totalValue - taxTotal);
    const baseValue = __cpToFiniteNumber(detail?.subtotal_espacio ?? detail?.subtotalBeforeTax ?? detail?.baseValue, 0);
    const convenioValue = __cpToFiniteNumber(detail?.convenio_monto_entregado ?? detail?.convenioValue, 0);
    const convenioActivo = detail?.convenio_activo === true || detail?.convenioEnabled === true;
    return convenioActivo ? Math.max(0, baseValue - convenioValue) : Math.max(0, baseValue);
}
function __cpNormalizeQuoteDetailForCreate(detail = {}) {
    const normalized = detail && typeof detail === 'object' ? __cpCloneQuotePayloadValue(detail) : {};
    const subtotalBase = __cpToFiniteNumber(normalized.subtotal_espacio ?? normalized.subtotalBeforeTax ?? normalized.baseValue, 0);
    const taxTotal = __cpToFiniteNumber(normalized.impuestos_total ?? normalized.taxTotal, 0);
    const convenioValue = __cpToFiniteNumber(normalized.convenio_monto_entregado ?? normalized.convenioValue, 0);
    const convenioActivo = normalized.convenio_activo === true || normalized.convenioEnabled === true;
    const computedSubtotal = __cpComputeDetailSubtotalForCreate({
        ...normalized,
        subtotal_espacio: subtotalBase,
        impuestos_total: taxTotal,
        convenio_monto_entregado: convenioValue,
        convenio_activo: convenioActivo
    });
    const totalFallback = computedSubtotal + taxTotal;
    const totalValue = __cpToFiniteNumber(normalized.total_espacio ?? normalized.total, totalFallback);
    const convenioBalanceFallback = convenioActivo ? Math.max(0, subtotalBase - convenioValue) : computedSubtotal;
    normalized.subtotal_espacio = subtotalBase;
    normalized.impuestos_total = taxTotal;
    normalized.convenio_monto_entregado = convenioValue;
    normalized.total_espacio = totalValue;
    normalized.convenio_balance = __cpToFiniteNumber(normalized.convenio_balance, convenioBalanceFallback);
    return normalized;
}
function __cpSanitizeQuoteFinancials(payload = {}) {
    const normalized = payload && typeof payload === 'object' ? payload : {};
    const existingBreakdown = normalized.desglose_precios && typeof normalized.desglose_precios === 'object' ? normalized.desglose_precios : {};
    const detailRowsSource = __cpSafeArray(normalized.espacios_detalle);
    const breakdownRowsSource = __cpSafeArray(existingBreakdown.espacios);
    const rows = (detailRowsSource.length ? detailRowsSource : breakdownRowsSource).map(__cpNormalizeQuoteDetailForCreate);
    const subtotalFromRows = rows.reduce((sum, row) => sum + __cpComputeDetailSubtotalForCreate(row), 0);
    const taxesFromRows = rows.reduce((sum, row) => sum + __cpToFiniteNumber(row?.impuestos_total, 0), 0);
    const subtotal = __cpToFiniteNumber(existingBreakdown.subtotal_antes_impuestos, subtotalFromRows);
    const taxes = __cpToFiniteNumber(existingBreakdown.tax_total, taxesFromRows);
    let finalPrice = __cpToFiniteNumber(normalized.precio_final, NaN);
    if (!Number.isFinite(finalPrice)) finalPrice = __cpToFiniteNumber(existingBreakdown.precio_final_usado, NaN);
    if (!Number.isFinite(finalPrice)) finalPrice = subtotal + taxes;
    if (!Number.isFinite(finalPrice)) finalPrice = rows.reduce((sum, row) => sum + __cpToFiniteNumber(row?.total_espacio, 0), 0);
    normalized.espacios_detalle = rows;
    normalized.precio_final = Math.max(0, __cpToFiniteNumber(finalPrice, 0));
    normalized.personas = Math.max(0, parseInt(normalized.personas, 10) || 0);
    normalized.desglose_precios = {
        ...existingBreakdown,
        subtotal_antes_impuestos: Math.max(0, __cpToFiniteNumber(subtotal, 0)),
        tax_total: Math.max(0, __cpToFiniteNumber(taxes, 0)),
        precio_final_usado: Math.max(0, __cpToFiniteNumber(existingBreakdown.precio_final_usado, normalized.precio_final)),
        auto_calculado: Math.max(0, __cpToFiniteNumber(existingBreakdown.auto_calculado, normalized.precio_final)),
        convenio_base_total: Math.max(0, __cpToFiniteNumber(existingBreakdown.convenio_base_total, 0)),
        convenio_entregable_total: Math.max(0, __cpToFiniteNumber(existingBreakdown.convenio_entregable_total, 0)),
        convenio_balance_total: Math.max(0, __cpToFiniteNumber(existingBreakdown.convenio_balance_total, normalized.precio_final)),
        espacios: rows
    };
    return normalized;
}
function __cpPrepareQuoteCreatePayload(payload) {
    let normalized = __cpCloneQuotePayloadValue(payload || {});
    normalized.tenant = CP_TENANT_SLUG;
    [
        'cliente_id',
        'creado_por',
        'creado_por_nombre',
        'modificado_por',
        'modificado_por_nombre',
        'cliente_rfc',
        'cliente_contacto',
        'cliente_email'
    ].forEach((field) => {
        if (normalized[field] === null || normalized[field] === undefined) normalized[field] = '';
    });
    return __cpSanitizeQuoteFinancials(normalized);
}
function __cpExtractCreateQuoteErrorMessage(error) {
    const fallback = String(error?.message || 'No se pudo crear la cotización.').trim();
    const details = error?.details?.data && typeof error.details.data === 'object' ? error.details.data : null;
    if (!details) return fallback;
    const fieldErrors = Object.entries(details)
        .map(([field, meta]) => {
            const message = String(meta?.message || '').trim();
            return message ? `${field}: ${message}` : '';
        })
        .filter(Boolean)
        .slice(0, 3);
    if (!fieldErrors.length) return fallback;
    const detailText = fieldErrors.join(' | ');
    return fallback.toLowerCase().includes(detailText.toLowerCase()) ? fallback : `${fallback} (${detailText})`;
}
async function __cpCreateQuoteRecord(payload) {
    const createPayload = __cpPrepareQuoteCreatePayload(payload);
    const svc = __cpNativeCotizacionesService();
    if (svc) {
        try {
            const created = await svc.create(createPayload, { schema: FIN_SCHEMA });
            const createdId = String(created?.id || created?._pb_id || '').trim();
            return { error: null, data: created || null, id: createdId };
        } catch (error) {
            return { error, data: null, id: '' };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').insert(createPayload);
    const data = result && result.data ? result.data : null;
    const createdId = String(data?.id || data?._pb_id || '').trim();
    return { error: result && result.error ? result.error : null, data, id: createdId };
}

function parseIds(v) { if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch (e) { return v.split(',').map(x => x.trim()).filter(Boolean); } } return []; }
function formatMoney(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0); }
function buildCpQuotePriceDisplay(baseBeforeTax, taxOnlyAmount, finalPrice, taxLabel, options = {}) {
    const compact = options.compact === true;
    const wrapperClass = compact ? 'text-right leading-tight' : 'text-right leading-none';
    const finalClass = compact ? 'font-black text-base text-gray-900' : 'font-black text-lg text-gray-900';
    const hasTax = (parseFloat(taxOnlyAmount) || 0) > 0;
    return `<div class="${wrapperClass}">
        <p class="text-[10px] text-gray-400 font-bold mb-0.5">${formatMoney(baseBeforeTax)}</p>
        ${hasTax ? `<p class="text-[10px] text-red-500 font-bold mb-0.5">+ ${formatMoney(taxOnlyAmount)}${taxLabel ? ` (${taxLabel})` : ''}</p>` : ''}
        <p class="${finalClass}">${formatMoney(finalPrice)}</p>
    </div>`;
}
function formatTaxPercent(value) { const raw = parseFloat(value); const pct = Number.isFinite(raw) ? (raw > 0 && raw <= 1 ? raw * 100 : raw) : 0; return Number.isInteger(pct) ? String(pct) : pct.toLocaleString('es-MX', { maximumFractionDigits: 2 }); }
function getSpaceTaxDetails(space) {
    const taxIds = parseIds(space?.impuestos_ids || space?.impuestos).map(id => String(id || '').trim()).filter(Boolean);
    return taxIds.map(taxId => findCpQuoteTaxRecord(taxId, space)).filter(Boolean);
}
function getSpaceTaxLabel(space) {
    const rows = getSpaceTaxDetails(space);
    if (!rows.length) return 'Sin impuestos';
    return rows.map(t => `${t.nombre} ${formatTaxPercent(t.porcentaje)}%`).join(', ');
}
function normalizeCpSpaceTag(value) {
    const raw = String(value || '').trim();
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
    return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function normalizeCpManagerTypeSelection(value) {
    return normalizeCpSpaceTag(value) === 'publicidad' ? 'publicidad' : 'espacio';
}
function getCpSpaceTags(space) {
    const tags = new Set();
    const push = (value) => {
        const normalized = normalizeCpSpaceTag(value);
        if (normalized) tags.add(normalized);
    };
    push(space?.tipo);
    let rawTags = [];
    try {
        rawTags = typeof space?.etiquetas === 'string' ? JSON.parse(space.etiquetas) : (space?.etiquetas || []);
    } catch (_) {
        rawTags = [];
    }
    (Array.isArray(rawTags) ? rawTags : []).forEach(push);
    return tags;
}
function cpSpaceHasTag(space, term) {
    const needle = normalizeCpSpaceTag(term);
    return Array.from(getCpSpaceTags(space)).some((tag) => tag === needle || tag.includes(needle));
}
function isCpAdvertisingSpace(space) {
    return cpSpaceHasTag(space, 'publicidad');
}
function isCpLocalLikeSpace(space) {
    return cpSpaceHasTag(space, 'local') || cpSpaceHasTag(space, 'isla') || cpSpaceHasTag(space, 'espacio');
}
function isCpVenueSpaceCard(space) {
    return !isCpAdvertisingSpace(space) && cpSpaceHasTag(space, 'espacio');
}
function normalizeCpSpaceConvenioFlag(value, fallback = true) {
    if (value === null || value === undefined || value === '') return !!fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return !!fallback;
    return ['1', 'true', 'si', 'sí', 'yes', 'on'].includes(normalized);
}
function cpSpaceAllowsConvenio(space) {
    return isCpAdvertisingSpace(space) && normalizeCpSpaceConvenioFlag(space?.permite_convenio, true);
}
function normalizeCpMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
}
function normalizeCpMeasureUnit(value) {
    const normalized = String(value || 'M').trim().toUpperCase();
    if (normalized === 'CM') return 'CM';
    if (normalized === 'M2') return 'M2';
    return 'M';
}
function trimCpMeasureValue(value) {
    return String(value || '')
        .replace(/(\.\d*?[1-9])0+$/g, '$1')
        .replace(/\.0+$/g, '')
        .trim();
}
function getCpSpaceMaterialLabel(space) {
    return String(space?.material || '').trim() || 'Sin material';
}
function getCpSpaceMeasuresLabel(space) {
    const width = normalizeCpMeasureValue(space?.medida_ancho ?? space?.ancho);
    const height = normalizeCpMeasureValue(space?.medida_alto ?? space?.alto);
    const unit = normalizeCpMeasureUnit(space?.medida_unidad || space?.unidad_medida || 'M');
    if (width === null && height === null) return 'Sin medidas';
    if (width !== null && height !== null) return `${trimCpMeasureValue(width)} x ${trimCpMeasureValue(height)} ${unit}`;
    const single = width !== null ? width : height;
    return `${trimCpMeasureValue(single)} ${unit}`;
}
function getCpSpaceB2bConfig(space) {
    try {
        const raw = space?.config_b2b;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}
function normalizeCpDigitalMediaConfig(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const enabled = !!(source.enabled ?? source.activo ?? source.es_digital);
    const rawType = normalizeCpSpaceTag(source.media_type || source.tipo_medio || source.tipo || source.formato || 'imagen');
    const durationValue = normalizeCpMeasureValue(source.duration_value ?? source.duracion_valor ?? source.duracion);
    const unit = String(source.duration_unit || source.duracion_unidad || 'segundos').trim().toLowerCase();
    const pixelWidth = normalizeCpMeasureValue(source.pixel_width ?? source.pixeles_ancho ?? source.ancho_px);
    const pixelHeight = normalizeCpMeasureValue(source.pixel_height ?? source.pixeles_alto ?? source.alto_px);
    return {
        enabled,
        media_type: rawType.includes('video') ? 'video' : 'imagen',
        duration_value: durationValue,
        duration_unit: unit === 'minutos' ? 'minutos' : 'segundos',
        pixel_width: pixelWidth,
        pixel_height: pixelHeight
    };
}
function getCpSpaceDigitalMediaConfig(space) {
    const b2b = getCpSpaceB2bConfig(space);
    return normalizeCpDigitalMediaConfig(b2b.digital_media || b2b.digitalMedia || b2b.medio_digital || {});
}
function formatCpDigitalMediaType(value) {
    return normalizeCpDigitalMediaConfig(value).media_type === 'video' ? 'Video' : 'Imagen';
}
function formatCpDigitalMediaPixels(value) {
    const cfg = normalizeCpDigitalMediaConfig(value);
    if (cfg.pixel_width === null || cfg.pixel_height === null) return 'Sin pixeles';
    return `${trimCpMeasureValue(cfg.pixel_width)} x ${trimCpMeasureValue(cfg.pixel_height)} px`;
}
function formatCpDigitalMediaDuration(value) {
    const cfg = normalizeCpDigitalMediaConfig(value);
    if (cfg.duration_value === null) return 'Sin duración';
    return `${trimCpMeasureValue(cfg.duration_value)} ${cfg.duration_unit}`;
}
function setCpDigitalMediaManagerValues(value) {
    const cfg = normalizeCpDigitalMediaConfig(value);
    const enabled = document.getElementById('mgr-digital-media');
    const mediaType = document.getElementById('mgr-digital-media-type');
    const durationValue = document.getElementById('mgr-digital-duration-value');
    const durationUnit = document.getElementById('mgr-digital-duration-unit');
    const pixelWidth = document.getElementById('mgr-digital-pixel-width');
    const pixelHeight = document.getElementById('mgr-digital-pixel-height');
    if (enabled) enabled.checked = cfg.enabled;
    if (mediaType) mediaType.value = cfg.media_type;
    if (durationValue) durationValue.value = cfg.duration_value ?? '';
    if (durationUnit) durationUnit.value = cfg.duration_unit;
    if (pixelWidth) pixelWidth.value = cfg.pixel_width ?? '';
    if (pixelHeight) pixelHeight.value = cfg.pixel_height ?? '';
    window.syncCpManagerTypeFields?.();
}
function readCpDigitalMediaManagerValues() {
    const enabled = !!document.getElementById('mgr-digital-media')?.checked;
    return normalizeCpDigitalMediaConfig({
        enabled,
        media_type: document.getElementById('mgr-digital-media-type')?.value,
        duration_value: document.getElementById('mgr-digital-duration-value')?.value,
        duration_unit: document.getElementById('mgr-digital-duration-unit')?.value,
        pixel_width: document.getElementById('mgr-digital-pixel-width')?.value,
        pixel_height: document.getElementById('mgr-digital-pixel-height')?.value
    });
}
function getCpSpaceMeasureParts(space) {
    const width = normalizeCpMeasureValue(space?.medida_ancho ?? space?.ancho);
    const height = normalizeCpMeasureValue(space?.medida_alto ?? space?.alto);
    const unit = normalizeCpMeasureUnit(space?.medida_unidad || space?.unidad_medida || 'M');
    const parts = [];
    if (width !== null) parts.push({ label: 'Ancho', value: `${trimCpMeasureValue(width)} ${unit}` });
    if (height !== null) parts.push({ label: 'Alto', value: `${trimCpMeasureValue(height)} ${unit}` });
    return parts;
}
function renderCpMeasureParts(space, options = {}) {
    const parts = getCpSpaceMeasureParts(space);
    if (!parts.length) return `<span class="${options.emptyClass || 'text-gray-500 font-semibold'}">Sin medidas</span>`;
    const wrapperClass = options.wrapperClass || 'flex flex-wrap justify-end gap-1.5';
    const chipClass = options.chipClass || 'inline-flex items-center gap-1 rounded-md bg-white border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-700';
    const labelClass = options.labelClass || 'uppercase text-gray-400';
    const valueClass = options.valueClass || 'text-gray-800';
    return `<div class="${wrapperClass}">${parts.map((part) => `<span class="${chipClass}"><span class="${labelClass}">${part.label}</span><span class="${valueClass}">${part.value}</span></span>`).join('')}</div>`;
}
function getCpCardInfoRows(space, options = {}) {
    const rows = [];
    const includeType = options.includeType === true;
    const isPublicidad = isCpAdvertisingSpace(space);
    if (includeType) rows.push({ label: 'Tipo', value: space?.tipo || '--' });
    const digitalMedia = isPublicidad ? getCpSpaceDigitalMediaConfig(space) : null;
    if (isPublicidad && digitalMedia?.enabled) {
        rows.push({ label: 'Formato', value: formatCpDigitalMediaType(digitalMedia) });
        rows.push({ label: 'Pixeles', value: formatCpDigitalMediaPixels(digitalMedia) });
        rows.push({ label: 'Duración', value: formatCpDigitalMediaDuration(digitalMedia) });
    } else if (isPublicidad) {
        rows.push({ label: 'Medidas', value: getCpSpaceMeasuresLabel(space) });
    }
    if (isPublicidad) rows.push({ label: 'Material', value: getCpSpaceMaterialLabel(space) });
    if (!isCpAdvertisingSpace(space) && !isCpLocalLikeSpace(space)) rows.push({ label: 'Impuestos', value: getSpaceTaxLabel(space) });
    return rows.filter((row) => String(row?.value || '').trim());
}
function renderCpCardInfoRows(space) {
    return getCpCardInfoRows(space).map((row) => {
        const valueHtml = row.label === 'Medidas'
            ? renderCpMeasureParts(space)
            : `<span class="font-bold text-gray-700 text-right">${row.value}</span>`;
        return `<div class="mb-4 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-[11px] flex justify-between gap-3"><span class="font-black uppercase text-gray-400">${row.label}</span>${valueHtml}</div>`;
    }).join('');
}
function renderCpPreviewBadges(space) {
    return getCpCardInfoRows(space).map((row) => {
        if (row.label === 'Medidas') {
            const parts = getCpSpaceMeasureParts(space);
            if (!parts.length) return `<span class="px-2 py-1 rounded-full bg-white/15 text-white font-bold">Medidas: Sin medidas</span>`;
            return parts.map((part) => `<span class="px-2 py-1 rounded-full bg-white/15 text-white font-bold">${part.label}: ${part.value}</span>`).join('');
        }
        return `<span class="px-2 py-1 rounded-full bg-white/15 text-white font-bold">${row.label}: ${row.value}</span>`;
    }).join('');
}
window.syncCpManagerTypeFields = function () {
    const typeEl = document.getElementById('mgr-type');
    const selectedType = normalizeCpManagerTypeSelection(typeEl?.value || '');
    const attrsGrid = document.getElementById('mgr-attributes-grid');
    const materialField = document.getElementById('mgr-material-field');
    const measuresField = document.getElementById('mgr-measures-field');
    const convenioField = document.getElementById('mgr-convenio-field');
    const digitalToggleField = document.getElementById('mgr-digital-toggle-field');
    const digitalDetailsField = document.getElementById('mgr-digital-media-field');
    const digitalToggle = document.getElementById('mgr-digital-media');
    if (typeEl && typeEl.value !== selectedType) typeEl.value = selectedType;
    const isPublicidad = selectedType === 'publicidad';
    const isDigital = isPublicidad && !!digitalToggle?.checked;
    if (attrsGrid) attrsGrid.classList.toggle('hidden', !isPublicidad);
    if (materialField) materialField.classList.toggle('hidden', !isPublicidad);
    if (measuresField) measuresField.classList.toggle('hidden', !isPublicidad || isDigital);
    if (convenioField) convenioField.classList.toggle('hidden', !isPublicidad);
    if (digitalToggleField) digitalToggleField.classList.toggle('hidden', !isPublicidad);
    if (digitalDetailsField) digitalDetailsField.classList.toggle('hidden', !isDigital);
};
function escapeCpMaterialOption(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function renderCpMaterialSuggestions() {
    const select = document.getElementById('mgr-material');
    if (!select) return;
    const current = String(select.value || '').trim();
    const items = Array.from(new Set(cpMaterialCatalog.map((item) => String(item || '').trim()).filter(Boolean)));
    if (current && !items.includes(current)) items.unshift(current);
    // Auditoria TI: publicidad CP usa select real, no datalist, para evitar opciones libres del navegador.
    select.innerHTML = '<option value="">Selecciona un material...</option>' + items.map((item) => `<option value="${escapeCpMaterialOption(item)}">${escapeCpMaterialOption(item)}</option>`).join('');
    select.value = current;
}
async function loadCpMaterialCatalog() {
    cpMaterialCatalog = [];
    try {
        const tenant = resolveCpQuoteTenantSlug('casa_de_piedra');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'materiales_cp');
        if (error) throw error;
        const row = pickCpQuoteLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const items = parseCpQuoteConfigJson(row?.valor_json)?.items;
        cpMaterialCatalog = Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
    } catch (_) {
        cpMaterialCatalog = [];
    }
    renderCpMaterialSuggestions();
}
function normalizeCpConvenioName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function buildCpConvenioCatalog(items = []) {
    const source = Array.isArray(items) ? items : [];
    const seen = new Set();
    const out = [];
    source.forEach((item, idx) => {
        const record = (item && typeof item === 'object') ? item : { nombre: item };
        const nombre = normalizeCpConvenioName(record.nombre || record.name || record.label || '');
        const key = nombre.toLowerCase();
        if (!nombre || seen.has(key)) return;
        seen.add(key);
        out.push({
            id: String(record.id || `cp_conv_${idx}_${key.replace(/\s+/g, '_')}`),
            nombre
        });
    });
    return out;
}
async function loadCpConvenioCatalog() {
    cpConvenioCatalog = [];
    try {
        const tenant = resolveCpQuoteTenantSlug('casa_de_piedra');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', CP_CONVENIOS_CFG_KEY);
        if (error) throw error;
        const row = pickCpQuoteLatestConfigRow(Array.isArray(data) ? data : (data ? [data] : []));
        const items = parseCpQuoteConfigJson(row?.valor_json)?.items;
        cpConvenioCatalog = buildCpConvenioCatalog(items);
    } catch (e) {
        cpConvenioCatalog = [];
        console.warn('No se pudo cargar el catálogo de convenios de CP:', e);
    }
    syncCpQuoteConvenioCatalogSelect();
}
function normalizeCpQuoteConcept(concept = {}) {
    const amount = Math.max(0, parseFloat(concept?.amount ?? concept?.value ?? 0) || 0);
    return {
        description: String(concept?.description || concept?.concepto || concept?.nombre || 'Concepto').trim() || 'Concepto',
        amount,
        value: amount,
        unit: concept?.unit || 'fixed',
        type: concept?.type || 'aumento',
        meta: (concept?.meta && typeof concept.meta === 'object') ? { ...concept.meta } : {}
    };
}
function isCpQuoteConvenioConcept(concept = {}) {
    return !!(concept?.meta && concept.meta.convenio_item === true);
}
function buildCpQuoteConvenioConcept(option = {}, cantidad, amount) {
    const qty = Math.max(1, parseInt(cantidad, 10) || 1);
    const value = Math.max(0, parseFloat(amount || 0) || 0);
    const nombre = normalizeCpConvenioName(option?.nombre || option?.name || option?.label || '');
    return normalizeCpQuoteConcept({
        description: `${nombre || 'Convenio'} (${qty} ${qty === 1 ? 'entrega' : 'entregas'})`,
        amount: value,
        value,
        unit: 'fixed',
        type: 'aumento',
        meta: {
            convenio_item: true,
            convenio_option_id: String(option?.id || '').trim(),
            convenio_nombre: nombre,
            cantidad_entrega: qty
        }
    });
}
function getCpQuoteConvenioItems(cfg = __cpGetActiveCfg()) {
    return __cpSafeArray(cfg?.concepts).map(normalizeCpQuoteConcept).filter(isCpQuoteConvenioConcept);
}
function buildCpQuoteConvenioPayloadItems(cfg = __cpGetActiveCfg()) {
    return getCpQuoteConvenioItems(cfg).map((concept) => ({
        id: String(concept?.meta?.convenio_option_id || '').trim() || null,
        nombre: concept?.meta?.convenio_nombre || concept.description || 'Convenio',
        cantidad_entrega: Math.max(1, parseInt(concept?.meta?.cantidad_entrega || 1, 10) || 1),
        monto: Math.max(0, parseFloat(concept?.amount ?? concept?.value ?? 0) || 0)
    }));
}
function syncCpQuoteConvenioCatalogSelect() {
    const select = document.getElementById('q-convenio-select');
    if (!select) return;
    const current = String(select.value || '').trim();
    select.innerHTML = '<option value="">Selecciona una opción...</option>' + cpConvenioCatalog.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join('');
    if (current && cpConvenioCatalog.some((item) => item.id === current)) select.value = current;
}
function renderCpQuoteConvenioItems() {
    const container = document.getElementById('q-convenio-items');
    if (!container) return;
    const cfg = __cpGetActiveCfg();
    const items = getCpQuoteConvenioItems(cfg);
    if (!items.length) {
        container.innerHTML = '<div class="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-4 text-[11px] font-bold text-amber-700/70">Aún no agregas tratos de convenio.</div>';
        return;
    }
    container.innerHTML = items.map((item, index) => {
        const qty = Math.max(1, parseInt(item?.meta?.cantidad_entrega || 1, 10) || 1);
        const amount = Math.max(0, parseFloat(item?.amount ?? item?.value ?? 0) || 0);
        const name = item?.meta?.convenio_nombre || item.description || 'Convenio';
        return `<div class="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
            <div class="min-w-0">
                <p class="text-xs font-black text-gray-800 truncate">${name}</p>
                <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wide">${qty} ${qty === 1 ? 'entrega' : 'entregas'} acordadas</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
                <span class="text-xs font-black text-gray-800">${formatMoney(amount)}</span>
                <button type="button" onclick="window.removeQuoteConvenioItem(${index})" class="w-8 h-8 rounded-full bg-white text-gray-400 hover:text-red-500 border border-amber-100 transition"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>`;
    }).join('');
}
function syncCpQuoteConvenioUi(cfg = __cpGetActiveCfg()) {
    const active = cfg || __cpGetActiveCfg();
    const space = __cpGetSpaceById(active?.spaceId);
    const allowsConvenio = cpSpaceAllowsConvenio(space) || !!active?.convenioEnabled;
    const card = document.getElementById('q-convenio-card');
    const wrap = document.getElementById('q-convenio-wrap');
    const chk = document.getElementById('q-convenio-enabled');
    const customPriceChk = document.getElementById('q-custom-price-enabled');
    const customPriceWrap = document.getElementById('q-custom-price-wrap');
    if (!allowsConvenio && active && !active.convenioEnabled) {
        active.convenioEnabled = false;
        active.concepts = __cpSafeArray(active.concepts).map(normalizeCpQuoteConcept).filter((concept) => !isCpQuoteConvenioConcept(concept));
    }
    if (card) card.classList.toggle('hidden', !allowsConvenio);
    if (chk) {
        chk.checked = !!active?.convenioEnabled;
        chk.disabled = !allowsConvenio;
    }
    if (wrap) wrap.classList.toggle('hidden', !active?.convenioEnabled || !allowsConvenio);
    if (customPriceChk) {
        if (active?.convenioEnabled) {
            customPriceChk.checked = false;
            customPriceChk.disabled = true;
        } else {
            customPriceChk.disabled = false;
        }
    }
    if (active?.convenioEnabled && customPriceWrap) customPriceWrap.classList.add('hidden');
    syncCpQuoteConvenioCatalogSelect();
    renderCpQuoteConvenioItems();
}
window.safeFormatDate = function (dateStr) { if (!dateStr) return '--'; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parts[2]}/${parts[1]}/${parts[0]}`; };

async function __cpResolveQuoteActorAudit() {
    let actorId = '';
    let actorName = '';
    const looksLikeId = (value) => {
        const safe = String(value || '').trim();
        if (!safe) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safe)
            || /^[a-z0-9]{15}$/i.test(safe)
            || /^[a-f0-9]{24}$/i.test(safe)
            || /^[a-z0-9_-]{12,}$/i.test(safe);
    };
    const sanitizeActorName = (value) => {
        const safe = String(value || '').trim();
        if (!safe) return '';
        if (safe.includes('@')) return safe.split('@')[0];
        if (looksLikeId(safe)) return '';
        return safe;
    };
    try {
        const auth = await window.globalPocketBase.auth.getUser();
        actorId = String(auth?.data?.user?.id || '').trim();
        const email = String(auth?.data?.user?.email || '').trim();
        const candidates = [
            auth?.data?.user?.login_username,
            auth?.data?.user?.username,
            email ? email.split('@')[0] : ''
        ];
        actorName = candidates.map(sanitizeActorName).find(Boolean) || '';
    } catch (_) { }
    const cachedName = sanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) actorName = cachedName;
    if (!actorName) actorName = 'Usuario';
    return { actorId, actorName };
}

async function __cpResolveCurrentUserProfile(sessionUser = {}) {
    const pbClient = window.globalPocketBase || window.tenantPocketBase;
    const fallback = sessionUser && typeof sessionUser === 'object' ? sessionUser : {};
    if (!pbClient) return { ...fallback };
    const id = String(fallback?.id || fallback?.record?.id || '').trim();
    const email = String(fallback?.email || fallback?.record?.email || '').trim().toLowerCase();
    const lookupOne = async (table, field, value) => {
        if (!value) return null;
        try {
            const { data, error } = await pbClient.from(table).select('*').eq(field, value).maybeSingle();
            if (!error && data) return data;
        } catch (_) { }
        return null;
    };
    let profile = await lookupOne('app_users', 'id', id);
    if (!profile) profile = await lookupOne('app_users', 'email', email);
    const merged = { ...fallback, ...(profile || {}) };
    if (!merged.app_metadata && fallback?.app_metadata) merged.app_metadata = fallback.app_metadata;
    return merged;
}

function getPremontajePct() { const n = parseFloat(__cpPremontajePct); return Number.isFinite(n) && n >= 0 ? n : 25; }
function __cpGetHoraExtraCfg() {
    const modeRaw = String(__cpHoraExtraCfg?.mode || '').toLowerCase();
    const mode = (modeRaw === 'fixed' || modeRaw === 'percent') ? modeRaw : 'percent';
    const parsedValue = parseFloat(__cpHoraExtraCfg?.value);
    const value = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 100;
    const allowCustom = __cpHoraExtraCfg?.allowCustom !== false;
    return { mode, value, allowCustom };
}
function __cpResolveHoraExtraUnit(space) {
    const cfg = __cpGetHoraExtraCfg();
    const base = parseFloat(__cpB2B(space)?.precio_hora_extra || 0) || 0;
    return cfg.mode === 'fixed' ? cfg.value : (base * (cfg.value / 100));
}
// FullCalendar necesita resize después de abrir modal para evitar render compacto inicial.
function __cpRefreshCalendarLayout(calendar) {
    if (!calendar || typeof calendar.updateSize !== 'function') return;
    const refresh = () => { try { calendar.updateSize(); } catch (e) { } };
    requestAnimationFrame(() => {
        refresh();
        setTimeout(refresh, 60);
        setTimeout(refresh, 180);
    });
}
function getSpaceMaxCapacity(space) {
    let rules = [];
    try { rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []); } catch (e) { }
    if (!Array.isArray(rules) || !rules.length) return 999999;
    const finite = rules.map(r => parseInt(r?.max, 10)).filter(v => Number.isFinite(v) && v > 0 && v < 999999);
    return finite.length ? Math.max(...finite) : 999999;
}
async function loadPremontajePctConfig() {
    __cpPremontajePct = 25;
    __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
    try {
        const tenant = resolveCpQuoteTenantSlug('casa_de_piedra');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,valor_num,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .in('clave', ['premontaje_pct', 'hora_extra_cfg']);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const selectedRows = [
            pickCpQuoteLatestConfigRow(rows.filter((row) => String(row?.clave || '').toLowerCase() === 'premontaje_pct')),
            pickCpQuoteLatestConfigRow(rows.filter((row) => String(row?.clave || '').toLowerCase() === 'hora_extra_cfg'))
        ].filter(Boolean);
        selectedRows.forEach(row => {
            const key = String(row?.clave || '').toLowerCase();
            const cfg = parseCpQuoteConfigJson(row?.valor_json);
            if (key === 'premontaje_pct') {
                const raw = row?.valor_num ?? cfg?.value ?? cfg?.percent;
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed) && parsed >= 0) __cpPremontajePct = parsed;
                return;
            }
            if (key === 'hora_extra_cfg') {
                const modeRaw = String(cfg?.mode || '').toLowerCase();
                const mode = (modeRaw === 'fixed' || modeRaw === 'percent') ? modeRaw : 'percent';
                const rawVal = row?.valor_num ?? cfg?.value ?? 100;
                const parsedVal = parseFloat(rawVal);
                const value = Number.isFinite(parsedVal) && parsedVal >= 0 ? parsedVal : 100;
                const allowCustom = cfg?.allow_custom !== false;
                __cpHoraExtraCfg = { mode, value, allowCustom };
            }
        });
    } catch (e) {
        __cpPremontajePct = 25;
        __cpHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
    }
}

function calculateDayByDayTotal(space, startStr, endStr, guests, options = {}) {
    if (!startStr) return { total: 0 };
    const endS = endStr || startStr;
    let rules = [];
    try { rules = typeof space.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space.precios_por_dia || []); } catch (e) { }
    if (!Array.isArray(rules) || rules.length === 0) rules = [{ min: 0, max: 999999, precios: { lunes: space.precio_base || 0, martes: space.precio_base || 0, miercoles: space.precio_base || 0, jueves: space.precio_base || 0, viernes: space.precio_base || 0, sabado: space.precio_base || 0, domingo: space.precio_base || 0 } }];

    const guestCount = parseInt(guests) || 1;
    let activeRule = rules.find(r => guestCount >= r.min && guestCount <= r.max);
    if (!activeRule) activeRule = rules[rules.length - 1];

    const prices = activeRule ? (activeRule.precios || {}) : {}; let total = 0;
    const start = new Date(startStr + 'T00:00:00'); const end = new Date(endS + 'T00:00:00'); const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    let blockedDays = []; try { blockedDays = typeof space.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space.dias_bloqueados || []); } catch (e) { }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = keys[d.getDay()]; let price = parseFloat(prices[key] || 0);
        if (!options.ignoreBlocks && blockedDays.includes(key)) price = 0;
        total += price;
    }
    return { total };
}

// CLICK AFUERA CIERRA MODALES (EXCEPTO CUANDO SE REQUIERE CONFIRMACIÓN O EDICIÓN)
window.addEventListener('click', function (e) {
    const qModal = document.getElementById('quote-modal');
    const mgrModal = document.getElementById('manager-modal');
    const montajeModal = document.getElementById('montaje-modal');
    const quoteDateModal = document.getElementById('quote-date-modal');

    if (e.target === mgrModal) window.closeModal('manager-modal');
    if (e.target === qModal) window.closeModal('quote-modal');
    if (e.target === montajeModal) montajeModal.classList.add('hidden');
    if (e.target === quoteDateModal) window.closeModal('quote-date-modal');
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) { }
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (window.PB_CLIENT) { if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } }); if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY); }
    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }
    const profile = await __cpResolveCurrentUserProfile(session.user);
    const cachedRole = String(localStorage.getItem('hub_user_cache_role') || '').trim().toLowerCase();
    const userRole = String(profile?.role || profile?.rol || cachedRole).toLowerCase().trim();
    const roleHasAccess = (userRole === 'admin') || (userRole === 'casa_de_piedra') || (userRole === 'verificador');
    if (userRole === 'admin' || userRole === 'verificador') myPermissions = { access: true, catalog_manage: true };
    else if (roleHasAccess) myPermissions = { access: true, catalog_manage: false };
    else {
        const profilePerms = profile?.app_metadata?.finanzas?.permissions;
        if (profilePerms && typeof profilePerms === 'object') {
            myPermissions = { access: true, catalog_manage: false, ...profilePerms, catalog_manage: !!profilePerms.catalog_manage };
        } else {
            myPermissions = { access: true, catalog_manage: false };
        }
    }
    if (!myPermissions.access) return window.showToast?.('No tienes permisos.', 'error');
    if (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) { const btn = document.getElementById('btn-new-space'); if (btn) btn.classList.remove('hidden'); }
    cpQuoteApplyViewStateControls();
    await loadTaxes();
    await loadPremontajePctConfig();
    await loadCpMaterialCatalog();
    await loadCpConvenioCatalog();
    if (IS_QUOTE_PAGE) {
        __cpSetQuoteWorkspaceVisible(false);
        await loadClientProfilesForQuoteModal();
        const today = __cpTodayISO();
        const ds = document.getElementById('date-start');
        const de = document.getElementById('date-end');
        if (ds) ds.min = today;
        if (de) de.min = today;
    }
    loadCatalog();
    if (IS_QUOTE_PAGE) {
        const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true);
        catalogConcepts = data || [];
        const preselect = new URLSearchParams(window.location.search || '').get('space');
        if (preselect) setTimeout(() => window.openQuoteModal(preselect), 150);
    }
});

async function loadTaxes() {
    const tenant = resolveCpQuoteTenantSlug();
    let rows = [];
    try {
        const { data } = await window.tenantPocketBase.from('impuestos').select('*').order('nombre', { ascending: true });
        rows = data || [];
    } catch (_) {
        rows = [];
    }
    dbTaxes = filterCpQuoteRowsByTenant(rows, tenant);
    if (!dbTaxes.length && window.globalPocketBase && tenant) {
        try {
            const { data } = await window.globalPocketBase.from('impuestos').select('*').eq('tenant', tenant);
            dbTaxes = filterCpQuoteRowsByTenant(data || [], tenant);
        } catch (_) { }
    }
}
async function loadCatalog() {
    cpQuoteApplyViewStateControls();
    const tenant = resolveCpQuoteTenantSlug();
    const { data } = await window.tenantPocketBase.from('espacios').select('*').order('clave');
    allSpaces = filterCpQuoteRowsByTenant(data || [], tenant).sort((a, b) => String(a?.clave || a?.nombre || '').localeCompare(String(b?.clave || b?.nombre || ''), 'es', { numeric: true, sensitivity: 'base' }));
    cpQuoteRestoringViewState = true;
    if (typeof window.filterCatalogLogic === 'function') window.filterCatalogLogic({ skipSave: true });
    else renderSpaces(allSpaces);
    cpQuoteRestoringViewState = false;
    cpQuoteRestoreViewStateAfterRender();
}

function renderSpaces(list) {
    const g = document.getElementById('spaces-grid');
    g.innerHTML = '';
    if (list.length === 0) {
        g.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400 font-bold">No se encontraron espacios.</div>';
        return;
    }
    list.forEach(s => {
        const infoRowsHtml = renderCpCardInfoRows(s);
        const isPublicidadCard = __cpIsPublicidadCfg(s);
        let adjustedBase = parseFloat(s.precio_base || 0) || 0;
        const adjustmentType = normalizeCpQuoteAdjustmentType(s.ajuste_tipo);
        if (adjustmentType === 'aumento') adjustedBase += adjustedBase * ((parseFloat(s.ajuste_porcentaje) || 0) / 100);
        if (adjustmentType === 'descuento') adjustedBase -= adjustedBase * (normalizeCpQuoteAdjustmentPercent(adjustmentType, s.ajuste_porcentaje) / 100);
        const taxDetails = getSpaceTaxDetails(s);
        const taxPriceLabel = taxDetails.length === 1 ? taxDetails[0].nombre : 'Impuestos';
        let totalTax = 0;
        if (taxDetails.length > 0) taxDetails.forEach((tax) => { const rate = parseFloat(tax?.porcentaje || 0) > 1 ? (parseFloat(tax.porcentaje || 0) / 100) : parseFloat(tax?.porcentaje || 0); totalTax += adjustedBase * rate; });
        const finalPrice = adjustedBase + totalTax;
        const taxOnlyAmount = finalPrice - adjustedBase;
        const quoteInfoRows = getCpCardInfoRows(s, { includeType: true });
        const inQuote = IS_QUOTE_PAGE && Array.isArray(__cpQuoteSpaces) && __cpQuoteSpaces.some(x => String(x.spaceId) === String(s.id));
        const isActiveQuote = IS_QUOTE_PAGE && String(__cpActiveSpaceId || '') === String(s.id);
        if (IS_QUOTE_PAGE) {
            const cardState = isActiveQuote
                ? 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-50'
                : (inQuote ? (isPublicidadCard ? 'border-red-200 ring-1 ring-red-100 bg-red-50/60' : 'border-yellow-300 ring-1 ring-yellow-200 bg-yellow-50') : 'border-gray-200 bg-white');
            const stateLabel = isActiveQuote
                ? '<span class="text-[9px] font-black uppercase text-emerald-700">Activo</span>'
                : (inQuote ? `<span class="text-[9px] font-black uppercase ${isPublicidadCard ? 'text-brand-red' : 'text-brand-dark'}">Seleccionado</span>` : '<span class="text-[9px] font-bold uppercase text-gray-400">Desactivado</span>');
            const powerOffBtn = inQuote
                ? `<button type="button" onclick="event.stopPropagation(); window.powerOffQuoteSpace('${s.id}')" class="px-2 py-1 rounded border border-gray-200 bg-white text-[9px] font-black uppercase text-gray-600 hover:text-red-600">Desactivar</button>`
                : '';
            g.innerHTML += `<div onclick="window.toggleQuoteSpaceCard('${s.id}')" class="rounded-xl border ${cardState} p-4 shadow-sm transition hover:shadow-md cursor-pointer">
                <div class="mb-3">
                    <p class="text-sm font-black text-gray-800 uppercase leading-tight">${s.nombre}</p>
                    <p class="text-[10px] font-mono text-gray-400 mt-1">${s.clave || '--'}</p>
                </div>
                <div class="space-y-1.5 mb-4 text-[11px]">
                    ${isCpVenueSpaceCard(s) ? `<div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">Invitados</span><span class="text-gray-700 font-bold text-right">${__cpGuestRangeText(s)}</span></div>` : ''}
                    ${isCpVenueSpaceCard(s) ? `<div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">Horarios</span><span class="text-gray-700 font-bold text-right">${__cpHorariosText(s)}</span></div>` : ''}
                    ${quoteInfoRows.map((row) => {
                if (row.label === 'Medidas') {
                    return `<div class="flex justify-between items-start gap-2"><span class="text-gray-400 font-bold uppercase">Medidas</span>${renderCpMeasureParts(s, {
                        wrapperClass: 'flex flex-wrap justify-end gap-1',
                        chipClass: 'inline-flex items-center gap-1 rounded-md bg-white border border-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-700',
                        labelClass: 'uppercase text-gray-400',
                        valueClass: 'text-gray-800',
                        emptyClass: 'text-gray-500 font-semibold text-right'
                    })}</div>`;
                }
                return `<div class="flex justify-between gap-2"><span class="text-gray-400 font-bold uppercase">${row.label}</span><span class="text-gray-700 font-bold text-right">${row.value}</span></div>`;
            }).join('')}
                    ${isPublicidadCard ? `<div class="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2">${buildCpQuotePriceDisplay(adjustedBase, taxOnlyAmount, finalPrice, taxPriceLabel, { compact: true })}</div>` : ''}
                </div>
                <div class="flex items-center justify-between gap-2">${stateLabel}${powerOffBtn}</div>
            </div>`;
            return;
        }

        let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
        if (allUrls.length === 0) allUrls = ['../../assets/img/placeholder_cp.png'];

        let eTags = []; try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch (e) { }
        let tagsHtml = ''; if (eTags.length > 0) tagsHtml = `<div class="flex gap-1 mb-2 flex-wrap">${eTags.map(t => `<span class="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">${t}</span>`).join('')}</div>`;

        const editBtn = (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE) ? `<button onclick="event.stopPropagation(); window.openManagerModal('${String(s.id)}')" class="absolute top-3 right-3 bg-white/90 text-gray-700 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-20"><i class="fa-solid fa-pen"></i></button>` : '';
        const actionBtn = (myPermissions.catalog_manage && IS_CATALOG_ADMIN_PAGE)
            ? `<div class="border-t pt-3"><button onclick="event.stopPropagation(); window.openManagerModal('${String(s.id)}')" class="bg-gray-900 text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-brand-red transition-colors duration-300 shadow-lg"><i class="fa-solid fa-sliders mr-2"></i> Administrar</button></div>`
            : `<div class="border-t pt-3"><button onclick="event.stopPropagation(); window.openQuoteModal('${String(s.id)}')" class="bg-brand-red text-white w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-red-700 transition-colors duration-300 shadow-lg shadow-red-200"><i class="fa-solid fa-calculator mr-2"></i> Cotizar Espacio</button></div>`;

        const imgsHtml = allUrls.map((url, i) => `<img src="${url}" class="card-img absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === 0 ? 'opacity-100' : 'opacity-0'}" data-index="${i}">`).join('');

        const cardHtml = `
            <div data-space-card="1" data-space-id="${s.id}" class="bg-white rounded-xl shadow-md relative group hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden border border-gray-100 cursor-pointer"
                 onclick="window.openPreviewCardModal('${String(s.id)}')"
                 onmouseenter="window.startCardCarousel(this)" 
                 onmouseleave="window.stopCardCarousel(this)">
                <div class="h-48 bg-gray-200 relative overflow-hidden">
                    ${editBtn}
                    <div class="carousel-container absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                        ${imgsHtml}
                    </div>
                    <div class="absolute bottom-3 left-4 text-white z-10 pointer-events-none">
                        <p class="text-[10px] font-bold uppercase tracking-wider bg-brand-red px-2 py-0.5 rounded inline-block mb-1">${s.tipo}</p>
                        <h3 class="font-bold text-lg leading-tight shadow-black drop-shadow-md">${s.nombre}</h3>
                    </div>
                </div>
                <div class="p-5">
                    ${tagsHtml}
                    <div class="flex justify-between items-center mb-4">
                        <p class="text-[11px] text-gray-500 font-bold uppercase"><i class="fa-solid fa-tag text-brand-red mr-1.5 opacity-70"></i>${s.clave}</p>
                    </div>
                    <p class="text-xs text-gray-400 font-medium line-clamp-2 mb-4 h-8">${s.descripcion || ''}</p>
                    ${infoRowsHtml}
                    ${actionBtn}
                </div>
            </div>`;
        g.innerHTML += cardHtml;
    });
}

window.startCardCarousel = function (el) {
    const imgs = el.querySelectorAll('.card-img');
    if (imgs.length <= 1) return;
    let current = 0;
    el._carouselInterval = setInterval(() => {
        imgs[current].classList.replace('opacity-100', 'opacity-0');
        current = (current + 1) % imgs.length;
        imgs[current].classList.replace('opacity-0', 'opacity-100');
    }, 2000);
};
window.stopCardCarousel = function (el) {
    if (el._carouselInterval) clearInterval(el._carouselInterval);
    const imgs = el.querySelectorAll('.card-img');
    imgs.forEach((img, i) => {
        if (i === 0) img.classList.replace('opacity-0', 'opacity-100');
        else img.classList.replace('opacity-100', 'opacity-0');
    });
};

window.openPreviewCardModal = function (id) {
    const s = allSpaces.find(x => x.id === id);
    if (!s) return;
    const previewBadges = renderCpPreviewBadges(s);
    let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
    if (allUrls.length === 0) allUrls = ['../../assets/img/placeholder_cp.png'];

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 backdrop-blur-md animate-enter';
    modal.id = 'preview-card-modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    let current = 0;
    const renderContent = () => {
        const dots = allUrls.map((_, i) => `<div class="w-2 h-2 rounded-full ${i === current ? 'bg-white' : 'bg-white/30'}" onclick="event.stopPropagation(); window._updatePreviewIndex(${i})"></div>`).join('');
        modal.innerHTML = `
            <div class="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                <button onclick="this.closest('#preview-card-modal').remove()" class="absolute top-4 right-4 text-white/70 hover:text-white z-20 text-2xl drop-shadow-lg"><i class="fa-solid fa-times"></i></button>
                <img src="${allUrls[current]}" class="max-w-full max-h-full object-contain animate-enter">
                
                ${allUrls.length > 1 ? `
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current - 1 + allUrls.length) % allUrls.length})" class="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-left"></i></button>
                    <button onclick="event.stopPropagation(); window._updatePreviewIndex(${(current + 1) % allUrls.length})" class="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="absolute bottom-6 left-1/2 -translate-y-1/2 flex gap-2">${dots}</div>
                ` : ''}
                
                <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-8 pt-20 pointer-events-none">
                    <h3 class="text-white font-black text-3xl uppercase tracking-tighter">${s.nombre}</h3>
                    <p class="text-white/60 text-sm font-bold mt-1 uppercase tracking-widest">${s.tipo} • ${s.clave}</p>
                    ${previewBadges ? `<div class="mt-3 flex flex-wrap gap-2 text-[11px]">${previewBadges}</div>` : ''}
                </div>
            </div>
        `;
    };

    window._updatePreviewIndex = (idx) => { current = idx; renderContent(); };
    renderContent();
    document.body.appendChild(modal);
};

window.addRangeRow = function (data = null) {
    const container = document.getElementById('mgr-ranges-container'); const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const min = data ? data.min : 1; const max = data ? data.max : 100; const prices = data ? data.precios : { lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0, sabado: 0, domingo: 0 };
    const row = document.createElement('div'); row.className = "range-row bg-gray-50 p-3 rounded-lg border border-gray-200 relative animate-enter"; row.id = `range-${id}`;
    row.innerHTML = `<div class="flex justify-between items-center mb-2"><div class="flex items-center gap-2"><span class="text-[10px] font-bold uppercase text-brand-red bg-yellow-50 px-2 py-0.5 rounded">Rango</span><input type="number" class="range-min w-16 border rounded text-xs p-1 text-center font-bold" value="${min}"><span class="text-xs text-gray-400">-</span><input type="number" class="range-max w-16 border rounded text-xs p-1 text-center font-bold" value="${max}"><span class="text-[10px] font-bold uppercase text-gray-400 ml-1">Personas</span></div><button onclick="document.getElementById('range-${id}').remove()" class="text-gray-400 hover:text-red-500 text-xs"><i class="fa-solid fa-trash"></i></button></div><div class="grid grid-cols-4 gap-2"><div><label class="text-[9px] uppercase font-bold text-gray-400">Lun</label><input type="number" value="${prices.lunes}" class="p-lun w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mar</label><input type="number" value="${prices.martes}" class="p-mar w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Mié</label><input type="number" value="${prices.miercoles}" class="p-mie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Jue</label><input type="number" value="${prices.jueves}" class="p-jue w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Vie</label><input type="number" value="${prices.viernes}" class="p-vie w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Sáb</label><input type="number" value="${prices.sabado}" class="p-sab w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div><div><label class="text-[9px] uppercase font-bold text-gray-400">Dom</label><input type="number" value="${prices.domingo}" class="p-dom w-full border p-1 rounded text-xs font-bold text-center outline-none focus:border-brand-red"></div></div>`;
    container.appendChild(row);
}

window.addHorarioRow = function (data = null) {
    const container = document.getElementById('mgr-horarios-container'); const nombre = data ? data.nombre : ''; const start = data ? data.start : ''; const end = data ? data.end : '';
    const row = document.createElement('div'); row.className = "horario-row flex flex-col sm:flex-row gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200 animate-enter";
    row.innerHTML = `<input type="text" placeholder="Nombre (Ej. Turno Especial)" value="${nombre}" class="h-name w-full sm:w-[42%] border rounded p-1.5 text-xs outline-none focus:border-brand-red font-bold text-gray-700"><input type="time" value="${start}" class="h-start w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><span class="text-xs text-gray-400">a</span><input type="time" value="${end}" class="h-end w-full sm:w-auto border rounded p-1.5 text-xs outline-none focus:border-brand-red"><button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 transition px-2"><i class="fa-solid fa-trash"></i></button>`;
    container.appendChild(row);
}

window.openManagerModal = async function (id) {
    if (!myPermissions.catalog_manage) return window.showToast("No tienes permisos.", "error");
    cpQuoteSaveViewState({ selectedSpaceId: String(id || '').trim() });
    document.getElementById('mgr-id').value = id || ''; const container = document.getElementById('mgr-taxes-list'); document.querySelectorAll('.day-block-check').forEach(cb => cb.checked = false);
    let managedSpace = null;
    if (container) { container.innerHTML = ''; let currentTaxes = []; if (id) { const s = allSpaces.find(x => x.id === id); currentTaxes = parseIds((s && (s.impuestos_ids || s.impuestos)) || []); } dbTaxes.forEach(t => { const isChecked = currentTaxes.some(cid => String(cid) === String(t.id)) ? 'checked' : ''; container.innerHTML += `<label class="flex items-center gap-2 p-2 border rounded bg-white hover:bg-gray-50 cursor-pointer"><input type="checkbox" value="${t.id}" class="tax-check accent-brand-red cursor-pointer" ${isChecked}><span class="text-[10px] font-bold uppercase text-gray-600 cursor-pointer select-none">${t.nombre} (${t.porcentaje}%)</span></label>`; }); }

    const rangesContainer = document.getElementById('mgr-ranges-container'); rangesContainer.innerHTML = '';
    const horariosContainer = document.getElementById('mgr-horarios-container'); horariosContainer.innerHTML = '';

    if (id) {
        const s = allSpaces.find(x => x.id === id);
        managedSpace = s;
        document.getElementById('mgr-title').innerText = "Editar: " + s.nombre; document.getElementById('mgr-key').value = s.clave; document.getElementById('mgr-key').disabled = true; document.getElementById('mgr-name').value = s.nombre; document.getElementById('mgr-type').value = normalizeCpManagerTypeSelection(s.tipo); document.getElementById('mgr-desc').value = s.descripcion || '';
        const savedMaterial = String(s.material || '').trim();
        if (savedMaterial && !cpMaterialCatalog.includes(savedMaterial)) cpMaterialCatalog = [savedMaterial, ...cpMaterialCatalog];
        renderCpMaterialSuggestions();
        document.getElementById('mgr-material').value = savedMaterial;
        document.getElementById('mgr-ancho').value = normalizeCpMeasureValue(s.medida_ancho ?? s.ancho) ?? '';
        document.getElementById('mgr-alto').value = normalizeCpMeasureValue(s.medida_alto ?? s.alto) ?? '';
        document.getElementById('mgr-unidad').value = normalizeCpMeasureUnit(s.medida_unidad || s.unidad_medida || 'M');
        const convenioToggle = document.getElementById('mgr-allow-convenio');
        if (convenioToggle) convenioToggle.checked = cpSpaceAllowsConvenio(s);
        window.syncCpManagerTypeFields();
        let eTags = []; try { eTags = typeof s.etiquetas === 'string' ? JSON.parse(s.etiquetas) : (s.etiquetas || []); } catch (e) { }
        if (!Array.isArray(eTags)) eTags = []; document.getElementById('mgr-tags').value = eTags.join(', ');

        let rules = []; try { rules = typeof s.precios_por_dia === 'string' ? JSON.parse(s.precios_por_dia) : (s.precios_por_dia || []); } catch (e) { }
        if (!Array.isArray(rules) || rules.length === 0) rules = [{ min: 1, max: 9999, precios: { lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0, sabado: 0, domingo: 0 } }];
        rules.forEach(rule => window.addRangeRow(rule));

        let blockedDays = []; try { blockedDays = typeof s.dias_bloqueados === 'string' ? JSON.parse(s.dias_bloqueados) : (s.dias_bloqueados || []); } catch (e) { }
        document.querySelectorAll('.day-block-check').forEach(cb => { if (blockedDays.includes(cb.value)) cb.checked = true; });

        let b2b = {}; try { b2b = typeof s.config_b2b === 'string' ? JSON.parse(s.config_b2b) : (s.config_b2b || {}); } catch (e) { }
        setCpDigitalMediaManagerValues(b2b.digital_media || b2b.digitalMedia || b2b.medio_digital || null);
        let h = b2b.horarios || []; if (!Array.isArray(h)) { const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' }; h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k].start, end: h[k].end })).filter(item => item.start && item.end); }
        if (h.length > 0) h.forEach(item => window.addHorarioRow(item)); else window.addHorarioRow();

        document.getElementById('mgr-adj-type').value = normalizeCpQuoteAdjustmentType(s.ajuste_tipo || 'ninguno'); document.getElementById('mgr-adj-pct').value = s.ajuste_porcentaje || 0; document.getElementById('mgr-active').checked = s.activa !== false; document.getElementById('btn-delete-mgr').classList.remove('hidden');
        let allUrls = []; try { if (s.imagen_url && typeof s.imagen_url === 'string' && s.imagen_url.startsWith('[')) allUrls = JSON.parse(s.imagen_url); else if (s.imagen_url) allUrls = [s.imagen_url]; } catch (e) { }
        for (let i = 1; i <= 5; i++) {
            const mgrPrev = document.getElementById(`mgr-preview-${i}`);
            if (mgrPrev) {
                if (allUrls[i - 1]) { mgrPrev.src = allUrls[i - 1]; mgrPrev.classList.remove('hidden'); mgrPrev.removeAttribute('data-modified'); }
                else { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); }
            }
        }
    } else {
        document.getElementById('mgr-title').innerText = "Nuevo Espacio"; document.getElementById('mgr-key').value = ''; document.getElementById('mgr-key').disabled = false; document.getElementById('mgr-name').value = ''; document.getElementById('mgr-type').value = 'espacio'; document.getElementById('mgr-tags').value = ''; document.getElementById('mgr-desc').value = ''; document.getElementById('mgr-material').value = ''; renderCpMaterialSuggestions(); document.getElementById('mgr-ancho').value = ''; document.getElementById('mgr-alto').value = ''; document.getElementById('mgr-unidad').value = 'M'; const convenioToggle = document.getElementById('mgr-allow-convenio'); if (convenioToggle) convenioToggle.checked = true; setCpDigitalMediaManagerValues(null); window.syncCpManagerTypeFields(); window.addRangeRow(); window.addHorarioRow();
        document.getElementById('mgr-active').checked = true; document.getElementById('btn-delete-mgr').classList.add('hidden');
        for (let i = 1; i <= 5; i++) { const mgrPrev = document.getElementById(`mgr-preview-${i}`); if (mgrPrev) { mgrPrev.src = ''; mgrPrev.classList.add('hidden'); mgrPrev.removeAttribute('data-modified'); } const fi = document.getElementById(`mgr-file-${i}`); if (fi) fi.value = ''; }
    }
    window.syncCpManagerTypeFields();
    await resetCpQuoteManagerContractAssets(managedSpace);
    window.openModal('manager-modal');
}

window.saveSpace = async function () {
    if (!myPermissions.catalog_manage) return; const btn = document.getElementById('btn-save-mgr'); btn.disabled = true; btn.innerText = "Guardando...";
    try {
        if (!(await ensureCpQuoteManageSession('guardar cambios'))) return;
        const id = document.getElementById('mgr-id').value;
        const clave = document.getElementById('mgr-key').value.toUpperCase().trim();
        const nombre = document.getElementById('mgr-name').value.trim();
        const tipo = normalizeCpManagerTypeSelection(document.getElementById('mgr-type').value);
        const isPublicidad = normalizeCpSpaceTag(tipo) === 'publicidad';
        const ajusteTipo = normalizeCpQuoteAdjustmentType(document.getElementById('mgr-adj-type').value);
        const ajustePorcentaje = ajusteTipo === 'ninguno'
            ? 0
            : Math.max(0, parseCpQuoteNumberInput(document.getElementById('mgr-adj-pct').value, 0));
        const isActive = !!document.getElementById('mgr-active').checked;
        if (!clave) return window.showToast('La clave es obligatoria.', 'error');
        if (!nombre) return window.showToast('El nombre es obligatorio.', 'error');
        if (ajusteTipo === 'descuento' && ajustePorcentaje > CP_MAX_DISCOUNT_PERCENT) {
            return window.showToast('El descuento máximo permitido es 10%.', 'error');
        }
        const selectedTaxes = Array.from(document.querySelectorAll('.tax-check:checked'))
            .map(cb => String(cb.value || '').trim())
            .filter(Boolean);
        const blockedDays = Array.from(document.querySelectorAll('.day-block-check:checked')).map(cb => cb.value);

        const rows = document.querySelectorAll('.range-row'); let ranges = []; let maxPriceFound = 0;
        rows.forEach(row => {
            const min = parseInt(row.querySelector('.range-min').value) || 0; const max = parseInt(row.querySelector('.range-max').value) || 999999;
            const precios = { lunes: parseFloat(row.querySelector('.p-lun').value) || 0, martes: parseFloat(row.querySelector('.p-mar').value) || 0, miercoles: parseFloat(row.querySelector('.p-mie').value) || 0, jueves: parseFloat(row.querySelector('.p-jue').value) || 0, viernes: parseFloat(row.querySelector('.p-vie').value) || 0, sabado: parseFloat(row.querySelector('.p-sab').value) || 0, domingo: parseFloat(row.querySelector('.p-dom').value) || 0 };
            const localMax = Math.max(...Object.values(precios)); if (localMax > maxPriceFound) maxPriceFound = localMax; ranges.push({ min, max, precios });
        });

        const existingSpace = id ? allSpaces.find(x => String(x.id) === String(id)) : null;
        let existingB2b = {};
        try { existingB2b = typeof existingSpace?.config_b2b === 'string' ? JSON.parse(existingSpace.config_b2b) : (existingSpace?.config_b2b || {}); } catch (e) { existingB2b = {}; }
        const tagsArray = (document.getElementById('mgr-tags').value || '').split(',').map(t => t.trim()).filter(Boolean);
        const material = isPublicidad ? String(document.getElementById('mgr-material').value || '').trim() : '';
        const regulationTemplate = String(document.getElementById('mgr-reglamento-template')?.value || '').trim();
        const digitalMedia = readCpDigitalMediaManagerValues();
        const usesPhysicalMeasures = isPublicidad && !digitalMedia.enabled;
        const medidaAncho = usesPhysicalMeasures ? normalizeCpMeasureValue(document.getElementById('mgr-ancho').value) : (isPublicidad && digitalMedia.enabled ? 0 : null);
        const medidaAlto = usesPhysicalMeasures ? normalizeCpMeasureValue(document.getElementById('mgr-alto').value) : (isPublicidad && digitalMedia.enabled ? 0 : null);
        const medidaUnidad = usesPhysicalMeasures ? normalizeCpMeasureUnit(document.getElementById('mgr-unidad').value || 'M') : '';
        const permiteConvenio = isPublicidad ? !!document.getElementById('mgr-allow-convenio')?.checked : false;

        let horariosArray = []; document.querySelectorAll('.horario-row').forEach(row => { const nombre = row.querySelector('.h-name').value.trim(); const start = row.querySelector('.h-start').value; const end = row.querySelector('.h-end').value; if (nombre && start && end) horariosArray.push({ nombre, start, end }); });
        const horaExtraBase = isPublicidad ? 0 : Math.max(0, parseFloat(existingB2b?.precio_hora_extra || 0) || 0, maxPriceFound);
        const b2bConfig = isPublicidad ? { precio_hora_extra: 0, horarios: [], digital_media: digitalMedia } : { precio_hora_extra: horaExtraBase, horarios: horariosArray };

        const payload = {
            clave, nombre, tipo, descripcion: document.getElementById('mgr-desc').value, precio_base: Math.max(0, parseCpQuoteNumberInput(maxPriceFound, 0)),
            precios_por_dia: ranges, dias_bloqueados: blockedDays, config_b2b: b2bConfig, etiquetas: tagsArray,
            ajuste_tipo: ajusteTipo, ajuste_porcentaje: ajustePorcentaje, activo: isActive, activa: isActive, impuestos_ids: selectedTaxes,
            material,
            medida_ancho: medidaAncho,
            medida_alto: medidaAlto,
            medida_unidad: medidaUnidad,
            ancho: medidaAncho,
            alto: medidaAlto,
            unidad_medida: medidaUnidad,
            permite_convenio: permiteConvenio,
            reglamento_template: regulationTemplate
        };

        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
            if (Array.isArray(v) || (v && typeof v === 'object')) fd.append(k, JSON.stringify(v));
            else if (v !== undefined && v !== null) fd.append(k, String(v));
        });
        for (let i = 1; i <= 5; i++) {
            const fi = document.getElementById(`mgr-file-${i}`);
            const preview = document.getElementById(`mgr-preview-${i}`);
            const fieldName = i === 1 ? 'imagen' : `imagen${i}`;
            if (fi && fi.files && fi.files.length > 0) fd.append(fieldName, fi.files[0], fi.files[0].name || `img${i}`);
            else if (preview && preview.getAttribute('data-modified') === 'true' && preview.classList.contains('hidden')) fd.append(fieldName, '');
        }
        const planoInput = document.getElementById('mgr-plano-file');
        const clearPlano = String(document.getElementById('mgr-plano-clear')?.value || '0') === '1';
        if (planoInput && planoInput.files && planoInput.files.length > 0) fd.append('plano_geografico', planoInput.files[0], planoInput.files[0].name || 'plano');
        else if (clearPlano) fd.append('plano_geografico', '');

        if (id) {
            const { error: updErr } = await window.tenantPocketBase.from('espacios').update(fd).eq('id', id);
            if (updErr) throw updErr;
            cpQuoteSaveViewState({ selectedSpaceId: String(id || '').trim() });
        } else {
            const { error: insErr } = await window.tenantPocketBase.from('espacios').insert(fd);
            if (insErr) throw insErr;
            cpQuoteSaveViewState({ selectedSpaceId: '' });
        }
        window.showToast("Guardado", "success"); window.closeModal('manager-modal'); loadCatalog(); for (let i = 1; i <= 5; i++) { const fi = document.getElementById(`mgr-file-${i}`); if (fi) fi.value = ''; } if (planoInput) planoInput.value = ''; const planoClearInput = document.getElementById('mgr-plano-clear'); if (planoClearInput) planoClearInput.value = '0';

    } catch (e) { console.error("Error al guardar:", e); window.showToast("Error al guardar: " + (e?.message || e), "error"); } finally { btn.disabled = false; btn.innerText = "Guardar"; }
}

// LOGICA DE FECHAS DE MONTAJE PARA CATALOG (COTIZACIÓN RÁPIDA)
window.handleMontajeInput = function (prefix) {
    const val = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    if (window.finalMontajeDates.length > val) window.finalMontajeDates = window.finalMontajeDates.slice(0, val);
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
}

window.actualizarLabelMontaje = function (prefix) {
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    if (window.finalMontajeDates.length > 0) {
        lbl.innerText = window.finalMontajeDates.map(d => window.safeFormatDate(d)).join(', ');
        lbl.classList.remove('hidden');
    } else {
        lbl.classList.add('hidden');
    }
}

window.abrirModalMontaje = function (prefix) {
    window.currentMontajePrefix = prefix;
    const diasM = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    if (diasM <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");

    let sDate = document.getElementById('date-start').value;
    if (!sDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    document.getElementById('montaje-limit-num').innerText = diasM;
    window.tempMontajeDates = [...window.finalMontajeDates].slice(0, diasM);

    const dp = document.getElementById('montaje-date-input');
    const maxD = new Date(sDate + 'T00:00:00');
    maxD.setDate(maxD.getDate() - 1);
    dp.max = maxD.toISOString().split('T')[0];
    dp.value = '';

    window.renderListaMontaje();
    document.getElementById('montaje-modal').classList.remove('hidden');
}

window.addMontajeDate = function () {
    const dp = document.getElementById('montaje-date-input');
    const dateVal = dp.value;
    if (!dateVal) return window.showToast("Selecciona una fecha.", "error");

    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if (window.tempMontajeDates.length >= limit) return window.showToast(`Solo puedes seleccionar ${limit} día(s).`, "error");

    if (window.tempMontajeDates.includes(dateVal)) return window.showToast("Esta fecha ya fue agregada.", "error");

    const maxD = new Date(dp.max + 'T00:00:00');
    const selD = new Date(dateVal + 'T00:00:00');
    if (selD > maxD) return window.showToast("La fecha debe ser antes del evento.", "error");

    window.tempMontajeDates.push(dateVal);
    window.tempMontajeDates.sort();
    window.renderListaMontaje();
}

window.removeMontajeDate = function (idx) {
    window.tempMontajeDates.splice(idx, 1);
    window.renderListaMontaje();
}

window.renderListaMontaje = function () {
    const list = document.getElementById('montaje-dates-list');
    list.innerHTML = '';
    window.tempMontajeDates.forEach((d, i) => {
        list.innerHTML += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 shadow-sm"><span class="text-xs font-bold text-gray-700">${window.safeFormatDate(d)}</span><button onclick="window.removeMontajeDate(${i})" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

window.confirmMontajeDates = function () {
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if (window.tempMontajeDates.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");

    window.finalMontajeDates = [...window.tempMontajeDates];
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
}


window.openQuoteModal = function (id) {
    currentSpace = allSpaces.find(s => s.id === id); if (!currentSpace) return;
    document.getElementById('q-name').innerText = currentSpace.nombre; document.getElementById('q-key').innerText = currentSpace.clave; document.getElementById('q-price').innerText = "$0.00";
    let modalImg = currentSpace.imagen_url || ''; if (modalImg.startsWith('[')) { try { modalImg = JSON.parse(modalImg)[0]; } catch (e) { } } document.getElementById('q-img').src = modalImg;

    let b2b = {}; try { b2b = typeof currentSpace.config_b2b === 'string' ? JSON.parse(currentSpace.config_b2b) : (currentSpace.config_b2b || {}); } catch (e) { }
    let h = b2b.horarios || []; if (!Array.isArray(h)) { const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' }; h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k].start, end: h[k].end, price: h[k].price })).filter(item => item.start && item.end); }
    const selHorario = document.getElementById('q-horario'); selHorario.innerHTML = '';
    if (h.length > 0) h.forEach(item => { selHorario.innerHTML += `<option value="${item.nombre}" data-price="${item.price}">${item.nombre} (${item.start} a ${item.end})</option>`; }); else selHorario.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';

    const selConcept = document.getElementById('admin-concept-select'); selConcept.innerHTML = '<option value="">Selecciona servicio...</option>';
    catalogConcepts.forEach(c => { selConcept.innerHTML += `<option value="${c.id}">${c.nombre} (+$${c.precio_sugerido})</option>`; });

    document.getElementById('date-start').value = ''; document.getElementById('date-end').value = '';
    document.getElementById('q-guests').value = 100; document.getElementById('q-premontaje').value = 0; document.getElementById('q-horas').value = 0;
    document.getElementById('cli-name').value = ''; document.getElementById('cli-rfc').value = ''; document.getElementById('cli-phone').value = ''; document.getElementById('cli-email').value = '';

    adminSelectedConcepts = []; window.finalMontajeDates = []; window.actualizarLabelMontaje('q'); document.getElementById('q-btn-montaje').classList.add('hidden');
    window.updateAdminConceptsSummary();

    const cliSel = document.getElementById('cli-select'); if (cliSel) cliSel.value = ''; const cliId = document.getElementById('cli-id'); if (cliId) cliId.value = '';
    loadClientProfilesForQuoteModal(); document.getElementById('avail-msg').classList.add('hidden'); document.getElementById('btn-generate').disabled = true; window.openModal('quote-modal');
}

window.addAdminConcept = function () { const sel = document.getElementById('admin-concept-select'); const id = sel.value; if (!id) return; const concept = catalogConcepts.find(c => c.id == id); if (concept) { adminSelectedConcepts.push({ description: concept.nombre, amount: concept.precio_sugerido, value: concept.precio_sugerido, unit: 'fixed', type: 'aumento' }); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); } sel.value = ''; }
window.removeAdminConcept = function (index) { adminSelectedConcepts.splice(index, 1); window.updateAdminConceptsSummary(); window.updateQuoteCalculation(); }
window.updateAdminConceptsSummary = function () { const container = document.getElementById('admin-concepts-summary'); container.innerHTML = ''; adminSelectedConcepts.forEach((c, idx) => { const amount = __cpToFiniteNumber(c.amount ?? c.value, 0); container.innerHTML += `<div class="flex justify-between items-center bg-gray-50 border border-gray-100 p-2 rounded text-xs"><span class="font-bold text-gray-700">${c.description}</span><div class="flex items-center gap-3"><span class="font-black text-brand-dark">$${amount.toLocaleString()}</span><button onclick="window.removeAdminConcept(${idx})" class="text-gray-400 hover:text-red-500"><i class="fas fa-times"></i></button></div></div>`; }); }

window.togglePrecioPersonalizado = function () {
    precioPersonalizadoEnabled = !!document.getElementById('chk-precio-personalizado')?.checked;
    const section = document.getElementById('precio-personalizado-section');
    if (section) section.classList.toggle('hidden', !precioPersonalizadoEnabled);
    if (precioPersonalizadoEnabled) {
        const input = document.getElementById('precio-personalizado-total');
        if (input) {
            input.focus();
            // Quita cualquier restricción anterior
            input.removeAttribute('readonly');
            input.disabled = false;
        }
    } else {
        const input = document.getElementById('precio-personalizado-total');
        if (input) input.value = '';
        precioPersonalizadoValue = 0;
    }
    window.updateQuoteCalculation();
};

window.updatePrecioPersonalizado = function () {
    const val = parseFloat(document.getElementById('precio-personalizado-total')?.value || 0);
    precioPersonalizadoValue = Number.isFinite(val) && val >= 0 ? val : 0;
    window.updateQuoteCalculation();
};

window.updateQuoteCalculation = function () {
    __cpSaveActiveCfgFromForm();  // Mantiene compatibilidad multi-espacio
    const spacesPricing = [];
    let subtotal = 0, taxesTotal = 0;
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        if (!space) return;
        const guests = parseInt(cfg.guests, 10) || 1;
        const maxCapacity = getSpaceMaxCapacity(space);
        const capacityOk = !(maxCapacity < 999999 && guests > maxCapacity);
        const base = (cfg.startDate && cfg.endDate) ? calculateDayByDayTotal(space, cfg.startDate, cfg.endDate, guests).total : 0;
        const horaUnit = parseFloat(cfg.horasExtraUnit ?? __cpResolveHoraExtraUnit(space) ?? 0) || 0;
        cfg.horasExtraUnit = horaUnit;
        const horarioCost = parseFloat(cfg.horarioPrice || 0);
        cfg.premontajeCourtesyDays = Math.min(parseInt(cfg.premontajeDays, 10) || 0, parseInt(cfg.premontajeCourtesyDays, 10) || 0);
        const prem = __cpCalcPremCost(space, cfg);
        const extraHours = parseInt(cfg.horasExtra, 10) || 0;
        const courtesyHours = Math.min(extraHours, Math.max(0, parseInt(cfg.horasExtraCourtesy, 10) || 0));
        cfg.horasExtraCourtesy = courtesyHours;
        const billableHours = Math.max(0, extraHours - courtesyHours);
        const horasCost = billableHours * horaUnit;
        const blockedOk = !__cpCfgHasBlockedDates(cfg);
        let subSpace = 0;
        if (capacityOk && blockedOk) {
            subSpace = base + horarioCost + prem.total + horasCost;
            const adjustmentType = normalizeCpQuoteAdjustmentType(space.ajuste_tipo);
            if (adjustmentType === 'aumento') subSpace += subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
            if (adjustmentType === 'descuento') subSpace -= subSpace * (normalizeCpQuoteAdjustmentPercent(adjustmentType, space.ajuste_porcentaje) / 100);
        }
        let spaceTaxTotal = 0;
        const taxIds = parseIds(space.impuestos_ids || space.impuestos);
        taxIds.forEach(tid => { const t = findCpQuoteTaxRecord(tid, space); if (t) { const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0); spaceTaxTotal += subSpace * rate; } });
        subtotal += subSpace; taxesTotal += spaceTaxTotal;
        spacesPricing.push({ spaceId: space.id, spaceName: space.nombre, spaceKey: space.clave, startDate: cfg.startDate, endDate: cfg.endDate, guests, maxCapacity, capacityOk, blockedOk, horarioValue: cfg.horarioValue, horarioText: cfg.horarioText || cfg.horarioValue || '', horarioCost, premontajeDays: parseInt(cfg.premontajeDays, 10) || 0, premontajeCourtesyDays: parseInt(cfg.premontajeCourtesyDays, 10) || 0, premontajeDates: __cpSafeArray(cfg.premontajeDates), premontajeCost: prem.total, premontajeBreakdown: prem.breakdown, horasExtra: extraHours, horasExtraCourtesy: courtesyHours, horasExtraBillable: billableHours, horasExtraUnit: horaUnit, horasExtraCost: horasCost, subtotalBeforeTax: subSpace, taxIds, taxTotal: spaceTaxTotal });
    });
    let adminConceptTotal = 0; adminSelectedConcepts.forEach(c => { adminConceptTotal += (__cpToFiniteNumber(c.amount ?? c.value, 0) || 0); });
    subtotal += adminConceptTotal;
    if (adminConceptTotal > 0 && spacesPricing.length > 0) {
        const firstTaxes = spacesPricing[0].taxIds || [];
        firstTaxes.forEach(tid => {
            const t = findCpQuoteTaxRecord(tid, { tenant: resolveCpQuoteTenantSlug() });
            if (!t) return;
            const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0);
            taxesTotal += adminConceptTotal * rate;
        });
    }
    // SOBRESCRIBIR CON PRECIO PERSONALIZADO si habilitado
    const autoFinal = subtotal + taxesTotal;
    currentPricing = {
        subtotal,
        taxes: taxesTotal,
        autoFinal,  // Guardar cálculo automático
        final: precioPersonalizadoEnabled ? precioPersonalizadoValue : autoFinal,  // Usar custom o auto
        spaces: spacesPricing,
        adminConceptTotal,
        customEnabled: precioPersonalizadoEnabled,
        customValue: precioPersonalizadoValue
    };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
    // Visual: Destacar si es custom
    const priceEl = document.getElementById('q-price');
    if (priceEl) {
        priceEl.classList.toggle('ring-2', precioPersonalizadoEnabled);
        priceEl.classList.toggle('ring-yellow-400', precioPersonalizadoEnabled);
        priceEl.classList.toggle('bg-yellow-50/50', precioPersonalizadoEnabled);
    }
};

window.generatePDF = async function () {
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    await window.checkAvailability();

    // Verificar premontaje para todos los espacios
    for (const cfg of __cpQuoteSpaces) {
        const pmDays = parseInt(cfg.premontajeDays, 10) || 0;
        if (pmDays > 0 && (!cfg.premontajeDates || cfg.premontajeDates.length !== pmDays)) {
            const spaceName = (__cpGetSpaceById(cfg.spaceId)?.nombre || cfg.spaceId);
            return window.showToast(`Faltan fechas de premontaje para ${spaceName}`, "error");
        }
    }

    if (!isQuickQuoteModeEnabled() && !getSelectedQuoteClientProfile()) {
        return window.showToast('Selecciona un perfil completo o activa cotización rápida.', 'error');
    }
    const cli = buildQuoteClientSnapshot();
    if (!cli.name) return window.showToast("Falta nombre del cliente", "error");
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");
    let quoteClientId = '';
    try {
        quoteClientId = await resolveQuoteClientId(cli);
    } catch (error) {
        return window.showToast(error?.message || 'No se pudo preparar el perfil del cliente.', 'error');
    }

    const today = __cpTodayISO();
    const invalidPastCfg = __cpQuoteSpaces.find(cfg => cfg.startDate < today || cfg.endDate < today);
    if (invalidPastCfg) {
        const sp = __cpGetSpaceById(invalidPastCfg.spaceId);
        return window.showToast(`Fechas pasadas en ${sp?.nombre || invalidPastCfg.spaceId}`, "error");
    }

    // PRECIO PERSONALIZADO: Usar si habilitado
    const precioFinal = currentPricing.customEnabled ? currentPricing.customValue : currentPricing.final;

    const quoteNameInput = document.getElementById('q-quote-name');
    const quoteNameRaw = (quoteNameInput?.value || '').trim();
    const quoteName = quoteNameRaw || `Cotización Multi-Espacio - ${cli.name}`;

    const conceptosB2B = [];
    const espaciosDetalle = currentPricing.spaces.map(sp => ({
        espacio_id: sp.spaceId,
        espacio_nombre: sp.spaceName,
        espacio_clave: sp.spaceKey,
        fecha_inicio: sp.startDate,
        fecha_fin: sp.endDate,
        personas: sp.guests,
        horario: {
            value: sp.horarioValue,
            label: sp.horarioText,
            amount: sp.horarioCost
        },
        fechas_evento: __cpDatesBetween(sp.startDate, sp.endDate),
        premontaje_dias: sp.premontajeDays,
        premontaje_cortesia_dias: sp.premontajeCourtesyDays || 0,
        premontaje_fechas: sp.premontajeDates || [],
        premontaje_total: sp.premontajeCost,
        premontaje_detalle: sp.premontajeBreakdown || [],
        horas_extra: sp.horasExtra,
        horas_extra_cortesia: sp.horasExtraCourtesy || 0,
        horas_extra_facturables: sp.horasExtraBillable || 0,
        horas_extra_unitario: sp.horasExtraUnit,
        horas_extra_total: sp.horasExtraCost,
        subtotal_espacio: sp.subtotalBeforeTax,
        impuestos_ids: sp.taxIds || [],
        impuestos_total: sp.taxTotal
    }));

    // Agregar conceptos B2B desde spaces
    currentPricing.spaces.forEach(sp => {
        if (sp.horarioCost > 0) {
            conceptosB2B.push({
                description: `[${sp.spaceName}] Horario: ${sp.horarioText}`,
                amount: sp.horarioCost,
                value: sp.horarioCost,
                unit: 'fixed',
                type: 'b2b_horario',
                meta: { space_id: sp.spaceId }
            });
        }
        if (sp.premontajeCost > 0) {
            conceptosB2B.push({
                description: `[${sp.spaceName}] Premontaje (${sp.premontajeDays} días)`,
                amount: sp.premontajeCost,
                value: sp.premontajeCost,
                unit: 'fixed',
                type: 'b2b_montaje',
                meta: {
                    space_id: sp.spaceId,
                    days: sp.premontajeDays,
                    courtesy_days: sp.premontajeCourtesyDays,
                    dates: sp.premontajeDates,
                    percentage: getPremontajePct()
                }
            });
        }
        if (sp.horasExtraCost > 0) {
            conceptosB2B.push({
                description: `[${sp.spaceName}] Horas extras (${sp.horasExtraBillable} hrs)`,
                amount: sp.horasExtraCost,
                value: sp.horasExtraCost,
                unit: 'fixed',
                type: 'b2b_horas',
                meta: {
                    space_id: sp.spaceId,
                    hours: sp.horasExtraBillable,
                    unit_price: sp.horasExtraUnit
                }
            });
        }
    });
    // Admin concepts
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    // PRECIO PERSONALIZADO en desglose
    const desglosePrecios = {
        subtotal_antes_impuestos: currentPricing.subtotal,
        auto_calculado: currentPricing.autoFinal,
        precio_final_usado: precioFinal,
        custom_aplicado: currentPricing.customEnabled ? true : false,
        custom_valor: currentPricing.customEnabled ? currentPricing.customValue : null,
        impuestos_detalle: Array.from(new Set(currentPricing.spaces.flatMap(s => s.taxIds || []))),
        tax_total: currentPricing.taxes,
        espacios: currentPricing.spaces
    };

    const firstSpace = currentPricing.spaces[0];
    const auditMulti = await __cpResolveQuoteActorAudit();
    const payload = {
        cliente_id: quoteClientId || null,
        nombre_cotizacion: quoteName,
        espacio_id: firstSpace?.spaceId,
        espacio_nombre: currentPricing.spaces.length === 1 ? firstSpace.spaceName : `${firstSpace?.spaceName || ''} + ${currentPricing.spaces.length - 1} espacios`,
        espacio_clave: currentPricing.spaces.length === 1 ? firstSpace?.spaceKey : 'MULTI',
        cliente_nombre: cli.name,
        cliente_rfc: cli.rfc || '',
        cliente_contacto: cli.phone,
        cliente_email: cli.email || '',
        fecha_inicio: firstSpace?.startDate,
        fecha_fin: firstSpace?.endDate,
        precio_final: precioFinal,
        desglose_precios: desglosePrecios,
        detalles_evento: {
            multi_espacio: currentPricing.spaces.length > 1,
            total_espacios: currentPricing.spaces.length,
            nombre_cotizacion: quoteName
        },
        espacios_detalle: espaciosDetalle,
        conceptos_adicionales: conceptosB2B,
        status: 'pendiente',
        creado_por: auditMulti.actorId || null,
        creado_por_nombre: auditMulti.actorName,
        modificado_por: auditMulti.actorId || null,
        modificado_por_nombre: auditMulti.actorName,
        personas: Math.max(...currentPricing.spaces.map(s => s.guests || 0), 1)
    };

    const { error, id: createdQuoteId } = await __cpCreateQuoteRecord(payload);
    if (error) {
        console.error(error);
        if (String(error.message || '').toLowerCase().includes('espacios_detalle')) {
            return window.showToast('Falta aplicar migración de BD para multi-espacio.', 'error');
        }
        return window.showToast(`Error al guardar: ${__cpExtractCreateQuoteErrorMessage(error)}`, "error");
    }
    __cpReservationsCache = null; __cpReservationsAt = 0;
    window.showToast("✅ Cotización creada con " + (currentPricing.customEnabled ? 'PRECIO PERSONALIZADO' : 'cálculo automático'));
    const targetUrl = createdQuoteId ? `order_detail.html?quote=${encodeURIComponent(createdQuoteId)}` : 'orders.html';
    setTimeout(() => { __cpNavigateSafely(targetUrl); }, 1200);
};

window.filterCatalogLogic = function (options = {}) { const term = document.getElementById('cat-search').value.toLowerCase(); const type = document.getElementById('cat-filter-type').value; const sort = document.getElementById('cat-sort').value; let filtered = allSpaces.filter(s => (s.nombre.toLowerCase().includes(term) || s.clave.toLowerCase().includes(term)) && (type === 'all' || s.tipo === type)); if (sort === 'price_asc') filtered.sort((a, b) => a.precio_base - b.precio_base); if (sort === 'price_desc') filtered.sort((a, b) => b.precio_base - a.precio_base); renderSpaces(filtered); if (!cpQuoteRestoringViewState && options.skipSave !== true) cpQuoteSaveViewState(); }
window.previewImage = function (i, id) { const p = document.getElementById(id || 'mgr-preview'); if (i.files && i.files[0]) { const r = new FileReader(); r.onload = e => { p.src = e.target.result; p.classList.remove('hidden'); p.setAttribute('data-modified', 'true'); }; r.readAsDataURL(i.files[0]); } }
window.checkAvailability = async function () { const s = document.getElementById('date-start').value, e = document.getElementById('date-end').value; if (!s || !e) return; const { data } = await window.tenantPocketBase.from('cotizaciones').select('id').eq('espacio_id', currentSpace.id).in('status', ['aprobada', 'finalizada']).or(`and(fecha_inicio.lte.${e},fecha_fin.gte.${s})`); const msg = document.getElementById('avail-msg'); msg.classList.remove('hidden'); if (data.length) { msg.innerText = 'OCUPADO'; msg.className = 'text-red-500 font-bold text-center'; document.getElementById('btn-generate').disabled = true; } else { msg.innerText = 'DISPONIBLE'; msg.className = 'text-green-600 font-bold text-center'; document.getElementById('btn-generate').disabled = false; } }
window.askDeleteSpace = async function () { window.openConfirm("¿Eliminar espacio?", async () => { if (!(await ensureCpQuoteManageSession('eliminar el espacio'))) return; await window.tenantPocketBase.from('espacios').delete().eq('id', document.getElementById('mgr-id').value); cpQuoteSaveViewState({ selectedSpaceId: '' }); window.showToast("Eliminado"); window.closeModal('manager-modal'); loadCatalog(); }); }

// =========================================================================
// EXTENSIÓN 2026: MULTI-ESPACIO + PREMONTAJE 25% DÍA BASE + BLOQUEO CRUZADO
// =========================================================================
const __CP_RESERVATION_STATUSES = ['aprobada', 'finalizada'];
const __CP_RESERVATION_CACHE_MS = 10000;
let __cpQuoteSpaces = [];
let __cpActiveSpaceId = null;
let __cpReservationsCache = null;
let __cpReservationsAt = 0;
const __CP_DATE_PICKER_STATE = { target: 'start', month: 0, year: 0, start: '', end: '', reserved: new Set() };
const __CP_MONTAJE_PICKER_STATE = { month: 0, year: 0, start: '', end: '', reserved: new Set(), maxDate: '' };
let __cpQuotePickerCal = null;
let __cpMontajePickerCal = null;

function __cpSafeArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
    return [];
}
function __cpSafeObject(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }
    return {};
}
function __cpNormalizeDate(v) { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function __cpTodayISO() { return new Date().toISOString().split('T')[0]; }
function __cpMonthLabel(year, month) { return new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); }
function __cpDateIsPast(ds) { const d = __cpNormalizeDate(ds); return !!d && d < __cpTodayISO(); }
function __cpConvenioCovered(baseValue, deliveredValue, balanceValue = undefined) {
    const balance = parseFloat(balanceValue);
    if (Number.isFinite(balance)) return balance <= 0.009;
    const base = Math.max(0, parseFloat(baseValue || 0) || 0);
    const delivered = Math.max(0, parseFloat(deliveredValue || 0) || 0);
    if (base <= 0) return false;
    return delivered + 0.009 >= base;
}
function __cpHasFiniteConvenioEndDate(value) {
    const raw = __cpNormalizeDate(value || '');
    return !!raw && raw !== CP_CONVENIO_INDEFINITE_END;
}
function __cpDetailBlocksIndefinitely(detail = {}) {
    const row = detail && typeof detail === 'object' ? detail : {};
    const flagged = row?.convenio_activo === true || row?.convenio_indefinido === true || row?.bloqueo_indefinido === true;
    if (!flagged) return false;
    // Auditoria TI: el convenio solo es indefinido cuando no existe fecha fin real.
    if (__cpHasFiniteConvenioEndDate(row?.fecha_fin || row?.endDate)) return false;
    return __cpConvenioCovered(
        row?.subtotal_espacio ?? row?.baseValue,
        row?.convenio_monto_entregado ?? row?.convenioValue,
        row?.convenio_balance
    );
}
function __cpCfgConvenioValue(cfg) {
    return getCpQuoteConvenioItems(cfg).reduce((sum, concept) => sum + (parseFloat(concept.amount ?? concept.value ?? 0) || 0), 0);
}
function __cpCfgBlocksIndefinitely(cfg) {
    if (!cfg?.convenioEnabled || !__cpIsPublicidadCfg(cfg)) return false;
    if (__cpHasFiniteConvenioEndDate(cfg?.endDate)) return false;
    const space = __cpGetSpaceById(cfg.spaceId);
    const base = parseFloat(space?.precio_base || 0) || 0;
    return __cpConvenioCovered(base, __cpCfgConvenioValue(cfg));
}
function __cpAddDays(ds, delta) {
    const n = __cpNormalizeDate(ds);
    if (!n) return '';
    const d = new Date(`${n}T00:00:00`);
    d.setDate(d.getDate() + (delta || 0));
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function __cpToYMD(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function __cpGuestRangeText(space) {
    let rules = [];
    try { rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []); } catch (e) { rules = []; }
    if (!Array.isArray(rules) || !rules.length) return 'Sin rango';
    const mins = rules.map(r => parseInt(r?.min, 10)).filter(Number.isFinite);
    const maxs = rules.map(r => parseInt(r?.max, 10)).filter(Number.isFinite);
    if (!mins.length || !maxs.length) return 'Sin rango';
    return `${Math.min(...mins)}-${Math.max(...maxs)} pax`;
}
function __cpHorariosText(space) {
    const b2b = __cpB2B(space);
    let h = __cpSafeArray(b2b.horarios);
    if (!h.length && b2b.horarios && typeof b2b.horarios === 'object') {
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(b2b.horarios).map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end })).filter(item => item.start && item.end);
    }
    if (!h.length) return 'Sin turnos';
    return h.map(x => x.nombre).join(', ');
}
function __cpDatesBetween(startStr, endStr) {
    const s = __cpNormalizeDate(startStr), e = __cpNormalizeDate(endStr || startStr);
    if (!s || !e) return [];
    const start = new Date(`${s}T00:00:00`), end = new Date(`${e}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${day}`);
    }
    return out;
}
function __cpGetSpaceById(spaceId) { return allSpaces.find(s => String(s.id) === String(spaceId)) || null; }
function __cpB2B(space) { return __cpSafeObject(space?.config_b2b); }
function __cpSetQuoteWorkspaceVisible(visible) {
    const ws = document.getElementById('quote-workspace');
    const empty = document.getElementById('quote-empty-state');
    if (ws) ws.classList.toggle('hidden', !visible);
    if (empty) empty.classList.toggle('hidden', !!visible);
}
function __cpRefreshSpaceCards() {
    if (typeof window.filterCatalogLogic === 'function') window.filterCatalogLogic();
    else renderSpaces(allSpaces);
}
function __cpDayKey(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return keys[d.getDay()] || '';
}
function __cpIsBlockedDate(space, dateStr, guests) {
    const dayKey = __cpDayKey(dateStr);
    let blocked = [];
    try { blocked = typeof space?.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space?.dias_bloqueados || []); } catch (e) { blocked = []; }
    if (Array.isArray(blocked) && blocked.includes(dayKey)) return true;
    const base = calculateDayByDayTotal(space, dateStr, dateStr, guests).total || 0;
    return base <= 0;
}
function __cpIsPremontajeBlockedDate(space, dateStr) {
    let blockedP = [];
    try { blockedP = typeof space?.dias_bloqueados_premontaje === 'string' ? JSON.parse(space.dias_bloqueados_premontaje) : (space?.dias_bloqueados_premontaje || []); } catch (e) { blockedP = []; }
    const dayKey = __cpDayKey(dateStr);
    return Array.isArray(blockedP) && blockedP.includes(dayKey);
}
function __cpCfgHasBlockedDates(cfg) {
    const space = __cpGetSpaceById(cfg?.spaceId);
    if (!space) return false;
    const guests = parseInt(cfg?.guests, 10) || 1;
    const eventDates = __cpDatesBetween(cfg?.startDate, cfg?.endDate);
    const premDates = __cpSafeArray(cfg?.premontajeDates).map(__cpNormalizeDate).filter(Boolean);
    const eventBlocked = eventDates.some(ds => __cpIsBlockedDate(space, ds, guests));
    const premBlocked = premDates.some(ds => __cpIsPremontajeBlockedDate(space, ds));
    return eventBlocked || premBlocked;
}
function __cpCalcPremCost(space, cfg) {
    const requested = Math.max(0, parseInt(cfg.premontajeDays, 10) || 0);
    const dates = __cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean).sort().slice(0, requested);
    const guests = parseInt(cfg.guests, 10) || 1;
    const courtesyDays = Math.min(requested, Math.max(0, parseInt(cfg.premontajeCourtesyDays, 10) || 0));
    cfg.premontajeCourtesyDays = courtesyDays;
    const pct = getPremontajePct();
    const priced = dates.map(ds => ({ date: ds, base_day: parseFloat(calculateDayByDayTotal(space, ds, ds, guests, { ignoreBlocks: true }).total || 0) || 0 }));
    const billableCount = Math.max(0, priced.length - courtesyDays);
    const chargeMap = new Set(
        [...priced]
            .sort((a, b) => (b.base_day - a.base_day) || String(a.date).localeCompare(String(b.date)))
            .slice(0, billableCount)
            .map(x => x.date)
    );
    const breakdown = [];
    let total = 0;
    priced.forEach(item => {
        const billable = chargeMap.has(item.date);
        const amount = billable ? (item.base_day * (pct / 100)) : 0;
        total += amount;
        breakdown.push({ date: item.date, base_day: item.base_day, porcentaje: pct, courtesy: !billable, amount });
    });
    return { total, breakdown };
}
function __cpIsPublicidadCfg(target) {
    const space = target?.spaceId ? __cpGetSpaceById(target.spaceId) : target;
    return isCpAdvertisingSpace(space) || normalizeCpSpaceTag(space?.tipo) === 'publicidad';
}
function __cpRangeDays(startStr, endStr) {
    return Math.max(1, __cpDatesBetween(startStr || '', endStr || startStr || '').length || 0);
}
function __cpGetMonthBounds(anchor = '') {
    const base = __cpNormalizeDate(anchor) || __cpTodayISO();
    const start = new Date(`${base}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
        const today = __cpTodayISO();
        return { start: today, end: today };
    }
    const end = new Date(`${base}T00:00:00`);
    end.setDate(end.getDate() + 29);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
    };
}
function __cpNormalizePublicidadDates(cfg) {
    if (!cfg) return;
    const anchor = __cpNormalizeDate(cfg.startDate || cfg.endDate || __cpTodayISO());
    if (cfg.customPermanence) {
        cfg.startDate = __cpNormalizeDate(cfg.startDate || anchor);
        cfg.endDate = __cpNormalizeDate(cfg.endDate || cfg.startDate || anchor);
    } else {
        const month = __cpGetMonthBounds(anchor);
        cfg.startDate = month.start;
        cfg.endDate = month.end;
    }
    if (cfg.startDate && cfg.endDate && cfg.endDate < cfg.startDate) cfg.endDate = cfg.startDate;
}
// Publicidad in Casa de Piedra prices the selected span directly, while espacios
// uses the event flow and separate concept/tax calculators.
function __cpBuildPublicidadPrice(space, cfg) {
    if (!space) return { subtotal: 0, taxes: 0, total: 0, taxIds: [] };
    const hasCustom = !!cfg?.customPriceEnabled && cfg?.customBasePrice !== '' && cfg?.customBasePrice !== null && cfg?.customBasePrice !== undefined;
    let subtotal = hasCustom ? (parseFloat(cfg.customBasePrice) || 0) : (parseFloat(space.precio_base || 0) || 0);
    if (hasCustom && String(cfg?.customPriceMode || 'total') === 'per_day') {
        subtotal *= __cpRangeDays(cfg?.startDate, cfg?.endDate);
    } else if (!hasCustom) {
        const adjustmentType = normalizeCpQuoteAdjustmentType(space.ajuste_tipo);
        if (adjustmentType === 'aumento') subtotal += subtotal * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
        if (adjustmentType === 'descuento') subtotal -= subtotal * (normalizeCpQuoteAdjustmentPercent(adjustmentType, space.ajuste_porcentaje) / 100);
    }
    const taxIds = parseIds(space.impuestos_ids || space.impuestos);
    let taxes = 0;
    taxIds.forEach(tid => {
        const tax = findCpQuoteTaxRecord(tid, space);
        if (!tax) return;
        const rate = parseFloat(tax.porcentaje || 0) > 1 ? (parseFloat(tax.porcentaje || 0) / 100) : parseFloat(tax.porcentaje || 0);
        taxes += subtotal * rate;
    });
    return { subtotal, taxes, total: subtotal + taxes, taxIds };
}
function __cpQuoteBlocksIndefinitely(order = {}) {
    const details = __cpSafeObject(order?.detalles_evento);
    const convenio = __cpSafeObject(details?.convenio);
    const spaces = __cpSafeArray(order?.espacios_detalle);
    if (spaces.length) return spaces.some((item) => __cpDetailBlocksIndefinitely(item));
    if (__cpHasFiniteConvenioEndDate(order?.fecha_fin || order?.endDate)) return false;
    if (convenio?.activo !== true || convenio?.bloqueo_indefinido === false) return false;
    const breakdown = __cpSafeObject(order?.desglose_precios);
    return __cpConvenioCovered(
        breakdown?.convenio_base_total,
        breakdown?.convenio_entregable_total,
        breakdown?.convenio_balance_total ?? order?.precio_final
    );
}
function __cpSyncQuoteCustomUi(cfg) {
    const active = cfg || __cpGetActiveCfg();
    const wrap = document.getElementById('q-custom-price-wrap');
    const modeSelect = document.getElementById('q-custom-price-mode');
    const input = document.getElementById('q-custom-price');
    const label = document.getElementById('q-custom-price-label');
    const hint = document.getElementById('q-custom-price-hint');
    const chkPerm = document.getElementById('q-custom-permanence');
    const chkPrice = document.getElementById('q-custom-price-enabled');
    if (chkPerm) chkPerm.checked = !!active?.customPermanence;
    if (chkPrice) {
        chkPrice.checked = !!active?.customPriceEnabled && !active?.convenioEnabled;
        chkPrice.disabled = !!active?.convenioEnabled;
    }
    if (modeSelect) modeSelect.value = String(active?.customPriceMode || 'total');
    if (input) input.value = (active && active.customBasePrice !== '' && active.customBasePrice !== null && active.customBasePrice !== undefined) ? String(active.customBasePrice) : '';
    if (wrap) wrap.classList.toggle('hidden', !active?.customPriceEnabled || !!active?.convenioEnabled);
    if (label) label.textContent = String(active?.customPriceMode || 'total') === 'per_day' ? 'Precio Personalizado por Día' : 'Precio Personalizado del Espacio (antes de impuestos)';
    if (hint) hint.textContent = String(active?.customPriceMode || 'total') === 'per_day' ? 'Se multiplicará por el número de días disponibles en la fecha seleccionada.' : 'Define el total manual de la estancia seleccionada.';
    syncCpQuoteConvenioUi(active);
}
function __cpSyncActiveSpaceModeUi(cfg) {
    const active = cfg || __cpGetActiveCfg();
    const isPublicidad = __cpIsPublicidadCfg(active);
    const guestsField = document.getElementById('q-event-guests-field');
    const eventWrap = document.getElementById('q-event-options-wrap');
    const publicidadWrap = document.getElementById('q-publicidad-controls');
    const convenioCard = document.getElementById('q-convenio-card');
    const convenioWrap = document.getElementById('q-convenio-wrap');
    if (guestsField) guestsField.classList.toggle('hidden', isPublicidad);
    if (eventWrap) eventWrap.classList.toggle('hidden', isPublicidad);
    if (publicidadWrap) publicidadWrap.classList.toggle('hidden', !isPublicidad);
    if (!isPublicidad) {
        if (convenioCard) convenioCard.classList.add('hidden');
        if (convenioWrap) convenioWrap.classList.add('hidden');
    }
    if (isPublicidad) {
        const guestsEl = document.getElementById('q-guests');
        const premChk = document.getElementById('q-chk-premontaje');
        const horasChk = document.getElementById('q-chk-horas');
        if (guestsEl) guestsEl.value = '1';
        if (premChk) premChk.checked = false;
        if (horasChk) horasChk.checked = false;
    }
    __cpSyncQuoteCustomUi(active);
}
function __cpCreateSpaceCfg(spaceId, seed = {}) {
    const space = __cpGetSpaceById(spaceId);
    const b2b = __cpB2B(space);
    const h = __cpSafeArray(b2b.horarios);
    const hasSeedHoraUnit = seed.horasExtraUnit !== undefined && seed.horasExtraUnit !== null && String(seed.horasExtraUnit) !== '';
    const cfg = {
        spaceId: String(spaceId),
        startDate: __cpNormalizeDate(seed.startDate || ''),
        endDate: __cpNormalizeDate(seed.endDate || ''),
        guests: __cpIsPublicidadCfg(space) ? 1 : (parseInt(seed.guests, 10) || 100),
        horarioValue: seed.horarioValue || (h[0]?.nombre || ''),
        horarioText: seed.horarioText || '',
        horarioPrice: parseFloat(seed.horarioPrice || h[0]?.price || 0),
        premontajeEnabled: seed.premontajeEnabled === true || (parseInt(seed.premontajeDays, 10) || 0) > 0,
        premontajeDays: parseInt(seed.premontajeDays, 10) || 0,
        premontajeDates: __cpSafeArray(seed.premontajeDates),
        premontajeCourtesyDays: parseInt(seed.premontajeCourtesyDays, 10) || 0,
        horasExtraEnabled: seed.horasExtraEnabled === true || (parseInt(seed.horasExtra, 10) || 0) > 0,
        horasExtra: parseInt(seed.horasExtra, 10) || 0,
        horasExtraCourtesy: parseInt(seed.horasExtraCourtesy, 10) || 0,
        horasExtraUnit: hasSeedHoraUnit ? (parseFloat(seed.horasExtraUnit) || 0) : __cpResolveHoraExtraUnit(space),
        customPermanence: !!seed.customPermanence,
        customPriceEnabled: !!seed.customPriceEnabled,
        customPriceMode: String(seed.customPriceMode || 'total'),
        customBasePrice: (seed.customBasePrice === undefined || seed.customBasePrice === null || seed.customBasePrice === '')
            ? ''
            : (parseFloat(seed.customBasePrice) || 0),
        convenioEnabled: !!seed.convenioEnabled,
        concepts: __cpSafeArray(seed.concepts).map(normalizeCpQuoteConcept)
    };
    if (__cpIsPublicidadCfg(space)) {
        cfg.premontajeEnabled = false;
        cfg.premontajeDays = 0;
        cfg.premontajeDates = [];
        cfg.premontajeCourtesyDays = 0;
        cfg.horasExtraEnabled = false;
        cfg.horasExtra = 0;
        cfg.horasExtraCourtesy = 0;
        cfg.horarioValue = '';
        cfg.horarioText = '';
        cfg.horarioPrice = 0;
        __cpNormalizePublicidadDates(cfg);
    }
    return cfg;
}
function __cpGetSpaceCategoryKey(space) {
    return __cpIsPublicidadCfg(space) ? 'publicidad' : 'espacio';
}
function __cpGetQuoteCategoryMode() {
    const categories = Array.from(new Set(__cpQuoteSpaces.map((cfg) => __cpGetSpaceCategoryKey(__cpGetSpaceById(cfg.spaceId) || cfg))));
    if (!categories.length) return '';
    return categories.length === 1 ? categories[0] : 'mixed';
}
function __cpIsQuoteConvenioMode() {
    return __cpQuoteSpaces.some((cfg) => !!cfg?.convenioEnabled);
}
function __cpCanDisplayQuoteSpace(space) {
    const sid = String(space?.id || space?.spaceId || '').trim();
    if (!sid) return false;
    const isSelected = __cpQuoteSpaces.some((cfg) => String(cfg.spaceId) === sid);
    if (__cpIsQuoteConvenioMode() && !cpSpaceAllowsConvenio(space)) return false;
    if (isSelected) return true;
    const categoryMode = __cpGetQuoteCategoryMode();
    if (categoryMode === 'mixed') return false;
    return !categoryMode || categoryMode === __cpGetSpaceCategoryKey(space);
}
function __cpCanAddSpaceToQuote(spaceId, options = {}) {
    const space = __cpGetSpaceById(spaceId);
    if (!space) return false;
    if (__cpIsQuoteConvenioMode() && !cpSpaceAllowsConvenio(space)) {
        if (!options.silent) window.showToast('Ese espacio no está disponible para convenio.', 'error');
        return false;
    }
    const categoryMode = __cpGetQuoteCategoryMode();
    // Casa de Piedra keeps a hybrid catalog, but each quote must stay within one
    // operational mode because PUBLICIDAD and ESPACIO serialize different rules.
    if (categoryMode === 'mixed') {
        if (!options.silent) window.showToast('Quita espacios de una categoría antes de agregar otro. No se puede mezclar ESPACIO con PUBLICIDAD.', 'error');
        return false;
    }
    const nextCategory = __cpGetSpaceCategoryKey(space);
    if (categoryMode && categoryMode !== nextCategory) {
        if (!options.silent) window.showToast('No se puede mezclar ESPACIO con PUBLICIDAD en la misma cotización.', 'error');
        return false;
    }
    return true;
}
function __cpGetActiveCfg() { return __cpQuoteSpaces.find(x => String(x.spaceId) === String(__cpActiveSpaceId)) || null; }
function __cpSaveActiveCfgFromForm() {
    const cfg = __cpGetActiveCfg(); if (!cfg) return;
    const space = __cpGetSpaceById(cfg.spaceId);
    const isPublicidad = __cpIsPublicidadCfg(space);
    cfg.startDate = __cpNormalizeDate(document.getElementById('date-start')?.value || '');
    cfg.endDate = __cpNormalizeDate(document.getElementById('date-end')?.value || '');
    const today = __cpTodayISO();
    if (cfg.startDate && cfg.startDate < today) cfg.startDate = today;
    if (cfg.endDate && cfg.endDate < today) cfg.endDate = today;
    if (cfg.startDate && cfg.endDate && cfg.endDate < cfg.startDate) cfg.endDate = cfg.startDate;
    cfg.customPermanence = !!document.getElementById('q-custom-permanence')?.checked;
    cfg.convenioEnabled = !!document.getElementById('q-convenio-enabled')?.checked;
    cfg.customPriceEnabled = cfg.convenioEnabled ? false : !!document.getElementById('q-custom-price-enabled')?.checked;
    cfg.customPriceMode = String(document.getElementById('q-custom-price-mode')?.value || cfg.customPriceMode || 'total');
    cfg.customBasePrice = cfg.customPriceEnabled
        ? (() => {
            const raw = document.getElementById('q-custom-price')?.value;
            if (raw === '' || raw === null || raw === undefined) return '';
            return Math.max(0, parseFloat(raw) || 0);
        })()
        : '';
    cfg.concepts = __cpSafeArray(cfg.concepts).map(normalizeCpQuoteConcept);
    if (isPublicidad) __cpNormalizePublicidadDates(cfg);
    const startEl = document.getElementById('date-start');
    const endEl = document.getElementById('date-end');
    if (startEl && startEl.value !== cfg.startDate) startEl.value = cfg.startDate || '';
    if (endEl && endEl.value !== cfg.endDate) endEl.value = cfg.endDate || '';
    cfg.guests = isPublicidad ? 1 : (parseInt(document.getElementById('q-guests')?.value, 10) || 100);
    cfg.premontajeEnabled = !isPublicidad && !!document.getElementById('q-chk-premontaje')?.checked;
    cfg.horasExtraEnabled = !isPublicidad && !!document.getElementById('q-chk-horas')?.checked;
    cfg.premontajeDays = cfg.premontajeEnabled ? (parseInt(document.getElementById('q-premontaje')?.value, 10) || 0) : 0;
    cfg.premontajeCourtesyDays = cfg.premontajeEnabled ? Math.max(0, parseInt(document.getElementById('q-premontaje-cortesia')?.value, 10) || 0) : 0;
    cfg.horasExtra = cfg.horasExtraEnabled ? (parseInt(document.getElementById('q-horas')?.value, 10) || 0) : 0;
    cfg.horasExtraCourtesy = cfg.horasExtraEnabled ? Math.max(0, parseInt(document.getElementById('q-horas-cortesia')?.value, 10) || 0) : 0;
    cfg.horasExtraUnit = isPublicidad ? 0 : __cpResolveHoraExtraUnit(space);
    cfg.premontajeDates = cfg.premontajeEnabled ? (__cpSafeArray(window.finalMontajeDates) || []).slice(0, cfg.premontajeDays) : [];
    if (cfg.premontajeCourtesyDays > cfg.premontajeDays) cfg.premontajeCourtesyDays = cfg.premontajeDays;
    if (cfg.horasExtraCourtesy > cfg.horasExtra) cfg.horasExtraCourtesy = cfg.horasExtra;
    const pc = document.getElementById('q-premontaje-cortesia');
    const hc = document.getElementById('q-horas-cortesia');
    if (pc) { pc.max = String(cfg.premontajeDays); pc.value = String(cfg.premontajeCourtesyDays); }
    if (hc) { hc.max = String(cfg.horasExtra); hc.value = String(cfg.horasExtraCourtesy); }
    const sel = document.getElementById('q-horario');
    const opt = sel?.options?.[sel.selectedIndex];
    cfg.horarioValue = isPublicidad ? '' : (sel?.value || '');
    cfg.horarioText = isPublicidad ? '' : (opt?.text || '');
    cfg.horarioPrice = isPublicidad ? 0 : parseFloat(opt?.getAttribute('data-price') || 0);
}
function __cpSetHeader(space) {
    if (!space) return;
    document.getElementById('q-name').innerText = space.nombre || 'Espacio';
    document.getElementById('q-key').innerText = space.clave || '--';
    let modalImg = space.imagen_url || '';
    if (typeof modalImg === 'string' && modalImg.startsWith('[')) { try { modalImg = JSON.parse(modalImg)[0]; } catch (e) { } }
    document.getElementById('q-img').src = modalImg || '../../assets/img/no-image.svg';
}
function __cpRenderHorario(space, selectedValue = '') {
    const b2b = __cpB2B(space);
    let h = __cpSafeArray(b2b.horarios);
    if (!h.length && b2b.horarios && typeof b2b.horarios === 'object') {
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(b2b.horarios).map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end, price: b2b.horarios[k]?.price })).filter(item => item.start && item.end);
    }
    const sel = document.getElementById('q-horario');
    sel.innerHTML = '';
    if (h.length) h.forEach(item => { sel.innerHTML += `<option value="${item.nombre}" data-price="${parseFloat(item.price || 0)}">${item.nombre} (${item.start} a ${item.end})</option>`; });
    else sel.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';
    if (selectedValue) {
        const found = Array.from(sel.options).find(opt => opt.value === selectedValue);
        if (found) sel.value = selectedValue;
    }
}
function __cpRenderSpaceAddSelect() {
    const sel = document.getElementById('q-space-add');
    if (!sel) return;
    const selectedIds = new Set(__cpQuoteSpaces.map(q => String(q.spaceId)));
    sel.innerHTML = '<option value="">Selecciona espacio...</option>';
    allSpaces.filter((space) => __cpCanDisplayQuoteSpace(space)).forEach(space => {
        const disabled = selectedIds.has(String(space.id)) ? 'disabled' : '';
        sel.innerHTML += `<option value="${space.id}" ${disabled}>${space.nombre}</option>`;
    });
}
function __cpRenderSpaceTabs() {
    const container = document.getElementById('q-spaces-tabs');
    if (!container) return;
    container.innerHTML = '';
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        const active = String(cfg.spaceId) === String(__cpActiveSpaceId);
        const classes = active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-red';
        container.innerHTML += `<div class="flex items-center border rounded-full ${classes}">
            <button onclick="window.selectQuoteSpace('${cfg.spaceId}')" class="px-3 py-1.5 text-[10px] font-bold uppercase">${space?.nombre || cfg.spaceId}</button>
            ${__cpQuoteSpaces.length > 1 ? `<button onclick="window.removeQuoteSpaceFromQuote('${cfg.spaceId}')" class="pr-2 text-[10px]"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
    });
}
function __cpLoadActiveCfgToForm() {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    currentSpace = __cpGetSpaceById(cfg.spaceId);
    const isPublicidad = __cpIsPublicidadCfg(currentSpace);
    __cpSetHeader(currentSpace);
    __cpRenderHorario(currentSpace, cfg.horarioValue);
    document.getElementById('date-start').value = cfg.startDate || '';
    document.getElementById('date-end').value = cfg.endDate || '';
    document.getElementById('q-guests').value = isPublicidad ? 1 : (cfg.guests || 100);
    document.getElementById('q-chk-premontaje').checked = !!cfg.premontajeEnabled;
    document.getElementById('q-chk-horas').checked = !!cfg.horasExtraEnabled;
    document.getElementById('q-premontaje').value = cfg.premontajeDays || 0;
    document.getElementById('q-premontaje-cortesia').value = cfg.premontajeCourtesyDays || 0;
    document.getElementById('q-horas').value = cfg.horasExtra || 0;
    document.getElementById('q-horas-cortesia').value = cfg.horasExtraCourtesy || 0;
    const minToday = __cpTodayISO();
    const startEl = document.getElementById('date-start');
    const endEl = document.getElementById('date-end');
    if (startEl) startEl.min = minToday;
    if (endEl) endEl.min = minToday;
    const convenioChk = document.getElementById('q-convenio-enabled');
    if (convenioChk) convenioChk.checked = !!cfg.convenioEnabled;
    __cpSyncActiveSpaceModeUi(cfg);
    window.toggleQuotePremontaje(true);
    window.toggleQuoteHoras(true);
    window.finalMontajeDates = __cpSafeArray(cfg.premontajeDates).slice();
    if (isPublicidad) {
        window.actualizarLabelMontaje('q');
    } else {
        window.handleMontajeInput('q');
    }
}

function __cpSetDateOnForm(startDate, endDate) {
    const cfg = __cpGetActiveCfg();
    const isPublicidad = __cpIsPublicidadCfg(cfg);
    let start = __cpNormalizeDate(startDate);
    let end = __cpNormalizeDate(endDate || start);
    const minToday = __cpTodayISO();
    if (start && start < minToday) return window.showToast('No puedes seleccionar fechas pasadas.', 'error');
    if (end && end < minToday) return window.showToast('No puedes seleccionar fechas pasadas.', 'error');
    if (isPublicidad && cfg && !cfg.customPermanence) {
        const month = __cpGetMonthBounds(start || end || __cpTodayISO());
        start = month.start;
        end = month.end;
    }
    const sEl = document.getElementById('date-start');
    const eEl = document.getElementById('date-end');
    if (sEl) sEl.value = start || '';
    if (eEl) eEl.value = end || '';
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
}

function __cpDateCellClasses(state, flags) {
    const s = __cpNormalizeDate(state.start);
    const e = __cpNormalizeDate(state.end || s);
    const inRange = s && e && flags.ds >= s && flags.ds <= e;
    const isEdge = flags.ds === s || flags.ds === e;
    if (flags.isPast) return 'cal-disabled bg-gray-100 text-gray-300 border border-gray-100 cursor-not-allowed';
    if (flags.isReserved) return 'cal-occupied bg-red-50 text-red-600 border border-red-200 cursor-not-allowed';
    if (flags.isBlocked) return 'cal-occupied bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed';
    if (isEdge) return 'bg-emerald-600 text-white border border-emerald-600';
    if (inRange) return 'bg-emerald-100 text-gray-700 border border-emerald-200';
    return 'bg-white text-gray-700 border border-gray-100 hover:bg-gray-50';
}

function __cpDayPrice(space, ds, guests, opts = {}) {
    if (__cpIsPublicidadCfg(space)) return 0;
    const value = calculateDayByDayTotal(space, ds, ds, guests, opts).total;
    return parseFloat(value || 0) || 0;
}

// Renderiza el calendario de fechas del evento con reservas y precios por día.
async function __cpRenderQuoteDatePicker() {
    const grid = document.getElementById('quote-date-fc') || document.getElementById('quote-date-grid');
    if (!grid) return;
    const label = document.getElementById('quote-date-month-label');
    const startLbl = document.getElementById('quote-date-picked-start');
    const endLbl = document.getElementById('quote-date-picked-end');
    const list = document.getElementById('quote-date-reserved-list');
    const state = __CP_DATE_PICKER_STATE;
    const cfg = __cpGetActiveCfg();
    const space = __cpGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    const sid = String(cfg?.spaceId || '');
    const reservations = await __cpGetReservations(true);
    const reservedSet = reservations.get(sid) || new Set();
    state.reserved = reservedSet;

    if (label) label.textContent = '';
    if (startLbl) startLbl.textContent = state.start ? window.safeFormatDate(state.start) : '--';
    if (endLbl) endLbl.textContent = state.end ? window.safeFormatDate(state.end) : '--';

    const events = [];
    const dates = Array.from(reservedSet).sort();
    if (dates.length) {
        let chunkStart = dates[0];
        let prev = dates[0];
        const pushChunk = (startDs, endDs) => {
            events.push({
                id: `res-${sid}-${startDs}`,
                title: 'Reservado',
                start: startDs,
                end: __cpAddDays(endDs, 1),
                allDay: true,
                backgroundColor: '#1f2937',
                borderColor: '#1f2937',
                textColor: '#ffffff'
            });
        };
        for (let i = 1; i < dates.length; i++) {
            const expected = __cpAddDays(prev, 1);
            if (dates[i] !== expected) {
                pushChunk(chunkStart, prev);
                chunkStart = dates[i];
            }
            prev = dates[i];
        }
        pushChunk(chunkStart, prev);
    }
    if (state.start) {
        events.push({
            id: '__selection_quote',
            start: state.start,
            end: __cpAddDays(state.end || state.start, 1),
            display: 'background',
            backgroundColor: 'rgba(16, 185, 129, 0.22)',
            borderColor: 'transparent',
            allDay: true
        });
    }

    if (__cpQuotePickerCal) {
        __cpQuotePickerCal.destroy();
        __cpQuotePickerCal = null;
    }
    __cpQuotePickerCal = new FullCalendar.Calendar(grid, {
        initialView: 'dayGridMonth',
        locale: 'es',
        initialDate: state.start || __cpTodayISO(),
        height: '100%',
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        events,
        dateClick: (info) => { window.pickQuoteDate(info.dateStr); },
        dayCellDidMount: (arg) => {
            const ds = __cpToYMD(arg.date);
            const isPast = __cpDateIsPast(ds);
            const isReserved = reservedSet.has(ds);
            const isBlocked = !isPast && !isReserved && !!space && __cpIsBlockedDate(space, ds, guests);
            if (isPast || isReserved || isBlocked) {
                arg.el.classList.add('opacity-60');
                arg.el.style.backgroundColor = isReserved ? '#fef2f2' : '#f3f4f6';
            }
            if (!isPast && !isReserved && !isBlocked && space && guests > 0) {
                const p = __cpDayPrice(space, ds, guests);
                if (p > 0) {
                    const frame = arg.el.querySelector('.fc-daygrid-day-frame');
                    if (frame) {
                        const priceEl = document.createElement('div');
                        priceEl.className = 'text-[10px] font-bold text-gray-400 text-right px-1 mt-4';
                        priceEl.textContent = `$${p.toLocaleString('es-MX')}`;
                        frame.appendChild(priceEl);
                    }
                }
            }
            if (isReserved || isBlocked) {
                const frame = arg.el.querySelector('.fc-daygrid-day-frame');
                if (frame) {
                    const ban = document.createElement('i');
                    ban.className = 'fa-solid fa-ban text-gray-300 text-base absolute inset-0 m-auto h-4 w-4 pointer-events-none';
                    frame.style.position = 'relative';
                    frame.appendChild(ban);
                }
            }
        }
    });
    __cpQuotePickerCal.render();

    if (list) {
        const rows = Array.from(reservedSet).filter(d => d >= __cpTodayISO()).sort().slice(0, 45);
        list.innerHTML = rows.length
            ? rows.map(d => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join('')
            : '<p class="text-[10px] text-gray-400 italic">Sin reservas confirmadas visibles.</p>';
    }
}

// Abre el modal de calendario y fuerza recálculo visual del FullCalendar.
window.openQuoteDatePicker = async function (target = 'start') {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    const today = new Date();
    const baseDate = __cpNormalizeDate(document.getElementById('date-start')?.value || cfg.startDate || __cpTodayISO());
    const base = baseDate ? new Date(`${baseDate}T00:00:00`) : today;
    __CP_DATE_PICKER_STATE.target = target === 'end' ? 'end' : 'start';
    __CP_DATE_PICKER_STATE.month = base.getMonth();
    __CP_DATE_PICKER_STATE.year = base.getFullYear();
    __CP_DATE_PICKER_STATE.start = __cpNormalizeDate(document.getElementById('date-start')?.value || cfg.startDate || '');
    __CP_DATE_PICKER_STATE.end = __cpNormalizeDate(document.getElementById('date-end')?.value || cfg.endDate || __CP_DATE_PICKER_STATE.start || '');
    window.openModal('quote-date-modal');
    await __cpRenderQuoteDatePicker();
    __cpRefreshCalendarLayout(__cpQuotePickerCal);
}

window.shiftQuoteDatePickerMonth = async function (delta) {
    if (!__cpQuotePickerCal) return;
    if ((delta || 0) < 0) __cpQuotePickerCal.prev();
    else __cpQuotePickerCal.next();
}

window.pickQuoteDate = async function (ds) {
    if (__cpDateIsPast(ds)) return;
    const cfg = __cpGetActiveCfg();
    const space = __cpGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    if (__CP_DATE_PICKER_STATE.reserved?.has(ds)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} ya está ocupada para este espacio.`, 'error');
    if (space && __cpIsBlockedDate(space, ds, guests)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} está bloqueada para ese espacio.`, 'error');
    const state = __CP_DATE_PICKER_STATE;
    if (__cpIsPublicidadCfg(space) && cfg && !cfg.customPermanence) {
        const bounds = __cpGetMonthBounds(ds);
        const range = __cpDatesBetween(bounds.start, bounds.end);
        const clash = range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));
        if (clash) return window.showToast(`El periodo automático incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');
        const blocked = space ? range.find(d => __cpIsBlockedDate(space, d, guests)) : '';
        if (blocked) return window.showToast(`El periodo automático incluye fecha bloqueada: ${window.safeFormatDate(blocked)}.`, 'error');
        state.start = bounds.start;
        state.end = bounds.end;
        await __cpRenderQuoteDatePicker();
        return;
    }
    if (!state.start || state.end) {
        state.start = ds;
        state.end = '';
    } else if (ds < state.start) {
        state.start = ds;
    } else {
        const range = __cpDatesBetween(state.start, ds);
        const clash = range.find(d => __CP_DATE_PICKER_STATE.reserved?.has(d));
        if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');
        if (space) {
            const blocked = range.find(d => __cpIsBlockedDate(space, d, guests));
            if (blocked) return window.showToast(`El rango incluye fecha bloqueada: ${window.safeFormatDate(blocked)}.`, 'error');
        }
        state.end = ds;
    }
    await __cpRenderQuoteDatePicker();
}

window.applyQuoteDatePickerSelection = function () {
    const state = __CP_DATE_PICKER_STATE;
    if (!state.start) return window.showToast('Selecciona al menos una fecha.', 'error');
    __cpSetDateOnForm(state.start, state.end || state.start);
    window.closeModal('quote-date-modal');
}
// Availability for Casa de Piedra is derived from approved/finalized quotes plus
// explicit montaje/premontaje dates and convenio blocks that remain indefinite.
function __cpBuildReservationsMap(rows) {
    const map = new Map();
    const addDate = (spaceId, dateStr) => {
        const sid = String(spaceId || '').trim();
        const ds = __cpNormalizeDate(dateStr);
        if (!sid || !ds) return;
        if (!map.has(sid)) map.set(sid, new Set());
        map.get(sid).add(ds);
    };
    const addRange = (spaceId, startStr, endStr) => { __cpDatesBetween(startStr, endStr).forEach(d => addDate(spaceId, d)); };
    const addConceptMontaje = (spaceIdDefault, conceptos) => {
        __cpSafeArray(conceptos).forEach(c => {
            if (String(c?.type || '').toLowerCase().trim() !== 'b2b_montaje') return;
            const meta = __cpSafeObject(c.meta);
            const sid = meta.space_id || spaceIdDefault;
            __cpSafeArray(meta.dates).forEach(d => addDate(sid, d));
        });
    };
    (rows || []).forEach(order => {
        const orderBlocksIndefinitely = __cpQuoteBlocksIndefinitely(order);
        const details = __cpSafeArray(order.espacios_detalle);
        if (details.length) {
            details.forEach(item => {
                const sid = item.espacio_id || item.space_id;
                const eventDates = __cpSafeArray(item.fechas_evento).map(__cpNormalizeDate).filter(Boolean);
                if (eventDates.length) eventDates.forEach(d => addDate(sid, d));
                else addRange(
                    sid,
                    item.fecha_inicio,
                    __cpDetailBlocksIndefinitely(item)
                        ? CP_CONVENIO_INDEFINITE_END
                        : item.fecha_fin
                );
                __cpSafeArray(item.premontaje_fechas).forEach(d => addDate(sid, d));
                addConceptMontaje(sid, item.conceptos_adicionales);
            });
        } else if (order.espacio_id) {
            addRange(order.espacio_id, order.fecha_inicio, orderBlocksIndefinitely ? CP_CONVENIO_INDEFINITE_END : order.fecha_fin);
            addConceptMontaje(order.espacio_id, order.conceptos_adicionales);
        }
    });
    return map;
}
async function __cpGetReservations(force = false) {
    const now = Date.now();
    if (!force && __cpReservationsCache && (now - __cpReservationsAt <= __CP_RESERVATION_CACHE_MS)) return __cpReservationsCache;
    let rows = [];
    let query = await window.tenantPocketBase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales,espacios_detalle,detalles_evento').in('status', __CP_RESERVATION_STATUSES);
    if (query.error) {
        const fallback = await window.tenantPocketBase.from('cotizaciones').select('id,status,espacio_id,fecha_inicio,fecha_fin,conceptos_adicionales,detalles_evento').in('status', __CP_RESERVATION_STATUSES);
        if (!fallback.error) rows = fallback.data || [];
    } else {
        rows = query.data || [];
    }
    __cpReservationsCache = __cpBuildReservationsMap(rows);
    __cpReservationsAt = now;
    return __cpReservationsCache;
}
async function __cpEvalAvailability(force = false) {
    const map = await __cpGetReservations(force);
    const bySpace = {};
    __cpQuoteSpaces.forEach(cfg => {
        const sid = String(cfg.spaceId);
        const reserved = map.get(sid) || new Set();
        const needed = [...__cpDatesBetween(cfg.startDate, cfg.endDate), ...__cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean)];
        const conflicts = __cpCfgBlocksIndefinitely(cfg)
            ? Array.from(reserved).filter((date) => date >= String(cfg.startDate || '')).sort()
            : needed.filter(d => reserved.has(d));
        bySpace[sid] = { available: conflicts.length === 0, conflicts };
    });
    return bySpace;
}

window.selectQuoteSpace = function (spaceId) {
    __cpSaveActiveCfgFromForm();
    __cpActiveSpaceId = String(spaceId);
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}
window.addSpaceToQuote = function () {
    const sel = document.getElementById('q-space-add');
    const newId = sel?.value;
    if (!newId || __cpQuoteSpaces.some(x => String(x.spaceId) === String(newId))) return;
    __cpSaveActiveCfgFromForm();
    if (!__cpCanAddSpaceToQuote(newId)) return;
    const active = __cpGetActiveCfg();
    const seed = active ? {
        startDate: active.startDate,
        endDate: active.endDate,
        guests: active.guests,
        customPermanence: !!active.customPermanence,
        customPriceEnabled: !!active.customPriceEnabled,
        customPriceMode: active.customPriceMode || 'total',
        customBasePrice: active.customBasePrice
    } : {};
    __cpQuoteSpaces.push(__cpCreateSpaceCfg(newId, seed));
    __cpActiveSpaceId = String(newId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}
window.removeQuoteSpaceFromQuote = function (spaceId) {
    if (__cpQuoteSpaces.length <= 1) return;
    __cpSaveActiveCfgFromForm();
    __cpQuoteSpaces = __cpQuoteSpaces.filter(x => String(x.spaceId) !== String(spaceId));
    if (String(__cpActiveSpaceId) === String(spaceId) && __cpQuoteSpaces.length) __cpActiveSpaceId = String(__cpQuoteSpaces[0].spaceId);
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    __cpLoadActiveCfgToForm();
    window.updateQuoteCalculation();
    window.checkAvailability();
    __cpRefreshSpaceCards();
}

window.toggleQuotePremontaje = function (skipSync) {
    const enabled = !!document.getElementById('q-chk-premontaje')?.checked;
    const days = document.getElementById('q-premontaje');
    const courtesy = document.getElementById('q-premontaje-cortesia');
    const btn = document.getElementById('q-btn-montaje');
    const box = document.getElementById('q-premontaje-fields');
    if (box) box.classList.toggle('hidden', !enabled);
    if (days) days.disabled = !enabled;
    if (courtesy) courtesy.disabled = !enabled;
    if (courtesy) courtesy.max = String(Math.max(0, parseInt(days?.value, 10) || 0));
    if (!enabled) {
        if (days) days.value = 0;
        if (courtesy) courtesy.value = 0;
        window.finalMontajeDates = [];
        if (btn) btn.classList.add('hidden');
    }
    if (enabled && !skipSync) window.handleMontajeInput('q');
    window.actualizarLabelMontaje('q');
    if (!skipSync) {
        __cpSaveActiveCfgFromForm();
        window.updateQuoteCalculation();
        window.checkAvailability();
    }
}

window.toggleQuoteHoras = function (skipSync) {
    const enabled = !!document.getElementById('q-chk-horas')?.checked;
    const hours = document.getElementById('q-horas');
    const courtesy = document.getElementById('q-horas-cortesia');
    const box = document.getElementById('q-horas-fields');
    if (box) box.classList.toggle('hidden', !enabled);
    if (hours) hours.disabled = !enabled;
    if (courtesy) courtesy.disabled = !enabled;
    if (courtesy) courtesy.max = String(Math.max(0, parseInt(hours?.value, 10) || 0));
    if (!enabled) {
        if (hours) hours.value = 0;
        if (courtesy) courtesy.value = 0;
    }
    if (!skipSync) {
        __cpSaveActiveCfgFromForm();
        window.updateQuoteCalculation();
        window.checkAvailability();
    }
}
window.toggleQuoteCustomPermanence = function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg || !__cpIsPublicidadCfg(cfg)) return;
    cfg.customPermanence = !!document.getElementById('q-custom-permanence')?.checked;
    if (!cfg.customPermanence) {
        __cpNormalizePublicidadDates(cfg);
        const startEl = document.getElementById('date-start');
        const endEl = document.getElementById('date-end');
        if (startEl) startEl.value = cfg.startDate || '';
        if (endEl) endEl.value = cfg.endDate || '';
    }
    __cpSyncQuoteCustomUi(cfg);
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.toggleQuoteCustomPrice = function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg || !__cpIsPublicidadCfg(cfg)) return;
    if (cfg.convenioEnabled) return;
    cfg.customPriceEnabled = !!document.getElementById('q-custom-price-enabled')?.checked;
    if (!cfg.customPriceEnabled) cfg.customBasePrice = '';
    __cpSyncQuoteCustomUi(cfg);
    window.updateQuoteCalculation();
}
window.changeQuoteCustomPriceMode = function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg || !__cpIsPublicidadCfg(cfg)) return;
    cfg.customPriceMode = String(document.getElementById('q-custom-price-mode')?.value || 'total');
    __cpSyncQuoteCustomUi(cfg);
    window.updateQuoteCalculation();
}
window.toggleQuoteConvenio = function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    const activeSpace = __cpGetSpaceById(cfg.spaceId);
    if (!cpSpaceAllowsConvenio(activeSpace) && !cfg.convenioEnabled) {
        const checkbox = document.getElementById('q-convenio-enabled');
        if (checkbox) checkbox.checked = false;
        return window.showToast('Este espacio no tiene permitido usar convenio.', 'error');
    }
    cfg.convenioEnabled = !!document.getElementById('q-convenio-enabled')?.checked;
    if (!cfg.convenioEnabled) {
        cfg.concepts = __cpSafeArray(cfg.concepts).map(normalizeCpQuoteConcept).filter((concept) => !isCpQuoteConvenioConcept(concept));
    } else {
        cfg.customPriceEnabled = false;
        cfg.customBasePrice = '';
        const customPriceInput = document.getElementById('q-custom-price');
        if (customPriceInput) customPriceInput.value = '';
    }
    __cpSyncQuoteCustomUi(cfg);
    __cpRenderSpaceAddSelect();
    __cpRefreshSpaceCards();
    window.updateQuoteCalculation();
};
window.addQuoteConvenioItem = function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg || !cfg.convenioEnabled) return;
    const optionId = String(document.getElementById('q-convenio-select')?.value || '').trim();
    const cantidad = Math.max(1, parseInt(document.getElementById('q-convenio-qty')?.value || 1, 10) || 1);
    const amountRaw = document.getElementById('q-convenio-amount')?.value;
    const amount = Math.max(0, parseFloat(amountRaw || 0) || 0);
    if (!optionId) return window.showToast('Selecciona una opción de convenio.', 'error');
    if (amount <= 0) return window.showToast('Indica el monto manual del trato.', 'error');
    const option = cpConvenioCatalog.find((item) => item.id === optionId);
    if (!option) return window.showToast('La opción de convenio ya no está disponible.', 'error');
    cfg.concepts = __cpSafeArray(cfg.concepts).map(normalizeCpQuoteConcept);
    cfg.concepts.push(buildCpQuoteConvenioConcept(option, cantidad, amount));
    document.getElementById('q-convenio-select').value = '';
    document.getElementById('q-convenio-qty').value = '1';
    document.getElementById('q-convenio-amount').value = '';
    renderCpQuoteConvenioItems();
    window.updateQuoteCalculation();
};
window.removeQuoteConvenioItem = function (index) {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    let convenioIndex = -1;
    cfg.concepts = __cpSafeArray(cfg.concepts).map(normalizeCpQuoteConcept).filter((concept) => {
        if (!isCpQuoteConvenioConcept(concept)) return true;
        convenioIndex += 1;
        return convenioIndex !== index;
    });
    renderCpQuoteConvenioItems();
    window.updateQuoteCalculation();
};

window.handleMontajeInput = function (prefix) {
    const cfg = __cpGetActiveCfg(); if (!cfg) return;
    const premEnabled = !!document.getElementById('q-chk-premontaje')?.checked;
    if (!premEnabled) {
        document.getElementById(prefix + '-premontaje').value = 0;
    }
    const val = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    cfg.premontajeDays = val;
    cfg.premontajeDates = __cpSafeArray(cfg.premontajeDates).slice(0, val);
    const courtesyInput = document.getElementById(prefix + '-premontaje-cortesia');
    const courtesyVal = Math.max(0, parseInt(courtesyInput?.value, 10) || 0);
    if (courtesyInput) courtesyInput.max = String(val);
    cfg.premontajeCourtesyDays = Math.min(courtesyVal, val);
    if (courtesyInput) courtesyInput.value = cfg.premontajeCourtesyDays;
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(prefix);
    window.updateQuoteCalculation();
    window.checkAvailability();
}
window.actualizarLabelMontaje = function (prefix) {
    const cfg = __cpGetActiveCfg();
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    const dates = __cpSafeArray(cfg?.premontajeDates || []);
    if (dates.length > 0) { lbl.innerText = dates.map(d => window.safeFormatDate(d)).join(', '); lbl.classList.remove('hidden'); }
    else lbl.classList.add('hidden');
}
function __cpIsMontajeUnavailable(ds, cfg, space, guests) {
    const state = __CP_MONTAJE_PICKER_STATE;
    const isPast = __cpDateIsPast(ds);
    const overLimit = !!state.maxDate && ds > state.maxDate;
    const isReserved = state.reserved?.has(ds);
    const isBlocked = !isPast && !isReserved && !!space && __cpIsPremontajeBlockedDate(space, ds);
    return { isPast, overLimit, isReserved, isBlocked, disabled: isPast || overLimit || isReserved || isBlocked };
}

// Renderiza calendario de premontaje con costos ya ajustados al porcentaje configurado.
async function __cpRenderMontajeDatePicker() {
    const grid = document.getElementById('montaje-fc') || document.getElementById('montaje-date-grid');
    if (!grid) return;
    const cfg = __cpGetActiveCfg();
    const space = __cpGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    const state = __CP_MONTAJE_PICKER_STATE;

    const label = document.getElementById('montaje-month-label');
    const startLbl = document.getElementById('montaje-picked-start');
    const endLbl = document.getElementById('montaje-picked-end');
    if (label) label.textContent = '';
    if (startLbl) startLbl.textContent = state.start ? window.safeFormatDate(state.start) : '--';
    if (endLbl) endLbl.textContent = state.end ? window.safeFormatDate(state.end) : '--';

    const sid = String(cfg?.spaceId || '');
    const events = [];
    const dates = Array.from(state.reserved || new Set()).sort();
    if (dates.length) {
        let chunkStart = dates[0];
        let prev = dates[0];
        const pushChunk = (startDs, endDs) => {
            events.push({
                id: `res-mtg-${sid}-${startDs}`,
                title: 'Reservado',
                start: startDs,
                end: __cpAddDays(endDs, 1),
                allDay: true,
                backgroundColor: '#1f2937',
                borderColor: '#1f2937',
                textColor: '#ffffff'
            });
        };
        for (let i = 1; i < dates.length; i++) {
            const expected = __cpAddDays(prev, 1);
            if (dates[i] !== expected) {
                pushChunk(chunkStart, prev);
                chunkStart = dates[i];
            }
            prev = dates[i];
        }
        pushChunk(chunkStart, prev);
    }
    if (state.start) {
        events.push({
            id: '__selection_mtg_quote',
            start: state.start,
            end: __cpAddDays(state.end || state.start, 1),
            display: 'background',
            backgroundColor: 'rgba(16, 185, 129, 0.22)',
            borderColor: 'transparent',
            allDay: true
        });
    }

    if (__cpMontajePickerCal) {
        __cpMontajePickerCal.destroy();
        __cpMontajePickerCal = null;
    }
    __cpMontajePickerCal = new FullCalendar.Calendar(grid, {
        initialView: 'dayGridMonth',
        locale: 'es',
        initialDate: state.start || __cpTodayISO(),
        height: '100%',
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        events,
        dateClick: (info) => { window.pickMontajeDate(info.dateStr); },
        dayCellDidMount: (arg) => {
            const ds = __cpToYMD(arg.date);
            const flags = __cpIsMontajeUnavailable(ds, cfg, space, guests);
            if (flags.disabled) {
                arg.el.classList.add('opacity-60');
                arg.el.style.backgroundColor = flags.isReserved ? '#fef2f2' : '#f3f4f6';
            }
            if (!flags.disabled && space && guests > 0) {
                const base = __cpDayPrice(space, ds, guests, { ignoreBlocks: true });
                const prem = base * (getPremontajePct() / 100);
                if (prem > 0) {
                    const frame = arg.el.querySelector('.fc-daygrid-day-frame');
                    if (frame) {
                        const priceEl = document.createElement('div');
                        priceEl.className = 'text-[10px] font-bold text-brand-red text-right px-1 mt-4';
                        priceEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(prem);
                        frame.appendChild(priceEl);
                    }
                }
            }
            if (flags.isReserved || flags.isBlocked || flags.overLimit) {
                const frame = arg.el.querySelector('.fc-daygrid-day-frame');
                if (frame) {
                    const ban = document.createElement('i');
                    ban.className = 'fa-solid fa-ban text-gray-300 text-base absolute inset-0 m-auto h-4 w-4 pointer-events-none';
                    frame.style.position = 'relative';
                    frame.appendChild(ban);
                }
            }
        }
    });
    __cpMontajePickerCal.render();

    const list = document.getElementById('montaje-date-reserved-list');
    if (list) {
        const rows = Array.from(state.reserved || new Set())
            .filter(d => d >= __cpTodayISO() && (!state.maxDate || d <= state.maxDate))
            .sort()
            .slice(0, 45);
        list.innerHTML = rows.length
            ? rows.map(d => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join('')
            : '<p class="text-[10px] text-gray-400 italic">Sin reservas confirmadas visibles.</p>';
    }
}

window.abrirModalMontaje = async function (prefix) {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    window.currentMontajePrefix = prefix;
    const requiredDays = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    if (requiredDays <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");
    if (!cfg.startDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    const maxD = new Date(`${cfg.startDate}T00:00:00`);
    maxD.setDate(maxD.getDate() - 1);
    const maxDate = maxD.toISOString().split('T')[0];
    if (maxDate < __cpTodayISO()) return window.showToast("Ya no hay días válidos de premontaje antes del evento.", "error");

    const state = __CP_MONTAJE_PICKER_STATE;
    state.maxDate = maxDate;
    const reservations = await __cpGetReservations(true);
    state.reserved = reservations.get(String(cfg.spaceId)) || new Set();
    const selected = __cpSafeArray(cfg.premontajeDates).map(__cpNormalizeDate).filter(Boolean).sort().slice(0, requiredDays);
    state.start = selected[0] || '';
    state.end = selected.length ? selected[selected.length - 1] : '';
    const baseDate = state.start || maxDate;
    const base = new Date(`${baseDate}T00:00:00`);
    state.year = base.getFullYear();
    state.month = base.getMonth();

    window.tempMontajeDates = selected.slice();
    const limitEl = document.getElementById('montaje-limit-num');
    if (limitEl) limitEl.textContent = String(requiredDays);
    document.getElementById('montaje-modal').classList.remove('hidden');
    await __cpRenderMontajeDatePicker();
    __cpRefreshCalendarLayout(__cpMontajePickerCal);
}

window.shiftMontajePickerMonth = async function (delta) {
    if (!__cpMontajePickerCal) return;
    if ((delta || 0) < 0) __cpMontajePickerCal.prev();
    else __cpMontajePickerCal.next();
}

window.pickMontajeDate = async function (ds) {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    const space = __cpGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const flags = __cpIsMontajeUnavailable(ds, cfg, space, guests);
    if (flags.disabled) return;
    const state = __CP_MONTAJE_PICKER_STATE;
    if (!state.start || state.end) {
        state.start = ds;
        state.end = '';
    } else if (ds < state.start) {
        state.start = ds;
    } else {
        const range = __cpDatesBetween(state.start, ds);
        const bad = range.find(dateStr => __cpIsMontajeUnavailable(dateStr, cfg, space, guests).disabled);
        if (bad) return window.showToast(`El rango incluye una fecha no disponible: ${window.safeFormatDate(bad)}.`, "error");
        state.end = ds;
    }
    await __cpRenderMontajeDatePicker();
}

window.applyMontajeDatePickerSelection = async function () {
    const cfg = __cpGetActiveCfg();
    if (!cfg) return;
    const state = __CP_MONTAJE_PICKER_STATE;
    if (!state.start) return window.showToast("Selecciona al menos una fecha.", "error");
    const requiredDays = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value, 10) || 0;
    const range = __cpDatesBetween(state.start, state.end || state.start);
    if (requiredDays > 0 && range.length !== requiredDays) return window.showToast(`Debes seleccionar exactamente ${requiredDays} día(s).`, "error");
    const space = __cpGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const bad = range.find(ds => __cpIsMontajeUnavailable(ds, cfg, space, guests).disabled);
    if (bad) return window.showToast(`La fecha ${window.safeFormatDate(bad)} no está disponible.`, "error");

    cfg.premontajeDates = range.slice();
    window.tempMontajeDates = range.slice();
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    document.getElementById('montaje-modal').classList.add('hidden');
    window.updateQuoteCalculation();
    await window.checkAvailability();
}

const __oldLoadCatalog = loadCatalog;
loadCatalog = async function () {
    await __oldLoadCatalog();
    if (IS_QUOTE_PAGE) __cpRenderSpaceAddSelect();
};

function __cpResetQuoteWorkspaceForm() {
    adminSelectedConcepts = [];
    window.updateAdminConceptsSummary();
    document.getElementById('q-price').innerText = '$0.00';
    const quoteName = document.getElementById('q-quote-name');
    if (quoteName) quoteName.value = '';
    const customPerm = document.getElementById('q-custom-permanence');
    const customPriceChk = document.getElementById('q-custom-price-enabled');
    const customPrice = document.getElementById('q-custom-price');
    const customPriceMode = document.getElementById('q-custom-price-mode');
    if (customPerm) customPerm.checked = false;
    if (customPriceChk) customPriceChk.checked = false;
    if (customPrice) customPrice.value = '';
    if (customPriceMode) customPriceMode.value = 'total';
    document.getElementById('cli-name').value = '';
    document.getElementById('cli-rfc').value = '';
    document.getElementById('cli-phone').value = '';
    document.getElementById('cli-email').value = '';
    const cliSel = document.getElementById('cli-select'); if (cliSel) cliSel.value = '';
    const cliId = document.getElementById('cli-id'); if (cliId) cliId.value = '';
    const quickQuote = document.getElementById('cli-quick-quote'); if (quickQuote) quickQuote.checked = false;
    loadClientProfilesForQuoteModal();
    document.getElementById('avail-msg').classList.add('hidden');
    document.getElementById('btn-generate').disabled = true;
}

function __cpSyncQuoteWorkspaceUI() {
    __cpRenderSpaceAddSelect();
    __cpRenderSpaceTabs();
    if (__cpQuoteSpaces.length) {
        __cpLoadActiveCfgToForm();
        __cpSetQuoteWorkspaceVisible(true);
        window.updateQuoteCalculation();
        window.checkAvailability();
    } else {
        currentSpace = null;
        __cpSetQuoteWorkspaceVisible(false);
        document.getElementById('q-price').innerText = '$0.00';
        const msg = document.getElementById('avail-msg');
        if (msg) msg.classList.add('hidden');
        const btn = document.getElementById('btn-generate');
        if (btn) btn.disabled = true;
    }
    __cpRefreshSpaceCards();
}

window.toggleQuoteSpaceCard = function (spaceId) {
    if (!IS_QUOTE_PAGE) {
        __cpNavigateSafely(`cotizacion.html?space=${encodeURIComponent(spaceId)}`);
        return;
    }
    const sid = String(spaceId);
    const space = __cpGetSpaceById(sid);
    if (!space) return;
    __cpSaveActiveCfgFromForm();

    const selConcept = document.getElementById('admin-concept-select');
    if (selConcept) {
        selConcept.innerHTML = '<option value="">Selecciona servicio...</option>';
        catalogConcepts.forEach(c => { selConcept.innerHTML += `<option value="${c.id}">${c.nombre} (+$${c.precio_sugerido})</option>`; });
    }

    const exists = __cpQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (!__cpQuoteSpaces.length) {
        __cpQuoteSpaces = [__cpCreateSpaceCfg(sid)];
        __cpActiveSpaceId = sid;
        currentSpace = space;
        __cpResetQuoteWorkspaceForm();
        __cpSyncQuoteWorkspaceUI();
        return;
    }
    if (!exists) {
        if (!__cpCanAddSpaceToQuote(sid)) return;
        const active = __cpGetActiveCfg();
        const seed = active ? {
            startDate: active.startDate,
            endDate: active.endDate,
            guests: active.guests,
            customPermanence: !!active.customPermanence,
            customPriceEnabled: !!active.customPriceEnabled,
            customPriceMode: active.customPriceMode || 'total',
            customBasePrice: active.customBasePrice
        } : {};
        __cpQuoteSpaces.push(__cpCreateSpaceCfg(sid, seed));
    }
    __cpActiveSpaceId = sid;
    currentSpace = space;
    __cpSyncQuoteWorkspaceUI();
}

window.powerOffQuoteSpace = function (spaceId) {
    if (!IS_QUOTE_PAGE) return;
    const sid = String(spaceId);
    const exists = __cpQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (!exists) return;
    __cpSaveActiveCfgFromForm();
    __cpQuoteSpaces = __cpQuoteSpaces.filter(x => String(x.spaceId) !== sid);
    if (!__cpQuoteSpaces.length) {
        __cpActiveSpaceId = null;
        window.finalMontajeDates = [];
        __cpSyncQuoteWorkspaceUI();
        return;
    }
    if (String(__cpActiveSpaceId) === sid) __cpActiveSpaceId = String(__cpQuoteSpaces[0].spaceId);
    __cpSyncQuoteWorkspaceUI();
}

window.openQuoteModal = function (id) {
    window.toggleQuoteSpaceCard(id);
};

window.updateQuoteCalculation = function () {
    __cpSaveActiveCfgFromForm();
    const spacesPricing = [];
    let subtotal = 0, taxesTotal = 0;
    __cpQuoteSpaces.forEach(cfg => {
        const space = __cpGetSpaceById(cfg.spaceId);
        if (!space) return;
        const isPublicidad = __cpIsPublicidadCfg(space);
        cfg.concepts = __cpSafeArray(cfg.concepts).map(normalizeCpQuoteConcept);
        const isConvenio = isPublicidad && !!cfg.convenioEnabled;
        const convenioItems = isConvenio ? getCpQuoteConvenioItems(cfg) : [];
        const convenioValue = convenioItems.reduce((sum, concept) => sum + (__cpToFiniteNumber(concept.amount ?? concept.value, 0) || 0), 0);
        const safeConvenioValue = Math.max(0, __cpToFiniteNumber(convenioValue, 0));
        const convenioCovered = isConvenio ? __cpConvenioCovered(parseFloat(space?.precio_base || 0) || 0, safeConvenioValue) : false;
        const blocksIndefinitely = convenioCovered && !__cpHasFiniteConvenioEndDate(cfg?.endDate);
        const guests = parseInt(cfg.guests, 10) || 1;
        const maxCapacity = isPublicidad ? 999999 : getSpaceMaxCapacity(space);
        const capacityOk = isPublicidad ? true : !(maxCapacity < 999999 && guests > maxCapacity);
        const publicidadPricing = isPublicidad
            ? __cpBuildPublicidadPrice(space, { ...cfg, customPriceEnabled: isConvenio ? false : cfg.customPriceEnabled })
            : null;
        const base = isPublicidad
            ? (isConvenio ? (parseFloat(space.precio_base || 0) || 0) : (publicidadPricing?.subtotal || 0))
            : ((cfg.startDate && cfg.endDate) ? calculateDayByDayTotal(space, cfg.startDate, cfg.endDate, guests).total : 0);
        const horaUnit = isPublicidad ? 0 : (parseFloat(cfg.horasExtraUnit ?? __cpResolveHoraExtraUnit(space) ?? 0) || 0);
        cfg.horasExtraUnit = horaUnit;
        const horarioCost = isPublicidad ? 0 : parseFloat(cfg.horarioPrice || 0);
        cfg.premontajeCourtesyDays = Math.min(parseInt(cfg.premontajeDays, 10) || 0, parseInt(cfg.premontajeCourtesyDays, 10) || 0);
        const prem = isPublicidad ? { total: 0, breakdown: [] } : __cpCalcPremCost(space, cfg);
        const extraHours = isPublicidad ? 0 : (parseInt(cfg.horasExtra, 10) || 0);
        const courtesyHours = isPublicidad ? 0 : Math.min(extraHours, Math.max(0, parseInt(cfg.horasExtraCourtesy, 10) || 0));
        cfg.horasExtraCourtesy = courtesyHours;
        const billableHours = Math.max(0, extraHours - courtesyHours);
        const horasCost = billableHours * horaUnit;
        const blockedOk = isPublicidad ? true : !__cpCfgHasBlockedDates(cfg);
        let subSpace = 0;
        if (capacityOk && blockedOk) {
            if (isPublicidad) {
                subSpace = isConvenio ? Math.max(0, base - convenioValue) : (publicidadPricing?.subtotal || 0);
            } else {
                subSpace = base + horarioCost + prem.total + horasCost;
                const adjustmentType = normalizeCpQuoteAdjustmentType(space.ajuste_tipo);
                if (adjustmentType === 'aumento') subSpace += subSpace * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
                if (adjustmentType === 'descuento') subSpace -= subSpace * (normalizeCpQuoteAdjustmentPercent(adjustmentType, space.ajuste_porcentaje) / 100);
            }
        }
        let spaceTaxTotal = isPublicidad ? (isConvenio ? 0 : (publicidadPricing?.taxes || 0)) : 0;
        const taxIds = isPublicidad ? (isConvenio ? [] : (publicidadPricing?.taxIds || [])) : parseIds(space.impuestos_ids || space.impuestos);
        if (!isPublicidad) {
            taxIds.forEach(tid => { const t = findCpQuoteTaxRecord(tid, space); if (t) { const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0); spaceTaxTotal += subSpace * rate; } });
        }
        const safeBase = Math.max(0, __cpToFiniteNumber(base, 0));
        const safeSubSpace = Math.max(0, __cpToFiniteNumber(subSpace, 0));
        const safeSpaceTaxTotal = Math.max(0, __cpToFiniteNumber(spaceTaxTotal, 0));
        subtotal += safeSubSpace; taxesTotal += safeSpaceTaxTotal;
        spacesPricing.push({
            spaceId: space.id,
            spaceName: space.nombre,
            spaceKey: space.clave,
            spaceType: space.tipo || '',
            isPublicidad,
            startDate: cfg.startDate,
            endDate: cfg.endDate,
            guests,
            maxCapacity,
            capacityOk,
            blockedOk,
            horarioValue: cfg.horarioValue,
            horarioText: cfg.horarioText || cfg.horarioValue || '',
            horarioCost,
            premontajeDays: parseInt(cfg.premontajeDays, 10) || 0,
            premontajeCourtesyDays: parseInt(cfg.premontajeCourtesyDays, 10) || 0,
            premontajeDates: __cpSafeArray(cfg.premontajeDates),
            premontajeCost: prem.total,
            premontajeBreakdown: prem.breakdown,
            horasExtra: extraHours,
            horasExtraCourtesy: courtesyHours,
            horasExtraBillable: billableHours,
            horasExtraUnit: horaUnit,
            horasExtraCost: horasCost,
            convenioEnabled: isConvenio,
            convenioCovered,
            blocksIndefinitely,
            concepts: isConvenio ? convenioItems : [],
            baseValue: safeBase,
            convenioValue: safeConvenioValue,
            subtotalBeforeTax: safeSubSpace,
            taxIds,
            taxTotal: safeSpaceTaxTotal,
            total: safeSubSpace + safeSpaceTaxTotal,
            customPermanence: !!cfg.customPermanence,
            customPriceEnabled: !!cfg.customPriceEnabled && !isConvenio,
            customPriceMode: cfg.customPriceMode || 'total',
            customBasePrice: cfg.customBasePrice
        });
    });
    let adminConceptTotal = 0; adminSelectedConcepts.forEach(c => { adminConceptTotal += (__cpToFiniteNumber(c.amount ?? c.value, 0) || 0); });
    subtotal += adminConceptTotal;
    if (adminConceptTotal > 0 && spacesPricing.length > 0) {
        const firstTaxes = (spacesPricing.find((space) => !space?.convenioEnabled)?.taxIds || []);
        firstTaxes.forEach(tid => {
            const t = findCpQuoteTaxRecord(tid, { tenant: resolveCpQuoteTenantSlug() });
            if (!t) return;
            const rate = parseFloat(t.porcentaje || 0) > 1 ? (parseFloat(t.porcentaje) / 100) : parseFloat(t.porcentaje || 0);
            taxesTotal += adminConceptTotal * rate;
        });
    }
    const safeSubtotal = Math.max(0, __cpToFiniteNumber(subtotal, 0));
    const safeTaxes = Math.max(0, __cpToFiniteNumber(taxesTotal, 0));
    currentPricing = {
        subtotal: safeSubtotal,
        taxes: safeTaxes,
        final: safeSubtotal + safeTaxes,
        spaces: spacesPricing,
        adminConceptTotal,
        convenioBaseTotal: spacesPricing.reduce((sum, space) => sum + (space?.convenioEnabled ? (parseFloat(space.baseValue || 0) || 0) : 0), 0),
        convenioDeliveredTotal: spacesPricing.reduce((sum, space) => sum + (space?.convenioEnabled ? (parseFloat(space.convenioValue || 0) || 0) : 0), 0)
    };
    document.getElementById('q-price').innerText = formatMoney(currentPricing.final);
}

window.checkAvailability = async function () {
    __cpSaveActiveCfgFromForm();
    const msg = document.getElementById('avail-msg');
    const btn = document.getElementById('btn-generate');
    const activeCfg = __cpGetActiveCfg();
    if (!activeCfg) { btn.disabled = true; msg.classList.add('hidden'); return; }
    const today = __cpTodayISO();
    const allRequired = __cpQuoteSpaces.every(cfg => { if (!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    const invalidPast = __cpQuoteSpaces.find(cfg => {
        if (!cfg.startDate || !cfg.endDate) return false;
        return cfg.startDate < today || cfg.endDate < today;
    });
    const invalidCapacity = __cpQuoteSpaces.find(cfg => {
        const sp = __cpGetSpaceById(cfg.spaceId);
        if (!sp) return true;
        if (__cpIsPublicidadCfg(sp)) return false;
        const maxCap = getSpaceMaxCapacity(sp);
        const guests = parseInt(cfg.guests, 10) || 0;
        return (maxCap < 999999 && guests > maxCap);
    });
    const invalidBlocked = __cpQuoteSpaces.find(cfg => {
        const sp = __cpGetSpaceById(cfg.spaceId);
        if (__cpIsPublicidadCfg(sp)) return false;
        return __cpCfgHasBlockedDates(cfg);
    });
    const availability = await __cpEvalAvailability();
    const conflictCfg = __cpQuoteSpaces.find(cfg => availability[String(cfg.spaceId)]?.available === false);
    const allAvailable = !conflictCfg;
    msg.classList.remove('hidden');
    msg.className = 'mb-6 p-2 rounded-lg text-center text-xs font-bold border';
    if (invalidPast) {
        const sp = __cpGetSpaceById(invalidPast.spaceId);
        msg.innerText = `No se permiten fechas pasadas. Revisa ${sp?.nombre || invalidPast.spaceId}.`;
        msg.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
    } else if (invalidCapacity) {
        const sp = __cpGetSpaceById(invalidCapacity.spaceId);
        msg.innerText = `Aforo excedido en ${sp?.nombre || invalidCapacity.spaceId}.`;
        msg.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
    } else if (invalidBlocked) {
        const sp = __cpGetSpaceById(invalidBlocked.spaceId);
        msg.innerText = `Hay días bloqueados en ${sp?.nombre || invalidBlocked.spaceId}.`;
        msg.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
    } else if (conflictCfg) {
        const sp = __cpGetSpaceById(conflictCfg.spaceId);
        const sid = String(conflictCfg.spaceId);
        const conflicts = availability[sid]?.conflicts || [];
        const firstConflict = conflicts[0] ? window.safeFormatDate(conflicts[0]) : 'fecha seleccionada';
        msg.innerText = `${sp?.nombre || sid} está ocupado (${firstConflict}).`;
        msg.classList.add('text-red-600', 'bg-red-50', 'border-red-200');
    } else if (allRequired && allAvailable) {
        msg.innerText = __cpQuoteSpaces.length > 1 ? 'Disponible en todos los espacios seleccionados.' : 'Disponible';
        msg.classList.add('text-emerald-700', 'bg-emerald-50', 'border-emerald-200');
    } else {
        msg.innerText = 'Completa fechas y premontajes para continuar.';
        msg.classList.add('text-amber-700', 'bg-amber-50', 'border-amber-200');
    }
    btn.disabled = !(allRequired && allAvailable && !invalidPast && !invalidCapacity && !invalidBlocked);
}

window.generatePDF = async function () {
    __cpSaveActiveCfgFromForm();
    window.updateQuoteCalculation();
    await window.checkAvailability();
    const today = __cpTodayISO();
    const allRequired = __cpQuoteSpaces.every(cfg => { if (!cfg.startDate || !cfg.endDate) return false; const pm = parseInt(cfg.premontajeDays, 10) || 0; return pm === 0 || (__cpSafeArray(cfg.premontajeDates).length === pm); });
    if (!allRequired) return window.showToast("Completa fechas y premontajes de todos los espacios.", "error");
    const invalidPastCfg = __cpQuoteSpaces.find(cfg => cfg.startDate < today || cfg.endDate < today);
    if (invalidPastCfg) {
        const sp = __cpGetSpaceById(invalidPastCfg.spaceId);
        return window.showToast(`No se permiten fechas pasadas en ${sp?.nombre || invalidPastCfg.spaceId}.`, "error");
    }
    const availability = await __cpEvalAvailability(true);
    const allAvailable = __cpQuoteSpaces.every(cfg => availability[String(cfg.spaceId)]?.available !== false);
    if (!allAvailable) {
        const conflictCfg = __cpQuoteSpaces.find(cfg => availability[String(cfg.spaceId)]?.available === false);
        const sp = __cpGetSpaceById(conflictCfg?.spaceId);
        const firstConflict = availability[String(conflictCfg?.spaceId)]?.conflicts?.[0];
        return window.showToast(`${sp?.nombre || conflictCfg?.spaceId} está ocupado ${firstConflict ? '(' + window.safeFormatDate(firstConflict) + ')' : ''}.`, "error");
    }
    const spaces = currentPricing.spaces || [];
    const invalidCapacity = spaces.find(sp => !sp.isPublicidad && sp.capacityOk === false);
    if (invalidCapacity) return window.showToast(`El aforo para ${invalidCapacity.spaceName} excede su capacidad máxima.`, "error");
    const invalidBlocked = spaces.find(sp => !sp.isPublicidad && sp.blockedOk === false);
    if (invalidBlocked) return window.showToast(`La selección para ${invalidBlocked.spaceName} incluye días bloqueados.`, "error");
    const missingConvenio = spaces.find((sp) => !!sp.convenioEnabled && !(Array.isArray(sp.concepts) && sp.concepts.some(isCpQuoteConvenioConcept)));
    if (missingConvenio) return window.showToast(`Agrega al menos un trato de convenio para ${missingConvenio.spaceName}.`, 'error');
    const uncoveredConvenio = spaces.find((sp) => !!sp.convenioEnabled && !__cpConvenioCovered(sp.baseValue, sp.convenioValue, sp.total));
    if (uncoveredConvenio) return window.showToast(`El convenio de ${uncoveredConvenio.spaceName} debe cubrir al menos el valor total del espacio.`, 'error');
    if (!isQuickQuoteModeEnabled() && !getSelectedQuoteClientProfile()) {
        return window.showToast('Selecciona un perfil completo o activa cotización rápida.', 'error');
    }
    const cli = buildQuoteClientSnapshot();
    if (!cli.name) return window.showToast("Falta nombre del cliente", "error");
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cli.phone)) return window.showToast("El teléfono debe tener 10 dígitos numéricos.", "error");
    let quoteClientId = '';
    try {
        quoteClientId = await resolveQuoteClientId(cli);
    } catch (error) {
        return window.showToast(error?.message || 'No se pudo preparar el perfil del cliente.', 'error');
    }
    if (!spaces.length) return window.showToast("No hay espacios configurados.", "error");
    const quoteNameInput = document.getElementById('q-quote-name');
    const quoteNameRaw = (quoteNameInput?.value || '').trim();
    const quoteName = quoteNameRaw || `${cli.name} - ${spaces.map(s => s.spaceName).join(' + ')}`;

    const conceptosB2B = [];
    const espaciosDetalle = spaces.map(sp => {
        const spaceRecord = __cpGetSpaceById(sp.spaceId) || {};
        const convenioItems = buildCpQuoteConvenioPayloadItems({ concepts: sp.concepts });
        if (!sp.isPublicidad && sp.horarioText) {
            conceptosB2B.push({ description: `[${sp.spaceName}] - Horario (${sp.horarioText})`, amount: sp.horarioCost, value: sp.horarioCost, unit: 'fixed', type: 'b2b_horario', meta: { space_id: sp.spaceId, selected: sp.horarioValue, custom_name: sp.horarioText } });
        }
        if (!sp.isPublicidad && sp.premontajeDays > 0) {
            const courtesy = parseInt(sp.premontajeCourtesyDays, 10) || 0;
            const requestedDays = parseInt(sp.premontajeDays, 10) || 0;
            const courtesyPart = courtesy > 0 ? `, cortesia: ${courtesy}` : '';
            conceptosB2B.push({ description: `[${sp.spaceName}] - Premontaje (dias: ${requestedDays}${courtesyPart})`, amount: sp.premontajeCost, value: sp.premontajeCost, unit: 'fixed', type: 'b2b_montaje', meta: { space_id: sp.spaceId, days: sp.premontajeDays, courtesy_days: courtesy, dates: sp.premontajeDates, percentage: getPremontajePct(), per_day_base: sp.premontajeBreakdown } });
        }
        if (!sp.isPublicidad && sp.horasExtra > 0) {
            const rawHours = parseInt(sp.horasExtra, 10) || 0;
            const courtesyHours = parseInt(sp.horasExtraCourtesy, 10) || 0;
            const courtesyHoursPart = courtesyHours > 0 ? `, cortesia: ${courtesyHours}` : '';
            conceptosB2B.push({ description: `[${sp.spaceName}] - Horas extra (hrs: ${rawHours}${courtesyHoursPart})`, amount: sp.horasExtraCost, value: sp.horasExtraCost, unit: 'fixed', type: 'b2b_horas', meta: { space_id: sp.spaceId, hours: sp.horasExtraBillable, raw_hours: sp.horasExtra, courtesy_hours: sp.horasExtraCourtesy, unit_price: sp.horasExtraUnit } });
        }
        convenioItems.forEach((item) => {
            conceptosB2B.push(normalizeCpQuoteConcept({
                description: `[${sp.spaceName}] - ${item.nombre || 'Convenio'} (${item.cantidad_entrega || 1} ${(item.cantidad_entrega || 1) === 1 ? 'entrega' : 'entregas'})`,
                amount: item.monto,
                value: item.monto,
                unit: 'fixed',
                type: 'aumento',
                meta: {
                    convenio_item: true,
                    convenio_option_id: item.id,
                    convenio_nombre: item.nombre,
                    cantidad_entrega: item.cantidad_entrega,
                    space_id: sp.spaceId
                }
            }));
        });
        const measureWidth = spaceRecord.medida_ancho ?? spaceRecord.ancho ?? null;
        const measureHeight = spaceRecord.medida_alto ?? spaceRecord.alto ?? null;
        const measureUnit = spaceRecord.medida_unidad || spaceRecord.unidad_medida || 'M';
        const digitalMedia = getCpSpaceDigitalMediaConfig(spaceRecord);
        return {
            espacio_id: sp.spaceId,
            espacio_nombre: sp.spaceName,
            espacio_clave: sp.spaceKey,
            espacio_tipo: sp.spaceType || spaceRecord.tipo || null,
            tipo: sp.spaceType || spaceRecord.tipo || null,
            fecha_inicio: sp.startDate,
            fecha_fin: sp.endDate,
            personas: sp.isPublicidad ? 1 : sp.guests,
            horario: { value: sp.horarioValue, label: sp.horarioText, amount: sp.horarioCost },
            fechas_evento: __cpDatesBetween(sp.startDate, sp.endDate),
            premontaje_dias: sp.isPublicidad ? 0 : sp.premontajeDays,
            premontaje_cortesia_dias: sp.isPublicidad ? 0 : (sp.premontajeCourtesyDays || 0),
            premontaje_fechas: sp.isPublicidad ? [] : sp.premontajeDates,
            premontaje_total: sp.isPublicidad ? 0 : sp.premontajeCost,
            premontaje_detalle: sp.isPublicidad ? [] : sp.premontajeBreakdown,
            horas_extra: sp.isPublicidad ? 0 : sp.horasExtra,
            horas_extra_cortesia: sp.isPublicidad ? 0 : (sp.horasExtraCourtesy || 0),
            horas_extra_facturables: sp.isPublicidad ? 0 : (sp.horasExtraBillable || 0),
            horas_extra_unitario: sp.isPublicidad ? 0 : sp.horasExtraUnit,
            horas_extra_total: sp.isPublicidad ? 0 : sp.horasExtraCost,
            subtotal_espacio: sp.convenioEnabled ? (sp.baseValue ?? sp.subtotalBeforeTax) : sp.subtotalBeforeTax,
            convenio_monto_entregado: sp.convenioEnabled ? (sp.convenioValue || 0) : 0,
            convenio_balance: sp.convenioEnabled ? (sp.total || sp.subtotalBeforeTax) : sp.subtotalBeforeTax,
            impuestos_ids: sp.convenioEnabled ? [] : sp.taxIds,
            impuestos_total: sp.convenioEnabled ? 0 : sp.taxTotal,
            total_espacio: sp.total || (sp.subtotalBeforeTax + sp.taxTotal),
            convenio_activo: !!sp.convenioEnabled,
            convenio_indefinido: !!sp.blocksIndefinitely,
            convenio_items: convenioItems,
            permanencia_personalizada: sp.isPublicidad ? !!sp.customPermanence : false,
            precio_personalizado: (sp.isPublicidad && !sp.convenioEnabled && sp.customPriceEnabled && sp.customBasePrice !== '' && sp.customBasePrice !== null && sp.customBasePrice !== undefined)
                ? (parseFloat(sp.customBasePrice) || 0)
                : null,
            precio_personalizado_activo: sp.isPublicidad ? (!!sp.customPriceEnabled && !sp.convenioEnabled) : false,
            precio_personalizado_modo: sp.isPublicidad ? (sp.customPriceMode || 'total') : null,
            material: spaceRecord.material || null,
            digital_media: digitalMedia,
            tipo_medio: digitalMedia.enabled ? digitalMedia.media_type : null,
            medida_ancho: measureWidth,
            medida_alto: measureHeight,
            medida_unidad: measureUnit,
            ancho: measureWidth,
            alto: measureHeight,
            unidad_medida: measureUnit
        };
    });
    adminSelectedConcepts.forEach(c => conceptosB2B.push(c));

    const first = spaces[0];
    const startDates = spaces.map(s => s.startDate).filter(Boolean).sort();
    const endDates = spaces.map(s => s.endDate).filter(Boolean).sort();
    const minStart = startDates[0] || '';
    const maxEnd = endDates[endDates.length - 1] || '';
    const maxGuests = Math.max(...spaces.map(s => parseInt(s.guests, 10) || 0), 0);
    const taxIdsUnion = Array.from(new Set(spaces.filter((sp) => !sp.convenioEnabled).flatMap(s => s.taxIds || []).map(x => String(x))));
    const convenioSpaces = spaces
        .filter((sp) => !!sp.convenioEnabled)
        .map((sp) => ({
            espacio_id: sp.spaceId,
            espacio_nombre: sp.spaceName,
            espacio_clave: sp.spaceKey,
            cantidad_tratos: buildCpQuoteConvenioPayloadItems({ concepts: sp.concepts }).length,
            items: buildCpQuoteConvenioPayloadItems({ concepts: sp.concepts })
        }));
    const convenioItems = convenioSpaces.flatMap((space) => (space.items || []).map((item) => ({
        ...item,
        espacio_id: space.espacio_id,
        espacio_nombre: space.espacio_nombre,
        espacio_clave: space.espacio_clave
    })));
    const convenioBlocksIndefinitely = spaces.some((sp) => !!sp.blocksIndefinitely);
    const auditMulti = await __cpResolveQuoteActorAudit();
    const payload = {
        cliente_id: quoteClientId || null,
        nombre_cotizacion: quoteName,
        espacio_id: first.spaceId,
        espacio_nombre: spaces.length === 1 ? first.spaceName : `${first.spaceName} + ${spaces.length - 1} espacio(s)`,
        espacio_clave: spaces.length === 1 ? first.spaceKey : 'MULTI',
        cliente_nombre: cli.name,
        cliente_rfc: cli.rfc,
        cliente_contacto: cli.phone,
        cliente_email: cli.email,
        fecha_inicio: minStart,
        fecha_fin: maxEnd,
        precio_final: currentPricing.final,
        desglose_precios: {
            subtotal_antes_impuestos: currentPricing.subtotal,
            impuestos_detalle: taxIdsUnion,
            tax_total: currentPricing.taxes,
            convenio_base_total: convenioItems.length ? spaces.reduce((sum, sp) => sum + (parseFloat(sp.baseValue ?? sp.subtotalBeforeTax ?? 0) || 0), 0) : 0,
            convenio_entregable_total: convenioItems.length ? spaces.reduce((sum, sp) => sum + (parseFloat(sp.convenioValue || 0) || 0), 0) : 0,
            convenio_balance_total: convenioItems.length ? currentPricing.final : 0,
            espacios: espaciosDetalle
        },
        detalles_evento: {
            multi_espacio: spaces.length > 1,
            total_espacios: spaces.length,
            nombre_cotizacion: quoteName,
            convenio: convenioItems.length ? {
                activo: true,
                bloqueo_indefinido: convenioBlocksIndefinitely,
                requiere_evidencia: true,
                evidencia_minima: 3,
                evidencia_maxima: 5,
                requiere_factura: false,
                requiere_recibo: false,
                requiere_contrato: false,
                espacios: convenioSpaces,
                items: convenioItems,
                evidencias: []
            } : null
        },
        espacios_detalle: espaciosDetalle,
        conceptos_adicionales: conceptosB2B,
        status: 'pendiente',
        creado_por: auditMulti.actorId || null,
        creado_por_nombre: auditMulti.actorName,
        modificado_por: auditMulti.actorId || null,
        modificado_por_nombre: auditMulti.actorName,
        personas: maxGuests || 1
    };
    const { error, id: createdQuoteId } = await __cpCreateQuoteRecord(payload);
    if (error) {
        console.error(error);
        if (String(error.message || '').toLowerCase().includes('espacios_detalle')) {
            return window.showToast('Falta aplicar migración de BD para multi-espacio.', 'error');
        }
        return window.showToast(`Error al guardar: ${__cpExtractCreateQuoteErrorMessage(error)}`, "error");
    }
    __cpReservationsCache = null; __cpReservationsAt = 0;
    window.showToast("Cotización Creada");
    const targetUrl = createdQuoteId ? `order_detail.html?quote=${encodeURIComponent(createdQuoteId)}` : 'orders.html';
    setTimeout(() => { __cpNavigateSafely(targetUrl); }, 900);
}
