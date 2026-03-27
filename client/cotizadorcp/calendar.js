/**
 * DOC: client\cotizadorcp\calendar.js
 * Proposito: Calendario de agenda/premontajes y operaciones de fecha.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// ============================================================================
// CALENDARIO UNIFICADO CASA DE PIEDRA (AGENDA + PREMONTAJES)
// ============================================================================
// Este modulo unifica la agenda y los premontajes en una sola pantalla.
// - Vista full-page con FullCalendar (dayGrid/list).
// - Eventos tipo pildora (estilo calendario moderno).
// - Filtros por espacio / tipo / busqueda.
// - Edicion de fechas desde modal para evento o premontaje.
// - Respeta no empalme por espacio contra cotizaciones aprobadas/finalizadas.
// ============================================================================

const FIN_SCHEMA = 'finanzas_casadepiedra';
const CP_CALENDAR_CONFIG_TENANT = 'casa_de_piedra';

const BLOCKING_STATUSES = ['aprobada', 'finalizada'];
const VISIBLE_STATUSES = ['pendiente', 'aprobada', 'finalizada'];
const KIND_EVENTO = 'evento';
const KIND_PREMONTAJE = 'premontaje';
const WEEK_KEYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

let allSpaces = [];
let allOrders = [];
let allTaxes = [];
let allCalendarEvents = [];
let calendarObj = null;
let premontajePctGlobal = 25;
let myPermissions = { access: false, orders_edit: false };

const uiState = {
    search: '',
    spaceId: '',
    kind: 'all'
};

const editState = {
    orderId: '',
    spaceId: '',
    kind: KIND_EVENTO,
    detailIndex: -1,
    status: '',
    originalStart: '',
    originalEnd: ''
};

// ----------------------------------------------------------------------------
// Helpers base
// ----------------------------------------------------------------------------
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

function pickLatestConfigRow(rows) {
    const list = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
    if (!list.length) return null;
    list.sort((a, b) => {
        const aTs = Date.parse(String(a.updated_at || a.updated || a.created_at || a.created || '')) || 0;
        const bTs = Date.parse(String(b.updated_at || b.updated || b.created_at || b.created || '')) || 0;
        return bTs - aTs;
    });
    return list[0] || null;
}

function normalizeDate(v) {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function parseYmd(v) {
    const ds = normalizeDate(v);
    if (!ds) return null;
    const d = new Date(`${ds}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(dateObj) {
    if (!dateObj) return '';
    return window.getLocalYMD ? window.getLocalYMD(dateObj) : new Date(dateObj).toISOString().slice(0, 10);
}

function addDays(ds, delta) {
    const d = parseYmd(ds);
    if (!d) return ds;
    d.setDate(d.getDate() + (delta || 0));
    return ymd(d);
}

function diffDays(from, to) {
    const a = parseYmd(from);
    const b = parseYmd(to);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return !(aEnd < bStart || aStart > bEnd);
}

function listDatesBetween(start, end) {
    const s = normalizeDate(start);
    const e = normalizeDate(end || start);
    if (!s || !e || e < s) return [];
    const out = [];
    for (let d = parseYmd(s); d && d <= parseYmd(e); d.setDate(d.getDate() + 1)) {
        out.push(ymd(d));
    }
    return out;
}

function uniqSortedDates(dates) {
    return Array.from(new Set(safeArray(dates).map(normalizeDate).filter(Boolean))).sort();
}

function formatMoney(value) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
}

function formatDateMX(ds) {
    const d = normalizeDate(ds);
    if (!d) return '--';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
}

function hexToRgba(hex, alpha) {
    const raw = String(hex || '').replace('#', '').trim();
    const expanded = raw.length === 3 ? raw.split('').map(x => x + x).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(55,65,81,${alpha})`;
    const n = parseInt(expanded, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkHex(hex) {
    const raw = String(hex || '').replace('#', '').trim();
    const expanded = raw.length === 3 ? raw.split('').map(x => x + x).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return false;
    const n = parseInt(expanded, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.58;
}

function parseSpacesDetail(v) {
    return safeArray(v);
}

function getSpaceById(id) {
    return allSpaces.find(s => String(s.id) === String(id)) || null;
}

function isBlockingStatus(status) {
    return BLOCKING_STATUSES.includes(String(status || '').toLowerCase());
}

function getOrderSpaceEntries(order) {
    const details = parseSpacesDetail(order?.espacios_detalle);
    if (details.length) {
        return details.map((item, idx) => ({
            spaceId: item.espacio_id || item.space_id || order.espacio_id,
            start: normalizeDate(item.fecha_inicio || order.fecha_inicio),
            end: normalizeDate(item.fecha_fin || item.fecha_inicio || order.fecha_fin || order.fecha_inicio),
            detail: item,
            detailIndex: idx
        })).filter(x => x.spaceId && x.start && x.end);
    }
    return [{
        spaceId: order?.espacio_id,
        start: normalizeDate(order?.fecha_inicio),
        end: normalizeDate(order?.fecha_fin || order?.fecha_inicio),
        detail: null,
        detailIndex: -1
    }].filter(x => x.spaceId && x.start && x.end);
}

function collectPremontajeDates(order, entry) {
    const set = new Set();
    const addDate = (v) => {
        const d = normalizeDate(v);
        if (d) set.add(d);
    };

    if (entry.detail) {
        safeArray(entry.detail.premontaje_fechas).forEach(addDate);
        safeArray(entry.detail.conceptos_adicionales).forEach(c => {
            if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
            safeArray(safeObj(c.meta).dates).forEach(addDate);
        });
    }

    safeArray(order.conceptos_adicionales).forEach(c => {
        if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
        const meta = safeObj(c.meta);
        const conceptSpace = meta.space_id || order.espacio_id;
        if (String(conceptSpace || '') !== String(entry.spaceId || '')) return;
        safeArray(meta.dates).forEach(addDate);
    });

    return Array.from(set).sort();
}

function splitIntoContiguousRanges(dates) {
    const sorted = uniqSortedDates(dates);
    if (!sorted.length) return [];
    const out = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
        const cur = sorted[i];
        if (cur === addDays(prev, 1)) {
            prev = cur;
            continue;
        }
        out.push({ start, end: prev });
        start = cur;
        prev = cur;
    }
    out.push({ start, end: prev });
    return out;
}

function loadKindFromQuery() {
    const q = new URLSearchParams(window.location.search || '');
    const kind = String(q.get('kind') || '').toLowerCase();
    if (kind === KIND_PREMONTAJE || kind === KIND_EVENTO) uiState.kind = kind;
}

function syncKindNav() {
    const agendaLink = document.getElementById('nav-link-agenda');
    const premLink = document.getElementById('nav-link-prem');
    const activeClasses = ['bg-white/20', 'shadow-inner'];
    const inactive = 'hover:bg-white/20';
    if (agendaLink) {
        agendaLink.classList.remove(...activeClasses);
        agendaLink.classList.add(inactive);
    }
    if (premLink) {
        premLink.classList.remove(...activeClasses);
        premLink.classList.add(inactive);
    }
    if (uiState.kind === KIND_PREMONTAJE && premLink) {
        premLink.classList.add(...activeClasses);
        premLink.classList.remove(inactive);
    } else if (agendaLink) {
        agendaLink.classList.add(...activeClasses);
        agendaLink.classList.remove(inactive);
    }
}

function resolvePbUrl() {
    if (typeof window.getHubBackendUrl === 'function') {
        const fromHelper = String(window.getHubBackendUrl() || '').trim();
        if (fromHelper) return fromHelper;
    }
    return String(window.HUB_CONFIG?.pocketbaseUrl || 'http://127.0.0.1:8090').trim();
}

function resolvePbKey() {
    return String(window.HUB_CONFIG?.pocketbaseAnonKey || '').trim();
}

// ----------------------------------------------------------------------------
// Carga inicial y permisos
// ----------------------------------------------------------------------------
async function initClients() {
    if (!window.PB_CLIENT) return false;
    const pbUrl = resolvePbUrl();
    const pbKey = resolvePbKey();
    const normalized = String(pbUrl || '').replace(/\/+$/, '');
    const currentBase = String(window.globalPocketBase?.baseUrl || '').replace(/\/+$/, '');
    if (!window.globalPocketBase || (normalized && normalized !== currentBase)) {
        window.globalPocketBase = window.PB_CLIENT.createClient(pbUrl, pbKey);
        window.tenantPocketBase = null;
    }
    if (!window.tenantPocketBase) window.tenantPocketBase = window.globalPocketBase.schema(FIN_SCHEMA);
    return true;
}

function resolvePermissions(profile) {
    const role = String(profile?.role || '').toLowerCase().trim();
    const roleHasAccess = role === 'admin' || role === 'casa_de_piedra' || role === 'ambos';
    if (role === 'admin' || roleHasAccess) return { access: true, orders_edit: true };
    return {
        access: !!profile?.app_metadata?.finanzas?.permissions?.access,
        orders_edit: !!profile?.app_metadata?.finanzas?.permissions?.orders_edit
    };
}

async function loadBaseData() {
    const [spacesRes, ordersRes, taxesRes, configRes] = await Promise.all([
        window.tenantPocketBase.from('espacios').select('*').order('nombre', { ascending: true }),
        window.tenantPocketBase.from('cotizaciones').select('*').in('status', VISIBLE_STATUSES).order('created_at', { ascending: false }),
        window.tenantPocketBase.from('impuestos').select('*'),
        window.tenantPocketBase
            .from('configuracion')
            .select('clave,valor_json,valor_num,updated,updated_at,created,created_at')
            .eq('tenant', CP_CALENDAR_CONFIG_TENANT)
            .eq('clave', 'premontaje_pct')
    ]);

    allSpaces = spacesRes.data || [];
    allOrders = ordersRes.data || [];
    allTaxes = taxesRes.data || [];

    const cfgRows = Array.isArray(configRes.data) ? configRes.data : (configRes.data ? [configRes.data] : []);
    const cfg = pickLatestConfigRow(cfgRows);
    const jsonPct = parseFloat(safeObj(cfg?.valor_json).value);
    const numPct = parseFloat(cfg?.valor_num);
    const pct = Number.isFinite(jsonPct) ? jsonPct : numPct;
    premontajePctGlobal = Number.isFinite(pct) && pct >= 0 ? pct : 25;
}
// ----------------------------------------------------------------------------
// Construccion de eventos FullCalendar
// ----------------------------------------------------------------------------
function getEventLabel(order, entry, kind) {
    const space = getSpaceById(entry.spaceId);
    const spaceName = space?.nombre || entry.detail?.espacio_nombre || order.espacio_nombre || `Espacio ${entry.spaceId}`;
    const quote = (order.nombre_cotizacion || order.detalles_evento?.nombre_cotizacion || '').trim();
    const client = String(order.cliente_nombre || 'Cliente').trim();
    const base = quote ? `${quote} - ${client}` : client;
    if (kind === KIND_PREMONTAJE) return `${spaceName} - ${base}`;
    return `${spaceName} - ${base}`;
}

function buildConceptPreview(order, entry) {
    const list = [];
    const pushConcept = (c) => {
        const desc = String(c?.description || c?.nombre || '').trim();
        const amount = Number(c?.amount ?? c?.value ?? 0);
        if (!desc) return;
        list.push({ desc, amount });
    };
    safeArray(order.conceptos_adicionales).forEach(pushConcept);
    safeArray(entry?.detail?.conceptos_adicionales).forEach(pushConcept);
    const uniq = new Map();
    list.forEach(c => uniq.set(`${c.desc}|${c.amount}`, c));
    return Array.from(uniq.values());
}

function buildCalendarEvents() {
    const out = [];
    allOrders.forEach(order => {
        const status = String(order.status || '').toLowerCase();
        getOrderSpaceEntries(order).forEach(entry => {
            const space = getSpaceById(entry.spaceId);
            const color = space?.color || '#374151';
            const conceptPreview = buildConceptPreview(order, entry);
            const people = entry.detail?.personas ?? order.personas ?? 0;
            const horario = entry.detail?.horario?.label || entry.detail?.horario?.value || '--';

            out.push({
                id: `ev|${order.id}|${entry.spaceId}|${entry.detailIndex}`,
                title: getEventLabel(order, entry, KIND_EVENTO),
                start: entry.start,
                end: addDays(entry.end, 1),
                allDay: true,
                classNames: ['cp-cal-pill'],
                extendedProps: {
                    kind: KIND_EVENTO,
                    orderId: String(order.id),
                    spaceId: String(entry.spaceId),
                    detailIndex: entry.detailIndex,
                    status,
                    color,
                    order,
                    entry,
                    schedule: horario,
                    people: Number(people || 0),
                    concepts: conceptPreview,
                    sourceStart: entry.start,
                    sourceEnd: entry.end
                }
            });

            const premDates = collectPremontajeDates(order, entry);
            splitIntoContiguousRanges(premDates).forEach((range, idx) => {
                out.push({
                    id: `pm|${order.id}|${entry.spaceId}|${entry.detailIndex}|${idx}`,
                    title: getEventLabel(order, entry, KIND_PREMONTAJE),
                    start: range.start,
                    end: addDays(range.end, 1),
                    allDay: true,
                    classNames: ['cp-cal-pill'],
                    extendedProps: {
                        kind: KIND_PREMONTAJE,
                        orderId: String(order.id),
                        spaceId: String(entry.spaceId),
                        detailIndex: entry.detailIndex,
                        status,
                        color,
                        order,
                        entry,
                        schedule: horario,
                        people: Number(people || 0),
                        concepts: conceptPreview,
                        sourceStart: range.start,
                        sourceEnd: range.end
                    }
                });
            });
        });
    });
    return out;
}

function renderEventPill(arg) {
    const ext = arg.event.extendedProps || {};
    const kind = ext.kind || KIND_EVENTO;
    const baseColor = ext.color || '#374151';
    const dark = isDarkHex(baseColor);
    const isPrem = kind === KIND_PREMONTAJE;
    const bg = isPrem ? hexToRgba(baseColor, 0.25) : hexToRgba(baseColor, 0.92);
    const fg = isPrem ? '#111827' : (dark ? '#ffffff' : '#0f172a');
    const tagBg = isPrem ? hexToRgba(baseColor, 0.38) : hexToRgba('#111827', 0.18);
    const tagText = isPrem ? '#111827' : (dark ? '#ffffff' : '#111827');
    const tag = isPrem ? 'PREMONTAJE' : 'EVENTO';

    const wrap = document.createElement('div');
    wrap.className = `cp-pill ${isPrem ? 'is-premontaje' : ''}`;
    wrap.style.background = bg;
    wrap.style.color = fg;
    wrap.innerHTML = `<span class="cp-pill-tag" style="background:${tagBg};color:${tagText};">${tag}</span><span class="cp-pill-label">${arg.event.title}</span>`;
    return { domNodes: [wrap] };
}

function applyFilters() {
    uiState.search = String(document.getElementById('cal-search-input')?.value || '').toLowerCase().trim();
    uiState.spaceId = String(document.getElementById('cal-space-filter')?.value || '');
    uiState.kind = String(document.getElementById('cal-kind-filter')?.value || 'all');
    syncKindNav();

    const filtered = allCalendarEvents.filter(ev => {
        const ext = ev.extendedProps || {};
        if (uiState.spaceId && String(ext.spaceId) !== String(uiState.spaceId)) return false;
        if (uiState.kind !== 'all' && ext.kind !== uiState.kind) return false;
        if (!uiState.search) return true;
        const order = ext.order || {};
        const space = getSpaceById(ext.spaceId);
        const probe = [
            ev.title,
            order.cliente_nombre,
            order.nombre_cotizacion,
            order.numero_orden,
            String(order.id || ''),
            space?.nombre || '',
            space?.clave || '',
            space?.codigo || ''
        ].join(' ').toLowerCase();
        return probe.includes(uiState.search);
    });

    if (!calendarObj) return;
    calendarObj.removeAllEvents();
    calendarObj.addEventSource(filtered);
}

function fillSpaceFilter() {
    const sel = document.getElementById('cal-space-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos los espacios</option>';
    allSpaces.forEach(s => {
        sel.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });
}

function initCalendar() {
    const el = document.getElementById('calendar');
    if (!el || typeof FullCalendar === 'undefined') return;
    calendarObj = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        locale: 'es',
        height: '100%',
        fixedWeekCount: false,
        eventDisplay: 'block',
        dayMaxEvents: false,
        dayMaxEventRows: false,
        displayEventTime: false,
        buttonText: { today: 'Hoy', month: 'Mes', list: 'Lista' },
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        events: allCalendarEvents,
        eventContent: renderEventPill,
        eventClick: (info) => window.openCalendarEditModal(info.event),
        eventDidMount: (info) => {
            const ext = info.event.extendedProps || {};
            const kindLabel = ext.kind === KIND_PREMONTAJE ? 'PREMONTAJE' : 'EVENTO';
            info.el.title = `${kindLabel}\n${info.event.title}\n${formatDateMX(ext.sourceStart)} - ${formatDateMX(ext.sourceEnd)}`;
        }
    });
    calendarObj.render();
    setTimeout(() => calendarObj?.updateSize(), 120);
    window.addEventListener('resize', () => setTimeout(() => calendarObj?.updateSize(), 60));
}
// ----------------------------------------------------------------------------
// Edicion de fecha desde modal
// ----------------------------------------------------------------------------
function setAvailabilityMsg(text, type) {
    const box = document.getElementById('ce-avail-msg');
    if (!box) return;
    box.className = 'text-center text-[10px] font-bold p-1 rounded';
    if (!text) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    box.classList.remove('hidden');
    if (type === 'error') box.classList.add('bg-red-100', 'text-red-600');
    else box.classList.add('bg-green-100', 'text-green-700');
    box.innerHTML = text;
}

function renderConceptsInModal(concepts) {
    const box = document.getElementById('ce-concepts');
    if (!box) return;
    const list = safeArray(concepts);
    box.innerHTML = list.length
        ? list.map(c => `<div class="flex items-center justify-between gap-2"><span class="truncate">${c.desc || 'Concepto'}</span><span class="font-bold">${formatMoney(c.amount || 0)}</span></div>`).join('')
        : '<div class="text-gray-400">Sin conceptos para mostrar.</div>';
}

function openEditModalFromEvent(fcEvent) {
    const ext = fcEvent.extendedProps || {};
    const order = ext.order || {};
    const space = getSpaceById(ext.spaceId);
    const kind = ext.kind || KIND_EVENTO;
    editState.orderId = String(ext.orderId || '');
    editState.spaceId = String(ext.spaceId || '');
    editState.kind = kind;
    editState.detailIndex = Number(ext.detailIndex ?? -1);
    editState.status = String(ext.status || '');
    editState.originalStart = normalizeDate(ext.sourceStart);
    editState.originalEnd = normalizeDate(ext.sourceEnd || ext.sourceStart);

    document.getElementById('ce-order-id').value = editState.orderId;
    document.getElementById('ce-space-id').value = editState.spaceId;
    document.getElementById('ce-kind').value = editState.kind;
    document.getElementById('ce-kind-text').innerText = kind === KIND_PREMONTAJE ? 'PREMONTAJE' : 'EVENTO';
    document.getElementById('ce-space-name').innerText = space?.nombre || ext.entry?.detail?.espacio_nombre || `Espacio ${editState.spaceId}`;
    document.getElementById('ce-client-quote').innerText = `${order.cliente_nombre || '--'}${order.nombre_cotizacion ? ` / ${order.nombre_cotizacion}` : ''}`;
    document.getElementById('ce-horario').innerText = ext.schedule || '--';
    document.getElementById('ce-people').innerText = `${Number(ext.people || 0)} px`;
    document.getElementById('ce-total').innerText = formatMoney(order.precio_final || 0);
    document.getElementById('ce-start').value = editState.originalStart;
    document.getElementById('ce-end').value = editState.originalEnd;
    renderConceptsInModal(ext.concepts || []);

    const locked = !myPermissions.orders_edit || isBlockingStatus(editState.status);
    document.getElementById('ce-start').disabled = locked;
    document.getElementById('ce-end').disabled = locked;
    const saveBtn = document.getElementById('btn-ce-save');
    saveBtn.disabled = locked;
    saveBtn.classList.toggle('opacity-60', locked);
    setAvailabilityMsg('', '');
    if (locked) {
        setAvailabilityMsg('<i class="fa-solid fa-lock"></i> Edicion bloqueada para cotizacion aprobada/finalizada.', 'error');
    }

    window.openModal ? window.openModal('calendar-edit-modal') : document.getElementById('calendar-edit-modal')?.classList.remove('hidden');
}

async function hasConflictForRange(kind, orderId, spaceId, start, end) {
    const s = normalizeDate(start);
    const e = normalizeDate(end || start);
    if (!s || !e || e < s) return { conflict: true, msg: 'Rango invalido.' };
    const targetDates = new Set(listDatesBetween(s, e));

    const { data, error } = await window.tenantPocketBase
        .from('cotizaciones')
        .select('id,status,espacio_id,fecha_inicio,fecha_fin,espacios_detalle,conceptos_adicionales,cliente_nombre,nombre_cotizacion')
        .in('status', BLOCKING_STATUSES)
        .neq('id', orderId);
    if (error) return { conflict: false, msg: '' };

    for (const order of (data || [])) {
        const entries = getOrderSpaceEntries(order).filter(en => String(en.spaceId) === String(spaceId));
        for (const entry of entries) {
            const eventDates = new Set(listDatesBetween(entry.start, entry.end));
            const premDates = collectPremontajeDates(order, entry);
            if (kind === KIND_EVENTO) {
                if (rangesOverlap(entry.start, entry.end, s, e)) {
                    return { conflict: true, msg: `Conflicto con evento en ${order.cliente_nombre || 'otro cliente'}.` };
                }
                if (premDates.some(d => targetDates.has(d))) {
                    return { conflict: true, msg: `Conflicto con premontaje en ${order.cliente_nombre || 'otro cliente'}.` };
                }
            } else {
                for (const d of targetDates) {
                    if (eventDates.has(d) || premDates.includes(d)) {
                        return { conflict: true, msg: `Conflicto en ${formatDateMX(d)} con ${order.cliente_nombre || 'otro cliente'}.` };
                    }
                }
            }
        }
    }
    return { conflict: false, msg: '' };
}

window.checkCalendarEditAvailability = async function checkCalendarEditAvailability() {
    if (isBlockingStatus(editState.status) || !myPermissions.orders_edit) return;
    const start = normalizeDate(document.getElementById('ce-start')?.value);
    const end = normalizeDate(document.getElementById('ce-end')?.value || start);
    if (!start || !end || end < start) return setAvailabilityMsg('<i class="fa-solid fa-triangle-exclamation"></i> Rango invalido.', 'error');
    const check = await hasConflictForRange(editState.kind, editState.orderId, editState.spaceId, start, end);
    if (check.conflict) setAvailabilityMsg(`<i class="fa-solid fa-triangle-exclamation"></i> ${check.msg}`, 'error');
    else setAvailabilityMsg('<i class="fa-solid fa-check-circle"></i> Disponible', 'ok');
};

window.saveCalendarEdit = async function saveCalendarEdit() {
    if (!myPermissions.orders_edit || isBlockingStatus(editState.status)) return;
    const btn = document.getElementById('btn-ce-save');
    const start = normalizeDate(document.getElementById('ce-start')?.value);
    const end = normalizeDate(document.getElementById('ce-end')?.value || start);
    if (!start || !end || end < start) return setAvailabilityMsg('<i class="fa-solid fa-triangle-exclamation"></i> Rango invalido.', 'error');
    const conflict = await hasConflictForRange(editState.kind, editState.orderId, editState.spaceId, start, end);
    if (conflict.conflict) return setAvailabilityMsg(`<i class="fa-solid fa-triangle-exclamation"></i> ${conflict.msg}`, 'error');

    const order = allOrders.find(o => String(o.id) === String(editState.orderId));
    if (!order) return window.showToast?.('No se encontro la cotizacion.', 'error');

    if (btn) { btn.disabled = true; btn.innerText = 'Guardando...'; }
    try {
        const details = parseSpacesDetail(order.espacios_detalle).map(d => ({ ...d }));
        const orderConcepts = safeArray(order.conceptos_adicionales).map(c => ({ ...c, meta: safeObj(c.meta) }));

        if (editState.kind === KIND_EVENTO) {
            if (details.length) {
                const idx = details.findIndex((d, i) => i === editState.detailIndex || String(d.espacio_id || d.space_id || '') === String(editState.spaceId));
                if (idx >= 0) {
                    const item = { ...details[idx] };
                    const oldStart = normalizeDate(item.fecha_inicio || order.fecha_inicio);
                    const delta = diffDays(oldStart, start);
                    item.fecha_inicio = start;
                    item.fecha_fin = end;
                    item.premontaje_fechas = safeArray(item.premontaje_fechas).map(ds => addDays(ds, delta));
                    details[idx] = item;
                    orderConcepts.forEach(c => {
                        if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
                        const sid = c.meta?.space_id || order.espacio_id;
                        if (String(sid || '') !== String(editState.spaceId || '')) return;
                        c.meta = { ...c.meta, dates: safeArray(c.meta?.dates).map(ds => addDays(ds, delta)) };
                    });
                }
                const starts = details.map(d => normalizeDate(d.fecha_inicio)).filter(Boolean).sort();
                const ends = details.map(d => normalizeDate(d.fecha_fin || d.fecha_inicio)).filter(Boolean).sort();
                order.fecha_inicio = starts[0] || start;
                order.fecha_fin = ends[ends.length - 1] || end;
            } else {
                const oldStart = normalizeDate(order.fecha_inicio);
                const delta = diffDays(oldStart, start);
                order.fecha_inicio = start;
                order.fecha_fin = end;
                orderConcepts.forEach(c => {
                    if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
                    c.meta = { ...safeObj(c.meta), dates: safeArray(safeObj(c.meta).dates).map(ds => addDays(ds, delta)) };
                });
            }
        } else {
            const nextDates = listDatesBetween(start, end);
            const detailIndex = details.findIndex((d, i) => i === editState.detailIndex || String(d.espacio_id || d.space_id || '') === String(editState.spaceId));
            if (detailIndex >= 0) {
                const detail = { ...details[detailIndex] };
                detail.premontaje_fechas = nextDates;
                detail.premontaje_dias = nextDates.length;
                detail.premontaje_cortesia_dias = Math.min(Number(detail.premontaje_cortesia_dias || 0), nextDates.length);
                details[detailIndex] = detail;
            }
            orderConcepts.forEach(c => {
                if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
                const sid = safeObj(c.meta).space_id || order.espacio_id;
                if (String(sid || '') !== String(editState.spaceId || '')) return;
                c.meta = { ...safeObj(c.meta), dates: nextDates };
            });
        }

        const payload = { espacios_detalle: details, conceptos_adicionales: orderConcepts, fecha_inicio: order.fecha_inicio, fecha_fin: order.fecha_fin };
        const { error } = await window.tenantPocketBase.from('cotizaciones').update(payload).eq('id', order.id);
        if (error) throw error;

        order.espacios_detalle = details;
        order.conceptos_adicionales = orderConcepts;
        allCalendarEvents = buildCalendarEvents();
        applyFilters();
        window.closeCalendarEditModal();
        window.showToast?.('Calendario actualizado correctamente.', 'success');
    } catch (e) {
        window.showToast?.((e && e.message) || 'No se pudo guardar.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Guardar'; }
    }
};

window.openCalendarEditModal = function openCalendarEditModal(fcEvent) {
    openEditModalFromEvent(fcEvent);
};

window.closeCalendarEditModal = function closeCalendarEditModal() {
    const m = document.getElementById('calendar-edit-modal');
    if (m) m.classList.add('hidden');
};
// ----------------------------------------------------------------------------
// Modal de colores por espacio
// ----------------------------------------------------------------------------
window.openColorModal = function openColorModal() {
    const list = document.getElementById('color-list');
    if (!list) return;
    list.innerHTML = allSpaces.length
        ? allSpaces.map(s => `<div class="flex items-center justify-between p-2 border-b border-gray-100 last:border-0"><span class="text-xs font-bold text-gray-700">${s.nombre}</span><input type="color" id="color-input-${s.id}" value="${s.color || '#374151'}" class="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"></div>`).join('')
        : '<p class="text-xs text-gray-400">No hay espacios disponibles.</p>';
    window.openModal ? window.openModal('color-modal') : document.getElementById('color-modal')?.classList.remove('hidden');
};

window.saveAllColors = async function saveAllColors() {
    const btn = document.getElementById('btn-save-colors');
    if (btn) { btn.disabled = true; btn.innerText = 'Guardando...'; }
    try {
        const updates = [];
        allSpaces.forEach(s => {
            const input = document.getElementById(`color-input-${s.id}`);
            const next = input?.value || s.color || '#374151';
            if (next !== s.color) {
                updates.push(window.tenantPocketBase.from('espacios').update({ color: next }).eq('id', s.id));
                s.color = next;
            }
        });
        if (updates.length) await Promise.all(updates);
        allCalendarEvents = buildCalendarEvents();
        applyFilters();
        window.closeModal ? window.closeModal('color-modal') : document.getElementById('color-modal')?.classList.add('hidden');
        window.showToast?.('Colores actualizados.', 'success');
    } catch (e) {
        window.showToast?.('No se pudieron guardar los colores.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Guardar Cambios'; }
    }
};

// ----------------------------------------------------------------------------
// ICS / Outlook local
// ----------------------------------------------------------------------------
function resolveIcsFeedUrl() {
    if (typeof window.getCpCalendarIcsUrl === 'function') {
        return String(window.getCpCalendarIcsUrl() || '').trim();
    }

    const direct = String(window.HUB_CONFIG?.cpCalendarIcsUrl || '').trim();
    const base = String(window.HUB_CONFIG?.pocketbaseUrl || window.location.origin || '').trim().replace(/\/+$/, '');
    const token = String(window.HUB_CONFIG?.cpCalendarIcsToken || '').trim();
    let url = direct || (base ? `${base}/api/cotizador/cp-calendar-ics` : '');
    if (!url) return '';
    if (token && !/[?&]token=/.test(url)) {
        url += (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
    }
    return url;
}

function addDownloadParam(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url, window.location.origin);
        parsed.searchParams.set('download', '1');
        return parsed.toString();
    } catch (_) {
        if (/[?&]download=/.test(url)) return url;
        return url + (url.includes('?') ? '&' : '?') + 'download=1';
    }
}

function toIcsTimestampUtc(value) {
    const d = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    const pad2 = (n) => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear()
        + pad2(d.getUTCMonth() + 1)
        + pad2(d.getUTCDate())
        + 'T'
        + pad2(d.getUTCHours())
        + pad2(d.getUTCMinutes())
        + pad2(d.getUTCSeconds())
        + 'Z'
    );
}

function escapeIcsTextLocal(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function foldIcsLineLocal(line) {
    const text = String(line || '');
    if (text.length <= 74) return [text];
    const out = [];
    let rest = text;
    while (rest.length > 74) {
        out.push(rest.slice(0, 74));
        rest = ` ${rest.slice(74)}`;
    }
    out.push(rest);
    return out;
}

function pushIcsLineLocal(lines, line) {
    foldIcsLineLocal(line).forEach((chunk) => lines.push(chunk));
}

function asYmd(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const normalized = normalizeDate(value);
        if (normalized) return normalized;
    }
    if (value instanceof Date) return ymd(value);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : ymd(parsed);
}

function toIcsDateLocal(value) {
    return asYmd(value).replace(/-/g, '');
}

function downloadTextAsFile(filename, text, contentType) {
    const blob = new Blob([String(text || '')], { type: contentType || 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}

function getExportEventsFromCalendar() {
    if (calendarObj && typeof calendarObj.getEvents === 'function') {
        const visible = calendarObj.getEvents() || [];
        if (visible.length) return visible;
    }
    return safeArray(allCalendarEvents);
}

function buildLocalIcsExport() {
    const events = getExportEventsFromCalendar();
    if (!events.length) return '';

    const nowStamp = toIcsTimestampUtc(new Date());
    const lines = [];
    pushIcsLineLocal(lines, 'BEGIN:VCALENDAR');
    pushIcsLineLocal(lines, 'VERSION:2.0');
    pushIcsLineLocal(lines, 'PRODID:-//Cotizador//Casa de Piedra Local Export//ES');
    pushIcsLineLocal(lines, 'CALSCALE:GREGORIAN');
    pushIcsLineLocal(lines, 'METHOD:PUBLISH');
    pushIcsLineLocal(lines, 'X-WR-CALNAME:Casa de Piedra - Export local');

    events.forEach((eventLike, idx) => {
        const ext = eventLike.extendedProps || {};
        const isPrem = String(ext.kind || '').toLowerCase() === KIND_PREMONTAJE;
        const kindLabel = isPrem ? 'PREMONTAJE' : 'EVENTO';

        const start = asYmd(ext.sourceStart || eventLike.startStr || eventLike.start);
        if (!start) return;

        let endInclusive = asYmd(ext.sourceEnd);
        if (!endInclusive) {
            const endExclusive = asYmd(eventLike.endStr || eventLike.end);
            endInclusive = endExclusive ? addDays(endExclusive, -1) : start;
        }
        if (!endInclusive || endInclusive < start) endInclusive = start;
        const endExclusive = addDays(endInclusive, 1);

        const spaceName = getSpaceById(ext.spaceId)?.nombre || ext.entry?.detail?.espacio_nombre || ext.order?.espacio_nombre || '';
        const client = String(ext.order?.cliente_nombre || '').trim();
        const quote = String(ext.order?.nombre_cotizacion || '').trim();
        const folio = String(ext.order?.numero_orden || ext.orderId || '').trim();
        const status = String(ext.status || '').trim() || 'pendiente';
        const summary = String(eventLike.title || `${kindLabel} ${idx + 1}`).trim();
        const uidBase = String(eventLike.id || `${kindLabel}-${idx + 1}`).replace(/\s+/g, '-');
        const uid = `${uidBase}@casadepiedra-local`;
        const description = [
            `Tipo: ${isPrem ? 'Premontaje' : 'Evento'}`,
            `Estatus: ${status}`,
            `Folio: ${folio || 'N/D'}`,
            `Cliente: ${client || 'N/D'}`,
            `Cotizacion: ${quote || 'Sin nombre'}`,
            `Espacio: ${spaceName || 'N/D'}`
        ].join('. ') + '.';

        pushIcsLineLocal(lines, 'BEGIN:VEVENT');
        pushIcsLineLocal(lines, `UID:${escapeIcsTextLocal(uid)}`);
        pushIcsLineLocal(lines, `DTSTAMP:${nowStamp}`);
        pushIcsLineLocal(lines, `DTSTART;VALUE=DATE:${toIcsDateLocal(start)}`);
        pushIcsLineLocal(lines, `DTEND;VALUE=DATE:${toIcsDateLocal(endExclusive)}`);
        pushIcsLineLocal(lines, `SUMMARY:${escapeIcsTextLocal(summary)}`);
        pushIcsLineLocal(lines, `DESCRIPTION:${escapeIcsTextLocal(description)}`);
        pushIcsLineLocal(lines, `LOCATION:${escapeIcsTextLocal(spaceName || 'Casa de Piedra')}`);
        pushIcsLineLocal(lines, 'STATUS:CONFIRMED');
        pushIcsLineLocal(lines, `CATEGORIES:${kindLabel}`);
        pushIcsLineLocal(lines, 'END:VEVENT');
    });

    pushIcsLineLocal(lines, 'END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
}

function downloadLocalIcsExport(message) {
    const body = buildLocalIcsExport();
    if (!body) {
        window.showToast?.('No hay eventos para exportar en el calendario.', 'error');
        return false;
    }
    const dateTag = asYmd(new Date()) || 'export';
    downloadTextAsFile(`casa-de-piedra-calendario-${dateTag}.ics`, body, 'text/calendar;charset=utf-8');
    if (message) window.showToast?.(message, 'success');
    return true;
}

function hydrateIcsInput() {
    const url = resolveIcsFeedUrl();
    const input = document.getElementById('ics-feed-url');
    if (input) input.value = url;
}

window.copyCalendarFeedLink = async function copyCalendarFeedLink() {
    const url = resolveIcsFeedUrl();
    if (!url) return window.showToast?.('No se pudo resolver la URL ICS del calendario.', 'error');
    try {
        await navigator.clipboard.writeText(url);
        window.showToast?.('Enlace ICS copiado.', 'success');
    } catch (e) {
        window.showToast?.('No se pudo copiar el enlace ICS.', 'error');
    }
};

function toOutlookDesktopProtocolUrl(url) {
    const text = String(url || '').trim();
    if (!text) return '';
    try {
        const parsed = new URL(text, window.location.origin);
        parsed.protocol = parsed.protocol === 'https:' ? 'webcals:' : 'webcal:';
        return parsed.toString();
    } catch (_) {
        if (/^https:\/\//i.test(text)) return `webcals://${text.slice(8)}`;
        if (/^http:\/\//i.test(text)) return `webcal://${text.slice(7)}`;
        return '';
    }
}

window.openOutlookDesktopSubscription = async function openOutlookDesktopSubscription() {
    const url = resolveIcsFeedUrl();
    if (!url) return window.showToast?.('No se pudo resolver la URL ICS del calendario.', 'error');
    const protocolUrl = toOutlookDesktopProtocolUrl(url);
    if (!protocolUrl) {
        await window.copyCalendarFeedLink();
        window.showToast?.('No se pudo abrir Outlook automaticamente. Enlace copiado.', 'error');
        return;
    }
    try {
        window.location.href = protocolUrl;
        window.showToast?.('Intentando abrir Outlook para suscribir el calendario...', 'success');
    } catch (_) {
        await window.copyCalendarFeedLink();
        window.showToast?.('No se pudo abrir Outlook automaticamente. Enlace copiado.', 'error');
    }
};

window.downloadCalendarIcs = async function downloadCalendarIcs() {
    const url = resolveIcsFeedUrl();
    if (!url) {
        downloadLocalIcsExport('No se pudo resolver URL ICS del servidor. Se exporto version local.');
        return;
    }
    const downloadUrl = addDownloadParam(url);
    try {
        const response = await fetch(downloadUrl, {
            method: 'GET',
            cache: 'no-store'
        });
        const body = await response.text();
        if (!response.ok || !/BEGIN:VCALENDAR/i.test(body)) {
            downloadLocalIcsExport('El servidor no devolvio ICS valido. Se exporto version local.');
            return;
        }
        downloadTextAsFile('casa-de-piedra-calendario.ics', body, 'text/calendar;charset=utf-8');
        window.showToast?.('ICS descargado correctamente.', 'success');
    } catch (_) {
        downloadLocalIcsExport('No se pudo conectar al ICS del servidor. Se exporto version local.');
    }
};

// ----------------------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.getHubConfigReady === 'function') {
        try { await window.getHubConfigReady(); } catch (_) {}
    }
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    const ok = await initClients();
    if (!ok) return;

    const authState = await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authState?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }

    const profileRes = await window.globalPocketBase.from('app_users').select('*').eq('id', session.user.id).maybeSingle();
    myPermissions = resolvePermissions(profileRes.data || {});
    if (!myPermissions.access) {
        window.showToast?.('No tienes permisos para entrar al calendario.', 'error');
        return;
    }

    loadKindFromQuery();
    syncKindNav();
    await loadBaseData();
    allCalendarEvents = buildCalendarEvents();
    fillSpaceFilter();
    hydrateIcsInput();
    initCalendar();

    const kindSel = document.getElementById('cal-kind-filter');
    const spaceSel = document.getElementById('cal-space-filter');
    const searchInput = document.getElementById('cal-search-input');
    if (kindSel) kindSel.value = uiState.kind;

    kindSel?.addEventListener('change', applyFilters);
    spaceSel?.addEventListener('change', applyFilters);
    searchInput?.addEventListener('input', applyFilters);
    applyFilters();
});





