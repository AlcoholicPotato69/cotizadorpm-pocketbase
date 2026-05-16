/**
 * DOC: client\cotizadorcp\reports.js
 * Proposito: KPIs y reportes de rendimiento comercial/operativo.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE REPORTES (KPIs AMPLIADOS)
// =========================================================================

const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';

const __p = window.location.pathname || '';
const __isCP = /\/cotizadorcp(\/|$)/.test(__p) || (window.location.href || '').includes('cotizadorcp');
const FIN_SCHEMA = __isCP ? 'finanzas_casadepiedra' : ((window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas');

const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEK_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLORS = {
    brandRed: '#D32F2F',
    palette: ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#8E24AA', '#F57C00', '#0097A7', '#E91E63', '#5D4037', '#616161']
};

let allOrders = [];
let allSpaces = [];
let allClients = [];
let clientsById = {};
let chartInstances = {
    timeline: null,
    revenue: null,
    days: null,
    montajeDays: null,
    conceptRevenue: null,
    convenioTimeline: null,
    convenioSpaces: null,
    convenioDays: null,
    convenioDeals: null
};

function hashColorKey(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    return hash;
}

function getSpaceColor(value) {
    const index = hashColorKey(value) % COLORS.palette.length;
    return COLORS.palette[index] || COLORS.brandRed;
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

function normalizeDate(v) {
    const s = String(v || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
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

function getWeekIndex(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return isNaN(d.getTime()) ? -1 : d.getDay();
}

function moneyFmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getOrderSubtotal(order) {
    const desg = safeObj(order?.desglose_precios);
    const sub = parseFloat(desg.subtotal_antes_impuestos ?? desg.total_sin_impuestos ?? desg.subtotal ?? 0);
    if (Number.isFinite(sub) && sub > 0) return sub;
    return parseFloat(order?.precio_final || 0) || 0;
}

function parseConvenioMeta(order) {
    const details = safeObj(order?.detalles_evento);
    const raw = safeObj(details?.convenio);
    return {
        activo: raw?.activo === true,
        items: safeArray(raw?.items),
        espacios: safeArray(raw?.espacios),
        evidencias: safeArray(raw?.evidencias)
    };
}

function isConvenioOrder(order) {
    const meta = parseConvenioMeta(order);
    if (meta.activo) return true;
    return safeArray(order?.espacios_detalle).some(detail => detail?.convenio_activo === true || detail?.convenio_indefinido === true);
}

function normalizeConvenioItem(item, fallback = {}) {
    const quantity = Math.max(1, parseInt(item?.cantidad_entrega || item?.cantidad || 1, 10) || 1);
    const amount = Math.max(0, parseFloat(item?.monto ?? item?.amount ?? item?.value ?? 0) || 0);
    return {
        name: String(item?.nombre || item?.convenio_nombre || item?.description || 'Convenio').trim() || 'Convenio',
        quantity,
        amount,
        spaceId: String(item?.espacio_id || item?.space_id || fallback.spaceId || '').trim(),
        spaceName: String(item?.espacio_nombre || fallback.spaceName || '').trim()
    };
}

function getConvenioItems(order) {
    const meta = parseConvenioMeta(order);
    const metaItems = meta.items.map(item => normalizeConvenioItem(item)).filter(item => item.name);
    if (metaItems.length) return metaItems;

    const detailItems = safeArray(order?.espacios_detalle).flatMap(detail => (
        safeArray(detail?.convenio_items).map(item => normalizeConvenioItem(item, {
            spaceId: detail?.espacio_id || detail?.space_id || '',
            spaceName: detail?.espacio_nombre || ''
        }))
    )).filter(item => item.name);
    if (detailItems.length) return detailItems;

    return safeArray(order?.conceptos_adicionales)
        .filter(concept => concept?.meta?.convenio_option_id || concept?.meta?.convenio_nombre)
        .map(concept => normalizeConvenioItem({
            nombre: concept?.meta?.convenio_nombre || concept?.description || concept?.nombre || 'Convenio',
            cantidad_entrega: concept?.meta?.cantidad_entrega || 1,
            monto: concept?.amount ?? concept?.value ?? 0,
            espacio_id: concept?.meta?.space_id || concept?.meta?.spaceId || '',
            espacio_nombre: concept?.meta?.space_name || ''
        }))
        .filter(item => item.name);
}

function getConvenioDealCount(order) {
    return getConvenioItems(order).reduce((sum, item) => sum + item.quantity, 0);
}

function getConvenioItemsBySpace(order) {
    const spaceEntries = getOrderSpaceEntries(order);
    const items = getConvenioItems(order);
    return spaceEntries.map(entry => {
        let matched = items.filter(item => String(item.spaceId || '') === String(entry.spaceId || ''));
        if (!matched.length && spaceEntries.length === 1) matched = items;
        return { entry, items: matched };
    });
}

function getOrderSpaceEntries(order) {
    const details = safeArray(order?.espacios_detalle);
    if (details.length) {
        return details.map(item => ({
            spaceId: item.espacio_id || item.space_id || order.espacio_id,
            spaceName: item.espacio_nombre || (allSpaces.find(s => String(s.id) === String(item.espacio_id || item.space_id || order.espacio_id))?.nombre || order.espacio_nombre || 'Espacio'),
            start: item.fecha_inicio || order.fecha_inicio,
            end: item.fecha_fin || item.fecha_inicio || order.fecha_fin || order.fecha_inicio,
            detail: item
        })).filter(x => x.spaceId);
    }
    return [{
        spaceId: order?.espacio_id,
        spaceName: order?.espacio_nombre || (allSpaces.find(s => String(s.id) === String(order?.espacio_id))?.nombre || 'Espacio'),
        start: order?.fecha_inicio,
        end: order?.fecha_fin || order?.fecha_inicio,
        detail: null
    }].filter(x => x.spaceId);
}

function orderContainsSpace(order, spaceId) {
    if (!spaceId) return true;
    return getOrderSpaceEntries(order).some(e => String(e.spaceId) === String(spaceId));
}

function getSpaceCategory(space) {
    return space?.categoria || space?.tipo || space?.category || '';
}

function orderMatchesType(order, typeFilter) {
    if (!typeFilter || typeFilter === 'all') return true;
    const entries = getOrderSpaceEntries(order);
    return entries.some(e => {
        const space = allSpaces.find(s => String(s.id) === String(e.spaceId));
        return getSpaceCategory(space) === typeFilter;
    });
}

function collectMontajeDates(order) {
    const set = new Set();
    const add = (ds) => {
        const n = normalizeDate(ds);
        if (n) set.add(n);
    };

    const entries = getOrderSpaceEntries(order);
    entries.forEach(entry => {
        if (entry.detail) {
            safeArray(entry.detail.premontaje_fechas).forEach(add);
            safeArray(entry.detail.conceptos_adicionales).forEach(c => {
                if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
                safeArray(safeObj(c?.meta).dates).forEach(add);
            });
        }
    });

    safeArray(order?.conceptos_adicionales).forEach(c => {
        if (String(c?.type || '').toLowerCase() !== 'b2b_montaje') return;
        safeArray(safeObj(c?.meta).dates).forEach(add);
    });

    return Array.from(set);
}

function getConceptRows(order) {
    return safeArray(order?.conceptos_adicionales).map(c => ({
        name: c?.description || c?.nombre || 'Concepto',
        amount: parseFloat(c?.amount || c?.value || 0) || 0
    }));
}

function fillClientSpaceFilter() {
    const sel = document.getElementById('client-space-filter');
    if (!sel) return;
    const prev = sel.value;
    const spacesSorted = (allSpaces || []).slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }));
    sel.innerHTML = '<option value="">Todos</option>' + spacesSorted.map(s => `<option value="${s.id}">${(s.nombre || 'Espacio').toUpperCase()}</option>`).join('');
    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
    sel.onchange = () => window.generateReports();
}

function renderClientRows(tbodyId, rows) {
    const tb = document.getElementById(tbodyId);
    if (!tb) return;
    tb.innerHTML = '';
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-gray-400 text-xs">Sin datos</td></tr>';
        return;
    }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'border-b last:border-b-0';
        tr.innerHTML = `
            <td class="py-2">
                <div class="font-bold text-gray-800 text-xs">${(r.name || '—')}</div>
                <div class="text-[11px] text-gray-400">${r.email || ''}</div>
            </td>
            <td class="py-2 text-right font-black text-gray-700">${r.count}</td>
            <td class="py-2 text-right font-black text-gray-700">${moneyFmt(r.spend)}</td>
        `;
        tb.appendChild(tr);
    });
}

function computeClientAnalytics(orders) {
    const map = {};
    (orders || []).forEach(o => {
        if (!o || !['aprobada', 'finalizada'].includes(o.status)) return;
        const key = o.cliente_id || (o.cliente_email ? (`email:${o.cliente_email}`) : (`name:${o.cliente_nombre || ''}`));
        if (!map[key]) map[key] = { key, count: 0, spend: 0, name: '', email: '' };
        map[key].count += 1;
        if (o.status === 'finalizada') map[key].spend += parseFloat(o.precio_final || 0) || 0;
        if (o.cliente_id && clientsById[o.cliente_id]) {
            map[key].name = clientsById[o.cliente_id].nombre_completo || map[key].name;
            map[key].email = clientsById[o.cliente_id].correo || map[key].email;
        } else {
            map[key].name = map[key].name || (o.cliente_nombre || '');
            map[key].email = map[key].email || (o.cliente_email || '');
        }
    });
    return Object.values(map).sort((a, b) => (b.spend - a.spend) || (b.count - a.count));
}

function renderClientAnalytics(activeOrders) {
    const globalRows = computeClientAnalytics(activeOrders).slice(0, 10);
    renderClientRows('tbl-top-clients', globalRows);

    const spaceSel = document.getElementById('client-space-filter');
    const spaceId = spaceSel ? spaceSel.value : '';
    const scoped = spaceId ? (activeOrders || []).filter(o => orderContainsSpace(o, spaceId)) : activeOrders;
    const spaceRows = computeClientAnalytics(scoped).slice(0, 10);
    renderClientRows('tbl-top-clients-space', spaceRows);
}

function renderConvenioClientRows(tbodyId, rows) {
    const tb = document.getElementById(tbodyId);
    if (!tb) return;
    tb.innerHTML = '';
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-gray-400 text-xs">Sin datos</td></tr>';
        return;
    }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'border-b last:border-b-0';
        tr.innerHTML = `
            <td class="py-2">
                <div class="font-bold text-gray-800 text-xs">${(r.name || '—')}</div>
                <div class="text-[11px] text-gray-400">${r.email || ''}</div>
            </td>
            <td class="py-2 text-right font-black text-gray-700">${r.count}</td>
            <td class="py-2 text-right font-black text-gray-700">${r.deals}</td>
        `;
        tb.appendChild(tr);
    });
}

function computeConvenioClientAnalytics(orders) {
    const map = {};
    (orders || []).forEach(o => {
        if (!o || !['aprobada', 'finalizada'].includes(o.status)) return;
        const key = o.cliente_id || (o.cliente_email ? (`email:${o.cliente_email}`) : (`name:${o.cliente_nombre || ''}`));
        if (!map[key]) map[key] = { key, count: 0, deals: 0, name: '', email: '' };
        map[key].count += 1;
        map[key].deals += getConvenioDealCount(o);
        if (o.cliente_id && clientsById[o.cliente_id]) {
            map[key].name = clientsById[o.cliente_id].nombre_completo || map[key].name;
            map[key].email = clientsById[o.cliente_id].correo || map[key].email;
        } else {
            map[key].name = map[key].name || (o.cliente_nombre || '');
            map[key].email = map[key].email || (o.cliente_email || '');
        }
    });
    return Object.values(map).sort((a, b) => (b.count - a.count) || (b.deals - a.deals));
}

function initFilters() {
    const yearSelect = document.getElementById('report-year-filter');
    const monthSelect = document.getElementById('report-month-filter');
    const typeSelect = document.getElementById('report-type-filter');
    if (!yearSelect || !monthSelect) return;

    const currentYear = new Date().getFullYear();
    const yearsSet = new Set([currentYear]);
    allOrders.forEach(o => {
        const y = parseInt(String(o.fecha_inicio || '').split('-')[0], 10);
        if (Number.isFinite(y)) yearsSet.add(y);
    });
    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    yearSelect.innerHTML = '';
    sortedYears.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.innerText = y;
        yearSelect.appendChild(opt);
    });
    yearSelect.value = currentYear;

    monthSelect.innerHTML = '<option value="all">Todo el Año</option>';
    ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = String(i + 1).padStart(2, '0');
        opt.innerText = m;
        monthSelect.appendChild(opt);
    });
    monthSelect.value = String(new Date().getMonth() + 1).padStart(2, '0');

    if (typeSelect) {
        typeSelect.innerHTML = '<option value="all">Todos</option>';
        const types = new Set();
        allSpaces.forEach(s => {
            const c = getSpaceCategory(s);
            if (c) types.add(c);
        });
        Array.from(types).sort((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' })).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.innerText = t;
            typeSelect.appendChild(opt);
        });
    }
}

function renderTopKPIs(spaceCountMap, dayCount, montajeDayCount, conceptRevenue) {
    const topSpace = Object.entries(spaceCountMap).sort((a, b) => b[1].count - a[1].count)[0];
    document.getElementById('rpt-top-space').innerText = topSpace ? topSpace[1].name : '--';
    document.getElementById('rpt-top-space-count').innerText = topSpace ? `${topSpace[1].count} eventos` : '0 eventos';

    const topDayIdx = dayCount.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)[0];
    document.getElementById('rpt-top-day').innerText = topDayIdx && topDayIdx.v > 0 ? WEEK_LONG[topDayIdx.i] : '--';
    document.getElementById('rpt-top-day-count').innerText = topDayIdx && topDayIdx.v > 0 ? `${topDayIdx.v} eventos` : '0 eventos';

    const topMontajeIdx = montajeDayCount.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)[0];
    document.getElementById('rpt-top-montaje-day').innerText = topMontajeIdx && topMontajeIdx.v > 0 ? WEEK_LONG[topMontajeIdx.i] : '--';
    document.getElementById('rpt-top-montaje-count').innerText = topMontajeIdx && topMontajeIdx.v > 0 ? `${topMontajeIdx.v} montajes` : '0 montajes';

    document.getElementById('rpt-concepts-revenue').innerText = moneyFmt(conceptRevenue);
}

function renderSpaceRevenueChart(spaceRevenueMap, spaceCountMap) {
    const revCtx = document.getElementById('revenueChart');
    if (!revCtx) return;
    if (chartInstances.revenue) chartInstances.revenue.destroy();

    const entries = Object.entries(spaceRevenueMap).map(([id, amount]) => ({
        id,
        label: (spaceCountMap[id]?.name || allSpaces.find(s => String(s.id) === String(id))?.nombre || 'Espacio'),
        amount,
        count: spaceCountMap[id]?.count || 0
    })).sort((a, b) => b.amount - a.amount);

    const labels = entries.map(e => e.label);
    const data = entries.map(e => e.amount);
    const colors = entries.map(entry => getSpaceColor(entry.id));

    const tbody = document.getElementById('rpt-table-spaces');
    if (tbody) {
        tbody.innerHTML = '';
        entries.forEach((item, i) => {
            tbody.innerHTML += `<tr><td class="p-2 text-xs flex items-center gap-2 border-b border-gray-50"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${colors[i]}"></span><span class="truncate font-medium text-gray-600">${item.label}</span></td><td class="text-right text-xs font-bold text-gray-800 border-b border-gray-50">${moneyFmt(item.amount)}</td><td class="text-right text-xs text-gray-400 border-b border-gray-50 pr-2">${item.count}</td></tr>`;
        });
    }

    chartInstances.revenue = new Chart(revCtx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
}

function renderTimelineChart(totalRevenueOrders, yearFilter, monthFilter) {
    const timeCtx = document.getElementById('timelineChart');
    if (!timeCtx) return;
    if (chartInstances.timeline) chartInstances.timeline.destroy();

    let timelineLabels = [];
    let timelineData = [];
    if (monthFilter === 'all') {
        timelineLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        timelineData = new Array(12).fill(0);
        totalRevenueOrders.forEach(o => {
            const mIdx = parseInt(String(o.fecha_inicio || '').split('-')[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) timelineData[mIdx] += getOrderSubtotal(o);
        });
    } else {
        const daysInMonth = new Date(parseInt(yearFilter, 10), parseInt(monthFilter, 10), 0).getDate();
        timelineLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
        timelineData = new Array(daysInMonth).fill(0);
        totalRevenueOrders.forEach(o => {
            const dIdx = parseInt(String(o.fecha_inicio || '').split('-')[2], 10) - 1;
            if (dIdx >= 0 && dIdx < daysInMonth) timelineData[dIdx] += getOrderSubtotal(o);
        });
    }

    const gradient = timeCtx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(211, 47, 47, 0.1)');
    gradient.addColorStop(1, 'rgba(211, 47, 47, 0)');

    chartInstances.timeline = new Chart(timeCtx, {
        type: 'line',
        data: {
            labels: timelineLabels,
            datasets: [{
                label: 'Ingresos (Neto)',
                data: timelineData,
                borderColor: COLORS.brandRed,
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: COLORS.brandRed,
                pointRadius: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderWeekdayCharts(dayCount, montajeDayCount) {
    const daysCtx = document.getElementById('daysChart');
    if (daysCtx) {
        if (chartInstances.days) chartInstances.days.destroy();
        chartInstances.days = new Chart(daysCtx, {
            type: 'bar',
            data: {
                labels: WEEK_SHORT,
                datasets: [{ label: 'Eventos', data: dayCount, backgroundColor: 'rgba(59, 130, 246, 0.6)', borderRadius: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const mtgCtx = document.getElementById('montajeDaysChart');
    if (mtgCtx) {
        if (chartInstances.montajeDays) chartInstances.montajeDays.destroy();
        chartInstances.montajeDays = new Chart(mtgCtx, {
            type: 'bar',
            data: {
                labels: WEEK_SHORT,
                datasets: [{ label: 'Premontajes', data: montajeDayCount, backgroundColor: 'rgba(249, 115, 22, 0.6)', borderRadius: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderConceptRevenueChart(conceptRevenueMap) {
    const ctx = document.getElementById('conceptRevenueChart');
    if (!ctx) return;
    if (chartInstances.conceptRevenue) chartInstances.conceptRevenue.destroy();

    const sorted = Object.entries(conceptRevenueMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    chartInstances.conceptRevenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{ label: 'Ingreso', data: sorted.map(s => s[1]), backgroundColor: 'rgba(16, 185, 129, 0.6)', borderRadius: 4 }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true },
                y: { grid: { display: false } }
            }
        }
    });
}

window.resetReportFilters = function () {
    const now = new Date();
    const y = document.getElementById('report-year-filter');
    const m = document.getElementById('report-month-filter');
    const t = document.getElementById('report-type-filter');
    if (y) y.value = now.getFullYear();
    if (m) m.value = String(now.getMonth() + 1).padStart(2, '0');
    if (t) t.value = 'all';
    fillClientSpaceFilter();
    window.generateReports();
};

window.generateReports = function () {
    const yearFilter = document.getElementById('report-year-filter')?.value;
    const monthFilter = document.getElementById('report-month-filter')?.value;
    const typeFilter = document.getElementById('report-type-filter')?.value || 'all';

    const activeOrders = (allOrders || []).filter(o => {
        if (isConvenioOrder(o)) return false;
        const start = normalizeDate(o?.fecha_inicio);
        if (!start) return false;
        const [y, m] = start.split('-');
        if (yearFilter && y !== String(yearFilter)) return false;
        if (monthFilter && monthFilter !== 'all' && m !== monthFilter) return false;
        if (!orderMatchesType(o, typeFilter)) return false;
        return true;
    });

    const finalizadas = activeOrders.filter(o => o.status === 'finalizada');
    const aprobadas = activeOrders.filter(o => o.status === 'aprobada');
    const occupied = activeOrders.filter(o => ['aprobada', 'finalizada'].includes(o.status));
    const totalRevenueOrders = finalizadas;

    const totalCount = activeOrders.length;
    const approvedCount = aprobadas.length;
    const finalizedCount = finalizadas.length;
    const totalRev = totalRevenueOrders.reduce((acc, o) => acc + getOrderSubtotal(o), 0);
    const conversionRate = totalCount > 0 ? ((finalizedCount / totalCount) * 100).toFixed(1) : '0.0';

    document.getElementById('rpt-revenue').innerText = moneyFmt(totalRev);
    document.getElementById('rpt-total-count').innerText = totalCount;
    document.getElementById('rpt-approved-count').innerText = approvedCount;
    document.getElementById('rpt-finalized-count').innerText = finalizedCount;
    document.getElementById('rpt-rate').innerText = `${conversionRate}%`;

    const spaceCountMap = {};
    const dayCount = [0, 0, 0, 0, 0, 0, 0];
    const montajeDayCount = [0, 0, 0, 0, 0, 0, 0];
    const conceptRevenueMap = {};
    const spaceRevenueMap = {};

    occupied.forEach(order => {
        const entries = getOrderSpaceEntries(order);
        entries.forEach(entry => {
            const sid = String(entry.spaceId);
            if (!spaceCountMap[sid]) {
                spaceCountMap[sid] = {
                    name: entry.spaceName || allSpaces.find(s => String(s.id) === sid)?.nombre || 'Espacio',
                    count: 0
                };
            }
            spaceCountMap[sid].count += 1;
            listDatesBetween(entry.start, entry.end).forEach(ds => {
                const idx = getWeekIndex(ds);
                if (idx >= 0) dayCount[idx] += 1;
            });
        });

        collectMontajeDates(order).forEach(ds => {
            const idx = getWeekIndex(ds);
            if (idx >= 0) montajeDayCount[idx] += 1;
        });
    });

    finalizadas.forEach(order => {
        const desglose = safeObj(order.desglose_precios);
        const spRows = safeArray(desglose.espacios);
        if (spRows.length) {
            spRows.forEach(sp => {
                const sid = String(sp.espacio_id || sp.spaceId || order.espacio_id || '');
                if (!sid) return;
                const amount = parseFloat(sp.subtotal_espacio || 0) || 0;
                spaceRevenueMap[sid] = (spaceRevenueMap[sid] || 0) + amount;
            });
        } else {
            const sid = String(order.espacio_id || '');
            if (sid) spaceRevenueMap[sid] = (spaceRevenueMap[sid] || 0) + getOrderSubtotal(order);
        }

        getConceptRows(order).forEach(c => {
            conceptRevenueMap[c.name] = (conceptRevenueMap[c.name] || 0) + c.amount;
        });
    });

    const conceptRevenueTotal = Object.values(conceptRevenueMap).reduce((a, b) => a + b, 0);
    renderTopKPIs(spaceCountMap, dayCount, montajeDayCount, conceptRevenueTotal);
    renderSpaceRevenueChart(spaceRevenueMap, spaceCountMap);
    renderTimelineChart(totalRevenueOrders, yearFilter, monthFilter);
    renderWeekdayCharts(dayCount, montajeDayCount);
    renderConceptRevenueChart(conceptRevenueMap);
    renderClientAnalytics(activeOrders);
    if (!document.getElementById('convenio-reports-section')?.classList.contains('hidden')) {
        try { window.generateConvenioReports(); } catch (_) {}
    }
};

function updateConvenioToggleButton() {
    const btn = document.getElementById('btn-toggle-convenio-reports');
    const visible = !document.getElementById('convenio-reports-section')?.classList.contains('hidden');
    if (!btn) return;
    btn.innerHTML = visible
        ? '<i class="fa-solid fa-chart-line"></i> Ver Generales'
        : '<i class="fa-solid fa-handshake"></i> Ver Convenios';
}

function syncConvenioReportsView() {
    const convenioVisible = !document.getElementById('convenio-reports-section')?.classList.contains('hidden');
    const standardSection = document.getElementById('standard-reports-section');
    if (standardSection) standardSection.classList.toggle('hidden', convenioVisible);
}

window.toggleConvenioReports = function toggleConvenioReports() {
    const section = document.getElementById('convenio-reports-section');
    if (!section) return;
    const shouldShow = section.classList.contains('hidden');
    section.classList.toggle('hidden', !shouldShow);
    syncConvenioReportsView();
    updateConvenioToggleButton();
    if (shouldShow) window.generateConvenioReports();
    else window.generateReports();
};

window.generateConvenioReports = function generateConvenioReports() {
    const yearFilter = String(document.getElementById('report-year-filter')?.value || '');
    const monthFilter = String(document.getElementById('report-month-filter')?.value || 'all');
    const typeFilter = String(document.getElementById('report-type-filter')?.value || 'all');
    const activeOrders = (allOrders || []).filter(order => {
        if (!isConvenioOrder(order)) return false;
        const start = normalizeDate(order?.fecha_inicio);
        if (!start) return false;
        const [year, month] = start.split('-');
        if (yearFilter && year !== yearFilter) return false;
        if (monthFilter !== 'all' && month !== monthFilter) return false;
        if (!orderMatchesType(order, typeFilter)) return false;
        return true;
    });

    const aprobados = activeOrders.filter(order => order.status === 'aprobada');
    const finalizados = activeOrders.filter(order => order.status === 'finalizada');
    const dealCount = activeOrders.reduce((sum, order) => sum + getConvenioDealCount(order), 0);
    const conversionRate = activeOrders.length > 0 ? ((finalizados.length / activeOrders.length) * 100).toFixed(1) : '0.0';

    const totalEl = document.getElementById('conv-rpt-total');
    const approvedEl = document.getElementById('conv-rpt-approved');
    const finalizedEl = document.getElementById('conv-rpt-finalized');
    const rateEl = document.getElementById('conv-rpt-rate');
    const dealsEl = document.getElementById('conv-rpt-deals');
    if (totalEl) totalEl.innerText = activeOrders.length;
    if (approvedEl) approvedEl.innerText = aprobados.length;
    if (finalizedEl) finalizedEl.innerText = finalizados.length;
    if (rateEl) rateEl.innerText = `${conversionRate}%`;
    if (dealsEl) dealsEl.innerText = dealCount;

    const timelineChart = document.getElementById('convenioTimelineChart');
    if (timelineChart) {
        if (chartInstances.convenioTimeline) chartInstances.convenioTimeline.destroy();
        let labels = [];
        let values = [];
        if (monthFilter === 'all') {
            labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            values = new Array(12).fill(0);
            activeOrders.forEach(order => {
                const monthIndex = parseInt(String(order?.fecha_inicio || '').split('-')[1], 10) - 1;
                if (monthIndex >= 0 && monthIndex < 12) values[monthIndex] += 1;
            });
        } else {
            const daysInMonth = new Date(parseInt(yearFilter, 10), parseInt(monthFilter, 10), 0).getDate();
            labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
            values = new Array(daysInMonth).fill(0);
            activeOrders.forEach(order => {
                const dayIndex = parseInt(String(order?.fecha_inicio || '').split('-')[2], 10) - 1;
                if (dayIndex >= 0 && dayIndex < daysInMonth) values[dayIndex] += 1;
            });
        }
        const gradient = timelineChart.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
        chartInstances.convenioTimeline = new Chart(timelineChart, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Convenios',
                    data: values,
                    borderColor: '#F59E0B',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#F59E0B',
                    pointRadius: 3,
                    fill: true,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const convenioSpaceSummary = {};
    activeOrders.forEach(order => {
        const groups = getConvenioItemsBySpace(order);
        groups.forEach(group => {
            const sid = String(group?.entry?.spaceId || '').trim();
            if (!sid) return;
            if (!convenioSpaceSummary[sid]) {
                convenioSpaceSummary[sid] = {
                    id: sid,
                    label: group.entry.spaceName || 'Espacio',
                    count: 0,
                    deals: 0
                };
            }
            convenioSpaceSummary[sid].count += 1;
            convenioSpaceSummary[sid].deals += group.items.reduce((sum, item) => sum + item.quantity, 0);
        });
    });
    const convenioSpaceEntries = Object.values(convenioSpaceSummary).sort((a, b) => (b.count - a.count) || (b.deals - a.deals));
    const convenioSpacesChart = document.getElementById('convenioSpacesChart');
    if (convenioSpacesChart) {
        if (chartInstances.convenioSpaces) chartInstances.convenioSpaces.destroy();
        const labels = convenioSpaceEntries.map(entry => entry.label);
        const values = convenioSpaceEntries.map(entry => entry.count);
        const colors = convenioSpaceEntries.map(entry => getSpaceColor(entry.id));
        const tbody = document.getElementById('conv-rpt-table-spaces');
        if (tbody) {
            tbody.innerHTML = '';
            convenioSpaceEntries.forEach((entry, index) => {
                tbody.innerHTML += `<tr><td class="p-2 text-xs flex items-center gap-2 border-b border-gray-50"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${colors[index]}"></span><span class="truncate font-medium text-gray-600">${entry.label}</span></td><td class="text-right text-xs font-bold text-gray-800 border-b border-gray-50">${entry.count}</td><td class="text-right text-xs text-gray-400 border-b border-gray-50 pr-2">${entry.deals}</td></tr>`;
            });
            if (!convenioSpaceEntries.length) tbody.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-gray-400 text-xs">Sin datos</td></tr>';
        }
        chartInstances.convenioSpaces = new Chart(convenioSpacesChart, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    }

    const convenioDaysChart = document.getElementById('convenioDaysChart');
    if (convenioDaysChart) {
        if (chartInstances.convenioDays) chartInstances.convenioDays.destroy();
        const dayCount = [0, 0, 0, 0, 0, 0, 0];
        activeOrders.filter(order => ['aprobada', 'finalizada'].includes(order.status)).forEach(order => {
            const idx = getWeekIndex(order?.fecha_inicio);
            if (idx >= 0) dayCount[idx] += 1;
        });
        chartInstances.convenioDays = new Chart(convenioDaysChart, {
            type: 'bar',
            data: {
                labels: WEEK_SHORT,
                datasets: [{ label: 'Convenios', data: dayCount, backgroundColor: 'rgba(245, 158, 11, 0.55)', borderRadius: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const dealSummary = {};
    activeOrders.forEach(order => {
        getConvenioItems(order).forEach(item => {
            const key = item.name || 'Convenio';
            dealSummary[key] = (dealSummary[key] || 0) + item.quantity;
        });
    });
    const topDeals = Object.entries(dealSummary).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const convenioDealsChart = document.getElementById('convenioDealsChart');
    if (convenioDealsChart) {
        if (chartInstances.convenioDeals) chartInstances.convenioDeals.destroy();
        chartInstances.convenioDeals = new Chart(convenioDealsChart, {
            type: 'bar',
            indexAxis: 'y',
            data: {
                labels: topDeals.map(item => item[0]),
                datasets: [{ label: 'Entregas acordadas', data: topDeals.map(item => item[1]), backgroundColor: 'rgba(251, 191, 36, 0.65)', borderRadius: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    renderConvenioClientRows('tbl-top-convenio-clients', computeConvenioClientAnalytics(activeOrders).slice(0, 10));
};

async function loadData() {
    const { data: spaces } = await window.tenantPocketBase.from('espacios').select('*');
    allSpaces = spaces || [];
    const { data: orders } = await window.tenantPocketBase.from('cotizaciones').select('*').order('fecha_inicio', { ascending: true });
    allOrders = orders || [];
    try {
        const { data: clients, error: clErr } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,correo,telefono,rfc');
        if (!clErr) {
            allClients = clients || [];
            clientsById = {};
            allClients.forEach(c => { clientsById[c.id] = c; });
        }
    } catch (e) {
        allClients = [];
        clientsById = {};
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__HUB_LAYOUT_READY && typeof window.__HUB_LAYOUT_READY.then === 'function') {
        try { await window.__HUB_LAYOUT_READY; } catch (_) {}
    }
    if (window.__HUB_PAGE_ACCESS_DENIED) return;
    if (window.PB_CLIENT) {
        if (!window.tenantPocketBase) window.tenantPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY, { db: { schema: FIN_SCHEMA } });
        if (!window.globalPocketBase) window.globalPocketBase = window.PB_CLIENT.createClient(PB_URL, PB_KEY);
    }

    // Use layout auth context as primary source (already resolved by layout.js)
    const layoutAuth = window.__HUB_AUTH_CONTEXT || window.__HUB_LAYOUT_AUTH_STATE || null;
    let session = layoutAuth?.session || null;
    if (!session?.user) {
        const authCtx = window.HUB_SESSION?.ensureAuth
            ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
            : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
        session = authCtx?.session || null;
    }
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }

    const rbac = window.HUB_RBAC || null;
    const perms = rbac?.getPermissions
        ? rbac.getPermissions()
        : ((layoutAuth?.permissions && typeof layoutAuth.permissions === 'object')
            ? layoutAuth.permissions
            : ((session?.user?.effective_permissions && typeof session.user.effective_permissions === 'object')
                ? session.user.effective_permissions
                : {}));
    const canReportsView = rbac?.can ? rbac.can('reports_view') : (perms.reports_view === true);
    if (!canReportsView) {
        window.showToast?.('No tienes permisos para acceder a Reportes.', 'error');
        return;
    }

    const navRules = {
        'orders.html': rbac?.can ? rbac.can('orders_view') : (perms.orders_view === true),
        'reports.html': canReportsView,
        'clientes.html': rbac?.canAny
            ? rbac.canAny(['clients_view', 'clients_manage'])
            : (!!perms.clients_view || !!perms.clients_manage)
    };
    Object.keys(navRules).forEach(page => {
        if (!navRules[page]) {
            const link = document.querySelector(`a[href="${page}"]`);
            if (link) link.classList.add('hidden');
        }
    });

    await loadData();
    initFilters();
    fillClientSpaceFilter();
    syncConvenioReportsView();
    updateConvenioToggleButton();
    window.generateReports();
});








