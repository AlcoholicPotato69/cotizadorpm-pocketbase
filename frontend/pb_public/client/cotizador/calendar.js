/**
 * DOC: client\cotizador\calendar.js
 * Proposito: Calendario de agenda/premontajes y operaciones de fecha.
 * Notas: Este archivo forma parte del cotizador. Ver documentacion completa en docs/10-funcionamiento-general-del-codigo.txt.
 */

// =========================================================================
// MÓDULO DE AGENDA (FINAL: DRAG & DROP + RESIZE CORREGIDOS)
// =========================================================================

/* -------------------------------------------------------------------------
 * 0. CONEXIÓN A BASE DE DATOS (ÚNICO LUGAR A CAMBIAR)
 * ------------------------------------------------------------------------- */
const PB_URL = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseUrl) || 'http://127.0.0.1:8090';
const PB_KEY = (window.HUB_CONFIG && window.HUB_CONFIG.pocketbaseAnonKey) || '';

// (Opcional) Esquema finanzas configurable
const FIN_SCHEMA = (window.HUB_CONFIG && window.HUB_CONFIG.finanzasSchema) || 'finanzas';
let allOrders = [], allSpaces = [], catalogConcepts = [], dbTaxes = [], calendarObj, currentConcepts = [], currentFiscalData = {};
let myPermissions = { access:false, orders_edit:false };
let currentTaxIds = [];

// --- HELPER PARA FECHAS (CRÍTICO PARA DRAG & DROP) ---
window.getLocalYMD = function(date) {
    if (!date) return '';
    const d = new Date(date);
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return local.toISOString().slice(0, 10);
};

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
    const { data: profile } = await window.globalPocketBase.from('app_users').select('*').eq('id', session.user.id).single();
const __role = String(profile.role || '').toLowerCase().trim();
const __roleHasAccess = (__role === 'admin') || (__role === 'plaza_mayor') || (__role === 'ambos');

const roleDefaultPerms = {
    access: true,
    orders_edit: true,
    orders_view: true,
    reports_view: true,
    clients_view: true,
    clients_manage: true
};

if (__role === 'admin') myPermissions = { ...roleDefaultPerms };
else if (__roleHasAccess) myPermissions = { ...roleDefaultPerms };
else myPermissions = (profile.app_metadata?.finanzas?.permissions || { access: false });

if (!myPermissions.access) {
    window.showToast?.('No tienes permisos para acceder a Agenda.', 'error');
    return;
}

// --- SISTEMA DE PERMISOS DE NAVEGACIÓN ---
if (__role !== 'admin') {
    const navRules = {
        'orders.html': ('orders_view' in myPermissions) ? !!myPermissions.orders_view : true,
        'cotizacion.html': ('orders_view' in myPermissions) ? !!myPermissions.orders_view : true,
        'reports.html': ('reports_view' in myPermissions) ? !!myPermissions.reports_view : true,
        'clientes.html': (('clients_view' in myPermissions) || ('clients_manage' in myPermissions))
            ? (!!myPermissions.clients_view || !!myPermissions.clients_manage)
            : true
    };
    Object.keys(navRules).forEach(page => {
        if (!navRules[page]) {
            const link = document.querySelector(`a[href="${page}"]`);
            if (link) link.classList.add('hidden');
        }
    });
}

    await loadTaxes();
    await loadData();
    initCalendar();

    const statSel = document.getElementById('oed-status'); if(statSel) statSel.addEventListener('change', () => { autoGenerateOrderNum(); });
    
    // --- LISTENERS PARA FECHAS DINÁMICAS (AGENDA) ---
    const oedStart = document.getElementById('oed-start');
    const oedEnd = document.getElementById('oed-end');
    const spaceSel = document.getElementById('oed-space');

    if(oedStart && oedEnd) {
        oedStart.addEventListener('change', function() {
            oedEnd.min = this.value; 
            if (oedEnd.value && oedEnd.value < this.value) { oedEnd.value = this.value; }
            window.checkAvailabilityModal(); 
            window.recalcTotal(); 
        });
        oedEnd.addEventListener('change', () => { 
            window.checkAvailabilityModal(); 
            window.recalcTotal(); 
        });
    }
    
    if(spaceSel) {
        spaceSel.addEventListener('change', () => { 
            window.checkAvailabilityModal(); 
            window.recalcTotal(); 
        });
    }

    const searchInput = document.getElementById('cal-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            window.searchCalendarEvents();
        });
    }
    
    document.getElementById('new-concept-select')?.addEventListener('change', function() { const id=this.value; const c=catalogConcepts.find(x=>x.id==id); if(c) document.getElementById('new-concept-amount').value=c.precio_sugerido; });
    document.getElementById('new-concept-amount')?.addEventListener('keypress', function(e) { if(e.key==='Enter') window.addConceptRow(); });
});

async function loadTaxes() { const { data } = await window.tenantPocketBase.from('impuestos').select('*'); dbTaxes = data || []; }
async function loadData() {
    const { data: spaces } = await window.tenantPocketBase.from('espacios').select('*'); allSpaces = spaces || [];
    const { data: orders } = await window.tenantPocketBase.from('cotizaciones').select('*'); allOrders = orders || [];
    const { data: concepts } = await window.tenantPocketBase.from('conceptos_catalogo').select('*').eq('activo', true); catalogConcepts = concepts || [];
}

async function checkDbConflict(orderId, spaceId, start, end) {
    const { data } = await window.tenantPocketBase.from('cotizaciones')
        .select('id')
        .eq('espacio_id', spaceId)
        .in('status', ['aprobada', 'finalizada'])
        .neq('id', orderId)
        .or(`and(fecha_inicio.lte.${end},fecha_fin.gte.${start})`);
    
    return data && data.length > 0;
}

// LÓGICA COMPARTIDA PARA ACTUALIZAR FECHAS (DROP Y RESIZE)
async function handleEventDateChange(info) {
    if (!myPermissions.orders_edit) { 
        window.showToast("No tienes permisos.", "error"); 
        info.revert(); 
        return; 
    } 
    
    const newStart = info.event.start; 
    let newEnd = info.event.end; 
    // FullCalendar end es exclusivo, si es null (evento de 1 día) o al estirar, ajustamos
    if (!newEnd) { newEnd = new Date(newStart); newEnd.setDate(newEnd.getDate() + 1); } 
    
    const startDateStr = window.getLocalYMD(newStart); 
    // Restamos 1 día para guardar fecha inclusiva en BD (Formato: Inicio -> Fin del día real)
    const dbEndObj = new Date(newEnd); dbEndObj.setDate(dbEndObj.getDate() - 1); 
    const endDateStr = window.getLocalYMD(dbEndObj); 
    
    const orderId = info.event.id; 
    const order = allOrders.find(o => String(o.id) === String(orderId)); 
    
    if (!order) { info.revert(); return; } 
    if (order.status === 'aprobada' || order.status === 'finalizada') {
        window.showToast("La cotización aprobada está bloqueada para edición.", "error");
        info.revert();
        return;
    }

    // Guardar en BD
    const { error } = await window.tenantPocketBase.from('cotizaciones')
        .update({ fecha_inicio: startDateStr, fecha_fin: endDateStr })
        .eq('id', orderId); 
    
    if (error) {
        console.error(error);
        window.showToast("Error al guardar: " + error.message, "error");
        info.revert(); 
        return;
    }

    window.showToast("Agenda actualizada"); 
    order.fecha_inicio = startDateStr; 
    order.fecha_fin = endDateStr; 
    refreshCalendarEvents(); 
}

function initCalendar() { 
    const calendarEl = document.getElementById('calendar'); if (!calendarEl) return; 
    calendarObj = new FullCalendar.Calendar(calendarEl, { 
        initialView: 'dayGridMonth', locale: 'es', 
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' }, 
        editable: true, droppable: true, 
        dayMaxEvents: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }, 
        height: '100%', 
        events: getCalendarEventsFromOrders(), 
        eventClick: function(info) { window.openOrderEditModal(info.event.id); }, 
        
        // --- AQUÍ ESTÁ EL CAMBIO IMPORTANTE ---
        eventDrop: handleEventDateChange,   // Mover evento completo
        eventResize: handleEventDateChange, // Estirar/Encoger evento (Nuevo)
        
        eventDidMount: function(info) { info.el.title = `${info.event.title} (${info.event.extendedProps.status})`; } 
    }); 
    calendarObj.render(); 
}

function getCalendarEventsFromOrders(ordersList = null) { 
    const source = ordersList || allOrders;

    return source.map(o => { 
        let color = '#6b7280'; 
        let classNames = [];
        const space = allSpaces.find(s=>s.id==o.espacio_id); 
        if(space && space.color) color = space.color; 
        
        if(o.status === 'rechazada') color = '#ef4444'; 
        
        if(o.status === 'pendiente') {
             classNames.push('opacity-60', 'border-2', 'border-dashed'); 
             if(new Date(o.fecha_fin) < new Date()) color = '#9ca3af';
        }
        
        const spaceName = space ? space.nombre : (o.espacio_clave || 'Esp');

        const startParts = o.fecha_inicio.split('-'); const startObj = new Date(startParts[0], startParts[1]-1, startParts[2]); 
        const endParts = o.fecha_fin.split('-'); const endObj = new Date(endParts[0], endParts[1]-1, endParts[2]); endObj.setDate(endObj.getDate() + 1); 
        return { 
            id: o.id, 
            title: `${spaceName} - ${o.cliente_nombre}`, 
            start: window.getLocalYMD(startObj), 
            end: window.getLocalYMD(endObj), 
            backgroundColor: color, 
            borderColor: color, 
            extendedProps: { status: o.status },
            className: classNames.join(' ')
        }; 
    }); 
}

function refreshCalendarEvents() { if (!calendarObj) return; calendarObj.removeAllEvents(); calendarObj.addEventSource(getCalendarEventsFromOrders()); }

window.searchCalendarEvents = function() { 
    if (!calendarObj) return; 
    
    const input = document.getElementById('cal-search-input');
    const term = input ? input.value.toLowerCase().trim() : '';

    if (term === '') {
        calendarObj.removeAllEvents();
        calendarObj.addEventSource(getCalendarEventsFromOrders(allOrders));
        return;
    }

    const filtered = allOrders.filter(o => {
        const space = allSpaces.find(s => s.id === o.espacio_id);
        const clientMatch = o.cliente_nombre && o.cliente_nombre.toLowerCase().includes(term);
        const spaceNameMatch = space && space.nombre && space.nombre.toLowerCase().includes(term);
        const codeInOrder = o.espacio_clave ? o.espacio_clave.toLowerCase() : '';
        const codeInSpace = space && space.clave ? space.clave.toLowerCase() : '';
        const codeInSpaceAlt = space && space.codigo ? space.codigo.toLowerCase() : '';
        const keyMatch = codeInOrder.includes(term) || codeInSpace.includes(term) || codeInSpaceAlt.includes(term);
        const spaceIdMatch = String(o.espacio_id || '').toLowerCase().includes(term);
        const orderIdMatch = String(o.id || '').toLowerCase().includes(term);

        return clientMatch || spaceNameMatch || keyMatch || spaceIdMatch || orderIdMatch;
    }); 

    calendarObj.removeAllEvents(); 
    calendarObj.addEventSource(getCalendarEventsFromOrders(filtered)); 
}

window.openOrderEditModal = function(id) { 
    const order = allOrders.find(o => o.id === id); if (!order) return;
    currentFiscalData = order.datos_fiscales || {}; currentConcepts = order.conceptos_adicionales || [];
    document.getElementById('oed-id').value = order.id; document.getElementById('oed-client').value = order.cliente_nombre; 
    
    const statEl = document.getElementById('oed-status'); if(statEl) statEl.value = order.status; 
    const priceEl = document.getElementById('oed-price'); if(priceEl) priceEl.value = order.precio_final.toFixed(2); 
    
    document.getElementById('oed-start').value = order.fecha_inicio; document.getElementById('oed-end').value = order.fecha_fin;
    document.getElementById('oed-end').min = order.fecha_inicio;

    const sel = document.getElementById('oed-space'); 
    if(sel) {
        sel.innerHTML = ''; 
        allSpaces.forEach(s => sel.innerHTML += `<option value="${s.id}" ${s.id === order.espacio_id ? 'selected' : ''}>${s.nombre}</option>`);
    }
    
    window.recalcTotal();
    window.checkAvailabilityModal(); 
    document.getElementById('order-edit-modal').classList.remove('hidden');
}

window.recalcTotal = function() { 
    const spaceEl = document.getElementById('oed-space');
    if(!spaceEl) return; 

    const spaceId = spaceEl.value; 
    const spaceObj = allSpaces.find(s => s.id == spaceId); 
    let basePrice = spaceObj ? parseFloat(spaceObj.precio_base) : 0; 
    let conceptsTotal = 0; 
    currentConcepts.forEach(c => { let val = parseFloat(c.value || c.amount) || 0; let amount = c.unit === 'percent' ? basePrice * (val / 100) : val; c.amount = amount; if (c.type === 'descuento') conceptsTotal -= amount; else conceptsTotal += amount; }); 
    const subtotalBase = basePrice + conceptsTotal; 
    
    const adjTypeEl = document.getElementById('oed-adj-type');
    const adjUnitEl = document.getElementById('oed-adj-unit');
    const adjValEl = document.getElementById('oed-adj-val');

    const adjType = adjTypeEl ? adjTypeEl.value : 'ninguno'; 
    const adjUnit = adjUnitEl ? adjUnitEl.value : 'fixed'; 
    const adjVal = adjValEl ? (parseFloat(adjValEl.value) || 0) : 0; 
    
    let adjAmount = adjType !== 'ninguno' ? (adjUnit === 'percent' ? subtotalBase * (adjVal / 100) : adjVal) : 0; 
    let netSubtotal = subtotalBase;
    if (adjType === 'descuento') netSubtotal -= adjAmount;
    if (adjType === 'aumento') netSubtotal += adjAmount;
    
    const priceInput = document.getElementById('oed-price');
    if(priceInput) priceInput.value = netSubtotal.toFixed(2); 
}

window.saveOrderEdit = async function(isFinalize = false) {
    const btn = document.getElementById('btn-save-progress'); 
    if(btn) { btn.disabled = true; btn.innerText = "Verificando..."; }
    
    try {
        const id = document.getElementById('oed-id').value;
        const start = document.getElementById('oed-start').value;
        const end = document.getElementById('oed-end').value;
        
        if (!start || !end) throw new Error("Fechas requeridas");
        if (end < start) throw new Error("La fecha fin no puede ser menor a la de inicio");

        const order = allOrders.find(o => o.id === id);
        if(!order) throw new Error("Orden no encontrada");

        const isConflict = await checkDbConflict(id, order.espacio_id, start, end);
        if(isConflict) throw new Error("❌ El espacio está OCUPADO en estas fechas. Revisa el calendario.");

        const payload = { fecha_inicio: start, fecha_fin: end };
        const { error } = await window.tenantPocketBase.from('cotizaciones').update(payload).eq('id', id);
        if (error) throw error;
        
        window.showToast("Agenda Actualizada Correctamente"); 
        order.fecha_inicio = start;
        order.fecha_fin = end;
        refreshCalendarEvents();
        window.closeModal('order-edit-modal'); 

    } catch(e) { 
        window.showToast(e.message, "error"); 
    } finally { 
        if(btn) { btn.disabled = false; btn.innerText = "Guardar Cambios"; } 
    }
}

window.checkAvailabilityModal = async function() { 
    const id = document.getElementById('oed-id').value; 
    const spaceEl = document.getElementById('oed-space');
    let spaceId;
    if (spaceEl) { spaceId = spaceEl.value; } 
    else { const order = allOrders.find(o => o.id === id); if(order) spaceId = order.espacio_id; }

    const start = document.getElementById('oed-start').value; 
    const end = document.getElementById('oed-end').value; 
    const msg = document.getElementById('oed-avail-msg'); 
    
    if(!msg) return; 
    msg.className = "text-[10px] font-bold mt-1 h-4"; msg.innerHTML = ''; msg.classList.add('hidden');

    if(!start || !end || !spaceId) return; 

    const query = window.tenantPocketBase.from('cotizaciones')
        .select('id')
        .eq('espacio_id', spaceId)
        .in('status',['aprobada','finalizada'])
        .or(`and(fecha_inicio.lte.${end},fecha_fin.gte.${start})`); 
    
    if(id) query.neq('id', id); 
    const { data } = await query; 
    
    msg.classList.remove('hidden'); 
    msg.className = "text-center text-[10px] font-bold mt-1 p-1 rounded w-full block";

    if(data && data.length > 0) { 
        msg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> OCUPADO'; msg.classList.add('bg-red-100', 'text-red-600'); 
    } else { 
        msg.innerHTML = '<i class="fa-solid fa-check-circle"></i> DISPONIBLE'; msg.classList.add('bg-green-100', 'text-green-700'); 
    } 
}

window.openColorModal = function() {
    const list = document.getElementById('color-list');
    if (!list) return;
    list.innerHTML = '';
    if (allSpaces.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-400 text-center">No hay espacios cargados.</p>';
    } else {
        allSpaces.forEach(s => {
            list.innerHTML += `<div class="flex items-center justify-between p-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded transition"><span class="text-xs font-bold text-gray-700">${s.nombre}</span><input type="color" id="color-input-${s.id}" value="${s.color || '#3788d8'}" class="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"></div>`;
        });
    }
    const modal = document.getElementById('color-modal');
    if(modal) { modal.classList.remove('hidden'); if(typeof window.openModal === 'function') window.openModal('color-modal'); }
}

window.saveAllColors = async function() {
    const btn = document.getElementById('btn-save-colors');
    if(btn) { btn.disabled = true; btn.innerText = "Guardando..."; }
    try {
        const updates = [];
        for (const s of allSpaces) {
            const input = document.getElementById(`color-input-${s.id}`);
            if (input && input.value !== s.color) {
                updates.push(window.tenantPocketBase.from('espacios').update({ color: input.value }).eq('id', s.id));
                s.color = input.value;
            }
        }
        await Promise.all(updates);
        window.showToast("Colores actualizados correctamente");
        refreshCalendarEvents();
        const modal = document.getElementById('color-modal');
        if(modal) modal.classList.add('hidden');
        if(typeof window.closeModal === 'function') window.closeModal('color-modal');
    } catch (e) { console.error(e); window.showToast("Error al guardar colores", "error"); } finally { if(btn) { btn.disabled = false; btn.innerText = "Guardar Cambios"; } }
}

window.addConceptRow = function() {}
window.removeConceptRow = function() {}
function renderConceptsList() {}
function autoGenerateOrderNum() {}
function parseIds(v){ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v === 'string'){ try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch(e){ return v.split(',').map(x=>x.trim()).filter(Boolean); } } return []; }





