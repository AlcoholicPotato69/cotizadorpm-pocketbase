/**
 * DOC: client\cotizadorcp\orders.js
 * Proposito: Listado y edicion de cotizaciones existentes.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE COTIZACIONES ADMIN (EDICIÓN LIBRE DE COSTOS)
// =========================================================================
let orderClientProfiles = []; let orderClientProfilesById = {};
let cpOrdersRestoringViewState = false;
const CP_ORDERS_VIEW_STATE_SCOPE = 'cp_orders';
const CP_ORDER_CONVENIOS_CFG_KEY = 'convenios_cp';
const CP_ORDER_CONVENIO_INDEFINITE_END = '2099-12-31';
let cpOrderConvenioCatalog = [];
let __cpEvidenceUploadObjectUrls = [];
let __cpEvidenceGalleryItems = [];
let __cpEvidenceGalleryIndex = 0;

window.finalMontajeDates = [];
window.tempMontajeDates = [];
window.currentMontajePrefix = 'oed';

function cpOrdersViewStateApi() {
    return window.__HUB_VIEW_STATE || null;
}

function cpOrdersReadViewState() {
    const api = cpOrdersViewStateApi();
    return api?.read ? (api.read(CP_ORDERS_VIEW_STATE_SCOPE, { maxAgeMs: 30 * 60 * 1000 }) || null) : null;
}

function cpOrdersApplyViewStateControls(state = cpOrdersReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const searchEl = document.getElementById('search-orders');
    if (searchEl && typeof state.search === 'string') searchEl.value = state.search;
}

function cpOrdersSaveViewState(extra = {}) {
    const api = cpOrdersViewStateApi();
    if (!api?.write) return null;
    const state = (extra && typeof extra === 'object') ? extra : {};
    const previousState = cpOrdersReadViewState() || {};
    const hasSelectedOrderId = Object.prototype.hasOwnProperty.call(state, 'selectedOrderId');
    return api.write(CP_ORDERS_VIEW_STATE_SCOPE, {
        search: document.getElementById('search-orders')?.value || '',
        selectedOrderId: hasSelectedOrderId
            ? String(state.selectedOrderId || '').trim()
            : String(previousState.selectedOrderId || '').trim(),
        windowScrollY: api.getWindowScrollY ? api.getWindowScrollY() : (window.scrollY || 0),
        ...state
    });
}

function cpOrdersRestoreViewStateAfterRender(state = cpOrdersReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const api = cpOrdersViewStateApi();
    window.setTimeout(() => {
        if (api?.restoreScrollState) api.restoreScrollState(state);
        const selectedOrderId = String(state.selectedOrderId || '').trim();
        if (!selectedOrderId) return;
        const target = document.querySelector(`[data-order-id="${selectedOrderId}"]`);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
        if (rect.top < 120 || (viewportHeight && rect.bottom > (viewportHeight - 120))) {
            target.scrollIntoView({ block: 'center' });
        }
    }, 90);
}

async function loadClientProfilesForOrderModal() {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel || !window.tenantPocketBase) return;

    try {
        const { data, error } = await window.tenantPocketBase
            .from('clientes')
            .select('id,nombre_completo,telefono,telefonos_adicionales,correo,rfc,perfil_validado,perfil_estatus,documentos_estado,expediente_validacion,constancia_fiscal_emitida_el,comprobante_domicilio_emitido_el,doc_acta_constitutiva,doc_ine,doc_comprobante_domicilio,doc_constancia_fiscal,created_at,created')
            .order('nombre_completo', { ascending: true });
        if (error) throw error;
        orderClientProfiles = (data || []).slice().sort((a, b) => {
            const aReady = __cpIsOrderClientProfileReady(a) ? 1 : 0;
            const bReady = __cpIsOrderClientProfileReady(b) ? 1 : 0;
            if (aReady !== bReady) return bReady - aReady;
            return String(a?.nombre_completo || '').localeCompare(String(b?.nombre_completo || ''), 'es');
        });
        orderClientProfilesById = {}; orderClientProfiles.forEach(c => orderClientProfilesById[c.id] = c);
        const current = String(sel.value || hid?.value || '').trim();
        sel.innerHTML = '<option value="">— Sin perfil —</option>' + orderClientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()} • ${__cpIsOrderClientProfileReady(c) ? 'LISTO' : 'PENDIENTE'}</option>`).join('');
        if (current) {
            sel.value = current;
            if (hid) hid.value = sel.value || '';
        }

        sel.onchange = () => {
            const id = sel.value; if (!id) { if (hid) hid.value = ''; return; }
            const c = orderClientProfilesById[id]; if (!c) return;
            if (!__cpIsOrderClientProfileReady(c)) {
                if (hid) hid.value = '';
                sel.value = '';
                window.showToast?.('Este perfil aun no tiene expediente validado. Usa captura manual o pide al cliente completar su expediente.', 'info');
                return;
            }
            if (hid) hid.value = id;
            if (document.getElementById('oed-client')) document.getElementById('oed-client').value = c.nombre_completo || '';
            if (document.getElementById('oed-phone')) document.getElementById('oed-phone').value = (c.telefono || '');
            if (document.getElementById('oed-email')) document.getElementById('oed-email').value = (c.correo || '');
            if (document.getElementById('fiscal-rfc-re')) document.getElementById('fiscal-rfc-re').value = (c.rfc || '');
        };
        const clearAssoc = () => { if (sel.value) sel.value = ''; if (hid) hid.value = ''; };
        ['oed-client', 'oed-phone', 'oed-email', 'fiscal-rfc-re'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', clearAssoc); });
        window.HUB_CLIENT_PROFILE_HOVER?.bindSelect?.(sel, () => {
            const selectedId = String(sel?.value || hid?.value || '').trim();
            return selectedId ? (orderClientProfilesById[selectedId] || null) : null;
        }, { tenant: 'casa_de_piedra' });
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

function __cpIsOrderClientProfileReady(client) {
    if (!client) return false;
    if (window.HUB_CLIENT_PROFILE_HOVER?.isQuoteReady) {
        return window.HUB_CLIENT_PROFILE_HOVER.isQuoteReady(client, 'casa_de_piedra');
    }
    return client?.perfil_validado === true;
}

function __cpOrderNormalizeMatchValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function __cpResolveOrderClientProfileId(order = {}) {
    const requestedId = String(order?.cliente_id || '').trim();
    if (requestedId && orderClientProfilesById[requestedId]) return requestedId;
    const targetEmail = __cpOrderNormalizeMatchValue(order?.cliente_email);
    const targetName = __cpOrderNormalizeMatchValue(order?.cliente_nombre);
    const targetRfc = __cpOrderNormalizeMatchValue(order?.cliente_rfc).replace(/\s+/g, '');
    const match = orderClientProfiles.find((profile) => {
        if (!profile) return false;
        const email = __cpOrderNormalizeMatchValue(profile.correo);
        const name = __cpOrderNormalizeMatchValue(profile.nombre_completo);
        const rfc = __cpOrderNormalizeMatchValue(profile.rfc).replace(/\s+/g, '');
        if (targetEmail && email && targetEmail === email) return true;
        if (targetRfc && rfc && targetRfc === rfc) return true;
        if (targetName && name && targetName === name) return true;
        return false;
    });
    return match?.id ? String(match.id) : '';
}

function __cpApplyOrderClientProfileSelection(order = {}) {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel) return '';
    const profileId = __cpResolveOrderClientProfileId(order);
    sel.value = profileId || '';
    if (hid) hid.value = profileId || '';
    return profileId;
}
function __orderNormalizeTaxIds(value) {
    return window.parseIds(value)
        .map(v => String(v || '').trim())
        .filter(Boolean);
}
function __orderResolveQuoteFolio(recordOrId, fallbackId = '') {
    if (recordOrId && typeof recordOrId === 'object') {
        const current = String(recordOrId.numero_orden || '').trim();
        if (current) return current.toUpperCase();
        const rawId = String(recordOrId.id || fallbackId || '').trim().toUpperCase();
        return rawId ? `CP-${rawId.slice(0, 6)}` : 'CP-PEND';
    }
    const rawId = String(recordOrId || fallbackId || '').trim().toUpperCase();
    return rawId ? `CP-${rawId.slice(0, 6)}` : 'CP-PEND';
}
function __orderRoundCurrency(value) {
    return Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
}
function __orderToFiniteNumber(value, fallback = 0) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}
function __orderHasExplicitValue(value) {
    return !(value === null || value === undefined || (typeof value === 'string' && value.trim() === ''));
}
function __orderParseRecordJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) { }
    }
    return {};
}
function __orderNormalizeConceptsArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = __orderParseRecordJson(value);
    if (Array.isArray(parsed)) return parsed;
    const candidates = [
        parsed?.items,
        parsed?.conceptos,
        parsed?.conceptos_adicionales,
        parsed?.servicios,
        parsed?.data
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
}
function __orderNormalizeExtraConcept(concept = {}) {
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
function __orderNormalizeConvenioName(value = '') {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function __orderNormalizeSpaceConvenioFlag(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'si', 'sí', 'yes'].includes(raw)) return true;
    if (['0', 'false', 'no'].includes(raw)) return false;
    return fallback;
}
function __orderIsConvenioConceptItem(concept = {}) {
    return !!(concept?.meta && concept.meta.convenio_item === true);
}
function __orderBuildConvenioConcept(option = {}, cantidad, amount) {
    const qty = Math.max(1, parseInt(cantidad, 10) || 1);
    const value = Math.max(0, parseFloat(amount || 0) || 0);
    const nombre = __orderNormalizeConvenioName(option?.nombre || option?.name || option?.label || '');
    return __orderNormalizeExtraConcept({
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
function __orderBuildConvenioConceptsFromPayload(items = []) {
    return __orderSafeArray(items).map((item) => __orderBuildConvenioConcept(
        { id: item?.id || item?.convenio_option_id, nombre: item?.nombre || item?.convenio_nombre || item?.description || 'Convenio' },
        item?.cantidad_entrega || item?.cantidad || 1,
        item?.monto || item?.amount || item?.value || 0
    ));
}
function __orderGetConvenioConcepts(cfg = null) {
    return __orderSafeArray(cfg?.concepts).map(__orderNormalizeExtraConcept).filter(__orderIsConvenioConceptItem);
}
function __orderBuildConvenioPayloadItems(cfg = null) {
    return __orderGetConvenioConcepts(cfg).map((concept) => ({
        id: String(concept?.meta?.convenio_option_id || '').trim() || null,
        nombre: __orderNormalizeConvenioName(concept?.meta?.convenio_nombre || concept.description || 'Convenio') || 'Convenio',
        cantidad_entrega: Math.max(1, parseInt(concept?.meta?.cantidad_entrega || 1, 10) || 1),
        monto: Math.max(0, parseFloat(concept?.amount ?? concept?.value ?? 0) || 0)
    }));
}
function __orderSanitizeConvenioItems(items = []) {
    return __orderSafeArray(items).map((item) => {
        const qty = Math.max(1, parseInt(item?.cantidad_entrega || item?.cantidad || 1, 10) || 1);
        const amount = Math.max(0, parseFloat(item?.monto ?? item?.amount ?? item?.value ?? 0) || 0);
        return {
            id: String(item?.id || item?.convenio_option_id || '').trim() || null,
            nombre: __orderNormalizeConvenioName(item?.nombre || item?.convenio_nombre || item?.description || 'Convenio') || 'Convenio',
            cantidad_entrega: qty,
            monto: amount
        };
    }).filter((item) => !!item.nombre);
}
function __orderSanitizeConvenioEvidenceItems(items = []) {
    return __orderSafeArray(items).map((item, idx) => {
        const path = String(item?.path || item?.url || '').trim();
        if (!path) return null;
        return {
            id: String(item?.id || `evidence_${idx + 1}`).trim(),
            path,
            file_name: String(item?.file_name || item?.nombre_archivo || path.split('/').pop() || `evidencia_${idx + 1}.jpg`).trim(),
            uploaded_at: String(item?.uploaded_at || item?.fecha || '').trim() || null,
            mime_type: String(item?.mime_type || item?.tipo_mime || '').trim() || 'image/jpeg',
            size: Math.max(0, parseInt(item?.size || item?.tamano || 0, 10) || 0)
        };
    }).filter(Boolean);
}
function __orderParseConvenioMeta(source = {}) {
    const details = (source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 'detalles_evento'))
        ? __orderParseRecordJson(source.detalles_evento)
        : __orderParseRecordJson(source);
    const raw = details?.convenio && typeof details.convenio === 'object' ? details.convenio : {};
    const items = __orderSanitizeConvenioItems(raw?.items || raw?.tratos || []);
    const espacios = Array.isArray(raw?.espacios) ? raw.espacios : [];
    const evidencias = __orderSanitizeConvenioEvidenceItems(raw?.evidencias || raw?.evidence || []);
    const activeSignals = items.length > 0 || espacios.length > 0 || evidencias.length > 0;
    return {
        activo: __orderNormalizeSpaceConvenioFlag(raw?.activo, activeSignals) || activeSignals,
        activo_explicit: __orderNormalizeSpaceConvenioFlag(raw?.activo, false),
        bloqueo_indefinido: __orderNormalizeSpaceConvenioFlag(raw?.bloqueo_indefinido, true),
        requiere_evidencia: __orderNormalizeSpaceConvenioFlag(raw?.requiere_evidencia, true),
        evidencia_minima: Math.max(1, parseInt(raw?.evidencia_minima || 3, 10) || 3),
        evidencia_maxima: Math.max(1, parseInt(raw?.evidencia_maxima || 5, 10) || 5),
        requiere_factura: __orderNormalizeSpaceConvenioFlag(raw?.requiere_factura, false),
        requiere_recibo: __orderNormalizeSpaceConvenioFlag(raw?.requiere_recibo, false),
        requiere_contrato: __orderNormalizeSpaceConvenioFlag(raw?.requiere_contrato, false),
        items,
        espacios,
        evidencias
    };
}
function __orderGetConvenioEvidence(order = {}) {
    return __orderParseConvenioMeta(order).evidencias;
}
// Convenio en Casa de Piedra solo aplica a espacios publicitarios con la
// bandera explicita `permite_convenio`; asi el selector, el PDF y la
// persistencia comparten el mismo criterio operativo.
function __orderSpaceAllowsConvenio(space) {
    return __orderIsPublicidadSpace(space) && __orderNormalizeSpaceConvenioFlag(space?.permite_convenio, false);
}
function __orderGetQuoteDocumentMeta(orderLike = {}) {
    const isConvenio = __orderIsConvenioOrder(orderLike);
    return {
        isConvenio,
        itemLabel: isConvenio ? 'Convenio' : 'Cotización',
        draftTitle: isConvenio ? 'Borrador de Convenio' : 'Borrador de Cotización',
        approvedTitle: isConvenio ? 'Carta Convenio Aprobada' : 'Cotización Aprobada',
        draftStorageBase: isConvenio ? 'convenio_borrador' : 'cotizacion_borrador',
        approvedStorageBase: isConvenio ? 'carta_convenio_aprobada' : 'cotizacion_aprobada',
        draftFileBase: isConvenio ? 'CONVENIO_BORRADOR' : 'COTIZACION_BORRADOR',
        approvedFileBase: isConvenio ? 'CARTA_CONVENIO_APROBADA' : 'COTIZACION_APROBADA'
    };
}
function __orderIsConvenioOrder(order = {}) {
    const convenioMeta = __orderParseConvenioMeta(order);
    if (convenioMeta.activo || convenioMeta.items.length || convenioMeta.espacios.length || convenioMeta.evidencias.length) return true;
    const concepts = __orderNormalizeConceptsArray(order?.conceptos_adicionales);
    if (concepts.some((concept) => __orderIsConvenioConceptItem(concept))) return true;
    const spaces = parseSpacesDetail ? parseSpacesDetail(order?.espacios_detalle) : __orderSafeArray(order?.espacios_detalle);
    return Array.isArray(spaces) && spaces.some((item) => {
        const items = __orderSanitizeConvenioItems(item?.convenio_items || []);
        const delivered = parseFloat(item?.convenio_monto_entregado || 0) || 0;
        return __orderNormalizeSpaceConvenioFlag(item?.convenio_activo, false)
            || __orderNormalizeSpaceConvenioFlag(item?.convenio_indefinido, false)
            || items.length > 0
            || delivered > 0.009;
    });
}
function __orderConvenioCovered(baseValue, deliveredValue, balanceValue = undefined) {
    const balance = parseFloat(balanceValue);
    if (Number.isFinite(balance)) return balance <= 0.009;
    const base = Math.max(0, parseFloat(baseValue || 0) || 0);
    const delivered = Math.max(0, parseFloat(deliveredValue || 0) || 0);
    if (base <= 0) return false;
    return delivered + 0.009 >= base;
}
function __orderHasFiniteConvenioEndDate(value) {
    const raw = __orderNormalizeDate(value || '');
    return !!raw && raw !== CP_ORDER_CONVENIO_INDEFINITE_END;
}
function __orderDetailBlocksIndefinitely(detail = {}) {
    const row = detail && typeof detail === 'object' ? detail : {};
    const flagged = __orderNormalizeSpaceConvenioFlag(row?.convenio_activo, false)
        || __orderNormalizeSpaceConvenioFlag(row?.convenio_indefinido, false)
        || __orderNormalizeSpaceConvenioFlag(row?.bloqueo_indefinido, false);
    if (!flagged) return false;
    // Auditoria TI: una fecha_fin real siempre gana sobre el bloqueo indefinido heredado del convenio.
    if (__orderHasFiniteConvenioEndDate(row?.fecha_fin || row?.endDate)) return false;
    return __orderConvenioCovered(
        row?.subtotal_espacio ?? row?.baseValue,
        row?.convenio_monto_entregado ?? row?.convenioValue,
        row?.convenio_balance
    );
}
function __orderBlocksIndefinitely(order = {}) {
    const convenioMeta = __orderParseConvenioMeta(order);
    const spaces = parseSpacesDetail ? parseSpacesDetail(order?.espacios_detalle) : __orderSafeArray(order?.espacios_detalle);
    if (Array.isArray(spaces) && spaces.length) return spaces.some((item) => __orderDetailBlocksIndefinitely(item));
    if (__orderHasFiniteConvenioEndDate(order?.fecha_fin || order?.endDate)) return false;
    if (!(convenioMeta.activo && convenioMeta.bloqueo_indefinido)) return false;
    const breakdown = __orderParseRecordJson(order?.desglose_precios);
    return __orderConvenioCovered(
        breakdown?.convenio_base_total,
        breakdown?.convenio_entregable_total,
        breakdown?.convenio_balance_total ?? order?.precio_final
    );
}
function __orderCfgConvenioValue(cfg = null) {
    return __orderGetConvenioConcepts(cfg).reduce((sum, concept) => sum + (parseFloat(concept.amount ?? concept.value ?? 0) || 0), 0);
}
function __orderCfgBlocksIndefinitely(cfg = null) {
    if (!cfg?.convenioEnabled || !__orderIsPublicidadSpace(cfg)) return false;
    if (__orderHasFiniteConvenioEndDate(cfg?.endDate)) return false;
    const space = __orderGetSpaceById(cfg.spaceId);
    const base = parseFloat(space?.precio_base || 0) || 0;
    return __orderConvenioCovered(base, __orderCfgConvenioValue(cfg));
}
function __orderResolveTaxIdsFromDetails(order) {
    const detailRaw = __orderParseRecordJson(order?.espacios_detalle);
    const detailList = Array.isArray(detailRaw) ? detailRaw : [];
    const seen = new Set();
    const out = [];
    detailList.forEach((detail) => {
        __orderNormalizeTaxIds(
            detail?.impuestos_ids
            || detail?.impuestos
            || detail?.tax_ids
            || detail?.impuestos_detalle
        ).forEach((taxId) => {
            if (seen.has(taxId)) return;
            seen.add(taxId);
            out.push(taxId);
        });
    });
    return out;
}
function __orderResolveTaxTotalFromBreakdown(order, fallback = 0) {
    const breakdown = __orderParseRecordJson(order?.desglose_impuestos);
    const direct = [
        breakdown?.total,
        breakdown?.tax_total,
        breakdown?.impuestos_total,
        breakdown?.total_impuestos
    ]
        .map((value) => __orderToFiniteNumber(value, NaN))
        .find((value) => Number.isFinite(value) && value >= 0);
    if (Number.isFinite(direct)) return direct;
    const list = Array.isArray(breakdown)
        ? breakdown
        : (Array.isArray(breakdown?.items)
            ? breakdown.items
            : (Array.isArray(breakdown?.impuestos) ? breakdown.impuestos : []));
    const sum = list.reduce((acc, item) => {
        const amount = __orderToFiniteNumber(
            item?.monto ?? item?.importe ?? item?.amount ?? item?.valor ?? 0,
            0
        );
        return acc + Math.max(0, amount);
    }, 0);
    if (sum > 0) return sum;
    return Math.max(0, __orderToFiniteNumber(fallback, 0));
}
function __orderResolveTaxRecord(taxId, tenantOrSpace = '') {
    const safeId = String(taxId || '').trim();
    if (!safeId) return null;
    const tenant = typeof tenantOrSpace === 'string'
        ? __orderResolveTenantSlug(tenantOrSpace)
        : __orderResolveTenantSlug(tenantOrSpace?.tenant || '');
    const tenantTaxes = __orderFilterRowsByTenant(dbTaxes, tenant);
    return tenantTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || dbTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || null;
}
function __orderResolveTaxRate(tax) {
    const pct = __orderToFiniteNumber(tax?.porcentaje, 0);
    return pct > 1 ? pct / 100 : pct;
}
function __orderResolveTaxDisplayPercent(tax) {
    const pct = __orderToFiniteNumber(tax?.porcentaje, 0);
    return pct > 0 && pct <= 1 ? (pct * 100) : pct;
}
function __orderResolveQuoteTaxIds(order) {
    const breakdown = __orderParseRecordJson(order?.desglose_precios);
    const breakdownIds = __orderNormalizeTaxIds(breakdown?.impuestos_detalle);
    if (breakdownIds.length) return breakdownIds;
    const detailIds = __orderResolveTaxIdsFromDetails(order);
    if (detailIds.length) return detailIds;
    const space = allSpaces.find((sp) => String(sp?.id || '') === String(order?.espacio_id || ''));
    return __orderNormalizeTaxIds(space?.impuestos_ids || space?.impuestos);
}
function __orderResolveQuotePricing(order) {
    const breakdown = __orderParseRecordJson(order?.desglose_precios);
    const taxIds = __orderResolveQuoteTaxIds(order);
    const hasSubtotal = __orderHasExplicitValue(breakdown?.subtotal_antes_impuestos);
    const hasTaxTotal = __orderHasExplicitValue(breakdown?.tax_total);
    const hasTotal = __orderHasExplicitValue(order?.precio_final);

    let subtotal = hasSubtotal ? __orderToFiniteNumber(breakdown?.subtotal_antes_impuestos, 0) : null;
    let taxTotal = hasTaxTotal ? __orderToFiniteNumber(breakdown?.tax_total, 0) : null;

    if (subtotal === null && hasTotal && hasTaxTotal) {
        subtotal = Math.max(0, __orderToFiniteNumber(order?.precio_final, 0) - __orderToFiniteNumber(breakdown?.tax_total, 0));
    }
    if (subtotal === null) subtotal = 0;

    if (taxTotal === null) {
        taxTotal = __orderRoundCurrency(taxIds.reduce((sum, taxId) => {
            const tax = __orderResolveTaxRecord(taxId, order);
            return sum + (subtotal * __orderResolveTaxRate(tax));
        }, 0));
    }
    if (!taxTotal || taxTotal <= 0) {
        taxTotal = __orderRoundCurrency(__orderResolveTaxTotalFromBreakdown(order, taxTotal));
    }
    if ((!taxTotal || taxTotal <= 0) && hasTotal) {
        const inferred = __orderToFiniteNumber(order?.precio_final, 0) - __orderToFiniteNumber(subtotal, 0);
        if (Number.isFinite(inferred) && inferred > 0) {
            taxTotal = __orderRoundCurrency(inferred);
        }
    }

    const total = hasTotal
        ? __orderToFiniteNumber(order?.precio_final, 0)
        : __orderRoundCurrency(subtotal + taxTotal);

    return {
        breakdown,
        taxIds,
        subtotal: __orderRoundCurrency(subtotal),
        taxTotal: __orderRoundCurrency(taxTotal),
        total: __orderRoundCurrency(total)
    };
}
function __orderHydrateQuotePricing(order) {
    if (!order || typeof order !== 'object') return order;
    const pricing = __orderResolveQuotePricing(order);
    return {
        ...order,
        precio_final: pricing.total,
        desglose_precios: {
            ...pricing.breakdown,
            subtotal_antes_impuestos: pricing.subtotal,
            impuestos_detalle: pricing.taxIds,
            tax_total: pricing.taxTotal
        }
    };
}
function __orderParsePaymentsList(order = {}) {
    if (Array.isArray(order?.historial_pagos)) return order.historial_pagos.filter(Boolean);
    try {
        const parsed = JSON.parse(order?.historial_pagos || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}
function __orderOrderTotalPaid(order = {}) {
    return __orderRoundCurrency(__orderParsePaymentsList(order).reduce((sum, payment) => {
        const amount = __orderToFiniteNumber(
            payment?.monto ?? payment?.amount ?? payment?.importe ?? payment?.valor ?? 0,
            0
        );
        return sum + Math.max(0, amount);
    }, 0));
}
function __orderOrderRemainingBalance(order = {}) {
    const remaining = __orderRoundCurrency(__orderResolveQuotePricing(order).total - __orderOrderTotalPaid(order));
    return remaining < 0 ? 0 : remaining;
}
function __orderResolveOrderTableAmountState(order = {}) {
    const isConvenio = __orderIsConvenioOrder(order);
    const pricing = __orderResolveQuotePricing(order);
    const status = String(order?.status || '').toLowerCase();
    if (isConvenio) {
        const remaining = Math.max(0, parseFloat(pricing?.breakdown?.convenio_balance_total ?? pricing.total ?? 0) || 0);
        return {
            amount: remaining,
            textClass: remaining > 0.01 ? 'text-red-600' : 'text-emerald-600',
            label: remaining > 0.01 ? 'Faltante' : '',
            badgeHtml: '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800">Convenio</span>'
        };
    }
    const payments = __orderParsePaymentsList(order);
    const shouldShowRemaining = ['aprobada', 'finalizada'].includes(status) && payments.length > 0;
    if (shouldShowRemaining) {
        const remaining = __orderOrderRemainingBalance(order);
        return {
            amount: remaining,
            textClass: remaining > 0.01 ? 'text-red-600' : 'text-emerald-600',
            label: remaining > 0.01 ? 'Faltante' : '',
            badgeHtml: ''
        };
    }
    return {
        amount: pricing.total,
        textClass: 'text-gray-800',
        label: '',
        badgeHtml: ''
    };
}

const _p = (window.location.pathname || '') + ' ' + (window.location.href || '');
const _isCP = /\/cotizadorcp(\/|$)/.test(window.location.pathname || '') || _p.includes('cotizadorcp');
const COMPANY_LOGO_URL = _isCP ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../../assets/logocp.png') : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../../assets/logo.png');
function __orderDefaultLetterheadUrl() {
    return (window.HUB_CONFIG && (window.HUB_CONFIG.cpPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadCasaPiedraUrl)) || '../public/assets/img/cp-letterhead-default.png';
}
let __CP_LETTERHEAD_URL = __orderDefaultLetterheadUrl();
const __PDF_PAGE_WIDTH_PX = 816;
const __PDF_PAGE_HEIGHT_PX = 1056;
const __LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const __LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const __LETTERHEAD_MARGINS_DESIGN_PX = { top: 150, right: 45, bottom: 85, left: 45 };
const __ORDER_PDF_CONTENT_BASE_WIDTH_PX = 816;
const __CP_CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __CP_LETTERHEAD_PATH = 'membretes_pdf';
let __CP_LETTERHEAD_STORAGE_PATH = '';
let __CP_LETTERHEAD_SIGNED_AT = 0;
const __CP_LETTERHEAD_SIGN_TTL_MS = 45 * 60 * 1000;

function __orderCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __orderBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function __orderResolveLetterheadSignedUrl(path) {
    const safePath = String(path || '').trim().replace(/\\/g, '/');
    if (!safePath || !window.globalPocketBase?.storage?.from) return '';
    const bucket = window.globalPocketBase.storage.from('documentos-cp');
    const { data: signed, error: signedError } = await bucket.createSignedUrl(safePath, 3600);
    if (!signedError && signed?.signedUrl) return signed.signedUrl;
    const fallbackName = __orderBasename(safePath);
    if (!fallbackName) return '';
    const fallbackPath = `${__CP_LETTERHEAD_PATH}/${fallbackName}`;
    const { data: fallbackSigned, error: fallbackErr } = await bucket.createSignedUrl(fallbackPath, 3600);
    return !fallbackErr && fallbackSigned?.signedUrl ? fallbackSigned.signedUrl : '';
}

async function __orderRefreshLetterheadUrl(force = false) {
    const defaultUrl = __orderDefaultLetterheadUrl();
    if (!__CP_LETTERHEAD_STORAGE_PATH) {
        __CP_LETTERHEAD_URL = defaultUrl;
        return __CP_LETTERHEAD_URL;
    }
    const age = Date.now() - (__CP_LETTERHEAD_SIGNED_AT || 0);
    if (!force && __CP_LETTERHEAD_URL && age > 0 && age < __CP_LETTERHEAD_SIGN_TTL_MS) {
        return __CP_LETTERHEAD_URL;
    }
    try {
        const signedUrl = await __orderResolveLetterheadSignedUrl(__CP_LETTERHEAD_STORAGE_PATH);
        __CP_LETTERHEAD_URL = signedUrl || defaultUrl;
        __CP_LETTERHEAD_SIGNED_AT = signedUrl ? Date.now() : 0;
    } catch (_) {
        __CP_LETTERHEAD_URL = defaultUrl;
        __CP_LETTERHEAD_SIGNED_AT = 0;
    }
    return __CP_LETTERHEAD_URL;
}

function __orderLetterheadFrame() {
    const sx = __PDF_PAGE_WIDTH_PX / __LETTERHEAD_DESIGN_WIDTH_PX;
    const sy = __PDF_PAGE_HEIGHT_PX / __LETTERHEAD_DESIGN_HEIGHT_PX;
    const top = __LETTERHEAD_MARGINS_DESIGN_PX.top * sy;
    const right = __LETTERHEAD_MARGINS_DESIGN_PX.right * sx;
    const bottom = __LETTERHEAD_MARGINS_DESIGN_PX.bottom * sy;
    const left = __LETTERHEAD_MARGINS_DESIGN_PX.left * sx;
    return {
        top,
        right,
        bottom,
        left,
        width: __PDF_PAGE_WIDTH_PX - left - right,
        height: __PDF_PAGE_HEIGHT_PX - top - bottom
    };
}

function __orderContentBaseHeightPx() {
    const frame = __orderLetterheadFrame();
    if (!frame.width || !frame.height) return 945;
    return (__ORDER_PDF_CONTENT_BASE_WIDTH_PX * frame.height) / frame.width;
}

function __orderWrapLetterheadPage(innerHtml, options = {}) {
    const frame = __orderLetterheadFrame();
    const baseWidth = Math.max(1, parseFloat(options.baseWidth) || __PDF_PAGE_WIDTH_PX);
    const baseHeight = Math.max(1, parseFloat(options.baseHeight) || __PDF_PAGE_HEIGHT_PX);
    const scale = Math.min(frame.width / baseWidth, frame.height / baseHeight);
    const finalW = baseWidth * scale;
    const finalH = baseHeight * scale;
    const left = frame.left + ((frame.width - finalW) / 2);
    const top = frame.top + ((frame.height - finalH) / 2);
    const bgUrl = __orderCssSafeUrl(__CP_LETTERHEAD_URL);
    const imageLayer = bgUrl
        ? `<img data-cp-letterhead="1" src='${bgUrl}' ${bgUrl.startsWith('http') ? "crossorigin='anonymous'" : ""} onerror='if(!this.dataset.retried){this.dataset.retried=\"1\";var s=this;setTimeout(function(){s.src=s.src;},200);}' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
    return `<div style="position:relative;width:${__PDF_PAGE_WIDTH_PX}px;height:${__PDF_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:visible;background:#f5f5f5;">${imageLayer}<div data-pdf-preview-frame="1" data-base-width="${baseWidth}" data-base-height="${baseHeight}" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:visible;z-index:1;">${innerHtml}</div></div>`;
}

const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
const FIN_SCHEMA = _isCP ? 'finanzas_casadepiedra' : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_CASA_PIEDRA || 'finanzas');
const STATUS_LEVEL = { 'pendiente': 0, 'rechazada': 0, 'aprobada': 1, 'finalizada': 2 };
const ORDERS_PAGE_MODE = window.__CP_ORDERS_MODE || 'list';
const IS_ORDER_DETAIL_PAGE = ORDERS_PAGE_MODE === 'detail';
const IS_ORDER_PREVIEW_PAGE = ORDERS_PAGE_MODE === 'preview';

function __cpIsPreviewOnlyQueryMode() {
    try {
        return String(new URLSearchParams(window.location.search || '').get('previewOnly') || '') === '1';
    } catch (_) {
        return false;
    }
}

function __cpIsPdfPreviewVisible() {
    const root = document.getElementById('pdf-content');
    if (!root || root.classList.contains('hidden')) return false;
    if (IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode()) return true;
    const modal = document.getElementById('preview-modal');
    return !!modal && !modal.classList.contains('hidden');
}

let __cpPreviewExclusiveHiddenNodes = [];
function __cpShouldUseExclusivePreviewMode() {
    return IS_ORDER_DETAIL_PAGE || IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode();
}
function __cpSetExclusivePreviewMode(active) {
    if (!__cpShouldUseExclusivePreviewMode()) return;
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    if (active) {
        __cpPreviewExclusiveHiddenNodes = [];
        Array.from(body.children || []).forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.id === 'preview-modal') return;
            if (node.tagName === 'SCRIPT') return;
            if (node.classList.contains('hidden')) return;
            node.classList.add('hidden');
            __cpPreviewExclusiveHiddenNodes.push(node);
        });
    } else if (__cpPreviewExclusiveHiddenNodes.length) {
        __cpPreviewExclusiveHiddenNodes.forEach((node) => {
            if (node && node.isConnected) node.classList.remove('hidden');
        });
        __cpPreviewExclusiveHiddenNodes = [];
    }

    body.classList.toggle('preview-exclusive', !!active);
    body.style.overflow = active ? 'hidden' : '';
    root.style.overflow = active ? 'hidden' : '';
}

function __cpClosePreviewTabIfNeeded() {
    if (!(IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode())) return;
    const attemptClose = () => {
        try {
            if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') {
                window.__HUB_ALLOW_NEXT_UNLOAD('cp_preview_tab_close');
            }
            window.close();
        } catch (_) { }
    };
    setTimeout(() => {
        attemptClose();
        let tries = 0;
        const timer = setInterval(() => {
            if (window.closed) {
                clearInterval(timer);
                return;
            }
            tries += 1;
            attemptClose();
            if (tries >= 6) {
                clearInterval(timer);
                if (!window.closed) {
                    try { window.showToast("No se pudo cerrar automáticamente la pestaña. Ciérrala manualmente.", "info"); } catch (_) { }
                }
            }
        }, 120);
    }, 40);
}

let allOrders = [], allSpaces = [], catalogConcepts = [], dbTaxes = [], currentPreviewOrder = null;
let currentConcepts = [];
let myPermissions = { access: false, orders_edit: false };
let currentUserProfile = null;
let __orderDetailDirty = false;
let __orderUsersById = Object.create(null);
let __orderAutoSaveTimer = null;
let __orderAutoSaveBound = false;
let __orderPendingApprovalSnapshot = null;
let __orderSnapshotInFlight = false;
let __orderSnapshotQueueProcessing = false;
const __ORDER_REFRESH_KEY = 'cp_orders_refresh_v1';
const __ORDER_SNAPSHOT_QUEUE_KEY = 'cp_order_snapshot_queue_v1';
const __ORDER_DATE_PICKER = { target: 'start', month: 0, year: 0, start: '', end: '', reserved: new Set() };
const __ORDER_MONTAJE_PICKER = { month: 0, year: 0, start: '', end: '', reserved: new Set(), maxDate: '' };
let __orderEventPickerCal = null;
let __orderMontajePickerCal = null;

function __orderNormalizeTenantSlug(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'finanzas' || raw.indexOf('plaza') !== -1) return 'plaza_mayor';
    if (raw.indexOf('casadepiedra') !== -1 || raw.indexOf('casa_de_piedra') !== -1 || raw.indexOf('casa-de-piedra') !== -1) return 'casa_de_piedra';
    return raw;
}

function __orderResolveTenantSlug(fallback = '') {
    const fromClient = __orderNormalizeTenantSlug(window.tenantPocketBase?.tenant || '');
    if (fromClient) return fromClient;
    const fromFallback = __orderNormalizeTenantSlug(fallback);
    if (fromFallback) return fromFallback;
    const fromSchema = __orderNormalizeTenantSlug(FIN_SCHEMA);
    if (fromSchema) return fromSchema;
    const path = String(window.location.pathname || '').toLowerCase();
    return path.indexOf('/cotizadorcp/') !== -1 ? 'casa_de_piedra' : 'plaza_mayor';
}

function __orderFilterRowsByTenant(rows, fallback = '') {
    const tenant = __orderResolveTenantSlug(fallback);
    const source = Array.isArray(rows) ? rows : [];
    if (!tenant) return source.slice();
    return source.filter((row) => {
        const rowTenant = __orderNormalizeTenantSlug(row?.tenant || '');
        return !rowTenant || rowTenant === tenant;
    });
}

function __cpNativeCotizaciones() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}

async function __cpQuotesList(params) {
    const svc = __cpNativeCotizaciones();
    if (svc) {
        try {
            const out = await svc.list(params || {}, { schema: FIN_SCHEMA });
            return { data: out.items || [], error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    const query = window.tenantPocketBase.from('cotizaciones').select('*');
    if (params && params.filter && params.filter.indexOf('status = "aprobada"') !== -1) query.eq('status', 'aprobada');
    if (params && params.sort) query.order(String(params.sort).replace('-', ''), { ascending: !String(params.sort).startsWith('-') });
    const result = await query;
    return { data: result.data || [], error: result.error || null };
}

async function __cpQuoteGetById(id) {
    const svc = __cpNativeCotizaciones();
    if (svc) {
        try {
            const data = await svc.get(id, { schema: FIN_SCHEMA });
            return { data: data || null, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').select('*').eq('id', id).maybeSingle();
    return { data: result && result.data ? result.data : null, error: result && result.error ? result.error : null };
}

async function __cpQuotesUpdate(id, payload) {
    const safePayload = __orderNormalizeQuoteUpdatePayload(__orderBuildQuoteAuditPayload(payload || {}));
    const svc = __cpNativeCotizaciones();
    if (svc) {
        try {
            await svc.update(id, safePayload, { schema: FIN_SCHEMA });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').update(safePayload).eq('id', id);
    return { error: result && result.error ? result.error : null };
}

async function __cpQuotesDelete(id) {
    const svc = __cpNativeCotizaciones();
    if (svc) {
        try {
            await svc.remove(id, { schema: FIN_SCHEMA });
            return { error: null };
        } catch (error) {
            return { error };
        }
    }
    const result = await window.tenantPocketBase.from('cotizaciones').delete().eq('id', id);
    return { error: result && result.error ? result.error : null };
}

window.safeFormatDate = function (dateStr) { if (!dateStr) return '--'; const parts = dateStr.split('-'); if (parts.length !== 3) return dateStr; return `${parts[2]}/${parts[1]}/${parts[0]}`; };
window.parseIds = function (v) { if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch (e) { return v.split(',').map(x => x.trim()).filter(Boolean); } } return []; };
function __orderTodayISO() { return new Date().toISOString().split('T')[0]; }
function __orderMonthLabel(year, month) { return new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); }
function __orderAddDays(ds, delta) {
    const n = __orderNormalizeDate(ds);
    if (!n) return '';
    const d = new Date(`${n}T00:00:00`);
    d.setDate(d.getDate() + (delta || 0));
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function __orderToYMD(dateObj) {
    if (!dateObj) return '';
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
// FullCalendar necesita un resize luego de abrir el modal para evitar render compacto inicial.
function __orderRefreshCalendarLayout(calendar) {
    if (!calendar || typeof calendar.updateSize !== 'function') return;
    const refresh = () => {
        try { calendar.updateSize(); } catch (e) { }
    };
    requestAnimationFrame(() => {
        refresh();
        setTimeout(refresh, 60);
        setTimeout(refresh, 180);
    });
}
function __orderIsBlockingStatus(status) {
    const s = String(status || '').toLowerCase();
    return s === 'aprobada' || s === 'finalizada';
}
function __orderBroadcastRefresh(reason = 'updated') {
    try {
        localStorage.setItem(__ORDER_REFRESH_KEY, JSON.stringify({ at: Date.now(), reason }));
    } catch (e) { }
}

function __orderReadSnapshotQueue() {
    try {
        const raw = localStorage.getItem(__ORDER_SNAPSHOT_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch (e) {
        return [];
    }
}

function __orderWriteSnapshotQueue(list) {
    try {
        const clean = Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean).map(String)));
        if (!clean.length) localStorage.removeItem(__ORDER_SNAPSHOT_QUEUE_KEY);
        else localStorage.setItem(__ORDER_SNAPSHOT_QUEUE_KEY, JSON.stringify(clean));
    } catch (e) { }
}

function __orderQueueSnapshot(orderId) {
    const id = String(orderId || '').trim();
    if (!id) return;
    const q = __orderReadSnapshotQueue();
    if (!q.includes(id)) q.push(id);
    __orderWriteSnapshotQueue(q);
}

function __orderDequeueSnapshot(orderId) {
    const id = String(orderId || '').trim();
    if (!id) return;
    const q = __orderReadSnapshotQueue().filter(x => String(x) !== id);
    __orderWriteSnapshotQueue(q);
}

function __orderCurrentOrderId() {
    return String(currentPreviewOrder?.id || document.getElementById('oed-id')?.value || '').trim();
}

function __orderHasPendingSnapshot() {
    const pendingId = String(__orderPendingApprovalSnapshot?.orderId || '').trim();
    const currentId = __orderCurrentOrderId();
    return !!pendingId && !!currentId && pendingId === currentId;
}

window.__HUB_HAS_UNSAVED_CHANGES = function () {
    try {
        if (IS_ORDER_DETAIL_PAGE) return __orderDetailDirty === true;
    } catch (_) { }
    return false;
};

function __orderReadAuthState(key) {
    try {
        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function __orderResolveCurrentActorId() {
    const authState = __orderReadAuthState('pb_native_auth_v1');
    const candidates = [
        currentUserProfile?.id,
        currentUserProfile?.record?.id,
        currentUserProfile?.user?.id,
        authState?.user?.id,
        authState?.record?.id
    ];
    return candidates.map((v) => String(v || '').trim()).find(Boolean) || '';
}

function __orderResolveCurrentActorName() {
    const fromProfile = __orderSanitizeActorName(__cpResolvePdfActorName?.());
    if (fromProfile) return fromProfile;
    const cachedName = __orderSanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) return cachedName;
    const authState = __orderReadAuthState('pb_native_auth_v1');
    const username = [
        currentUserProfile?.login_username,
        currentUserProfile?.record?.login_username,
        currentUserProfile?.username,
        currentUserProfile?.record?.username,
        authState?.user?.login_username,
        authState?.record?.login_username,
        authState?.user?.username,
        authState?.record?.username
    ]
        .map((value) => __orderSanitizeActorName(value))
        .find(Boolean);
    if (username) return username;
    const email = [
        currentUserProfile?.email,
        currentUserProfile?.record?.email,
        authState?.user?.email,
        authState?.record?.email
    ].map((v) => String(v || '').trim()).find(Boolean) || '';
    const emailUser = __orderSanitizeActorName(email ? email.split('@')[0] : '');
    return emailUser || 'Usuario';
}

function __orderBuildQuoteAuditPayload(payload = {}) {
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    const actorId = __orderResolveCurrentActorId();
    const actorName = __orderResolveCurrentActorName();
    if (actorId) next.modificado_por = actorId;
    if (actorName) next.modificado_por_nombre = actorName;
    return next;
}

function __orderNormalizeQuoteUpdatePayload(payload = {}) {
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    [
        'cliente_nombre',
        'cliente_email',
        'cliente_contacto',
        'cliente_rfc',
        'cliente_telefono',
        'cliente_id',
        'espacio_id',
        'espacio_nombre',
        'espacio_clave',
        'fecha_inicio',
        'fecha_fin',
        'fecha_orden_compra',
        'nombre_cotizacion',
        'numero_orden',
        'numero_contrato',
        'status',
        'tipo_ajuste',
        'url_cotizacion_final',
        'url_orden_compra',
        'factura_pdf_url',
        'factura_xml_url',
        'contrato_url',
        'creado_por',
        'creado_por_nombre',
        'modificado_por',
        'modificado_por_nombre',
        'flujo_estado'
    ].forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(next, field)) return;
        next[field] = next[field] == null ? '' : String(next[field]);
    });
    ['precio_final', 'valor_ajuste', 'personas'].forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(next, field)) return;
        next[field] = parseFloat(next[field] || 0) || 0;
    });
    ['ajuste_es_porcentaje', 'permanencia_personalizada'].forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(next, field)) return;
        next[field] = !!next[field];
    });
    [
        ['conceptos_adicionales', []],
        ['espacios_detalle', []],
        ['desglose_precios', {}],
        ['desglose_impuestos', []],
        ['historial_pagos', []],
        ['datos_factura', {}],
        ['datos_fiscales', {}],
        ['detalles_evento', {}],
        ['notas_pdf', []]
    ].forEach(([field, fallback]) => {
        if (!Object.prototype.hasOwnProperty.call(next, field)) return;
        if (next[field] == null) next[field] = Array.isArray(fallback) ? [] : { ...fallback };
    });
    Object.keys(next).forEach((field) => {
        if (next[field] === undefined) delete next[field];
    });
    return next;
}

window.toggleCustomHorario = function (prefix) {
    const sel = document.getElementById(`${prefix}-horario`);
    const container = document.getElementById(`${prefix}-horario-custom`);
    if (sel && container) {
        if (sel.value === 'personalizado') container.classList.remove('hidden');
        else container.classList.add('hidden');
    }
}

function calculateDayByDayTotal(space, startStr, endStr, guests, options = {}) {
    if (!startStr) return { total: 0, details: [] };
    const endS = endStr || startStr;
    let rules = [];
    try { rules = typeof space.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space.precios_por_dia || []); } catch (e) { }
    if (!Array.isArray(rules) || rules.length === 0) rules = [{ min: 0, max: 999999, precios: { lunes: space.precio_base || 0, martes: space.precio_base || 0, miercoles: space.precio_base || 0, jueves: space.precio_base || 0, viernes: space.precio_base || 0, sabado: space.precio_base || 0, domingo: space.precio_base || 0 } }];

    const guestCount = parseInt(guests) || 1;
    let activeRule = rules.find(r => guestCount >= r.min && guestCount <= r.max);
    if (!activeRule) activeRule = rules[rules.length - 1];

    const prices = activeRule ? (activeRule.precios || {}) : {};
    let total = 0; let details = [];
    const start = new Date(startStr + 'T00:00:00'); const end = new Date(endS + 'T00:00:00'); const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']; const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let blockedDays = []; try { blockedDays = typeof space.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space.dias_bloqueados || []); } catch (e) { }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayIdx = d.getDay(); const key = keys[dayIdx];
        let price = parseFloat(prices[key] || 0);
        if (!options.ignoreBlocks && blockedDays.includes(key)) price = 0;
        total += price;
        details.push({ date: d.toLocaleDateString('es-MX'), dayName: names[dayIdx], price: price });
    }
    return { total, details };
}

function parseSpacesDetail(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function calculatePremontajeByDates(space, dates, guests) {
    const out = { total: 0, breakdown: [] };
    const arr = Array.isArray(dates) ? dates : [];
    const premPct = (typeof __orderGetPremPct === 'function') ? __orderGetPremPct() : 25;
    arr.forEach(ds => {
        const calc = calculateDayByDayTotal(space, ds, ds, guests, { ignoreBlocks: true });
        const base = parseFloat(calc.total || 0);
        const amount = base * (premPct / 100);
        out.total += amount;
        out.breakdown.push({ date: ds, base_day: base, porcentaje: premPct, amount });
    });
    return out;
}

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    if (id === 'preview-modal') {
        __cpSetExclusivePreviewMode(true);
        requestAnimationFrame(() => {
            __cpEnsurePdfEditingChrome();
            __cpSyncPdfEditMode();
            __cpRenderPdfInspector();
            __cpHighlightSelectedBaseTextBlock();
        });
    }
};
window.closeModal = (id, opts = {}) => {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    if (id === 'preview-modal') {
        __cpSetExclusivePreviewMode(false);
        __cpClosePdfInspector();
        __cpRenderPdfToolbar();
        __cpEnsureMarginGuideController()?.refresh();
        __cpClosePreviewTabIfNeeded();
    }
    if (id === 'preview-modal' && !options.skipSnapshot && !__cpPreviewModalSuppressCloseSnapshot) {
        __orderFinalizePendingSnapshot({ trigger: 'close', silent: false, enqueueOnFail: true });
    }
    if (id === 'preview-modal') __cpPreviewModalSuppressCloseSnapshot = false;
};
window.showToast = (msg, type = 'success') => {
    const c = document.getElementById('toast-container');
    if (!c) {
        try { console[type === 'error' ? 'error' : 'log'](String(msg || '')); } catch (_) { }
        return;
    }
    const e = document.createElement('div');
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
    e.innerText = msg;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3000);
};
function __cpEnsureBusyOverlay() {
    let overlay = document.getElementById('cp-pdf-busy-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'cp-pdf-busy-overlay';
    overlay.className = 'fixed inset-0 z-[410] hidden items-center justify-center bg-black/70 backdrop-blur-sm p-4';
    overlay.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 px-8 py-7 flex flex-col items-center text-center max-w-sm w-full"><div class="w-12 h-12 rounded-full border-4 border-gray-200 border-t-brand-red animate-spin mb-4"></div><p id="cp-pdf-busy-title" class="text-sm font-black uppercase tracking-wide text-gray-800">Guardando cotización...</p><p class="text-[11px] text-gray-500 mt-2">Espera un momento mientras se genera y guarda el PDF.</p></div>`;
    document.body.appendChild(overlay);
    return overlay;
}
let __cpBusyOverlayDepth = 0;
window.__cpShowBusyOverlay = function (message = 'Guardando cotización...') {
    const overlay = __cpEnsureBusyOverlay();
    const title = document.getElementById('cp-pdf-busy-title');
    if (title) title.innerText = String(message || 'Guardando cotización...');
    __cpBusyOverlayDepth += 1;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
};
window.__cpHideBusyOverlay = function () {
    const overlay = document.getElementById('cp-pdf-busy-overlay');
    if (!overlay) return;
    __cpBusyOverlayDepth = Math.max(0, __cpBusyOverlayDepth - 1);
    if (__cpBusyOverlayDepth > 0) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
};
async function __cpWithBusyOverlay(message, work) {
    window.__cpShowBusyOverlay(message);
    try {
        return await work();
    } finally {
        window.__cpHideBusyOverlay();
    }
}
function __cpOpenBlobInViewer(blob, title = 'Documento', popupRef = null) {
    const popup = popupRef || window.open('', '_blank');
    if (!popup) return false;
    const objectUrl = URL.createObjectURL(blob);
    const safeTitle = String(title || 'Documento').replace(/[<>&"]/g, '');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title><style>html,body{margin:0;height:100%;background:#111827;}iframe{border:0;width:100%;height:100%;background:#fff;}</style></head><body><iframe src="${objectUrl}" title="${safeTitle}"></iframe></body></html>`);
    popup.document.close();
    setTimeout(() => {
        try { URL.revokeObjectURL(objectUrl); } catch (_) { }
    }, 300000);
    return true;
}
window.openStoredDocument = async function (path) {
    const safePath = String(path || '').trim();
    if (!safePath) return window.showToast("Documento no disponible", "error");
    window.showToast("Abriendo documento...", "info");
    const popup = window.open('', '_blank');
    if (popup) {
        try {
            popup.document.open();
            popup.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cargando documento</title><style>html,body{height:100%;margin:0;font-family:Segoe UI,sans-serif;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;}</style></head><body>Cargando documento...</body></html>');
            popup.document.close();
        } catch (_) { }
    }
    try {
        const { data, error } = await window.globalPocketBase.storage.from('documentos-cp').createSignedUrl(safePath, 3600);
        if (error || !data?.signedUrl) throw (error || new Error('No se pudo firmar el documento.'));
        const response = await fetch(data.signedUrl, { method: 'GET', credentials: 'omit' });
        if (!response.ok) throw new Error(`No se pudo abrir el documento (${response.status}).`);
        const blob = await response.blob();
        if (!blob || !blob.size) throw new Error('Documento vacío.');
        if (!__cpOpenBlobInViewer(blob, safePath.split('/').pop() || 'Documento', popup)) {
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank');
            setTimeout(() => {
                try { URL.revokeObjectURL(objectUrl); } catch (_) { }
            }, 300000);
        }
    } catch (e) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) { }
        window.showToast("Error de acceso al archivo", "error");
    }
};

let confirmCallback = null;
let cancelCallback = null;
window.openConfirm = function (msg, confirmCb, isWarning = false, confirmTxt = "Confirmar", cancelTxt = "Cancelar", cancelCb = null) {
    const titleEl = document.getElementById('confirm-title');
    titleEl.innerHTML = isWarning ? `<i class="fa-solid fa-triangle-exclamation text-red-600 mb-2 text-2xl block"></i> ${msg}` : msg;
    confirmCallback = confirmCb;
    cancelCallback = cancelCb;
    document.getElementById('btn-confirm-action').innerText = confirmTxt;
    document.getElementById('btn-cancel-action').innerText = cancelTxt;
    window.openModal('generic-confirm-modal');
};

window.askCloseEditModal = function () {
    if (IS_ORDER_DETAIL_PAGE) return window.closeOrderEditorPage();
    window.openConfirm(
        "¿Deseas guardar los cambios en la cotización?",
        () => { window.processSaveOrder(); },
        false,
        "Guardar Cambios",
        "Cerrar sin guardar",
        () => { window.closeModal('order-edit-modal'); }
    );
};

window.askDeleteOrder = function (id, e) {
    if (e) e.stopPropagation();
    if (!__cpIsAdminProfile()) {
        window.showToast("Solo administradores pueden eliminar cotizaciones.", "error");
        return;
    }
    window.openConfirm("¿Eliminar cotización y TODOS sus archivos? Esta acción es irreversible.", async () => {
        try {
            window.showToast("Eliminando archivos...", "info");
            const prefix = String(id || "");
            const { data: files } = await window.globalPocketBase.storage.from('documentos-cp').list(prefix, { limit: 200 });
            if (files && files.length > 0) {
                await window.globalPocketBase.storage.from('documentos-cp').remove(files.map(x => `${prefix}/${x.name}`));
            }
            const { data: receiptFiles } = await window.globalPocketBase.storage.from('documentos-cp').list(`${prefix}/recibos`, { limit: 200 });
            if (receiptFiles && receiptFiles.length > 0) {
                await window.globalPocketBase.storage.from('documentos-cp').remove(receiptFiles.map(x => `${prefix}/recibos/${x.name}`));
            }
            const { error } = await __cpQuotesDelete(id);
            if (error) throw error;
            window.showToast("Cotización eliminada", "success");
            cpOrdersSaveViewState({ selectedOrderId: '' });
            window.loadOrders();
        } catch (err) {
            window.showToast("Error: " + err.message, "error");
        }
    }, true);
};

window.addEventListener('click', function (e) {
    const editModal = document.getElementById('order-edit-modal');
    const docsModal = document.getElementById('docs-modal');
    const previewModal = document.getElementById('preview-modal');
    const confirmModal = document.getElementById('generic-confirm-modal');
    const montajeModal = document.getElementById('montaje-modal');
    const orderDateModal = document.getElementById('order-date-modal');

    if (confirmModal && !confirmModal.classList.contains('hidden')) {
        if (e.target === confirmModal) window.closeModal('generic-confirm-modal');
        return;
    }

    if (editModal && e.target === editModal && !IS_ORDER_DETAIL_PAGE) window.askCloseEditModal();
    if (docsModal && e.target === docsModal) window.closeModal('docs-modal');
    if (previewModal && e.target === previewModal) {
        if (IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode()) return;
        window.closeModal('preview-modal');
    }
    if (montajeModal && e.target === montajeModal) montajeModal.classList.add('hidden');
    if (orderDateModal && e.target === orderDateModal) window.closeModal('order-date-modal');
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) { }
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (window.PB_CLIENT) {
        if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }
    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }

    try {
        window.currentUserProfile = authCtx?.profile || await __cpLoadCurrentUserProfile(session.user);
    } catch (_) {
        window.currentUserProfile = authCtx?.profile || session.user || null;
    }
    await __cpLoadSharedPdfStyleConfig();
    __cpInitPdfStyleEditor();
    cpOrdersApplyViewStateControls();

    document.getElementById('btn-confirm-action')?.addEventListener('click', () => { if (confirmCallback) confirmCallback(); window.closeModal('generic-confirm-modal'); });
    document.getElementById('btn-cancel-action')?.addEventListener('click', () => { if (cancelCallback) cancelCallback(); window.closeModal('generic-confirm-modal'); });
    document.getElementById('oed-status')?.addEventListener('change', () => {
        __orderApplyStatusVisual();
        __orderScheduleAutoSave();
    });

    document.getElementById('search-orders')?.addEventListener('input', (e) => filterOrders(e.target.value));
    document.getElementById('oed-start')?.addEventListener('change', function () { document.getElementById('oed-end').min = this.value; window.recalcTotal(); });
    document.getElementById('oed-end')?.addEventListener('change', () => window.recalcTotal());
    document.getElementById('oed-space')?.addEventListener('change', () => { window.updateB2bSelects(); window.recalcTotal(); const s = allSpaces.find(x => x.id == document.getElementById('oed-space').value); if (s) window.renderTaxesForSpace(s); });
    ['oed-premontaje', 'oed-premontaje-cortesia', 'oed-horas', 'oed-horas-cortesia'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', __orderApplyCourtesyLimitsFromInputs);
    });
    // Refresco inmediato de validaciones/precios al editar campos críticos.
    const __orderLiveRefresh = () => {
        __orderSaveActiveFromForm();
        window.recalcTotal();
    };
    ['oed-guests', 'oed-start', 'oed-end', 'oed-premontaje', 'oed-premontaje-cortesia', 'oed-horas', 'oed-horas-cortesia', 'oed-horas-price', 'oed-horario', 'oed-horario-start', 'oed-horario-end', 'oed-horario-price'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', __orderLiveRefresh);
        el.addEventListener('change', __orderLiveRefresh);
    });
    document.getElementById('new-concept-select')?.addEventListener('change', function () { const c = catalogConcepts.find(x => x.id == this.value); if (c) document.getElementById('new-concept-amount').value = c.precio_sugerido; });
    const today = __orderTodayISO();
    const startEl = document.getElementById('oed-start');
    const endEl = document.getElementById('oed-end');
    if (startEl) startEl.min = today;
    if (endEl) endEl.min = today;
    if (!IS_ORDER_DETAIL_PAGE && !IS_ORDER_PREVIEW_PAGE) {
        window.addEventListener('storage', (ev) => {
            if (ev.key === __ORDER_REFRESH_KEY) window.loadOrders();
        });
    }
    await Promise.all([loadTaxes(), loadSpaces(), loadConcepts(), __orderLoadConvenioCatalog()]); await window.loadOrders();
    await __orderProcessSnapshotQueue();
    if (IS_ORDER_PREVIEW_PAGE) {
        const params = new URLSearchParams(window.location.search || '');
        const quoteId = String(params.get('quote') || '').trim();
        const previewDoc = String(params.get('previewDoc') || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
        const previewAction = String(params.get('previewAction') || '').toLowerCase();
        const mainWrap = document.querySelector('main');
        if (mainWrap) mainWrap.classList.add('hidden');
        document.getElementById('order-edit-modal')?.classList.add('hidden');
        document.getElementById('orders-list-section')?.classList.add('hidden');
        document.getElementById('editor-loading')?.classList.add('hidden');
        if (!quoteId) {
            window.showToast("No se indicó cotización para vista previa.", "error");
            return;
        }
        if (previewDoc === 'order' && previewAction === 'generate') await window.previewOrderForGeneration(quoteId);
        else await window.openPDFPreview(quoteId, previewDoc);
        return;
    }
    if (IS_ORDER_DETAIL_PAGE) {
        const quoteId = new URLSearchParams(window.location.search || '').get('quote');
        if (!quoteId) {
            window.showToast("No se indicó cotización.", "error");
            return;
        }
        await window.openOrderEditModal(quoteId);
    }
});

async function loadTaxes() {
    const tenant = __orderResolveTenantSlug();
    let rows = [];
    try {
        const { data } = await window.tenantPocketBase.from('impuestos').select('*').order('nombre', { ascending: true });
        rows = data || [];
    } catch (_) {
        rows = [];
    }
    dbTaxes = __orderFilterRowsByTenant(rows, tenant);
    if (!dbTaxes.length && window.globalPocketBase && tenant) {
        try {
            const { data } = await window.globalPocketBase.from('impuestos').select('*').eq('tenant', tenant);
            dbTaxes = __orderFilterRowsByTenant(data || [], tenant);
        } catch (_) { }
    }
}
async function loadSpaces() {
    const tenant = __orderResolveTenantSlug();
    const { data } = await window.tenantPocketBase.from('espacios').select('*');
    allSpaces = __orderFilterRowsByTenant(data || [], tenant);
}
async function loadConcepts() {
    const tenant = __orderResolveTenantSlug();
    const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true);
    catalogConcepts = __orderFilterRowsByTenant(data || [], tenant);
}

function __orderFormatUserNameFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    const candidates = [
        record.login_username,
        record.user_name,
        record.username,
        record.Usernames,
        record.full_name,
        record.nombre,
        record.name,
        record.display_name
    ];
    const resolved = candidates.map((v) => String(v || '').trim()).find(Boolean);
    if (resolved) return resolved;
    const email = String(record.email || record.correo || '').trim();
    return email ? email.split('@')[0] : '';
}

function __orderLooksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function __orderIsNumericLike(value) {
    return /^[0-9]+$/.test(String(value || '').trim());
}

function __orderLooksLikePbRecordId(value) {
    return /^[a-z0-9]{15}$/i.test(String(value || '').trim());
}

function __orderLooksLikeMongoObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function __orderLooksLikeOpaqueActorId(value) {
    const safe = String(value || '').trim();
    if (!safe || safe.includes('@')) return false;
    if (!/^[a-z0-9_-]+$/i.test(safe)) return false;
    if (safe.length < 12) return false;
    if (/\d/.test(safe) || safe.includes('-') || safe.includes('_')) return true;
    return /^[a-z0-9]{12,}$/i.test(safe);
}

function __orderIsIdentifierLike(value) {
    const safe = String(value || '').trim();
    if (!safe) return false;
    return __orderLooksLikeUuid(safe)
        || __orderIsNumericLike(safe)
        || __orderLooksLikePbRecordId(safe)
        || __orderLooksLikeMongoObjectId(safe)
        || __orderLooksLikeOpaqueActorId(safe);
}

function __orderSanitizeActorName(value) {
    const safe = String(value || '').trim();
    if (!safe) return '';
    if (safe.includes('@')) return safe.split('@')[0];
    if (__orderIsIdentifierLike(safe)) return '';
    return safe;
}

function __orderRegisterUserRecord(record) {
    if (!record || typeof record !== 'object') return;
    const name = __orderFormatUserNameFromRecord(record);
    if (!name) return;
    const aliases = [
        record?.id,
        record?.user_id,
        record?.userId,
        record?.login_username,
        record?.user_name,
        record?.username,
        record?.email ? String(record.email).split('@')[0] : ''
    ];
    aliases
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((alias) => {
            __orderUsersById[alias] = name;
        });
}

function __orderResolveOrderActorId(order, mode = 'created') {
    if (!order || typeof order !== 'object') return '';
    const candidates = mode === 'updated'
        ? [
            order.modificado_por,
            order.modificado_por,
            order.updated_by,
            order.updated_by_id,
            order.modificado_por_id,
            order.last_modified_by,
            order.last_editor_id,
            order.editor_id
        ]
        : [
            order.creado_por,
            order.created_by,
            order.created_by_id,
            order.creado_por_id,
            order.user_id,
            order.userId,
            order.creator_id,
            order.autor_id
        ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __orderResolveOrderActorName(order, mode = 'created') {
    if (!order || typeof order !== 'object') return '---';
    const actorId = __orderResolveOrderActorId(order, mode);
    if (actorId && __orderUsersById[actorId]) return __orderUsersById[actorId];
    const direct = mode === 'updated'
        ? [
            order.modificado_por_nombre,
            order.ultimo_editor_nombre,
            order.updated_by_name,
            order.last_modified_name,
            order.modificado_por_username,
            order.ultimo_editor_username,
            order.updated_by_username,
            order.edited_by_username,
            order.modificado_por_login
        ]
        : [
            order.creado_por_nombre,
            order.creador_nombre,
            order.created_by_name,
            order.creado_por_username,
            order.creador_username,
            order.created_by_username,
            order.creado_por_login,
            order.created_by_login
        ];
    const directName = direct
        .map((value) => __orderSanitizeActorName(value))
        .find((value) => value && (!actorId || value !== actorId));
    if (directName) return directName;
    if (actorId) {
        if (actorId.includes('@')) return actorId.split('@')[0];
        if (!__orderIsIdentifierLike(actorId)) return actorId;
    }
    if (mode === 'updated') return __orderResolveOrderActorName(order, 'created') || 'Usuario';
    return 'Usuario';
}

function __orderRegisterActorAliasFromOrder(order, mode = 'created') {
    if (!order || typeof order !== 'object') return;
    const actorId = __orderResolveOrderActorId(order, mode);
    if (!actorId) return;
    const directCandidates = mode === 'updated'
        ? [
            order.modificado_por_nombre,
            order.ultimo_editor_nombre,
            order.updated_by_name,
            order.last_modified_name,
            order.modificado_por_username,
            order.ultimo_editor_username,
            order.updated_by_username,
            order.edited_by_username,
            order.modificado_por_login
        ]
        : [
            order.creado_por_nombre,
            order.creador_nombre,
            order.created_by_name,
            order.creado_por_username,
            order.creador_username,
            order.created_by_username,
            order.creado_por_login,
            order.created_by_login
        ];
    const directName = directCandidates
        .map((value) => __orderSanitizeActorName(value))
        .find(Boolean);
    if (directName) __orderUsersById[actorId] = directName;
}

function __orderResolveAuditTimestamp(order, mode = 'created') {
    if (!order || typeof order !== 'object') return '';
    const candidates = mode === 'updated'
        ? [order.updated_at, order.updated, order.modificado_en, order.last_modified_at, order.last_update]
        : [order.created_at, order.created, order.fecha_creacion, order.creado_en];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __orderFormatAuditTooltipDateTime(rawValue) {
    const safe = String(rawValue || '').trim();
    if (!safe) return '';
    const parsed = new Date(safe);
    if (Number.isNaN(parsed.getTime())) return '';
    try {
        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Mexico_City'
        }).format(parsed);
    } catch (_) {
        return parsed.toLocaleString('es-MX');
    }
}

function __orderEscapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function __orderBuildAuditTooltip(order, mode = 'created') {
    const label = mode === 'updated' ? 'Última edición' : 'Creada';
    const formatted = __orderFormatAuditTooltipDateTime(__orderResolveAuditTimestamp(order, mode));
    return formatted ? `${label}: ${formatted}` : '';
}

async function __orderPrimeOrderUsers(orders = []) {
    const list = Array.isArray(orders) ? orders : [];
    const ids = new Set();
    __orderUsersById = Object.create(null);
    const currentActorId = __orderResolveCurrentActorId();
    const currentActorName = __orderSanitizeActorName(__orderResolveCurrentActorName());
    if (currentActorId && currentActorName) __orderUsersById[currentActorId] = currentActorName;
    list.forEach((order) => {
        const createdId = __orderResolveOrderActorId(order, 'created');
        const updatedId = __orderResolveOrderActorId(order, 'updated');
        __orderRegisterActorAliasFromOrder(order, 'created');
        __orderRegisterActorAliasFromOrder(order, 'updated');
        if (createdId) ids.add(createdId);
        if (updatedId) ids.add(updatedId);
    });
    const missing = Array.from(ids).filter((id) => id && !__orderUsersById[id]);
    if (!missing.length) return;
    const sources = [window.globalPocketBase, window.tenantPocketBase].filter(Boolean);
    for (let i = 0; i < missing.length; i += 20) {
        const chunk = missing.slice(i, i + 20);
        const textChunk = chunk.filter((value) => !__orderIsNumericLike(value) && !__orderLooksLikeUuid(value));
        if (!chunk.length) continue;
        for (const source of sources) {
            try {
                const { data } = await source.from('app_users').select('*').in('id', chunk);
                (data || []).forEach(__orderRegisterUserRecord);
            } catch (_) { }
            if (textChunk.length) {
                try {
                    const { data } = await source.from('app_users').select('*').in('login_username', textChunk);
                    (data || []).forEach(__orderRegisterUserRecord);
                } catch (_) { }
                try {
                    const { data } = await source.from('app_users').select('*').in('username', textChunk);
                    (data || []).forEach(__orderRegisterUserRecord);
                } catch (_) { }
            }
        }
    }
    const unresolved = missing.filter((id) => id && !__orderUsersById[id]);
    if (!unresolved.length) return;
    for (const source of sources) {
        try {
            const { data } = await source
                .from('app_users')
                .select('*');
            (data || []).forEach(__orderRegisterUserRecord);
        } catch (_) { }
    }
}

window.loadOrders = async function () {
    const viewState = cpOrdersSaveViewState();
    cpOrdersApplyViewStateControls(viewState);
    const { data, error } = await __cpQuotesList({ sort: '-created_at' });
    if (error) {
        window.showToast(`No se pudieron cargar cotizaciones: ${error.message || error}`, 'error');
        allOrders = [];
    } else {
        allOrders = (data || []).map(__orderHydrateQuotePricing);
    }
    await __orderPrimeOrderUsers(allOrders);
    const searchTerm = document.getElementById('search-orders')?.value || '';
    cpOrdersRestoringViewState = true;
    try {
        filterOrders(searchTerm, { skipSave: true });
    } finally {
        cpOrdersRestoringViewState = false;
    }
    cpOrdersRestoreViewStateAfterRender(viewState);
};

function renderOrdersTable(data) {
    const t = document.getElementById('orders-table'); if (!t) return; t.innerHTML = '';
    if (!data.length) { t.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-400">Sin registros.</td></tr>'; return; }
    const canDelete = __cpIsAdminProfile();
    data.forEach(o => {
        let sColor = 'bg-gray-100 text-gray-600', sText = 'Pendiente', missingIcons = [];
        const isConvenio = __orderIsConvenioOrder(o);
        const convenioEvidenceCount = __orderGetConvenioEvidence(o).length;
        if (o.status === 'aprobada') {
            sColor = 'bg-blue-100 text-blue-700';
            sText = 'Aprobada';
            if (isConvenio) {
                if (convenioEvidenceCount < 3) missingIcons.push('<i class="fa-solid fa-camera" title="Falta Evidencia"></i>');
            } else {
                if (!o.factura_xml_url) missingIcons.push('<i class="fa-solid fa-file-invoice" title="Falta Factura"></i>');
                if (__orderParsePaymentsList(o).length === 0) missingIcons.push('<i class="fa-solid fa-money-bill-wave" title="Falta Pago"></i>');
            }
        }
        if (o.status === 'finalizada') { sColor = 'bg-green-100 text-green-700 border border-green-200'; sText = 'Finalizada'; }
        if (o.status === 'rechazada') { sColor = 'bg-red-50 text-red-600'; sText = 'Rechazada'; }
        let alertsHTML = ''; if (missingIcons.length > 0 && o.status === 'aprobada') alertsHTML = `<div class="flex gap-2 justify-center mt-1.5 text-[10px] text-red-400">${missingIcons.join('')}</div>`;

        const tr = document.createElement('tr'); tr.className = "border-b hover:bg-gray-50 transition group cursor-pointer";
        tr.dataset.orderId = o.id;
        tr.onclick = (e) => {
            if (!e.target.closest('button')) {
                cpOrdersSaveViewState({ selectedOrderId: o.id });
                window.openOrderEditorPage(o.id);
            }
        };

        const folioUnificado = __orderResolveQuoteFolio(o);
        const details = parseSpacesDetail(o.espacios_detalle);
        const spaceLabel = details.length > 1
            ? `${details[0]?.espacio_nombre || o.espacio_nombre} + ${details.length - 1}`
            : (o.espacio_nombre || '--');
        const dateLabel = (o.fecha_inicio && o.fecha_fin)
            ? (o.fecha_inicio === o.fecha_fin ? window.safeFormatDate(o.fecha_inicio) : `${window.safeFormatDate(o.fecha_inicio)} - ${window.safeFormatDate(o.fecha_fin)}`)
            : '--';

        const quoteName = (o.nombre_cotizacion || o.detalles_evento?.nombre_cotizacion || '').trim();
        const createdBy = __orderResolveOrderActorName(o, 'created');
        const updatedBy = __orderResolveOrderActorName(o, 'updated');
        const createdTooltip = __orderBuildAuditTooltip(o, 'created');
        const updatedTooltip = __orderBuildAuditTooltip(o, 'updated');
        const createdTooltipAttr = createdTooltip ? ` title="${__orderEscapeHtmlAttr(createdTooltip)}"` : '';
        const updatedTooltipAttr = updatedTooltip ? ` title="${__orderEscapeHtmlAttr(updatedTooltip)}"` : '';
        const deleteCell = canDelete
            ? `<button type="button" onclick="window.askDeleteOrder('${o.id}', event)" class="text-gray-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>`
            : `<span class="text-[10px] text-gray-300">—</span>`;
        const amountState = __orderResolveOrderTableAmountState(o);
        const totalDisplayHtml = isConvenio
            ? `<div class="flex flex-col items-end gap-1">
                <div class="flex items-center justify-end gap-2">
                    ${amountState.badgeHtml}
                    <span class="${amountState.textClass}">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amountState.amount)}</span>
                </div>
                ${amountState.label ? `<span class="text-[10px] font-black ${amountState.textClass} uppercase tracking-wide">${amountState.label}</span>` : ''}
            </div>`
            : `<div class="flex flex-col items-end gap-1">
                <div class="flex items-center justify-end gap-2">
                    <span class="${amountState.textClass}">${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amountState.amount)}</span>
                </div>
                ${amountState.label ? `<span class="text-[10px] font-black ${amountState.textClass} uppercase tracking-wide">${amountState.label}</span>` : ''}
            </div>`;
        tr.innerHTML = `<td class="p-4 font-black text-brand-dark">${folioUnificado}</td><td class="p-4 font-bold text-xs text-gray-700">${quoteName ? `<span class="text-brand-dark block">${quoteName}</span><span class="text-[10px] text-gray-500 font-semibold">${o.cliente_nombre}</span>` : o.cliente_nombre}</td><td class="p-4 text-xs"><span class="font-bold block">${spaceLabel}</span><span class="text-gray-500 font-mono">${dateLabel}</span></td><td class="p-4 text-right font-mono font-bold text-xs">${totalDisplayHtml}</td><td class="p-4 text-center"><span class="${sColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider">${sText}</span>${alertsHTML}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${createdTooltipAttr}>${createdBy}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${updatedTooltipAttr}>${updatedBy}</td><td class="p-4 text-center"><button type="button" onclick="event.stopPropagation(); window.openDocsModal('${o.id}')" class="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-brand-dark px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 mx-auto"><i class="fa-solid fa-folder-open text-brand-red"></i> Expediente</button></td><td class="p-4 text-center">${deleteCell}</td>`;
        t.appendChild(tr);
    });
}

window.openOrderEditorPage = function (id) {
    cpOrdersSaveViewState({ selectedOrderId: id });
    const url = `order_detail.html?quote=${encodeURIComponent(id)}`;
    window.open(url, '_blank', 'noopener');
};

window.openOrderPreviewTab = function (id, docType = 'quote', action = 'view') {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    const safeDoc = String(docType || '').toLowerCase() === 'order' ? 'order' : 'quote';
    const safeAction = String(action || '').toLowerCase() === 'generate' ? 'generate' : 'view';
    const url = `order_detail.html?quote=${encodeURIComponent(safeId)}&previewOnly=1&previewDoc=${encodeURIComponent(safeDoc)}&previewAction=${encodeURIComponent(safeAction)}`;
    window.open(url, '_blank', 'noopener');
};

function filterOrders(term = '', options = {}) {
    const lower = String(term || '').toLowerCase();
    renderOrdersTable(allOrders.filter(o => {
        const folioUnificado = __orderResolveQuoteFolio(o);
        const quoteName = (o.nombre_cotizacion || o.detalles_evento?.nombre_cotizacion || '');
        return (o.cliente_nombre || '').toLowerCase().includes(lower) ||
            folioUnificado.toLowerCase().includes(lower) ||
            quoteName.toLowerCase().includes(lower);
    }));
    if (!options.skipSave && !cpOrdersRestoringViewState) cpOrdersSaveViewState();
}

window.handleMontajeInput = function (prefix) {
    const val = parseInt(document.getElementById(prefix + '-premontaje').value) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    if (window.finalMontajeDates.length > val) window.finalMontajeDates = window.finalMontajeDates.slice(0, val);
    window.actualizarLabelMontaje(prefix);
    window.recalcTotal();
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

    const sDate = document.getElementById('oed-start').value;
    if (!sDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    document.getElementById('montaje-limit-num').innerText = diasM;
    window.tempMontajeDates = [...window.finalMontajeDates].slice(0, diasM);

    const dp = document.getElementById('montaje-date-input');
    const maxD = new Date(sDate + 'T00:00:00');
    maxD.setDate(maxD.getDate() - 1);
    dp.max = maxD.toISOString().split('T')[0];
    dp.value = '';

    window.renderListaMontaje();
    window.openModal('montaje-modal');
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
        list.innerHTML += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 shadow-sm"><span class="text-xs font-bold text-gray-700">${window.safeFormatDate(d)}</span><button type="button" onclick="window.removeMontajeDate(${i})" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button></li>`;
    });
}

window.confirmMontajeDates = function () {
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value) || 0;
    if (window.tempMontajeDates.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");

    window.finalMontajeDates = [...window.tempMontajeDates];
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    window.closeModal('montaje-modal');
    window.recalcTotal();
}

window.updateB2bSelects = function (skipDefaults = false) {
    const spaceId = document.getElementById('oed-space').value;
    const spaceObj = allSpaces.find(s => s.id == spaceId);
    const selHorario = document.getElementById('oed-horario');
    selHorario.innerHTML = '';

    let b2b = {}; try { b2b = typeof spaceObj?.config_b2b === 'string' ? JSON.parse(spaceObj.config_b2b) : (spaceObj?.config_b2b || {}); } catch (e) { }
    let h = b2b.horarios || [];
    if (!Array.isArray(h)) {
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        h = Object.keys(h).map(k => ({ nombre: mapNames[k] || k, start: h[k]?.start, end: h[k]?.end, price: h[k]?.price })).filter(item => item.start && item.end);
    }

    if (h.length > 0) {
        h.forEach(item => {
            selHorario.innerHTML += `<option value="${item.nombre}" data-price="${item.price}">${item.nombre} (${item.start} a ${item.end})</option>`;
        });
    }
    selHorario.innerHTML += '<option value="personalizado" data-price="0">Personalizado...</option>';

    if (!skipDefaults) {
        document.getElementById('oed-premontaje-price').value = parseFloat(b2b.precio_montaje) || 0;
        document.getElementById('oed-horas-price').value = parseFloat(b2b.precio_hora_extra) || 0;
        document.getElementById('oed-premontaje').value = 0;
        document.getElementById('oed-horas').value = 0;
        document.getElementById('oed-horario-start').value = '';
        document.getElementById('oed-horario-end').value = '';
        document.getElementById('oed-horario-price').value = 0;
        window.finalMontajeDates = [];
        window.actualizarLabelMontaje('oed');
        window.toggleCustomHorario('oed');
    }
}

window.openOrderEditModal = async function (id) {
    const order = allOrders.find(o => o.id === id); if (!order) return;
    await loadClientProfilesForOrderModal();
    currentPreviewOrder = order;

    document.getElementById('oed-id').value = order.id; document.getElementById('oed-client').value = order.cliente_nombre || ''; document.getElementById('oed-status').value = order.status;
    const statusSelect = document.getElementById('oed-status'); const currentLevel = STATUS_LEVEL[order.status] || 0; Array.from(statusSelect.options).forEach(opt => opt.disabled = (STATUS_LEVEL[opt.value] || 0) < currentLevel);
    document.getElementById('oed-phone').value = order.cliente_contacto || ''; document.getElementById('oed-email').value = order.cliente_email || ''; document.getElementById('fiscal-rfc-re').value = order.cliente_rfc || ''; document.getElementById('oed-guests').value = order.personas || 1;

    const requestedClientId = String(order.cliente_id || '').trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) await loadClientProfilesForOrderModal();
    const selectedProfileId = __cpApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
        const profile = orderClientProfilesById[selectedProfileId];
        if (profile) {
            document.getElementById('oed-client').value = profile.nombre_completo || (order.cliente_nombre || '');
            document.getElementById('oed-phone').value = (profile.telefono || order.cliente_contacto || '');
            document.getElementById('oed-email').value = (profile.correo || order.cliente_email || '');
            document.getElementById('fiscal-rfc-re').value = (profile.rfc || order.cliente_rfc || '');
        }
    }

    document.getElementById('oed-start').value = order.fecha_inicio; document.getElementById('oed-end').value = order.fecha_fin;

    const sel = document.getElementById('oed-space'); sel.innerHTML = '';
    allSpaces.forEach(s => sel.innerHTML += `<option value="${s.id}" ${s.id == order.espacio_id ? 'selected' : ''}>${s.nombre}</option>`);

    window.updateB2bSelects(true);

    let dbConcepts = __orderNormalizeConceptsArray(order.conceptos_adicionales);

    let pureConcepts = []; let cHorarioText = null, cMontaje = 0, cHoras = 0;
    let isCustomHorario = false, customStart = '', customEnd = '', customHorarioPrice = 0;
    let cMontajePrice = 0, cHorasPrice = 0;

    window.finalMontajeDates = [];

    dbConcepts.forEach(c => {
        if (c.type === 'b2b_horario' || (c.description && c.description.startsWith('Horario:'))) {
            cHorarioText = c.meta?.selected || c.description.replace('Horario:', '').trim();
            if (c.meta?.selected === 'personalizado' || !c.meta?.selected) {
                isCustomHorario = true;
                customHorarioPrice = parseFloat(c.amount) || 0;
                let savedName = c.meta?.custom_name || cHorarioText;
                let times = savedName.match(/\d{2}:\d{2}/g);
                if (times && times.length >= 2) { customStart = times[0]; customEnd = times[1]; }
            }
        }
        else if (c.type === 'b2b_montaje' || (c.description && c.description.startsWith('Montaje'))) {
            cMontaje = c.meta?.days || parseInt(c.description.match(/\d+/)?.[0] || 0);
            cMontajePrice = c.meta?.unit_price || (cMontaje > 0 ? parseFloat(c.amount) / cMontaje : 0);
            if (c.meta?.dates) window.finalMontajeDates = c.meta.dates;
        }
        else if (c.type === 'b2b_horas' || (c.description && c.description.startsWith('Horas Extras'))) {
            cHoras = c.meta?.hours || parseInt(c.description.match(/\d+/)?.[0] || 0);
            cHorasPrice = c.meta?.unit_price || (cHoras > 0 ? parseFloat(c.amount) / cHoras : 0);
        }
        else pureConcepts.push(c);
    });

    currentConcepts = pureConcepts;

    const selHorario = document.getElementById('oed-horario');
    let found = false;

    if (cHorarioText && !isCustomHorario) {
        Array.from(selHorario.options).forEach(opt => {
            if (opt.text.includes(cHorarioText) || cHorarioText.includes(opt.value)) { opt.selected = true; found = true; }
        });
    }

    if (isCustomHorario || (!found && cHorarioText && cHorarioText !== 'Sin horario configurado')) {
        selHorario.value = 'personalizado';
        document.getElementById('oed-horario-start').value = customStart;
        document.getElementById('oed-horario-end').value = customEnd;
        document.getElementById('oed-horario-price').value = customHorarioPrice || (dbConcepts.find(c => c.type === 'b2b_horario' || (c.description && c.description.startsWith('Horario:')))?.amount || 0);
    }

    window.toggleCustomHorario('oed');

    document.getElementById('oed-premontaje').value = cMontaje;
    document.getElementById('oed-premontaje-price').value = cMontajePrice;
    window.handleMontajeInput('oed');

    document.getElementById('oed-horas').value = cHoras;
    document.getElementById('oed-horas-price').value = cHorasPrice;

    if (document.getElementById('oed-adj-type')) { document.getElementById('oed-adj-type').value = order.tipo_ajuste || 'ninguno'; document.getElementById('oed-adj-val').value = order.valor_ajuste || 0; document.getElementById('oed-adj-unit').value = order.ajuste_es_porcentaje ? 'percent' : 'fixed'; }

    const isLocked = ['aprobada', 'finalizada'].includes(order.status);
    document.querySelectorAll('#order-edit-modal input, #order-edit-modal select').forEach(i => { if (i.id !== 'btn-save-progress' && i.id !== 'oed-status') i.disabled = isLocked; });
    ['oed-quote-name', 'oed-status'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = isLocked && id !== 'oed-status'; });
    document.getElementById('oed-btn-montaje').disabled = isLocked;

    const spaceObj = allSpaces.find(s => s.id == order.espacio_id);
    const breakdownForEditor = __orderParseRecordJson(order.desglose_precios);
    const activeTaxIds = __orderNormalizeTaxIds(
        breakdownForEditor?.impuestos_detalle
        || __orderResolveTaxIdsFromDetails(order)
    );
    if (spaceObj) window.renderTaxesForSpace(spaceObj, activeTaxIds);

    const conceptSel = document.getElementById('new-concept-select'); conceptSel.innerHTML = '<option value="">-- Agregar --</option>'; catalogConcepts.forEach(c => conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    const extraConceptsToggle = document.getElementById('oed-has-extra-concepts'); if (extraConceptsToggle) extraConceptsToggle.checked = (currentConcepts || []).length > 0;

    window.renderConceptsList(); window.recalcTotal(); window.openModal('order-edit-modal');

    // Nueva lógica para expediente
    window.updateExpedienteUI(order);
};

window.renderTaxesForSpace = function (spaceObj, activeTaxIds = null) {
    const container = document.getElementById('oed-taxes-list'); if (!container) return;
    const selectedTaxIds = (Array.isArray(activeTaxIds) && activeTaxIds.length ? activeTaxIds : window.parseIds(spaceObj.impuestos_ids || spaceObj.impuestos)).map((v) => String(v));
    container.dataset.taxIds = JSON.stringify(selectedTaxIds);
    const taxes = selectedTaxIds.map((taxId) => __orderResolveTaxRecord(taxId, spaceObj)).filter(Boolean);
    container.innerHTML = taxes.length
        ? taxes.map((tax) => `<div class="text-[10px] text-gray-500 font-bold uppercase">${tax.nombre}</div>`).join('')
        : '<p class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</p>';
};

window.updateConceptAmount = function (index, newVal) { currentConcepts[index].amount = parseFloat(newVal) || 0; currentConcepts[index].value = parseFloat(newVal) || 0; window.recalcTotal(); };
window.updateConceptName = function (index, newName) { currentConcepts[index].description = newName; };

window.toggleExtraConceptsSection = function (forceChecked = null) {
    const toggle = document.getElementById('oed-has-extra-concepts');
    const section = document.getElementById('oed-extra-concepts-section');
    if (!toggle || !section) return;
    if (typeof forceChecked === 'boolean') toggle.checked = forceChecked;
    if ((currentConcepts || []).length > 0) toggle.checked = true;
    section.classList.toggle('hidden', !toggle.checked);
};

window.renderConceptsList = function () {
    const tbody = document.getElementById('concepts-list'); if (!tbody) return; tbody.innerHTML = '';
    const isLocked = currentPreviewOrder && ['aprobada', 'finalizada'].includes(currentPreviewOrder.status);
    window.toggleExtraConceptsSection();
    if (!currentConcepts || currentConcepts.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="p-3 text-center text-gray-400 italic text-[10px]">Sin conceptos adicionales extra.</td></tr>'; return; }

    currentConcepts.forEach((c, idx) => {
        const val = parseFloat(c.amount || c.value || 0);
        const desc = c.description || c.concepto || c.nombre || 'Concepto';
        const btn = isLocked ? '' : `<button type="button" onclick="window.removeConceptRow(${idx})" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`;
        const descCol = isLocked ? desc : `<input type="text" value="${desc}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none transition" onchange="window.updateConceptName(${idx}, this.value)">`;
        const valCol = isLocked ? `$${val.toLocaleString()}` : `$<input type="number" value="${val}" min="0" class="w-20 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none text-right font-bold transition" onchange="window.updateConceptAmount(${idx}, this.value)">`;
        tbody.innerHTML += `<tr><td class="p-2 border-b text-slate-700">${descCol}</td><td class="p-2 border-b text-right text-xs">${valCol}</td><td class="p-2 border-b text-center">${btn}</td></tr>`;
    });
};

window.updateSummaryUI = function () {
    const sDate = document.getElementById('oed-start').value;
    const eDate = document.getElementById('oed-end').value;
    document.getElementById('sum-dates').innerText = (sDate && eDate) ? (sDate === eDate ? window.safeFormatDate(sDate) : `${window.safeFormatDate(sDate)} al ${window.safeFormatDate(eDate)}`) : '--';
    document.getElementById('sum-guests').innerText = (document.getElementById('oed-guests').value || '0') + ' px';

    const selOpt = document.getElementById('oed-horario').options[document.getElementById('oed-horario').selectedIndex];
    let timeText = selOpt ? selOpt.text : '--';
    if (selOpt && selOpt.value === 'personalizado') {
        const tStart = document.getElementById('oed-horario-start').value;
        const tEnd = document.getElementById('oed-horario-end').value;
        timeText = (tStart && tEnd) ? `${tStart} a ${tEnd}` : 'Personalizado';
    }
    document.getElementById('sum-schedule').innerText = timeText;

    const diasM = parseInt(document.getElementById('oed-premontaje').value) || 0;
    let mtjTxt = diasM > 0 ? `${diasM} día(s)` : '--';
    if (diasM > 0 && window.finalMontajeDates.length) mtjTxt += `<br><span class="text-[9px] font-normal text-gray-400">(${window.finalMontajeDates.map(d => window.safeFormatDate(d)).join(', ')})</span>`;
    document.getElementById('sum-montaje').innerHTML = mtjTxt;

    const hrsE = parseInt(document.getElementById('oed-horas').value) || 0;
    document.getElementById('sum-hextras').innerText = hrsE > 0 ? `${hrsE} hr(s)` : '--';
};

window.recalcTotal = function () {
    const spaceId = document.getElementById('oed-space').value; const spaceObj = allSpaces.find(s => s.id == spaceId);
    const sDate = document.getElementById('oed-start').value; const eDate = document.getElementById('oed-end').value; const guests = parseInt(document.getElementById('oed-guests').value, 10) || 1;

    let base = 0; if (spaceObj && sDate && eDate) { base = calculateDayByDayTotal(spaceObj, sDate, eDate, guests).total; } else if (spaceObj) { base = parseFloat(spaceObj.precio_base); }

    let pHora = parseFloat(document.getElementById('oed-horas-price').value) || 0;

    const selOpt = document.getElementById('oed-horario').options[document.getElementById('oed-horario').selectedIndex];
    let costoHorario = 0;
    if (selOpt && selOpt.value === 'personalizado') costoHorario = parseFloat(document.getElementById('oed-horario-price').value) || 0;
    else if (selOpt) costoHorario = parseFloat(selOpt.getAttribute('data-price')) || 0;

    const diasM = parseInt(document.getElementById('oed-premontaje').value) || 0; const hrsE = parseInt(document.getElementById('oed-horas').value) || 0;

    let montajeTotal = 0;
    if (diasM > 0 && spaceObj && window.finalMontajeDates.length === diasM) {
        const prem = calculatePremontajeByDates(spaceObj, window.finalMontajeDates, guests);
        montajeTotal = prem.total;
        const avg = diasM > 0 ? (prem.total / diasM) : 0;
        document.getElementById('oed-premontaje-price').value = avg.toFixed(2);
    } else {
        const fallbackUnit = parseFloat(document.getElementById('oed-premontaje-price').value) || 0;
        montajeTotal = diasM * fallbackUnit;
    }

    let b2bCost = costoHorario + montajeTotal + (hrsE * pHora);

    let conceptsHtml = '';
    let conceptsSum = 0;
    (currentConcepts || []).forEach(c => {
        let amt = parseFloat(c.amount || c.value || 0);
        conceptsSum += amt;
        conceptsHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span><i class="fa-solid fa-plus text-gray-300 mr-1"></i> ${c.description}</span><span>+${amt.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`;
    });
    document.getElementById('oed-summary-concepts').innerHTML = conceptsHtml;

    let sub = base + conceptsSum + b2bCost;

    const adjType = document.getElementById('oed-adj-type').value; const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; const isPercent = document.getElementById('oed-adj-unit').value === 'percent';
    let adjAmount = 0; if (adjType !== 'ninguno') { adjAmount = isPercent ? sub * (adjVal / 100) : adjVal; if (adjType === 'descuento') sub -= adjAmount; else sub += adjAmount; }

    const activeTaxIds = (() => {
        const box = document.getElementById('oed-taxes-list');
        const fromBox = box ? window.parseIds(box.dataset.taxIds || '[]').map(String).filter(Boolean) : [];
        return fromBox.length ? fromBox : window.parseIds(spaceObj?.impuestos_ids || spaceObj?.impuestos).map(String);
    })();
    let taxTotal = 0; let taxHtml = '';
    activeTaxIds.forEach(taxId => { const t = __orderResolveTaxRecord(taxId, spaceObj); if (t) { const taxVal = sub * __orderResolveTaxRate(t); taxTotal += taxVal; taxHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span>${t.nombre}</span><span>+${taxVal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`; } });

    document.getElementById('oed-tax-summary-display').innerHTML = taxHtml;
    const taxEl = document.getElementById('lbl-tax-total'); if (taxEl) taxEl.innerText = taxTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const rawEl = document.getElementById('lbl-subtotal-raw'); if (rawEl) rawEl.innerText = (base + b2bCost + conceptsSum).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const catEl = document.getElementById('lbl-catalog-base-total'); if (catEl) catEl.innerText = base.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const subEl = document.getElementById('lbl-subtotal'); if (subEl) subEl.innerText = sub.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-subtotal-base').innerText = (base + b2bCost).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-adjustment').innerText = (adjType === 'descuento' ? '-' : '+') + adjAmount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('oed-price').value = (sub + taxTotal).toFixed(2);
    window.updatePriceColor();

    if (window.updateSummaryUI) window.updateSummaryUI();
};

window.updatePriceColor = function () { const spaceId = document.getElementById('oed-space').value; const priceInput = document.getElementById('oed-price'); const val = parseFloat(priceInput.value) || 0; const space = allSpaces.find(s => s.id == spaceId); if (!space) return; const base = parseFloat(space.precio_base); priceInput.classList.remove('text-green-600', 'text-red-600', 'text-gray-700'); if (val < base) priceInput.classList.add('text-green-600'); else if (val > base) priceInput.classList.add('text-red-600'); else priceInput.classList.add('text-gray-700'); };

window.addConceptRow = function () {
    const id = document.getElementById('new-concept-select').value; const amount = parseFloat(document.getElementById('new-concept-amount').value);
    if (!id && isNaN(amount)) return;
    if (id) { const c = catalogConcepts.find(x => x.id == id); currentConcepts.push({ description: c.nombre, amount: amount || c.precio_sugerido, value: amount || c.precio_sugerido, unit: 'fixed', type: 'aumento' }); }
    else { currentConcepts.push({ description: 'Concepto libre', amount: amount, value: amount, unit: 'fixed', type: 'aumento' }); }
    document.getElementById('new-concept-select').value = ""; document.getElementById('new-concept-amount').value = "";
    window.toggleExtraConceptsSection(true);
    window.renderConceptsList(); window.recalcTotal();
};

window.removeConceptRow = function (index) { currentConcepts.splice(index, 1); if (!currentConcepts.length) window.toggleExtraConceptsSection(false); window.renderConceptsList(); window.recalcTotal(); };

function __orderPrepareApprovalPreview(formData = {}, options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const baseData = opts.skipModalData ? {} : (typeof window.getFormDataFromModal === 'function' ? window.getFormDataFromModal() : {});
    const merged = { ...baseData, ...(formData || {}) };
    if (!merged.numero_orden) merged.numero_orden = __orderResolveQuoteFolio(currentPreviewOrder);
    const snapshotMeta = __orderBuildApprovalSnapshotMeta(currentPreviewOrder?.id || document.getElementById('oed-id')?.value, merged);
    if (snapshotMeta?.path && !merged.url_cotizacion_final) merged.url_cotizacion_final = snapshotMeta.path;
    merged.status = 'aprobada';
    const previewPayload = { ...currentPreviewOrder, ...merged, status: 'aprobada' };
    const content = window.getOrderHTML(previewPayload, 'quote');
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    if (pdfContainer) {
        pdfContainer.innerHTML = content;
        __cpApplyPdfStyleToLivePreview();
        pdfContainer.classList.remove('hidden');
    }
    if (embedViewer) embedViewer.classList.add('hidden');
    return merged;
}

function __orderPdfOptions(filename) {
    return {
        margin: [0, 0, 0, 0],
        filename: filename || 'Documento.pdf',
        pagebreak: { mode: ['css', 'legacy'] },
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: 816,
            windowHeight: 1056
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
}

function __orderPreparePdfElement(element) {
    if (!element) return { source: null, restore: () => { } };
    const clone = element.cloneNode(true);
    clone.classList.remove('hidden');
    clone.removeAttribute('id');
    clone.style.width = '816px';
    clone.style.margin = '0';
    clone.style.padding = '0';
    clone.style.maxWidth = '816px';
    clone.style.minHeight = '1056px';
    clone.style.position = 'absolute';
    clone.style.left = '-10000px';
    clone.style.top = '0';
    clone.style.right = 'auto';
    clone.style.bottom = 'auto';
    clone.style.zIndex = '-1';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.background = '#ffffff';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    return {
        source: clone,
        restore: () => {
            if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        }
    };
}

async function __orderWaitForPdfAssets(node, timeoutMs = 6000) {
    if (!node) return;
    const imgs = Array.from(node.querySelectorAll('img'));
    await Promise.race([
        Promise.all(imgs.map(img => {
            if (img.complete && (img.naturalWidth || img.naturalHeight)) return Promise.resolve();
            return new Promise(resolve => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        })),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Contenedor off-screen dedicado para render de PDF (misma idea usada por recibos en contracts.js).
function __orderGetPdfRenderHost() {
    let host = document.getElementById('order-pdf-render-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'order-pdf-render-host';
    host.style.position = 'fixed';
    host.style.left = '-10000px';
    host.style.top = '0';
    host.style.width = '816px';
    host.style.maxWidth = '816px';
    host.style.minHeight = '1056px';
    host.style.zIndex = '-1';
    host.style.opacity = '1';
    host.style.pointerEvents = 'none';
    host.style.background = '#ffffff';
    document.body.appendChild(host);
    return host;
}

function __orderStripPdfEditingChrome(rootNode) {
    if (!(rootNode instanceof HTMLElement)) return;
    rootNode.classList.remove('cp-pdf-admin-enabled', 'cp-pdf-edit-selected', 'cp-pdf-base-selected', 'cp-pdf-editable');
    rootNode.querySelectorAll('.pdf-margin-guides-layer,[data-margin-guide]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.cp-pdf-delete-btn,[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.cp-pdf-admin-enabled,.cp-pdf-edit-selected,.cp-pdf-base-selected,.cp-pdf-editable').forEach((node) => {
        node.classList.remove('cp-pdf-admin-enabled', 'cp-pdf-edit-selected', 'cp-pdf-base-selected', 'cp-pdf-editable');
        if (node instanceof HTMLElement) {
            node.style.outline = 'none';
            node.style.outlineOffset = '0';
        }
    });
}

// Genera PDF para cotización/OC/snapshot replicando el flujo estable de recibos.
async function __orderRenderPdfBlob(element, filename) {
    if (!element) throw new Error('Contenedor PDF no disponible.');
    const host = __orderGetPdfRenderHost();
    const markup = String(element.innerHTML || '').trim();
    if (!markup) throw new Error('Contenido PDF vacío.');
    try {
        host.innerHTML = markup;
        const target = host.firstElementChild || host;
        if (target?.classList?.contains('hidden')) target.classList.remove('hidden');
        __orderStripPdfEditingChrome(target);
        await __orderRefreshLetterheadUrl(true);
        host.querySelectorAll('img[data-cp-letterhead="1"]').forEach((img) => {
            img.setAttribute('src', __CP_LETTERHEAD_URL);
            if (/^https?:/i.test(__CP_LETTERHEAD_URL)) img.setAttribute('crossorigin', 'anonymous');
            else img.removeAttribute('crossorigin');
        });
        // Igual que recibos: dar tiempo a layout/imagenes antes de capturar.
        await new Promise(resolve => setTimeout(resolve, 1000));
        await __orderWaitForPdfAssets(target, 7000);

        const baseOptions = {
            margin: 0,
            filename: filename || 'Documento.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                scrollY: 0,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        let blob = await html2pdf().set(baseOptions).from(target).output('blob');
        if (!blob || blob.size < 4096) {
            await new Promise(resolve => setTimeout(resolve, 400));
            blob = await html2pdf().set({
                ...baseOptions,
                html2canvas: { ...(baseOptions.html2canvas || {}), scale: 2.5 }
            }).from(target).output('blob');
        }
        if (!blob || blob.size < 4096) throw new Error('No se pudo generar el PDF correctamente.');
        return blob;
    } finally {
        host.innerHTML = '';
    }
}

function __orderBuildApprovalSnapshotMeta(orderId, formData = {}) {
    const id = String(orderId || '').trim();
    const docMeta = __orderGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
    const folioUnificado = formData?.numero_orden
        || __orderResolveQuoteFolio(currentPreviewOrder, id);
    return {
        folio: folioUnificado,
        folioUnificado,
        path: id ? `${id}/${docMeta.approvedStorageBase}_${folioUnificado}.pdf` : ''
    };
}

async function __orderUploadApprovalSnapshotBlob(orderId, blob, formData = {}, options = {}) {
    const id = String(orderId || '').trim();
    if (!id) throw new Error('Cotización inválida para snapshot.');
    if (!blob || !(blob.size > 0)) throw new Error('Snapshot vacío.');
    const opts = options && typeof options === 'object' ? options : {};
    const resolved = __orderBuildApprovalSnapshotMeta(id, formData);
    const docMeta = __orderGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
    const folioUnificado = String(opts.folioUnificado || resolved.folioUnificado).trim();
    const path = String(opts.path || resolved.path || `${id}/${docMeta.approvedStorageBase}_${folioUnificado}.pdf`).trim();
    const { error: upErr } = await window.globalPocketBase.storage.from('documentos-cp').upload(path, blob, { upsert: true });
    if (upErr) throw upErr;
    if (opts.persistQuote !== false) {
        const { error: updErr } = await __cpQuotesUpdate(id, { status: 'aprobada', url_cotizacion_final: path });
        if (updErr) throw updErr;
    }
    return { path, folio: folioUnificado, folioUnificado };
}

function __orderDownloadBlob(blob, fileName = 'Documento.pdf') {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = String(fileName || 'Documento.pdf');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) { }
    }, 1500);
}

// Cierra el flujo de aprobación: genera PDF final y guarda snapshot en storage + DB.
async function __orderFinalizePendingSnapshot(options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const pending = __orderPendingApprovalSnapshot;
    if (!pending || __orderSnapshotInFlight) return true;
    const orderId = String(pending.orderId || '').trim();
    if (!orderId) return false;
    __orderSnapshotInFlight = true;
    try {
        const runner = async () => {
            let order = allOrders.find(o => String(o.id) === orderId) || null;
            if (!order) {
                const { data, error } = await __cpQuoteGetById(orderId);
                if (error || !data) throw (error || new Error('No se encontró cotización para snapshot.'));
                order = __orderHydrateQuotePricing(data);
            }
            currentPreviewOrder = { ...(currentPreviewOrder || {}), ...order, ...(pending.formData || {}), status: 'aprobada' };
            const element = document.getElementById('pdf-content');
            if (!element) throw new Error('Contenedor PDF no disponible.');
            if (__cpIsAdminProfile()) {
                await __cpPersistSharedPdfStyleConfig(__cpGetPdfStyleConfig(), { force: true });
            }
            await __cpEnsurePdfStyleProfile('quote', { forceReload: !__cpIsAdminProfile() });
            __orderPrepareApprovalPreview(pending.formData || {}, { skipModalData: true });
            const blob = opts.prebuiltBlob || await __orderRenderPdfBlob(element);
            const shouldPersistQuote = !String((pending.formData || {}).url_cotizacion_final || order?.url_cotizacion_final || '').trim();
            await __orderUploadApprovalSnapshotBlob(orderId, blob, pending.formData || {}, { persistQuote: shouldPersistQuote });
            __orderPendingApprovalSnapshot = null;
            __orderDequeueSnapshot(orderId);
            if (!opts.silent) window.showToast('Snapshot guardada correctamente', 'success');
            __orderBroadcastRefresh('approved_snapshot');
            return true;
        };
        if (opts.silent) return await runner();
        return await __cpWithBusyOverlay('Guardando cotización...', runner);
    } catch (e) {
        if (opts.enqueueOnFail) __orderQueueSnapshot(orderId);
        if (!opts.silent) window.showToast(`Error snapshot: ${e.message}`, 'error');
        return false;
    } finally {
        __orderSnapshotInFlight = false;
    }
}

// Reintenta snapshots pendientes (ej. si el usuario cerró pestaña durante aprobación).
async function __orderProcessSnapshotQueue() {
    if (__orderSnapshotQueueProcessing) return;
    const queue = __orderReadSnapshotQueue();
    if (!queue.length) return;
    __orderSnapshotQueueProcessing = true;
    try {
        for (const orderId of queue) {
            try {
                let order = allOrders.find(o => String(o.id) === String(orderId)) || null;
                if (!order) {
                    const { data, error } = await __cpQuoteGetById(orderId);
                    if (error || !data) throw (error || new Error('No se encontró cotización en cola.'));
                    order = __orderHydrateQuotePricing(data);
                }
                currentPreviewOrder = { ...(currentPreviewOrder || {}), ...order, status: 'aprobada' };
                const element = document.getElementById('pdf-content');
                if (!element) throw new Error('Contenedor PDF no disponible.');
                await __cpEnsurePdfStyleProfile('quote', { forceReload: !__cpIsAdminProfile() });
                __orderPrepareApprovalPreview(order || {}, { skipModalData: true });
                const blob = await __orderRenderPdfBlob(element);
                const shouldPersistQuote = !String(order?.url_cotizacion_final || '').trim();
                await __orderUploadApprovalSnapshotBlob(orderId, blob, order, { persistQuote: shouldPersistQuote });
                __orderDequeueSnapshot(orderId);
            } catch (e) {
                // Keep queue entry for next retry.
            }
        }
    } finally {
        __orderSnapshotQueueProcessing = false;
    }
}

window.initiateApprovalSnapshot = async function (options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    await __cpEnsurePdfStyleProfile('quote', { forceReload: !__cpIsAdminProfile() });
    const prepared = __orderPrepareApprovalPreview(opts.formData || {}, { skipModalData: true });
    currentPreviewOrder = { ...currentPreviewOrder, ...prepared };
    if (opts.markPending !== false) {
        __orderPendingApprovalSnapshot = {
            orderId: __orderCurrentOrderId(),
            formData: { ...prepared, status: 'aprobada' },
            createdAt: Date.now()
        };
    }
    const btnAction = document.getElementById('btn-download-preview');
    if (btnAction) {
        btnAction.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
        btnAction.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
        btnAction.onclick = window.downloadPDFFromPreview;
    }
    const orderNum = document.getElementById('prev-order-num');
    if (orderNum) orderNum.innerText = "COTIZACIÓN FINAL (VISTA PREVIA)";
    if (opts.openModal !== false) window.openModal('preview-modal');
    return prepared;
};

window.getFormDataFromModal = function () {
    const spaceId = document.getElementById('oed-space').value; const spaceObj = allSpaces.find(s => s.id == spaceId);
    const sDate = document.getElementById('oed-start').value; const eDate = document.getElementById('oed-end').value; const guests = parseInt(document.getElementById('oed-guests').value) || 1;
    let base = 0; if (spaceObj && sDate && eDate) { base = calculateDayByDayTotal(spaceObj, sDate, eDate, guests).total; } else if (spaceObj) { base = parseFloat(spaceObj.precio_base); }

    let pMontaje = parseFloat(document.getElementById('oed-premontaje-price').value) || 0;
    let pHora = parseFloat(document.getElementById('oed-horas-price').value) || 0;

    let b2bConceptsToSave = [];
    const selOpt = document.getElementById('oed-horario').options[document.getElementById('oed-horario').selectedIndex];

    let costoHorario = 0; let textoHorario = '';
    if (selOpt && selOpt.value === 'personalizado') {
        costoHorario = parseFloat(document.getElementById('oed-horario-price').value) || 0;
        const ts = document.getElementById('oed-horario-start').value;
        const te = document.getElementById('oed-horario-end').value;
        textoHorario = (ts && te) ? `${ts} a ${te}` : 'Horario Personalizado';
    }
    else if (selOpt) { costoHorario = parseFloat(selOpt.getAttribute('data-price')) || 0; textoHorario = selOpt.text; }

    if (selOpt) b2bConceptsToSave.push({ description: `Horario: ${textoHorario}`, amount: costoHorario, value: costoHorario, unit: 'fixed', type: 'b2b_horario', meta: { selected: selOpt.value, custom_name: textoHorario } });

    const diasM = parseInt(document.getElementById('oed-premontaje').value) || 0;
    let premCalc = { total: 0, breakdown: [] };
    if (diasM > 0 && spaceObj && window.finalMontajeDates.length === diasM) {
        premCalc = calculatePremontajeByDates(spaceObj, window.finalMontajeDates, guests);
        pMontaje = diasM > 0 ? (premCalc.total / diasM) : 0;
        document.getElementById('oed-premontaje-price').value = pMontaje.toFixed(2);
    }
    const montajeAmount = diasM > 0 ? (premCalc.total || (diasM * pMontaje)) : 0;
    if (diasM > 0) b2bConceptsToSave.push({
        description: `Montaje extra (${diasM} días)${window.finalMontajeDates.length ? ' - ' + window.finalMontajeDates.map(d => window.safeFormatDate(d)).join(', ') : ''}`,
        amount: montajeAmount,
        value: montajeAmount,
        unit: 'fixed',
        type: 'b2b_montaje',
        meta: {
            days: diasM,
            unit_price: pMontaje,
            dates: window.finalMontajeDates,
            percentage: 25,
            per_day_base: premCalc.breakdown
        }
    });

    const hrsE = parseInt(document.getElementById('oed-horas').value) || 0;
    if (hrsE > 0) b2bConceptsToSave.push({ description: `Horas Extras (${hrsE} hrs)`, amount: hrsE * pHora, value: hrsE * pHora, unit: 'fixed', type: 'b2b_horas', meta: { hours: hrsE, unit_price: pHora } });

    const finalConcepts = [...b2bConceptsToSave, ...currentConcepts];

    let conceptsSum = 0; finalConcepts.forEach(c => { conceptsSum += parseFloat(c.amount || c.value || 0); }); let sub = base + conceptsSum;
    const activeTaxIds = (() => {
        const box = document.getElementById('oed-taxes-list');
        const fromBox = box ? window.parseIds(box.dataset.taxIds || '[]').map(String).filter(Boolean) : [];
        return fromBox.length ? fromBox : __orderNormalizeTaxIds(spaceObj?.impuestos_ids || spaceObj?.impuestos);
    })();
    const taxTotal = __orderRoundCurrency(activeTaxIds.reduce((sum, taxId) => {
        const tax = __orderResolveTaxRecord(taxId, spaceObj);
        return sum + (sub * __orderResolveTaxRate(tax));
    }, 0));
    const priceInputValue = document.getElementById('oed-price').value;
    const priceFinal = __orderHasExplicitValue(priceInputValue)
        ? __orderToFiniteNumber(priceInputValue, __orderRoundCurrency(sub + taxTotal))
        : __orderRoundCurrency(sub + taxTotal);
    const adjType = document.getElementById('oed-adj-type').value; const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; const isPercent = document.getElementById('oed-adj-unit').value === 'percent';
    const existingDetails = parseSpacesDetail(currentPreviewOrder?.espacios_detalle);
    const detailsToSave = existingDetails.length > 1
        ? existingDetails
        : [{
            espacio_id: spaceId,
            espacio_nombre: spaceObj ? spaceObj.nombre : '',
            espacio_clave: spaceObj ? spaceObj.clave : '',
            fecha_inicio: sDate,
            fecha_fin: eDate,
            personas: guests,
            horario: { value: selOpt?.value || '', label: textoHorario, amount: costoHorario },
            premontaje_dias: diasM,
            premontaje_fechas: window.finalMontajeDates,
            premontaje_total: montajeAmount,
            premontaje_detalle: premCalc.breakdown,
            horas_extra: hrsE,
            horas_extra_unitario: pHora,
            horas_extra_total: hrsE * pHora,
            subtotal_espacio: sub
        }];

    return {
        cliente_nombre: document.getElementById('oed-client').value, cliente_email: document.getElementById('oed-email').value, cliente_contacto: document.getElementById('oed-phone').value, cliente_rfc: document.getElementById('fiscal-rfc-re').value, cliente_id: (document.getElementById('oed-client-id') ? (document.getElementById('oed-client-id').value || null) : null), fecha_inicio: sDate, fecha_fin: eDate, precio_final: priceFinal, espacio_id: spaceId, espacio_nombre: spaceObj ? spaceObj.nombre : '', espacio_clave: spaceObj ? spaceObj.clave : '', tipo_ajuste: adjType, valor_ajuste: adjVal, ajuste_es_porcentaje: isPercent,
        conceptos_adicionales: finalConcepts, desglose_precios: { subtotal_antes_impuestos: __orderRoundCurrency(sub), impuestos_detalle: activeTaxIds, tax_total: taxTotal }, personas: guests, espacios_detalle: detailsToSave, detalles_evento: { multi_espacio: detailsToSave.length > 1, total_espacios: detailsToSave.length }
    };
};

// Guarda la cotización y, si entra a aprobada, prepara el flujo diferido de snapshot.
window.processSaveOrder = async function (options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const silent = !!opts.silent;
    const relaxed = !!opts.relaxed;
    const keepOpen = !!opts.keepOpen || IS_ORDER_DETAIL_PAGE;
    const skipReload = !!opts.skipReload || IS_ORDER_DETAIL_PAGE;
    const openApprovalPreview = opts.openApprovalPreview !== false;
    const currentStatus = String(currentPreviewOrder?.status || '').toLowerCase();
    if (currentStatus === 'aprobada' || currentStatus === 'finalizada') {
        if (!silent) window.showToast("La cotización aprobada está bloqueada para edición.", "error");
        return false;
    }
    const btn = document.getElementById('btn-save-progress');
    if (btn && !silent) { btn.disabled = true; btn.innerText = "Guardando..."; }
    try {
        __orderSaveActiveFromForm();
        window.recalcTotal();
        if (!relaxed) {
            const invalidCapacity = (__orderTotals.spaces || []).find(sp => !sp.isPublicidad && sp.capacityOk === false);
            if (invalidCapacity) throw new Error(`El aforo para ${invalidCapacity.spaceName} excede su capacidad máxima.`);
            const invalidBlocked = (__orderTotals.spaces || []).find(sp => !sp.isPublicidad && sp.blockedOk === false);
            if (invalidBlocked) throw new Error(`La selección para ${invalidBlocked.spaceName} incluye días bloqueados.`);
            const invalidPast = (__orderTotals.spaces || []).find(sp => (sp.startDate && sp.startDate < __orderTodayISO()) || (sp.endDate && sp.endDate < __orderTodayISO()));
            if (invalidPast) throw new Error(`No se permiten fechas pasadas en ${invalidPast.spaceName}.`);
            const missingConvenio = (__orderTotals.spaces || []).find(sp => !!sp.convenioEnabled && !(Array.isArray(sp.concepts) && sp.concepts.length));
            if (missingConvenio) throw new Error(`Agrega al menos un trato de convenio para ${missingConvenio.spaceName}.`);
            const uncoveredConvenio = (__orderTotals.spaces || []).find(sp => !!sp.convenioEnabled && !sp.convenioCovered);
            if (uncoveredConvenio) throw new Error(`El convenio de ${uncoveredConvenio.spaceName} debe cubrir al menos el valor total del espacio.`);
            const invalidPrem = (__orderTotals.spaces || []).find(sp => !sp.isPublicidad && (parseInt(sp.premontajeDays, 10) || 0) > 0 && __orderSafeArray(sp.premontajeDates).length !== (parseInt(sp.premontajeDays, 10) || 0));
            if (invalidPrem) throw new Error(`Revisa las fechas de premontaje para ${invalidPrem.spaceName}.`);
            const conflict = __orderQuoteSpaces.find(cfg => {
                const reserved = __orderGetReservedDatesForSpace(cfg.spaceId);
                if (__orderCfgBlocksIndefinitely(cfg)) return Array.from(reserved).some((date) => date >= String(cfg.startDate || ''));
                if (__orderIsPublicidadSpace(cfg)) return false;
                const needed = [...__orderDatesBetween(cfg.startDate, cfg.endDate), ...__orderSafeArray(cfg.premontajeDates).map(__orderNormalizeDate).filter(Boolean)];
                return needed.find(d => reserved.has(d));
            });
            if (conflict) {
                const reserved = __orderGetReservedDatesForSpace(conflict.spaceId);
                const conflictDate = __orderCfgBlocksIndefinitely(conflict)
                    ? Array.from(reserved).filter((date) => date >= String(conflict.startDate || '')).sort()[0]
                    : [...__orderDatesBetween(conflict.startDate, conflict.endDate), ...__orderSafeArray(conflict.premontajeDates).map(__orderNormalizeDate).filter(Boolean)].find(d => reserved.has(d));
                const sp = __orderGetSpaceById(conflict.spaceId);
                throw new Error(`${sp?.nombre || conflict.spaceId} está ocupado ${conflictDate ? '(' + window.safeFormatDate(conflictDate) + ')' : ''}.`);
            }
        }
        const formData = { ...window.getFormDataFromModal(), ...(opts.formDataOverride || {}) };
        const statusEl = document.getElementById('oed-status');
        if (!formData.status) formData.status = statusEl?.value || 'pendiente';
        const prevStatus = String(currentPreviewOrder?.status || '').toLowerCase();
        const nextStatus = String(formData.status || '').toLowerCase();
        const approvalTransition = nextStatus === 'aprobada' && prevStatus !== 'aprobada' && prevStatus !== 'finalizada';
        const convenioTransition = nextStatus === 'finalizada' && __orderIsConvenioOrder({ ...currentPreviewOrder, ...formData });
        const orderId = String(document.getElementById('oed-id')?.value || currentPreviewOrder?.id || '').trim();
        if (!orderId) throw new Error('Cotización inválida.');
        if (!formData.numero_orden) {
            const sourceId = String(currentPreviewOrder?.id || orderId);
            formData.numero_orden = __orderResolveQuoteFolio(sourceId);
        }
        const approvalSnapshotMeta = approvalTransition ? __orderBuildApprovalSnapshotMeta(orderId, formData) : null;
        if (approvalSnapshotMeta?.path) formData.url_cotizacion_final = approvalSnapshotMeta.path;
        if (convenioTransition && __orderGetConvenioEvidence({ ...currentPreviewOrder, ...formData }).length < 3) {
            throw new Error('Finaliza el convenio desde Expediente para adjuntar de 3 a 5 evidencias.');
        }

        const { error } = await __cpQuotesUpdate(orderId, formData);
        if (error) throw error;
        currentPreviewOrder = { ...currentPreviewOrder, ...formData, id: orderId };
        if (statusEl && statusEl.value !== String(formData.status || '')) statusEl.value = String(formData.status || '');
        __orderApplyStatusVisual();
        if (nextStatus !== 'aprobada') {
            __orderPendingApprovalSnapshot = null;
            __orderDequeueSnapshot(orderId);
        } else if (__orderHasPendingSnapshot()) {
            __orderPendingApprovalSnapshot = {
                ...__orderPendingApprovalSnapshot,
                orderId,
                formData: { ...formData, status: 'aprobada' },
                createdAt: Date.now()
            };
        }
        __orderDetailDirty = false;
        if (__orderAutoSaveTimer) {
            clearTimeout(__orderAutoSaveTimer);
            __orderAutoSaveTimer = null;
        }
        if (!silent) __orderBroadcastRefresh(approvalTransition ? 'approved_saved' : 'saved');
        if (approvalTransition) {
            __orderPendingApprovalSnapshot = {
                orderId,
                formData: { ...formData, status: 'aprobada' },
                createdAt: Date.now()
            };
            let snapshotGeneratedNow = false;
            if (!silent && openApprovalPreview) {
                if (btn) btn.innerText = "Generando PDF...";
                try {
                    await window.initiateApprovalSnapshot({ openModal: true, markPending: true, formData });
                    const previewNode = document.getElementById('pdf-content');
                    if (!previewNode) throw new Error('No se encontró vista previa para generar snapshot.');
                    const folioUnificado = String(
                        approvalSnapshotMeta?.folioUnificado
                        || formData.numero_orden
                        || __orderResolveQuoteFolio(currentPreviewOrder, orderId)
                    ).trim();
                    const docMeta = __orderGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData, status: 'aprobada' });
                    const approvalLabel = docMeta.isConvenio ? 'Convenio aprobado' : 'Cotización aprobada';
                    const quoteFileName = `${docMeta.approvedFileBase}_${folioUnificado}.pdf`;
                    const snapshotBlob = await __cpWithBusyOverlay('Guardando cotización...', async () => {
                        const blob = await __orderRenderPdfBlob(previewNode, quoteFileName);
                        await __orderUploadApprovalSnapshotBlob(orderId, blob, formData, {
                            path: approvalSnapshotMeta?.path,
                            folioUnificado,
                            persistQuote: false
                        });
                        return blob;
                    });
                    __orderPendingApprovalSnapshot = null;
                    __orderDequeueSnapshot(orderId);
                    __orderDownloadBlob(snapshotBlob, quoteFileName);
                    snapshotGeneratedNow = true;
                    if (!silent) window.showToast(`${approvalLabel} y snapshot generada correctamente.`, "success");
                } catch (snapshotError) {
                    __orderQueueSnapshot(orderId);
                    if (!silent) {
                        const docMeta = __orderGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData, status: 'aprobada' });
                        window.showToast(
                            `${docMeta.isConvenio ? 'Convenio aprobado' : 'Cotización aprobada'}. Snapshot pendiente: ${snapshotError?.message || snapshotError}`,
                            "error"
                        );
                    }
                }
            }
            if (!snapshotGeneratedNow) {
                __orderQueueSnapshot(orderId);
                if (!silent && !openApprovalPreview) {
                    const docMeta = __orderGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData, status: 'aprobada' });
                    window.showToast(`${docMeta.isConvenio ? 'Convenio aprobado' : 'Cotización aprobada'}. Snapshot pendiente de generación.`, "success");
                }
            }
        } else if (!silent) {
            window.showToast("Cambios guardados", "success");
        }
        if (__orderDetailTab === 'expediente') {
            await __orderRenderExpedientePanel();
        }
        if (!keepOpen) window.closeModal('order-edit-modal');
        cpOrdersSaveViewState({ selectedOrderId: orderId });
        if (!skipReload) await window.loadOrders();
        return true;
    } catch (e) {
        if (!silent) window.showToast("Error: " + e.message, "error");
        return false;
    } finally {
        if (btn && !silent) { btn.disabled = false; btn.innerText = "Guardar"; }
    }
};

function __orderScheduleAutoSave() {
    if (!IS_ORDER_DETAIL_PAGE) return;
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return;
    const nextStatus = String(document.getElementById('oed-status')?.value || '').toLowerCase();
    const prevStatus = String(currentPreviewOrder?.status || '').toLowerCase();
    if (nextStatus === 'aprobada' && prevStatus !== 'aprobada' && prevStatus !== 'finalizada') return;
    __orderDetailDirty = true;
    if (__orderAutoSaveTimer) clearTimeout(__orderAutoSaveTimer);
    __orderAutoSaveTimer = setTimeout(() => {
        window.processSaveOrder({ silent: true, relaxed: true, keepOpen: true, skipReload: true });
    }, 1500);
}

function __orderFlushAutoSave() {
    if (!IS_ORDER_DETAIL_PAGE || __orderDetailDirty !== true) return;
    if (__orderAutoSaveTimer) {
        clearTimeout(__orderAutoSaveTimer);
        __orderAutoSaveTimer = null;
    }
    window.processSaveOrder({ silent: true, relaxed: true, keepOpen: true, skipReload: true });
}

function __orderBindDetailAutoSave() {
    if (!IS_ORDER_DETAIL_PAGE || __orderAutoSaveBound) return;
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return;
    const root = document.getElementById('order-edit-modal');
    if (!root) return;
    root.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.id === 'btn-save-progress') return;
        el.addEventListener('input', __orderScheduleAutoSave);
        el.addEventListener('change', __orderScheduleAutoSave);
    });
    ['oed-quote-name', 'oed-status'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', __orderScheduleAutoSave);
        el.addEventListener('change', __orderScheduleAutoSave);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') __orderFlushAutoSave();
    });
    window.addEventListener('pagehide', () => __orderFlushAutoSave());
    window.addEventListener('beforeunload', () => __orderFlushAutoSave());
    __orderAutoSaveBound = true;
}

window.closeOrderEditorPage = async function () {
    if (!IS_ORDER_DETAIL_PAGE) return window.askCloseEditModal();
    await window.processSaveOrder({ silent: true, relaxed: true, keepOpen: true, skipReload: true });
    if (__orderHasPendingSnapshot()) {
        const orderId = __orderCurrentOrderId();
        if (orderId) __orderQueueSnapshot(orderId);
        await __orderFinalizePendingSnapshot({ trigger: 'close_page', silent: true, enqueueOnFail: true });
    }
    __orderBroadcastRefresh('closed_editor');
    const attemptClose = () => {
        try {
            if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') {
                window.__HUB_ALLOW_NEXT_UNLOAD('cp_order_editor_close');
            }
            window.close();
        } catch (_) { }
    };
    attemptClose();
    setTimeout(() => {
        if (!window.closed) {
            attemptClose();
            if (!window.closed) {
                window.showToast('No se pudo cerrar automáticamente la pestaña. Ciérrala manualmente.', 'info');
            }
        }
    }, 120);
};

window.previewOrderForGeneration = async function (id) {
    await __cpEnsurePdfStyleProfile('order', { forceReload: !__cpIsAdminProfile() });
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    if (__orderIsConvenioOrder(order)) return window.showToast("Los convenios no generan orden de compra.", "error");
    currentPreviewOrder = { ...order, docType: 'order' };
    const content = window.getOrderHTML(order, 'order');
    const pdfContainer = document.getElementById('pdf-content');
    const embed = document.getElementById('doc-preview');
    if (pdfContainer) {
        pdfContainer.innerHTML = content;
        __cpApplyPdfStyleToLivePreview();
        pdfContainer.classList.remove('hidden');
    }
    if (embed) embed.classList.add('hidden');
    const btn = document.getElementById('btn-download-preview');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-file-contract"></i> Confirmar y Generar OC';
        btn.className = "bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
        btn.onclick = window.confirmAndGeneratePurchaseOrder;
    }
    window.openModal('preview-modal');
};

window.confirmAndGeneratePurchaseOrder = async function () {
    window.openConfirm("¿Generar Orden de Compra Oficial? Se guardará una copia exacta.", async () => {
        const btn = document.getElementById('btn-download-preview');
        if (btn) { btn.disabled = true; btn.innerText = "Generando OC..."; }
        try {
            if (__orderIsConvenioOrder(currentPreviewOrder || {})) throw new Error("Los convenios no generan orden de compra.");
            const pdfBlob = await __cpWithBusyOverlay('Generando orden de compra...', async () => {
                const element = document.getElementById('pdf-content');
                if (!__cpIsAdminProfile() && element && currentPreviewOrder) {
                    await __cpEnsurePdfStyleProfile('order', { forceReload: true });
                    element.innerHTML = window.getOrderHTML(currentPreviewOrder, 'order');
                    __cpApplyPdfStyleToLivePreview();
                }
                const blob = await __orderRenderPdfBlob(element);
                const folioUnificado = __orderResolveQuoteFolio(currentPreviewOrder);
                const path = `${currentPreviewOrder.id}/orden_compra_${folioUnificado}.pdf`;
                await window.globalPocketBase.storage.from('documentos-cp').upload(path, blob, { upsert: true });
                const fechaOrden = new Date().toISOString();
                const ocUpdate = await __cpQuotesUpdate(currentPreviewOrder.id, { url_orden_compra: path, fecha_orden_compra: fechaOrden });
                if (ocUpdate.error) throw ocUpdate.error;
                currentPreviewOrder = { ...currentPreviewOrder, url_orden_compra: path, fecha_orden_compra: fechaOrden };
                return blob;
            });
            const folioUnificado = __orderResolveQuoteFolio(currentPreviewOrder);
            __orderBroadcastRefresh('purchase_order');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(pdfBlob);
            link.download = `OC_${folioUnificado}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 1500);
            window.showToast("Orden de Compra Generada");
            if (__orderDetailTab === 'expediente') await __orderRenderExpedientePanel();
            cpOrdersSaveViewState({ selectedOrderId: currentPreviewOrder?.id || '' });
            if (!(IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode() || IS_ORDER_DETAIL_PAGE)) await window.loadOrders();
            window.closeModal('preview-modal');
            window.closeModal('docs-modal');
            __cpClosePreviewTabIfNeeded();
        } catch (e) {
            window.showToast("Error al generar OC", "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    });
};

window.openDocsModal = function (id) {
    cpOrdersSaveViewState({ selectedOrderId: id });
    const order = allOrders.find(o => o.id === id); if (!order) return; document.getElementById('doc-client').innerText = order.cliente_nombre;
    const folioUnificado = __orderResolveQuoteFolio(order);
    document.getElementById('doc-folio').innerText = folioUnificado;
    const details = parseSpacesDetail(order.espacios_detalle);
    const firstSpaceRef = details[0]?.espacio_clave || details[0]?.espacio_nombre || order.espacio_clave || order.espacio_nombre || 'Espacio';
    const docSpace = details.length > 1 ? `${firstSpaceRef} + ${details.length - 1}` : firstSpaceRef;
    document.getElementById('doc-space').innerText = docSpace;
    document.getElementById('doc-dates').innerText = __orderBlocksIndefinitely(order)
        ? `${window.safeFormatDate(order.fecha_inicio)} - Indefinido`
        : `${window.safeFormatDate(order.fecha_inicio)} - ${window.safeFormatDate(order.fecha_fin)}`; const list = document.getElementById('docs-list'); list.innerHTML = '';
    const createBtn = (label, icon, color, action) => { list.innerHTML += `<button type="button" onclick="${action}" class="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm group bg-white mb-2"><div class="w-8 h-8 rounded-full bg-${color}-100 text-${color}-600 flex items-center justify-center shrink-0"><i class="${icon}"></i></div><div class="flex-grow"><p class="text-xs font-bold text-gray-700">${label}</p></div><i class="fa-solid fa-arrow-right text-xs text-gray-300"></i></button>`; };
    const createLocked = (label, icon) => { list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="${icon} text-gray-400"></i><span class="text-xs font-bold text-gray-400">${label}</span></div>`; };
    window.toggleDocsPayments = function (sectionId) {
        const section = document.getElementById(sectionId);
        const chevron = document.querySelector(`[data-docs-pay-toggle="${sectionId}"]`);
        if (!section) return;
        const hidden = section.classList.toggle('hidden');
        if (chevron) chevron.classList.toggle('rotate-180', !hidden);
    };
    // Cotización
    const docMeta = __orderGetQuoteDocumentMeta(order);
    if (order.url_cotizacion_final) {
        createBtn(`Ver ${docMeta.approvedTitle}`, 'fa-solid fa-file-circle-check', 'blue', `window.openStoredDocument('${order.url_cotizacion_final}')`);
    } else {
        createBtn(`Ver ${docMeta.draftTitle}`, 'fa-solid fa-file-pen', 'gray', `window.openOrderPreviewTab('${order.id}', 'quote', 'view')`);
    }

    // Orden de compra
    if (__orderIsConvenioOrder(order)) {
        createLocked('Orden de Compra (No aplica en convenio)', 'fa-solid fa-lock');
    } else if (order.url_orden_compra) {
        createBtn('Ver Orden de Compra', 'fa-solid fa-file-contract', 'purple', `window.openStoredDocument('${order.url_orden_compra}')`);
    } else if (['aprobada', 'finalizada'].includes(order.status)) {
        createBtn('Generar Orden de Compra', 'fa-solid fa-plus', 'purple', `window.openOrderPreviewTab('${order.id}', 'order', 'generate')`);
    } else {
        createLocked('Orden de Compra (Pendiente)', 'fa-solid fa-lock');
    }

    // Contrato
    if (order.contrato_url) {
        createBtn('Ver Contrato', 'fa-solid fa-file-signature', 'emerald', `window.openStoredDocument('${order.contrato_url}')`);
    } else {
        createLocked('Contrato (Pendiente)', 'fa-solid fa-lock');
    }

    // Factura
    if (order.factura_pdf_url) {
        createBtn('Ver Factura (PDF)', 'fa-solid fa-file-pdf', 'red', `window.openStoredDocument('${order.factura_pdf_url}')`);
        if (order.factura_xml_url) createBtn('Descargar XML', 'fa-solid fa-file-code', 'orange', `window.openStoredDocument('${order.factura_xml_url}')`);
    } else {
        createLocked('Factura (Pendiente)', 'fa-solid fa-file-invoice-dollar');
    }

    const payments = (() => {
        if (Array.isArray(order.historial_pagos)) return order.historial_pagos.filter(Boolean);
        try {
            const parsed = JSON.parse(order.historial_pagos || '[]');
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    })();

    // Pagos
    if (payments.length > 0) {
        const paymentSectionId = `docs-payments-${String(order.id)}`;
        let recNo = 0;
        const paymentButtons = payments.map((p) => {
            const type = String(p?.type || p?.tipo || '').toLowerCase();
            const isConstancia = type === 'constancia_liquidacion' || p?.closed === true || p?.is_closure === true;
            const label = isConstancia ? 'Constancia de Liquidación' : `Recibo #${++recNo}`;
            const icon = isConstancia ? 'fa-solid fa-circle-check' : 'fa-solid fa-receipt';
            const path = String(p?.file_path || p?.path || p?.url || '').trim();
            return path ? `<button type="button" onclick="window.openStoredDocument('${path}')" class="w-full text-left px-4 py-3 rounded-xl border border-emerald-100 hover:bg-emerald-50 flex items-center gap-3 transition shadow-sm group bg-white mb-2"><div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><i class="${icon}"></i></div><div class="flex-grow"><p class="text-xs font-bold text-gray-700">${label}</p></div><i class="fa-solid fa-arrow-right text-xs text-gray-300"></i></button>` : '';
        }).join('');
        list.innerHTML += `<div class="mb-2">
            <button type="button" onclick="window.toggleDocsPayments('${paymentSectionId}')" class="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm group bg-white">
                <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-money-bill-wave"></i></div>
                <div class="flex-grow"><p class="text-xs font-bold text-gray-700">Pagos</p><p class="text-[10px] text-gray-400">${payments.length} documento(s) registrado(s)</p></div>
                <i data-docs-pay-toggle="${paymentSectionId}" class="fa-solid fa-chevron-down text-xs text-gray-300 transition-transform"></i>
            </button>
            <div id="${paymentSectionId}" class="hidden pt-2 pl-3">${paymentButtons}</div>
        </div>`;
    } else {
        createLocked('Pagos (Sin recibos)', 'fa-solid fa-lock');
    }
    window.openModal('docs-modal');
};

window.openPDFPreview = async function (id, type) {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    try {
        await __cpEnsurePdfStyleProfile(type, { forceReload: !__cpIsAdminProfile() });
        let order = allOrders.find((row) => String(row.id || '') === safeId) || null;
        if (!order) {
            const { data, error } = await __cpQuoteGetById(safeId);
            if (error || !data) throw (error || new Error('No se encontró la cotización.'));
            order = __orderHydrateQuotePricing(data);
            if (!allOrders.some((row) => String(row.id || '') === safeId)) allOrders.push(order);
        }
        currentPreviewOrder = { ...order, docType: type };
        const content = window.getOrderHTML(order, type);
        const pdfContainer = document.getElementById('pdf-content');
        const embedViewer = document.getElementById('doc-preview');
        const btnDownload = document.getElementById('btn-download-preview');
        if (pdfContainer) {
            pdfContainer.classList.remove('hidden');
            pdfContainer.innerHTML = content;
            __cpApplyPdfStyleToLivePreview();
        }
        if (embedViewer) embedViewer.classList.add('hidden');
        if (btnDownload) {
            btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
            btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
            btnDownload.onclick = window.downloadPDFFromPreview;
        }
        window.openModal('preview-modal');
    } catch (e) {
        console.error('openPDFPreview(cp) failed', e);
        window.showToast(`No se pudo abrir la vista previa: ${e?.message || e}`, 'error');
    }
};
window.downloadPDFFromPreview = async function () {
    const element = document.getElementById('pdf-content');
    const orderId = String(currentPreviewOrder?.id || '').trim();
    if (!orderId) return window.showToast("No se pudo identificar la cotización.", "error");
    const folioUnificado = __orderResolveQuoteFolio(currentPreviewOrder, orderId);
    try {
        const pdfBlob = await __cpWithBusyOverlay('Generando PDF...', async () => {
            if (!__cpIsAdminProfile() && element && currentPreviewOrder) {
                const docType = String(currentPreviewOrder.docType || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
                await __cpEnsurePdfStyleProfile(docType, { forceReload: true });
                element.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
                __cpApplyPdfStyleToLivePreview();
            }
            return await __orderRenderPdfBlob(element, `Documento_${folioUnificado}.pdf`);
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Documento_${folioUnificado}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        if (__orderHasPendingSnapshot()) {
            await __orderFinalizePendingSnapshot({
                trigger: 'download',
                prebuiltBlob: pdfBlob,
                silent: false,
                enqueueOnFail: true
            });
        }
    } catch (e) {
        window.showToast("Error al generar PDF", "error");
    }
};

function __cpOrdersTransparentPdfHtml(html) {
    return String(html || '')
        .replace(/\bbg-(?:white|gray-\d{2,3}|red-\d{2,3}|green-\d{2,3}|blue-\d{2,3}|amber-\d{2,3}|purple-\d{2,3}|brand-red)\b/g, '')
        .replace(/background:\s*#(?:[0-9a-f]{3,8});?/gi, 'background: transparent;')
        .replace(/background:\s*rgba?\([^)]+\);?/gi, 'background: transparent;')
        .replace(/\s{2,}/g, ' ');
}

function __cpOrdersBoostPdfTypography(html) {
    return String(html || '')
        .replace(/\btext-\[9px\]\b/g, '__CP_TXT_9__')
        .replace(/\btext-\[10px\]\b/g, '__CP_TXT_10__')
        .replace(/\btext-\[11px\]\b/g, '__CP_TXT_11__')
        .replace(/\btext-xs\b/g, '__CP_TXT_XS__')
        .replace(/\btext-sm\b/g, '__CP_TXT_SM__')
        .replace(/__CP_TXT_9__/g, 'text-[10px]')
        .replace(/__CP_TXT_10__/g, 'text-[11px]')
        .replace(/__CP_TXT_11__/g, 'text-[12px]')
        .replace(/__CP_TXT_XS__/g, 'text-sm')
        .replace(/__CP_TXT_SM__/g, 'text-base');
}

const __CP_PDF_STYLE_TENANT = 'casa_de_piedra';
const __CP_PDF_OVERLAYS_COLLECTION = 'pdf_overlays';
const __CP_PDF_OVERLAY_TYPES = Object.freeze({
    quote: 'generator:quotes',
    order: 'generator:orders'
});
const __CP_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'contract']);
const __CP_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const __CP_PDF_STYLE_FONT_LABELS = Object.freeze({
    segoe: 'Segoe UI',
    arial: 'Arial',
    verdana: 'Verdana',
    georgia: 'Georgia',
    times: 'Times New Roman',
    trebuchet: 'Trebuchet MS'
});
const __CP_PDF_BASE_TEXT_BLOCKS = Object.freeze([
    { id: 'base:header-title', key: 'header-title', label: 'Título Encabezado', sizeField: 'titlePx', alignField: 'headerAlign' },
    { id: 'base:header-meta', key: 'header-meta', label: 'Meta Encabezado', sizeField: 'metaPx', alignField: 'metaAlign' },
    { id: 'base:table-body', key: 'table-body', label: 'Tabla Conceptos', sizeField: 'tableBodyPx', alignField: 'tableAlign' },
    { id: 'base:summary', key: 'summary', label: 'Resumen Totales', alignField: 'summaryAlign' },
    { id: 'base:quick', key: 'quick', label: 'Notas', sizeField: 'quickPx', alignField: 'quickAlign' },
    { id: 'base:conditions', key: 'conditions', label: 'Condiciones', sizeField: 'conditionsPx', alignField: 'conditionsAlign' },
    { id: 'base:sign', key: 'sign', label: 'Firmas', sizeField: 'signPx', alignField: 'signAlign' },
    { id: 'base:footer', key: 'footer', label: 'Footer', sizeField: 'footerPx', alignField: 'footerAlign' }
]);
const __CP_PDF_BASE_MOVABLE_KEYS = Object.freeze(['header-title', 'header-meta', 'table-body', 'summary', 'quick', 'conditions', 'sign', 'footer']);
const __CP_PDF_MOVABLE_RESOURCE_TYPES = Object.freeze(['bar', 'logo', 'sign', 'sign-block', 'title']);
const __CP_PDF_BASE_SIZE_LIMITS = Object.freeze({
    titlePx: { min: 20, max: 42 },
    metaPx: { min: 8, max: 18 },
    tableBodyPx: { min: 9, max: 16 },
    quickPx: { min: 9, max: 16 },
    conditionsPx: { min: 9, max: 18 },
    signPx: { min: 9, max: 16 },
    footerPx: { min: 8, max: 14 }
});
const __CP_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -4000, max: 4000 },
    y: { min: -5000, max: 5000 },
    scalePct: { min: 15, max: 500 },
    angle: { min: -360, max: 360 }
});
const __CP_PDF_STYLE_CONTENT_DEFAULTS = Object.freeze({
    quickLeftTitle: 'Notas:',
    quickLeftLines: 'a) Incluye insumos en baños (papel y jabón).\nb) Uso del espacio por 7 horas + montaje/desmontaje mismo día.\nc) Premontaje: 25% sobre el valor base del día elegido.',
    quickRightTitle: 'Vigencia:',
    quickRightBody: '15 días desde la emisión (tarifa sujeta a disponibilidad del espacio).',
    conditionsTitle: 'CONDICIONES GENERALES',
    conditionsLines: [
        'Todo proveedor deberá ser aprobado previamente por Casa de Piedra.',
        'Carpas: proveedor exclusivo Carpas San Marino (472 595 05 34 / 477 787 85 19).',
        'Es indispensable contratar generador de energía externo para evitar contratiempos.',
        'Baños con atención personalizada y seguridad exclusiva se contratan por separado.',
        'Si cancela el cliente, se penaliza con 100% del anticipo.',
        'Cambios de fecha o servicios están sujetos a disponibilidad y pueden generar ajustes de costo.',
        'Estacionamiento de cortesía. Valet Parking se cotiza aparte con proveedor autorizado por Casa de Piedra.'
    ].join('\n'),
    quoteApproverTitle: 'QUIEN APRUEBA',
    quoteApproverSubtitle: 'Casa de Piedra',
    quoteClientTitle: '{{CLIENT_NAME}}',
    quoteClientSubtitle: 'Cliente / Representante',
    orderApproverTitle: 'QUIEN APRUEBA',
    orderApproverSubtitle: 'Casa de Piedra',
    annexHintTitle: 'Página adicional editable',
    annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
});
const __CP_PDF_STYLE_DEFAULTS = Object.freeze({
    fontFamilyKey: 'segoe',
    headerLinePx: 4,
    titlePx: 30,
    metaPx: 13,
    tableHeadPx: 14,
    tableBodyPx: 12,
    lineHeightPct: 120,
    quickPx: 12,
    conditionsPx: 14,
    signPx: 12,
    footerPx: 10,
    offsetXPx: 0,
    offsetYPx: 0,
    extraPages: 0,
    marginTopPx: 0,
    marginBottomPx: 0,
    marginLeftPx: 0,
    marginRightPx: 0,
    baseLayouts: {},
    resources: [],
    content: __CP_PDF_STYLE_CONTENT_DEFAULTS,
    headerAlign: 'right',
    metaAlign: 'right',
    tableAlign: 'left',
    quickAlign: 'left',
    conditionsAlign: 'justify',
    signAlign: 'center',
    summaryAlign: 'left',
    footerAlign: 'center'
});
const __CP_PDF_STYLE_UI_STATE_KEY = 'cp_pdf_style_editor_ui';
let __cpPdfStyleState = null;
let __cpPdfStyleConfigRecordId = '';
let __cpPdfStyleConfigStore = '';
let __cpPdfStyleRawPayload = null;
let __cpPdfStyleSyncTimer = null;
let __cpPdfStyleUiState = { collapsed: false, pinned: false };
let __cpPdfResourceEditorSelectedId = '';
let __cpPdfResourcePointerState = null;
let __cpPdfResourceClipboard = null;
let __cpPdfStyleActiveProfile = 'quote';
let __cpPdfMarginGuideController = null;
let __cpPdfEditLocked = true;
let __cpPdfInspectorState = null;

function __cpClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __cpNormalizeStyleAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __cpSafeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function __cpNormalizeHexColor(value, fallback) {
    const input = String(value || '').trim();
    const candidate = input.startsWith('#') ? input : `#${input}`;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

function __cpNormalizePdfContent(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __CP_PDF_STYLE_CONTENT_DEFAULTS;
    const normalizeText = (key, max) => String(base[key] ?? defaults[key] ?? '').slice(0, max);
    return {
        quickLeftTitle: normalizeText('quickLeftTitle', 80),
        quickLeftLines: normalizeText('quickLeftLines', 1200),
        quickRightTitle: normalizeText('quickRightTitle', 80),
        quickRightBody: normalizeText('quickRightBody', 700),
        conditionsTitle: normalizeText('conditionsTitle', 120),
        conditionsLines: normalizeText('conditionsLines', 5000),
        quoteApproverTitle: normalizeText('quoteApproverTitle', 80),
        quoteApproverSubtitle: normalizeText('quoteApproverSubtitle', 80),
        quoteClientTitle: normalizeText('quoteClientTitle', 120),
        quoteClientSubtitle: normalizeText('quoteClientSubtitle', 80),
        orderApproverTitle: normalizeText('orderApproverTitle', 80),
        orderApproverSubtitle: normalizeText('orderApproverSubtitle', 80),
        annexHintTitle: normalizeText('annexHintTitle', 120),
        annexHintBody: normalizeText('annexHintBody', 900)
    };
}

function __cpGetPdfContentFieldMaxLength(field) {
    const key = String(field || '').trim();
    if (key === 'quickLeftLines') return 1200;
    if (key === 'quickRightBody') return 700;
    if (key === 'conditionsLines') return 5000;
    if (key === 'quoteClientTitle') return 120;
    if (key === 'annexHintBody') return 900;
    return 120;
}

function __cpCommitPdfContentField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __cpGetPdfStyleConfig();
    const max = __cpGetPdfContentFieldMaxLength(key);
    const content = __cpNormalizePdfContent({
        ...(cfg.content || {}),
        [key]: String(rawValue ?? '').slice(0, max)
    });
    const next = __cpNormalizePdfStyle({ ...cfg, content });
    __cpSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh: opts.skipEditorUiRefresh === true });
    __cpScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __cpRefreshPreviewFromStyleState();
}

function __cpResolvePdfTemplateString(value, context = {}) {
    let output = String(value ?? '');
    Object.entries(context && typeof context === 'object' ? context : {}).forEach(([key, resolvedValue]) => {
        const token = String(key || '').trim();
        if (!token) return;
        const pattern = new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
        output = output.replace(pattern, String(resolvedValue ?? ''));
    });
    return output;
}
const __CP_PDF_TEMPLATE_TOKENS = Object.freeze([
    { token: 'CLIENT_NAME', label: 'Nombre del cliente' },
    { token: 'CLIENT_EMAIL', label: 'Correo del cliente' },
    { token: 'CLIENT_PHONE', label: 'Telefono del cliente' },
    { token: 'CLIENT_RFC', label: 'RFC del cliente' },
    { token: 'QUOTE_NAME', label: 'Nombre de cotizacion/campana' },
    { token: 'FOLIO', label: 'Folio del documento' },
    { token: 'DOC_TITLE', label: 'Titulo del documento' },
    { token: 'START_DATE', label: 'Fecha de inicio' },
    { token: 'END_DATE', label: 'Fecha de termino' },
    { token: 'VALIDITY', label: 'Vigencia completa' },
    { token: 'TODAY', label: 'Fecha de emision' },
    { token: 'CURRENT_USER_NAME', label: 'Usuario actual' },
    { token: 'CURRENT_USER_EMAIL', label: 'Correo del usuario actual' },
    { token: 'VENUE_NAME', label: 'Sede' }
]);
function __orderResolveCurrentActorEmail() {
    const authState = __orderReadAuthState('pb_native_auth_v1');
    return [
        currentUserProfile?.email,
        currentUserProfile?.record?.email,
        currentUserProfile?.user?.email,
        authState?.user?.email,
        authState?.record?.email
    ].map((v) => String(v || '').trim()).find(Boolean) || '';
}
function __cpBuildPdfTemplateContext(order = {}, extra = {}) {
    const o = order && typeof order === 'object' ? order : {};
    const fmt = (value) => value ? (window.safeFormatDate ? window.safeFormatDate(value) : String(value)) : '';
    const startDate = fmt(o.fecha_inicio || o.startDate);
    const endDate = __orderBlocksIndefinitely(o) ? 'Indefinido' : fmt(o.fecha_fin || o.endDate);
    return {
        CLIENT_NAME: o.cliente_nombre || o.clientName || '',
        CLIENT_EMAIL: o.cliente_email || o.email || '',
        CLIENT_PHONE: o.cliente_contacto || o.telefono || o.phone || '',
        CLIENT_RFC: o.cliente_rfc || o.rfc || '',
        QUOTE_NAME: o.nombre_cotizacion || o.nombre || '',
        FOLIO: extra.folio || __orderResolveQuoteFolio(o) || o.id || '',
        DOC_TITLE: extra.docTitle || '',
        START_DATE: startDate,
        END_DATE: endDate,
        VALIDITY: [startDate, endDate].filter(Boolean).join(' - '),
        TODAY: extra.dateStr || new Date().toLocaleDateString('es-MX'),
        CURRENT_USER_NAME: __orderResolveCurrentActorName(),
        CURRENT_USER_EMAIL: __orderResolveCurrentActorEmail(),
        VENUE_NAME: extra.venueName || 'Casa de Piedra'
    };
}
let __cpPdfTemplateInsertTarget = null;
let __cpPdfTemplateInsertMeta = null;
function __cpPdfTemplateSelectorEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function __cpIsPdfTemplateEditableField(node) {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return false;
    if (node.disabled || node.readOnly) return false;
    if (node instanceof HTMLInputElement) {
        const type = String(node.type || 'text').toLowerCase();
        if (!['text', 'search', 'email', 'url', 'tel'].includes(type)) return false;
    }
    return !!(
        String(node.getAttribute('data-res-field') || '').trim()
        || String(node.getAttribute('data-base-field') || '').trim()
        || String(node.getAttribute('data-pdf-inspector-field') || '').trim()
    );
}
function __cpDescribePdfTemplateInsertTarget(node) {
    if (!__cpIsPdfTemplateEditableField(node)) return null;
    const resId = String(node.getAttribute('data-res-id') || '').trim();
    const resField = String(node.getAttribute('data-res-field') || '').trim();
    if (resId && resField) return { type: 'resource', id: resId, field: resField };
    const baseId = String(node.getAttribute('data-base-id') || '').trim();
    const baseField = String(node.getAttribute('data-base-field') || '').trim();
    if (baseId && baseField) return { type: 'base', id: baseId, field: baseField };
    const inspectorId = String(node.getAttribute('data-target-id') || '').trim();
    const inspectorKind = String(node.getAttribute('data-target-kind') || '').trim();
    const inspectorField = String(node.getAttribute('data-pdf-inspector-field') || '').trim();
    if (inspectorId && inspectorField) return { type: 'inspector', id: inspectorId, kind: inspectorKind, field: inspectorField };
    return null;
}
function __cpResolvePdfTemplateInsertTargetFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (meta.type === 'resource' && meta.id && meta.field) {
        return document.querySelector(`[data-res-id="${__cpPdfTemplateSelectorEscape(meta.id)}"][data-res-field="${__cpPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'base' && meta.id && meta.field) {
        return document.querySelector(`[data-base-id="${__cpPdfTemplateSelectorEscape(meta.id)}"][data-base-field="${__cpPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'inspector' && meta.id && meta.field) {
        return document.querySelector(`[data-target-id="${__cpPdfTemplateSelectorEscape(meta.id)}"][data-pdf-inspector-field="${__cpPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    return null;
}
function __cpRememberPdfTemplateInsertTarget(node) {
    const meta = __cpDescribePdfTemplateInsertTarget(node);
    if (!meta) return;
    __cpPdfTemplateInsertTarget = node;
    __cpPdfTemplateInsertMeta = meta;
}
function __cpResolvePdfTemplateInsertTarget() {
    if (__cpIsPdfTemplateEditableField(document.activeElement)) {
        __cpRememberPdfTemplateInsertTarget(document.activeElement);
        return document.activeElement;
    }
    if (__cpPdfTemplateInsertTarget instanceof Element && document.body.contains(__cpPdfTemplateInsertTarget) && __cpIsPdfTemplateEditableField(__cpPdfTemplateInsertTarget)) {
        return __cpPdfTemplateInsertTarget;
    }
    const restored = __cpResolvePdfTemplateInsertTargetFromMeta(__cpPdfTemplateInsertMeta);
    if (__cpIsPdfTemplateEditableField(restored)) {
        __cpPdfTemplateInsertTarget = restored;
        return restored;
    }
    return null;
}
function __cpInsertPdfTemplateToken(token) {
    const safeToken = String(token || '').trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
    if (!safeToken) return false;
    const insertValue = `{{${safeToken}}}`;
    const target = __cpResolvePdfTemplateInsertTarget();
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        try {
            navigator.clipboard.writeText(insertValue);
            window.showToast?.('Etiqueta copiada', 'success');
        } catch (_) { }
        return false;
    }
    const currentValue = String(target.value || '');
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : currentValue.length;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    target.value = `${currentValue.slice(0, start)}${insertValue}${currentValue.slice(end)}`;
    const caret = start + insertValue.length;
    try {
        target.focus();
        target.setSelectionRange?.(caret, caret);
    } catch (_) { }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    window.showToast?.('Etiqueta insertada', 'success');
    return true;
}
function __cpBuildTemplateTagButtonHtml(item, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const scope = String(opts.scope || 'cp-orders').trim();
    const token = String(item?.token || '').trim();
    const label = String(item?.label || token || '').trim();
    const tokenLabel = `{{${token}}}`;
    if (opts.style === 'modal') {
        return `
        <button type="button" data-pdf-template-scope="${__cpSafeHtml(scope)}" data-pdf-template-token="${__cpSafeHtml(token)}" class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:border-brand-red hover:bg-red-50/40">
            <div class="min-w-0">
                <code class="text-[11px] font-black text-brand-red">${__cpSafeHtml(tokenLabel)}</code>
                <p class="mt-1 text-[11px] font-semibold text-gray-600">${__cpSafeHtml(label)}</p>
            </div>
            <span class="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-brand-dark shadow-sm">Insertar</span>
        </button>`;
    }
    const compact = opts.compact === true;
    const classes = compact
        ? 'inline-flex items-center rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[10px] font-black text-brand-red shadow-sm transition hover:border-brand-red hover:text-brand-red'
        : 'inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black text-brand-red shadow-sm transition hover:border-brand-red hover:text-brand-red';
    return `<button type="button" data-pdf-template-scope="${__cpSafeHtml(scope)}" data-pdf-template-token="${__cpSafeHtml(token)}" title="${__cpSafeHtml(label)}" class="${classes}">${__cpSafeHtml(tokenLabel)}</button>`;
}
function __cpTemplateTagsModalHtml() {
    const rows = __CP_PDF_TEMPLATE_TOKENS.map((item) => __cpBuildTemplateTagButtonHtml(item, { style: 'modal' })).join('');
    return `<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl p-6">
        <div class="flex items-start justify-between gap-4 mb-4">
            <div><h3 class="text-lg font-black text-gray-900 uppercase tracking-tight">Etiquetas para PDF</h3><p class="text-xs text-gray-500 mt-1">Haz clic para insertarlas en el ultimo campo de texto o firma que estabas editando. Si no hay campo activo, se copiaran al portapapeles.</p></div>
            <button type="button" onclick="window.closeModal('pdf-template-tags-modal')" class="text-gray-400 hover:text-gray-700"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">${rows}</div>
    </div>`;
}
window.openCpPdfTemplateTagsModal = function () {
    let modal = document.getElementById('pdf-template-tags-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pdf-template-tags-modal';
        modal.className = 'fixed inset-0 z-[520] hidden items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal('pdf-template-tags-modal'); });
        document.body.appendChild(modal);
    }
    modal.innerHTML = __cpTemplateTagsModalHtml();
    window.openModal('pdf-template-tags-modal');
};
function __cpTemplateTagsInlineHtml(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    return `<div class="flex flex-wrap gap-2">${__CP_PDF_TEMPLATE_TOKENS.map((item) => __cpBuildTemplateTagButtonHtml(item, { compact: opts.compact === true })).join('')}</div>`;
}
function __cpSyncPdfTemplateTagHelpers() {
    document.querySelectorAll('[data-pdf-template-helper="cp"]').forEach((host) => {
        host.innerHTML = __cpTemplateTagsInlineHtml();
    });
}
function __cpTemplateTagsInspectorCardHtml() {
    return `<div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-amber-700">Etiquetas del sistema</p>
            <button type="button" data-pdf-inspector-action="open-template-tags" class="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 transition hover:border-brand-red hover:text-brand-red">Ver todas</button>
        </div>
        <p class="text-[10px] text-amber-900/80">Haz clic en una etiqueta para insertarla en el ultimo campo activo de texto, firma o contenido base.</p>
        ${__cpTemplateTagsInlineHtml({ compact: true })}
    </div>`;
}
function __cpBindPdfTemplateTagHelpers() {
    if (document.body.dataset.cpPdfTemplateHelpersBound === '1') return;
    document.body.dataset.cpPdfTemplateHelpersBound = '1';
    document.addEventListener('focusin', (event) => {
        __cpRememberPdfTemplateInsertTarget(event.target);
    });
    document.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-pdf-template-scope="cp-orders"][data-pdf-template-token]') : null;
        if (!button) return;
        event.preventDefault();
        __cpInsertPdfTemplateToken(String(button.getAttribute('data-pdf-template-token') || ''));
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        __cpSyncPdfTemplateTagHelpers();
        __cpBindPdfTemplateTagHelpers();
    }, { once: true });
} else {
    __cpSyncPdfTemplateTagHelpers();
    __cpBindPdfTemplateTagHelpers();
}

function __cpGetOrderBaseContentFields(baseKey) {
    const key = String(baseKey || '').trim();
    const content = __cpNormalizePdfContent(__cpGetPdfStyleConfig().content);
    const isOrder = String(currentPreviewOrder?.docType || 'quote').toLowerCase() === 'order';
    if (key === 'quick') {
        return [
            { key: 'quickLeftTitle', label: 'Titulo izquierda', value: content.quickLeftTitle, max: 80, multiline: false },
            { key: 'quickLeftLines', label: 'Notas izquierda', value: content.quickLeftLines, max: 1200, multiline: true, rows: 5 },
            { key: 'quickRightTitle', label: 'Titulo derecha', value: content.quickRightTitle, max: 80, multiline: false },
            { key: 'quickRightBody', label: 'Notas derecha', value: content.quickRightBody, max: 700, multiline: true, rows: 4 }
        ];
    }
    if (key === 'conditions') {
        return [
            { key: 'conditionsTitle', label: 'Titulo', value: content.conditionsTitle, max: 120, multiline: false },
            { key: 'conditionsLines', label: 'Terminos y condiciones', value: content.conditionsLines, max: 5000, multiline: true, rows: 9 },
            { key: 'annexHintTitle', label: 'Titulo anexos', value: content.annexHintTitle, max: 120, multiline: false },
            { key: 'annexHintBody', label: 'Texto anexos', value: content.annexHintBody, max: 900, multiline: true, rows: 4 }
        ];
    }
    if (key === 'sign') {
        if (isOrder) {
            return [
                { key: 'orderApproverTitle', label: 'Quien aprueba', value: content.orderApproverTitle, max: 80, multiline: false },
                { key: 'orderApproverSubtitle', label: 'Subtitulo', value: content.orderApproverSubtitle, max: 80, multiline: false }
            ];
        }
        return [
            { key: 'quoteApproverTitle', label: 'Aprobacion titulo', value: content.quoteApproverTitle, max: 80, multiline: false },
            { key: 'quoteApproverSubtitle', label: 'Aprobacion subtitulo', value: content.quoteApproverSubtitle, max: 80, multiline: false },
            { key: 'quoteClientTitle', label: 'Cliente titulo', value: content.quoteClientTitle, max: 120, multiline: false },
            { key: 'quoteClientSubtitle', label: 'Cliente subtitulo', value: content.quoteClientSubtitle, max: 80, multiline: false }
        ];
    }
    return [];
}

function __cpGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __CP_PDF_BASE_TEXT_BLOCKS.find((block) => block.key === safe) || null;
}

function __cpCanMovePdfBaseBlock(key) {
    const safe = String(key || '').trim();
    return !!__cpGetPdfBaseBlockMeta(safe) && __CP_PDF_BASE_MOVABLE_KEYS.includes(safe);
}

function __cpCanEditPdfBaseBlock(key) {
    return !!__cpGetPdfBaseBlockMeta(key);
}

function __cpIsTemplateDrivenResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    const text = `${resource.text || ''} ${resource.signTitle || ''} ${resource.signRole || ''}`;
    return /\{\{[^}]+\}\}/.test(text);
}

function __cpCanMovePdfResource(resource) {
    return !!resource && typeof resource === 'object';
}

function __cpCanEditPdfResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    if (resource.isUserNote === true) return true;
    const type = String(resource.type || '').toLowerCase();
    if (type === 'sign' || type === 'sign-line' || type === 'sign-block') return true;
    if (type !== 'title' && type !== 'text') return false;
    return !__cpIsTemplateDrivenResource(resource);
}

function __cpFindPdfResourceById(resourceId) {
    const safeId = String(resourceId || '').trim();
    if (!safeId) return null;
    return __cpGetPdfResourcesFromState().find((resource) => String(resource.id || '') === safeId) || null;
}

function __cpNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __cpClampStyleNumber(base.x, __CP_PDF_BASE_LAYOUT_LIMITS.x.min, __CP_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __cpClampStyleNumber(base.y, __CP_PDF_BASE_LAYOUT_LIMITS.y.min, __CP_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __cpClampStyleNumber(base.scalePct ?? base.scale, __CP_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __CP_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        angle: __cpClampStyleNumber(base.angle, __CP_PDF_BASE_LAYOUT_LIMITS.angle.min, __CP_PDF_BASE_LAYOUT_LIMITS.angle.max, 0),
        hidden: base.hidden === true
    };
}

function __cpNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __CP_PDF_BASE_TEXT_BLOCKS.forEach((block) => {
        out[block.key] = __cpNormalizePdfBaseLayout(source[block.key] || {});
        Object.keys(source).forEach((key) => {
            if (key.startsWith(`${block.key}__`)) out[key] = __cpNormalizePdfBaseLayout(source[key]);
        });
    });
    return out;
}

function __cpBuildPdfBaseTransform(layout) {
    const safe = __cpNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) rotate(${safe.angle || 0}deg) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __cpNormalizePdfResources(raw) {
    const list = (Array.isArray(raw) ? raw : []).filter((item) => !(item && typeof item === 'object' && item.isUserNote === true));
    return list.slice(0, 80).map((item, index) => {
        const base = item && typeof item === 'object' ? item : {};
        const rawType = String(base.type || '').toLowerCase();
        const normalizedType = rawType === 'sign-line' ? 'sign' : rawType;
        const type = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
        const isSign = type === 'sign' || type === 'sign-block';
        const defaultW = type === 'bar' ? 240 : (type === 'logo' ? 180 : (isSign ? 220 : 260));
        const defaultH = type === 'bar' ? 12 : (type === 'logo' ? 72 : (type === 'sign' ? 24 : (type === 'sign-block' ? 42 : 42)));
        const defaultBg = type === 'logo'
            ? 'transparent'
            : (isSign ? '#111827' : (type === 'bar' ? '#c1621e' : 'transparent'));
        return {
            id: String(base.id || `cpres_${Date.now()}_${index}`),
            type,
            enabled: base.enabled !== false,
            page: __cpClampStyleNumber(base.page, 1, 8, 1),
            x: __cpClampStyleNumber(base.x, -4000, 4000, 80),
            y: __cpClampStyleNumber(base.y, -5000, 5000, 120),
            w: __cpClampStyleNumber(base.w, 16, 4000, defaultW),
            h: __cpClampStyleNumber(base.h, 1, 5000, defaultH),
            text: (type === 'title' || type === 'text') ? String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 1200) : '',
            fontFamilyKey: String(base.fontFamilyKey || '').toLowerCase(),
            fontSize: __cpClampStyleNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
            bold: base.bold !== false,
            italic: !!base.italic,
            underline: !!base.underline,
            align: __cpNormalizeStyleAlign(base.align, 'left'),
            color: __cpNormalizeHexColor(base.color, '#111827'),
            bgColor: __cpNormalizeHexColor(base.bgColor, defaultBg),
            angle: __cpClampStyleNumber(base.angle, -360, 360, 0),
            signTitle: type === 'sign-block' ? String(base.signTitle || '').slice(0, 120) : '',
            signRole: type === 'sign-block' ? String(base.signRole || '').slice(0, 120) : '',
            isUserNote: base.isUserNote === true,
            noteAuthor: String(base.noteAuthor || '').slice(0, 120)
        };
    });
}

function __cpRenderPdfResources(style, pageIndex, templateContext = {}) {
    const cfg = __cpNormalizePdfStyle(style || {});
    const resources = __cpNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    const isAdmin = __cpIsAdminProfile();
    const globalFont = __CP_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __CP_PDF_STYLE_FONT_MAP.segoe;
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const isSignBlock = resource.type === 'sign-block';
            const isSign = resource.type === 'sign' || resource.type === 'sign-line';
            let bgFill = resource.bgColor;
            if (resource.type !== 'bar' || resource.type === 'logo' || isSign || isSignBlock) bgFill = 'transparent';
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:${isAdmin ? 'auto' : 'none'};background:${bgFill};transform:rotate(${resource.angle || 0}deg);transform-origin:center center;`;
            const deleteBtnHtml = isAdmin ? `<div class="cp-pdf-delete-btn" data-res-action="remove" data-res-id="${__cpSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';
            if (resource.type === 'logo') {
                return `<div class="cp-pdf-resource cp-pdf-editable" data-res-id="${__cpSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="logo" style="${common}padding:0;border-radius:0;"><img src="${__cpSafeHtml(COMPANY_LOGO_URL)}" alt="Logo" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">${deleteBtnHtml}</div>`;
            }
            if (isSign) {
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                return `<div class="cp-pdf-resource cp-pdf-editable" data-res-id="${__cpSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign" style="${common}background:transparent;border-radius:2px;"><div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${lineColor};transform:translateY(-50%);border-radius:999px;"></div>${deleteBtnHtml}</div>`;
            }
            if (isSignBlock) {
                const fontStack = resource.fontFamilyKey && __CP_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __CP_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const titleStr = __cpSafeHtml(__cpResolvePdfTemplateString(resource.signTitle || '', templateContext));
                const roleStr = __cpSafeHtml(__cpResolvePdfTemplateString(resource.signRole || '', templateContext));
                const titleSize = Math.max(10, Number(resource.fontSize || 14));
                const roleSize = Math.max(9, titleSize - 2);
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                const textColor = (resource.color && resource.color !== 'transparent') ? resource.color : '#111827';
                return `<div class="cp-pdf-resource cp-pdf-editable" data-res-id="${__cpSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign-block" style="${common}display:flex;flex-direction:column;align-items:center;justify-content:flex-end;background:transparent;"><div style="width:100%;height:2px;background:${lineColor};border-radius:999px;margin-bottom:4px;"></div><div style="width:100%;text-align:center;color:${textColor};font-family:${fontStack};pointer-events:none;user-select:none;">${titleStr ? `<div style="font-size:${titleSize}px;font-weight:800;line-height:1.2;">${titleStr}</div>` : ''}${roleStr ? `<div style="font-size:${roleSize}px;text-transform:uppercase;opacity:0.6;margin-top:2px;">${roleStr}</div>` : ''}</div>${deleteBtnHtml}</div>`;
            }
            if (resource.type === 'bar') {
                return `<div class="cp-pdf-resource cp-pdf-editable" data-res-id="${__cpSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="bar" style="${common}background:${resource.bgColor};border-radius:2px;">${deleteBtnHtml}</div>`;
            }
            const fontStack = resource.fontFamilyKey && __CP_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? __CP_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                : globalFont;
            const placeholder = isAdmin && !resource.text ? (resource.type === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
            const textStr = __cpResolvePdfTemplateString(resource.text || '', templateContext);
            return `<div class="cp-pdf-resource cp-pdf-editable" data-res-id="${__cpSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="${__cpSafeHtml(resource.type)}" data-res-font-size="${resource.fontSize}" style="${common}"><div style="width:100%;height:100%;padding:4px;overflow:hidden;font-family:${fontStack};font-size:${resource.fontSize}px;line-height:1.2;font-weight:${resource.bold ? 800 : 500};font-style:${resource.italic ? 'italic' : 'normal'};text-decoration:${resource.underline ? 'underline' : 'none'};text-align:${resource.align};white-space:pre-wrap;color:${resource.color};pointer-events:none;user-select:none;">${__cpSafeHtml(textStr) || `<span style="opacity:0.3;">${placeholder}</span>`}</div>${deleteBtnHtml}</div>`;
        })
        .join('');
}

function __cpNormalizePdfStyle(raw = {}) {
    const base = { ...__CP_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    return {
        fontFamilyKey: __CP_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __CP_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __cpClampStyleNumber(base.headerLinePx, 1, 8, __CP_PDF_STYLE_DEFAULTS.headerLinePx),
        titlePx: __cpClampStyleNumber(base.titlePx, 20, 42, __CP_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __cpClampStyleNumber(base.metaPx, 8, 18, __CP_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __cpClampStyleNumber(base.tableHeadPx, 9, 18, __CP_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __cpClampStyleNumber(base.tableBodyPx, 9, 16, __CP_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __cpClampStyleNumber(base.lineHeightPct, 90, 180, __CP_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __cpClampStyleNumber(base.quickPx, 9, 16, __CP_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __cpClampStyleNumber(base.conditionsPx, 9, 18, __CP_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __cpClampStyleNumber(base.signPx, 9, 16, __CP_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __cpClampStyleNumber(base.footerPx, 8, 14, __CP_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __cpClampStyleNumber(base.offsetXPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __cpClampStyleNumber(base.offsetYPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __cpClampStyleNumber(base.extraPages, -1, 6, __CP_PDF_STYLE_DEFAULTS.extraPages),
        marginTopPx: __cpClampStyleNumber(base.marginTopPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.marginTopPx),
        marginBottomPx: __cpClampStyleNumber(base.marginBottomPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.marginBottomPx),
        marginLeftPx: __cpClampStyleNumber(base.marginLeftPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.marginLeftPx),
        marginRightPx: __cpClampStyleNumber(base.marginRightPx, -4000, 4000, __CP_PDF_STYLE_DEFAULTS.marginRightPx),
        baseLayouts: __cpNormalizePdfBaseLayouts(base.baseLayouts),
        resources: __cpNormalizePdfResources(base.resources),
        content: __cpNormalizePdfContent(base.content),
        headerAlign: __cpNormalizeStyleAlign(base.headerAlign, __CP_PDF_STYLE_DEFAULTS.headerAlign),
        metaAlign: __cpNormalizeStyleAlign(base.metaAlign, __CP_PDF_STYLE_DEFAULTS.metaAlign),
        tableAlign: __cpNormalizeStyleAlign(base.tableAlign, __CP_PDF_STYLE_DEFAULTS.tableAlign),
        quickAlign: __cpNormalizeStyleAlign(base.quickAlign, __CP_PDF_STYLE_DEFAULTS.quickAlign),
        conditionsAlign: __cpNormalizeStyleAlign(base.conditionsAlign, __CP_PDF_STYLE_DEFAULTS.conditionsAlign),
        signAlign: __cpNormalizeStyleAlign(base.signAlign, __CP_PDF_STYLE_DEFAULTS.signAlign),
        summaryAlign: __cpNormalizeStyleAlign(base.summaryAlign, __CP_PDF_STYLE_DEFAULTS.summaryAlign),
        footerAlign: __cpNormalizeStyleAlign(base.footerAlign, __CP_PDF_STYLE_DEFAULTS.footerAlign)
    };
}

function __cpNormalizePdfStyleProfileKey(profile) {
    const safe = String(profile || '').toLowerCase();
    if (__CP_PDF_STYLE_PROFILE_KEYS.includes(safe)) return safe;
    return safe === 'order' ? 'order' : 'quote';
}

function __cpExtractPdfStyleProfile(raw, profile = 'quote') {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const normalizedProfile = __cpNormalizePdfStyleProfileKey(profile);
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    if (profiles) {
        const candidate = profiles[normalizedProfile] || profiles.quote || profiles.default;
        if (candidate && typeof candidate === 'object') return candidate;
    }
    return cfg;
}

function __cpLoadPdfStyleState() {
    return __cpNormalizePdfStyle();
}

function __cpLoadPdfStyleUiState() {
    try {
        const raw = localStorage.getItem(__CP_PDF_STYLE_UI_STATE_KEY);
        if (!raw) return { collapsed: false, pinned: false };
        const parsed = JSON.parse(raw);
        return { collapsed: !!parsed?.collapsed, pinned: !!parsed?.pinned };
    } catch (_) {
        return { collapsed: false, pinned: false };
    }
}

function __cpSavePdfStyleUiState() {
    try {
        localStorage.setItem(__CP_PDF_STYLE_UI_STATE_KEY, JSON.stringify(__cpPdfStyleUiState));
    } catch (_) { }
}

function __cpGetPdfStyleConfig() {
    if (!__cpPdfStyleState) __cpPdfStyleState = __cpLoadPdfStyleState();
    return { ...__cpPdfStyleState };
}

function __cpPdfStyleVars(style) {
    const safe = __cpNormalizePdfStyle(style);
    const headerAlign = safe.headerAlign === 'justify' ? 'left' : safe.headerAlign;
    return {
        '--cp-font-family': __CP_PDF_STYLE_FONT_MAP[safe.fontFamilyKey],
        '--cp-header-line': `${safe.headerLinePx}px`,
        '--cp-title-size': `${safe.titlePx}px`,
        '--cp-meta-size': `${safe.metaPx}px`,
        '--cp-date-size': `${Math.max(8, safe.metaPx - 2)}px`,
        '--cp-table-head-size': `${safe.tableHeadPx}px`,
        '--cp-table-body-size': `${safe.tableBodyPx}px`,
        '--cp-line-height': `${(safe.lineHeightPct / 100).toFixed(2)}`,
        '--cp-quick-size': `${safe.quickPx}px`,
        '--cp-conditions-size': `${safe.conditionsPx}px`,
        '--cp-sign-size': `${safe.signPx}px`,
        '--cp-footer-size': `${safe.footerPx}px`,
        '--cp-offset-x': `${safe.offsetXPx}px`,
        '--cp-offset-y': `${safe.offsetYPx}px`,
        '--cp-margin-top': `${safe.marginTopPx}px`,
        '--cp-margin-right': `${safe.marginRightPx}px`,
        '--cp-margin-bottom': `${safe.marginBottomPx}px`,
        '--cp-margin-left': `${safe.marginLeftPx}px`,
        '--cp-header-align': headerAlign,
        '--cp-header-justify': headerAlign === 'left' ? 'flex-start' : (headerAlign === 'center' ? 'center' : 'flex-end'),
        '--cp-meta-align': safe.metaAlign,
        '--cp-table-align': safe.tableAlign,
        '--cp-quick-align': safe.quickAlign,
        '--cp-conditions-align': safe.conditionsAlign,
        '--cp-sign-align': safe.signAlign,
        '--cp-summary-align': safe.summaryAlign,
        '--cp-footer-align': safe.footerAlign
    };
}

function __cpPdfStyleVarsInline(style) {
    const vars = __cpPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __cpBuildPdfContentFrameStyle(baseHeightPx, extraStyle = '') {
    const extra = String(extraStyle || '').trim();
    const suffix = extra ? `${extra}${extra.endsWith(';') ? '' : ';'}` : '';
    return `position:relative;left:var(--cp-margin-left);top:var(--cp-margin-top);width:max(48px,calc(100% - var(--cp-margin-left) - var(--cp-margin-right)));height:max(48px,calc(${baseHeightPx}px - var(--cp-margin-top) - var(--cp-margin-bottom)));min-height:max(48px,calc(${baseHeightPx}px - var(--cp-margin-top) - var(--cp-margin-bottom)));box-sizing:border-box;overflow:visible;${suffix}`;
}

function __cpApplyPdfBaseLayouts() {
    const cfg = __cpGetPdfStyleConfig();
    const layouts = __cpNormalizePdfBaseLayouts(cfg.baseLayouts);
    const counters = {};
    document.querySelectorAll('#pdf-content [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__cpGetPdfBaseBlockMeta(key)) return;
        counters[key] = (counters[key] || 0);
        const index = counters[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __cpNormalizePdfBaseLayout();
        if (node.dataset.baseNativeTransformCaptured !== '1') {
            node.dataset.baseNativeTransform = String(node.style.transform || '').trim();
            node.dataset.baseNativeTransformCaptured = '1';
        }
        const nativeTransform = String(node.dataset.baseNativeTransform || '').trim();
        const layoutTransform = __cpBuildPdfBaseTransform(layout);
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('cp-pdf-editable', __cpIsAdminProfile());
        node.dataset.baseInstance = instanceKey;
    });
}

function __cpCommitPdfBaseLayout(key, layout) {
    const baseKey = String(key || '').split('__')[0].trim();
    if (!__cpGetPdfBaseBlockMeta(baseKey)) return;
    const fullKey = String(key || '').trim();
    const cfg = __cpGetPdfStyleConfig();
    const baseLayouts = {
        ...__cpNormalizePdfBaseLayouts(cfg.baseLayouts),
        [fullKey]: __cpNormalizePdfBaseLayout(layout)
    };
    const next = __cpNormalizePdfStyle({ ...cfg, baseLayouts });
    __cpSetPdfStyleConfig(next, { applyToDom: false });
    __cpApplyPdfBaseLayouts();
    __cpScheduleSharedPdfStyleSync(next);
}

function __cpCommitBaseLayoutField(baseId, field, rawValue) {
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const baseKey = key.split('__')[0];
    if (!__cpGetPdfBaseBlockMeta(baseKey)) return;
    if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(String(field || '')) && !__cpCanMovePdfBaseBlock(baseKey)) return;
    const cfg = __cpGetPdfStyleConfig();
    const baseLayouts = __cpNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[key] || baseLayouts[baseKey] || __cpNormalizePdfBaseLayout();
    const nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __CP_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __cpClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __CP_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __cpClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'angle') {
        const limits = __CP_PDF_BASE_LAYOUT_LIMITS.angle;
        nextLayout.angle = __cpClampStyleNumber(rawValue, limits.min, limits.max, current.angle || 0);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __cpNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [key]: __cpNormalizePdfBaseLayout(nextLayout)
        }
    });
    __cpSetPdfStyleConfig(next, { applyToDom: true });
    __cpScheduleSharedPdfStyleSync(next);
}

function __cpAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (type !== 'text' && type !== 'title') return;
    const baseFont = __cpClampStyleNumber(
        node.getAttribute('data-res-font-size') || window.getComputedStyle(node).fontSize,
        8,
        72,
        14
    );
    node.style.fontSize = `${baseFont}px`;
    node.style.lineHeight = '1.2';
    if ((node.scrollWidth <= node.clientWidth + 1) && (node.scrollHeight <= node.clientHeight + 1)) return;
    let low = 8;
    let high = baseFont;
    let best = 8;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        node.style.fontSize = `${mid}px`;
        if ((node.scrollWidth <= node.clientWidth + 1) && (node.scrollHeight <= node.clientHeight + 1)) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    node.style.fontSize = `${best}px`;
}

function __cpAutoFitPdfTextResources() {
    document.querySelectorAll('#pdf-content .cp-pdf-resource[data-res-type="text"], #pdf-content .cp-pdf-resource[data-res-type="title"]').forEach((node) => {
        __cpAutoFitPdfTextNode(node);
    });
}

function __cpMarginStateFromConfig(style) {
    const cfg = __cpNormalizePdfStyle(style || __cpGetPdfStyleConfig());
    return {
        top: cfg.marginTopPx,
        right: cfg.marginRightPx,
        bottom: cfg.marginBottomPx,
        left: cfg.marginLeftPx
    };
}

function __cpApplyMarginVarsToLivePreview(style) {
    const cfg = __cpNormalizePdfStyle(style || __cpGetPdfStyleConfig());
    document.querySelectorAll('#pdf-content .cp-pdf-root').forEach((node) => {
        node.style.setProperty('--cp-margin-top', `${cfg.marginTopPx}px`);
        node.style.setProperty('--cp-margin-right', `${cfg.marginRightPx}px`);
        node.style.setProperty('--cp-margin-bottom', `${cfg.marginBottomPx}px`);
        node.style.setProperty('--cp-margin-left', `${cfg.marginLeftPx}px`);
    });
}

function __cpCommitMargins(margins, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const current = __cpGetPdfStyleConfig();
    const next = __cpNormalizePdfStyle({
        ...current,
        marginTopPx: margins.top,
        marginRightPx: margins.right,
        marginBottomPx: margins.bottom,
        marginLeftPx: margins.left
    });
    __cpPdfStyleState = next;
    __cpApplyMarginVarsToLivePreview(next);
    __cpSyncPdfStyleValueLabels(next);
    __cpRenderPdfToolbar();
    if (opts.persist !== false) __cpScheduleSharedPdfStyleSync(next);
    return next;
}

function __cpEnsureMarginGuideController() {
    if (!window.createPdfMarginGuideController) return null;
    if (!__cpPdfMarginGuideController) {
        __cpPdfMarginGuideController = window.createPdfMarginGuideController({
            container: () => document.getElementById('preview-container'),
            root: () => document.getElementById('pdf-content'),
            minMarginPx: -4000,
            maxMarginPx: 4000,
            isVisible: () => {
                return __cpIsPdfPreviewVisible() && __cpIsAdminProfile() && !__cpPdfEditLocked;
            },
            getMargins: () => __cpMarginStateFromConfig(),
            onChange: (margins) => {
                __cpCommitMargins(margins, { persist: false });
            },
            onCommit: (margins) => {
                __cpCommitMargins(margins, { persist: false });
                __cpScheduleSharedPdfStyleSync(__cpGetPdfStyleConfig());
            }
        });
    }
    return __cpPdfMarginGuideController;
}

function __cpBindFloatingPanelDrag(panel, host) {
    if (!(panel instanceof HTMLElement) || !(host instanceof HTMLElement) || panel.dataset.dragBound === '1') return;
    panel.dataset.dragBound = '1';
    const handle = panel.querySelector('[data-pdf-panel-handle]');
    if (!(handle instanceof HTMLElement)) return;
    const syncPanelViewport = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240;
        const maxPanelHeight = Math.max(220, viewportHeight - 16);
        const card = panel.querySelector('[data-pdf-inspector-card]');
        const body = panel.querySelector('[data-pdf-inspector-body]');
        panel.style.maxHeight = `${maxPanelHeight}px`;
        if (card instanceof HTMLElement) {
            card.style.maxHeight = `${maxPanelHeight}px`;
        }
        if (body instanceof HTMLElement) {
            const handleHeight = handle.offsetHeight || 56;
            body.style.maxHeight = `${Math.max(120, maxPanelHeight - handleHeight - 8)}px`;
        }
    };
    const clampPosition = (left, top) => {
        const margin = 8;
        const w = panel.offsetWidth || 320;
        const h = panel.offsetHeight || 240;
        const maxLeft = Math.max(margin, (window.innerWidth || w) - w - margin);
        const maxTop = Math.max(margin, (window.innerHeight || h) - h - margin);
        return {
            left: Math.round(Math.min(maxLeft, Math.max(margin, left))),
            top: Math.round(Math.min(maxTop, Math.max(margin, top)))
        };
    };
    const applyPosition = (left, top) => {
        const next = clampPosition(left, top);
        panel.style.position = 'fixed';
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
    };
    const ensureInitialPosition = () => {
        syncPanelViewport();
        if ((panel.offsetWidth || 0) < 80 || (panel.offsetHeight || 0) < 80) {
            panel.dataset.positioned = '';
            return;
        }
        if (panel.dataset.positioned === '1') {
            applyPosition(parseFloat(panel.style.left || '0') || 0, parseFloat(panel.style.top || '0') || 0);
            return;
        }
        panel.dataset.positioned = '1';
        const defaultLeft = panel.dataset.defaultLeft || String((window.innerWidth || 320) - (panel.offsetWidth || 280) - 24);
        const defaultTop = panel.dataset.defaultTop || '84';
        applyPosition(parseFloat(defaultLeft) || 24, parseFloat(defaultTop) || 84);
    };
    let dragState = null;
    const endDrag = () => {
        dragState = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };
    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const interactive = event.target instanceof Element
            ? event.target.closest('button, input, select, textarea, [data-pdf-inspector-action], [data-pdf-inspector-toggle]')
            : null;
        if (interactive) return;
        ensureInitialPosition();
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            left: parseFloat(panel.style.left || '0') || 0,
            top: parseFloat(panel.style.top || '0') || 0,
            pointerId: event.pointerId
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        if (typeof handle.setPointerCapture === 'function') {
            try { handle.setPointerCapture(event.pointerId); } catch (_) { }
        }
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!dragState) return;
        if (dragState.pointerId !== undefined && dragState.pointerId !== event.pointerId) return;
        applyPosition(dragState.left + (event.clientX - dragState.startX), dragState.top + (event.clientY - dragState.startY));
        event.preventDefault();
    });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', ensureInitialPosition);
    panel.__ensureFloatingPosition = ensureInitialPosition;
    requestAnimationFrame(ensureInitialPosition);
}

function __cpRenderPdfToolbar() {
    const buttonBar = document.getElementById('cp-pdf-edit-button-bar');
    const isAdmin = __cpIsAdminProfile();
    document.querySelectorAll('[data-pdf-admin-caption="1"]').forEach((node) => {
        node.classList.toggle('hidden', !isAdmin);
    });
    if (!buttonBar) return;
    const showToolbar = __cpIsPdfPreviewVisible() && isAdmin;
    buttonBar.classList.toggle('hidden', !showToolbar);
    if (!showToolbar) {
        document.getElementById('cp-pdf-inspector')?.classList.add('hidden');
        document.getElementById('cp-pdf-inspector-backdrop')?.classList.add('hidden');
        return;
    }
    const adminTools = document.getElementById('cp-pdf-admin-tools');
    if (adminTools) adminTools.classList.toggle('hidden', !isAdmin);
    const button = document.getElementById('cp-pdf-edit-button');
    if (button) {
        const editingEnabled = !__cpPdfEditLocked;
        button.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>${editingEnabled ? 'Edicion activa' : 'Editar PDF'}</span>`;
        button.className = `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition ${editingEnabled ? 'bg-emerald-600 border-emerald-400/50 hover:bg-emerald-500' : 'bg-gray-950 border-gray-700 hover:bg-gray-900'}`;
        button.classList.toggle('hidden', !isAdmin);
    }
    const addButton = document.getElementById('cp-pdf-add-button');
    if (addButton) {
        addButton.classList.toggle('pointer-events-none', __cpPdfEditLocked);
        addButton.classList.toggle('opacity-60', __cpPdfEditLocked);
    }
}

function __cpGetOrderPreviewPages() {
    const root = document.querySelector('#pdf-content .cp-pdf-root');
    if (!(root instanceof HTMLElement)) return [];
    return Array.from(root.children).filter((child) => child instanceof HTMLDivElement);
}

function __cpAttachOrderPageControls() {
    const pages = __cpGetOrderPreviewPages();
    pages.forEach((page) => page.querySelectorAll('[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove()));
    const canShow = __cpIsAdminProfile() && !__cpPdfEditLocked;
    if (!canShow || !pages.length) return;
    const cfg = __cpGetPdfStyleConfig();
    const lastPage = pages[pages.length - 1];
    if (!(lastPage instanceof HTMLElement)) return;
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.setAttribute('data-pdf-page-add', '1');
    addBtn.title = 'Añadir hoja';
    addBtn.style.position = 'absolute';
    addBtn.style.left = '50%';
    addBtn.style.bottom = '8px';
    addBtn.style.transform = 'translateX(-50%)';
    addBtn.style.zIndex = '95';
    addBtn.style.width = '28px';
    addBtn.style.height = '28px';
    addBtn.style.borderRadius = '999px';
    addBtn.style.background = '#ffffff';
    addBtn.style.border = '1px solid #e5e7eb';
    addBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
    addBtn.style.cursor = 'pointer';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    lastPage.appendChild(addBtn);

    const basePages = __cpGetPdfBasePageCount();
    const currentExtra = Number(cfg.extraPages || 0);
    const canRemove = currentExtra > 0 || (currentExtra === 0 && basePages > 1);
    if (!canRemove) return;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.setAttribute('data-pdf-page-delete', '1');
    delBtn.title = 'Quitar última hoja';
    delBtn.style.position = 'absolute';
    delBtn.style.right = '8px';
    delBtn.style.top = '8px';
    delBtn.style.zIndex = '95';
    delBtn.style.width = '28px';
    delBtn.style.height = '28px';
    delBtn.style.borderRadius = '999px';
    delBtn.style.background = '#ffffff';
    delBtn.style.border = '1px solid #e5e7eb';
    delBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.15)';
    delBtn.style.cursor = 'pointer';
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    lastPage.appendChild(delBtn);
}

function __cpHandleOrderPageControlClick(targetEl) {
    if (!targetEl || !__cpIsAdminProfile() || __cpPdfEditLocked) return false;
    if (targetEl.hasAttribute('data-pdf-page-add')) {
        const cfg = __cpGetPdfStyleConfig();
        const nextExtra = __cpClampStyleNumber((parseInt(cfg.extraPages, 10) || 0) + 1, -1, 6, cfg.extraPages);
        const next = __cpNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __cpSetPdfStyleConfig(next, { applyToDom: true });
        __cpWritePdfStyleControls(next);
        __cpScheduleSharedPdfStyleSync(next);
        return true;
    }
    if (targetEl.hasAttribute('data-pdf-page-delete')) {
        const cfg = __cpGetPdfStyleConfig();
        const currentExtra = __cpClampStyleNumber(cfg.extraPages, -1, 6, 0);
        const basePages = __cpGetPdfBasePageCount();
        const nextExtra = currentExtra > 0
            ? (currentExtra - 1)
            : ((currentExtra === 0 && basePages > 1) ? -1 : currentExtra);
        if (nextExtra === currentExtra) return true;
        const next = __cpNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __cpSetPdfStyleConfig(next, { applyToDom: true });
        __cpWritePdfStyleControls(next);
        __cpScheduleSharedPdfStyleSync(next);
        return true;
    }
    return false;
}

function __cpSyncPdfEditMode() {
    const editingEnabled = __cpIsAdminProfile() && !__cpPdfEditLocked;
    document.querySelectorAll('#pdf-content .cp-pdf-root').forEach((node) => {
        node.classList.toggle('cp-pdf-admin-enabled', editingEnabled);
    });
    if (!editingEnabled) __cpClosePdfInspector();
    __cpRenderPdfToolbar();
    __cpAttachOrderPageControls();
    __cpEnsureMarginGuideController()?.refresh();
}

function __cpSetPdfEditLocked(locked) {
    const wasLocked = __cpPdfEditLocked;
    __cpPdfEditLocked = locked !== false;
    if (__cpPdfEditLocked) __cpClosePdfInspector();
    __cpSyncPdfEditMode();
    if (!wasLocked && __cpPdfEditLocked && __cpIsAdminProfile()) {
        Promise.resolve()
            .then(() => __cpPersistSharedPdfStyleConfig(__cpGetPdfStyleConfig(), { force: true }))
            .catch(() => { });
    }
}

function __cpGetPdfInspectorTarget() {
    if (!__cpPdfInspectorState || !__cpIsAdminProfile()) return null;
    if (__cpPdfInspectorState.kind === 'base') {
        const key = String(__cpPdfInspectorState.key || '').trim();
        const meta = __cpGetPdfBaseBlockMeta(key);
        if (!meta) return null;
        const layouts = __cpNormalizePdfBaseLayouts(__cpGetPdfStyleConfig().baseLayouts);
        const instanceKey = String(__cpPdfInspectorState.instanceKey || key).trim();
        const layout = layouts[instanceKey] || layouts[key] || __cpNormalizePdfBaseLayout();
        const canEdit = __cpCanEditPdfBaseBlock(key);
        return {
            kind: 'base',
            id: instanceKey,
            label: meta.label,
            layout,
            canMove: __cpCanMovePdfBaseBlock(key),
            canEdit,
            contentFields: canEdit ? __cpGetOrderBaseContentFields(key) : [],
            canDelete: false
        };
    }
    if (__cpPdfInspectorState.kind === 'resource') {
        const resource = __cpGetPdfResourcesFromState().find((item) => item.id === __cpPdfInspectorState.id);
        if (!resource) return null;
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const isLogo = resource.type === 'logo';
        const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
        const isBar = resource.type === 'bar';
        const canMove = __cpCanMovePdfResource(resource);
        const canEdit = __cpCanEditPdfResource(resource);
        return {
            kind: 'resource',
            id: resource.id,
            label: resource.type === 'title'
                ? 'Titulo libre'
                : (isSignBlock
                    ? 'Bloque de firma'
                    : (isSignLine
                        ? 'Linea de firma'
                        : (isBar ? 'Linea decorativa' : (isLogo ? 'Logo' : 'Texto libre')))),
            resource,
            canMove,
            canEdit,
            allowText: canEdit && isTextLike,
            showTypography: canEdit && (isTextLike || isSignBlock),
            showToggles: canEdit && isTextLike,
            showAlign: canEdit && isTextLike,
            showColor: canEdit && (isTextLike || isSignBlock),
            showBgColor: canEdit && !isLogo,
            bgColorLabel: isSignBlock || isSignLine ? 'Color linea' : (isBar ? 'Color' : 'Fondo'),
            contentFields: canEdit && isSignBlock
                ? [
                    { key: 'signTitle', label: 'Titulo', value: String(resource.signTitle || ''), max: 120, multiline: false },
                    { key: 'signRole', label: 'Subtitulo', value: String(resource.signRole || ''), max: 120, multiline: false }
                ]
                : [],
            canDelete: canMove || canEdit
        };
    }
    return null;
}

function __cpRenderPdfInspector() {
    const panel = document.getElementById('cp-pdf-inspector');
    const backdrop = document.getElementById('cp-pdf-inspector-backdrop');
    if (!(panel instanceof HTMLElement)) return;
    const target = __cpGetPdfInspectorTarget();
    const shouldShow = !!target && !__cpPdfEditLocked && __cpIsAdminProfile();
    panel.classList.toggle('hidden', !shouldShow);
    if (backdrop) backdrop.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;
    if (typeof panel.__ensureFloatingPosition === 'function') requestAnimationFrame(() => panel.__ensureFloatingPosition());
    const title = panel.querySelector('[data-pdf-inspector-title]');
    const body = panel.querySelector('[data-pdf-inspector-body]');
    if (title) title.textContent = target.label;
    if (!(body instanceof HTMLElement)) return;
    if (target.kind === 'base') {
        const contentFields = Array.isArray(target.contentFields) ? target.contentFields : [];
        const templateHelperSection = contentFields.length ? __cpTemplateTagsInspectorCardHtml() : '';
        const layoutSection = target.canMove
            ? `<div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" type="number" min="${__CP_PDF_BASE_LAYOUT_LIMITS.x.min}" max="${__CP_PDF_BASE_LAYOUT_LIMITS.x.max}" value="${target.layout.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" type="number" min="${__CP_PDF_BASE_LAYOUT_LIMITS.y.min}" max="${__CP_PDF_BASE_LAYOUT_LIMITS.y.max}" value="${target.layout.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Escala</span><input data-pdf-inspector-field="scalePct" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" type="number" min="${__CP_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__CP_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${target.layout.scalePct}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-pdf-inspector-field="angle" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" type="number" min="${__CP_PDF_BASE_LAYOUT_LIMITS.angle.min}" max="${__CP_PDF_BASE_LAYOUT_LIMITS.angle.max}" value="${target.layout.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Visible</span><select data-pdf-inspector-field="visible" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${!target.layout.hidden ? 'selected' : ''}>Sí</option><option value="false" ${target.layout.hidden ? 'selected' : ''}>No</option></select></label>
            </div>`
            : '';
        const contentSection = contentFields.length
            ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
                ${contentFields.map((field) => field.multiline
                ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><textarea data-pdf-inspector-field="${__cpSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" rows="${field.rows || 4}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__cpSafeHtml(field.value || '')}</textarea></label>`
                : `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__cpSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" type="text" value="${__cpSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
            </div>`
            : '';
        const resetButton = target.canMove
            ? `<button type="button" data-pdf-inspector-action="reset" data-target-kind="base" data-target-id="${__cpSafeHtml(target.id)}" class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:border-brand-red hover:text-brand-red">Restablecer bloque</button>`
            : '';
        body.innerHTML = `
            ${layoutSection}
            ${contentSection}
            ${templateHelperSection}
            ${resetButton}
        `;
        return;
    }
    const resource = target.resource;
    const templateHelperSection = (target.allowText || (Array.isArray(target.contentFields) && target.contentFields.length))
        ? __cpTemplateTagsInspectorCardHtml()
        : '';
    const contentSection = Array.isArray(target.contentFields) && target.contentFields.length
        ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
            ${target.contentFields.map((field) => `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__cpSafeHtml(field.key)}" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="text" value="${__cpSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
        </div>`
        : '';
    const moveFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" value="${resource.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" value="${resource.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ancho</span><input data-pdf-inspector-field="w" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" min="16" value="${resource.w}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alto</span><input data-pdf-inspector-field="h" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" min="1" value="${resource.h}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
        `
        : '';
    const moveMetaFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ángulo</span><input data-pdf-inspector-field="angle" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Página</span><input data-pdf-inspector-field="page" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" min="1" max="8" value="${resource.page}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-pdf-inspector-field="enabled" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${resource.enabled ? 'selected' : ''}>Sí</option><option value="false" ${!resource.enabled ? 'selected' : ''}>No</option></select></label>
        `
        : '';
    body.innerHTML = `
        ${target.allowText ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Texto</span><textarea data-pdf-inspector-field="text" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" rows="4" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__cpSafeHtml(resource.text)}</textarea></label>` : ''}
        ${contentSection}
        ${templateHelperSection}
        <div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
            ${moveFields}
            ${target.showTypography ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fuente</span><input data-pdf-inspector-field="fontSize" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>` : ''}
            ${moveMetaFields}
            ${target.showAlign ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alineación</span><select data-pdf-inspector-field="align" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option><option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option><option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option><option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option></select></label>` : ''}
            ${target.showColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Color</span><input data-pdf-inspector-field="color" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="color" value="${resource.color}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
            ${target.showBgColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__cpSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-pdf-inspector-field="bgColor" data-target-kind="resource" data-target-id="${__cpSafeHtml(resource.id)}" type="color" value="${resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2 ${target.showToggles ? '' : 'hidden'}">
            <button type="button" data-pdf-inspector-toggle="bold" data-target-id="${__cpSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.bold ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Negrita</button>
            <button type="button" data-pdf-inspector-toggle="italic" data-target-id="${__cpSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.italic ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Itálica</button>
            <button type="button" data-pdf-inspector-toggle="underline" data-target-id="${__cpSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.underline ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Subrayado</button>
        </div>
        ${target.canDelete ? `<button type="button" data-pdf-inspector-action="delete" data-target-id="${__cpSafeHtml(resource.id)}" class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition hover:bg-red-100"><i class="fa-solid fa-trash"></i><span>Eliminar recurso</span></button>` : ''}
    `;
}

function __cpOpenPdfInspector(state) {
    __cpPdfInspectorState = state && typeof state === 'object' ? { ...state } : null;
    __cpRenderPdfInspector();
}

function __cpClosePdfInspector() {
    __cpPdfInspectorState = null;
    __cpRenderPdfInspector();
}

function __cpCommitResourceInspectorField(resourceId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const resources = __cpGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    const current = resources[idx];
    const canMove = __cpCanMovePdfResource(current);
    const canEdit = __cpCanEditPdfResource(current);
    if (field === 'text') {
        if (!canEdit) return;
        current.text = String(rawValue || '').slice(0, 1200);
    } else if (field === 'signTitle' || field === 'signRole') {
        if (!canEdit) return;
        current[field] = String(rawValue || '').slice(0, 120);
    } else if (field === 'fontSize') {
        if (!canEdit) return;
        current.fontSize = __cpClampStyleNumber(rawValue, 8, 72, current.fontSize);
    } else if (field === 'align') {
        if (!canEdit) return;
        current.align = __cpNormalizeStyleAlign(rawValue, current.align);
    } else if (field === 'color') {
        if (!canEdit) return;
        current.color = __cpNormalizeHexColor(rawValue, current.color);
    } else if (field === 'bgColor') {
        if (!canEdit) return;
        current.bgColor = __cpNormalizeHexColor(rawValue, current.bgColor);
    } else if (field === 'page') {
        if (!canMove) return;
        current.page = __cpClampStyleNumber(rawValue, 1, 8, current.page);
    } else if (field === 'x') {
        if (!canMove) return;
        current.x = __cpClampStyleNumber(rawValue, -4000, 4000, current.x);
    } else if (field === 'y') {
        if (!canMove) return;
        current.y = __cpClampStyleNumber(rawValue, -5000, 5000, current.y);
    } else if (field === 'w') {
        if (!canMove) return;
        current.w = __cpClampStyleNumber(rawValue, 16, 4000, current.w);
    } else if (field === 'h') {
        if (!canMove) return;
        current.h = __cpClampStyleNumber(rawValue, 1, 5000, current.h);
    } else if (field === 'angle') {
        if (!canMove) return;
        current.angle = __cpClampStyleNumber(rawValue, -360, 360, current.angle || 0);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        if (!canEdit) return;
        current[field] = !!rawValue;
    } else if (field === 'enabled') {
        if (!canMove) return;
        current.enabled = !!rawValue;
    }
    else return;
    resources[idx] = { ...current };
    __cpCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
}

function __cpHandlePdfInspectorInput(event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    const isContinuousInput = event.type === 'input'
        && (
            target instanceof HTMLTextAreaElement
            || (target instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(target.type || '').toLowerCase()))
        );
    const field = String(target.getAttribute('data-pdf-inspector-field') || '').trim();
    const kind = String(target.getAttribute('data-target-kind') || '').trim();
    const id = String(target.getAttribute('data-target-id') || '').trim();
    if (!field || !kind || !id) return;
    const rawValue = target instanceof HTMLSelectElement
        ? ((field === 'visible' || field === 'enabled') ? String(target.value) === 'true' : target.value)
        : (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '');
    if (kind === 'base') {
        const baseKey = String(id || '').split('__')[0].trim();
        if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(field)) __cpCommitBaseLayoutField(`base:${id}`, field, rawValue);
        else if (__cpCanEditPdfBaseBlock(baseKey)) __cpCommitPdfContentField(field, rawValue, {
            refreshPreview: !isContinuousInput,
            skipEditorUiRefresh: isContinuousInput
        });
        else return;
    } else {
        __cpCommitResourceInspectorField(id, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
    }
    if (isContinuousInput) {
        // En escritura continua no re-renderizamos el inspector para evitar perdida de foco por tecla.
        requestAnimationFrame(() => {
            const panel = document.getElementById('cp-pdf-inspector');
            if (panel && typeof panel.__ensureFloatingPosition === 'function') panel.__ensureFloatingPosition();
        });
        return;
    }
    __cpRenderPdfInspector();
}

function __cpHandlePdfInspectorClick(event) {
    const actionEl = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-action]') : null;
    if (actionEl) {
        const action = String(actionEl.getAttribute('data-pdf-inspector-action') || '').trim();
        const id = String(actionEl.getAttribute('data-target-id') || '').trim();
        const kind = String(actionEl.getAttribute('data-target-kind') || '').trim();
        if (action === 'close') {
            __cpClosePdfInspector();
            return;
        }
        if (action === 'open-template-tags') {
            window.openCpPdfTemplateTagsModal?.();
            return;
        }
        if (action === 'reset' && kind === 'base' && id) {
            __cpCommitBaseLayoutField(`base:${id}`, 'x', 0);
            __cpCommitBaseLayoutField(`base:${id}`, 'y', 0);
            __cpCommitBaseLayoutField(`base:${id}`, 'scalePct', 100);
            __cpCommitBaseLayoutField(`base:${id}`, 'angle', 0);
            __cpCommitBaseLayoutField(`base:${id}`, 'visible', true);
            __cpRenderPdfInspector();
            return;
        }
        if (action === 'delete' && id) {
            const resources = __cpGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            __cpPdfResourceEditorSelectedId = '';
            __cpClosePdfInspector();
            __cpCommitPdfResources(resources);
        }
        return;
    }
    const toggle = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-toggle]') : null;
    if (!toggle) return;
    const field = String(toggle.getAttribute('data-pdf-inspector-toggle') || '').trim();
    const id = String(toggle.getAttribute('data-target-id') || '').trim();
    if (!field || !id) return;
    const current = __cpGetPdfResourcesFromState().find((resource) => resource.id === id);
    if (!current) return;
    __cpCommitResourceInspectorField(id, field, !current[field]);
    __cpRenderPdfInspector();
}

function __cpEnsurePdfEditingChrome(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const container = document.getElementById('preview-container');
    if (!(container instanceof HTMLElement)) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (!document.getElementById('cp-pdf-edit-button-bar')) {
        const buttonBar = document.createElement('div');
        buttonBar.id = 'cp-pdf-edit-button-bar';
        buttonBar.className = 'hidden absolute right-4 top-4 z-[96] flex items-center gap-2';
        buttonBar.innerHTML = `
            <div id="cp-pdf-admin-tools" class="flex items-center gap-2 transition">
                <button type="button" id="cp-pdf-add-button" class="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-700 shadow-lg transition hover:border-brand-red hover:text-brand-red">
                    <i class="fa-solid fa-plus"></i>
                    <span>Anadir recurso</span>
                </button>
            </div>
            <button type="button" id="cp-pdf-edit-button" class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition"></button>
        `;
        buttonBar.addEventListener('click', (event) => {
            const addButton = event.target instanceof Element ? event.target.closest('#cp-pdf-add-button') : null;
            if (addButton) {
                if (__cpPdfEditLocked || !__cpIsAdminProfile()) return;
                window.openModal('pdf-resource-modal');
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('#cp-pdf-edit-button') : null;
            if (!button) return;
            __cpSetPdfEditLocked(!__cpPdfEditLocked);
        });
        container.appendChild(buttonBar);
    }
    if (!document.getElementById('cp-pdf-inspector-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'cp-pdf-inspector-backdrop';
        backdrop.className = 'hidden absolute inset-0 z-[96] bg-gray-950/45 backdrop-blur-[1px]';
        container.appendChild(backdrop);
    }
    if (!document.getElementById('cp-pdf-inspector')) {
        const panel = document.createElement('div');
        panel.id = 'cp-pdf-inspector';
        panel.className = 'hidden absolute z-[97] w-full max-w-[420px]';
        panel.innerHTML = `
            <div data-pdf-inspector-card class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div data-pdf-panel-handle class="flex cursor-grab items-start justify-between gap-3 border-b border-gray-100 bg-white px-4 py-4 active:cursor-grabbing">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Edicion</p>
                        <h4 data-pdf-inspector-title class="text-sm font-black text-gray-800">Elemento</h4>
                    </div>
                    <button type="button" data-pdf-inspector-action="close" class="h-8 w-8 rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div data-pdf-inspector-body class="custom-scroll space-y-3 overflow-y-auto px-4 py-4 text-xs text-gray-600" style="max-height:min(72vh,calc(100vh - 8rem));"></div>
            </div>
        `;
        panel.addEventListener('input', __cpHandlePdfInspectorInput);
        panel.addEventListener('change', __cpHandlePdfInspectorInput);
        panel.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            if (!(event.target instanceof HTMLInputElement)) return;
            if (event.target.type === 'button' || event.target.type === 'submit' || event.target.type === 'reset') return;
            event.preventDefault();
        });
        panel.addEventListener('click', __cpHandlePdfInspectorClick);
        container.appendChild(panel);
    }
    __cpBindFloatingPanelDrag(document.getElementById('cp-pdf-inspector'), container);
    if (container.dataset.cpPdfEditingChromeBound !== '1') {
        container.dataset.cpPdfEditingChromeBound = '1';
        container.addEventListener('click', (event) => {
            const pageCtl = event.target instanceof Element ? event.target.closest('[data-pdf-page-add],[data-pdf-page-delete]') : null;
            if (pageCtl && __cpHandleOrderPageControlClick(pageCtl)) {
                event.preventDefault();
                return;
            }
            const del = event.target instanceof Element ? event.target.closest('.cp-pdf-delete-btn[data-res-id]') : null;
            if (!del || __cpPdfEditLocked || !__cpIsAdminProfile()) return;
            const id = String(del.getAttribute('data-res-id') || '').trim();
            if (!id) return;
            const resources = __cpGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            if (__cpPdfResourceEditorSelectedId === id) __cpPdfResourceEditorSelectedId = '';
            __cpClosePdfInspector();
            __cpCommitPdfResources(resources);
        });
        document.addEventListener('dblclick', (event) => {
            if (!__cpIsAdminProfile() || __cpPdfEditLocked) return;
            if (!__cpIsPdfPreviewVisible()) return;
            const target = event.target instanceof Element
                ? event.target
                : (event.target && event.target.parentElement instanceof Element ? event.target.parentElement : null);
            if (!target || target.closest('#cp-pdf-inspector')) return;
            const resourceNode = target.closest('#pdf-content .cp-pdf-resource[data-res-id]');
            if (resourceNode) {
                const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
                const resource = __cpFindPdfResourceById(resourceId);
                if (!resource) return;
                if (!__cpCanMovePdfResource(resource) && !__cpCanEditPdfResource(resource)) return;
                __cpPdfResourceEditorSelectedId = resourceId;
                __cpHighlightSelectedBaseTextBlock();
                __cpOpenPdfInspector({ kind: 'resource', id: __cpPdfResourceEditorSelectedId });
                return;
            }
            const baseNode = target.closest('#pdf-content [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            if (!__cpGetPdfBaseBlockMeta(baseKey)) return;
            if (!__cpCanMovePdfBaseBlock(baseKey) && !__cpCanEditPdfBaseBlock(baseKey)) return;
            __cpPdfResourceEditorSelectedId = `base:${baseKey}`;
            __cpHighlightSelectedBaseTextBlock();
            __cpOpenPdfInspector({ kind: 'base', key: baseKey, instanceKey: String(baseNode.dataset.baseInstance || baseKey).trim() });
        });
    }
    __cpSyncPdfEditMode();
    if (!skipEditorUiRefresh) __cpRenderPdfInspector();
}

function __cpApplyPdfStyleToLivePreview(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const rootNodes = document.querySelectorAll('#pdf-content .cp-pdf-root');
    if (!rootNodes.length) return;
    const vars = __cpPdfStyleVars(__cpGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __cpApplyMarginVarsToLivePreview(__cpGetPdfStyleConfig());
    __cpApplyPdfBaseLayouts();
    __cpAutoFitPdfTextResources();
    __cpEnsurePdfEditingChrome(opts);
    __cpBindPdfResourceDrag();
    __cpHighlightSelectedBaseTextBlock();
    if (!skipEditorUiRefresh) __cpRenderPdfInspector();
    __cpSyncPdfEditMode();
    if (!skipEditorUiRefresh && __cpIsAdminProfile()) __cpRenderPdfResourcesEditorList();
}

function __cpSyncPdfStyleValueLabels(style) {
    const cfg = __cpNormalizePdfStyle(style);
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('pdf-style-header-line-value', `${cfg.headerLinePx}px`);
    setText('pdf-style-title-size-value', `${cfg.titlePx}px`);
    setText('pdf-style-meta-size-value', `${cfg.metaPx}px`);
    setText('pdf-style-table-size-value', `${cfg.tableBodyPx}px`);
    setText('pdf-style-line-height-value', `${cfg.lineHeightPct}%`);
    setText('pdf-style-offset-x-value', `${cfg.offsetXPx}px`);
    setText('pdf-style-offset-y-value', `${cfg.offsetYPx}px`);
    setText('pdf-style-extra-pages-value', `${cfg.extraPages >= 0 ? '+' : ''}${cfg.extraPages}`);
    setText('pdf-style-quick-size-value', `${cfg.quickPx}px`);
    setText('pdf-style-conditions-size-value', `${cfg.conditionsPx}px`);
    setText('pdf-style-sign-size-value', `${cfg.signPx}px`);
    setText('pdf-style-margin-top-value', `${cfg.marginTopPx}px`);
    setText('pdf-style-margin-right-value', `${cfg.marginRightPx}px`);
    setText('pdf-style-margin-bottom-value', `${cfg.marginBottomPx}px`);
    setText('pdf-style-margin-left-value', `${cfg.marginLeftPx}px`);
}

function __cpWritePdfStyleControls(style) {
    const cfg = __cpNormalizePdfStyle(style);
    const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = String(val); };
    setValue('pdf-style-font-family', cfg.fontFamilyKey);
    setValue('pdf-style-header-line', cfg.headerLinePx);
    setValue('pdf-style-title-size', cfg.titlePx);
    setValue('pdf-style-meta-size', cfg.metaPx);
    setValue('pdf-style-table-size', cfg.tableBodyPx);
    setValue('pdf-style-line-height', cfg.lineHeightPct);
    setValue('pdf-style-offset-x', cfg.offsetXPx);
    setValue('pdf-style-offset-y', cfg.offsetYPx);
    setValue('pdf-style-extra-pages', cfg.extraPages);
    setValue('pdf-style-margin-top', cfg.marginTopPx);
    setValue('pdf-style-margin-right', cfg.marginRightPx);
    setValue('pdf-style-margin-bottom', cfg.marginBottomPx);
    setValue('pdf-style-margin-left', cfg.marginLeftPx);
    setValue('pdf-style-quick-size', cfg.quickPx);
    setValue('pdf-style-conditions-size', cfg.conditionsPx);
    setValue('pdf-style-sign-size', cfg.signPx);
    setValue('pdf-style-align-header', cfg.headerAlign);
    setValue('pdf-style-align-meta', cfg.metaAlign);
    setValue('pdf-style-align-table', cfg.tableAlign);
    setValue('pdf-style-align-quick', cfg.quickAlign);
    setValue('pdf-style-align-conditions', cfg.conditionsAlign);
    setValue('pdf-style-align-sign', cfg.signAlign);
    setValue('pdf-style-align-summary', cfg.summaryAlign);
    setValue('pdf-style-align-footer', cfg.footerAlign);
    __cpSyncPdfStyleValueLabels(cfg);
}

function __cpReadPdfStyleControls() {
    return __cpNormalizePdfStyle({
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __CP_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __CP_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
        tableBodyPx: document.getElementById('pdf-style-table-size')?.value,
        lineHeightPct: document.getElementById('pdf-style-line-height')?.value,
        offsetXPx: document.getElementById('pdf-style-offset-x')?.value,
        offsetYPx: document.getElementById('pdf-style-offset-y')?.value,
        extraPages: document.getElementById('pdf-style-extra-pages')?.value,
        marginTopPx: document.getElementById('pdf-style-margin-top')?.value ?? __cpGetPdfStyleConfig().marginTopPx,
        marginRightPx: document.getElementById('pdf-style-margin-right')?.value ?? __cpGetPdfStyleConfig().marginRightPx,
        marginBottomPx: document.getElementById('pdf-style-margin-bottom')?.value ?? __cpGetPdfStyleConfig().marginBottomPx,
        marginLeftPx: document.getElementById('pdf-style-margin-left')?.value ?? __cpGetPdfStyleConfig().marginLeftPx,
        baseLayouts: __cpGetPdfStyleConfig().baseLayouts,
        resources: __cpGetPdfStyleConfig().resources,
        quickPx: document.getElementById('pdf-style-quick-size')?.value,
        conditionsPx: document.getElementById('pdf-style-conditions-size')?.value,
        signPx: document.getElementById('pdf-style-sign-size')?.value,
        footerPx: __cpGetPdfStyleConfig().footerPx,
        headerAlign: document.getElementById('pdf-style-align-header')?.value,
        metaAlign: document.getElementById('pdf-style-align-meta')?.value,
        tableAlign: document.getElementById('pdf-style-align-table')?.value,
        quickAlign: document.getElementById('pdf-style-align-quick')?.value,
        conditionsAlign: document.getElementById('pdf-style-align-conditions')?.value,
        signAlign: document.getElementById('pdf-style-align-sign')?.value,
        summaryAlign: document.getElementById('pdf-style-align-summary')?.value,
        footerAlign: document.getElementById('pdf-style-align-footer')?.value
    });
}

function __cpSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __cpPdfStyleState = __cpNormalizePdfStyle(style);
    if (opts.applyToDom !== false) __cpApplyPdfStyleToLivePreview(opts);
}

function __cpNormalizeUserRole(value) {
    const safe = String(value || '').trim().toLowerCase();
    if (!safe) return '';
    if (safe === 'administrador' || safe === 'administrator' || safe === 'administrators' || safe === 'superadmin' || safe === 'super_admin' || safe === 'admins') return 'admin';
    return safe;
}

function __cpResolveCurrentUserRole() {
    const parseAuthState = (key) => {
        try {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const authState = parseAuthState('pb_native_auth_v1');
    const candidates = [
        window.currentUserProfile?.role,
        window.currentUserProfile?.rol,
        window.currentUserProfile?.record?.role,
        window.currentUserProfile?.record?.rol,
        window.currentUserProfile?.profile?.role,
        window.currentUserProfile?.profile?.rol,
        window.currentUserProfile?.user?.role,
        window.currentUserProfile?.app_user?.role,
        window.currentUserProfile?.user_metadata?.role,
        window.currentUserProfile?.app_metadata?.role,
        window.currentUser?.role,
        window.userProfile?.role,
        Array.isArray(window.currentUserProfile?.roles) ? window.currentUserProfile.roles[0] : '',
        localStorage.getItem('hub_user_cache_role') || '',
        authState?.user?.role,
        authState?.record?.role
    ];
    for (const candidate of candidates) {
        const safe = __cpNormalizeUserRole(candidate);
        if (safe) return safe;
    }
    return '';
}

function __cpIsAdminProfile() {
    return __cpResolveCurrentUserRole() === 'admin';
}

function __cpResolvePdfActorName() {
    const candidates = [
        window.currentUserProfile?.login_username,
        window.currentUserProfile?.record?.login_username,
        window.currentUserProfile?.profile?.login_username,
        window.currentUserProfile?.Usernames,
        window.currentUserProfile?.username,
        window.currentUserProfile?.record?.username,
        window.currentUserProfile?.profile?.username,
        window.currentUserProfile?.full_name,
        window.currentUserProfile?.name,
        window.currentUserProfile?.record?.full_name,
        window.currentUserProfile?.record?.name,
        window.currentUserProfile?.profile?.full_name,
        window.currentUserProfile?.profile?.name,
        window.currentUserProfile?.email ? String(window.currentUserProfile.email).split('@')[0] : '',
        window.currentUserProfile?.record?.email ? String(window.currentUserProfile.record.email).split('@')[0] : ''
    ];
    const resolved = candidates.map((value) => __orderSanitizeActorName(value)).find(Boolean);
    return resolved || 'Usuario';
}

function __cpCanUsePdfNotes() {
    return false;
}

async function __cpLoadCurrentUserProfile(user) {
    const pbClient = window.globalPocketBase || window.pbClient || window.tenantPocketBase;
    const fallback = user && typeof user === 'object' ? user : {};
    if (!pbClient) return { ...fallback };
    const parseAuthState = (key) => {
        try {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) {
            return null;
        }
    };
    const authState = parseAuthState('pb_native_auth_v1');
    const idCandidates = [...new Set([
        String(fallback?.id || '').trim(),
        String(fallback?.record?.id || '').trim(),
        String(authState?.user?.id || '').trim(),
        String(authState?.record?.id || '').trim()
    ].filter(Boolean))];
    const emailCandidates = [...new Set([
        String(fallback?.email || '').trim().toLowerCase(),
        String(fallback?.record?.email || '').trim().toLowerCase(),
        String(authState?.user?.email || '').trim().toLowerCase(),
        String(authState?.record?.email || '').trim().toLowerCase()
    ].filter(Boolean))];
    const usernameCandidates = [...new Set([
        String(fallback?.login_username || '').trim(),
        String(fallback?.record?.login_username || '').trim(),
        String(fallback?.username || '').trim(),
        String(fallback?.record?.username || '').trim(),
        String(authState?.user?.login_username || '').trim(),
        String(authState?.record?.login_username || '').trim(),
        String(authState?.user?.username || '').trim(),
        String(authState?.record?.username || '').trim()
    ].filter(Boolean))];
    const lookupByField = async (table, field, values) => {
        for (const value of values) {
            try {
                const { data } = await pbClient.from(table).select('*').eq(field, value).maybeSingle();
                if (data) return data;
            } catch (_) { }
        }
        return null;
    };
    let appUser = await lookupByField('app_users', 'id', idCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'email', emailCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'login_username', usernameCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'username', usernameCandidates);
    const merged = { ...(appUser || {}), ...fallback };
    const role = __cpNormalizeUserRole(
        appUser?.role
        || appUser?.rol
        || fallback?.role
        || fallback?.rol
        || fallback?.record?.role
        || fallback?.record?.rol
    );
    if (role) {
        merged.role = role;
        localStorage.setItem('hub_user_cache_role', role);
    }
    if (!merged.username) merged.username = appUser?.login_username || appUser?.username || fallback?.login_username || fallback?.username || fallback?.email?.split('@')[0] || '';
    return merged;
}

function __cpOverlayDocumentType(profile) {
    const safeProfile = __cpNormalizePdfStyleProfileKey(profile);
    return __CP_PDF_OVERLAY_TYPES[safeProfile] || __CP_PDF_OVERLAY_TYPES.quote;
}

function __cpParseJsonObjectLike(value) {
    if (value && typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function __cpResolvePdfOverlayConfigPayload(record = {}) {
    const rawRecord = record && typeof record === 'object' ? record : {};
    const configJson = __cpParseJsonObjectLike(rawRecord.config_json);
    if (configJson) return configJson;
    const elements = __cpParseJsonObjectLike(rawRecord.elements) || {};
    const elementConfig = __cpParseJsonObjectLike(elements.config_json);
    if (elementConfig) return elementConfig;
    if (elements.profiles && typeof elements.profiles === 'object') {
        return {
            tenant: rawRecord.tenant || elements.tenant || __CP_PDF_STYLE_TENANT,
            version: Math.max(2, parseInt(elements.version, 10) || 2),
            updated_at: elements.updated_at || new Date().toISOString(),
            profiles: elements.profiles
        };
    }
    return {};
}

function __cpBuildPdfStyleConfigPayload(rawExisting, style, profile = __cpPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const key = __cpNormalizePdfStyleProfileKey(profile);
    const profiles = existing.profiles && typeof existing.profiles === 'object' ? { ...existing.profiles } : {};
    profiles[key] = __cpNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __CP_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: new Date().toISOString(),
        profiles
    };
}

function __cpBuildPdfOverlayElementsPayload(configJson) {
    const resolved = __cpResolvePdfOverlayConfigPayload({ config_json: configJson });
    const objects = [];
    const profiles = resolved.profiles && typeof resolved.profiles === 'object' ? resolved.profiles : {};
    Object.entries(profiles).forEach(([profileKey, style]) => {
        const safeStyle = __cpNormalizePdfStyle(style);
        const safeResources = __cpNormalizePdfResources(safeStyle.resources);
        safeResources.forEach((resource, index) => {
            const safeType = String(resource.type || '').toLowerCase();
            objects.push({
                id: `${profileKey}:${resource.id || index}`,
                overlay_profile: profileKey,
                overlay_resource_type: safeType,
                type: safeType === 'logo' ? 'image' : ((safeType === 'bar' || safeType === 'sign' || safeType === 'sign-line') ? 'rect' : 'textbox'),
                left: Number(resource.x || 0),
                top: Number(resource.y || 0),
                width: Number(resource.w || 0),
                height: Number(resource.h || 0),
                angle: Number(resource.angle || 0),
                fill: resource.bgColor || resource.color || '#111827',
                backgroundColor: resource.bgColor || 'transparent',
                text: resource.text || '',
                signTitle: resource.signTitle || '',
                signRole: resource.signRole || '',
                fontSize: Number(resource.fontSize || 14),
                fontFamily: __CP_PDF_STYLE_FONT_MAP[resource.fontFamilyKey || safeStyle.fontFamilyKey] || __CP_PDF_STYLE_FONT_MAP.segoe,
                page: Number(resource.page || 1),
                enabled: resource.enabled !== false
            });
        });
    });
    return {
        tenant: resolved.tenant || __CP_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(resolved.version, 10) || 2),
        updated_at: resolved.updated_at || new Date().toISOString(),
        profiles,
        config_json: resolved,
        objects
    };
}

function __cpPickLatestRecord(records) {
    const list = Array.isArray(records) ? records.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

async function __cpLoadModernPdfStyleRecord(profileKey) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    const overlayDocumentType = __cpOverlayDocumentType(profileKey);
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from(__CP_PDF_OVERLAYS_COLLECTION)
                .select('id,config_json,elements,updated,created,updated_at,created_at')
                .eq('tenant', __CP_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            const row = __cpPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                return {
                    source: 'pdf_overlays',
                    id: String(row.id || ''),
                    config: __cpResolvePdfOverlayConfigPayload(row),
                    raw: row.config_json || row.elements || {}
                };
            }
        } catch (_) { }
    }
    return null;
}

async function __cpUpsertModernPdfStyleRecord(profileKey, configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return { id: '', config: configJson || {} };
    const overlayDocumentType = __cpOverlayDocumentType(profileKey);
    const safeConfig = __cpResolvePdfOverlayConfigPayload({ config_json: configJson || {} });
    const payload = {
        tenant: __CP_PDF_STYLE_TENANT,
        document_type: overlayDocumentType,
        config_json: safeConfig,
        elements: __cpBuildPdfOverlayElementsPayload(safeConfig)
    };
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existing, error: lookupError } = await pbClient
                .from(__CP_PDF_OVERLAYS_COLLECTION)
                .select('id,updated,created,updated_at,created_at')
                .eq('tenant', __CP_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            if (lookupError) throw lookupError;
            const existingRow = __cpPickLatestRecord(Array.isArray(existing) ? existing : (existing ? [existing] : []));
            if (existingRow?.id) {
                const { error: updError } = await pbClient
                    .from(__CP_PDF_OVERLAYS_COLLECTION)
                    .update(payload)
                    .eq('tenant', __CP_PDF_STYLE_TENANT)
                    .eq('document_type', overlayDocumentType);
                if (updError) throw updError;
                return { id: String(existingRow.id), config: payload.config_json };
            }
            const { data: inserted, error: insError } = await pbClient
                .from(__CP_PDF_OVERLAYS_COLLECTION)
                .insert(payload)
                .select('id')
                .single();
            if (insError) throw insError;
            return { id: String(inserted?.id || ''), config: payload.config_json };
        } catch (e) {
            lastError = e;
        }
    }
    if (lastError) throw lastError;
    return { id: '', config: payload.config_json };
}

async function __cpLoadSharedPdfStyleConfig(profile = 'quote') {
    const profileKey = __cpNormalizePdfStyleProfileKey(profile);
    try {
        const record = await __cpLoadModernPdfStyleRecord(profileKey);
        __cpPdfStyleActiveProfile = profileKey;
        __cpPdfStyleConfigRecordId = record?.id || '';
        __cpPdfStyleConfigStore = record?.source || '';
        __cpPdfStyleRawPayload = record?.raw || {};
        const resolved = record?.config ? __cpExtractPdfStyleProfile(record.config, profileKey) : __CP_PDF_STYLE_DEFAULTS;
        __cpSetPdfStyleConfig(resolved || __CP_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __cpWritePdfStyleControls(__cpGetPdfStyleConfig());
        if (__cpIsAdminProfile()) __cpRenderPdfResourcesEditorList();
    } catch (e) {
        console.warn('No se pudo cargar la configuracion PDF compartida (CP):', e);
    }
}

async function __cpEnsurePdfStyleProfile(docType, options = {}) {
    const wanted = __cpNormalizePdfStyleProfileKey(docType === 'order' ? 'order' : 'quote');
    const forceReload = !!(options && options.forceReload);
    if (!forceReload && __cpPdfStyleActiveProfile === wanted && __cpPdfStyleState) return;
    await __cpLoadSharedPdfStyleConfig(wanted);
}

async function __cpPersistSharedPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__cpIsAdminProfile() && opts.force !== true) return;
    const normalized = __cpNormalizePdfStyle(style);
    try {
        const configJson = __cpBuildPdfStyleConfigPayload(__cpPdfStyleRawPayload || {}, normalized, __cpPdfStyleActiveProfile);
        const saved = await __cpUpsertModernPdfStyleRecord(__cpPdfStyleActiveProfile, configJson);
        __cpPdfStyleConfigRecordId = saved.id;
        __cpPdfStyleConfigStore = 'pdf_overlays';
        __cpPdfStyleRawPayload = saved.config;
    } catch (e) {
        console.warn('No se pudo guardar la configuracion PDF compartida (CP):', e);
    }
}

function __cpScheduleSharedPdfStyleSync(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__cpIsAdminProfile() && opts.force !== true) return;
    if (__cpPdfStyleSyncTimer) clearTimeout(__cpPdfStyleSyncTimer);
    __cpPdfStyleSyncTimer = setTimeout(() => {
        __cpPersistSharedPdfStyleConfig(style || __cpPdfStyleState, opts);
    }, 450);
}

function __cpHandlePdfStyleControlChange() {
    if (!__cpIsAdminProfile()) return;
    const next = __cpReadPdfStyleControls();
    __cpSetPdfStyleConfig(next, { applyToDom: true });
    __cpSyncPdfStyleValueLabels(next);
    __cpScheduleSharedPdfStyleSync(next);
}

function __cpRefreshPreviewFromStyleState(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!currentPreviewOrder) return;
    const pdfContainer = document.getElementById('pdf-content');
    if (!pdfContainer || pdfContainer.classList.contains('hidden')) return;
    const docType = currentPreviewOrder.docType || 'quote';
    pdfContainer.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
    __cpApplyPdfStyleToLivePreview(opts);
}

function __cpCommitPdfResources(resources, options = {}) {
    const cfg = __cpGetPdfStyleConfig();
    const next = __cpNormalizePdfStyle({ ...cfg, resources: __cpNormalizePdfResources(resources) });
    // Permite actualizar preview sin reconstruir paneles de edicion (evita blur al escribir).
    const skipEditorUiRefresh = options && options.skipEditorUiRefresh === true;
    __cpSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh });
    __cpScheduleSharedPdfStyleSync(next, { force: options.forcePersist === true });
    if (options.refreshPreview !== false) __cpRefreshPreviewFromStyleState({ skipEditorUiRefresh });
    if (!skipEditorUiRefresh) {
        __cpRenderPdfResourcesEditorList();
        __cpRenderPdfInspector();
    }
}

function __cpGetPdfResourcesFromState() {
    return __cpNormalizePdfResources(__cpGetPdfStyleConfig().resources);
}

function __cpGetPdfBasePageCount(docType = currentPreviewOrder?.docType || 'quote') {
    return String(docType || 'quote').toLowerCase() === 'order' ? 1 : 2;
}

function __cpResolvePdfNotePlacement(style, docType = currentPreviewOrder?.docType || 'quote') {
    const cfg = __cpNormalizePdfStyle(style || __cpGetPdfStyleConfig());
    const basePages = __cpGetPdfBasePageCount(docType);
    let extraPages = Math.max(0, __cpClampStyleNumber(cfg.extraPages, 0, 6, 0));
    if (extraPages === 0) extraPages = 1;
    let page = basePages + extraPages;
    const resources = __cpNormalizePdfResources(cfg.resources);
    const noteResources = resources
        .filter((resource) => resource.isUserNote === true && Number(resource.page || 1) === page)
        .sort((a, b) => (a.y + a.h) - (b.y + b.h));
    let y = noteResources.length ? (noteResources[noteResources.length - 1].y + noteResources[noteResources.length - 1].h + 22) : 140;
    const pageBaseHeight = Number(__orderContentBaseHeightPx().toFixed(2));
    if (y > pageBaseHeight - 220 && extraPages < 6) {
        extraPages += 1;
        page = basePages + extraPages;
        y = 140;
    }
    return { page, extraPages, y };
}

function __cpBuildPdfNoteResource(noteText, authorName, style) {
    const placement = __cpResolvePdfNotePlacement(style);
    return {
        id: `cpnote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: 'text',
        enabled: true,
        page: placement.page,
        x: 72,
        y: placement.y,
        w: 320,
        h: 110,
        text: `NOTA\n${String(noteText || '').trim()}\n\nAgregado por: ${authorName}`,
        fontFamilyKey: '',
        fontSize: 13,
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        color: '#7c2d12',
        bgColor: '#fef3c7',
        angle: 0,
        isUserNote: true,
        noteAuthor: authorName,
        __extraPages: placement.extraPages
    };
}

function __cpOpenPdfNoteModal() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
}

window.submitPdfNoteFromModal = async function () {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
};

function __cpRenderFontFamilyOptions(selectedKey) {
    const selected = String(selectedKey || __CP_PDF_STYLE_DEFAULTS.fontFamilyKey).toLowerCase();
    return Object.entries(__CP_PDF_STYLE_FONT_LABELS)
        .map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function __cpRenderBaseTextBlocksEditorList(cfg) {
    return __CP_PDF_BASE_TEXT_BLOCKS.map((block) => {
        const selectedClass = block.id === __cpPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-700';
        const canEdit = __cpCanEditPdfBaseBlock(block.key);
        const disabledAttr = canEdit ? '' : 'disabled';
        const disabledClass = canEdit ? '' : ' opacity-60 cursor-not-allowed';
        const sizeCfg = block.sizeField ? (__CP_PDF_BASE_SIZE_LIMITS[block.sizeField] || { min: 8, max: 72 }) : null;
        const sizeValue = block.sizeField ? Number(cfg[block.sizeField] || __CP_PDF_STYLE_DEFAULTS[block.sizeField] || 12) : null;
        const alignValue = String(cfg[block.alignField] || 'left');
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-900/70 space-y-1">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-base-action="select" data-base-id="${block.id}" class="text-[10px] font-bold uppercase text-gray-100">${block.label}</button>
                    <span class="text-[9px] uppercase text-gray-400">Base</span>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400">Fuente
                        <select data-base-id="${block.id}" data-base-field="fontFamilyKey" ${disabledAttr} class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                            ${__cpRenderFontFamilyOptions(cfg.fontFamilyKey)}
                        </select>
                    </label>
                    <label class="text-[9px] text-gray-400">Alineación
                        <select data-base-id="${block.id}" data-base-field="${block.alignField}" ${disabledAttr} class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                            <option value="left" ${alignValue === 'left' ? 'selected' : ''}>Izquierda</option>
                            <option value="center" ${alignValue === 'center' ? 'selected' : ''}>Centro</option>
                            <option value="right" ${alignValue === 'right' ? 'selected' : ''}>Derecha</option>
                            <option value="justify" ${alignValue === 'justify' ? 'selected' : ''}>Justificado</option>
                        </select>
                    </label>
                    ${sizeCfg ? `<label class="text-[9px] text-gray-400">Tamaño
                        <input data-base-id="${block.id}" data-base-field="${block.sizeField}" ${disabledAttr} type="number" min="${sizeCfg.min}" max="${sizeCfg.max}" value="${sizeValue}" class="w-full bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-[10px]${disabledClass}">
                    </label>` : `<div class="text-[9px] text-gray-500 flex items-end">Sin tamaño dedicado</div>`}
                    <div class="text-[9px] text-gray-500 flex items-end">${canEdit ? 'Click sobre el PDF para seleccionar' : 'Solo posición (drag & drop / doble click)'}</div>
                </div>
            </div>
        `;
    }).join('');
}

function __cpCommitBaseTextBlockField(field, rawValue) {
    const cfg = __cpGetPdfStyleConfig();
    const nextRaw = { ...cfg };
    if (field === 'fontFamilyKey') {
        const fontKey = String(rawValue || '').toLowerCase();
        if (!__CP_PDF_STYLE_FONT_MAP[fontKey]) return;
        nextRaw.fontFamilyKey = fontKey;
    } else if (field && field.endsWith('Align')) {
        nextRaw[field] = __cpNormalizeStyleAlign(rawValue, cfg[field] || 'left');
    } else if (Object.prototype.hasOwnProperty.call(__CP_PDF_BASE_SIZE_LIMITS, field)) {
        const limits = __CP_PDF_BASE_SIZE_LIMITS[field];
        nextRaw[field] = __cpClampStyleNumber(rawValue, limits.min, limits.max, cfg[field]);
        if (field === 'tableBodyPx') {
            nextRaw.tableHeadPx = __cpClampStyleNumber((parseInt(nextRaw.tableBodyPx, 10) || cfg.tableBodyPx) + 2, 9, 18, cfg.tableHeadPx);
        }
    } else {
        return;
    }
    const next = __cpNormalizePdfStyle(nextRaw);
    __cpSetPdfStyleConfig(next, { applyToDom: true });
    __cpWritePdfStyleControls(next);
    __cpScheduleSharedPdfStyleSync(next);
}

function __cpHighlightSelectedBaseTextBlock() {
    document.querySelectorAll('#pdf-content [data-base-resource].cp-pdf-base-selected').forEach((node) => node.classList.remove('cp-pdf-base-selected'));
    document.querySelectorAll('#pdf-content .cp-pdf-resource.cp-pdf-edit-selected').forEach((node) => node.classList.remove('cp-pdf-edit-selected'));
    if (!__cpIsAdminProfile()) return;
    const selected = String(__cpPdfResourceEditorSelectedId || '');
    if (selected.startsWith('base:')) {
        const baseId = selected.slice(5).trim();
        const key = baseId.split('__')[0].trim();
        if (!key) return;
        const withInstance = document.querySelector(`#pdf-content [data-base-resource="${key}"][data-base-instance="${baseId}"]`);
        if (withInstance) {
            withInstance.classList.add('cp-pdf-base-selected');
            return;
        }
        document.querySelectorAll(`#pdf-content [data-base-resource="${key}"]`).forEach((node) => node.classList.add('cp-pdf-base-selected'));
        return;
    }
    if (!selected) return;
    document.querySelectorAll(`#pdf-content .cp-pdf-resource[data-res-id="${selected}"]`).forEach((node) => node.classList.add('cp-pdf-edit-selected'));
}

function __cpAddPdfResource(type) {
    const resources = __cpGetPdfResourcesFromState();
    const normalizedType = String(type || '').toLowerCase() === 'sign-line' ? 'sign' : String(type || '').toLowerCase();
    const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
    const isSign = safeType === 'sign' || safeType === 'sign-block';
    const newId = `cpres_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    resources.push({
        id: newId,
        type: safeType,
        enabled: true,
        page: 1,
        x: 80,
        y: 120,
        w: safeType === 'bar' ? 240 : (safeType === 'logo' ? 180 : (isSign ? 220 : 260)),
        h: safeType === 'bar' ? 12 : (safeType === 'logo' ? 72 : (safeType === 'sign' ? 24 : (safeType === 'sign-block' ? 42 : 42))),
        text: safeType === 'title' ? 'TITULO NUEVO' : (safeType === 'text' ? 'Texto nuevo' : ''),
        fontFamilyKey: '',
        fontSize: safeType === 'title' ? 24 : 14,
        bold: true,
        italic: false,
        underline: false,
        align: 'left',
        color: '#111827',
        bgColor: safeType === 'logo' ? 'transparent' : (isSign ? '#111827' : (safeType === 'bar' ? '#c1621e' : 'transparent')),
        angle: 0,
        signTitle: safeType === 'sign-block' ? 'QUIEN APRUEBA' : '',
        signRole: safeType === 'sign-block' ? 'SUBTITULO' : '',
        isUserNote: false,
        noteAuthor: ''
    });
    __cpPdfResourceEditorSelectedId = newId;
    __cpCommitPdfResources(resources);
    return newId;
}

function __cpIsPdfClipboardEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
    return !!target.closest('.tox, .CodeMirror, .monaco-editor');
}

function __cpBuildPdfClipboardResourceClone(resource, offsetStep = 24) {
    const base = resource && typeof resource === 'object' ? { ...resource } : null;
    if (!base) return null;
    const nextId = `cpres_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return __cpNormalizePdfResources([{
        ...base,
        id: nextId,
        x: __cpClampStyleNumber((parseInt(base.x, 10) || 0) + offsetStep, -4000, 4000, 80),
        y: __cpClampStyleNumber((parseInt(base.y, 10) || 0) + offsetStep, -5000, 5000, 120)
    }])[0] || null;
}

function __cpCopySelectedPdfResourceToClipboard() {
    const selectedId = String(__cpPdfResourceEditorSelectedId || '').trim();
    if (!selectedId || selectedId.startsWith('base:')) return false;
    const selected = __cpGetPdfResourcesFromState().find((resource) => resource.id === selectedId);
    if (!selected) return false;
    const safeCopy = __cpNormalizePdfResources([{ ...selected }])[0];
    if (!safeCopy) return false;
    __cpPdfResourceClipboard = safeCopy;
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'cp-orders',
            at: Date.now(),
            resource: { ...safeCopy }
        };
    } catch (_) {}
    return true;
}

function __cpPastePdfResourceFromClipboard() {
    const sharedClipboard = window.__HUB_PDF_RESOURCE_CLIPBOARD?.resource;
    const source = __cpPdfResourceClipboard || (sharedClipboard && typeof sharedClipboard === 'object' ? { ...sharedClipboard } : null);
    if (!source) return '';
    const clone = __cpBuildPdfClipboardResourceClone(source);
    if (!clone) return '';
    const resources = __cpGetPdfResourcesFromState();
    resources.push(clone);
    __cpPdfResourceEditorSelectedId = clone.id;
    __cpCommitPdfResources(resources);
    __cpPdfResourceClipboard = { ...clone };
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'cp-orders',
            at: Date.now(),
            resource: { ...clone }
        };
    } catch (_) {}
    return clone.id;
}

function __cpBindPdfResourceClipboard() {
    if (document.body.dataset.cpPdfClipboardBound === '1') return;
    document.body.dataset.cpPdfClipboardBound = '1';
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented) return;
        if (!__cpIsAdminProfile() || __cpPdfEditLocked) return;
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (__cpIsPdfClipboardEditableTarget(event.target)) return;
        const preview = document.getElementById('pdf-content');
        if (!preview || preview.classList.contains('hidden')) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'c') {
            if (!__cpCopySelectedPdfResourceToClipboard()) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF copiado', 'success'); } catch (_) {}
            return;
        }
        if (key === 'v') {
            const pastedId = __cpPastePdfResourceFromClipboard();
            if (!pastedId) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF duplicado', 'success'); } catch (_) {}
        }
    }, true);
}

function __cpRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list || !__cpIsAdminProfile()) return;
    const cfg = __cpGetPdfStyleConfig();
    const resources = __cpGetPdfResourcesFromState();
    const baseBlocksHtml = __cpRenderBaseTextBlocksEditorList(cfg);
    const typeLabel = (type) => ({
        bar: 'Barra',
        logo: 'Logo',
        title: 'Titulo',
        text: 'Texto',
        sign: 'Linea firma',
        'sign-line': 'Linea firma',
        'sign-block': 'Bloque firma'
    }[type] || 'Elemento');
    const resourcesHtml = resources.map((resource) => {
        const selectedClass = resource.id === __cpPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-600';
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const showTextColor = isTextLike || isSignBlock ? '' : 'hidden';
        const showBgColor = resource.type === 'logo' ? 'hidden' : '';
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__cpSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__cpSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${typeLabel(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__cpSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-red-300">Eliminar</button>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400 block">Texto
                    <textarea data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="text" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-white">${__cpSafeHtml(resource.text)}</textarea>
                </label>` : ''}
                ${isSignBlock ? `<div class="grid grid-cols-1 gap-1">
                    <label class="text-[9px] text-gray-400">Titulo
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="signTitle" type="text" value="${__cpSafeHtml(resource.signTitle)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                    <label class="text-[9px] text-gray-400">Subtitulo
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="signRole" type="text" value="${__cpSafeHtml(resource.signRole)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                </div>` : ''}
                <div class="grid grid-cols-3 gap-1">
                    <label class="text-[9px] text-gray-400">Página
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="page" type="number" min="1" max="8" value="${resource.page}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">X
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="x" type="number" value="${resource.x}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="y" type="number" value="${resource.y}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Ancho
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="w" type="number" min="16" value="${resource.w}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Alto
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="h" type="number" min="10" value="${resource.h}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400 ${isTextLike || isSignBlock ? '' : 'hidden'}">Fuente
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Angulo
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="angle" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400 ${showTextColor}">Color Texto
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="color" type="color" value="${resource.color}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400 ${showBgColor}">Color Fondo
                        <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#ffffff'}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400">Alineacion
                    <select data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="align" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        <option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option>
                        <option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option>
                        <option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option>
                        <option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option>
                    </select>
                </label>` : ''}
                <label class="text-[9px] text-gray-400 mt-1 flex items-center gap-1 cursor-pointer">
                    <input data-res-id="${__cpSafeHtml(resource.id)}" data-res-field="enabled" type="checkbox" ${resource.enabled ? 'checked' : ''} class="w-3 h-3 text-brand-red bg-gray-900 border-gray-700 rounded focus:ring-brand-red">
                    <span>Habilitado</span>
                </label>
            </div>
        `;
    }).join('');
    const customEmpty = !resources.length ? '<p class="text-[10px] text-gray-400">Sin recursos personalizados. Usa el boton de Anadir recurso o el boton de Notas.</p>' : '';
    list.innerHTML = `
        <div class="space-y-2">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Textos base del PDF</p>
            ${baseBlocksHtml}
        </div>
        <div class="space-y-2 pt-2 border-t border-gray-700/80">
            <p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Recursos personalizados</p>
            ${customEmpty}
            ${resourcesHtml}
        </div>
    `;
    __cpHighlightSelectedBaseTextBlock();
}

function __cpHandleResourceListEvent(event) {
    const trigger = event.target.closest('[data-res-action], [data-res-field], [data-base-action], [data-base-field]');
    if (!trigger) return;
    const baseId = String(trigger.dataset.baseId || '');
    const baseAction = String(trigger.dataset.baseAction || '');
    const baseField = String(trigger.dataset.baseField || '');
    if (baseAction === 'select' && baseId.startsWith('base:')) {
        __cpPdfResourceEditorSelectedId = baseId;
        __cpRenderPdfResourcesEditorList();
        __cpHighlightSelectedBaseTextBlock();
        return;
    }
    if (baseField && baseId.startsWith('base:')) {
        const baseKey = baseId.slice(5).split('__')[0].trim();
        if (!__cpCanEditPdfBaseBlock(baseKey)) {
            __cpPdfResourceEditorSelectedId = baseId;
            __cpHighlightSelectedBaseTextBlock();
            return;
        }
        __cpPdfResourceEditorSelectedId = baseId;
        __cpCommitBaseTextBlockField(baseField, trigger.value);
        __cpRenderPdfResourcesEditorList();
        __cpHighlightSelectedBaseTextBlock();
        return;
    }

    const resources = __cpGetPdfResourcesFromState();
    const id = trigger.dataset.resId || '';
    const idx = resources.findIndex((resource) => resource.id === id);
    if (idx < 0) return;

    if (trigger.dataset.resAction === 'remove') {
        resources.splice(idx, 1);
        if (__cpPdfResourceEditorSelectedId === id) __cpPdfResourceEditorSelectedId = '';
        __cpCommitPdfResources(resources);
        return;
    }
    if (trigger.dataset.resAction === 'select') {
        __cpPdfResourceEditorSelectedId = id;
        __cpRenderPdfResourcesEditorList();
        return;
    }

    const field = trigger.dataset.resField;
    if (!field) return;
    const selected = resources[idx];
    const canMove = __cpCanMovePdfResource(selected);
    const canEdit = __cpCanEditPdfResource(selected);
    if (['page', 'x', 'y', 'w', 'h', 'angle', 'enabled'].includes(field) && !canMove) return;
    if (['text', 'signTitle', 'signRole', 'fontSize', 'align', 'bold', 'italic', 'underline', 'color', 'bgColor'].includes(field) && !canEdit) return;
    let nextValue = trigger.type === 'checkbox' ? !!trigger.checked : trigger.value;
    if (['page', 'x', 'y', 'w', 'h', 'fontSize', 'angle'].includes(field)) nextValue = parseInt(nextValue, 10);
    if (field === 'color' || field === 'bgColor') nextValue = __cpNormalizeHexColor(nextValue, resources[idx][field]);
    resources[idx] = { ...resources[idx], [field]: nextValue };
    __cpPdfResourceEditorSelectedId = id;
    const isContinuousInput = event.type === 'input'
        && (
            trigger instanceof HTMLTextAreaElement
            || (trigger instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(trigger.type || '').toLowerCase()))
        );
    __cpCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: isContinuousInput
    });
}

function __cpBindPdfResourceEditor() {
    if (!__cpIsAdminProfile()) return;
    const list = document.getElementById('pdf-style-resources-list');
    if (list && list.dataset.bound !== '1') {
        list.addEventListener('input', __cpHandleResourceListEvent);
        list.addEventListener('change', __cpHandleResourceListEvent);
        list.addEventListener('click', __cpHandleResourceListEvent);
        list.dataset.bound = '1';
    }
    if (document.body.dataset.cpPdfResourceButtonsBound !== '1') {
        document.body.dataset.cpPdfResourceButtonsBound = '1';
        document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => { __cpAddPdfResource('bar'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => { __cpAddPdfResource('logo'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-title')?.addEventListener('click', () => { __cpAddPdfResource('title'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-text')?.addEventListener('click', () => { __cpAddPdfResource('text'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-line')?.addEventListener('click', () => { __cpAddPdfResource('sign'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-block')?.addEventListener('click', () => { __cpAddPdfResource('sign-block'); window.closeModal('pdf-resource-modal'); });
    }
    __cpRenderPdfResourcesEditorList();
}

function __cpApplyPdfResourceGeometryToNode(node, resource) {
    if (!(node instanceof HTMLElement) || !resource) return;
    node.style.left = `${Math.round(parseFloat(resource.x) || 0)}px`;
    node.style.top = `${Math.round(parseFloat(resource.y) || 0)}px`;
    node.style.width = `${Math.max(16, Math.round(parseFloat(resource.w) || 0))}px`;
    node.style.height = `${Math.max(1, Math.round(parseFloat(resource.h) || 0))}px`;
}

function __cpGetPdfResourceMinHeight(type) {
    const safeType = String(type || '').trim().toLowerCase();
    if (safeType === 'sign') return 1;
    if (safeType === 'logo') return 24;
    if (safeType === 'sign-block') return 42;
    if (safeType === 'bar') return 4;
    return 10;
}

function __cpGetPdfPointerScale(node) {
    const ref = node?.parentElement || node;
    if (!ref || !(ref instanceof HTMLElement)) return { x: 1, y: 1 };
    const rect = ref.getBoundingClientRect();
    const rawWidth = ref.offsetWidth || parseFloat(ref.style.width || '0') || rect.width || 1;
    const rawHeight = ref.offsetHeight || parseFloat(ref.style.height || '0') || rect.height || 1;
    const scaleX = rect.width > 0 && rawWidth > 0 ? (rect.width / rawWidth) : 1;
    const scaleY = rect.height > 0 && rawHeight > 0 ? (rect.height / rawHeight) : 1;
    return { x: scaleX > 0 ? scaleX : 1, y: scaleY > 0 ? scaleY : 1 };
}

function __cpResolvePdfResizeHit(node, event) {
    if (window.PdfEditorHitbox?.resolveResizeHit) return window.PdfEditorHitbox.resolveResizeHit(node, event);
    const rect = node instanceof HTMLElement ? node.getBoundingClientRect() : null;
    if (!rect) return { resize: false, proportional: false, cursor: 'move' };
    const threshold = Math.min(24, Math.max(14, Math.min(rect.width, rect.height) / 2.75));
    let left = (event.clientX - rect.left) <= threshold;
    let right = (rect.right - event.clientX) <= threshold;
    let top = (event.clientY - rect.top) <= threshold;
    let bottom = (rect.bottom - event.clientY) <= threshold;
    if (event.shiftKey && !(left || right || top || bottom)) {
        right = true;
        bottom = true;
    }
    if (left && right) {
        if (event.clientX - rect.left <= rect.right - event.clientX) right = false;
        else left = false;
    }
    if (top && bottom) {
        if (event.clientY - rect.top <= rect.bottom - event.clientY) bottom = false;
        else top = false;
    }
    if (!(left || right || top || bottom)) return { resize: false, proportional: false, cursor: 'move' };
    let cursor = 'move';
    if ((left || right) && (top || bottom)) {
        const diagonalA = (left && top) || (right && bottom);
        cursor = diagonalA ? 'nwse-resize' : 'nesw-resize';
    } else if (left || right) {
        cursor = 'ew-resize';
    } else if (top || bottom) {
        cursor = 'ns-resize';
    }
    return {
        resize: true,
        left,
        right,
        top,
        bottom,
        proportional: (left || right) && (top || bottom),
        cursor
    };
}

function __cpResizePdfResourceGeometry(origin, dx, dy, resize, type) {
    const base = origin && typeof origin === 'object' ? origin : {};
    const minWidth = 16;
    const minHeight = __cpGetPdfResourceMinHeight(type || base.type);
    const safeOrigin = {
        x: parseFloat(base.x) || 0,
        y: parseFloat(base.y) || 0,
        w: Math.max(minWidth, parseFloat(base.w) || minWidth),
        h: Math.max(minHeight, parseFloat(base.h) || minHeight)
    };
    if (resize?.proportional && (resize.left || resize.right) && (resize.top || resize.bottom)) {
        const scaleX = safeOrigin.w > 0 ? ((resize.left ? safeOrigin.w - dx : safeOrigin.w + dx) / safeOrigin.w) : 1;
        const scaleY = safeOrigin.h > 0 ? ((resize.top ? safeOrigin.h - dy : safeOrigin.h + dy) / safeOrigin.h) : 1;
        let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        if (!Number.isFinite(scale)) scale = 1;
        const minScale = Math.max(minWidth / safeOrigin.w, minHeight / safeOrigin.h);
        scale = Math.max(minScale, scale);
        const nextW = Math.max(minWidth, Math.round(safeOrigin.w * scale));
        const nextH = Math.max(minHeight, Math.round(safeOrigin.h * scale));
        return {
            ...base,
            x: resize.left ? Math.round(safeOrigin.x + (safeOrigin.w - nextW)) : safeOrigin.x,
            y: resize.top ? Math.round(safeOrigin.y + (safeOrigin.h - nextH)) : safeOrigin.y,
            w: nextW,
            h: nextH
        };
    }
    let nextX = safeOrigin.x;
    let nextY = safeOrigin.y;
    let nextW = safeOrigin.w;
    let nextH = safeOrigin.h;
    if (resize?.left) {
        nextW = Math.max(minWidth, Math.round(safeOrigin.w - dx));
        nextX = Math.round(safeOrigin.x + (safeOrigin.w - nextW));
    } else if (resize?.right) {
        nextW = Math.max(minWidth, Math.round(safeOrigin.w + dx));
    }
    if (resize?.top) {
        nextH = Math.max(minHeight, Math.round(safeOrigin.h - dy));
        nextY = Math.round(safeOrigin.y + (safeOrigin.h - nextH));
    } else if (resize?.bottom) {
        nextH = Math.max(minHeight, Math.round(safeOrigin.h + dy));
    }
    return {
        ...base,
        x: nextX,
        y: nextY,
        w: nextW,
        h: nextH
    };
}

function __cpBuildConvenioGridStyle(publicityCount, tradeCount) {
    const publicityWeight = Math.min(3.2, Math.max(1.4, 1.25 + (Math.max(1, publicityCount) * 0.26)));
    const tradeWeight = Math.min(2.2, Math.max(0.95, 0.95 + (Math.max(1, tradeCount) * 0.18)));
    return `display:grid;grid-template-columns:minmax(0,${publicityWeight.toFixed(2)}fr) minmax(220px,${tradeWeight.toFixed(2)}fr);gap:1rem;align-items:start;`;
}

function __cpBindPdfResourceDrag() {
    if (document.body.dataset.cpPdfResourceDragBound === '1') return;
    document.body.dataset.cpPdfResourceDragBound = '1';
    const releasePointer = (state) => {
        const captureNode = state?.captureNode;
        if (!captureNode || typeof captureNode.releasePointerCapture !== 'function') return;
        try { captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
    };
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!__cpIsAdminProfile() || __cpPdfEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('#cp-pdf-inspector')) return;
        const resourceNode = target.closest('#pdf-content .cp-pdf-resource[data-res-id]');
        if (resourceNode) {
            if (target.closest('.cp-pdf-delete-btn')) return;
            const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
            const page = parseInt(resourceNode.getAttribute('data-res-page') || '1', 10);
            const resources = __cpGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === resourceId);
            if (idx < 0) return;
            if (!__cpCanMovePdfResource(resources[idx])) return;
            const resize = __cpResolvePdfResizeHit(resourceNode, event);
            const scale = __cpGetPdfPointerScale(resourceNode);
            const mode = resize.resize ? 'resize' : 'move';
            __cpPdfResourceEditorSelectedId = resourceId;
            __cpPdfResourcePointerState = {
                kind: 'resource',
                id: resourceId,
                page,
                mode,
                startX: event.clientX,
                startY: event.clientY,
                pointerId: event.pointerId,
                captureNode: resourceNode,
                scaleX: scale.x,
                scaleY: scale.y,
                resize,
                origin: { ...resources[idx] },
                current: { ...resources[idx] }
            };
            if (typeof resourceNode.setPointerCapture === 'function') {
                try { resourceNode.setPointerCapture(event.pointerId); } catch (_) {}
            }
            __cpRenderPdfResourcesEditorList();
            document.body.style.userSelect = 'none';
            document.body.style.cursor = resize.cursor || (mode === 'resize' ? 'nwse-resize' : 'move');
            event.preventDefault();
            return;
        }
        const baseNode = target.closest('#pdf-content [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!baseKey || !__cpGetPdfBaseBlockMeta(baseKey)) return;
        if (!__cpCanMovePdfBaseBlock(baseKey)) return;
        const resize = __cpResolvePdfResizeHit(baseNode, event);
        const scale = __cpGetPdfPointerScale(baseNode);
        const instanceKey = String(baseNode.dataset.baseInstance || baseKey).trim();
        const cfg = __cpGetPdfStyleConfig();
        const layouts = __cpNormalizePdfBaseLayouts(cfg.baseLayouts);
        const origin = layouts[instanceKey] || layouts[baseKey] || __cpNormalizePdfBaseLayout();
        __cpPdfResourceEditorSelectedId = `base:${baseKey}`;
        __cpPdfResourcePointerState = {
            kind: 'base',
            key: baseKey,
            instanceKey,
            mode: resize.resize ? 'scale' : 'move',
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
            captureNode: baseNode,
            scaleX: scale.x,
            scaleY: scale.y,
            resize,
            origin: { ...origin },
            current: { ...origin }
        };
        if (typeof baseNode.setPointerCapture === 'function') {
            try { baseNode.setPointerCapture(event.pointerId); } catch (_) {}
        }
        __cpRenderPdfResourcesEditorList();
        __cpHighlightSelectedBaseTextBlock();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = resize.resize ? (resize.cursor || 'nwse-resize') : 'move';
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!__cpPdfResourcePointerState) return;
        const state = __cpPdfResourcePointerState;
        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        const dx = (event.clientX - state.startX) / (state.scaleX || 1);
        const dy = (event.clientY - state.startY) / (state.scaleY || 1);
        if (state.kind === 'resource') {
            const node = document.querySelector(`#pdf-content .cp-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
            if (!node) return;
            if (state.mode === 'resize') {
                const next = __cpResizePdfResourceGeometry(state.origin, dx, dy, state.resize, state.origin?.type);
                state.current = next;
                __cpApplyPdfResourceGeometryToNode(node, next);
                __cpAutoFitPdfTextNode(node);
            } else {
                const next = {
                    ...state.origin,
                    x: Math.round((parseFloat(state.origin?.x) || 0) + dx),
                    y: Math.round((parseFloat(state.origin?.y) || 0) + dy)
                };
                state.current = next;
                __cpApplyPdfResourceGeometryToNode(node, next);
            }
            event.preventDefault();
            return;
        }
        const node = document.querySelector(`#pdf-content [data-base-resource="${state.key}"][data-base-instance="${state.instanceKey}"]`);
        if (!node) return;
        if (state.mode === 'scale') {
            const signedDx = state.resize?.left ? -dx : dx;
            const signedDy = state.resize?.top ? -dy : dy;
            const delta = Math.round(((signedDx + signedDy) / 2) * 0.35);
            const next = __cpNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + delta });
            state.current = next;
            node.style.transform = __cpBuildPdfBaseTransform(next);
        } else {
            const next = __cpNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
            state.current = next;
            node.style.transform = __cpBuildPdfBaseTransform(next);
        }
        event.preventDefault();
    });
    const endDrag = () => {
        if (!__cpPdfResourcePointerState) return;
        const state = __cpPdfResourcePointerState;
        if (state.kind === 'resource') {
            const resources = __cpGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id);
            if (idx >= 0) {
                const current = state.current || state.origin;
                resources[idx] = {
                    ...resources[idx],
                    x: __cpClampStyleNumber(current.x, -4000, 4000, resources[idx].x),
                    y: __cpClampStyleNumber(current.y, -5000, 5000, resources[idx].y),
                    w: __cpClampStyleNumber(current.w, 16, 4000, resources[idx].w),
                    h: __cpClampStyleNumber(current.h, 1, 5000, resources[idx].h)
                };
                __cpCommitPdfResources(resources, { refreshPreview: false });
            }
        } else if (state.kind === 'base') {
            __cpCommitPdfBaseLayout(state.instanceKey, state.current || state.origin);
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
        __cpPdfResourcePointerState = null;
    };
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function __cpApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap) return;
    editorWrap.classList.add('hidden');
}

function __cpTogglePdfStylePanel() {
    __cpPdfStyleUiState = { ...__cpPdfStyleUiState, collapsed: !__cpPdfStyleUiState.collapsed };
    __cpSavePdfStyleUiState();
    __cpApplyPdfStyleEditorUiState();
}

function __cpTogglePdfStylePin() {
    __cpPdfStyleUiState = { ...__cpPdfStyleUiState, pinned: !__cpPdfStyleUiState.pinned };
    __cpSavePdfStyleUiState();
    __cpApplyPdfStyleEditorUiState();
}

function __cpInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__cpPdfStyleState) __cpPdfStyleState = __cpLoadPdfStyleState();
    __cpPdfStyleUiState = __cpLoadPdfStyleUiState();
    __cpWritePdfStyleControls(__cpGetPdfStyleConfig());
    __cpApplyPdfStyleEditorUiState();
    __cpBindPdfResourceEditor();
    __cpBindPdfResourceDrag();
    __cpBindPdfResourceClipboard();
    __cpEnsurePdfEditingChrome();
    editorWrap.classList.add('hidden');
}

window.resetPdfStyleEditor = function () {
    if (!__cpIsAdminProfile()) return;
    const reset = __cpNormalizePdfStyle(__CP_PDF_STYLE_DEFAULTS);
    __cpSetPdfStyleConfig(reset, { applyToDom: true });
    __cpWritePdfStyleControls(reset);
    __cpScheduleSharedPdfStyleSync(reset);
};

window.getOrderHTML = function (o, type) {
    const isOrder = type === 'order';
    const logoImg = '';
    const pdfStyle = __cpGetPdfStyleConfig();
    const pdfContent = __cpNormalizePdfContent(pdfStyle.content);
    const pdfStyleInlineVars = __cpPdfStyleVarsInline(pdfStyle);
    const pdfStyleTag = `<style>.cp-pdf-root{font-family:var(--cp-font-family)!important;}.cp-pdf-root .cp-pdf-shift{transform:translate(var(--cp-offset-x),var(--cp-offset-y));position:relative;}.cp-pdf-root .cp-pdf-header{border-bottom-width:var(--cp-header-line)!important;justify-content:var(--cp-header-justify)!important;}.cp-pdf-root .cp-pdf-header>div:last-child{text-align:var(--cp-header-align)!important;}.cp-pdf-root .cp-pdf-title{font-size:var(--cp-title-size)!important;line-height:1.05!important;text-align:var(--cp-header-align)!important;}.cp-pdf-root .cp-pdf-folio{font-size:var(--cp-meta-size)!important;text-align:var(--cp-meta-align)!important;}.cp-pdf-root .cp-pdf-date{font-size:var(--cp-date-size)!important;text-align:var(--cp-meta-align)!important;}.cp-pdf-root .cp-pdf-table-head th{font-size:var(--cp-table-head-size)!important;}.cp-pdf-root .cp-pdf-table-body td,.cp-pdf-root .cp-pdf-table-body p,.cp-pdf-root .cp-pdf-table-body span{font-size:var(--cp-table-body-size)!important;line-height:var(--cp-line-height)!important;}.cp-pdf-root .cp-pdf-table-body td:first-child,.cp-pdf-root .cp-pdf-table-body td:first-child *{text-align:var(--cp-table-align)!important;}.cp-pdf-root .cp-pdf-summary,.cp-pdf-root .cp-pdf-summary *{text-align:var(--cp-summary-align)!important;}.cp-pdf-root .cp-pdf-quick,.cp-pdf-root .cp-pdf-quick *{font-size:var(--cp-quick-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-quick-align)!important;}.cp-pdf-root .cp-pdf-general-conditions,.cp-pdf-root .cp-pdf-general-conditions *{font-size:var(--cp-conditions-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-conditions-align)!important;}.cp-pdf-root .cp-pdf-sign,.cp-pdf-root .cp-pdf-sign *{font-size:var(--cp-sign-size)!important;line-height:var(--cp-line-height)!important;text-align:var(--cp-sign-align)!important;}.cp-pdf-root .cp-pdf-footer-text{font-size:var(--cp-footer-size)!important;text-align:var(--cp-footer-align)!important;}.cp-pdf-root .cp-pdf-amount,.cp-pdf-root .cp-pdf-table-body td:last-child,.cp-pdf-root .cp-pdf-summary td:last-child{white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;font-variant-numeric:tabular-nums;}.cp-pdf-root .cp-pdf-summary-table-wrap{width:20rem;max-width:100%;margin-left:auto;}.cp-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.cp-pdf-root .cp-pdf-resource,.cp-pdf-root .cp-pdf-editable{cursor:default;box-sizing:border-box;outline:none;outline-offset:2px;}.cp-pdf-root .cp-pdf-resource::before,.cp-pdf-root .cp-pdf-editable::before{content:'';position:absolute;inset:-1px;border:1px dashed rgba(193,98,30,.28);border-radius:inherit;background:radial-gradient(circle at top left,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at top right,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at bottom left,#c1621e 0 3px,transparent 3.2px),radial-gradient(circle at bottom right,#c1621e 0 3px,transparent 3.2px);background-size:12px 12px;background-repeat:no-repeat;opacity:0;pointer-events:none;}.cp-pdf-root .cp-pdf-resource::after,.cp-pdf-root .cp-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#c1621e;box-shadow:0 0 0 2px #fff;opacity:0;pointer-events:none;}.cp-pdf-root .cp-pdf-base-selected,.cp-pdf-root .cp-pdf-edit-selected{outline:none;outline-offset:2px;}.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable{cursor:move;outline:1px dashed rgba(193,98,30,.45);}.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource::before,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-resource::after,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable::before,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-editable::after{opacity:.94;}.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-base-selected,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-edit-selected{outline:2px solid #c1621e;}.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-edit-selected::before,.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-edit-selected::after{opacity:1;}.cp-pdf-delete-btn{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#c1621e;color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;font-size:11px;z-index:80;box-shadow:0 0 0 2px #fff;pointer-events:auto;}.cp-pdf-root.cp-pdf-admin-enabled .cp-pdf-edit-selected .cp-pdf-delete-btn{display:flex;}.cp-pdf-delete-btn:hover{background:#9a4f18;transform:scale(1.08);transition:all .2s;}</style>`;
    const pdfTableFitTag = `<style>.cp-pdf-root .cp-pdf-table-head th{font-size:var(--cp-fit-head-size,var(--cp-table-head-size))!important;padding-top:var(--cp-fit-cell-py,.5rem)!important;padding-bottom:var(--cp-fit-cell-py,.5rem)!important;padding-left:var(--cp-fit-cell-px,.75rem)!important;padding-right:var(--cp-fit-cell-px,.75rem)!important;}.cp-pdf-root .cp-pdf-table-body td,.cp-pdf-root .cp-pdf-table-body p,.cp-pdf-root .cp-pdf-table-body span{font-size:var(--cp-fit-body-size,var(--cp-table-body-size))!important;line-height:var(--cp-fit-line-height,var(--cp-line-height))!important;}.cp-pdf-root .cp-pdf-table-body td{padding-top:var(--cp-fit-cell-py,.5rem)!important;padding-bottom:var(--cp-fit-cell-py,.5rem)!important;padding-left:var(--cp-fit-cell-px,.75rem)!important;padding-right:var(--cp-fit-cell-px,.75rem)!important;}</style>`;
    const now = new Date(); const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); const genDateTime = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }); let docTitle = isOrder ? "ORDEN DE COMPRA" : "COTIZACIÓN";

    const folioUnificado = __orderResolveQuoteFolio(o);
    const space = allSpaces.find(s => s.id == o.espacio_id);
    const descHTML = isOrder ? '' : `<p class="text-[9px] text-gray-500 italic mt-0.5 truncate max-w-xs">${space?.descripcion || ''}</p>`;
    const footerHubHTML = `<div class="w-full text-center mt-10"><p class="cp-pdf-footer-text text-[10px] text-gray-400 font-medium leading-tight" data-base-resource="footer">Generado el ${genDateTime}<br>a través de Marketing Hub</p></div>`;

    const renderHeader = (title) => `<div class="cp-pdf-header flex justify-end items-start border-b-4 border-brand-red pb-3 mb-2">${logoImg}<div class="text-right"><h1 class="cp-pdf-title text-2xl font-black text-gray-800 tracking-tighter uppercase" data-base-resource="header-title">${title}</h1><p class="cp-pdf-folio text-sm font-mono text-brand-red font-bold mt-1" data-base-resource="header-meta">FOLIO: ${folioUnificado}</p><p class="cp-pdf-date text-[10px] text-gray-500 mt-1" data-base-resource="header-meta">${dateStr}</p></div></div>`;

    let clientName = o.cliente_nombre || 'Cliente'; let clientRfc = o.cliente_rfc; let nameSizeClass = 'text-xl'; if (clientName.length > 35) nameSizeClass = 'text-xs'; else if (clientName.length > 25) nameSizeClass = 'text-sm';
    const quoteStatus = String(o?.status || '').toLowerCase();
    const docMeta = __orderGetQuoteDocumentMeta(o);
    const isConvenio = !isOrder && docMeta.isConvenio;
    const isApprovedQuote = !isOrder && ['aprobada', 'finalizada'].includes(quoteStatus);
    if (!isOrder && isConvenio) docTitle = isApprovedQuote ? 'CARTA CONVENIO' : 'CONVENIO';
    const guests = o.personas || 1;
    const clientComponent = isOrder
        ? `<div class="cp-pdf-summary flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><div class="w-1/2 border-r border-gray-200 pr-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div><div class="w-1/2 pl-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Contacto / Fiscal</p><p class="font-mono text-xs text-gray-700 truncate">${o.cliente_email || 'Sin correo'}</p>${clientRfc ? `<p class="font-mono text-xs text-gray-700 mt-0.5">RFC: <strong>${clientRfc}</strong></p>` : ''}<p class="font-mono text-xs text-brand-red font-bold mt-1">Personas: ${guests}</p></div></div>`
        : `<div class="cp-pdf-summary flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><div class="w-full"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div></div>`;

    const __orderEscapeHtml = (v) => String(v || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const __orderFormatConceptDescription = (raw) => {
        const txt = String(raw || '').trim();
        const match = txt.match(/^\[([^\]]+)\]\s*-\s*(.+)$/);
        if (match) {
            return `<strong class="font-black text-gray-800">${__orderEscapeHtml(match[1])}</strong> - ${__orderEscapeHtml(match[2])}`;
        }
        return __orderEscapeHtml(txt.replace(/\s*-\s*/g, ' - '));
    };
    const __orderExtractHoursLabel = (raw) => {
        const text = String(raw || '').trim();
        if (!text) return '';
        const m = text.match(/(\d{1,2}:\d{2})\s*(?:a|-)\s*(\d{1,2}:\d{2})/i);
        if (m) return `${m[1]} a ${m[2]}`;
        return '';
    };

    let cArray = __orderNormalizeConceptsArray(o.conceptos_adicionales);
    cArray = Array.isArray(cArray) ? cArray : [];

    const __orderScheduleBySpace = {};
    let __orderDefaultSchedule = null;
    cArray.forEach((concept) => {
        if (String(concept?.type || '').toLowerCase() !== 'b2b_horario') return;
        const meta = concept && typeof concept.meta === 'object' ? concept.meta : {};
        const rawSchedule = (meta.custom_start && meta.custom_end)
            ? `${meta.custom_start} a ${meta.custom_end}`
            : (meta.custom_name || meta.label || concept.description || concept.nombre || '');
        const hours = __orderExtractHoursLabel(rawSchedule);
        const payload = {
            text: hours,
            amount: parseFloat(concept.amount !== undefined ? concept.amount : (concept.value || 0)) || 0
        };
        const sid = String(meta.space_id || meta.spaceId || '').trim();
        if (sid) __orderScheduleBySpace[sid] = payload;
        else if (!__orderDefaultSchedule) __orderDefaultSchedule = payload;
    });

    const __orderGetScheduleForSpace = (spaceId) => {
        const sid = String(spaceId || '').trim();
        if (sid && __orderScheduleBySpace[sid]) return __orderScheduleBySpace[sid];
        return __orderDefaultSchedule;
    };
    const __orderBuildPeopleCellHtml = (peopleValue) => {
        const parsed = parseInt(peopleValue, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return '<span class="text-gray-300">---</span>';
        return `${parsed} persona${parsed === 1 ? '' : 's'}`;
    };
    const __orderBuildDateCellHtml = (primaryDate, secondaryDate, spaceId) => {
        const schedule = __orderGetScheduleForSpace(spaceId);
        const scheduleHtml = schedule?.text
            ? `<br><span class="text-[9px] font-semibold tracking-wide text-brand-red">${__orderEscapeHtml(schedule.text)}</span>`
            : '';
        const first = __orderEscapeHtml(primaryDate || '--');
        if (secondaryDate) return `${first}<br>${__orderEscapeHtml(secondaryDate)}${scheduleHtml}`;
        return `${first}${scheduleHtml}`;
    };
    const __orderFindCatalogSpace = (spaceId) => allSpaces.find((spaceItem) => String(spaceItem.id) === String(spaceId)) || null;
    const __orderResolveSpaceIdentity = (detail) => {
        const sid = String(detail?.espacio_id || detail?.space_id || o.espacio_id || '').trim();
        const catalogSpace = sid ? __orderFindCatalogSpace(sid) : space;
        return {
            nombre: detail?.espacio_nombre || catalogSpace?.nombre || o.espacio_nombre || '--',
            clave: detail?.espacio_clave || catalogSpace?.clave || o.espacio_clave || ''
        };
    };
    const __orderRenderSpaceCell = (identity) => {
        const safeName = __orderEscapeHtml(identity?.nombre || '--');
        const safeKey = __orderEscapeHtml(identity?.clave || '');
        return `<div class="break-words"><p class="font-bold text-gray-800 text-xs break-words">${safeName}</p>${safeKey ? `<span class="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[10px] font-mono mt-0.5 inline-block">${safeKey}</span>` : ''}</div>`;
    };
    const __orderResolveDetailMaterialMeasure = (detailSpace, catalogSpace) => {
        const width = __orderNormalizeMeasureValue(detailSpace?.medida_ancho ?? detailSpace?.ancho ?? catalogSpace?.medida_ancho ?? catalogSpace?.ancho);
        const height = __orderNormalizeMeasureValue(detailSpace?.medida_alto ?? detailSpace?.alto ?? catalogSpace?.medida_alto ?? catalogSpace?.alto);
        const unit = __orderNormalizeMeasureUnit(detailSpace?.medida_unidad || detailSpace?.unidad_medida || catalogSpace?.medida_unidad || catalogSpace?.unidad_medida || 'M');
        const material = String(detailSpace?.material || catalogSpace?.material || '').trim();
        return { material, medida_ancho: width, medida_alto: height, medida_unidad: unit };
    };
    const __orderResolvePdfSpaceDetail = (detailSpace, catalogSpace) => {
        const digitalMedia = __orderResolveDigitalMediaConfig(detailSpace, catalogSpace);
        if (digitalMedia.enabled) return __orderDigitalMediaTypeLabel(digitalMedia);
        const detailMaterialMeasure = __orderResolveDetailMaterialMeasure(detailSpace, catalogSpace);
        return String(detailMaterialMeasure.material || '').trim() || '--';
    };
    const __orderResolvePdfMeasureHtml = (detailSpace, catalogSpace) => {
        const digitalMedia = __orderResolveDigitalMediaConfig(detailSpace, catalogSpace);
        if (digitalMedia.enabled) return __orderDigitalMediaDetailHtml(digitalMedia);
        const detailMaterialMeasure = __orderResolveDetailMaterialMeasure(detailSpace, catalogSpace);
        const width = detailMaterialMeasure.medida_ancho;
        const height = detailMaterialMeasure.medida_alto;
        const unit = detailMaterialMeasure.medida_unidad || 'M';
        const measuresStr = (width !== null && width !== undefined && height !== null && height !== undefined) ? `${width}x${height} ${unit}` : '--';
        return __orderEscapeHtml(measuresStr);
    };
    const __orderResolvePdfDetailHeader = () => 'Soporte';

    let rentalRows = ''; let rentalTotal = 0;
    const detailSpaces = parseSpacesDetail(o.espacios_detalle);
    // Resuelve personas por concepto usando (1) el propio concepto, (2) el espacio ligado o (3) el fallback global.
    const __orderParsePeople = (value) => {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const __orderPeopleBySpace = {};
    detailSpaces.forEach((sp) => {
        const sid = String(sp?.espacio_id || sp?.space_id || '').trim();
        const people = __orderParsePeople(sp?.personas ?? sp?.guests ?? sp?.people);
        if (sid && people > 0) __orderPeopleBySpace[sid] = people;
    });
    const __orderResolveConceptPeople = (concept) => {
        const meta = concept && typeof concept.meta === 'object' ? concept.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '').trim();
        const direct = __orderParsePeople(concept?.personas ?? concept?.guests ?? meta.personas ?? meta.guests);
        if (direct > 0) return direct;
        if (sid && __orderPeopleBySpace[sid] > 0) return __orderPeopleBySpace[sid];
        return __orderParsePeople(o?.personas ?? guests);
    };
    const __orderCurrencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const __orderRoundMoney = (value) => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
    const __orderFormatMoneyHtml = (value, options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        const prefix = opts.prefix ? `${opts.prefix} ` : '';
        const extraClass = String(opts.className || '').trim();
        const className = ['cp-pdf-amount', extraClass].filter(Boolean).join(' ');
        return `<span class="${className}">${prefix}${__orderCurrencyFormatter.format(amount)}</span>`;
    };
    const __orderNormalizeTaxName = (value) => {
        const raw = String(value || '').trim();
        return raw && !/^impuestos?$/i.test(raw) ? raw : 'IVA';
    };
    const __orderBuildTaxRows = (subtotal, activeTaxIds, storedTaxTotal = 0) => {
        const rows = [
            `<tr><td class="py-1 px-3 text-[10px] font-bold text-gray-500 text-right" colspan="4">Subtotal</td><td class="py-1 px-3 text-right text-xs font-bold text-gray-800">${__orderFormatMoneyHtml(subtotal)}</td></tr>`
        ];
        const resolvedTaxes = parseIds(activeTaxIds)
            .map((tid) => __orderResolveTaxRecord(tid))
            .filter(Boolean)
            .map((tax) => {
                const percentage = __orderResolveTaxDisplayPercent(tax);
                const rate = __orderResolveTaxRate(tax);
                return {
                    name: __orderNormalizeTaxName(tax.nombre),
                    percentage,
                    amount: __orderRoundMoney(subtotal * rate)
                };
            })
            .filter((entry) => entry.amount > 0 || entry.percentage > 0);

        if (resolvedTaxes.length > 0) {
            let remainingStoredTax = __orderRoundMoney(storedTaxTotal);
            resolvedTaxes.forEach((entry, index) => {
                const amount = storedTaxTotal > 0
                    ? (index === resolvedTaxes.length - 1 ? Math.max(0, __orderRoundMoney(remainingStoredTax)) : Math.max(0, entry.amount))
                    : entry.amount;
                if (storedTaxTotal > 0 && index < resolvedTaxes.length - 1) {
                    remainingStoredTax = __orderRoundMoney(remainingStoredTax - amount);
                }
                rows.push(`<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="4">${__cpSafeHtml(entry.name)}${entry.percentage > 0 ? ` (${entry.percentage}%)` : ''}</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">${__orderFormatMoneyHtml(amount, { prefix: '+' })}</td></tr>`);
            });
        } else if (storedTaxTotal > 0) {
            rows.push(`<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="4">IVA</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">${__orderFormatMoneyHtml(storedTaxTotal, { prefix: '+' })}</td></tr>`);
        }

        return rows.join('');
    };
    let convenioBaseTotal = 0;
    if (detailSpaces.length > 0) {
        detailSpaces.forEach((sp) => {
            const sid = sp.espacio_id || sp.space_id;
            const spObj = __orderFindCatalogSpace(sid);
            const identity = __orderResolveSpaceIdentity(sp);
            const spGuests = parseInt(sp.personas, 10) || guests;
            const fi = sp.fecha_inicio || o.fecha_inicio;
            const ff = sp.fecha_fin || o.fecha_fin;
            const detailIsPublicidad = __orderIsPublicidadSpace(spObj || { tipo: sp.espacio_tipo || sp.tipo || '' });
            const detailSubtotal = parseFloat(sp.subtotal_espacio || sp.total_espacio || 0) || 0;
            const detailValue = __orderResolvePdfSpaceDetail(sp, spObj);
            const measureCellHtml = __orderResolvePdfMeasureHtml(sp, spObj);
            const detailDateLabel = (isConvenio && __orderDetailBlocksIndefinitely(sp))
                ? `${window.safeFormatDate(fi)}<br>Indefinido`
                : `${window.safeFormatDate(fi)}${ff && ff !== fi ? `<br>${window.safeFormatDate(ff)}` : ''}`;

            if (spObj && fi && ff && !detailIsPublicidad && !isConvenio) {
                const breakdown = calculateDayByDayTotal(spObj, fi, ff, spGuests);
                rentalTotal += breakdown.total;
                convenioBaseTotal += breakdown.total;
                breakdown.details.forEach((day, idx) => {
                    rentalRows += `<tr><td class="py-2 px-3 align-top text-[11px] text-gray-700 leading-snug break-words"><span class="font-bold">${__orderEscapeHtml(identity.nombre)}</span> - Renta ${day.dayName}${(idx === 0 && identity.clave) ? `<br><span class="text-[9px] text-gray-400 italic">${__orderEscapeHtml(identity.clave)}</span>` : ''}</td><td class="py-2 px-3 text-center text-[10px] text-gray-400">--</td><td class="py-2 px-3 text-center text-[10px] text-gray-400">--</td><td class="py-2 px-3 text-left text-[10px] text-gray-500">${__orderBuildDateCellHtml(day.date, '', sid)}</td><td class="py-2 px-3 text-right font-bold text-[11px] text-gray-700">${__orderFormatMoneyHtml(day.price)}</td></tr>`;
                });
            } else {
                rentalTotal += detailSubtotal;
                convenioBaseTotal += detailSubtotal;
                const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${__orderFormatMoneyHtml(detailSubtotal)}</td>`;
                rentalRows += `<tr><td class="py-2 px-3 align-top break-words">${__orderRenderSpaceCell(identity)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__orderEscapeHtml(detailValue)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${measureCellHtml}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${detailDateLabel}</td>${amountCellHtml}</tr>`;
            }
        });
    } else if (space && o.fecha_inicio && o.fecha_fin) {
        const identity = __orderResolveSpaceIdentity();
        const detailValue = __orderResolvePdfSpaceDetail(o, space);
        const measureCellHtml = __orderResolvePdfMeasureHtml(o, space);
        if (__orderIsPublicidadSpace(space) || isConvenio) {
            rentalTotal = parseFloat(o?.desglose_precios?.subtotal_antes_impuestos || o?.precio_final || space?.precio_base || 0) || 0;
            convenioBaseTotal = rentalTotal;
            const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${__orderFormatMoneyHtml(rentalTotal)}</td>`;
            rentalRows = `<tr><td class="py-2 px-3 align-top break-words">${__orderRenderSpaceCell(identity)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__orderEscapeHtml(detailValue)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${measureCellHtml}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__orderBlocksIndefinitely(o) ? `${window.safeFormatDate(o.fecha_inicio)}<br>Indefinido` : __orderBuildDateCellHtml(window.safeFormatDate(o.fecha_inicio), window.safeFormatDate(o.fecha_fin), space.id || o.espacio_id)}</td>${amountCellHtml}</tr>`;
        } else {
            const dayBreakdown = calculateDayByDayTotal(space, o.fecha_inicio, o.fecha_fin, guests);
            rentalTotal = dayBreakdown.total;
            convenioBaseTotal = rentalTotal;
            dayBreakdown.details.forEach((day, idx) => { rentalRows += `<tr><td class="py-2 px-3 align-top text-[11px] text-gray-700 leading-snug break-words"><span class="font-bold">${__orderEscapeHtml(identity.nombre)}</span> - Renta ${day.dayName}${idx === 0 && identity.clave ? `<br><span class="text-[9px] text-gray-400 italic">${__orderEscapeHtml(identity.clave)}</span>` : ''}</td><td class="py-2 px-3 text-center text-[10px] text-gray-400">--</td><td class="py-2 px-3 text-center text-[10px] text-gray-400">--</td><td class="py-2 px-3 text-left text-[10px] text-gray-500">${__orderBuildDateCellHtml(day.date, '', space.id || o.espacio_id)}</td><td class="py-2 px-3 text-right font-bold text-[11px] text-gray-700">${__orderFormatMoneyHtml(day.price)}</td></tr>`; });
        }
    } else {
        const basePrice = parseFloat(space ? space.precio_base : 0) || 0;
        const identity = __orderResolveSpaceIdentity();
        const detailValue = __orderResolvePdfSpaceDetail(o, space);
        const measureCellHtml = __orderResolvePdfMeasureHtml(o, space);
        rentalTotal = basePrice;
        convenioBaseTotal = basePrice;
        const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${__orderFormatMoneyHtml(basePrice)}</td>`;
        rentalRows = `<tr><td class="py-2 px-3 align-top break-words">${__orderRenderSpaceCell(identity)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__orderEscapeHtml(detailValue)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${measureCellHtml}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__orderBlocksIndefinitely(o) ? `${window.safeFormatDate(o.fecha_inicio)}<br>Indefinido` : __orderBuildDateCellHtml(window.safeFormatDate(o.fecha_inicio), window.safeFormatDate(o.fecha_fin), o.espacio_id)}</td>${amountCellHtml}</tr>`;
    }

    let runningSubtotal = rentalTotal; let rowsHtml = rentalRows;
    let convenioDeliveredTotal = 0;
    cArray.forEach(c => {
        let val = parseFloat(c.amount !== undefined ? c.amount : (c.value || 0));
        let amount = val;
        if (c.unit === 'percent') amount = rentalTotal * (val / 100);
        const convenioConcept = isConvenio || __orderIsConvenioConceptItem(c);
        if (convenioConcept || c.type === 'descuento') runningSubtotal -= amount; else runningSubtotal += amount;
        if (convenioConcept) convenioDeliveredTotal += amount;
        const conceptType = String(c.type || '').toLowerCase();
        if (conceptType === 'b2b_horario') return;
        const sign = (convenioConcept || c.type === 'descuento') ? '-' : '+';

        let desc = c.description || c.nombre || 'Adicional';
        const descHtml = __orderFormatConceptDescription(desc);
        const meta = c && typeof c.meta === 'object' ? c.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '').trim();
        const spName = sid ? (detailSpaces.find((item) => String(item.espacio_id || item.space_id || '') === sid)?.espacio_nombre || '') : '';
        const isNonSpaceConcept = ['b2b_montaje', 'b2b_horas', 'descuento', 'b2b_horario'].includes(conceptType) || !conceptType.startsWith('b2b_espacio');
        const conceptPeople = isNonSpaceConcept ? 0 : __orderResolveConceptPeople(c);
        const peopleSuffix = conceptPeople > 0 ? ` (${conceptPeople} persona${conceptPeople === 1 ? '' : 's'})` : '';
        const conceptLabel = `${spName ? `${__orderEscapeHtml(spName)} - ` : ''}${descHtml}${peopleSuffix}`;
        let conceptDateHtml = '';
        if (conceptType === 'b2b_montaje' && c.meta?.dates?.length) {
            conceptDateHtml = c.meta.dates.map(d => window.safeFormatDate(d)).join(', ');
        }

        const amountCell = (Math.abs(parseFloat(amount || 0)) < 0.000001)
            ? '---'
            : __orderFormatMoneyHtml(amount, { prefix: sign });
        const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 text-right text-[13px] font-medium text-gray-600">${amountCell}</td>`;
        rowsHtml += `<tr><td class="py-2 px-3 align-top text-[13px] font-medium text-gray-600 leading-snug break-words">${conceptLabel}</td><td class="py-2 px-3"></td><td class="py-2 px-3"></td><td class="py-2 px-3 text-left text-[10px] text-gray-500">${conceptDateHtml}</td>${amountCellHtml}</tr>`;
    });

    if (o.tipo_ajuste && o.tipo_ajuste !== 'ninguno') { let val = parseFloat(o.valor_ajuste); let displayAmount = val; if (o.ajuste_es_porcentaje) { displayAmount = runningSubtotal * (val / 100); } const sign = o.tipo_ajuste === 'descuento' ? '-' : '+'; if (o.tipo_ajuste === 'descuento') runningSubtotal -= displayAmount; else runningSubtotal += displayAmount; const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 text-right font-bold text-[12px] text-gray-600">${__orderFormatMoneyHtml(displayAmount, { prefix: sign })}</td>`; rowsHtml += `<tr class="bg-gray-50"><td class="py-2 px-3 italic text-[12px] text-gray-500">Ajuste Global</td><td></td><td></td><td></td>${amountCellHtml}</tr>`; }
    const __orderTableRows = (String(rowsHtml).match(/<tr\b/gi) || []).length;
    const __orderTableChars = String(rowsHtml).replace(/<[^>]+>/g, '').length;
    let __orderDensityLevel = 0;
    if (__orderTableRows > 16 || __orderTableChars > 2300) __orderDensityLevel = 1;
    if (__orderTableRows > 24 || __orderTableChars > 3200) __orderDensityLevel = 2;
    if (__orderTableRows > 32 || __orderTableChars > 4200) __orderDensityLevel = 3;
    const __orderFitBodyPx = Math.max(8, (parseInt(pdfStyle.tableBodyPx, 10) || 12) - __orderDensityLevel);
    const __orderFitHeadPx = Math.max(9, (parseInt(pdfStyle.tableHeadPx, 10) || (__orderFitBodyPx + 2)) - (__orderDensityLevel >= 2 ? 2 : __orderDensityLevel));
    const __orderFitCellPy = __orderDensityLevel >= 3 ? 2 : (__orderDensityLevel >= 2 ? 3 : (__orderDensityLevel === 1 ? 4 : 8));
    const __orderFitCellPx = __orderDensityLevel >= 2 ? 6 : 12;
    const __orderFitLineHeight = __orderDensityLevel >= 3 ? '105%' : (__orderDensityLevel >= 2 ? '112%' : '120%');
    const __orderTableFitInline = `--cp-fit-head-size:${__orderFitHeadPx}px;--cp-fit-body-size:${__orderFitBodyPx}px;--cp-fit-cell-py:${__orderFitCellPy}px;--cp-fit-cell-px:${__orderFitCellPx}px;--cp-fit-line-height:${__orderFitLineHeight};`;
    const __orderQuickMarginClass = __orderDensityLevel >= 2 ? 'mb-8' : (__orderDensityLevel === 1 ? 'mb-12' : 'mb-20');
    const detailColumnLabel = __orderResolvePdfDetailHeader();
    const pricing = __orderResolveQuotePricing(o); const taxIds = isConvenio ? [] : pricing.taxIds; const storedTaxTotal = isConvenio ? 0 : (pricing.taxTotal > 0 ? pricing.taxTotal : Math.max(0, __orderRoundMoney(pricing.total - runningSubtotal))); const taxRows = __orderBuildTaxRows(runningSubtotal, taxIds, storedTaxTotal);
    // Blindaje adicional: si por cualquier ruta un convenio usa el layout
    // generico, la tabla y el resumen tambien deben quedar sin montos visibles.
    const totalsBlock = isConvenio
        ? ''
        : `<div class="cp-pdf-summary flex justify-end mb-2 pr-4" data-base-resource="summary"><div class="cp-pdf-summary-table-wrap"><table class="w-full border-collapse">${taxRows}<tr><td class="pt-2 border-t-2 border-gray-800 align-middle text-right" colspan="4"><span class="text-[10px] font-bold uppercase text-gray-500 mr-2">Total Neto</span></td><td class="pt-2 border-t-2 border-gray-800 align-middle text-right"><span class="text-xl font-black text-gray-900">${__orderFormatMoneyHtml(pricing.total)}</span></td></tr></table></div></div>`;
    const tableColGroupHtml = isConvenio
        ? `<colgroup><col style="width:42%;"><col style="width:18%;"><col style="width:16%;"><col style="width:24%;"></colgroup>`
        : `<colgroup><col style="width:38%;"><col style="width:14%;"><col style="width:12%;"><col style="width:14%;"><col style="width:22%;"></colgroup>`;
    const tableHeadHtml = isConvenio
        ? `<thead class="cp-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__cpSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">Medidas / Duración</th><th class="py-2 px-3 text-center rounded-r">Fecha</th></tr></thead>`
        : `<thead class="cp-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__cpSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">Medidas / Duración</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead>`;
    const convenioTableHideTag = isConvenio
        ? `<style>.cp-pdf-root .cp-pdf-hide-convenio-amounts tbody tr>td:last-child{display:none!important;}</style>`
        : '';

    const quickLeftItems = String(pdfContent.quickLeftLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const quickLeftItemsHtml = quickLeftItems.length
        ? quickLeftItems.map((line) => `<li>${__cpSafeHtml(line)}</li>`).join('')
        : '<li>Sin notas configuradas.</li>';
    const conditionsItems = String(pdfContent.conditionsLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const conditionsItemsHtml = conditionsItems.length
        ? conditionsItems.map((line) => `<p>${__cpSafeHtml(line)}</p>`).join('')
        : '<p>Sin condiciones configuradas.</p>';
    const quickConditions = !isOrder ? `
        <div class="cp-pdf-quick grid grid-cols-2 gap-4 ${__orderQuickMarginClass} pt-4 border-t border-gray-100" data-base-resource="quick">
            <div>
                <h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__cpSafeHtml(pdfContent.quickLeftTitle || 'Notas:')}</h4>
                <ul class="list-none text-xs text-gray-600 space-y-0.5 leading-tight">
                    ${quickLeftItemsHtml}
                </ul>
            </div>
            <div>
                <h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__cpSafeHtml(pdfContent.quickRightTitle || 'Vigencia:')}</h4>
                <p class="text-xs text-gray-600">${__cpSafeHtml(pdfContent.quickRightBody || '')}</p>
            </div>
        </div>` : '';

    const pdfTemplateContext = __cpBuildPdfTemplateContext(o, { folio: folioUnificado, docTitle, dateStr, venueName: 'Casa de Piedra' });
    const quoteApproverTitle = __cpResolvePdfTemplateString(pdfContent.quoteApproverTitle || 'QUIEN APRUEBA', pdfTemplateContext);
    const quoteApproverSubtitle = __cpResolvePdfTemplateString(pdfContent.quoteApproverSubtitle || 'Casa de Piedra', pdfTemplateContext);
    const quoteClientTitle = __cpResolvePdfTemplateString(pdfContent.quoteClientTitle || '{{CLIENT_NAME}}', pdfTemplateContext).slice(0, 40);
    const quoteClientSubtitle = __cpResolvePdfTemplateString(pdfContent.quoteClientSubtitle || 'Cliente / Representante', pdfTemplateContext);
    const orderApproverTitle = __cpResolvePdfTemplateString(pdfContent.orderApproverTitle || 'QUIEN APRUEBA', pdfTemplateContext);
    const orderApproverSubtitle = __cpResolvePdfTemplateString(pdfContent.orderApproverSubtitle || 'Casa de Piedra', pdfTemplateContext);

    // Cada firma se renderiza como bloque base independiente para poder moverla
    // y escalarla por separado desde el editor PDF.
    const renderSignArea = (entries, wrapperClass) => {
        const items = (Array.isArray(entries) ? entries : []).filter(Boolean).map((entry) => `
            <div class="cp-pdf-sign ${entry.nodeClass || 'text-center w-56'}" data-base-resource="sign">
                <div class="border-b border-black ${entry.lineClass || 'mb-1'}"></div>
                <p class="font-bold text-xs text-brand-dark ${entry.titleClass || ''}">${__cpSafeHtml(entry.title || '')}</p>
                ${Array.isArray(entry.extraLines) ? entry.extraLines.map((line) => `<p class="text-[10px] ${line.className || 'text-gray-500 uppercase'}">${__cpSafeHtml(line.text || '')}</p>`).join('') : ''}
                ${entry.subtitle ? `<p class="text-[10px] text-gray-500 uppercase ${entry.subtitleClass || ''}">${__cpSafeHtml(entry.subtitle || '')}</p>` : ''}
            </div>`).join('');
        return items ? `<div class="${wrapperClass}">${items}</div>` : '';
    };
    const signBlock = isOrder
        ? renderSignArea([
            {
                nodeClass: 'text-center w-64',
                title: orderApproverTitle,
                subtitle: orderApproverSubtitle
            }
        ], 'flex justify-center items-start px-2 w-full')
        : renderSignArea([
            {
                nodeClass: 'text-center w-56',
                title: quoteApproverTitle,
                subtitle: quoteApproverSubtitle
            },
            {
                nodeClass: 'text-center w-56',
                titleClass: 'uppercase',
                title: quoteClientTitle,
                subtitle: quoteClientSubtitle
            }
        ], 'flex justify-between items-start px-2 gap-6');

    const pageBaseHeight = Number(__orderContentBaseHeightPx().toFixed(2));
    // La carta convenio es un documento legal/operativo; los montos solo se
    // conservan en la cotizacion interna y no se imprimen en el PDF entregable.
    if (isConvenio && !isOrder) {
        const venueName = 'Casa de Piedra';
        const convenioMeta = __orderParseConvenioMeta(o);
        const convenioItems = convenioMeta.items.length ? convenioMeta.items : __orderBuildConvenioPayloadItems({ concepts: cArray });
        const publicityEntries = (detailSpaces.length ? detailSpaces : [o]).map((item) => {
            const sid = item?.espacio_id || item?.space_id || o.espacio_id;
            const catalogSpace = allSpaces.find((spaceItem) => String(spaceItem.id) === String(sid)) || space || null;
            const digitalMedia = __orderResolveDigitalMediaConfig(item, catalogSpace);
            const material = digitalMedia.enabled ? __orderDigitalMediaTypeLabel(digitalMedia) : (String(item?.material || catalogSpace?.material || '').trim() || 'Publicidad');
            const width = item?.medida_ancho ?? item?.ancho ?? catalogSpace?.medida_ancho ?? catalogSpace?.ancho;
            const height = item?.medida_alto ?? item?.alto ?? catalogSpace?.medida_alto ?? catalogSpace?.alto;
            const unit = String(item?.medida_unidad || catalogSpace?.medida_unidad || 'M').trim();
            const measures = digitalMedia.enabled
                ? __orderDigitalMediaDetailText(digitalMedia)
                : ((width !== null && width !== undefined && String(width) !== '' && height !== null && height !== undefined && String(height) !== '')
                ? `${width} x ${height} ${unit}`
                : 'Sin medida capturada');
            const start = item?.fecha_inicio || o.fecha_inicio || '';
            const end = item?.fecha_fin || o.fecha_fin || '';
            const isIndefinite = __orderDetailBlocksIndefinitely(item) || __orderBlocksIndefinitely(o);
            return {
                name: String(item?.espacio_nombre || catalogSpace?.nombre || o.espacio_nombre || 'Espacio publicitario').trim() || 'Espacio publicitario',
                key: String(item?.espacio_clave || catalogSpace?.clave || o.espacio_clave || '').trim(),
                material,
                measures,
                range: isIndefinite
                    ? `${window.safeFormatDate(start)} al indefinido`
                    : `${window.safeFormatDate(start)} al ${window.safeFormatDate(end || start)}`
            };
        });
        const publicityItemsHtml = publicityEntries.length
            ? publicityEntries.map((entry) => `
                <li class="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div>
                        <p class="font-black text-gray-800 text-[11px]">${__orderEscapeHtml(entry.name)}</p>
                        ${entry.key ? `<p class="text-[9px] font-mono text-gray-400 mt-0.5">${__orderEscapeHtml(entry.key)}</p>` : ''}
                    </div>
                    <p class="mt-1 text-[10px] text-gray-500">Soporte: ${__orderEscapeHtml(entry.material)}${entry.measures ? ` · ${__orderEscapeHtml(entry.measures)}` : ''}</p>
                    <p class="mt-0.5 text-[10px] text-gray-400">Vigencia: ${__orderEscapeHtml(entry.range)}</p>
                </li>`).join('')
            : '<li class="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-[10px] font-bold text-gray-400">Sin espacios publicitarios capturados.</li>';
        const tradeItemsHtml = convenioItems.length
            ? convenioItems.map((item) => {
                const qty = Math.max(1, parseInt(item?.cantidad_entrega || 1, 10) || 1);
                const label = `${qty} ${qty === 1 ? 'entrega' : 'entregas'} de ${item?.nombre || 'Convenio'}`;
                return `
                    <li class="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <span class="text-[11px] font-semibold text-gray-700">${__orderEscapeHtml(label)}</span>
                    </li>`;
            }).join('')
            : '<li class="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-[10px] font-bold text-gray-400">Sin tratos capturados.</li>';
        const convenioMonthYear = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
        const convenioSubject = String(o.nombre_cotizacion || o.nombre || o.proyecto || clientName || 'Campaña vigente').trim() || 'Campaña vigente';
        const convenioStart = detailSpaces[0]?.fecha_inicio || o.fecha_inicio || '';
        const convenioEnd = detailSpaces[detailSpaces.length - 1]?.fecha_fin || o.fecha_fin || convenioStart;
        const convenioValidityText = __orderBlocksIndefinitely(o)
            ? `Este convenio tendrá efecto a partir del ${window.safeFormatDate(convenioStart)} y permanecerá vigente hasta nuevo aviso, fecha en que la publicidad será retirada por instrucción de las partes.`
            : `Este convenio tendrá efecto desde ${window.safeFormatDate(convenioStart)} hasta el día ${window.safeFormatDate(convenioEnd)}, fecha en que la publicidad será retirada.`;
        const clientRoleLabel = String(quoteClientSubtitle || 'Cliente / Representante').trim() || 'Cliente / Representante';
        const approverRoleLabel = String(quoteApproverSubtitle || venueName).trim() || venueName;
        const convenioSignBlock = renderSignArea([
            {
                nodeClass: 'text-center w-56',
                lineClass: 'mb-2',
                titleClass: 'uppercase',
                title: venueName,
                extraLines: [
                    { text: quoteApproverTitle || 'Quien aprueba', className: 'text-[10px] text-gray-600 mt-1' },
                    { text: approverRoleLabel, className: 'text-[10px] text-gray-500 uppercase' }
                ]
            },
            {
                nodeClass: 'text-center w-56',
                lineClass: 'mb-2',
                titleClass: 'uppercase',
                title: quoteClientTitle || clientName,
                subtitleClass: 'mt-1',
                subtitle: clientRoleLabel
            }
        ], 'flex justify-between items-start px-2 mt-4 gap-6');
        const convenioGridStyle = __cpBuildConvenioGridStyle(publicityEntries.length, convenioItems.length);
        const convenioRaw = `
            <div class="cp-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;">
                <div class="cp-pdf-page-frame" style="${__cpBuildPdfContentFrameStyle(pageBaseHeight, 'display:flex;flex-direction:column;justify-content:space-between;')}">
                    <div>
                        ${renderHeader(docTitle)}
                        <div class="cp-pdf-summary text-[11px] text-gray-600 text-right mb-4" data-base-resource="summary">León, Guanajuato; ${__cpSafeHtml(convenioMonthYear)}.</div>
                        <div class="cp-pdf-general-conditions text-[11px] text-gray-700 space-y-4 leading-relaxed" data-base-resource="conditions">
                            <div class="text-center space-y-1">
                                <p class="text-xl font-black text-gray-900 tracking-wide">CONVENIO DE INTERCAMBIO</p>
                                <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">${__cpSafeHtml((quoteClientTitle || clientName).toUpperCase())} y ${__cpSafeHtml(venueName.toUpperCase())}</p>
                            </div>
                            <p><strong>${__cpSafeHtml(venueName.toUpperCase())}</strong> acuerda proporcionar espacio publicitario en sus instalaciones para la campaña <strong>${__orderEscapeHtml(convenioSubject)}</strong>. La difusión se realizará en los soportes descritos a continuación y se documentará mediante evidencia fotográfica.</p>
                            <div style="${convenioGridStyle}">
                                <div class="rounded-2xl border border-gray-200 bg-slate-50/80 p-4">
                                    <p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Publicidad acordada</p>
                                    <ul class="space-y-2">${publicityItemsHtml}</ul>
                                </div>
                                <div class="space-y-4">
                                    <div class="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Vigencia del acuerdo</p>
                                        <p class="text-[11px] text-gray-700">${__orderEscapeHtml(convenioValidityText)}</p>
                                    </div>
                                    <div class="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Contraprestación acordada</p>
                                        <ul class="space-y-2">${tradeItemsHtml}</ul>
                                    </div>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="rounded-2xl border border-gray-200 bg-white p-4">
                                    <p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Responsabilidades del cliente</p>
                                    <ul class="list-disc pl-4 space-y-1 text-[10px] text-gray-700">
                                        <li>Entregar los artes digitales o materiales físicos necesarios para la exposición acordada.</li>
                                        <li>Proporcionar las contraprestaciones pactadas en tiempo y forma conforme a este convenio.</li>
                                        <li>Compartir la información operativa necesaria para que la instalación publicitaria se ejecute correctamente.</li>
                                    </ul>
                                </div>
                                <div class="rounded-2xl border border-gray-200 bg-white p-4">
                                    <p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Responsabilidades de ${__cpSafeHtml(venueName)}</p>
                                    <ul class="list-disc pl-4 space-y-1 text-[10px] text-gray-700">
                                        <li>Colocar los materiales publicitarios en los espacios acordados durante la vigencia del convenio.</li>
                                        <li>Garantizar la presencia de la publicidad conforme a la disponibilidad operativa del espacio contratado.</li>
                                        <li>Registrar evidencia fotográfica del cumplimiento para el cierre documental del convenio.</li>
                                    </ul>
                                </div>
                            </div>
                            <p class="text-[11px] text-justify">Ambas partes acuerdan cumplir con los términos y condiciones de este convenio, firmando a continuación la aceptación de los compromisos expresados en el presente documento.</p>
                        </div>
                    </div>
                    <div class="pb-2">
                        ${convenioSignBlock}
                        ${footerHubHTML}
                    </div>
                </div>
                ${__cpRenderPdfResources(pdfStyle, 1, pdfTemplateContext)}
            </div>`;
        const convenioPages = [
            __orderWrapLetterheadPage(__cpOrdersBoostPdfTypography(convenioRaw), { baseWidth: __ORDER_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })
        ];
        const convenioExtraPages = __cpClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
        if (convenioExtraPages > 0) {
            for (let i = 0; i < convenioExtraPages; i += 1) {
                const extraRaw = `
                    <div class="cp-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;">
                        <div class="cp-pdf-page-frame" style="${__cpBuildPdfContentFrameStyle(pageBaseHeight)}">
                            ${renderHeader(`ANEXO ${i + 1}`)}
                            <div class="cp-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4" data-base-resource="conditions">
                                <p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__cpSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p>
                                <p>${__cpSafeHtml(pdfContent.annexHintBody || '')}</p>
                            </div>
                            ${footerHubHTML}
                        </div>
                        ${__cpRenderPdfResources(pdfStyle, 2 + i, pdfTemplateContext)}
                    </div>`;
                convenioPages.push(__orderWrapLetterheadPage(__cpOrdersBoostPdfTypography(extraRaw), { baseWidth: __ORDER_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
            }
        }
        const convenioRawHtml = `<div class="cp-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;${pdfStyleInlineVars}${__orderTableFitInline}">${pdfStyleTag}${pdfTableFitTag}${convenioPages.join('')}</div>`;
        return __cpOrdersTransparentPdfHtml(convenioRawHtml);
    }
    const page1Raw = `
        <div class="cp-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;">
            <div class="cp-pdf-page-frame" style="${__cpBuildPdfContentFrameStyle(pageBaseHeight, 'display:flex;flex-direction:column;justify-content:space-between;')}">
                <div>
                    ${renderHeader(docTitle)}
                    ${clientComponent}
                    ${isOrder ? `<div class="mb-2 bg-gray-100 p-2 rounded text-base"><span>Folio de Servicio: <strong class="font-black text-lg">${folioUnificado}</strong></span></div>` : ''}
                    <table class="w-full text-left mb-2 mt-3 table-fixed border-separate border-spacing-0 ${isConvenio ? 'cp-pdf-hide-convenio-amounts' : ''}">
                        ${tableColGroupHtml}
                        ${tableHeadHtml}
                        <tbody class="cp-pdf-table-body divide-y divide-gray-50 text-[12px]" data-base-resource="table-body">${rowsHtml}</tbody>
                    </table>
                    ${totalsBlock}
                </div>
                <div class="pb-2">
                    ${quickConditions}
                    ${signBlock}
                    ${footerHubHTML}
                </div>
            </div>
            ${__cpRenderPdfResources(pdfStyle, 1, pdfTemplateContext)}
        </div>`;
    const pages = [__orderWrapLetterheadPage(__cpOrdersBoostPdfTypography(page1Raw), { baseWidth: __ORDER_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })];
    if (!isOrder) {
        const page2Raw = `
            <div class="cp-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;">
                <div class="cp-pdf-page-frame" style="${__cpBuildPdfContentFrameStyle(pageBaseHeight)}">
                    ${renderHeader(__cpSafeHtml(pdfContent.conditionsTitle || 'CONDICIONES GENERALES'))}
                    <div class="cp-pdf-general-conditions text-xs text-gray-800 space-y-3 text-justify leading-relaxed mt-6" data-base-resource="conditions">
                        ${conditionsItemsHtml}
                    </div>
                </div>
                ${__cpRenderPdfResources(pdfStyle, 2, pdfTemplateContext)}
            </div>`;
        pages.push(__orderWrapLetterheadPage(__cpOrdersBoostPdfTypography(page2Raw), { baseWidth: __ORDER_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
    }
    const extraPages = __cpClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
    if (extraPages < 0 && pages.length > 1) {
        const keepCount = Math.max(1, pages.length + extraPages);
        pages.length = keepCount;
    } else if (extraPages > 0) {
        for (let i = 0; i < extraPages; i += 1) {
            const extraRaw = `
                <div class="cp-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;">
                    <div class="cp-pdf-page-frame" style="${__cpBuildPdfContentFrameStyle(pageBaseHeight)}">
                        ${renderHeader(`ANEXO ${i + 1}`)}
                        <div class="cp-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4" data-base-resource="conditions">
                            <p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__cpSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p>
                            <p>${__cpSafeHtml(pdfContent.annexHintBody || '')}</p>
                        </div>
                        ${footerHubHTML}
                    </div>
                    ${__cpRenderPdfResources(pdfStyle, (isOrder ? 2 : 3) + i, pdfTemplateContext)}
                </div>`;
            pages.push(__orderWrapLetterheadPage(__cpOrdersBoostPdfTypography(extraRaw), { baseWidth: __ORDER_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
        }
    }
    const raw = `<div class="cp-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;${pdfStyleInlineVars}${__orderTableFitInline}">${convenioTableHideTag}${pdfStyleTag}${pdfTableFitTag}${pages.join('')}</div>`;
    return __cpOrdersTransparentPdfHtml(raw);
};

// =========================================================================
// EXTENSIÓN 2026-B: MULTI-ESPACIO EN EDICIÓN + PREMONTAJE PORCENTAJE GLOBAL
// =========================================================================
let __orderPremontajePct = 25;
let __orderHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
let __orderQuoteSpaces = [];
let __orderActiveSpaceId = null;
let __orderTotals = { subtotalBase: 0, concepts: 0, adjustment: 0, tax: 0, final: 0 };

function __orderSafeArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try {
            const p = JSON.parse(v);
            return Array.isArray(p) ? p : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function __orderNormalizeDate(v) {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function __orderDatesBetween(startStr, endStr) {
    const s = __orderNormalizeDate(startStr || '');
    const e = __orderNormalizeDate(endStr || s);
    if (!s || !e) return [];
    const start = new Date(`${s}T00:00:00`);
    const end = new Date(`${e}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        out.push(`${y}-${m}-${day}`);
    }
    return out;
}

function __orderGetPremPct() {
    const n = parseFloat(__orderPremontajePct);
    return Number.isFinite(n) && n >= 0 ? n : 25;
}

function __orderGetHoraExtraCfg() {
    const rawMode = String(__orderHoraExtraCfg?.mode || '').toLowerCase();
    const mode = (rawMode === 'fixed' || rawMode === 'percent') ? rawMode : 'percent';
    const parsedValue = parseFloat(__orderHoraExtraCfg?.value);
    const value = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 100;
    const allowCustom = __orderHoraExtraCfg?.allowCustom !== false;
    return { mode, value, allowCustom };
}

function __orderGetBaseHoraExtraUnit(space) {
    let b2b = {};
    try {
        b2b = typeof space?.config_b2b === 'string' ? JSON.parse(space.config_b2b) : (space?.config_b2b || {});
    } catch (e) {
        b2b = {};
    }
    return parseFloat(b2b?.precio_hora_extra || 0) || 0;
}

function __orderResolveHoraExtraUnit(space) {
    const cfg = __orderGetHoraExtraCfg();
    if (cfg.mode === 'fixed') return cfg.value;
    const base = __orderGetBaseHoraExtraUnit(space);
    return base * (cfg.value / 100);
}

function __orderApplyHoraExtraInputState(cfg) {
    const unitInput = document.getElementById('oed-horas-price');
    const hoursInput = document.getElementById('oed-horas');
    const enabled = !!document.getElementById('oed-chk-horas')?.checked;
    if (!cfg || !unitInput) return;
    const space = __orderGetSpaceById(cfg.spaceId);
    const heCfg = __orderGetHoraExtraCfg();
    const computedUnit = __orderResolveHoraExtraUnit(space);
    if (!heCfg.allowCustom) {
        cfg.horasExtraUnit = computedUnit;
    } else if (!Number.isFinite(parseFloat(cfg.horasExtraUnit))) {
        cfg.horasExtraUnit = computedUnit;
    }
    unitInput.value = parseFloat(cfg.horasExtraUnit || 0) || 0;
    const shouldLock = !enabled || !heCfg.allowCustom;
    unitInput.disabled = shouldLock;
    unitInput.readOnly = !heCfg.allowCustom;
    if (hoursInput) hoursInput.title = heCfg.allowCustom ? '' : 'El precio por hora extra se controla desde config.html';
    unitInput.title = heCfg.allowCustom ? '' : 'Precio controlado desde config.html';
}

function __orderGetSpaceById(spaceId) {
    return allSpaces.find(s => String(s.id) === String(spaceId)) || null;
}

function __orderGetSpaceMaxCapacity(space) {
    let rules = [];
    try {
        rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : (space?.precios_por_dia || []);
    } catch (e) { }
    if (!Array.isArray(rules) || !rules.length) return 999999;
    const finite = rules.map(r => parseInt(r?.max, 10)).filter(v => Number.isFinite(v) && v > 0 && v < 999999);
    return finite.length ? Math.max(...finite) : 999999;
}
function __orderDayKey(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const keys = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return keys[d.getDay()] || '';
}
function __orderIsBlockedDate(space, dateStr, guests) {
    let blocked = [];
    try { blocked = typeof space?.dias_bloqueados === 'string' ? JSON.parse(space.dias_bloqueados) : (space?.dias_bloqueados || []); } catch (e) { blocked = []; }
    const dayKey = __orderDayKey(dateStr);
    if (Array.isArray(blocked) && blocked.includes(dayKey)) return true;
    const base = calculateDayByDayTotal(space, dateStr, dateStr, guests).total || 0;
    return base <= 0;
}

function __orderIsPremontajeBlockedDate(space, dateStr) {
    let blockedP = [];
    try { blockedP = typeof space?.dias_bloqueados_premontaje === 'string' ? JSON.parse(space.dias_bloqueados_premontaje) : (space?.dias_bloqueados_premontaje || []); } catch (e) { blockedP = []; }
    const dayKey = __orderDayKey(dateStr);
    return Array.isArray(blockedP) && blockedP.includes(dayKey);
}

function __orderCfgHasBlockedDates(cfg) {
    const space = __orderGetSpaceById(cfg?.spaceId);
    if (!space) return false;
    if (__orderIsPublicidadSpace(space)) return false;
    const guests = parseInt(cfg?.guests, 10) || 1;
    const eventDates = [];
    const s = __orderNormalizeDate(cfg?.startDate || '');
    const e = __orderNormalizeDate(cfg?.endDate || s);
    if (s && e) {
        const start = new Date(`${s}T00:00:00`);
        const end = new Date(`${e}T00:00:00`);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
            eventDates.push(`${y}-${m}-${day}`);
        }
    }
    const premDates = __orderSafeArray(cfg?.premontajeDates).map(__orderNormalizeDate).filter(Boolean);
    const eventBlocked = eventDates.some(ds => __orderIsBlockedDate(space, ds, guests));
    const premBlocked = premDates.some(ds => __orderIsPremontajeBlockedDate(space, ds));
    return eventBlocked || premBlocked;
}

function __orderDefaultTaxIds(space) {
    return __orderNormalizeTaxIds(space?.impuestos_ids || space?.impuestos);
}
function __orderResolveCfgTaxIds(cfg, space) {
    if (Array.isArray(cfg?.taxIds)) return __orderNormalizeTaxIds(cfg.taxIds);
    return __orderDefaultTaxIds(space);
}
function __orderRenderAutoTaxSummary(taxIds, space) {
    const rows = __orderNormalizeTaxIds(taxIds).map((taxId) => __orderResolveTaxRecord(taxId, space)).filter(Boolean);
    if (!rows.length) return '<p class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</p>';
    return rows.map((tax) => `<div class="text-[10px] text-gray-500 font-bold uppercase">${tax.nombre}</div>`).join('');
}

async function __orderLoadPremontajePctConfig() {
    __orderPremontajePct = 25;
    __orderHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
    __CP_LETTERHEAD_URL = __orderDefaultLetterheadUrl();
    try {
        const tenant = __orderResolveTenantSlug('casa_de_piedra');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,valor_num,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .in('clave', ['premontaje_pct', 'hora_extra_cfg', __CP_CFG_LETTERHEAD_KEY]);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const resolvedRows = [
            __cpPickLatestRecord(rows.filter((row) => String(row?.clave || '').toLowerCase() === 'premontaje_pct')),
            __cpPickLatestRecord(rows.filter((row) => String(row?.clave || '').toLowerCase() === 'hora_extra_cfg')),
            __cpPickLatestRecord(rows.filter((row) => String(row?.clave || '').toLowerCase() === __CP_CFG_LETTERHEAD_KEY))
        ].filter(Boolean);
        for (const row of resolvedRows) {
            const key = String(row?.clave || '').toLowerCase();
            const cfg = __orderParseRecordJson(row?.valor_json);
            if (key === 'premontaje_pct') {
                const raw = row?.valor_num ?? cfg?.value ?? cfg?.percent;
                const parsed = parseFloat(raw);
                if (Number.isFinite(parsed) && parsed >= 0) __orderPremontajePct = parsed;
                continue;
            }
            if (key === 'hora_extra_cfg') {
                const modeRaw = String(cfg?.mode || '').toLowerCase();
                const mode = (modeRaw === 'fixed' || modeRaw === 'percent') ? modeRaw : 'percent';
                const rawVal = row?.valor_num ?? cfg?.value ?? 100;
                const parsedVal = parseFloat(rawVal);
                const value = Number.isFinite(parsedVal) && parsedVal >= 0 ? parsedVal : 100;
                const allowCustom = cfg?.allow_custom !== false;
                __orderHoraExtraCfg = { mode, value, allowCustom };
                continue;
            }
            if (key === __CP_CFG_LETTERHEAD_KEY) {
                const rawPath = cfg.path || cfg.file_path || cfg.value || '';
                const safePath = rawPath || (cfg.file_name ? `${__CP_LETTERHEAD_PATH}/${cfg.file_name}` : '');
                if (!safePath) continue;
                __CP_LETTERHEAD_STORAGE_PATH = String(safePath || '').replace(/\\/g, '/');
                await __orderRefreshLetterheadUrl(true);
            }
        }
    } catch (e) {
        __orderPremontajePct = 25;
        __orderHoraExtraCfg = { mode: 'percent', value: 100, allowCustom: true };
        __CP_LETTERHEAD_URL = __orderDefaultLetterheadUrl();
    }
}

function __orderApplyStatusVisual() {
    const el = document.getElementById('oed-status');
    if (!el) return;
    const v = String(el.value || '').toLowerCase();
    el.classList.remove('border-amber-300', 'bg-amber-50', 'text-amber-700', 'border-emerald-300', 'bg-emerald-50', 'text-emerald-700', 'border-red-300', 'bg-red-50', 'text-red-700', 'border-slate-300', 'bg-slate-50', 'text-slate-700');
    if (v === 'aprobada') el.classList.add('border-emerald-300', 'bg-emerald-50', 'text-emerald-700');
    else if (v === 'pendiente') el.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-700');
    else if (v === 'rechazada') el.classList.add('border-red-300', 'bg-red-50', 'text-red-700');
    else el.classList.add('border-slate-300', 'bg-slate-50', 'text-slate-700');
}

function __orderCreateSpaceCfg(spaceId, seed = {}) {
    const space = __orderGetSpaceById(spaceId);
    const isPublicidad = __orderIsPublicidadSpace(space);
    let b2b = {};
    try {
        b2b = typeof space?.config_b2b === 'string' ? JSON.parse(space.config_b2b) : (space?.config_b2b || {});
    } catch (e) {
        b2b = {};
    }
    let horarios = __orderSafeArray(b2b.horarios);
    if (!horarios.length && b2b.horarios && typeof b2b.horarios === 'object') {
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        horarios = Object.keys(b2b.horarios)
            .map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end, price: b2b.horarios[k]?.price }))
            .filter(item => item.start && item.end);
    }
    const firstHorario = horarios[0] || null;
    const hasSeedHoraUnit = seed.horasExtraUnit !== undefined && seed.horasExtraUnit !== null && String(seed.horasExtraUnit) !== '';
    const defaultHoraUnit = hasSeedHoraUnit ? (parseFloat(seed.horasExtraUnit) || 0) : __orderResolveHoraExtraUnit(space);
    const heCfg = __orderGetHoraExtraCfg();
    const cfg = {
        spaceId: String(spaceId),
        startDate: __orderNormalizeDate(seed.startDate || ''),
        endDate: __orderNormalizeDate(seed.endDate || seed.startDate || ''),
        guests: isPublicidad ? 1 : (parseInt(seed.guests, 10) || 1),
        horarioValue: seed.horarioValue || (firstHorario?.nombre || ''),
        horarioText: seed.horarioText || '',
        horarioPrice: parseFloat(seed.horarioPrice ?? firstHorario?.price ?? 0) || 0,
        horarioCustomStart: seed.horarioCustomStart || '',
        horarioCustomEnd: seed.horarioCustomEnd || '',
        premontajeEnabled: seed.premontajeEnabled === true || (parseInt(seed.premontajeDays, 10) || 0) > 0,
        premontajeDays: parseInt(seed.premontajeDays, 10) || 0,
        premontajeCourtesyDays: parseInt(seed.premontajeCourtesyDays, 10) || 0,
        premontajeDates: __orderSafeArray(seed.premontajeDates),
        horasExtraEnabled: seed.horasExtraEnabled === true || (parseInt(seed.horasExtra, 10) || 0) > 0,
        horasExtra: parseInt(seed.horasExtra, 10) || 0,
        horasExtraCourtesy: parseInt(seed.horasExtraCourtesy, 10) || 0,
        horasExtraUnit: heCfg.allowCustom ? defaultHoraUnit : __orderResolveHoraExtraUnit(space),
        taxIds: Array.isArray(seed.taxIds) ? __orderNormalizeTaxIds(seed.taxIds) : __orderDefaultTaxIds(space),
        spaceType: seed.spaceType || space?.tipo || '',
        material: String(seed.material || space?.material || '').trim(),
        medidaAncho: __orderNormalizeMeasureValue(seed.medidaAncho ?? seed.medida_ancho ?? seed.ancho ?? space?.medida_ancho ?? space?.ancho),
        medidaAlto: __orderNormalizeMeasureValue(seed.medidaAlto ?? seed.medida_alto ?? seed.alto ?? space?.medida_alto ?? space?.alto),
        medidaUnit: __orderNormalizeMeasureUnit(seed.medidaUnit || seed.medida_unidad || seed.unidad_medida || space?.medida_unidad || space?.unidad_medida || 'M'),
        customPermanence: !!seed.customPermanence,
        customPriceEnabled: !!seed.customPriceEnabled,
        customPriceMode: String(seed.customPriceMode || 'total'),
        customBasePrice: (seed.customBasePrice === undefined || seed.customBasePrice === null || seed.customBasePrice === '')
            ? ''
            : (parseFloat(seed.customBasePrice) || 0),
        convenioEnabled: seed.convenioEnabled === true || seed.convenio_activo === true || seed.convenio_indefinido === true,
        concepts: __orderSafeArray(seed.concepts).map(__orderNormalizeExtraConcept)
    };
    if (isPublicidad) {
        cfg.guests = 1;
        cfg.horarioValue = '';
        cfg.horarioText = '';
        cfg.horarioPrice = 0;
        cfg.horarioCustomStart = '';
        cfg.horarioCustomEnd = '';
        cfg.premontajeEnabled = false;
        cfg.premontajeDays = 0;
        cfg.premontajeCourtesyDays = 0;
        cfg.premontajeDates = [];
        cfg.horasExtraEnabled = false;
        cfg.horasExtra = 0;
        cfg.horasExtraCourtesy = 0;
        cfg.horasExtraUnit = 0;
        if (cfg.convenioEnabled) {
            cfg.customPriceEnabled = false;
            cfg.customBasePrice = '';
        }
        __orderNormalizePublicidadDates(cfg);
    }
    return cfg;
}

const __ORDER_DETAIL_TABS = ['client', 'spaces', 'financial', 'summary', 'expediente'];
const __ORDER_DETAIL_TAB_KEY_PREFIX = 'cp_order_detail_tab_v1:';
let __orderExpedienteRenderSeq = 0;
let __orderExpedienteObjectUrls = [];

function __orderResolveDetailTabStorageKey() {
    const params = new URLSearchParams(window.location.search || '');
    const quoteId = String(params.get('quote') || '').trim();
    return `${__ORDER_DETAIL_TAB_KEY_PREFIX}${String(window.location.pathname || '').toLowerCase()}:${quoteId || 'default'}`;
}

function __orderReadDetailTab() {
    try {
        const saved = String(sessionStorage.getItem(__orderResolveDetailTabStorageKey()) || '').trim();
        return __ORDER_DETAIL_TABS.includes(saved) ? saved : 'client';
    } catch (_) {
        return 'client';
    }
}

function __orderWriteDetailTab() {
    try { sessionStorage.setItem(__orderResolveDetailTabStorageKey(), __orderDetailTab); } catch (_) { }
}

let __orderDetailTab = __orderReadDetailTab();

function __orderRangeDays(startDate, endDate) {
    return Math.max(1, __orderDatesBetween(startDate || '', endDate || startDate || '').length || 0);
}

function __orderNormalizeSpaceTag(value) {
    const raw = String(value || '').trim();
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
    return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function __orderNormalizeMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function __orderNormalizeMeasureUnit(value) {
    const normalized = String(value || 'M').trim().toUpperCase();
    if (normalized === 'CM') return 'CM';
    if (normalized === 'M2') return 'M2';
    return 'M';
}
function __orderTrimMeasureValue(value) {
    return String(value || '')
        .replace(/(\.\d*?[1-9])0+$/g, '$1')
        .replace(/\.0+$/g, '')
        .trim();
}
function __orderNormalizeDigitalMediaConfig(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const enabled = !!(source.enabled ?? source.activo ?? source.es_digital);
    const rawType = __orderNormalizeSpaceTag(source.media_type || source.tipo_medio || source.tipo || source.formato || 'imagen');
    const durationValue = __orderNormalizeMeasureValue(source.duration_value ?? source.duracion_valor ?? source.duracion);
    const unit = String(source.duration_unit || source.duracion_unidad || 'segundos').trim().toLowerCase();
    const pixelWidth = __orderNormalizeMeasureValue(source.pixel_width ?? source.pixeles_ancho ?? source.ancho_px);
    const pixelHeight = __orderNormalizeMeasureValue(source.pixel_height ?? source.pixeles_alto ?? source.alto_px);
    return {
        enabled,
        media_type: rawType.includes('video') ? 'video' : 'imagen',
        duration_value: durationValue,
        duration_unit: unit === 'minutos' ? 'minutos' : 'segundos',
        pixel_width: pixelWidth,
        pixel_height: pixelHeight
    };
}
function __orderResolveDigitalMediaConfig(detailSpace = {}, catalogSpace = {}) {
    const hasDetailConfig = !!detailSpace && typeof detailSpace === 'object' && (
        Object.prototype.hasOwnProperty.call(detailSpace, 'digital_media') ||
        Object.prototype.hasOwnProperty.call(detailSpace, 'digitalMedia') ||
        Object.prototype.hasOwnProperty.call(detailSpace, 'medio_digital')
    );
    const detailCfg = __orderNormalizeDigitalMediaConfig(detailSpace?.digital_media || detailSpace?.digitalMedia || detailSpace?.medio_digital || {});
    if (hasDetailConfig || detailCfg.enabled) return detailCfg;
    const catalogB2b = __orderParseRecordJson(catalogSpace?.config_b2b);
    return __orderNormalizeDigitalMediaConfig(catalogB2b.digital_media || catalogB2b.digitalMedia || catalogB2b.medio_digital || {});
}
function __orderDigitalMediaTypeLabel(config) {
    return __orderNormalizeDigitalMediaConfig(config).media_type === 'video' ? 'Video' : 'Imagen';
}
function __orderDigitalMediaDetailHtml(config) {
    const cfg = __orderNormalizeDigitalMediaConfig(config);
    const rows = [];
    if (cfg.pixel_width !== null && cfg.pixel_height !== null) rows.push(`Pixeles: ${__orderTrimMeasureValue(cfg.pixel_width)} x ${__orderTrimMeasureValue(cfg.pixel_height)} px`);
    if (cfg.duration_value !== null) rows.push(`Duración: ${__orderTrimMeasureValue(cfg.duration_value)} ${cfg.duration_unit}`);
    return rows.length ? rows.map(row => __cpSafeHtml(row)).join('<br>') : '<span class="text-gray-300">---</span>';
}
function __orderDigitalMediaDetailText(config) {
    const cfg = __orderNormalizeDigitalMediaConfig(config);
    const rows = [];
    if (cfg.pixel_width !== null && cfg.pixel_height !== null) rows.push(`Pixeles: ${__orderTrimMeasureValue(cfg.pixel_width)} x ${__orderTrimMeasureValue(cfg.pixel_height)} px`);
    if (cfg.duration_value !== null) rows.push(`Duracion: ${__orderTrimMeasureValue(cfg.duration_value)} ${cfg.duration_unit}`);
    return rows.join(' · ');
}

function __orderIsPublicidadSpace(target) {
    const space = target?.spaceId ? __orderGetSpaceById(target.spaceId) : target;
    return __orderNormalizeSpaceTag(space?.tipo) === 'publicidad';
}

function __orderGetPublicidadMonthBounds(anchor = '') {
    const base = __orderNormalizeDate(anchor) || __orderTodayISO();
    const start = new Date(`${base}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
        const today = __orderTodayISO();
        return { start: today, end: today };
    }
    const end = new Date(`${base}T00:00:00`);
    end.setDate(end.getDate() + 29);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function __orderNormalizePublicidadDates(cfg) {
    if (!cfg) return;
    const anchor = __orderNormalizeDate(cfg.startDate || cfg.endDate || __orderTodayISO());
    if (cfg.customPermanence) {
        cfg.startDate = __orderNormalizeDate(cfg.startDate || anchor);
        cfg.endDate = __orderNormalizeDate(cfg.endDate || cfg.startDate || anchor);
    } else {
        const month = __orderGetPublicidadMonthBounds(anchor);
        cfg.startDate = month.start;
        cfg.endDate = month.end;
    }
    if (cfg.startDate && cfg.endDate && cfg.endDate < cfg.startDate) cfg.endDate = cfg.startDate;
}

function __orderSyncActiveSpaceModeUi(cfg) {
    const active = cfg || __orderGetActiveCfg();
    const isPublicidad = __orderIsPublicidadSpace(active);
    const guestsField = document.getElementById('oed-event-guests-field');
    const eventWrap = document.getElementById('oed-event-options-wrap');
    if (guestsField) guestsField.classList.toggle('hidden', isPublicidad);
    if (eventWrap) eventWrap.classList.toggle('hidden', isPublicidad);
    if (isPublicidad) {
        const guestsEl = document.getElementById('oed-guests');
        const premChk = document.getElementById('oed-chk-premontaje');
        const horasChk = document.getElementById('oed-chk-horas');
        if (guestsEl) guestsEl.value = '1';
        if (premChk) premChk.checked = false;
        if (horasChk) horasChk.checked = false;
    }
    __orderSyncPublicidadCustomUi(active);
    __orderSyncConvenioUi(active);
}

function __orderFormatMoneyMx(value) {
    return (parseFloat(value || 0) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function __orderFormatRangeLabel(startDate, endDate) {
    const start = String(startDate || '').trim();
    const end = String(endDate || startDate || '').trim();
    if (!start || !end) return '--';
    if (start === end) return window.safeFormatDate(start);
    return `${window.safeFormatDate(start)} al ${window.safeFormatDate(end)}`;
}

function __orderResolveDetailMaterialMeasure(detailSpace = {}, catalogSpace = {}) {
    const safeDetail = detailSpace && typeof detailSpace === 'object' ? detailSpace : {};
    const safeCatalog = catalogSpace && typeof catalogSpace === 'object' ? catalogSpace : {};
    const width = __orderNormalizeMeasureValue(safeDetail.medida_ancho ?? safeDetail.ancho ?? safeCatalog.medida_ancho ?? safeCatalog.ancho);
    const height = __orderNormalizeMeasureValue(safeDetail.medida_alto ?? safeDetail.alto ?? safeCatalog.medida_alto ?? safeCatalog.alto);
    const unit = __orderNormalizeMeasureUnit(safeDetail.medida_unidad || safeDetail.unidad_medida || safeCatalog.medida_unidad || safeCatalog.unidad_medida || 'M');
    const material = String(safeDetail.material || safeCatalog.material || '').trim();
    return {
        material,
        medida_ancho: width,
        medida_alto: height,
        medida_unidad: unit
    };
}

function __orderResolvePdfSpaceDetail(detailSpace = {}, catalogSpace = {}) {
    const detailMaterialMeasure = __orderResolveDetailMaterialMeasure(detailSpace, catalogSpace);
    return String(detailMaterialMeasure.material || '').trim() || '--';
}

function __orderResolveBaseTotal(cfg, space, guests) {
    if (!cfg || !space) return 0;
    if (__orderIsPublicidadSpace(space)) {
        if (cfg.convenioEnabled) return parseFloat(space.precio_base || 0) || 0;
        if (cfg.customPriceEnabled) {
            const manual = Math.max(0, parseFloat(cfg.customBasePrice || 0) || 0);
            if (String(cfg.customPriceMode || 'total') === 'per_day') {
                return manual * __orderRangeDays(cfg.startDate, cfg.endDate);
            }
            return manual;
        }
        if (cfg.customPermanence) {
            const days = __orderRangeDays(cfg.startDate, cfg.endDate);
            if (days === 30) return parseFloat(space.precio_base || 0) || 0;
            return (parseFloat(space.precio_base || 0) || 0) / Math.max(1, days);
        }
        return parseFloat(space.precio_base || 0) || 0;
    }
    if (cfg.startDate && cfg.endDate) return calculateDayByDayTotal(space, cfg.startDate, cfg.endDate, guests).total || 0;
    return 0;
}

function __orderResolveDisplayedBase(cfg, space) {
    if (!cfg || !space) return 0;
    return parseFloat((cfg?.__pricing?.base ?? __orderResolveBaseTotal(cfg, space, parseInt(cfg?.guests, 10) || 1)) || 0) || 0;
}
function __orderFormatSignedMoneyMx(value) {
    const amount = parseFloat(value || 0) || 0;
    if (Math.abs(amount) < 0.005) return __orderFormatMoneyMx(0);
    return `${amount < 0 ? '-' : '+'}${__orderFormatMoneyMx(Math.abs(amount))}`;
}
function __orderBuildPublicityDetailInfo(cfgLike = {}, space = null) {
    const detailInfo = __orderResolveDetailMaterialMeasure({
        material: cfgLike?.material || '',
        medida_ancho: cfgLike?.medidaAncho ?? cfgLike?.medida_ancho ?? null,
        medida_alto: cfgLike?.medidaAlto ?? cfgLike?.medida_alto ?? null,
        medida_unidad: cfgLike?.medidaUnit || cfgLike?.medida_unidad || 'M'
    }, space || {});
    const detailLabel = __orderResolvePdfSpaceDetail({
        material: cfgLike?.material || '',
        medida_ancho: cfgLike?.medidaAncho ?? cfgLike?.medida_ancho ?? null,
        medida_alto: cfgLike?.medidaAlto ?? cfgLike?.medida_alto ?? null,
        medida_unidad: cfgLike?.medidaUnit || cfgLike?.medida_unidad || 'M'
    }, space || {});
    const hasWidth = detailInfo.medida_ancho !== null && detailInfo.medida_ancho !== undefined;
    const hasHeight = detailInfo.medida_alto !== null && detailInfo.medida_alto !== undefined;
    const measureLabel = (hasWidth && hasHeight)
        ? `${detailInfo.medida_ancho} x ${detailInfo.medida_alto} ${detailInfo.medida_unidad || 'M'}`
        : '--';
    return { detailLabel: detailLabel || '--', measureLabel, detailInfo };
}
function __orderDescribePublicityPricingRule(cfgLike = {}, space = null, baseOverride = undefined) {
    const catalogBase = Math.max(0, parseFloat(space?.precio_base || 0) || 0);
    const days = __orderRangeDays(cfgLike?.startDate || '', cfgLike?.endDate || cfgLike?.startDate || '');
    const manualValue = Math.max(0, parseFloat(cfgLike?.customBasePrice || 0) || 0);
    const resultBase = Math.max(0, parseFloat(baseOverride ?? __orderResolveDisplayedBase(cfgLike, space || {})) || 0);
    if (cfgLike?.convenioEnabled) {
        return {
            modeLabel: 'Convenio',
            detailRows: [
                { label: 'Bloqueo del espacio', value: 'Indefinido' },
                { label: 'Tratos de convenio', value: `${__orderGetConvenioConcepts(cfgLike).length} registrado(s)` }
            ],
            explanation: `El espacio queda bloqueado al precio base del catálogo: ${__orderFormatMoneyMx(resultBase)}.`
        };
    }
    if (cfgLike?.customPriceEnabled) {
        if (String(cfgLike?.customPriceMode || 'total') === 'per_day') {
            return {
                modeLabel: 'Precio personalizado por día',
                detailRows: [
                    { label: 'Precio manual por día', value: __orderFormatMoneyMx(manualValue) },
                    { label: 'Días seleccionados', value: `${days} día(s)` }
                ],
                explanation: `${__orderFormatMoneyMx(manualValue)} x ${days} día(s) = ${__orderFormatMoneyMx(resultBase)}`
            };
        }
        return {
            modeLabel: 'Precio personalizado total',
            detailRows: [
                { label: 'Total manual capturado', value: __orderFormatMoneyMx(manualValue) },
                { label: 'Días seleccionados', value: `${days} día(s)` }
            ],
            explanation: `Total manual capturado = ${__orderFormatMoneyMx(resultBase)}`
        };
    }
    if (cfgLike?.customPermanence) {
        if (days === 30) {
            return {
                modeLabel: 'Estancia personalizada',
                detailRows: [{ label: 'Días seleccionados', value: '30 día(s)' }],
                explanation: `30 día(s): se conserva ${__orderFormatMoneyMx(resultBase)}`
            };
        }
        return {
            modeLabel: 'Estancia personalizada prorrateada',
            detailRows: [
                { label: 'Días seleccionados', value: `${days} día(s)` },
                { label: 'Resultado prorrateado', value: __orderFormatMoneyMx(resultBase) }
            ],
            explanation: `${__orderFormatMoneyMx(catalogBase)} / ${days} día(s) = ${__orderFormatMoneyMx(resultBase)}`
        };
    }
    return {
        modeLabel: 'Periodo automático (30 días)',
        detailRows: [{ label: 'Días aplicados', value: '30 día(s)' }],
        explanation: `Periodo automático de 30 día(s) = ${__orderFormatMoneyMx(resultBase)}`
    };
}
async function __orderLoadConvenioCatalog() {
    cpOrderConvenioCatalog = [];
    try {
        const tenant = __orderResolveTenantSlug('casa_de_piedra');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', CP_ORDER_CONVENIOS_CFG_KEY);
        if (error) throw error;
        const row = __cpPickLatestRecord(Array.isArray(data) ? data : []);
        const cfg = __orderParseRecordJson(row?.valor_json);
        const rawItems = Array.isArray(cfg)
            ? cfg
            : (Array.isArray(cfg?.items) ? cfg.items : (Array.isArray(cfg?.convenios) ? cfg.convenios : []));
        cpOrderConvenioCatalog = rawItems
            .map((item) => ({
                id: String(item?.id || item?.clave || item?.slug || item?.nombre || '').trim(),
                nombre: __orderNormalizeConvenioName(item?.nombre || item?.name || item?.label || item?.descripcion || '')
            }))
            .filter((item) => item.id && item.nombre)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    } catch (e) {
        cpOrderConvenioCatalog = [];
        console.warn('No se pudo cargar el catálogo de convenios de CP:', e);
    }
}
function __orderSyncConvenioCatalogSelect() {
    const select = document.getElementById('oed-convenio-select');
    if (!select) return;
    const current = String(select.value || '').trim();
    select.innerHTML = '<option value="">Selecciona una opción...</option>' + cpOrderConvenioCatalog.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join('');
    if (current && cpOrderConvenioCatalog.some((item) => item.id === current)) select.value = current;
}
function __orderRenderConvenioItems() {
    const list = document.getElementById('oed-convenio-list');
    if (!list) return;
    const cfg = __orderGetActiveCfg();
    const items = __orderBuildConvenioPayloadItems(cfg);
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase()) || !cfg?.convenioEnabled;
    if (!items.length) {
        list.innerHTML = '<div class="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-4 text-[11px] font-bold text-amber-700/70">Aún no agregas tratos de convenio.</div>';
        return;
    }
    list.innerHTML = items.map((item, index) => `<div class="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <div class="min-w-0">
            <p class="text-xs font-black text-gray-800 truncate">${item.nombre}</p>
            <p class="text-[10px] font-bold uppercase tracking-wide text-amber-900/70">${item.cantidad_entrega} ${item.cantidad_entrega === 1 ? 'entrega' : 'entregas'} acordadas</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
            <span class="text-xs font-black text-gray-800">${__orderFormatMoneyMx(item.monto)}</span>
            ${locked ? '' : `<button type="button" onclick="window.removeOrderConvenioItem(${index})" class="w-8 h-8 rounded-full border border-amber-100 bg-white text-gray-400 transition hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`}
        </div>
    </div>`).join('');
}
function __orderSyncPublicidadCustomUi(cfg = __orderGetActiveCfg()) {
    const active = cfg || __orderGetActiveCfg();
    const isPublicidad = __orderIsPublicidadSpace(active);
    const controls = document.getElementById('oed-publicidad-controls');
    const wrap = document.getElementById('oed-custom-price-wrap');
    const modeSelect = document.getElementById('oed-space-custom-price-mode');
    const input = document.getElementById('oed-space-custom-price');
    const label = document.getElementById('oed-space-custom-price-label');
    const hint = document.getElementById('oed-space-custom-price-hint');
    const chkPerm = document.getElementById('oed-custom-permanence');
    const chkPrice = document.getElementById('oed-custom-price-enabled');
    if (controls) controls.classList.toggle('hidden', !isPublicidad);
    if (chkPerm) chkPerm.checked = !!active?.customPermanence;
    if (chkPrice) {
        chkPrice.checked = !!active?.customPriceEnabled && !active?.convenioEnabled;
        chkPrice.disabled = !!active?.convenioEnabled;
    }
    if (modeSelect) modeSelect.value = String(active?.customPriceMode || 'total');
    if (input) input.value = (active && active.customBasePrice !== '' && active.customBasePrice !== null && active.customBasePrice !== undefined) ? String(active.customBasePrice) : '';
    if (wrap) wrap.classList.toggle('hidden', !active?.customPriceEnabled || !!active?.convenioEnabled || !isPublicidad);
    const perDay = String(active?.customPriceMode || 'total') === 'per_day';
    if (label) label.textContent = perDay ? 'Precio Personalizado por Día' : 'Precio Personalizado del Espacio (antes de impuestos)';
    if (hint) hint.textContent = perDay ? 'Se multiplicará por el número de días disponibles en la fecha seleccionada.' : 'Define el total manual de la estancia seleccionada.';
}
function __orderSyncConvenioUi(cfg = __orderGetActiveCfg()) {
    const active = cfg || __orderGetActiveCfg();
    const activeSpace = __orderGetSpaceById(active?.spaceId);
    const allowsConvenio = __orderSpaceAllowsConvenio(activeSpace) || !!active?.convenioEnabled;
    const card = document.getElementById('oed-convenio-card');
    const chk = document.getElementById('oed-convenio-enabled');
    const section = document.getElementById('oed-convenio-section');
    if (!allowsConvenio && active && !active.convenioEnabled) {
        active.convenioEnabled = false;
        active.concepts = __orderSafeArray(active.concepts).map(__orderNormalizeExtraConcept).filter((concept) => !__orderIsConvenioConceptItem(concept));
    }
    if (card) card.classList.toggle('hidden', !allowsConvenio);
    if (chk) {
        chk.checked = !!active?.convenioEnabled;
        chk.disabled = !allowsConvenio;
    }
    if (section) section.classList.toggle('hidden', !active?.convenioEnabled || !allowsConvenio);
    __orderSyncConvenioCatalogSelect();
    __orderRenderConvenioItems();
    __orderSyncPublicidadCustomUi(active);
    __orderApplyDetailTabUi();
}

function __orderApplyDetailTabUi() {
    const isConvenio = __orderQuoteSpaces.some((cfg) => !!cfg?.convenioEnabled) || __orderIsConvenioOrder(currentPreviewOrder || {});
    const financialTabBtn = document.querySelector('[data-order-tab="financial"]');
    const financialPanel = document.querySelector('[data-order-panel="financial"]');
    const convenioSection = document.getElementById('oed-convenio-section');
    const financialHost = document.getElementById('oed-convenio-host-financial');
    const spacesHost = document.getElementById('oed-convenio-host-spaces');
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    if (financialTabBtn) financialTabBtn.classList.toggle('hidden', isConvenio);
    if (isConvenio && __orderDetailTab === 'financial') __orderDetailTab = 'spaces';
    document.querySelectorAll('[data-order-panel]').forEach((panel) => {
        const panelKey = panel.getAttribute('data-order-panel');
        panel.classList.toggle('hidden', panelKey !== __orderDetailTab || (isConvenio && panelKey === 'financial'));
    });
    document.querySelectorAll('.order-detail-tab-btn').forEach((btn) => {
        const active = btn.getAttribute('data-order-tab') === __orderDetailTab;
        btn.classList.remove('bg-white', 'text-brand-dark', 'hover:bg-white/15');
        btn.classList.toggle('bg-white/20', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('shadow-inner', active);
        btn.classList.toggle('bg-white/10', !active);
        btn.classList.toggle('text-white', true);
        btn.classList.toggle('hover:bg-white/20', !active);
    });
    if (financialPanel) financialPanel.classList.toggle('hidden', isConvenio || __orderDetailTab !== 'financial');
    if (convenioSection) {
        const targetHost = isConvenio ? (spacesHost || financialHost) : (financialHost || spacesHost);
        if (targetHost && convenioSection.parentElement !== targetHost) targetHost.appendChild(convenioSection);
    }
    setText('sum-general-title', isConvenio ? 'Resumen del Convenio' : 'Resumen General');
    setText('sum-general-copy', isConvenio ? 'Vista consolidada del convenio y su balance actual.' : 'Vista consolidada de la cotización completa.');
    setText('sum-label-name', isConvenio ? 'Convenio' : 'Cotización');
    setText('sum-financial-title', isConvenio ? 'Trato del Convenio' : 'Resumen Financiero');
    setText('sum-financial-copy', isConvenio ? 'Relación entre el valor del espacio y lo acordado a entregar.' : 'Concentrado total y desglose financiero por espacio.');
    setText('sum-spaces-title', isConvenio ? 'Espacios Comprometidos' : 'Detalle por Espacio');
    setText('sum-spaces-copy', isConvenio ? 'Consulta cada espacio bloqueado y los tratos capturados para el convenio.' : 'Consulta cada espacio y su relación con el resumen financiero.');
    setText('expediente-title', isConvenio ? 'Expediente del Convenio' : 'Expediente de la Cotización');
    setText('expediente-copy', isConvenio ? 'Consulta borradores, carta convenio aprobada y la evidencia fotográfica desde aquí.' : 'Consulta previews de documentos, snapshots guardados y genera archivos clave desde aquí.');
    __orderWriteDetailTab();
}

window.switchOrderDetailTab = function (tab) {
    __orderDetailTab = __ORDER_DETAIL_TABS.includes(String(tab || '')) ? String(tab) : 'client';
    __orderApplyDetailTabUi();
    __orderWriteDetailTab();
    if (__orderDetailTab === 'expediente') {
        __orderRenderExpedientePanel();
    }
};

const __orderExpedienteEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const __orderExpedienteMoney = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(parseFloat(value || 0) || 0);

function __orderClearExpedienteObjectUrls() {
    (__orderExpedienteObjectUrls || []).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { }
    });
    __orderExpedienteObjectUrls = [];
}

function __orderResolveDraftSnapshotMeta(record = {}) {
    const orderId = String(record?.id || document.getElementById('oed-id')?.value || currentPreviewOrder?.id || '').trim();
    const folio = __orderResolveQuoteFolio(record, orderId);
    const docMeta = __orderGetQuoteDocumentMeta(record);
    return {
        orderId,
        folio,
        path: orderId ? `${orderId}/${docMeta.draftStorageBase}_${folio}.pdf` : '',
        fileName: `${docMeta.draftFileBase}_${folio}.pdf`
    };
}

function __orderParsePaymentsForExpediente(order = {}) {
    if (Array.isArray(order.historial_pagos)) return order.historial_pagos.filter(Boolean);
    try {
        const parsed = JSON.parse(order.historial_pagos || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

async function __orderComposeExpedienteSourceOrder() {
    const orderId = String(document.getElementById('oed-id')?.value || currentPreviewOrder?.id || '').trim();
    let base = currentPreviewOrder ? { ...currentPreviewOrder } : null;
    if (!base && orderId) {
        const { data, error } = await __cpQuoteGetById(orderId);
        if (error || !data) throw (error || new Error('No se encontró la cotización.'));
        base = __orderHydrateQuotePricing(data);
    }
    if (!base) throw new Error('No se encontró la cotización.');
    if (!IS_ORDER_DETAIL_PAGE) {
        if (!base.numero_orden) base.numero_orden = __orderResolveQuoteFolio(base, orderId || base.id);
        return base;
    }
    const formData = window.getFormDataFromModal();
    const merged = {
        ...base,
        ...formData,
        id: orderId || base.id,
        status: String(document.getElementById('oed-status')?.value || base.status || 'pendiente'),
        nombre_cotizacion: formData.nombre_cotizacion || base.nombre_cotizacion || base.detalles_evento?.nombre_cotizacion || ''
    };
    if (!merged.numero_orden) merged.numero_orden = __orderResolveQuoteFolio(merged, merged.id);
    return merged;
}

async function __orderEnsureOrderRecord(id) {
    const orderId = String(id || currentPreviewOrder?.id || '').trim();
    if (!orderId) return null;
    let order = allOrders.find((item) => String(item?.id || '') === orderId) || null;
    if (!order && currentPreviewOrder && String(currentPreviewOrder.id || '') === orderId) {
        order = { ...currentPreviewOrder };
    }
    if (order) return order;
    const { data, error } = await __cpQuoteGetById(orderId);
    if (error || !data) return null;
    order = __orderHydrateQuotePricing(data);
    if (!allOrders.some((item) => String(item?.id || '') === orderId)) allOrders.push(order);
    return order;
}

async function __orderCreateSignedStorageUrl(path) {
    const safePath = String(path || '').trim();
    if (!safePath) return '';
    try {
        const { data, error } = await window.globalPocketBase.storage.from('documentos-cp').createSignedUrl(safePath, 3600);
        if (error || !data?.signedUrl) return '';
        return data.signedUrl;
    } catch (_) {
        return '';
    }
}

function __orderExpedienteMetaTable(rows = []) {
    return `<div class="divide-y divide-gray-100 border-b border-gray-200 bg-white text-xs">${__orderSafeArray(rows).map((row) => `
        <div class="flex items-center justify-between gap-3 px-5 py-3">
            <span class="font-bold text-gray-400">${__orderExpedienteEscape(row.label || '')}</span>
            <span class="font-bold text-right text-gray-800 max-w-[65%] break-words">${__orderExpedienteEscape(row.value || '--')}</span>
        </div>`).join('')}
    </div>`;
}

function __orderExpedienteActionButton(action = {}) {
    const tone = action.tone || 'slate';
    const toneClass = tone === 'brand'
        ? 'bg-brand-red text-white hover:bg-red-700'
        : tone === 'emerald'
            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
            : tone === 'purple'
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50';
    return `<button type="button" onclick="${__orderExpedienteEscape(action.onclick || '')}" class="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${toneClass}">
        <i class="${action.icon || 'fa-solid fa-file'}"></i>
        <span>${__orderExpedienteEscape(action.label || 'Acción')}</span>
    </button>`;
}

function __orderExpedientePreviewSrc(src) {
    const cleanSrc = String(src || '').trim();
    if (!cleanSrc) return '';
    return `${cleanSrc}${cleanSrc.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
}

let __cpPreviewModalSuppressCloseSnapshot = false;

function __cpSetPreviewHeaderTitle(title = 'Vista Previa') {
    const orderNum = document.getElementById('prev-order-num');
    if (orderNum) orderNum.innerText = String(title || 'Vista Previa').toUpperCase();
}

function __cpConfigurePreviewActionButton(config = {}) {
    const btn = document.getElementById('btn-download-preview');
    if (!btn) return;
    const label = String(config.label || 'Descargar');
    const icon = String(config.icon || 'fa-solid fa-download');
    const className = String(config.className || 'bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2');
    btn.disabled = false;
    btn.className = className;
    btn.innerHTML = `<i class="${icon}"></i> <span class="hidden sm:inline">${label}</span>`;
    btn.onclick = typeof config.onClick === 'function' ? config.onClick : (() => { });
}

function __cpResetPreviewSurface() {
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    if (pdfContainer) {
        pdfContainer.innerHTML = '';
        pdfContainer.classList.add('hidden');
    }
    if (embedViewer) {
        embedViewer.classList.add('hidden');
        embedViewer.removeAttribute('src');
    }
}

window.downloadCpExpedientePreview = async function (src, title = 'Documento') {
    const safeSrc = String(src || '').trim();
    const safeTitle = String(title || 'Documento').trim() || 'Documento';
    if (!safeSrc) return window.showToast('Documento no disponible', 'error');
    try {
        const response = await fetch(safeSrc, { method: 'GET', credentials: 'omit' });
        if (!response.ok) throw new Error(`No se pudo abrir el documento (${response.status}).`);
        const blob = await response.blob();
        if (!blob || !blob.size) throw new Error('Documento vacío.');
        const fileName = `${safeTitle.replace(/[\\/:*?"<>|]+/g, '_') || 'Documento'}.pdf`;
        __orderDownloadBlob(blob, fileName);
    } catch (e) {
        window.showToast(`No se pudo descargar el documento: ${e?.message || e}`, 'error');
    }
};
window.openCpExpedientePreview = async function (src, title = 'Documento') {
    const safeSrc = String(src || '').trim();
    const safeTitle = String(title || 'Documento').trim() || 'Documento';
    if (!safeSrc) return window.showToast('Documento no disponible', 'error');
    __cpPreviewModalSuppressCloseSnapshot = true;
    __cpResetPreviewSurface();
    __cpSetPdfEditLocked(true);
    const embedViewer = document.getElementById('doc-preview');
    if (embedViewer) {
        embedViewer.src = __orderExpedientePreviewSrc(safeSrc);
        embedViewer.classList.remove('hidden');
    }
    __cpSetPreviewHeaderTitle(safeTitle);
    __cpConfigurePreviewActionButton({
        label: 'Descargar',
        icon: 'fa-solid fa-download',
        onClick: () => window.downloadCpExpedientePreview(safeSrc, safeTitle)
    });
    window.openModal('preview-modal');
};
window.openCpExpedienteLivePreview = async function (docType = 'quote', title = 'Vista Previa') {
    const safeDocType = String(docType || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
    const safeTitle = String(title || 'Vista Previa').trim() || 'Vista Previa';
    try {
        await __cpEnsurePdfStyleProfile(safeDocType, { forceReload: !__cpIsAdminProfile() });
        const order = await __orderComposeExpedienteSourceOrder();
        currentPreviewOrder = { ...order, docType: safeDocType };
        const content = window.getOrderHTML(order, safeDocType);
        const pdfContainer = document.getElementById('pdf-content');
        __cpResetPreviewSurface();
        if (pdfContainer) {
            pdfContainer.innerHTML = content;
            pdfContainer.classList.remove('hidden');
        }
        __cpPreviewModalSuppressCloseSnapshot = false;
        __cpSetPdfEditLocked(false);
        __cpApplyPdfStyleToLivePreview();
        __cpSetPreviewHeaderTitle(safeTitle);
        __cpConfigurePreviewActionButton({
            label: 'Descargar',
            icon: 'fa-solid fa-download',
            onClick: window.downloadPDFFromPreview
        });
        window.openModal('preview-modal');
    } catch (e) {
        window.showToast(`No se pudo abrir la vista previa: ${e?.message || e}`, 'error');
    }
};

function __orderRenderExpedienteCard(doc = {}) {
    const badgeTone = doc.badgeTone === 'emerald'
        ? 'bg-emerald-100 text-emerald-700'
        : doc.badgeTone === 'purple'
            ? 'bg-purple-100 text-purple-700'
            : doc.badgeTone === 'amber'
                ? 'bg-amber-100 text-amber-700'
                : doc.badgeTone === 'red'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-600';
    let previewHtml = '<div class="order-doc-preview-wrap border-t border-gray-200 bg-white flex items-center justify-center px-5 text-sm font-bold text-gray-400">Vista no disponible.</div>';
    if (doc.previewType === 'iframe' && doc.previewSrc) {
        previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-white overflow-hidden"><iframe loading="lazy" src="${__orderExpedienteEscape(__orderExpedientePreviewSrc(doc.previewSrc))}" class="order-doc-preview-frame" title="${__orderExpedienteEscape(doc.title || 'Documento')}"></iframe></div>`;
    } else if (doc.previewType === 'message') {
        previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-white flex items-center justify-center px-5 text-center text-sm font-bold text-gray-400">${__orderExpedienteEscape(doc.previewMessage || 'Vista no disponible.')}</div>`;
    }
    return `<article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-w-0">
        <div class="px-5 py-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
                <h4 class="font-black text-sm uppercase text-gray-800">${__orderExpedienteEscape(doc.title || 'Documento')}</h4>
                <p class="text-[11px] text-gray-500 mt-1">${__orderExpedienteEscape(doc.description || '')}</p>
            </div>
            <span class="shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${badgeTone}">${__orderExpedienteEscape(doc.badge || 'Documento')}</span>
        </div>
        ${__orderExpedienteMetaTable(doc.metaRows)}
        ${previewHtml}
        <div class="px-5 py-4 border-t border-gray-200 flex flex-wrap gap-2 bg-white">
            ${__orderSafeArray(doc.actions).map(__orderExpedienteActionButton).join('') || '<span class="text-[11px] font-bold text-gray-400">Sin acciones disponibles.</span>'}
        </div>
    </article>`;
}

async function __orderBuildDocumentBlob(docType, orderOverride = null) {
    const safeDocType = String(docType || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
    const order = orderOverride || await __orderComposeExpedienteSourceOrder();
    const pdfContainer = document.getElementById('pdf-content');
    if (!pdfContainer) throw new Error('No se encontró contenedor PDF.');
    const prevHtml = pdfContainer.innerHTML;
    const wasHidden = pdfContainer.classList.contains('hidden');
    try {
        await __cpEnsurePdfStyleProfile(safeDocType, { forceReload: !__cpIsAdminProfile() });
        pdfContainer.innerHTML = await window.getOrderHTML(order, safeDocType);
        pdfContainer.classList.remove('hidden');
        __cpApplyPdfStyleToLivePreview({ skipEditorUiRefresh: true });
        const blob = await __orderRenderPdfBlob(pdfContainer, `${safeDocType}_${order.id || 'preview'}.pdf`);
        return { blob, order };
    } finally {
        pdfContainer.innerHTML = prevHtml;
        pdfContainer.classList.toggle('hidden', wasHidden);
    }
}

async function __orderBuildPreviewObjectUrl(docType, orderOverride = null) {
    const { blob } = await __orderBuildDocumentBlob(docType, orderOverride);
    const objectUrl = URL.createObjectURL(blob);
    __orderExpedienteObjectUrls.push(objectUrl);
    return objectUrl;
}

window.currentCpExpedienteView = window.currentCpExpedienteView || "main";
window.currentCpExpedientePayload = window.currentCpExpedientePayload || null;

window.setCpExpedienteView = async function (view, payload = null) {
    window.currentCpExpedienteView = view;
    window.currentCpExpedientePayload = payload;
    await window.__orderRenderExpedientePanel();
};

window.togglePaymentsSection = () => {
    window.setCpExpedienteView("pagos", { page: 1 });
};

const __orderRevokeEvidenceUploadUrls = () => {
    (__cpEvidenceUploadObjectUrls || []).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { }
    });
    __cpEvidenceUploadObjectUrls = [];
};

const __orderEnsureEvidenceModals = () => {
    if (!document.getElementById('cp-evidence-upload-modal')) {
        const uploadModal = document.createElement('div');
        uploadModal.id = 'cp-evidence-upload-modal';
        uploadModal.className = 'fixed inset-0 z-[205] hidden items-center justify-center bg-black/80 p-4 backdrop-blur-sm';
        uploadModal.innerHTML = `<div class="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
                <div>
                    <h3 class="text-sm font-black uppercase tracking-wide text-gray-800">Finalizar Convenio</h3>
                    <p class="text-[11px] text-gray-500">Sube de 3 a 5 fotografías o evidencias para cerrar la cotización.</p>
                </div>
                <button type="button" onclick="window.closeCpEvidenceUploadModal()" class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="space-y-4 p-5">
                <input id="cp-evidence-order-id" type="hidden">
                <div class="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wide text-amber-800">Evidencia obligatoria</p>
                        <p class="mt-1 text-[11px] font-semibold text-amber-900/80">Solo se aceptan imágenes. El convenio se marcará como finalizado al completar la carga.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="cp-evidence-input" type="file" accept="image/*" multiple class="hidden" onchange="window.handleCpEvidenceSelection(event)">
                        <button type="button" onclick="document.getElementById('cp-evidence-input')?.click()" class="rounded-full bg-amber-500 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-amber-600">
                            <i class="fa-solid fa-upload mr-1"></i>Seleccionar
                        </button>
                    </div>
                </div>
                <div id="cp-evidence-upload-summary" class="text-[11px] font-bold text-gray-500">Aún no seleccionas evidencias.</div>
                <div id="cp-evidence-upload-grid" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"></div>
            </div>
            <div class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onclick="window.closeCpEvidenceUploadModal()" class="rounded-full border border-gray-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:bg-gray-50">Cancelar</button>
                <button id="cp-evidence-upload-confirm" type="button" onclick="window.submitCpEvidenceUpload()" class="rounded-full bg-brand-red px-5 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-red-700">
                    <i class="fa-solid fa-camera mr-1"></i>Finalizar Cotización
                </button>
            </div>
        </div>`;
        uploadModal.addEventListener('click', (event) => {
            if (event.target === uploadModal) window.closeCpEvidenceUploadModal();
        });
        document.body.appendChild(uploadModal);
    }
    if (!document.getElementById('cp-evidence-gallery-modal')) {
        const galleryModal = document.createElement('div');
        galleryModal.id = 'cp-evidence-gallery-modal';
        galleryModal.className = 'fixed inset-0 z-[206] hidden items-center justify-center bg-black/90 p-4';
        galleryModal.innerHTML = `<div class="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div class="flex items-center justify-between gap-3 bg-gray-900 px-5 py-4 text-white">
                <div>
                    <h3 class="text-sm font-black uppercase tracking-wide">Galería de Evidencias</h3>
                    <p id="cp-evidence-gallery-counter" class="text-[11px] text-gray-300">0 / 0</p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="window.downloadCurrentCpEvidence()" class="rounded-full bg-brand-red px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-red-700"><i class="fa-solid fa-download mr-1"></i>Descargar</button>
                    <button type="button" onclick="window.closeCpEvidenceGallery()" class="rounded-full border border-white/20 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-white/10">Cerrar</button>
                </div>
            </div>
            <div class="relative flex min-h-0 flex-1 items-center justify-center bg-gray-950">
                <button type="button" onclick="window.prevCpEvidence()" class="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"><i class="fa-solid fa-chevron-left"></i></button>
                <img id="cp-evidence-gallery-image" alt="Evidencia" class="max-h-full max-w-full object-contain">
                <button type="button" onclick="window.nextCpEvidence()" class="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
            <div class="border-t border-gray-200 bg-white px-5 py-4">
                <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p id="cp-evidence-gallery-title" class="text-sm font-black text-gray-800">Evidencia</p>
                        <p id="cp-evidence-gallery-meta" class="text-[11px] text-gray-500">Sin información.</p>
                    </div>
                </div>
                <div id="cp-evidence-gallery-thumbs" class="mt-4 flex gap-3 overflow-x-auto pb-1"></div>
            </div>
        </div>`;
        galleryModal.addEventListener('click', (event) => {
            if (event.target === galleryModal) window.closeCpEvidenceGallery();
        });
        document.body.appendChild(galleryModal);
    }
};

const __orderRenderEvidenceSelection = () => {
    __orderEnsureEvidenceModals();
    __orderRevokeEvidenceUploadUrls();
    const input = document.getElementById('cp-evidence-input');
    const summary = document.getElementById('cp-evidence-upload-summary');
    const grid = document.getElementById('cp-evidence-upload-grid');
    const files = Array.from(input?.files || []);
    if (summary) {
        summary.textContent = files.length
            ? `${files.length} archivo(s) seleccionado(s). Debes cargar entre 3 y 5 evidencias.`
            : 'Aún no seleccionas evidencias.';
        summary.className = `text-[11px] font-bold ${files.length >= 3 && files.length <= 5 ? 'text-emerald-600' : 'text-gray-500'}`;
    }
    if (!grid) return;
    if (!files.length) {
        grid.innerHTML = '<div class="col-span-full rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-gray-400">Aquí verás la vista previa de las evidencias seleccionadas.</div>';
        return;
    }
    grid.innerHTML = files.map((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        __cpEvidenceUploadObjectUrls.push(objectUrl);
        return `<div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div class="aspect-[4/3] overflow-hidden bg-slate-100"><img src="${objectUrl}" alt="Evidencia ${index + 1}" class="h-full w-full object-cover"></div>
            <div class="space-y-1 px-4 py-3">
                <p class="truncate text-xs font-black text-gray-800">Evidencia ${index + 1}</p>
                <p class="truncate text-[11px] text-gray-500">${file.name}</p>
                <p class="text-[10px] font-bold uppercase tracking-wide text-gray-400">${Math.max(1, Math.round((file.size || 0) / 1024))} KB</p>
            </div>
        </div>`;
    }).join('');
};

window.handleCpEvidenceSelection = function () {
    __orderRenderEvidenceSelection();
};

window.closeCpEvidenceUploadModal = function () {
    const input = document.getElementById('cp-evidence-input');
    const orderField = document.getElementById('cp-evidence-order-id');
    if (input) input.value = '';
    if (orderField) orderField.value = '';
    __orderRevokeEvidenceUploadUrls();
    const grid = document.getElementById('cp-evidence-upload-grid');
    const summary = document.getElementById('cp-evidence-upload-summary');
    if (grid) grid.innerHTML = '';
    if (summary) {
        summary.textContent = 'Aún no seleccionas evidencias.';
        summary.className = 'text-[11px] font-bold text-gray-500';
    }
    window.closeModal?.('cp-evidence-upload-modal');
};

window.openCpEvidenceUploadModal = async function (orderId) {
    __orderEnsureEvidenceModals();
    const safeOrderId = String(orderId || currentPreviewOrder?.id || '').trim();
    if (!safeOrderId) return window.showToast('No se encontró la cotización.', 'error');
    const order = await __orderEnsureOrderRecord(safeOrderId);
    if (!order) return window.showToast('No se encontró la cotización.', 'error');
    if (!__orderIsConvenioOrder(order)) return window.showToast('Esta cotización no usa convenio.', 'error');
    if (String(order.status || '').toLowerCase() === 'finalizada') return window.showToast('La cotización ya está finalizada.', 'info');
    const orderField = document.getElementById('cp-evidence-order-id');
    if (orderField) orderField.value = safeOrderId;
    __orderRenderEvidenceSelection();
    window.openModal?.('cp-evidence-upload-modal');
};

window.submitCpEvidenceUpload = async function () {
    __orderEnsureEvidenceModals();
    const btn = document.getElementById('cp-evidence-upload-confirm');
    const orderId = String(document.getElementById('cp-evidence-order-id')?.value || currentPreviewOrder?.id || '').trim();
    const input = document.getElementById('cp-evidence-input');
    const files = Array.from(input?.files || []);
    if (!orderId) return window.showToast('Cotización inválida.', 'error');
    if (files.length < 3 || files.length > 5) return window.showToast('Debes subir entre 3 y 5 evidencias.', 'error');
    if (files.some((file) => !String(file.type || '').startsWith('image/'))) return window.showToast('Solo se permiten imágenes como evidencia.', 'error');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Subiendo...'; }
    try {
        const order = await __orderEnsureOrderRecord(orderId);
        if (!order) throw new Error('No se encontró la cotización.');
        const convenioMeta = __orderParseConvenioMeta(order);
        if (!convenioMeta.activo && !__orderIsConvenioOrder(order)) throw new Error('La cotización no está marcada como convenio.');
        const stamp = Date.now();
        const uploadedAt = new Date().toISOString();
        const evidenceItems = [];
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const cleanName = String(file?.name || `evidencia_${index + 1}.jpg`).replace(/[^a-z0-9._-]+/gi, '_');
            const path = `${orderId}/evidencias/${stamp}_${index + 1}_${cleanName}`;
            const { error: uploadError } = await window.globalPocketBase.storage.from('documentos-cp').upload(path, file);
            if (uploadError) throw uploadError;
            evidenceItems.push({
                id: `evidence_${stamp}_${index + 1}`,
                path,
                file_name: cleanName,
                uploaded_at: uploadedAt,
                mime_type: file.type || 'image/jpeg',
                size: file.size || 0
            });
        }
        const detailsEvent = __orderParseRecordJson(order.detalles_evento);
        const payload = {
            status: 'finalizada',
            detalles_evento: {
                ...detailsEvent,
                convenio: {
                    ...convenioMeta,
                    activo: true,
                    bloqueo_indefinido: __orderBlocksIndefinitely(order),
                    requiere_evidencia: true,
                    evidencia_minima: 3,
                    evidencia_maxima: 5,
                    requiere_factura: false,
                    requiere_recibo: false,
                    requiere_contrato: false,
                    evidencias: evidenceItems
                }
            }
        };
        const { error } = await __cpQuotesUpdate(orderId, payload);
        if (error) throw error;
        currentPreviewOrder = currentPreviewOrder && String(currentPreviewOrder.id || '') === orderId
            ? { ...currentPreviewOrder, ...payload }
            : currentPreviewOrder;
        const statusSelect = document.getElementById('oed-status');
        if (statusSelect) statusSelect.value = 'finalizada';
        if (typeof __orderApplyStatusVisual === 'function') __orderApplyStatusVisual();
        allOrders = (allOrders || []).map((item) => String(item?.id || '') === orderId ? { ...item, ...payload } : item);
        signalOrdersRefresh('convenio_evidence');
        window.showToast('Convenio finalizado con evidencias.', 'success');
        window.closeCpEvidenceUploadModal();
        if (__orderDetailTab === 'expediente') await __orderRenderExpedientePanel();
        if (!(IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode() || IS_ORDER_DETAIL_PAGE)) await window.loadOrders();
    } catch (e) {
        window.showToast(`No se pudieron guardar las evidencias: ${e?.message || e}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-camera mr-1"></i>Finalizar Cotización'; }
    }
};

window.closeCpEvidenceGallery = function () {
    __cpEvidenceGalleryItems = [];
    __cpEvidenceGalleryIndex = 0;
    const img = document.getElementById('cp-evidence-gallery-image');
    const title = document.getElementById('cp-evidence-gallery-title');
    const meta = document.getElementById('cp-evidence-gallery-meta');
    const thumbs = document.getElementById('cp-evidence-gallery-thumbs');
    const counter = document.getElementById('cp-evidence-gallery-counter');
    if (img) img.removeAttribute('src');
    if (title) title.textContent = 'Evidencia';
    if (meta) meta.textContent = 'Sin información.';
    if (thumbs) thumbs.innerHTML = '';
    if (counter) counter.textContent = '0 / 0';
    window.closeModal?.('cp-evidence-gallery-modal');
};

const __orderRenderEvidenceGallery = () => {
    __orderEnsureEvidenceModals();
    const items = __cpEvidenceGalleryItems || [];
    if (!items.length) return;
    __cpEvidenceGalleryIndex = Math.max(0, Math.min(__cpEvidenceGalleryIndex, items.length - 1));
    const item = items[__cpEvidenceGalleryIndex];
    const img = document.getElementById('cp-evidence-gallery-image');
    const title = document.getElementById('cp-evidence-gallery-title');
    const meta = document.getElementById('cp-evidence-gallery-meta');
    const thumbs = document.getElementById('cp-evidence-gallery-thumbs');
    const counter = document.getElementById('cp-evidence-gallery-counter');
    if (img) img.src = item.signedUrl || '';
    if (title) title.textContent = item.label || `Evidencia ${__cpEvidenceGalleryIndex + 1}`;
    if (meta) meta.textContent = `${item.file_name || 'archivo'}${item.uploaded_at ? ` • ${window.safeFormatDate(String(item.uploaded_at).slice(0, 10))}` : ''}`;
    if (counter) counter.textContent = `${__cpEvidenceGalleryIndex + 1} / ${items.length}`;
    if (thumbs) {
        thumbs.innerHTML = items.map((entry, index) => `<button type="button" onclick="window.selectCpEvidence(${index})" class="overflow-hidden rounded-xl border ${index === __cpEvidenceGalleryIndex ? 'border-brand-red ring-2 ring-brand-red/20' : 'border-gray-200'} bg-white">
            <img src="${__orderExpedienteEscape(entry.signedUrl || '')}" alt="${__orderExpedienteEscape(entry.label || `Evidencia ${index + 1}`)}" class="h-20 w-24 object-cover">
        </button>`).join('');
    }
};

window.selectCpEvidence = function (index) {
    if (!__cpEvidenceGalleryItems.length) return;
    __cpEvidenceGalleryIndex = Math.max(0, Math.min(parseInt(index, 10) || 0, __cpEvidenceGalleryItems.length - 1));
    __orderRenderEvidenceGallery();
};

window.prevCpEvidence = function () {
    if (!__cpEvidenceGalleryItems.length) return;
    __cpEvidenceGalleryIndex = (__cpEvidenceGalleryIndex - 1 + __cpEvidenceGalleryItems.length) % __cpEvidenceGalleryItems.length;
    __orderRenderEvidenceGallery();
};

window.nextCpEvidence = function () {
    if (!__cpEvidenceGalleryItems.length) return;
    __cpEvidenceGalleryIndex = (__cpEvidenceGalleryIndex + 1) % __cpEvidenceGalleryItems.length;
    __orderRenderEvidenceGallery();
};

window.downloadCpEvidenceFile = async function (path, fileName = 'evidencia.jpg') {
    const signed = await __orderCreateSignedStorageUrl(path);
    if (!signed) return window.showToast('No se pudo preparar la evidencia.', 'error');
    try {
        const response = await fetch(signed, { method: 'GET', credentials: 'omit' });
        if (!response.ok) throw new Error(`No se pudo descargar la evidencia (${response.status}).`);
        const blob = await response.blob();
        if (typeof window.downloadBlobAsFile === 'function') {
            window.downloadBlobAsFile(blob, fileName);
        } else {
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        }
    } catch (e) {
        window.showToast(`No se pudo descargar la evidencia: ${e?.message || e}`, 'error');
    }
};

window.downloadCurrentCpEvidence = async function () {
    const item = __cpEvidenceGalleryItems[__cpEvidenceGalleryIndex];
    if (!item) return;
    await window.downloadCpEvidenceFile(item.path, item.file_name || `evidencia_${__cpEvidenceGalleryIndex + 1}.jpg`);
};

window.openCpEvidenceGallery = async function (orderId, startIndex = 0) {
    __orderEnsureEvidenceModals();
    const safeOrderId = String(orderId || currentPreviewOrder?.id || '').trim();
    if (!safeOrderId) return window.showToast('No se encontró la cotización.', 'error');
    const order = await __orderEnsureOrderRecord(safeOrderId);
    if (!order) return window.showToast('No se encontró la cotización.', 'error');
    const evidences = __orderGetConvenioEvidence(order);
    if (!evidences.length) return window.showToast('Aún no hay evidencias registradas.', 'info');
    const items = await Promise.all(evidences.map(async (item, index) => ({
        ...item,
        label: `Evidencia ${index + 1}`,
        signedUrl: await __orderCreateSignedStorageUrl(item.path)
    })));
    __cpEvidenceGalleryItems = items.filter((item) => !!item.signedUrl);
    if (!__cpEvidenceGalleryItems.length) return window.showToast('No se pudieron cargar las evidencias.', 'error');
    __cpEvidenceGalleryIndex = Math.max(0, Math.min(parseInt(startIndex, 10) || 0, __cpEvidenceGalleryItems.length - 1));
    __orderRenderEvidenceGallery();
    window.openModal?.('cp-evidence-gallery-modal');
};

window.__orderRenderExpedientePanel = async function () {
    const grid = document.getElementById('oed-expediente-grid');
    if (!grid) return;
    const renderSeq = ++__orderExpedienteRenderSeq;
    grid.innerHTML = '<div class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-sm font-bold text-gray-400">Construyendo expediente...</div>';
    __orderClearExpedienteObjectUrls();
    try {
        const order = await __orderComposeExpedienteSourceOrder();
        if (renderSeq !== __orderExpedienteRenderSeq) return;

        // Actualizar hora de aprobación
        const timeEl = document.getElementById("approval-time");
        const approvedStatus = ['aprobada', 'finalizada'].includes(String(order.status || '').toLowerCase());
        if (timeEl) {
            if (approvedStatus && order.fecha_aprobacion) {
                timeEl.textContent = new Date(order.fecha_aprobacion).toLocaleString();
            } else if (approvedStatus && order.updated) {
                timeEl.textContent = new Date(order.updated).toLocaleString();
            } else {
                timeEl.textContent = "--:--";
            }
        }

        // Configurar botones superiores
        const btnContainer = document.getElementById("expediente-buttons");
        if (btnContainer) btnContainer.classList.remove("hidden");
        const subButtons = document.getElementById("payments-sub-buttons");
        if (subButtons) {
            subButtons.innerHTML = "";
            subButtons.classList.add("hidden");
        }
        const isConvenio = __orderIsConvenioOrder(order);
        const convenioMeta = __orderParseConvenioMeta(order);
        const convenioEvidence = __orderGetConvenioEvidence(order);
        const evidenceButtonsWrap = document.getElementById("expediente-evidence-buttons");
        const paymentsToggleBtn = document.getElementById("btn-pagos-toggle");
        const facturaBtn = document.getElementById("btn-factura");
        const contratoBtn = document.getElementById("btn-contrato");
        if (paymentsToggleBtn) paymentsToggleBtn.classList.toggle("hidden", isConvenio);
        if (facturaBtn) facturaBtn.classList.toggle("hidden", isConvenio);
        if (contratoBtn) contratoBtn.classList.toggle("hidden", isConvenio);
        if (evidenceButtonsWrap) {
            const toolbarButtons = [];
            if (isConvenio && String(order.status || "").toLowerCase() === "aprobada" && convenioEvidence.length < 3) {
                toolbarButtons.push(`<button type="button" onclick="window.openCpEvidenceUploadModal('${order.id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg transition flex items-center gap-2"><i class="fa-solid fa-camera"></i> Finalizar con Evidencia</button>`);
            }
            convenioEvidence.forEach((item, index) => {
                toolbarButtons.push(`<button type="button" onclick="window.openCpEvidenceGallery('${order.id}', ${index})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 px-4 py-2 rounded-xl font-bold text-sm uppercase tracking-wide transition flex items-center gap-2"><i class="fa-solid fa-image"></i> Evidencia ${index + 1}</button>`);
            });
            evidenceButtonsWrap.innerHTML = toolbarButtons.join("");
            evidenceButtonsWrap.classList.toggle("hidden", !toolbarButtons.length);
        }
        const details = parseSpacesDetail(order.espacios_detalle);
        const docMeta = __orderGetQuoteDocumentMeta(order);
        const spacesCount = details.length || (order.espacio_id ? 1 : 0);
        const totalNet = __orderExpedienteMoney(order.precio_final || __orderTotals?.final || 0);
        const draftMeta = __orderResolveDraftSnapshotMeta(order);
        const draftSnapshotUrl = draftMeta.path ? await __orderCreateSignedStorageUrl(draftMeta.path) : '';
        const draftPreviewSrc = draftSnapshotUrl || await __orderBuildPreviewObjectUrl('quote', order);
        const draftPreviewTitle = docMeta.isConvenio ? 'Convenio' : docMeta.draftTitle;
        const docs = [];

        const extractTs = (path, fallback) => {
            if (typeof path === "string") {
                const match = path.match(/(1[6-9]\d{11})/);
                if (match) return new Date(parseInt(match[1])).toLocaleString();
            }
            return fallback ? new Date(fallback).toLocaleString() : "--";
        };

        if (window.currentCpExpedienteView === "main") {
            docs.push({
                title: docMeta.draftTitle,
                description: draftSnapshotUrl ? 'Documento archivado actualmente en el expediente.' : 'Vista previa viva del documento actual editable.',
                badge: draftSnapshotUrl ? 'Archivado' : 'Editable',
                badgeTone: draftSnapshotUrl ? 'emerald' : 'amber',
                metaRows: [
                    { label: 'Generada', value: order.created ? new Date(order.created).toLocaleString() : '--' },
                    { label: 'Folio', value: draftMeta.folio || '--' },
                    { label: 'Estado', value: String(order.status || 'pendiente').toUpperCase() },
                    { label: 'Espacios', value: String(spacesCount || 0) },
                    { label: 'Total Neto', value: totalNet },
                    { label: 'Snapshot', value: draftSnapshotUrl ? 'Guardada' : 'Pendiente' }
                ],
                previewType: 'iframe',
                previewSrc: draftPreviewSrc,
                actions: [
                    { label: 'Vista Completa', icon: 'fa-solid fa-expand', tone: 'slate', onclick: `window.openCpExpedienteLivePreview("quote", ${JSON.stringify(draftPreviewTitle)})` },
                    ...(draftSnapshotUrl ? [{ label: 'Abrir Archivada', icon: 'fa-solid fa-folder-open', tone: 'emerald', onclick: `window.openCpExpedientePreview(${JSON.stringify(draftPreviewSrc)}, ${JSON.stringify(draftPreviewTitle)})` }] : [])
                ]
            });

            if (order.url_cotizacion_final) {
                const approvedUrl = await __orderCreateSignedStorageUrl(order.url_cotizacion_final);
                docs.push({
                    title: docMeta.approvedTitle,
                    description: 'Snapshot oficial almacenada en el expediente.',
                    badge: 'Oficial',
                    badgeTone: 'emerald',
                    metaRows: [
                        { label: 'Aprobada', value: order.fecha_aprobacion ? new Date(order.fecha_aprobacion).toLocaleString() : (order.updated ? new Date(order.updated).toLocaleString() : '--') },
                        { label: 'Folio', value: draftMeta.folio || '--' },
                        { label: 'Estado', value: String(order.status || 'aprobada').toUpperCase() },
                        { label: 'Archivo', value: order.url_cotizacion_final.split('/').pop() || `${docMeta.approvedStorageBase}.pdf` },
                        { label: 'Total Neto', value: totalNet }
                    ],
                    previewType: approvedUrl ? 'iframe' : 'message',
                    previewSrc: approvedUrl,
                    previewMessage: 'No se pudo generar la vista firmada del archivo aprobado.',
                    actions: [
                        { label: 'Abrir Documento', icon: 'fa-solid fa-folder-open', tone: 'emerald', onclick: approvedUrl ? `window.openCpExpedientePreview(${JSON.stringify(approvedUrl)}, ${JSON.stringify(docMeta.approvedTitle)})` : `window.openStoredDocument(${JSON.stringify(order.url_cotizacion_final)})` }
                    ]
                });
            }

            if (!isConvenio && order.url_orden_compra) {
                const ocUrl = await __orderCreateSignedStorageUrl(order.url_orden_compra);
                docs.push({
                    title: 'Orden de Compra',
                    description: 'Orden archivada en storage y vinculada a la cotización.',
                    badge: 'Archivada',
                    badgeTone: 'purple',
                    metaRows: [
                        { label: 'Subida el', value: extractTs(order.url_orden_compra, order.fecha_aprobacion || order.updated) },
                        { label: 'Folio', value: draftMeta.folio || '--' },
                        { label: 'Estado', value: String(order.status || 'pendiente').toUpperCase() },
                        { label: 'Archivo', value: order.url_orden_compra.split('/').pop() || 'orden_compra.pdf' },
                        { label: 'Total Neto', value: totalNet }
                    ],
                    previewType: ocUrl ? 'iframe' : 'message',
                    previewSrc: ocUrl,
                    previewMessage: 'No se pudo cargar la orden almacenada.',
                    actions: [
                        { label: 'Abrir Documento', icon: 'fa-solid fa-folder-open', tone: 'slate', onclick: ocUrl ? `window.openCpExpedientePreview(${JSON.stringify(ocUrl)}, ${JSON.stringify('Orden de Compra')})` : `window.openStoredDocument(${JSON.stringify(order.url_orden_compra)})` }
                    ]
                });
            } else if (!isConvenio) {
                const orderPreviewSrc = approvedStatus ? await __orderBuildPreviewObjectUrl('order', order) : '';
                docs.push({
                    title: 'Orden de Compra',
                    description: approvedStatus ? 'Genera y archiva la orden oficial desde esta misma vista.' : 'La orden de compra se habilita cuando la cotización ya está aprobada.',
                    badge: approvedStatus ? 'Pendiente' : 'Bloqueada',
                    badgeTone: approvedStatus ? 'amber' : 'red',
                    metaRows: [
                        { label: 'Folio', value: draftMeta.folio || '--' },
                        { label: 'Estado', value: String(order.status || 'pendiente').toUpperCase() },
                        { label: 'Archivo', value: 'Sin generar' },
                        { label: 'Total Neto', value: totalNet }
                    ],
                    previewType: approvedStatus ? 'iframe' : 'message',
                    previewSrc: orderPreviewSrc,
                    previewMessage: approvedStatus ? '' : 'Aprueba la cotización para habilitar la orden de compra.',
                    actions: approvedStatus
                        ? [
                            { label: 'Vista Completa', icon: 'fa-solid fa-expand', tone: 'slate', onclick: `window.openCpExpedienteLivePreview("order", ${JSON.stringify('Orden de Compra')})` }
                        ]
                        : []
                });
            }

            if (isConvenio) {
                if (String(order.status || "").toLowerCase() === "aprobada" && convenioEvidence.length < 3) {
                    docs.push({
                        title: 'Evidencia Pendiente',
                        description: 'Este convenio no solicita factura, contrato ni recibos. Para finalizarlo debes subir de 3 a 5 fotografías de evidencia.',
                        badge: 'Pendiente',
                        badgeTone: 'amber',
                        metaRows: [
                            { label: 'Espacio bloqueado', value: __orderBlocksIndefinitely(order) ? 'Indefinido' : 'Sí' },
                            { label: 'Rango requerido', value: '3 a 5 imágenes' },
                            { label: 'Documentación', value: 'Solo evidencia' }
                        ],
                        previewType: 'message',
                        previewMessage: 'Sube la evidencia fotográfica para finalizar el convenio.',
                        actions: [
                            { label: 'Subir Evidencias', icon: 'fa-solid fa-camera', tone: 'brand', onclick: `window.openCpEvidenceUploadModal(${JSON.stringify(order.id)})` }
                        ]
                    });
                }
                convenioEvidence.forEach((evidence, index) => {
                    docs.push({
                        title: `Evidencia ${index + 1}`,
                        description: 'Registro fotográfico del cumplimiento del convenio.',
                        badge: 'Evidencia',
                        badgeTone: 'amber',
                        metaRows: [
                            { label: 'Archivo', value: evidence.file_name || `evidencia_${index + 1}.jpg` },
                            { label: 'Fecha', value: evidence.uploaded_at ? window.safeFormatDate(String(evidence.uploaded_at).slice(0, 10)) : '--' },
                            { label: 'Documento', value: 'Evidencia fotográfica' }
                        ],
                        previewType: 'message',
                        previewMessage: 'Cargando evidencia...',
                        previewSrcPromise: __orderCreateSignedStorageUrl(evidence.path),
                        previewAsImage: true,
                        path: evidence.path,
                        fileName: evidence.file_name || `evidencia_${index + 1}.jpg`,
                        actions: [
                            { label: 'Abrir Galería', icon: 'fa-solid fa-images', tone: 'slate', onclick: `window.openCpEvidenceGallery(${JSON.stringify(order.id)}, ${index})` },
                            { label: 'Descargar', icon: 'fa-solid fa-download', tone: 'emerald', onclick: `window.downloadCpEvidenceFile(${JSON.stringify(evidence.path)}, ${JSON.stringify(evidence.file_name || `evidencia_${index + 1}.jpg`)})` }
                        ]
                    });
                });
            }
        } else if (window.currentCpExpedienteView === "contrato") {
            docs.push({
                title: "Contrato",
                description: "Documento oficial del contrato asociado a la orden.",
                badge: "Archivado",
                badgeTone: "emerald",
                metaRows: [
                    { label: "Generado el", value: extractTs(order.contrato_url, order.fecha_aprobacion || order.updated) },
                    { label: "Archivo", value: order.contrato_url?.split("/").pop() || "contrato.pdf" }
                ],
                previewType: order.contrato_url ? "iframe" : "message",
                previewSrc: order.contrato_url ? await __orderCreateSignedStorageUrl(order.contrato_url) : "",
                previewMessage: "El contrato no pudo ser cargado.",
                actions: [
                    { label: "Volver a Cotización", icon: "fa-solid fa-arrow-left", tone: "slate", onclick: `window.setCpExpedienteView("main")` },
                    { label: "Abrir en Pestaña", icon: "fa-solid fa-external-link-alt", tone: "blue", onclick: `window.openStoredDocument(${JSON.stringify(order.contrato_url)})` }
                ]
            });
        } else if (window.currentCpExpedienteView === "factura") {
            docs.push({
                title: "Factura",
                description: "Documento oficial de la factura PDF.",
                badge: "Emitida",
                badgeTone: "emerald",
                metaRows: [
                    { label: "Subida el", value: extractTs(order.factura_pdf_url, order.fecha_aprobacion || order.updated) },
                    { label: "Archivo", value: order.factura_pdf_url?.split("/").pop() || "factura.pdf" }
                ],
                previewType: order.factura_pdf_url ? "iframe" : "message",
                previewSrc: order.factura_pdf_url ? await __orderCreateSignedStorageUrl(order.factura_pdf_url) : "",
                previewMessage: "La factura no pudo ser cargada.",
                actions: [
                    { label: "Volver a Cotización", icon: "fa-solid fa-arrow-left", tone: "slate", onclick: `window.setCpExpedienteView("main")` },
                    { label: "Abrir en Pestaña", icon: "fa-solid fa-external-link-alt", tone: "blue", onclick: `window.openStoredDocument(${JSON.stringify(order.factura_pdf_url)})` }
                ]
            });
        } else if (window.currentCpExpedienteView === "pagos") {
            const pagosList = __orderParsePaymentsForExpediente(order).filter(p => String(p?.file_path || p?.path || p?.url || "").trim());

            if (pagosList.length === 0) {
                docs.push({
                    title: "Pagos",
                    description: "No hay comprobantes de pago registrados.",
                    badge: "Vacío",
                    badgeTone: "slate",
                    previewType: "message",
                    previewMessage: "No se encontraron recibos de pago con comprobante en esta orden."
                });
            } else {
                const itemsPerPage = 4;
                const currentPage = window.currentCpExpedientePayload?.page || 1;
                const totalPages = Math.ceil(pagosList.length / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const currentPagos = pagosList.slice(startIndex, startIndex + itemsPerPage);

                if (subButtons) {
                    subButtons.classList.remove("hidden");
                    subButtons.innerHTML = `<div class="flex items-center gap-3 w-full"><span class="text-xs font-bold text-gray-500 py-2 flex-grow">Mostrando ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, pagosList.length)} de ${pagosList.length} pagos</span></div>`;

                    const paginationControls = document.createElement("div");
                    paginationControls.className = "flex items-center gap-2";

                    if (currentPage > 1) {
                        const btnPrev = document.createElement("button");
                        btnPrev.className = "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1";
                        btnPrev.innerHTML = `<i class="fa-solid fa-chevron-left"></i> Anterior`;
                        btnPrev.onclick = () => window.setCpExpedienteView("pagos", { page: currentPage - 1 });
                        paginationControls.appendChild(btnPrev);
                    }

                    if (currentPage < totalPages) {
                        const btnNext = document.createElement("button");
                        btnNext.className = "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1";
                        btnNext.innerHTML = `Siguiente <i class="fa-solid fa-chevron-right"></i>`;
                        btnNext.onclick = () => window.setCpExpedienteView("pagos", { page: currentPage + 1 });
                        paginationControls.appendChild(btnNext);
                    }
                    subButtons.firstElementChild.appendChild(paginationControls);
                }

                for (let i = 0; i < currentPagos.length; i++) {
                    const payment = currentPagos[i];
                    const globalIdx = startIndex + i;
                    const safePath = String(payment?.file_path || payment?.path || payment?.url || "").trim();
                    const isClosure = String(payment?.type || payment?.tipo || "").toLowerCase() === "constancia_liquidacion" || payment?.closed === true || payment?.is_closure === true;

                    const promiseUrl = __orderCreateSignedStorageUrl(safePath);

                    const amt = parseFloat(payment.amount || payment.monto || 0);
                    const formattedAmt = typeof __orderExpedienteMoney === "function" ? __orderExpedienteMoney(amt) : `$${amt.toFixed(2)}`;
                    const ref = payment.reference || payment.referencia || "--";
                    const bank = payment.bank || payment.banco || "--";
                    const dateStr = payment.date || payment.fecha ? new Date(payment.date || payment.fecha).toLocaleString() : "--";

                    docs.push({
                        title: `Pago ${globalIdx + 1} - ${isClosure ? 'Liquidación' : 'Recibo'}`,
                        description: payment.concept || payment.concepto || "Comprobante de pago verificado.",
                        badge: "Pagado",
                        badgeTone: "indigo",
                        metaRows: [
                            { label: "Monto", value: formattedAmt },
                            { label: "Fecha", value: dateStr },
                            { label: "Banco", value: bank },
                            { label: "Referencia", value: ref },
                            { label: "Archivo", value: safePath.split("/").pop() || "recibo.pdf" }
                        ],
                        previewType: "iframe",
                        previewSrcPromise: promiseUrl,
                        path: safePath,
                        actions: [
                            { label: "Abrir en Pestaña", icon: "fa-solid fa-external-link-alt", tone: "blue", onclick: `window.openStoredDocument(${JSON.stringify(safePath)})` }
                        ]
                    });
                }
            }
        }

        const btnContract = document.getElementById("btn-contrato");
        if (btnContract) {
            if (isConvenio) {
                btnContract.disabled = true;
            } else if (order.contrato_url) {
                btnContract.disabled = false;
                btnContract.onclick = async () => {
                    window.setCpExpedienteView("contrato");
                };
            } else {
                btnContract.disabled = true;
            }
        }

        const btnInvoice = document.getElementById("btn-factura");
        if (btnInvoice) {
            if (isConvenio) {
                btnInvoice.disabled = true;
            } else if (order.factura_pdf_url) {
                btnInvoice.disabled = false;
                btnInvoice.onclick = async () => {
                    window.setCpExpedienteView("factura");
                };
            } else {
                btnInvoice.disabled = true;
            }
        }

        if (window.currentCpExpedienteView !== "pagos") {
            if (subButtons) {
                subButtons.innerHTML = "";
                subButtons.classList.add("hidden");
            }
        }

        const resolvedDocs = await Promise.all(docs.map(async (doc) => {
            if (doc.previewSrcPromise) {
                const signed = await doc.previewSrcPromise;
                return {
                    ...doc,
                    previewType: signed ? 'iframe' : 'message',
                    previewSrc: signed,
                    previewMessage: signed ? '' : 'No se pudo cargar el documento.'
                };
            }
            return doc;
        }));

        if (renderSeq !== __orderExpedienteRenderSeq) return;
        grid.innerHTML = resolvedDocs.length
            ? resolvedDocs.map((doc) => {
                if (doc.path && !doc.actions) {
                    doc.actions = [doc.previewSrc
                        ? { label: 'Abrir Documento', icon: 'fa-solid fa-folder-open', tone: 'emerald', onclick: `window.openCpExpedientePreview(${JSON.stringify(doc.previewSrc)}, ${JSON.stringify(doc.title || 'Documento')})` }
                        : { label: 'Abrir Documento', icon: 'fa-solid fa-folder-open', tone: 'emerald', onclick: `window.openStoredDocument(${JSON.stringify(doc.path)})` }];
                }
                return __orderRenderExpedienteCard(doc);
            }).join('')
            : '<div class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-sm font-bold text-gray-400">Aún no hay documentos registrados en este expediente.</div>';
    } catch (e) {
        if (renderSeq !== __orderExpedienteRenderSeq) return;
        grid.innerHTML = `<div class="rounded-2xl border border-dashed border-red-200 bg-red-50 px-5 py-6 text-sm font-bold text-red-600">No se pudo construir el expediente: ${__orderExpedienteEscape(e?.message || e)}</div>`;
    }
}

window.saveCpDraftSnapshot = async function (btnEl = null) {
    const btn = btnEl instanceof HTMLElement ? btnEl : null;
    const original = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Guardando...</span>'; }
    try {
        const order = await __orderComposeExpedienteSourceOrder();
        const status = String(order?.status || currentPreviewOrder?.status || "").toLowerCase();
        const isApproved = ["aprobada", "finalizada"].includes(status);
        const docMeta = __orderGetQuoteDocumentMeta(order);
        const { blob } = await __orderBuildDocumentBlob('quote', order);

        let downloadName = "";

        if (isApproved) {
            const formData = { ...currentPreviewOrder, ...order };
            const snapshotMeta = window.__cpBuildApprovalSnapshotMeta ? window.__cpBuildApprovalSnapshotMeta(order.id, formData) : { path: `${order.id}/${docMeta.approvedStorageBase}_${order.numero_orden || order.id}.pdf`, folio: order.numero_orden || order.id };
            await window.globalPocketBase.storage.from('documentos-cp').upload(snapshotMeta.path, blob, { upsert: true });
            const { error } = await window.__cpQuotesUpdate(order.id, { url_cotizacion_final: snapshotMeta.path });
            if (error) throw error;
            currentPreviewOrder = { ...currentPreviewOrder, ...order, url_cotizacion_final: snapshotMeta.path };
            downloadName = `${docMeta.approvedFileBase}_${snapshotMeta.folio}.pdf`;
            signalOrdersRefresh("approved_snapshot");
            window.showToast(`${docMeta.approvedTitle} archivada correctamente.`, "success");
        } else {
            const draftMeta = __orderResolveDraftSnapshotMeta(order);
            if (!draftMeta.orderId || !draftMeta.path) throw new Error('No se pudo identificar la cotización.');
            await window.globalPocketBase.storage.from('documentos-cp').upload(draftMeta.path, blob, { upsert: true });
            currentPreviewOrder = { ...currentPreviewOrder, __draft_snapshot_path: draftMeta.path };
            downloadName = draftMeta.fileName || `Snapshot_${draftMeta.folio || docMeta.itemLabel}.pdf`;
            window.showToast(`Snapshot de ${docMeta.draftTitle.toLowerCase()} guardada en el expediente.`, 'success');
        }

        if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(blob, downloadName);
        else {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        }

        await __orderRenderExpedientePanel();
        if (typeof window.closeModal === "function") window.closeModal("preview-modal");
        if (typeof window.switchOrderDetailTab === "function") window.switchOrderDetailTab("expediente");
    } catch (e) {
        window.showToast(`No se pudo guardar el snapshot: ${e?.message || e}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
};

window.saveCpPurchaseOrderSnapshot = async function (btnEl = null) {
    const btn = btnEl instanceof HTMLElement ? btnEl : null;
    const original = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Guardando...</span>'; }
    try {
        const order = await __orderComposeExpedienteSourceOrder();
        const status = String(order?.status || currentPreviewOrder?.status || '').toLowerCase();
        if (!['aprobada', 'finalizada'].includes(status)) throw new Error('La orden de compra solo se genera con cotizaciones aprobadas o finalizadas.');
        const { blob } = await __orderBuildDocumentBlob('order', order);
        const folio = __orderResolveQuoteFolio(order, order.id);
        const path = `${order.id}/orden_compra_${folio}.pdf`;
        await window.globalPocketBase.storage.from('documentos-cp').upload(path, blob, { upsert: true });
        const fechaOrden = new Date().toISOString();
        const { error } = await __cpQuotesUpdate(order.id, { url_orden_compra: path, fecha_orden_compra: fechaOrden });
        if (error) throw error;
        currentPreviewOrder = { ...currentPreviewOrder, ...order, url_orden_compra: path, fecha_orden_compra: fechaOrden };

        if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(blob, `Orden_Compra_${folio}.pdf`);
        else {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `Orden_Compra_${folio}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        }

        signalOrdersRefresh('purchase_order');
        window.showToast('Orden de compra archivada correctamente.', 'success');
        await __orderRenderExpedientePanel();
        if (typeof window.closeModal === "function") window.closeModal("preview-modal");
        if (typeof window.switchOrderDetailTab === "function") window.switchOrderDetailTab("expediente");
    } catch (e) {
        window.showToast(`No se pudo guardar la orden de compra: ${e?.message || e}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
};

function __orderRenderActiveSpaceSummary(activePricing = null) {
    const cfg = __orderGetActiveCfg();
    const space = __orderGetSpaceById(cfg?.spaceId);
    const isPublicidad = __orderIsPublicidadSpace(cfg || space);
    const pricing = activePricing || (__orderTotals?.spaces || []).find((item) => String(item.spaceId || '') === String(__orderActiveSpaceId || '')) || null;
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const rangeLabel = (cfg?.startDate && cfg?.endDate)
        ? __orderFormatRangeLabel(cfg.startDate, cfg.endDate)
        : '--';
    const reviewLabel = pricing
        ? (pricing.capacityOk === false ? 'Aforo excedido' : (pricing.blockedOk === false ? 'Fecha bloqueada' : 'Sin conflictos'))
        : '--';
    const reviewClassTarget = document.getElementById('oed-active-space-status');
    if (reviewClassTarget) {
        reviewClassTarget.classList.remove('text-red-600', 'text-emerald-700', 'text-gray-800');
        reviewClassTarget.classList.add(pricing && (pricing.capacityOk === false || pricing.blockedOk === false) ? 'text-red-600' : 'text-emerald-700');
    }
    setText('oed-active-space-name', space?.nombre || cfg?.spaceId || '--');
    setText('oed-active-space-key', space?.clave || '--');
    setText('oed-active-space-range', rangeLabel);
    setText('oed-active-space-days', cfg?.startDate ? `${__orderRangeDays(cfg.startDate, cfg.endDate)} dia(s)` : '--');
    setText('oed-active-space-guests', isPublicidad ? 'No aplica' : `${parseInt(cfg?.guests, 10) || 0} px`);
    setText('oed-active-space-schedule', isPublicidad ? 'No aplica' : (cfg?.horarioText || cfg?.horarioValue || '--'));
    setText('oed-active-space-montaje', isPublicidad ? 'No aplica' : `${Math.max(0, (parseInt(cfg?.premontajeDays, 10) || 0) - (parseInt(cfg?.premontajeCourtesyDays, 10) || 0))} facturable(s)`);
    setText('oed-active-space-hours', isPublicidad ? 'No aplica' : `${Math.max(0, (parseInt(cfg?.horasExtra, 10) || 0) - (parseInt(cfg?.horasExtraCourtesy, 10) || 0))} facturable(s)`);
    setText('oed-active-space-mode', cfg?.startDate ? (isPublicidad ? (cfg?.customPermanence ? 'Publicidad personalizada' : 'Publicidad mensual') : (__orderRangeDays(cfg.startDate, cfg.endDate) > 1 ? 'Evento multi-dia' : 'Evento de un dia')) : '--');
    setText('oed-active-space-base', (parseFloat(pricing?.base || __orderResolveBaseTotal(cfg, space, parseInt(cfg?.guests, 10) || 1) || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
    setText('oed-active-space-status', reviewLabel);
    setText('oed-active-space-total', (parseFloat(pricing?.totalSpace || pricing?.subtotalSpace || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
}

function __orderGetActiveCfg() {
    return __orderQuoteSpaces.find(cfg => String(cfg.spaceId) === String(__orderActiveSpaceId)) || null;
}

function __orderGetCfg(spaceId) {
    return __orderQuoteSpaces.find(cfg => String(cfg.spaceId) === String(spaceId)) || null;
}

function __orderGetSpaceCategoryKey(space) {
    return __orderIsPublicidadSpace(space) ? 'publicidad' : 'espacio';
}

function __orderGetEditorCategoryMode() {
    const categories = Array.from(new Set(__orderQuoteSpaces.map((cfg) => __orderGetSpaceCategoryKey(__orderGetSpaceById(cfg.spaceId) || cfg))));
    if (!categories.length) return '';
    return categories.length === 1 ? categories[0] : 'mixed';
}

function __orderIsEditorConvenioMode() {
    return __orderQuoteSpaces.some((cfg) => !!cfg?.convenioEnabled) || __orderIsConvenioOrder(currentPreviewOrder || {});
}

function __orderCanDisplaySpaceInEditor(space) {
    const sid = String(space?.id || space?.spaceId || '').trim();
    if (!sid) return false;
    const isSelected = __orderQuoteSpaces.some((cfg) => String(cfg.spaceId) === sid);
    if (__orderIsEditorConvenioMode() && !__orderSpaceAllowsConvenio(space)) return false;
    if (isSelected) return true;
    const categoryMode = __orderGetEditorCategoryMode();
    if (categoryMode === 'mixed') return false;
    return !categoryMode || categoryMode === __orderGetSpaceCategoryKey(space);
}

// order_detail comparte un solo catalogo visual; esta funcion concentra el
// filtro para que el combo y las tarjetas muestren exactamente los mismos
// espacios, incluyendo la restriccion especial de convenio.
function __orderListEditorCatalogSpaces() {
    return allSpaces.filter((space) => __orderCanDisplaySpaceInEditor(space));
}

function __orderCanAddSpaceToEditor(spaceId, options = {}) {
    const space = __orderGetSpaceById(spaceId);
    if (!space) return false;
    if (__orderIsEditorConvenioMode() && !__orderSpaceAllowsConvenio(space)) {
        if (!options.silent) window.showToast('Ese espacio no está disponible para convenio.', 'error');
        return false;
    }
    const categoryMode = __orderGetEditorCategoryMode();
    if (categoryMode === 'mixed') {
        if (!options.silent) window.showToast('Quita espacios de una categoría antes de agregar otro. No se puede mezclar ESPACIO con PUBLICIDAD.', 'error');
        return false;
    }
    const nextCategory = __orderGetSpaceCategoryKey(space);
    if (categoryMode && categoryMode !== nextCategory) {
        if (!options.silent) window.showToast('No se puede mezclar ESPACIO con PUBLICIDAD en la misma cotización.', 'error');
        return false;
    }
    return true;
}

function __orderRenderSpaceAddSelect() {
    const sel = document.getElementById('oed-space-add');
    if (!sel) return;
    const selected = new Set(__orderQuoteSpaces.map(cfg => String(cfg.spaceId)));
    sel.innerHTML = '<option value="">Selecciona espacio...</option>';
    __orderListEditorCatalogSpaces().forEach(space => {
        const disabled = selected.has(String(space.id)) ? 'disabled' : '';
        sel.innerHTML += `<option value="${space.id}" ${disabled}>${space.nombre}</option>`;
    });
}

function __orderUpdateSpaceConfigTitle() {
    const cfg = __orderGetActiveCfg();
    const space = __orderGetSpaceById(cfg?.spaceId);
    const title = document.getElementById('oed-space-config-title');
    const copy = document.getElementById('oed-space-config-copy');
    const baseLabel = __orderFormatMoneyMx(__orderResolveDisplayedBase(cfg, space));
    if (title) title.textContent = `Configuración del Espacio - ${space?.nombre || cfg?.spaceId || '--'} - ${baseLabel}`;
    if (copy) copy.textContent = 'Controla nombre de la cotización, fechas, asistentes, horario y complementos del espacio activo.';
}

function __orderRenderSpaceTabs() {
    const container = document.getElementById('oed-spaces-tabs');
    if (!container) return;
    container.innerHTML = '';
    __orderQuoteSpaces.forEach(cfg => {
        const space = __orderGetSpaceById(cfg.spaceId);
        const active = String(cfg.spaceId) === String(__orderActiveSpaceId);
        const classes = active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-red';
        container.innerHTML += `<div class="flex items-center border rounded-full ${classes}">
            <button type="button" onclick="window.selectOrderQuoteSpace('${cfg.spaceId}')" class="px-3 py-1.5 text-[10px] font-bold uppercase">${space?.nombre || cfg.spaceId}</button>
            ${__orderQuoteSpaces.length > 1 ? `<button type="button" onclick="window.removeSpaceFromOrderQuote('${cfg.spaceId}')" class="pr-2 text-[10px]"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
    });
    __orderRenderSpacePicker();
}

function __orderRenderSpacePicker() {
    const container = document.getElementById('oed-space-picker');
    if (!container) return;
    const selected = new Set(__orderQuoteSpaces.map(cfg => String(cfg.spaceId)));
    container.innerHTML = '';
    __orderListEditorCatalogSpaces().forEach(space => {
        const sid = String(space.id);
        const isSelected = selected.has(sid);
        const isActive = String(__orderActiveSpaceId) === sid;
        const cls = isActive
            ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300'
            : (isSelected ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white hover:border-brand-red');
        const badgeCls = isActive
            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
            : (isSelected ? 'border-yellow-200 bg-yellow-100 text-yellow-700' : 'border-gray-200 bg-gray-100 text-gray-500');
        const cfg = __orderGetCfg(sid);
        const categoryLabel = __orderIsPublicidadSpace(space) ? 'PUBLICIDAD' : 'ESPACIO';
        const categoryBadgeCls = __orderIsPublicidadSpace(space)
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-slate-200 bg-slate-50 text-slate-700';
        const dateLabel = (cfg?.startDate && cfg?.endDate) ? __orderFormatRangeLabel(cfg.startDate, cfg.endDate) : '--';
        const guestsLabel = __orderIsPublicidadSpace(space) ? 'No aplica' : (cfg ? `${parseInt(cfg.guests, 10) || 0} px` : '--');
        const baseValue = cfg ? __orderResolveDisplayedBase(cfg, space) : 0;
        const baseLabel = baseValue > 0 ? __orderFormatMoneyMx(baseValue) : '--';
        const stateLabel = isActive ? 'En edición' : (isSelected ? 'Activa' : 'Libre');
        const switchLabel = isSelected ? 'En cotización' : 'Agregar';
        if (__orderIsPublicidadSpace(space) || cfg?.convenioEnabled) {
            const modeLabel = cfg
                ? __orderDescribePublicityPricingRule(cfg, space, baseValue).modeLabel
                : 'Periodo automático (30 días)';
            const pickerDateLabel = (cfg?.startDate && cfg?.endDate)
                ? `${window.safeFormatDate(cfg.startDate)} - ${cfg?.convenioEnabled && !__orderHasFiniteConvenioEndDate(cfg.endDate) ? 'Indefinido' : window.safeFormatDate(cfg.endDate || cfg.startDate)}`
                : '--';
            container.innerHTML += `<button type="button" onclick="window.activateOrderSpaceCard('${sid}')" class="w-full h-full min-h-[126px] text-left rounded-xl border ${cls} p-2.5 transition">
                <div class="flex h-full flex-col gap-2">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                            <p class="text-[10px] font-black uppercase leading-tight whitespace-normal break-words text-gray-800">${space.nombre || '--'}</p>
                            <p class="text-[9px] font-mono text-gray-500 mt-1 truncate">${space.clave ? `Clave: ${space.clave}` : '--'}</p>
                            <div class="mt-1 flex flex-wrap gap-1">
                                <span class="rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${categoryBadgeCls}">${categoryLabel}</span>
                                ${cfg?.convenioEnabled ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-800">Convenio</span>' : ''}
                            </div>
                            <p class="mt-1 text-[10px] font-black text-gray-800">${baseLabel}</p>
                        </div>
                        <span class="shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${badgeCls}">${stateLabel}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="rounded-lg border border-white/70 bg-white/70 p-2">
                            <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Fechas</p>
                            <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${pickerDateLabel}</p>
                        </div>
                        <div class="rounded-lg border border-white/70 bg-white/70 p-2">
                            <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Modo</p>
                            <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${modeLabel}</p>
                        </div>
                    </div>
                    <div class="mt-auto flex items-center justify-between gap-2">
                        <span class="text-[9px] font-bold uppercase tracking-wide ${isActive ? 'text-emerald-700' : (isSelected ? 'text-brand-red' : 'text-gray-400')}">${switchLabel}</span>
                        <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleOrderSpaceSwitch('${sid}', this.checked)" class="sr-only peer">
                            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 peer-checked:after:border-white"></div>
                        </label>
                    </div>
                </div>
            </button>`;
            return;
        }
        container.innerHTML += `<button type="button" onclick="window.activateOrderSpaceCard('${sid}')" class="w-full h-full min-h-[126px] text-left rounded-xl border ${cls} p-2.5 transition">
            <div class="flex h-full flex-col gap-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black uppercase text-gray-800 leading-tight break-words">${space.nombre}</p>
                        <p class="text-[9px] font-mono text-gray-400 mt-1 truncate">${space.clave || '--'}</p>
                        <div class="mt-1 flex flex-wrap gap-1">
                            <span class="rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${categoryBadgeCls}">${categoryLabel}</span>
                            ${cfg?.convenioEnabled ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-800">Convenio</span>' : ''}
                        </div>
                    </div>
                    <span class="shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${badgeCls}">${stateLabel}</span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="rounded-lg border border-white/70 bg-white/70 p-2">
                        <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Fechas</p>
                        <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${dateLabel}</p>
                    </div>
                    <div class="rounded-lg border border-white/70 bg-white/70 p-2">
                        <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Personas</p>
                        <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${guestsLabel}</p>
                    </div>
                </div>
                <div class="rounded-lg border border-white/70 bg-white/70 p-2">
                    <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Base</p>
                    <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${baseLabel}</p>
                </div>
                <div class="mt-auto flex items-center justify-between gap-2">
                    <span class="text-[9px] font-bold uppercase tracking-wide ${isActive ? 'text-emerald-700' : (isSelected ? 'text-brand-red' : 'text-gray-400')}">${switchLabel}</span>
                    <label class="relative inline-flex items-center cursor-pointer" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleOrderSpaceSwitch('${sid}', this.checked)" class="sr-only peer">
                        <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 peer-checked:after:border-white"></div>
                    </label>
                </div>
            </div>
        </button>`;
    });
}

window.activateOrderSpaceCard = function (spaceId) {
    const sid = String(spaceId);
    __orderSaveActiveFromForm();
    const exists = __orderQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (!exists && !__orderCanAddSpaceToEditor(sid)) return;
    if (!exists) {
        const active = __orderGetActiveCfg();
        const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
        __orderQuoteSpaces.push(__orderCreateSpaceCfg(sid, seed));
    }
    __orderActiveSpaceId = sid;
    __orderRenderSpaceAddSelect();
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.toggleOrderSpaceSwitch = function (spaceId, enabled) {
    const sid = String(spaceId);
    __orderSaveActiveFromForm();
    const exists = __orderQuoteSpaces.some(x => String(x.spaceId) === sid);
    if (enabled && !exists) {
        if (!__orderCanAddSpaceToEditor(sid)) {
            __orderRenderSpaceTabs();
            return;
        }
        const active = __orderGetActiveCfg();
        const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
        __orderQuoteSpaces.push(__orderCreateSpaceCfg(sid, seed));
    } else if (!enabled && exists) {
        if (__orderQuoteSpaces.length <= 1) {
            window.showToast('La cotización debe conservar al menos un espacio.', 'error');
            __orderRenderSpaceTabs();
            return;
        }
        __orderQuoteSpaces = __orderQuoteSpaces.filter(x => String(x.spaceId) !== sid);
        if (String(__orderActiveSpaceId) === sid) __orderActiveSpaceId = String(__orderQuoteSpaces[0].spaceId);
    }
    __orderRenderSpaceAddSelect();
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

function __orderRenderSpaceSelect() {
    const sel = document.getElementById('oed-space');
    if (!sel) return;
    sel.innerHTML = '';
    __orderQuoteSpaces.forEach(cfg => {
        const space = __orderGetSpaceById(cfg.spaceId);
        sel.innerHTML += `<option value="${cfg.spaceId}">${space?.nombre || cfg.spaceId}</option>`;
    });
    if (__orderActiveSpaceId) sel.value = String(__orderActiveSpaceId);
}

function __orderRenderHorarioForActive() {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const sel = document.getElementById('oed-horario');
    const space = __orderGetSpaceById(cfg.spaceId);
    let b2b = {};
    try {
        b2b = typeof space?.config_b2b === 'string' ? JSON.parse(space.config_b2b) : (space?.config_b2b || {});
    } catch (e) {
        b2b = {};
    }
    let horarios = __orderSafeArray(b2b.horarios);
    if (!horarios.length && b2b.horarios && typeof b2b.horarios === 'object') {
        const mapNames = { matutino: 'Matutino', vespertino: 'Vespertino', nocturno: 'Nocturno', todo_dia: 'Todo el día' };
        horarios = Object.keys(b2b.horarios)
            .map(k => ({ nombre: mapNames[k] || k, start: b2b.horarios[k]?.start, end: b2b.horarios[k]?.end, price: b2b.horarios[k]?.price }))
            .filter(item => item.start && item.end);
    }
    sel.innerHTML = '';
    if (horarios.length) horarios.forEach(item => { sel.innerHTML += `<option value="${item.nombre}" data-price="${parseFloat(item.price || 0)}">${item.nombre} (${item.start} a ${item.end})</option>`; });
    else sel.innerHTML = '<option value="Sin horario" data-price="0">Sin horario configurado</option>';
    sel.innerHTML += '<option value="personalizado" data-price="0">Personalizado...</option>';
    if (cfg.horarioValue) {
        const found = Array.from(sel.options).find(opt => opt.value === cfg.horarioValue);
        if (found) sel.value = cfg.horarioValue;
    }
}

function __orderRenderTaxesForActive() {
    const cfg = __orderGetActiveCfg();
    const container = document.getElementById('oed-taxes-list');
    if (!cfg || !container) return;
    const space = __orderGetSpaceById(cfg.spaceId);
    cfg.taxIds = __orderResolveCfgTaxIds(cfg, space);
    container.innerHTML = __orderRenderAutoTaxSummary(cfg.taxIds, space);
}

window.onActiveOrderTaxesChanged = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const space = __orderGetSpaceById(cfg.spaceId);
    cfg.taxIds = __orderResolveCfgTaxIds(cfg, space);
    window.recalcTotal();
    __orderScheduleAutoSave();
};

function __orderApplyCourtesyLimitsFromInputs() {
    const premDaysEl = document.getElementById('oed-premontaje');
    const premCourtesyEl = document.getElementById('oed-premontaje-cortesia');
    const hoursEl = document.getElementById('oed-horas');
    const hoursCourtesyEl = document.getElementById('oed-horas-cortesia');

    const premDays = Math.max(0, parseInt(premDaysEl?.value, 10) || 0);
    const premCourtesy = Math.max(0, parseInt(premCourtesyEl?.value, 10) || 0);
    if (premCourtesyEl) {
        premCourtesyEl.max = String(premDays);
        if (premCourtesy > premDays) premCourtesyEl.value = String(premDays);
        if (premCourtesyEl.value === '') premCourtesyEl.value = '0';
    }

    const hours = Math.max(0, parseInt(hoursEl?.value, 10) || 0);
    const hoursCourtesy = Math.max(0, parseInt(hoursCourtesyEl?.value, 10) || 0);
    if (hoursCourtesyEl) {
        hoursCourtesyEl.max = String(hours);
        if (hoursCourtesy > hours) hoursCourtesyEl.value = String(hours);
        if (hoursCourtesyEl.value === '') hoursCourtesyEl.value = '0';
    }
}

function __orderSaveActiveFromForm() {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    __orderApplyCourtesyLimitsFromInputs();
    cfg.startDate = __orderNormalizeDate(document.getElementById('oed-start')?.value || '');
    cfg.endDate = __orderNormalizeDate(document.getElementById('oed-end')?.value || cfg.startDate || '');
    const today = __orderTodayISO();
    if (cfg.startDate && cfg.startDate < today) cfg.startDate = today;
    if (cfg.endDate && cfg.endDate < today) cfg.endDate = today;
    if (cfg.startDate && cfg.endDate && cfg.endDate < cfg.startDate) cfg.endDate = cfg.startDate;
    const startEl = document.getElementById('oed-start');
    const endEl = document.getElementById('oed-end');
    if (startEl && startEl.value !== cfg.startDate) startEl.value = cfg.startDate || '';
    if (endEl && endEl.value !== cfg.endDate) endEl.value = cfg.endDate || '';
    const space = __orderGetSpaceById(cfg.spaceId);
    const isPublicidad = __orderIsPublicidadSpace(space || cfg);
    cfg.customPermanence = !!document.getElementById('oed-custom-permanence')?.checked;
    cfg.convenioEnabled = !!document.getElementById('oed-convenio-enabled')?.checked;
    cfg.customPriceEnabled = cfg.convenioEnabled ? false : !!document.getElementById('oed-custom-price-enabled')?.checked;
    cfg.customPriceMode = String(document.getElementById('oed-space-custom-price-mode')?.value || cfg.customPriceMode || 'total');
    cfg.customBasePrice = cfg.customPriceEnabled
        ? (() => {
            const raw = document.getElementById('oed-space-custom-price')?.value;
            if (raw === '' || raw === null || raw === undefined) return '';
            return Math.max(0, parseFloat(raw) || 0);
        })()
        : '';
    cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept);
    cfg.guests = isPublicidad ? 1 : (parseInt(document.getElementById('oed-guests')?.value, 10) || 1);
    cfg.premontajeEnabled = isPublicidad ? false : !!document.getElementById('oed-chk-premontaje')?.checked;
    cfg.horasExtraEnabled = isPublicidad ? false : !!document.getElementById('oed-chk-horas')?.checked;
    cfg.premontajeDays = cfg.premontajeEnabled ? (parseInt(document.getElementById('oed-premontaje')?.value, 10) || 0) : 0;
    cfg.premontajeCourtesyDays = cfg.premontajeEnabled ? Math.max(0, parseInt(document.getElementById('oed-premontaje-cortesia')?.value, 10) || 0) : 0;
    if (cfg.premontajeCourtesyDays > cfg.premontajeDays) cfg.premontajeCourtesyDays = cfg.premontajeDays;
    const pc = document.getElementById('oed-premontaje-cortesia');
    if (pc) pc.value = cfg.premontajeCourtesyDays;
    cfg.horasExtra = cfg.horasExtraEnabled ? (parseInt(document.getElementById('oed-horas')?.value, 10) || 0) : 0;
    cfg.horasExtraCourtesy = cfg.horasExtraEnabled ? Math.max(0, parseInt(document.getElementById('oed-horas-cortesia')?.value, 10) || 0) : 0;
    const heCfg = __orderGetHoraExtraCfg();
    if (heCfg.allowCustom) {
        cfg.horasExtraUnit = parseFloat(document.getElementById('oed-horas-price')?.value || 0) || 0;
    } else {
        cfg.horasExtraUnit = __orderResolveHoraExtraUnit(space);
        const unitEl = document.getElementById('oed-horas-price');
        if (unitEl) unitEl.value = cfg.horasExtraUnit;
    }
    if (cfg.horasExtraCourtesy > cfg.horasExtra) cfg.horasExtraCourtesy = cfg.horasExtra;
    const hc = document.getElementById('oed-horas-cortesia');
    if (hc) hc.value = cfg.horasExtraCourtesy;
    cfg.premontajeDates = __orderSafeArray(window.finalMontajeDates).slice(0, cfg.premontajeDays);
    const sel = document.getElementById('oed-horario');
    const opt = sel?.options?.[sel.selectedIndex];
    if (isPublicidad) {
        cfg.guests = 1;
        cfg.horarioValue = '';
        cfg.horarioText = '';
        cfg.horarioPrice = 0;
        cfg.horarioCustomStart = '';
        cfg.horarioCustomEnd = '';
        cfg.premontajeEnabled = false;
        cfg.premontajeDays = 0;
        cfg.premontajeCourtesyDays = 0;
        cfg.premontajeDates = [];
        cfg.horasExtraEnabled = false;
        cfg.horasExtra = 0;
        cfg.horasExtraCourtesy = 0;
        cfg.horasExtraUnit = 0;
        if (cfg.convenioEnabled) {
            cfg.customPriceEnabled = false;
            cfg.customBasePrice = '';
            const priceInput = document.getElementById('oed-space-custom-price');
            if (priceInput) priceInput.value = '';
        }
        window.finalMontajeDates = [];
        __orderNormalizePublicidadDates(cfg);
        if (startEl && startEl.value !== cfg.startDate) startEl.value = cfg.startDate || '';
        if (endEl && endEl.value !== cfg.endDate) endEl.value = cfg.endDate || '';
        const guestsEl = document.getElementById('oed-guests');
        if (guestsEl) guestsEl.value = '1';
        const premChk = document.getElementById('oed-chk-premontaje');
        const horasChk = document.getElementById('oed-chk-horas');
        if (premChk) premChk.checked = false;
        if (horasChk) horasChk.checked = false;
        if (sel) sel.value = '';
        const horarioStartEl = document.getElementById('oed-horario-start');
        const horarioEndEl = document.getElementById('oed-horario-end');
        const horarioPriceEl = document.getElementById('oed-horario-price');
        if (horarioStartEl) horarioStartEl.value = '';
        if (horarioEndEl) horarioEndEl.value = '';
        if (horarioPriceEl) horarioPriceEl.value = '0';
        const premEl = document.getElementById('oed-premontaje');
        const premCourtesyEl = document.getElementById('oed-premontaje-cortesia');
        const horasEl = document.getElementById('oed-horas');
        const horasCourtesyEl = document.getElementById('oed-horas-cortesia');
        const horasPriceEl = document.getElementById('oed-horas-price');
        if (premEl) premEl.value = '0';
        if (premCourtesyEl) premCourtesyEl.value = '0';
        if (horasEl) horasEl.value = '0';
        if (horasCourtesyEl) horasCourtesyEl.value = '0';
        if (horasPriceEl) horasPriceEl.value = '0';
    } else if (sel?.value === 'personalizado') {
        const hs = document.getElementById('oed-horario-start')?.value || '';
        const he = document.getElementById('oed-horario-end')?.value || '';
        const hp = parseFloat(document.getElementById('oed-horario-price')?.value || 0) || 0;
        cfg.horarioValue = 'personalizado';
        cfg.horarioCustomStart = hs;
        cfg.horarioCustomEnd = he;
        cfg.horarioText = (hs && he) ? `${hs} a ${he}` : 'Horario Personalizado';
        cfg.horarioPrice = hp;
    } else {
        cfg.horarioValue = sel?.value || '';
        cfg.horarioText = opt?.text || cfg.horarioValue || '';
        cfg.horarioPrice = parseFloat(opt?.getAttribute('data-price') || 0) || 0;
        cfg.horarioCustomStart = '';
        cfg.horarioCustomEnd = '';
    }
    cfg.taxIds = __orderResolveCfgTaxIds(cfg, space);
    __orderApplyHoraExtraInputState(cfg);
    __orderSyncActiveSpaceModeUi(cfg);
}

function __orderLoadActiveToForm() {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    __orderRenderSpaceSelect();
    document.getElementById('oed-space').value = String(cfg.spaceId);
    document.getElementById('oed-start').value = cfg.startDate || '';
    document.getElementById('oed-end').value = cfg.endDate || '';
    const today = __orderTodayISO();
    document.getElementById('oed-start').min = today;
    document.getElementById('oed-end').min = today;
    document.getElementById('oed-guests').value = cfg.guests || 1;
    document.getElementById('oed-chk-premontaje').checked = !!cfg.premontajeEnabled;
    document.getElementById('oed-chk-horas').checked = !!cfg.horasExtraEnabled;
    document.getElementById('oed-premontaje').value = cfg.premontajeDays || 0;
    document.getElementById('oed-premontaje-cortesia').value = cfg.premontajeCourtesyDays || 0;
    document.getElementById('oed-horas').value = cfg.horasExtra || 0;
    document.getElementById('oed-horas-cortesia').value = cfg.horasExtraCourtesy || 0;
    document.getElementById('oed-horas-price').value = cfg.horasExtraUnit || 0;
    const customPermChk = document.getElementById('oed-custom-permanence');
    const customPriceChk = document.getElementById('oed-custom-price-enabled');
    const customModeSel = document.getElementById('oed-space-custom-price-mode');
    const customPriceInput = document.getElementById('oed-space-custom-price');
    const convenioChk = document.getElementById('oed-convenio-enabled');
    if (customPermChk) customPermChk.checked = !!cfg.customPermanence;
    if (customPriceChk) customPriceChk.checked = !!cfg.customPriceEnabled && !cfg.convenioEnabled;
    if (customModeSel) customModeSel.value = cfg.customPriceMode || 'total';
    if (customPriceInput) customPriceInput.value = (cfg.customBasePrice !== '' && cfg.customBasePrice !== null && cfg.customBasePrice !== undefined) ? String(cfg.customBasePrice) : '';
    if (convenioChk) convenioChk.checked = !!cfg.convenioEnabled;
    __orderApplyCourtesyLimitsFromInputs();
    window.toggleOrderPremontaje(true);
    window.toggleOrderHoras(true);
    __orderApplyHoraExtraInputState(cfg);
    window.finalMontajeDates = __orderSafeArray(cfg.premontajeDates).slice();
    __orderRenderHorarioForActive();
    const horarioSel = document.getElementById('oed-horario');
    if (cfg.horarioValue) {
        const found = Array.from(horarioSel.options).find(opt => opt.value === cfg.horarioValue);
        if (found) horarioSel.value = cfg.horarioValue;
    }
    if (horarioSel.value === 'personalizado') {
        document.getElementById('oed-horario-start').value = cfg.horarioCustomStart || '';
        document.getElementById('oed-horario-end').value = cfg.horarioCustomEnd || '';
        document.getElementById('oed-horario-price').value = cfg.horarioPrice || 0;
    }
    __orderUpdateSpaceConfigTitle();
    window.toggleCustomHorario('oed');
    __orderSyncActiveSpaceModeUi(cfg);
    __orderRenderTaxesForActive();
    window.handleMontajeInput('oed');
    __orderRenderActiveSpaceSummary();
}

window.selectOrderQuoteSpace = function (spaceId) {
    __orderSaveActiveFromForm();
    __orderActiveSpaceId = String(spaceId);
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.addSpaceToOrderQuote = function () {
    const sel = document.getElementById('oed-space-add');
    const newId = sel?.value;
    if (!newId) return;
    window.addSpaceToOrderQuoteById(newId);
};

window.addSpaceToOrderQuoteById = function (spaceId) {
    const newId = String(spaceId || '');
    if (!newId || __orderQuoteSpaces.some(cfg => String(cfg.spaceId) === String(newId))) return;
    __orderSaveActiveFromForm();
    if (!__orderCanAddSpaceToEditor(newId)) return;
    const active = __orderGetActiveCfg();
    const seed = active ? { startDate: active.startDate, endDate: active.endDate, guests: active.guests } : {};
    __orderQuoteSpaces.push(__orderCreateSpaceCfg(newId, seed));
    __orderActiveSpaceId = String(newId);
    __orderRenderSpaceAddSelect();
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.removeSpaceFromOrderQuote = function (spaceId) {
    if (__orderQuoteSpaces.length <= 1) return;
    __orderSaveActiveFromForm();
    __orderQuoteSpaces = __orderQuoteSpaces.filter(cfg => String(cfg.spaceId) !== String(spaceId));
    if (String(__orderActiveSpaceId) === String(spaceId)) __orderActiveSpaceId = String(__orderQuoteSpaces[0].spaceId);
    __orderRenderSpaceAddSelect();
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.toggleOrderCustomPermanence = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg || !__orderIsPublicidadSpace(cfg)) return;
    cfg.customPermanence = !!document.getElementById('oed-custom-permanence')?.checked;
    if (!cfg.customPermanence) {
        __orderNormalizePublicidadDates(cfg);
        const startEl = document.getElementById('oed-start');
        const endEl = document.getElementById('oed-end');
        if (startEl) startEl.value = cfg.startDate || '';
        if (endEl) endEl.value = cfg.endDate || '';
    }
    __orderSyncPublicidadCustomUi(cfg);
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.toggleOrderCustomPrice = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg || !__orderIsPublicidadSpace(cfg)) return;
    if (cfg.convenioEnabled) return;
    cfg.customPriceEnabled = !!document.getElementById('oed-custom-price-enabled')?.checked;
    if (!cfg.customPriceEnabled) cfg.customBasePrice = '';
    __orderSyncPublicidadCustomUi(cfg);
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.changeOrderCustomPriceMode = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg || !__orderIsPublicidadSpace(cfg)) return;
    cfg.customPriceMode = String(document.getElementById('oed-space-custom-price-mode')?.value || 'total');
    __orderSyncPublicidadCustomUi(cfg);
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.toggleOrderConvenio = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const activeSpace = __orderGetSpaceById(cfg.spaceId);
    if (!__orderSpaceAllowsConvenio(activeSpace) && !cfg.convenioEnabled) {
        const checkbox = document.getElementById('oed-convenio-enabled');
        if (checkbox) checkbox.checked = false;
        return window.showToast('Este espacio no tiene permitido usar convenio.', 'error');
    }
    cfg.convenioEnabled = !!document.getElementById('oed-convenio-enabled')?.checked;
    if (!cfg.convenioEnabled) {
        cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept).filter((concept) => !__orderIsConvenioConceptItem(concept));
    } else {
        cfg.customPriceEnabled = false;
        cfg.customBasePrice = '';
        const priceInput = document.getElementById('oed-space-custom-price');
        if (priceInput) priceInput.value = '';
    }
    __orderSyncConvenioUi(cfg);
    __orderRenderSpaceAddSelect();
    __orderRenderSpacePicker();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.addOrderConvenioItem = function () {
    const cfg = __orderGetActiveCfg();
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (!cfg || locked || !cfg.convenioEnabled) return;
    const optionId = String(document.getElementById('oed-convenio-select')?.value || '').trim();
    const cantidad = Math.max(1, parseInt(document.getElementById('oed-convenio-qty')?.value || 1, 10) || 1);
    const amountRaw = document.getElementById('oed-convenio-amount')?.value;
    const amount = Math.max(0, parseFloat(amountRaw || 0) || 0);
    if (!optionId) return window.showToast('Selecciona una opción de convenio.', 'error');
    if (amount <= 0) return window.showToast('Indica el monto manual del trato.', 'error');
    const option = cpOrderConvenioCatalog.find((item) => item.id === optionId);
    if (!option) return window.showToast('La opción de convenio ya no está disponible.', 'error');
    cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept);
    cfg.concepts.push(__orderBuildConvenioConcept(option, cantidad, amount));
    const select = document.getElementById('oed-convenio-select');
    const qtyInput = document.getElementById('oed-convenio-qty');
    const amountInput = document.getElementById('oed-convenio-amount');
    if (select) select.value = '';
    if (qtyInput) qtyInput.value = '1';
    if (amountInput) amountInput.value = '';
    __orderRenderConvenioItems();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.removeOrderConvenioItem = function (index) {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    let visibleIndex = -1;
    cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept).filter((concept) => {
        if (!__orderIsConvenioConceptItem(concept)) return true;
        visibleIndex += 1;
        return visibleIndex !== index;
    });
    __orderRenderConvenioItems();
    window.recalcTotal();
    __orderScheduleAutoSave();
};

window.updateB2bSelects = function () {
    const selected = document.getElementById('oed-space')?.value;
    if (selected && String(selected) !== String(__orderActiveSpaceId) && __orderGetCfg(selected)) {
        window.selectOrderQuoteSpace(selected);
        return;
    }
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    __orderRenderHorarioForActive();
    __orderRenderTaxesForActive();
};

window.renderTaxesForSpace = function () {
    __orderRenderTaxesForActive();
};

function __orderGetReservedDatesForSpace(spaceId) {
    const sid = String(spaceId);
    const reserved = new Set();
    allOrders.forEach(order => {
        if (String(order.id) === String(currentPreviewOrder?.id)) return;
        if (!__orderIsBlockingStatus(order.status)) return;
        const orderBlocksIndefinitely = __orderBlocksIndefinitely(order);
        const addDate = (ds) => {
            const n = __orderNormalizeDate(ds);
            if (n) reserved.add(n);
        };
        const addRange = (fi, ff) => {
            const start = new Date((fi || '') + 'T00:00:00');
            const end = new Date((ff || fi || '') + 'T00:00:00');
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
                addDate(`${y}-${m}-${day}`);
            }
        };
        const details = parseSpacesDetail(order.espacios_detalle);
        if (details.length) {
            details.forEach(item => {
                const itemSid = String(item.espacio_id || item.space_id || '');
                if (itemSid !== sid) return;
                const fechasEvento = __orderSafeArray(item.fechas_evento).map(__orderNormalizeDate).filter(Boolean);
                if (fechasEvento.length) fechasEvento.forEach(addDate);
                else addRange(
                    item.fecha_inicio,
                    __orderDetailBlocksIndefinitely(item)
                        ? CP_ORDER_CONVENIO_INDEFINITE_END
                        : item.fecha_fin
                );
                __orderSafeArray(item.premontaje_fechas).forEach(addDate);
            });
        } else if (String(order.espacio_id) === sid) {
            addRange(order.fecha_inicio, orderBlocksIndefinitely ? CP_ORDER_CONVENIO_INDEFINITE_END : order.fecha_fin);
        }
        __orderSafeArray(order.conceptos_adicionales).forEach(c => {
            if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
            const spaceMeta = String(c?.meta?.space_id || order.espacio_id || '');
            if (spaceMeta !== sid) return;
            __orderSafeArray(c?.meta?.dates).forEach(addDate);
        });
    });
    return reserved;
}

function __orderSetDateOnForm(startDate, endDate) {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    let start = __orderNormalizeDate(startDate);
    let end = __orderNormalizeDate(endDate || start);
    const today = __orderTodayISO();
    if (start && start < today) return window.showToast('No se permiten fechas pasadas.', 'error');
    if (end && end < today) return window.showToast('No se permiten fechas pasadas.', 'error');
    if (__orderIsPublicidadSpace(cfg) && !cfg.customPermanence) {
        const month = __orderGetPublicidadMonthBounds(start || end || today);
        start = month.start;
        end = month.end;
    }
    const sEl = document.getElementById('oed-start');
    const eEl = document.getElementById('oed-end');
    if (sEl) sEl.value = start || '';
    if (eEl) eEl.value = end || '';
    __orderSaveActiveFromForm();
    window.recalcTotal();
}

function __orderDateCellClasses(state, flags) {
    const s = __orderNormalizeDate(state.start);
    const e = __orderNormalizeDate(state.end || s);
    const inRange = s && e && flags.ds >= s && flags.ds <= e;
    const isEdge = flags.ds === s || flags.ds === e;
    if (flags.isPast) return 'cal-disabled bg-gray-100 text-gray-300 border border-gray-100 cursor-not-allowed';
    if (flags.isReserved) return 'cal-occupied bg-red-50 text-red-600 border border-red-200 cursor-not-allowed';
    if (flags.isBlocked) return 'cal-occupied bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed';
    if (isEdge) return 'bg-emerald-600 text-white border border-emerald-600';
    if (inRange) return 'bg-emerald-100 text-gray-700 border border-emerald-200';
    return 'bg-white text-gray-700 border border-gray-100 hover:bg-gray-50';
}

function __orderDayPrice(space, ds, guests, options = {}) {
    const value = calculateDayByDayTotal(space, ds, ds, guests, options).total;
    return parseFloat(value || 0) || 0;
}

// Renderiza calendario de evento con reservas confirmadas y costo por día.
async function __orderRenderDatePicker() {
    const grid = document.getElementById('order-date-fc') || document.getElementById('order-date-grid');
    if (!grid) return;
    const label = document.getElementById('order-date-month-label');
    const startLbl = document.getElementById('order-date-picked-start');
    const endLbl = document.getElementById('order-date-picked-end');
    const list = document.getElementById('order-date-reserved-list');
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const state = __ORDER_DATE_PICKER;
    const space = __orderGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const reserved = __orderGetReservedDatesForSpace(cfg.spaceId);
    state.reserved = reserved;

    if (label) label.textContent = '';
    if (startLbl) startLbl.textContent = state.start ? window.safeFormatDate(state.start) : '--';
    if (endLbl) endLbl.textContent = state.end ? window.safeFormatDate(state.end) : '--';

    const events = [];
    allOrders.forEach(order => {
        if (!order || String(order.id) === String(currentPreviewOrder?.id || '')) return;
        if (!__orderIsBlockingStatus(order.status)) return;
        const pushEvent = (fi, ff, title) => {
            const start = __orderNormalizeDate(fi || '');
            const end = __orderNormalizeDate(ff || fi || '');
            if (!start || !end) return;
            events.push({
                id: `${order.id}-${cfg.spaceId}-${start}`,
                title,
                start,
                end: __orderAddDays(end, 1),
                allDay: true,
                backgroundColor: '#1f2937',
                borderColor: '#1f2937',
                textColor: '#ffffff'
            });
        };
        const details = parseSpacesDetail(order.espacios_detalle);
        if (details.length) {
            details.forEach(item => {
                if (String(item.espacio_id || item.space_id || '') !== String(cfg.spaceId)) return;
                const eventDates = __orderSafeArray(item.fechas_evento).map(__orderNormalizeDate).filter(Boolean).sort();
                if (eventDates.length) {
                    let chunkStart = eventDates[0];
                    let prev = eventDates[0];
                    const flush = () => {
                        pushEvent(chunkStart, prev, order.cliente_nombre || 'Ocupado');
                    };
                    for (let i = 1; i < eventDates.length; i++) {
                        const expected = __orderAddDays(prev, 1);
                        if (eventDates[i] !== expected) {
                            flush();
                            chunkStart = eventDates[i];
                        }
                        prev = eventDates[i];
                    }
                    flush();
                    return;
                }
                pushEvent(item.fecha_inicio, item.fecha_fin, order.cliente_nombre || 'Ocupado');
            });
        } else if (String(order.espacio_id) === String(cfg.spaceId)) {
            pushEvent(order.fecha_inicio, order.fecha_fin, order.cliente_nombre || 'Ocupado');
        }
    });

    if (state.start) {
        events.push({
            id: '__selection_event',
            start: state.start,
            end: __orderAddDays(state.end || state.start, 1),
            display: 'background',
            backgroundColor: 'rgba(16, 185, 129, 0.22)',
            borderColor: 'transparent',
            allDay: true
        });
    }

    if (__orderEventPickerCal) {
        __orderEventPickerCal.destroy();
        __orderEventPickerCal = null;
    }
    __orderEventPickerCal = new FullCalendar.Calendar(grid, {
        initialView: 'dayGridMonth',
        locale: 'es',
        initialDate: state.start || __orderTodayISO(),
        height: '100%',
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        events,
        dateClick: (info) => { window.pickOrderDate(info.dateStr); },
        dayCellDidMount: (arg) => {
            const ds = __orderToYMD(arg.date);
            const isPast = ds < __orderTodayISO();
            const isReserved = reserved.has(ds);
            const isBlocked = !isPast && !isReserved && !!space && __orderIsBlockedDate(space, ds, guests);
            if (isPast || isReserved || isBlocked) {
                arg.el.classList.add('opacity-60');
                arg.el.style.backgroundColor = isReserved ? '#fef2f2' : '#f3f4f6';
            }
            if (!isPast && !isReserved && !isBlocked && space && guests > 0) {
                const p = __orderDayPrice(space, ds, guests);
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
    __orderEventPickerCal.render();

    if (list) {
        const rows = Array.from(reserved).filter(d => d >= __orderTodayISO()).sort().slice(0, 45);
        list.innerHTML = rows.length
            ? rows.map(d => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join('')
            : '<p class="text-[10px] text-gray-400 italic">Sin reservas confirmadas visibles.</p>';
    }
}

// Abre modal de calendario de evento y aplica ajuste visual del FullCalendar.
window.openOrderDatePicker = async function (target = 'start') {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const baseDate = __orderNormalizeDate(document.getElementById('oed-start')?.value || cfg.startDate || __orderTodayISO());
    const base = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date();
    __ORDER_DATE_PICKER.target = target === 'end' ? 'end' : 'start';
    __ORDER_DATE_PICKER.month = base.getMonth();
    __ORDER_DATE_PICKER.year = base.getFullYear();
    __ORDER_DATE_PICKER.start = __orderNormalizeDate(document.getElementById('oed-start')?.value || cfg.startDate || '');
    __ORDER_DATE_PICKER.end = __orderNormalizeDate(document.getElementById('oed-end')?.value || cfg.endDate || __ORDER_DATE_PICKER.start || '');
    window.openModal('order-date-modal');
    await __orderRenderDatePicker();
    __orderRefreshCalendarLayout(__orderEventPickerCal);
};

window.shiftOrderDatePickerMonth = async function (delta) {
    if (!__orderEventPickerCal) return;
    if ((delta || 0) < 0) __orderEventPickerCal.prev();
    else __orderEventPickerCal.next();
};

window.pickOrderDate = async function (ds) {
    if (ds < __orderTodayISO()) return;
    if (__ORDER_DATE_PICKER.reserved?.has(ds)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} ya está ocupada para este espacio.`, 'error');
    const cfg = __orderGetActiveCfg();
    const space = __orderGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    if (space && __orderIsBlockedDate(space, ds, guests)) return window.showToast(`La fecha ${window.safeFormatDate(ds)} está bloqueada para ese espacio.`, 'error');
    if (!__ORDER_DATE_PICKER.start || __ORDER_DATE_PICKER.end) {
        __ORDER_DATE_PICKER.start = ds;
        __ORDER_DATE_PICKER.end = '';
    } else if (ds < __ORDER_DATE_PICKER.start) {
        __ORDER_DATE_PICKER.start = ds;
    } else {
        const range = __orderDatesBetween(__ORDER_DATE_PICKER.start, ds);
        const clash = range.find(d => __ORDER_DATE_PICKER.reserved?.has(d));
        if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, 'error');
        if (space) {
            const blocked = range.find(d => __orderIsBlockedDate(space, d, guests));
            if (blocked) return window.showToast(`El rango incluye fecha bloqueada: ${window.safeFormatDate(blocked)}.`, 'error');
        }
        __ORDER_DATE_PICKER.end = ds;
    }
    await __orderRenderDatePicker();
};

window.applyOrderDatePickerSelection = function () {
    if (!__ORDER_DATE_PICKER.start) return window.showToast('Selecciona al menos una fecha.', 'error');
    __orderSetDateOnForm(__ORDER_DATE_PICKER.start, __ORDER_DATE_PICKER.end || __ORDER_DATE_PICKER.start);
    window.closeModal('order-date-modal');
};

window.toggleOrderPremontaje = function (skipSync) {
    const enabled = !!document.getElementById('oed-chk-premontaje')?.checked;
    const days = document.getElementById('oed-premontaje');
    const courtesy = document.getElementById('oed-premontaje-cortesia');
    const btn = document.getElementById('oed-btn-montaje');
    const box = document.getElementById('oed-premontaje-fields');
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
    if (enabled && !skipSync) window.handleMontajeInput('oed');
    __orderApplyCourtesyLimitsFromInputs();
    window.actualizarLabelMontaje('oed');
    if (!skipSync) {
        __orderSaveActiveFromForm();
        window.recalcTotal();
    }
};

window.toggleOrderHoras = function (skipSync) {
    const cfg = __orderGetActiveCfg();
    const enabled = !!document.getElementById('oed-chk-horas')?.checked;
    const hrs = document.getElementById('oed-horas');
    const courtesy = document.getElementById('oed-horas-cortesia');
    const unit = document.getElementById('oed-horas-price');
    const box = document.getElementById('oed-horas-fields');
    const heCfg = __orderGetHoraExtraCfg();
    if (box) box.classList.toggle('hidden', !enabled);
    if (hrs) hrs.disabled = !enabled;
    if (courtesy) courtesy.disabled = !enabled;
    if (courtesy) courtesy.max = String(Math.max(0, parseInt(hrs?.value, 10) || 0));
    if (unit) unit.disabled = !enabled || !heCfg.allowCustom;
    if (unit) unit.readOnly = !heCfg.allowCustom;
    if (!enabled) {
        if (hrs) hrs.value = 0;
        if (courtesy) courtesy.value = 0;
    }
    if (cfg) __orderApplyHoraExtraInputState(cfg);
    __orderApplyCourtesyLimitsFromInputs();
    if (!skipSync) {
        __orderSaveActiveFromForm();
        window.recalcTotal();
    }
};

window.handleMontajeInput = function (prefix) {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const enabled = !!document.getElementById('oed-chk-premontaje')?.checked;
    if (!enabled) document.getElementById(prefix + '-premontaje').value = 0;
    const val = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    const btn = document.getElementById(prefix + '-btn-montaje');
    if (val > 0) btn.classList.remove('hidden'); else btn.classList.add('hidden');
    cfg.premontajeDays = val;
    cfg.premontajeDates = __orderSafeArray(cfg.premontajeDates).slice(0, val);
    const courtesyEl = document.getElementById(prefix + '-premontaje-cortesia');
    const courtesy = Math.max(0, parseInt(courtesyEl?.value, 10) || 0);
    if (courtesyEl) courtesyEl.max = String(val);
    cfg.premontajeCourtesyDays = Math.min(courtesy, val);
    if (courtesyEl) courtesyEl.value = cfg.premontajeCourtesyDays;
    __orderApplyCourtesyLimitsFromInputs();
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(prefix);
    window.recalcTotal();
};

window.actualizarLabelMontaje = function (prefix) {
    const cfg = __orderGetActiveCfg();
    const lbl = document.getElementById(prefix + '-lbl-fechas-montaje');
    const dates = __orderSafeArray(cfg?.premontajeDates || []);
    if (dates.length > 0) {
        lbl.innerText = dates.map(d => window.safeFormatDate(d)).join(', ');
        lbl.classList.remove('hidden');
    } else {
        lbl.classList.add('hidden');
    }
};

function __orderSetTextIfExists(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (value === undefined || value === null || String(value).trim() === '') ? '--' : String(value);
}

function __orderFillMontajeInfoPanel(cfg) {
    const sp = __orderGetSpaceById(cfg?.spaceId);
    const quoteName = (document.getElementById('oed-quote-name')?.value || currentPreviewOrder?.nombre_cotizacion || currentPreviewOrder?.detalles_evento?.nombre_cotizacion || '').trim();
    const clientName = (document.getElementById('oed-client')?.value || currentPreviewOrder?.cliente_nombre || '').trim();
    const schedule = (cfg?.horarioText || cfg?.horarioValue || '').trim();
    const eventStart = __orderNormalizeDate(cfg?.startDate || currentPreviewOrder?.fecha_inicio || '');
    const eventEnd = __orderNormalizeDate(cfg?.endDate || currentPreviewOrder?.fecha_fin || eventStart || '');
    const eventRange = eventStart ? (eventEnd && eventEnd !== eventStart ? `${window.safeFormatDate(eventStart)} al ${window.safeFormatDate(eventEnd)}` : window.safeFormatDate(eventStart)) : '--';
    const people = parseInt(cfg?.guests, 10) || parseInt(currentPreviewOrder?.personas, 10) || 0;
    const totalVal = parseFloat(document.getElementById('oed-price')?.value || currentPreviewOrder?.precio_final || 0) || 0;
    const totalFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalVal);

    __orderSetTextIfExists('mtg-info-client', clientName || '--');
    __orderSetTextIfExists('mtg-info-quote', quoteName || '--');
    __orderSetTextIfExists('mtg-info-space', sp?.nombre || cfg?.spaceId || '--');
    __orderSetTextIfExists('mtg-info-schedule', schedule || '--');
    __orderSetTextIfExists('mtg-info-event-range', eventRange);
    __orderSetTextIfExists('mtg-info-people', `${people} px`);
    __orderSetTextIfExists('mtg-info-total', totalFmt);
}

function __orderIsMontajeUnavailable(ds, cfg, space, guests) {
    const state = __ORDER_MONTAJE_PICKER;
    const isPast = ds < __orderTodayISO();
    const overLimit = !!state.maxDate && ds > state.maxDate;
    const isReserved = state.reserved?.has(ds);
    const isBlocked = !isPast && !isReserved && !!space && __orderIsPremontajeBlockedDate(space, ds);
    return { isPast, overLimit, isReserved, isBlocked, disabled: isPast || overLimit || isReserved || isBlocked };
}

// Renderiza calendario de premontaje con reservas confirmadas y costo aplicado.
async function __orderRenderMontajeDatePicker() {
    const grid = document.getElementById('montaje-fc') || document.getElementById('montaje-date-grid');
    if (!grid) return;
    const cfg = __orderGetActiveCfg();
    const space = __orderGetSpaceById(cfg?.spaceId);
    const guests = parseInt(cfg?.guests, 10) || 1;
    const state = __ORDER_MONTAJE_PICKER;

    const label = document.getElementById('montaje-month-label');
    const startLbl = document.getElementById('montaje-picked-start');
    const endLbl = document.getElementById('montaje-picked-end');
    if (label) label.textContent = '';
    if (startLbl) startLbl.textContent = state.start ? window.safeFormatDate(state.start) : '--';
    if (endLbl) endLbl.textContent = state.end ? window.safeFormatDate(state.end) : '--';

    const events = [];
    allOrders.forEach(order => {
        if (!order || String(order.id) === String(currentPreviewOrder?.id || '')) return;
        if (!__orderIsBlockingStatus(order.status)) return;
        const details = parseSpacesDetail(order.espacios_detalle);
        const premDates = [];
        if (details.length) {
            details.forEach(item => {
                if (String(item.espacio_id || item.space_id || '') !== String(cfg.spaceId)) return;
                __orderSafeArray(item.premontaje_fechas).forEach(d => premDates.push(__orderNormalizeDate(d)));
            });
        }
        __orderSafeArray(order.conceptos_adicionales).forEach(c => {
            if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
            const sid = String(c?.meta?.space_id || order.espacio_id || '');
            if (sid !== String(cfg.spaceId)) return;
            __orderSafeArray(c?.meta?.dates).forEach(d => premDates.push(__orderNormalizeDate(d)));
        });
        const unique = Array.from(new Set(premDates.filter(Boolean))).sort();
        if (!unique.length) return;
        let chunkStart = unique[0];
        let prev = unique[0];
        const pushChunk = (startDs, endDs) => {
            events.push({
                id: `prem-${order.id}-${cfg.spaceId}-${startDs}`,
                title: order.cliente_nombre || 'Premontaje',
                start: startDs,
                end: __orderAddDays(endDs, 1),
                allDay: true,
                backgroundColor: '#374151',
                borderColor: '#374151',
                textColor: '#ffffff'
            });
        };
        for (let i = 1; i < unique.length; i++) {
            const expected = __orderAddDays(prev, 1);
            if (unique[i] !== expected) {
                pushChunk(chunkStart, prev);
                chunkStart = unique[i];
            }
            prev = unique[i];
        }
        pushChunk(chunkStart, prev);
    });

    if (state.start) {
        events.push({
            id: '__selection_montaje',
            start: state.start,
            end: __orderAddDays(state.end || state.start, 1),
            display: 'background',
            backgroundColor: 'rgba(16, 185, 129, 0.22)',
            borderColor: 'transparent',
            allDay: true
        });
    }

    if (__orderMontajePickerCal) {
        __orderMontajePickerCal.destroy();
        __orderMontajePickerCal = null;
    }
    __orderMontajePickerCal = new FullCalendar.Calendar(grid, {
        initialView: 'dayGridMonth',
        locale: 'es',
        initialDate: state.start || __orderTodayISO(),
        height: '100%',
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        events,
        dateClick: (info) => { window.pickMontajeDate(info.dateStr); },
        dayCellDidMount: (arg) => {
            const ds = __orderToYMD(arg.date);
            const flags = __orderIsMontajeUnavailable(ds, cfg, space, guests);
            if (flags.disabled) {
                arg.el.classList.add('opacity-60');
                arg.el.style.backgroundColor = flags.isReserved ? '#fef2f2' : '#f3f4f6';
            }
            if (!flags.disabled && space && guests > 0) {
                const base = __orderDayPrice(space, ds, guests, { ignoreBlocks: true });
                const prem = base * (__orderGetPremPct() / 100);
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
    __orderMontajePickerCal.render();

    const list = document.getElementById('montaje-date-reserved-list');
    if (list) {
        const rows = Array.from(state.reserved || new Set())
            .filter(d => d >= __orderTodayISO() && (!state.maxDate || d <= state.maxDate))
            .sort()
            .slice(0, 45);
        list.innerHTML = rows.length
            ? rows.map(d => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join('')
            : '<p class="text-[10px] text-gray-400 italic">Sin reservas confirmadas visibles.</p>';
    }
}

window.abrirModalMontaje = async function (prefix) {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    window.currentMontajePrefix = prefix;
    const diasM = parseInt(document.getElementById(prefix + '-premontaje').value, 10) || 0;
    if (diasM <= 0) return window.showToast("Ingresa la cantidad de días primero.", "error");
    if (!cfg.startDate) return window.showToast("Primero selecciona la Fecha Inicio del evento.", "error");

    const maxD = new Date(`${cfg.startDate}T00:00:00`);
    maxD.setDate(maxD.getDate() - 1);
    const maxDate = maxD.toISOString().split('T')[0];
    if (maxDate < __orderTodayISO()) return window.showToast("Ya no hay días válidos de premontaje antes del evento.", "error");

    const state = __ORDER_MONTAJE_PICKER;
    state.maxDate = maxDate;
    state.reserved = __orderGetReservedDatesForSpace(cfg.spaceId);
    const selected = __orderSafeArray(cfg.premontajeDates).map(__orderNormalizeDate).filter(Boolean).sort().slice(0, diasM);
    state.start = selected[0] || '';
    state.end = selected.length ? selected[selected.length - 1] : '';
    const baseDate = state.start || maxDate;
    const base = new Date(`${baseDate}T00:00:00`);
    state.year = base.getFullYear();
    state.month = base.getMonth();

    window.tempMontajeDates = selected.slice();
    document.getElementById('montaje-limit-num').innerText = String(diasM);
    __orderFillMontajeInfoPanel(cfg);
    window.openModal('montaje-modal');
    await __orderRenderMontajeDatePicker();
    __orderRefreshCalendarLayout(__orderMontajePickerCal);
};

window.shiftMontajePickerMonth = async function (delta) {
    if (!__orderMontajePickerCal) return;
    if ((delta || 0) < 0) __orderMontajePickerCal.prev();
    else __orderMontajePickerCal.next();
};

window.pickMontajeDate = async function (ds) {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const space = __orderGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const flags = __orderIsMontajeUnavailable(ds, cfg, space, guests);
    if (flags.disabled) return;
    const state = __ORDER_MONTAJE_PICKER;
    if (!state.start || state.end) {
        state.start = ds;
        state.end = '';
    } else if (ds < state.start) {
        state.start = ds;
    } else {
        const range = __orderDatesBetween(state.start, ds);
        const bad = range.find(dateStr => __orderIsMontajeUnavailable(dateStr, cfg, space, guests).disabled);
        if (bad) return window.showToast(`El rango incluye una fecha no disponible: ${window.safeFormatDate(bad)}.`, "error");
        state.end = ds;
    }
    await __orderRenderMontajeDatePicker();
};

window.applyMontajeDatePickerSelection = function () {
    const cfg = __orderGetActiveCfg();
    if (!cfg) return;
    const state = __ORDER_MONTAJE_PICKER;
    if (!state.start) return window.showToast("Selecciona al menos una fecha.", "error");
    const limit = parseInt(document.getElementById(window.currentMontajePrefix + '-premontaje').value, 10) || 0;
    const range = __orderDatesBetween(state.start, state.end || state.start);
    if (limit > 0 && range.length !== limit) return window.showToast(`Debes seleccionar exactamente ${limit} día(s).`, "error");
    const space = __orderGetSpaceById(cfg.spaceId);
    const guests = parseInt(cfg.guests, 10) || 1;
    const bad = range.find(ds => __orderIsMontajeUnavailable(ds, cfg, space, guests).disabled);
    if (bad) return window.showToast(`La fecha ${window.safeFormatDate(bad)} no está disponible.`, "error");

    cfg.premontajeDates = range.slice();
    window.tempMontajeDates = range.slice();
    window.finalMontajeDates = cfg.premontajeDates.slice();
    window.actualizarLabelMontaje(window.currentMontajePrefix);
    window.closeModal('montaje-modal');
    window.recalcTotal();
};

function __orderCalcPremontaje(space, cfg) {
    const guests = parseInt(cfg.guests, 10) || 1;
    const requestedDays = Math.max(0, parseInt(cfg.premontajeDays, 10) || 0);
    const dates = __orderSafeArray(cfg.premontajeDates).map(__orderNormalizeDate).filter(Boolean).sort().slice(0, requestedDays);
    const courtesy = Math.min(requestedDays, Math.max(0, parseInt(cfg.premontajeCourtesyDays, 10) || 0));
    cfg.premontajeCourtesyDays = courtesy;
    const pct = __orderGetPremPct();
    const priced = dates.map(ds => ({ date: ds, base_day: parseFloat(calculateDayByDayTotal(space, ds, ds, guests, { ignoreBlocks: true }).total || 0) || 0 }));
    const billableCount = Math.max(0, priced.length - courtesy);
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

window.updateSummaryUI = function () {
    const spaces = (__orderTotals?.spaces && __orderTotals.spaces.length)
        ? __orderTotals.spaces
        : __orderQuoteSpaces.map(cfg => {
            const sp = __orderGetSpaceById(cfg.spaceId);
            return {
                spaceId: cfg.spaceId,
                spaceName: sp?.nombre || String(cfg.spaceId),
                spaceKey: sp?.clave || '',
                spaceType: cfg.spaceType || sp?.tipo || '',
                isPublicidad: __orderIsPublicidadSpace(cfg),
                startDate: cfg.startDate || '',
                endDate: cfg.endDate || cfg.startDate || '',
                guests: parseInt(cfg.guests, 10) || 0,
                horarioText: cfg.horarioText || cfg.horarioValue || '--',
                premontajeDays: parseInt(cfg.premontajeDays, 10) || 0,
                premontajeCourtesyDays: parseInt(cfg.premontajeCourtesyDays, 10) || 0,
                premontajeDates: __orderSafeArray(cfg.premontajeDates),
                horasExtra: parseInt(cfg.horasExtra, 10) || 0,
                horasExtraCourtesy: parseInt(cfg.horasExtraCourtesy, 10) || 0,
                convenioEnabled: !!cfg.convenioEnabled,
                baseValue: cfg.__pricing?.baseValue ?? (parseFloat(sp?.precio_base || 0) || 0),
                totalSpace: cfg.__pricing?.totalSpace ?? cfg.__pricing?.total ?? 0,
                material: cfg.material || cfg.__pricing?.material || sp?.material || '',
                medidaAncho: cfg.medidaAncho ?? cfg.__pricing?.medidaAncho ?? __orderNormalizeMeasureValue(sp?.medida_ancho ?? sp?.ancho),
                medidaAlto: cfg.medidaAlto ?? cfg.__pricing?.medidaAlto ?? __orderNormalizeMeasureValue(sp?.medida_alto ?? sp?.alto),
                medidaUnit: cfg.medidaUnit || cfg.__pricing?.medidaUnit || __orderNormalizeMeasureUnit(sp?.medida_unidad || sp?.unidad_medida || 'M'),
                capacityOk: true,
                blockedOk: true
            };
        });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const setHtml = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
    };
    const rangeLabel = (fi, ff) => {
        if (!fi && !ff) return '--';
        const s = fi ? window.safeFormatDate(fi) : window.safeFormatDate(ff);
        const e = ff ? window.safeFormatDate(ff) : s;
        return fi && ff && fi !== ff ? `${s} al ${e}` : s;
    };
    const moneyLabel = (value) => __orderFormatMoneyMx(value);
    const measureValueLabel = (value) => {
        const num = parseFloat(value);
        if (!Number.isFinite(num)) return '';
        return String(num).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    };
    const publicidadMeasureLabel = (sp) => {
        const unit = String(sp.medidaUnit || 'M').trim().toUpperCase();
        const width = measureValueLabel(sp.medidaAncho);
        const height = measureValueLabel(sp.medidaAlto);
        if (width && height) return `${width} x ${height} ${unit}`;
        if (width || height) return `${width || height} ${unit}`;
        return 'Sin medidas';
    };
    const publicidadRowsHtml = (sp, issueLabel, includeReview) => {
        const dateText = sp.blocksIndefinitely ? `${window.safeFormatDate(sp.startDate)} al Indefinido` : rangeLabel(sp.startDate, sp.endDate);
        const detailInfo = __orderBuildPublicityDetailInfo(sp, __orderGetSpaceById(sp.spaceId));
        const materialText = String(detailInfo.detailLabel || '').trim() || 'Sin material';
        const typeText = String(sp.spaceType || __orderGetSpaceById(sp.spaceId)?.tipo || 'PUBLICIDAD').toUpperCase();
        const baseText = moneyLabel(sp.baseValue ?? sp.base ?? 0);
        const totalText = sp.convenioEnabled
            ? __orderFormatSignedMoneyMx(sp.totalSpace ?? sp.total ?? sp.subtotalSpace ?? 0)
            : moneyLabel(sp.totalSpace ?? sp.total ?? sp.subtotalSpace ?? 0);
        const totalLabel = sp.convenioEnabled ? 'Balance convenio' : 'Total espacio';
        const reviewHtml = includeReview
            ? `<div class="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1 mt-1 font-bold text-gray-700"><span>Revisión</span><span class="${(sp.capacityOk === false || sp.blockedOk === false) ? 'text-red-600' : 'text-emerald-700'}">${__cpSafeHtml(issueLabel)}</span></div>`
            : '';
        // Auditoria TI: publicidad/convenio CP replica la tarjeta operativa de
        // Plaza Mayor para que orden_detail conserve la misma lectura visual.
        return `
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Fechas</span><span class="text-right">${__cpSafeHtml(dateText)}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Base</span><span class="text-right">${__cpSafeHtml(baseText)}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Tipo</span><span class="text-right">${__cpSafeHtml(typeText)}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Detalle</span><span class="text-right max-w-[180px]">${__cpSafeHtml(materialText)}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Medidas</span><span class="text-right">${__cpSafeHtml(detailInfo.measureLabel || publicidadMeasureLabel(sp))}</span></div>
                    <div class="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1 mt-1 font-bold text-gray-700"><span>${totalLabel}</span><span class="${sp.convenioEnabled ? ((parseFloat(sp.totalSpace || sp.total || 0) || 0) < 0 ? 'text-red-600' : ((parseFloat(sp.totalSpace || sp.total || 0) || 0) > 0 ? 'text-emerald-700' : 'text-gray-700')) : ''}">${__cpSafeHtml(totalText)}</span></div>
                    ${reviewHtml}`;
    };

    const starts = spaces.map(s => s.startDate).filter(Boolean).sort();
    const ends = spaces.map(s => s.endDate || s.startDate).filter(Boolean).sort();
    const hasConvenioSummary = spaces.some((sp) => !!sp.blocksIndefinitely);
    const globalDates = starts.length
        ? (hasConvenioSummary ? `${window.safeFormatDate(starts[0])} al Indefinido` : rangeLabel(starts[0], ends[ends.length - 1]))
        : '--';

    const nonPublicidadSpaces = spaces.filter(sp => !sp.isPublicidad);
    const totalGuests = nonPublicidadSpaces.reduce((acc, sp) => acc + (parseInt(sp.guests, 10) || 0), 0);
    const totalPrem = nonPublicidadSpaces.reduce((acc, sp) => acc + (parseInt(sp.premontajeDays, 10) || 0), 0);
    const totalPremCourtesy = nonPublicidadSpaces.reduce((acc, sp) => acc + Math.min(parseInt(sp.premontajeDays, 10) || 0, parseInt(sp.premontajeCourtesyDays, 10) || 0), 0);
    const totalHours = nonPublicidadSpaces.reduce((acc, sp) => acc + (parseInt(sp.horasExtra, 10) || 0), 0);
    const totalHoursCourtesy = nonPublicidadSpaces.reduce((acc, sp) => acc + Math.min(parseInt(sp.horasExtra, 10) || 0, parseInt(sp.horasExtraCourtesy, 10) || 0), 0);
    const blockedIssue = spaces.some(sp => sp.blockedOk === false);
    const capacityIssue = spaces.some(sp => sp.capacityOk === false);

    const quoteName = (document.getElementById('oed-quote-name')?.value || '').trim() || 'Sin nombre';
    const clientName = (document.getElementById('oed-client')?.value || '').trim() || 'Sin cliente';

    setText('sum-quote-name', quoteName);
    setText('sum-client', clientName);
    setText('sum-dates', globalDates);
    setText('sum-spaces-count', String(spaces.length));
    setText('sum-guests', nonPublicidadSpaces.length ? `${totalGuests} px` : 'No aplica');

    const statusEl = document.getElementById('sum-status');
    const statusText = (blockedIssue || capacityIssue) ? 'Requiere revisión' : 'Sin conflictos';
    if (statusEl) {
        if (blockedIssue || capacityIssue) {
            statusEl.textContent = statusText;
            statusEl.classList.remove('text-emerald-600');
            statusEl.classList.add('text-red-600');
        } else {
            statusEl.textContent = statusText;
            statusEl.classList.remove('text-red-600');
            statusEl.classList.add('text-emerald-600');
        }
    }

    const detailSummaryView = IS_ORDER_DETAIL_PAGE || IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode();
    const previewSummaryView = IS_ORDER_PREVIEW_PAGE || __cpIsPreviewOnlyQueryMode();
    const spacesHtml = spaces.map((sp, idx) => {
        const isActive = String(sp.spaceId || '') === String(__orderActiveSpaceId || '');
        const isPublicidad = !!sp.isPublicidad;
        const premDays = parseInt(sp.premontajeDays, 10) || 0;
        const premCourtesy = Math.min(premDays, parseInt(sp.premontajeCourtesyDays, 10) || 0);
        const premBillable = Math.max(0, premDays - premCourtesy);
        const hours = parseInt(sp.horasExtra, 10) || 0;
        const hoursCourtesy = Math.min(hours, parseInt(sp.horasExtraCourtesy, 10) || 0);
        const hoursBillable = Math.max(0, hours - hoursCourtesy);
        const issueLabel = sp.capacityOk === false
            ? 'Aforo excedido'
            : (sp.blockedOk === false ? 'Fecha bloqueada' : 'Sin conflictos');
        if (detailSummaryView) {
            const stateClass = isActive
                ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200'
                : `border-gray-200 bg-white ${previewSummaryView ? '' : 'hover:border-brand-red'}`;
            const stateLabel = isActive ? 'En edición' : (previewSummaryView ? 'Activo' : 'Editar');
            return `<button type="button" ${previewSummaryView ? 'disabled' : `onclick="window.selectOrderQuoteSpace('${sp.spaceId}')"`} class="w-full text-left ${stateClass} border rounded-xl p-3 transition ${previewSummaryView ? 'cursor-default' : 'cursor-pointer'} ${idx > 0 ? 'mt-2' : ''}">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <p class="text-[11px] font-black uppercase text-gray-800">${sp.spaceName || 'Espacio'}</p>
                        <p class="text-[10px] font-mono text-gray-400">${sp.spaceKey || '---'}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-[9px] font-bold uppercase tracking-wide text-right ${isActive ? 'text-emerald-700' : 'text-gray-400'}">${stateLabel}</span>
                        ${sp.convenioEnabled ? '<span class="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-800">Convenio</span>' : ''}
                    </div>
                </div>
                <div class="mt-2 space-y-1 text-[10px] text-gray-600">
                    ${isPublicidad ? publicidadRowsHtml(sp, issueLabel, true) : `
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Fechas</span><span class="text-right">${sp.blocksIndefinitely ? `${window.safeFormatDate(sp.startDate)} al Indefinido` : rangeLabel(sp.startDate, sp.endDate)}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Personas</span><span class="text-right">${parseInt(sp.guests, 10) || 0} px</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Horario</span><span class="text-right max-w-[180px]">${sp.horarioText || '--'}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Premontaje</span><span class="text-right">${premDays > 0 ? `${premBillable} facturable(s) de ${premDays}` : 'Sin premontaje'}</span></div>
                    <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Horas extra</span><span class="text-right">${hours > 0 ? `${hoursBillable} facturable(s) de ${hours}` : 'Sin horas extra'}</span></div>
                    <div class="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1 mt-1 font-bold text-gray-700"><span>Revisión</span><span class="${(sp.capacityOk === false || sp.blockedOk === false) ? 'text-red-600' : 'text-emerald-700'}">${issueLabel}</span></div>`}
                </div>
            </button>`;
        }
        const badges = [
            isPublicidad ? '<span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Publicidad</span>' : '<span class="px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200">Espacio</span>',
            sp.convenioEnabled ? '<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Convenio</span>' : '',
            isActive ? '<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-300">Espacio en edición</span>' : '',
            sp.capacityOk === false ? '<span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Aforo excedido</span>' : '',
            sp.blockedOk === false ? '<span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Fecha bloqueada</span>' : ''
        ].filter(Boolean).join('');
        return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left ${isActive ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200' : 'bg-white border-gray-200 hover:border-brand-red'} border rounded-lg p-3 transition cursor-pointer">
            <div class="flex items-start justify-between gap-2">
                <div>
                    <p class="text-[11px] font-black text-gray-800">${sp.spaceName || 'Espacio'}</p>
                    <p class="text-[10px] font-mono text-gray-400">${sp.spaceKey || '---'}</p>
                </div>
                <div class="text-[9px] font-bold text-right text-gray-500">${badges || ''}</div>
            </div>
            <div class="mt-2 space-y-1 text-[10px] text-gray-600">
                ${isPublicidad ? publicidadRowsHtml(sp, issueLabel, false) : `
                <div class="flex justify-between"><span class="font-bold text-gray-400">Fechas</span><span>${sp.blocksIndefinitely ? `${window.safeFormatDate(sp.startDate)} al Indefinido` : rangeLabel(sp.startDate, sp.endDate)}</span></div>
                <div class="flex justify-between"><span class="font-bold text-gray-400">Personas</span><span>${parseInt(sp.guests, 10) || 0} px</span></div>
                <div class="flex justify-between"><span class="font-bold text-gray-400">Horario</span><span class="text-right">${sp.horarioText || '--'}</span></div>
                <div class="flex justify-between"><span class="font-bold text-gray-400">Premontaje</span><span>${premBillable} facturable(s) de ${premDays}</span></div>
                <div class="flex justify-between"><span class="font-bold text-gray-400">Horas extra</span><span>${hoursBillable} facturable(s) de ${hours}</span></div>`}
            </div>
        </button>`;
    }).join('');
    setHtml('sum-spaces-list', spacesHtml || '<div class="text-[10px] text-gray-400 italic">Sin espacios seleccionados.</div>');

    setText('sum-schedule', spaces.length === 1 ? (spaces[0].isPublicidad ? 'No aplica' : (spaces[0].horarioText || '--')) : `${spaces.length} espacios`);
    setText('sum-montaje', nonPublicidadSpaces.length ? `${Math.max(0, totalPrem - totalPremCourtesy)} facturable(s) de ${totalPrem}` : 'No aplica');
    setText('sum-hextras', nonPublicidadSpaces.length ? `${Math.max(0, totalHours - totalHoursCourtesy)} facturable(s) de ${totalHours}` : 'No aplica');
};

window.recalcTotal = function () {
    __orderSaveActiveFromForm();
    const taxByName = {};
    let baseAndLogistics = 0;
    let taxesTotal = 0;
    const spacesData = [];

    __orderQuoteSpaces.forEach(cfg => {
        const space = __orderGetSpaceById(cfg.spaceId);
        if (!space) return;
        const isPublicidad = __orderIsPublicidadSpace(space);
        cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept);
        const isConvenio = isPublicidad && !!cfg.convenioEnabled;
        const convenioItems = isConvenio ? __orderGetConvenioConcepts(cfg) : [];
        const convenioValue = convenioItems.reduce((sum, concept) => sum + (parseFloat(concept.amount ?? concept.value ?? 0) || 0), 0);
        const convenioCovered = isConvenio ? __orderConvenioCovered(parseFloat(space?.precio_base || 0) || 0, convenioValue) : false;
        const blocksIndefinitely = convenioCovered && !__orderHasFiniteConvenioEndDate(cfg?.endDate);
        const guests = parseInt(cfg.guests, 10) || 1;
        const maxCapacity = __orderGetSpaceMaxCapacity(space);
        const capacityOk = isPublicidad ? true : !(maxCapacity < 999999 && guests > maxCapacity);
        const blockedOk = isPublicidad ? true : !__orderCfgHasBlockedDates(cfg);
        const base = __orderResolveBaseTotal(cfg, space, guests);
        const horarioCost = isPublicidad ? 0 : (parseFloat(cfg.horarioPrice || 0) || 0);
        const prem = isPublicidad ? { total: 0, breakdown: [] } : __orderCalcPremontaje(space, cfg);
        if (!__orderGetHoraExtraCfg().allowCustom) {
            cfg.horasExtraUnit = __orderResolveHoraExtraUnit(space);
        } else if (!Number.isFinite(parseFloat(cfg.horasExtraUnit))) {
            cfg.horasExtraUnit = __orderResolveHoraExtraUnit(space);
        }
        cfg.premontajeCourtesyDays = isPublicidad ? 0 : Math.min(parseInt(cfg.premontajeDays, 10) || 0, parseInt(cfg.premontajeCourtesyDays, 10) || 0);
        const rawHours = isPublicidad ? 0 : (parseInt(cfg.horasExtra, 10) || 0);
        const courtesyHours = isPublicidad ? 0 : Math.min(rawHours, Math.max(0, parseInt(cfg.horasExtraCourtesy, 10) || 0));
        cfg.horasExtraCourtesy = courtesyHours;
        const billableHours = isPublicidad ? 0 : Math.max(0, rawHours - courtesyHours);
        const horasCost = isPublicidad ? 0 : (billableHours * (parseFloat(cfg.horasExtraUnit || 0) || 0));
        let subtotal = (capacityOk && blockedOk) ? (base + horarioCost + prem.total + horasCost) : 0;
        if (isConvenio) subtotal = Math.max(0, base - convenioValue);
        if (!isPublicidad) {
            if (space.ajuste_tipo === 'aumento') subtotal += subtotal * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
            if (space.ajuste_tipo === 'descuento') subtotal -= subtotal * ((parseFloat(space.ajuste_porcentaje) || 0) / 100);
        }

        const taxIds = isConvenio ? [] : __orderResolveCfgTaxIds(cfg, space);
        const taxBreakdown = [];
        let taxSubtotal = 0;
        taxIds.forEach(tid => {
            const tax = __orderResolveTaxRecord(tid, space);
            if (!tax) return;
            const rate = __orderResolveTaxRate(tax);
            const value = subtotal * rate;
            taxSubtotal += value;
            taxBreakdown.push({ name: tax.nombre || 'Impuesto', value });
            taxByName[tax.nombre] = (taxByName[tax.nombre] || 0) + value;
        });

        baseAndLogistics += subtotal;
        taxesTotal += taxSubtotal;
        cfg.__pricing = {
            spaceId: cfg.spaceId,
            spaceName: space.nombre,
            spaceKey: space.clave,
            spaceType: cfg.spaceType || space.tipo || '',
            isPublicidad,
            startDate: cfg.startDate,
            endDate: cfg.endDate,
            guests: isPublicidad ? 1 : guests,
            maxCapacity,
            capacityOk,
            blockedOk,
            base,
            horarioValue: cfg.horarioValue,
            horarioText: cfg.horarioText,
            horarioCost,
            horarioCustomStart: cfg.horarioCustomStart || '',
            horarioCustomEnd: cfg.horarioCustomEnd || '',
            premontajeDays: cfg.premontajeDays,
            premontajeCourtesyDays: cfg.premontajeCourtesyDays,
            premontajeDates: __orderSafeArray(cfg.premontajeDates),
            premontajeTotal: prem.total,
            premontajeBreakdown: prem.breakdown,
            horasExtra: rawHours,
            horasExtraCourtesy: courtesyHours,
            horasExtraBillable: billableHours,
            horasExtraUnit: cfg.horasExtraUnit,
            horasExtraTotal: horasCost,
            convenioEnabled: isConvenio,
            convenioCovered,
            blocksIndefinitely,
            concepts: isConvenio ? convenioItems : [],
            convenioValue,
            baseValue: base,
            subtotalSpace: subtotal,
            taxIds,
            taxTotal: taxSubtotal,
            totalSpace: subtotal + taxSubtotal,
            taxBreakdown,
            customPermanence: !!cfg.customPermanence,
            customPriceEnabled: !!cfg.customPriceEnabled && !isConvenio,
            customPriceMode: cfg.customPriceMode || 'total',
            customBasePrice: cfg.customBasePrice,
            material: cfg.material || space.material || '',
            medidaAncho: cfg.medidaAncho ?? __orderNormalizeMeasureValue(space.medida_ancho ?? space.ancho),
            medidaAlto: cfg.medidaAlto ?? __orderNormalizeMeasureValue(space.medida_alto ?? space.alto),
            medidaUnit: cfg.medidaUnit || __orderNormalizeMeasureUnit(space.medida_unidad || space.unidad_medida || 'M')
        };
        spacesData.push(cfg.__pricing);
    });

    const catalogBaseTotal = spacesData.reduce((sum, sp) => sum + (parseFloat(sp.baseValue ?? sp.base ?? 0) || 0), 0);
    const summaryStateClass = (active) => active
        ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200'
        : 'border-gray-200 bg-gray-50';
    const summaryStateLabel = (active) => active
        ? '<span class="text-[9px] font-bold uppercase tracking-wide text-emerald-700">En edición</span>'
        : '<span class="text-[9px] font-bold uppercase tracking-wide text-gray-400">Espacio</span>';
    const renderPublicityPricingCard = (sp, isActive) => {
        const spaceRef = sp.spaceKey ? `${sp.spaceName} [${sp.spaceKey}]` : (sp.spaceName || 'Espacio');
        const ruleMeta = __orderDescribePublicityPricingRule(sp, __orderGetSpaceById(sp.spaceId), sp.baseValue ?? sp.base ?? 0);
        const detailRows = (ruleMeta.detailRows || []).map((row) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${row.label}</span><span class="text-right">${row.value}</span></div>`).join('');
        if (sp.convenioEnabled) {
            const convenioRows = (sp.concepts || []).length
                ? (sp.concepts || []).map((concept) => `<div class="flex justify-between gap-3 text-[10px] text-amber-700"><span>${concept.description || 'Trato de convenio'}</span><span class="text-right font-bold">-${__orderFormatMoneyMx(concept.amount || concept.value || 0)}</span></div>`).join('')
                : '<div class="text-[10px] text-gray-400 italic">Sin tratos registrados en este espacio.</div>';
            return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-3 transition hover:border-brand-red">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
                    ${summaryStateLabel(isActive)}
                </div>
                <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
                    <div class="flex justify-between text-[10px] text-gray-500"><span>Modo</span><span class="text-right font-bold text-gray-700">${ruleMeta.modeLabel}</span></div>
                    <div class="flex justify-between text-[10px] text-gray-500"><span>Valor base del espacio</span><span>${__orderFormatMoneyMx(sp.base || 0)}</span></div>
                    ${detailRows}
                    <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Regla aplicada</span><span class="text-right max-w-[230px] font-bold text-gray-700">${ruleMeta.explanation}</span></div>
                </div>
                <div class="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-1.5">
                    <p class="text-[10px] font-bold uppercase text-amber-700">Tratos del convenio</p>
                    ${convenioRows}
                    <div class="flex justify-between text-[10px] font-bold text-amber-800 border-t border-dashed border-amber-200 pt-1"><span>Total entregable</span><span>${__orderFormatMoneyMx(sp.convenioValue || 0)}</span></div>
                </div>
                <div class="space-y-1.5">
                    <div class="flex justify-between text-[10px] text-gray-500"><span>Balance del convenio</span><span class="${(parseFloat(sp.totalSpace || 0) || 0) < 0 ? 'text-red-600' : ((parseFloat(sp.totalSpace || 0) || 0) > 0 ? 'text-emerald-700' : 'text-gray-500')}">${__orderFormatSignedMoneyMx(sp.totalSpace || 0)}</span></div>
                    <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Estado actual</span><span>${Math.abs(parseFloat(sp.totalSpace || 0) || 0) < 0.005 ? 'Justo' : ((parseFloat(sp.totalSpace || 0) || 0) > 0 ? 'A favor del espacio' : 'A favor del trato')}</span></div>
                </div>
            </button>`;
        }
        return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-3 transition hover:border-brand-red">
            <div class="flex items-start justify-between gap-2">
                <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
                ${summaryStateLabel(isActive)}
            </div>
            <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
                <div class="flex justify-between text-[10px] text-gray-500"><span>Modo de cálculo</span><span class="text-right font-bold text-gray-700 max-w-[190px]">${ruleMeta.modeLabel}</span></div>
                <div class="flex justify-between text-[10px] text-gray-500"><span>Precio base catálogo (30 días)</span><span>${__orderFormatMoneyMx(__orderGetSpaceById(sp.spaceId)?.precio_base || 0)}</span></div>
                ${detailRows}
                <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Fórmula aplicada</span><span class="text-right max-w-[230px] font-bold text-gray-700">${ruleMeta.explanation}</span></div>
                <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Base facturable</span><span>${__orderFormatMoneyMx(sp.base || 0)}</span></div>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
                <p class="text-[10px] font-bold uppercase text-gray-400">Conceptos adicionales</p>
                <div class="text-[10px] text-gray-400 italic">Sin conceptos extra en este espacio.</div>
                <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Total conceptos</span><span>${__orderFormatMoneyMx(0)}</span></div>
            </div>
            <div class="space-y-1.5">
                <div class="flex justify-between text-[10px] text-gray-500"><span>Subtotal antes de impuestos</span><span>${__orderFormatMoneyMx(sp.subtotalSpace || 0)}</span></div>
                <div class="flex justify-between text-[10px] text-gray-500"><span>Ajuste aplicado</span><span class="${(parseFloat(sp.adjustmentShare || 0) || 0) < 0 ? 'text-red-600' : ((parseFloat(sp.adjustmentShare || 0) || 0) > 0 ? 'text-emerald-700' : 'text-gray-500')}">${__orderFormatSignedMoneyMx(sp.adjustmentShare || 0)}</span></div>
                <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Subtotal ajustado</span><span>${__orderFormatMoneyMx(sp.adjustedSubtotal ?? sp.subtotalSpace ?? 0)}</span></div>
            </div>
        </button>`;
    };
    const renderPublicityTaxCard = (sp, isActive) => {
        const spaceRef = sp.spaceKey ? `${sp.spaceName} [${sp.spaceKey}]` : (sp.spaceName || 'Espacio');
        if (sp.convenioEnabled) {
            return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-2 transition hover:border-brand-red">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
                    ${summaryStateLabel(isActive)}
                </div>
                <div class="flex justify-between text-[10px] text-gray-500"><span>Impuestos</span><span>No aplica</span></div>
                <div class="text-[10px] text-gray-400 italic">Los convenios no solicitan factura ni impuestos dentro del cierre documental.</div>
                <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Balance del espacio</span><span>${__orderFormatSignedMoneyMx(sp.totalSpace || 0)}</span></div>
            </button>`;
        }
        const taxRows = Array.isArray(sp.taxBreakdown) && sp.taxBreakdown.length
            ? sp.taxBreakdown.map((tax) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${tax.name}</span><span>+${__orderFormatMoneyMx(tax.value)}</span></div>`).join('')
            : '<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>';
        return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-2 transition hover:border-brand-red">
            <div class="flex items-start justify-between gap-2">
                <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
                ${summaryStateLabel(isActive)}
            </div>
            <div class="flex justify-between text-[10px] text-gray-500"><span>Subtotal gravable</span><span>${__orderFormatMoneyMx(sp.adjustedSubtotal ?? sp.subtotalSpace ?? 0)}</span></div>
            <div class="space-y-1">${taxRows}</div>
            <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Total impuestos</span><span>${__orderFormatMoneyMx(sp.taxTotal || 0)}</span></div>
            <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Total espacio</span><span>${__orderFormatMoneyMx(sp.totalSpace || 0)}</span></div>
        </button>`;
    };

    let conceptsHtml = '';
    let conceptsSum = 0;
    spacesData.forEach(sp => {
        const isActive = String(sp.spaceId || '') === String(__orderActiveSpaceId || '');
        if (sp.isPublicidad || sp.convenioEnabled) {
            conceptsHtml += renderPublicityPricingCard(sp, isActive);
            return;
        }
        const spaceRef = sp.spaceKey ? `${sp.spaceName} [${sp.spaceKey}]` : (sp.spaceName || 'Espacio');
        const head = `<div class="flex items-start justify-between gap-2"><p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>${summaryStateLabel(isActive)}</div>`;
        const lines = [];
        if (sp.convenioEnabled) {
            lines.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>Valor base</span><span>${(parseFloat(sp.base || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            (sp.concepts || []).forEach((concept) => {
                lines.push(`<div class="flex justify-between text-[10px] text-amber-700"><span>${concept.description || 'Trato de convenio'}</span><span>-${(parseFloat(concept.amount || concept.value || 0) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            });
            lines.push(`<div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1 mt-1"><span>Balance convenio</span><span>${(parseFloat(sp.totalSpace || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
        } else {
            lines.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>Renta base</span><span>${(parseFloat(sp.base || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            if ((parseFloat(sp.horarioCost || 0) || 0) > 0) lines.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>Horario</span><span>${(parseFloat(sp.horarioCost || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            if ((parseFloat(sp.premontajeTotal || 0) || 0) > 0) lines.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>Premontaje (${Math.max(0, (parseInt(sp.premontajeDays, 10) || 0) - (parseInt(sp.premontajeCourtesyDays, 10) || 0))} fact.)</span><span>${(parseFloat(sp.premontajeTotal || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            if ((parseFloat(sp.horasExtraTotal || 0) || 0) > 0) lines.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>Horas extra (${parseInt(sp.horasExtraBillable, 10) || 0} fact.)</span><span>${(parseFloat(sp.horasExtraTotal || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            lines.push(`<div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1 mt-1"><span>Subtotal espacio</span><span>${(parseFloat(sp.subtotalSpace || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
        }
        conceptsHtml += `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-1.5 transition hover:border-brand-red">${head}${lines.join('')}</button>`;
    });
    const extraConceptRows = [];
    (currentConcepts || []).forEach(c => {
        const amt = parseFloat(c.amount || c.value || 0) || 0;
        conceptsSum += amt;
        extraConceptRows.push(`<div class="flex justify-between text-[10px] text-gray-500"><span><i class="fa-solid fa-plus text-gray-300 mr-1"></i> ${c.description || 'Concepto'}</span><span>+${amt.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
    });
    if (extraConceptRows.length) {
        conceptsHtml += `<div class="pt-2 border-t border-dashed border-gray-200 space-y-1">${extraConceptRows.join('')}</div>`;
    }
    document.getElementById('oed-summary-concepts').innerHTML = conceptsHtml;

    const convenioMode = spacesData.some((sp) => !!sp.convenioEnabled);
    const subtotalRaw = baseAndLogistics + conceptsSum;
    let adjusted = subtotalRaw;
    const rawAdjType = document.getElementById('oed-adj-type').value;
    const rawAdjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0;
    const rawIsPercent = document.getElementById('oed-adj-unit').value === 'percent';
    const adjType = convenioMode ? 'ninguno' : rawAdjType;
    const adjVal = convenioMode ? 0 : rawAdjVal;
    const isPercent = convenioMode ? false : rawIsPercent;
    let adjustment = 0;
    if (adjType !== 'ninguno') {
        adjustment = isPercent ? subtotalRaw * (adjVal / 100) : adjVal;
        if (adjType === 'descuento') adjusted -= adjustment;
        if (adjType === 'aumento') adjusted += adjustment;
    }

    Object.keys(taxByName).forEach((key) => { delete taxByName[key]; });
    taxesTotal = 0;
    const ratioDenom = baseAndLogistics > 0 ? baseAndLogistics : Math.max(1, spacesData.length);
    spacesData.forEach((sp) => {
        const ratio = baseAndLogistics > 0
            ? ((parseFloat(sp.subtotalSpace || 0) || 0) / ratioDenom)
            : (1 / Math.max(1, spacesData.length));
        sp.adjustmentShare = convenioMode ? 0 : (adjustment * ratio * (adjType === 'descuento' ? -1 : 1));
        sp.adjustedSubtotal = sp.convenioEnabled
            ? (parseFloat(sp.subtotalSpace || 0) || 0)
            : ((parseFloat(sp.subtotalSpace || 0) || 0) + sp.adjustmentShare);
        sp.taxBreakdown = sp.convenioEnabled
            ? []
            : (sp.taxIds || []).map((tid) => {
                const tax = __orderResolveTaxRecord(tid, __orderGetSpaceById(sp.spaceId));
                if (!tax) return null;
                const name = tax.nombre || 'Impuesto';
                const value = sp.adjustedSubtotal * __orderResolveTaxRate(tax);
                taxByName[name] = (taxByName[name] || 0) + value;
                return { name, value };
            }).filter(Boolean);
        sp.taxTotal = sp.convenioEnabled ? 0 : sp.taxBreakdown.reduce((sum, tax) => sum + (parseFloat(tax.value || 0) || 0), 0);
        sp.totalSpace = (parseFloat(sp.adjustedSubtotal || 0) || 0) + (parseFloat(sp.taxTotal || 0) || 0);
        taxesTotal += sp.taxTotal;
    });

    const adjustmentModeLabel = adjType === 'ninguno'
        ? (convenioMode ? 'No aplica en convenio' : 'Sin ajuste global')
        : `${adjType === 'descuento' ? 'Descuento' : 'Aumento'} ${isPercent ? `${adjVal}%` : __orderFormatMoneyMx(adjVal)}`;
    const adjustmentExplanation = convenioMode
        ? 'En convenio los tratos se restan del valor base del espacio y no se calculan impuestos.'
        : adjType === 'ninguno'
            ? 'No se está aplicando ningún ajuste global sobre el subtotal previo a impuestos.'
            : (isPercent
                ? `${adjType === 'descuento' ? 'Se descuenta' : 'Se aumenta'} ${adjVal}% sobre ${__orderFormatMoneyMx(subtotalRaw)} antes de impuestos.`
                : `${adjType === 'descuento' ? 'Se descuenta' : 'Se aumenta'} un monto fijo de ${__orderFormatMoneyMx(adjVal)} sobre ${__orderFormatMoneyMx(subtotalRaw)} antes de impuestos.`);
    const taxTotalsEntries = Object.entries(taxByName);
    const globalTaxCardHtml = `<div class="rounded-xl border border-gray-200 bg-slate-50 p-3 space-y-1.5">
        <div class="flex items-start justify-between gap-2">
            <p class="text-[10px] font-black uppercase text-gray-700">Impuestos acumulados</p>
            <span class="text-[9px] font-bold uppercase tracking-wide text-gray-400">Global</span>
        </div>
        ${taxTotalsEntries.length
            ? taxTotalsEntries.map(([name, amount]) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${name}</span><span>+${__orderFormatMoneyMx(amount)}</span></div>`).join('')
            : '<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>'}
        <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Total impuestos</span><span>${__orderFormatMoneyMx(taxesTotal)}</span></div>
    </div>`;

    const taxHtml = spacesData.map(sp => {
        const isActive = String(sp.spaceId || '') === String(__orderActiveSpaceId || '');
        if (sp.isPublicidad || sp.convenioEnabled) return renderPublicityTaxCard(sp, isActive);
        const spaceRef = sp.spaceKey ? `${sp.spaceName} [${sp.spaceKey}]` : (sp.spaceName || 'Espacio');
        const rows = [];
        if (sp.convenioEnabled) {
            rows.push('<div class="text-[10px] text-gray-400 italic">Los convenios no generan impuestos, factura, recibo ni contrato.</div>');
        } else if (Array.isArray(sp.taxBreakdown) && sp.taxBreakdown.length) {
            sp.taxBreakdown.forEach((tax) => {
                rows.push(`<div class="flex justify-between text-[10px] text-gray-500"><span>${tax.name}</span><span>+${(parseFloat(tax.value || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
            });
        } else {
            rows.push('<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>');
        }
        rows.push(`<div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1 mt-1"><span>Total impuestos</span><span>${(parseFloat(sp.taxTotal || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
        rows.push(`<div class="flex justify-between text-[10px] font-black text-gray-800"><span>${sp.convenioEnabled ? 'Balance convenio' : 'Total espacio'}</span><span>${(parseFloat(sp.totalSpace || 0)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span></div>`);
        return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} p-3 space-y-1.5 transition hover:border-brand-red"><div class="flex items-start justify-between gap-2"><p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>${summaryStateLabel(isActive)}</div>${rows.join('')}</button>`;
    }).join('');
    document.getElementById('oed-tax-summary-display').innerHTML = `${convenioMode ? '' : globalTaxCardHtml}${taxHtml}`;

    const finalTotal = adjusted + taxesTotal;
    const convenioBaseTotal = spacesData.reduce((sum, sp) => sum + (sp.convenioEnabled ? (parseFloat(sp.baseValue ?? sp.base ?? 0) || 0) : 0), 0);
    const convenioDeliveredTotal = spacesData.reduce((sum, sp) => sum + (sp.convenioEnabled ? (parseFloat(sp.convenioValue || 0) || 0) : 0), 0);
    __orderTotals = {
        subtotalBase: baseAndLogistics,
        concepts: conceptsSum,
        subtotal: subtotalRaw,
        adjusted,
        adjustment,
        tax: taxesTotal,
        final: finalTotal,
        spaces: spacesData,
        convenioMode,
        convenioBaseTotal,
        convenioDeliveredTotal,
        catalogBaseTotal,
        taxByName
    };

    document.getElementById('lbl-catalog-base-total').innerText = catalogBaseTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-subtotal-base').innerText = baseAndLogistics.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-subtotal-raw').innerText = subtotalRaw.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-adjustment').innerText = convenioMode
        ? `-${convenioDeliveredTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`
        : (adjType === 'descuento' ? '-' : '+') + adjustment.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('lbl-subtotal').innerText = adjusted.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    document.getElementById('oed-price').value = finalTotal.toFixed(2);
    const sumSubtotal = document.getElementById('sum-total-subtotal');
    const sumAdjustment = document.getElementById('sum-total-adjustment');
    const sumTax = document.getElementById('sum-total-tax');
    const sumNet = document.getElementById('sum-total-net');
    if (sumSubtotal) sumSubtotal.innerText = (convenioMode ? convenioBaseTotal : adjusted).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    if (sumAdjustment) sumAdjustment.innerText = convenioMode
        ? `-${convenioDeliveredTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`
        : ((adjType === 'descuento' ? '-' : '+') + adjustment.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
    if (sumTax) sumTax.innerText = taxesTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    if (sumNet) sumNet.innerText = finalTotal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const setLabel = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setLabel('sum-label-subtotal', convenioMode ? 'Valor Base' : 'Subtotal');
    setLabel('sum-label-adjustment', convenioMode ? 'Tratos' : 'Ajuste');
    setLabel('sum-label-tax', 'Impuestos');
    setLabel('sum-label-net', convenioMode ? 'Balance del Convenio' : 'Total Neto');
    __orderRenderSpacePicker();
    __orderUpdateSpaceConfigTitle();
    const financialOverview = document.getElementById('oed-financial-overview');
    if (financialOverview) {
        financialOverview.innerHTML = convenioMode
            ? `
                <div class="flex justify-between text-[10px] text-gray-500"><span>Valor base del convenio</span><span>${__orderFormatMoneyMx(convenioBaseTotal)}</span></div>
                <div class="flex justify-between text-[10px] text-gray-500"><span>Tratos registrados</span><span>-${__orderFormatMoneyMx(convenioDeliveredTotal)}</span></div>
                <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Balance actual</span><span class="text-right font-bold text-gray-700 max-w-[240px]">${__orderFormatSignedMoneyMx(finalTotal)}</span></div>
                <div class="text-[10px] text-gray-500 leading-relaxed">${adjustmentExplanation}</div>
            `
            : `
                <div class="flex justify-between text-[10px] text-gray-500"><span>Conceptos adicionales acumulados</span><span>${__orderFormatMoneyMx(conceptsSum)}</span></div>
                <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Regla de ajuste</span><span class="text-right font-bold text-gray-700 max-w-[240px]">${adjustmentModeLabel}</span></div>
                <div class="text-[10px] text-gray-500 leading-relaxed">${adjustmentExplanation}</div>
            `;
    }
    const summaryFinancialList = document.getElementById('sum-financial-list');
    if (summaryFinancialList) {
        const money = (value) => (parseFloat(value || 0) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
        const overviewRows = convenioMode
            ? [
                { label: 'Valor base del convenio', value: money(convenioBaseTotal) },
                { label: 'Tratos registrados', value: `-${money(convenioDeliveredTotal)}` },
                { label: 'Impuestos', value: money(taxesTotal) },
                { label: 'Balance del convenio', value: __orderFormatSignedMoneyMx(finalTotal), highlight: true }
            ]
            : [
                { label: 'Referencia catálogo acumulada', value: money(catalogBaseTotal) },
                { label: 'Base facturable acumulada', value: money(baseAndLogistics) },
                { label: 'Conceptos adicionales', value: money(conceptsSum) },
                { label: 'Subtotal antes de ajuste', value: money(subtotalRaw) },
                { label: 'Subtotal Ajustado', value: money(adjusted) },
                { label: 'Total Ajuste', value: `${adjType === 'descuento' ? '-' : '+'}${money(adjustment)}` },
                { label: 'Impuestos', value: money(taxesTotal) },
                { label: 'Total Neto', value: money(finalTotal), highlight: true }
            ];
        const overviewHtml = `<div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div class="divide-y divide-gray-100 text-xs">${overviewRows.map((row) => `<div class="flex items-center justify-between gap-3 px-4 py-3 ${row.highlight ? 'bg-slate-50' : ''}"><span class="${row.highlight ? 'font-black uppercase text-gray-700' : 'font-bold text-gray-400'}">${row.label}</span><span class="${row.highlight ? 'font-black text-gray-900' : 'font-bold text-gray-800'} text-right">${row.value}</span></div>`).join('')}</div>
            <div class="border-t border-dashed border-gray-200 px-4 py-3 text-[10px] text-gray-500">
                <p class="font-bold text-gray-700 mb-1">${convenioMode ? 'Regla del convenio' : 'Regla de ajuste'}</p>
                <p>${adjustmentExplanation}</p>
            </div>
        </div>`;
        const publicityTaxCardsHtml = spacesData
            .map((sp) => {
                if (!(sp.isPublicidad || sp.convenioEnabled)) return '';
                const isActive = String(sp.spaceId || '') === String(__orderActiveSpaceId || '');
                return renderPublicityTaxCard(sp, isActive);
            })
            .filter(Boolean)
            .join('');
        const spacesFinancialHtml = spacesData.length
            ? spacesData.map((sp) => {
                const isActive = String(sp.spaceId || '') === String(__orderActiveSpaceId || '');
                if (sp.isPublicidad || sp.convenioEnabled) return renderPublicityPricingCard(sp, isActive);
                const spaceRef = sp.spaceKey ? `${sp.spaceName} [${sp.spaceKey}]` : (sp.spaceName || 'Espacio');
                const breakdownRows = sp.convenioEnabled
                    ? [
                        { label: 'Valor base', value: sp.base },
                        ...(sp.concepts || []).map((concept) => ({ label: concept.description || 'Trato de convenio', value: -(parseFloat(concept.amount || concept.value || 0) || 0) }))
                    ]
                    : [
                        { label: 'Base calculada', value: sp.base },
                        sp.horarioCost > 0 ? { label: `Horario (${sp.horarioText || 'seleccionado'})`, value: sp.horarioCost } : null,
                        sp.premontajeTotal > 0 ? { label: 'Premontaje', value: sp.premontajeTotal } : null,
                        sp.horasExtraTotal > 0 ? { label: 'Horas extra', value: sp.horasExtraTotal } : null
                    ].filter(Boolean);
                const conceptRows = breakdownRows.length
                    ? breakdownRows.map((item) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${item.label}</span><span>${item.value < 0 ? '-' : ''}${money(Math.abs(item.value))}</span></div>`).join('')
                    : '<div class="text-[10px] text-gray-400 italic">Sin cargos adicionales en este espacio.</div>';
                const taxRows = sp.convenioEnabled
                    ? '<div class="text-[10px] text-gray-400 italic">No aplica en convenio.</div>'
                    : Array.isArray(sp.taxBreakdown) && sp.taxBreakdown.length
                        ? sp.taxBreakdown.map((taxItem) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${taxItem.name}</span><span>+${money(taxItem.value)}</span></div>`).join('')
                        : '<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>';
                return `<button type="button" onclick="window.selectOrderQuoteSpace('${sp.spaceId}')" class="w-full text-left rounded-lg border ${summaryStateClass(isActive)} bg-white p-3 space-y-2 transition hover:border-brand-red">
                    <div class="flex items-start justify-between gap-2">
                        <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
                        ${summaryStateLabel(isActive)}
                    </div>
                    <div class="space-y-1">${conceptRows}</div>
                    <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>${sp.convenioEnabled ? 'Balance convenio' : 'Subtotal espacio'}</span><span>${money(sp.convenioEnabled ? sp.totalSpace : (sp.adjustedSubtotal ?? sp.subtotalSpace))}</span></div>
                    <div class="space-y-1 border-t border-dashed border-gray-200 pt-2">${taxRows}</div>
                    <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>${sp.convenioEnabled ? 'Estado actual' : 'Total espacio'}</span><span>${money(sp.totalSpace)}</span></div>
                </button>`;
            }).join('')
            : '<div class="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-[11px] text-gray-400 italic">Sin espacios seleccionados.</div>';
        summaryFinancialList.innerHTML = convenioMode
            ? `${overviewHtml}<div class="space-y-2">${spacesFinancialHtml}</div>`
            : `${overviewHtml}<div class="space-y-2">${spacesFinancialHtml}</div><div class="space-y-2">${globalTaxCardHtml}${publicityTaxCardsHtml}</div>`;
    }
    __orderSyncConvenioUi();
    window.updatePriceColor();
    window.updateSummaryUI();
    __orderRenderActiveSpaceSummary(spacesData.find((sp) => String(sp.spaceId || '') === String(__orderActiveSpaceId || '')));
};

window.updatePriceColor = function () {
    const priceInput = document.getElementById('oed-price');
    if (!priceInput) return;
    priceInput.classList.remove('text-green-600', 'text-red-600', 'text-gray-700');
    priceInput.classList.add('text-gray-700');
};

window.getFormDataFromModal = function () {
    __orderSaveActiveFromForm();
    window.recalcTotal();
    const quoteNameRaw = (document.getElementById('oed-quote-name')?.value || '').trim();
    const quoteName = quoteNameRaw || `${document.getElementById('oed-client').value || ''} - ${(__orderTotals.spaces || []).map(s => s.spaceName).join(' + ')}`;
    const spaces = __orderTotals.spaces || [];
    const first = spaces[0] || {};
    const startDates = spaces.map(s => s.startDate).filter(Boolean).sort();
    const endDates = spaces.map(s => s.endDate).filter(Boolean).sort();
    const minStart = startDates[0] || '';
    const maxEnd = endDates[endDates.length - 1] || '';
    const maxGuests = Math.max(...spaces.map(s => parseInt(s.guests, 10) || 0), 0);

    const b2bConcepts = [];
    const spacesDetail = spaces.map(sp => {
        const isPublicidad = !!sp.isPublicidad;
        const convenioItems = __orderBuildConvenioPayloadItems({ concepts: sp.concepts });
        if (!isPublicidad && sp.horarioText) {
            b2bConcepts.push({
                description: `[${sp.spaceName}] - Horario (${sp.horarioText})`,
                amount: sp.horarioCost,
                value: sp.horarioCost,
                unit: 'fixed',
                type: 'b2b_horario',
                meta: { space_id: sp.spaceId, selected: sp.horarioValue, custom_name: sp.horarioText, custom_start: sp.horarioCustomStart || '', custom_end: sp.horarioCustomEnd || '' }
            });
        }
        if (!isPublicidad && sp.premontajeDays > 0) {
            const premDays = parseInt(sp.premontajeDays, 10) || 0;
            const courtesyDays = parseInt(sp.premontajeCourtesyDays, 10) || 0;
            const courtesyPart = courtesyDays > 0 ? `, cortesia: ${courtesyDays}` : '';
            b2bConcepts.push({
                description: `[${sp.spaceName}] - Premontaje (dias: ${premDays}${courtesyPart})`,
                amount: sp.premontajeTotal,
                value: sp.premontajeTotal,
                unit: 'fixed',
                type: 'b2b_montaje',
                meta: { space_id: sp.spaceId, days: sp.premontajeDays, courtesy_days: sp.premontajeCourtesyDays || 0, dates: sp.premontajeDates, percentage: __orderGetPremPct(), per_day_base: sp.premontajeBreakdown }
            });
        }
        if (!isPublicidad && sp.horasExtra > 0) {
            const rawHours = parseInt(sp.horasExtra, 10) || 0;
            const courtesyHours = parseInt(sp.horasExtraCourtesy, 10) || 0;
            const courtesyHoursPart = courtesyHours > 0 ? `, cortesia: ${courtesyHours}` : '';
            b2bConcepts.push({
                description: `[${sp.spaceName}] - Horas extra (hrs: ${rawHours}${courtesyHoursPart})`,
                amount: sp.horasExtraTotal,
                value: sp.horasExtraTotal,
                unit: 'fixed',
                type: 'b2b_horas',
                meta: { space_id: sp.spaceId, hours: sp.horasExtraBillable, raw_hours: sp.horasExtra, courtesy_hours: sp.horasExtraCourtesy || 0, unit_price: sp.horasExtraUnit }
            });
        }
        convenioItems.forEach((item) => {
            b2bConcepts.push(__orderNormalizeExtraConcept({
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
        return {
            espacio_id: sp.spaceId,
            espacio_nombre: sp.spaceName,
            espacio_clave: sp.spaceKey,
            espacio_tipo: sp.spaceType || '',
            tipo: sp.spaceType || '',
            fecha_inicio: sp.startDate,
            fecha_fin: sp.endDate,
            personas: isPublicidad ? 1 : sp.guests,
            horario: isPublicidad
                ? { value: '', label: '', amount: 0, start: '', end: '' }
                : { value: sp.horarioValue, label: sp.horarioText, amount: sp.horarioCost, start: sp.horarioCustomStart || '', end: sp.horarioCustomEnd || '' },
            fechas_evento: __orderDatesBetween(sp.startDate, sp.endDate),
            premontaje_dias: isPublicidad ? 0 : sp.premontajeDays,
            premontaje_cortesia_dias: isPublicidad ? 0 : (sp.premontajeCourtesyDays || 0),
            premontaje_fechas: isPublicidad ? [] : sp.premontajeDates,
            premontaje_total: isPublicidad ? 0 : sp.premontajeTotal,
            premontaje_detalle: isPublicidad ? [] : sp.premontajeBreakdown,
            horas_extra: isPublicidad ? 0 : sp.horasExtra,
            horas_extra_cortesia: isPublicidad ? 0 : (sp.horasExtraCourtesy || 0),
            horas_extra_facturables: isPublicidad ? 0 : (sp.horasExtraBillable || 0),
            horas_extra_unitario: isPublicidad ? 0 : sp.horasExtraUnit,
            horas_extra_total: isPublicidad ? 0 : sp.horasExtraTotal,
            subtotal_espacio: sp.convenioEnabled ? (sp.baseValue ?? sp.subtotalSpace) : sp.subtotalSpace,
            convenio_monto_entregado: sp.convenioEnabled ? (sp.convenioValue || 0) : 0,
            convenio_balance: sp.convenioEnabled ? (sp.totalSpace || sp.subtotalSpace) : sp.subtotalSpace,
            impuestos_ids: sp.convenioEnabled ? [] : sp.taxIds,
            impuestos_total: sp.convenioEnabled ? 0 : sp.taxTotal,
            material: sp.material || '',
            medida_ancho: sp.medidaAncho ?? null,
            medida_alto: sp.medidaAlto ?? null,
            medida_unidad: sp.medidaUnit || '',
            ancho: sp.medidaAncho ?? null,
            alto: sp.medidaAlto ?? null,
            unidad_medida: sp.medidaUnit || '',
            permanencia_personalizada: isPublicidad ? !!sp.customPermanence : false,
            precio_personalizado: (isPublicidad && !sp.convenioEnabled && sp.customPriceEnabled && sp.customBasePrice !== '' && sp.customBasePrice !== null && sp.customBasePrice !== undefined)
                ? (parseFloat(sp.customBasePrice) || 0)
                : null,
            precio_personalizado_activo: isPublicidad ? (!!sp.customPriceEnabled && !sp.convenioEnabled) : false,
            precio_personalizado_modo: isPublicidad ? (sp.customPriceMode || 'total') : null,
            convenio_activo: !!sp.convenioEnabled,
            convenio_indefinido: !!sp.blocksIndefinitely,
            convenio_items: convenioItems,
            total_espacio: sp.totalSpace
        };
    });

    const finalConcepts = [...b2bConcepts, ...(currentConcepts || [])];
    const hasConvenioOrder = spaces.some((sp) => !!sp.convenioEnabled);
    const taxUnion = Array.from(new Set(spaces.filter((sp) => !sp.convenioEnabled).flatMap(s => s.taxIds || []).map(v => String(v))));
    const adjType = hasConvenioOrder ? 'ninguno' : document.getElementById('oed-adj-type').value;
    const adjVal = hasConvenioOrder ? 0 : (parseFloat(document.getElementById('oed-adj-val').value) || 0);
    const isPercent = hasConvenioOrder ? false : (document.getElementById('oed-adj-unit').value === 'percent');
    const convenioSpaces = spaces
        .filter((sp) => !!sp.convenioEnabled)
        .map((sp) => ({
            espacio_id: sp.spaceId,
            espacio_nombre: sp.spaceName,
            espacio_clave: sp.spaceKey,
            cantidad_tratos: __orderBuildConvenioPayloadItems({ concepts: sp.concepts }).length,
            items: __orderBuildConvenioPayloadItems({ concepts: sp.concepts })
        }));
    const convenioItems = convenioSpaces.flatMap((space) => (space.items || []).map((item) => ({
        ...item,
        espacio_id: space.espacio_id,
        espacio_nombre: space.espacio_nombre,
        espacio_clave: space.espacio_clave
    })));
    const convenioBlocksIndefinitely = spaces.some((sp) => !!sp.blocksIndefinitely);

    return {
        nombre_cotizacion: quoteName,
        cliente_nombre: document.getElementById('oed-client').value,
        cliente_email: document.getElementById('oed-email').value,
        cliente_contacto: document.getElementById('oed-phone').value,
        cliente_rfc: document.getElementById('fiscal-rfc-re').value,
        cliente_id: (document.getElementById('oed-client-id') ? (document.getElementById('oed-client-id').value || '') : ''),
        fecha_inicio: minStart,
        fecha_fin: maxEnd,
        precio_final: parseFloat(document.getElementById('oed-price').value) || 0,
        espacio_id: first.spaceId || null,
        espacio_nombre: spaces.length <= 1 ? (first.spaceName || '') : `${first.spaceName} + ${spaces.length - 1} espacio(s)`,
        espacio_clave: spaces.length <= 1 ? (first.spaceKey || '') : 'MULTI',
        tipo_ajuste: adjType,
        valor_ajuste: adjVal,
        ajuste_es_porcentaje: isPercent,
        conceptos_adicionales: finalConcepts,
        desglose_precios: {
            subtotal_antes_impuestos: Math.max(0, (__orderTotals.final || 0) - (__orderTotals.tax || 0)),
            impuestos_detalle: taxUnion,
            tax_total: hasConvenioOrder ? 0 : __orderTotals.tax,
            convenio_base_total: hasConvenioOrder ? (__orderTotals.convenioBaseTotal || 0) : 0,
            convenio_entregable_total: hasConvenioOrder ? (__orderTotals.convenioDeliveredTotal || 0) : 0,
            convenio_balance_total: hasConvenioOrder ? (__orderTotals.final || 0) : 0,
            espacios: spacesDetail
        },
        personas: maxGuests || 1,
        espacios_detalle: spacesDetail,
        detalles_evento: {
            multi_espacio: spacesDetail.length > 1,
            total_espacios: spacesDetail.length,
            nombre_cotizacion: quoteName,
            convenio: (hasConvenioOrder || convenioItems.length) ? {
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
                evidencias: __orderParseRecordJson(currentPreviewOrder?.detalles_evento)?.convenio?.evidencias || []
            } : null
        }
    };
};

window.openOrderEditModal = async function (id) {
    const loading = document.getElementById('editor-loading');
    if (loading) loading.classList.remove('hidden');
    const order = allOrders.find(o => o.id === id);
    if (!order) {
        if (loading) loading.innerText = 'No se encontró la cotización solicitada.';
        return;
    }
    await __orderLoadPremontajePctConfig();
    await __orderLoadConvenioCatalog();
    await loadClientProfilesForOrderModal();
    currentPreviewOrder = order;
    document.getElementById('oed-id').value = order.id;
    document.getElementById('oed-client').value = order.cliente_nombre || '';
    document.getElementById('oed-status').value = order.status;
    __orderApplyStatusVisual();
    document.getElementById('oed-phone').value = order.cliente_contacto || '';
    document.getElementById('oed-email').value = order.cliente_email || '';
    document.getElementById('fiscal-rfc-re').value = order.cliente_rfc || '';
    document.getElementById('oed-quote-name').value = order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || '';

    const statusSelect = document.getElementById('oed-status');
    const currentLevel = STATUS_LEVEL[order.status] || 0;
    Array.from(statusSelect.options).forEach(opt => { opt.disabled = (STATUS_LEVEL[opt.value] || 0) < currentLevel; });

    const requestedClientId = String(order.cliente_id || '').trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) {
        await loadClientProfilesForOrderModal();
    }
    const selectedProfileId = __cpApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
        const profile = orderClientProfilesById[selectedProfileId];
        if (profile) {
            document.getElementById('oed-client').value = profile.nombre_completo || (order.cliente_nombre || '');
            document.getElementById('oed-phone').value = (profile.telefono || order.cliente_contacto || '');
            document.getElementById('oed-email').value = (profile.correo || order.cliente_email || '');
            document.getElementById('fiscal-rfc-re').value = (profile.rfc || order.cliente_rfc || '');
        }
    }

    let dbConcepts = __orderNormalizeConceptsArray(order.conceptos_adicionales);
    currentConcepts = dbConcepts.filter(c => {
        const type = String(c?.type || '').toLowerCase();
        if (['b2b_horario', 'b2b_montaje', 'b2b_horas'].includes(type)) return false;
        if (__orderIsConvenioConceptItem(c)) return false;
        const desc = String(c?.description || '').toLowerCase();
        return !(desc.startsWith('horario:') || desc.startsWith('montaje') || desc.startsWith('horas extras'));
    });

    const details = parseSpacesDetail(order.espacios_detalle);
    if (details.length) {
        __orderQuoteSpaces = details.map(item => __orderCreateSpaceCfg(item.espacio_id || item.space_id, {
            startDate: item.fecha_inicio || order.fecha_inicio,
            endDate: item.fecha_fin || order.fecha_fin,
            guests: item.personas || order.personas || 1,
            spaceType: item.espacio_tipo || item.tipo || '',
            material: item.material || '',
            medidaAncho: item.medida_ancho ?? item.ancho ?? null,
            medidaAlto: item.medida_alto ?? item.alto ?? null,
            medidaUnit: item.medida_unidad || item.unidad_medida || 'M',
            horarioValue: item.horario?.value || '',
            horarioText: item.horario?.label || '',
            horarioPrice: item.horario?.amount || 0,
            horarioCustomStart: item.horario?.start || item.horario?.custom_start || '',
            horarioCustomEnd: item.horario?.end || item.horario?.custom_end || '',
            premontajeDays: item.premontaje_dias || 0,
            premontajeCourtesyDays: item.premontaje_cortesia_dias || 0,
            premontajeDates: item.premontaje_fechas || [],
            horasExtra: item.horas_extra || 0,
            horasExtraCourtesy: item.horas_extra_cortesia || 0,
            horasExtraUnit: item.horas_extra_unitario || 0,
            customPermanence: item.permanencia_personalizada === true,
            customPriceEnabled: item.precio_personalizado_activo === true,
            customPriceMode: item.precio_personalizado_modo || 'total',
            customBasePrice: item.precio_personalizado,
            taxIds: item.impuestos_ids || [],
            convenioEnabled: item.convenio_activo === true || item.convenio_indefinido === true,
            concepts: __orderBuildConvenioConceptsFromPayload(item.convenio_items)
        }));
    } else {
        __orderQuoteSpaces = [__orderCreateSpaceCfg(order.espacio_id, {
            startDate: order.fecha_inicio,
            endDate: order.fecha_fin,
            guests: order.personas || 1,
            convenioEnabled: __orderIsConvenioOrder(order)
        })];
    }

    __orderSafeArray(dbConcepts).forEach(c => {
        const type = String(c?.type || '').toLowerCase();
        const meta = c?.meta || {};
        const sid = String(meta.space_id || __orderQuoteSpaces[0]?.spaceId || '');
        const cfg = __orderGetCfg(sid);
        if (!cfg) return;
        if (type === 'b2b_horario') {
            cfg.horarioValue = meta.selected || cfg.horarioValue;
            cfg.horarioText = meta.custom_name || c.description?.replace(/^.+?:/, '').trim() || cfg.horarioText;
            cfg.horarioPrice = parseFloat(c.amount || c.value || cfg.horarioPrice || 0) || 0;
            cfg.horarioCustomStart = meta.custom_start || meta.start || cfg.horarioCustomStart || '';
            cfg.horarioCustomEnd = meta.custom_end || meta.end || cfg.horarioCustomEnd || '';
            if (cfg.horarioValue === 'personalizado' && (!cfg.horarioCustomStart || !cfg.horarioCustomEnd)) {
                const match = String(cfg.horarioText || '').match(/(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/i);
                if (match) {
                    cfg.horarioCustomStart = cfg.horarioCustomStart || match[1];
                    cfg.horarioCustomEnd = cfg.horarioCustomEnd || match[2];
                }
            }
            if (cfg.horarioValue !== 'personalizado' && !meta.selected && (cfg.horarioCustomStart || cfg.horarioCustomEnd)) {
                cfg.horarioValue = 'personalizado';
            }
            if (cfg.horarioValue !== 'personalizado') {
                cfg.horarioCustomStart = '';
                cfg.horarioCustomEnd = '';
            }
        } else if (type === 'b2b_montaje') {
            cfg.premontajeDays = parseInt(meta.days, 10) || cfg.premontajeDays || 0;
            cfg.premontajeCourtesyDays = parseInt(meta.courtesy_days, 10) || cfg.premontajeCourtesyDays || 0;
            if (__orderSafeArray(meta.dates).length) cfg.premontajeDates = __orderSafeArray(meta.dates);
            cfg.premontajeEnabled = cfg.premontajeDays > 0;
        } else if (type === 'b2b_horas') {
            cfg.horasExtra = parseInt(meta.raw_hours, 10) || parseInt(meta.hours, 10) || cfg.horasExtra || 0;
            cfg.horasExtraCourtesy = parseInt(meta.courtesy_hours, 10) || cfg.horasExtraCourtesy || 0;
            cfg.horasExtraUnit = parseFloat(meta.unit_price || cfg.horasExtraUnit || 0) || 0;
            cfg.horasExtraEnabled = cfg.horasExtra > 0;
        } else if (__orderIsConvenioConceptItem(c)) {
            cfg.convenioEnabled = true;
            cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept);
            const nextConcept = __orderNormalizeExtraConcept(c);
            const signature = `${nextConcept.meta?.convenio_option_id || ''}|${nextConcept.meta?.cantidad_entrega || 1}|${nextConcept.amount}`;
            const exists = cfg.concepts.some((item) => `${item?.meta?.convenio_option_id || ''}|${item?.meta?.cantidad_entrega || 1}|${parseFloat(item?.amount ?? item?.value ?? 0) || 0}` === signature);
            if (!exists) cfg.concepts.push(nextConcept);
        }
    });
    __orderQuoteSpaces.forEach((cfg) => {
        const space = __orderGetSpaceById(cfg.spaceId);
        if (__orderSpaceAllowsConvenio(space)) return;
        cfg.convenioEnabled = false;
        cfg.concepts = __orderSafeArray(cfg.concepts).map(__orderNormalizeExtraConcept).filter((concept) => !__orderIsConvenioConceptItem(concept));
    });

    __orderActiveSpaceId = String(__orderQuoteSpaces[0]?.spaceId || '');
    __orderDetailTab = __orderReadDetailTab();
    __orderApplyDetailTabUi();
    __orderRenderSpaceAddSelect();
    __orderRenderSpaceTabs();
    __orderLoadActiveToForm();
    const conceptSel = document.getElementById('new-concept-select');
    conceptSel.innerHTML = '<option value="">-- Agregar --</option>';
    catalogConcepts.forEach(c => { conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`; });
    const extraConceptsToggle = document.getElementById('oed-has-extra-concepts');
    if (extraConceptsToggle) extraConceptsToggle.checked = (currentConcepts || []).length > 0;

    const isLocked = ['aprobada', 'finalizada'].includes(order.status);
    document.querySelectorAll('#order-edit-modal input, #order-edit-modal select').forEach(i => { if (i.id !== 'btn-save-progress') i.disabled = isLocked; });
    ['oed-quote-name', 'oed-status'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = isLocked; });
    document.getElementById('oed-btn-montaje').disabled = isLocked;
    const saveBtn = document.getElementById('btn-save-progress');
    if (saveBtn) {
        saveBtn.disabled = isLocked;
        saveBtn.classList.toggle('opacity-60', isLocked);
        saveBtn.title = isLocked ? 'Cotización aprobada: edición bloqueada' : '';
    }

    window.renderConceptsList();
    window.recalcTotal();
    if (__orderDetailTab === 'expediente') await __orderRenderExpedientePanel();
    window.openModal('order-edit-modal');
    if (loading) loading.classList.add('hidden');
    __orderDetailDirty = false;
    if (__orderAutoSaveTimer) {
        clearTimeout(__orderAutoSaveTimer);
        __orderAutoSaveTimer = null;
    }
    __orderBindDetailAutoSave();
};

window.attemptSaveOrder = function () {
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    __orderSaveActiveFromForm();
    window.recalcTotal();
    const convenioOrder = __orderQuoteSpaces.some((cfg) => !!cfg?.convenioEnabled);
    const newStatus = document.getElementById('oed-status').value;
    const currentLevel = STATUS_LEVEL[currentPreviewOrder.status] || 0;
    const newLevel = STATUS_LEVEL[newStatus] || 0;
    if (newLevel < currentLevel) return window.showToast("No puedes regresar a un estado anterior.", "error");
    const invalidPast = __orderQuoteSpaces.find(cfg => (cfg.startDate && cfg.startDate < __orderTodayISO()) || (cfg.endDate && cfg.endDate < __orderTodayISO()));
    if (invalidPast) {
        const sp = __orderGetSpaceById(invalidPast.spaceId);
        return window.showToast(`No se permiten fechas pasadas en ${sp?.nombre || invalidPast.spaceId}.`, "error");
    }
    const invalidCapacity = __orderQuoteSpaces.find(cfg => {
        if (__orderIsPublicidadSpace(cfg)) return false;
        const space = __orderGetSpaceById(cfg.spaceId);
        const maxCap = __orderGetSpaceMaxCapacity(space);
        const guests = parseInt(cfg.guests, 10) || 0;
        return maxCap < 999999 && guests > maxCap;
    });
    if (invalidCapacity) {
        const sp = __orderGetSpaceById(invalidCapacity.spaceId);
        return window.showToast(`Aforo excedido en ${sp?.nombre || invalidCapacity.spaceId}.`, "error");
    }
    const invalidBlocked = __orderQuoteSpaces.find(cfg => !__orderIsPublicidadSpace(cfg) && __orderCfgHasBlockedDates(cfg));
    if (invalidBlocked) {
        const sp = __orderGetSpaceById(invalidBlocked.spaceId);
        return window.showToast(`La selección incluye días bloqueados para ${sp?.nombre || invalidBlocked.spaceId}.`, "error");
    }
    const missingConvenio = __orderQuoteSpaces.find(cfg => !!cfg?.convenioEnabled && !__orderGetConvenioConcepts(cfg).length);
    if (missingConvenio) {
        const sp = __orderGetSpaceById(missingConvenio.spaceId);
        return window.showToast(`Agrega al menos un trato de convenio para ${sp?.nombre || missingConvenio.spaceId}.`, "error");
    }
    const uncoveredConvenio = (__orderTotals.spaces || []).find(sp => !!sp.convenioEnabled && !sp.convenioCovered);
    if (uncoveredConvenio) {
        return window.showToast(`El convenio de ${uncoveredConvenio.spaceName} debe cubrir al menos el valor total del espacio.`, "error");
    }
    const invalidPrem = __orderQuoteSpaces.find(cfg => {
        if (__orderIsPublicidadSpace(cfg)) return false;
        const days = parseInt(cfg.premontajeDays, 10) || 0;
        return days > 0 && __orderSafeArray(cfg.premontajeDates).length !== days;
    });
    if (invalidPrem) {
        const sp = __orderGetSpaceById(invalidPrem.spaceId);
        return window.showToast(`Revisa premontaje en ${sp?.nombre || invalidPrem.spaceId}.`, "error");
    }
    const conflictCfg = __orderQuoteSpaces.find(cfg => {
        const reserved = __orderGetReservedDatesForSpace(cfg.spaceId);
        if (__orderCfgBlocksIndefinitely(cfg)) return Array.from(reserved).some((date) => date >= String(cfg.startDate || ''));
        if (__orderIsPublicidadSpace(cfg)) return false;
        const needed = [...__orderDatesBetween(cfg.startDate, cfg.endDate), ...__orderSafeArray(cfg.premontajeDates).map(__orderNormalizeDate).filter(Boolean)];
        return needed.find(d => reserved.has(d));
    });
    if (conflictCfg) {
        const sp = __orderGetSpaceById(conflictCfg.spaceId);
        const reserved = __orderGetReservedDatesForSpace(conflictCfg.spaceId);
        const conflictDate = __orderCfgBlocksIndefinitely(conflictCfg)
            ? Array.from(reserved).filter((date) => date >= String(conflictCfg.startDate || '')).sort()[0]
            : [...__orderDatesBetween(conflictCfg.startDate, conflictCfg.endDate), ...__orderSafeArray(conflictCfg.premontajeDates).map(__orderNormalizeDate).filter(Boolean)].find(d => reserved.has(d));
        return window.showToast(`${sp?.nombre || conflictCfg.spaceId} está ocupado ${conflictDate ? '(' + window.safeFormatDate(conflictDate) + ')' : ''}.`, "error");
    }
    if (newStatus === 'aprobada') {
        const missing = [];
        if (!document.getElementById('oed-client').value) missing.push("Nombre Cliente");
        if (!document.getElementById('oed-email').value) missing.push("Email");
        if (!convenioOrder && !document.getElementById('fiscal-rfc-re').value) missing.push("RFC");
        if (!__orderQuoteSpaces.every(cfg => cfg.startDate && cfg.endDate)) missing.push("Fechas");
        if (missing.length > 0) return window.openConfirm(`<p class="text-red-600 font-bold mb-2">Faltan datos para aprobar:</p><ul class="list-disc ml-4 text-xs text-left">${missing.map(m => `<li>${m}</li>`).join('')}</ul>`, () => window.closeModal('generic-confirm-modal'), true);
        window.processSaveOrder();
    } else {
        window.processSaveOrder();
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) { }
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    await __orderLoadPremontajePctConfig();
});








