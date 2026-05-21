/**
 * DOC: client\cotizador\orders.js
 * Proposito: Listado y edicion de cotizaciones existentes.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE COTIZACIONES ADMIN - PLAZA MAYOR
// =========================================================================
let orderClientProfiles = []; let orderClientProfilesById = {};
let __pmMaterialsList = [];
let __pmLocationsList = [];
let pmOrdersRestoringViewState = false;
const PM_ORDERS_VIEW_STATE_SCOPE = 'pm_orders';

function pmOrdersViewStateApi() {
    return window.__HUB_VIEW_STATE || null;
}

function pmOrdersReadViewState() {
    const api = pmOrdersViewStateApi();
    return api?.read ? (api.read(PM_ORDERS_VIEW_STATE_SCOPE, { maxAgeMs: 30 * 60 * 1000 }) || null) : null;
}

function pmOrdersApplyViewStateControls(state = pmOrdersReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const searchEl = document.getElementById('search-orders');
    if (searchEl && typeof state.search === 'string') searchEl.value = state.search;
}

function pmOrdersSaveViewState(extra = {}) {
    const api = pmOrdersViewStateApi();
    if (!api?.write) return null;
    const state = (extra && typeof extra === 'object') ? extra : {};
    const previousState = pmOrdersReadViewState() || {};
    const hasSelectedOrderId = Object.prototype.hasOwnProperty.call(state, 'selectedOrderId');
    return api.write(PM_ORDERS_VIEW_STATE_SCOPE, {
        search: document.getElementById('search-orders')?.value || '',
        selectedOrderId: hasSelectedOrderId
            ? String(state.selectedOrderId || '').trim()
            : String(previousState.selectedOrderId || '').trim(),
        windowScrollY: api.getWindowScrollY ? api.getWindowScrollY() : (window.scrollY || 0),
        ...state
    });
}

function pmOrdersRestoreViewStateAfterRender(state = pmOrdersReadViewState()) {
    if (!state || typeof state !== 'object') return;
    const api = pmOrdersViewStateApi();
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

function __pmNormalizeMaterialLabel(value) {
    const text = String(value || '').trim();
    const folded = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
    const clean = folded.replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!clean) return '';
    if (clean.includes('imagen fija') || clean.includes('jpg')) return 'Imagen fija JPG';
    if (clean.includes('coroplast')) return 'Coroplast';
    if (clean.includes('lona')) return clean.includes('bastidor') ? 'Lona sobre bastidor' : 'Lona';
    if (clean.includes('vinil') || clean.includes('vinyl')) {
        if (clean.includes('transparen')) return 'Vinil transparente';
        if (clean.includes('reverso')) {
            const hasBlack = clean.includes('negro');
            const hasGray = clean.includes('gris') || clean.includes('gray');
            if (hasBlack && hasGray) return 'Vinil con reverso gris/negro';
            if (hasBlack) return 'Vinil con reverso negro';
        }
        return 'Vinil';
    }
    return text;
}
function __pmParseConfigJsonValue(value) {
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
function __pmBuildMaterialOptions(primaryItems, extraItems = []) {
    const out = [];
    const seen = new Set();
    const push = (value, doNormalize = true) => {
        const normalized = doNormalize ? __pmNormalizeMaterialLabel(value) : String(value || '').trim();
        const label = String(normalized || value || '').trim();
        if (!label) return;
        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(label);
    };
    (Array.isArray(primaryItems) ? primaryItems : []).forEach(val => push(val, false));
    (Array.isArray(extraItems) ? extraItems : []).forEach(val => push(val, true));
    return out;
}
function __pmNormalizeTaxIds(value) {
    return (window.parseIds ? window.parseIds(value) : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}
function __pmNormalizeSpaceMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    return Number.isFinite(num) && num > 0 ? num : null;
}
function __pmNormalizeSpaceMeasureUnit(value) {
    const unit = String(value || '').trim().toUpperCase();
    if (unit === 'CM') return 'CM';
    if (unit === 'M2') return 'M2';
    return 'M';
}
function __pmNormalizeLocationLabel(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function __pmBuildLocationOptions(primaryItems, extraItems = []) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
        const label = __pmNormalizeLocationLabel(value);
        if (!label) return;
        const folded = __pmNormalizeSearchText(label);
        if (!folded || seen.has(folded)) return;
        seen.add(folded);
        out.push(label);
    };
    (Array.isArray(primaryItems) ? primaryItems : []).forEach(push);
    (Array.isArray(extraItems) ? extraItems : []).forEach(push);
    return out;
}
function __pmNormalizeSpaceMaterialMeasure(space) {
    const src = (space && typeof space === 'object') ? space : {};
    const medidaAncho = __pmNormalizeSpaceMeasureValue(src.medida_ancho ?? src.ancho);
    const medidaAlto = __pmNormalizeSpaceMeasureValue(src.medida_alto ?? src.alto);
    const medidaUnidad = __pmNormalizeSpaceMeasureUnit(src.medida_unidad || src.unidad_medida || 'M');
    return {
        ...src,
        material: (src.material === null || src.material === undefined) ? '' : String(src.material),
        ubicacion: (src.ubicacion === null || src.ubicacion === undefined) ? '' : __pmNormalizeLocationLabel(src.ubicacion),
        medida_ancho: medidaAncho,
        medida_alto: medidaAlto,
        medida_unidad: medidaUnidad,
        ancho: medidaAncho,
        alto: medidaAlto,
        unidad_medida: medidaUnidad
    };
}
function __pmNormalizeSearchText(value) {
    const text = String(value || '');
    const normalized = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
    return normalized
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function __pmGetSpaceTagLabels(space) {
    const raw = space?.etiquetas ?? space?.espacio_etiquetas;
    if (Array.isArray(raw)) {
        return raw.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        } catch (_) {}
        return raw.split(',').map((item) => String(item || '').trim()).filter(Boolean);
    }
    return [];
}
function __pmFindLocationOption(value) {
    const needle = __pmNormalizeSearchText(value);
    if (!needle) return '';
    const match = __pmLocationsList.find((item) => __pmNormalizeSearchText(item) === needle);
    return match || '';
}
function __pmSpaceHasTag(space, term) {
    const needle = __pmNormalizeSearchText(term);
    if (!needle) return false;
    const pool = [space?.tipo, space?.espacio_tipo, ...__pmGetSpaceTagLabels(space)];
    return pool.some((item) => {
        const normalized = __pmNormalizeSearchText(item);
        return normalized === needle || normalized.includes(needle);
    });
}
function __pmResolveSpaceCategory(space) {
    return __pmNormalizeSearchText(space?.espacio_tipo || space?.tipo || '');
}
function __pmResolveAssignedSpace(detailSpace, catalogSpace = null) {
    const spaceId = String(
        detailSpace?.espacio_id
        || detailSpace?.space_id
        || detailSpace?.espacioId
        || detailSpace?.spaceId
        || catalogSpace?.id
        || ''
    ).trim();
    if (!spaceId) return catalogSpace || null;
    return __pmFindSpaceByAnyId(spaceId) || catalogSpace || null;
}
function __pmResolveDetailSpaceCategory(detailSpace, catalogSpace = null) {
    const assignedSpace = __pmResolveAssignedSpace(detailSpace, catalogSpace);
    return __pmResolveSpaceCategory(assignedSpace) || __pmResolveSpaceCategory(detailSpace) || __pmResolveSpaceCategory(catalogSpace);
}
function __pmIsLocationDetailSpace(space, catalogSpace = null) {
    const category = __pmResolveDetailSpaceCategory(space, catalogSpace);
    return category === 'local' || category === 'isla' || category === 'espacio';
}
function __pmResolveLocationTagCandidate(space) {
    const tags = __pmGetSpaceTagLabels(space).map(__pmNormalizeLocationLabel).filter(Boolean);
    const configuredMatch = tags.find((tag) => !!__pmFindLocationOption(tag));
    if (configuredMatch) return __pmFindLocationOption(configuredMatch) || configuredMatch;
    if (!__pmLocationsList.length && __pmIsLocationDetailSpace(space)) {
        const genericTags = new Set(['local', 'isla', 'espacio']);
        const typeTags = new Set([
            __pmNormalizeSearchText(space?.tipo),
            __pmNormalizeSearchText(space?.espacio_tipo)
        ].filter(Boolean));
        const materialTag = __pmNormalizeSearchText(space?.material || '');
        const fallback = tags.find((tag) => {
            const normalized = __pmNormalizeSearchText(tag);
            if (!normalized) return false;
            if (genericTags.has(normalized)) return false;
            if (typeTags.has(normalized)) return false;
            if (materialTag && normalized === materialTag) return false;
            return true;
        });
        if (fallback) return fallback;
    }
    return '';
}
function __pmGetSpaceLocationLabel(space) {
    return __pmNormalizeLocationLabel(space?.ubicacion || '');
}
function __pmResolveDetailLocation(detailSpace, catalogSpace) {
    const assignedSpace = __pmResolveAssignedSpace(detailSpace, catalogSpace);
    const assignedLabel = __pmNormalizeLocationLabel(assignedSpace?.ubicacion || '');
    if (assignedLabel) return assignedLabel;
    const detailLabel = __pmNormalizeLocationLabel(detailSpace?.ubicacion || '');
    if (detailLabel) return detailLabel;
    return __pmNormalizeLocationLabel(catalogSpace?.ubicacion || '');
}
function __pmIsPublicidadDetailSpace(space, catalogSpace = null) {
    return __pmSpaceHasTag(__pmResolveAssignedSpace(space, catalogSpace), 'publicidad')
        || __pmSpaceHasTag(space, 'publicidad')
        || __pmSpaceHasTag(catalogSpace, 'publicidad')
        || __pmResolveDetailSpaceCategory(space, catalogSpace) === 'publicidad';
}
function __pmResolveDetailEditPolicy(detailSpace, catalogSpace = null) {
    const assignedSpace = __pmResolveAssignedSpace(detailSpace, catalogSpace);
    const materialLocked = __pmIsLocationDetailSpace(detailSpace, assignedSpace || catalogSpace);
    const locationLocked = __pmIsPublicidadDetailSpace(detailSpace, assignedSpace || catalogSpace);
    return {
        materialEditable: !materialLocked,
        locationEditable: !locationLocked,
        lockedMaterial: materialLocked ? '' : String(detailSpace?.material || assignedSpace?.material || catalogSpace?.material || ''),
        lockedLocation: locationLocked ? __pmResolveDetailLocation(detailSpace, assignedSpace || catalogSpace) : __pmNormalizeLocationLabel(detailSpace?.ubicacion || assignedSpace?.ubicacion || catalogSpace?.ubicacion || ''),
        materialMessage: materialLocked ? 'Este espacio no utiliza material editable.' : '',
        locationMessage: locationLocked ? 'La ubicación de este espacio viene definida desde el catálogo.' : ''
    };
}
function __pmIsSpaceIdMatch(space, candidateId) {
    const raw = String(candidateId || '').trim();
    if (!raw || !space) return false;
    return String(space.id || '').trim() === raw;
}
function __pmFindSpaceByAnyId(spaceId) {
    return allSpaces.find((space) => __pmIsSpaceIdMatch(space, spaceId)) || null;
}
function __pmResolveQuoteFolio(recordOrId, fallbackId = '') {
    if (recordOrId && typeof recordOrId === 'object') {
        const current = String(recordOrId.numero_orden || '').trim();
        if (current) return current.toUpperCase();
        const rawId = String(recordOrId.id || fallbackId || '').trim().toUpperCase();
        return rawId ? `PM-${rawId.slice(0, 6)}` : 'PM-PEND';
    }
    const rawId = String(recordOrId || fallbackId || '').trim().toUpperCase();
    return rawId ? `PM-${rawId.slice(0, 6)}` : 'PM-PEND';
}
function __pmRoundCurrency(value) {
    return Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
}
function __pmToFiniteNumber(value, fallback = 0) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}
function __pmHasExplicitValue(value) {
    return !(value === null || value === undefined || (typeof value === 'string' && value.trim() === ''));
}
function __pmParseRecordJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {}
    }
    return {};
}
function __pmNormalizeConceptsArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = __pmParseRecordJson(value);
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
function __pmResolveTaxIdsFromDetails(order) {
    const detailRaw = __pmParseRecordJson(order?.espacios_detalle);
    const detailList = Array.isArray(detailRaw) ? detailRaw : [];
    const seen = new Set();
    const out = [];
    detailList.forEach((detail) => {
        __pmNormalizeTaxIds(
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
function __pmResolveTaxTotalFromBreakdown(order, fallback = 0) {
    const breakdown = __pmParseRecordJson(order?.desglose_impuestos);
    const direct = [
        breakdown?.total,
        breakdown?.tax_total,
        breakdown?.impuestos_total,
        breakdown?.total_impuestos
    ]
        .map((value) => __pmToFiniteNumber(value, NaN))
        .find((value) => Number.isFinite(value) && value >= 0);
    if (Number.isFinite(direct)) return direct;
    const list = Array.isArray(breakdown)
        ? breakdown
        : (Array.isArray(breakdown?.items)
            ? breakdown.items
            : (Array.isArray(breakdown?.impuestos) ? breakdown.impuestos : []));
    const sum = list.reduce((acc, item) => {
        const amount = __pmToFiniteNumber(
            item?.monto ?? item?.importe ?? item?.amount ?? item?.valor ?? 0,
            0
        );
        return acc + Math.max(0, amount);
    }, 0);
    if (sum > 0) return sum;
    return Math.max(0, __pmToFiniteNumber(fallback, 0));
}
function __pmResolveTaxRecord(taxId, tenantOrSpace = '') {
    const safeId = String(taxId || '').trim();
    if (!safeId) return null;
    const tenant = typeof tenantOrSpace === 'string'
        ? __pmResolveTenantSlug(tenantOrSpace)
        : __pmResolveTenantSlug(tenantOrSpace?.tenant || '');
    const tenantTaxes = __pmFilterRowsByTenant(dbTaxes, tenant);
    return tenantTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || dbTaxes.find((tax) => String(tax?.id || '').trim() === safeId)
        || null;
}
function __pmResolveTaxRate(tax) {
    const pct = __pmToFiniteNumber(tax?.porcentaje, 0);
    return pct > 1 ? pct / 100 : pct;
}
function __pmResolveTaxDisplayPercent(tax) {
    const pct = __pmToFiniteNumber(tax?.porcentaje, 0);
    return pct > 0 && pct <= 1 ? (pct * 100) : pct;
}
function __pmResolveOrderTaxIds(order) {
    const breakdown = __pmParseRecordJson(order?.desglose_precios);
    const breakdownIds = __pmNormalizeTaxIds(breakdown?.impuestos_detalle);
    if (breakdownIds.length) return breakdownIds;
    const detailIds = __pmResolveTaxIdsFromDetails(order);
    if (detailIds.length) return detailIds;
    const space = __pmFindSpaceByAnyId(order?.espacio_id);
    return __pmNormalizeTaxIds(space?.impuestos_ids || space?.impuestos);
}
function __pmResolveOrderPricing(order) {
    const breakdown = __pmParseRecordJson(order?.desglose_precios);
    const taxIds = __pmResolveOrderTaxIds(order);
    const isConvenio = __pmIsConvenioOrder(order);
    const hasSubtotal = __pmHasExplicitValue(breakdown?.subtotal_antes_impuestos);
    const hasTaxTotal = __pmHasExplicitValue(breakdown?.tax_total);
    const hasTotal = __pmHasExplicitValue(order?.precio_final);

    let subtotal = hasSubtotal ? __pmToFiniteNumber(breakdown?.subtotal_antes_impuestos, 0) : null;
    let taxTotal = hasTaxTotal ? __pmToFiniteNumber(breakdown?.tax_total, 0) : null;

    if (subtotal === null && hasTotal && hasTaxTotal) {
        const inferredSubtotal = __pmToFiniteNumber(order?.precio_final, 0) - __pmToFiniteNumber(breakdown?.tax_total, 0);
        subtotal = isConvenio ? inferredSubtotal : Math.max(0, inferredSubtotal);
    }
    if (subtotal === null) subtotal = 0;

    if (isConvenio) {
        taxTotal = 0;
    }
    if (taxTotal === null) {
        taxTotal = __pmRoundCurrency(taxIds.reduce((sum, taxId) => {
            const tax = __pmResolveTaxRecord(taxId, order);
            return sum + (subtotal * __pmResolveTaxRate(tax));
        }, 0));
    }
    if (!taxTotal || taxTotal <= 0) {
        taxTotal = __pmRoundCurrency(__pmResolveTaxTotalFromBreakdown(order, taxTotal));
    }
    if ((!taxTotal || taxTotal <= 0) && hasTotal) {
        const inferred = __pmToFiniteNumber(order?.precio_final, 0) - __pmToFiniteNumber(subtotal, 0);
        if (Number.isFinite(inferred) && inferred > 0) {
            taxTotal = __pmRoundCurrency(inferred);
        }
    }

    const total = hasTotal
        ? __pmToFiniteNumber(order?.precio_final, 0)
        : __pmRoundCurrency(subtotal + taxTotal);

    return {
        breakdown,
        taxIds,
        subtotal: __pmRoundCurrency(subtotal),
        taxTotal: __pmRoundCurrency(taxTotal),
        total: __pmRoundCurrency(total)
    };
}
function __pmHydrateOrderPricing(order) {
    if (!order || typeof order !== 'object') return order;
    const pricing = __pmResolveOrderPricing(order);
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
function __pmOrderPayments(order) {
    if (Array.isArray(order?.historial_pagos)) return order.historial_pagos.filter(Boolean);
    try {
        const parsed = JSON.parse(order?.historial_pagos || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}
function __pmOrderPaymentAmount(item) {
    const amount = parseFloat(item?.amount ?? item?.monto ?? item?.importe ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}
function __pmOrderClosureEntry(order) {
    return __pmOrderPayments(order).find((item) => {
        const t = String(item?.type || item?.tipo || '').toLowerCase();
        return t === 'constancia_liquidacion' || item?.closed === true || item?.is_closure === true;
    }) || null;
}
function __pmOrderTotalPaid(order) {
    return __pmOrderPayments(order).reduce((sum, item) => sum + Math.max(0, __pmOrderPaymentAmount(item)), 0);
}
function __pmOrderRemainingBalance(order) {
    if (__pmOrderClosureEntry(order)) return 0;
    const total = __pmResolveOrderPricing(order).total;
    const paid = __pmOrderTotalPaid(order);
    const remaining = __pmRoundCurrency(total - paid);
    return remaining < 0 ? 0 : remaining;
}
function __pmResolveOrderTableAmountState(order) {
    const isConvenio = __pmIsConvenioOrder(order);
    const pricing = __pmResolveOrderPricing(order);
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
    const payments = __pmOrderPayments(order);
    const shouldShowRemaining = ['aprobada', 'finalizada'].includes(status) && payments.length > 0;
    if (shouldShowRemaining) {
        const remaining = __pmOrderRemainingBalance(order);
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
function __pmResolveDetailMaterialMeasure(detailSpace, catalogSpace) {
    const detail = __pmNormalizeSpaceMaterialMeasure(detailSpace);
    const assignedSpace = __pmResolveAssignedSpace(detailSpace, catalogSpace);
    const catalog = __pmNormalizeSpaceMaterialMeasure(assignedSpace || catalogSpace);
    const hasDetailMaterial = String(detail.material || '').trim() !== '';
    const hasDetailWidth = detail.medida_ancho !== null && detail.medida_ancho !== undefined;
    const hasDetailHeight = detail.medida_alto !== null && detail.medida_alto !== undefined;
    return {
        material: String(catalog.material || '').trim() || (hasDetailMaterial ? detail.material : ''),
        ubicacion: __pmResolveDetailLocation(detail, catalog),
        medida_ancho: hasDetailWidth ? detail.medida_ancho : catalog.medida_ancho,
        medida_alto: hasDetailHeight ? detail.medida_alto : catalog.medida_alto,
        medida_unidad: (hasDetailWidth || hasDetailHeight) ? detail.medida_unidad : catalog.medida_unidad
    };
}
function __pmNormalizeMeasureValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function __pmTrimMeasureValue(value) {
    if (value === null || value === undefined) return '';
    return String(parseFloat(value) || value).trim();
}

function __pmNormalizeSpaceTag(value) {
    const raw = String(value || '').trim();
    const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
    return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function __pmNormalizeDigitalMediaConfig(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const enabled = !!(source.enabled ?? source.activo ?? source.es_digital);
    const rawType = __pmNormalizeSpaceTag(source.media_type || source.tipo_medio || source.tipo || source.formato || 'imagen');
    const durationValue = __pmNormalizeMeasureValue(source.duration_value ?? source.duracion_valor ?? source.duracion);
    const unit = String(source.duration_unit || source.duracion_unidad || 'segundos').trim().toLowerCase();
    const pixelWidth = __pmNormalizeMeasureValue(source.pixel_width ?? source.pixeles_ancho ?? source.ancho_px);
    const pixelHeight = __pmNormalizeMeasureValue(source.pixel_height ?? source.pixeles_alto ?? source.alto_px);
    return {
        enabled,
        media_type: rawType.includes('imagen') && rawType.includes('video') ? 'imagen_video' : (rawType.includes('video') ? 'video' : 'imagen'),
        duration_value: durationValue,
        duration_unit: unit === 'minutos' ? 'minutos' : 'segundos',
        pixel_width: pixelWidth,
        pixel_height: pixelHeight
    };
}

function __pmResolveDigitalMediaConfig(detailSpace = {}, catalogSpace = {}) {
    const hasDetailConfig = !!detailSpace && typeof detailSpace === 'object' && (
        Object.prototype.hasOwnProperty.call(detailSpace, 'digital_media') ||
        Object.prototype.hasOwnProperty.call(detailSpace, 'digitalMedia') ||
        Object.prototype.hasOwnProperty.call(detailSpace, 'medio_digital')
    );
    const detailCfg = __pmNormalizeDigitalMediaConfig(detailSpace?.digital_media || detailSpace?.digitalMedia || detailSpace?.medio_digital || {});
    if (hasDetailConfig || detailCfg.enabled) return detailCfg;
    const catalogB2b = __pmParseRecordJson(catalogSpace?.config_b2b);
    return __pmNormalizeDigitalMediaConfig(catalogB2b.digital_media || catalogB2b.digitalMedia || catalogB2b.medio_digital || {});
}

function __pmDigitalMediaTypeLabel(config) {
    const t = __pmNormalizeDigitalMediaConfig(config).media_type;
    if (t === 'imagen_video') return 'Imagen / Video';
    return t === 'video' ? 'Video' : 'Imagen';
}

function __pmDigitalMediaDurationUnitAbbr(unit = '') {
    const normalized = __pmNormalizeSpaceTag(unit);
    if (normalized.includes('min')) return 'min';
    return 's';
}

function __pmDigitalMediaResolutionText(config) {
    const cfg = __pmNormalizeDigitalMediaConfig(config);
    if (cfg.pixel_width === null || cfg.pixel_height === null) return '--';
    return `${__pmTrimMeasureValue(cfg.pixel_width)} x ${__pmTrimMeasureValue(cfg.pixel_height)}`;
}

function __pmDigitalMediaDurationText(config) {
    const cfg = __pmNormalizeDigitalMediaConfig(config);
    if (cfg.duration_value === null) return '--';
    return `${__pmTrimMeasureValue(cfg.duration_value)} ${__pmDigitalMediaDurationUnitAbbr(cfg.duration_unit)}`;
}

function __pmDigitalMediaDetailHtml(config) {
    const resolutionText = __pmDigitalMediaResolutionText(config);
    const durationText = __pmDigitalMediaDurationText(config);
    const rows = [];
    if (resolutionText !== '--') rows.push(resolutionText);
    if (durationText !== '--') rows.push(durationText);
    return rows.length ? rows.map(row => __pmSafeHtml(row)).join('<br>') : '<span class="text-gray-300">---</span>';
}

function __pmDigitalMediaDetailText(config) {
    const resolutionText = __pmDigitalMediaResolutionText(config);
    const durationText = __pmDigitalMediaDurationText(config);
    const rows = [];
    if (resolutionText !== '--') rows.push(resolutionText);
    if (durationText !== '--') rows.push(durationText);
    return rows.join(' · ');
}

function __pmResolvePdfSpaceDetail(detailSpace, catalogSpace) {
    const digitalMedia = __pmResolveDigitalMediaConfig(detailSpace, catalogSpace);
    if (digitalMedia.enabled) return __pmDigitalMediaTypeLabel(digitalMedia);
    const locationValue = __pmResolveDetailLocation(detailSpace, catalogSpace);
    if (__pmIsLocationDetailSpace(detailSpace, catalogSpace)) {
        return locationValue || '--';
    }
    const detailMaterialMeasure = __pmResolveDetailMaterialMeasure(detailSpace, catalogSpace);
    return String(detailMaterialMeasure.material || '').trim() || '--';
}

function __pmResolvePdfMeasureHtml(detailSpace, catalogSpace) {
    const digitalMedia = __pmResolveDigitalMediaConfig(detailSpace, catalogSpace);
    if (digitalMedia.enabled) return __pmDigitalMediaDetailHtml(digitalMedia);
    const detailMaterialMeasure = __pmResolveDetailMaterialMeasure(detailSpace, catalogSpace);
    const width = detailMaterialMeasure.medida_ancho;
    const height = detailMaterialMeasure.medida_alto;
    const unit = detailMaterialMeasure.medida_unidad || 'M';
    const measuresStr = (width !== null && width !== undefined && height !== null && height !== undefined) ? `${width}x${height} ${unit}` : '--';
    return __pmSafeHtml(measuresStr);
}
function __pmResolvePdfDetailHeader(detailSpaces = [], fallbackOrder = null, fallbackCatalogSpace = null) {
    const candidates = Array.isArray(detailSpaces) && detailSpaces.length ? detailSpaces : [fallbackOrder].filter(Boolean);
    let hasLocation = false;
    let hasMaterial = false;
    candidates.forEach((item) => {
        const catalogSpace = __pmResolveAssignedSpace(item, fallbackCatalogSpace || __pmFindSpaceByAnyId(item?.espacio_id || item?.space_id || item?.espacioId || item?.spaceId || ''));
        if (__pmIsLocationDetailSpace(item, catalogSpace)) hasLocation = true;
        else hasMaterial = true;
    });
    if (hasLocation && !hasMaterial) return 'Ubicación';
    if (hasMaterial && !hasLocation) return 'Material';
    return 'Detalle';
}
async function __pmLoadMaterials() {
    const fallbackMaterials = (Array.isArray(allSpaces) ? allSpaces : [])
        .map((space) => __pmNormalizeMaterialLabel(space?.material))
        .filter(Boolean);
    try {
        const tenant = __pmResolveTenantSlug('plaza_mayor');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'materiales_pm');
        if (error) throw error;
        const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
        const items = __pmParseConfigJsonValue(row?.valor_json)?.items;
        __pmMaterialsList = __pmBuildMaterialOptions(items, fallbackMaterials);
    } catch (e) {
        __pmMaterialsList = __pmBuildMaterialOptions(fallbackMaterials, []);
    }
}
async function __pmLoadLocations() {
    const fallback = (Array.isArray(allSpaces) ? allSpaces : [])
        .map((space) => __pmNormalizeLocationLabel(space?.ubicacion || ''))
        .filter(Boolean);
    try {
        const tenant = __pmResolveTenantSlug('plaza_mayor');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', 'ubicaciones_pm');
        if (error) throw error;
        const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
        const items = __pmParseConfigJsonValue(row?.valor_json)?.items;
        __pmLocationsList = __pmBuildLocationOptions(items, fallback);
    } catch (_) {
        __pmLocationsList = __pmBuildLocationOptions(fallback, []);
    }
}
function __pmPopulateMaterialSelect(selectId, selectedValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Sin material —</option>' + __pmMaterialsList.map(m => `<option value="${m}">${m}</option>`).join('');
    if (selectedValue) sel.value = selectedValue;
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
            const aReady = __pmIsOrderClientProfileReady(a) ? 1 : 0;
            const bReady = __pmIsOrderClientProfileReady(b) ? 1 : 0;
            if (aReady !== bReady) return bReady - aReady;
            return String(a?.nombre_completo || '').localeCompare(String(b?.nombre_completo || ''), 'es');
        });
        orderClientProfilesById = {}; orderClientProfiles.forEach(c => orderClientProfilesById[c.id] = c);
        const current = String(sel.value || hid?.value || '').trim();
        sel.innerHTML = '<option value="">— Sin perfil —</option>' + orderClientProfiles.map(c => `<option value="${c.id}">${(c.nombre_completo || '').toUpperCase()} • ${__pmIsOrderClientProfileReady(c) ? 'LISTO' : 'PENDIENTE'}</option>`).join('');
        if (current) {
            sel.value = current;
            if (hid) hid.value = sel.value || '';
        }

        sel.onchange = () => {
            const id = sel.value; if (!id) { if (hid) hid.value = ''; return; }
            const c = orderClientProfilesById[id]; if (!c) return;
            if (!__pmIsOrderClientProfileReady(c)) {
                if (hid) hid.value = '';
                sel.value = '';
                window.showToast?.('Este perfil aun no tiene expediente validado. Usa captura manual o pide al cliente completar su expediente.', 'info');
                return;
            }
            if (hid) hid.value = id;
            if(document.getElementById('oed-client')) document.getElementById('oed-client').value = c.nombre_completo || '';
            if(document.getElementById('oed-phone')) document.getElementById('oed-phone').value = (c.telefono || '');
            if(document.getElementById('oed-email')) document.getElementById('oed-email').value = (c.correo || '');
            if(document.getElementById('fiscal-rfc-re')) document.getElementById('fiscal-rfc-re').value = (c.rfc || '');
        };
        const clearAssoc = () => { if (sel.value) sel.value = ''; if (hid) hid.value = ''; };
        ['oed-client','oed-phone','oed-email','fiscal-rfc-re'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', clearAssoc); });
        window.HUB_CLIENT_PROFILE_HOVER?.bindSelect?.(sel, () => {
            const selectedId = String(sel?.value || hid?.value || '').trim();
            return selectedId ? (orderClientProfilesById[selectedId] || null) : null;
        }, { tenant: 'plaza_mayor' });
    } catch (e) { console.warn("No se pudo cargar clientes", e); }
}

function __pmIsOrderClientProfileReady(client) {
    if (!client) return false;
    if (window.HUB_CLIENT_PROFILE_HOVER?.isQuoteReady) {
        return window.HUB_CLIENT_PROFILE_HOVER.isQuoteReady(client, 'plaza_mayor');
    }
    return client?.perfil_validado === true;
}

function __pmOrderNormalizeMatchValue(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function __pmResolveOrderClientProfileId(order = {}) {
    const requestedId = String(order?.cliente_id || '').trim();
    if (requestedId && orderClientProfilesById[requestedId]) return requestedId;
    const targetEmail = __pmOrderNormalizeMatchValue(order?.cliente_email);
    const targetName = __pmOrderNormalizeMatchValue(order?.cliente_nombre);
    const targetRfc = __pmOrderNormalizeMatchValue(order?.cliente_rfc).replace(/\s+/g, '');
    const match = orderClientProfiles.find((profile) => {
        if (!profile) return false;
        const email = __pmOrderNormalizeMatchValue(profile.correo);
        const name = __pmOrderNormalizeMatchValue(profile.nombre_completo);
        const rfc = __pmOrderNormalizeMatchValue(profile.rfc).replace(/\s+/g, '');
        if (targetEmail && email && targetEmail === email) return true;
        if (targetRfc && rfc && targetRfc === rfc) return true;
        if (targetName && name && targetName === name) return true;
        return false;
    });
    return match?.id ? String(match.id) : '';
}

function __pmApplyOrderClientProfileSelection(order = {}) {
    const sel = document.getElementById('oed-client-profile');
    const hid = document.getElementById('oed-client-id');
    if (!sel) return '';
    const profileId = __pmResolveOrderClientProfileId(order);
    sel.value = profileId || '';
    if (hid) hid.value = profileId || '';
    return profileId;
}

const _p = (window.location.pathname || '') + ' ' + (window.location.href || '');
const _isCP = /\/cotizadorcp(\/|$)/.test(window.location.pathname || '') || _p.includes('cotizadorcp');
const COMPANY_LOGO_URL = _isCP ? ((window.HUB_CONFIG && (window.HUB_CONFIG.companyLogoUrlCP || window.HUB_CONFIG.cpLogoUrl)) || '../public/assets/logocp.png') : ((window.HUB_CONFIG && window.HUB_CONFIG.companyLogoUrl) || '../public/assets/logo.png');
function __pmDefaultLetterheadUrl() {
    return (window.HUB_CONFIG && (window.HUB_CONFIG.pmPdfLetterheadUrl || window.HUB_CONFIG.pdfLetterheadPlazaMayorUrl)) || '../public/assets/img/pm-letterhead-default.png';
}
let __PM_LETTERHEAD_URL = __pmDefaultLetterheadUrl();
const __PM_PDF_PAGE_WIDTH_PX = 816;
const __PM_PDF_PAGE_HEIGHT_PX = 1056;
const __PM_LETTERHEAD_DESIGN_WIDTH_PX = 1275;
const __PM_LETTERHEAD_DESIGN_HEIGHT_PX = 1650;
const __PM_LETTERHEAD_MARGINS_DESIGN_PX = { top: 150, right: 45, bottom: 85, left: 45 };
const __PM_PDF_CONTENT_BASE_WIDTH_PX = 816;
const __PM_CFG_LETTERHEAD_KEY = 'pdf_letterhead_path';
const __PM_LETTERHEAD_PATH = 'membretes_pdf';
let __PM_LETTERHEAD_STORAGE_PATH = '';
let __PM_LETTERHEAD_SIGNED_AT = 0;
const __PM_LETTERHEAD_SIGN_TTL_MS = 45 * 60 * 1000;

function __pmCssSafeUrl(url) {
    return String(url || '')
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'")
        .replace(/\)/g, '\\)');
}

function __pmBasename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}

async function __pmResolveLetterheadSignedUrl(path) {
    const safePath = String(path || '').trim().replace(/\\/g, '/');
    if (!safePath || !window.globalPocketBase?.storage?.from) return '';
    const bucket = window.globalPocketBase.storage.from('documentos');
    const { data: signed, error: signedError } = await bucket.createSignedUrl(safePath, 3600);
    if (!signedError && signed?.signedUrl) return signed.signedUrl;
    const fallbackName = __pmBasename(safePath);
    if (!fallbackName) return '';
    const fallbackPath = `${__PM_LETTERHEAD_PATH}/${fallbackName}`;
    const { data: fallbackSigned, error: fallbackErr } = await bucket.createSignedUrl(fallbackPath, 3600);
    return !fallbackErr && fallbackSigned?.signedUrl ? fallbackSigned.signedUrl : '';
}

async function __pmRefreshLetterheadUrl(force = false) {
    const defaultUrl = __pmDefaultLetterheadUrl();
    if (!__PM_LETTERHEAD_STORAGE_PATH) {
        __PM_LETTERHEAD_URL = defaultUrl;
        return __PM_LETTERHEAD_URL;
    }
    const age = Date.now() - (__PM_LETTERHEAD_SIGNED_AT || 0);
    if (!force && __PM_LETTERHEAD_URL && age > 0 && age < __PM_LETTERHEAD_SIGN_TTL_MS) {
        return __PM_LETTERHEAD_URL;
    }
    try {
        const signedUrl = await __pmResolveLetterheadSignedUrl(__PM_LETTERHEAD_STORAGE_PATH);
        __PM_LETTERHEAD_URL = signedUrl || defaultUrl;
        __PM_LETTERHEAD_SIGNED_AT = signedUrl ? Date.now() : 0;
    } catch (_) {
        __PM_LETTERHEAD_URL = defaultUrl;
        __PM_LETTERHEAD_SIGNED_AT = 0;
    }
    return __PM_LETTERHEAD_URL;
}

async function __pmLoadLetterheadConfig(forceRefresh = false) {
    __PM_LETTERHEAD_URL = __pmDefaultLetterheadUrl();
    try {
        const tenant = __pmResolveTenantSlug('plaza_mayor');
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json,updated,updated_at,created,created_at')
            .eq('tenant', tenant)
            .eq('clave', __PM_CFG_LETTERHEAD_KEY);
        if (error) return __PM_LETTERHEAD_URL;
        const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
        if (!row) return __PM_LETTERHEAD_URL;
        const cfg = __pmParseRecordJson(row.valor_json);
        const rawPath = cfg.path || cfg.file_path || cfg.value || '';
        const safePath = rawPath || (cfg.file_name ? `${__PM_LETTERHEAD_PATH}/${cfg.file_name}` : '');
        if (safePath) __PM_LETTERHEAD_STORAGE_PATH = String(safePath).replace(/\\/g, '/');
    } catch (_) {}
    return __pmRefreshLetterheadUrl(!!forceRefresh);
}

function __pmLetterheadFrame() {
    const sx = __PM_PDF_PAGE_WIDTH_PX / __PM_LETTERHEAD_DESIGN_WIDTH_PX;
    const sy = __PM_PDF_PAGE_HEIGHT_PX / __PM_LETTERHEAD_DESIGN_HEIGHT_PX;
    const top = __PM_LETTERHEAD_MARGINS_DESIGN_PX.top * sy;
    const right = __PM_LETTERHEAD_MARGINS_DESIGN_PX.right * sx;
    const bottom = __PM_LETTERHEAD_MARGINS_DESIGN_PX.bottom * sy;
    const left = __PM_LETTERHEAD_MARGINS_DESIGN_PX.left * sx;
    return {
        top,
        right,
        bottom,
        left,
        width: __PM_PDF_PAGE_WIDTH_PX - left - right,
        height: __PM_PDF_PAGE_HEIGHT_PX - top - bottom
    };
}

function __pmContentBaseHeightPx() {
    const frame = __pmLetterheadFrame();
    if (!frame.width || !frame.height) return 945;
    return (__PM_PDF_CONTENT_BASE_WIDTH_PX * frame.height) / frame.width;
}

function __pmWrapLetterheadPage(innerHtml, options = {}) {
    const frame = __pmLetterheadFrame();
    const baseWidth = Math.max(1, parseFloat(options.baseWidth) || __PM_PDF_PAGE_WIDTH_PX);
    const baseHeight = Math.max(1, parseFloat(options.baseHeight) || __PM_PDF_PAGE_HEIGHT_PX);
    const scale = Math.min(frame.width / baseWidth, frame.height / baseHeight);
    const finalW = baseWidth * scale;
    const finalH = baseHeight * scale;
    const left = frame.left + ((frame.width - finalW) / 2);
    const top = frame.top + ((frame.height - finalH) / 2);
    const bgUrl = __pmCssSafeUrl(__PM_LETTERHEAD_URL);
    const imageLayer = bgUrl
        ? `<img data-pm-letterhead="1" src='${bgUrl}' ${bgUrl.startsWith('http') ? "crossorigin='anonymous'" : ""} onerror='this.style.display=\"none\"' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;'>`
        : '';
return `<div style="position:relative;width:${__PM_PDF_PAGE_WIDTH_PX}px;height:${__PM_PDF_PAGE_HEIGHT_PX}px;box-sizing:border-box;overflow:visible;background:#f5f5f5;">${imageLayer}<div data-pdf-preview-frame="1" data-base-width="${baseWidth}" data-base-height="${baseHeight}" style="position:absolute;left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${baseWidth}px;height:${baseHeight}px;transform:scale(${scale.toFixed(6)});transform-origin:top left;overflow:visible;z-index:1;">${innerHtml}</div></div>`;
}

const PB_URL = window.HUB_CONFIG?.pocketbaseUrl || window.ENV?.POCKETBASE_URL || '';
const PB_KEY = window.HUB_CONFIG?.pocketbaseAnonKey || window.ENV?.POCKETBASE_ANON_KEY || '';
const FIN_SCHEMA = (typeof TENANT_SCHEMA !== 'undefined' && TENANT_SCHEMA)
    ? TENANT_SCHEMA
    : (window.HUB_CONFIG?.finanzasSchema || window.ENV?.SCHEMA_PLAZA_MAYOR || 'finanzas');
const STATUS_LEVEL = { 'pendiente': 0, 'rechazada': 0, 'aprobada': 1, 'finalizada': 2 };
const PM_ORDERS_PAGE_MODE = window.__PM_ORDERS_MODE || 'list';
const IS_PM_ORDER_DETAIL_PAGE = PM_ORDERS_PAGE_MODE === 'detail';
const IS_PM_ORDER_PREVIEW_PAGE = PM_ORDERS_PAGE_MODE === 'preview';
const PM_ORDERS_REFRESH_KEY = 'pm_orders_refresh_signal';

function __pmIsPreviewOnlyQueryMode() {
    try {
        return String(new URLSearchParams(window.location.search || '').get('previewOnly') || '') === '1';
    } catch (_) {
        return false;
    }
}

function __pmIsPdfPreviewVisible() {
    const root = document.getElementById('pdf-content');
    if (!root || root.classList.contains('hidden')) return false;
    if (IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode()) return true;
    const modal = document.getElementById('preview-modal');
    return !!modal && !modal.classList.contains('hidden');
}

let __pmPreviewExclusiveHiddenNodes = [];
function __pmShouldUseExclusivePreviewMode() {
    return IS_PM_ORDER_DETAIL_PAGE || IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode();
}
function __pmSetExclusivePreviewMode(active) {
    if (!__pmShouldUseExclusivePreviewMode()) return;
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;

    if (active) {
        __pmPreviewExclusiveHiddenNodes = [];
        Array.from(body.children || []).forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.id === 'preview-modal') return;
            if (node.tagName === 'SCRIPT') return;
            if (node.classList.contains('hidden')) return;
            node.classList.add('hidden');
            __pmPreviewExclusiveHiddenNodes.push(node);
        });
    } else if (__pmPreviewExclusiveHiddenNodes.length) {
        __pmPreviewExclusiveHiddenNodes.forEach((node) => {
            if (node && node.isConnected) node.classList.remove('hidden');
        });
        __pmPreviewExclusiveHiddenNodes = [];
    }

    body.classList.toggle('preview-exclusive', !!active);
    body.style.overflow = active ? 'hidden' : '';
    root.style.overflow = active ? 'hidden' : '';
}

function __pmClosePreviewTabIfNeeded() {
    if (!(IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode())) return;
    const attemptClose = () => {
        try {
            if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') {
                window.__HUB_ALLOW_NEXT_UNLOAD('pm_preview_tab_close');
            }
            window.close();
        } catch (_) {}
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
                    try { window.showToast("No se pudo cerrar automáticamente la pestaña. Ciérrala manualmente.", "info"); } catch (_) {}
                }
            }
        }, 120);
    }, 40);
}

const PM_CONVENIOS_CFG_KEY = 'convenios_pm';
const PM_CONVENIO_INDEFINITE_END = '2099-12-31';
let allOrders = [], allSpaces = [], catalogConcepts = [], dbTaxes = [], currentPreviewOrder = null;
let currentConcepts = []; 
let myPermissions = { access: false, orders_edit: false };
let currentUserProfile = null;
let pmSpaceCardOrder = [];
let __pmLastRefreshSignalTs = 0;
let __pmOrderDetailDirty = false;
let __pmOrderDetailDirtyBound = false;
let __pmOrderDetailAutoSaveTimer = null;
let __pmOrderDetailAutoSaveBound = false;
let __pmOrderUsersById = Object.create(null);
let pmConvenioCatalog = [];

function __pmNormalizeOrderAccessRole(value) {
    const safe = String(value || '').trim().toLowerCase();
    if (!safe) return '';
    if (safe === 'administrador' || safe === 'administrator' || safe === 'superadmin' || safe === 'super_admin') return 'admin';
    return safe;
}

function __pmResolveOrderAccess() {
    const authCtx = window.__HUB_AUTH_CONTEXT || {};
    const profile = authCtx.profile || window.currentUserProfile || {};
    const perms = authCtx.permissions || {};
    const role = __pmNormalizeOrderAccessRole(authCtx.role || profile.role || profile.rol || '');
    return {
        role,
        perms,
        isAdmin: authCtx.isAdmin === true
    };
}

function __pmCanEditOrders() {
    const access = __pmResolveOrderAccess();
    if (access.isAdmin) return true;
    if (Object.prototype.hasOwnProperty.call(access.perms || {}, 'orders_edit')) return access.perms.orders_edit === true;
    return false;
}

function __pmCanDeleteOrders() {
    const rbac = window.HUB_RBAC || null;
    if (rbac?.can) return rbac.can('quotes_delete');
    const access = __pmResolveOrderAccess();
    if (Object.prototype.hasOwnProperty.call(access.perms || {}, 'quotes_delete')) return access.perms.quotes_delete === true;
    return access.isAdmin === true;
}

function __pmOrderReadOnlyMessage() {
    return 'Modo solo lectura: el verificador puede revisar cotizaciones, pero no crearlas ni modificarlas.';
}

function __pmNormalizeConvenioName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function __pmConvenioNameKey(value) {
    return __pmNormalizeConvenioName(value).toLowerCase();
}

function __pmBuildConvenioCatalog(items = []) {
    const source = Array.isArray(items) ? items : [];
    const seen = new Set();
    const out = [];
    source.forEach((item, idx) => {
        const record = (item && typeof item === 'object') ? item : { nombre: item };
        const nombre = __pmNormalizeConvenioName(record.nombre || record.name || record.label || '');
        const key = __pmConvenioNameKey(nombre);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({
            id: String(record.id || `conv_${idx}_${key.replace(/\s+/g, '_')}`),
            nombre
        });
    });
    return out;
}

function __pmIsConvenioConceptItem(concept = {}) {
    return !!(concept?.meta && concept.meta.convenio_item === true);
}

function __pmFormatConvenioConceptDescription(nombre, cantidad) {
    const label = __pmNormalizeConvenioName(nombre) || 'Convenio';
    const qty = Math.max(1, parseInt(cantidad, 10) || 1);
    return `${label} (${qty} ${qty === 1 ? 'entrega' : 'entregas'})`;
}

function __pmBuildConvenioConcept(option = {}, cantidad, amount) {
    const qty = Math.max(1, parseInt(cantidad, 10) || 1);
    const value = Math.max(0, parseFloat(amount || 0) || 0);
    const nombre = __pmNormalizeConvenioName(option?.nombre || option?.name || option?.label || '');
    return {
        description: __pmFormatConvenioConceptDescription(nombre, qty),
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
    };
}

function __pmGetVisibleExtraConceptIndexes() {
    const out = [];
    (currentConcepts || []).forEach((concept, idx) => {
        if (!__pmIsConvenioConceptItem(concept)) out.push(idx);
    });
    return out;
}

function __pmGetVisibleExtraConcepts() {
    return __pmGetVisibleExtraConceptIndexes().map((idx) => currentConcepts[idx]);
}

function __pmSanitizeConvenioItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item) => {
        const qty = Math.max(1, parseInt(item?.cantidad_entrega || item?.cantidad || 1, 10) || 1);
        const amount = Math.max(0, parseFloat(item?.monto ?? item?.amount ?? item?.value ?? 0) || 0);
        return {
            id: String(item?.id || item?.convenio_option_id || '').trim() || null,
            nombre: __pmNormalizeConvenioName(item?.nombre || item?.convenio_nombre || item?.description || 'Convenio') || 'Convenio',
            cantidad_entrega: qty,
            monto: amount
        };
    }).filter((item) => !!item.nombre);
}

function __pmSanitizeConvenioEvidenceItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item, idx) => {
        const path = String(item?.path || item?.file_path || item?.url || '').trim();
        if (!path) return null;
        return {
            id: String(item?.id || `evidence_${idx + 1}`).trim() || `evidence_${idx + 1}`,
            path,
            file_name: String(item?.file_name || item?.nombre_archivo || path.split('/').pop() || `evidencia_${idx + 1}.jpg`).trim(),
            uploaded_at: item?.uploaded_at || item?.created_at || new Date().toISOString(),
            mime_type: String(item?.mime_type || item?.type || item?.content_type || 'image/jpeg').trim() || 'image/jpeg',
            size: parseInt(item?.size || item?.bytes || 0, 10) || 0
        };
    }).filter(Boolean);
}

function __pmParseConvenioMeta(source = {}) {
    const details = (source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, 'detalles_evento'))
        ? __pmParseRecordJson(source.detalles_evento)
        : __pmParseRecordJson(source);
    const raw = details?.convenio && typeof details.convenio === 'object' ? details.convenio : {};
    const items = __pmSanitizeConvenioItems(raw?.items || raw?.tratos || []);
    const espacios = Array.isArray(raw?.espacios) ? raw.espacios : [];
    const evidencias = __pmSanitizeConvenioEvidenceItems(raw?.evidencias || raw?.evidence || []);
    const activeSignals = items.length > 0 || espacios.length > 0 || evidencias.length > 0;
    return {
        activo: __pmNormalizeSpaceConvenioFlag(raw?.activo, activeSignals) || activeSignals,
        activo_explicit: __pmNormalizeSpaceConvenioFlag(raw?.activo, false),
        bloqueo_indefinido: __pmNormalizeSpaceConvenioFlag(raw?.bloqueo_indefinido, true),
        requiere_evidencia: __pmNormalizeSpaceConvenioFlag(raw?.requiere_evidencia, true),
        evidencia_minima: Math.max(1, parseInt(raw?.evidencia_minima || 3, 10) || 3),
        evidencia_maxima: Math.max(1, parseInt(raw?.evidencia_maxima || 5, 10) || 5),
        requiere_factura: __pmNormalizeSpaceConvenioFlag(raw?.requiere_factura, false),
        requiere_recibo: __pmNormalizeSpaceConvenioFlag(raw?.requiere_recibo, false),
        requiere_contrato: __pmNormalizeSpaceConvenioFlag(raw?.requiere_contrato, false),
        items,
        espacios,
        evidencias
    };
}

function __pmGetConvenioEvidence(order = {}) {
    return __pmParseConvenioMeta(order).evidencias;
}

function __pmIsConvenioOrder(order = {}) {
    const meta = __pmParseConvenioMeta(order);
    if (meta.activo || meta.items.length || meta.espacios.length || meta.evidencias.length) return true;
    const concepts = __pmNormalizeConceptsArray(order?.conceptos_adicionales);
    if (concepts.some((concept) => __pmIsConvenioConceptItem(concept))) return true;
    const details = __pmParseRecordJson(order?.espacios_detalle);
    if (!Array.isArray(details)) return false;
    return details.some((detail) => {
        const items = __pmSanitizeConvenioItems(detail?.convenio_items || []);
        const delivered = parseFloat(detail?.convenio_monto_entregado || 0) || 0;
        return __pmNormalizeSpaceConvenioFlag(detail?.convenio_activo, false)
            || __pmNormalizeSpaceConvenioFlag(detail?.convenio_indefinido, false)
            || items.length > 0
            || delivered > 0.009;
    });
}

function __pmConvenioCovered(baseValue, deliveredValue, balanceValue = undefined) {
    const balance = parseFloat(balanceValue);
    if (Number.isFinite(balance)) return balance <= 0.009;
    const base = Math.max(0, parseFloat(baseValue || 0) || 0);
    const delivered = Math.max(0, parseFloat(deliveredValue || 0) || 0);
    if (base <= 0) return false;
    return delivered + 0.009 >= base;
}
function __pmHasFiniteConvenioEndDate(value) {
    const raw = String(value || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw !== PM_CONVENIO_INDEFINITE_END;
}
function __pmSpaceDetailBlocksIndefinitely(detail = {}) {
    const row = detail && typeof detail === 'object' ? detail : {};
    const flagged = __pmNormalizeSpaceConvenioFlag(row?.convenio_activo, false)
        || __pmNormalizeSpaceConvenioFlag(row?.convenio_indefinido, false)
        || __pmNormalizeSpaceConvenioFlag(row?.bloqueo_indefinido, false);
    if (!flagged) return false;
    // Auditoria TI: una fecha fin real tiene prioridad sobre la marca heredada de bloqueo indefinido.
    if (__pmHasFiniteConvenioEndDate(row?.fecha_fin || row?.endDate)) return false;
    return __pmConvenioCovered(
        row?.subtotal_espacio ?? row?.baseValue,
        row?.convenio_monto_entregado ?? row?.convenioValue,
        row?.convenio_balance
    );
}
function __pmOrderBlocksIndefinitely(order = {}) {
    const meta = __pmParseConvenioMeta(order);
    const details = __pmParseRecordJson(order?.espacios_detalle);
    if (Array.isArray(details) && details.length) return details.some((detail) => __pmSpaceDetailBlocksIndefinitely(detail));
    if (__pmHasFiniteConvenioEndDate(order?.fecha_fin || order?.endDate)) return false;
    if (!(meta.activo && meta.bloqueo_indefinido)) return false;
    const breakdown = __pmParseRecordJson(order?.desglose_precios);
    return __pmConvenioCovered(
        breakdown?.convenio_base_total,
        breakdown?.convenio_entregable_total,
        breakdown?.convenio_balance_total ?? order?.precio_final
    );
}

function __pmNormalizeSpaceConvenioFlag(value, fallback = true) {
    if (value === null || value === undefined || value === '') return !!fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const raw = String(value).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(raw)) return false;
    if (['true', '1', 'si', 'sí', 'yes', 'on'].includes(raw)) return true;
    return !!fallback;
}

// Convenios de Plaza Mayor solo pueden asignarse a espacios publicitarios con
// la bandera explicita `permite_convenio`; esto mantiene alineado el selector,
// la edicion y la persistencia de la carta convenio.
function __pmSpaceAllowsConvenio(space = {}) {
    return __pmSpaceHasTag(space, 'publicidad') && __pmNormalizeSpaceConvenioFlag(space?.permite_convenio, false);
}

function __pmGetQuoteDocumentMeta(orderLike = {}) {
    const isConvenio = __pmIsConvenioOrder(orderLike);
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

function __pmNormalizeTenantSlug(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'finanzas' || raw.indexOf('plaza') !== -1) return 'plaza_mayor';
    if (raw.indexOf('casadepiedra') !== -1 || raw.indexOf('casa_de_piedra') !== -1 || raw.indexOf('casa-de-piedra') !== -1) return 'casa_de_piedra';
    return raw;
}

function __pmResolveTenantSlug(fallback = '') {
    const fromClient = __pmNormalizeTenantSlug(window.tenantPocketBase?.tenant || '');
    if (fromClient) return fromClient;
    const fromFallback = __pmNormalizeTenantSlug(fallback);
    if (fromFallback) return fromFallback;
    const fromSchema = __pmNormalizeTenantSlug(FIN_SCHEMA);
    if (fromSchema) return fromSchema;
    const path = String(window.location.pathname || '').toLowerCase();
    return path.indexOf('/cotizadorcp/') !== -1 ? 'casa_de_piedra' : 'plaza_mayor';
}

function __pmFilterRowsByTenant(rows, fallback = '') {
    const tenant = __pmResolveTenantSlug(fallback);
    const source = Array.isArray(rows) ? rows : [];
    if (!tenant) return source.slice();
    return source.filter((row) => {
        const rowTenant = __pmNormalizeTenantSlug(row?.tenant || '');
        return !rowTenant || rowTenant === tenant;
    });
}

window.__HUB_HAS_UNSAVED_CHANGES = function() {
    try {
        return IS_PM_ORDER_DETAIL_PAGE === true && __pmOrderDetailDirty === true;
    } catch (_) {
        return false;
    }
};

function __pmReadAuthState(key) {
    try {
        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function __pmResolveCurrentActorId() {
    const authState = __pmReadAuthState('pb_native_auth_v1');
    const candidates = [
        currentUserProfile?.id,
        currentUserProfile?.record?.id,
        currentUserProfile?.user?.id,
        authState?.user?.id,
        authState?.record?.id
    ];
    return candidates.map((v) => String(v || '').trim()).find(Boolean) || '';
}

function __pmResolveCurrentActorName() {
    const fromProfile = __pmSanitizeActorName(__pmResolvePdfActorName?.());
    if (fromProfile) return fromProfile;
    const cachedName = __pmSanitizeActorName(localStorage.getItem('hub_user_cache_name') || '');
    if (cachedName) return cachedName;
    const authState = __pmReadAuthState('pb_native_auth_v1');
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
        .map((value) => __pmSanitizeActorName(value))
        .find(Boolean);
    if (username) return username;
    const email = [
        currentUserProfile?.email,
        currentUserProfile?.record?.email,
        authState?.user?.email,
        authState?.record?.email
    ].map((v) => String(v || '').trim()).find(Boolean) || '';
    const emailUser = __pmSanitizeActorName(email ? email.split('@')[0] : '');
    return emailUser || 'Usuario';
}

function __pmBuildQuoteAuditPayload(payload = {}) {
    const next = payload && typeof payload === 'object' ? { ...payload } : {};
    const actorId = __pmResolveCurrentActorId();
    const actorName = __pmResolveCurrentActorName();
    if (actorId) next.modificado_por = actorId;
    if (actorName) next.modificado_por_nombre = actorName;
    return next;
}

function __pmNormalizeQuoteUpdatePayload(payload = {}) {
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
        'contrato_en_blanco_url',
        'contrato_firmado_url',
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

function __pmMarkOrderDetailDirty() {
    if (!IS_PM_ORDER_DETAIL_PAGE) return;
    __pmOrderDetailDirty = true;
}

function __pmClearOrderDetailDirty() {
    __pmOrderDetailDirty = false;
    if (__pmOrderDetailAutoSaveTimer) {
        clearTimeout(__pmOrderDetailAutoSaveTimer);
        __pmOrderDetailAutoSaveTimer = null;
    }
}

function __pmBindOrderDetailDirtyTracking() {
    if (!IS_PM_ORDER_DETAIL_PAGE || __pmOrderDetailDirtyBound) return;
    const shouldTrack = (target) => {
        if (!(target instanceof Element)) return false;
        if (!target.closest('#order-edit-modal')) return false;
        if (target.closest('#generic-confirm-modal')) return false;
        return true;
    };
    const onInputOrChange = (event) => {
        if (!shouldTrack(event.target)) return;
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === 'hidden') return;
        __pmMarkOrderDetailDirty();
    };
    document.addEventListener('input', onInputOrChange, true);
    document.addEventListener('change', onInputOrChange, true);
    __pmOrderDetailDirtyBound = true;
}

function __pmScheduleOrderDetailAutoSave() {
    if (!IS_PM_ORDER_DETAIL_PAGE) return;
    if (!__pmCanEditOrders()) return;
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return;
    const nextStatus = String(document.getElementById('oed-status')?.value || '').toLowerCase();
    const prevStatus = String(currentPreviewOrder?.status || '').toLowerCase();
    if (nextStatus === 'aprobada' && prevStatus !== 'aprobada' && prevStatus !== 'finalizada') return;
    __pmMarkOrderDetailDirty();
    if (__pmOrderDetailAutoSaveTimer) clearTimeout(__pmOrderDetailAutoSaveTimer);
    __pmOrderDetailAutoSaveTimer = setTimeout(() => {
        window.processSaveOrder({ silent: true, relaxed: true, keepOpen: true, skipReload: true });
    }, 1500);
}

function __pmFlushOrderDetailAutoSave() {
    if (!IS_PM_ORDER_DETAIL_PAGE || __pmOrderDetailDirty !== true) return;
    if (!__pmCanEditOrders()) return;
    if (__pmOrderDetailAutoSaveTimer) {
        clearTimeout(__pmOrderDetailAutoSaveTimer);
        __pmOrderDetailAutoSaveTimer = null;
    }
    window.processSaveOrder({ silent: true, relaxed: true, keepOpen: true, skipReload: true });
}

function __pmBindOrderDetailAutoSave() {
    if (!IS_PM_ORDER_DETAIL_PAGE || __pmOrderDetailAutoSaveBound) return;
    if (!__pmCanEditOrders()) return;
    const root = document.getElementById('order-edit-modal');
    if (!root) return;
    const onFieldChange = () => __pmScheduleOrderDetailAutoSave();
    root.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.id === 'btn-save-progress') return;
        el.addEventListener('input', onFieldChange);
        el.addEventListener('change', onFieldChange);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') __pmFlushOrderDetailAutoSave();
    });
    window.addEventListener('pagehide', () => __pmFlushOrderDetailAutoSave());
    window.addEventListener('beforeunload', () => __pmFlushOrderDetailAutoSave());
    __pmOrderDetailAutoSaveBound = true;
}

function __pmNativeCotizaciones() {
    return window.PB_SERVICES && window.PB_SERVICES.cotizaciones ? window.PB_SERVICES.cotizaciones : null;
}

async function __pmQuotesList(params) {
    const svc = __pmNativeCotizaciones();
    if (svc) {
        try {
            const out = await svc.list(params || {}, { schema: FIN_SCHEMA });
            return { data: out.items || [], error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    const query = window.tenantPocketBase.from('cotizaciones').select('*');
    if (params && params.filter) {
        const rawFilter = String(params.filter);
        const wantsApproved = rawFilter.indexOf('status = "aprobada"') !== -1;
        const wantsFinalized = rawFilter.indexOf('status = "finalizada"') !== -1;
        if (wantsApproved && wantsFinalized) query.in('status', ['aprobada', 'finalizada']);
        else if (wantsApproved) query.eq('status', 'aprobada');
        else if (wantsFinalized) query.eq('status', 'finalizada');
    }
    if (params && params.sort) query.order(String(params.sort).replace('-', ''), { ascending: !String(params.sort).startsWith('-') });
    const result = await query;
    return { data: result.data || [], error: result.error || null };
}

async function __pmQuotesUpdate(id, payload) {
    const safePayload = __pmNormalizeQuoteUpdatePayload(__pmBuildQuoteAuditPayload(payload || {}));
    const svc = __pmNativeCotizaciones();
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

async function __pmQuoteGetById(id) {
    const svc = __pmNativeCotizaciones();
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

async function __pmEnsureOrderRecord(id) {
    const safeId = String(id || '').trim();
    if (!safeId) return null;
    if (String(currentPreviewOrder?.id || '') === safeId) return currentPreviewOrder;
    const existing = allOrders.find((row) => String(row.id || '') === safeId);
    if (existing) return existing;
    const { data, error } = await __pmQuoteGetById(safeId);
    if (error || !data) throw (error || new Error('No se encontró la cotización.'));
    const hydrated = __pmHydrateOrderPricing(data);
    if (!allOrders.some((row) => String(row.id || '') === safeId)) allOrders.push(hydrated);
    return hydrated;
}

async function __pmQuotesDelete(id) {
    const svc = __pmNativeCotizaciones();
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

window.safeFormatDate = function (dateStr) {
    if (!dateStr) return '--';
    const raw = String(dateStr).trim();
    const normalized = raw.replace('T', ' ').replace('Z', '');
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
        const [, year, month, day, hh, mm, ss] = match;
        const formattedDate = `${day}/${month}/${year}`;
        if (!hh || !mm) return formattedDate;
        return `${formattedDate} ${hh}:${mm}:${ss || '00'}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = String(parsed.getFullYear());
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    const ss = String(parsed.getSeconds()).padStart(2, '0');
    const formattedDate = `${day}/${month}/${year}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formattedDate;
    return `${formattedDate} ${hh}:${mm}:${ss}`;
};
window.parseIds = function(v){ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v === 'string'){ try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch(e){ return v.split(',').map(x=>x.trim()).filter(Boolean); } } return []; };

function __pmReadRefreshSignal() {
    try {
        const raw = localStorage.getItem(PM_ORDERS_REFRESH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        return { ts, reason: parsed?.reason || 'updated' };
    } catch (_) {
        return null;
    }
}

function __pmHandleExternalRefresh(force = false) {
    if (IS_PM_ORDER_DETAIL_PAGE || IS_PM_ORDER_PREVIEW_PAGE) return;
    const signal = __pmReadRefreshSignal();
    if (!signal) return;
    if (force || signal.ts > __pmLastRefreshSignalTs) {
        __pmLastRefreshSignalTs = signal.ts;
        window.loadOrders?.();
    }
}

window.__pmBroadcastOrdersRefresh = function(reason = 'saved') {
    const payload = { ts: Date.now(), reason };
    try { localStorage.setItem(PM_ORDERS_REFRESH_KEY, JSON.stringify(payload)); } catch (_) {}
    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'pm_orders_refresh', reason }, window.location.origin);
        }
    } catch (_) {}
};

window.downloadBlobAsFile = function(blob, fileName = 'documento.pdf') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

async function __pmWaitForPdfAssets(node, timeoutMs = 7000) {
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

function __pmGetPdfRenderHost() {
    let host = document.getElementById('pm-order-pdf-render-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'pm-order-pdf-render-host';
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

function __pmStripPdfEditingChrome(rootNode) {
    if (!(rootNode instanceof HTMLElement)) return;
    rootNode.classList.remove('pm-pdf-admin-enabled', 'pm-pdf-edit-selected', 'pm-pdf-base-selected', 'pm-pdf-editable');
    rootNode.querySelectorAll('.pdf-margin-guides-layer,[data-margin-guide]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.pm-pdf-delete-btn,[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove());
    rootNode.querySelectorAll('.pm-pdf-admin-enabled,.pm-pdf-edit-selected,.pm-pdf-base-selected,.pm-pdf-editable').forEach((node) => {
        node.classList.remove('pm-pdf-admin-enabled', 'pm-pdf-edit-selected', 'pm-pdf-base-selected', 'pm-pdf-editable');
        if (node instanceof HTMLElement) {
            node.style.outline = 'none';
            node.style.outlineOffset = '0';
        }
    });
}

window.generatePdfBlobFromNode = async function(sourceNode, extraOptions = {}) {
    if (!sourceNode) throw new Error('No hay contenido para generar PDF.');
    const host = __pmGetPdfRenderHost();
    const markup = String(sourceNode.innerHTML || '').trim();
    if (!markup) throw new Error('Contenido PDF vacío.');
    try {
        host.innerHTML = markup;
        const target = host.firstElementChild || host;
        if (target?.classList?.contains('hidden')) target.classList.remove('hidden');
        __pmStripPdfEditingChrome(target);
        await __pmRefreshLetterheadUrl(true);
        host.querySelectorAll('img[data-pm-letterhead="1"]').forEach((img) => {
            img.setAttribute('src', __PM_LETTERHEAD_URL);
            if (/^https?:/i.test(__PM_LETTERHEAD_URL)) img.setAttribute('crossorigin', 'anonymous');
            else img.removeAttribute('crossorigin');
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await __pmWaitForPdfAssets(target, 7000);

        const baseOptions = {
            margin: 0,
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
        const options = {
            ...baseOptions,
            ...extraOptions,
            image: { ...baseOptions.image, ...(extraOptions.image || {}) },
            html2canvas: { ...baseOptions.html2canvas, ...(extraOptions.html2canvas || {}) },
            jsPDF: { ...baseOptions.jsPDF, ...(extraOptions.jsPDF || {}) }
        };

        let blob = await html2pdf().set(options).from(target).output('blob');
        if (!blob || blob.size < 4096) {
            await new Promise(resolve => setTimeout(resolve, 400));
            blob = await html2pdf().set({
                ...options,
                html2canvas: { ...(options.html2canvas || {}), scale: 2.5 }
            }).from(target).output('blob');
        }
        if (!blob || blob.size < 4096) throw new Error('No se pudo generar el PDF correctamente.');
        return blob;
    } finally {
        host.innerHTML = '';
    }
};

async function __pmUploadApprovalSnapshotBlob(orderId, blob, formData = {}) {
    const safeOrderId = String(orderId || '').trim();
    if (!safeOrderId) throw new Error('Cotización inválida para snapshot.');
    if (!blob || !(blob.size > 0)) throw new Error('Snapshot PDF vacío.');
    const docMeta = __pmGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
    const folio = String(formData?.numero_orden || __pmResolveQuoteFolio(currentPreviewOrder, safeOrderId)).trim();
    const path = `${safeOrderId}/${docMeta.approvedStorageBase}_${folio}.pdf`;
    const { error: uploadErr } = await window.globalPocketBase.storage.from('documentos').upload(path, blob, { upsert: true });
    if (uploadErr) throw uploadErr;
    const { error: dbErr } = await __pmQuotesUpdate(safeOrderId, { status: 'aprobada', url_cotizacion_final: path });
    if (dbErr) throw dbErr;
    return { path, folio };
}

function __pmBuildApprovalSnapshotMeta(orderId, formData = {}) {
    const safeOrderId = String(orderId || '').trim();
    const docMeta = __pmGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
    const folio = String(formData?.numero_orden || __pmResolveQuoteFolio(currentPreviewOrder, safeOrderId)).trim();
    return {
        folio,
        path: safeOrderId ? `${safeOrderId}/${docMeta.approvedStorageBase}_${folio}.pdf` : ''
    };
}

async function __pmUploadApprovalSnapshotBlob(orderId, blob, formData = {}, options = {}) {
    const safeOrderId = String(orderId || '').trim();
    if (!safeOrderId) throw new Error('CotizaciÃ³n invÃ¡lida para snapshot.');
    if (!blob || !(blob.size > 0)) throw new Error('Snapshot PDF vacÃ­o.');
    const opts = options && typeof options === 'object' ? options : {};
    const resolved = __pmBuildApprovalSnapshotMeta(safeOrderId, formData);
    const folio = String(opts.folio || resolved.folio).trim();
    const path = String(opts.path || resolved.path || `${safeOrderId}/${__pmGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData }).approvedStorageBase}_${folio}.pdf`).trim();
    const { error: uploadErr } = await window.globalPocketBase.storage.from('documentos').upload(path, blob, { upsert: true });
    if (uploadErr) throw uploadErr;
    if (opts.persistQuote !== false) {
        const { error: dbErr } = await __pmQuotesUpdate(safeOrderId, { status: 'aprobada', url_cotizacion_final: path });
        if (dbErr) throw dbErr;
    }
    return { path, folio };
}

function __pmIsLockedOrder() {
    return ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
}

function __pmEnsureSpaceCardOrder() {
    const ids = allSpaces.map(s => String(s.id));
    pmSpaceCardOrder = pmSpaceCardOrder.filter(id => ids.includes(id));
    ids.forEach(id => { if (!pmSpaceCardOrder.includes(id)) pmSpaceCardOrder.push(id); });
}

window.scrollOrderSpaceCards = function(direction) {
    const viewport = document.getElementById('oed-space-cards');
    if (!viewport) return;
    const delta = Math.max(240, Math.floor(viewport.clientWidth * 0.82));
    viewport.scrollBy({ left: delta * (direction || 1), behavior: 'smooth' });
};

window.renderOrderSpaceCards = function() {
    const track = document.getElementById('oed-space-cards-track');
    const sel = document.getElementById('oed-space');
    if (!track || !sel) return;
    __pmEnsureSpaceCardOrder();
    const selectedId = String(sel.value || '');
    const locked = __pmIsLockedOrder();
    track.innerHTML = pmSpaceCardOrder.map(spaceId => {
        const space = allSpaces.find(s => String(s.id) === String(spaceId));
        if (!space) return '';
        const active = String(space.id) === selectedId;
        const cardCls = active
            ? 'border-brand-red bg-red-50 ring-1 ring-red-200 text-brand-dark'
            : 'border-gray-200 bg-white text-gray-700 hover:border-brand-red';
        return `<button type="button" ${locked ? 'disabled' : ''} onclick="window.selectOrderSpaceCard('${space.id}')" class="shrink-0 text-left rounded-xl border ${cardCls} p-3 transition ${locked ? 'opacity-70 cursor-not-allowed' : ''}" style="min-width: calc((100% - 1.5rem) / 4);">
            <p class="text-[11px] font-black uppercase leading-tight whitespace-normal break-words">${space.nombre || '--'}</p>
            <p class="text-[10px] font-mono text-gray-500 mt-1 whitespace-normal break-all">${space.clave ? `Clave: ${space.clave}` : '--'}</p>
        </button>`;
    }).join('');
};

window.selectOrderSpaceCard = function(spaceId) {
    if (__pmIsLockedOrder()) return;
    const sel = document.getElementById('oed-space');
    if (!sel) return;
    const sid = String(spaceId || '');
    if (!sid) return;
    pmSpaceCardOrder = [sid, ...pmSpaceCardOrder.filter(id => String(id) !== sid)];
    sel.value = sid;
    window.renderOrderSpaceCards();
    const spaceObj = allSpaces.find(s => String(s.id) === sid);
    if (spaceObj) window.renderTaxesForSpace(spaceObj);
    window.recalcTotal();
};

function calculateSpaceTotal(space, startStr, endStr) {
    if(!startStr || !endStr || !space) return 0;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if(end < start) return 0;
    return parseFloat(space.precio_base) || 0;
}

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    if (id === 'preview-modal') {
        __pmSetExclusivePreviewMode(true);
        requestAnimationFrame(() => {
            __pmEnsurePdfEditingChrome();
            __pmSyncPdfEditMode();
            __pmRenderPdfInspector();
            __pmHighlightSelectedBaseTextBlock();
        });
    }
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    if (id === 'preview-modal') {
        __pmSetExclusivePreviewMode(false);
        __pmClosePdfInspector();
        __pmRenderPdfToolbar();
        __pmEnsureMarginGuideController()?.refresh();
        __pmClosePreviewTabIfNeeded();
    }
};
window.showToast = (msg, type='success') => {
    const c = document.getElementById('toast-container');
    if (!c) {
        try { console[type === 'error' ? 'error' : 'log'](String(msg || '')); } catch (_) {}
        return;
    }
    const e = document.createElement('div');
    e.className = `p-4 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider mb-2 animate-bounce ${type==='error'?'bg-red-500':'bg-green-500'}`;
    e.innerText = msg;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3000);
};
function __pmEnsureBusyOverlay() {
    let overlay = document.getElementById('pm-pdf-busy-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'pm-pdf-busy-overlay';
    overlay.className = 'fixed inset-0 z-[410] hidden items-center justify-center bg-black/70 backdrop-blur-sm p-4';
    overlay.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 px-8 py-7 flex flex-col items-center text-center max-w-sm w-full"><div class="w-12 h-12 rounded-full border-4 border-gray-200 border-t-brand-red animate-spin mb-4"></div><p id="pm-pdf-busy-title" class="text-sm font-black uppercase tracking-wide text-gray-800">Guardando cotización...</p><p class="text-[11px] text-gray-500 mt-2">Espera un momento mientras se genera y guarda el PDF.</p></div>`;
    document.body.appendChild(overlay);
    return overlay;
}
let __pmBusyOverlayDepth = 0;
window.__pmShowBusyOverlay = function(message = 'Guardando cotización...') {
    const overlay = __pmEnsureBusyOverlay();
    const title = document.getElementById('pm-pdf-busy-title');
    if (title) title.innerText = String(message || 'Guardando cotización...');
    __pmBusyOverlayDepth += 1;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
};
window.__pmHideBusyOverlay = function() {
    const overlay = document.getElementById('pm-pdf-busy-overlay');
    if (!overlay) return;
    __pmBusyOverlayDepth = Math.max(0, __pmBusyOverlayDepth - 1);
    if (__pmBusyOverlayDepth > 0) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
};
async function __pmWithBusyOverlay(message, work) {
    window.__pmShowBusyOverlay(message);
    try {
        return await work();
    } finally {
        window.__pmHideBusyOverlay();
    }
}
function __pmOpenBlobInViewer(blob, title = 'Documento', popupRef = null) {
    const popup = popupRef || window.open('', '_blank');
    if (!popup) return false;
    const objectUrl = URL.createObjectURL(blob);
    const safeTitle = String(title || 'Documento').replace(/[<>&"]/g, '');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title><style>html,body{margin:0;height:100%;background:#111827;}iframe{border:0;width:100%;height:100%;background:#fff;}</style></head><body><iframe src="${objectUrl}" title="${safeTitle}"></iframe></body></html>`);
    popup.document.close();
    setTimeout(() => {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
    }, 300000);
    return true;
}
window.openStoredDocument = async function(path) {
    const safePath = String(path || '').trim();
    if (!safePath) return window.showToast("Documento no disponible", "error");
    window.showToast("Abriendo documento...", "info");
    const popup = window.open('', '_blank');
    if (popup) {
        try {
            popup.document.open();
            popup.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cargando documento</title><style>html,body{height:100%;margin:0;font-family:Segoe UI,sans-serif;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;}</style></head><body>Cargando documento...</body></html>');
            popup.document.close();
        } catch (_) {}
    }
    try {
        const { data, error } = await window.globalPocketBase.storage.from('documentos').createSignedUrl(safePath, 3600);
        if (error || !data?.signedUrl) throw (error || new Error('No se pudo firmar el documento.'));
        const response = await fetch(data.signedUrl, { method: 'GET', credentials: 'omit' });
        if (!response.ok) throw new Error(`No se pudo abrir el documento (${response.status}).`);
        const blob = await response.blob();
        if (!blob || !blob.size) throw new Error('Documento vacío.');
        if (!__pmOpenBlobInViewer(blob, safePath.split('/').pop() || 'Documento', popup)) {
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank');
            setTimeout(() => {
                try { URL.revokeObjectURL(objectUrl); } catch (_) {}
            }, 300000);
        }
    } catch (e) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
        window.showToast("Error de acceso al archivo", "error");
    }
};

// MODALES DE CONFIRMACIÓN Y CIERRE INTELIGENTE
let confirmCallback = null;
let cancelCallback = null;
window.openConfirm = function(msg, confirmCb, isWarning = false, confirmTxt = "Confirmar", cancelTxt = "Cancelar", cancelCb = null) { 
    const titleEl = document.getElementById('confirm-title'); 
    titleEl.innerHTML = isWarning ? `<i class="fa-solid fa-triangle-exclamation text-red-600 mb-2 text-2xl block"></i> ${msg}` : msg; 
    confirmCallback = confirmCb; 
    cancelCallback = cancelCb;
    document.getElementById('btn-confirm-action').innerText = confirmTxt;
    document.getElementById('btn-cancel-action').innerText = cancelTxt;
    window.openModal('generic-confirm-modal'); 
};

window.askCloseEditModal = function() {
    if (IS_PM_ORDER_DETAIL_PAGE) {
        window.openConfirm(
            "¿Deseas guardar los cambios en la cotización?",
            async () => {
                await window.processSaveOrder();
                if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') window.__HUB_ALLOW_NEXT_UNLOAD('pm_order_detail_close_saved');
                window.location.href = 'orders.html';
            },
            false,
            "Guardar Cambios",
            "Cerrar sin guardar",
            () => {
                if (typeof window.__HUB_ALLOW_NEXT_UNLOAD === 'function') window.__HUB_ALLOW_NEXT_UNLOAD('pm_order_detail_close_discarded');
                window.location.href = 'orders.html';
            }
        );
        return;
    }
    window.openConfirm(
        "¿Deseas guardar los cambios en la cotización?",
        () => { window.processSaveOrder(); }, 
        false,
        "Guardar Cambios",
        "Cerrar sin guardar",
        () => { window.closeModal('order-edit-modal'); }
    );
};

window.askDeleteOrder = function(id, e) {
    if (e) e.stopPropagation();
    if (!__pmCanDeleteOrders()) {
        window.showToast("No tienes permiso para eliminar cotizaciones.", "error");
        return;
    }
    window.openConfirm("¿Eliminar cotización y TODOS sus archivos? Esta acción es irreversible.", async () => {
        try {
            window.showToast("Eliminando archivos...", "info");
            const { data: files } = await window.globalPocketBase.storage.from('documentos').list(`${id}`, { limit: 100 });
            if (files && files.length > 0) await window.globalPocketBase.storage.from('documentos').remove(files.map(x => `${id}/${x.name}`));
            const { error } = await __pmQuotesDelete(id);
            if (error) throw error;
            window.showToast("Cotización eliminada", "success");
            pmOrdersSaveViewState({ selectedOrderId: '' });
            window.loadOrders();
        } catch (err) {
            window.showToast("Error: " + err.message, "error");
        }
    }, true);
};

window.addEventListener('click', function(e) {
    const editModal = document.getElementById('order-edit-modal');
    const docsModal = document.getElementById('docs-modal');
    const previewModal = document.getElementById('preview-modal');
    const confirmModal = document.getElementById('generic-confirm-modal');

    if (!confirmModal.classList.contains('hidden')) {
        if(e.target === confirmModal) window.closeModal('generic-confirm-modal');
        return; 
    }

    if (e.target === editModal && !IS_PM_ORDER_DETAIL_PAGE) window.askCloseEditModal();
    if (e.target === docsModal) window.closeModal('docs-modal');
    if (e.target === previewModal) {
        if (IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode()) return;
        window.closeModal('preview-modal');
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (window.PB_CLIENT) {
        if(!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }
    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: false })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }
    await __pmLoadLetterheadConfig();
    try {
        window.currentUserProfile = authCtx?.profile || await __pmLoadCurrentUserProfile(session.user);
    } catch (_) {
        window.currentUserProfile = authCtx?.profile || session.user || null;
    }
    await __pmLoadSharedPdfStyleConfig();
    __pmInitPdfStyleEditor();
    pmOrdersApplyViewStateControls();

    document.getElementById('btn-confirm-action')?.addEventListener('click', () => { if(confirmCallback) confirmCallback(); window.closeModal('generic-confirm-modal'); });
    document.getElementById('btn-cancel-action')?.addEventListener('click', () => { if(cancelCallback) cancelCallback(); window.closeModal('generic-confirm-modal'); });

    document.getElementById('search-orders')?.addEventListener('input', (e) => filterOrders(e.target.value));
    document.getElementById('oed-start')?.addEventListener('change', function() { document.getElementById('oed-end').min = this.value; window.recalcTotal(); }); 
    document.getElementById('oed-end')?.addEventListener('change', () => window.recalcTotal()); 
    document.getElementById('oed-space')?.addEventListener('change', () => { 
        const s = allSpaces.find(x => x.id == document.getElementById('oed-space').value); 
        if(s) window.renderTaxesForSpace(s); 
        window.renderOrderSpaceCards();
        window.recalcTotal(); 
        __pmMarkOrderDetailDirty();
    });
    document.getElementById('new-concept-select')?.addEventListener('change', function() { const c = catalogConcepts.find(x => x.id == this.value); if(c) document.getElementById('new-concept-amount').value = c.precio_sugerido; });
    __pmBindOrderDetailDirtyTracking();
    __pmBindOrderDetailAutoSave();
    
    await Promise.all([loadTaxes(), loadSpaces(), loadConcepts(), loadConvenios()]);
    await __pmLoadLocations();
    if (!IS_PM_ORDER_DETAIL_PAGE && !IS_PM_ORDER_PREVIEW_PAGE) await window.loadOrders();
    if (!IS_PM_ORDER_DETAIL_PAGE && !IS_PM_ORDER_PREVIEW_PAGE) {
        const firstSignal = __pmReadRefreshSignal();
        if (firstSignal) __pmLastRefreshSignalTs = firstSignal.ts;
        window.addEventListener('storage', (ev) => {
            if (ev.key === PM_ORDERS_REFRESH_KEY) __pmHandleExternalRefresh(true);
        });
        window.addEventListener('message', (ev) => {
            if (ev.origin !== window.location.origin) return;
            if (ev.data?.type === 'pm_orders_refresh') __pmHandleExternalRefresh(true);
        });
    }
    if (IS_PM_ORDER_PREVIEW_PAGE) {
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
    if (IS_PM_ORDER_DETAIL_PAGE) {
        const listWrap = document.getElementById('orders-list-section');
        if (listWrap) listWrap.classList.add('hidden');
        const quoteId = new URLSearchParams(window.location.search || '').get('quote');
        if (!quoteId) {
            window.showToast("No se indicó cotización.", "error");
            return;
        }
        await window.openOrderEditModal(quoteId);
        __pmClearOrderDetailDirty();
    }
});

async function loadTaxes() {
    const tenant = __pmResolveTenantSlug();
    let rows = [];
    try {
        const { data } = await window.tenantPocketBase.from('impuestos').select('*').order('nombre', { ascending: true });
        rows = data || [];
    } catch (_) {
        rows = [];
    }
    dbTaxes = __pmFilterRowsByTenant(rows, tenant);
    if (!dbTaxes.length && window.globalPocketBase && tenant) {
        try {
            const { data } = await window.globalPocketBase.from('impuestos').select('*').eq('tenant', tenant);
            dbTaxes = __pmFilterRowsByTenant(data || [], tenant);
        } catch (_) {}
    }
}
async function loadSpaces() {
    const tenant = __pmResolveTenantSlug();
    const { data } = await window.tenantPocketBase.from('espacios').select('*');
    allSpaces = __pmFilterRowsByTenant(data || [], tenant).map(__pmNormalizeSpaceMaterialMeasure);
    __pmEnsureSpaceCardOrder();
    window.renderOrderSpaceCards();
}
async function loadConcepts() {
    const tenant = __pmResolveTenantSlug();
    const { data } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true);
    catalogConcepts = __pmFilterRowsByTenant(data || [], tenant);
}
async function loadConvenios() {
    try {
        const { data } = await window.tenantPocketBase
            .from('configuracion')
            .select('id,clave,valor_json')
            .eq('clave', PM_CONVENIOS_CFG_KEY)
            .limit(1);
        const raw = Array.isArray(data) ? data[0]?.valor_json : null;
        let items = [];
        if (Array.isArray(raw)) items = raw;
        else if (raw && typeof raw === 'object' && Array.isArray(raw.items)) items = raw.items;
        pmConvenioCatalog = __pmBuildConvenioCatalog(items);
    } catch (e) {
        console.warn('No se pudo cargar el catálogo de convenios:', e);
        pmConvenioCatalog = [];
    }
}

function __pmFormatUserNameFromRecord(record) {
    const candidates = [
        record?.login_username,
        record?.user_name,
        record?.username,
        record?.full_name,
        record?.name,
        record?.nombre_completo,
        record?.email ? String(record.email).split('@')[0] : ''
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmLooksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function __pmIsNumericLike(value) {
    return /^[0-9]+$/.test(String(value || '').trim());
}

function __pmLooksLikePbRecordId(value) {
    return /^[a-z0-9]{15}$/i.test(String(value || '').trim());
}

function __pmLooksLikeMongoObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function __pmLooksLikeOpaqueActorId(value) {
    const safe = String(value || '').trim();
    if (!safe || safe.includes('@')) return false;
    if (!/^[a-z0-9_-]+$/i.test(safe)) return false;
    if (safe.length < 12) return false;
    if (/\d/.test(safe) || safe.includes('-') || safe.includes('_')) return true;
    return /^[a-z0-9]{12,}$/i.test(safe);
}

function __pmIsIdentifierLike(value) {
    const safe = String(value || '').trim();
    if (!safe) return false;
    return __pmLooksLikeUuid(safe)
        || __pmIsNumericLike(safe)
        || __pmLooksLikePbRecordId(safe)
        || __pmLooksLikeMongoObjectId(safe)
        || __pmLooksLikeOpaqueActorId(safe);
}

function __pmSanitizeActorName(value) {
    const safe = String(value || '').trim();
    if (!safe) return '';
    if (safe.includes('@')) return safe.split('@')[0];
    if (__pmIsIdentifierLike(safe)) return '';
    return safe;
}

function __pmRegisterOrderUserRecord(record) {
    if (!record || typeof record !== 'object') return;
    const name = __pmFormatUserNameFromRecord(record);
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
            __pmOrderUsersById[alias] = name;
        });
}

function __pmResolveOrderActorId(order, kind = 'created') {
    if (!order || typeof order !== 'object') return '';
    const createdCandidates = [
        order.creado_por,
        order.created_by,
        order.created_by_id,
        order.creado_por_id,
        order.user_id,
        order.userId,
        order.creator_id,
        order.autor_id
    ];
    const updatedCandidates = [
        order.modificado_por,
        order.modificado_por,
        order.updated_by,
        order.updated_by_id,
        order.modificado_por_id,
        order.last_modified_by,
        order.last_editor_id,
        order.editor_id
    ];
    const base = kind === 'updated' ? updatedCandidates : createdCandidates;
    return base.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmResolveOrderActorName(order, kind = 'created') {
    const actorId = __pmResolveOrderActorId(order, kind);
    if (actorId && __pmOrderUsersById[actorId]) return __pmOrderUsersById[actorId];
    const directCandidates = kind === 'updated'
        ? [
            order?.modificado_por_nombre,
            order?.ultimo_editor_nombre,
            order?.updated_by_name,
            order?.last_modified_name,
            order?.modificado_por_username,
            order?.ultimo_editor_username,
            order?.updated_by_username,
            order?.edited_by_username,
            order?.modificado_por_login
        ]
        : [
            order?.creado_por_nombre,
            order?.creador_nombre,
            order?.created_by_name,
            order?.creado_por_username,
            order?.creador_username,
            order?.created_by_username,
            order?.creado_por_login,
            order?.created_by_login
        ];
    const direct = directCandidates
        .map((value) => __pmSanitizeActorName(value))
        .find((value) => value && (!actorId || value !== actorId));
    if (direct) return direct;
    if (actorId) {
        if (actorId.includes('@')) return actorId.split('@')[0];
        if (!__pmIsIdentifierLike(actorId)) return actorId;
    }
    if (kind === 'updated') return __pmResolveOrderActorName(order, 'created') || 'Usuario';
    return 'Usuario';
}

function __pmRegisterActorAliasFromOrder(order, kind = 'created') {
    if (!order || typeof order !== 'object') return;
    const actorId = __pmResolveOrderActorId(order, kind);
    if (!actorId) return;
    const directCandidates = kind === 'updated'
        ? [
            order?.modificado_por_nombre,
            order?.ultimo_editor_nombre,
            order?.updated_by_name,
            order?.last_modified_name,
            order?.modificado_por_username,
            order?.ultimo_editor_username,
            order?.updated_by_username,
            order?.edited_by_username,
            order?.modificado_por_login
        ]
        : [
            order?.creado_por_nombre,
            order?.creador_nombre,
            order?.created_by_name,
            order?.creado_por_username,
            order?.creador_username,
            order?.created_by_username,
            order?.creado_por_login,
            order?.created_by_login
        ];
    const direct = directCandidates
        .map((value) => __pmSanitizeActorName(value))
        .find(Boolean);
    if (direct) __pmOrderUsersById[actorId] = direct;
}

function __pmResolveOrderAuditTimestamp(order, kind = 'created') {
    if (!order || typeof order !== 'object') return '';
    const candidates = kind === 'updated'
        ? [order.updated_at, order.updated, order.modificado_en, order.last_modified_at, order.last_update]
        : [order.created_at, order.created, order.fecha_creacion, order.creado_en];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function __pmFormatAuditTooltipDateTime(rawValue) {
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

function __pmEscapeHtmlAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function __pmBuildOrderAuditTooltip(order, kind = 'created') {
    const label = kind === 'updated' ? 'Última edición' : 'Creada';
    const formatted = __pmFormatAuditTooltipDateTime(__pmResolveOrderAuditTimestamp(order, kind));
    return formatted ? `${label}: ${formatted}` : '';
}

async function __pmPrimeOrderUsers(rows = []) {
    const ids = new Set();
    __pmOrderUsersById = Object.create(null);
    const currentActorId = __pmResolveCurrentActorId();
    const currentActorName = __pmSanitizeActorName(__pmResolveCurrentActorName());
    if (currentActorId && currentActorName) __pmOrderUsersById[currentActorId] = currentActorName;
    rows.forEach((row) => {
        const createdId = __pmResolveOrderActorId(row, 'created');
        const updatedId = __pmResolveOrderActorId(row, 'updated');
        __pmRegisterActorAliasFromOrder(row, 'created');
        __pmRegisterActorAliasFromOrder(row, 'updated');
        if (createdId) ids.add(createdId);
        if (updatedId) ids.add(updatedId);
    });
    const idList = Array.from(ids);
    if (!idList.length) return;
    const chunkSize = 50;
    const sources = [window.globalPocketBase, window.tenantPocketBase].filter(Boolean);
    for (let i = 0; i < idList.length; i += chunkSize) {
        const chunk = idList.slice(i, i + chunkSize);
        const textChunk = chunk.filter((value) => !__pmIsNumericLike(value) && !__pmLooksLikeUuid(value));
        for (const source of sources) {
            try {
                const { data } = await source.from('app_users').select('*').in('id', chunk);
                (data || []).forEach(__pmRegisterOrderUserRecord);
            } catch (_) {}
            if (textChunk.length) {
                try {
                    const { data } = await source.from('app_users').select('*').in('login_username', textChunk);
                    (data || []).forEach(__pmRegisterOrderUserRecord);
                } catch (_) {}
                try {
                    const { data } = await source.from('app_users').select('*').in('username', textChunk);
                    (data || []).forEach(__pmRegisterOrderUserRecord);
                } catch (_) {}
            }
        }
    }
    const unresolved = idList.filter((id) => id && !__pmOrderUsersById[id]);
    if (!unresolved.length) return;
    for (const source of sources) {
        try {
            const { data } = await source
                .from('app_users')
                .select('*');
            (data || []).forEach(__pmRegisterOrderUserRecord);
        } catch (_) {}
    }
}

window.loadOrders = async function() {
    const viewState = pmOrdersSaveViewState();
    pmOrdersApplyViewStateControls(viewState);
    const { data, error } = await __pmQuotesList({ sort: '-created_at' });
    if (error) {
        window.showToast(`No se pudieron cargar cotizaciones: ${error.message || error}`, 'error');
        allOrders = [];
    } else {
        allOrders = (data || []).map(__pmHydrateOrderPricing);
    }
    await __pmPrimeOrderUsers(allOrders);
    const searchTerm = document.getElementById('search-orders')?.value || '';
    pmOrdersRestoringViewState = true;
    try {
        filterOrders(searchTerm, { skipSave: true });
    } finally {
        pmOrdersRestoringViewState = false;
    }
    pmOrdersRestoreViewStateAfterRender(viewState);
};

function renderOrdersTable(data) {
    const t = document.getElementById('orders-table'); if(!t) return; t.innerHTML = ''; 
    if(!data.length) { t.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-gray-400">Sin registros.</td></tr>'; return; }
    const canDelete = __pmCanDeleteOrders();
    data.forEach(o => {
        let sColor = 'bg-gray-100 text-gray-600', sText = 'Pendiente', missingIcons = []; 
        const isConvenio = __pmIsConvenioOrder(o);
        const convenioEvidenceCount = __pmGetConvenioEvidence(o).length;
        if(o.status === 'aprobada') {
            sColor = 'bg-blue-100 text-blue-700';
            sText = 'Aprobada';
            if (isConvenio) {
                if (convenioEvidenceCount < 3) missingIcons.push('<i class="fa-solid fa-camera" title="Falta Evidencia"></i>');
            } else {
                if (!o.factura_xml_url) missingIcons.push('<i class="fa-solid fa-file-invoice" title="Falta Factura"></i>');
                if (!o.historial_pagos || o.historial_pagos.length === 0) missingIcons.push('<i class="fa-solid fa-money-bill-wave" title="Falta Pago"></i>');
                if (!o.contrato_firmado_url) missingIcons.push('<i class="fa-solid fa-file-signature" title="Se requiere contrato"></i>');
            }
        }
        if(o.status === 'finalizada') { sColor = 'bg-green-100 text-green-700 border border-green-200'; sText = 'Finalizada'; }
        if(o.status === 'rechazada') { sColor = 'bg-red-50 text-red-600'; sText = 'Rechazada'; }
        let alertsHTML = ''; if (missingIcons.length > 0 && o.status === 'aprobada') alertsHTML = `<div class="flex gap-2 justify-center mt-1.5 text-[10px] text-red-400">${missingIcons.join('')}</div>`;

        const tr = document.createElement('tr'); tr.className = "border-b hover:bg-gray-50 transition group cursor-pointer";
        tr.dataset.orderId = o.id;
        tr.onclick = (e) => {
            if (!e.target.closest('button')) {
                pmOrdersSaveViewState({ selectedOrderId: o.id });
                window.openOrderEditorPage(o.id);
            }
        };
        
        const folioUnificado = __pmResolveQuoteFolio(o);
        const createdBy = __pmResolveOrderActorName(o, 'created');
        const updatedBy = __pmResolveOrderActorName(o, 'updated');
        const createdTooltip = __pmBuildOrderAuditTooltip(o, 'created');
        const updatedTooltip = __pmBuildOrderAuditTooltip(o, 'updated');
        const createdTooltipAttr = createdTooltip ? ` title="${__pmEscapeHtmlAttr(createdTooltip)}"` : '';
        const updatedTooltipAttr = updatedTooltip ? ` title="${__pmEscapeHtmlAttr(updatedTooltip)}"` : '';
        const deleteCell = canDelete
            ? `<button type="button" onclick="window.askDeleteOrder('${o.id}', event)" class="text-gray-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>`
            : `<span class="text-[10px] text-gray-300">—</span>`;
        const amountState = __pmResolveOrderTableAmountState(o);
        const totalDisplayHtml = isConvenio
            ? `<div class="flex flex-col items-end gap-1">
                <div class="flex items-center justify-end gap-2">
                    ${amountState.badgeHtml}
                    <span class="${amountState.textClass}">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(amountState.amount)}</span>
                </div>
                ${amountState.label ? `<span class="text-[10px] font-black ${amountState.textClass} uppercase tracking-wide">${amountState.label}</span>` : ''}
            </div>`
            : `<div class="flex flex-col items-end gap-1">
                <div class="flex items-center justify-end gap-2">
                    <span class="${amountState.textClass}">${new Intl.NumberFormat('es-MX', {style:'currency',currency:'MXN'}).format(amountState.amount)}</span>
                </div>
                ${amountState.label ? `<span class="text-[10px] font-black ${amountState.textClass} uppercase tracking-wide">${amountState.label}</span>` : ''}
            </div>`;

        tr.innerHTML = `<td class="p-4 font-black text-brand-dark">${folioUnificado}</td><td class="p-4 font-bold text-xs text-gray-700">${o.cliente_nombre}</td><td class="p-4 text-xs"><span class="font-bold block">${o.espacio_nombre}</span><span class="text-gray-500 font-mono">${window.safeFormatDate(o.fecha_inicio)}</span></td><td class="p-4 text-right font-mono font-bold text-xs">${totalDisplayHtml}</td><td class="p-4 text-center"><span class="${sColor} px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider">${sText}</span>${alertsHTML}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${createdTooltipAttr}>${createdBy}</td><td class="p-4 text-[10px] font-bold text-gray-600 text-center"${updatedTooltipAttr}>${updatedBy}</td><td class="p-4 text-center"><button type="button" onclick="event.stopPropagation(); window.openDocsModal('${o.id}')" class="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-brand-dark px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 mx-auto"><i class="fa-solid fa-folder-open text-brand-red"></i> Expediente</button></td><td class="p-4 text-center">${deleteCell}</td>`;
        t.appendChild(tr);
    });
}

window.openOrderEditorPage = function(id) {
    pmOrdersSaveViewState({ selectedOrderId: id });
    const url = `order_detail.html?quote=${encodeURIComponent(id)}`;
    window.open(url, '_blank', 'noopener');
};

window.openOrderPreviewTab = function(id, docType = 'quote', action = 'view') {
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
        const folioUnificado = __pmResolveQuoteFolio(o);
        return (o.cliente_nombre || '').toLowerCase().includes(lower) || 
               folioUnificado.toLowerCase().includes(lower);
    })); 
    if (!options.skipSave && !pmOrdersRestoringViewState) pmOrdersSaveViewState();
}

window.openOrderEditModal = async function(id) { 
    const safeId = String(id || '').trim();
    if (!safeId) return;
    const order = await __pmEnsureOrderRecord(safeId);
    if (!order) return;

    await loadClientProfilesForOrderModal();
    
    currentConcepts = __pmNormalizeConceptsArray(order.conceptos_adicionales);
    
    currentPreviewOrder = order;

    document.getElementById('oed-id').value = order.id; 
    document.getElementById('oed-client').value = order.cliente_nombre || ''; 
    document.getElementById('oed-status').value = order.status; 
    
    const statusSelect = document.getElementById('oed-status');
    const currentLevel = STATUS_LEVEL[order.status] || 0;
    Array.from(statusSelect.options).forEach(opt => opt.disabled = (STATUS_LEVEL[opt.value] || 0) < currentLevel);

    document.getElementById('oed-phone').value = order.cliente_contacto || '';
    document.getElementById('oed-email').value = order.cliente_email || '';
    document.getElementById('fiscal-rfc-re').value = order.cliente_rfc || '';
    
    const requestedClientId = String(order.cliente_id || '').trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) {
        await loadClientProfilesForOrderModal();
    }
    const selectedProfileId = __pmApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
        const c = orderClientProfilesById[selectedProfileId];
        if (c) {
            document.getElementById('oed-client').value = c.nombre_completo || (order.cliente_nombre || '');
            document.getElementById('oed-phone').value = (c.telefono || order.cliente_contacto || '');
            document.getElementById('oed-email').value = (c.correo || order.cliente_email || '');
            document.getElementById('fiscal-rfc-re').value = (c.rfc || order.cliente_rfc || '');
        }
    }

    document.getElementById('oed-start').value = order.fecha_inicio; 
    document.getElementById('oed-end').value = order.fecha_fin; 
    
    const sel = document.getElementById('oed-space'); sel.innerHTML = ''; 
    allSpaces.forEach(s => sel.innerHTML += `<option value="${s.id}" ${s.id == order.espacio_id ? 'selected' : ''}>${s.nombre}</option>`);
    pmSpaceCardOrder = [String(order.espacio_id), ...pmSpaceCardOrder.filter(id => String(id) !== String(order.espacio_id))];
    window.renderOrderSpaceCards();
    
    if(document.getElementById('oed-adj-type')) { 
        document.getElementById('oed-adj-type').value = order.tipo_ajuste || 'ninguno'; 
        document.getElementById('oed-adj-val').value = order.valor_ajuste || 0; 
        document.getElementById('oed-adj-unit').value = order.ajuste_es_porcentaje ? 'percent' : 'fixed'; 
    }
    
    const isLocked = ['aprobada', 'finalizada'].includes(order.status);
    const inputs = document.querySelectorAll('#order-edit-modal input, #order-edit-modal select');
    inputs.forEach(i => { if(i.id !== 'btn-save-progress' && i.id !== 'btn-save-approve') i.disabled = isLocked; });
    const saveBtn = document.getElementById('btn-save-progress');
    if (saveBtn) {
        saveBtn.disabled = isLocked;
        saveBtn.classList.toggle('opacity-60', isLocked);
        saveBtn.title = isLocked ? 'Cotización aprobada: edición bloqueada' : '';
    }
    const approveBtn = document.getElementById('btn-save-approve');
    if (approveBtn) {
        approveBtn.disabled = isLocked;
        approveBtn.classList.toggle('opacity-60', isLocked);
        approveBtn.title = isLocked ? 'Cotización aprobada: edición bloqueada' : '';
    }
    
    const spaceObj = allSpaces.find(s => s.id == order.espacio_id);
    const breakdownForEditor = __pmParseRecordJson(order.desglose_precios);
    const activeTaxIds = __pmNormalizeTaxIds(
        breakdownForEditor?.impuestos_detalle
        || __pmResolveTaxIdsFromDetails(order)
    );
    if(spaceObj) window.renderTaxesForSpace(spaceObj, activeTaxIds);
    
    const conceptSel = document.getElementById('new-concept-select');
    conceptSel.innerHTML = '<option value="">-- Agregar --</option>';
    catalogConcepts.forEach(c => conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    const extraConceptsToggle = document.getElementById('oed-has-extra-concepts');
    if (extraConceptsToggle) extraConceptsToggle.checked = (currentConcepts || []).length > 0;

    window.renderConceptsList(); 
    window.recalcTotal(); 
    window.openModal('order-edit-modal');
    __pmClearOrderDetailDirty();
};

// IMPUESTOS BLINDADOS (Si son del espacio, se bloquean activados)
window.renderTaxesForSpace = function(spaceObj, activeTaxIds = null) {
    const container = document.getElementById('oed-taxes-list');
    if(!container) return;
    const selectedTaxIds = (Array.isArray(activeTaxIds) && activeTaxIds.length ? activeTaxIds : window.parseIds(spaceObj.impuestos_ids || spaceObj.impuestos)).map(String);
    container.dataset.taxIds = JSON.stringify(selectedTaxIds);
    const taxes = selectedTaxIds.map((taxId) => __pmResolveTaxRecord(taxId, spaceObj)).filter(Boolean);
    container.innerHTML = taxes.length
        ? taxes.map((tax) => `<div class="text-[10px] text-gray-500 font-bold uppercase">${tax.nombre}</div>`).join('')
        : '<p class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</p>';
};

window.toggleExtraConceptsSection = function(forceChecked = null) {
    const toggle = document.getElementById('oed-has-extra-concepts');
    const section = document.getElementById('oed-extra-concepts-section');
    if (!toggle || !section) return;
    if (typeof forceChecked === 'boolean') toggle.checked = forceChecked;
    if (__pmGetVisibleExtraConcepts().length > 0) toggle.checked = true;
    section.classList.toggle('hidden', !toggle.checked);
};

window.renderConceptsList = function() { 
    const tbody = document.getElementById('concepts-list');
    if(!tbody) return;
    tbody.innerHTML = ''; 
    const isLocked = currentPreviewOrder && ['aprobada', 'finalizada'].includes(currentPreviewOrder.status);
    const visibleIndexes = __pmGetVisibleExtraConceptIndexes();
    const visibleConcepts = visibleIndexes.map((idx) => currentConcepts[idx]);
    window.toggleExtraConceptsSection();

    if (!visibleConcepts.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-3 text-center text-gray-400 italic text-[10px]">Sin conceptos adicionales.</td></tr>';
        return;
    }

    visibleConcepts.forEach((c, idx) => {
        const val = parseFloat(c.amount || c.value || 0);
        const desc = c.description || c.concepto || c.nombre || 'Concepto sin nombre';
        const btn = isLocked ? '' : `<button type="button" onclick="window.removeConceptRow(${idx})" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`;
        const descCol = isLocked ? desc : `<input type="text" value="${desc}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none transition" onchange="window.updateConceptName(${idx}, this.value)">`;
        const valCol = isLocked ? `$${val.toLocaleString()}` : `$<input type="number" value="${val}" min="0" class="w-20 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-red outline-none text-right font-bold transition" onchange="window.updateConceptAmount(${idx}, this.value)">`;
        tbody.innerHTML += `<tr><td class="p-2 border-b text-slate-700">${descCol}</td><td class="p-2 border-b text-right text-xs">${valCol}</td><td class="p-2 border-b text-center">${btn}</td></tr>`;
    });
};

window.updateSummaryUI = function(base) {
    const sDate = document.getElementById('oed-start').value;
    const eDate = document.getElementById('oed-end').value;
    
    document.getElementById('sum-dates').innerText = (sDate && eDate) ? (sDate === eDate ? window.safeFormatDate(sDate) : `${window.safeFormatDate(sDate)} al ${window.safeFormatDate(eDate)}`) : '--';
    
    const spaceId = document.getElementById('oed-space').value;
    const spaceObj = allSpaces.find(s => s.id == spaceId);
    document.getElementById('sum-space').innerText = spaceObj ? spaceObj.nombre : '--';

    if (sDate && eDate) {
        const start = new Date(sDate + 'T00:00:00');
        const end = new Date(eDate + 'T00:00:00');
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        document.getElementById('sum-duration').innerText = diffDays + (diffDays === 1 ? ' día' : ' días');
    } else {
        document.getElementById('sum-duration').innerText = '--';
    }

    let conceptsHtml = '';
    (currentConcepts || []).forEach(c => { 
        let amt = parseFloat(c.amount || c.value || 0);
        conceptsHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span><i class="fa-solid fa-plus text-gray-300 mr-1"></i> ${c.description || c.nombre}</span><span>+${amt.toLocaleString('es-MX', {style:'currency',currency:'MXN'})}</span></div>`;
    }); 
    document.getElementById('oed-summary-concepts').innerHTML = conceptsHtml;
    document.getElementById('lbl-subtotal-base').innerText = base.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
};

window.updateConceptAmount = function(index, newVal) {
    const actualIndex = __pmGetVisibleExtraConceptIndexes()[index];
    if (actualIndex === undefined) return;
    currentConcepts[actualIndex].amount = parseFloat(newVal) || 0;
    currentConcepts[actualIndex].value = parseFloat(newVal) || 0;
    window.recalcTotal();
};
window.updateConceptName = function(index, newName) {
    const actualIndex = __pmGetVisibleExtraConceptIndexes()[index];
    if (actualIndex === undefined) return;
    currentConcepts[actualIndex].description = newName;
};

window.recalcTotal = function() { 
    const spaceId = document.getElementById('oed-space').value; 
    const spaceObj = allSpaces.find(s => s.id == spaceId); 
    const sDate = document.getElementById('oed-start').value; 
    const eDate = document.getElementById('oed-end').value; 

    let base = calculateSpaceTotal(spaceObj, sDate, eDate);
    
    let conceptsSum = 0;
    (currentConcepts || []).forEach(c => { conceptsSum += parseFloat(c.amount || c.value || 0); }); 
    
    let sub = base + conceptsSum;
    
    const adjType = document.getElementById('oed-adj-type').value; 
    const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; 
    const isPercent = document.getElementById('oed-adj-unit').value === 'percent';
    
    let adjAmount = 0;
    if (adjType !== 'ninguno') {
        adjAmount = isPercent ? sub * (adjVal/100) : adjVal;
        if (adjType === 'descuento') sub -= adjAmount; else sub += adjAmount;
    }

    const activeTaxIds = (() => {
        const box = document.getElementById('oed-taxes-list');
        const fromBox = box ? window.parseIds(box.dataset.taxIds || '[]').map(String).filter(Boolean) : [];
        return fromBox.length ? fromBox : window.parseIds(spaceObj?.impuestos_ids || spaceObj?.impuestos).map(String);
    })();
    let taxTotal = 0;
    let taxHtml = '';
    activeTaxIds.forEach(taxId => {
        const t = __pmResolveTaxRecord(taxId, spaceObj);
        if(t) {
            const taxVal = sub * __pmResolveTaxRate(t);
            taxTotal += taxVal;
            taxHtml += `<div class="flex justify-between text-[10px] text-gray-500"><span>${t.nombre}</span><span>+${taxVal.toLocaleString('es-MX', {style:'currency',currency:'MXN'})}</span></div>`;
        }
    });

    document.getElementById('oed-tax-summary-display').innerHTML = taxHtml;
    const taxEl = document.getElementById('lbl-tax-total'); if (taxEl) taxEl.innerText = taxTotal.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
    const rawEl = document.getElementById('lbl-subtotal-raw'); if (rawEl) rawEl.innerText = (base + conceptsSum).toLocaleString('es-MX', {style:'currency',currency:'MXN'});
    const catEl = document.getElementById('lbl-catalog-base-total'); if (catEl) catEl.innerText = base.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
    document.getElementById('lbl-subtotal').innerText = sub.toLocaleString('es-MX', {style:'currency',currency:'MXN'}); 
    document.getElementById('lbl-adjustment').innerText = (adjType==='descuento'?'-':'+') + adjAmount.toLocaleString('es-MX', {style:'currency',currency:'MXN'});
    document.getElementById('oed-price').value = (sub + taxTotal).toFixed(2);
    
    window.updateSummaryUI(base);
    window.updatePriceColor(base);
};

window.updatePriceColor = function(base) { 
    const priceInput = document.getElementById('oed-price'); const val = parseFloat(priceInput.value) || 0; 
    priceInput.classList.remove('text-green-600', 'text-red-600', 'text-gray-700'); 
    if (val < base) priceInput.classList.add('text-green-600'); 
    else if (val > base) priceInput.classList.add('text-red-600'); 
    else priceInput.classList.add('text-gray-700'); 
};

window.addConceptRow = function() { 
    const id = document.getElementById('new-concept-select').value;
    const amount = parseFloat(document.getElementById('new-concept-amount').value);
    if (!id || isNaN(amount) || amount === 0) return;
    const c = catalogConcepts.find(x => x.id == id);
    currentConcepts.push({ description: c.nombre, amount: amount, value: amount, unit: 'fixed', type: 'aumento' });
    document.getElementById('new-concept-select').value = "";
    document.getElementById('new-concept-amount').value = "";
    window.toggleExtraConceptsSection(true);
    window.renderConceptsList();
    window.recalcTotal();
};

window.removeConceptRow = function(index) {
    const actualIndex = __pmGetVisibleExtraConceptIndexes()[index];
    if (actualIndex === undefined) return;
    currentConcepts.splice(actualIndex, 1);
    if (!__pmGetVisibleExtraConcepts().length) window.toggleExtraConceptsSection(false);
    window.renderConceptsList();
    window.recalcTotal();
};

window.attemptSaveOrder = function() {
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    const statusField = document.getElementById('oed-status');
    if (statusField) statusField.value = 'aprobada';
    const newStatus = 'aprobada';
    const currentLevel = STATUS_LEVEL[currentPreviewOrder.status] || 0;
    const newLevel = STATUS_LEVEL[newStatus] || 0;

    if (newLevel < currentLevel) return window.showToast("No puedes regresar a un estado anterior.", "error");

    if (newStatus === 'aprobada' && currentPreviewOrder.status !== 'aprobada') {
        const missing = [];
        if(!document.getElementById('oed-client').value) missing.push("Nombre Cliente");
        if(!document.getElementById('oed-email').value) missing.push("Email");
        if(!document.getElementById('fiscal-rfc-re').value) missing.push("RFC");
        if(!document.getElementById('oed-start').value) missing.push("Fechas");
        
        if (missing.length > 0) return window.openConfirm(`<p class="text-red-600 font-bold mb-2">Faltan datos para aprobar:</p><ul class="list-disc ml-4 text-xs text-left">${missing.map(m=>`<li>${m}</li>`).join('')}</ul>`, () => window.closeModal('generic-confirm-modal'), true);
        
        window.initiateApprovalSnapshot();
    } else {
        window.processSaveOrder();
    }
};

window.initiateApprovalSnapshot = async function() {
    await __pmEnsurePdfStyleProfile('quote', { forceReload: !__pmIsAdminProfile() });
    const formData = window.getFormDataFromModal();
    if (!formData.numero_orden) { formData.numero_orden = __pmResolveQuoteFolio(currentPreviewOrder); }

    const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, 'quote'); 
    
    const pdfContainer = document.getElementById('pdf-content');
    const embedViewer = document.getElementById('doc-preview');
    const btnAction = document.getElementById('btn-download-preview');
    
    pdfContainer.innerHTML = content;
    __pmApplyPdfStyleToLivePreview();
    pdfContainer.classList.remove('hidden');
    embedViewer.classList.add('hidden');
    
    btnAction.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Aprobación';
    btnAction.className = "bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
    
    document.getElementById('prev-order-num').innerText = "VISTA PREVIA DE APROBACIÓN";
    
    btnAction.onclick = () => window.executeApprovalTransaction(formData);
    
    window.openModal('preview-modal');
};

window.executeApprovalTransaction = async function(formData) {
    const btn = document.getElementById('btn-download-preview');
    btn.disabled = true; btn.innerText = "Generando Snapshot...";
    
    try {
        const element = document.getElementById('pdf-content');
        if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
            await __pmEnsurePdfStyleProfile('quote', { forceReload: true });
            element.innerHTML = await window.getOrderHTML({ ...currentPreviewOrder, ...formData, status: 'aprobada' }, 'quote');
            __pmApplyPdfStyleToLivePreview();
        }
        if (__pmIsAdminProfile()) {
            await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
        }
        const pdfBlob = await window.generatePdfBlobFromNode(element);
        const { path, folio } = await __pmUploadApprovalSnapshotBlob(currentPreviewOrder.id, pdfBlob, formData);
        const payload = { ...formData, status: 'aprobada', url_cotizacion_final: path };
        const { error: dbError } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
        if (dbError) throw dbError;
        currentPreviewOrder = { ...currentPreviewOrder, ...payload };
        window.__pmBroadcastOrdersRefresh('approved_snapshot');
        window.downloadBlobAsFile(pdfBlob, `Cotizacion_Aprobada_${folio}.pdf`);

        window.showToast("¡Cotización Aprobada y Archivada!", "success");
        __pmClearOrderDetailDirty();
        window.closeModal('preview-modal');
        window.closeModal('order-edit-modal');
        await window.loadOrders();

    } catch (e) {
        console.error(e);
        window.showToast("Error en la aprobación: " + e.message, "error");
        btn.disabled = false; btn.innerText = "Reintentar";
    }
};

window.getFormDataFromModal = function() {
    const spaceId = document.getElementById('oed-space').value; 
    const spaceObj = allSpaces.find(s => s.id == spaceId); 
    const sDate = document.getElementById('oed-start').value;
    const eDate = document.getElementById('oed-end').value;
    
    let base = calculateSpaceTotal(spaceObj, sDate, eDate); 
    let concepts = 0;
    currentConcepts.forEach(c => { concepts += parseFloat(c.amount || c.value || 0); });
    let sub = base + concepts;

    const activeTaxIds = (() => {
        const box = document.getElementById('oed-taxes-list');
        const fromBox = box ? window.parseIds(box.dataset.taxIds || '[]').map(String).filter(Boolean) : [];
        return fromBox.length ? fromBox : __pmNormalizeTaxIds(spaceObj?.impuestos_ids || spaceObj?.impuestos);
    })();
    const taxTotal = __pmRoundCurrency(activeTaxIds.reduce((sum, taxId) => {
        const tax = __pmResolveTaxRecord(taxId, spaceObj);
        return sum + (sub * __pmResolveTaxRate(tax));
    }, 0));
    const priceInputValue = document.getElementById('oed-price').value;
    const priceFinal = __pmHasExplicitValue(priceInputValue)
        ? __pmToFiniteNumber(priceInputValue, __pmRoundCurrency(sub + taxTotal))
        : __pmRoundCurrency(sub + taxTotal);

    const adjType = document.getElementById('oed-adj-type').value; 
    const adjVal = parseFloat(document.getElementById('oed-adj-val').value) || 0; 
    const isPercent = document.getElementById('oed-adj-unit').value === 'percent';

    return {
        cliente_nombre: document.getElementById('oed-client').value,
        cliente_email: document.getElementById('oed-email').value,
        cliente_contacto: document.getElementById('oed-phone').value,
        cliente_rfc: document.getElementById('fiscal-rfc-re').value,
        cliente_id: (document.getElementById('oed-client-id') ? (document.getElementById('oed-client-id').value || null) : null),
        fecha_inicio: sDate,
        fecha_fin: eDate,
        precio_final: priceFinal,
        espacio_id: spaceId,
        espacio_nombre: spaceObj ? spaceObj.nombre : '',
        espacio_clave: spaceObj ? spaceObj.clave : '',
        tipo_ajuste: adjType,
        valor_ajuste: adjVal,
        ajuste_es_porcentaje: isPercent,
        conceptos_adicionales: currentConcepts, 
        desglose_precios: { subtotal_antes_impuestos: __pmRoundCurrency(sub), impuestos_detalle: activeTaxIds, tax_total: taxTotal }
    };
};

window.processSaveOrder = async function() {
    const locked = ['aprobada', 'finalizada'].includes(String(currentPreviewOrder?.status || '').toLowerCase());
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    const btn = document.getElementById('btn-save-progress');
    btn.disabled = true; btn.innerText = "Guardando...";
    try {
        const formData = window.getFormDataFromModal();
        formData.status = document.getElementById('oed-status').value;
        if(!formData.numero_orden) formData.numero_orden = __pmResolveQuoteFolio(currentPreviewOrder);
        
        const { error } = await __pmQuotesUpdate(document.getElementById('oed-id').value, formData);
        if (error) throw error;
        window.__pmBroadcastOrdersRefresh(formData.status === 'aprobada' ? 'approved_saved' : 'saved');

        window.showToast("Cambios guardados", "success");
        __pmClearOrderDetailDirty();
        window.closeModal('order-edit-modal');
        await window.loadOrders(); 
    } catch(e) { window.showToast("Error: " + e.message, "error"); } finally { btn.disabled = false; btn.innerText = "Guardar Directamente"; }
};

window.previewOrderForGeneration = async function(id) {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    await __pmEnsurePdfStyleProfile('order', { forceReload: !__pmIsAdminProfile() });
    const order = await __pmEnsureOrderRecord(id);
    if(!order) return;
    if (__pmIsConvenioOrder(order)) return window.showToast("Los convenios no generan orden de compra.", "error");
    currentPreviewOrder = { ...order, docType: 'order' }; 
    
    const content = await window.getOrderHTML(order, 'order');
    
    const pdfContainer = document.getElementById('pdf-content');
    const embed = document.getElementById('doc-preview');
    
    pdfContainer.innerHTML = content;
    __pmApplyPdfStyleToLivePreview();
    pdfContainer.classList.remove('hidden');
    embed.classList.add('hidden');
    
    const btn = document.getElementById('btn-download-preview');
    btn.innerHTML = '<i class="fa-solid fa-file-contract"></i> Confirmar y Generar OC';
    btn.className = "bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
    
    btn.onclick = window.confirmAndGeneratePurchaseOrder;
    
    window.openModal('preview-modal');
};

window.confirmAndGeneratePurchaseOrder = async function() {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    window.openConfirm("¿Generar Orden de Compra Oficial? Se guardará una copia exacta.", async () => {
        const btn = document.getElementById('btn-download-preview');
        btn.disabled = true; btn.innerText = "Generando OC...";
        
        try {
            if (__pmIsConvenioOrder(currentPreviewOrder)) throw new Error("Los convenios no generan orden de compra.");
            const pdfBlob = await __pmWithBusyOverlay('Generando orden de compra...', async () => {
                const element = document.getElementById('pdf-content');
                if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
                    await __pmEnsurePdfStyleProfile('order', { forceReload: true });
                    element.innerHTML = window.getOrderHTML(currentPreviewOrder, 'order');
                    __pmApplyPdfStyleToLivePreview();
                }
                const blob = await window.generatePdfBlobFromNode(element);
                const folioUnificado = __pmResolveQuoteFolio(currentPreviewOrder);
                const path = `${currentPreviewOrder.id}/orden_compra_${folioUnificado}.pdf`;
                await window.globalPocketBase.storage.from('documentos').upload(path, blob, { upsert: true });
                const fechaOrden = window.__serverDateService.nowISO();
                const ocUpdate = await __pmQuotesUpdate(currentPreviewOrder.id, { url_orden_compra: path, fecha_orden_compra: fechaOrden });
                if (ocUpdate.error) throw ocUpdate.error;
                currentPreviewOrder = { ...currentPreviewOrder, url_orden_compra: path, fecha_orden_compra: fechaOrden };
                return blob;
            });
            const folioUnificado = __pmResolveQuoteFolio(currentPreviewOrder);
            window.__pmBroadcastOrdersRefresh('purchase_order');
            
            window.downloadBlobAsFile(pdfBlob, `OC_${folioUnificado}.pdf`);
    
            window.showToast("Orden de Compra Generada");
            if (pmDetailTab === "expediente") await __pmRenderExpedientePanel();
            pmOrdersSaveViewState({ selectedOrderId: currentPreviewOrder?.id || '' });
            if (!(IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode() || IS_PM_ORDER_DETAIL_PAGE)) await window.loadOrders();
            window.closeModal('preview-modal');
            window.closeModal('docs-modal');
            __pmClosePreviewTabIfNeeded();
            
        } catch(e) { window.showToast("Error al generar OC", "error"); } finally { btn.disabled = false; }
    });
};

window.openDocsModal = function(id) {
    pmOrdersSaveViewState({ selectedOrderId: id });
    const order = allOrders.find(o => o.id === id); if(!order) return;
    const isConvenio = __pmIsConvenioOrder(order);
    const docMeta = __pmGetQuoteDocumentMeta(order);
    const convenioEvidence = __pmGetConvenioEvidence(order);
    document.getElementById('doc-client').innerText = order.cliente_nombre;
    const folioUnificado = __pmResolveQuoteFolio(order);
    document.getElementById('doc-folio').innerText = folioUnificado;
    let details = [];
    try {
        details = Array.isArray(order.espacios_detalle) ? order.espacios_detalle : JSON.parse(order.espacios_detalle || '[]');
    } catch (_) {
        details = [];
    }
    const firstSpaceRef = details[0]?.espacio_clave || details[0]?.espacio_nombre || order.espacio_clave || order.espacio_nombre || 'Espacio';
    document.getElementById('doc-space').innerText = details.length > 1 ? `${firstSpaceRef} + ${details.length - 1}` : firstSpaceRef;
    document.getElementById('doc-dates').innerText = __pmOrderBlocksIndefinitely(order)
        ? `${window.safeFormatDate(order.fecha_inicio)} - Indefinido`
        : `${window.safeFormatDate(order.fecha_inicio)} - ${window.safeFormatDate(order.fecha_fin)}`;
    
    const list = document.getElementById('docs-list'); list.innerHTML = '';

    const createBtn = (label, icon, color, action) => {
        list.innerHTML += `<button type="button" onclick="${action}" class="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-3 transition shadow-sm group bg-white mb-2"><div class="w-8 h-8 rounded-full bg-${color}-100 text-${color}-600 flex items-center justify-center shrink-0"><i class="${icon}"></i></div><div class="flex-grow"><p class="text-xs font-bold text-gray-700">${label}</p></div><i class="fa-solid fa-arrow-right text-xs text-gray-300"></i></button>`;
    };
    const createLocked = (label, icon) => {
        list.innerHTML += `<div class="w-full px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 flex items-center gap-3 mb-2 opacity-60"><i class="${icon} text-gray-400"></i><span class="text-xs font-bold text-gray-400">${label}</span></div>`;
    };
    window.toggleDocsPayments = function(sectionId) {
        const section = document.getElementById(sectionId);
        const chevron = document.querySelector(`[data-docs-pay-toggle="${sectionId}"]`);
        if (!section) return;
        const hidden = section.classList.toggle('hidden');
        if (chevron) chevron.classList.toggle('rotate-180', !hidden);
    };

    // Cotización
    if (order.url_cotizacion_final) {
        createBtn(`Ver ${docMeta.approvedTitle}`, 'fa-solid fa-file-circle-check', 'blue', `window.openStoredDocument('${order.url_cotizacion_final}')`);
    } else {
        createBtn(`Ver ${docMeta.draftTitle}`, 'fa-solid fa-file-pen', 'gray', `window.openOrderPreviewTab('${order.id}', 'quote', 'view')`);
    }

    // Orden de compra
    if (!isConvenio) {
        if (order.url_orden_compra) {
            createBtn('Ver Orden de Compra', 'fa-solid fa-file-contract', 'purple', `window.openStoredDocument('${order.url_orden_compra}')`);
        } else if(['aprobada', 'finalizada'].includes(order.status) && __pmCanEditOrders()) {
            createBtn('Generar Orden de Compra', 'fa-solid fa-plus', 'purple', `window.openOrderPreviewTab('${order.id}', 'order', 'generate')`);
        } else if(['aprobada', 'finalizada'].includes(order.status)) {
            createLocked('Orden de Compra (Solo lectura)', 'fa-solid fa-lock');
        } else {
            createLocked('Orden de Compra (Pendiente)', 'fa-solid fa-lock');
        }
    }

    if (isConvenio) {
        if (String(order.status || '').toLowerCase() === 'aprobada' && convenioEvidence.length < 3) {
            createBtn('Finalizar con Evidencia', 'fa-solid fa-camera', 'amber', `window.openPmEvidenceUploadModal('${order.id}')`);
        }
        if (convenioEvidence.length) {
            convenioEvidence.forEach((item, idx) => {
                createBtn(`Evidencia ${idx + 1}`, 'fa-solid fa-image', 'amber', `window.openPmEvidenceGallery('${order.id}', ${idx})`);
            });
        } else {
            createLocked('Evidencias (Pendientes)', 'fa-solid fa-camera');
        }
    } else {
        // Contrato en Blanco
        if (order.contrato_en_blanco_url || order.contrato_url) {
            const urlToUse = order.contrato_en_blanco_url || order.contrato_url;
            createBtn('Contrato en Blanco', 'fa-solid fa-file-contract', 'emerald', `window.openStoredDocument('${urlToUse}')`);
        }
        
        // Contrato Firmado
        if (order.contrato_firmado_url) {
            createBtn('Contrato Firmado', 'fa-solid fa-file-signature', 'emerald', `window.openStoredDocument('${order.contrato_firmado_url}')`);
        } else {
            createLocked('Contrato (Pendiente)', 'fa-solid fa-lock');
        }

        // Factura
        if (order.factura_pdf_url) {
            createBtn('Ver Factura (PDF)', 'fa-solid fa-file-pdf', 'red', `window.openStoredDocument('${order.factura_pdf_url}')`);
            if(order.factura_xml_url) createBtn('Descargar XML', 'fa-solid fa-file-code', 'orange', `window.openStoredDocument('${order.factura_xml_url}')`);
        } else {
            createLocked('Factura (Pendiente)', 'fa-solid fa-file-invoice-dollar');
        }
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
    if (!isConvenio) {
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
    }

    window.openModal('docs-modal');
};

window.openPDFPreview = async function(id, type) { 
    const safeId = String(id || '').trim();
    if (!safeId) return;
    try {
        await __pmEnsurePdfStyleProfile(type, { forceReload: !__pmIsAdminProfile() });
        const order = await __pmEnsureOrderRecord(safeId);
        currentPreviewOrder = { ...order, docType: type }; 
        const content = await window.getOrderHTML(order, type); 
        const pdfContainer = document.getElementById('pdf-content'); 
        const embedViewer = document.getElementById('doc-preview'); 
        const btnDownload = document.getElementById('btn-download-preview'); 
        if (pdfContainer) {
            pdfContainer.classList.remove('hidden');
            pdfContainer.innerHTML = content;
            __pmApplyPdfStyleToLivePreview();
        }
        if (embedViewer) embedViewer.classList.add('hidden');
        if (btnDownload) {
            btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
            btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
            btnDownload.onclick = window.downloadPDFFromPreview;
        }
        window.openModal('preview-modal');
    } catch (e) {
        console.error('openPDFPreview(pm) failed', e);
        window.showToast(`No se pudo abrir la vista previa: ${e?.message || e}`, 'error');
    }
};

window.downloadPDFFromPreview = async function() { 
    const element = document.getElementById('pdf-content'); 
    if (!element) return window.showToast("No se encontró la vista previa para exportar.", "error");
    const folioUnificado = __pmResolveQuoteFolio(currentPreviewOrder);
    const docType = String(currentPreviewOrder?.docType || 'quote').toLowerCase() === 'order' ? 'order' : 'quote';
    const filePrefix = docType === 'order' ? 'Orden_Compra' : 'Cotizacion';
    try {
        const pdfBlob = await __pmWithBusyOverlay('Generando PDF desde la vista previa...', async () => {
            // Exporta exactamente lo que el usuario está viendo en pantalla.
            if (typeof __pmApplyPdfStyleToLivePreview === 'function') {
                __pmApplyPdfStyleToLivePreview({ skipEditorUiRefresh: true });
            }
            return await window.generatePdfBlobFromNode(element);
        });
        window.downloadBlobAsFile(pdfBlob, `${filePrefix}_${folioUnificado}.pdf`);
    } catch (e) {
        window.showToast("No se pudo descargar el PDF: " + (e?.message || e), "error");
    }
};

function __pmOrdersTransparentPdfHtml(html) {
    return String(html || '')
        .replace(/\bbg-(?:white|gray-\d{2,3}|red-\d{2,3}|green-\d{2,3}|blue-\d{2,3}|amber-\d{2,3}|purple-\d{2,3}|brand-red)\b/g, '')
        .replace(/background:\s*#(?:[0-9a-f]{3,8});?/gi, 'background: transparent;')
        .replace(/background:\s*rgba?\([^)]+\);?/gi, 'background: transparent;')
        .replace(/\s{2,}/g, ' ');
}

function __pmOrdersBoostPdfTypography(html) {
    return String(html || '')
        .replace(/\btext-\[9px\]\b/g, '__PM_TXT_9__')
        .replace(/\btext-\[10px\]\b/g, '__PM_TXT_10__')
        .replace(/\btext-\[11px\]\b/g, '__PM_TXT_11__')
        .replace(/\btext-xs\b/g, '__PM_TXT_XS__')
        .replace(/\btext-sm\b/g, '__PM_TXT_SM__')
        .replace(/__PM_TXT_9__/g, 'text-[10px]')
        .replace(/__PM_TXT_10__/g, 'text-[11px]')
        .replace(/__PM_TXT_11__/g, 'text-[12px]')
        .replace(/__PM_TXT_XS__/g, 'text-sm')
        .replace(/__PM_TXT_SM__/g, 'text-base');
}

const __PM_PDF_STYLE_TENANT = 'plaza_mayor';
const __PM_PDF_OVERLAYS_COLLECTION = 'pdf_overlays';
const __PM_PDF_OVERLAY_TYPES = Object.freeze({
    quote: 'generator:quotes',
    order: 'generator:orders'
});
const __PM_PDF_STYLE_PROFILE_KEYS = Object.freeze(['quote', 'order', 'receipt', 'contract']);
const __PM_PDF_STYLE_FONT_MAP = Object.freeze({
    segoe: '"Segoe UI", Arial, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    trebuchet: '"Trebuchet MS", Arial, sans-serif'
});
const __PM_PDF_STYLE_FONT_LABELS = Object.freeze({
    segoe: 'Segoe UI',
    arial: 'Arial',
    verdana: 'Verdana',
    georgia: 'Georgia',
    times: 'Times New Roman',
    trebuchet: 'Trebuchet MS'
});
const __PM_PDF_BASE_TEXT_BLOCKS = Object.freeze([
    { id: 'base:header-title', key: 'header-title', label: 'Título Encabezado', sizeField: 'titlePx', alignField: 'headerAlign' },
    { id: 'base:header-meta', key: 'header-meta', label: 'Meta Encabezado', sizeField: 'metaPx', alignField: 'metaAlign' },
    { id: 'base:table-body', key: 'table-body', label: 'Tabla Conceptos', sizeField: 'tableBodyPx', alignField: 'tableAlign' },
    { id: 'base:summary', key: 'summary', label: 'Resumen Totales', alignField: 'summaryAlign' },
    { id: 'base:quick', key: 'quick', label: 'Notas', sizeField: 'quickPx', alignField: 'quickAlign' },
    { id: 'base:conditions', key: 'conditions', label: 'Condiciones', sizeField: 'conditionsPx', alignField: 'conditionsAlign' },
    { id: 'base:sign', key: 'sign', label: 'Firmas', sizeField: 'signPx', alignField: 'signAlign' },
    { id: 'base:footer', key: 'footer', label: 'Footer', sizeField: 'footerPx', alignField: 'footerAlign' }
]);
const __PM_PDF_BASE_MOVABLE_KEYS = Object.freeze(['header-title', 'header-meta', 'table-body', 'summary', 'quick', 'conditions', 'sign', 'footer']);
const __PM_PDF_MOVABLE_RESOURCE_TYPES = Object.freeze(['bar', 'logo', 'sign', 'sign-block', 'title']);
const __PM_PDF_BASE_SIZE_LIMITS = Object.freeze({
    titlePx: { min: 20, max: 42 },
    metaPx: { min: 8, max: 18 },
    tableBodyPx: { min: 9, max: 16 },
    quickPx: { min: 9, max: 16 },
    conditionsPx: { min: 9, max: 18 },
    signPx: { min: 9, max: 16 },
    footerPx: { min: 8, max: 14 }
});
const __PM_PDF_BASE_LAYOUT_LIMITS = Object.freeze({
    x: { min: -4000, max: 4000 },
    y: { min: -5000, max: 5000 },
    scalePct: { min: 15, max: 500 },
    angle: { min: -360, max: 360 }
});
const __PM_PDF_STYLE_CONTENT_DEFAULTS = Object.freeze({
    quickLeftTitle: 'Condiciones:',
    quickLeftLines: 'a) Pago anticipado.\nb) Doc. completa 3 semanas antes.\nc) Sujeto a disponibilidad.',
    quickRightTitle: 'Vigencia:',
    quickRightBody: '7 días naturales a partir de la emisión.',
    conditionsTitle: 'CONDICIONES GENERALES',
    conditionsLines: [
        'La instalación será responsabilidad exclusiva del cliente. Esto incluye cualquier costo asociado con la instalación, como mano de obra, herramientas y materiales necesarios.',
        'El diseño y contenido del material publicitario deben cumplir con las normativas establecidas por el centro comercial.',
        'El cliente es completamente responsable del contenido del material publicitario y de no infringir derechos de terceros.',
        'Durante el proceso de instalación y desinstalación, el cliente será responsable de cualquier daño causado al espacio o propiedad del centro comercial.',
        'Cualquier modificación en la duración, diseño o ubicación del material publicitario debe ser comunicada y aprobada por el centro comercial con anticipación.',
        'No se permite volanteo fuera del espacio designado, ni equipo de audio (perifoneo, música, etc) salvo previa autorización por escrito.',
        'Al finalizar la campaña publicitaria, el cliente deberá retirar el material publicitario a más tardar al día siguiente.',
        'No se permite la venta ni promoción de artículos para adultos, bebidas alcohólicas, tabaco, CBD y/o cannabinoides.',
        'El almacenamiento y/o recolección de basura correrá por cuenta del cliente.',
        'El cliente deberá instalar la toma eléctrica necesaria. Plaza Mayor podrá suministrar energía de 110v para uso moderado previa autorización.',
        'Esta es una propuesta económica; las condiciones generales y específicas finales se presentarán en el contrato correspondiente.'
    ].join('\n'),
    quoteApproverTitle: 'QUIEN APRUEBA',
    quoteApproverSubtitle: 'Plaza Mayor',
    quoteClientTitle: '{{CLIENT_NAME}}',
    quoteClientSubtitle: 'Cliente / Representante',
    orderApproverTitle: 'QUIEN APRUEBA',
    orderApproverSubtitle: 'Plaza Mayor',
    annexHintTitle: 'Página adicional editable',
    annexHintBody: 'Utiliza el editor para ajustar tipografía, posición y estilo de esta página adicional.'
});
const __PM_PDF_STYLE_DEFAULTS = Object.freeze({
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
    content: __PM_PDF_STYLE_CONTENT_DEFAULTS,
    headerAlign: 'right',
    metaAlign: 'right',
    tableAlign: 'left',
    quickAlign: 'left',
    conditionsAlign: 'justify',
    signAlign: 'center',
    summaryAlign: 'left',
    footerAlign: 'center'
});
const __PM_PDF_STYLE_UI_STATE_KEY = 'pm_pdf_style_editor_ui';
let __pmPdfStyleState = null;
let __pmPdfStyleConfigRecordId = '';
let __pmPdfStyleConfigStore = '';
let __pmPdfStyleRawPayload = null;
let __pmPdfStyleSyncTimer = null;
let __pmPdfStyleUiState = { collapsed: false, pinned: false };
let __pmPdfResourceEditorSelectedId = '';
let __pmPdfResourcePointerState = null;
let __pmPdfResourceClipboard = null;
let __pmPdfStyleActiveProfile = 'quote';
let __pmPdfMarginGuideController = null;
let __pmPdfEditLocked = true;
let __pmPdfInspectorState = null;

function __pmClampStyleNumber(value, min, max, fallback) {
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

function __pmNormalizeStyleAlign(value, fallback = 'left') {
    const safe = String(value || '').toLowerCase();
    return ['left', 'center', 'right', 'justify'].includes(safe) ? safe : fallback;
}

function __pmSafeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function __pmNormalizeHexColor(value, fallback) {
    const input = String(value || '').trim();
    const candidate = input.startsWith('#') ? input : `#${input}`;
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
}

function __pmNormalizePdfContent(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const defaults = __PM_PDF_STYLE_CONTENT_DEFAULTS;
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

function __pmGetPdfContentFieldMaxLength(field) {
    const key = String(field || '').trim();
    if (key === 'quickLeftLines') return 1200;
    if (key === 'quickRightBody') return 700;
    if (key === 'conditionsLines') return 5000;
    if (key === 'quoteClientTitle') return 120;
    if (key === 'annexHintBody') return 900;
    return 120;
}

function __pmCommitPdfContentField(field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = String(field || '').trim();
    if (!key) return;
    const cfg = __pmGetPdfStyleConfig();
    const max = __pmGetPdfContentFieldMaxLength(key);
    const content = __pmNormalizePdfContent({
        ...(cfg.content || {}),
        [key]: String(rawValue ?? '').slice(0, max)
    });
    const next = __pmNormalizePdfStyle({ ...cfg, content });
    __pmSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh: opts.skipEditorUiRefresh === true });
    __pmScheduleSharedPdfStyleSync(next);
    if (opts.refreshPreview !== false) __pmRefreshPreviewFromStyleState();
}

function __pmResolvePdfTemplateString(value, context = {}) {
    let output = String(value ?? '');
    Object.entries(context && typeof context === 'object' ? context : {}).forEach(([key, resolvedValue]) => {
        const token = String(key || '').trim();
        if (!token) return;
        const pattern = new RegExp(`\\{\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi');
        output = output.replace(pattern, String(resolvedValue ?? ''));
    });
    return output;
}
const __PM_PDF_TEMPLATE_TOKENS = Object.freeze([
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
function __pmResolveCurrentActorEmail() {
    const authState = __pmReadAuthState('pb_native_auth_v1');
    return [
        currentUserProfile?.email,
        currentUserProfile?.record?.email,
        currentUserProfile?.user?.email,
        authState?.user?.email,
        authState?.record?.email
    ].map((v) => String(v || '').trim()).find(Boolean) || '';
}
function __pmBuildPdfTemplateContext(order = {}, extra = {}) {
    const o = order && typeof order === 'object' ? order : {};
    const fmt = (value) => value ? (window.safeFormatDate ? window.safeFormatDate(value) : String(value)) : '';
    const startDate = fmt(o.fecha_inicio || o.startDate);
    const endDate = __pmOrderBlocksIndefinitely(o) ? 'Indefinido' : fmt(o.fecha_fin || o.endDate);
    return {
        CLIENT_NAME: o.cliente_nombre || o.clientName || '',
        CLIENT_EMAIL: o.cliente_email || o.email || '',
        CLIENT_PHONE: o.cliente_contacto || o.telefono || o.phone || '',
        CLIENT_RFC: o.cliente_rfc || o.rfc || '',
        QUOTE_NAME: o.nombre_cotizacion || o.nombre || '',
        FOLIO: extra.folio || __pmResolveQuoteFolio(o) || o.id || '',
        DOC_TITLE: extra.docTitle || '',
        START_DATE: startDate,
        END_DATE: endDate,
        VALIDITY: [startDate, endDate].filter(Boolean).join(' - '),
        TODAY: extra.dateStr || window.__serverDateService.todayLocale('es-MX'),
        CURRENT_USER_NAME: __pmResolveCurrentActorName(),
        CURRENT_USER_EMAIL: __pmResolveCurrentActorEmail(),
        VENUE_NAME: extra.venueName || 'Plaza Mayor'
    };
}
let __pmPdfTemplateInsertTarget = null;
let __pmPdfTemplateInsertMeta = null;
function __pmPdfTemplateSelectorEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function __pmIsPdfTemplateEditableField(node) {
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
function __pmDescribePdfTemplateInsertTarget(node) {
    if (!__pmIsPdfTemplateEditableField(node)) return null;
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
function __pmResolvePdfTemplateInsertTargetFromMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    if (meta.type === 'resource' && meta.id && meta.field) {
        return document.querySelector(`[data-res-id="${__pmPdfTemplateSelectorEscape(meta.id)}"][data-res-field="${__pmPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'base' && meta.id && meta.field) {
        return document.querySelector(`[data-base-id="${__pmPdfTemplateSelectorEscape(meta.id)}"][data-base-field="${__pmPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    if (meta.type === 'inspector' && meta.id && meta.field) {
        return document.querySelector(`[data-target-id="${__pmPdfTemplateSelectorEscape(meta.id)}"][data-pdf-inspector-field="${__pmPdfTemplateSelectorEscape(meta.field)}"]`);
    }
    return null;
}
function __pmRememberPdfTemplateInsertTarget(node) {
    const meta = __pmDescribePdfTemplateInsertTarget(node);
    if (!meta) return;
    __pmPdfTemplateInsertTarget = node;
    __pmPdfTemplateInsertMeta = meta;
}
function __pmResolvePdfTemplateInsertTarget() {
    if (__pmIsPdfTemplateEditableField(document.activeElement)) {
        __pmRememberPdfTemplateInsertTarget(document.activeElement);
        return document.activeElement;
    }
    if (__pmPdfTemplateInsertTarget instanceof Element && document.body.contains(__pmPdfTemplateInsertTarget) && __pmIsPdfTemplateEditableField(__pmPdfTemplateInsertTarget)) {
        return __pmPdfTemplateInsertTarget;
    }
    const restored = __pmResolvePdfTemplateInsertTargetFromMeta(__pmPdfTemplateInsertMeta);
    if (__pmIsPdfTemplateEditableField(restored)) {
        __pmPdfTemplateInsertTarget = restored;
        return restored;
    }
    return null;
}
function __pmInsertPdfTemplateToken(token) {
    const safeToken = String(token || '').trim().replace(/^\{\{\s*|\s*\}\}$/g, '');
    if (!safeToken) return false;
    const insertValue = `{{${safeToken}}}`;
    const target = __pmResolvePdfTemplateInsertTarget();
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        try {
            navigator.clipboard.writeText(insertValue);
            window.showToast?.('Etiqueta copiada', 'success');
        } catch (_) {}
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
    } catch (_) {}
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    window.showToast?.('Etiqueta insertada', 'success');
    return true;
}
function __pmBuildTemplateTagButtonHtml(item, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const scope = String(opts.scope || 'pm-orders').trim();
    const token = String(item?.token || '').trim();
    const label = String(item?.label || token || '').trim();
    const tokenLabel = `{{${token}}}`;
    if (opts.style === 'modal') {
        return `
        <button type="button" data-pdf-template-scope="${__pmSafeHtml(scope)}" data-pdf-template-token="${__pmSafeHtml(token)}" class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:border-brand-red hover:bg-red-50/40">
            <div class="min-w-0">
                <code class="text-[11px] font-black text-brand-red">${__pmSafeHtml(tokenLabel)}</code>
                <p class="mt-1 text-[11px] font-semibold text-gray-600">${__pmSafeHtml(label)}</p>
            </div>
            <span class="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-brand-dark shadow-sm">Insertar</span>
        </button>`;
    }
    const compact = opts.compact === true;
    const classes = compact
        ? 'inline-flex items-center rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[10px] font-black text-brand-red shadow-sm transition hover:border-brand-red hover:text-brand-red'
        : 'inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-black text-brand-red shadow-sm transition hover:border-brand-red hover:text-brand-red';
    return `<button type="button" data-pdf-template-scope="${__pmSafeHtml(scope)}" data-pdf-template-token="${__pmSafeHtml(token)}" title="${__pmSafeHtml(label)}" class="${classes}">${__pmSafeHtml(tokenLabel)}</button>`;
}
function __pmTemplateTagsModalHtml() {
    const rows = __PM_PDF_TEMPLATE_TOKENS.map((item) => __pmBuildTemplateTagButtonHtml(item, { style: 'modal' })).join('');
    return `<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl p-6">
        <div class="flex items-start justify-between gap-4 mb-4">
            <div><h3 class="text-lg font-black text-gray-900 uppercase tracking-tight">Etiquetas para PDF</h3><p class="text-xs text-gray-500 mt-1">Haz clic para insertarlas en el ultimo campo de texto o firma que estabas editando. Si no hay campo activo, se copiaran al portapapeles.</p></div>
            <button type="button" onclick="window.closeModal('pdf-template-tags-modal')" class="text-gray-400 hover:text-gray-700"><i class="fa-solid fa-xmark text-xl"></i></button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">${rows}</div>
    </div>`;
}
window.openPdfTemplateTagsModal = function () {
    let modal = document.getElementById('pdf-template-tags-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pdf-template-tags-modal';
        modal.className = 'fixed inset-0 z-[520] hidden items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        modal.addEventListener('click', (e) => { if (e.target === modal) window.closeModal('pdf-template-tags-modal'); });
        document.body.appendChild(modal);
    }
    modal.innerHTML = __pmTemplateTagsModalHtml();
    window.openModal('pdf-template-tags-modal');
};
function __pmTemplateTagsInlineHtml(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    return `<div class="flex flex-wrap gap-2">${__PM_PDF_TEMPLATE_TOKENS.map((item) => __pmBuildTemplateTagButtonHtml(item, { compact: opts.compact === true })).join('')}</div>`;
}
function __pmSyncPdfTemplateTagHelpers() {
    document.querySelectorAll('[data-pdf-template-helper="pm"]').forEach((host) => {
        host.innerHTML = __pmTemplateTagsInlineHtml();
    });
}
function __pmTemplateTagsInspectorCardHtml() {
    return `<div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-amber-700">Etiquetas del sistema</p>
            <button type="button" data-pdf-inspector-action="open-template-tags" class="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 transition hover:border-brand-red hover:text-brand-red">Ver todas</button>
        </div>
        <p class="text-[10px] text-amber-900/80">Haz clic en una etiqueta para insertarla en el ultimo campo activo de texto, firma o contenido base.</p>
        ${__pmTemplateTagsInlineHtml({ compact: true })}
    </div>`;
}
function __pmBindPdfTemplateTagHelpers() {
    if (document.body.dataset.pmPdfTemplateHelpersBound === '1') return;
    document.body.dataset.pmPdfTemplateHelpersBound = '1';
    document.addEventListener('focusin', (event) => {
        __pmRememberPdfTemplateInsertTarget(event.target);
    });
    document.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-pdf-template-scope="pm-orders"][data-pdf-template-token]') : null;
        if (!button) return;
        event.preventDefault();
        __pmInsertPdfTemplateToken(String(button.getAttribute('data-pdf-template-token') || ''));
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        __pmSyncPdfTemplateTagHelpers();
        __pmBindPdfTemplateTagHelpers();
    }, { once: true });
} else {
    __pmSyncPdfTemplateTagHelpers();
    __pmBindPdfTemplateTagHelpers();
}

function __pmGetOrderBaseContentFields(baseKey) {
    const key = String(baseKey || '').trim();
    const content = __pmNormalizePdfContent(__pmGetPdfStyleConfig().content);
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

function __pmGetPdfBaseBlockMeta(key) {
    const safe = String(key || '').trim();
    return __PM_PDF_BASE_TEXT_BLOCKS.find((block) => block.key === safe) || null;
}

function __pmCanMovePdfBaseBlock(key) {
    const safe = String(key || '').trim();
    return !!__pmGetPdfBaseBlockMeta(safe) && __PM_PDF_BASE_MOVABLE_KEYS.includes(safe);
}

function __pmCanEditPdfBaseBlock(key) {
    return !!__pmGetPdfBaseBlockMeta(key);
}

function __pmIsTemplateDrivenResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    const text = `${resource.text || ''} ${resource.signTitle || ''} ${resource.signRole || ''}`;
    return /\{\{[^}]+\}\}/.test(text);
}

function __pmCanMovePdfResource(resource) {
    return !!resource && typeof resource === 'object';
}

function __pmCanEditPdfResource(resource) {
    if (!resource || typeof resource !== 'object') return false;
    if (resource.isUserNote === true) return true;
    const type = String(resource.type || '').toLowerCase();
    if (type === 'sign' || type === 'sign-line' || type === 'sign-block') return true;
    if (type !== 'title' && type !== 'text') return false;
    return !__pmIsTemplateDrivenResource(resource);
}

function __pmFindPdfResourceById(resourceId) {
    const safeId = String(resourceId || '').trim();
    if (!safeId) return null;
    return __pmGetPdfResourcesFromState().find((resource) => String(resource.id || '') === safeId) || null;
}

function __pmNormalizePdfBaseLayout(raw = {}) {
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
        x: __pmClampStyleNumber(base.x, __PM_PDF_BASE_LAYOUT_LIMITS.x.min, __PM_PDF_BASE_LAYOUT_LIMITS.x.max, 0),
        y: __pmClampStyleNumber(base.y, __PM_PDF_BASE_LAYOUT_LIMITS.y.min, __PM_PDF_BASE_LAYOUT_LIMITS.y.max, 0),
        scalePct: __pmClampStyleNumber(base.scalePct ?? base.scale, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min, __PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max, 100),
        angle: __pmClampStyleNumber(base.angle, __PM_PDF_BASE_LAYOUT_LIMITS.angle.min, __PM_PDF_BASE_LAYOUT_LIMITS.angle.max, 0),
        hidden: base.hidden === true
    };
}

function __pmNormalizePdfBaseLayouts(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    __PM_PDF_BASE_TEXT_BLOCKS.forEach((block) => {
        out[block.key] = __pmNormalizePdfBaseLayout(source[block.key] || {});
        Object.keys(source).forEach((key) => {
            if (key.startsWith(`${block.key}__`)) out[key] = __pmNormalizePdfBaseLayout(source[key]);
        });
    });
    return out;
}

function __pmBuildPdfBaseTransform(layout) {
    const safe = __pmNormalizePdfBaseLayout(layout);
    return `translate(${safe.x}px, ${safe.y}px) rotate(${safe.angle || 0}deg) scale(${(safe.scalePct / 100).toFixed(3)})`;
}

function __pmNormalizePdfResources(raw) {
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
            : (isSign ? '#111827' : (type === 'bar' ? '#d32f2f' : 'transparent'));
        return {
            id: String(base.id || `pmres_${Date.now()}_${index}`),
            type,
            enabled: base.enabled !== false,
            page: __pmClampStyleNumber(base.page, 1, 8, 1),
            x: __pmClampStyleNumber(base.x, -4000, 4000, 80),
            y: __pmClampStyleNumber(base.y, -5000, 5000, 120),
            w: __pmClampStyleNumber(base.w, 16, 4000, defaultW),
            h: __pmClampStyleNumber(base.h, 1, 5000, defaultH),
            text: (type === 'title' || type === 'text') ? String(base.text || (type === 'title' ? 'TITULO' : 'Texto editable')).slice(0, 1200) : '',
            fontFamilyKey: String(base.fontFamilyKey || '').toLowerCase(),
            fontSize: __pmClampStyleNumber(base.fontSize, 8, 72, type === 'title' ? 24 : 14),
            bold: base.bold !== false,
            italic: !!base.italic,
            underline: !!base.underline,
            align: __pmNormalizeStyleAlign(base.align, 'left'),
            color: __pmNormalizeHexColor(base.color, '#111827'),
            bgColor: __pmNormalizeHexColor(base.bgColor, defaultBg),
            angle: __pmClampStyleNumber(base.angle, -360, 360, 0),
            signTitle: type === 'sign-block' ? String(base.signTitle || '').slice(0, 120) : '',
            signRole: type === 'sign-block' ? String(base.signRole || '').slice(0, 120) : '',
            isUserNote: base.isUserNote === true,
            noteAuthor: String(base.noteAuthor || '').slice(0, 120)
        };
    });
}

function __pmRenderPdfResources(style, pageIndex, templateContext = {}) {
    const cfg = __pmNormalizePdfStyle(style || {});
    const resources = __pmNormalizePdfResources(cfg.resources);
    if (!resources.length) return '';
    const isAdmin = __pmIsAdminProfile();
    const globalFont = __PM_PDF_STYLE_FONT_MAP[cfg.fontFamilyKey] || __PM_PDF_STYLE_FONT_MAP.segoe;
    return resources
        .filter((resource) => resource.enabled && resource.page === pageIndex)
        .map((resource) => {
            const isSignBlock = resource.type === 'sign-block';
            const isSign = resource.type === 'sign' || resource.type === 'sign-line';
            let bgFill = resource.bgColor;
            if (resource.type !== 'bar' || resource.type === 'logo' || isSign || isSignBlock) bgFill = 'transparent';
            const common = `position:absolute;left:${resource.x}px;top:${resource.y}px;width:${resource.w}px;height:${resource.h}px;z-index:20;box-sizing:border-box;pointer-events:${isAdmin ? 'auto' : 'none'};background:${bgFill};transform:rotate(${resource.angle || 0}deg);transform-origin:center center;`;
            const deleteBtnHtml = isAdmin ? `<div class="pm-pdf-delete-btn" data-res-action="remove" data-res-id="${__pmSafeHtml(resource.id)}"><i class="fa-solid fa-trash pointer-events-none"></i></div>` : '';
            if (resource.type === 'logo') {
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="logo" style="${common}padding:0;border-radius:0;"><img src="${__pmSafeHtml(COMPANY_LOGO_URL)}" alt="Logo" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;">${deleteBtnHtml}</div>`;
            }
            if (isSign) {
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign" style="${common}background:transparent;border-radius:2px;"><div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${lineColor};transform:translateY(-50%);border-radius:999px;"></div>${deleteBtnHtml}</div>`;
            }
            if (isSignBlock) {
                const fontStack = resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    ? __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                    : globalFont;
                const titleStr = __pmSafeHtml(__pmResolvePdfTemplateString(resource.signTitle || '', templateContext));
                const roleStr = __pmSafeHtml(__pmResolvePdfTemplateString(resource.signRole || '', templateContext));
                const titleSize = Math.max(10, Number(resource.fontSize || 14));
                const roleSize = Math.max(9, titleSize - 2);
                const lineColor = (resource.bgColor && resource.bgColor !== 'transparent') ? resource.bgColor : '#111827';
                const textColor = (resource.color && resource.color !== 'transparent') ? resource.color : '#111827';
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="sign-block" style="${common}display:flex;flex-direction:column;align-items:center;justify-content:flex-end;background:transparent;"><div style="width:100%;height:2px;background:${lineColor};border-radius:999px;margin-bottom:4px;"></div><div style="width:100%;text-align:center;color:${textColor};font-family:${fontStack};pointer-events:none;user-select:none;">${titleStr ? `<div style="font-size:${titleSize}px;font-weight:800;line-height:1.2;">${titleStr}</div>` : ''}${roleStr ? `<div style="font-size:${roleSize}px;text-transform:uppercase;opacity:0.6;margin-top:2px;">${roleStr}</div>` : ''}</div>${deleteBtnHtml}</div>`;
            }
            if (resource.type === 'bar') {
                return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="bar" style="${common}background:${resource.bgColor};border-radius:2px;">${deleteBtnHtml}</div>`;
            }
            const fontStack = resource.fontFamilyKey && __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                ? __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey]
                : globalFont;
            const placeholder = isAdmin && !resource.text ? (resource.type === 'title' ? 'TÍTULO VACÍO' : 'Texto vacío') : '';
            const textStr = __pmResolvePdfTemplateString(resource.text || '', templateContext);
            return `<div class="pm-pdf-resource pm-pdf-editable" data-res-id="${__pmSafeHtml(resource.id)}" data-res-page="${pageIndex}" data-res-type="${__pmSafeHtml(resource.type)}" data-res-font-size="${resource.fontSize}" style="${common}"><div style="width:100%;height:100%;padding:4px;overflow:hidden;font-family:${fontStack};font-size:${resource.fontSize}px;line-height:1.2;font-weight:${resource.bold ? 800 : 500};font-style:${resource.italic ? 'italic' : 'normal'};text-decoration:${resource.underline ? 'underline' : 'none'};text-align:${resource.align};white-space:pre-wrap;color:${resource.color};pointer-events:none;user-select:none;">${__pmSafeHtml(textStr) || `<span style="opacity:0.3;">${placeholder}</span>`}</div>${deleteBtnHtml}</div>`;
        })
        .join('');
}

function __pmNormalizePdfStyle(raw = {}) {
    const base = { ...__PM_PDF_STYLE_DEFAULTS, ...(raw || {}) };
    const fontKey = String(base.fontFamilyKey || '').toLowerCase();
    return {
        fontFamilyKey: __PM_PDF_STYLE_FONT_MAP[fontKey] ? fontKey : __PM_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: __pmClampStyleNumber(base.headerLinePx, 1, 8, __PM_PDF_STYLE_DEFAULTS.headerLinePx),
        titlePx: __pmClampStyleNumber(base.titlePx, 20, 42, __PM_PDF_STYLE_DEFAULTS.titlePx),
        metaPx: __pmClampStyleNumber(base.metaPx, 8, 18, __PM_PDF_STYLE_DEFAULTS.metaPx),
        tableHeadPx: __pmClampStyleNumber(base.tableHeadPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.tableHeadPx),
        tableBodyPx: __pmClampStyleNumber(base.tableBodyPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.tableBodyPx),
        lineHeightPct: __pmClampStyleNumber(base.lineHeightPct, 90, 180, __PM_PDF_STYLE_DEFAULTS.lineHeightPct),
        quickPx: __pmClampStyleNumber(base.quickPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.quickPx),
        conditionsPx: __pmClampStyleNumber(base.conditionsPx, 9, 18, __PM_PDF_STYLE_DEFAULTS.conditionsPx),
        signPx: __pmClampStyleNumber(base.signPx, 9, 16, __PM_PDF_STYLE_DEFAULTS.signPx),
        footerPx: __pmClampStyleNumber(base.footerPx, 8, 14, __PM_PDF_STYLE_DEFAULTS.footerPx),
        offsetXPx: __pmClampStyleNumber(base.offsetXPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.offsetXPx),
        offsetYPx: __pmClampStyleNumber(base.offsetYPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.offsetYPx),
        extraPages: __pmClampStyleNumber(base.extraPages, -1, 6, __PM_PDF_STYLE_DEFAULTS.extraPages),
        marginTopPx: __pmClampStyleNumber(base.marginTopPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginTopPx),
        marginBottomPx: __pmClampStyleNumber(base.marginBottomPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginBottomPx),
        marginLeftPx: __pmClampStyleNumber(base.marginLeftPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginLeftPx),
        marginRightPx: __pmClampStyleNumber(base.marginRightPx, -4000, 4000, __PM_PDF_STYLE_DEFAULTS.marginRightPx),
        baseLayouts: __pmNormalizePdfBaseLayouts(base.baseLayouts),
        resources: __pmNormalizePdfResources(base.resources),
        content: __pmNormalizePdfContent(base.content),
        headerAlign: __pmNormalizeStyleAlign(base.headerAlign, __PM_PDF_STYLE_DEFAULTS.headerAlign),
        metaAlign: __pmNormalizeStyleAlign(base.metaAlign, __PM_PDF_STYLE_DEFAULTS.metaAlign),
        tableAlign: __pmNormalizeStyleAlign(base.tableAlign, __PM_PDF_STYLE_DEFAULTS.tableAlign),
        quickAlign: __pmNormalizeStyleAlign(base.quickAlign, __PM_PDF_STYLE_DEFAULTS.quickAlign),
        conditionsAlign: __pmNormalizeStyleAlign(base.conditionsAlign, __PM_PDF_STYLE_DEFAULTS.conditionsAlign),
        signAlign: __pmNormalizeStyleAlign(base.signAlign, __PM_PDF_STYLE_DEFAULTS.signAlign),
        summaryAlign: __pmNormalizeStyleAlign(base.summaryAlign, __PM_PDF_STYLE_DEFAULTS.summaryAlign),
        footerAlign: __pmNormalizeStyleAlign(base.footerAlign, __PM_PDF_STYLE_DEFAULTS.footerAlign)
    };
}

function __pmNormalizePdfStyleProfileKey(profile) {
    const safe = String(profile || '').toLowerCase();
    if (__PM_PDF_STYLE_PROFILE_KEYS.includes(safe)) return safe;
    return safe === 'order' ? 'order' : 'quote';
}

function __pmExtractPdfStyleProfile(raw, profile = 'quote') {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const normalizedProfile = __pmNormalizePdfStyleProfileKey(profile);
    const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : null;
    if (profiles) {
        const candidate = profiles[normalizedProfile] || profiles.quote || profiles.default;
        if (candidate && typeof candidate === 'object') return candidate;
    }
    return cfg;
}

function __pmLoadPdfStyleState() {
    return __pmNormalizePdfStyle();
}

function __pmLoadPdfStyleUiState() {
    try {
        const raw = localStorage.getItem(__PM_PDF_STYLE_UI_STATE_KEY);
        if (!raw) return { collapsed: false, pinned: false };
        const parsed = JSON.parse(raw);
        return { collapsed: !!parsed?.collapsed, pinned: !!parsed?.pinned };
    } catch (_) {
        return { collapsed: false, pinned: false };
    }
}

function __pmSavePdfStyleUiState() {
    try {
        localStorage.setItem(__PM_PDF_STYLE_UI_STATE_KEY, JSON.stringify(__pmPdfStyleUiState));
    } catch (_) {}
}

function __pmGetPdfStyleConfig() {
    if (!__pmPdfStyleState) __pmPdfStyleState = __pmLoadPdfStyleState();
    return { ...__pmPdfStyleState };
}

function __pmPdfStyleVars(style) {
    const safe = __pmNormalizePdfStyle(style);
    const headerAlign = safe.headerAlign === 'justify' ? 'left' : safe.headerAlign;
    return {
        '--pm-font-family': __PM_PDF_STYLE_FONT_MAP[safe.fontFamilyKey],
        '--pm-header-line': `${safe.headerLinePx}px`,
        '--pm-title-size': `${safe.titlePx}px`,
        '--pm-meta-size': `${safe.metaPx}px`,
        '--pm-date-size': `${Math.max(8, safe.metaPx - 2)}px`,
        '--pm-table-head-size': `${safe.tableHeadPx}px`,
        '--pm-table-body-size': `${safe.tableBodyPx}px`,
        '--pm-line-height': `${(safe.lineHeightPct / 100).toFixed(2)}`,
        '--pm-quick-size': `${safe.quickPx}px`,
        '--pm-conditions-size': `${safe.conditionsPx}px`,
        '--pm-sign-size': `${safe.signPx}px`,
        '--pm-footer-size': `${safe.footerPx}px`,
        '--pm-offset-x': `${safe.offsetXPx}px`,
        '--pm-offset-y': `${safe.offsetYPx}px`,
        '--pm-margin-top': `${safe.marginTopPx}px`,
        '--pm-margin-right': `${safe.marginRightPx}px`,
        '--pm-margin-bottom': `${safe.marginBottomPx}px`,
        '--pm-margin-left': `${safe.marginLeftPx}px`,
        '--pm-header-align': headerAlign,
        '--pm-header-justify': headerAlign === 'left' ? 'flex-start' : (headerAlign === 'center' ? 'center' : 'flex-end'),
        '--pm-meta-align': safe.metaAlign,
        '--pm-table-align': safe.tableAlign,
        '--pm-quick-align': safe.quickAlign,
        '--pm-conditions-align': safe.conditionsAlign,
        '--pm-sign-align': safe.signAlign,
        '--pm-summary-align': safe.summaryAlign,
        '--pm-footer-align': safe.footerAlign
    };
}

function __pmPdfStyleVarsInline(style) {
    const vars = __pmPdfStyleVars(style);
    return Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('');
}

function __pmBuildPdfContentFrameStyle(baseHeightPx, extraStyle = '') {
    const extra = String(extraStyle || '').trim();
    const suffix = extra ? `${extra}${extra.endsWith(';') ? '' : ';'}` : '';
  return `position:relative;left:var(--pm-margin-left);top:var(--pm-margin-top);width:max(48px,calc(100% - var(--pm-margin-left) - var(--pm-margin-right)));height:max(48px,calc(${baseHeightPx}px - var(--pm-margin-top) - var(--pm-margin-bottom)));min-height:max(48px,calc(${baseHeightPx}px - var(--pm-margin-top) - var(--pm-margin-bottom)));box-sizing:border-box;overflow:visible;${suffix}`;
}

function __pmApplyPdfBaseLayouts() {
    const cfg = __pmGetPdfStyleConfig();
    const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    const counters = {};
    document.querySelectorAll('#pdf-content [data-base-resource]').forEach((node) => {
        const key = String(node.getAttribute('data-base-resource') || '').trim();
        if (!__pmGetPdfBaseBlockMeta(key)) return;
        counters[key] = (counters[key] || 0);
        const index = counters[key]++;
        const instanceKey = `${key}__${index}`;
        const layout = layouts[instanceKey] || layouts[key] || __pmNormalizePdfBaseLayout();
        if (node.dataset.baseNativeTransformCaptured !== '1') {
            node.dataset.baseNativeTransform = String(node.style.transform || '').trim();
            node.dataset.baseNativeTransformCaptured = '1';
        }
        const nativeTransform = String(node.dataset.baseNativeTransform || '').trim();
        const layoutTransform = __pmBuildPdfBaseTransform(layout);
        node.style.position = 'relative';
        node.style.transformOrigin = 'top left';
        node.style.transform = nativeTransform ? `${layoutTransform} ${nativeTransform}` : layoutTransform;
        node.style.display = layout.hidden ? 'none' : '';
        node.classList.toggle('pm-pdf-editable', __pmIsAdminProfile());
        node.dataset.baseInstance = instanceKey;
    });
}

function __pmCommitPdfBaseLayout(key, layout) {
    const baseKey = String(key || '').split('__')[0].trim();
    if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
    const fullKey = String(key || '').trim();
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = {
        ...__pmNormalizePdfBaseLayouts(cfg.baseLayouts),
        [fullKey]: __pmNormalizePdfBaseLayout(layout)
    };
    const next = __pmNormalizePdfStyle({ ...cfg, baseLayouts });
    __pmSetPdfStyleConfig(next, { applyToDom: false });
    __pmApplyPdfBaseLayouts();
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmCommitBaseLayoutField(baseId, field, rawValue) {
    const key = String(baseId || '').replace(/^base:/, '').trim();
    const baseKey = key.split('__')[0];
    if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
    if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(String(field || '')) && !__pmCanMovePdfBaseBlock(baseKey)) return;
    const cfg = __pmGetPdfStyleConfig();
    const baseLayouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
    const current = baseLayouts[key] || baseLayouts[baseKey] || __pmNormalizePdfBaseLayout();
    const nextLayout = { ...current };
    if (field === 'x' || field === 'y') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS[field];
        nextLayout[field] = __pmClampStyleNumber(rawValue, limits.min, limits.max, current[field]);
    } else if (field === 'scalePct') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS.scalePct;
        nextLayout.scalePct = __pmClampStyleNumber(rawValue, limits.min, limits.max, current.scalePct);
    } else if (field === 'angle') {
        const limits = __PM_PDF_BASE_LAYOUT_LIMITS.angle;
        nextLayout.angle = __pmClampStyleNumber(rawValue, limits.min, limits.max, current.angle || 0);
    } else if (field === 'visible') {
        nextLayout.hidden = !rawValue;
    } else {
        return;
    }
    const next = __pmNormalizePdfStyle({
        ...cfg,
        baseLayouts: {
            ...baseLayouts,
            [key]: __pmNormalizePdfBaseLayout(nextLayout)
        }
    });
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmAutoFitPdfTextNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const type = String(node.getAttribute('data-res-type') || '').trim();
    if (type !== 'text' && type !== 'title') return;
    const baseFont = __pmClampStyleNumber(
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

function __pmAutoFitPdfTextResources() {
    document.querySelectorAll('#pdf-content .pm-pdf-resource[data-res-type="text"], #pdf-content .pm-pdf-resource[data-res-type="title"]').forEach((node) => {
        __pmAutoFitPdfTextNode(node);
    });
}

function __pmMarginStateFromConfig(style) {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    return {
        top: cfg.marginTopPx,
        right: cfg.marginRightPx,
        bottom: cfg.marginBottomPx,
        left: cfg.marginLeftPx
    };
}

function __pmApplyMarginVarsToLivePreview(style) {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    document.querySelectorAll('#pdf-content .pm-pdf-root').forEach((node) => {
        node.style.setProperty('--pm-margin-top', `${cfg.marginTopPx}px`);
        node.style.setProperty('--pm-margin-right', `${cfg.marginRightPx}px`);
        node.style.setProperty('--pm-margin-bottom', `${cfg.marginBottomPx}px`);
        node.style.setProperty('--pm-margin-left', `${cfg.marginLeftPx}px`);
    });
}

function __pmCommitMargins(margins, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const current = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({
        ...current,
        marginTopPx: margins.top,
        marginRightPx: margins.right,
        marginBottomPx: margins.bottom,
        marginLeftPx: margins.left
    });
    __pmPdfStyleState = next;
    __pmApplyMarginVarsToLivePreview(next);
    __pmSyncPdfStyleValueLabels(next);
    __pmRenderPdfToolbar();
    if (opts.persist !== false) __pmScheduleSharedPdfStyleSync(next);
    return next;
}

function __pmEnsureMarginGuideController() {
    if (!window.createPdfMarginGuideController) return null;
    if (!__pmPdfMarginGuideController) {
        __pmPdfMarginGuideController = window.createPdfMarginGuideController({
            container: () => document.getElementById('preview-container'),
            root: () => document.getElementById('pdf-content'),
            minMarginPx: -4000,
            maxMarginPx: 4000,
            isVisible: () => {
                return __pmIsPdfPreviewVisible() && __pmIsAdminProfile() && !__pmPdfEditLocked;
            },
            getMargins: () => __pmMarginStateFromConfig(),
            onChange: (margins) => {
                __pmCommitMargins(margins, { persist: false });
            },
            onCommit: (margins) => {
                __pmCommitMargins(margins, { persist: false });
                __pmScheduleSharedPdfStyleSync(__pmGetPdfStyleConfig());
            }
        });
    }
    return __pmPdfMarginGuideController;
}

function __pmBindFloatingPanelDrag(panel, host) {
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
            try { handle.setPointerCapture(event.pointerId); } catch (_) {}
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

function __pmRenderPdfToolbar() {
    const buttonBar = document.getElementById('pm-pdf-edit-button-bar');
    const isAdmin = __pmIsAdminProfile();
    document.querySelectorAll('[data-pdf-admin-caption="1"]').forEach((node) => {
        node.classList.toggle('hidden', !isAdmin);
    });
    if (!buttonBar) return;
    const showToolbar = __pmIsPdfPreviewVisible() && isAdmin;
    buttonBar.classList.toggle('hidden', !showToolbar);
    if (!showToolbar) {
        document.getElementById('pm-pdf-inspector')?.classList.add('hidden');
        document.getElementById('pm-pdf-inspector-backdrop')?.classList.add('hidden');
        return;
    }
    const adminTools = document.getElementById('pm-pdf-admin-tools');
    if (adminTools) adminTools.classList.toggle('hidden', !isAdmin);
    const button = document.getElementById('pm-pdf-edit-button');
    if (button) {
        const editingEnabled = !__pmPdfEditLocked;
        button.innerHTML = `<i class="fa-solid ${editingEnabled ? 'fa-lock-open' : 'fa-lock'}"></i><span>${editingEnabled ? 'Edicion activa' : 'Editar PDF'}</span>`;
        button.className = `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition ${editingEnabled ? 'bg-emerald-600 border-emerald-400/50 hover:bg-emerald-500' : 'bg-gray-950 border-gray-700 hover:bg-gray-900'}`;
        button.classList.toggle('hidden', !isAdmin);
    }
    const addButton = document.getElementById('pm-pdf-add-button');
    if (addButton) {
        addButton.classList.toggle('pointer-events-none', __pmPdfEditLocked);
        addButton.classList.toggle('opacity-60', __pmPdfEditLocked);
    }
}

function __pmGetOrderPreviewPages() {
    const root = document.querySelector('#pdf-content .pm-pdf-root');
    if (!(root instanceof HTMLElement)) return [];
    return Array.from(root.children).filter((child) => child instanceof HTMLDivElement);
}

function __pmGetOrderBasePageCount() {
    const docType = String(currentPreviewOrder?.docType || __pmPdfStyleActiveProfile || 'quote').toLowerCase();
    return docType === 'order' ? 1 : 2;
}

function __pmAttachOrderPageControls() {
    const pages = __pmGetOrderPreviewPages();
    pages.forEach((page) => page.querySelectorAll('[data-pdf-page-add],[data-pdf-page-delete]').forEach((node) => node.remove()));
    const canShow = __pmIsAdminProfile() && !__pmPdfEditLocked;
    if (!canShow || !pages.length) return;
    const cfg = __pmGetPdfStyleConfig();
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

    const canRemove = Number(cfg.extraPages || 0) > 0 || (Number(cfg.extraPages || 0) === 0 && __pmGetOrderBasePageCount() > 1);
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

function __pmHandleOrderPageControlClick(targetEl) {
    if (!targetEl || !__pmIsAdminProfile() || __pmPdfEditLocked) return false;
    if (targetEl.hasAttribute('data-pdf-page-add')) {
        const cfg = __pmGetPdfStyleConfig();
        const nextExtra = __pmClampStyleNumber((parseInt(cfg.extraPages, 10) || 0) + 1, -1, 6, cfg.extraPages);
        const next = __pmNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __pmSetPdfStyleConfig(next, { applyToDom: true });
        __pmWritePdfStyleControls(next);
        __pmScheduleSharedPdfStyleSync(next);
        return true;
    }
    if (targetEl.hasAttribute('data-pdf-page-delete')) {
        const cfg = __pmGetPdfStyleConfig();
        const currentExtra = __pmClampStyleNumber(cfg.extraPages, -1, 6, 0);
        const basePages = __pmGetOrderBasePageCount();
        const nextExtra = currentExtra > 0
            ? (currentExtra - 1)
            : ((currentExtra === 0 && basePages > 1) ? -1 : currentExtra);
        if (nextExtra === currentExtra) return true;
        const next = __pmNormalizePdfStyle({ ...cfg, extraPages: nextExtra });
        __pmSetPdfStyleConfig(next, { applyToDom: true });
        __pmWritePdfStyleControls(next);
        __pmScheduleSharedPdfStyleSync(next);
        return true;
    }
    return false;
}

function __pmSyncPdfEditMode() {
    const editingEnabled = __pmIsAdminProfile() && !__pmPdfEditLocked;
    document.querySelectorAll('#pdf-content .pm-pdf-root').forEach((node) => {
        node.classList.toggle('pm-pdf-admin-enabled', editingEnabled);
    });
    if (!editingEnabled) __pmClosePdfInspector();
    __pmRenderPdfToolbar();
    __pmAttachOrderPageControls();
    __pmEnsureMarginGuideController()?.refresh();
}

function __pmSetPdfEditLocked(locked) {
    const wasLocked = __pmPdfEditLocked;
    __pmPdfEditLocked = locked !== false;
    if (__pmPdfEditLocked) __pmClosePdfInspector();
    __pmSyncPdfEditMode();
    if (!wasLocked && __pmPdfEditLocked && __pmIsAdminProfile()) {
        Promise.resolve()
            .then(() => __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true }))
            .catch(() => {});
    }
}

function __pmGetPdfInspectorTarget() {
    if (!__pmPdfInspectorState || !__pmIsAdminProfile()) return null;
    if (__pmPdfInspectorState.kind === 'base') {
        const key = String(__pmPdfInspectorState.key || '').trim();
        const meta = __pmGetPdfBaseBlockMeta(key);
        if (!meta) return null;
        const layouts = __pmNormalizePdfBaseLayouts(__pmGetPdfStyleConfig().baseLayouts);
        const instanceKey = String(__pmPdfInspectorState.instanceKey || key).trim();
        const layout = layouts[instanceKey] || layouts[key] || __pmNormalizePdfBaseLayout();
        const canEdit = __pmCanEditPdfBaseBlock(key);
        return {
            kind: 'base',
            id: instanceKey,
            label: meta.label,
            layout,
            canMove: __pmCanMovePdfBaseBlock(key),
            canEdit,
            contentFields: canEdit ? __pmGetOrderBaseContentFields(key) : [],
            canDelete: false
        };
    }
    if (__pmPdfInspectorState.kind === 'resource') {
        const resource = __pmGetPdfResourcesFromState().find((item) => item.id === __pmPdfInspectorState.id);
        if (!resource) return null;
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const isLogo = resource.type === 'logo';
        const isSignLine = resource.type === 'sign' || resource.type === 'sign-line';
        const isBar = resource.type === 'bar';
        const canMove = __pmCanMovePdfResource(resource);
        const canEdit = __pmCanEditPdfResource(resource);
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

function __pmRenderPdfInspector() {
    const panel = document.getElementById('pm-pdf-inspector');
    const backdrop = document.getElementById('pm-pdf-inspector-backdrop');
    if (!(panel instanceof HTMLElement)) return;
    const target = __pmGetPdfInspectorTarget();
    const shouldShow = !!target && !__pmPdfEditLocked && __pmIsAdminProfile();
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
        const templateHelperSection = contentFields.length ? __pmTemplateTagsInspectorCardHtml() : '';
        const layoutSection = target.canMove
            ? `<div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.x.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.x.max}" value="${target.layout.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.y.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.y.max}" value="${target.layout.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Escala</span><input data-pdf-inspector-field="scalePct" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.scalePct.max}" value="${target.layout.scalePct}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Giro</span><input data-pdf-inspector-field="angle" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="number" min="${__PM_PDF_BASE_LAYOUT_LIMITS.angle.min}" max="${__PM_PDF_BASE_LAYOUT_LIMITS.angle.max}" value="${target.layout.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
                <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Visible</span><select data-pdf-inspector-field="visible" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${!target.layout.hidden ? 'selected' : ''}>Sí</option><option value="false" ${target.layout.hidden ? 'selected' : ''}>No</option></select></label>
            </div>`
            : '';
        const contentSection = contentFields.length
            ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
                ${contentFields.map((field) => field.multiline
                    ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><textarea data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" rows="${field.rows || 4}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__pmSafeHtml(field.value || '')}</textarea></label>`
                    : `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" type="text" value="${__pmSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
            </div>`
            : '';
        const resetButton = target.canMove
            ? `<button type="button" data-pdf-inspector-action="reset" data-target-kind="base" data-target-id="${__pmSafeHtml(target.id)}" class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:border-brand-red hover:text-brand-red">Restablecer bloque</button>`
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
        ? __pmTemplateTagsInspectorCardHtml()
        : '';
    const contentSection = Array.isArray(target.contentFields) && target.contentFields.length
        ? `<div class="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Contenido</p>
            ${target.contentFields.map((field) => `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${field.label}</span><input data-pdf-inspector-field="${__pmSafeHtml(field.key)}" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="text" value="${__pmSafeHtml(field.value || '')}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>`).join('')}
        </div>`
        : '';
    const moveFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">X</span><input data-pdf-inspector-field="x" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" value="${resource.x}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Y</span><input data-pdf-inspector-field="y" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" value="${resource.y}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ancho</span><input data-pdf-inspector-field="w" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="16" value="${resource.w}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alto</span><input data-pdf-inspector-field="h" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="1" value="${resource.h}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
        `
        : '';
    const moveMetaFields = target.canMove
        ? `
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Ángulo</span><input data-pdf-inspector-field="angle" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Página</span><input data-pdf-inspector-field="page" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="1" max="8" value="${resource.page}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>
            <label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Estado</span><select data-pdf-inspector-field="enabled" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="true" ${resource.enabled ? 'selected' : ''}>Sí</option><option value="false" ${!resource.enabled ? 'selected' : ''}>No</option></select></label>
        `
        : '';
    body.innerHTML = `
        ${target.allowText ? `<label class="flex flex-col gap-1 text-xs text-gray-600"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Texto</span><textarea data-pdf-inspector-field="text" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" rows="4" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red">${__pmSafeHtml(resource.text)}</textarea></label>` : ''}
        ${contentSection}
        ${templateHelperSection}
        <div class="grid grid-cols-2 gap-3 text-xs text-gray-600">
            ${moveFields}
            ${target.showTypography ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Fuente</span><input data-pdf-inspector-field="fontSize" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"></label>` : ''}
            ${moveMetaFields}
            ${target.showAlign ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Alineación</span><select data-pdf-inspector-field="align" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-brand-red"><option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option><option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option><option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option><option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option></select></label>` : ''}
            ${target.showColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">Color</span><input data-pdf-inspector-field="color" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="color" value="${resource.color}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
            ${target.showBgColor ? `<label class="flex flex-col gap-1"><span class="text-[10px] font-black uppercase tracking-wide text-gray-400">${__pmSafeHtml(target.bgColorLabel || 'Fondo')}</span><input data-pdf-inspector-field="bgColor" data-target-kind="resource" data-target-id="${__pmSafeHtml(resource.id)}" type="color" value="${resource.bgColor && resource.bgColor !== 'transparent' ? resource.bgColor : '#ffffff'}" class="h-10 w-full rounded-xl border border-gray-200 bg-white px-2 py-1 outline-none transition focus:border-brand-red"></label>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2 ${target.showToggles ? '' : 'hidden'}">
            <button type="button" data-pdf-inspector-toggle="bold" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.bold ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Negrita</button>
            <button type="button" data-pdf-inspector-toggle="italic" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.italic ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Itálica</button>
            <button type="button" data-pdf-inspector-toggle="underline" data-target-id="${__pmSafeHtml(resource.id)}" class="rounded-xl border px-3 py-2 text-[10px] font-black uppercase transition ${resource.underline ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 text-gray-500'}">Subrayado</button>
        </div>
        ${target.canDelete ? `<button type="button" data-pdf-inspector-action="delete" data-target-id="${__pmSafeHtml(resource.id)}" class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600 transition hover:bg-red-100"><i class="fa-solid fa-trash"></i><span>Eliminar recurso</span></button>` : ''}
    `;
}

function __pmOpenPdfInspector(state) {
    __pmPdfInspectorState = state && typeof state === 'object' ? { ...state } : null;
    __pmRenderPdfInspector();
}

function __pmClosePdfInspector() {
    __pmPdfInspectorState = null;
    __pmRenderPdfInspector();
}

function __pmCommitResourceInspectorField(resourceId, field, rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const resources = __pmGetPdfResourcesFromState();
    const idx = resources.findIndex((resource) => resource.id === resourceId);
    if (idx < 0) return;
    const current = resources[idx];
    const canMove = __pmCanMovePdfResource(current);
    const canEdit = __pmCanEditPdfResource(current);
    if (field === 'text') {
        if (!canEdit) return;
        current.text = String(rawValue || '').slice(0, 1200);
    } else if (field === 'signTitle' || field === 'signRole') {
        if (!canEdit) return;
        current[field] = String(rawValue || '').slice(0, 120);
    } else if (field === 'fontSize') {
        if (!canEdit) return;
        current.fontSize = __pmClampStyleNumber(rawValue, 8, 72, current.fontSize);
    } else if (field === 'align') {
        if (!canEdit) return;
        current.align = __pmNormalizeStyleAlign(rawValue, current.align);
    } else if (field === 'color') {
        if (!canEdit) return;
        current.color = __pmNormalizeHexColor(rawValue, current.color);
    } else if (field === 'bgColor') {
        if (!canEdit) return;
        current.bgColor = __pmNormalizeHexColor(rawValue, current.bgColor);
    } else if (field === 'page') {
        if (!canMove) return;
        current.page = __pmClampStyleNumber(rawValue, 1, 8, current.page);
    } else if (field === 'x') {
        if (!canMove) return;
        current.x = __pmClampStyleNumber(rawValue, -4000, 4000, current.x);
    } else if (field === 'y') {
        if (!canMove) return;
        current.y = __pmClampStyleNumber(rawValue, -5000, 5000, current.y);
    } else if (field === 'w') {
        if (!canMove) return;
        current.w = __pmClampStyleNumber(rawValue, 16, 4000, current.w);
    } else if (field === 'h') {
        if (!canMove) return;
        current.h = __pmClampStyleNumber(rawValue, 1, 5000, current.h);
    } else if (field === 'angle') {
        if (!canMove) return;
        current.angle = __pmClampStyleNumber(rawValue, -360, 360, current.angle || 0);
    } else if (field === 'bold' || field === 'italic' || field === 'underline') {
        if (!canEdit) return;
        current[field] = !!rawValue;
    } else if (field === 'enabled') {
        if (!canMove) return;
        current.enabled = !!rawValue;
    }
    else return;
    resources[idx] = { ...current };
    __pmCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: opts.skipEditorUiRefresh === true
    });
}

function __pmHandlePdfInspectorInput(event) {
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
        if (['x', 'y', 'scalePct', 'angle', 'visible'].includes(field)) {
            __pmCommitBaseLayoutField(`base:${id}`, field, rawValue);
        } else if (__pmCanEditPdfBaseBlock(baseKey)) {
            __pmCommitPdfContentField(field, rawValue, {
                refreshPreview: !isContinuousInput,
                skipEditorUiRefresh: isContinuousInput
            });
        } else {
            return;
        }
    }
    else __pmCommitResourceInspectorField(id, field, rawValue, { skipEditorUiRefresh: isContinuousInput });
    if (isContinuousInput) {
        // En escritura continua no re-renderizamos el inspector para evitar perdida de foco por tecla.
        requestAnimationFrame(() => {
            const panel = document.getElementById('pm-pdf-inspector');
            if (panel && typeof panel.__ensureFloatingPosition === 'function') panel.__ensureFloatingPosition();
        });
        return;
    }
    __pmRenderPdfInspector();
}

function __pmHandlePdfInspectorClick(event) {
    const actionEl = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-action]') : null;
    if (actionEl) {
        const action = String(actionEl.getAttribute('data-pdf-inspector-action') || '').trim();
        const id = String(actionEl.getAttribute('data-target-id') || '').trim();
        const kind = String(actionEl.getAttribute('data-target-kind') || '').trim();
        if (action === 'close') {
            __pmClosePdfInspector();
            return;
        }
        if (action === 'open-template-tags') {
            window.openPdfTemplateTagsModal?.();
            return;
        }
        if (action === 'reset' && kind === 'base' && id) {
            __pmCommitBaseLayoutField(`base:${id}`, 'x', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'y', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'scalePct', 100);
            __pmCommitBaseLayoutField(`base:${id}`, 'angle', 0);
            __pmCommitBaseLayoutField(`base:${id}`, 'visible', true);
            __pmRenderPdfInspector();
            return;
        }
        if (action === 'delete' && id) {
            const resources = __pmGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            __pmPdfResourceEditorSelectedId = '';
            __pmClosePdfInspector();
            __pmCommitPdfResources(resources);
        }
        return;
    }
    const toggle = event.target instanceof Element ? event.target.closest('[data-pdf-inspector-toggle]') : null;
    if (!toggle) return;
    const field = String(toggle.getAttribute('data-pdf-inspector-toggle') || '').trim();
    const id = String(toggle.getAttribute('data-target-id') || '').trim();
    if (!field || !id) return;
    const current = __pmGetPdfResourcesFromState().find((resource) => resource.id === id);
    if (!current) return;
    __pmCommitResourceInspectorField(id, field, !current[field]);
    __pmRenderPdfInspector();
}

function __pmEnsurePdfEditingChrome(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const container = document.getElementById('preview-container');
    if (!(container instanceof HTMLElement)) return;
    if (window.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (!document.getElementById('pm-pdf-edit-button-bar')) {
        const buttonBar = document.createElement('div');
        buttonBar.id = 'pm-pdf-edit-button-bar';
        buttonBar.className = 'hidden absolute right-4 top-4 z-[96] flex items-center gap-2';
        buttonBar.innerHTML = `
            <div id="pm-pdf-admin-tools" class="flex items-center gap-2 transition">
                <button type="button" id="pm-pdf-add-button" class="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-gray-700 shadow-lg transition hover:border-brand-red hover:text-brand-red">
                    <i class="fa-solid fa-plus"></i>
                    <span>Anadir recurso</span>
                </button>
            </div>
            <button type="button" id="pm-pdf-edit-button" class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-lg transition"></button>
        `;
        buttonBar.addEventListener('click', (event) => {
            const addButton = event.target instanceof Element ? event.target.closest('#pm-pdf-add-button') : null;
            if (addButton) {
                if (__pmPdfEditLocked || !__pmIsAdminProfile()) return;
                window.openModal('pdf-resource-modal');
                return;
            }
            const button = event.target instanceof Element ? event.target.closest('#pm-pdf-edit-button') : null;
            if (!button) return;
            __pmSetPdfEditLocked(!__pmPdfEditLocked);
        });
        container.appendChild(buttonBar);
    }
    if (!document.getElementById('pm-pdf-inspector-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'pm-pdf-inspector-backdrop';
        backdrop.className = 'hidden absolute inset-0 z-[96] bg-gray-950/45 backdrop-blur-[1px]';
        container.appendChild(backdrop);
    }
    if (!document.getElementById('pm-pdf-inspector')) {
        const panel = document.createElement('div');
        panel.id = 'pm-pdf-inspector';
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
        panel.addEventListener('input', __pmHandlePdfInspectorInput);
        panel.addEventListener('change', __pmHandlePdfInspectorInput);
        panel.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            if (!(event.target instanceof HTMLInputElement)) return;
            if (event.target.type === 'button' || event.target.type === 'submit' || event.target.type === 'reset') return;
            event.preventDefault();
        });
        panel.addEventListener('click', __pmHandlePdfInspectorClick);
        container.appendChild(panel);
    }
    __pmBindFloatingPanelDrag(document.getElementById('pm-pdf-inspector'), container);
    if (container.dataset.pmPdfEditingChromeBound !== '1') {
        container.dataset.pmPdfEditingChromeBound = '1';
        container.addEventListener('click', (event) => {
            const pageCtl = event.target instanceof Element ? event.target.closest('[data-pdf-page-add],[data-pdf-page-delete]') : null;
            if (pageCtl && __pmHandleOrderPageControlClick(pageCtl)) {
                event.preventDefault();
                return;
            }
            const del = event.target instanceof Element ? event.target.closest('.pm-pdf-delete-btn[data-res-id]') : null;
            if (!del || __pmPdfEditLocked || !__pmIsAdminProfile()) return;
            const id = String(del.getAttribute('data-res-id') || '').trim();
            if (!id) return;
            const resources = __pmGetPdfResourcesFromState().filter((resource) => resource.id !== id);
            if (__pmPdfResourceEditorSelectedId === id) __pmPdfResourceEditorSelectedId = '';
            __pmClosePdfInspector();
            __pmCommitPdfResources(resources);
        });
        document.addEventListener('dblclick', (event) => {
            if (!__pmIsAdminProfile() || __pmPdfEditLocked) return;
            if (!__pmIsPdfPreviewVisible()) return;
            const target = event.target instanceof Element
                ? event.target
                : (event.target && event.target.parentElement instanceof Element ? event.target.parentElement : null);
            if (!target || target.closest('#pm-pdf-inspector')) return;
            const resourceNode = target.closest('#pdf-content .pm-pdf-resource[data-res-id]');
            if (resourceNode) {
                const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
                const resource = __pmFindPdfResourceById(resourceId);
                if (!resource) return;
                if (!__pmCanMovePdfResource(resource) && !__pmCanEditPdfResource(resource)) return;
                __pmPdfResourceEditorSelectedId = resourceId;
                __pmHighlightSelectedBaseTextBlock();
                __pmOpenPdfInspector({ kind: 'resource', id: __pmPdfResourceEditorSelectedId });
                return;
            }
            const baseNode = target.closest('#pdf-content [data-base-resource]');
            if (!baseNode) return;
            const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
            if (!__pmGetPdfBaseBlockMeta(baseKey)) return;
            if (!__pmCanMovePdfBaseBlock(baseKey) && !__pmCanEditPdfBaseBlock(baseKey)) return;
            __pmPdfResourceEditorSelectedId = `base:${baseKey}`;
            __pmHighlightSelectedBaseTextBlock();
            __pmOpenPdfInspector({ kind: 'base', key: baseKey, instanceKey: String(baseNode.dataset.baseInstance || baseKey).trim() });
        });
    }
    __pmSyncPdfEditMode();
    if (!skipEditorUiRefresh) __pmRenderPdfInspector();
}

function __pmApplyPdfStyleToLivePreview(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const skipEditorUiRefresh = opts.skipEditorUiRefresh === true;
    const rootNodes = document.querySelectorAll('#pdf-content .pm-pdf-root');
    if (!rootNodes.length) return;
    const vars = __pmPdfStyleVars(__pmGetPdfStyleConfig());
    rootNodes.forEach((node) => {
        Object.entries(vars).forEach(([k, v]) => node.style.setProperty(k, v));
    });
    __pmApplyMarginVarsToLivePreview(__pmGetPdfStyleConfig());
    __pmApplyPdfBaseLayouts();
    __pmAutoFitPdfTextResources();
    __pmEnsurePdfEditingChrome(opts);
    __pmBindPdfResourceDrag();
    __pmHighlightSelectedBaseTextBlock();
    if (!skipEditorUiRefresh) __pmRenderPdfInspector();
    __pmSyncPdfEditMode();
    if (!skipEditorUiRefresh && __pmIsAdminProfile()) __pmRenderPdfResourcesEditorList();
}

function __pmSyncPdfStyleValueLabels(style) {
    const cfg = __pmNormalizePdfStyle(style);
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

function __pmWritePdfStyleControls(style) {
    const cfg = __pmNormalizePdfStyle(style);
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
    __pmSyncPdfStyleValueLabels(cfg);
}

function __pmReadPdfStyleControls() {
    return __pmNormalizePdfStyle({
        fontFamilyKey: document.getElementById('pdf-style-font-family')?.value || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey,
        headerLinePx: document.getElementById('pdf-style-header-line')?.value,
        titlePx: document.getElementById('pdf-style-title-size')?.value,
        metaPx: document.getElementById('pdf-style-meta-size')?.value,
        tableHeadPx: (parseInt(document.getElementById('pdf-style-table-size')?.value || __PM_PDF_STYLE_DEFAULTS.tableBodyPx, 10) + 2),
        tableBodyPx: document.getElementById('pdf-style-table-size')?.value,
        lineHeightPct: document.getElementById('pdf-style-line-height')?.value,
        offsetXPx: document.getElementById('pdf-style-offset-x')?.value,
        offsetYPx: document.getElementById('pdf-style-offset-y')?.value,
        extraPages: document.getElementById('pdf-style-extra-pages')?.value,
        marginTopPx: document.getElementById('pdf-style-margin-top')?.value ?? __pmGetPdfStyleConfig().marginTopPx,
        marginRightPx: document.getElementById('pdf-style-margin-right')?.value ?? __pmGetPdfStyleConfig().marginRightPx,
        marginBottomPx: document.getElementById('pdf-style-margin-bottom')?.value ?? __pmGetPdfStyleConfig().marginBottomPx,
        marginLeftPx: document.getElementById('pdf-style-margin-left')?.value ?? __pmGetPdfStyleConfig().marginLeftPx,
        baseLayouts: __pmGetPdfStyleConfig().baseLayouts,
        resources: __pmGetPdfStyleConfig().resources,
        quickPx: document.getElementById('pdf-style-quick-size')?.value,
        conditionsPx: document.getElementById('pdf-style-conditions-size')?.value,
        signPx: document.getElementById('pdf-style-sign-size')?.value,
        footerPx: __pmGetPdfStyleConfig().footerPx,
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

function __pmSetPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    __pmPdfStyleState = __pmNormalizePdfStyle(style);
    if (opts.applyToDom !== false) __pmApplyPdfStyleToLivePreview(opts);
}

function __pmNormalizeUserRole(value) {
    const safe = String(value || '').trim().toLowerCase();
    if (!safe) return '';
    if (safe === 'administrador' || safe === 'administrator' || safe === 'administrators' || safe === 'superadmin' || safe === 'super_admin' || safe === 'admins') return 'admin';
    return safe;
}

function __pmIsAdminProfile() {
    const access = __pmResolveOrderAccess();
    if (access.isAdmin === true) return true;
    if (Object.prototype.hasOwnProperty.call(access.perms || {}, 'pdf_layout_manage')) return access.perms.pdf_layout_manage === true;
    if (Object.prototype.hasOwnProperty.call(access.perms || {}, 'config_manage')) return access.perms.config_manage === true;
    return false;
}

function __pmResolvePdfActorName() {
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
    const resolved = candidates.map((value) => __pmSanitizeActorName(value)).find(Boolean);
    return resolved || 'Usuario';
}

function __pmCanUsePdfNotes() {
    return false;
}

async function __pmLoadCurrentUserProfile(user) {
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
            } catch (_) {}
        }
        return null;
    };
    let appUser = await lookupByField('app_users', 'id', idCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'email', emailCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'login_username', usernameCandidates);
    if (!appUser) appUser = await lookupByField('app_users', 'username', usernameCandidates);
    const merged = { ...(appUser || {}), ...fallback };
    const role = __pmNormalizeUserRole(
        appUser?.role
        || appUser?.rol
        || fallback?.role
        || fallback?.rol
        || fallback?.record?.role
        || fallback?.record?.rol
    );
    if (role) {
        merged.role = role;
    }
    if (!merged.username) merged.username = appUser?.login_username || appUser?.username || fallback?.login_username || fallback?.username || fallback?.email?.split('@')[0] || '';
    return merged;
}

function __pmOverlayDocumentType(profile) {
    const safeProfile = __pmNormalizePdfStyleProfileKey(profile);
    return __PM_PDF_OVERLAY_TYPES[safeProfile] || __PM_PDF_OVERLAY_TYPES.quote;
}

function __pmParseJsonObjectLike(value) {
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

function __pmResolvePdfOverlayConfigPayload(record = {}) {
    const rawRecord = record && typeof record === 'object' ? record : {};
    const configJson = __pmParseJsonObjectLike(rawRecord.config_json);
    if (configJson) return configJson;
    const elements = __pmParseJsonObjectLike(rawRecord.elements) || {};
    const elementConfig = __pmParseJsonObjectLike(elements.config_json);
    if (elementConfig) return elementConfig;
    if (elements.profiles && typeof elements.profiles === 'object') {
        return {
            tenant: rawRecord.tenant || elements.tenant || __PM_PDF_STYLE_TENANT,
            version: Math.max(2, parseInt(elements.version, 10) || 2),
            updated_at: elements.updated_at || window.__serverDateService.nowISO(),
            profiles: elements.profiles
        };
    }
    return {};
}

function __pmBuildPdfStyleConfigPayload(rawExisting, style, profile = __pmPdfStyleActiveProfile) {
    const existing = rawExisting && typeof rawExisting === 'object' ? rawExisting : {};
    const key = __pmNormalizePdfStyleProfileKey(profile);
    const profiles = existing.profiles && typeof existing.profiles === 'object' ? { ...existing.profiles } : {};
    profiles[key] = __pmNormalizePdfStyle(style);
    return {
        ...existing,
        tenant: __PM_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(existing.version, 10) || 2),
        updated_at: window.__serverDateService.nowISO(),
        profiles
    };
}

function __pmBuildPdfOverlayElementsPayload(configJson) {
    const resolved = __pmResolvePdfOverlayConfigPayload({ config_json: configJson });
    const objects = [];
    const profiles = resolved.profiles && typeof resolved.profiles === 'object' ? resolved.profiles : {};
    Object.entries(profiles).forEach(([profileKey, style]) => {
        const safeStyle = __pmNormalizePdfStyle(style);
        const safeResources = __pmNormalizePdfResources(safeStyle.resources);
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
                fontFamily: __PM_PDF_STYLE_FONT_MAP[resource.fontFamilyKey || safeStyle.fontFamilyKey] || __PM_PDF_STYLE_FONT_MAP.segoe,
                page: Number(resource.page || 1),
                enabled: resource.enabled !== false
            });
        });
    });
    return {
        tenant: resolved.tenant || __PM_PDF_STYLE_TENANT,
        version: Math.max(2, parseInt(resolved.version, 10) || 2),
        updated_at: resolved.updated_at || window.__serverDateService.nowISO(),
        profiles,
        config_json: resolved,
        objects
    };
}

function __pmPickLatestRecord(records) {
    const list = Array.isArray(records) ? records.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

async function __pmLoadModernPdfStyleRecord(profileKey) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return null;
    const overlayDocumentType = __pmOverlayDocumentType(profileKey);
    for (const pbClient of clients) {
        try {
            const { data, error } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
                .select('id,config_json,elements,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            const row = __pmPickLatestRecord(Array.isArray(data) ? data : (data ? [data] : []));
            if (!error && row) {
                return {
                    source: 'pdf_overlays',
                    id: String(row.id || ''),
                    config: __pmResolvePdfOverlayConfigPayload(row),
                    raw: row.config_json || row.elements || {}
                };
            }
        } catch (_) {}
    }
    return null;
}

async function __pmUpsertModernPdfStyleRecord(profileKey, configJson) {
    const clients = [];
    if (window.tenantPocketBase) clients.push(window.tenantPocketBase);
    if (window.globalPocketBase && window.globalPocketBase !== window.tenantPocketBase) clients.push(window.globalPocketBase);
    if (!clients.length) return { id: '', config: configJson || {} };
    const overlayDocumentType = __pmOverlayDocumentType(profileKey);
    const safeConfig = __pmResolvePdfOverlayConfigPayload({ config_json: configJson || {} });
    const payload = {
        tenant: __PM_PDF_STYLE_TENANT,
        document_type: overlayDocumentType,
        config_json: safeConfig,
        elements: __pmBuildPdfOverlayElementsPayload(safeConfig)
    };
    let lastError = null;
    for (const pbClient of clients) {
        try {
            const { data: existing, error: lookupError } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
                .select('id,updated,created,updated_at,created_at')
                .eq('tenant', __PM_PDF_STYLE_TENANT)
                .eq('document_type', overlayDocumentType);
            if (lookupError) throw lookupError;
            const existingRow = __pmPickLatestRecord(Array.isArray(existing) ? existing : (existing ? [existing] : []));
            if (existingRow?.id) {
                const { error: updError } = await pbClient
                    .from(__PM_PDF_OVERLAYS_COLLECTION)
                    .update(payload)
                    .eq('tenant', __PM_PDF_STYLE_TENANT)
                    .eq('document_type', overlayDocumentType);
                if (updError) throw updError;
                return { id: String(existingRow.id), config: payload.config_json };
            }
            const { data: inserted, error: insError } = await pbClient
                .from(__PM_PDF_OVERLAYS_COLLECTION)
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

async function __pmLoadSharedPdfStyleConfig(profile = 'quote') {
    const profileKey = __pmNormalizePdfStyleProfileKey(profile);
    try {
        const record = await __pmLoadModernPdfStyleRecord(profileKey);
        __pmPdfStyleActiveProfile = profileKey;
        __pmPdfStyleConfigRecordId = record?.id || '';
        __pmPdfStyleConfigStore = record?.source || '';
        __pmPdfStyleRawPayload = record?.raw || {};
        const resolved = record?.config ? __pmExtractPdfStyleProfile(record.config, profileKey) : __PM_PDF_STYLE_DEFAULTS;
        __pmSetPdfStyleConfig(resolved || __PM_PDF_STYLE_DEFAULTS, { applyToDom: false });
        __pmWritePdfStyleControls(__pmGetPdfStyleConfig());
        if (__pmIsAdminProfile()) __pmRenderPdfResourcesEditorList();
    } catch (e) {
        console.warn('No se pudo cargar la configuracion PDF compartida (PM):', e);
    }
}

async function __pmEnsurePdfStyleProfile(docType, options = {}) {
    const wanted = __pmNormalizePdfStyleProfileKey(docType === 'order' ? 'order' : 'quote');
    const forceReload = !!(options && options.forceReload);
    if (!forceReload && __pmPdfStyleActiveProfile === wanted && __pmPdfStyleState) return;
    await __pmLoadSharedPdfStyleConfig(wanted);
}

async function __pmPersistSharedPdfStyleConfig(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__pmIsAdminProfile() && opts.force !== true) return;
    const normalized = __pmNormalizePdfStyle(style);
    try {
        const configJson = __pmBuildPdfStyleConfigPayload(__pmPdfStyleRawPayload || {}, normalized, __pmPdfStyleActiveProfile);
        const saved = await __pmUpsertModernPdfStyleRecord(__pmPdfStyleActiveProfile, configJson);
        __pmPdfStyleConfigRecordId = saved.id;
        __pmPdfStyleConfigStore = 'pdf_overlays';
        __pmPdfStyleRawPayload = saved.config;
    } catch (e) {
        console.warn('No se pudo guardar la configuracion PDF compartida (PM):', e);
    }
}

function __pmScheduleSharedPdfStyleSync(style, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!__pmIsAdminProfile() && opts.force !== true) return;
    if (__pmPdfStyleSyncTimer) clearTimeout(__pmPdfStyleSyncTimer);
    __pmPdfStyleSyncTimer = setTimeout(() => {
        __pmPersistSharedPdfStyleConfig(style || __pmPdfStyleState, opts);
    }, 450);
}

function __pmHandlePdfStyleControlChange() {
    if (!__pmIsAdminProfile()) return;
    const next = __pmReadPdfStyleControls();
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmSyncPdfStyleValueLabels(next);
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmRefreshPreviewFromStyleState(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    if (!currentPreviewOrder) return;
    const pdfContainer = document.getElementById('pdf-content');
    if (!pdfContainer || pdfContainer.classList.contains('hidden')) return;
    const docType = currentPreviewOrder.docType || 'quote';
    pdfContainer.innerHTML = window.getOrderHTML(currentPreviewOrder, docType);
    __pmApplyPdfStyleToLivePreview(opts);
}

function __pmCommitPdfResources(resources, options = {}) {
    const cfg = __pmGetPdfStyleConfig();
    const next = __pmNormalizePdfStyle({ ...cfg, resources: __pmNormalizePdfResources(resources) });
    // Permite actualizar preview sin reconstruir paneles de edicion (evita blur al escribir).
    const skipEditorUiRefresh = options && options.skipEditorUiRefresh === true;
    __pmSetPdfStyleConfig(next, { applyToDom: true, skipEditorUiRefresh });
    __pmScheduleSharedPdfStyleSync(next, { force: options.forcePersist === true });
    if (options.refreshPreview !== false) __pmRefreshPreviewFromStyleState({ skipEditorUiRefresh });
    if (!skipEditorUiRefresh) {
        __pmRenderPdfResourcesEditorList();
        __pmRenderPdfInspector();
    }
}

function __pmGetPdfResourcesFromState() {
    return __pmNormalizePdfResources(__pmGetPdfStyleConfig().resources);
}

function __pmGetPdfBasePageCount(docType = currentPreviewOrder?.docType || 'quote') {
    return String(docType || 'quote').toLowerCase() === 'order' ? 1 : 2;
}

function __pmResolvePdfNotePlacement(style, docType = currentPreviewOrder?.docType || 'quote') {
    const cfg = __pmNormalizePdfStyle(style || __pmGetPdfStyleConfig());
    const basePages = __pmGetPdfBasePageCount(docType);
    let extraPages = Math.max(0, __pmClampStyleNumber(cfg.extraPages, 0, 6, 0));
    if (extraPages === 0) extraPages = 1;
    let page = basePages + extraPages;
    const resources = __pmNormalizePdfResources(cfg.resources);
    const noteResources = resources
        .filter((resource) => resource.isUserNote === true && Number(resource.page || 1) === page)
        .sort((a, b) => (a.y + a.h) - (b.y + b.h));
    let y = noteResources.length ? (noteResources[noteResources.length - 1].y + noteResources[noteResources.length - 1].h + 22) : 140;
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
    if (y > pageBaseHeight - 220 && extraPages < 6) {
        extraPages += 1;
        page = basePages + extraPages;
        y = 140;
    }
    return { page, extraPages, y };
}

function __pmBuildPdfNoteResource(noteText, authorName, style) {
    const placement = __pmResolvePdfNotePlacement(style);
    return {
        id: `pmnote_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
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

function __pmOpenPdfNoteModal() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
}

window.submitPdfNoteFromModal = async function() {
    window.showToast('El sistema de notas está deshabilitado.', 'info');
};

function __pmRenderFontFamilyOptions(selectedKey) {
    const selected = String(selectedKey || __PM_PDF_STYLE_DEFAULTS.fontFamilyKey).toLowerCase();
    return Object.entries(__PM_PDF_STYLE_FONT_LABELS)
        .map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`)
        .join('');
}

function __pmRenderBaseTextBlocksEditorList(cfg) {
    return __PM_PDF_BASE_TEXT_BLOCKS.map((block) => {
        const selectedClass = block.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-700';
        const canEdit = __pmCanEditPdfBaseBlock(block.key);
        const disabledAttr = canEdit ? '' : 'disabled';
        const disabledClass = canEdit ? '' : ' opacity-60 cursor-not-allowed';
        const sizeCfg = block.sizeField ? (__PM_PDF_BASE_SIZE_LIMITS[block.sizeField] || { min: 8, max: 72 }) : null;
        const sizeValue = block.sizeField ? Number(cfg[block.sizeField] || __PM_PDF_STYLE_DEFAULTS[block.sizeField] || 12) : null;
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
                            ${__pmRenderFontFamilyOptions(cfg.fontFamilyKey)}
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

function __pmCommitBaseTextBlockField(field, rawValue) {
    const cfg = __pmGetPdfStyleConfig();
    const nextRaw = { ...cfg };
    if (field === 'fontFamilyKey') {
        const fontKey = String(rawValue || '').toLowerCase();
        if (!__PM_PDF_STYLE_FONT_MAP[fontKey]) return;
        nextRaw.fontFamilyKey = fontKey;
    } else if (field && field.endsWith('Align')) {
        nextRaw[field] = __pmNormalizeStyleAlign(rawValue, cfg[field] || 'left');
    } else if (Object.prototype.hasOwnProperty.call(__PM_PDF_BASE_SIZE_LIMITS, field)) {
        const limits = __PM_PDF_BASE_SIZE_LIMITS[field];
        nextRaw[field] = __pmClampStyleNumber(rawValue, limits.min, limits.max, cfg[field]);
        if (field === 'tableBodyPx') {
            nextRaw.tableHeadPx = __pmClampStyleNumber((parseInt(nextRaw.tableBodyPx, 10) || cfg.tableBodyPx) + 2, 9, 18, cfg.tableHeadPx);
        }
    } else {
        return;
    }
    const next = __pmNormalizePdfStyle(nextRaw);
    __pmSetPdfStyleConfig(next, { applyToDom: true });
    __pmWritePdfStyleControls(next);
    __pmScheduleSharedPdfStyleSync(next);
}

function __pmHighlightSelectedBaseTextBlock() {
    document.querySelectorAll('#pdf-content [data-base-resource].pm-pdf-base-selected').forEach((node) => node.classList.remove('pm-pdf-base-selected'));
    document.querySelectorAll('#pdf-content .pm-pdf-resource.pm-pdf-edit-selected').forEach((node) => node.classList.remove('pm-pdf-edit-selected'));
    if (!__pmIsAdminProfile()) return;
    const selected = String(__pmPdfResourceEditorSelectedId || '');
    if (selected.startsWith('base:')) {
        const baseId = selected.slice(5).trim();
        const key = baseId.split('__')[0].trim();
        if (!key) return;
        const withInstance = document.querySelector(`#pdf-content [data-base-resource="${key}"][data-base-instance="${baseId}"]`);
        if (withInstance) {
            withInstance.classList.add('pm-pdf-base-selected');
            return;
        }
        document.querySelectorAll(`#pdf-content [data-base-resource="${key}"]`).forEach((node) => node.classList.add('pm-pdf-base-selected'));
        return;
    }
    if (!selected) return;
    document.querySelectorAll(`#pdf-content .pm-pdf-resource[data-res-id="${selected}"]`).forEach((node) => node.classList.add('pm-pdf-edit-selected'));
}

function __pmAddPdfResource(type) {
    const resources = __pmGetPdfResourcesFromState();
    const normalizedType = String(type || '').toLowerCase() === 'sign-line' ? 'sign' : String(type || '').toLowerCase();
    const safeType = ['bar', 'logo', 'title', 'text', 'sign', 'sign-block'].includes(normalizedType) ? normalizedType : 'text';
    const isSign = safeType === 'sign' || safeType === 'sign-block';
    const newId = `pmres_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
        bgColor: safeType === 'logo' ? 'transparent' : (isSign ? '#111827' : (safeType === 'bar' ? '#d32f2f' : 'transparent')),
        angle: 0,
        signTitle: safeType === 'sign-block' ? 'QUIEN APRUEBA' : '',
        signRole: safeType === 'sign-block' ? 'SUBTITULO' : '',
        isUserNote: false,
        noteAuthor: ''
    });
    __pmPdfResourceEditorSelectedId = newId;
    __pmCommitPdfResources(resources);
    return newId;
}

function __pmIsPdfClipboardEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
    return !!target.closest('.tox, .CodeMirror, .monaco-editor');
}

function __pmBuildPdfClipboardResourceClone(resource, offsetStep = 24) {
    const base = resource && typeof resource === 'object' ? { ...resource } : null;
    if (!base) return null;
    const nextId = `pmres_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return __pmNormalizePdfResources([{
        ...base,
        id: nextId,
        x: __pmClampStyleNumber((parseInt(base.x, 10) || 0) + offsetStep, -4000, 4000, 80),
        y: __pmClampStyleNumber((parseInt(base.y, 10) || 0) + offsetStep, -5000, 5000, 120)
    }])[0] || null;
}

function __pmCopySelectedPdfResourceToClipboard() {
    const selectedId = String(__pmPdfResourceEditorSelectedId || '').trim();
    if (!selectedId || selectedId.startsWith('base:')) return false;
    const selected = __pmGetPdfResourcesFromState().find((resource) => resource.id === selectedId);
    if (!selected) return false;
    const safeCopy = __pmNormalizePdfResources([{ ...selected }])[0];
    if (!safeCopy) return false;
    __pmPdfResourceClipboard = safeCopy;
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'pm-orders',
            at: Date.now(),
            resource: { ...safeCopy }
        };
    } catch (_) {}
    return true;
}

function __pmPastePdfResourceFromClipboard() {
    const sharedClipboard = window.__HUB_PDF_RESOURCE_CLIPBOARD?.resource;
    const source = __pmPdfResourceClipboard || (sharedClipboard && typeof sharedClipboard === 'object' ? { ...sharedClipboard } : null);
    if (!source) return '';
    const clone = __pmBuildPdfClipboardResourceClone(source);
    if (!clone) return '';
    const resources = __pmGetPdfResourcesFromState();
    resources.push(clone);
    __pmPdfResourceEditorSelectedId = clone.id;
    __pmCommitPdfResources(resources);
    __pmPdfResourceClipboard = { ...clone };
    try {
        window.__HUB_PDF_RESOURCE_CLIPBOARD = {
            source: 'pm-orders',
            at: Date.now(),
            resource: { ...clone }
        };
    } catch (_) {}
    return clone.id;
}

function __pmBindPdfResourceClipboard() {
    if (document.body.dataset.pmPdfClipboardBound === '1') return;
    document.body.dataset.pmPdfClipboardBound = '1';
    document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented) return;
        if (!__pmIsAdminProfile() || __pmPdfEditLocked) return;
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        if (__pmIsPdfClipboardEditableTarget(event.target)) return;
        const preview = document.getElementById('pdf-content');
        if (!preview || preview.classList.contains('hidden')) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'c') {
            if (!__pmCopySelectedPdfResourceToClipboard()) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF copiado', 'success'); } catch (_) {}
            return;
        }
        if (key === 'v') {
            const pastedId = __pmPastePdfResourceFromClipboard();
            if (!pastedId) return;
            event.preventDefault();
            try { window.showToast?.('Elemento PDF duplicado', 'success'); } catch (_) {}
        }
    }, true);
}

function __pmRenderPdfResourcesEditorList() {
    const list = document.getElementById('pdf-style-resources-list');
    if (!list || !__pmIsAdminProfile()) return;
    const cfg = __pmGetPdfStyleConfig();
    const resources = __pmGetPdfResourcesFromState();
    const baseBlocksHtml = __pmRenderBaseTextBlocksEditorList(cfg);
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
        const selectedClass = resource.id === __pmPdfResourceEditorSelectedId ? 'border-brand-red' : 'border-gray-600';
        const isTextLike = resource.type === 'title' || resource.type === 'text';
        const isSignBlock = resource.type === 'sign-block';
        const showTextColor = isTextLike || isSignBlock ? '' : 'hidden';
        const showBgColor = resource.type === 'logo' ? 'hidden' : '';
        return `
            <div class="border ${selectedClass} rounded-md p-2 bg-gray-950/50 space-y-1" data-res-row="${__pmSafeHtml(resource.id)}">
                <div class="flex items-center justify-between gap-1">
                    <button type="button" data-res-action="select" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-gray-200">${typeLabel(resource.type)} · P${resource.page}</button>
                    <button type="button" data-res-action="remove" data-res-id="${__pmSafeHtml(resource.id)}" class="text-[10px] font-bold uppercase text-red-300">Eliminar</button>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400 block">Texto
                    <textarea data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="text" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-white">${__pmSafeHtml(resource.text)}</textarea>
                </label>` : ''}
                ${isSignBlock ? `<div class="grid grid-cols-1 gap-1">
                    <label class="text-[9px] text-gray-400">Titulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="signTitle" type="text" value="${__pmSafeHtml(resource.signTitle)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                    <label class="text-[9px] text-gray-400">Subtitulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="signRole" type="text" value="${__pmSafeHtml(resource.signRole)}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white">
                    </label>
                </div>` : ''}
                <div class="grid grid-cols-3 gap-1">
                    <label class="text-[9px] text-gray-400">Página
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="page" type="number" min="1" max="8" value="${resource.page}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">X
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="x" type="number" value="${resource.x}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Y
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="y" type="number" value="${resource.y}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Ancho
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="w" type="number" min="16" value="${resource.w}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Alto
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="h" type="number" min="10" value="${resource.h}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400 ${isTextLike || isSignBlock ? '' : 'hidden'}">Fuente
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="fontSize" type="number" min="8" max="72" value="${resource.fontSize}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                    <label class="text-[9px] text-gray-400">Angulo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="angle" type="number" min="-360" max="360" value="${resource.angle || 0}" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                    </label>
                </div>
                <div class="grid grid-cols-2 gap-1">
                    <label class="text-[9px] text-gray-400 ${showTextColor}">Color Texto
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="color" type="color" value="${resource.color}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                    <label class="text-[9px] text-gray-400 ${showBgColor}">Color Fondo
                        <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="bgColor" type="color" value="${resource.bgColor}" class="w-full h-6 bg-gray-900 border border-gray-700 rounded">
                    </label>
                </div>
                ${isTextLike ? `<label class="text-[9px] text-gray-400">Alineacion
                    <select data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="align" class="w-full bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[10px]">
                        <option value="left" ${resource.align === 'left' ? 'selected' : ''}>Izquierda</option>
                        <option value="center" ${resource.align === 'center' ? 'selected' : ''}>Centro</option>
                        <option value="right" ${resource.align === 'right' ? 'selected' : ''}>Derecha</option>
                        <option value="justify" ${resource.align === 'justify' ? 'selected' : ''}>Justificado</option>
                    </select>
                </label>` : ''}
                <label class="text-[9px] text-gray-400 mt-1 flex items-center gap-1 cursor-pointer">
                    <input data-res-id="${__pmSafeHtml(resource.id)}" data-res-field="enabled" type="checkbox" ${resource.enabled ? 'checked' : ''} class="w-3 h-3 text-brand-red bg-gray-900 border-gray-700 rounded focus:ring-brand-red">
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
    __pmHighlightSelectedBaseTextBlock();
}

function __pmHandleResourceListEvent(event) {
    const trigger = event.target.closest('[data-res-action], [data-res-field], [data-base-action], [data-base-field]');
    if (!trigger) return;
    const baseId = String(trigger.dataset.baseId || '');
    const baseAction = String(trigger.dataset.baseAction || '');
    const baseField = String(trigger.dataset.baseField || '');
    if (baseAction === 'select' && baseId.startsWith('base:')) {
        __pmPdfResourceEditorSelectedId = baseId;
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }
    if (baseField && baseId.startsWith('base:')) {
        const baseKey = baseId.slice(5).split('__')[0].trim();
        if (!__pmCanEditPdfBaseBlock(baseKey)) {
            __pmPdfResourceEditorSelectedId = baseId;
            __pmHighlightSelectedBaseTextBlock();
            return;
        }
        __pmPdfResourceEditorSelectedId = baseId;
        __pmCommitBaseTextBlockField(baseField, trigger.value);
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        return;
    }

    const resources = __pmGetPdfResourcesFromState();
    const id = trigger.dataset.resId || '';
    const idx = resources.findIndex((resource) => resource.id === id);
    if (idx < 0) return;

    if (trigger.dataset.resAction === 'remove') {
        resources.splice(idx, 1);
        if (__pmPdfResourceEditorSelectedId === id) __pmPdfResourceEditorSelectedId = '';
        __pmCommitPdfResources(resources);
        return;
    }
    if (trigger.dataset.resAction === 'select') {
        __pmPdfResourceEditorSelectedId = id;
        __pmRenderPdfResourcesEditorList();
        return;
    }

    const field = trigger.dataset.resField;
    if (!field) return;
    const selected = resources[idx];
    const canMove = __pmCanMovePdfResource(selected);
    const canEdit = __pmCanEditPdfResource(selected);
    if (['page', 'x', 'y', 'w', 'h', 'angle', 'enabled'].includes(field) && !canMove) return;
    if (['text', 'signTitle', 'signRole', 'fontSize', 'align', 'bold', 'italic', 'underline', 'color', 'bgColor'].includes(field) && !canEdit) return;
    let nextValue = trigger.type === 'checkbox' ? !!trigger.checked : trigger.value;
    if (['page', 'x', 'y', 'w', 'h', 'fontSize', 'angle'].includes(field)) nextValue = parseInt(nextValue, 10);
    if (field === 'color' || field === 'bgColor') nextValue = __pmNormalizeHexColor(nextValue, resources[idx][field]);
    resources[idx] = { ...resources[idx], [field]: nextValue };
    __pmPdfResourceEditorSelectedId = id;
    const isContinuousInput = event.type === 'input'
        && (
            trigger instanceof HTMLTextAreaElement
            || (trigger instanceof HTMLInputElement
                && !['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit', 'reset'].includes(String(trigger.type || '').toLowerCase()))
        );
    __pmCommitPdfResources(resources, {
        refreshPreview: true,
        skipEditorUiRefresh: isContinuousInput
    });
}

function __pmBindPdfResourceEditor() {
    if (!__pmIsAdminProfile()) return;
    const list = document.getElementById('pdf-style-resources-list');
    if (list && list.dataset.bound !== '1') {
        list.addEventListener('input', __pmHandleResourceListEvent);
        list.addEventListener('change', __pmHandleResourceListEvent);
        list.addEventListener('click', __pmHandleResourceListEvent);
        list.dataset.bound = '1';
    }
    if (document.body.dataset.pmPdfResourceButtonsBound !== '1') {
        document.body.dataset.pmPdfResourceButtonsBound = '1';
        document.getElementById('pdf-style-add-bar')?.addEventListener('click', () => { __pmAddPdfResource('bar'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-logo')?.addEventListener('click', () => { __pmAddPdfResource('logo'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-title')?.addEventListener('click', () => { __pmAddPdfResource('title'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-text')?.addEventListener('click', () => { __pmAddPdfResource('text'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-line')?.addEventListener('click', () => { __pmAddPdfResource('sign'); window.closeModal('pdf-resource-modal'); });
        document.getElementById('pdf-style-add-sign-block')?.addEventListener('click', () => { __pmAddPdfResource('sign-block'); window.closeModal('pdf-resource-modal'); });
    }
    __pmRenderPdfResourcesEditorList();
}

function __pmApplyPdfResourceGeometryToNode(node, resource) {
    if (!(node instanceof HTMLElement) || !resource) return;
    node.style.left = `${Math.round(parseFloat(resource.x) || 0)}px`;
    node.style.top = `${Math.round(parseFloat(resource.y) || 0)}px`;
    node.style.width = `${Math.max(16, Math.round(parseFloat(resource.w) || 0))}px`;
    node.style.height = `${Math.max(1, Math.round(parseFloat(resource.h) || 0))}px`;
}

function __pmGetPdfResourceMinHeight(type) {
    const safeType = String(type || '').trim().toLowerCase();
    if (safeType === 'sign') return 1;
    if (safeType === 'logo') return 24;
    if (safeType === 'sign-block') return 42;
    if (safeType === 'bar') return 4;
    return 10;
}

function __pmGetPdfPointerScale(node) {
    const ref = node?.parentElement || node;
    if (!ref || !(ref instanceof HTMLElement)) return { x: 1, y: 1 };
    const rect = ref.getBoundingClientRect();
    const rawWidth = ref.offsetWidth || parseFloat(ref.style.width || '0') || rect.width || 1;
    const rawHeight = ref.offsetHeight || parseFloat(ref.style.height || '0') || rect.height || 1;
    const scaleX = rect.width > 0 && rawWidth > 0 ? (rect.width / rawWidth) : 1;
    const scaleY = rect.height > 0 && rawHeight > 0 ? (rect.height / rawHeight) : 1;
    return { x: scaleX > 0 ? scaleX : 1, y: scaleY > 0 ? scaleY : 1 };
}

function __pmResolvePdfResizeHit(node, event) {
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

function __pmResizePdfResourceGeometry(origin, dx, dy, resize, type) {
    const base = origin && typeof origin === 'object' ? origin : {};
    const minWidth = 16;
    const minHeight = __pmGetPdfResourceMinHeight(type || base.type);
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

function __pmBuildConvenioGridStyle(publicityCount, tradeCount) {
    const publicityWeight = Math.min(3.2, Math.max(1.4, 1.25 + (Math.max(1, publicityCount) * 0.26)));
    const tradeWeight = Math.min(2.2, Math.max(0.95, 0.95 + (Math.max(1, tradeCount) * 0.18)));
    return `display:grid;grid-template-columns:minmax(0,${publicityWeight.toFixed(2)}fr) minmax(220px,${tradeWeight.toFixed(2)}fr);gap:1rem;align-items:start;`;
}

function __pmBindPdfResourceDrag() {
    if (document.body.dataset.pmPdfResourceDragBound === '1') return;
    document.body.dataset.pmPdfResourceDragBound = '1';
    const releasePointer = (state) => {
        const captureNode = state?.captureNode;
        if (!captureNode || typeof captureNode.releasePointerCapture !== 'function') return;
        try { captureNode.releasePointerCapture(state.pointerId); } catch (_) {}
    };
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (!__pmIsAdminProfile() || __pmPdfEditLocked) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('#pm-pdf-inspector')) return;
        const resourceNode = target.closest('#pdf-content .pm-pdf-resource[data-res-id]');
        if (resourceNode) {
            if (target.closest('.pm-pdf-delete-btn')) return;
            const resourceId = String(resourceNode.getAttribute('data-res-id') || '');
            const page = parseInt(resourceNode.getAttribute('data-res-page') || '1', 10);
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === resourceId);
            if (idx < 0) return;
            if (!__pmCanMovePdfResource(resources[idx])) return;
            const resize = __pmResolvePdfResizeHit(resourceNode, event);
            const scale = __pmGetPdfPointerScale(resourceNode);
            const mode = resize.resize ? 'resize' : 'move';
            __pmPdfResourceEditorSelectedId = resourceId;
            __pmPdfResourcePointerState = {
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
            __pmRenderPdfResourcesEditorList();
            document.body.style.userSelect = 'none';
            document.body.style.cursor = resize.cursor || (mode === 'resize' ? 'nwse-resize' : 'move');
            event.preventDefault();
            return;
        }
        const baseNode = target.closest('#pdf-content [data-base-resource]');
        if (!baseNode) return;
        const baseKey = String(baseNode.getAttribute('data-base-resource') || '').trim();
        if (!baseKey || !__pmGetPdfBaseBlockMeta(baseKey)) return;
        if (!__pmCanMovePdfBaseBlock(baseKey)) return;
        const resize = __pmResolvePdfResizeHit(baseNode, event);
        const scale = __pmGetPdfPointerScale(baseNode);
        const instanceKey = String(baseNode.dataset.baseInstance || baseKey).trim();
        const cfg = __pmGetPdfStyleConfig();
        const layouts = __pmNormalizePdfBaseLayouts(cfg.baseLayouts);
        const origin = layouts[instanceKey] || layouts[baseKey] || __pmNormalizePdfBaseLayout();
        __pmPdfResourceEditorSelectedId = `base:${baseKey}`;
        __pmPdfResourcePointerState = {
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
        __pmRenderPdfResourcesEditorList();
        __pmHighlightSelectedBaseTextBlock();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = resize.resize ? (resize.cursor || 'nwse-resize') : 'move';
        event.preventDefault();
    });
    document.addEventListener('pointermove', (event) => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        if (state.pointerId !== undefined && event.pointerId !== state.pointerId) return;
        const dx = (event.clientX - state.startX) / (state.scaleX || 1);
        const dy = (event.clientY - state.startY) / (state.scaleY || 1);
        if (state.kind === 'resource') {
            const node = document.querySelector(`#pdf-content .pm-pdf-resource[data-res-id="${state.id}"][data-res-page="${state.page}"]`);
            if (!node) return;
            if (state.mode === 'resize') {
                const next = __pmResizePdfResourceGeometry(state.origin, dx, dy, state.resize, state.origin?.type);
                state.current = next;
                __pmApplyPdfResourceGeometryToNode(node, next);
                __pmAutoFitPdfTextNode(node);
            } else {
                const next = {
                    ...state.origin,
                    x: Math.round((parseFloat(state.origin?.x) || 0) + dx),
                    y: Math.round((parseFloat(state.origin?.y) || 0) + dy)
                };
                state.current = next;
                __pmApplyPdfResourceGeometryToNode(node, next);
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
            const next = __pmNormalizePdfBaseLayout({ ...state.origin, scalePct: state.origin.scalePct + delta });
            state.current = next;
            node.style.transform = __pmBuildPdfBaseTransform(next);
        } else {
            const next = __pmNormalizePdfBaseLayout({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
            state.current = next;
            node.style.transform = __pmBuildPdfBaseTransform(next);
        }
        event.preventDefault();
    });
    const endDrag = () => {
        if (!__pmPdfResourcePointerState) return;
        const state = __pmPdfResourcePointerState;
        if (state.kind === 'resource') {
            const resources = __pmGetPdfResourcesFromState();
            const idx = resources.findIndex((resource) => resource.id === state.id);
            if (idx >= 0) {
                const current = state.current || state.origin;
                resources[idx] = {
                    ...resources[idx],
                    x: __pmClampStyleNumber(current.x, -4000, 4000, resources[idx].x),
                    y: __pmClampStyleNumber(current.y, -5000, 5000, resources[idx].y),
                    w: __pmClampStyleNumber(current.w, 16, 4000, resources[idx].w),
                    h: __pmClampStyleNumber(current.h, 1, 5000, resources[idx].h)
                };
                __pmCommitPdfResources(resources, { refreshPreview: false });
            }
        } else if (state.kind === 'base') {
            __pmCommitPdfBaseLayout(state.instanceKey, state.current || state.origin);
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        releasePointer(state);
        __pmPdfResourcePointerState = null;
    };
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
}

function __pmApplyPdfStyleEditorUiState() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap) return;
    editorWrap.classList.add('hidden');
}

function __pmTogglePdfStylePanel() {
    __pmPdfStyleUiState = { ...__pmPdfStyleUiState, collapsed: !__pmPdfStyleUiState.collapsed };
    __pmSavePdfStyleUiState();
    __pmApplyPdfStyleEditorUiState();
}

function __pmTogglePdfStylePin() {
    __pmPdfStyleUiState = { ...__pmPdfStyleUiState, pinned: !__pmPdfStyleUiState.pinned };
    __pmSavePdfStyleUiState();
    __pmApplyPdfStyleEditorUiState();
}

function __pmInitPdfStyleEditor() {
    const editorWrap = document.getElementById('pdf-style-editor');
    if (!editorWrap || !document.getElementById('pdf-style-font-family')) return;
    if (!__pmPdfStyleState) __pmPdfStyleState = __pmLoadPdfStyleState();
    __pmPdfStyleUiState = __pmLoadPdfStyleUiState();
    __pmWritePdfStyleControls(__pmGetPdfStyleConfig());
    __pmApplyPdfStyleEditorUiState();
    __pmBindPdfResourceEditor();
    __pmBindPdfResourceDrag();
    __pmBindPdfResourceClipboard();
    __pmEnsurePdfEditingChrome();
    editorWrap.classList.add('hidden');
}

window.resetPdfStyleEditor = function() {
    if (!__pmIsAdminProfile()) return;
    const reset = __pmNormalizePdfStyle(__PM_PDF_STYLE_DEFAULTS);
    __pmSetPdfStyleConfig(reset, { applyToDom: true });
    __pmWritePdfStyleControls(reset);
    __pmScheduleSharedPdfStyleSync(reset);
};

window.getOrderHTML = function(o, type) { 
    const isOrder = type === 'order'; 
    const logoImg = ''; 
    const pdfStyle = __pmGetPdfStyleConfig();
    const pdfContent = __pmNormalizePdfContent(pdfStyle.content);
    const pdfStyleInlineVars = __pmPdfStyleVarsInline(pdfStyle);
    const pdfStyleTag = `<style>.pm-pdf-root{font-family:var(--pm-font-family)!important;}.pm-pdf-root .pm-pdf-shift{transform:translate(var(--pm-offset-x),var(--pm-offset-y));position:relative;}.pm-pdf-root .pm-pdf-header{border-bottom-width:var(--pm-header-line)!important;justify-content:var(--pm-header-justify)!important;}.pm-pdf-root .pm-pdf-header>div:last-child{text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-title{font-size:var(--pm-title-size)!important;line-height:1.05!important;text-align:var(--pm-header-align)!important;}.pm-pdf-root .pm-pdf-folio{font-size:var(--pm-meta-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-date{font-size:var(--pm-date-size)!important;text-align:var(--pm-meta-align)!important;}.pm-pdf-root .pm-pdf-table-head th{font-size:var(--pm-table-head-size)!important;}.pm-pdf-root .pm-pdf-table-body td,.pm-pdf-root .pm-pdf-table-body p,.pm-pdf-root .pm-pdf-table-body span{font-size:var(--pm-table-body-size)!important;line-height:var(--pm-line-height)!important;}.pm-pdf-root .pm-pdf-table-body td:first-child,.pm-pdf-root .pm-pdf-table-body td:first-child *{text-align:var(--pm-table-align)!important;}.pm-pdf-root .pm-pdf-summary,.pm-pdf-root .pm-pdf-summary *{text-align:var(--pm-summary-align)!important;}.pm-pdf-root .pm-pdf-quick,.pm-pdf-root .pm-pdf-quick *{font-size:var(--pm-quick-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-quick-align)!important;}.pm-pdf-root .pm-pdf-general-conditions,.pm-pdf-root .pm-pdf-general-conditions *{font-size:var(--pm-conditions-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-conditions-align)!important;}.pm-pdf-root .pm-pdf-sign,.pm-pdf-root .pm-pdf-sign *{font-size:var(--pm-sign-size)!important;line-height:var(--pm-line-height)!important;text-align:var(--pm-sign-align)!important;}.pm-pdf-root .pm-pdf-footer-text{font-size:var(--pm-footer-size)!important;text-align:var(--pm-footer-align)!important;}.pm-pdf-root .pm-pdf-amount,.pm-pdf-root .pm-pdf-table-body td:last-child,.pm-pdf-root .pm-pdf-summary td:last-child{white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;font-variant-numeric:tabular-nums;}.pm-pdf-root .pm-pdf-summary-table-wrap{width:20rem;max-width:100%;margin-left:auto;}.pm-pdf-root [data-base-resource]{position:relative;transform-origin:top left;}.pm-pdf-root .pm-pdf-resource,.pm-pdf-root .pm-pdf-editable{cursor:default;box-sizing:border-box;outline:none;outline-offset:2px;}.pm-pdf-root .pm-pdf-resource::before,.pm-pdf-root .pm-pdf-editable::before{content:'';position:absolute;inset:-1px;border:1px dashed rgba(239,68,68,.28);border-radius:inherit;background:radial-gradient(circle at top left,#ef4444 0 3px,transparent 3.2px),radial-gradient(circle at top right,#ef4444 0 3px,transparent 3.2px),radial-gradient(circle at bottom left,#ef4444 0 3px,transparent 3.2px),radial-gradient(circle at bottom right,#ef4444 0 3px,transparent 3.2px);background-size:12px 12px;background-repeat:no-repeat;opacity:0;pointer-events:none;}.pm-pdf-root .pm-pdf-resource::after,.pm-pdf-root .pm-pdf-editable::after{content:'';position:absolute;right:-7px;bottom:-7px;width:12px;height:12px;border-radius:999px;background:#ef4444;box-shadow:0 0 0 2px #fff;opacity:0;pointer-events:none;}.pm-pdf-root .pm-pdf-base-selected,.pm-pdf-root .pm-pdf-edit-selected{outline:none;outline-offset:2px;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable{cursor:move;outline:1px dashed rgba(239,68,68,.45);}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource::before,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-resource::after,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::before,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-editable::after{opacity:.94;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-base-selected,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected{outline:2px solid #ef4444;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected::before,.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected::after{opacity:1;}.pm-pdf-delete-btn{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;font-size:11px;z-index:80;box-shadow:0 0 0 2px #fff;pointer-events:auto;}.pm-pdf-root.pm-pdf-admin-enabled .pm-pdf-edit-selected .pm-pdf-delete-btn{display:flex;}.pm-pdf-delete-btn:hover{background:#dc2626;transform:scale(1.08);transition:all .2s;}</style>`;
    const pdfTableFitTag = `<style>.pm-pdf-root .pm-pdf-table-head th{font-size:var(--pm-fit-head-size,var(--pm-table-head-size))!important;padding-top:var(--pm-fit-cell-py,.5rem)!important;padding-bottom:var(--pm-fit-cell-py,.5rem)!important;padding-left:var(--pm-fit-cell-px,.75rem)!important;padding-right:var(--pm-fit-cell-px,.75rem)!important;}.pm-pdf-root .pm-pdf-table-body td,.pm-pdf-root .pm-pdf-table-body p,.pm-pdf-root .pm-pdf-table-body span{font-size:var(--pm-fit-body-size,var(--pm-table-body-size))!important;line-height:var(--pm-fit-line-height,var(--pm-line-height))!important;}.pm-pdf-root .pm-pdf-table-body td{padding-top:var(--pm-fit-cell-py,.5rem)!important;padding-bottom:var(--pm-fit-cell-py,.5rem)!important;padding-left:var(--pm-fit-cell-px,.75rem)!important;padding-right:var(--pm-fit-cell-px,.75rem)!important;}</style>`;

    const now = window.__serverDateService.nowDate(); const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }); const genDateTime = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }); let docTitle = isOrder ? "ORDEN DE COMPRA" : "COTIZACIÓN"; 
    
    let folio = __pmResolveQuoteFolio(o); 
    
    const space = __pmFindSpaceByAnyId(o.espacio_id); const basePrice = parseFloat(space ? space.precio_base : 0); 
    const footerHubHTML = `<div class="w-full text-center mt-10"><p class="pm-pdf-footer-text text-[10px] text-gray-400 font-medium leading-tight" data-base-resource="footer">Generado el ${genDateTime}<br>a través de Marketing Hub - Plaza Mayor</p></div>`; 
    const renderHeader = (title) => `<div class="pm-pdf-header flex justify-end items-start border-b-4 border-brand-red pb-3 mb-2">${logoImg}<div class="text-right"><h1 class="pm-pdf-title text-2xl font-black text-gray-800 tracking-tighter uppercase" data-base-resource="header-title">${title}</h1><p class="pm-pdf-folio text-sm font-mono text-brand-red font-bold mt-1" data-base-resource="header-meta">FOLIO: ${folio}</p><p class="pm-pdf-date text-[10px] text-gray-500 mt-1" data-base-resource="header-meta">${dateStr}</p></div></div>`; 
    const quickLeftItems = String(pdfContent.quickLeftLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const quickLeftItemsHtml = quickLeftItems.length
        ? quickLeftItems.map((line) => `<li>${__pmSafeHtml(line)}</li>`).join('')
        : '<li>Sin notas configuradas.</li>';
    const conditionsItems = String(pdfContent.conditionsLines || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const conditionsItemsHtml = conditionsItems.length
        ? conditionsItems.map((line) => `<li>${__pmSafeHtml(line)}</li>`).join('')
        : '<li>Sin condiciones configuradas.</li>';
    let clientName = o.cliente_nombre || 'CLIENTE';
    let clientRfc = o.cliente_rfc;
    let nameSizeClass = 'text-xl';
    if (clientName.length > 35) nameSizeClass = 'text-xs'; else if (clientName.length > 25) nameSizeClass = 'text-sm';
    const quoteStatus = String(o?.status || '').toLowerCase();
    const docMeta = __pmGetQuoteDocumentMeta(o);
    const isConvenio = !isOrder && docMeta.isConvenio;
    const isApprovedQuote = !isOrder && ['aprobada', 'finalizada'].includes(quoteStatus);
    if (!isOrder && isConvenio) docTitle = 'CARTA CONVENIO';
    const clientComponent = (isOrder || isApprovedQuote)
        ? `<div class="pm-pdf-summary flex flex-row justify-between items-center mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><div class="w-1/2 border-r border-gray-200 pr-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div><div class="w-1/2 pl-2"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Contacto / Fiscal</p><p class="font-mono text-xs text-gray-700 truncate">${o.cliente_email || 'Sin correo'}</p>${clientRfc ? `<p class="font-mono text-xs text-gray-700 mt-0.5">RFC: <strong>${clientRfc}</strong></p>` : ''}</div></div>`
        : `<div class="pm-pdf-summary mb-2 p-2 bg-gray-50 rounded border border-gray-100" data-base-resource="summary"><p class="font-black text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">Cliente / Empresa</p><p class="font-black ${nameSizeClass} text-gray-800 leading-tight">${clientName}</p></div>`;
    
    let detailSpaces = [];
    if (Array.isArray(o.espacios_detalle)) detailSpaces = o.espacios_detalle;
    else if (typeof o.espacios_detalle === 'string') { try { detailSpaces = JSON.parse(o.espacios_detalle); } catch(e){} }
    detailSpaces = Array.isArray(detailSpaces) ? detailSpaces.filter(Boolean) : [];
    const __pmFindCatalogSpace = (spaceId) => __pmFindSpaceByAnyId(spaceId);
    const __pmResolveSpaceIdentity = (detail) => {
        const sid = String(detail?.espacio_id || detail?.space_id || o.espacio_id || '').trim();
        const catalogSpace = sid ? __pmFindCatalogSpace(sid) : space;
        return {
            nombre: detail?.espacio_nombre || catalogSpace?.nombre || o.espacio_nombre || '--',
            clave: detail?.espacio_clave || catalogSpace?.clave || o.espacio_clave || ''
        };
    };
    const __pmRenderSpaceCell = (identity) => {
        const safeName = __pmSafeHtml(identity?.nombre || '--');
        const safeKey = __pmSafeHtml(identity?.clave || '');
        return `<div class="break-words"><p class="font-bold text-gray-800 text-xs break-words">${safeName}</p>${safeKey ? `<span class="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[10px] font-mono mt-0.5 inline-block">${safeKey}</span>` : ''}</div>`;
    };
    // Resuelve personas por concepto usando (1) el propio concepto, (2) el espacio ligado o (3) el fallback global.
    const __pmParsePeople = (value) => {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const __pmGlobalPeople = __pmParsePeople(o?.personas);
    const __pmPeopleBySpace = {};
    detailSpaces.forEach((sp) => {
        const sid = String(sp?.espacio_id || sp?.space_id || '').trim();
        const people = __pmParsePeople(sp?.personas ?? sp?.guests ?? sp?.people);
        if (sid && people > 0) __pmPeopleBySpace[sid] = people;
    });
    const __pmResolveConceptPeople = (concept) => {
        const meta = concept && typeof concept.meta === 'object' ? concept.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '').trim();
        const direct = __pmParsePeople(concept?.personas ?? concept?.guests ?? meta.personas ?? meta.guests);
        if (direct > 0) return direct;
        if (sid && __pmPeopleBySpace[sid] > 0) return __pmPeopleBySpace[sid];
        return __pmGlobalPeople;
    };
    const __pmCurrencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const __pmRoundMoney = (value) => Math.round(((parseFloat(value) || 0) + Number.EPSILON) * 100) / 100;
    const __pmFormatMoneyHtml = (value, options = {}) => {
        const opts = options && typeof options === 'object' ? options : {};
        const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
        const prefix = opts.prefix ? `${opts.prefix} ` : '';
        const extraClass = String(opts.className || '').trim();
        const className = ['pm-pdf-amount', extraClass].filter(Boolean).join(' ');
        return `<span class="${className}">${prefix}${__pmCurrencyFormatter.format(amount)}</span>`;
    };
    const __pmNormalizeTaxName = (value) => {
        const raw = String(value || '').trim();
        return raw && !/^impuestos?$/i.test(raw) ? raw : 'IVA';
    };
    const __pmBuildTaxRows = (subtotal, activeTaxIds, storedTaxTotal = 0, summaryColspan = 4) => {
        const rows = [
            `<tr><td class="py-1 px-3 text-[10px] font-bold text-gray-500 text-right" colspan="${summaryColspan}">Subtotal</td><td class="py-1 px-3 text-right text-xs font-bold text-gray-800">${__pmFormatMoneyHtml(subtotal)}</td></tr>`
        ];
        const resolvedTaxes = parseIds(activeTaxIds)
            .map((tid) => __pmResolveTaxRecord(tid))
            .filter(Boolean)
            .map((tax) => {
                const percentage = __pmResolveTaxDisplayPercent(tax);
                const rate = __pmResolveTaxRate(tax);
                return {
                    name: __pmNormalizeTaxName(tax.nombre),
                    percentage,
                    amount: __pmRoundMoney(subtotal * rate)
                };
            })
            .filter((entry) => entry.amount > 0 || entry.percentage > 0);

        if (resolvedTaxes.length > 0) {
            let remainingStoredTax = __pmRoundMoney(storedTaxTotal);
            resolvedTaxes.forEach((entry, index) => {
                const amount = storedTaxTotal > 0
                    ? (index === resolvedTaxes.length - 1 ? Math.max(0, __pmRoundMoney(remainingStoredTax)) : Math.max(0, entry.amount))
                    : entry.amount;
                if (storedTaxTotal > 0 && index < resolvedTaxes.length - 1) {
                    remainingStoredTax = __pmRoundMoney(remainingStoredTax - amount);
                }
                rows.push(`<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="${summaryColspan}">${__pmSafeHtml(entry.name)}${entry.percentage > 0 ? ` (${entry.percentage}%)` : ''}</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">${__pmFormatMoneyHtml(amount, { prefix: '+' })}</td></tr>`);
            });
        } else if (storedTaxTotal > 0) {
            rows.push(`<tr><td class="py-1 px-3 text-[10px] text-gray-400 text-right" colspan="${summaryColspan}">IVA</td><td class="py-1 px-3 text-right text-xs text-red-500 font-bold">${__pmFormatMoneyHtml(storedTaxTotal, { prefix: '+' })}</td></tr>`);
        }

        return rows.join('');
    };

    let rentalTotal = calculateSpaceTotal(space, o.fecha_inicio, o.fecha_fin);
    let runningSubtotal = 0;
    let convenioBaseTotal = 0;
    let convenioDeliveredTotal = 0;
    let rowsHtml = '';
    const __pmPdfDetailRows = detailSpaces.length
        ? detailSpaces.map((item) => ({ detail: item, catalogSpace: __pmFindCatalogSpace(item?.espacio_id || item?.space_id || '') }))
        : [{ detail: o, catalogSpace: space }];
    const hasDigitalMediaInTable = __pmPdfDetailRows.some((entry) => __pmResolveDigitalMediaConfig(entry.detail, entry.catalogSpace).enabled);
    const __pmMeasureHeaderLabel = hasDigitalMediaInTable ? 'Resolución (px)' : 'Medidas';
    const __pmSummaryColspan = hasDigitalMediaInTable ? 5 : 4;
    if (detailSpaces.length) {
        detailSpaces.forEach(sp => {
            const identity = __pmResolveSpaceIdentity(sp);
            const catalogSpace = __pmFindCatalogSpace(sp?.espacio_id || sp?.space_id || '');
            const spSubtotal = parseFloat(sp.subtotal_espacio || sp.total_espacio || 0) || 0;
            runningSubtotal += spSubtotal;
            convenioBaseTotal += spSubtotal;
            const mDetail = __pmResolvePdfSpaceDetail(sp, catalogSpace);
            const digitalMedia = __pmResolveDigitalMediaConfig(sp, catalogSpace);
            const measureCellHtml = hasDigitalMediaInTable
                ? __pmSafeHtml(digitalMedia.enabled ? __pmDigitalMediaResolutionText(digitalMedia) : '--')
                : __pmResolvePdfMeasureHtml(sp, catalogSpace);
            const durationCellHtml = hasDigitalMediaInTable
                ? `<td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__pmSafeHtml(digitalMedia.enabled ? __pmDigitalMediaDurationText(digitalMedia) : '--')}</td>`
                : '';
            const dateRangeLabel = (isConvenio && __pmSpaceDetailBlocksIndefinitely(sp))
                ? `${window.safeFormatDate(sp.fecha_inicio)}<br>Indefinido`
                : `${window.safeFormatDate(sp.fecha_inicio)}<br>${window.safeFormatDate(sp.fecha_fin)}`;
            const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${__pmFormatMoneyHtml(spSubtotal)}</td>`;
            rowsHtml += `<tr><td class="py-2 px-3 align-top break-words">${__pmRenderSpaceCell(identity)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__pmSafeHtml(mDetail)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${measureCellHtml}</td>${durationCellHtml}<td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${dateRangeLabel}</td>${amountCellHtml}</tr>`;
        });
    } else {
        const identity = __pmResolveSpaceIdentity();
        const mDetail = __pmResolvePdfSpaceDetail(o, space);
        const digitalMedia = __pmResolveDigitalMediaConfig(o, space);
        const measureCellHtml = hasDigitalMediaInTable
            ? __pmSafeHtml(digitalMedia.enabled ? __pmDigitalMediaResolutionText(digitalMedia) : '--')
            : __pmResolvePdfMeasureHtml(o, space);
        const durationCellHtml = hasDigitalMediaInTable
            ? `<td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__pmSafeHtml(digitalMedia.enabled ? __pmDigitalMediaDurationText(digitalMedia) : '--')}</td>`
            : '';
        runningSubtotal = rentalTotal;
        convenioBaseTotal = rentalTotal;
        const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 align-top text-right font-bold text-gray-700 text-xs">${__pmFormatMoneyHtml(rentalTotal)}</td>`;
        rowsHtml = `<tr><td class="py-2 px-3 align-top break-words">${__pmRenderSpaceCell(identity)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__pmSafeHtml(mDetail)}</td><td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${measureCellHtml}</td>${durationCellHtml}<td class="py-2 px-3 align-top text-center text-gray-500 text-xs">${__pmOrderBlocksIndefinitely(o) ? `${window.safeFormatDate(o.fecha_inicio)}<br>Indefinido` : `${window.safeFormatDate(o.fecha_inicio)}<br>${window.safeFormatDate(o.fecha_fin)}`}</td>${amountCellHtml}</tr>`;
    }
    
    const cArray = __pmNormalizeConceptsArray(o.conceptos_adicionales);
    cArray.forEach(c => { 
        let val = parseFloat(c.amount !== undefined ? c.amount : (c.value || 0));
        let amount = val;
        if(c.unit === 'percent') amount = runningSubtotal * (val/100); 
        const convenioConcept = isConvenio || __pmIsConvenioConceptItem(c);
        if(convenioConcept || c.type === 'descuento') runningSubtotal -= amount; else runningSubtotal += amount; 
        if (convenioConcept) convenioDeliveredTotal += amount;
        const sign = (convenioConcept || c.type === 'descuento') ? '-' : '+'; 
        const meta = c && typeof c.meta === 'object' ? c.meta : {};
        const sid = String(meta.space_id || meta.spaceId || '');
        const spName = sid ? (detailSpaces.find(sp => String(sp.espacio_id || sp.space_id || '') === sid)?.espacio_nombre || '') : '';
        const conceptPeople = __pmResolveConceptPeople(c);
        const peopleSuffix = conceptPeople > 0 ? ` (${conceptPeople} persona${conceptPeople === 1 ? '' : 's'})` : '';
        const label = `${spName ? `${spName} - ` : ''}${c.description || c.nombre || (convenioConcept ? 'Trato de Convenio' : 'Adicional')}${peopleSuffix}`;
        const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 text-right text-[13px] font-medium text-gray-600">${__pmFormatMoneyHtml(amount, { prefix: sign })}</td>`;
        const metaColsHtml = hasDigitalMediaInTable
            ? '<td class="py-2 px-3"></td><td class="py-2 px-3"></td><td class="py-2 px-3"></td><td class="py-2 px-3"></td>'
            : '<td class="py-2 px-3"></td><td class="py-2 px-3"></td><td class="py-2 px-3"></td>';
        rowsHtml += `<tr><td class="py-2 px-3 text-[13px] font-medium text-gray-600 break-words leading-snug">${label}</td>${metaColsHtml}${amountCellHtml}</tr>`; 
    }); 
    
    if(o.tipo_ajuste && o.tipo_ajuste !== 'ninguno') { let val = parseFloat(o.valor_ajuste); let displayAmount = val; if (o.ajuste_es_porcentaje) { displayAmount = runningSubtotal * (val / 100); } const sign = o.tipo_ajuste === 'descuento' ? '-' : '+'; if(o.tipo_ajuste==='descuento') runningSubtotal -= displayAmount; else runningSubtotal += displayAmount; const amountCellHtml = isConvenio ? '' : `<td class="py-2 px-3 text-right font-bold text-[12px] text-gray-600">${__pmFormatMoneyHtml(displayAmount, { prefix: sign })}</td>`; const adjustmentMetaColsHtml = hasDigitalMediaInTable ? '<td></td><td></td><td></td><td></td>' : '<td></td><td></td><td></td>'; rowsHtml += `<tr class="bg-gray-50"><td class="py-2 px-3 italic text-[12px] text-gray-500">Ajuste Global</td>${adjustmentMetaColsHtml}${amountCellHtml}</tr>`; } 
    const __pmTableRows = (String(rowsHtml).match(/<tr\b/gi) || []).length;
    const __pmTableChars = String(rowsHtml).replace(/<[^>]+>/g, '').length;
    let __pmDensityLevel = 0;
    if (__pmTableRows > 16 || __pmTableChars > 2300) __pmDensityLevel = 1;
    if (__pmTableRows > 24 || __pmTableChars > 3200) __pmDensityLevel = 2;
    if (__pmTableRows > 32 || __pmTableChars > 4200) __pmDensityLevel = 3;
    const __pmFitBodyPx = Math.max(8, (parseInt(pdfStyle.tableBodyPx, 10) || 12) - __pmDensityLevel);
    const __pmFitHeadPx = Math.max(9, (parseInt(pdfStyle.tableHeadPx, 10) || (__pmFitBodyPx + 2)) - (__pmDensityLevel >= 2 ? 2 : __pmDensityLevel));
    const __pmFitCellPy = __pmDensityLevel >= 3 ? 2 : (__pmDensityLevel >= 2 ? 3 : (__pmDensityLevel === 1 ? 4 : 8));
    const __pmFitCellPx = __pmDensityLevel >= 2 ? 6 : 12;
    const __pmFitLineHeight = __pmDensityLevel >= 3 ? '105%' : (__pmDensityLevel >= 2 ? '112%' : '120%');
    const __pmTableFitInline = `--pm-fit-head-size:${__pmFitHeadPx}px;--pm-fit-body-size:${__pmFitBodyPx}px;--pm-fit-cell-py:${__pmFitCellPy}px;--pm-fit-cell-px:${__pmFitCellPx}px;--pm-fit-line-height:${__pmFitLineHeight};`;
    const __pmQuickMarginClass = __pmDensityLevel >= 2 ? 'mb-8' : (__pmDensityLevel === 1 ? 'mb-12' : 'mb-20');
    const detailColumnLabel = __pmResolvePdfDetailHeader(detailSpaces, o, space);
    const pricing = __pmResolveOrderPricing(o);
    const taxIds = pricing.taxIds;
    const storedTaxTotal = pricing.taxTotal > 0
        ? pricing.taxTotal
        : Math.max(0, __pmRoundMoney(pricing.total - runningSubtotal));
    const taxRows = __pmBuildTaxRows(runningSubtotal, taxIds, storedTaxTotal, __pmSummaryColspan);
    // Blindaje adicional: si por cualquier ruta un convenio usa el layout
    // generico, la tabla y el resumen tambien deben quedar sin montos visibles.
    const totalsBlock = isConvenio
        ? ''
        : `<div class="pm-pdf-summary flex justify-end mb-2 pr-4" data-base-resource="summary"><div class="pm-pdf-summary-table-wrap"><table class="w-full border-collapse">${taxRows}<tr><td class="pt-2 border-t-2 border-gray-800 align-middle text-right" colspan="${__pmSummaryColspan}"><span class="text-[10px] font-bold uppercase text-gray-500 mr-2">Total Neto</span></td><td class="pt-2 border-t-2 border-gray-800 align-middle text-right"><span class="text-xl font-black text-gray-900">${__pmFormatMoneyHtml(pricing.total)}</span></td></tr></table></div></div>`; 
    const tableColGroupHtml = isConvenio
        ? (hasDigitalMediaInTable
            ? `<colgroup><col style="width:36%;"><col style="width:16%;"><col style="width:16%;"><col style="width:12%;"><col style="width:20%;"></colgroup>`
            : `<colgroup><col style="width:42%;"><col style="width:18%;"><col style="width:16%;"><col style="width:24%;"></colgroup>`)
        : (hasDigitalMediaInTable
            ? `<colgroup><col style="width:32%;"><col style="width:13%;"><col style="width:13%;"><col style="width:10%;"><col style="width:12%;"><col style="width:20%;"></colgroup>`
            : `<colgroup><col style="width:38%;"><col style="width:14%;"><col style="width:12%;"><col style="width:14%;"><col style="width:22%;"></colgroup>`);
    const tableHeadHtml = isConvenio
        ? (hasDigitalMediaInTable
            ? `<thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__pmSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">${__pmMeasureHeaderLabel}</th><th class="py-2 px-3 text-center">Duración</th><th class="py-2 px-3 text-center rounded-r">Fecha</th></tr></thead>`
            : `<thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__pmSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">${__pmMeasureHeaderLabel}</th><th class="py-2 px-3 text-center rounded-r">Fecha</th></tr></thead>`)
        : (hasDigitalMediaInTable
            ? `<thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__pmSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">${__pmMeasureHeaderLabel}</th><th class="py-2 px-3 text-center">Duración</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead>`
            : `<thead class="pm-pdf-table-head bg-gray-100 text-sm font-black text-gray-500 uppercase"><tr><th class="py-2 px-3 rounded-l">Concepto</th><th class="py-2 px-3 text-center">${__pmSafeHtml(detailColumnLabel)}</th><th class="py-2 px-3 text-center">${__pmMeasureHeaderLabel}</th><th class="py-2 px-3 text-center">Fecha</th><th class="py-2 px-3 text-right rounded-r">Importe</th></tr></thead>`);
    const convenioTableHideTag = isConvenio
        ? `<style>.pm-pdf-root .pm-pdf-hide-convenio-amounts tbody tr>td:last-child{display:none!important;}</style>`
        : '';
    
    const pdfTemplateContext = __pmBuildPdfTemplateContext(o, { folio, docTitle, dateStr, venueName: 'Plaza Mayor' });
    const quoteApproverTitle = __pmResolvePdfTemplateString(pdfContent.quoteApproverTitle || 'QUIEN APRUEBA', pdfTemplateContext);
    const quoteApproverSubtitle = __pmResolvePdfTemplateString(pdfContent.quoteApproverSubtitle || 'Plaza Mayor', pdfTemplateContext);
    const quoteClientTitle = __pmResolvePdfTemplateString(pdfContent.quoteClientTitle || '{{CLIENT_NAME}}', pdfTemplateContext).slice(0, 40);
    const quoteClientSubtitle = __pmResolvePdfTemplateString(pdfContent.quoteClientSubtitle || 'Cliente / Representante', pdfTemplateContext);
    const orderApproverTitle = __pmResolvePdfTemplateString(pdfContent.orderApproverTitle || 'QUIEN APRUEBA', pdfTemplateContext);
    const orderApproverSubtitle = __pmResolvePdfTemplateString(pdfContent.orderApproverSubtitle || 'Plaza Mayor', pdfTemplateContext);

    // Cada firma se renderiza como bloque base independiente para poder moverla
    // y escalarla por separado desde el editor PDF.
    const renderSignArea = (entries, wrapperClass) => {
        const items = (Array.isArray(entries) ? entries : []).filter(Boolean).map((entry) => `
            <div class="pm-pdf-sign ${entry.nodeClass || 'text-center w-56'}" data-base-resource="sign">
                <div class="border-b border-black ${entry.lineClass || 'mb-1'}"></div>
                <p class="font-bold text-xs text-brand-dark ${entry.titleClass || ''}">${__pmSafeHtml(entry.title || '')}</p>
                ${Array.isArray(entry.extraLines) ? entry.extraLines.map((line) => `<p class="text-[10px] ${line.className || 'text-gray-500 uppercase'}">${__pmSafeHtml(line.text || '')}</p>`).join('') : ''}
                ${entry.subtitle ? `<p class="text-[10px] text-gray-500 uppercase ${entry.subtitleClass || ''}">${__pmSafeHtml(entry.subtitle || '')}</p>` : ''}
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
    
    const pageBaseHeight = Number(__pmContentBaseHeightPx().toFixed(2));
    // La carta convenio es un documento legal/operativo; los montos solo viven
    // en el expediente interno y no deben imprimirse en el PDF entregable.
    if (isConvenio && !isOrder) {
        const venueName = 'Plaza Mayor';
        const convenioMeta = __pmParseConvenioMeta(o);
        const convenioItems = convenioMeta.items.length
            ? convenioMeta.items
            : (Array.isArray(cArray) ? cArray : [])
                .filter((concept) => __pmIsConvenioConceptItem(concept))
                .map((concept) => ({
                    id: String(concept?.meta?.convenio_option_id || '').trim() || null,
                    nombre: __pmNormalizeConvenioName(concept?.meta?.convenio_nombre || concept.description || 'Convenio') || 'Convenio',
                    cantidad_entrega: Math.max(1, parseInt(concept?.meta?.cantidad_entrega || 1, 10) || 1),
                    monto: Math.max(0, parseFloat(concept?.amount ?? concept?.value ?? 0) || 0)
                }));
        const publicityEntries = (detailSpaces.length ? detailSpaces : [o]).map((item) => {
            const sid = item?.espacio_id || item?.space_id || o.espacio_id;
            const catalogSpace = sid ? __pmFindCatalogSpace(sid) : space;
            const identity = detailSpaces.length ? __pmResolveSpaceIdentity(item) : __pmResolveSpaceIdentity();
            const materialMeasure = __pmResolveDetailMaterialMeasure(detailSpaces.length ? item : o, catalogSpace);
            const detailLabel = __pmResolvePdfSpaceDetail(detailSpaces.length ? item : o, catalogSpace);
            const digitalMedia = __pmResolveDigitalMediaConfig(detailSpaces.length ? item : o, catalogSpace);
            const width = materialMeasure.medida_ancho;
            const height = materialMeasure.medida_alto;
            const unit = materialMeasure.medida_unidad || 'M';
            const measures = digitalMedia.enabled ? __pmDigitalMediaDetailText(digitalMedia) : ((width !== null && width !== undefined && height !== null && height !== undefined) ? `${width} x ${height} ${unit}` : 'Sin medida capturada');
            const start = item?.fecha_inicio || o.fecha_inicio || '';
            const end = item?.fecha_fin || o.fecha_fin || '';
            const isIndefinite = __pmSpaceDetailBlocksIndefinitely(item) || __pmOrderBlocksIndefinitely(o);
            return {
                name: String(identity?.nombre || 'Espacio publicitario').trim() || 'Espacio publicitario',
                key: String(identity?.clave || '').trim(),
                detail: String(detailLabel || 'Publicidad').trim() || 'Publicidad',
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
                        <p class="font-black text-gray-800 text-[11px]">${__pmSafeHtml(entry.name)}</p>
                        ${entry.key ? `<p class="text-[9px] font-mono text-gray-400 mt-0.5">${__pmSafeHtml(entry.key)}</p>` : ''}
                    </div>
                    <p class="mt-1 text-[10px] text-gray-500">Soporte: ${__pmSafeHtml(entry.detail)}${entry.measures ? ` · Medidas: ${__pmSafeHtml(entry.measures)}` : ''}</p>
                    <p class="mt-0.5 text-[10px] text-gray-400">Vigencia: ${__pmSafeHtml(entry.range)}</p>
                </li>`).join('')
            : '<li class="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-[10px] font-bold text-gray-400">Sin espacios publicitarios capturados.</li>';
        const tradeItemsHtml = convenioItems.length
            ? convenioItems.map((item) => {
                const qty = Math.max(1, parseInt(item?.cantidad_entrega || 1, 10) || 1);
                const label = `${qty} ${qty === 1 ? 'entrega' : 'entregas'} de ${item?.nombre || 'Convenio'}`;
                return `
                    <li class="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <span class="text-[11px] font-semibold text-gray-700">${__pmSafeHtml(label)}</span>
                    </li>`;
            }).join('')
            : '<li class="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-[10px] font-bold text-gray-400">Sin tratos capturados.</li>';
        const convenioMonthYear = now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
        const convenioSubject = String(o.nombre_cotizacion || o.nombre || o.proyecto || clientName || 'Campaña vigente').trim() || 'Campaña vigente';
        const convenioStart = detailSpaces[0]?.fecha_inicio || o.fecha_inicio || '';
        const convenioEnd = detailSpaces[detailSpaces.length - 1]?.fecha_fin || o.fecha_fin || convenioStart;
        const convenioValidityText = __pmOrderBlocksIndefinitely(o)
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
        const convenioGridStyle = __pmBuildConvenioGridStyle(publicityEntries.length, convenioItems.length);
        const convenioRaw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight, 'display:flex;flex-direction:column;justify-content:space-between;')}"><div>${renderHeader(docTitle)}<div class="pm-pdf-summary text-[11px] text-gray-600 text-right mb-4" data-base-resource="summary">León, Guanajuato; ${__pmSafeHtml(convenioMonthYear)}.</div><div class="pm-pdf-general-conditions text-[11px] text-gray-700 space-y-4 leading-relaxed" data-base-resource="conditions"><div class="text-center space-y-1"><p class="text-xl font-black text-gray-900 tracking-wide">CONVENIO DE INTERCAMBIO</p><p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">${__pmSafeHtml((quoteClientTitle || clientName).toUpperCase())} y ${__pmSafeHtml(venueName.toUpperCase())}</p></div><p><strong>${__pmSafeHtml(venueName.toUpperCase())}</strong> acuerda proporcionar espacio publicitario en sus instalaciones para la campaña <strong>${__pmSafeHtml(convenioSubject)}</strong>. La difusión se realizará en los soportes descritos a continuación y se documentará mediante evidencia fotográfica.</p><div style="${convenioGridStyle}"><div class="rounded-2xl border border-gray-200 bg-slate-50/80 p-4"><p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Publicidad acordada</p><ul class="space-y-2">${publicityItemsHtml}</ul></div><div class="space-y-4"><div class="rounded-2xl border border-gray-200 bg-white p-4"><p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Vigencia del acuerdo</p><p class="text-[11px] text-gray-700">${__pmSafeHtml(convenioValidityText)}</p></div><div class="rounded-2xl border border-gray-200 bg-white p-4"><p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Contraprestación acordada</p><ul class="space-y-2">${tradeItemsHtml}</ul></div></div></div><div class="grid grid-cols-2 gap-4"><div class="rounded-2xl border border-gray-200 bg-white p-4"><p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Responsabilidades del cliente</p><ul class="list-disc pl-4 space-y-1 text-[10px] text-gray-700"><li>Entregar los artes digitales o materiales físicos necesarios para la exposición acordada.</li><li>Proporcionar las contraprestaciones pactadas en tiempo y forma conforme a este convenio.</li><li>Compartir la información operativa necesaria para que la instalación publicitaria se ejecute correctamente.</li></ul></div><div class="rounded-2xl border border-gray-200 bg-white p-4"><p class="text-[10px] font-black uppercase tracking-wide text-gray-500 mb-2">Responsabilidades de ${__pmSafeHtml(venueName)}</p><ul class="list-disc pl-4 space-y-1 text-[10px] text-gray-700"><li>Colocar los materiales publicitarios en los espacios acordados durante la vigencia del convenio.</li><li>Garantizar la presencia de la publicidad conforme a la disponibilidad operativa del espacio contratado.</li><li>Registrar evidencia fotográfica del cumplimiento para el cierre documental del convenio.</li></ul></div></div><p class="text-[11px] text-justify">Ambas partes acuerdan cumplir con los términos y condiciones de este convenio, firmando a continuación la aceptación de los compromisos expresados en el presente documento.</p></div></div><div class="pb-2">${convenioSignBlock}${footerHubHTML}</div></div>${__pmRenderPdfResources(pdfStyle, 1, pdfTemplateContext)}</div>`;
        const convenioPages = [
            __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(convenioRaw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })
        ];
        const convenioExtraPages = __pmClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
        if (convenioExtraPages > 0) {
            for (let i = 0; i < convenioExtraPages; i += 1) {
                const extraRaw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight)}">${renderHeader(`ANEXO ${i + 1}`)}<div class="pm-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4" data-base-resource="conditions"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__pmSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__pmSafeHtml(pdfContent.annexHintBody || '')}</p></div>${footerHubHTML}</div>${__pmRenderPdfResources(pdfStyle, 2 + i, pdfTemplateContext)}</div>`;
                convenioPages.push(__pmWrapLetterheadPage(extraRaw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
            }
        }
        const convenioRawHtml = `<div class="pm-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;${pdfStyleInlineVars}${__pmTableFitInline}">${pdfStyleTag}${pdfTableFitTag}${convenioPages.join('')}</div>`;
        return __pmOrdersTransparentPdfHtml(convenioRawHtml);
    }
const page1Raw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight, 'display:flex;flex-direction:column;justify-content:space-between;')}"><div>${renderHeader(docTitle)}${clientComponent}${isOrder ? `<div class="mb-2 bg-gray-100 p-2 rounded text-base"><span>Folio de Servicio: <strong class="font-black text-lg">${folio}</strong></span></div>` : ''}<table class="w-full text-left mb-2 mt-3 table-fixed border-separate border-spacing-0 ${isConvenio ? 'pm-pdf-hide-convenio-amounts' : ''}">${tableColGroupHtml}${tableHeadHtml}<tbody class="pm-pdf-table-body divide-y divide-gray-50 text-[12px]" data-base-resource="table-body">${rowsHtml}</tbody></table> ${totalsBlock}</div><div class="pb-2">${!isOrder ? `<div class="pm-pdf-quick grid grid-cols-2 gap-4 ${__pmQuickMarginClass} pt-4 border-t border-gray-100" data-base-resource="quick"><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickLeftTitle || 'Condiciones:')}</h4><ul class="list-none text-xs text-gray-600 space-y-0.5 leading-tight">${quickLeftItemsHtml}</ul></div><div><h4 class="font-bold text-xs uppercase text-brand-dark mb-0.5">${__pmSafeHtml(pdfContent.quickRightTitle || 'Vigencia:')}</h4><p class="text-xs text-gray-600">${__pmSafeHtml(pdfContent.quickRightBody || '')}</p></div></div>` : ''}${signBlock}${footerHubHTML}</div></div>${__pmRenderPdfResources(pdfStyle, 1, pdfTemplateContext)}</div>`;
    const pages = [
        __pmWrapLetterheadPage(__pmOrdersBoostPdfTypography(page1Raw), { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight })
    ];
    if (!isOrder) { 
const page2Raw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight)}">${renderHeader(__pmSafeHtml(pdfContent.conditionsTitle || 'CONDICIONES GENERALES'))}<ol class="pm-pdf-general-conditions list-decimal list-outside ml-6 text-[14px] text-gray-800 space-y-2 text-justify leading-tight mt-5" data-base-resource="conditions">${conditionsItemsHtml}</ol></div>${__pmRenderPdfResources(pdfStyle, 2, pdfTemplateContext)}</div>`;
        pages.push(__pmWrapLetterheadPage(page2Raw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
    } 
    const extraPages = __pmClampStyleNumber(pdfStyle.extraPages, -1, 6, 0);
    if (extraPages < 0 && pages.length > 1) {
        const keepCount = Math.max(1, pages.length + extraPages);
        pages.length = keepCount;
    } else if (extraPages > 0) {
        for (let i = 0; i < extraPages; i += 1) {
const extraRaw = `<div class="pm-pdf-shift" style="width:100%;min-height:${pageBaseHeight}px;height:${pageBaseHeight}px;overflow:visible;position:relative;"><div class="pm-pdf-page-frame" style="${__pmBuildPdfContentFrameStyle(pageBaseHeight)}">${renderHeader(`ANEXO ${i + 1}`)}<div class="pm-pdf-general-conditions text-[13px] text-gray-700 leading-relaxed mt-6 border border-dashed border-gray-300 rounded-lg p-4" data-base-resource="conditions"><p class="font-black uppercase text-gray-500 text-[11px] mb-2">${__pmSafeHtml(pdfContent.annexHintTitle || 'Página adicional editable')}</p><p>${__pmSafeHtml(pdfContent.annexHintBody || '')}</p></div>${footerHubHTML}</div>${__pmRenderPdfResources(pdfStyle, (isOrder ? 2 : 3) + i, pdfTemplateContext)}</div>`;
            pages.push(__pmWrapLetterheadPage(extraRaw, { baseWidth: __PM_PDF_CONTENT_BASE_WIDTH_PX, baseHeight: pageBaseHeight }));
        }
    }
    const raw = `<div class="pm-pdf-root" style="width:816px;margin:0;padding:0;box-sizing:border-box;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;${pdfStyleInlineVars}${__pmTableFitInline}">${convenioTableHideTag}${pdfStyleTag}${pdfTableFitTag}${pages.join('')}</div>`;
    return __pmOrdersTransparentPdfHtml(raw); 
};



// =========================================================================
// PLAZA MAYOR - OVERRIDES MINIMOS MULTIESPACIO PARA ORDER_DETAIL
// =========================================================================
(function () {
  if (typeof _isCP === "undefined" || _isCP) return;

  let pmSpaces = [];
  let pmActive = null;
  let pmTotals = { spaces: [], subtotal: 0, adjusted: 0, adjustment: 0, tax: 0, final: 0, adjType: "ninguno", subtotalBase: 0 };

  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim()) ? String(v).trim() : "");
  const today = () => window.__serverDateService.todayISO();
  const safeArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  };
  const monthBounds = (anchor) => {
    const s = iso(anchor) || today();
    const start = new Date(`${s}T00:00:00`);
    start.setDate(start.getDate() + 29);
    return { s, e: start.toISOString().slice(0, 10) };
  };
  const getSpace = (sid) => __pmFindSpaceByAnyId(sid);
  const defaultTaxIds = (space) => __pmNormalizeTaxIds(space?.impuestos_ids || space?.impuestos);
  const resolveCfgTaxIds = (cfg, space) => Array.isArray(cfg?.taxIds) ? __pmNormalizeTaxIds(cfg.taxIds) : defaultTaxIds(space);
  const renderAutoTaxSummary = (taxIds, space) => {
    const rows = __pmNormalizeTaxIds(taxIds).map((tid) => __pmResolveTaxRecord(tid, space)).filter(Boolean);
    if (!rows.length) return '<p class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</p>';
    return rows.map((tax) => `<div class="text-[10px] text-gray-500 font-bold uppercase">${tax.nombre}</div>`).join("");
  };
  const detailMeasureNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const detailMeasureUnit = (value) => {
    const u = String(value || "M").trim().toUpperCase();
    if (u === "CM") return "CM";
    if (u === "M2") return "M2";
    return "M";
  };
  const detailTagList = (value) => {
    let tags = [];
    if (Array.isArray(value)) tags = value;
    else if (typeof value === "string") {
      const raw = value.trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          tags = Array.isArray(parsed) ? parsed : raw.split(",");
        } catch {
          tags = raw.split(",");
        }
      }
    }
    return tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  };
  const normalizeDetailSpace = (rawItem) => {
    const item = rawItem && typeof rawItem === "object" ? { ...rawItem } : {};
    const spaceId = item.espacio_id || item.space_id || "";
    const medidaAncho = detailMeasureNumber(item.medida_ancho ?? item.ancho);
    const medidaAlto = detailMeasureNumber(item.medida_alto ?? item.alto);
    const medidaUnidad = detailMeasureUnit(item.medida_unidad || item.unidad_medida || "M");
    const espacioTipo = String(item.espacio_tipo || item.tipo || "");
    const espacioDescripcion = String(item.espacio_descripcion || item.descripcion || "");
    const espacioEtiquetas = detailTagList(item.espacio_etiquetas ?? item.etiquetas);
    return {
      ...item,
      espacio_id: item.espacio_id || spaceId,
      space_id: item.space_id || spaceId,
      espacio_tipo: espacioTipo,
      tipo: item.tipo || espacioTipo,
      espacio_descripcion: espacioDescripcion,
      descripcion: item.descripcion || espacioDescripcion,
      espacio_etiquetas: espacioEtiquetas,
      etiquetas: item.etiquetas ?? espacioEtiquetas,
      material: String(item.material || ""),
      ubicacion: __pmNormalizeLocationLabel(item.ubicacion || ""),
      medida_ancho: medidaAncho,
      medida_alto: medidaAlto,
      medida_unidad: medidaUnidad,
      ancho: medidaAncho,
      alto: medidaAlto,
      unidad_medida: medidaUnidad
    };
  };
  const parseDetail = (raw) => safeArr(raw).map(normalizeDetailSpace).filter((x) => x.espacio_id || x.space_id);
  const normConcept = (c) => {
    const amount = parseFloat(c?.amount ?? c?.value ?? 0) || 0;
    return { description: c?.description || c?.concepto || c?.nombre || "Concepto", amount, value: amount, unit: c?.unit || "fixed", type: c?.type || "aumento", meta: c?.meta && typeof c.meta === "object" ? { ...c.meta } : {} };
  };
  const regularConcepts = (concepts = []) => safeArr(concepts).map(normConcept).filter((concept) => !__pmIsConvenioConceptItem(concept));
  const convenioConcepts = (concepts = []) => safeArr(concepts).map(normConcept).filter((concept) => __pmIsConvenioConceptItem(concept));
  const buildConvenioPayloadItems = (cfg = null) => convenioConcepts(cfg?.concepts).map((concept) => ({
    id: String(concept?.meta?.convenio_option_id || "").trim() || null,
    nombre: __pmNormalizeConvenioName(concept?.meta?.convenio_nombre || concept.description || "Convenio") || "Convenio",
    cantidad_entrega: Math.max(1, parseInt(concept?.meta?.cantidad_entrega || 1, 10) || 1),
    monto: Math.max(0, parseFloat(concept?.amount ?? concept?.value ?? 0) || 0)
  }));
  const pmCfgConvenioValue = (cfg = null) => convenioConcepts(cfg?.concepts).reduce((sum, concept) => sum + (parseFloat(concept.amount ?? concept.value ?? 0) || 0), 0);
  const pmCfgBlocksIndefinitely = (cfg = null, space = null) => {
    if (!cfg?.convenioEnabled) return false;
    if (__pmHasFiniteConvenioEndDate(cfg?.endDate)) return false;
    const sp = space || getSpace(cfg?.spaceId);
    const base = resolvePmBaseTotal(cfg, sp);
    return __pmConvenioCovered(base, pmCfgConvenioValue(cfg));
  };
  const syncOrderConvenioSelect = () => {
    const select = document.getElementById("oed-convenio-select");
    if (!select) return;
    const current = String(select.value || "").trim();
    select.innerHTML = '<option value="">Selecciona una opción...</option>' + pmConvenioCatalog.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join("");
    if (current && pmConvenioCatalog.some((item) => item.id === current)) select.value = current;
  };
  const renderOrderConvenioItems = () => {
    const list = document.getElementById("oed-convenio-list");
    if (!list) return;
    const cfg = activeCfg();
    const items = buildConvenioPayloadItems(cfg);
    const locked = __pmIsLockedOrder() || !cfg?.convenioEnabled;
    if (!items.length) {
      list.innerHTML = '<div class="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-4 py-4 text-[11px] font-bold text-amber-700/70">Aún no agregas tratos de convenio.</div>';
      return;
    }
    list.innerHTML = items.map((item, index) => `<div class="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
        <div class="min-w-0">
          <p class="text-xs font-black text-gray-800 truncate">${item.nombre}</p>
          <p class="text-[10px] font-bold uppercase tracking-wide text-amber-900/70">${item.cantidad_entrega} ${item.cantidad_entrega === 1 ? "entrega" : "entregas"} acordadas</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-xs font-black text-gray-800">${money(item.monto)}</span>
          ${locked ? "" : `<button type="button" onclick="window.removeOrderConvenioItem(${index})" class="w-8 h-8 rounded-full border border-amber-100 bg-white text-gray-400 transition hover:text-red-500"><i class="fa-solid fa-xmark"></i></button>`}
        </div>
      </div>`).join("");
  };
  const syncOrderConvenioUi = (cfg = activeCfg()) => {
    const active = cfg || activeCfg();
    const activeSpace = getSpace(active?.spaceId);
    const allowsConvenio = __pmSpaceAllowsConvenio(activeSpace) || !!active?.convenioEnabled;
    const card = document.getElementById("oed-convenio-card");
    const chk = document.getElementById("oed-convenio-enabled");
    const section = document.getElementById("oed-convenio-section");
    const customPriceChk = document.getElementById("oed-custom-price-enabled");
    const customPriceWrap = document.getElementById("oed-custom-price-wrap");
    if (!allowsConvenio && active && !active.convenioEnabled) {
      active.convenioEnabled = false;
      active.concepts = regularConcepts(active.concepts);
    }
    if (card) card.classList.toggle("hidden", !allowsConvenio);
    if (chk) chk.checked = !!active?.convenioEnabled;
    if (chk) chk.disabled = !allowsConvenio;
    if (section) section.classList.toggle("hidden", !active?.convenioEnabled || !allowsConvenio);
    if (customPriceChk) {
      if (active?.convenioEnabled) {
        customPriceChk.checked = false;
        customPriceChk.disabled = true;
      } else if (!__pmIsLockedOrder()) {
        customPriceChk.disabled = false;
      }
    }
    if (active?.convenioEnabled && customPriceWrap) customPriceWrap.classList.add("hidden");
    syncOrderConvenioSelect();
    renderOrderConvenioItems();
  };
  const isEditorConvenioOrder = () => selectedCfg().some((cfg) => !!cfg?.convenioEnabled) || __pmIsConvenioOrder(currentPreviewOrder || {});
  const syncPmOrderDetailModeUi = () => {
    const isConvenio = isEditorConvenioOrder();
    const financialTabBtn = document.querySelector('[data-order-tab="financial"]');
    const financialPanel = document.querySelector('[data-order-panel="financial"]');
    const convenioSection = document.getElementById("oed-convenio-section");
    const financialHost = document.getElementById("oed-convenio-host-financial");
    const spacesHost = document.getElementById("oed-convenio-host-spaces");
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    if (financialTabBtn) financialTabBtn.classList.toggle("hidden", isConvenio);
    if (isConvenio && pmDetailTab === "financial") pmDetailTab = "spaces";
    if (financialPanel) financialPanel.classList.toggle("hidden", isConvenio || pmDetailTab !== "financial");
    if (convenioSection) {
      const targetHost = isConvenio ? (spacesHost || financialHost) : (financialHost || spacesHost);
      if (targetHost && convenioSection.parentElement !== targetHost) targetHost.appendChild(convenioSection);
    }
    setText("sum-general-title", isConvenio ? "Resumen del Convenio" : "Resumen General");
    setText("sum-general-copy", isConvenio ? "Vista consolidada del convenio y su balance actual." : "Vista consolidada de la cotización completa.");
    setText("sum-label-name", isConvenio ? "Convenio" : "Cotización");
    setText("sum-financial-title", isConvenio ? "Trato del Convenio" : "Resumen Financiero");
    setText("sum-financial-copy", isConvenio ? "Relación entre el valor del espacio y lo acordado a entregar." : "Concentrado total y desglose financiero por espacio.");
    setText("sum-spaces-title", isConvenio ? "Espacios Comprometidos" : "Detalle por Espacio");
    setText("sum-spaces-copy", isConvenio ? "Consulta cada espacio bloqueado y los tratos capturados para el convenio." : "Consulta cada espacio y su relación con el resumen financiero.");
    setText("expediente-title", isConvenio ? "Expediente del Convenio" : "Expediente de la Cotización");
    setText("expediente-copy", isConvenio ? "Consulta borradores, carta convenio aprobada y la evidencia fotográfica desde aquí." : "Consulta previews de documentos, snapshots guardados y genera archivos clave desde aquí.");
    writePmDetailTab();
  };
  const getCfg = (sid) => pmSpaces.find((x) => String(x.spaceId) === String(sid)) || null;
  const selectedCfg = () => pmSpaces.filter((x) => x.selected);
  const activeCfg = () => getCfg(pmActive);
  // El picker de order_detail comparte un solo catálogo visual; cuando la
  // orden ya es convenio debemos reducirlo solo a espacios elegibles.
  const canDisplayPmEditorSpace = (space) => {
    if (!space) return false;
    if (isEditorConvenioOrder() && !__pmSpaceAllowsConvenio(space)) return false;
    return true;
  };
  const canAddPmEditorSpace = (sid, options = {}) => {
    const space = getSpace(sid);
    if (!space) return false;
    if (isEditorConvenioOrder() && !__pmSpaceAllowsConvenio(space)) {
      if (!options.silent) window.showToast("Ese espacio no está disponible para convenio.", "error");
      return false;
    }
    return true;
  };
  const listPmEditorSpaces = () => allSpaces.filter((space) => canDisplayPmEditorSpace(space));
  const ensureActive = () => {
    if (!selectedCfg().length && pmSpaces.length) pmSpaces[0].selected = true;
    if (!pmActive || !getCfg(pmActive)?.selected) pmActive = String(selectedCfg()[0]?.spaceId || pmSpaces[0]?.spaceId || "");
  };
  const normDates = (cfg) => {
    if (!cfg) return;
    if (cfg.customPermanence) {
      cfg.startDate = iso(cfg.startDate || "");
      cfg.endDate = iso(cfg.endDate || "");
      if (!cfg.startDate && cfg.endDate) cfg.startDate = cfg.endDate;
      if (!cfg.endDate && cfg.startDate) cfg.endDate = cfg.startDate;
      if (cfg.startDate && cfg.endDate && new Date(cfg.endDate + "T00:00:00") < new Date(cfg.startDate + "T00:00:00")) cfg.endDate = cfg.startDate;
      return;
    }
    const m = monthBounds(cfg.startDate || cfg.endDate || today());
    cfg.startDate = m.s;
    cfg.endDate = m.e;
  };
  const mkCfg = (spaceId, seed = {}) => {
    const sp = getSpace(spaceId);
    const hasCustomPriceSeed = seed.customPriceEnabled === true || (seed.customBasePrice !== null && seed.customBasePrice !== undefined && seed.customBasePrice !== "");
    const cfg = {
      spaceId: String(spaceId),
      spaceType: String(seed.spaceType || seed.espacio_tipo || seed.tipo || sp?.tipo || ""),
      selected: seed.selected !== false,
      customPermanence: !!seed.customPermanence,
      customPriceEnabled: !!hasCustomPriceSeed,
      customPriceMode: String(seed.customPriceMode || seed.precio_personalizado_modo || "total"),
      convenioEnabled: seed.convenioEnabled === true || seed.convenio_activo === true || seed.convenio_indefinido === true,
      startDate: iso(seed.startDate || ""),
      endDate: iso(seed.endDate || ""),
      customBasePrice: seed.customBasePrice === null || seed.customBasePrice === undefined || seed.customBasePrice === "" ? "" : (parseFloat(seed.customBasePrice) || 0),
      taxIds: Array.isArray(seed.taxIds) ? __pmNormalizeTaxIds(seed.taxIds) : defaultTaxIds(sp),
      concepts: safeArr(seed.concepts).map(normConcept),
      material: String(seed.material || sp?.material || ""),
      ubicacion: __pmNormalizeLocationLabel(seed.ubicacion || sp?.ubicacion || ""),
      medidaAncho: parseFloat(seed.medidaAncho ?? seed.medida_ancho ?? seed.ancho ?? sp?.medida_ancho ?? sp?.ancho ?? 0) || 0,
      medidaAlto: parseFloat(seed.medidaAlto ?? seed.medida_alto ?? seed.alto ?? sp?.medida_alto ?? sp?.alto ?? 0) || 0,
      medidaUnit: String(seed.medidaUnit || seed.medida_unidad || seed.unidad_medida || sp?.medida_unidad || sp?.unidad_medida || "M")
    };
    normDates(cfg);
    return cfg;
  };
  const taxRate = (ids) => ids.reduce((acc, tid) => {
    const t = __pmResolveTaxRecord(tid);
    if (!t) return acc;
    return acc + __pmResolveTaxRate(t);
  }, 0);
  const money = (v) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v || 0);
  const PM_MAX_DISCOUNT_PERCENT = 10;
  const normalizePmGlobalAdjustment = (subtotalRaw = 0, options = {}) => {
    const opts = options && typeof options === "object" ? options : {};
    const showToast = opts.showToast === true;
    const typeEl = document.getElementById("oed-adj-type");
    const valueEl = document.getElementById("oed-adj-val");
    const unitEl = document.getElementById("oed-adj-unit");
    const adjType = String(typeEl?.value || "ninguno");
    const isPct = (String(unitEl?.value || "fixed") === "percent");
    const subtotal = Math.max(0, parseFloat(subtotalRaw || 0) || 0);
    const maxFixedDiscount = parseFloat((subtotal * (PM_MAX_DISCOUNT_PERCENT / 100)).toFixed(2));
    let adjVal = Math.max(0, parseFloat(valueEl?.value || 0) || 0);
    let message = "";

    if (adjType === "descuento") {
      if (isPct && adjVal > PM_MAX_DISCOUNT_PERCENT) {
        adjVal = PM_MAX_DISCOUNT_PERCENT;
        message = `El descuento maximo permitido es ${PM_MAX_DISCOUNT_PERCENT}%.`;
      } else if (!isPct && subtotal <= 0 && adjVal > 0) {
        adjVal = 0;
        message = "No se puede aplicar descuento sobre un subtotal en 0.";
      } else if (!isPct && adjVal > maxFixedDiscount) {
        adjVal = maxFixedDiscount;
        message = `El descuento maximo permitido para este subtotal es ${money(maxFixedDiscount)}.`;
      }
    }

    if (valueEl) {
      const normalizedValue = Number.isInteger(adjVal) ? String(adjVal) : adjVal.toFixed(2);
      if (String(valueEl.value || "") !== normalizedValue) valueEl.value = normalizedValue;
    }
    if (message && showToast && typeof window.showToast === "function") {
      window.showToast(message, "warning");
    }
    return {
      adjType,
      adjVal,
      isPct,
      maxFixedDiscount,
      adjustment: adjType === "ninguno" ? 0 : (isPct ? (subtotal * (adjVal / 100)) : adjVal)
    };
  };
  const PM_DETAIL_TABS = ["client", "spaces", "financial", "summary", "expediente"];
  const PM_DETAIL_TAB_KEY_PREFIX = "pm_order_detail_tab_v1:";
  let __pmExpedienteRenderSeq = 0;
  let __pmExpedienteObjectUrls = [];
  const resolvePmDetailTabStorageKey = () => {
    const params = new URLSearchParams(window.location.search || "");
    const quoteId = String(params.get("quote") || "").trim();
    return `${PM_DETAIL_TAB_KEY_PREFIX}${String(window.location.pathname || "").toLowerCase()}:${quoteId || "default"}`;
  };
  const readPmDetailTab = () => {
    try {
      const saved = String(sessionStorage.getItem(resolvePmDetailTabStorageKey()) || "").trim();
      return PM_DETAIL_TABS.includes(saved) ? saved : "client";
    } catch (_) {
      return "client";
    }
  };
  const writePmDetailTab = () => {
    try { sessionStorage.setItem(resolvePmDetailTabStorageKey(), pmDetailTab); } catch (_) {}
  };
  let pmDetailTab = readPmDetailTab();
  const pmSpaceDays = (cfg) => Math.max(1, datesBetween(cfg?.startDate || "", cfg?.endDate || cfg?.startDate || "").length || 0);
  const pmBaseUnitPrice = (space) => Math.max(0, parseFloat(space?.precio_base || 0) || 0);
  const resolvePmBaseTotal = (cfg, space) => {
    if (!cfg || !space) return 0;
    if (cfg.convenioEnabled) return pmBaseUnitPrice(space);
    if (cfg.customPriceEnabled) {
      const manual = Math.max(0, parseFloat(cfg.customBasePrice || 0) || 0);
      if (cfg.customPriceMode === "per_day") {
        return manual * pmSpaceDays(cfg);
      } else {
        return manual;
      }
    }
    if (cfg.customPermanence) {
      const days = pmSpaceDays(cfg);
      if (days === 30) return pmBaseUnitPrice(space);
      return pmBaseUnitPrice(space) / Math.max(1, days);
    }
    return calculateSpaceTotal(space, cfg.startDate, cfg.endDate);
  };
  const resolvePmDisplayedBase = (cfg, space) => {
    if (!cfg || !space) return 0;
    const currentRow = Array.isArray(pmTotals?.spaces)
      ? pmTotals.spaces.find((row) => String(row?.cfg?.spaceId || "") === String(cfg.spaceId))
      : null;
    return parseFloat((currentRow?.base ?? resolvePmBaseTotal(cfg, space)) || 0) || 0;
  };
  const pmBasePill = (value) => `<span class="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-black normal-case tracking-normal text-gray-700">${money(value)}</span>`;
  const signedMoney = (value) => {
    const amount = parseFloat(value || 0) || 0;
    if (Math.abs(amount) < 0.005) return money(0);
    return `${amount < 0 ? "-" : "+"}${money(Math.abs(amount))}`;
  };
  const describePmPricingRule = (cfg, space, baseTotal) => {
    const days = pmSpaceDays(cfg);
    const catalogBase = pmBaseUnitPrice(space);
    const manualValue = Math.max(0, parseFloat(cfg?.customBasePrice || 0) || 0);
    const resultBase = Math.max(0, parseFloat(baseTotal || 0) || 0);
    if (cfg?.convenioEnabled) {
      return {
        modeLabel: "Convenio",
        referenceLabel: "Precio base catálogo",
        referenceValue: catalogBase,
        explanation: `El espacio queda bloqueado al precio base del catálogo: ${money(resultBase)}.`,
        detailRows: [
          { label: "Bloqueo del espacio", value: "Indefinido" },
          { label: "Tratos de convenio", value: `${buildConvenioPayloadItems(cfg).length} registrado(s)` }
        ]
      };
    }
    if (cfg?.customPriceEnabled) {
      if (cfg.customPriceMode === "per_day") {
        return {
          modeLabel: "Precio personalizado por día",
          referenceLabel: "Precio base catálogo (30 días)",
          referenceValue: catalogBase,
          explanation: `${money(manualValue)} x ${days} día(s) = ${money(resultBase)}`,
          detailRows: [
            { label: "Precio manual por día", value: money(manualValue) },
            { label: "Días seleccionados", value: `${days} día(s)` }
          ]
        };
      }
      return {
        modeLabel: "Precio personalizado total",
        referenceLabel: "Precio base catálogo (30 días)",
        referenceValue: catalogBase,
        explanation: `Total manual capturado = ${money(resultBase)}`,
        detailRows: [
          { label: "Total manual capturado", value: money(manualValue) },
          { label: "Días seleccionados", value: `${days} día(s)` }
        ]
      };
    }
    if (cfg?.customPermanence) {
      if (days === 30) {
        return {
          modeLabel: "Estancia personalizada",
          referenceLabel: "Precio base catálogo (30 días)",
          referenceValue: catalogBase,
          explanation: `30 día(s): se conserva ${money(resultBase)}`,
          detailRows: [
            { label: "Días seleccionados", value: "30 día(s)" }
          ]
        };
      }
      return {
        modeLabel: "Estancia personalizada prorrateada",
        referenceLabel: "Precio base catálogo (30 días)",
        referenceValue: catalogBase,
        explanation: `${money(catalogBase)} / ${days} día(s) = ${money(resultBase)}`,
        detailRows: [
          { label: "Días seleccionados", value: `${days} día(s)` },
          { label: "Resultado prorrateado", value: money(resultBase) }
        ]
      };
    }
    return {
      modeLabel: "Periodo automático (30 días)",
      referenceLabel: "Precio base catálogo (30 días)",
      referenceValue: catalogBase,
      explanation: `Periodo automático de 30 día(s) = ${money(resultBase)}`,
      detailRows: [
        { label: "Días aplicados", value: "30 día(s)" }
      ]
    };
  };
  const pmSummaryStateClass = (active) => active
    ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
    : "border-gray-200 bg-gray-50";
  const pmSummaryStateLabel = (active) => active
    ? '<span class="text-[9px] font-bold uppercase tracking-wide text-emerald-700">En edición</span>'
    : '<span class="text-[9px] font-bold uppercase tracking-wide text-gray-400">Espacio</span>';
  const renderPmLocationSuggestions = () => {
    const datalist = document.getElementById("oed-location-options");
    if (!datalist) return;
    datalist.innerHTML = (__pmLocationsList || []).map((item) => `<option value="${item}"></option>`).join("");
  };
  const updatePmSpaceConfigTitle = () => {
    const cfg = activeCfg();
    const space = getSpace(cfg?.spaceId);
    const title = document.getElementById("oed-space-config-title");
    const copy = document.getElementById("oed-space-config-copy");
    const baseLabel = money(resolvePmDisplayedBase(cfg, space));
    if (title) title.textContent = `Configuración del Espacio - ${space?.nombre || cfg?.spaceId || "--"} - ${baseLabel}`;
    if (copy) copy.textContent = "Controla nombre de la cotización, fechas de estancia y reglas de precio del espacio activo.";
  };
  const applyPmOrderDetailTabUi = () => {
    syncPmOrderDetailModeUi();
    const convenioMode = isEditorConvenioOrder();
    document.querySelectorAll("[data-order-panel]").forEach((panel) => {
      const panelKey = panel.getAttribute("data-order-panel");
      panel.classList.toggle("hidden", panelKey !== pmDetailTab || (convenioMode && panelKey === "financial"));
    });
    document.querySelectorAll(".order-detail-tab-btn").forEach((btn) => {
      const active = btn.getAttribute("data-order-tab") === pmDetailTab;
      btn.classList.remove("bg-white", "text-brand-dark", "hover:bg-white/15");
      btn.classList.toggle("bg-white/20", active);
      btn.classList.toggle("shadow-sm", active);
      btn.classList.toggle("shadow-inner", active);
      btn.classList.toggle("bg-white/10", !active);
      btn.classList.toggle("text-white", true);
      btn.classList.toggle("hover:bg-white/20", !active);
    });
  };
  window.switchOrderDetailTab = function (tab) {
    pmDetailTab = PM_DETAIL_TABS.includes(String(tab || "")) ? String(tab) : "client";
    applyPmOrderDetailTabUi();
    writePmDetailTab();
    if (pmDetailTab === "expediente") {
      __pmRenderExpedientePanel();
    }
  };
  const __pmExpedienteEscape = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const __pmClearExpedienteObjectUrls = () => {
    (__pmExpedienteObjectUrls || []).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
    __pmExpedienteObjectUrls = [];
  };
  const __pmResolveDraftSnapshotMeta = (record = {}) => {
    const orderId = String(record?.id || document.getElementById("oed-id")?.value || currentPreviewOrder?.id || "").trim();
    const folio = __pmResolveQuoteFolio(record, orderId);
    const docMeta = __pmGetQuoteDocumentMeta(record);
    return {
      orderId,
      folio,
      path: orderId ? `${orderId}/${docMeta.draftStorageBase}_${folio}.pdf` : "",
      fileName: `${docMeta.draftFileBase}_${folio}.pdf`
    };
  };
  const __pmParsePaymentsForExpediente = (order = {}) => {
    if (Array.isArray(order.historial_pagos)) return order.historial_pagos.filter(Boolean);
    try {
      const parsed = JSON.parse(order.historial_pagos || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  };
  const __pmComposeExpedienteSourceOrder = async () => {
    const orderId = String(document.getElementById("oed-id")?.value || currentPreviewOrder?.id || "").trim();
    let base = currentPreviewOrder ? { ...currentPreviewOrder } : null;
    if (!base && orderId) base = await __pmEnsureOrderRecord(orderId);
    if (!base) throw new Error("No se encontró la cotización.");
    if (!IS_PM_ORDER_DETAIL_PAGE) {
      if (!base.numero_orden) base.numero_orden = __pmResolveQuoteFolio(base, orderId || base.id);
      return base;
    }
    const formData = window.getFormDataFromModal();
    const merged = {
      ...base,
      ...formData,
      id: orderId || base.id,
      status: String(document.getElementById("oed-status")?.value || base.status || "pendiente"),
      nombre_cotizacion: formData.nombre_cotizacion || base.nombre_cotizacion || base.detalles_evento?.nombre_cotizacion || ""
    };
    if (!merged.numero_orden) merged.numero_orden = __pmResolveQuoteFolio(merged, merged.id);
    return merged;
  };
  const __pmCreateSignedStorageUrl = async (path) => {
    const safePath = String(path || "").trim();
    if (!safePath) return "";
    try {
      const { data, error } = await window.globalPocketBase.storage.from("documentos").createSignedUrl(safePath, 3600);
      if (error || !data?.signedUrl) return "";
      return data.signedUrl;
    } catch (_) {
      return "";
    }
  };
  const __pmExpedienteMetaTable = (rows = []) => {
    return `<div class="divide-y divide-gray-100 border-b border-gray-200 bg-white text-xs">${safeArr(rows).map((row) => `
      <div class="flex items-center justify-between gap-3 px-5 py-3">
        <span class="font-bold text-gray-400">${__pmExpedienteEscape(row.label || "")}</span>
        <span class="font-bold text-right text-gray-800 max-w-[65%] break-words">${__pmExpedienteEscape(row.value || "--")}</span>
      </div>`).join("")}
    </div>`;
  };
  const __pmExpedienteActionButton = (action = {}) => {
    const tone = action.tone || "slate";
    const toneClass = tone === "brand"
      ? "bg-brand-red text-white hover:bg-red-700"
      : tone === "emerald"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : tone === "purple"
          ? "bg-purple-600 text-white hover:bg-purple-700"
          : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50";
    return `<button type="button" onclick="${__pmExpedienteEscape(action.onclick || "")}" class="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${toneClass}">
      <i class="${action.icon || "fa-solid fa-file"}"></i>
      <span>${__pmExpedienteEscape(action.label || "Acción")}</span>
    </button>`;
  };
  const __pmExpedientePreviewSrc = (src) => {
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) return "";
    return `${cleanSrc}${cleanSrc.includes("#") ? "&" : "#"}toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
  };
  const __pmSetPreviewHeaderTitle = (title = "Vista Previa") => {
    const orderNum = document.getElementById("prev-order-num");
    if (orderNum) orderNum.innerText = String(title || "Vista Previa").toUpperCase();
  };
  const __pmConfigurePreviewActionButton = (config = {}) => {
    const btn = document.getElementById("btn-download-preview");
    if (!btn) return;
    const label = String(config.label || "Descargar");
    const icon = String(config.icon || "fa-solid fa-download");
    const className = String(config.className || "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2");
    btn.disabled = false;
    btn.className = className;
    btn.innerHTML = `<i class="${icon}"></i> <span class="hidden sm:inline">${label}</span>`;
    btn.onclick = typeof config.onClick === "function" ? config.onClick : (() => {});
  };
  const __pmResetPreviewSurface = () => {
    const pdfContainer = document.getElementById("pdf-content");
    const embedViewer = document.getElementById("doc-preview");
    if (pdfContainer) {
      pdfContainer.innerHTML = "";
      pdfContainer.classList.add("hidden");
    }
    if (embedViewer) {
      embedViewer.classList.add("hidden");
      embedViewer.removeAttribute("src");
    }
  };
  window.downloadPmExpedientePreview = async function (src, title = "Documento") {
    const safeSrc = String(src || "").trim();
    const safeTitle = String(title || "Documento").trim() || "Documento";
    if (!safeSrc) return window.showToast("Documento no disponible", "error");
    try {
      const response = await fetch(safeSrc, { method: "GET", credentials: "omit" });
      if (!response.ok) throw new Error(`No se pudo abrir el documento (${response.status}).`);
      const blob = await response.blob();
      if (!blob || !blob.size) throw new Error("Documento vacío.");
      const fileName = `${safeTitle.replace(/[\\/:*?"<>|]+/g, "_") || "Documento"}.pdf`;
      window.downloadBlobAsFile(blob, fileName);
    } catch (e) {
      window.showToast(`No se pudo descargar el documento: ${e?.message || e}`, "error");
    }
  };
  window.openPmExpedientePreview = async function (src, title = "Documento") {
    const safeSrc = String(src || "").trim();
    const safeTitle = String(title || "Documento").trim() || "Documento";
    if (!safeSrc) return window.showToast("Documento no disponible", "error");
    __pmResetPreviewSurface();
    __pmSetPdfEditLocked(true);
    const embedViewer = document.getElementById("doc-preview");
    if (embedViewer) {
      embedViewer.src = __pmExpedientePreviewSrc(safeSrc);
      embedViewer.classList.remove("hidden");
    }
    __pmSetPreviewHeaderTitle(safeTitle);
    __pmConfigurePreviewActionButton({
      label: "Descargar",
      icon: "fa-solid fa-download",
      onClick: () => window.downloadPmExpedientePreview(safeSrc, safeTitle)
    });
    window.openModal("preview-modal");
  };
  window.openPmExpedienteLivePreview = async function (docType = "quote", title = "Vista Previa") {
    const safeDocType = String(docType || "quote").toLowerCase() === "order" ? "order" : "quote";
    const safeTitle = String(title || "Vista Previa").trim() || "Vista Previa";
    try {
      await __pmEnsurePdfStyleProfile(safeDocType, { forceReload: !__pmIsAdminProfile() });
      const order = await __pmComposeExpedienteSourceOrder();
      currentPreviewOrder = { ...order, docType: safeDocType };
      const content = await window.getOrderHTML(order, safeDocType);
      const pdfContainer = document.getElementById("pdf-content");
      __pmResetPreviewSurface();
      if (pdfContainer) {
        pdfContainer.innerHTML = content;
        pdfContainer.classList.remove("hidden");
      }
      __pmSetPdfEditLocked(false);
      __pmApplyPdfStyleToLivePreview();
      __pmSetPreviewHeaderTitle(safeTitle);
      __pmConfigurePreviewActionButton({
        label: "Descargar",
        icon: "fa-solid fa-download",
        onClick: window.downloadPDFFromPreview
      });
      window.openModal("preview-modal");
    } catch (e) {
      window.showToast(`No se pudo abrir la vista previa: ${e?.message || e}`, "error");
    }
  };
  const __pmRenderExpedienteCard = (doc = {}) => {
    const badgeTone = doc.badgeTone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : doc.badgeTone === "purple"
        ? "bg-purple-100 text-purple-700"
        : doc.badgeTone === "amber"
          ? "bg-amber-100 text-amber-700"
          : doc.badgeTone === "red"
            ? "bg-red-100 text-red-700"
            : "bg-slate-100 text-slate-600";
    let previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-white flex items-center justify-center px-5 text-sm font-bold text-gray-400">Vista no disponible.</div>`;
    if (doc.previewType === "iframe" && doc.previewSrc) {
      previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-white overflow-hidden"><iframe loading="lazy" src="${__pmExpedienteEscape(__pmExpedientePreviewSrc(doc.previewSrc))}" class="order-doc-preview-frame" title="${__pmExpedienteEscape(doc.title || "Documento")}"></iframe></div>`;
    } else if (doc.previewType === "image" && doc.previewSrc) {
      previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-slate-100 overflow-hidden"><img loading="lazy" src="${__pmExpedienteEscape(doc.previewSrc)}" alt="${__pmExpedienteEscape(doc.title || "Evidencia")}" class="h-full w-full object-cover"></div>`;
    } else if (doc.previewType === "message") {
      previewHtml = `<div class="order-doc-preview-wrap border-t border-gray-200 bg-white flex items-center justify-center px-5 text-center text-sm font-bold text-gray-400">${__pmExpedienteEscape(doc.previewMessage || "Vista no disponible.")}</div>`;
    }
    return `<article class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-w-0">
      <div class="px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h4 class="font-black text-sm uppercase text-gray-800">${__pmExpedienteEscape(doc.title || "Documento")}</h4>
          <p class="text-[11px] text-gray-500 mt-1">${__pmExpedienteEscape(doc.description || "")}</p>
        </div>
        <span class="shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${badgeTone}">${__pmExpedienteEscape(doc.badge || "Documento")}</span>
      </div>
      ${__pmExpedienteMetaTable(doc.metaRows)}
      ${previewHtml}
      <div class="px-5 py-4 border-t border-gray-200 flex flex-wrap gap-2 bg-white">
        ${safeArr(doc.actions).map(__pmExpedienteActionButton).join("") || '<span class="text-[11px] font-bold text-gray-400">Sin acciones disponibles.</span>'}
      </div>
    </article>`;
  };
  const __pmBuildDocumentBlob = async (docType, orderOverride = null) => {
    const safeDocType = String(docType || "quote").toLowerCase() === "order" ? "order" : "quote";
    const order = orderOverride || await __pmComposeExpedienteSourceOrder();
    const pdfContainer = document.getElementById("pdf-content");
    if (!pdfContainer) throw new Error("No se encontró contenedor PDF.");
    const prevHtml = pdfContainer.innerHTML;
    const wasHidden = pdfContainer.classList.contains("hidden");
    try {
      await __pmRefreshLetterheadUrl(true);
      await __pmEnsurePdfStyleProfile(safeDocType, { forceReload: !__pmIsAdminProfile() });
      pdfContainer.innerHTML = await window.getOrderHTML(order, safeDocType);
      pdfContainer.classList.remove("hidden");
      __pmApplyPdfStyleToLivePreview({ skipEditorUiRefresh: true });
      const blob = (typeof window.generatePdfBlobFromNode === "function")
        ? await window.generatePdfBlobFromNode(pdfContainer)
        : await renderPdfBlobFallback(pdfContainer);
      return { blob, order };
    } finally {
      pdfContainer.innerHTML = prevHtml;
      pdfContainer.classList.toggle("hidden", wasHidden);
    }
  };
  const __pmBuildPreviewObjectUrl = async (docType, orderOverride = null) => {
    const { blob } = await __pmBuildDocumentBlob(docType, orderOverride);
    const objectUrl = URL.createObjectURL(blob);
    __pmExpedienteObjectUrls.push(objectUrl);
    return objectUrl;
  };
  let __pmEvidenceUploadObjectUrls = [];
  let __pmEvidenceGalleryItems = [];
  let __pmEvidenceGalleryIndex = 0;
  const __pmRevokeEvidenceUploadUrls = () => {
    (__pmEvidenceUploadObjectUrls || []).forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
    __pmEvidenceUploadObjectUrls = [];
  };
  const __pmEnsureEvidenceModals = () => {
    if (!document.getElementById("pm-evidence-upload-modal")) {
      const uploadModal = document.createElement("div");
      uploadModal.id = "pm-evidence-upload-modal";
      uploadModal.className = "fixed inset-0 z-[205] hidden items-center justify-center bg-black/80 p-4 backdrop-blur-sm";
      uploadModal.innerHTML = `<div class="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div class="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <div>
              <h3 class="text-sm font-black uppercase tracking-wide text-gray-800">Finalizar Convenio</h3>
              <p class="text-[11px] text-gray-500">Sube de 3 a 5 fotografías o evidencias para cerrar la cotización.</p>
            </div>
            <button type="button" onclick="window.closePmEvidenceUploadModal()" class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="space-y-4 p-5">
            <input id="pm-evidence-order-id" type="hidden">
            <div class="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-amber-800">Evidencia obligatoria</p>
                <p class="mt-1 text-[11px] font-semibold text-amber-900/80">Solo se aceptan imágenes. El convenio se marcará como finalizado al completar la carga.</p>
              </div>
              <div class="flex items-center gap-2">
                <input id="pm-evidence-input" type="file" accept="image/*" multiple class="hidden" onchange="window.handlePmEvidenceSelection(event)">
                <button type="button" onclick="document.getElementById('pm-evidence-input')?.click()" class="rounded-full bg-amber-500 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-amber-600">
                  <i class="fa-solid fa-upload mr-1"></i>Seleccionar
                </button>
              </div>
            </div>
            <div id="pm-evidence-upload-summary" class="text-[11px] font-bold text-gray-500">Aún no seleccionas evidencias.</div>
            <div id="pm-evidence-upload-grid" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"></div>
          </div>
          <div class="flex flex-col-reverse gap-3 border-t border-gray-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onclick="window.closePmEvidenceUploadModal()" class="rounded-full border border-gray-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-wide text-gray-600 transition hover:bg-gray-50">Cancelar</button>
            <button id="pm-evidence-upload-confirm" type="button" onclick="window.submitPmEvidenceUpload()" class="rounded-full bg-brand-red px-5 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-red-700">
              <i class="fa-solid fa-camera mr-1"></i>Finalizar Cotización
            </button>
          </div>
        </div>`;
      uploadModal.addEventListener("click", (event) => {
        if (event.target === uploadModal) window.closePmEvidenceUploadModal();
      });
      document.body.appendChild(uploadModal);
    }
    if (!document.getElementById("pm-evidence-gallery-modal")) {
      const galleryModal = document.createElement("div");
      galleryModal.id = "pm-evidence-gallery-modal";
      galleryModal.className = "fixed inset-0 z-[206] hidden items-center justify-center bg-black/90 p-4";
      galleryModal.innerHTML = `<div class="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div class="flex items-center justify-between gap-3 bg-gray-900 px-5 py-4 text-white">
            <div>
              <h3 class="text-sm font-black uppercase tracking-wide">Galería de Evidencias</h3>
              <p id="pm-evidence-gallery-counter" class="text-[11px] text-gray-300">0 / 0</p>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" onclick="window.downloadCurrentPmEvidence()" class="rounded-full bg-brand-red px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-red-700"><i class="fa-solid fa-download mr-1"></i>Descargar</button>
              <button type="button" onclick="window.closePmEvidenceGallery()" class="rounded-full border border-white/20 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white transition hover:bg-white/10">Cerrar</button>
            </div>
          </div>
          <div class="relative flex min-h-0 flex-1 items-center justify-center bg-gray-950">
            <button type="button" onclick="window.prevPmEvidence()" class="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"><i class="fa-solid fa-chevron-left"></i></button>
            <img id="pm-evidence-gallery-image" alt="Evidencia" class="max-h-full max-w-full object-contain">
            <button type="button" onclick="window.nextPmEvidence()" class="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="border-t border-gray-200 bg-white px-5 py-4">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p id="pm-evidence-gallery-title" class="text-sm font-black text-gray-800">Evidencia</p>
                <p id="pm-evidence-gallery-meta" class="text-[11px] text-gray-500">Sin información.</p>
              </div>
            </div>
            <div id="pm-evidence-gallery-thumbs" class="mt-4 flex gap-3 overflow-x-auto pb-1"></div>
          </div>
        </div>`;
      galleryModal.addEventListener("click", (event) => {
        if (event.target === galleryModal) window.closePmEvidenceGallery();
      });
      document.body.appendChild(galleryModal);
    }
  };
  const __pmRenderEvidenceSelection = () => {
    __pmEnsureEvidenceModals();
    __pmRevokeEvidenceUploadUrls();
    const input = document.getElementById("pm-evidence-input");
    const summary = document.getElementById("pm-evidence-upload-summary");
    const grid = document.getElementById("pm-evidence-upload-grid");
    const files = Array.from(input?.files || []);
    if (summary) {
      summary.textContent = files.length
        ? `${files.length} archivo(s) seleccionado(s). Debes cargar entre 3 y 5 evidencias.`
        : "Aún no seleccionas evidencias.";
      summary.className = `text-[11px] font-bold ${files.length >= 3 && files.length <= 5 ? "text-emerald-600" : "text-gray-500"}`;
    }
    if (!grid) return;
    if (!files.length) {
      grid.innerHTML = '<div class="col-span-full rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-center text-sm font-bold text-gray-400">Aquí verás la vista previa de las evidencias seleccionadas.</div>';
      return;
    }
    grid.innerHTML = files.map((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      __pmEvidenceUploadObjectUrls.push(objectUrl);
      return `<div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div class="aspect-[4/3] overflow-hidden bg-slate-100"><img src="${objectUrl}" alt="Evidencia ${index + 1}" class="h-full w-full object-cover"></div>
          <div class="space-y-1 px-4 py-3">
            <p class="truncate text-xs font-black text-gray-800">Evidencia ${index + 1}</p>
            <p class="truncate text-[11px] text-gray-500">${file.name}</p>
            <p class="text-[10px] font-bold uppercase tracking-wide text-gray-400">${Math.max(1, Math.round((file.size || 0) / 1024))} KB</p>
          </div>
        </div>`;
    }).join("");
  };
  window.handlePmEvidenceSelection = function () {
    __pmRenderEvidenceSelection();
  };
  window.closePmEvidenceUploadModal = function () {
    const input = document.getElementById("pm-evidence-input");
    const orderField = document.getElementById("pm-evidence-order-id");
    if (input) input.value = "";
    if (orderField) orderField.value = "";
    __pmRevokeEvidenceUploadUrls();
    const grid = document.getElementById("pm-evidence-upload-grid");
    const summary = document.getElementById("pm-evidence-upload-summary");
    if (grid) grid.innerHTML = "";
    if (summary) {
      summary.textContent = "Aún no seleccionas evidencias.";
      summary.className = "text-[11px] font-bold text-gray-500";
    }
    window.closeModal?.("pm-evidence-upload-modal");
  };
  window.openPmEvidenceUploadModal = async function (orderId) {
    __pmEnsureEvidenceModals();
    const safeOrderId = String(orderId || currentPreviewOrder?.id || "").trim();
    if (!safeOrderId) return window.showToast("No se encontró la cotización.", "error");
    const order = await __pmEnsureOrderRecord(safeOrderId);
    if (!order) return window.showToast("No se encontró la cotización.", "error");
    if (!__pmIsConvenioOrder(order)) return window.showToast("Esta cotización no usa convenio.", "error");
    if (String(order.status || "").toLowerCase() === "finalizada") return window.showToast("La cotización ya está finalizada.", "info");
    const orderField = document.getElementById("pm-evidence-order-id");
    if (orderField) orderField.value = safeOrderId;
    __pmRenderEvidenceSelection();
    window.openModal?.("pm-evidence-upload-modal");
  };
  window.submitPmEvidenceUpload = async function () {
    __pmEnsureEvidenceModals();
    const btn = document.getElementById("pm-evidence-upload-confirm");
    const orderId = String(document.getElementById("pm-evidence-order-id")?.value || currentPreviewOrder?.id || "").trim();
    const input = document.getElementById("pm-evidence-input");
    const files = Array.from(input?.files || []);
    if (!orderId) return window.showToast("Cotización inválida.", "error");
    if (files.length < 3 || files.length > 5) return window.showToast("Debes subir entre 3 y 5 evidencias.", "error");
    if (files.some((file) => !String(file.type || "").startsWith("image/"))) return window.showToast("Solo se permiten imágenes como evidencia.", "error");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Subiendo...'; }
    try {
      const order = await __pmEnsureOrderRecord(orderId);
      if (!order) throw new Error("No se encontró la cotización.");
      const convenioMeta = __pmParseConvenioMeta(order);
      if (!convenioMeta.activo && !__pmIsConvenioOrder(order)) throw new Error("La cotización no está marcada como convenio.");
      const stamp = Date.now();
      const uploadedAt = window.__serverDateService.nowISO();
      const evidenceItems = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const cleanName = String(file?.name || `evidencia_${index + 1}.jpg`).replace(/[^a-z0-9._-]+/gi, "_");
        const path = `${orderId}/evidencias/${stamp}_${index + 1}_${cleanName}`;
        const { error: uploadError } = await window.globalPocketBase.storage.from("documentos").upload(path, file);
        if (uploadError) throw uploadError;
        evidenceItems.push({
          id: `evidence_${stamp}_${index + 1}`,
          path,
          file_name: cleanName,
          uploaded_at: uploadedAt,
          mime_type: file.type || "image/jpeg",
          size: file.size || 0
        });
      }
      const detailsEvent = __pmParseRecordJson(order.detalles_evento);
      const payload = {
        status: "finalizada",
        detalles_evento: {
          ...detailsEvent,
          convenio: {
            ...convenioMeta,
            activo: true,
            bloqueo_indefinido: __pmOrderBlocksIndefinitely(order),
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
      const { error } = await __pmQuotesUpdate(orderId, payload);
      if (error) throw error;
      currentPreviewOrder = currentPreviewOrder && String(currentPreviewOrder.id || "") === orderId
        ? { ...currentPreviewOrder, ...payload }
        : currentPreviewOrder;
      const statusSelect = document.getElementById("oed-status");
      if (statusSelect) statusSelect.value = "finalizada";
      if (typeof applyStatusVisual === "function") applyStatusVisual();
      allOrders = (allOrders || []).map((item) => String(item?.id || "") === orderId ? { ...item, ...payload } : item);
      signalOrdersRefresh("convenio_evidence");
      window.showToast("Convenio finalizado con evidencias.", "success");
      window.closePmEvidenceUploadModal();
      if (pmDetailTab === "expediente") await __pmRenderExpedientePanel();
      if (!(IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode() || IS_PM_ORDER_DETAIL_PAGE)) await window.loadOrders();
    } catch (e) {
      window.showToast(`No se pudieron guardar las evidencias: ${e?.message || e}`, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-camera mr-1"></i>Finalizar Cotización'; }
    }
  };
  window.closePmEvidenceGallery = function () {
    __pmEvidenceGalleryItems = [];
    __pmEvidenceGalleryIndex = 0;
    const img = document.getElementById("pm-evidence-gallery-image");
    const title = document.getElementById("pm-evidence-gallery-title");
    const meta = document.getElementById("pm-evidence-gallery-meta");
    const thumbs = document.getElementById("pm-evidence-gallery-thumbs");
    const counter = document.getElementById("pm-evidence-gallery-counter");
    if (img) img.removeAttribute("src");
    if (title) title.textContent = "Evidencia";
    if (meta) meta.textContent = "Sin información.";
    if (thumbs) thumbs.innerHTML = "";
    if (counter) counter.textContent = "0 / 0";
    window.closeModal?.("pm-evidence-gallery-modal");
  };
  const __pmRenderEvidenceGallery = () => {
    __pmEnsureEvidenceModals();
    const items = __pmEvidenceGalleryItems || [];
    if (!items.length) return;
    __pmEvidenceGalleryIndex = Math.max(0, Math.min(__pmEvidenceGalleryIndex, items.length - 1));
    const item = items[__pmEvidenceGalleryIndex];
    const img = document.getElementById("pm-evidence-gallery-image");
    const title = document.getElementById("pm-evidence-gallery-title");
    const meta = document.getElementById("pm-evidence-gallery-meta");
    const thumbs = document.getElementById("pm-evidence-gallery-thumbs");
    const counter = document.getElementById("pm-evidence-gallery-counter");
    if (img) img.src = item.signedUrl || "";
    if (title) title.textContent = item.label || `Evidencia ${__pmEvidenceGalleryIndex + 1}`;
    if (meta) meta.textContent = `${item.file_name || "archivo"}${item.uploaded_at ? ` • ${window.safeFormatDate(item.uploaded_at.slice(0, 10))}` : ""}`;
    if (counter) counter.textContent = `${__pmEvidenceGalleryIndex + 1} / ${items.length}`;
    if (thumbs) {
      thumbs.innerHTML = items.map((entry, index) => `<button type="button" onclick="window.selectPmEvidence(${index})" class="overflow-hidden rounded-xl border ${index === __pmEvidenceGalleryIndex ? "border-brand-red ring-2 ring-brand-red/20" : "border-gray-200"} bg-white">
          <img src="${__pmExpedienteEscape(entry.signedUrl || "")}" alt="${__pmExpedienteEscape(entry.label || `Evidencia ${index + 1}`)}" class="h-20 w-24 object-cover">
        </button>`).join("");
    }
  };
  window.selectPmEvidence = function (index) {
    if (!__pmEvidenceGalleryItems.length) return;
    __pmEvidenceGalleryIndex = Math.max(0, Math.min(parseInt(index, 10) || 0, __pmEvidenceGalleryItems.length - 1));
    __pmRenderEvidenceGallery();
  };
  window.prevPmEvidence = function () {
    if (!__pmEvidenceGalleryItems.length) return;
    __pmEvidenceGalleryIndex = (__pmEvidenceGalleryIndex - 1 + __pmEvidenceGalleryItems.length) % __pmEvidenceGalleryItems.length;
    __pmRenderEvidenceGallery();
  };
  window.nextPmEvidence = function () {
    if (!__pmEvidenceGalleryItems.length) return;
    __pmEvidenceGalleryIndex = (__pmEvidenceGalleryIndex + 1) % __pmEvidenceGalleryItems.length;
    __pmRenderEvidenceGallery();
  };
  window.downloadPmEvidenceFile = async function (path, fileName = "evidencia.jpg") {
    const signed = await __pmCreateSignedStorageUrl(path);
    if (!signed) return window.showToast("No se pudo preparar la evidencia.", "error");
    try {
      const response = await fetch(signed, { method: "GET", credentials: "omit" });
      if (!response.ok) throw new Error(`No se pudo descargar la evidencia (${response.status}).`);
      const blob = await response.blob();
      if (typeof window.downloadBlobAsFile === "function") {
        window.downloadBlobAsFile(blob, fileName);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      }
    } catch (e) {
      window.showToast(`No se pudo descargar la evidencia: ${e?.message || e}`, "error");
    }
  };
  window.downloadCurrentPmEvidence = async function () {
    const item = __pmEvidenceGalleryItems[__pmEvidenceGalleryIndex];
    if (!item) return;
    await window.downloadPmEvidenceFile(item.path, item.file_name || `evidencia_${__pmEvidenceGalleryIndex + 1}.jpg`);
  };
  window.openPmEvidenceGallery = async function (orderId, startIndex = 0) {
    __pmEnsureEvidenceModals();
    const safeOrderId = String(orderId || currentPreviewOrder?.id || "").trim();
    if (!safeOrderId) return window.showToast("No se encontró la cotización.", "error");
    const order = await __pmEnsureOrderRecord(safeOrderId);
    if (!order) return window.showToast("No se encontró la cotización.", "error");
    const evidences = __pmGetConvenioEvidence(order);
    if (!evidences.length) return window.showToast("Aún no hay evidencias registradas.", "info");
    const items = await Promise.all(evidences.map(async (item, index) => ({
      ...item,
      label: `Evidencia ${index + 1}`,
      signedUrl: await __pmCreateSignedStorageUrl(item.path)
    })));
    __pmEvidenceGalleryItems = items.filter((item) => !!item.signedUrl);
    if (!__pmEvidenceGalleryItems.length) return window.showToast("No se pudieron cargar las evidencias.", "error");
    __pmEvidenceGalleryIndex = Math.max(0, Math.min(parseInt(startIndex, 10) || 0, __pmEvidenceGalleryItems.length - 1));
    __pmRenderEvidenceGallery();
    window.openModal?.("pm-evidence-gallery-modal");
  };
  async function __pmRenderExpedientePanel() {
    const grid = document.getElementById("oed-expediente-grid");
    if (!grid) return;
    __pmEnsureEvidenceModals();
    const renderSeq = ++__pmExpedienteRenderSeq;
    grid.innerHTML = '<div class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-sm font-bold text-gray-400">Construyendo expediente...</div>';
    __pmClearExpedienteObjectUrls();
    try {
      const order = await __pmComposeExpedienteSourceOrder();
      if (renderSeq !== __pmExpedienteRenderSeq) return;
      const isConvenio = __pmIsConvenioOrder(order);
      const docMeta = __pmGetQuoteDocumentMeta(order);
      const convenioMeta = __pmParseConvenioMeta(order);
      const convenioEvidence = __pmGetConvenioEvidence(order);
      const evidenceButtonsWrap = document.getElementById("expediente-evidence-buttons");
      const paymentsButtonsWrap = document.getElementById("payments-sub-buttons");
      const paymentsToggleBtn = document.getElementById("btn-pagos-toggle");
      const facturaBtn = document.getElementById("btn-factura");
      const contratoBtn = document.getElementById("btn-contrato");
      if (paymentsButtonsWrap) paymentsButtonsWrap.classList.add("hidden");
      if (paymentsToggleBtn) paymentsToggleBtn.classList.toggle("hidden", isConvenio);
      if (facturaBtn) facturaBtn.classList.toggle("hidden", isConvenio);
      if (contratoBtn) contratoBtn.classList.toggle("hidden", isConvenio);
      if (evidenceButtonsWrap) {
        const toolbarButtons = [];
        if (isConvenio && String(order.status || "").toLowerCase() === "aprobada" && convenioEvidence.length < 3) {
          toolbarButtons.push(`<button type="button" onclick="window.openPmEvidenceUploadModal('${order.id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg transition flex items-center gap-2"><i class="fa-solid fa-camera"></i> Finalizar con Evidencia</button>`);
        }
        convenioEvidence.forEach((item, index) => {
          toolbarButtons.push(`<button type="button" onclick="window.openPmEvidenceGallery('${order.id}', ${index})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 px-4 py-2 rounded-xl font-bold text-sm uppercase tracking-wide transition flex items-center gap-2"><i class="fa-solid fa-image"></i> Evidencia ${index + 1}</button>`);
        });
        evidenceButtonsWrap.innerHTML = toolbarButtons.join("");
        evidenceButtonsWrap.classList.toggle("hidden", !toolbarButtons.length);
      }
      const details = parseDetail(order.espacios_detalle);
      const spacesCount = details.length || (order.espacio_id ? 1 : 0);
      const totalNet = money(parseFloat(order.precio_final || pmTotals?.final || 0) || 0);
      const draftMeta = __pmResolveDraftSnapshotMeta(order);
      const draftSnapshotUrl = draftMeta.path ? await __pmCreateSignedStorageUrl(draftMeta.path) : "";
      const approvedStatus = ["aprobada", "finalizada"].includes(String(order.status || "").toLowerCase());
      const draftPreviewSrc = draftSnapshotUrl || await __pmBuildPreviewObjectUrl("quote", order);
      const draftPreviewTitle = docMeta.isConvenio ? "Convenio" : docMeta.draftTitle;
      const docs = [];

        docs.push({
          title: docMeta.draftTitle,
          description: draftSnapshotUrl ? "Documento archivado actualmente en el expediente." : "Vista previa viva del documento actual editable.",
          badge: draftSnapshotUrl ? "Archivado" : "Editable",
          badgeTone: draftSnapshotUrl ? "emerald" : "amber",
        metaRows: [
          { label: "Folio", value: draftMeta.folio || "--" },
          { label: "Estado", value: String(order.status || "pendiente").toUpperCase() },
          { label: "Espacios", value: String(spacesCount || 0) },
          { label: "Total Neto", value: totalNet },
          { label: "Snapshot", value: draftSnapshotUrl ? "Guardada" : "Pendiente" }
          ],
          previewType: "iframe",
          previewSrc: draftPreviewSrc,
          actions: [
            { label: "Vista Completa", icon: "fa-solid fa-expand", tone: "slate", onclick: `window.openPmExpedienteLivePreview("quote", ${JSON.stringify(draftPreviewTitle)})` },
            ...(draftSnapshotUrl ? [{ label: "Abrir Archivada", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: `window.openPmExpedientePreview(${JSON.stringify(draftPreviewSrc)}, ${JSON.stringify(draftPreviewTitle)})` }] : [])
          ]
        });

      if (order.url_cotizacion_final) {
        const approvedUrl = await __pmCreateSignedStorageUrl(order.url_cotizacion_final);
        docs.push({
          title: docMeta.approvedTitle,
          description: "Snapshot oficial almacenada en el expediente.",
          badge: "Oficial",
          badgeTone: "emerald",
          metaRows: [
            { label: "Folio", value: draftMeta.folio || "--" },
            { label: "Estado", value: "APROBADA" },
            { label: "Archivo", value: order.url_cotizacion_final.split("/").pop() || `${docMeta.approvedStorageBase}.pdf` },
            { label: "Total Neto", value: totalNet }
          ],
          previewType: approvedUrl ? "iframe" : "message",
          previewSrc: approvedUrl,
          previewMessage: "No se pudo generar la vista firmada del archivo aprobado.",
          actions: [
            { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: approvedUrl ? `window.openPmExpedientePreview(${JSON.stringify(approvedUrl)}, ${JSON.stringify(docMeta.approvedTitle)})` : `window.openStoredDocument(${JSON.stringify(order.url_cotizacion_final)})` }
          ]
        });
      }

      if (!isConvenio && order.url_orden_compra) {
        const ocUrl = await __pmCreateSignedStorageUrl(order.url_orden_compra);
        docs.push({
          title: "Orden de Compra",
          description: "Orden archivada en storage y vinculada a la cotización.",
          badge: "Archivada",
          badgeTone: "purple",
          metaRows: [
            { label: "Folio", value: draftMeta.folio || "--" },
            { label: "Estado", value: String(order.status || "pendiente").toUpperCase() },
            { label: "Archivo", value: order.url_orden_compra.split("/").pop() || "orden_compra.pdf" },
            { label: "Total Neto", value: totalNet }
          ],
          previewType: ocUrl ? "iframe" : "message",
          previewSrc: ocUrl,
          previewMessage: "No se pudo cargar la orden almacenada.",
          actions: [
            { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "slate", onclick: ocUrl ? `window.openPmExpedientePreview(${JSON.stringify(ocUrl)}, ${JSON.stringify("Orden de Compra")})` : `window.openStoredDocument(${JSON.stringify(order.url_orden_compra)})` }
          ]
        });
      } else if (!isConvenio) {
        const orderPreviewSrc = approvedStatus ? await __pmBuildPreviewObjectUrl("order", order) : "";
        docs.push({
          title: "Orden de Compra",
          description: approvedStatus ? "Genera y archiva la orden oficial desde esta misma vista." : "La orden de compra se habilita cuando la cotización ya está aprobada.",
          badge: approvedStatus ? "Pendiente" : "Bloqueada",
          badgeTone: approvedStatus ? "amber" : "red",
          metaRows: [
            { label: "Folio", value: draftMeta.folio || "--" },
            { label: "Estado", value: String(order.status || "pendiente").toUpperCase() },
            { label: "Archivo", value: "Sin generar" },
            { label: "Total Neto", value: totalNet }
          ],
          previewType: approvedStatus ? "iframe" : "message",
          previewSrc: orderPreviewSrc,
          previewMessage: approvedStatus ? "" : "Aprueba la cotización para habilitar la orden de compra.",
          actions: approvedStatus
            ? [
                { label: "Vista Completa", icon: "fa-solid fa-expand", tone: "slate", onclick: `window.openPmExpedienteLivePreview("order", ${JSON.stringify("Orden de Compra")})` }
              ]
            : []
        });
      }

      if (isConvenio) {
        if (String(order.status || "").toLowerCase() === "aprobada" && convenioEvidence.length < 3) {
          docs.push({
            title: "Evidencia Pendiente",
            description: "Este convenio no solicita factura, contrato ni recibos. Para finalizarlo debes subir de 3 a 5 fotografías de evidencia.",
            badge: "Pendiente",
            badgeTone: "amber",
            metaRows: [
              { label: "Espacio bloqueado", value: __pmOrderBlocksIndefinitely(order) ? "Indefinido" : "Sí" },
              { label: "Rango requerido", value: "3 a 5 imágenes" },
              { label: "Documentación", value: "Solo evidencia" }
            ],
            previewType: "message",
            previewMessage: "Sube la evidencia fotográfica para finalizar el convenio.",
            actions: [
              { label: "Subir Evidencias", icon: "fa-solid fa-camera", tone: "brand", onclick: `window.openPmEvidenceUploadModal(${JSON.stringify(order.id)})` }
            ]
          });
        }
        convenioEvidence.forEach((evidence, index) => {
          docs.push({
            title: `Evidencia ${index + 1}`,
            description: "Registro fotográfico del cumplimiento del convenio.",
            badge: "Evidencia",
            badgeTone: "amber",
            metaRows: [
              { label: "Archivo", value: evidence.file_name || `evidencia_${index + 1}.jpg` },
              { label: "Fecha", value: evidence.uploaded_at ? window.safeFormatDate(String(evidence.uploaded_at).slice(0, 10)) : "--" },
              { label: "Documento", value: "Evidencia fotográfica" }
            ],
            previewType: "message",
            previewMessage: "Cargando evidencia...",
            previewSrcPromise: __pmCreateSignedStorageUrl(evidence.path),
            previewAsImage: true,
            path: evidence.path,
            fileName: evidence.file_name || `evidencia_${index + 1}.jpg`,
            actions: [
              { label: "Abrir Galería", icon: "fa-solid fa-images", tone: "slate", onclick: `window.openPmEvidenceGallery(${JSON.stringify(order.id)}, ${index})` },
              { label: "Descargar", icon: "fa-solid fa-download", tone: "emerald", onclick: `window.downloadPmEvidenceFile(${JSON.stringify(evidence.path)}, ${JSON.stringify(evidence.file_name || `evidencia_${index + 1}.jpg`)})` }
            ]
          });
        });
      } 

      // Contrato en Blanco
      if (order.contrato_en_blanco_url || order.contrato_url) {
        const urlToUse = order.contrato_en_blanco_url || order.contrato_url;
        const contractUrl = await __pmCreateSignedStorageUrl(urlToUse);
        docs.push({
          title: "Contrato en Blanco",
          description: "Documento contractual generado por el sistema.",
          badge: "Autogenerado",
          badgeTone: "slate",
          metaRows: [
            { label: "Archivo", value: urlToUse.split("/").pop() || "contrato_en_blanco.pdf" },
            { label: "Cliente", value: order.cliente_nombre || "--" }
          ],
          previewType: contractUrl ? "iframe" : "message",
          previewSrc: contractUrl,
          previewMessage: "No se pudo cargar el contrato en blanco.",
          actions: [
            { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "slate", onclick: contractUrl ? `window.openPmExpedientePreview(${JSON.stringify(contractUrl)}, ${JSON.stringify("Contrato en Blanco")})` : `window.openStoredDocument(${JSON.stringify(urlToUse)})` }
          ]
        });
      }

      // Contrato Firmado
      if (order.contrato_firmado_url) {
        const contractUrl = await __pmCreateSignedStorageUrl(order.contrato_firmado_url);
        docs.push({
          title: "Contrato Firmado",
          description: "Documento contractual con firmas almacenado.",
          badge: "Adjunto",
          badgeTone: "emerald",
          metaRows: [
            { label: "Archivo", value: order.contrato_firmado_url.split("/").pop() || "contrato_firmado.pdf" },
            { label: "Cliente", value: order.cliente_nombre || "--" }
          ],
          previewType: contractUrl ? "iframe" : "message",
          previewSrc: contractUrl,
          previewMessage: "No se pudo cargar el contrato firmado.",
          actions: [
            { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: contractUrl ? `window.openPmExpedientePreview(${JSON.stringify(contractUrl)}, ${JSON.stringify("Contrato Firmado")})` : `window.openStoredDocument(${JSON.stringify(order.contrato_firmado_url)})` }
          ]
        });
      }

      if (!isConvenio && order.factura_pdf_url) {
        const invoiceUrl = await __pmCreateSignedStorageUrl(order.factura_pdf_url);
        docs.push({
          title: "Factura PDF",
          description: "Factura fiscal registrada para la cotización.",
          badge: "Fiscal",
          badgeTone: "emerald",
          metaRows: [
            { label: "Archivo", value: order.factura_pdf_url.split("/").pop() || "factura.pdf" },
            { label: "Cliente", value: order.cliente_nombre || "--" }
          ],
          previewType: invoiceUrl ? "iframe" : "message",
          previewSrc: invoiceUrl,
          previewMessage: "No se pudo cargar la factura.",
          actions: [
            { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: invoiceUrl ? `window.openPmExpedientePreview(${JSON.stringify(invoiceUrl)}, ${JSON.stringify("Factura PDF")})` : `window.openStoredDocument(${JSON.stringify(order.factura_pdf_url)})` },
            ...(order.factura_xml_url ? [{ label: "Descargar XML", icon: "fa-solid fa-file-code", tone: "slate", onclick: `window.openStoredDocument(${JSON.stringify(order.factura_xml_url)})` }] : [])
          ]
        });
      } else if (!isConvenio && order.factura_xml_url) {
        docs.push({
          title: "XML Factura",
          description: "Archivo XML disponible para descarga.",
          badge: "XML",
          badgeTone: "amber",
          metaRows: [
            { label: "Archivo", value: order.factura_xml_url.split("/").pop() || "factura.xml" }
          ],
          previewType: "message",
          previewMessage: "El XML no tiene vista previa embebida; usa el botón para descargarlo.",
          actions: [
            { label: "Descargar XML", icon: "fa-solid fa-file-code", tone: "slate", onclick: `window.openStoredDocument(${JSON.stringify(order.factura_xml_url)})` }
          ]
        });
      }

      if (!isConvenio) __pmParsePaymentsForExpediente(order).forEach((payment, idx) => {
        const safePath = String(payment?.file_path || payment?.path || payment?.url || "").trim();
        if (!safePath) return;
        const type = String(payment?.type || payment?.tipo || "").toLowerCase();
        const isClosure = type === "constancia_liquidacion" || payment?.closed === true || payment?.is_closure === true;
        docs.push({
          title: isClosure ? "Constancia de Liquidación" : `Recibo ${idx + 1}`,
          description: isClosure ? "Documento final del cierre de pagos." : "Comprobante de pago registrado en la cotización.",
          badge: "Pago",
          badgeTone: "emerald",
          metaRows: [
            { label: "Archivo", value: safePath.split("/").pop() || "recibo.pdf" },
            { label: "Tipo", value: isClosure ? "Liquidación" : "Recibo" }
          ],
          previewType: "message",
          previewMessage: "Cargando vista previa...",
          previewSrcPromise: __pmCreateSignedStorageUrl(safePath),
          path: safePath
        });
      });

      const resolvedDocs = await Promise.all(docs.map(async (doc) => {
        if (doc.previewSrcPromise) {
          const signed = await doc.previewSrcPromise;
          return {
            ...doc,
            previewType: signed ? (doc.previewAsImage ? "image" : "iframe") : "message",
            previewSrc: signed,
            previewMessage: signed ? "" : "No se pudo cargar el documento."
          };
        }
        return doc;
      }));
      if (renderSeq !== __pmExpedienteRenderSeq) return;
      grid.innerHTML = resolvedDocs.length
        ? resolvedDocs.map((doc) => {
            if (doc.path && !doc.actions) {
              doc.actions = [doc.previewSrc
                ? { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: `window.openPmExpedientePreview(${JSON.stringify(doc.previewSrc)}, ${JSON.stringify(doc.title || "Documento")})` }
                : { label: "Abrir Documento", icon: "fa-solid fa-folder-open", tone: "emerald", onclick: `window.openStoredDocument(${JSON.stringify(doc.path)})` }];
            }
            return __pmRenderExpedienteCard(doc);
          }).join("")
        : '<div class="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-6 text-sm font-bold text-gray-400">Aún no hay documentos registrados en este expediente.</div>';
    } catch (e) {
      if (renderSeq !== __pmExpedienteRenderSeq) return;
      grid.innerHTML = `<div class="rounded-2xl border border-dashed border-red-200 bg-red-50 px-5 py-6 text-sm font-bold text-red-600">No se pudo construir el expediente: ${__pmExpedienteEscape(e?.message || e)}</div>`;
    }
  }
  window.savePmDraftSnapshot = async function (btnEl = null) {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    const btn = btnEl instanceof HTMLElement ? btnEl : null;
    const original = btn?.innerHTML || "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Guardando...</span>'; }
    try {
      const order = await __pmComposeExpedienteSourceOrder();
      const draftMeta = __pmResolveDraftSnapshotMeta(order);
      if (!draftMeta.orderId || !draftMeta.path) throw new Error("No se pudo identificar la cotización.");
      const { blob } = await __pmBuildDocumentBlob("quote", order);
      await window.globalPocketBase.storage.from("documentos").upload(draftMeta.path, blob, { upsert: true });
      currentPreviewOrder = { ...currentPreviewOrder, __draft_snapshot_path: draftMeta.path };
      window.showToast("Snapshot de borrador guardada en el expediente.", "success");
      await __pmRenderExpedientePanel();
    } catch (e) {
      window.showToast(`No se pudo guardar el borrador: ${e?.message || e}`, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  };
  window.savePmPurchaseOrderSnapshot = async function (btnEl = null) {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    const btn = btnEl instanceof HTMLElement ? btnEl : null;
    const original = btn?.innerHTML || "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Guardando...</span>'; }
    try {
      const order = await __pmComposeExpedienteSourceOrder();
      if (__pmIsConvenioOrder(order)) throw new Error("Los convenios no generan orden de compra.");
      const status = String(order?.status || currentPreviewOrder?.status || "").toLowerCase();
      if (!["aprobada", "finalizada"].includes(status)) throw new Error("La orden de compra solo se genera con cotizaciones aprobadas o finalizadas.");
      const { blob } = await __pmBuildDocumentBlob("order", order);
      const folio = __pmResolveQuoteFolio(order, order.id);
      const path = `${order.id}/orden_compra_${folio}.pdf`;
      await window.globalPocketBase.storage.from("documentos").upload(path, blob, { upsert: true });
      const fechaOrden = window.__serverDateService.nowISO();
      const { error } = await __pmQuotesUpdate(order.id, { url_orden_compra: path, fecha_orden_compra: fechaOrden });
      if (error) throw error;
      currentPreviewOrder = { ...currentPreviewOrder, ...order, url_orden_compra: path, fecha_orden_compra: fechaOrden };
      signalOrdersRefresh("purchase_order");
      window.showToast("Orden de compra archivada correctamente.", "success");
      await __pmRenderExpedientePanel();
    } catch (e) {
      window.showToast(`No se pudo guardar la orden de compra: ${e?.message || e}`, "error");
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  };
  const renderPmActiveSpaceSummary = (activeRow = null) => {
    const cfg = activeCfg();
    const space = getSpace(cfg?.spaceId);
    const row = activeRow || pmTotals.spaces.find((item) => String(item.cfg?.spaceId || "") === String(pmActive || "")) || null;
    const detailInfo = __pmResolveDetailMaterialMeasure({
      material: cfg?.material || "",
      ubicacion: cfg?.ubicacion || "",
      medida_ancho: cfg?.medidaAncho ?? null,
      medida_alto: cfg?.medidaAlto ?? null,
      medida_unidad: cfg?.medidaUnit || "M"
    }, space || {});
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const rangeLabel = (cfg?.startDate && cfg?.endDate)
      ? `${window.safeFormatDate(cfg.startDate)} - ${pmCfgBlocksIndefinitely(cfg, space) ? "Indefinido" : window.safeFormatDate(cfg.endDate)}`
      : "--";
    const measureLabel = (detailInfo.medida_ancho !== null && detailInfo.medida_ancho !== undefined && detailInfo.medida_alto !== null && detailInfo.medida_alto !== undefined)
      ? `${detailInfo.medida_ancho} x ${detailInfo.medida_alto} ${detailInfo.medida_unidad || "M"}`
      : "--";
    const modeLabel = cfg?.convenioEnabled
      ? "Convenio"
      : cfg?.customPriceEnabled
      ? (cfg?.customPriceMode === "per_day" ? "Precio manual por día" : "Precio manual total")
      : (cfg?.customPermanence ? `${pmSpaceDays(cfg)} dia(s) prorrateados` : "Periodo automático (30 días)");
    setText("oed-active-space-name", space?.nombre || cfg?.spaceId || "--");
    setText("oed-active-space-key", space?.clave || "--");
    setText("oed-active-space-type", cfg?.spaceType || space?.tipo || "--");
    setText("oed-active-space-location", detailInfo.ubicacion || "--");
    setText("oed-active-space-material", detailInfo.material ? __pmNormalizeMaterialLabel(detailInfo.material) : "--");
    setText("oed-active-space-measure", measureLabel);
    setText("oed-active-space-range", rangeLabel);
    setText("oed-active-space-days", cfg?.startDate ? `${pmSpaceDays(cfg)} dia(s)` : "--");
    setText("oed-active-space-mode", modeLabel);
    setText("oed-active-space-base", money(row?.base || resolvePmBaseTotal(cfg, space)));
    setText("oed-active-space-total", money(row?.total || row?.subtotalSpace || 0));
  };
  const PM_REFRESH_KEY = "pm_orders_refresh_signal";
  const signalOrdersRefresh = (reason = "saved") => {
    try { localStorage.setItem(PM_REFRESH_KEY, JSON.stringify({ ts: Date.now(), reason })); } catch (_) {}
    try {
      if (typeof window.__pmBroadcastOrdersRefresh === "function") {
        window.__pmBroadcastOrdersRefresh(reason);
        return;
      }
    } catch (_) {}
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "pm_orders_refresh", reason }, window.location.origin);
      }
    } catch (_) {}
  };
  const PM_ORDER_DATE_PICKER = { start: "", end: "", reserved: new Set() };
  let pmOrderEventPickerCal = null;
  const addDays = (ds, delta = 0) => {
    const n = iso(ds);
    if (!n) return "";
    const d = new Date(`${n}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const toYmd = (dateObj) => {
    if (!dateObj) return "";
    const d = new Date(dateObj);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const datesBetween = (startStr, endStr) => {
    const s = iso(startStr || "");
    const e = iso(endStr || s);
    if (!s || !e) return [];
    const start = new Date(`${s}T00:00:00`);
    const end = new Date(`${e}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
    return out;
  };
  const isApprovedStatus = (status) => ["aprobada", "finalizada"].includes(String(status || "").toLowerCase());
  async function renderPdfBlobFallback(sourceNode) {
    const sourceRoot = sourceNode?.firstElementChild || sourceNode;
    if (!sourceRoot) throw new Error("No hay contenido PDF para generar.");
    const hostId = "pm-order-pdf-fallback-host";
    let host = document.getElementById(hostId);
    if (!host) {
      host = document.createElement("div");
      host.id = hostId;
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.style.top = "0";
      host.style.width = "816px";
      host.style.maxWidth = "816px";
      host.style.minHeight = "1056px";
      host.style.zIndex = "-1";
      host.style.background = "#ffffff";
      host.style.pointerEvents = "none";
      document.body.appendChild(host);
    }
    const target = sourceRoot.cloneNode(true);
    target.removeAttribute?.("id");
    target.classList?.remove?.("hidden");
    if (typeof __pmStripPdfEditingChrome === "function") __pmStripPdfEditingChrome(target);
    target.style.width = "816px";
    target.style.minWidth = "816px";
    target.style.maxWidth = "816px";
    target.style.margin = "0";
    target.style.boxSizing = "border-box";
    target.style.background = "#ffffff";
    host.replaceChildren(target);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const width = Math.max(816, Math.ceil(target.scrollWidth || 0), Math.ceil(target.getBoundingClientRect?.().width || 0));
    const blob = await html2pdf().set({
      margin: 0,
      image: { type: "jpeg", quality: 0.98 },
      pagebreak: { mode: ["css", "legacy"] },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: width,
        windowHeight: 1056,
        width,
        backgroundColor: "#ffffff"
      },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    }).from(target).output("blob");
    host.innerHTML = "";
    if (!blob || blob.size < 4096) throw new Error("No se pudo generar el PDF.");
    return blob;
  }

  function refreshCalendarLayout(calendar) {
    if (!calendar || typeof calendar.updateSize !== "function") return;
    const refresh = () => {
      try { calendar.updateSize(); } catch (_) {}
    };
    requestAnimationFrame(() => {
      refresh();
      setTimeout(refresh, 60);
      setTimeout(refresh, 180);
    });
  }

  function applyStatusVisual() {
    const sel = document.getElementById("oed-status");
    if (!sel) return;
    const v = String(sel.value || "").toLowerCase();
    sel.classList.remove(
      "border-amber-300", "bg-amber-50", "text-amber-700",
      "border-emerald-300", "bg-emerald-50", "text-emerald-700",
      "border-red-300", "bg-red-50", "text-red-700",
      "border-gray-300", "bg-white", "text-gray-700"
    );
    if (v === "pendiente") sel.classList.add("border-amber-300", "bg-amber-50", "text-amber-700");
    else if (v === "aprobada") sel.classList.add("border-emerald-300", "bg-emerald-50", "text-emerald-700");
    else if (v === "rechazada") sel.classList.add("border-red-300", "bg-red-50", "text-red-700");
    else sel.classList.add("border-gray-300", "bg-white", "text-gray-700");

    const sum = document.getElementById("sum-status");
    if (sum) {
      sum.classList.remove("text-amber-700", "text-emerald-700", "text-red-700", "text-gray-800");
      if (v === "pendiente") sum.classList.add("text-amber-700");
      else if (v === "aprobada") sum.classList.add("text-emerald-700");
      else if (v === "rechazada") sum.classList.add("text-red-700");
      else sum.classList.add("text-gray-800");
    }
  }

  function saveActiveFromForm() {
    const cfg = activeCfg();
    if (!cfg) return;
    const space = getSpace(cfg.spaceId);
    const editPolicy = __pmResolveDetailEditPolicy(cfg, space);
    cfg.customPermanence = !!document.getElementById("oed-custom-permanence")?.checked;
    cfg.convenioEnabled = !!document.getElementById("oed-convenio-enabled")?.checked;
    cfg.customPriceEnabled = cfg.convenioEnabled ? false : !!document.getElementById("oed-custom-price-enabled")?.checked;
    cfg.customPriceMode = String(document.getElementById("oed-space-custom-price-mode")?.value || cfg.customPriceMode || "total");
    cfg.startDate = iso(document.getElementById("oed-start")?.value || "");
    cfg.endDate = iso(document.getElementById("oed-end")?.value || "");
    cfg.customBasePrice = cfg.customPriceEnabled ? (() => {
      const raw = document.getElementById("oed-space-custom-price")?.value;
      if (raw === "" || raw === null || raw === undefined) return "";
      return Math.max(0, parseFloat(raw) || 0);
    })() : "";
    cfg.concepts = safeArr(currentConcepts).map(normConcept).filter((concept) => cfg.convenioEnabled || !__pmIsConvenioConceptItem(concept));
    cfg.material = editPolicy.lockedMaterial || cfg.material || "";
    cfg.ubicacion = editPolicy.lockedLocation || cfg.ubicacion || "";
    cfg.taxIds = resolveCfgTaxIds(cfg, getSpace(cfg.spaceId));
    normDates(cfg);
  }

  function syncPmSpaceFieldLocks(cfg) {
    const active = cfg || activeCfg();
    if (!active) return;
    const space = getSpace(active.spaceId);
    const editPolicy = __pmResolveDetailEditPolicy(active, space);
    if (!editPolicy.materialEditable) active.material = editPolicy.lockedMaterial;
    if (!editPolicy.locationEditable) active.ubicacion = editPolicy.lockedLocation;
  }

  function syncPmCustomPriceUi(cfg) {
    const active = cfg || activeCfg();
    const wrap = document.getElementById("oed-custom-price-wrap");
    const modeSelect = document.getElementById("oed-space-custom-price-mode");
    const label = document.getElementById("oed-space-custom-price-label");
    const hint = document.getElementById("oed-space-custom-price-hint");
    if (wrap) wrap.classList.toggle("hidden", !active?.customPriceEnabled || !!active?.convenioEnabled);
    if (modeSelect) modeSelect.value = String(active?.customPriceMode || "total");
    if (label) label.textContent = (active?.customPriceMode === "per_day")
      ? "Precio Personalizado por Día"
      : "Precio Personalizado del Espacio";
    if (hint) hint.textContent = (active?.customPriceMode === "per_day")
      ? "Se multiplicará por el número de días seleccionados."
      : "Define el total manual de la estancia seleccionada.";
  }

  function syncTaxUI() {
    const cfg = activeCfg();
    const box = document.getElementById("oed-taxes-list");
    if (!cfg || !box) return;
    const sp = getSpace(cfg.spaceId);
    cfg.taxIds = resolveCfgTaxIds(cfg, sp);
    box.innerHTML = renderAutoTaxSummary(cfg.taxIds, sp);
  }

  function loadActiveToForm() {
    ensureActive();
    const cfg = activeCfg();
    if (!cfg) return;
    normDates(cfg);
    const s = document.getElementById("oed-start");
    const e = document.getElementById("oed-end");
    if (s) s.value = cfg.startDate || "";
    if (e) { e.value = cfg.endDate || ""; e.min = cfg.startDate || ""; }
    const chk = document.getElementById("oed-custom-permanence");
    const customPriceChk = document.getElementById("oed-custom-price-enabled");
    const convenioChk = document.getElementById("oed-convenio-enabled");
    const wrap = document.getElementById("oed-custom-price-wrap");
    const price = document.getElementById("oed-space-custom-price");
    if (chk) chk.checked = !!cfg.customPermanence;
    if (customPriceChk) customPriceChk.checked = !!cfg.customPriceEnabled;
    if (convenioChk) convenioChk.checked = !!cfg.convenioEnabled;
    if (price) price.value = cfg.customBasePrice === "" ? "" : String(cfg.customBasePrice);
    currentConcepts = safeArr(cfg.concepts).map(normConcept);
    window.renderConceptsList();
    syncOrderConvenioUi(cfg);
    syncPmOrderDetailModeUi();
    syncTaxUI();
    syncPmSpaceFieldLocks(cfg);
    syncPmCustomPriceUi(cfg);
    updatePmSpaceConfigTitle();
    const sel = document.getElementById("oed-space");
    if (sel) {
      sel.innerHTML = "";
      selectedCfg().forEach((x) => {
        const sp = getSpace(x.spaceId);
        sel.innerHTML += `<option value="${x.spaceId}">${sp?.nombre || x.spaceId}</option>`;
      });
      sel.value = String(pmActive || "");
    }
    renderPmActiveSpaceSummary();
  }

  function getReservedDatesForSpace(spaceId) {
    const sid = String(spaceId || "");
    const reserved = new Set();
    const addDate = (ds) => {
      const n = iso(ds);
      if (n) reserved.add(n);
    };
    const addRange = (fi, ff) => {
      datesBetween(fi, ff).forEach(addDate);
    };
    (allOrders || []).forEach((order) => {
      if (!order || String(order.id) === String(currentPreviewOrder?.id || "")) return;
      if (!isApprovedStatus(order.status)) return;
      const orderBlocksIndefinitely = __pmOrderBlocksIndefinitely(order);
      const details = parseDetail(order.espacios_detalle);
      if (details.length) {
        details.forEach((item) => {
          const itemSid = String(item.espacio_id || item.space_id || "");
          if (itemSid !== sid) return;
          const eventDates = safeArr(item.fechas_evento).map(iso).filter(Boolean);
          if (eventDates.length) eventDates.forEach(addDate);
          else addRange(item.fecha_inicio, __pmSpaceDetailBlocksIndefinitely(item) ? PM_CONVENIO_INDEFINITE_END : item.fecha_fin);
        });
        return;
      }
      if (String(order.espacio_id || "") === sid) addRange(order.fecha_inicio, orderBlocksIndefinitely ? PM_CONVENIO_INDEFINITE_END : order.fecha_fin);
    });
    return reserved;
  }

  async function renderOrderDatePicker() {
    const grid = document.getElementById("order-date-fc");
    const startLbl = document.getElementById("order-date-picked-start");
    const endLbl = document.getElementById("order-date-picked-end");
    const list = document.getElementById("order-date-reserved-list");
    if (!grid) return;
    const cfg = activeCfg();
    if (!cfg) return;
    const reserved = getReservedDatesForSpace(cfg.spaceId);
    PM_ORDER_DATE_PICKER.reserved = reserved;

    if (startLbl) startLbl.textContent = PM_ORDER_DATE_PICKER.start ? window.safeFormatDate(PM_ORDER_DATE_PICKER.start) : "--";
    if (endLbl) endLbl.textContent = PM_ORDER_DATE_PICKER.end ? window.safeFormatDate(PM_ORDER_DATE_PICKER.end) : "--";

    const events = [];
    const pushEvent = (oid, fi, ff, title) => {
      const start = iso(fi || "");
      const end = iso(ff || fi || "");
      if (!start || !end) return;
      events.push({
        id: `${oid}-${cfg.spaceId}-${start}`,
        title: title || "Ocupado",
        start,
        end: addDays(end, 1),
        allDay: true,
        backgroundColor: "#1f2937",
        borderColor: "#1f2937",
        textColor: "#ffffff"
      });
    };

    (allOrders || []).forEach((order) => {
      if (!order || String(order.id) === String(currentPreviewOrder?.id || "")) return;
      if (!isApprovedStatus(order.status)) return;
      const orderBlocksIndefinitely = __pmOrderBlocksIndefinitely(order);
      const details = parseDetail(order.espacios_detalle);
      if (details.length) {
        details.forEach((item) => {
          if (String(item.espacio_id || item.space_id || "") !== String(cfg.spaceId)) return;
          const eventDates = safeArr(item.fechas_evento).map(iso).filter(Boolean).sort();
          if (eventDates.length) {
            let chunkStart = eventDates[0];
            let prev = eventDates[0];
            const flush = () => pushEvent(order.id, chunkStart, prev, order.cliente_nombre || "Ocupado");
            for (let i = 1; i < eventDates.length; i += 1) {
              if (eventDates[i] !== addDays(prev, 1)) {
                flush();
                chunkStart = eventDates[i];
              }
              prev = eventDates[i];
            }
            flush();
            return;
          }
          pushEvent(order.id, item.fecha_inicio, __pmSpaceDetailBlocksIndefinitely(item) ? PM_CONVENIO_INDEFINITE_END : item.fecha_fin, order.cliente_nombre || "Ocupado");
        });
      } else if (String(order.espacio_id || "") === String(cfg.spaceId)) {
        pushEvent(order.id, order.fecha_inicio, orderBlocksIndefinitely ? PM_CONVENIO_INDEFINITE_END : order.fecha_fin, order.cliente_nombre || "Ocupado");
      }
    });

    if (PM_ORDER_DATE_PICKER.start) {
      events.push({
        id: "__selection_event_pm",
        start: PM_ORDER_DATE_PICKER.start,
        end: addDays(PM_ORDER_DATE_PICKER.end || PM_ORDER_DATE_PICKER.start, 1),
        display: "background",
        backgroundColor: "rgba(16, 185, 129, 0.22)",
        borderColor: "transparent",
        allDay: true
      });
    }

    if (pmOrderEventPickerCal) {
      pmOrderEventPickerCal.destroy();
      pmOrderEventPickerCal = null;
    }
    pmOrderEventPickerCal = new FullCalendar.Calendar(grid, {
      initialView: "dayGridMonth",
      locale: "es",
      initialDate: PM_ORDER_DATE_PICKER.start || today(),
      height: "100%",
      buttonText: { today: "Hoy", month: "Mes", list: "Lista" },
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,listMonth" },
      events,
      dateClick: (info) => { window.pickOrderDate(info.dateStr); },
      dayCellDidMount: (arg) => {
        const ds = toYmd(arg.date);
        const isPast = ds < today();
        const isReserved = reserved.has(ds);
        if (isPast || isReserved) {
          arg.el.classList.add("opacity-60");
          arg.el.style.backgroundColor = isReserved ? "#fef2f2" : "#f3f4f6";
        }
        if (isReserved) {
          const frame = arg.el.querySelector(".fc-daygrid-day-frame");
          if (frame) {
            const ban = document.createElement("i");
            ban.className = "fa-solid fa-ban text-gray-300 text-base absolute inset-0 m-auto h-4 w-4 pointer-events-none";
            frame.style.position = "relative";
            frame.appendChild(ban);
          }
        }
      }
    });
    pmOrderEventPickerCal.render();

    if (list) {
      const rows = Array.from(reserved).filter((d) => d >= today()).sort().slice(0, 45);
      list.innerHTML = rows.length
        ? rows.map((d) => `<div class="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 font-bold">${window.safeFormatDate(d)}</div>`).join("")
        : '<p class="text-[10px] text-gray-400 italic">Sin reservas aprobadas visibles.</p>';
    }
  }

  function setDateOnForm(startDate, endDate) {
    const cfg = activeCfg();
    if (!cfg) return;
    const start = iso(startDate);
    const end = iso(endDate || start);
    if (start && start < today()) return window.showToast("No se permiten fechas pasadas.", "error");
    if (end && end < today()) return window.showToast("No se permiten fechas pasadas.", "error");
    const sEl = document.getElementById("oed-start");
    const eEl = document.getElementById("oed-end");
    if (sEl) sEl.value = start || "";
    if (eEl) eEl.value = end || "";
    saveActiveFromForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  }

  window.renderOrderSpaceCards = function () {
    const track = document.getElementById("oed-space-cards-track");
    if (!track) return;
    ensureActive();
    const locked = __pmIsLockedOrder();
    // order_detail debe renderizar el mismo catalogo filtrado que usamos para
    // validar altas; en convenio solo aparecen espacios publicitarios elegibles.
    const ids = listPmEditorSpaces()
      .map((space) => String(space.id))
      .filter((id, index, arr) => arr.indexOf(id) === index);
    track.className = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5";
    track.style.display = "";
    track.style.gridAutoFlow = "";
    track.style.gridTemplateRows = "";
    track.style.gridAutoColumns = "";
    track.style.gap = "";
    track.innerHTML = ids.map((sid) => {
      const sp = getSpace(sid);
      if (!canDisplayPmEditorSpace(sp)) return "";
      if (!sp) return "";
      let cfg = getCfg(sp.id);
      if (!cfg) cfg = mkCfg(sp.id, { selected: false });
      const sel = !!cfg.selected;
      const active = sel && String(pmActive) === String(sp.id);
      const card = active ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : (sel ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white hover:border-brand-red");
      const badge = active
        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
        : (sel ? "border-yellow-200 bg-yellow-100 text-yellow-700" : "border-gray-200 bg-gray-100 text-gray-500");
      const dateLabel = sel && cfg.startDate
        ? `${window.safeFormatDate(cfg.startDate)} - ${pmCfgBlocksIndefinitely(cfg, sp) ? "Indefinido" : window.safeFormatDate(cfg.endDate || cfg.startDate)}`
        : "--";
      const permanenceLabel = sel ? (cfg.convenioEnabled ? "Convenio" : (cfg.customPermanence ? "Personalizada" : "Automática")) : "--";
      const baseLabel = sel ? money(resolvePmDisplayedBase(cfg, sp)) : money(pmBaseUnitPrice(sp));
      const stateLabel = active ? "En edición" : (sel ? "Activa" : "Libre");
      const switchLabel = sel ? "En cotización" : "Agregar";
      return `<button type="button" ${locked ? "disabled" : `onclick="window.focusOrderSpaceCard('${sp.id}')"`} class="w-full h-full min-h-[126px] text-left rounded-xl border ${card} p-2.5 transition ${locked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}">
        <div class="flex h-full flex-col gap-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-[10px] font-black uppercase leading-tight whitespace-normal break-words text-gray-800">${sp.nombre || "--"}</p>
              <p class="text-[9px] font-mono text-gray-500 mt-1 truncate">${sp.clave ? `Clave: ${sp.clave}` : "--"}</p>
              <p class="mt-1 text-[10px] font-black text-gray-800">${baseLabel}</p>
            </div>
            <span class="shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${badge}">${stateLabel}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg border border-white/70 bg-white/70 p-2">
              <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Fechas</p>
              <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${dateLabel}</p>
            </div>
            <div class="rounded-lg border border-white/70 bg-white/70 p-2">
              <p class="text-[8px] font-black uppercase tracking-wide text-gray-400">Modo</p>
              <p class="mt-1 text-[9px] font-bold leading-tight text-gray-700 break-words">${permanenceLabel}</p>
            </div>
          </div>
          <div class="mt-auto flex items-center justify-between gap-2">
            <span class="text-[9px] font-bold uppercase tracking-wide ${active ? "text-emerald-700" : (sel ? "text-brand-red" : "text-gray-400")}">${switchLabel}</span>
            <label class="relative inline-flex items-center ${locked ? "cursor-not-allowed" : "cursor-pointer"}" onclick="event.stopPropagation()">
              <input type="checkbox" ${locked ? "disabled" : ""} ${sel ? "checked" : ""} onchange="window.toggleOrderSpaceSwitch('${sp.id}', this.checked)" class="sr-only peer">
              <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 peer-checked:after:border-white"></div>
            </label>
          </div>
        </div>
      </button>`;
    }).join("");
  };

  window.selectOrderSpaceCard = function (sid) {
    if (__pmIsLockedOrder()) return;
    saveActiveFromForm();
    let cfg = getCfg(sid);
    const selectedCount = selectedCfg().length;
    if (cfg?.selected && String(pmActive) === String(sid) && selectedCount > 1) {
      cfg.selected = false;
      pmActive = String(selectedCfg()[0]?.spaceId || "");
      ensureActive();
      window.renderOrderSpaceCards();
      loadActiveToForm();
      window.recalcTotal();
      __pmScheduleOrderDetailAutoSave();
      return;
    }
    if (!cfg) {
      if (!canAddPmEditorSpace(sid)) return;
      const a = activeCfg();
      cfg = mkCfg(sid, { selected: true, customPermanence: !!a?.customPermanence, customPriceEnabled: !!a?.customPriceEnabled, customPriceMode: a?.customPriceMode || "total", convenioEnabled: !!a?.convenioEnabled, startDate: a?.startDate || "", endDate: a?.endDate || "", customBasePrice: a?.customBasePrice ?? "" });
      pmSpaces.push(cfg);
    }
    cfg.selected = true;
    pmActive = String(sid);
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.focusOrderSpaceCard = function (sid) {
    saveActiveFromForm();
    let cfg = getCfg(sid);
    if (!cfg) {
      if (!canAddPmEditorSpace(sid)) return;
      const a = activeCfg();
      cfg = mkCfg(sid, { selected: true, customPermanence: !!a?.customPermanence, customPriceEnabled: !!a?.customPriceEnabled, customPriceMode: a?.customPriceMode || "total", convenioEnabled: !!a?.convenioEnabled, startDate: a?.startDate || "", endDate: a?.endDate || "", customBasePrice: a?.customBasePrice ?? "" });
      pmSpaces.push(cfg);
    }
    cfg.selected = true;
    pmActive = String(sid);
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.toggleOrderSpaceSwitch = function (sid, enabled) {
    if (__pmIsLockedOrder()) return;
    saveActiveFromForm();
    let cfg = getCfg(sid);
    if (enabled) {
      if (!cfg) {
        if (!canAddPmEditorSpace(sid)) {
          window.renderOrderSpaceCards();
          return;
        }
        const a = activeCfg();
        cfg = mkCfg(sid, { selected: true, customPermanence: !!a?.customPermanence, customPriceEnabled: !!a?.customPriceEnabled, customPriceMode: a?.customPriceMode || "total", convenioEnabled: !!a?.convenioEnabled, startDate: a?.startDate || "", endDate: a?.endDate || "", customBasePrice: a?.customBasePrice ?? "" });
        pmSpaces.push(cfg);
      }
      cfg.selected = true;
      pmActive = String(sid);
    } else {
      const count = selectedCfg().length;
      if (cfg?.selected && count <= 1) { window.showToast("La cotización debe conservar al menos un espacio activo.", "error"); window.renderOrderSpaceCards(); return; }
      if (cfg) cfg.selected = false;
      if (String(pmActive) === String(sid)) pmActive = String(selectedCfg()[0]?.spaceId || "");
    }
    ensureActive();
    window.renderOrderSpaceCards();
    loadActiveToForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.toggleOrderCustomPermanence = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    cfg.customPermanence = !!document.getElementById("oed-custom-permanence")?.checked;
    normDates(cfg);
    loadActiveToForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.toggleOrderCustomPrice = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    cfg.customPriceEnabled = !!document.getElementById("oed-custom-price-enabled")?.checked;
    if (!cfg.customPriceEnabled) cfg.customBasePrice = "";
    loadActiveToForm();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.toggleOrderConvenio = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    const activeSpace = getSpace(cfg.spaceId);
    if (!__pmSpaceAllowsConvenio(activeSpace) && !cfg.convenioEnabled) {
      const checkbox = document.getElementById("oed-convenio-enabled");
      if (checkbox) checkbox.checked = false;
      return window.showToast("Este espacio no tiene permitido usar convenio.", "error");
    }
    cfg.convenioEnabled = !!document.getElementById("oed-convenio-enabled")?.checked;
    if (!cfg.convenioEnabled) {
      currentConcepts = regularConcepts(currentConcepts);
      cfg.concepts = regularConcepts(cfg.concepts);
    } else {
      cfg.customPriceEnabled = false;
      cfg.customBasePrice = "";
      const customPriceField = document.getElementById("oed-space-custom-price");
      if (customPriceField) customPriceField.value = "";
    }
    loadActiveToForm();
    window.renderOrderSpaceCards();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.addOrderConvenioItem = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder() || !cfg.convenioEnabled) return;
    const optionId = String(document.getElementById("oed-convenio-select")?.value || "").trim();
    const cantidad = Math.max(1, parseInt(document.getElementById("oed-convenio-qty")?.value || 1, 10) || 1);
    const amountRaw = document.getElementById("oed-convenio-amount")?.value;
    const amount = Math.max(0, parseFloat(amountRaw || 0) || 0);
    if (!optionId) return window.showToast("Selecciona una opción de convenio.", "error");
    if (amount <= 0) return window.showToast("Captura el monto manual del trato.", "error");
    const option = pmConvenioCatalog.find((item) => String(item.id) === optionId);
    if (!option) return window.showToast("La opción de convenio ya no está disponible.", "error");
    currentConcepts.push(normConcept(__pmBuildConvenioConcept(option, cantidad, amount)));
    cfg.concepts = safeArr(currentConcepts).map(normConcept);
    const select = document.getElementById("oed-convenio-select");
    const qtyInput = document.getElementById("oed-convenio-qty");
    const amountInput = document.getElementById("oed-convenio-amount");
    if (select) select.value = "";
    if (qtyInput) qtyInput.value = "1";
    if (amountInput) amountInput.value = "";
    renderOrderConvenioItems();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.removeOrderConvenioItem = function (index) {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    let convenioVisibleIndex = -1;
    const next = safeArr(currentConcepts).filter((concept) => {
      if (!__pmIsConvenioConceptItem(concept)) return true;
      convenioVisibleIndex += 1;
      return convenioVisibleIndex !== index;
    });
    currentConcepts = next.map(normConcept);
    cfg.concepts = safeArr(currentConcepts).map(normConcept);
    renderOrderConvenioItems();
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.changePmCustomPriceMode = function () {
    const cfg = activeCfg();
    if (!cfg || __pmIsLockedOrder()) return;
    cfg.customPriceMode = String(document.getElementById("oed-space-custom-price-mode")?.value || "total");
    syncPmCustomPriceUi(cfg);
    window.recalcTotal();
    __pmScheduleOrderDetailAutoSave();
  };

  window.openOrderDatePicker = async function (_target = "start") {
    const cfg = activeCfg();
    if (!cfg) return;
    if (typeof FullCalendar === "undefined") return window.showToast("No se pudo cargar el calendario.", "error");
    PM_ORDER_DATE_PICKER.start = iso(document.getElementById("oed-start")?.value || cfg.startDate || "");
    PM_ORDER_DATE_PICKER.end = iso(document.getElementById("oed-end")?.value || cfg.endDate || PM_ORDER_DATE_PICKER.start || "");
    window.openModal("order-date-modal");
    await renderOrderDatePicker();
    refreshCalendarLayout(pmOrderEventPickerCal);
  };

  window.pickOrderDate = async function (ds) {
    const day = iso(ds);
    if (!day) return;
    if (day < today()) return window.showToast("No puedes seleccionar fechas pasadas.", "error");
    if (PM_ORDER_DATE_PICKER.reserved?.has(day)) return window.showToast(`La fecha ${window.safeFormatDate(day)} ya está ocupada para este espacio.`, "error");
    const cfg = activeCfg();
    if (!cfg) return;
    if (!cfg.customPermanence) {
      const m = monthBounds(day);
      const clash = datesBetween(m.s, m.e).find((d) => PM_ORDER_DATE_PICKER.reserved?.has(d));
      if (clash) return window.showToast(`Ese periodo automático de 30 días incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, "error");
      PM_ORDER_DATE_PICKER.start = m.s;
      PM_ORDER_DATE_PICKER.end = m.e;
      await renderOrderDatePicker();
      return;
    }
    if (!PM_ORDER_DATE_PICKER.start || PM_ORDER_DATE_PICKER.end) {
      PM_ORDER_DATE_PICKER.start = day;
      PM_ORDER_DATE_PICKER.end = "";
    } else if (day < PM_ORDER_DATE_PICKER.start) {
      PM_ORDER_DATE_PICKER.start = day;
    } else {
      const range = datesBetween(PM_ORDER_DATE_PICKER.start, day);
      const clash = range.find((d) => PM_ORDER_DATE_PICKER.reserved?.has(d));
      if (clash) return window.showToast(`El rango incluye fecha ocupada: ${window.safeFormatDate(clash)}.`, "error");
      PM_ORDER_DATE_PICKER.end = day;
    }
    await renderOrderDatePicker();
  };

  window.applyOrderDatePickerSelection = function () {
    if (!PM_ORDER_DATE_PICKER.start) return window.showToast("Selecciona al menos una fecha.", "error");
    setDateOnForm(PM_ORDER_DATE_PICKER.start, PM_ORDER_DATE_PICKER.end || PM_ORDER_DATE_PICKER.start);
    window.closeModal("order-date-modal");
  };

  window.onOrderTaxSelectionChanged = function () {
    const cfg = activeCfg();
    if (!cfg) return;
    cfg.taxIds = resolveCfgTaxIds(cfg, getSpace(cfg.spaceId));
    window.recalcTotal();
  };

  window.recalcTotal = function () {
    saveActiveFromForm();
    ensureActive();
    const rows = selectedCfg().map((cfg) => {
      const sp = getSpace(cfg.spaceId);
      normDates(cfg);
      const base = resolvePmBaseTotal(cfg, sp);
      const baseMeta = describePmPricingRule(cfg, sp, base);
      const concepts = safeArr(cfg.concepts).map(normConcept);
      const isConvenio = !!cfg.convenioEnabled;
      const regularItems = regularConcepts(concepts);
      const convenioItems = convenioConcepts(concepts);
      const regularTotal = regularItems.reduce((a, c) => a + (parseFloat(c.amount || c.value || 0) || 0), 0);
      const convenioValue = convenioItems.reduce((a, c) => a + (parseFloat(c.amount || c.value || 0) || 0), 0);
      const conceptsTotal = isConvenio ? convenioValue : regularTotal;
      const convenioCovered = isConvenio ? __pmConvenioCovered(base, convenioValue) : false;
      const blocksIndefinitely = convenioCovered && !__pmHasFiniteConvenioEndDate(cfg?.endDate);
      const subtotalSpace = isConvenio ? Math.max(0, base - convenioValue) : (base + regularTotal);
      const taxIds = isConvenio ? [] : resolveCfgTaxIds(cfg, sp);
      return {
        cfg,
        sp,
        base,
        baseMeta,
        isConvenio,
        convenioCovered,
        blocksIndefinitely,
        concepts: isConvenio ? convenioItems : regularItems,
        regularItems,
        convenioItems,
        conceptsTotal,
        convenioValue,
        subtotalSpace,
        taxIds,
        rate: isConvenio ? 0 : taxRate(taxIds)
      };
    });
    const convenioMode = rows.some((row) => row.isConvenio);
    const subtotalRaw = rows.reduce((a, r) => a + r.subtotalSpace, 0);
    const subtotalBase = rows.reduce((a, r) => a + r.base, 0);
    const convenioBaseTotal = rows.reduce((a, r) => a + (r.isConvenio ? r.base : 0), 0);
    const convenioDeliveredTotal = rows.reduce((a, r) => a + (r.isConvenio ? r.convenioValue : 0), 0);
    const catalogBaseTotal = rows.reduce((a, r) => a + (parseFloat(r.baseMeta?.referenceValue || pmBaseUnitPrice(r.sp) || 0) || 0), 0);
    const conceptsGlobal = rows.reduce((a, r) => a + (r.isConvenio ? r.convenioValue : r.conceptsTotal), 0);
    const normalizedAdj = convenioMode
      ? { adjType: "ninguno", adjVal: 0, isPct: false, adjustment: 0 }
      : normalizePmGlobalAdjustment(subtotalRaw, { showToast: true });
    const adjType = normalizedAdj.adjType;
    const adjVal = normalizedAdj.adjVal;
    const isPct = normalizedAdj.isPct;
    let adjustment = normalizedAdj.adjustment || 0;
    let adjusted = subtotalRaw;
    if (adjType !== "ninguno") {
      adjusted = adjType === "descuento" ? Math.max(0, subtotalRaw - adjustment) : subtotalRaw + adjustment;
    }
    let tax = 0;
    const taxTotalsByName = {};
    const denom = subtotalRaw > 0 ? subtotalRaw : 1;
    rows.forEach((r) => {
      const ratio = (subtotalRaw !== 0) ? (r.subtotalSpace / denom) : (1 / Math.max(1, rows.length));
      r.adjustedSubtotal = adjusted * ratio;
      r.adjustmentShare = r.adjustedSubtotal - r.subtotalSpace;
      if (r.isConvenio) r.adjustedSubtotal = r.subtotalSpace;
      r.tax = r.isConvenio ? 0 : (r.adjustedSubtotal * r.rate);
      r.total = r.adjustedSubtotal + r.tax;
      r.taxBreakdown = (r.isConvenio ? [] : (r.taxIds || [])).map((tid) => {
        const tax = __pmResolveTaxRecord(tid, r.sp);
        if (!tax) return null;
        const amount = r.adjustedSubtotal * __pmResolveTaxRate(tax);
        taxTotalsByName[tax.nombre || "Impuesto"] = (taxTotalsByName[tax.nombre || "Impuesto"] || 0) + amount;
        return {
          name: tax.nombre || "Impuesto",
          amount
        };
      }).filter(Boolean);
      tax += r.tax;
    });
    const final = adjusted + tax;
    pmTotals = {
      spaces: rows,
      subtotal: subtotalRaw,
      adjusted,
      adjustment,
      tax,
      final,
      adjType,
      subtotalBase,
      catalogBaseTotal,
      conceptsTotal: conceptsGlobal,
      taxByName: taxTotalsByName,
      convenioMode,
      convenioBaseTotal,
      convenioDeliveredTotal
    };

    const adjustmentModeLabel = adjType === "ninguno"
      ? (convenioMode ? "No aplica en convenio" : "Sin ajuste global")
      : `${adjType === "descuento" ? "Descuento" : "Aumento"} ${isPct ? `${adjVal}%` : money(adjVal)}`;
    const adjustmentExplanation = convenioMode
      ? "En convenio los tratos se restan del valor base del espacio y no se calculan impuestos."
      : adjType === "ninguno"
      ? "No se está aplicando ningún ajuste global sobre el subtotal previo a impuestos."
      : (isPct
        ? `${adjType === "descuento" ? "Se descuenta" : "Se aumenta"} ${adjVal}% sobre ${money(subtotalRaw)} antes de impuestos.`
        : `${adjType === "descuento" ? "Se descuenta" : "Se aumenta"} un monto fijo de ${money(adjVal)} sobre ${money(subtotalRaw)} antes de impuestos.`);

    const taxTotalsEntries = Object.entries(taxTotalsByName);
    const globalTaxCardHtml = `<div class="rounded-xl border border-gray-200 bg-slate-50 p-3 space-y-1.5">
        <div class="flex items-start justify-between gap-2">
            <p class="text-[10px] font-black uppercase text-gray-700">Impuestos acumulados</p>
            <span class="text-[9px] font-bold uppercase tracking-wide text-gray-400">Global</span>
        </div>
        ${taxTotalsEntries.length
          ? taxTotalsEntries.map(([name, amount]) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${name}</span><span>+${money(amount)}</span></div>`).join("")
          : '<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>'}
        <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Total impuestos</span><span>${money(tax)}</span></div>
    </div>`;

    const renderSpacePricingCard = (r) => {
      const active = String(r.cfg.spaceId) === String(pmActive);
      const spaceRef = r.sp?.clave ? `${r.sp?.nombre || r.cfg.spaceId} [${r.sp.clave}]` : (r.sp?.nombre || r.cfg.spaceId);
      const conceptRows = r.concepts.length
        ? r.concepts.map((c) => `<div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>${c.description}</span><span class="text-right ${r.isConvenio ? "text-amber-700 font-bold" : ""}">${r.isConvenio ? "-" : "+"}${money(c.amount)}</span></div>`).join("")
        : `<div class="text-[10px] text-gray-400 italic">${r.isConvenio ? "Sin tratos registrados en este espacio." : "Sin conceptos extra en este espacio."}</div>`;
      const detailRows = (r.baseMeta?.detailRows || []).map((row) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${row.label}</span><span class="text-right">${row.value}</span></div>`).join("");
      if (r.isConvenio) {
        return `<button type="button" onclick="window.focusOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${pmSummaryStateClass(active)} p-3 space-y-3 transition hover:border-brand-red">
          <div class="flex items-start justify-between gap-2">
              <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
              ${pmSummaryStateLabel(active)}
          </div>
          <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
              <div class="flex justify-between text-[10px] text-gray-500"><span>Modo</span><span class="text-right font-bold text-gray-700">${r.baseMeta?.modeLabel || "Convenio"}</span></div>
              <div class="flex justify-between text-[10px] text-gray-500"><span>Valor base del espacio</span><span>${money(r.base)}</span></div>
              ${detailRows}
              <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Regla aplicada</span><span class="text-right max-w-[230px] font-bold text-gray-700">${r.baseMeta?.explanation || money(r.base)}</span></div>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-1.5">
              <p class="text-[10px] font-bold uppercase text-amber-700">Tratos del convenio</p>
              ${conceptRows}
              <div class="flex justify-between text-[10px] font-bold text-amber-800 border-t border-dashed border-amber-200 pt-1"><span>Total entregable</span><span>${money(r.convenioValue)}</span></div>
          </div>
          <div class="space-y-1.5">
              <div class="flex justify-between text-[10px] text-gray-500"><span>Balance del convenio</span><span class="${r.total < 0 ? "text-red-600" : (r.total > 0 ? "text-emerald-700" : "text-gray-500")}">${signedMoney(r.total)}</span></div>
              <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Estado actual</span><span>${Math.abs(r.total) < 0.005 ? "Justo" : (r.total > 0 ? "A favor del espacio" : "A favor del trato")}</span></div>
          </div>
      </button>`;
      }
      return `<button type="button" onclick="window.focusOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${pmSummaryStateClass(active)} p-3 space-y-3 transition hover:border-brand-red">
          <div class="flex items-start justify-between gap-2">
              <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
              ${pmSummaryStateLabel(active)}
          </div>
          <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
              <div class="flex justify-between text-[10px] text-gray-500"><span>Modo de cálculo</span><span class="text-right font-bold text-gray-700 max-w-[190px]">${r.baseMeta?.modeLabel || "--"}</span></div>
              <div class="flex justify-between text-[10px] text-gray-500"><span>${r.baseMeta?.referenceLabel || "Precio base catálogo"}</span><span>${money(r.baseMeta?.referenceValue || 0)}</span></div>
              ${detailRows}
              <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Fórmula aplicada</span><span class="text-right max-w-[230px] font-bold text-gray-700">${r.baseMeta?.explanation || money(r.base)}</span></div>
              <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Base facturable</span><span>${money(r.base)}</span></div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-1.5">
              <p class="text-[10px] font-bold uppercase text-gray-400">Conceptos adicionales</p>
              ${conceptRows}
              <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Total conceptos</span><span>${money(r.conceptsTotal)}</span></div>
          </div>
          <div class="space-y-1.5">
              <div class="flex justify-between text-[10px] text-gray-500"><span>Subtotal antes de ajuste</span><span>${money(r.subtotalSpace)}</span></div>
              <div class="flex justify-between text-[10px] text-gray-500"><span>Ajuste aplicado</span><span class="${r.adjustmentShare < 0 ? "text-red-600" : (r.adjustmentShare > 0 ? "text-emerald-700" : "text-gray-500")}">${signedMoney(r.adjustmentShare)}</span></div>
              <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Subtotal ajustado</span><span>${money(r.adjustedSubtotal)}</span></div>
          </div>
      </button>`;
    };

    const renderSpaceTaxCard = (r) => {
      const active = String(r.cfg.spaceId) === String(pmActive);
      const spaceRef = r.sp?.clave ? `${r.sp?.nombre || r.cfg.spaceId} [${r.sp.clave}]` : (r.sp?.nombre || r.cfg.spaceId);
      if (r.isConvenio) {
        return `<button type="button" onclick="window.focusOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${pmSummaryStateClass(active)} p-3 space-y-2 transition hover:border-brand-red">
          <div class="flex items-start justify-between gap-2">
              <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
              ${pmSummaryStateLabel(active)}
          </div>
          <div class="flex justify-between text-[10px] text-gray-500"><span>Impuestos</span><span>No aplica</span></div>
          <div class="text-[10px] text-gray-400 italic">Los convenios no solicitan factura ni impuestos dentro del cierre documental.</div>
          <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Balance del espacio</span><span>${signedMoney(r.total)}</span></div>
      </button>`;
      }
      const taxRows = r.taxBreakdown.length
        ? r.taxBreakdown.map((taxRow) => `<div class="flex justify-between text-[10px] text-gray-500"><span>${taxRow.name}</span><span>+${money(taxRow.amount)}</span></div>`).join("")
        : '<div class="text-[10px] text-gray-400 italic">Sin impuestos configurados.</div>';
      return `<button type="button" onclick="window.focusOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${pmSummaryStateClass(active)} p-3 space-y-2 transition hover:border-brand-red">
          <div class="flex items-start justify-between gap-2">
              <p class="text-[10px] font-black uppercase text-gray-700">${spaceRef}</p>
              ${pmSummaryStateLabel(active)}
          </div>
          <div class="flex justify-between text-[10px] text-gray-500"><span>Subtotal gravable</span><span>${money(r.adjustedSubtotal)}</span></div>
          <div class="space-y-1">${taxRows}</div>
          <div class="flex justify-between text-[10px] font-bold text-gray-700 border-t border-dashed border-gray-200 pt-1"><span>Total impuestos</span><span>${money(r.tax)}</span></div>
          <div class="flex justify-between text-[10px] font-black text-gray-800 border-t border-dashed border-gray-200 pt-1"><span>Total espacio</span><span>${money(r.total)}</span></div>
      </button>`;
    };

    document.getElementById("oed-summary-concepts").innerHTML = rows.length
      ? rows.map(renderSpacePricingCard).join("")
      : '<div class="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-[11px] text-gray-400 italic">Sin espacios seleccionados.</div>';
    document.getElementById("oed-tax-summary-display").innerHTML = `${globalTaxCardHtml}${rows.length ? rows.map(renderSpaceTaxCard).join("") : ""}`;
    document.getElementById("lbl-subtotal-base").innerText = money(subtotalBase);
    const catalogBaseEl = document.getElementById("lbl-catalog-base-total");
    const subtotalRawEl = document.getElementById("lbl-subtotal-raw");
    const taxTotalEl = document.getElementById("lbl-tax-total");
    if (catalogBaseEl) catalogBaseEl.innerText = money(catalogBaseTotal);
    if (subtotalRawEl) subtotalRawEl.innerText = money(subtotalRaw);
    document.getElementById("lbl-subtotal").innerText = money(adjusted);
    document.getElementById("lbl-adjustment").innerText = convenioMode ? `-${money(convenioDeliveredTotal)}` : `${adjType === "descuento" ? "-" : "+"}${money(adjustment)}`;
    if (taxTotalEl) taxTotalEl.innerText = money(tax);
    document.getElementById("oed-price").value = (final || 0).toFixed(2);
    const sumSubtotal = document.getElementById("sum-total-subtotal");
    const sumAdjustment = document.getElementById("sum-total-adjustment");
    const sumTax = document.getElementById("sum-total-tax");
    const sumNet = document.getElementById("sum-total-net");
    if (sumSubtotal) sumSubtotal.innerText = money(convenioMode ? convenioBaseTotal : adjusted);
    if (sumAdjustment) sumAdjustment.innerText = convenioMode ? `-${money(convenioDeliveredTotal)}` : `${adjType === "descuento" ? "-" : "+"}${money(adjustment)}`;
    if (sumTax) sumTax.innerText = money(tax);
    if (sumNet) sumNet.innerText = money(final);
    const setLabel = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setLabel("sum-label-subtotal", convenioMode ? "Valor Base" : "Subtotal");
    setLabel("sum-label-adjustment", convenioMode ? "Tratos" : "Ajuste");
    setLabel("sum-label-tax", convenioMode ? "Impuestos" : "Impuestos");
    setLabel("sum-label-net", convenioMode ? "Balance del Convenio" : "Total Neto");

    const min = rows.map((r) => r.cfg.startDate).filter(Boolean).sort()[0] || "";
    const max = rows.map((r) => r.cfg.endDate).filter(Boolean).sort().slice(-1)[0] || "";
    const convenioBlocksIndefinitely = rows.some((row) => row.blocksIndefinitely);
    document.getElementById("sum-dates").innerText = (min && max)
      ? (convenioBlocksIndefinitely ? `${window.safeFormatDate(min)} al Indefinido` : `${window.safeFormatDate(min)} al ${window.safeFormatDate(max)}`)
      : "--";
    document.getElementById("sum-quote-name").innerText = (document.getElementById("oed-quote-name")?.value || currentPreviewOrder?.nombre_cotizacion || "---");
    document.getElementById("sum-status").innerText = String(document.getElementById("oed-status")?.value || "pendiente").toUpperCase();
    document.getElementById("sum-client").innerText = document.getElementById("oed-client")?.value || "---";
    applyStatusVisual();
    document.getElementById("sum-spaces-count").innerText = String(rows.length);
    const financialOverview = document.getElementById("oed-financial-overview");
    if (financialOverview) {
      financialOverview.innerHTML = convenioMode
        ? `
          <div class="flex justify-between text-[10px] text-gray-500"><span>Valor base del convenio</span><span>${money(convenioBaseTotal)}</span></div>
          <div class="flex justify-between text-[10px] text-gray-500"><span>Tratos registrados</span><span>-${money(convenioDeliveredTotal)}</span></div>
          <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Balance actual</span><span class="text-right font-bold text-gray-700 max-w-[240px]">${signedMoney(final)}</span></div>
          <div class="text-[10px] text-gray-500 leading-relaxed">${adjustmentExplanation}</div>
        `
        : `
          <div class="flex justify-between text-[10px] text-gray-500"><span>Conceptos adicionales acumulados</span><span>${money(conceptsGlobal)}</span></div>
          <div class="flex justify-between gap-3 text-[10px] text-gray-500"><span>Regla de ajuste</span><span class="text-right font-bold text-gray-700 max-w-[240px]">${adjustmentModeLabel}</span></div>
          <div class="text-[10px] text-gray-500 leading-relaxed">${adjustmentExplanation}</div>
        `;
    }
    const financialList = document.getElementById("sum-financial-list");
    if (financialList) {
      const overviewRows = convenioMode
        ? [
            { label: "Valor base del convenio", value: money(convenioBaseTotal) },
            { label: "Tratos acumulados", value: `-${money(convenioDeliveredTotal)}` },
            { label: "Impuestos", value: money(0) },
            { label: "Balance del convenio", value: signedMoney(final), highlight: true }
          ]
        : [
            { label: "Referencia catálogo acumulada", value: money(catalogBaseTotal) },
            { label: "Base facturable acumulada", value: money(subtotalBase) },
            { label: "Conceptos adicionales", value: money(conceptsGlobal) },
            { label: "Subtotal antes de ajuste", value: money(subtotalRaw) },
            { label: "Subtotal Ajustado", value: money(adjusted) },
            { label: "Total Ajuste", value: `${adjType === "descuento" ? "-" : "+"}${money(adjustment)}` },
            { label: "Impuestos", value: money(tax) },
            { label: "Total Neto", value: money(final), highlight: true }
          ];
      const overviewHtml = `<div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div class="divide-y divide-gray-100 text-xs">
            ${overviewRows.map((row) => `<div class="flex items-center justify-between gap-3 px-4 py-3 ${row.highlight ? "bg-slate-50" : ""}"><span class="${row.highlight ? "font-black uppercase text-gray-700" : "font-bold text-gray-400"}">${row.label}</span><span class="${row.highlight ? "font-black text-gray-900" : "font-bold text-gray-800"} text-right">${row.value}</span></div>`).join("")}
          </div>
          <div class="border-t border-dashed border-gray-200 px-4 py-3 text-[10px] text-gray-500">
            <p class="font-bold text-gray-700 mb-1">${convenioMode ? "Regla del convenio" : "Regla de ajuste"}</p>
            <p>${adjustmentExplanation}</p>
          </div>
        </div>`;
      const spaceCardsHtml = rows.length ? rows.map(renderSpacePricingCard).join("") : '<div class="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-[11px] text-gray-400 italic">Sin espacios seleccionados.</div>';
      const spaceTaxCardsHtml = rows.length ? rows.map(renderSpaceTaxCard).join("") : "";
      financialList.innerHTML = convenioMode
        ? `${overviewHtml}<div class="space-y-2">${spaceCardsHtml}</div>`
        : `${overviewHtml}<div class="space-y-2">${spaceCardsHtml}</div><div class="space-y-2">${globalTaxCardHtml}${spaceTaxCardsHtml}</div>`;
    }
    const list = document.getElementById("sum-spaces-list");
    if (list) {
      const detailSummaryView = IS_PM_ORDER_DETAIL_PAGE || IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode();
      const previewSummaryView = IS_PM_ORDER_PREVIEW_PAGE || __pmIsPreviewOnlyQueryMode();
      if (detailSummaryView) {
        list.innerHTML = rows.map((r, idx) => {
          const active = String(r.cfg.spaceId) === String(pmActive);
          const detailInfo = __pmResolveDetailMaterialMeasure({
            material: r.cfg.material || "",
            ubicacion: r.cfg.ubicacion || "",
            medida_ancho: r.cfg.medidaAncho ?? null,
            medida_alto: r.cfg.medidaAlto ?? null,
            medida_unidad: r.cfg.medidaUnit || "M"
          }, r.sp || {});
          const detailBits = [];
          if (detailInfo.ubicacion) detailBits.push(detailInfo.ubicacion);
          if (detailInfo.material) detailBits.push(__pmNormalizeMaterialLabel(detailInfo.material));
          const detailLabel = detailBits.join(" / ") || "--";
          const measureLabel = (detailInfo.medida_ancho !== null && detailInfo.medida_ancho !== undefined && detailInfo.medida_alto !== null && detailInfo.medida_alto !== undefined)
            ? `${detailInfo.medida_ancho} x ${detailInfo.medida_alto} ${detailInfo.medida_unidad || "M"}`
            : "--";
          const stateClass = active
            ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
            : `border-gray-200 bg-white ${previewSummaryView ? "" : "hover:border-brand-red"}`;
          const stateLabel = active ? "En edición" : (previewSummaryView ? "Activo" : "Editar");
          const dateLabel = r.cfg.convenioEnabled
        ? `${window.safeFormatDate(r.cfg.startDate)} - ${r.blocksIndefinitely ? "Indefinido" : window.safeFormatDate(r.cfg.endDate || r.cfg.startDate)}`
            : `${window.safeFormatDate(r.cfg.startDate)} - ${window.safeFormatDate(r.cfg.endDate)}`;
          return `<button type="button" ${previewSummaryView ? "disabled" : `onclick="window.focusOrderSpaceCard('${r.cfg.spaceId}')"`} class="w-full text-left rounded-xl border ${stateClass} p-3 transition ${previewSummaryView ? "cursor-default" : "cursor-pointer"} ${idx > 0 ? "mt-2" : ""}">
              <div class="flex justify-between items-start gap-2">
                  <div class="min-w-0">
                      <p class="text-[11px] font-black uppercase text-gray-800 whitespace-normal break-words leading-tight">${r.sp?.nombre || r.cfg.spaceId}</p>
                      <p class="text-[10px] font-mono text-gray-500 mt-0.5 break-all">${r.sp?.clave ? `Clave: ${r.sp.clave}` : "--"}</p>
                  </div>
                  <span class="text-[9px] font-bold uppercase tracking-wide shrink-0 ${active ? "text-emerald-700" : "text-gray-400"}">${stateLabel}</span>
              </div>
              <div class="mt-2 space-y-1 text-[10px] text-gray-600">
                  <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Fechas</span><span class="text-right">${dateLabel}</span></div>
                  <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Base</span><span class="text-right">${money(r.base)}</span></div>
                  <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Tipo</span><span class="text-right">${r.cfg.spaceType || r.sp?.tipo || "--"}</span></div>
                  <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Detalle</span><span class="text-right max-w-[180px]">${detailLabel}</span></div>
                  <div class="flex justify-between gap-2"><span class="font-bold text-gray-400">Medidas</span><span class="text-right">${measureLabel}</span></div>
                  <div class="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1 mt-1 font-bold text-gray-700"><span>${r.isConvenio ? "Balance convenio" : "Total espacio"}</span><span>${r.isConvenio ? signedMoney(r.total) : money(r.total)}</span></div>
              </div>
          </button>`;
        }).join("");
      } else {
        list.innerHTML = rows.map((r) => {
          const active = String(r.cfg.spaceId) === String(pmActive);
          const dateLabel = r.cfg.convenioEnabled
        ? `${window.safeFormatDate(r.cfg.startDate)} - ${r.blocksIndefinitely ? "Indefinido" : window.safeFormatDate(r.cfg.endDate || r.cfg.startDate)}`
            : `${window.safeFormatDate(r.cfg.startDate)} - ${window.safeFormatDate(r.cfg.endDate)}`;
          return `<button type="button" onclick="window.selectOrderSpaceCard('${r.cfg.spaceId}')" class="w-full text-left rounded-lg border ${active ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50 hover:border-brand-red"} p-2 transition"><div class="flex justify-between items-start gap-2"><div class="min-w-0"><p class="text-[10px] font-black uppercase text-gray-800 whitespace-normal break-words leading-tight">${r.sp?.nombre || r.cfg.spaceId}</p><p class="text-[10px] font-mono text-gray-500 mt-0.5 break-all">${r.sp?.clave ? `Clave: ${r.sp.clave}` : "--"}</p></div><span class="text-[10px] font-bold shrink-0 ${active ? "text-emerald-700" : "text-gray-400"}">${active ? "Editando" : "Editar"}</span></div><p class="text-[10px] text-gray-500 mt-1">${dateLabel}</p><p class="text-[10px] text-gray-500 mt-1">Base ${money(r.base)}</p><p class="text-[10px] font-bold text-gray-700 mt-1">${r.isConvenio ? signedMoney(r.total) : money(r.total)}</p></button>`;
        }).join("");
      }
    }
    syncPmOrderDetailModeUi();
    window.renderOrderSpaceCards();
    updatePmSpaceConfigTitle();
    renderPmActiveSpaceSummary(rows.find((r) => String(r.cfg.spaceId) === String(pmActive)));
  };

  window.getFormDataFromModal = function () {
    saveActiveFromForm();
    window.recalcTotal();
    if (!pmTotals.spaces.length) throw new Error("No hay espacios activos.");
    const hasConvenioOrder = pmTotals.spaces.some((r) => !!r.isConvenio || !!r.cfg?.convenioEnabled);
    const normalizedAdj = hasConvenioOrder
      ? { adjType: "ninguno", adjVal: 0, isPct: false }
      : normalizePmGlobalAdjustment(pmTotals?.subtotal || 0, { showToast: true });
    const details = pmTotals.spaces.map((r) => {
      const convenioItems = buildConvenioPayloadItems(r.cfg);
      return {
        espacio_id: r.cfg.spaceId,
        espacio_nombre: r.sp?.nombre || r.cfg.spaceId,
        espacio_clave: r.sp?.clave || "",
        fecha_inicio: r.cfg.startDate,
        fecha_fin: r.cfg.endDate,
        permanencia_personalizada: !!r.cfg.customPermanence,
        precio_personalizado: (r.cfg.customPriceEnabled && r.cfg.customBasePrice !== "" && r.cfg.customBasePrice !== null && r.cfg.customBasePrice !== undefined) ? (parseFloat(r.cfg.customBasePrice) || 0) : null,
        precio_personalizado_activo: !!r.cfg.customPriceEnabled,
        precio_personalizado_modo: r.cfg.customPriceMode || "total",
        convenio_activo: !!r.cfg.convenioEnabled,
        convenio_indefinido: !!r.blocksIndefinitely,
        convenio_items: convenioItems,
        subtotal_espacio: r.isConvenio ? (r.base || 0) : r.adjustedSubtotal,
        convenio_monto_entregado: r.isConvenio ? (r.convenioValue || 0) : 0,
        convenio_balance: r.isConvenio ? (r.total || 0) : r.adjustedSubtotal,
        impuestos_ids: r.isConvenio ? [] : (r.taxIds || []),
        impuestos_total: r.isConvenio ? 0 : (r.tax || 0),
        total_espacio: r.total || 0,
        espacio_tipo: r.cfg.spaceType || r.sp?.tipo || "",
        tipo: r.cfg.spaceType || r.sp?.tipo || "",
        material: r.cfg.material || "",
        ubicacion: r.cfg.ubicacion || "",
        medida_ancho: r.cfg.medidaAncho || 0,
        medida_alto: r.cfg.medidaAlto || 0,
        medida_unidad: r.cfg.medidaUnit || "M",
        ancho: r.cfg.medidaAncho || 0,
        alto: r.cfg.medidaAlto || 0,
        unidad_medida: r.cfg.medidaUnit || "M"
      };
    });
    const concepts = [];
    pmTotals.spaces.forEach((r) => r.concepts.forEach((c) => {
      const n = normConcept(c);
      n.meta = { ...(n.meta || {}), space_id: r.cfg.spaceId };
      concepts.push(n);
    }));
    const starts = details.map((d) => d.fecha_inicio).filter(Boolean).sort();
    const ends = details.map((d) => d.fecha_fin).filter(Boolean).sort();
    const first = pmTotals.spaces[0];
    const taxUnion = Array.from(new Set(pmTotals.spaces.flatMap((r) => (r.taxIds || []).map((x) => String(x)))));
    const existingConvenio = __pmParseConvenioMeta(currentPreviewOrder);
    const convenioSpaces = pmTotals.spaces
      .filter((r) => !!r.cfg.convenioEnabled)
      .map((r) => ({
        espacio_id: r.cfg.spaceId,
        espacio_nombre: r.sp?.nombre || r.cfg.spaceId,
        espacio_clave: r.sp?.clave || "",
        cantidad_tratos: buildConvenioPayloadItems(r.cfg).length,
        items: buildConvenioPayloadItems(r.cfg)
      }));
    const convenioItems = convenioSpaces.flatMap((space) => (space.items || []).map((item) => ({
      ...item,
      espacio_id: space.espacio_id,
      espacio_nombre: space.espacio_nombre,
      espacio_clave: space.espacio_clave
    })));
    const convenioBlocksIndefinitely = pmTotals.spaces.some((r) => !!r.blocksIndefinitely);
    const detallesEventoActual = __pmParseRecordJson(currentPreviewOrder?.detalles_evento);
    return {
      nombre_cotizacion: (document.getElementById("oed-quote-name")?.value || "").trim() || currentPreviewOrder?.nombre_cotizacion || "",
      cliente_nombre: document.getElementById("oed-client")?.value || "",
      cliente_email: document.getElementById("oed-email")?.value || "",
      cliente_contacto: document.getElementById("oed-phone")?.value || "",
      cliente_rfc: document.getElementById("fiscal-rfc-re")?.value || "",
      cliente_id: (document.getElementById("oed-client-id") ? (document.getElementById("oed-client-id").value || "") : ""),
      fecha_inicio: starts[0] || first.cfg.startDate,
      fecha_fin: ends[ends.length - 1] || first.cfg.endDate,
      precio_final: parseFloat(document.getElementById("oed-price")?.value || 0) || 0,
      espacio_id: first.cfg.spaceId,
      espacio_nombre: pmTotals.spaces.length === 1 ? (first.sp?.nombre || first.cfg.spaceId) : `${first.sp?.nombre || first.cfg.spaceId} + ${pmTotals.spaces.length - 1} espacio(s)`,
      espacio_clave: pmTotals.spaces.length === 1 ? (first.sp?.clave || "") : "MULTI",
      tipo_ajuste: normalizedAdj.adjType,
      valor_ajuste: normalizedAdj.adjVal,
      ajuste_es_porcentaje: normalizedAdj.isPct,
      conceptos_adicionales: concepts,
      espacios_detalle: details,
      desglose_precios: {
        subtotal_antes_impuestos: hasConvenioOrder ? pmTotals.final : pmTotals.adjusted,
        impuestos_detalle: hasConvenioOrder ? [] : taxUnion,
        tax_total: hasConvenioOrder ? 0 : pmTotals.tax,
        convenio_base_total: hasConvenioOrder ? pmTotals.convenioBaseTotal : 0,
        convenio_entregable_total: hasConvenioOrder ? pmTotals.convenioDeliveredTotal : 0,
        convenio_balance_total: hasConvenioOrder ? pmTotals.final : 0,
        espacios: details
      },
      detalles_evento: {
        ...detallesEventoActual,
        multi_espacio: details.length > 1,
        total_espacios: details.length,
        nombre_cotizacion: (document.getElementById("oed-quote-name")?.value || "").trim() || currentPreviewOrder?.nombre_cotizacion || "",
        permanencia_personalizada: details.some((d) => !!d.permanencia_personalizada),
        convenio: (hasConvenioOrder || convenioItems.length) ? {
          ...existingConvenio,
          activo: true,
          bloqueo_indefinido: convenioBlocksIndefinitely,
          requiere_evidencia: true,
          evidencia_minima: Math.max(3, parseInt(existingConvenio?.evidencia_minima || 3, 10) || 3),
          evidencia_maxima: Math.max(5, parseInt(existingConvenio?.evidencia_maxima || 5, 10) || 5),
          requiere_factura: false,
          requiere_recibo: false,
          requiere_contrato: false,
          espacios: convenioSpaces,
          items: convenioItems,
          evidencias: __pmGetConvenioEvidence(currentPreviewOrder)
        } : null
      }
    };
  };

  async function findConflict(orderId) {
    const selected = selectedCfg();
    if (!selected.length) return null;
    const { data, error } = await __pmQuotesList({ filter: 'status = "aprobada" || status = "finalizada"', perPage: 500 });
    if (error) throw error;
    for (const cfg of selected) {
      const s = iso(cfg.startDate); const e = pmCfgBlocksIndefinitely(cfg) ? PM_CONVENIO_INDEFINITE_END : iso(cfg.endDate); const sid = String(cfg.spaceId);
      for (const row of (data || [])) {
        if (String(row.id) === String(orderId)) continue;
        const d = parseDetail(row.espacios_detalle);
        const ranges = [];
        const orderBlocksIndefinitely = __pmOrderBlocksIndefinitely(row);
        if (d.length) d.forEach((x) => {
          const id = String(x.espacio_id || x.space_id || "");
          const fi = iso(x.fecha_inicio || "");
          const ff = __pmSpaceDetailBlocksIndefinitely(x) ? PM_CONVENIO_INDEFINITE_END : iso(x.fecha_fin || "");
          if (id === sid && fi && ff) ranges.push({ fi, ff });
        });
        else if (String(row.espacio_id || "") === sid) {
          const fi = iso(row.fecha_inicio || "");
          const ff = orderBlocksIndefinitely ? PM_CONVENIO_INDEFINITE_END : iso(row.fecha_fin || "");
          if (fi && ff) ranges.push({ fi, ff });
        }
        const hit = ranges.find((r) => new Date(s + "T00:00:00") <= new Date(r.ff + "T00:00:00") && new Date(r.fi + "T00:00:00") <= new Date(e + "T00:00:00"));
        if (hit) return { space: getSpace(sid)?.nombre || sid, fi: hit.fi, ff: hit.ff };
      }
    }
    return null;
  }

  window.attemptSaveOrder = async function () {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    const locked = __pmIsLockedOrder();
    if (locked) return window.showToast("La cotización aprobada está bloqueada para edición.", "error");
    saveActiveFromForm();
    window.recalcTotal();
    const statusField = document.getElementById("oed-status");
    if (statusField) statusField.value = "aprobada";
    applyStatusVisual();
    const newStatus = "aprobada";
    const curLvl = STATUS_LEVEL[currentPreviewOrder?.status] || 0;
    const newLvl = STATUS_LEVEL[newStatus] || 0;
    if (newLvl < curLvl) return window.showToast("No puedes regresar a un estado anterior.", "error");
    if (newStatus === "aprobada" && String(currentPreviewOrder?.status || "").toLowerCase() !== "aprobada") {
      const missing = [];
      const convenioOrder = selectedCfg().some((cfg) => !!cfg?.convenioEnabled);
      if (!document.getElementById("oed-client")?.value) missing.push("Nombre Cliente");
      if (!document.getElementById("oed-email")?.value) missing.push("Email");
      if (!convenioOrder && !document.getElementById("fiscal-rfc-re")?.value) missing.push("RFC");
      if (!selectedCfg().every((c) => c.startDate && c.endDate)) missing.push("Fechas");
      if (missing.length) return window.showToast(`Faltan datos para aprobar: ${missing.join(", ")}`, "error");
      try {
        const c = await findConflict(currentPreviewOrder?.id);
        if (c) return window.showToast(`${c.space} ocupado (${window.safeFormatDate(c.fi)}${c.fi !== c.ff ? " a " + window.safeFormatDate(c.ff) : ""}).`, "error");
      } catch (e) { return window.showToast(`No se pudo validar disponibilidad: ${e.message}`, "error"); }
      window.initiateApprovalSnapshot();
      return;
    }
    window.processSaveOrder();
  };

  window.processSaveOrder = async function (options = {}) {
    const opts = (options && typeof options === "object") ? options : {};
    const silent = !!opts.silent;
    const relaxed = !!opts.relaxed;
    const keepOpen = !!opts.keepOpen || IS_PM_ORDER_DETAIL_PAGE;
    const skipReload = !!opts.skipReload || IS_PM_ORDER_DETAIL_PAGE;
    if (!__pmCanEditOrders()) {
      if (!silent) window.showToast(__pmOrderReadOnlyMessage(), "error");
      return false;
    }
    const locked = __pmIsLockedOrder();
    if (locked) {
      if (!silent) window.showToast("La cotización aprobada está bloqueada para edición.", "error");
      return false;
    }
    const btn = document.getElementById("btn-save-progress");
    if (btn && !silent) { btn.disabled = true; btn.innerText = "Guardando..."; }
    try {
      saveActiveFromForm();
      window.recalcTotal();
      if (!relaxed) {
        const invalidPast = selectedCfg().find((cfg) => (cfg.startDate && cfg.startDate < today()) || (cfg.endDate && cfg.endDate < today()));
        if (invalidPast) {
          const sp = getSpace(invalidPast.spaceId);
          throw new Error(`No se permiten fechas pasadas en ${sp?.nombre || invalidPast.spaceId}.`);
        }
      }
      const formData = window.getFormDataFromModal();
      const nextStatus = document.getElementById("oed-status")?.value || "pendiente";
      const prevStatus = String(currentPreviewOrder?.status || "").toLowerCase();
      const approvalTransition = nextStatus === "aprobada" && !["aprobada", "finalizada"].includes(prevStatus);
      const convenioTransition = nextStatus === "finalizada" && __pmIsConvenioOrder({ ...currentPreviewOrder, ...formData });
      formData.status = nextStatus;
      const saveOrderId = String(document.getElementById("oed-id")?.value || currentPreviewOrder?.id || "").trim();
      if (!saveOrderId) throw new Error("Cotización inválida.");
      if (!formData.numero_orden) formData.numero_orden = __pmResolveQuoteFolio(currentPreviewOrder, saveOrderId);
      const approvalSnapshotMeta = approvalTransition ? __pmBuildApprovalSnapshotMeta(saveOrderId, formData) : null;
      if (approvalSnapshotMeta?.path) formData.url_cotizacion_final = approvalSnapshotMeta.path;
      if (convenioTransition && __pmGetConvenioEvidence({ ...currentPreviewOrder, ...formData }).length < 3) {
        throw new Error("Finaliza el convenio desde Expediente para adjuntar de 3 a 5 evidencias.");
      }
      const missingConvenio = pmTotals.spaces.find((row) => row.isConvenio && !row.convenioItems.length);
      if (missingConvenio) {
        throw new Error(`Agrega al menos un trato de convenio para ${missingConvenio.sp?.nombre || missingConvenio.cfg?.spaceId || "el espacio seleccionado"}.`);
      }
      const uncoveredConvenio = pmTotals.spaces.find((row) => row.isConvenio && !row.convenioCovered);
      if (uncoveredConvenio) {
        throw new Error(`El convenio de ${uncoveredConvenio.sp?.nombre || uncoveredConvenio.cfg?.spaceId || "el espacio seleccionado"} debe cubrir al menos el valor total del espacio.`);
      }
      if (approvalTransition) {
        const missing = [];
        const convenioOrder = __pmIsConvenioOrder({ ...currentPreviewOrder, ...formData });
        if (!document.getElementById("oed-client")?.value) missing.push("Nombre Cliente");
        if (!document.getElementById("oed-email")?.value) missing.push("Email");
        if (!convenioOrder && !document.getElementById("fiscal-rfc-re")?.value) missing.push("RFC");
        if (!selectedCfg().every((c) => c.startDate && c.endDate)) missing.push("Fechas");
        if (missing.length) throw new Error(`Faltan datos para aprobar: ${missing.join(", ")}`);
        const c = await findConflict(currentPreviewOrder?.id);
        if (c) throw new Error(`${c.space} ocupado (${window.safeFormatDate(c.fi)}${c.fi !== c.ff ? " a " + window.safeFormatDate(c.ff) : ""}).`);
      }
      const { error } = await __pmQuotesUpdate(saveOrderId, formData);
      if (error) throw error;
      currentPreviewOrder = { ...currentPreviewOrder, ...formData };
      signalOrdersRefresh(nextStatus === "aprobada" ? "approved_saved" : "saved");
      if (approvalTransition) {
        const docMeta = __pmGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
        const approvalLabel = docMeta.isConvenio ? "Convenio aprobado" : "Cotización aprobada";
        await __pmEnsurePdfStyleProfile('quote', { forceReload: !__pmIsAdminProfile() });
        const content = await window.getOrderHTML({ ...currentPreviewOrder, ...formData }, "quote");
        const pdfContainer = document.getElementById("pdf-content");
        const embedViewer = document.getElementById("doc-preview");
        const btnDownload = document.getElementById("btn-download-preview");
        pdfContainer.innerHTML = content;
        __pmApplyPdfStyleToLivePreview();
        pdfContainer.classList.remove("hidden");
        embedViewer.classList.add("hidden");
        window.openModal("preview-modal");

        if (__pmIsAdminProfile()) {
          await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
        }

        const snapshotResult = await __pmWithBusyOverlay('Guardando cotización...', async () => {
          const blob = (typeof window.generatePdfBlobFromNode === "function")
            ? await window.generatePdfBlobFromNode(pdfContainer)
            : await renderPdfBlobFallback(pdfContainer);
          const uploaded = await __pmUploadApprovalSnapshotBlob(saveOrderId, blob, formData, {
            persistQuote: false,
            path: approvalSnapshotMeta?.path,
            folio: approvalSnapshotMeta?.folio
          });
          return { blob, ...uploaded };
        });
        const pdfBlob = snapshotResult.blob;
        const path = snapshotResult.path;
        const folio = snapshotResult.folio;
        currentPreviewOrder = { ...currentPreviewOrder, url_cotizacion_final: path, status: "aprobada" };
        signalOrdersRefresh("approved_snapshot");
        if (btnDownload) {
          btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
          btnDownload.className = "bg-brand-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-xs font-bold uppercase shadow-lg transition flex items-center gap-2";
          btnDownload.onclick = () => {
            const fileName = `${docMeta.approvedFileBase}_${folio}.pdf`;
            if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(pdfBlob, fileName);
            else {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(pdfBlob);
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
          };
        }
        if (!silent) window.showToast(`${approvalLabel}, PDF y snapshot generados.`, "success");
      } else {
        if (!silent) window.showToast("Cambios guardados", "success");
      }
      if (pmDetailTab === "expediente") {
        await __pmRenderExpedientePanel();
      }
      __pmClearOrderDetailDirty();
      if (!keepOpen) window.closeModal("order-edit-modal");
      pmOrdersSaveViewState({ selectedOrderId: saveOrderId });
      if (!skipReload) await window.loadOrders();
      if (approvalTransition && IS_PM_ORDER_DETAIL_PAGE) {
        await window.openOrderEditModal(currentPreviewOrder.id);
      }
      return true;
    } catch (e) {
      if (!silent) window.showToast("Error: " + e.message, "error");
      return false;
    }
    finally {
      if (btn && !silent) { btn.disabled = false; btn.innerText = "Guardar"; }
    }
  };

  window.executeApprovalTransaction = async function (formData) {
    if (!__pmCanEditOrders()) return window.showToast(__pmOrderReadOnlyMessage(), "error");
    const btn = document.getElementById("btn-download-preview");
    if (btn) { btn.disabled = true; btn.innerText = "Generando Snapshot..."; }
    try {
      const docMeta = __pmGetQuoteDocumentMeta({ ...currentPreviewOrder, ...formData });
      const approvalArchivedLabel = docMeta.isConvenio ? "¡Convenio aprobado y archivado!" : "¡Cotización aprobada y archivada!";
      const element = document.getElementById("pdf-content");
      if (!__pmIsAdminProfile() && element && currentPreviewOrder) {
        await __pmEnsurePdfStyleProfile("quote", { forceReload: true });
        element.innerHTML = await window.getOrderHTML({ ...currentPreviewOrder, ...formData, status: "aprobada" }, "quote");
        __pmApplyPdfStyleToLivePreview();
      }
      if (__pmIsAdminProfile()) {
        await __pmPersistSharedPdfStyleConfig(__pmGetPdfStyleConfig(), { force: true });
      }
      const snapshotMeta = __pmBuildApprovalSnapshotMeta(currentPreviewOrder.id, formData);
      const snapshotResult = await __pmWithBusyOverlay('Guardando cotización...', async () => {
        const blob = (typeof window.generatePdfBlobFromNode === "function")
          ? await window.generatePdfBlobFromNode(element)
          : await renderPdfBlobFallback(element);
        const uploaded = await __pmUploadApprovalSnapshotBlob(currentPreviewOrder.id, blob, formData, {
          persistQuote: false,
          path: snapshotMeta.path,
          folio: snapshotMeta.folio
        });
        const payload = { ...formData, status: "aprobada", url_cotizacion_final: uploaded.path };
        const { error: dbErr } = await __pmQuotesUpdate(currentPreviewOrder.id, payload);
        if (dbErr) throw dbErr;
        return { blob, payload, ...uploaded };
      });
      const pdfBlob = snapshotResult.blob;
      const path = snapshotResult.path;
      const folio = snapshotResult.folio;
      const payload = snapshotResult.payload || { ...formData, status: "aprobada", url_cotizacion_final: path };
      currentPreviewOrder = { ...currentPreviewOrder, ...payload };
      const fileName = `${docMeta.approvedFileBase}_${folio}.pdf`;
      if (typeof window.downloadBlobAsFile === "function") window.downloadBlobAsFile(pdfBlob, fileName);
      else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(pdfBlob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
      }
      window.showToast(approvalArchivedLabel, "success");
      window.closeModal("preview-modal");
      pmOrdersSaveViewState({ selectedOrderId: currentPreviewOrder?.id || '' });
      if (!IS_PM_ORDER_DETAIL_PAGE) await window.loadOrders();
      if (IS_PM_ORDER_DETAIL_PAGE) await window.openOrderEditModal(currentPreviewOrder.id);
      else window.closeModal("order-edit-modal");
    } catch (e) {
      window.showToast("Error en la aprobación: " + e.message, "error");
      if (btn) { btn.disabled = false; btn.innerText = "Reintentar"; }
    }
  };

  window.openOrderEditModal = async function (id) {
    const order = await __pmEnsureOrderRecord(id);
    if (!order) return;
    await loadClientProfilesForOrderModal();
    await __pmLoadMaterials();
    await __pmLoadLocations();
    currentPreviewOrder = { ...order };

    document.getElementById("oed-id").value = order.id;
    document.getElementById("oed-client").value = order.cliente_nombre || "";
    document.getElementById("oed-phone").value = order.cliente_contacto || "";
    document.getElementById("oed-email").value = order.cliente_email || "";
    document.getElementById("fiscal-rfc-re").value = order.cliente_rfc || "";
    document.getElementById("oed-status").value = order.status || "pendiente";
    applyStatusVisual();
    if (document.getElementById("oed-quote-name")) document.getElementById("oed-quote-name").value = order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || "";
    const requestedClientId = String(order.cliente_id || "").trim();
    if (requestedClientId && !orderClientProfilesById[requestedClientId]) {
      await loadClientProfilesForOrderModal();
    }
    const selectedProfileId = __pmApplyOrderClientProfileSelection(order);
    if (selectedProfileId) {
      const profile = orderClientProfilesById[selectedProfileId];
      if (profile) {
        document.getElementById("oed-client").value = profile.nombre_completo || (order.cliente_nombre || "");
        document.getElementById("oed-phone").value = (profile.telefono || order.cliente_contacto || "");
        document.getElementById("oed-email").value = (profile.correo || order.cliente_email || "");
        document.getElementById("fiscal-rfc-re").value = (profile.rfc || order.cliente_rfc || "");
      }
    }

    const details = parseDetail(order.espacios_detalle);
    const convenioMeta = __pmParseConvenioMeta(order);
    pmSpaces = details.length
      ? details.map((d) => mkCfg(d.espacio_id || d.space_id, { selected: true, spaceType: d.espacio_tipo || d.tipo || "", customPermanence: d.permanencia_personalizada === true, customPriceEnabled: d.precio_personalizado_activo === true || (d.precio_personalizado !== null && d.precio_personalizado !== undefined && d.precio_personalizado !== ""), customPriceMode: d.precio_personalizado_modo || "total", convenioEnabled: d.convenio_activo === true || d.convenio_indefinido === true, startDate: d.fecha_inicio || "", endDate: d.fecha_fin || "", customBasePrice: d.precio_personalizado, taxIds: __pmNormalizeTaxIds(d.impuestos_ids), material: d.material || "", ubicacion: d.ubicacion || "", medidaAncho: d.medida_ancho ?? d.ancho ?? 0, medidaAlto: d.medida_alto ?? d.alto ?? 0, medidaUnit: d.medida_unidad || d.unidad_medida || "M" }))
      : [mkCfg(order.espacio_id, { selected: true, convenioEnabled: convenioMeta.activo === true, startDate: order.fecha_inicio, endDate: order.fecha_fin })];

    const rawConcepts = safeArr(order.conceptos_adicionales).map(normConcept);
    if (rawConcepts.length) {
      pmSpaces.forEach((c) => { c.concepts = []; });
      rawConcepts.forEach((c) => {
        const sid = String(c?.meta?.space_id || pmSpaces[0]?.spaceId || "");
        const cfg = getCfg(sid) || pmSpaces[0];
        if (cfg) cfg.concepts.push(c);
      });
    }
    pmSpaces.forEach((cfg) => {
      const space = getSpace(cfg.spaceId);
      if (__pmSpaceAllowsConvenio(space)) return;
      cfg.convenioEnabled = false;
      cfg.concepts = regularConcepts(cfg.concepts);
    });

    if (document.getElementById("oed-adj-type")) {
      document.getElementById("oed-adj-type").value = order.tipo_ajuste || "ninguno";
      document.getElementById("oed-adj-val").value = order.valor_ajuste || 0;
      document.getElementById("oed-adj-unit").value = order.ajuste_es_porcentaje ? "percent" : "fixed";
    }

    pmActive = String(selectedCfg()[0]?.spaceId || pmSpaces[0]?.spaceId || "");
    ensureActive();
    pmDetailTab = readPmDetailTab();
    applyPmOrderDetailTabUi();
    window.renderOrderSpaceCards();
    loadActiveToForm();

    const conceptSel = document.getElementById("new-concept-select");
    if (conceptSel) {
      conceptSel.innerHTML = '<option value="">-- Agregar --</option>';
      catalogConcepts.forEach((c) => conceptSel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    }
    const extraConceptsToggle = document.getElementById("oed-has-extra-concepts");
    if (extraConceptsToggle) extraConceptsToggle.checked = selectedCfg().some((cfg) => regularConcepts(cfg.concepts).length);

    const isReadOnly = !__pmCanEditOrders();
    const isLocked = __pmIsLockedOrder();
    const editorLocked = isLocked || isReadOnly;
    document.querySelectorAll("#order-edit-modal input, #order-edit-modal select").forEach((i) => {
      if (i.id === "btn-save-progress" || i.id === "btn-save-approve") return;
      i.disabled = editorLocked;
    });
    const saveBtn = document.getElementById("btn-save-progress");
    if (saveBtn) { saveBtn.disabled = isLocked; saveBtn.classList.toggle("opacity-60", isLocked); saveBtn.title = isLocked ? "Cotización aprobada: edición bloqueada" : ""; saveBtn.innerText = "Guardar"; }
    const approveBtn = document.getElementById("btn-save-approve");
    if (approveBtn) { approveBtn.disabled = isLocked; approveBtn.classList.toggle("opacity-60", isLocked); approveBtn.title = isLocked ? "Cotización aprobada: edición bloqueada" : ""; }
    const quoteName = document.getElementById("oed-quote-name");
    if (quoteName) quoteName.disabled = isLocked;
    const statusSel = document.getElementById("oed-status");
    if (statusSel) {
      statusSel.disabled = isLocked;
      statusSel.onchange = () => { applyStatusVisual(); window.recalcTotal(); };
    }
    if (isReadOnly) {
      if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add("opacity-60"); saveBtn.title = __pmOrderReadOnlyMessage(); }
      if (approveBtn) { approveBtn.disabled = true; approveBtn.classList.add("opacity-60"); approveBtn.title = __pmOrderReadOnlyMessage(); }
      if (quoteName) quoteName.disabled = true;
      if (statusSel) statusSel.disabled = true;
    }

    window.renderConceptsList();
    window.recalcTotal();
    if (pmDetailTab === "expediente") await __pmRenderExpedientePanel();
    window.openModal("order-edit-modal");
    __pmClearOrderDetailDirty();
    __pmBindOrderDetailAutoSave();
    const loading = document.getElementById("editor-loading");
    if (loading) loading.classList.add("hidden");
  };

  window.addEventListener("click", (ev) => {
    const modal = document.getElementById("order-date-modal");
    if (modal && ev.target === modal) window.closeModal("order-date-modal");
  });

  const originalScroll = window.scrollOrderSpaceCards;
  window.scrollOrderSpaceCards = function(direction) {
    const viewport = document.getElementById("oed-space-cards");
    if (!viewport) return originalScroll ? originalScroll(direction) : undefined;
    const delta = viewport.clientWidth + 8;
    viewport.scrollBy({ left: (direction || 1) * delta, behavior: "smooth" });
  };
})();





