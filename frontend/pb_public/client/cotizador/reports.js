/**
 * DOC: client\cotizador\reports.js
 * Proposito: KPIs y reportes de rendimiento comercial/operativo.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE REPORTES (PLAZA MAYOR / IDS NATIVOS)
// =========================================================================

const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';

const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORS = {
    brandRed: '#D32F2F',
    palette: ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#8E24AA', '#F57C00', '#0097A7', '#E91E63', '#5D4037', '#616161']
};

let allOrders = [];
let allSpaces = [];
let allClients = [];
let clientsById = {};
let chartInstances = { timeline: null, revenue: null, days: null, services: null };

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

function safeObj(value) {
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

function normalizeDate(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function getWeekIndex(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return -1;
    const date = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(date.getTime()) ? -1 : date.getDay();
}

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

function moneyFmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getOrderSubtotal(order) {
    const desglose = safeObj(order?.desglose_precios);
    const subtotal = parseFloat(desglose.subtotal_antes_impuestos ?? desglose.total_sin_impuestos ?? desglose.subtotal ?? 0);
    if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
    return parseFloat(order?.precio_final || 0) || 0;
}

function getSpaceCategory(space) {
    return space?.categoria || space?.tipo || space?.category || '';
}

function getOrderSpaceEntries(order) {
    const details = safeArray(order?.espacios_detalle);
    if (details.length) {
        return details
            .map(item => ({
                spaceId: item.espacio_id || item.space_id || order?.espacio_id,
                spaceName: item.espacio_nombre || (allSpaces.find(s => String(s.id) === String(item.espacio_id || item.space_id || order?.espacio_id))?.nombre || order?.espacio_nombre || 'Espacio'),
                start: normalizeDate(item.fecha_inicio || order?.fecha_inicio),
                end: normalizeDate(item.fecha_fin || item.fecha_inicio || order?.fecha_fin || order?.fecha_inicio),
                detail: item
            }))
            .filter(entry => entry.spaceId);
    }
    return [{
        spaceId: order?.espacio_id,
        spaceName: order?.espacio_nombre || (allSpaces.find(s => String(s.id) === String(order?.espacio_id))?.nombre || 'Espacio'),
        start: normalizeDate(order?.fecha_inicio),
        end: normalizeDate(order?.fecha_fin || order?.fecha_inicio),
        detail: null
    }].filter(entry => entry.spaceId);
}

function orderContainsSpace(order, spaceId) {
    if (!spaceId) return true;
    return getOrderSpaceEntries(order).some(entry => String(entry.spaceId) === String(spaceId));
}

function orderMatchesType(order, typeFilter) {
    if (!typeFilter || typeFilter === 'all') return true;
    return getOrderSpaceEntries(order).some(entry => {
        const space = allSpaces.find(s => String(s.id) === String(entry.spaceId));
        return getSpaceCategory(space) === typeFilter;
    });
}

function getConceptRows(order) {
    return safeArray(order?.conceptos_adicionales).map(concept => ({
        name: concept?.description || concept?.nombre || 'Concepto',
        amount: parseFloat(concept?.amount ?? concept?.value ?? 0) || 0
    }));
}

function fillClientSpaceFilter() {
    const sel = document.getElementById('client-space-filter');
    if (!sel) return;

    const previous = sel.value;
    const spacesSorted = (allSpaces || []).slice().sort((a, b) => {
        const nameA = String(a?.nombre || a?.espacio_nombre || '');
        const nameB = String(b?.nombre || b?.espacio_nombre || '');
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });

    sel.innerHTML = '<option value="">Todos</option>' + spacesSorted
        .map(space => `<option value="${space.id}">${(space.nombre || space.espacio_nombre || 'Espacio').toUpperCase()}</option>`)
        .join('');

    if (previous && Array.from(sel.options).some(option => option.value === previous)) sel.value = previous;
    sel.onchange = () => window.generateReports();
}

function renderClientRows(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-3 text-center text-gray-400 text-xs">Sin datos</td></tr>';
        return;
    }
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-b last:border-b-0';
        tr.innerHTML = `
            <td class="py-2">
                <div class="font-bold text-gray-800 text-xs">${row.name || '—'}</div>
                <div class="text-[11px] text-gray-400">${row.email || ''}</div>
            </td>
            <td class="py-2 text-right font-black text-gray-700">${row.count}</td>
            <td class="py-2 text-right font-black text-gray-700">${moneyFmt(row.spend)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function computeClientAnalytics(orders) {
    const map = {};
    (orders || []).forEach(order => {
        if (!order || !['aprobada', 'finalizada'].includes(order.status)) return;
        const key = order.cliente_id || (order.cliente_email ? `email:${order.cliente_email}` : `name:${order.cliente_nombre || ''}`);
        if (!map[key]) map[key] = { key, count: 0, spend: 0, name: '', email: '' };
        map[key].count += 1;
        if (order.status === 'finalizada') map[key].spend += parseFloat(order.precio_final || 0) || 0;
        if (order.cliente_id && clientsById[order.cliente_id]) {
            map[key].name = clientsById[order.cliente_id].nombre_completo || map[key].name;
            map[key].email = clientsById[order.cliente_id].correo || map[key].email;
        } else {
            map[key].name = map[key].name || (order.cliente_nombre || '');
            map[key].email = map[key].email || (order.cliente_email || '');
        }
    });
    return Object.values(map).sort((a, b) => (b.count - a.count) || (b.spend - a.spend));
}

function renderClientAnalytics(activeOrders) {
    renderClientRows('tbl-top-clients', computeClientAnalytics(activeOrders).slice(0, 10));
    const spaceId = document.getElementById('client-space-filter')?.value || '';
    const scoped = spaceId ? (activeOrders || []).filter(order => orderContainsSpace(order, spaceId)) : activeOrders;
    renderClientRows('tbl-top-clients-space', computeClientAnalytics(scoped).slice(0, 10));
}

function initFilters() {
    const yearSelect = document.getElementById('report-year-filter');
    const monthSelect = document.getElementById('report-month-filter');
    const typeSelect = document.getElementById('report-type-filter');
    if (!yearSelect || !monthSelect) return;

    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear]);
    allOrders.forEach(order => {
        const year = parseInt(String(order?.fecha_inicio || '').split('-')[0], 10);
        if (Number.isFinite(year)) years.add(year);
    });

    yearSelect.innerHTML = '';
    Array.from(years).sort((a, b) => b - a).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.innerText = year;
        yearSelect.appendChild(option);
    });
    yearSelect.value = currentYear;

    monthSelect.innerHTML = '<option value="all">Todo el Año</option>';
    ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].forEach((label, index) => {
        const option = document.createElement('option');
        option.value = String(index + 1).padStart(2, '0');
        option.innerText = label;
        monthSelect.appendChild(option);
    });
    monthSelect.value = String(new Date().getMonth() + 1).padStart(2, '0');

    if (typeSelect) {
        const types = new Set();
        allSpaces.forEach(space => {
            const category = getSpaceCategory(space);
            if (category) types.add(category);
        });
        typeSelect.innerHTML = '<option value="all">Todos</option>';
        Array.from(types).sort((a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' })).forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.innerText = type;
            typeSelect.appendChild(option);
        });
    }
}

window.resetReportFilters = function resetReportFilters() {
    const now = new Date();
    const yearSelect = document.getElementById('report-year-filter');
    const monthSelect = document.getElementById('report-month-filter');
    const typeSelect = document.getElementById('report-type-filter');
    if (yearSelect) yearSelect.value = now.getFullYear();
    if (monthSelect) monthSelect.value = String(now.getMonth() + 1).padStart(2, '0');
    if (typeSelect) typeSelect.value = 'all';
    fillClientSpaceFilter();
    window.generateReports();
};

window.generateReports = function generateReports() {
    const yearFilter = String(document.getElementById('report-year-filter')?.value || '');
    const monthFilter = String(document.getElementById('report-month-filter')?.value || 'all');
    const typeFilter = String(document.getElementById('report-type-filter')?.value || 'all');

    const activeOrders = (allOrders || []).filter(order => {
        const fechaInicio = normalizeDate(order?.fecha_inicio);
        if (!fechaInicio) return false;
        const [year, month] = fechaInicio.split('-');
        if (yearFilter && year !== yearFilter) return false;
        if (monthFilter !== 'all' && month !== monthFilter) return false;
        if (!orderMatchesType(order, typeFilter)) return false;
        return true;
    });

    const finalizadas = activeOrders.filter(order => order.status === 'finalizada');
    const aprobadas = activeOrders.filter(order => order.status === 'aprobada');
    const totalRevenue = finalizadas.reduce((sum, order) => sum + getOrderSubtotal(order), 0);
    const conversionRate = activeOrders.length > 0 ? ((finalizadas.length / activeOrders.length) * 100).toFixed(1) : '0.0';

    document.getElementById('rpt-revenue').innerText = moneyFmt(totalRevenue);
    document.getElementById('rpt-total-count').innerText = activeOrders.length;
    document.getElementById('rpt-approved-count').innerText = aprobadas.length;
    document.getElementById('rpt-finalized-count').innerText = finalizadas.length;
    document.getElementById('rpt-rate').innerText = `${conversionRate}%`;

    const spaceSummary = {};
    finalizadas.forEach(order => {
        const desglose = safeObj(order?.desglose_precios);
        const spacesBreakdown = safeArray(desglose?.espacios);
        if (spacesBreakdown.length) {
            spacesBreakdown.forEach(spaceRow => {
                const spaceId = String(spaceRow?.espacio_id || spaceRow?.spaceId || order?.espacio_id || '').trim();
                if (!spaceId) return;
                const amount = parseFloat(spaceRow?.subtotal_espacio || 0) || 0;
                if (!spaceSummary[spaceId]) {
                    const catalogSpace = allSpaces.find(space => String(space.id) === spaceId);
                    spaceSummary[spaceId] = {
                        id: spaceId,
                        label: spaceRow?.espacio_nombre || catalogSpace?.nombre || order?.espacio_nombre || 'Espacio',
                        amount: 0,
                        count: 0
                    };
                }
                spaceSummary[spaceId].amount += amount;
                spaceSummary[spaceId].count += 1;
            });
            return;
        }
        const spaceId = String(order?.espacio_id || '').trim();
        if (!spaceId) return;
        const catalogSpace = allSpaces.find(space => String(space.id) === spaceId);
        if (!spaceSummary[spaceId]) {
            spaceSummary[spaceId] = {
                id: spaceId,
                label: order?.espacio_nombre || catalogSpace?.nombre || 'Espacio',
                amount: 0,
                count: 0
            };
        }
        spaceSummary[spaceId].amount += getOrderSubtotal(order);
        spaceSummary[spaceId].count += 1;
    });

    const revenueEntries = Object.values(spaceSummary).sort((a, b) => b.amount - a.amount);
    const revenueChart = document.getElementById('revenueChart');
    if (revenueChart) {
        if (chartInstances.revenue) chartInstances.revenue.destroy();
        const labels = revenueEntries.map(entry => entry.label);
        const values = revenueEntries.map(entry => entry.amount);
        const colors = revenueEntries.map(entry => getSpaceColor(entry.id));
        const tbody = document.getElementById('rpt-table-spaces');
        if (tbody) {
            tbody.innerHTML = '';
            revenueEntries.forEach((entry, index) => {
                tbody.innerHTML += `<tr><td class="p-2 text-xs flex items-center gap-2 border-b border-gray-50"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${colors[index]}"></span><span class="truncate font-medium text-gray-600">${entry.label}</span></td><td class="text-right text-xs font-bold text-gray-800 border-b border-gray-50">${moneyFmt(entry.amount)}</td><td class="text-right text-xs text-gray-400 border-b border-gray-50 pr-2">${entry.count}</td></tr>`;
            });
        }
        chartInstances.revenue = new Chart(revenueChart, {
            type: 'doughnut',
            data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    }

    const timelineChart = document.getElementById('timelineChart');
    if (timelineChart) {
        if (chartInstances.timeline) chartInstances.timeline.destroy();
        let labels = [];
        let values = [];
        if (monthFilter === 'all') {
            labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            values = new Array(12).fill(0);
            finalizadas.forEach(order => {
                const monthIndex = parseInt(String(order?.fecha_inicio || '').split('-')[1], 10) - 1;
                if (monthIndex >= 0 && monthIndex < 12) values[monthIndex] += getOrderSubtotal(order);
            });
        } else {
            const daysInMonth = new Date(parseInt(yearFilter, 10), parseInt(monthFilter, 10), 0).getDate();
            labels = Array.from({ length: daysInMonth }, (_, index) => String(index + 1));
            values = new Array(daysInMonth).fill(0);
            finalizadas.forEach(order => {
                const dayIndex = parseInt(String(order?.fecha_inicio || '').split('-')[2], 10) - 1;
                if (dayIndex >= 0 && dayIndex < daysInMonth) values[dayIndex] += getOrderSubtotal(order);
            });
        }
        const gradient = timelineChart.getContext('2d').createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(211, 47, 47, 0.1)');
        gradient.addColorStop(1, 'rgba(211, 47, 47, 0)');
        chartInstances.timeline = new Chart(timelineChart, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Ingresos (Neto)',
                    data: values,
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

    const daysChart = document.getElementById('daysChart');
    if (daysChart) {
        if (chartInstances.days) chartInstances.days.destroy();
        const dayCount = [0, 0, 0, 0, 0, 0, 0];
        activeOrders.filter(order => ['aprobada', 'finalizada'].includes(order.status)).forEach(order => {
            const idx = getWeekIndex(order?.fecha_inicio);
            if (idx >= 0) dayCount[idx] += 1;
        });
        chartInstances.days = new Chart(daysChart, {
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

    const servicesChart = document.getElementById('servicesChart');
    if (servicesChart) {
        if (chartInstances.services) chartInstances.services.destroy();
        const servicesCount = {};
        activeOrders.forEach(order => {
            getConceptRows(order).forEach(concept => {
                servicesCount[concept.name] = (servicesCount[concept.name] || 0) + 1;
            });
        });
        const sortedServices = Object.entries(servicesCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
        chartInstances.services = new Chart(servicesChart, {
            type: 'bar',
            indexAxis: 'y',
            data: {
                labels: sortedServices.map(item => item[0]),
                datasets: [{ label: 'Solicitudes', data: sortedServices.map(item => item[1]), backgroundColor: 'rgba(249, 115, 22, 0.6)', borderRadius: 4 }]
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

    try { renderClientAnalytics(activeOrders); } catch (_) {}
};

async function loadData() {
    const { data: spaces } = await window.tenantPocketBase.from('espacios').select('*').order('nombre', { ascending: true });
    allSpaces = (spaces || []).slice().sort((a, b) => String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es', { sensitivity: 'base' }));
    const { data: orders } = await window.tenantPocketBase.from('cotizaciones').select('*').order('fecha_inicio', { ascending: true });
    allOrders = orders || [];
    try {
        const { data: clients, error } = await window.tenantPocketBase.from('clientes').select('id,nombre_completo,correo,telefono,rfc');
        if (!error) {
            allClients = clients || [];
            clientsById = {};
            allClients.forEach(client => { clientsById[client.id] = client; });
        }
    } catch (_) {
        allClients = [];
        clientsById = {};
    }
    try { fillClientSpaceFilter(); } catch (_) {}
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

    const authCtx = window.HUB_SESSION?.ensureAuth
        ? await window.HUB_SESSION.ensureAuth({ schema: FIN_SCHEMA, redirectOnFail: true })
        : await window.PB_SERVICES.auth.bootstrap({ schema: FIN_SCHEMA });
    const session = authCtx?.session || null;
    if (!session?.user) {
        window.showToast?.('No se encontró una sesión válida. Evitando recarga automática.', 'error');
        return;
    }

    const { data: profile } = await window.globalPocketBase.from('app_users').select('role, app_metadata').eq('id', session.user.id).single();
    const role = String(profile?.role || '').toLowerCase().trim();
    const roleHasAccess = role === 'admin' || role === 'plaza_mayor' || role === 'ambos';
    const perms = role === 'admin'
        ? { orders_view: true, reports_view: true }
        : (roleHasAccess ? { orders_view: true, reports_view: true } : (profile?.app_metadata?.finanzas?.permissions || {}));

    if (!perms.reports_view) {
        window.showToast?.('No tienes permisos para acceder a Reportes.', 'error');
        return;
    }

    if (role !== 'admin') {
        const navRules = {
            'orders.html': ('orders_view' in perms) ? !!perms.orders_view : true,
            'cotizacion.html': ('orders_view' in perms) ? !!perms.orders_view : true,
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


