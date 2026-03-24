/**
 * DOC: client\cotizadorcp\montajes.js
 * Proposito: Compatibilidad legacy para premontajes (si aplica redireccion/flujo previo).
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
const FIN_SCHEMA = 'finanzas_casadepiedra';
const ACTIVE_STATUSES = ['pendiente', 'aprobada', 'finalizada'];
const WEEK_KEYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEK_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

let allSpaces = [];
let allOrders = [];
let allMontajeEvents = [];
let allTaxes = [];
let calendarObj = null;
let premontajePctGlobal = 25;

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const e = document.createElement('div');
    e.className = `p-3 rounded-lg shadow-lg text-white text-xs font-bold uppercase tracking-wider ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
    e.innerText = msg;
    c.appendChild(e);
    setTimeout(() => e.remove(), 2800);
}

function safeArray(v) {
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

function safeObj(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    if (typeof v === 'string') {
        try {
            const p = JSON.parse(v);
            return p && typeof p === 'object' ? p : {};
        } catch (e) {
            return {};
        }
    }
    return {};
}

function normalizeDate(s) {
    const v = String(s || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function addDays(dateStr, delta) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
}

function nextDate(dateStr) {
    return addDays(dateStr, 1);
}

function formatDateMX(dateStr) {
    const v = normalizeDate(dateStr);
    if (!v) return '--';
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
}

function formatRangeDate(start, end) {
    const s = normalizeDate(start);
    const e = normalizeDate(end || start);
    if (!s || !e) return '--';
    if (s === e) return formatDateMX(s);
    return `${formatDateMX(s)} al ${formatDateMX(e)}`;
}

function moneyFmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function listDatesBetween(start, end) {
    const s = normalizeDate(start);
    const e = normalizeDate(end || start);
    if (!s || !e || e < s) return [];
    const out = [];
    for (let d = new Date(`${s}T00:00:00`); d <= new Date(`${e}T00:00:00`); d.setDate(d.getDate() + 1)) {
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

function sortUniqueDates(dates) {
    return Array.from(new Set(safeArray(dates).map(normalizeDate).filter(Boolean))).sort();
}

function getSpaceById(id) {
    return allSpaces.find(s => String(s.id) === String(id)) || null;
}

function getTaxRateById(id) {
    const tax = allTaxes.find(t => String(t.id) === String(id));
    if (!tax) return 0;
    const raw = parseFloat(tax.porcentaje || 0) || 0;
    return raw > 1 ? (raw / 100) : raw;
}

function getPricingRule(space, guests) {
    let rules = [];
    try {
        rules = typeof space?.precios_por_dia === 'string' ? JSON.parse(space.precios_por_dia) : safeArray(space?.precios_por_dia);
    } catch (e) {
        rules = [];
    }
    if (!rules.length) return null;
    const pax = parseInt(guests, 10) || 1;
    let active = rules.find(r => pax >= (parseInt(r.min, 10) || 0) && pax <= (parseInt(r.max, 10) || 999999));
    if (!active) active = rules[rules.length - 1];
    return active || null;
}

function getDayBasePrice(space, dateStr, guests, ignoreBlocks = false) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return 0;
    const idx = d.getDay();
    const key = WEEK_KEYS[idx];
    const rule = getPricingRule(space, guests);
    if (!rule) return parseFloat(space?.precio_base || 0) || 0;
    if (!ignoreBlocks) {
        const blocked = safeArray(space?.dias_bloqueados);
        if (blocked.includes(key)) return 0;
    }
    const prices = safeObj(rule.precios);
    return parseFloat(prices[key] || 0) || 0;
}

function getOrderSpaceEntries(order) {
    const details = safeArray(order?.espacios_detalle);
    if (details.length) {
        return details.map(item => ({
            spaceId: item.espacio_id || item.space_id || order.espacio_id,
            start: item.fecha_inicio || order.fecha_inicio,
            end: item.fecha_fin || item.fecha_inicio || order.fecha_fin || order.fecha_inicio,
            detail: item
        })).filter(x => x.spaceId);
    }
    return [{
        spaceId: order?.espacio_id,
        start: order?.fecha_inicio,
        end: order?.fecha_fin || order?.fecha_inicio,
        detail: null
    }].filter(x => x.spaceId);
}

function collectMontajeDatesForEntry(order, entry) {
    const set = new Set();
    const add = (ds) => {
        const n = normalizeDate(ds);
        if (n) set.add(n);
    };

    if (entry.detail) {
        safeArray(entry.detail.premontaje_fechas).forEach(add);
        safeArray(entry.detail.conceptos_adicionales).forEach(c => {
            if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
            const meta = safeObj(c.meta);
            safeArray(meta.dates).forEach(add);
        });
    }

    safeArray(order.conceptos_adicionales).forEach(c => {
        if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
        const meta = safeObj(c.meta);
        const sid = meta.space_id || order.espacio_id;
        if (String(sid) !== String(entry.spaceId)) return;
        safeArray(meta.dates).forEach(add);
    });

    return Array.from(set).sort();
}

function findMontajeConcept(concepts, spaceId) {
    return safeArray(concepts).find(c => {
        if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return false;
        const sid = safeObj(c?.meta).space_id;
        return String(sid || '') === String(spaceId);
    }) || null;
}

function getConceptPremPct(order, detail, spaceId) {
    const detConcept = findMontajeConcept(detail?.conceptos_adicionales, spaceId);
    const ordConcept = findMontajeConcept(order?.conceptos_adicionales, spaceId);
    const detPct = parseFloat(safeObj(detConcept?.meta).percentage);
    if (Number.isFinite(detPct) && detPct >= 0) return detPct;
    const ordPct = parseFloat(safeObj(ordConcept?.meta).percentage);
    if (Number.isFinite(ordPct) && ordPct >= 0) return ordPct;
    return premontajePctGlobal;
}

function buildMontajeSummary(order, spaceId) {
    const entry = getOrderSpaceEntries(order).find(x => String(x.spaceId) === String(spaceId));
    if (!entry) return null;
    const detail = entry.detail || {};
    const dates = collectMontajeDatesForEntry(order, entry);
    if (!dates.length) return null;
    return {
        order,
        spaceId: String(spaceId),
        detail,
        dates,
        start: dates[0],
        end: dates[dates.length - 1]
    };
}

function buildMontajeEvents() {
    const events = [];
    allOrders.forEach(order => {
        getOrderSpaceEntries(order).forEach(entry => {
            const dates = collectMontajeDatesForEntry(order, entry);
            if (!dates.length) return;
            const space = getSpaceById(entry.spaceId);
            const titleSpace = space?.nombre || entry.detail?.espacio_nombre || order.espacio_nombre || `Espacio ${entry.spaceId}`;
            const folio = order.numero_orden || String(order.id || '').split('-')[0].toUpperCase();
            const color = space?.color || '#374151';
            const quoteName = (order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || '').trim();
            const start = dates[0];
            const end = dates[dates.length - 1];
            events.push({
                id: `${order.id}|${entry.spaceId}`,
                title: `${titleSpace} - ${order.cliente_nombre || 'Cliente'}${quoteName ? ` (${quoteName})` : ''}`,
                start,
                end: nextDate(end),
                allDay: true,
                backgroundColor: color,
                borderColor: color,
                extendedProps: {
                    orderId: String(order.id),
                    spaceId: String(entry.spaceId),
                    client: order.cliente_nombre || '',
                    quoteName,
                    folio,
                    status: order.status || '',
                    premStart: start,
                    premEnd: end
                }
            });
        });
    });
    return events;
}

function fillSpaceFilter() {
    const sel = document.getElementById('mtg-space-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos los espacios</option>';
    allSpaces.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.nombre}</option>`; });
}

function applyFilters() {
    const spaceId = document.getElementById('mtg-space-filter')?.value || '';
    const term = (document.getElementById('mtg-search-input')?.value || '').toLowerCase().trim();

    let filtered = allMontajeEvents.slice();
    if (spaceId) filtered = filtered.filter(e => String(e.extendedProps.spaceId) === String(spaceId));
    if (term) {
        filtered = filtered.filter(e => {
            const c = String(e.extendedProps.client || '').toLowerCase();
            const f = String(e.extendedProps.folio || '').toLowerCase();
            const q = String(e.extendedProps.quoteName || '').toLowerCase();
            return c.includes(term) || f.includes(term) || q.includes(term);
        });
    }

    if (!calendarObj) return;
    calendarObj.removeAllEvents();
    calendarObj.addEventSource(filtered);
}

function refreshMontajeCalendar() {
    allMontajeEvents = buildMontajeEvents();
    if (!calendarObj) return;
    applyFilters();
}

function openMontajeModal(orderId, spaceId) {
    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (!order) return;
    const summary = buildMontajeSummary(order, spaceId);
    if (!summary) return showToast('No se encontraron fechas de premontaje.', 'error');
    const space = getSpaceById(spaceId);
    const detail = summary.detail || {};
    const conceptList = safeArray(order.conceptos_adicionales);
    const schedule = detail.horario?.label || detail.horario?.value || '--';
    const people = detail.personas || order.personas || 0;

    document.getElementById('mtg-order-id').value = order.id;
    document.getElementById('mtg-space-id').value = String(spaceId);
    document.getElementById('mtg-client').value = order.cliente_nombre || '';
    document.getElementById('mtg-quote-name').value = order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || '';
    document.getElementById('mtg-space-name').innerText = space?.nombre || detail.espacio_nombre || `Espacio ${spaceId}`;
    document.getElementById('mtg-schedule').innerText = schedule;
    document.getElementById('mtg-event-range').innerText = formatRangeDate(detail.fecha_inicio || order.fecha_inicio, detail.fecha_fin || order.fecha_fin || order.fecha_inicio);
    document.getElementById('mtg-people').innerText = `${people} px`;
    document.getElementById('mtg-total').innerText = moneyFmt(order.precio_final || 0);
    document.getElementById('mtg-start').value = summary.start;
    document.getElementById('mtg-end').value = summary.end;
    document.getElementById('mtg-end').min = summary.start;
    const eventStart = normalizeDate(detail.fecha_inicio || order.fecha_inicio);
    if (eventStart) {
        const maxPrem = addDays(eventStart, -1);
        document.getElementById('mtg-start').max = maxPrem;
        document.getElementById('mtg-end').max = maxPrem;
    } else {
        document.getElementById('mtg-start').removeAttribute('max');
        document.getElementById('mtg-end').removeAttribute('max');
    }

    const conceptBox = document.getElementById('mtg-concepts');
    conceptBox.innerHTML = conceptList.length
        ? conceptList.map(c => `<div class="flex justify-between"><span>${c.description || c.nombre || 'Concepto'}</span><span class="font-bold">${moneyFmt(parseFloat(c.amount || c.value || 0))}</span></div>`).join('')
        : '<div class="text-gray-400">Sin conceptos adicionales.</div>';

    const msg = document.getElementById('mtg-avail-msg');
    msg.className = 'text-center text-[10px] font-bold mt-1 p-1 rounded hidden';
    msg.innerHTML = '';

    const modal = document.getElementById('mtg-edit-modal');
    modal.classList.remove('hidden');
}

window.closeMontajeModal = function () {
    const modal = document.getElementById('mtg-edit-modal');
    if (modal) modal.classList.add('hidden');
};

async function loadPremontajePctConfig() {
    premontajePctGlobal = 25;
    try {
        const { data, error } = await window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,valor_num')
            .eq('clave', 'premontaje_pct')
            .maybeSingle();
        if (error || !data) return;
        const fromJson = parseFloat((safeObj(data.valor_json).value));
        const fromNum = parseFloat(data.valor_num);
        const pct = Number.isFinite(fromJson) ? fromJson : fromNum;
        if (Number.isFinite(pct) && pct >= 0) premontajePctGlobal = pct;
    } catch (e) {}
}

function buildMontajeConcept(spaceName, spaceId, dates, days, courtesy, amount, pct, breakdown) {
    return {
        description: `[${spaceName}] Premontaje (${days} días)${courtesy > 0 ? ` [${courtesy} cortesía]` : ''} - ${dates.map(formatDateMX).join(', ')}`,
        amount,
        value: amount,
        unit: 'fixed',
        type: 'b2b_montaje',
        meta: {
            space_id: spaceId,
            days,
            courtesy_days: courtesy,
            dates,
            percentage: pct,
            per_day_base: breakdown
        }
    };
}

function applyMontajeConcept(list, concept, spaceId) {
    const arr = safeArray(list).slice();
    const idx = arr.findIndex(c => String(c?.type || '').toLowerCase() === 'b2b_montaje' && String(safeObj(c?.meta).space_id || '') === String(spaceId));
    if (idx >= 0) arr[idx] = concept;
    else arr.push(concept);
    return arr;
}

function ensureOrderDetail(order, spaceId) {
    const details = safeArray(order.espacios_detalle).map(d => ({ ...d }));
    let idx = details.findIndex(d => String(d.espacio_id || d.space_id || '') === String(spaceId));
    if (idx >= 0) return { details, idx };

    const space = getSpaceById(spaceId);
    details.push({
        espacio_id: spaceId,
        espacio_nombre: space?.nombre || order.espacio_nombre || `Espacio ${spaceId}`,
        espacio_clave: space?.clave || order.espacio_clave || '',
        fecha_inicio: order.fecha_inicio,
        fecha_fin: order.fecha_fin || order.fecha_inicio,
        personas: order.personas || 1,
        horario: { value: '', label: '', amount: 0 },
        premontaje_dias: 0,
        premontaje_cortesia_dias: 0,
        premontaje_fechas: [],
        premontaje_total: 0,
        premontaje_detalle: [],
        horas_extra: 0,
        horas_extra_unitario: 0,
        horas_extra_total: 0,
        subtotal_espacio: 0,
        impuestos_ids: [],
        impuestos_total: 0
    });
    idx = details.length - 1;
    return { details, idx };
}

function calcPremontaje(space, guests, dates, courtesy, pct) {
    let total = 0;
    const breakdown = [];
    dates.forEach((ds, i) => {
        const base = getDayBasePrice(space, ds, guests, true);
        const raw = base * (pct / 100);
        const isCourtesy = i < courtesy;
        const amount = isCourtesy ? 0 : raw;
        total += amount;
        breakdown.push({
            date: ds,
            base_day: base,
            porcentaje: pct,
            courtesy: isCourtesy,
            amount
        });
    });
    return { total, breakdown };
}

async function hasMontajeConflict(orderId, spaceId, dates) {
    if (!dates.length) return false;
    const { data, error } = await window.tenantPocketBase
        .from('cotizaciones')
        .select('id,espacio_id,fecha_inicio,fecha_fin,espacios_detalle,conceptos_adicionales,status')
        .in('status', ACTIVE_STATUSES)
        .neq('id', orderId);
    if (error) return false;
    const target = new Set(dates.map(normalizeDate).filter(Boolean));
    for (const order of (data || [])) {
        const entries = getOrderSpaceEntries(order).filter(e => String(e.spaceId) === String(spaceId));
        for (const entry of entries) {
            const occupied = new Set();
            listDatesBetween(entry.start, entry.end).forEach(ds => occupied.add(ds));
            collectMontajeDatesForEntry(order, entry).forEach(ds => occupied.add(ds));
            for (const ds of target) {
                if (occupied.has(ds)) return true;
            }
        }
    }
    return false;
}

async function updateOrderMontajeRange(orderId, spaceId, start, end, notify = true) {
    const s = normalizeDate(start);
    const e = normalizeDate(end || start);
    if (!s || !e || e < s) throw new Error('Rango de fechas inválido.');
    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (!order) throw new Error('Cotización no encontrada.');
    const entry = getOrderSpaceEntries(order).find(x => String(x.spaceId) === String(spaceId));
    const eventStart = normalizeDate(entry?.start || order.fecha_inicio);
    if (eventStart && e >= eventStart) throw new Error('El premontaje debe terminar antes del inicio del evento.');

    const nextDates = listDatesBetween(s, e);
    const conflict = await hasMontajeConflict(orderId, spaceId, nextDates);
    if (conflict) throw new Error('Conflicto: el espacio está ocupado en parte del rango seleccionado.');

    const { details, idx } = ensureOrderDetail(order, spaceId);
    const detail = { ...details[idx] };
    const oldPrem = parseFloat(detail.premontaje_total || 0) || 0;
    const space = getSpaceById(spaceId);
    if (!space) throw new Error('Espacio no encontrado.');

    const guests = parseInt(detail.personas || order.personas || 1, 10) || 1;
    const courtesy = Math.min(parseInt(detail.premontaje_cortesia_dias || 0, 10) || 0, nextDates.length);
    const pct = getConceptPremPct(order, detail, spaceId);
    const calc = calcPremontaje(space, guests, nextDates, courtesy, pct);
    const days = nextDates.length;

    detail.premontaje_dias = days;
    detail.premontaje_fechas = nextDates;
    detail.premontaje_cortesia_dias = courtesy;
    detail.premontaje_total = calc.total;
    detail.premontaje_detalle = calc.breakdown;
    detail.conceptos_adicionales = applyMontajeConcept(
        detail.conceptos_adicionales,
        buildMontajeConcept(space.nombre, spaceId, nextDates, days, courtesy, calc.total, pct, calc.breakdown),
        spaceId
    );
    details[idx] = detail;

    const concepts = applyMontajeConcept(
        order.conceptos_adicionales,
        buildMontajeConcept(space.nombre, spaceId, nextDates, days, courtesy, calc.total, pct, calc.breakdown),
        spaceId
    );

    const delta = calc.total - oldPrem;
    const taxIds = safeArray(detail.impuestos_ids);
    const taxRate = taxIds.reduce((acc, taxId) => acc + getTaxRateById(taxId), 0);
    const deltaTax = delta * taxRate;

    const desglose = safeObj(order.desglose_precios);
    if (Number.isFinite(parseFloat(desglose.subtotal_antes_impuestos))) desglose.subtotal_antes_impuestos = (parseFloat(desglose.subtotal_antes_impuestos) || 0) + delta;
    if (Number.isFinite(parseFloat(desglose.total_sin_impuestos))) desglose.total_sin_impuestos = (parseFloat(desglose.total_sin_impuestos) || 0) + delta;
    if (Number.isFinite(parseFloat(desglose.subtotal))) desglose.subtotal = (parseFloat(desglose.subtotal) || 0) + delta;
    if (Number.isFinite(parseFloat(desglose.tax_total))) desglose.tax_total = (parseFloat(desglose.tax_total) || 0) + deltaTax;

    const spacesBreakdown = safeArray(desglose.espacios).map(sp => ({ ...sp }));
    const sbIdx = spacesBreakdown.findIndex(sp => String(sp.espacio_id || sp.spaceId || '') === String(spaceId));
    if (sbIdx >= 0) {
        const sp = { ...spacesBreakdown[sbIdx] };
        sp.premontaje_dias = days;
        sp.premontaje_cortesia_dias = courtesy;
        sp.premontaje_fechas = nextDates;
        sp.premontaje_total = calc.total;
        sp.premontaje_detalle = calc.breakdown;
        if (Number.isFinite(parseFloat(sp.subtotal_espacio))) sp.subtotal_espacio = (parseFloat(sp.subtotal_espacio) || 0) + delta;
        spacesBreakdown[sbIdx] = sp;
    }
    if (spacesBreakdown.length) desglose.espacios = spacesBreakdown;

    const nextPrice = Math.max(0, (parseFloat(order.precio_final || 0) || 0) + delta + deltaTax);
    const payload = {
        espacios_detalle: details,
        conceptos_adicionales: concepts,
        desglose_precios: desglose,
        precio_final: nextPrice
    };

    const { error } = await window.tenantPocketBase.from('cotizaciones').update(payload).eq('id', orderId);
    if (error) throw error;

    order.espacios_detalle = details;
    order.conceptos_adicionales = concepts;
    order.desglose_precios = desglose;
    order.precio_final = nextPrice;

    refreshMontajeCalendar();
    if (notify) showToast('Premontaje actualizado correctamente.');
    return true;
}

window.checkMontajeRangeAvailability = async function () {
    const id = document.getElementById('mtg-order-id')?.value;
    const spaceId = document.getElementById('mtg-space-id')?.value;
    const start = document.getElementById('mtg-start')?.value;
    const end = document.getElementById('mtg-end')?.value;
    const msg = document.getElementById('mtg-avail-msg');
    if (!msg) return;
    msg.className = 'text-center text-[10px] font-bold mt-1 p-1 rounded hidden';
    msg.innerHTML = '';
    if (!id || !spaceId || !start || !end) return;
    if (end < start) {
        msg.classList.remove('hidden');
        msg.classList.add('bg-red-100', 'text-red-600');
        msg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> RANGO INVÁLIDO';
        return;
    }
    const dates = listDatesBetween(start, end);
    const conflict = await hasMontajeConflict(id, spaceId, dates);
    msg.classList.remove('hidden');
    if (conflict) {
        msg.classList.add('bg-red-100', 'text-red-600');
        msg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> OCUPADO';
    } else {
        msg.classList.add('bg-green-100', 'text-green-700');
        msg.innerHTML = '<i class="fa-solid fa-check-circle"></i> DISPONIBLE';
    }
};

window.saveMontajeRangeFromModal = async function () {
    const btn = document.getElementById('btn-mtg-save');
    const id = document.getElementById('mtg-order-id')?.value;
    const spaceId = document.getElementById('mtg-space-id')?.value;
    const start = document.getElementById('mtg-start')?.value;
    const end = document.getElementById('mtg-end')?.value;
    if (!id || !spaceId) return;
    if (btn) { btn.disabled = true; btn.innerText = 'Guardando...'; }
    try {
        await updateOrderMontajeRange(id, spaceId, start, end, true);
        window.closeMontajeModal();
    } catch (e) {
        showToast(e.message || 'No se pudo actualizar.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Guardar Fechas'; }
    }
};

function initCalendar() {
    const el = document.getElementById('montajes-calendar');
    if (!el) return;
    calendarObj = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: 'es',
        editable: true,
        eventDurationEditable: true,
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        height: '100%',
        events: allMontajeEvents,
        eventClick: (info) => {
            openMontajeModal(info.event.extendedProps.orderId, info.event.extendedProps.spaceId);
        },
        eventDrop: async (info) => {
            const start = normalizeDate(info.event.startStr.slice(0, 10));
            const endExclusive = normalizeDate((info.event.endStr || '').slice(0, 10));
            const end = endExclusive ? addDays(endExclusive, -1) : start;
            try {
                await updateOrderMontajeRange(info.event.extendedProps.orderId, info.event.extendedProps.spaceId, start, end, true);
            } catch (e) {
                info.revert();
                showToast(e.message || 'No se pudo mover el premontaje.', 'error');
            }
        },
        eventResize: async (info) => {
            const start = normalizeDate(info.event.startStr.slice(0, 10));
            const endExclusive = normalizeDate((info.event.endStr || '').slice(0, 10));
            const end = endExclusive ? addDays(endExclusive, -1) : start;
            try {
                await updateOrderMontajeRange(info.event.extendedProps.orderId, info.event.extendedProps.spaceId, start, end, true);
            } catch (e) {
                info.revert();
                showToast(e.message || 'No se pudo ajustar el rango.', 'error');
            }
        },
        eventDidMount: (info) => {
            const p = info.event.extendedProps;
            info.el.title = `${info.event.title}\n${formatRangeDate(p.premStart, p.premEnd)}`;
        }
    });
    calendarObj.render();
}

async function loadData() {
    const [spacesRes, ordersRes, taxesRes] = await Promise.all([
        window.tenantPocketBase.from('espacios').select('*'),
        window.tenantPocketBase.from('cotizaciones').select('*').in('status', ACTIVE_STATUSES).order('created_at', { ascending: false }),
        window.tenantPocketBase.from('impuestos').select('*')
    ]);
    allSpaces = spacesRes.data || [];
    allOrders = ordersRes.data || [];
    allTaxes = taxesRes.data || [];
    await loadPremontajePctConfig();
    allMontajeEvents = buildMontajeEvents();
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.PB_CLIENT) {
        if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }

    const { data: { session } } = await window.globalPocketBase.auth.getSession();
    if (!session) return;

    await loadData();
    fillSpaceFilter();
    initCalendar();

    document.getElementById('mtg-space-filter')?.addEventListener('change', applyFilters);
    document.getElementById('mtg-search-input')?.addEventListener('input', applyFilters);

    const modal = document.getElementById('mtg-edit-modal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) window.closeMontajeModal();
    });
});





