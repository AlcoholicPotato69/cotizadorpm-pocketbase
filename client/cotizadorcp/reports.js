/**
 * DOC: client\cotizadorcp\reports.js
 * Proposito: KPIs y reportes de rendimiento comercial/operativo.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE REPORTES (KPIs AMPLIADOS)
// =========================================================================

const SB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseUrl) || 'http://127.0.0.1:54321';
const SB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseAnonKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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
    conceptRevenue: null
};

function getSpaceColor(i) {
    return COLORS.palette[i % COLORS.palette.length] || COLORS.brandRed;
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
    const colors = entries.map((_, i) => getSpaceColor(i));

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
        if (!o?.fecha_inicio) return false;
        const [y, m] = String(o.fecha_inicio).split('-');
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
};

async function loadData() {
    const { data: spaces } = await window.finSupabase.from('espacios').select('*');
    allSpaces = spaces || [];
    const { data: orders } = await window.finSupabase.from('cotizaciones').select('*').order('fecha_inicio', { ascending: true });
    allOrders = orders || [];
    try {
        const { data: clients, error: clErr } = await window.finSupabase.from('clientes').select('id,nombre_completo,correo,telefono,rfc');
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
    if (window.PB_CLIENT) {
        if (!window.finSupabase) window.finSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } });
        if (!window.globalSupabase) window.globalSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY);
    }

    const { data: { session } } = await window.globalSupabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await window.globalSupabase
        .from('profiles')
        .select('role, app_metadata')
        .eq('id', session.user.id)
        .single();

    const __role = String(profile.role || '').toLowerCase().trim();
    const __roleHasAccess = (__role === 'admin') || (__role === 'casa_de_piedra') || (__role === 'ambos');
    const perms = (__role === 'admin')
        ? { orders_view: true, reports_view: true }
        : (__roleHasAccess ? { orders_view: true, reports_view: true } : (profile.app_metadata?.finanzas?.permissions || {}));

    if (!perms.reports_view) {
        setTimeout(() => { window.location.href = 'catalog.html'; }, 1500);
        return;
    }

    if (__role !== 'admin') {
        const navRules = {
            'orders.html': ('orders_view' in perms) ? !!perms.orders_view : true,
            'reports.html': ('reports_view' in perms) ? !!perms.reports_view : true,
            'clientes.html': (('clients_view' in perms) || ('clients_manage' in perms))
                ? (!!perms.clients_view || !!perms.clients_manage)
                : true
        };
        Object.keys(navRules).forEach(page => {
            if (!navRules[page]) {
                const link = document.querySelector(`a[href="${page}"]`);
                if (link) link.classList.add('hidden');
            }
        });
    }

    await loadData();
    initFilters();
    fillClientSpaceFilter();
    window.generateReports();
});


