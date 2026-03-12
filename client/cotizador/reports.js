/**
 * DOC: client\cotizador\reports.js
 * Proposito: KPIs y reportes de rendimiento comercial/operativo.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE REPORTES (CON FILTRO DE TIPO DE ESPACIO)
// =========================================================================

/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const SB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseUrl) || 'http://127.0.0.1:54321';
const SB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.supabaseAnonKey) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// (Opcional) Esquema finanzas configurable
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
let allOrders = [], allSpaces = [];
let chartInstances = { timeline: null, revenue: null, days: null, services: null };
const COLORS = { brandRed: '#D32F2F', palette: ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#8E24AA', '#F57C00', '#0097A7', '#E91E63', '#5D4037', '#616161'] };

function getSpaceColor(id) { return COLORS.palette[id % COLORS.palette.length] || COLORS.brandRed; }
function safeParseJson(v){ if(!v) return null; if(typeof v === 'object') return v; try { return JSON.parse(v); } catch(e){ return null; } }
function getOrderSubtotal(order){ const desg = safeParseJson(order.desglose_precios) || {}; const sub = parseFloat(desg.subtotal_antes_impuestos ?? desg.total_sin_impuestos ?? desg.subtotal ?? 0); if(!isNaN(sub) && sub) return sub; return parseFloat(order.precio_final) || 0; }

// Pobla el selector de espacio (sección "Analítica de clientes").
// Nota: antes se llenaba solo al presionar "resetReportFilters"; por eso se quedaba vacío.
function fillClientSpaceFilter() {
    const sel = document.getElementById('client-space-filter');
    if (!sel) return;

    const prev = sel.value;
    const spacesSorted = (allSpaces || []).slice().sort((a, b) => {
        const an = (a.nombre || a.espacio_nombre || '').toString();
        const bn = (b.nombre || b.espacio_nombre || '').toString();
        return an.localeCompare(bn, 'es', { sensitivity: 'base' });
    });

    sel.innerHTML = '<option value="">Todos</option>' + spacesSorted
        .map(s => `<option value="${s.id}">${(s.nombre || s.espacio_nombre || 'Espacio').toUpperCase()}</option>`)
        .join('');

    // Mantener selección si sigue existiendo
    if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
    sel.onchange = () => window.generateReports();
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.PB_CLIENT) {
        if(!window.finSupabase) window.finSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY, { db: { schema: FIN_SCHEMA } });
        if(!window.globalSupabase) window.globalSupabase = window.PB_CLIENT.createClient(SB_URL, SB_KEY);
    }
    const { data: { session } } = await window.globalSupabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await window.globalSupabase.from('profiles').select('role, app_metadata').eq('id', session.user.id).single();
    const __role = String(profile.role || '').toLowerCase().trim();
    const __roleHasAccess = (__role === 'admin') || (__role === 'plaza_mayor') || (__role === 'ambos');
const perms = (__role === 'admin')
    ? { orders_view: true, reports_view: true }
    : (__roleHasAccess ? { orders_view: true, reports_view: true } : (profile.app_metadata?.finanzas?.permissions || {}));

if (!perms.reports_view) { setTimeout(() => window.location.href = 'catalog.html', 1500); return; }

// --- SISTEMA DE PERMISOS DE NAVEGACIÓN ---
if (__role !== 'admin') {
    const navRules = {
        'orders.html': ('orders_view' in perms) ? !!perms.orders_view : true,
        'cotizacion.html': ('orders_view' in perms) ? !!perms.orders_view : true,
        'reports.html': ('reports_view' in perms) ? !!perms.reports_view : true,
        'clientes.html': (('clients_view' in perms) || ('clients_manage' in perms)) ? (!!perms.clients_view || !!perms.clients_manage) : true
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

async function loadData() {
    // SELECCIONAMOS TODO (*) PARA OBTENER EL CAMPO 'CATEGORIA' U OTROS
    const { data: spaces } = await window.finSupabase.from('espacios').select('*'); allSpaces = spaces || [];
    const { data: orders } = await window.finSupabase.from('cotizaciones').select('*').order('fecha_inicio', { ascending: true }); allOrders = orders || [];
    // Clientes (puede no existir la tabla si falta SQL)
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

	// Asegurar que el selector de espacio se llene al cargar
	try { fillClientSpaceFilter(); } catch(e) {}

}
function moneyFmt(n) {
    const v = Number(n || 0);
    return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
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
        tr.className = "border-b last:border-b-0";
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
        if (!o) return;
        // "Rentado": aprobada o finalizada
        if (!['aprobada','finalizada'].includes(o.status)) return;

        const key = o.cliente_id || (o.cliente_email ? ('email:' + o.cliente_email) : ('name:' + (o.cliente_nombre || '')));
        if (!map[key]) map[key] = { key, count: 0, spend: 0, name: '', email: '' };

        map[key].count += 1;

        if (o.status === 'finalizada') {
            const amt = parseFloat(o.precio_final || 0);
            if (!isNaN(amt)) map[key].spend += amt;
        }

        // nombre/email
        if (o.cliente_id && clientsById[o.cliente_id]) {
            map[key].name = clientsById[o.cliente_id].nombre_completo || map[key].name;
            map[key].email = clientsById[o.cliente_id].correo || map[key].email;
        } else {
            map[key].name = map[key].name || (o.cliente_nombre || '');
            map[key].email = map[key].email || (o.cliente_email || '');
        }
    });

    return Object.values(map).sort((a,b) => (b.count - a.count) || (b.spend - a.spend));
}

function renderClientAnalytics(activeOrders) {
    // Global
    const globalRows = computeClientAnalytics(activeOrders).slice(0, 10);
    renderClientRows('tbl-top-clients', globalRows);

    // Por espacio
    const spaceSel = document.getElementById('client-space-filter');
    const spaceId = spaceSel ? spaceSel.value : '';
    const scoped = spaceId ? (activeOrders || []).filter(o => String(o.espacio_id) === String(spaceId)) : activeOrders;
    const spaceRows = computeClientAnalytics(scoped).slice(0, 10);
    renderClientRows('tbl-top-clients-space', spaceRows);
}

function initFilters() {
    const yearSelect = document.getElementById('report-year-filter');
    const monthSelect = document.getElementById('report-month-filter');
    const typeSelect = document.getElementById('report-type-filter');

    if (!yearSelect || !monthSelect) return;
    
    // Filtro Años
    const currentYear = new Date().getFullYear();
    const yearsSet = new Set([currentYear]);
    allOrders.forEach(o => { if(o.fecha_inicio) yearsSet.add(parseInt(o.fecha_inicio.split('-')[0])); });
    const sortedYears = Array.from(yearsSet).sort((a,b) => b - a);
    yearSelect.innerHTML = ''; sortedYears.forEach(y => { const opt = document.createElement('option'); opt.value = y; opt.innerText = y; yearSelect.appendChild(opt); }); yearSelect.value = currentYear;
    
    // Filtro Meses
    monthSelect.innerHTML = '<option value="all">Todo el Año</option>'; ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].forEach((m, i) => { const opt = document.createElement('option'); opt.value = String(i + 1).padStart(2, '0'); opt.innerText = m; monthSelect.appendChild(opt); }); monthSelect.value = String(new Date().getMonth() + 1).padStart(2, '0');

    // Filtro Tipos (Nuevo)
    if(typeSelect) {
        typeSelect.innerHTML = '<option value="all">Todos</option>';
        const types = new Set();
        // Buscamos 'categoria' o 'tipo' en los espacios cargados
        allSpaces.forEach(s => { 
            const cat = s.categoria || s.tipo || s.category; 
            if(cat) types.add(cat); 
        });
        
        Array.from(types).sort().forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.innerText = t;
            typeSelect.appendChild(opt);
        });
    }
}

window.resetReportFilters = function() {
    const now = new Date();
    const y = document.getElementById('report-year-filter'); 
    const m = document.getElementById('report-month-filter');
    const t = document.getElementById('report-type-filter');
    
    if(y) y.value = now.getFullYear(); 
    if(m) m.value = String(now.getMonth() + 1).padStart(2, '0');
    if(t) t.value = 'all';
    
    
	// Filtro de Espacio (Analítica de clientes)
	fillClientSpaceFilter();

window.generateReports();
}

window.generateReports = function() {
    const yearFilter = document.getElementById('report-year-filter').value;
    const monthFilter = document.getElementById('report-month-filter').value;
    const typeFilter = document.getElementById('report-type-filter') ? document.getElementById('report-type-filter').value : 'all';

    const activeOrders = allOrders.filter(o => { 
        if (!o.fecha_inicio) return false; 
        const [y, m] = o.fecha_inicio.split('-'); 
        
        // Filtro Tiempo
        if (y !== yearFilter) return false; 
        if (monthFilter !== 'all' && m !== monthFilter) return false; 
        
        // Filtro Tipo (Nuevo)
        if (typeFilter !== 'all') {
            const space = allSpaces.find(s => s.id === o.espacio_id);
            if (!space) return false; // Si no hay espacio asociado, no entra
            const cat = space.categoria || space.tipo || space.category;
            if (cat !== typeFilter) return false;
        }

        return true; 
    });

    const finalizadas = activeOrders.filter(o => o.status === 'finalizada');
    const aprobadas = activeOrders.filter(o => o.status === 'aprobada');
    const totalRevenueOrders = finalizadas;
    const totalCount = activeOrders.length; const approvedCount = aprobadas.length; const finalizedCount = finalizadas.length;
    const totalRev = totalRevenueOrders.reduce((acc, o) => acc + getOrderSubtotal(o), 0);
    const conversionRate = totalCount > 0 ? ((finalizedCount / totalCount) * 100).toFixed(1) : 0;

    document.getElementById('rpt-revenue').innerText = window.formatMoney(totalRev);
    document.getElementById('rpt-total-count').innerText = totalCount;
    document.getElementById('rpt-approved-count').innerText = approvedCount;
    document.getElementById('rpt-finalized-count').innerText = finalizedCount;
    document.getElementById('rpt-rate').innerText = `${conversionRate}%`;

    const spaceMap = {};
    totalRevenueOrders.forEach(o => { const name = o.espacio_nombre || 'Otros'; let val = getOrderSubtotal(o); if (!spaceMap[name]) spaceMap[name] = { id: o.espacio_id, amount: 0, count: 0 }; spaceMap[name].amount += val; spaceMap[name].count += 1; });

    const revCtx = document.getElementById('revenueChart');
    if (revCtx) {
        if(chartInstances.revenue) chartInstances.revenue.destroy();
        const labels = Object.keys(spaceMap); const data = labels.map(k => spaceMap[k].amount); const colors = labels.map(k => getSpaceColor(spaceMap[k].id));
        const tbody = document.getElementById('rpt-table-spaces');
        if(tbody) { tbody.innerHTML = ''; const sortedSpaces = labels.map((l, i) => ({ label: l, amount: data[i], count: spaceMap[l].count, color: colors[i] })).sort((a,b) => b.amount - a.amount); sortedSpaces.forEach(item => { tbody.innerHTML += `<tr><td class="p-2 text-xs flex items-center gap-2 border-b border-gray-50"><span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${item.color}"></span><span class="truncate font-medium text-gray-600">${item.label}</span></td><td class="text-right text-xs font-bold text-gray-800 border-b border-gray-50">${window.formatMoney(item.amount)}</td><td class="text-right text-xs text-gray-400 border-b border-gray-50 pr-2">${item.count}</td></tr>`; }); }
        chartInstances.revenue = new Chart(revCtx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } } });
    }

    const timeCtx = document.getElementById('timelineChart');
    if (timeCtx) {
        if(chartInstances.timeline) chartInstances.timeline.destroy();
        let timelineLabels = [], timelineData = [];
        if (monthFilter === 'all') { timelineLabels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]; timelineData = new Array(12).fill(0); totalRevenueOrders.forEach(o => { const mIdx = parseInt(o.fecha_inicio.split('-')[1]) - 1; if(mIdx >= 0 && mIdx < 12) timelineData[mIdx] += getOrderSubtotal(o); }); } 
        else { const daysInMonth = new Date(yearFilter, parseInt(monthFilter), 0).getDate(); timelineLabels = Array.from({length: daysInMonth}, (_, i) => (i + 1).toString()); timelineData = new Array(daysInMonth).fill(0); totalRevenueOrders.forEach(o => { const dIdx = parseInt(o.fecha_inicio.split('-')[2]) - 1; if(dIdx >= 0 && dIdx < daysInMonth) timelineData[dIdx] += getOrderSubtotal(o); }); }
        const gradient = timeCtx.getContext('2d').createLinearGradient(0, 0, 0, 300); gradient.addColorStop(0, 'rgba(211, 47, 47, 0.1)'); gradient.addColorStop(1, 'rgba(211, 47, 47, 0)');
        chartInstances.timeline = new Chart(timeCtx, { type: 'line', data: { labels: timelineLabels, datasets: [{ label: 'Ingresos (Neto)', data: timelineData, borderColor: COLORS.brandRed, backgroundColor: gradient, borderWidth: 2, pointBackgroundColor: '#fff', pointBorderColor: COLORS.brandRed, pointRadius: 3, fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } } } });
    }

    const daysCtx = document.getElementById('daysChart');
    if(daysCtx) {
        if(chartInstances.days) chartInstances.days.destroy();
        const occupiedOrders = activeOrders.filter(o => ['aprobada', 'finalizada'].includes(o.status)); const daysCount = [0, 0, 0, 0, 0, 0, 0];
        occupiedOrders.forEach(o => { const d = new Date(o.fecha_inicio.split('-')); daysCount[d.getDay()]++; });
        chartInstances.days = new Chart(daysCtx, { type: 'bar', data: { labels: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], datasets: [{ label: 'Eventos', data: daysCount, backgroundColor: 'rgba(59, 130, 246, 0.6)', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } } });
    }

    const servCtx = document.getElementById('servicesChart');
    if(servCtx) {
        if(chartInstances.services) chartInstances.services.destroy();
        const servicesCount = {}; activeOrders.forEach(o => { if (o.conceptos_adicionales) { o.conceptos_adicionales.forEach(c => { const name = c.description || 'Varios'; servicesCount[name] = (servicesCount[name] || 0) + 1; }); } });
        const sortedServices = Object.entries(servicesCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
        chartInstances.services = new Chart(servCtx, { type: 'bar', indexAxis: 'y', data: { labels: sortedServices.map(s => s[0]), datasets: [{ label: 'Solicitudes', data: sortedServices.map(s => s[1]), backgroundColor: 'rgba(249, 115, 22, 0.6)', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } }, y: { grid: { display: false } } } } });
    
    try { renderClientAnalytics(activeOrders); } catch(e) {}
}
}


